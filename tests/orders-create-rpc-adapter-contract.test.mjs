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
 * - 네트워크 호출 금지 (mock client로 대체)
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

/**
 * Mock Supabase client for createOrder tests.
 * - rpc(name, payload) returns Promise-like with { data, error }
 * - from() returns a chainable mock (forbidden in createOrder, but available)
 * - supabaseUrl is localhost
 */
function createMockClient(options = {}) {
    const calls = { rpc: [], from: [] };
    const mockClient = {
        supabaseUrl: options.url || 'http://127.0.0.1:54321',
        rpc(name, payload) {
            calls.rpc.push({ name, payload });
            const response = options.rpcResponse
                ? options.rpcResponse(name, payload)
                : { data: null, error: null };
            return Promise.resolve(response);
        },
        from(table) {
            calls.from.push(table);
            // Return a chainable mock that should never be used by createOrder
            const chain = {
                select() { return chain; },
                insert() { return chain; },
                update() { return chain; },
                delete() { return chain; },
                eq() { return chain; },
                then(resolve) { resolve({ data: [], error: null }); return Promise.resolve({ data: [], error: null }); }
            };
            return chain;
        }
    };
    return { client: mockClient, calls };
}

/**
 * Create a SupabaseOrdersDataSource via factory for testing.
 * Bypasses runtime feature flag gate (which requires window/global context).
 */
function createSupabaseOrdersDataSourceForTesting(options = {}) {
    const DB = loadDbForTesting();
    const { client, calls } = createMockClient(options);
    const context = {
        localOnly: options.localOnly !== false,
        remoteEnabled: options.remoteEnabled === true,
        storeId: options.storeId || 'store-uuid-001',
        url: options.url || 'http://127.0.0.1:54321'
    };
    const ds = DB._createControlledSupabaseOrdersDataSource(client, context);
    return { ds, client, calls, context, DB };
}

