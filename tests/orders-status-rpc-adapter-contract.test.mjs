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

const UUID_ORDER = 'a1111111-1111-1111-1111-111111111111';
const UUID_CUSTOMER = 'b2222222-2222-2222-2222-222222222222';
const UUID_PRODUCT = 'c3333333-3333-3333-3333-333333333333';

const MOCK_ORDER_ROW = {
    id: UUID_ORDER,
    legacy_id: 1001,
    store_id: 'store-uuid-001',
    order_number: 'ORD-2026-0001',
    customer_id: UUID_CUSTOMER,
    product_id: UUID_PRODUCT,
    legacy_customer_id: 50,
    legacy_product_id: 200,
    customer_name_snapshot: '홍길동',
    product_title_snapshot: '프리미엄 코트',
    brand_snapshot: 'LESOUL',
    category_snapshot: '아우터',
    color_snapshot: 'beige',
    size_snapshot: 'M',
    quantity: 2,
    selling_price: 280000,
    actual_profit: 0,
    actual_profit_margin: 0,
    actual_cost_ratio: 0,
    actual_converted_cost_at_sale: 150000,
    china_cost_at_sale: 1000,
    status: 'PENDING',
    order_date: '2026-07-25',
    ship_date: null,
    shipping_company: null,
    tracking_number: null,
    notes: null,
    created_at: '2026-07-25T00:00:00Z',
    updated_at: '2026-07-25T00:00:00Z',
    deleted_at: null,
    version: 1
};

