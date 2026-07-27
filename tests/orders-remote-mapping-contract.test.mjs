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

const DB_JS = readFile('js/db.js');
const CONFIG_EXAMPLE = readFile('js/config.example.js');

/**
 * db.js 소스에서 DB 객체를 안전하게 평가하기 위한 sandbox 로더.
 * - localStorage stub 주입
 * - window 등 전역 가드
 * - 네트워크 호출 금지 (이 테스트는 순수 함수 수준 검증만)
 */
function loadDbForTesting() {
    const storage = {};
    const localStorageStub = {
        getItem(key) { return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null; },
        setItem(key, value) { storage[key] = String(value); },
        removeItem(key) { delete storage[key]; }
    };
    const sandbox = {
        localStorage: localStorageStub,
        console,
        Date,
        Math,
        JSON,
        Object,
        Array,
        Number,
        String,
        Boolean,
        Error,
        RegExp,
        Promise
    };
    const source = readFile('js/db.js');
    const factory = new Function(...Object.keys(sandbox), `${source}\n return DB;`);
    return factory(...Object.values(sandbox));
}

describe('Orders Remote Mapping Contract (M1-M30)', function () {

    // ============================================================
    // M1: mapSupabaseRowToLegacyOrder exists
    // ============================================================

    it('M1: mapSupabaseRowToLegacyOrder exists in db.js', function () {
        assert.match(DB_JS, /mapSupabaseRowToLegacyOrder\s*\(/,
            'db.js should contain mapSupabaseRowToLegacyOrder');
    });

    // ============================================================
    // M2: mapper is pure
    // ============================================================

    it('M2: mapper is pure (no localStorage, no sessionStorage, no fetch, no supabase client)', function () {
        const mapBody = DB_JS.match(/mapSupabaseRowToLegacyOrder\s*\([^)]*\)\s*\{([\s\S]*?)\n    \}/);
        assert.ok(mapBody, 'mapSupabaseRowToLegacyOrder body should exist');
        const body = mapBody[1];
        assert.doesNotMatch(body, /localStorage\s*\./,
            'mapper must not access localStorage');
        assert.doesNotMatch(body, /sessionStorage\s*\./,
            'mapper must not access sessionStorage');
        assert.doesNotMatch(body, /\bfetch\s*\(/,
            'mapper must not call fetch');
        assert.doesNotMatch(body, /supabase\s*\.\s*from\s*\(/i,
            'mapper must not call supabase.from');
        assert.doesNotMatch(body, /\.rpc\s*\(/i,
            'mapper must not call .rpc');
    });

    // ============================================================
    // M3-M5: id / remote_id / legacy_id mapping
    // ============================================================

    it('M3: remote uuid id maps to remote_id', function () {
        const DB = loadDbForTesting();
        const row = {
            id: '550e8400-e29b-41d4-a716-446655440000',
            legacy_id: null,
            order_number: 'ORD-001'
        };
        const order = DB.mapSupabaseRowToLegacyOrder(row);
        assert.equal(order.remote_id, '550e8400-e29b-41d4-a716-446655440000',
            'row.id (uuid) should map to order.remote_id');
        assert.notEqual(order.id, '550e8400-e29b-41d4-a716-446655440000',
            'uuid must NOT leak into order.id (must be legacy numeric id or null)');
    });

    it('M4: legacy_id maps to both id and legacy_id', function () {
        const DB = loadDbForTesting();
        const row = {
            id: '550e8400-e29b-41d4-a716-446655440000',
            legacy_id: 12345,
            order_number: 'ORD-001'
        };
        const order = DB.mapSupabaseRowToLegacyOrder(row);
        assert.equal(order.id, 12345, 'row.legacy_id should map to order.id');
        assert.equal(typeof order.id, 'number', 'order.id should be a number');
        assert.equal(order.legacy_id, 12345, 'row.legacy_id should map to order.legacy_id');
    });

    it('M5: missing legacy_id → id is null (fallback policy)', function () {
        const DB = loadDbForTesting();
        const row = {
            id: '550e8400-e29b-41d4-a716-446655440000',
            legacy_id: null,
            order_number: 'ORD-NEW'
        };
        const order = DB.mapSupabaseRowToLegacyOrder(row);
        assert.equal(order.id, null, 'order.id should be null when legacy_id is null');
        assert.equal(order.legacy_id, null, 'order.legacy_id should be null when legacy_id is null');
        assert.equal(order.remote_id, '550e8400-e29b-41d4-a716-446655440000',
            'remote_id should still be preserved from uuid row.id');
    });

    // ============================================================
    // M6-M9: customer/product uuid + legacy id mapping
    // ============================================================

    it('M6: customer_id uuid maps to customer_uuid', function () {
        const DB = loadDbForTesting();
        const row = {
            id: 'order-uuid-1',
            legacy_id: 1,
            customer_id: 'cust-uuid-123',
            legacy_customer_id: null
        };
        const order = DB.mapSupabaseRowToLegacyOrder(row);
        assert.equal(order.customer_uuid, 'cust-uuid-123',
            'row.customer_id (uuid) should map to order.customer_uuid');
    });

    it('M7: legacy_customer_id maps to customer_id', function () {
        const DB = loadDbForTesting();
        const row = {
            id: 'order-uuid-1',
            legacy_id: 1,
            customer_id: 'cust-uuid-123',
            legacy_customer_id: 42
        };
        const order = DB.mapSupabaseRowToLegacyOrder(row);
        assert.equal(order.customer_id, 42, 'legacy_customer_id should map to customer_id');
        assert.equal(typeof order.customer_id, 'number', 'customer_id should be a number');
        assert.equal(order.customer_uuid, 'cust-uuid-123', 'customer_uuid should still be uuid');
    });

    it('M8: product_id uuid maps to product_uuid', function () {
        const DB = loadDbForTesting();
        const row = {
            id: 'order-uuid-1',
            legacy_id: 1,
            product_id: 'prod-uuid-456',
            legacy_product_id: null
        };
        const order = DB.mapSupabaseRowToLegacyOrder(row);
        assert.equal(order.product_uuid, 'prod-uuid-456',
            'row.product_id (uuid) should map to order.product_uuid');
    });

    it('M9: legacy_product_id maps to product_id', function () {
        const DB = loadDbForTesting();
        const row = {
            id: 'order-uuid-1',
            legacy_id: 1,
            product_id: 'prod-uuid-456',
            legacy_product_id: 77
        };
        const order = DB.mapSupabaseRowToLegacyOrder(row);
        assert.equal(order.product_id, 77, 'legacy_product_id should map to product_id');
        assert.equal(typeof order.product_id, 'number', 'product_id should be a number');
        assert.equal(order.product_uuid, 'prod-uuid-456', 'product_uuid should still be uuid');
    });

    // ============================================================
    // M10-M12: snapshot fields mapping
    // ============================================================

    it('M10: customer_name_snapshot maps to customer_name', function () {
        const DB = loadDbForTesting();
        const row = {
            id: 'o1',
            legacy_id: 1,
            customer_name_snapshot: '김철수'
        };
        const order = DB.mapSupabaseRowToLegacyOrder(row);
        assert.equal(order.customer_name, '김철수',
            'customer_name_snapshot should map to customer_name');
    });

    it('M11: product_title_snapshot maps to product_name and product_title', function () {
        const DB = loadDbForTesting();
        const row = {
            id: 'o1',
            legacy_id: 1,
            product_title_snapshot: '여름 원피스'
        };
        const order = DB.mapSupabaseRowToLegacyOrder(row);
        assert.equal(order.product_name, '여름 원피스',
            'product_title_snapshot should map to product_name');
        assert.equal(order.product_title, '여름 원피스',
            'product_title_snapshot should also map to product_title');
    });

    it('M12: brand/category/color/size snapshot fields map correctly', function () {
        const DB = loadDbForTesting();
        const row = {
            id: 'o1',
            legacy_id: 1,
            brand_snapshot: 'LESOUL',
            category_snapshot: '원피스',
            color_snapshot: '베이지',
            size_snapshot: 'FREE'
        };
        const order = DB.mapSupabaseRowToLegacyOrder(row);
        assert.equal(order.brand, 'LESOUL', 'brand_snapshot → brand');
        assert.equal(order.category, '원피스', 'category_snapshot → category');
        assert.equal(order.color, '베이지', 'color_snapshot → color');
        assert.equal(order.size, 'FREE', 'size_snapshot → size');
    });

    // ============================================================
    // M13-M16: financial fields mapping
    // ============================================================

    it('M13: actual_converted_cost_at_sale maps to actual_cost', function () {
        const DB = loadDbForTesting();
        const row = {
            id: 'o1',
            legacy_id: 1,
            actual_converted_cost_at_sale: 35000
        };
        const order = DB.mapSupabaseRowToLegacyOrder(row);
        assert.equal(order.actual_cost, 35000,
            'actual_converted_cost_at_sale should map to actual_cost');
        assert.equal(typeof order.actual_cost, 'number', 'actual_cost should be number');
    });

    it('M14: china_cost_at_sale maps to china_cost', function () {
        const DB = loadDbForTesting();
        const row = {
            id: 'o1',
            legacy_id: 1,
            china_cost_at_sale: 12000
        };
        const order = DB.mapSupabaseRowToLegacyOrder(row);
        assert.equal(order.china_cost, 12000,
            'china_cost_at_sale should map to china_cost');
        assert.equal(typeof order.china_cost, 'number', 'china_cost should be number');
    });

    it('M15: actual_profit_margin maps to profit_margin', function () {
        const DB = loadDbForTesting();
        const row = {
            id: 'o1',
            legacy_id: 1,
            actual_profit_margin: 45.5
        };
        const order = DB.mapSupabaseRowToLegacyOrder(row);
        assert.equal(order.profit_margin, 45.5,
            'actual_profit_margin should map to profit_margin');
    });

    it('M16: actual_cost_ratio maps to cost_ratio', function () {
        const DB = loadDbForTesting();
        const row = {
            id: 'o1',
            legacy_id: 1,
            actual_cost_ratio: 54.5
        };
        const order = DB.mapSupabaseRowToLegacyOrder(row);
        assert.equal(order.cost_ratio, 54.5,
            'actual_cost_ratio should map to cost_ratio');
    });

    // ============================================================
    // M17-M19: status, dates, shipping
    // ============================================================

    it('M17: status is preserved', function () {
        const DB = loadDbForTesting();
        const statuses = ['PENDING', 'SHIPPED', 'COMPLETED', 'CANCELLED'];
        for (const s of statuses) {
            const row = { id: 'o1', legacy_id: 1, status: s };
            const order = DB.mapSupabaseRowToLegacyOrder(row);
            assert.equal(order.status, s, `status ${s} should be preserved`);
        }
    });

    it('M18: order_date and ship_date are preserved', function () {
        const DB = loadDbForTesting();
        const row = {
            id: 'o1',
            legacy_id: 1,
            order_date: '2026-07-01T10:00:00.000Z',
            ship_date: '2026-07-03T10:00:00.000Z'
        };
        const order = DB.mapSupabaseRowToLegacyOrder(row);
        assert.equal(order.order_date, '2026-07-01T10:00:00.000Z', 'order_date preserved');
        assert.equal(order.ship_date, '2026-07-03T10:00:00.000Z', 'ship_date preserved');
    });

    it('M19: shipping_company, tracking_number, notes are preserved', function () {
        const DB = loadDbForTesting();
        const row = {
            id: 'o1',
            legacy_id: 1,
            shipping_company: 'CJ대한통운',
            tracking_number: '1234567890',
            notes: '고객 요청사항: 배송 전 연락 바람'
        };
        const order = DB.mapSupabaseRowToLegacyOrder(row);
        assert.equal(order.shipping_company, 'CJ대한통운', 'shipping_company preserved');
        assert.equal(order.tracking_number, '1234567890', 'tracking_number preserved');
        assert.equal(order.notes, '고객 요청사항: 배송 전 연락 바람', 'notes preserved');
    });

    // ============================================================
    // M20: deleted_at mapping
    // ============================================================

    it('M20: deleted_at maps to deleted boolean', function () {
        const DB = loadDbForTesting();
        const activeRow = { id: 'o1', legacy_id: 1, deleted_at: null };
        const activeOrder = DB.mapSupabaseRowToLegacyOrder(activeRow);
        assert.equal(activeOrder.deleted, false, 'deleted_at=null → deleted=false');

        const deletedRow = { id: 'o2', legacy_id: 2, deleted_at: '2026-07-25T00:00:00.000Z' };
        const deletedOrder = DB.mapSupabaseRowToLegacyOrder(deletedRow);
        assert.equal(deletedOrder.deleted, true, 'deleted_at=timestamp → deleted=true');
    });

    // ============================================================
    // M21: null edge cases
    // ============================================================

    it('M21: mapper handles null customer/product fields without throwing', function () {
        const DB = loadDbForTesting();
        const minimalRow = {
            id: 'order-uuid-1',
            legacy_id: 1,
            order_number: 'ORD-001',
            customer_id: null,
            legacy_customer_id: null,
            product_id: null,
            legacy_product_id: null,
            customer_name_snapshot: null,
            product_title_snapshot: null,
            brand_snapshot: null,
            category_snapshot: null,
            color_snapshot: null,
            size_snapshot: null
        };
        let order;
        assert.doesNotThrow(() => {
            order = DB.mapSupabaseRowToLegacyOrder(minimalRow);
        }, 'mapper should not throw on null snapshot fields');
        assert.ok(order, 'order object should be returned');
        // safeValue policy (consistent with products mapper):
        // - undefined → fallback (empty string for text fields)
        // - null → preserved as null (matches products mapSupabaseRowToLegacyProduct)
        assert.equal(order.customer_name, null, 'null customer_name_snapshot → null (preserved, products-consistent)');
        assert.equal(order.product_name, null, 'null product_title_snapshot → null (preserved)');
        assert.equal(order.brand, null, 'null brand_snapshot → null (preserved)');
        assert.equal(order.customer_id, null, 'null legacy_customer_id → null');
        assert.equal(order.product_id, null, 'null legacy_product_id → null');
        assert.equal(order.customer_uuid, null, 'null customer_id → null');
        assert.equal(order.product_uuid, null, 'null product_id → null');
    });

    // ============================================================
    // M22: numeric strings for money fields
    // ============================================================

    it('M22: mapper handles numeric strings for money fields consistently', function () {
        const DB = loadDbForTesting();
        const row = {
            id: 'o1',
            legacy_id: 1,
            quantity: '3',
            selling_price: '150000',
            actual_profit: '50000',
            actual_converted_cost_at_sale: '35000',
            china_cost_at_sale: '12000'
        };
        const order = DB.mapSupabaseRowToLegacyOrder(row);
        assert.equal(order.quantity, 3, 'quantity string → number');
        assert.equal(typeof order.quantity, 'number', 'quantity should be number');
        assert.equal(order.selling_price, 150000, 'selling_price string → number');
        assert.equal(typeof order.selling_price, 'number', 'selling_price should be number');
        assert.equal(order.actual_profit, 50000, 'actual_profit string → number');
        assert.equal(order.actual_cost, 35000, 'actual_cost string → number');
        assert.equal(order.china_cost, 12000, 'china_cost string → number');
    });

    // ============================================================
    // M23: no remote write RPCs in mapper
    // ============================================================

    it('M23: mapper does not call remote write RPCs', function () {
        const mapBody = DB_JS.match(/mapSupabaseRowToLegacyOrder\s*\([^)]*\)\s*\{([\s\S]*?)\n    \}/);
        assert.ok(mapBody, 'mapper body should exist');
        const body = mapBody[1];
        assert.doesNotMatch(body, /create_order/, 'no create_order in mapper');
        assert.doesNotMatch(body, /update_pending_order/, 'no update_pending_order in mapper');
        assert.doesNotMatch(body, /ship_order/, 'no ship_order in mapper');
        assert.doesNotMatch(body, /cancel_order/, 'no cancel_order in mapper');
        assert.doesNotMatch(body, /complete_order/, 'no complete_order in mapper');
    });

    // ============================================================
    // M24-M25: DB API compatibility
    // ============================================================

    it('M24: DB.getOrders remains sync/local', function () {
        const DB = loadDbForTesting();
        const orders = DB.getOrders();
        assert.ok(Array.isArray(orders), 'getOrders should return an array (sync)');
        // should return empty array by default (localStorage empty in test)
        assert.equal(orders.length, 0, 'getOrders should return empty array by default');
    });

    it('M25: DB.getOrdersAsync exists and uses active data source', function () {
        const DB = loadDbForTesting();
        assert.equal(typeof DB.getOrdersAsync, 'function',
            'getOrdersAsync should be a function');
        const result = DB.getOrdersAsync();
        assert.ok(result && typeof result.then === 'function',
            'getOrdersAsync should return a Promise');
    });

    // ============================================================
    // M26-M27: config flags default false
    // ============================================================

    it('M26: ORDERS_SUPABASE_ENABLED default remains false', function () {
        assert.match(CONFIG_EXAMPLE, /ORDERS_SUPABASE_ENABLED:\s*false/,
            'ORDERS_SUPABASE_ENABLED should default to false in config.example.js');
    });

    it('M27: ORDERS_SUPABASE_REMOTE_ENABLED default remains false', function () {
        assert.match(CONFIG_EXAMPLE, /ORDERS_SUPABASE_REMOTE_ENABLED:\s*false/,
            'ORDERS_SUPABASE_REMOTE_ENABLED should default to false in config.example.js');
    });

    // ============================================================
    // M28-M29: file scope safety
    // ============================================================

    it('M28: no migration changes', function () {
        const changed = execSync('git diff --name-only HEAD', { cwd: REPO_ROOT, encoding: 'utf-8' }).trim();
        const lines = changed ? changed.split('\n') : [];
        const migrationChanges = lines.filter(f => f.startsWith('supabase/migrations/'));
        assert.strictEqual(migrationChanges.length, 0,
            `No migration files should be changed. Found: ${migrationChanges.join(', ')}`);
    });

    it('M29: only allowed JS files changed (3-8A.9-A + 3-6E.6.3)', function () {
        const changed = execSync('git diff --name-only HEAD', { cwd: REPO_ROOT, encoding: 'utf-8' }).trim();
        const lines = changed ? changed.split('\n') : [];
        const allowedJs = new Set([
            'js/db.js', 'js/orders.js', 'js/app.js', // 3-8A.9-A
            'js/i18n.js', 'js/member-management.js' // 3-6E.6.3
        ]);
        const forbidden = lines.filter(f =>
            (f.startsWith('js/') && !allowedJs.has(f)) ||
            f.startsWith('css/') ||
            f === 'index.html' ||
            f.startsWith('supabase/migrations/')
        );
        assert.strictEqual(forbidden.length, 0,
            `Allowed JS: db.js, orders.js, app.js, i18n.js, member-management.js. Forbidden: ${forbidden.join(', ')}`);
    });

    // ============================================================
    // M30: no secrets
    // ============================================================

    it('M30: no actual secrets/token/key/service_role values in test files or db.js', function () {
        assert.doesNotMatch(DB_JS, /eyJ[A-Za-z0-9_-]{20,}/, 'no JWT-like tokens in db.js');
        assert.doesNotMatch(CONFIG_EXAMPLE, /eyJ[A-Za-z0-9_-]{20,}/, 'no JWT-like tokens in config.example.js');
        assert.doesNotMatch(DB_JS, /service_role\s*[:=]\s*['"][^'"]+['"]/,
            'no service_role assignment with value in db.js');
    });

    // ============================================================
    // Extra: full-row round-trip style comprehensive check
    // ============================================================

    describe('Comprehensive mapping invariants', function () {

        it('M-inv-1: full row mapping preserves all expected fields', function () {
            const DB = loadDbForTesting();
            const row = {
                id: 'order-uuid-abc123',
                legacy_id: 1001,
                store_id: 'store-uuid-xyz',
                order_number: 'ORD-2026-0001',
                customer_id: 'cust-uuid-001',
                product_id: 'prod-uuid-001',
                legacy_customer_id: 50,
                legacy_product_id: 200,
                customer_name_snapshot: '홍길동',
                product_title_snapshot: '프리미엄 코트',
                brand_snapshot: 'LESOUL',
                category_snapshot: '아우터',
                color_snapshot: '아이보리',
                size_snapshot: 'M',
                quantity: 2,
                selling_price: 280000,
                actual_profit: 120000,
                actual_profit_margin: 42.9,
                actual_cost_ratio: 57.1,
                actual_converted_cost_at_sale: 95000,
                china_cost_at_sale: 38000,
                status: 'SHIPPED',
                order_date: '2026-07-01T09:00:00.000Z',
                ship_date: '2026-07-02T10:00:00.000Z',
                shipping_company: 'CJ대한통운',
                tracking_number: '123456789012',
                notes: '선물 포장 요청',
                created_at: '2026-07-01T09:00:00.000Z',
                updated_at: '2026-07-02T10:00:00.000Z',
                deleted_at: null,
                version: 1
            };
            const order = DB.mapSupabaseRowToLegacyOrder(row);

            // id / legacy_id / remote_id
            assert.equal(order.id, 1001);
            assert.equal(order.legacy_id, 1001);
            assert.equal(order.remote_id, 'order-uuid-abc123');

            // order_number
            assert.equal(order.order_number, 'ORD-2026-0001');

            // customer mapping
            assert.equal(order.customer_id, 50);
            assert.equal(order.customer_uuid, 'cust-uuid-001');
            assert.equal(order.customer_name, '홍길동');

            // product mapping
            assert.equal(order.product_id, 200);
            assert.equal(order.product_uuid, 'prod-uuid-001');
            assert.equal(order.product_name, '프리미엄 코트');
            assert.equal(order.product_title, '프리미엄 코트');
            assert.equal(order.brand, 'LESOUL');
            assert.equal(order.category, '아우터');
            assert.equal(order.color, '아이보리');
            assert.equal(order.size, 'M');

            // quantity / price
            assert.equal(order.quantity, 2);
            assert.equal(order.selling_price, 280000);

            // profit / cost
            assert.equal(order.actual_profit, 120000);
            assert.equal(order.profit_margin, 42.9);
            assert.equal(order.actual_profit_margin, 42.9);
            assert.equal(order.cost_ratio, 57.1);
            assert.equal(order.actual_cost_ratio, 57.1);
            assert.equal(order.actual_cost, 95000);
            assert.equal(order.actual_converted_cost_at_sale, 95000);
            assert.equal(order.china_cost, 38000);
            assert.equal(order.china_cost_at_sale, 38000);

            // status / dates
            assert.equal(order.status, 'SHIPPED');
            assert.equal(order.order_date, '2026-07-01T09:00:00.000Z');
            assert.equal(order.ship_date, '2026-07-02T10:00:00.000Z');

            // shipping
            assert.equal(order.shipping_company, 'CJ대한통운');
            assert.equal(order.tracking_number, '123456789012');
            assert.equal(order.notes, '선물 포장 요청');

            // timestamps / soft delete
            assert.equal(order.created_at, '2026-07-01T09:00:00.000Z');
            assert.equal(order.updated_at, '2026-07-02T10:00:00.000Z');
            assert.equal(order.deleted, false);
        });

        it('M-inv-2: input row is not mutated (pure function)', function () {
            const DB = loadDbForTesting();
            const row = {
                id: 'o1',
                legacy_id: 1,
                order_number: 'ORD-001',
                quantity: 2,
                selling_price: 10000
            };
            const frozen = JSON.stringify(row);
            DB.mapSupabaseRowToLegacyOrder(row);
            assert.equal(JSON.stringify(row), frozen,
                'input row must not be mutated by mapper');
        });

        it('M-inv-3: default DataSource for orders is LocalOrdersDataSource', function () {
            const DB = loadDbForTesting();
            const ds = DB.getOrdersDataSource();
            assert.equal(ds.name, 'LocalOrdersDataSource',
                'default orders DataSource must be LocalOrdersDataSource');
            assert.doesNotMatch(ds.name, /Supabase/i,
                'default orders DataSource must NOT be Supabase');
        });
    });
});
