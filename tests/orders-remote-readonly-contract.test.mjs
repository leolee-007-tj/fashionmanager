import { describe, it } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const REPO_ROOT = join(new URL('.', import.meta.url).pathname, '..');

function readFile(relativePath) {
    const fullPath = join(REPO_ROOT, relativePath);
    if (!existsSync(fullPath)) return null;
    return readFileSync(fullPath, 'utf-8');
}

const CONFIG_EXAMPLE = readFile('js/config.example.js');
const DB_JS = readFile('js/db.js');

describe('Orders Remote Read-only Prototype Contract (RO1-RO18)', function () {

    // ============================================================
    // RO1-RO2: config flags
    // ============================================================

    it('RO1: config.example.js contains ORDERS_SUPABASE_ENABLED false', function () {
        assert.ok(CONFIG_EXAMPLE, 'config.example.js should exist');
        assert.match(CONFIG_EXAMPLE, /ORDERS_SUPABASE_ENABLED:\s*false/, 'ORDERS_SUPABASE_ENABLED should be false');
    });

    it('RO2: config.example.js contains ORDERS_SUPABASE_REMOTE_ENABLED false', function () {
        assert.match(CONFIG_EXAMPLE, /ORDERS_SUPABASE_REMOTE_ENABLED:\s*false/, 'ORDERS_SUPABASE_REMOTE_ENABLED should be false');
    });

    // ============================================================
    // RO3-RO5: DataSource structure
    // ============================================================

    it('RO3: db.js contains SupabaseOrdersDataSource', function () {
        assert.match(DB_JS, /SupabaseOrdersDataSource/, 'db.js should contain SupabaseOrdersDataSource');
        assert.match(DB_JS, /_createControlledSupabaseOrdersDataSource/, 'db.js should contain factory method');
    });

    it('RO4: db.js contains LocalOrdersDataSource', function () {
        assert.match(DB_JS, /LocalOrdersDataSource/, 'db.js should contain LocalOrdersDataSource');
        assert.match(DB_JS, /_createLocalOrdersDataSource/, 'db.js should contain factory method');
        assert.match(DB_JS, /getOrdersDataSource\(\)/, 'db.js should contain getOrdersDataSource()');
    });

    it('RO5: db.js contains mapSupabaseRowToLegacyOrder', function () {
        assert.match(DB_JS, /mapSupabaseRowToLegacyOrder\s*\(/, 'db.js should contain mapSupabaseRowToLegacyOrder');
    });

    // ============================================================
    // RO6-RO9: Mapping correctness
    // ============================================================

    it('RO6: map includes remote_id', function () {
        const mapBody = DB_JS.match(/mapSupabaseRowToLegacyOrder\(row\)\s*\{[\s\S]*?\n    \}/);
        assert.ok(mapBody, 'mapSupabaseRowToLegacyOrder body should exist');
        assert.match(mapBody[0], /remote_id/, 'mapping should include remote_id');
    });

    it('RO7: map includes legacy_id handling', function () {
        const mapBody = DB_JS.match(/mapSupabaseRowToLegacyOrder\(row\)\s*\{[\s\S]*?\n    \}/);
        assert.ok(mapBody, 'mapSupabaseRowToLegacyOrder body should exist');
        assert.match(mapBody[0], /legacy_id/, 'mapping should handle legacy_id');
        assert.match(mapBody[0], /legacy_customer_id/, 'mapping should handle legacy_customer_id');
        assert.match(mapBody[0], /legacy_product_id/, 'mapping should handle legacy_product_id');
    });

    it('RO8: map includes customer/product snapshot mapping', function () {
        const mapBody = DB_JS.match(/mapSupabaseRowToLegacyOrder\(row\)\s*\{[\s\S]*?\n    \}/);
        assert.ok(mapBody, 'mapSupabaseRowToLegacyOrder body should exist');
        const snapshots = [
            'customer_name_snapshot',
            'product_title_snapshot',
            'brand_snapshot',
            'category_snapshot',
            'color_snapshot',
            'size_snapshot'
        ];
        for (const snap of snapshots) {
            assert.ok(mapBody[0].includes(snap), `mapping should include ${snap}`);
        }
    });

    it('RO9: map includes actual_converted_cost_at_sale/china_cost_at_sale mapping', function () {
        const mapBody = DB_JS.match(/mapSupabaseRowToLegacyOrder\(row\)\s*\{[\s\S]*?\n    \}/);
        assert.ok(mapBody, 'mapSupabaseRowToLegacyOrder body should exist');
        assert.match(mapBody[0], /actual_converted_cost_at_sale/, 'mapping should include actual_converted_cost_at_sale');
        assert.match(mapBody[0], /china_cost_at_sale/, 'mapping should include china_cost_at_sale');
        // Also check the local aliases
        assert.match(mapBody[0], /actual_cost:/, 'mapping should map to local actual_cost');
        assert.match(mapBody[0], /china_cost:/, 'mapping should map to local china_cost');
    });

    // ============================================================
    // RO10-RO11: listOrders query structure
    // ============================================================

    it('RO10: listOrders uses SELECT/from(\'orders\') only', function () {
        // Find the listOrders method within SupabaseOrdersDataSource
        const supabaseSection = DB_JS.match(/_createControlledSupabaseOrdersDataSource\(client,\s*context\)\s*\{[\s\S]*?(?=\n    \},\n\n    \/\*\*)/);
        assert.ok(supabaseSection, 'SupabaseOrdersDataSource section should exist');
        const listOrdersSection = supabaseSection[0].match(/listOrders\(filters\)\s*\{[\s\S]*?\n            \}/);
        assert.ok(listOrdersSection, 'listOrders method should exist');
        assert.match(listOrdersSection[0], /client\.from\('orders'\)/, 'listOrders should use from(\'orders\')');
        assert.match(listOrdersSection[0], /\.select\(/, 'listOrders should use SELECT');
    });

    it('RO11: listOrders filters store_id and deleted_at', function () {
        const supabaseSection = DB_JS.match(/_createControlledSupabaseOrdersDataSource\(client,\s*context\)\s*\{[\s\S]*?(?=\n    \},\n\n    \/\*\*)/);
        assert.ok(supabaseSection, 'SupabaseOrdersDataSource section should exist');
        const listOrdersSection = supabaseSection[0].match(/listOrders\(filters\)\s*\{[\s\S]*?\n            \}/);
        assert.ok(listOrdersSection, 'listOrders method should exist');
        assert.match(listOrdersSection[0], /\.eq\('store_id',\s*context\.storeId\)/, 'listOrders should filter by store_id');
        assert.match(listOrdersSection[0], /\.is\('deleted_at',\s*null\)/, 'listOrders should filter deleted_at IS NULL');
    });

    // ============================================================
    // RO12-RO14: Write methods disabled
    // ============================================================

    it('RO12: only setOrders/updateOrder/deleteOrder/findDuplicateOrder still throw (3-8A.6: status RPCs implemented)', function () {
        const supabaseSection = DB_JS.match(/_createControlledSupabaseOrdersDataSource\(client,\s*context\)\s*\{[\s\S]*?(?=\n    \},\n\n    \/\*\*)/);
        assert.ok(supabaseSection, 'SupabaseOrdersDataSource section should exist');
        // Check that write methods throw
        assert.match(supabaseSection[0], /_writeDisabledMsg/, 'write disabled message variable should exist');
        // 3-8A.5: createOrder implemented. 3-8A.6: updatePendingOrder/shipOrder/cancelOrder/completeOrder implemented.
        // Only setOrders/updateOrder/deleteOrder/findDuplicateOrder still throw.
        const disabledMethods = ['setOrders', 'updateOrder', 'deleteOrder', 'findDuplicateOrder'];
        for (const method of disabledMethods) {
            const methodPattern = new RegExp(`${method}\\([^)]*\\)\\s*\\{[\\s\\S]*?throw`);
            assert.match(supabaseSection[0], methodPattern, `${method} should still throw`);
        }
        // 3-8A.6: status RPC methods should NOT throw _writeDisabledMsg (they are implemented)
        const implementedMethods = ['updatePendingOrder', 'shipOrder', 'cancelOrder', 'completeOrder'];
        for (const method of implementedMethods) {
            const methodBlock = supabaseSection[0].match(new RegExp(`${method}\\([^)]*\\)\\s*\\{([\\s\\S]*?)\\n        \\},`));
            if (methodBlock) {
                assert.doesNotMatch(methodBlock[1], /_writeDisabledMsg/, `${method} should NOT throw _writeDisabledMsg (3-8A.6 implemented)`);
            }
        }
    });

    it('RO13: db.js calls allowed write RPCs (3-8A.6); other write RPCs still forbidden', function () {
        const supabaseSection = DB_JS.match(/_createControlledSupabaseOrdersDataSource\(client,\s*context\)\s*\{[\s\S]*?(?=\n    \},\n\n    \/\*\*)/);
        assert.ok(supabaseSection, 'SupabaseOrdersDataSource section should exist');
        // 3-8A.5: create_order RPC is now allowed.
        // 3-8A.6: update_pending_order/ship_order/cancel_order/complete_order RPCs are now allowed.
        // Check RPC name strings exist in the source (they are called via _callOrderRpcAndMap with variable).
        assert.match(supabaseSection[0], /['\"]create_order['\"]/, 'should reference create_order RPC');
        assert.match(supabaseSection[0], /['\"]update_pending_order['\"]/, 'should reference update_pending_order RPC (3-8A.6)');
        assert.match(supabaseSection[0], /['\"]ship_order['\"]/, 'should reference ship_order RPC (3-8A.6)');
        assert.match(supabaseSection[0], /['\"]cancel_order['\"]/, 'should reference cancel_order RPC (3-8A.6)');
        assert.match(supabaseSection[0], /['\"]complete_order['\"]/, 'should reference complete_order RPC (3-8A.6)');
        // Other write RPCs remain forbidden
        assert.doesNotMatch(supabaseSection[0], /['\"]delete_order['\"]/, 'should not reference delete_order RPC');
    });

    it('RO14: db.js does not use insert/update/delete for orders remote writes', function () {
        const supabaseSection = DB_JS.match(/_createControlledSupabaseOrdersDataSource\(client,\s*context\)\s*\{[\s\S]*?(?=\n    \},\n\n    \/\*\*)/);
        assert.ok(supabaseSection, 'SupabaseOrdersDataSource section should exist');
        // No insert/update/delete operations on orders table
        assert.doesNotMatch(supabaseSection[0], /\.insert\(/, 'should not use insert');
        assert.doesNotMatch(supabaseSection[0], /\.update\(/, 'should not use update');
        assert.doesNotMatch(supabaseSection[0], /\.delete\(/, 'should not use delete');
    });

    // ============================================================
    // RO15: Existing DB API compatibility
    // ============================================================

    it('RO15: existing DB.getOrders/addOrder/updateOrder/deleteOrder names still exist', function () {
        assert.match(DB_JS, /getOrders\(\)\s*\{/, 'DB.getOrders() should still exist');
        assert.match(DB_JS, /setOrders\(orders\)\s*\{/, 'DB.setOrders() should still exist');
        assert.match(DB_JS, /addOrder\(order\)\s*\{/, 'DB.addOrder() should still exist');
        assert.match(DB_JS, /updateOrder\(id,\s*updates\)\s*\{/, 'DB.updateOrder() should still exist');
        assert.match(DB_JS, /deleteOrder\(id\)\s*\{/, 'DB.deleteOrder() should still exist');
        assert.match(DB_JS, /findDuplicateOrder\(/, 'DB.findDuplicateOrder() should still exist');
        // async helper
        assert.match(DB_JS, /getOrdersAsync\(\)/, 'DB.getOrdersAsync() should exist');
    });

    // ============================================================
    // RO16-RO17: File change safety
    // ============================================================

    it('RO16: JS files outside db.js/orders.js/app.js/config.example.js unchanged (3-8A.9-A)', function () {
        const changed = execSync('git diff --name-only HEAD', { cwd: REPO_ROOT, encoding: 'utf-8' }).trim();
        const lines = changed ? changed.split('\n') : [];
        const allowedJs = ['js/db.js', 'js/config.example.js', 'js/orders.js', 'js/app.js'];
        const forbiddenJs = lines.filter(f =>
            f.startsWith('js/') &&
            !allowedJs.includes(f)
        );
        assert.strictEqual(forbiddenJs.length, 0,
            `Only js/db.js, js/config.example.js, js/orders.js, js/app.js should be changed in 3-8A.9-A. Found JS changes: ${forbiddenJs.join(', ')}`);
    });

    it('RO17: no migration changes', function () {
        const changed = execSync('git diff --name-only HEAD', { cwd: REPO_ROOT, encoding: 'utf-8' }).trim();
        const lines = changed ? changed.split('\n') : [];
        const migrationChanges = lines.filter(f => f.startsWith('supabase/migrations/'));
        assert.strictEqual(migrationChanges.length, 0,
            `No migration files should be changed. Found: ${migrationChanges.join(', ')}`);
    });

    // ============================================================
    // RO18: No secrets
    // ============================================================

    it('RO18: no secrets/service_role actual values', function () {
        assert.doesNotMatch(DB_JS, /eyJ[A-Za-z0-9_-]{20,}/, 'no JWT-like tokens in db.js');
        assert.doesNotMatch(CONFIG_EXAMPLE, /eyJ[A-Za-z0-9_-]{20,}/, 'no JWT-like tokens in config.example.js');
        assert.doesNotMatch(DB_JS, /service_role\s*[:=]\s*['"][^'"]+['"]/, 'no service_role assignment in db.js');
    });

    // ============================================================
    // Additional: Runtime feature flag gate
    // ============================================================

    describe('Feature flag gate', function () {
        it('RO-FG1: _resolveRuntimeOrdersDataSource checks ORDERS_SUPABASE_ENABLED', function () {
            const resolveSection = DB_JS.match(/_resolveRuntimeOrdersDataSource\(\)\s*\{[\s\S]*?\n    \}/);
            assert.ok(resolveSection, '_resolveRuntimeOrdersDataSource should exist');
            assert.match(resolveSection[0], /ORDERS_SUPABASE_ENABLED/, 'should check ORDERS_SUPABASE_ENABLED');
            assert.match(resolveSection[0], /SUPABASE_ENABLED/, 'should check SUPABASE_ENABLED');
        });

        it('RO-FG2: service_role key is blocked', function () {
            const resolveSection = DB_JS.match(/_resolveRuntimeOrdersDataSource\(\)\s*\{[\s\S]*?\n    \}/);
            assert.ok(resolveSection, '_resolveRuntimeOrdersDataSource should exist');
            assert.match(resolveSection[0], /service_role/, 'should check for service_role');
            assert.match(resolveSection[0], /forbids service_role/, 'should block service_role');
        });

        it('RO-FG3: remote URL guardrail exists', function () {
            const resolveSection = DB_JS.match(/_resolveRuntimeOrdersDataSource\(\)\s*\{[\s\S]*?\n    \}/);
            assert.ok(resolveSection, '_resolveRuntimeOrdersDataSource should exist');
            assert.match(resolveSection[0], /ORDERS_SUPABASE_REMOTE_ENABLED/, 'should check remote enabled flag');
        });

        it('RO-FG4: active storeId required', function () {
            const resolveSection = DB_JS.match(/_resolveRuntimeOrdersDataSource\(\)\s*\{[\s\S]*?\n    \}/);
            assert.ok(resolveSection, '_resolveRuntimeOrdersDataSource should exist');
            assert.match(resolveSection[0], /_resolveActiveStoreId/, 'should call _resolveActiveStoreId');
            assert.match(resolveSection[0], /requires active storeId/, 'should require active storeId');
        });

        it('RO-FG5: guest mode falls back to local', function () {
            const resolveSection = DB_JS.match(/_resolveRuntimeOrdersDataSource\(\)\s*\{[\s\S]*?\n    \}/);
            assert.ok(resolveSection, '_resolveRuntimeOrdersDataSource should exist');
            assert.match(resolveSection[0], /activeMembership === null/, 'should handle guest mode');
            assert.match(resolveSection[0], /return null/, 'should return null for guest');
        });
    });

    // ============================================================
    // Additional: Mapping function behavior
    // ============================================================

    describe('Mapping function behavior', function () {
        it('RO-MAP1: mapSupabaseRowToLegacyOrder is a pure function (no network/storage calls)', function () {
            const mapBody = DB_JS.match(/mapSupabaseRowToLegacyOrder\(row\)\s*\{[\s\S]*?\n    \}/);
            assert.ok(mapBody, 'mapSupabaseRowToLegacyOrder body should exist');
            // Should not contain network or storage calls
            assert.doesNotMatch(mapBody[0], /client\.from/, 'mapping should not call client.from');
            assert.doesNotMatch(mapBody[0], /localStorage/, 'mapping should not access localStorage');
            assert.doesNotMatch(mapBody[0], /fetch\(/, 'mapping should not call fetch');
        });

        it('RO-MAP2: mapping handles null legacy_id gracefully', function () {
            const mapBody = DB_JS.match(/mapSupabaseRowToLegacyOrder\(row\)\s*\{[\s\S]*?\n    \}/);
            assert.ok(mapBody, 'mapSupabaseRowToLegacyOrder body should exist');
            assert.match(mapBody[0], /row\.legacy_id\s*!=\s*null/, 'should check legacy_id != null');
        });

        it('RO-MAP3: mapping includes status field', function () {
            const mapBody = DB_JS.match(/mapSupabaseRowToLegacyOrder\(row\)\s*\{[\s\S]*?\n    \}/);
            assert.ok(mapBody, 'mapSupabaseRowToLegacyOrder body should exist');
            assert.match(mapBody[0], /status:\s*safeValue\(row\.status/, 'should map status');
        });

        it('RO-MAP4: mapping includes profit_margin alias', function () {
            const mapBody = DB_JS.match(/mapSupabaseRowToLegacyOrder\(row\)\s*\{[\s\S]*?\n    \}/);
            assert.ok(mapBody, 'mapSupabaseRowToLegacyOrder body should exist');
            assert.match(mapBody[0], /profit_margin/, 'should include profit_margin');
            assert.match(mapBody[0], /cost_ratio/, 'should include cost_ratio');
        });
    });

    // ============================================================
    // Additional: LocalOrdersDataSource compatibility
    // ============================================================

    describe('LocalOrdersDataSource compatibility', function () {
        it('RO-LOC1: LocalOrdersDataSource wraps existing DB methods', function () {
            const localSection = DB_JS.match(/_createLocalOrdersDataSource\(\)\s*\{[\s\S]*?\n    \}/);
            assert.ok(localSection, '_createLocalOrdersDataSource should exist');
            assert.match(localSection[0], /db\.getOrders\(\)/, 'listOrders should call db.getOrders()');
            assert.match(localSection[0], /db\.setOrders\(/, 'setOrders should call db.setOrders()');
            assert.match(localSection[0], /db\.addOrder\(/, 'createOrder should call db.addOrder()');
            assert.match(localSection[0], /db\.updateOrder\(/, 'updateOrder should call db.updateOrder()');
            assert.match(localSection[0], /db\.deleteOrder\(/, 'deleteOrder should call db.deleteOrder()');
            assert.match(localSection[0], /db\.findDuplicateOrder\(/, 'findDuplicateOrder should call db.findDuplicateOrder()');
        });

        it('RO-LOC2: LocalOrdersDataSource has name property', function () {
            const localSection = DB_JS.match(/_createLocalOrdersDataSource\(\)\s*\{[\s\S]*?\n    \}/);
            assert.ok(localSection, '_createLocalOrdersDataSource should exist');
            assert.match(localSection[0], /name:\s*'LocalOrdersDataSource'/, 'should have name property');
        });
    });
});
