import { describe, it } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const REPO_ROOT = join(new URL('.', import.meta.url).pathname, '..');

function readFile(relativePath) {
    const fullPath = join(REPO_ROOT, relativePath);
    assert.ok(existsSync(fullPath), `File should exist: ${relativePath}`);
    return readFileSync(fullPath, 'utf-8');
}

// Aggregated migration content for order/inventory audit
const MIGRATION_SCHEMA = readFile('supabase/migrations/20260711000200_initial_schema.sql');
const MIGRATION_TYPES = readFile('supabase/migrations/20260711000100_extensions_and_types.sql');
const MIGRATION_CONSTRAINTS = readFile('supabase/migrations/20260711000300_constraints_and_indexes.sql');
const MIGRATION_TRIGGERS = readFile('supabase/migrations/20260711000400_triggers.sql');
const MIGRATION_HELPERS = readFile('supabase/migrations/20260711000500_private_helpers.sql');
const MIGRATION_RLS = readFile('supabase/migrations/20260711000600_rls_policies.sql');
const MIGRATION_RPC = readFile('supabase/migrations/20260711000900_order_inventory_rpc.sql');
const MIGRATION_HARDENING = readFile('supabase/migrations/20260711000950_order_inventory_hardening.sql');

// The hardening migration redefines update_pending_order and ship_order,
// so the effective text of those functions lives in the hardening file.
const EFFECTIVE_UPDATE_PENDING = MIGRATION_HARDENING.includes('update_pending_order')
    ? MIGRATION_HARDENING
    : MIGRATION_RPC;
const EFFECTIVE_SHIP_ORDER = MIGRATION_HARDENING.includes('ship_order')
    ? MIGRATION_HARDENING
    : MIGRATION_RPC;