describe('Orders Status RPC Adapter Contract (S1-S26)', function () {

    // ============================================================
    // S1-S4: RPC call verification
    // ============================================================

    it('S1: updatePendingOrder calls client.rpc(\'update_pending_order\')', async function () {
        const { ds, calls } = createSupabaseOrdersDataSourceForTesting({
            rpcResponse: () => ({ data: MOCK_ORDER_ROW, error: null })
        });
        await ds.updatePendingOrder(UUID_ORDER, {
            customer_uuid: UUID_CUSTOMER,
            product_uuid: UUID_PRODUCT,
            quantity: 2,
            selling_price: 280000,
            order_date: '2026-07-25'
        });
        assert.equal(calls.rpc.length, 1);
        assert.equal(calls.rpc[0].name, 'update_pending_order');
    });

    it('S2: shipOrder calls client.rpc(\'ship_order\')', async function () {
        const { ds, calls } = createSupabaseOrdersDataSourceForTesting({
            rpcResponse: () => ({ data: MOCK_ORDER_ROW, error: null })
        });
        await ds.shipOrder(UUID_ORDER, { ship_date: '2026-07-26' });
        assert.equal(calls.rpc.length, 1);
        assert.equal(calls.rpc[0].name, 'ship_order');
    });

    it('S3: cancelOrder calls client.rpc(\'cancel_order\')', async function () {
        const { ds, calls } = createSupabaseOrdersDataSourceForTesting({
            rpcResponse: () => ({ data: MOCK_ORDER_ROW, error: null })
        });
        await ds.cancelOrder(UUID_ORDER);
        assert.equal(calls.rpc.length, 1);
        assert.equal(calls.rpc[0].name, 'cancel_order');
    });

    it('S4: completeOrder calls client.rpc(\'complete_order\')', async function () {
        const { ds, calls } = createSupabaseOrdersDataSourceForTesting({
            rpcResponse: () => ({ data: MOCK_ORDER_ROW, error: null })
        });
        await ds.completeOrder(UUID_ORDER);
        assert.equal(calls.rpc.length, 1);
        assert.equal(calls.rpc[0].name, 'complete_order');
    });

    // ============================================================
    // S5-S9: UUID validation
    // ============================================================

    it('S5: all four adapters validate remote uuid orderId', async function () {
        const { ds, calls } = createSupabaseOrdersDataSourceForTesting({
            rpcResponse: () => ({ data: MOCK_ORDER_ROW, error: null })
        });

        await ds.updatePendingOrder(UUID_ORDER, {
            customer_uuid: UUID_CUSTOMER,
            product_uuid: UUID_PRODUCT,
            quantity: 1,
            selling_price: 10000,
            order_date: '2026-07-25'
        });
        assert.strictEqual(calls.rpc[0].payload.p_order_id, UUID_ORDER);

        await ds.shipOrder(UUID_ORDER);
        assert.strictEqual(calls.rpc[1].payload.p_order_id, UUID_ORDER);

        await ds.cancelOrder(UUID_ORDER);
        assert.strictEqual(calls.rpc[2].payload.p_order_id, UUID_ORDER);

        await ds.completeOrder(UUID_ORDER);
        assert.strictEqual(calls.rpc[3].payload.p_order_id, UUID_ORDER);
    });

    it('S6: updatePendingOrder rejects legacy numeric orderId', function () {
        const { ds } = createSupabaseOrdersDataSourceForTesting();
        assert.throws(() => ds.updatePendingOrder(42, {
            customer_uuid: UUID_CUSTOMER,
            product_uuid: UUID_PRODUCT,
            quantity: 1,
            selling_price: 10000,
            order_date: '2026-07-25'
        }), /order remote uuid/i, 'updatePendingOrder should reject numeric orderId');
    });

    it('S7: shipOrder rejects legacy numeric orderId', function () {
        const { ds } = createSupabaseOrdersDataSourceForTesting();
        assert.throws(() => ds.shipOrder(42),
            /order remote uuid/i, 'shipOrder should reject numeric orderId');
    });

    it('S8: cancelOrder rejects legacy numeric orderId', function () {
        const { ds } = createSupabaseOrdersDataSourceForTesting();
        assert.throws(() => ds.cancelOrder(42),
            /order remote uuid/i, 'cancelOrder should reject numeric orderId');
    });

    it('S9: completeOrder rejects legacy numeric orderId', function () {
        const { ds } = createSupabaseOrdersDataSourceForTesting();
        assert.throws(() => ds.completeOrder(42),
            /order remote uuid/i, 'completeOrder should reject numeric orderId');
    });

    // ============================================================
    // S10-S12: updatePendingOrder payload validation
    // ============================================================

    it('S10: updatePendingOrder validates quantity positive integer', async function () {
        const { ds } = createSupabaseOrdersDataSourceForTesting();
        const basePayload = {
            customer_uuid: UUID_CUSTOMER,
            product_uuid: UUID_PRODUCT,
            selling_price: 10000,
            order_date: '2026-07-25'
        };

        await assert.rejects(() => ds.updatePendingOrder(UUID_ORDER, { ...basePayload, quantity: 0 }),
            /quantity/i, 'quantity 0 should be rejected');
        await assert.rejects(() => ds.updatePendingOrder(UUID_ORDER, { ...basePayload, quantity: -1 }),
            /quantity/i, 'negative quantity should be rejected');
        await assert.rejects(() => ds.updatePendingOrder(UUID_ORDER, { ...basePayload, quantity: 1.5 }),
            /quantity/i, 'non-integer quantity should be rejected');
        await assert.rejects(() => ds.updatePendingOrder(UUID_ORDER, { ...basePayload }),
            /quantity/i, 'missing quantity should be rejected');
    });

    it('S11: updatePendingOrder validates selling_price >= 0', async function () {
        const { ds } = createSupabaseOrdersDataSourceForTesting();
        const basePayload = {
            customer_uuid: UUID_CUSTOMER,
            product_uuid: UUID_PRODUCT,
            quantity: 1,
            order_date: '2026-07-25'
        };

        await assert.rejects(() => ds.updatePendingOrder(UUID_ORDER, { ...basePayload, selling_price: -1 }),
            /selling_price/i, 'negative selling_price should be rejected');
        await assert.rejects(() => ds.updatePendingOrder(UUID_ORDER, { ...basePayload, selling_price: 'abc' }),
            /selling_price/i, 'non-numeric selling_price should be rejected');
    });

    it('S12: updatePendingOrder maps customer/product uuid according to RPC signature', async function () {
        const { ds, calls } = createSupabaseOrdersDataSourceForTesting({
            rpcResponse: () => ({ data: MOCK_ORDER_ROW, error: null })
        });
        await ds.updatePendingOrder(UUID_ORDER, {
            customer_uuid: UUID_CUSTOMER,
            product_uuid: UUID_PRODUCT,
            quantity: 2,
            selling_price: 280000,
            order_date: '2026-07-25',
            color: 'black',
            size: 'L',
            notes: 'updated'
        });
        const p = calls.rpc[0].payload;
        assert.equal(p.p_order_id, UUID_ORDER);
        assert.equal(p.p_customer_id, UUID_CUSTOMER);
        assert.equal(p.p_product_id, UUID_PRODUCT);
        assert.equal(p.p_quantity, 2);
        assert.equal(p.p_selling_price, 280000);
        assert.equal(p.p_order_date, '2026-07-25');
        assert.equal(p.p_color, 'black');
        assert.equal(p.p_size, 'L');
        assert.equal(p.p_notes, 'updated');
    });

    // ============================================================
    // S13: shipOrder maps shipping fields
    // ============================================================

    it('S13: shipOrder maps shipping fields according to RPC signature', async function () {
        const { ds, calls } = createSupabaseOrdersDataSourceForTesting({
            rpcResponse: () => ({ data: MOCK_ORDER_ROW, error: null })
        });
        await ds.shipOrder(UUID_ORDER, {
            ship_date: '2026-07-26',
            shipping_company: 'CJ 대한통운',
            tracking_number: '1234567890'
        });
        const p = calls.rpc[0].payload;
        assert.equal(p.p_order_id, UUID_ORDER);
        assert.equal(p.p_ship_date, '2026-07-26');
        assert.equal(p.p_shipping_company, 'CJ 대한통운');
        assert.equal(p.p_tracking_number, '1234567890');
    });

    it('S13b: shipOrder with no payload uses default ship_date', async function () {
        const { ds, calls } = createSupabaseOrdersDataSourceForTesting({
            rpcResponse: () => ({ data: MOCK_ORDER_ROW, error: null })
        });
        await ds.shipOrder(UUID_ORDER);
        const p = calls.rpc[0].payload;
        assert.equal(p.p_order_id, UUID_ORDER);
        assert.equal(Object.keys(p).length, 1, 'shipOrder with no payload should only send p_order_id');
    });

    it('S13c: cancelOrder with notes payload', async function () {
        const { ds, calls } = createSupabaseOrdersDataSourceForTesting({
            rpcResponse: () => ({ data: MOCK_ORDER_ROW, error: null })
        });
        await ds.cancelOrder(UUID_ORDER, { notes: 'customer request' });
        const p = calls.rpc[0].payload;
        assert.equal(p.p_order_id, UUID_ORDER);
        assert.equal(p.p_notes, 'customer request');
    });

    it('S13d: cancelOrder without notes has no extra fields', async function () {
        const { ds, calls } = createSupabaseOrdersDataSourceForTesting({
            rpcResponse: () => ({ data: MOCK_ORDER_ROW, error: null })
        });
        await ds.cancelOrder(UUID_ORDER);
        const p = calls.rpc[0].payload;
        assert.equal(p.p_order_id, UUID_ORDER);
        assert.equal(Object.keys(p).length, 1, 'cancelOrder sans notes should only send p_order_id');
    });

    // ============================================================
    // S14: RPC adapters normalize response through mapper
    // ============================================================

    it('S14: all RPC adapters normalize response through mapSupabaseRowToLegacyOrder', async function () {
        const { ds } = createSupabaseOrdersDataSourceForTesting({
            rpcResponse: () => ({ data: MOCK_ORDER_ROW, error: null })
        });

        const result1 = await ds.updatePendingOrder(UUID_ORDER, {
            customer_uuid: UUID_CUSTOMER,
            product_uuid: UUID_PRODUCT,
            quantity: 2,
            selling_price: 280000,
            order_date: '2026-07-25'
        });
        assert.equal(result1.remote_id, UUID_ORDER);
        assert.equal(result1.id, 1001);
        assert.equal(result1.status, 'PENDING');

        const result2 = await ds.shipOrder(UUID_ORDER, { ship_date: '2026-07-26' });
        assert.equal(result2.remote_id, UUID_ORDER);

        const result3 = await ds.cancelOrder(UUID_ORDER);
        assert.equal(result3.remote_id, UUID_ORDER);

        const result4 = await ds.completeOrder(UUID_ORDER);
        assert.equal(result4.remote_id, UUID_ORDER);
    });

    // ============================================================
    // S15-S16: Error handling
    // ============================================================

    it('S15: all RPC adapters throw on RPC error', async function () {
        const rpcErr = { message: 'Insufficient stock', code: '22023' };

        const { ds: ds1 } = createSupabaseOrdersDataSourceForTesting({
            rpcResponse: () => ({ data: null, error: rpcErr })
        });
        await assert.rejects(() => ds1.updatePendingOrder(UUID_ORDER, {
            customer_uuid: UUID_CUSTOMER,
            product_uuid: UUID_PRODUCT,
            quantity: 1,
            selling_price: 10000,
            order_date: '2026-07-25'
        }), /RPC failed/i);

        const { ds: ds2 } = createSupabaseOrdersDataSourceForTesting({
            rpcResponse: () => ({ data: null, error: rpcErr })
        });
        await assert.rejects(() => ds2.shipOrder(UUID_ORDER),
            /RPC failed/i);

        const { ds: ds3 } = createSupabaseOrdersDataSourceForTesting({
            rpcResponse: () => ({ data: null, error: rpcErr })
        });
        await assert.rejects(() => ds3.cancelOrder(UUID_ORDER),
            /RPC failed/i);

        const { ds: ds4 } = createSupabaseOrdersDataSourceForTesting({
            rpcResponse: () => ({ data: null, error: rpcErr })
        });
        await assert.rejects(() => ds4.completeOrder(UUID_ORDER),
            /RPC failed/i);
    });

    it('S16: all RPC adapters throw on no data', async function () {
        const { ds: ds1 } = createSupabaseOrdersDataSourceForTesting({
            rpcResponse: () => ({ data: null, error: null })
        });
        await assert.rejects(() => ds1.updatePendingOrder(UUID_ORDER, {
            customer_uuid: UUID_CUSTOMER,
            product_uuid: UUID_PRODUCT,
            quantity: 1,
            selling_price: 10000,
            order_date: '2026-07-25'
        }), /no data/i);

        const { ds: ds2 } = createSupabaseOrdersDataSourceForTesting({
            rpcResponse: () => ({ data: null, error: null })
        });
        await assert.rejects(() => ds2.shipOrder(UUID_ORDER),
            /no data/i);

        const { ds: ds3 } = createSupabaseOrdersDataSourceForTesting({
            rpcResponse: () => ({ data: null, error: null })
        });
        await assert.rejects(() => ds3.cancelOrder(UUID_ORDER),
            /no data/i);

        const { ds: ds4 } = createSupabaseOrdersDataSourceForTesting({
            rpcResponse: () => ({ data: null, error: null })
        });
        await assert.rejects(() => ds4.completeOrder(UUID_ORDER),
            /no data/i);
    });

    // ============================================================
    // S17-S19: No direct table insert/update/delete
    // ============================================================

    it('S17: db.js SupabaseOrdersDataSource does not call from(\'orders\').insert/update/delete', function () {
        const supabaseSection = DB_JS.match(/_createControlledSupabaseOrdersDataSource\(client,\s*context\)\s*\{[\s\S]*?(?=\n    \},\n\n    \/\*\*)/);
        assert.ok(supabaseSection, 'SupabaseOrdersDataSource section should exist');
        assert.doesNotMatch(supabaseSection[0], /\.insert\(/, 'should not use insert');
        assert.doesNotMatch(supabaseSection[0], /\.update\(/, 'should not use update');
        assert.doesNotMatch(supabaseSection[0], /\.delete\(/, 'should not use delete');
    });

    it('S18: db.js does not call product stock update directly', function () {
        const supabaseSection = DB_JS.match(/_createControlledSupabaseOrdersDataSource\(client,\s*context\)\s*\{[\s\S]*?(?=\n    \},\n\n    \/\*\*)/);
        assert.ok(supabaseSection, 'SupabaseOrdersDataSource section should exist');
        assert.doesNotMatch(supabaseSection[0], /from\(\s*['"]products['"]\s*\)\s*\.\s*update/,
            'should not call from(\'products\').update');
    });

    it('S19: db.js does not insert into inventory_logs directly', function () {
        const supabaseSection = DB_JS.match(/_createControlledSupabaseOrdersDataSource\(client,\s*context\)\s*\{[\s\S]*?(?=\n    \},\n\n    \/\*\*)/);
        assert.ok(supabaseSection, 'SupabaseOrdersDataSource section should exist');
        assert.doesNotMatch(supabaseSection[0], /from\(\s*['"]inventory_logs['"]/,
            'should not call from(\'inventory_logs\')');
    });

    // ============================================================
    // S20: createOrder still works
    // ============================================================

    it('S20: createOrder adapter still calls create_order RPC', async function () {
        const { ds, calls } = createSupabaseOrdersDataSourceForTesting({
            rpcResponse: () => ({ data: MOCK_ORDER_ROW, error: null })
        });
        await ds.createOrder({
            customer_uuid: UUID_CUSTOMER,
            product_uuid: UUID_PRODUCT,
            quantity: 1,
            selling_price: 10000,
            order_date: '2026-07-25'
        });
        assert.equal(calls.rpc[0].name, 'create_order');
    });

    // ============================================================
    // S21: remaining disabled methods
    // ============================================================

    it('S21: setOrders/updateOrder/deleteOrder/findDuplicateOrder still disabled', function () {
        const { ds } = createSupabaseOrdersDataSourceForTesting();
        const disabledMethods = ['setOrders', 'updateOrder', 'deleteOrder', 'findDuplicateOrder'];
        for (const method of disabledMethods) {
            assert.throws(() => ds[method](),
                /not enabled yet/i,
                `${method} should throw "not enabled yet" message`);
        }
    });

    // ============================================================
    // S22-S26: compatibility & safety
    // ============================================================

    it('S22: ORDERS_SUPABASE_ENABLED default remains false', function () {
        assert.match(CONFIG_EXAMPLE, /ORDERS_SUPABASE_ENABLED:\s*false/,
            'ORDERS_SUPABASE_ENABLED should default to false');
        assert.match(CONFIG_EXAMPLE, /ORDERS_SUPABASE_REMOTE_ENABLED:\s*false/,
            'ORDERS_SUPABASE_REMOTE_ENABLED should default to false');
    });

    it('S23: no migration changes', function () {
        const changed = execSync('git diff --name-only HEAD', { cwd: REPO_ROOT, encoding: 'utf-8' }).trim();
        const lines = changed ? changed.split('\n') : [];
        const migrationChanges = lines.filter(f => f.startsWith('supabase/migrations/'));
        assert.strictEqual(migrationChanges.length, 0,
            `No migration files should be changed. Found: ${migrationChanges.join(', ')}`);
    });

    it('S24: no secrets/token/key/service_role actual values', function () {
        assert.doesNotMatch(DB_JS, /eyJ[A-Za-z0-9_-]{20,}/, 'no JWT-like tokens in db.js');
        assert.doesNotMatch(CONFIG_EXAMPLE, /eyJ[A-Za-z0-9_-]{20,}/, 'no JWT-like tokens in config.example.js');
        assert.doesNotMatch(DB_JS, /service_role\s*[:=]\s*['"][^'"]+['"]/,
            'no service_role assignment with value in db.js');
    });

    it('S25: local DB sync APIs unchanged', function () {
        const DB = loadDbForTesting();
        assert.equal(typeof DB.getOrders, 'function');
        assert.equal(typeof DB.setOrders, 'function');
        assert.equal(typeof DB.addOrder, 'function');
        assert.equal(typeof DB.updateOrder, 'function');
        assert.equal(typeof DB.deleteOrder, 'function');
        assert.equal(typeof DB.findDuplicateOrder, 'function');
        const orders = DB.getOrders();
        assert.ok(Array.isArray(orders), 'getOrders should still return array (sync)');
    });

    it('S26: tests use mock clients only, no real URLs/credentials/network', function () {
        // Verify no real URLs in test file
        const testSource = readFile('tests/orders-status-rpc-adapter-contract.test.mjs');
        assert.doesNotMatch(testSource, /https:\/\/[a-z]+\.supabase\.co/,
            'no real supabase URLs in test file');
        assert.doesNotMatch(testSource, /['"]service_role['"]/,
            'no service_role string literals in test file');
        assert.doesNotMatch(testSource, /eyJ[A-Za-z0-9_-]{20,}/,
            'no JWT tokens in test file');
    });

    // ============================================================
    // File scope safety
    // ============================================================

    it('S27: only allowed JS files changed', function () {
        const changed = execSync('git diff --name-only HEAD', { cwd: REPO_ROOT, encoding: 'utf-8' }).trim();
        const lines = changed ? changed.split('\n') : [];
        const allowedJs = new Set(['js/db.js']);
        const forbidden = lines.filter(f =>
            (f.startsWith('js/') && !allowedJs.has(f)) ||
            f.startsWith('css/') ||
            f === 'index.html' ||
            f.startsWith('supabase/migrations/')
        );
        assert.strictEqual(forbidden.length, 0,
            `Only js/db.js may change in 3-8A.6. Forbidden: ${forbidden.join(', ')}`);
    });

    // ============================================================
    // Extra: updatePendingOrder with valid payload
    // ============================================================

    describe('updatePendingOrder RPC payload mapping', function () {

        it('S-extra-1: updatePendingOrder rejects null/undefined payload', async function () {
            const { ds } = createSupabaseOrdersDataSourceForTesting();
            await assert.rejects(() => ds.updatePendingOrder(UUID_ORDER, null),
                /payload/i, 'null payload should be rejected');
            await assert.rejects(() => ds.updatePendingOrder(UUID_ORDER, undefined),
                /payload/i, 'undefined payload should be rejected');
        });

        it('S-extra-2: updatePendingOrder accepts Date object for order_date', async function () {
            const { ds, calls } = createSupabaseOrdersDataSourceForTesting({
                rpcResponse: () => ({ data: MOCK_ORDER_ROW, error: null })
            });
            const date = new Date('2026-07-25T10:00:00.000Z');
            await ds.updatePendingOrder(UUID_ORDER, {
                customer_uuid: UUID_CUSTOMER,
                product_uuid: UUID_PRODUCT,
                quantity: 1,
                selling_price: 50000,
                order_date: date
            });
            assert.match(calls.rpc[0].payload.p_order_date, /^\d{4}-\d{2}-\d{2}$/,
                'order_date should be YYYY-MM-DD format');
        });

        it('S-extra-3: updatePendingOrder rejects legacy numeric customer_id', async function () {
            const { ds } = createSupabaseOrdersDataSourceForTesting();
            await assert.rejects(() => ds.updatePendingOrder(UUID_ORDER, {
                customer_id: 42,
                product_uuid: UUID_PRODUCT,
                quantity: 1,
                selling_price: 10000,
                order_date: '2026-07-25'
            }), /customer_uuid/i, 'should reject numeric customer_id');
        });

        it('S-extra-4: updatePendingOrder rejects legacy numeric product_id', async function () {
            const { ds } = createSupabaseOrdersDataSourceForTesting();
            await assert.rejects(() => ds.updatePendingOrder(UUID_ORDER, {
                customer_uuid: UUID_CUSTOMER,
                product_id: 99,
                quantity: 1,
                selling_price: 10000,
                order_date: '2026-07-25'
            }), /product_uuid/i, 'should reject numeric product_id');
        });

        it('S-extra-5: shipOrder accepts Date object for ship_date', async function () {
            const { ds, calls } = createSupabaseOrdersDataSourceForTesting({
                rpcResponse: () => ({ data: MOCK_ORDER_ROW, error: null })
            });
            const date = new Date('2026-07-26T10:00:00.000Z');
            await ds.shipOrder(UUID_ORDER, { ship_date: date });
            assert.match(calls.rpc[0].payload.p_ship_date, /^\d{4}-\d{2}-\d{2}$/,
                'ship_date should be YYYY-MM-DD format');
        });

        it('S-extra-6: completeOrder with valid uuid calls RPC exactly once', async function () {
            const { ds, calls } = createSupabaseOrdersDataSourceForTesting({
                rpcResponse: () => ({ data: MOCK_ORDER_ROW, error: null })
            });
            await ds.completeOrder(UUID_ORDER);
            assert.equal(calls.rpc.length, 1);
            assert.deepEqual(calls.rpc[0].payload, { p_order_id: UUID_ORDER });
        });
    });
});