describe('Orders createOrder RPC Adapter Contract (C1-C20)', function () {

    // ============================================================
    // C1-C5: createOrder implementation structure
    // ============================================================

    it('C1: SupabaseOrdersDataSource.createOrder no longer throws generic "write not enabled" message', function () {
        const supabaseSection = DB_JS.match(/_createControlledSupabaseOrdersDataSource\(client,\s*context\)\s*\{[\s\S]*?\n    \},\n\n    \/\*\*/);
        assert.ok(supabaseSection, 'SupabaseOrdersDataSource section should exist');
        // createOrder should be a real implementation, not a throw
        const createOrderMatch = supabaseSection[0].match(/createOrder\(payload\)\s*\{[\s\S]*?\n            \},/);
        assert.ok(createOrderMatch, 'createOrder method should exist');
        // Should NOT contain the generic throw
        assert.doesNotMatch(createOrderMatch[0], /throw new Error\(_writeDisabledMsg\)/,
            'createOrder should not throw generic write disabled message');
    });

    it('C2: createOrder calls client.rpc(\'create_order\', ...)', function () {
        const createOrderSection = DB_JS.match(/createOrder\(payload\)\s*\{[\s\S]*?\n            \},/);
        assert.ok(createOrderSection, 'createOrder section should exist');
        assert.match(createOrderSection[0], /client\.rpc\(\s*['"]create_order['"]/,
            'createOrder must call client.rpc(\'create_order\', ...)');
    });

    it('C3: createOrder does not call from(\'orders\').insert', function () {
        const createOrderSection = DB_JS.match(/createOrder\(payload\)\s*\{[\s\S]*?\n            \},/);
        assert.ok(createOrderSection, 'createOrder section should exist');
        assert.doesNotMatch(createOrderSection[0], /from\(\s*['"]orders['"]\s*\)\s*\.\s*insert/,
            'createOrder must not call from(\'orders\').insert');
    });

    it('C4: createOrder does not call product update directly', function () {
        const createOrderSection = DB_JS.match(/createOrder\(payload\)\s*\{[\s\S]*?\n            \},/);
        assert.ok(createOrderSection, 'createOrder section should exist');
        assert.doesNotMatch(createOrderSection[0], /from\(\s*['"]products['"]/,
            'createOrder must not call from(\'products\')');
        assert.doesNotMatch(createOrderSection[0], /\.update\(\s*\{[\s\S]*?reserved_stock/,
            'createOrder must not directly update product stock');
    });

    it('C5: createOrder does not insert into inventory_logs directly', function () {
        const createOrderSection = DB_JS.match(/createOrder\(payload\)\s*\{[\s\S]*?\n            \},/);
        assert.ok(createOrderSection, 'createOrder section should exist');
        assert.doesNotMatch(createOrderSection[0], /from\(\s*['"]inventory_logs['"]/,
            'createOrder must not call from(\'inventory_logs\')');
    });

    // ============================================================
    // C6-C9: payload validation — store_id, customer/product uuid
    // ============================================================

    it('C6: createOrder uses context storeId, not untrusted payload store_id', async function () {
        const { ds, calls } = createSupabaseOrdersDataSourceForTesting({
            rpcResponse: () => ({
                data: {
                    id: 'order-uuid-001',
                    legacy_id: null,
                    store_id: 'store-uuid-001',
                    order_number: 'ORD-001',
                    customer_id: 'a1111111-1111-1111-1111-111111111111',
                    product_id: 'b2222222-2222-2222-2222-222222222222',
                    status: 'PENDING'
                },
                error: null
            })
        });
        const payload = {
            customer_uuid: 'a1111111-1111-1111-1111-111111111111',
            product_uuid: 'b2222222-2222-2222-2222-222222222222',
            quantity: 1,
            selling_price: 10000,
            order_date: '2026-07-25',
            // Untrusted store_id — must be ignored
            store_id: 'untrusted-store-uuid-999'
        };
        await ds.createOrder(payload);
        assert.ok(calls.rpc.length > 0, 'rpc should be called');
        const rpcCall = calls.rpc[0];
        assert.equal(rpcCall.name, 'create_order', 'should call create_order RPC');
        assert.equal(rpcCall.payload.p_store_id, 'store-uuid-001',
            'p_store_id must use context.storeId, not payload.store_id');
        assert.notEqual(rpcCall.payload.p_store_id, 'untrusted-store-uuid-999',
            'untrusted payload.store_id must be ignored');
    });

    it('C7: createOrder maps customer uuid from payload.customer_uuid', async function () {
        const { ds, calls } = createSupabaseOrdersDataSourceForTesting({
            rpcResponse: () => ({
                data: { id: 'o1', legacy_id: 1, order_number: 'ORD-1', status: 'PENDING' },
                error: null
            })
        });
        const payload = {
            customer_uuid: 'a1111111-1111-1111-1111-111111111111',
            product_uuid: 'b2222222-2222-2222-2222-222222222222',
            quantity: 2,
            selling_price: 50000,
            order_date: '2026-07-25'
        };
        await ds.createOrder(payload);
        assert.equal(calls.rpc[0].payload.p_customer_id, 'a1111111-1111-1111-1111-111111111111');
        assert.equal(calls.rpc[0].payload.p_product_id, 'b2222222-2222-2222-2222-222222222222');
    });

    it('C8: createOrder maps product uuid from payload.product_uuid', async function () {
        const { ds, calls } = createSupabaseOrdersDataSourceForTesting({
            rpcResponse: () => ({
                data: { id: 'o1', legacy_id: 1, order_number: 'ORD-1', status: 'PENDING' },
                error: null
            })
        });
        const payload = {
            customer_uuid: 'a1111111-1111-1111-1111-111111111111',
            product_uuid: 'c3333333-3333-3333-3333-333333333333',
            quantity: 1,
            selling_price: 30000,
            order_date: '2026-07-25'
        };
        await ds.createOrder(payload);
        assert.equal(calls.rpc[0].payload.p_product_id, 'c3333333-3333-3333-3333-333333333333');
    });

    it('C9: createOrder rejects legacy numeric customer/product ids without uuid', async function () {
        const { ds } = createSupabaseOrdersDataSourceForTesting({
            rpcResponse: () => ({ data: { id: 'o1' }, error: null })
        });
        // Legacy numeric customer_id only — no uuid
        const payload1 = {
            customer_id: 42,
            product_uuid: 'b2222222-2222-2222-2222-222222222222',
            quantity: 1,
            selling_price: 10000,
            order_date: '2026-07-25'
        };
        await assert.rejects(() => ds.createOrder(payload1),
            /customer_uuid/i,
            'createOrder should reject legacy numeric customer_id without uuid');

        // Legacy numeric product_id only — no uuid
        const payload2 = {
            customer_uuid: 'a1111111-1111-1111-1111-111111111111',
            product_id: 99,
            quantity: 1,
            selling_price: 10000,
            order_date: '2026-07-25'
        };
        await assert.rejects(() => ds.createOrder(payload2),
            /product_uuid/i,
            'createOrder should reject legacy numeric product_id without uuid');
    });

    // ============================================================
    // C10-C12: numeric validation
    // ============================================================

    it('C10: createOrder validates quantity is positive integer', async function () {
        const { ds } = createSupabaseOrdersDataSourceForTesting({
            rpcResponse: () => ({ data: { id: 'o1' }, error: null })
        });
        const basePayload = {
            customer_uuid: 'a1111111-1111-1111-1111-111111111111',
            product_uuid: 'b2222222-2222-2222-2222-222222222222',
            selling_price: 10000,
            order_date: '2026-07-25'
        };

        // quantity = 0
        await assert.rejects(() => ds.createOrder({ ...basePayload, quantity: 0 }),
            /quantity/i, 'quantity 0 should be rejected');

        // quantity = -1
        await assert.rejects(() => ds.createOrder({ ...basePayload, quantity: -1 }),
            /quantity/i, 'negative quantity should be rejected');

        // quantity = 1.5 (not integer)
        await assert.rejects(() => ds.createOrder({ ...basePayload, quantity: 1.5 }),
            /quantity/i, 'non-integer quantity should be rejected');

        // quantity missing
        await assert.rejects(() => ds.createOrder({ ...basePayload }),
            /quantity/i, 'missing quantity should be rejected');
    });

    it('C11: createOrder validates selling_price >= 0', async function () {
        const { ds } = createSupabaseOrdersDataSourceForTesting({
            rpcResponse: () => ({ data: { id: 'o1' }, error: null })
        });
        const basePayload = {
            customer_uuid: 'a1111111-1111-1111-1111-111111111111',
            product_uuid: 'b2222222-2222-2222-2222-222222222222',
            quantity: 1,
            order_date: '2026-07-25'
        };

        // selling_price = -1
        await assert.rejects(() => ds.createOrder({ ...basePayload, selling_price: -1 }),
            /selling_price/i, 'negative selling_price should be rejected');

        // selling_price = NaN
        await assert.rejects(() => ds.createOrder({ ...basePayload, selling_price: 'abc' }),
            /selling_price/i, 'non-numeric selling_price should be rejected');
    });

    it('C12: createOrder validates order_date is provided', async function () {
        const { ds } = createSupabaseOrdersDataSourceForTesting({
            rpcResponse: () => ({ data: { id: 'o1' }, error: null })
        });
        const basePayload = {
            customer_uuid: 'a1111111-1111-1111-1111-111111111111',
            product_uuid: 'b2222222-2222-2222-2222-222222222222',
            quantity: 1,
            selling_price: 10000
        };

        // order_date missing
        await assert.rejects(() => ds.createOrder({ ...basePayload }),
            /order_date/i, 'missing order_date should be rejected');

        // order_date = null
        await assert.rejects(() => ds.createOrder({ ...basePayload, order_date: null }),
            /order_date/i, 'null order_date should be rejected');
    });

    // ============================================================
    // C13-C14: result normalization and error handling
    // ============================================================

    it('C13: createOrder normalizes RPC result with mapSupabaseRowToLegacyOrder', async function () {
        const mockRow = {
            id: 'order-uuid-001',
            legacy_id: 1001,
            store_id: 'store-uuid-001',
            order_number: 'ORD-2026-0001',
            customer_id: 'a1111111-1111-1111-1111-111111111111',
            product_id: 'b2222222-2222-2222-2222-222222222222',
            legacy_customer_id: 50,
            legacy_product_id: 200,
            customer_name_snapshot: '홍길동',
            product_title_snapshot: '프리미엄 코트',
            brand_snapshot: 'LESOUL',
            quantity: 2,
            selling_price: 280000,
            status: 'PENDING',
            order_date: '2026-07-25',
            deleted_at: null
        };
        const { ds } = createSupabaseOrdersDataSourceForTesting({
            rpcResponse: () => ({ data: mockRow, error: null })
        });
        const result = await ds.createOrder({
            customer_uuid: 'a1111111-1111-1111-1111-111111111111',
            product_uuid: 'b2222222-2222-2222-2222-222222222222',
            quantity: 2,
            selling_price: 280000,
            order_date: '2026-07-25'
        });
        // Result should be normalized by mapSupabaseRowToLegacyOrder
        assert.equal(result.remote_id, 'order-uuid-001', 'remote_id should be mapped');
        assert.equal(result.id, 1001, 'legacy_id should map to id');
        assert.equal(result.order_number, 'ORD-2026-0001');
        assert.equal(result.customer_name, '홍길동');
        assert.equal(result.product_name, '프리미엄 코트');
        assert.equal(result.brand, 'LESOUL');
        assert.equal(result.status, 'PENDING');
        assert.equal(result.deleted, false);
    });

    it('C14: createOrder throws on RPC error', async function () {
        const { ds } = createSupabaseOrdersDataSourceForTesting({
            rpcResponse: () => ({
                data: null,
                error: { message: 'Insufficient available stock', code: '22023' }
            })
        });
        await assert.rejects(() => ds.createOrder({
            customer_uuid: 'a1111111-1111-1111-1111-111111111111',
            product_uuid: 'b2222222-2222-2222-2222-222222222222',
            quantity: 1,
            selling_price: 10000,
            order_date: '2026-07-25'
        }), /createOrder RPC failed/i, 'createOrder should reject on RPC error');
    });

    it('C14b: createOrder throws when RPC returns no data', async function () {
        const { ds } = createSupabaseOrdersDataSourceForTesting({
            rpcResponse: () => ({ data: null, error: null })
        });
        await assert.rejects(() => ds.createOrder({
            customer_uuid: 'a1111111-1111-1111-1111-111111111111',
            product_uuid: 'b2222222-2222-2222-2222-222222222222',
            quantity: 1,
            selling_price: 10000,
            order_date: '2026-07-25'
        }), /no data/i, 'createOrder should reject when RPC returns no data');
    });

    // ============================================================
    // C15-C16: remaining disabled methods & forbidden RPCs
    // ============================================================

    it('C15: setOrders/updateOrder/deleteOrder/findDuplicateOrder still disabled (3-8A.6)', function () {
        const { ds } = createSupabaseOrdersDataSourceForTesting();
        const disabledMethods = ['setOrders', 'updateOrder', 'deleteOrder', 'findDuplicateOrder'];
        for (const method of disabledMethods) {
            assert.throws(() => ds[method](),
                /not enabled yet/i,
                `${method} should throw "not enabled yet" message`);
        }
    });

    it('C16: db.js calls status RPCs (3-8A.6) but not forbidden write RPCs', function () {
        // 3-8A.6: status RPCs are now allowed (via _callOrderRpcAndMap)
        assert.match(DB_JS, /['"]create_order['"]/,
            'should reference create_order RPC');
        assert.match(DB_JS, /['"]update_pending_order['"]/,
            'should reference update_pending_order RPC');
        assert.match(DB_JS, /['"]ship_order['"]/,
            'should reference ship_order RPC');
        assert.match(DB_JS, /['"]cancel_order['"]/,
            'should reference cancel_order RPC');
        assert.match(DB_JS, /['"]complete_order['"]/,
            'should reference complete_order RPC');
        // Other write RPCs still forbidden
        assert.doesNotMatch(DB_JS, /['"]delete_order['"]/,
            'should not reference delete_order RPC');
    });

    // ============================================================
    // C17-C20: compatibility & safety
    // ============================================================

    it('C17: local DB sync APIs unchanged', function () {
        const DB = loadDbForTesting();
        // Sync APIs should still exist and work
        assert.equal(typeof DB.getOrders, 'function');
        assert.equal(typeof DB.setOrders, 'function');
        assert.equal(typeof DB.addOrder, 'function');
        assert.equal(typeof DB.updateOrder, 'function');
        assert.equal(typeof DB.deleteOrder, 'function');
        assert.equal(typeof DB.findDuplicateOrder, 'function');
        // getOrders should return array (sync)
        const orders = DB.getOrders();
        assert.ok(Array.isArray(orders), 'getOrders should still return array (sync)');
    });

    it('C18: ORDERS_SUPABASE_ENABLED default remains false', function () {
        assert.match(CONFIG_EXAMPLE, /ORDERS_SUPABASE_ENABLED:\s*false/,
            'ORDERS_SUPABASE_ENABLED should default to false');
        assert.match(CONFIG_EXAMPLE, /ORDERS_SUPABASE_REMOTE_ENABLED:\s*false/,
            'ORDERS_SUPABASE_REMOTE_ENABLED should default to false');
    });

    it('C19: no migration changes', function () {
        const changed = execSync('git diff --name-only HEAD', { cwd: REPO_ROOT, encoding: 'utf-8' }).trim();
        const lines = changed ? changed.split('\n') : [];
        const migrationChanges = lines.filter(f => f.startsWith('supabase/migrations/'));
        assert.strictEqual(migrationChanges.length, 0,
            `No migration files should be changed. Found: ${migrationChanges.join(', ')}`);
    });

    it('C20: no secrets/token/key/service_role actual values', function () {
        assert.doesNotMatch(DB_JS, /eyJ[A-Za-z0-9_-]{20,}/, 'no JWT-like tokens in db.js');
        assert.doesNotMatch(CONFIG_EXAMPLE, /eyJ[A-Za-z0-9_-]{20,}/, 'no JWT-like tokens in config.example.js');
        assert.doesNotMatch(DB_JS, /service_role\s*[:=]\s*['"][^'"]+['"]/,
            'no service_role assignment with value in db.js');
    });

    // ============================================================
    // File scope safety
    // ============================================================

    it('C21: only allowed JS files changed (3-8A.9-A + 3-6E.6.3)', function () {
        const changed = execSync('git diff --name-only HEAD', { cwd: REPO_ROOT, encoding: 'utf-8' }).trim();
        const lines = changed ? changed.split('\n') : [];
        const allowedJs = new Set([
            'js/db.js', 'js/orders.js', 'js/app.js', // 3-8A.9-A
            'js/i18n.js', 'js/member-management.js', // 3-6E.6.3
            'js/products.js' // BLOCKER-FIX-3
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
    // Extra: createOrder with valid payload calls RPC exactly once
    // ============================================================

    describe('createOrder RPC payload mapping', function () {

        it('C-extra-1: valid payload calls create_order RPC exactly once', async function () {
            const { ds, calls } = createSupabaseOrdersDataSourceForTesting({
                rpcResponse: () => ({ data: { id: 'o1', legacy_id: 1, status: 'PENDING' }, error: null })
            });
            await ds.createOrder({
                customer_uuid: 'a1111111-1111-1111-1111-111111111111',
                product_uuid: 'b2222222-2222-2222-2222-222222222222',
                quantity: 3,
                selling_price: 150000,
                order_date: '2026-07-25',
                color: 'beige',
                size: 'M',
                notes: 'gift wrap'
            });
            assert.equal(calls.rpc.length, 1, 'rpc should be called exactly once');
            assert.equal(calls.rpc[0].name, 'create_order');
        });

        it('C-extra-2: optional fields are passed through to RPC payload', async function () {
            const { ds, calls } = createSupabaseOrdersDataSourceForTesting({
                rpcResponse: () => ({ data: { id: 'o1', legacy_id: 1, status: 'PENDING' }, error: null })
            });
            await ds.createOrder({
                customer_uuid: 'a1111111-1111-1111-1111-111111111111',
                product_uuid: 'b2222222-2222-2222-2222-222222222222',
                quantity: 1,
                selling_price: 50000,
                order_date: '2026-07-25',
                color: 'black',
                size: 'FREE',
                notes: 'rush order'
            });
            const p = calls.rpc[0].payload;
            assert.equal(p.p_color, 'black');
            assert.equal(p.p_size, 'FREE');
            assert.equal(p.p_notes, 'rush order');
        });

        it('C-extra-3: null optional fields become null in RPC payload', async function () {
            const { ds, calls } = createSupabaseOrdersDataSourceForTesting({
                rpcResponse: () => ({ data: { id: 'o1', legacy_id: 1, status: 'PENDING' }, error: null })
            });
            await ds.createOrder({
                customer_uuid: 'a1111111-1111-1111-1111-111111111111',
                product_uuid: 'b2222222-2222-2222-2222-222222222222',
                quantity: 1,
                selling_price: 50000,
                order_date: '2026-07-25'
                // no color, size, notes
            });
            const p = calls.rpc[0].payload;
            assert.equal(p.p_color, null);
            assert.equal(p.p_size, null);
            assert.equal(p.p_notes, null);
        });

        it('C-extra-4: createOrder rejects null/undefined payload', async function () {
            const { ds } = createSupabaseOrdersDataSourceForTesting();
            await assert.rejects(() => ds.createOrder(null),
                /payload/i, 'null payload should be rejected');
            await assert.rejects(() => ds.createOrder(undefined),
                /payload/i, 'undefined payload should be rejected');
            await assert.rejects(() => ds.createOrder('not-an-object'),
                /payload/i, 'non-object payload should be rejected');
        });

        it('C-extra-5: createOrder accepts Date object for order_date', async function () {
            const { ds, calls } = createSupabaseOrdersDataSourceForTesting({
                rpcResponse: () => ({ data: { id: 'o1', legacy_id: 1, status: 'PENDING' }, error: null })
            });
            const date = new Date('2026-07-25T10:00:00.000Z');
            await ds.createOrder({
                customer_uuid: 'a1111111-1111-1111-1111-111111111111',
                product_uuid: 'b2222222-2222-2222-2222-222222222222',
                quantity: 1,
                selling_price: 50000,
                order_date: date
            });
            // Should be converted to YYYY-MM-DD
            assert.match(calls.rpc[0].payload.p_order_date, /^\d{4}-\d{2}-\d{2}$/,
                'order_date should be YYYY-MM-DD format');
        });

        it('C-extra-6: default DataSource is still LocalOrdersDataSource (local mode unchanged)', function () {
            const DB = loadDbForTesting();
            const ds = DB.getOrdersDataSource();
            assert.equal(ds.name, 'LocalOrdersDataSource',
                'default DataSource must remain LocalOrdersDataSource');
        });
    });
});