describe('Orders Remote Schema/RLS/RPC Audit (OR1-OR18)', function () {

    // ============================================================
    // A. orders table schema audit
    // ============================================================

    it('OR1: orders table has required columns', function () {
        const ordersBlock = MIGRATION_SCHEMA.match(/CREATE TABLE public\.orders \([\s\S]*?\);/);
        assert.ok(ordersBlock, 'orders table definition should exist');
        const cols = ordersBlock[0];
        const required = [
            'id uuid primary key',
            'legacy_id bigint',
            'store_id uuid not null references stores(id)',
            'order_number text not null',
            'customer_id uuid references customers(id)',
            'product_id uuid references products(id)',
            'legacy_customer_id bigint',
            'legacy_product_id bigint',
            'customer_name_snapshot text',
            'product_title_snapshot text',
            'brand_snapshot text',
            'category_snapshot text',
            'color_snapshot text',
            'size_snapshot text',
            'quantity integer not null',
            'selling_price numeric not null',
            'actual_converted_cost_at_sale numeric',
            'china_cost_at_sale numeric',
            'actual_profit numeric',
            'actual_profit_margin numeric',
            'actual_cost_ratio numeric',
            'status order_status not null default \'PENDING\'',
            'order_date date',
            'ship_date date',
            'notes text',
            'created_by uuid',
            'updated_by uuid',
            'created_at timestamptz not null default now()',
            'updated_at timestamptz not null default now()',
            'deleted_at timestamptz',
            'version integer not null default 1'
        ];
        for (const col of required) {
            assert.ok(cols.includes(col), `orders table should have column: ${col}`);
        }
        // shipping_company and tracking_number added in RPC migration
        assert.match(MIGRATION_RPC, /ADD COLUMN shipping_company text/, 'orders should have shipping_company');
        assert.match(MIGRATION_RPC, /ADD COLUMN tracking_number text/, 'orders should have tracking_number');
    });

    // ============================================================
    // B. order_status enum audit
    // ============================================================

    it('OR2: order_status enum has PENDING/SHIPPED/COMPLETED/CANCELLED', function () {
        const enumBlock = MIGRATION_TYPES.match(/CREATE TYPE public\.order_status AS ENUM \([\s\S]*?\);/);
        assert.ok(enumBlock, 'order_status enum should exist');
        const body = enumBlock[0];
        assert.match(body, /'PENDING'/, 'order_status should have PENDING');
        assert.match(body, /'SHIPPED'/, 'order_status should have SHIPPED');
        assert.match(body, /'COMPLETED'/, 'order_status should have COMPLETED');
        assert.match(body, /'CANCELLED'/, 'order_status should have CANCELLED');
    });

    // ============================================================
    // C. inventory_logs audit
    // ============================================================

    it('OR3: inventory_logs has order_id and stock/reserved before/after fields', function () {
        const block = MIGRATION_SCHEMA.match(/CREATE TABLE public\.inventory_logs \([\s\S]*?\);/);
        assert.ok(block, 'inventory_logs table should exist');
        const cols = block[0];
        const required = [
            'order_id uuid references orders(id)',
            'product_id uuid references products(id)',
            'store_id uuid not null references stores(id)',
            'change_type inventory_change_type not null',
            'quantity_change integer not null',
            'stock_before integer',
            'stock_after integer',
            'reserved_before integer',
            'reserved_after integer'
        ];
        for (const col of required) {
            assert.ok(cols.includes(col), `inventory_logs should have column: ${col}`);
        }
        // append-only: no updated_at, no deleted_at columns
        assert.doesNotMatch(cols, /updated_at/, 'inventory_logs should be append-only (no updated_at)');
        assert.doesNotMatch(cols, /deleted_at/, 'inventory_logs should be append-only (no deleted_at)');
    });

    // ============================================================
    // D. RPC existence audit
    // ============================================================

    it('OR4: required order RPC functions exist', function () {
        const allOrderMigrations = MIGRATION_RPC + '\n' + MIGRATION_HARDENING;
        const requiredRpcs = [
            'public.create_order',
            'public.update_pending_order',
            'public.ship_order',
            'public.cancel_order',
            'public.complete_order'
        ];
        for (const rpc of requiredRpcs) {
            const pattern = new RegExp(`CREATE OR REPLACE FUNCTION\\s+${rpc.replace(/\./g, '\\.')}\\s*\\(`);
            assert.match(allOrderMigrations, pattern, `RPC should exist: ${rpc}`);
        }
        // private helpers
        assert.match(MIGRATION_RPC, /private\.recalculate_customer_aggregates\s*\(/, 'private.recalculate_customer_aggregates should exist');
        assert.match(MIGRATION_RPC, /private\.generate_order_number\s*\(/, 'private.generate_order_number should exist');
    });

    // ============================================================
    // E. RPC SECURITY DEFINER audit
    // ============================================================

    it('OR5: order RPCs use SECURITY DEFINER', function () {
        const allOrderMigrations = MIGRATION_RPC + '\n' + MIGRATION_HARDENING;
        const rpcNames = ['create_order', 'update_pending_order', 'ship_order', 'cancel_order', 'complete_order'];
        for (const name of rpcNames) {
            // Find the function body and check it has SECURITY DEFINER
            const pattern = new RegExp(`CREATE OR REPLACE FUNCTION\\s+public\\.${name}\\b[\\s\\S]*?LANGUAGE plpgsql\\s+SECURITY DEFINER`);
            assert.match(allOrderMigrations, pattern, `public.${name} should use SECURITY DEFINER`);
        }
        // private helpers too
        assert.match(MIGRATION_RPC, /private\.recalculate_customer_aggregates\b[\s\S]*?LANGUAGE plpgsql\s+SECURITY DEFINER/, 'private.recalculate_customer_aggregates should use SECURITY DEFINER');
        assert.match(MIGRATION_RPC, /private\.generate_order_number\b[\s\S]*?LANGUAGE plpgsql\s+SECURITY DEFINER/, 'private.generate_order_number should use SECURITY DEFINER');
    });

    it('OR6: order RPCs use SET search_path = \'\'', function () {
        const allOrderMigrations = MIGRATION_RPC + '\n' + MIGRATION_HARDENING;
        const rpcNames = ['create_order', 'update_pending_order', 'ship_order', 'cancel_order', 'complete_order'];
        for (const name of rpcNames) {
            const pattern = new RegExp(`CREATE OR REPLACE FUNCTION\\s+public\\.${name}\\b[\\s\\S]*?SET search_path = ''`);
            assert.match(allOrderMigrations, pattern, `public.${name} should SET search_path = ''`);
        }
    });

    // ============================================================
    // F. RPC auth and role checks
    // ============================================================

    it('OR7: order RPCs check auth.uid()', function () {
        const allOrderMigrations = MIGRATION_RPC + '\n' + MIGRATION_HARDENING;
        const rpcNames = ['create_order', 'update_pending_order', 'ship_order', 'cancel_order', 'complete_order'];
        for (const name of rpcNames) {
            const pattern = new RegExp(`CREATE OR REPLACE FUNCTION\\s+public\\.${name}\\b[\\s\\S]*?v_uid\\s*:=\\s*auth\\.uid\\(\\)`);
            assert.match(allOrderMigrations, pattern, `public.${name} should check auth.uid()`);
        }
    });

    it('OR8: order RPCs check owner/manager role and block staff', function () {
        const allOrderMigrations = MIGRATION_RPC + '\n' + MIGRATION_HARDENING;
        const rpcNames = ['create_order', 'update_pending_order', 'ship_order', 'cancel_order', 'complete_order'];
        for (const name of rpcNames) {
            const pattern = new RegExp(`CREATE OR REPLACE FUNCTION\\s+public\\.${name}\\b[\\s\\S]*?NOT IN \\('owner', 'manager'\\)`);
            assert.match(allOrderMigrations, pattern, `public.${name} should block non owner/manager roles (staff)`);
        }
    });

    // ============================================================
    // G. RPC inventory log generation audit
    // ============================================================

    it('OR9: create_order writes RESERVE inventory log', function () {
        assert.match(MIGRATION_RPC, /'RESERVE'::public\.inventory_change_type/, 'create_order should write RESERVE inventory log');
    });

    it('OR10: ship_order writes SHIP inventory log and calculates profit', function () {
        assert.match(EFFECTIVE_SHIP_ORDER, /'SHIP'::public\.inventory_change_type/, 'ship_order should write SHIP inventory log');
        assert.match(EFFECTIVE_SHIP_ORDER, /actual_profit\s*=\s*v_profit/, 'ship_order should calculate profit');
        // integer rounding (hardening requirement)
        assert.match(EFFECTIVE_SHIP_ORDER, /v_profit\s*:=\s*round\s*\(/, 'ship_order should use round() for profit (integer)');
    });

    it('OR11: cancel_order writes RELEASE inventory log', function () {
        assert.match(MIGRATION_RPC, /CREATE OR REPLACE FUNCTION public\.cancel_order[\s\S]*?'RELEASE'::public\.inventory_change_type/, 'cancel_order should write RELEASE inventory log');
    });

    it('OR12: complete_order recalculates customer aggregates', function () {
        assert.match(MIGRATION_RPC, /CREATE OR REPLACE FUNCTION public\.complete_order[\s\S]*?private\.recalculate_customer_aggregates/, 'complete_order should call recalculate_customer_aggregates');
    });

    it('OR13: update_pending_order validates PENDING state', function () {
        assert.match(EFFECTIVE_UPDATE_PENDING, /v_order\.status\s*!=\s*'PENDING'::public\.order_status/, 'update_pending_order should validate PENDING state');
        assert.match(EFFECTIVE_UPDATE_PENDING, /Only PENDING orders can be updated/, 'update_pending_order should raise on non-PENDING');
    });

    // ============================================================
    // H. Direct DML hardening audit
    // ============================================================

    it('OR14: direct DML is revoked/limited for orders', function () {
        // orders INSERT/UPDATE revoked
        assert.match(MIGRATION_RPC, /REVOKE INSERT, UPDATE ON public\.orders FROM authenticated/, 'orders INSERT/UPDATE should be revoked from authenticated');
        // orders INSERT/UPDATE policies dropped
        assert.match(MIGRATION_RPC, /DROP POLICY IF EXISTS "Orders: owner\/manager can insert" ON public\.orders/, 'orders insert policy should be dropped');
        assert.match(MIGRATION_RPC, /DROP POLICY IF EXISTS "Orders: owner\/manager can update" ON public\.orders/, 'orders update policy should be dropped');
        // inventory_logs: only SELECT granted, no INSERT/UPDATE/DELETE granted to authenticated
        assert.match(MIGRATION_RLS, /GRANT SELECT ON public\.inventory_logs TO authenticated/, 'inventory_logs should only grant SELECT to authenticated');
        assert.match(MIGRATION_RLS, /REVOKE ALL ON public\.inventory_logs FROM anon/, 'inventory_logs should be revoked from anon');
        // inventory_logs comment confirms append-only design
        assert.match(MIGRATION_RLS, /No INSERT\/UPDATE\/DELETE policies/, 'inventory_logs should have no client write policies');
        // No INSERT/UPDATE/DELETE policy created for inventory_logs
        assert.doesNotMatch(MIGRATION_RLS, /CREATE POLICY "InventoryLogs:[^"]*(?:INSERT|UPDATE|DELETE)/, 'no inventory_logs write policies should exist');
    });

    it('OR15: DELETE is not directly exposed for orders', function () {
        // DELETE revoked from authenticated in RLS migration
        assert.match(MIGRATION_RLS, /REVOKE DELETE ON public\.orders FROM authenticated/, 'orders DELETE should be revoked from authenticated');
        // No DELETE policy created for orders
        assert.doesNotMatch(MIGRATION_RLS, /CREATE POLICY "Orders:[^"]*DELETE[^"]*"\s+ON public\.orders\s+FOR DELETE/, 'no orders DELETE policy should exist');
    });

    // ============================================================
    // I. Dynamic SQL / service_role safety audit
    // ============================================================

    it('OR16: no dynamic SQL patterns in order RPC migrations', function () {
        const allOrderMigrations = MIGRATION_RPC + '\n' + MIGRATION_HARDENING;
        // EXECUTE with dynamic string
        assert.doesNotMatch(allOrderMigrations, /EXECUTE\s+['"]?\s*%/, 'no EXECUTE with format strings');
        // format() used for SQL execution
        assert.doesNotMatch(allOrderMigrations, /PERFORM\s+.*format\s*\(/, 'no dynamic SQL via format()');
        // No EXECUTE with variable
        assert.doesNotMatch(allOrderMigrations, /EXECUTE\s+\w+;/, 'no EXECUTE with variables');
    });

    it('OR17: no service_role/secret/token values in order RPC migrations', function () {
        const allOrderMigrations = MIGRATION_RPC + '\n' + MIGRATION_HARDENING;
        // No hardcoded service_role keys (typical patterns)
        assert.doesNotMatch(allOrderMigrations, /eyJ[A-Za-z0-9_-]{20,}/, 'no JWT-like tokens in migrations');
        assert.doesNotMatch(allOrderMigrations, /service_role\s*[:=]\s*['"]/, 'no service_role assignment in migrations');
        assert.doesNotMatch(allOrderMigrations, /sb_secret_/, 'no sb_secret_ patterns in migrations');
        // Explicit column lists (not SELECT *)
        assert.match(MIGRATION_RPC, /INSERT INTO public\.orders\s*\(/, 'create_order should use explicit column list');
        assert.match(MIGRATION_RPC, /INSERT INTO public\.inventory_logs\s*\(/, 'inventory_logs insert should use explicit column list');
    });

    // ============================================================
    // J. JS/CSS/HTML untouched audit (runtime check via git status)
    // ============================================================

    it('OR18: no JS/CSS/HTML files changed (audit-only)', function () {
        const changed = execSync('git diff --name-only HEAD', { cwd: REPO_ROOT, encoding: 'utf-8' }).trim();
        const lines = changed ? changed.split('\n') : [];
        const forbidden = lines.filter(f =>
            f.startsWith('js/') ||
            f.startsWith('css/') ||
            f === 'index.html' ||
            f.startsWith('supabase/migrations/')
        );
        assert.strictEqual(forbidden.length, 0,
            `No JS/CSS/HTML/migration files should be changed in audit phase. Found: ${forbidden.join(', ')}`);
    });

    // ============================================================
    // K. Additional audit: RLS, triggers, constraints, helpers
    // ============================================================

    describe('RLS audit', function () {

        it('OR-RLS1: orders RLS is enabled', function () {
            assert.match(MIGRATION_RLS, /ALTER TABLE public\.orders ENABLE ROW LEVEL SECURITY/, 'orders RLS should be enabled');
        });

        it('OR-RLS2: owner/manager active SELECT policy exists', function () {
            assert.match(MIGRATION_RLS, /"Orders: owner\/manager can view active"[\s\S]*?owner.*manager.*deleted_at IS NULL/, 'owner/manager active SELECT policy should exist');
        });

        it('OR-RLS3: owner deleted SELECT policy exists', function () {
            assert.match(MIGRATION_RLS, /"Orders: owners can view deleted"[\s\S]*?owner.*deleted_at IS NOT NULL/, 'owner deleted SELECT policy should exist');
        });

        it('OR-RLS4: staff is blocked from orders base SELECT', function () {
            // The active SELECT policy only allows owner/manager via has_store_role
            const policy = MIGRATION_RLS.match(/"Orders: owner\/manager can view active"[\s\S]*?USING \(([^)]*)\)/);
            assert.ok(policy, 'orders active SELECT policy should exist');
            assert.match(policy[0], /has_store_role\(store_id, ARRAY\['owner'::member_role, 'manager'::member_role\]\)/,
                'staff should not be in allowed roles for orders SELECT');
        });

        it('OR-RLS5: cross-store access is blocked (store_id in policy)', function () {
            // RLS policies reference store_id column directly, ensuring store-scoped access
            assert.match(MIGRATION_RLS, /"Orders: owner\/manager can view active"[\s\S]*?store_id/, 'orders SELECT policy should be store-scoped');
        });
    });

    describe('Trigger/constraint audit', function () {

        it('OR-TR1: orders has updated_at/version trigger', function () {
            assert.match(MIGRATION_TRIGGERS, /trg_orders_updated_at/, 'orders should have updated_at trigger');
            assert.match(MIGRATION_TRIGGERS, /handle_store_data_update\(\)/, 'orders should use handle_store_data_update');
        });

        it('OR-TR2: orders has audit metadata trigger (created_by/updated_by)', function () {
            assert.match(MIGRATION_TRIGGERS, /trg_orders_audit_metadata/, 'orders should have audit metadata trigger');
        });

        it('OR-TR3: orders has cross-store validation trigger', function () {
            assert.match(MIGRATION_TRIGGERS, /trg_orders_validate_store/, 'orders should have store consistency trigger');
            assert.match(MIGRATION_TRIGGERS, /validate_order_store_consistency/, 'validate_order_store_consistency function should exist');
        });

        it('OR-TR4: orders has constraints (quantity, price, cost)', function () {
            assert.match(MIGRATION_CONSTRAINTS, /chk_orders_quantity_positive/, 'orders should have quantity positive constraint');
            assert.match(MIGRATION_CONSTRAINTS, /chk_orders_selling_price_non_negative/, 'orders should have selling_price constraint');
            assert.match(MIGRATION_CONSTRAINTS, /chk_orders_actual_converted_cost_at_sale_non_negative/, 'orders should have cost constraint');
            assert.match(MIGRATION_CONSTRAINTS, /chk_orders_china_cost_at_sale_non_negative/, 'orders should have china_cost constraint');
        });

        it('OR-TR5: orders has unique index on (store_id, order_number) for active rows', function () {
            assert.match(MIGRATION_CONSTRAINTS, /unique_orders_active_store_number[\s\S]*?ON public\.orders \(store_id, order_number\)[\s\S]*?WHERE deleted_at IS NULL/, 'active order_number unique index should exist');
        });

        it('OR-TR6: orders has unique index on legacy_id', function () {
            assert.match(MIGRATION_CONSTRAINTS, /unique_orders_legacy_id[\s\S]*?ON public\.orders \(store_id, legacy_id\)[\s\S]*?WHERE legacy_id IS NOT NULL/, 'legacy_id unique index should exist');
        });

        it('OR-TR7: trigger functions are revoked from PUBLIC/anon/authenticated', function () {
            assert.match(MIGRATION_TRIGGERS, /REVOKE EXECUTE ON FUNCTION public\.validate_order_store_consistency\(\) FROM PUBLIC/, 'order trigger function should be revoked from PUBLIC');
            assert.match(MIGRATION_TRIGGERS, /REVOKE EXECUTE ON FUNCTION public\.validate_order_store_consistency\(\) FROM anon/, 'order trigger function should be revoked from anon');
            assert.match(MIGRATION_TRIGGERS, /REVOKE EXECUTE ON FUNCTION public\.validate_order_store_consistency\(\) FROM authenticated/, 'order trigger function should be revoked from authenticated');
        });
    });

    describe('Private helpers audit', function () {

        it('OR-PH1: private helpers use SECURITY DEFINER and SET search_path', function () {
            assert.match(MIGRATION_HELPERS, /private\.is_store_member\b[\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = ''/, 'is_store_member should be SECURITY DEFINER');
            assert.match(MIGRATION_HELPERS, /private\.current_store_role\b[\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = ''/, 'current_store_role should be SECURITY DEFINER');
            assert.match(MIGRATION_HELPERS, /private\.has_store_role\b[\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = ''/, 'has_store_role should be SECURITY DEFINER');
        });

        it('OR-PH2: private helpers check is_active membership', function () {
            assert.match(MIGRATION_HELPERS, /is_active = true/, 'helpers should check is_active = true');
        });

        it('OR-PH3: private helpers revoked from PUBLIC, granted to authenticated', function () {
            assert.match(MIGRATION_HELPERS, /REVOKE ALL ON FUNCTION private\.is_store_member\(uuid\) FROM PUBLIC/, 'is_store_member revoked from PUBLIC');
            assert.match(MIGRATION_HELPERS, /GRANT EXECUTE ON FUNCTION private\.is_store_member\(uuid\) TO authenticated/, 'is_store_member granted to authenticated');
        });
    });

    describe('RPC GRANT/REVOKE audit', function () {

        it('OR-GR1: order RPCs revoked from PUBLIC and anon', function () {
            const allOrderMigrations = MIGRATION_RPC + '\n' + MIGRATION_HARDENING;
            const rpcSignatures = [
                'create_order(uuid, uuid, uuid, integer, numeric, date, text, text, text)',
                'update_pending_order(uuid, uuid, uuid, integer, numeric, date, text, text, text)',
                'ship_order(uuid, date, text, text)',
                'cancel_order(uuid, text)',
                'complete_order(uuid)'
            ];
            for (const sig of rpcSignatures) {
                const escaped = sig.replace(/[()]/g, '\\$&').replace(/,/g, ',\\s*').replace(/\s+/g, '\\s+');
                assert.match(allOrderMigrations, new RegExp(`REVOKE ALL ON FUNCTION public\\.${escaped}\\s*FROM PUBLIC`),
                    `public.${sig.split('(')[0]} should be revoked from PUBLIC`);
                assert.match(allOrderMigrations, new RegExp(`REVOKE ALL ON FUNCTION public\\.${escaped}\\s*FROM anon`),
                    `public.${sig.split('(')[0]} should be revoked from anon`);
            }
        });

        it('OR-GR2: order RPCs granted EXECUTE to authenticated', function () {
            const allOrderMigrations = MIGRATION_RPC + '\n' + MIGRATION_HARDENING;
            const rpcSignatures = [
                'create_order(uuid, uuid, uuid, integer, numeric, date, text, text, text)',
                'update_pending_order(uuid, uuid, uuid, integer, numeric, date, text, text, text)',
                'ship_order(uuid, date, text, text)',
                'cancel_order(uuid, text)',
                'complete_order(uuid)'
            ];
            for (const sig of rpcSignatures) {
                const escaped = sig.replace(/[()]/g, '\\$&').replace(/,/g, ',\\s*').replace(/\s+/g, '\\s+');
                assert.match(allOrderMigrations, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${escaped}\\s*TO authenticated`),
                    `public.${sig.split('(')[0]} should be granted to authenticated`);
            }
        });

        it('OR-GR3: private helpers revoked from authenticated (RPC-only access)', function () {
            assert.match(MIGRATION_RPC, /REVOKE ALL ON FUNCTION private\.recalculate_customer_aggregates\(uuid\) FROM authenticated/, 'recalculate_customer_aggregates should be revoked from authenticated');
            assert.match(MIGRATION_RPC, /REVOKE ALL ON FUNCTION private\.generate_order_number\(uuid\) FROM authenticated/, 'generate_order_number should be revoked from authenticated');
        });
    });

    describe('RPC atomicity and stock safety audit', function () {

        it('OR-AT1: create_order uses FOR UPDATE on product', function () {
            assert.match(MIGRATION_RPC, /CREATE OR REPLACE FUNCTION public\.create_order[\s\S]*?FROM public\.products[\s\S]*?FOR UPDATE/, 'create_order should use FOR UPDATE on product');
        });

        it('OR-AT2: create_order checks available stock before reserving', function () {
            assert.match(MIGRATION_RPC, /v_available_stock\s*:=\s*v_product\.current_stock\s*-\s*v_product\.reserved_stock/, 'create_order should compute available stock');
            assert.match(MIGRATION_RPC, /IF p_quantity > v_available_stock THEN/, 'create_order should check quantity against available stock');
        });

        it('OR-AT3: ship_order uses FOR UPDATE on order and product', function () {
            assert.match(EFFECTIVE_SHIP_ORDER, /FROM public\.orders[\s\S]*?FOR UPDATE/, 'ship_order should use FOR UPDATE on order');
            assert.match(EFFECTIVE_SHIP_ORDER, /FROM public\.products[\s\S]*?FOR UPDATE/, 'ship_order should use FOR UPDATE on product');
        });

        it('OR-AT4: ship_order validates current_stock and reserved_stock', function () {
            assert.match(EFFECTIVE_SHIP_ORDER, /v_product\.current_stock < v_order\.quantity/, 'ship_order should validate current_stock');
            assert.match(EFFECTIVE_SHIP_ORDER, /v_product\.reserved_stock < v_order\.quantity/, 'ship_order should validate reserved_stock');
        });

        it('OR-AT5: cancel_order prevents negative reserved_stock', function () {
            assert.match(MIGRATION_RPC, /CREATE OR REPLACE FUNCTION public\.cancel_order[\s\S]*?reserved_stock < v_order\.quantity/, 'cancel_order should check reserved_stock consistency');
        });

        it('OR-AT6: update_pending_order uses ordered locking for product swap', function () {
            assert.match(EFFECTIVE_UPDATE_PENDING, /v_old_product_id < p_product_id/, 'update_pending_order should use ordered locking to prevent deadlock');
        });

        it('OR-AT7: generate_order_number uses advisory lock per store', function () {
            assert.match(MIGRATION_RPC, /pg_advisory_xact_lock\(hashtextextended\(p_store_id::text, 1\)\)/, 'generate_order_number should use advisory lock');
        });

        it('OR-AT8: create_order validates store/customer/product deleted_at', function () {
            const createBody = MIGRATION_RPC.match(/CREATE OR REPLACE FUNCTION public\.create_order[\s\S]*?\$\$;/);
            assert.ok(createBody, 'create_order body should exist');
            assert.match(createBody[0], /stores[\s\S]*?deleted_at IS NULL/, 'create_order should check store deleted_at');
            assert.match(createBody[0], /customers[\s\S]*?deleted_at IS NULL/, 'create_order should check customer deleted_at');
            assert.match(createBody[0], /products[\s\S]*?deleted_at IS NULL/, 'create_order should check product deleted_at');
        });
    });

    describe('Client compatibility risk audit', function () {

        it('OR-CC1: analytics depends on DB.getOrders() (local gateway)', function () {
            const analytics = readFile('js/analytics.js');
            assert.match(analytics, /DB\.getOrders\(\)/, 'analytics should use DB.getOrders()');
            assert.match(analytics, /_getShippedOrders/, 'analytics should have _getShippedOrders');
        });

        it('OR-CC2: customers.recalculateAll depends on DB.getOrders()', function () {
            const customers = readFile('js/customers.js');
            assert.match(customers, /recalculateAll[\s\S]*?DB\.getOrders\(\)/, 'customers.recalculateAll should use DB.getOrders()');
        });

        it('OR-CC3: orders.js uses local hard delete (DB.deleteOrder)', function () {
            const orders = readFile('js/orders.js');
            const db = readFile('js/db.js');
            assert.match(db, /deleteOrder\s*\(/, 'db.js should have deleteOrder (local hard delete)');
            // Remote does NOT allow DELETE (soft delete only via status change)
            assert.match(MIGRATION_RLS, /REVOKE DELETE ON public\.orders FROM authenticated/, 'remote orders should not allow DELETE');
        });

        it('OR-CC4: local orders use numeric id, remote uses uuid + legacy_id', function () {
            const db = readFile('js/db.js');
            // Local addOrder assigns numeric id via getNextId
            assert.match(db, /addOrder[\s\S]*?order\.id\s*=\s*this\.getNextId\('orders'\)/, 'local addOrder should use getNextId (numeric)');
            // Remote orders table has uuid primary key and legacy_id bigint
            assert.match(MIGRATION_SCHEMA, /id uuid primary key default gen_random_uuid\(\)/, 'remote orders id should be uuid');
            assert.match(MIGRATION_SCHEMA, /legacy_id bigint/, 'remote orders should have legacy_id');
        });

        it('OR-CC5: local status edit is flexible, remote RPC enforces strict transitions', function () {
            const orders = readFile('js/orders.js');
            // Local allows direct status update via DB.updateOrder
            assert.match(orders, /DB\.updateOrder\s*\(\s*id\s*,\s*\{\s*status:/, 'local allows direct status update');
            // Remote RPCs enforce specific transitions
            assert.match(EFFECTIVE_SHIP_ORDER, /Can only ship PENDING orders/, 'remote ship_order enforces PENDING only');
            assert.match(MIGRATION_RPC, /Can only cancel PENDING orders/, 'remote cancel_order enforces PENDING only');
            assert.match(MIGRATION_RPC, /Can only complete SHIPPED orders/, 'remote complete_order enforces SHIPPED only');
        });

        it('OR-CC6: local inventory log uses type=OUT, remote uses SHIP change_type', function () {
            const orders = readFile('js/orders.js');
            assert.match(orders, /type:\s*'OUT'/, 'local ship should use type=OUT');
            assert.match(EFFECTIVE_SHIP_ORDER, /'SHIP'::public\.inventory_change_type/, 'remote ship_order should use SHIP change_type');
        });
    });
});
