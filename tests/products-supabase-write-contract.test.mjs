import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

function setupMockLocalStorage() {
    const store = {};
    global.localStorage = {
        getItem(key) { return store[key] != null ? store[key] : null; },
        setItem(key, value) { store[key] = String(value); },
        removeItem(key) { delete store[key]; },
        clear() { for (const k of Object.keys(store)) delete store[k]; }
    };
}

setupMockLocalStorage();

function loadDbForTesting() {
    const source = readFileSync(join(__dirname, '..', 'js', 'db.js'), 'utf-8');
    const LESOUL_CONFIG = {};
    const code = source + '\n; return DB;';
    const factory = new Function('LESOUL_CONFIG', code);
    return factory(LESOUL_CONFIG);
}

function createMockClient({ supabaseUrl = 'http://127.0.0.1:54321', mockData = null, mockError = null } = {}) {
    let capturedTable = null;
    let capturedMethod = null;
    let eqCalls = [];
    let updateData = null;
    let insertData = null;
    let usedDelete = false;

    function buildEqChain(finalAction) {
        const chainable = {
            eq(col, val) {
                eqCalls.push([col, val]);
                return chainable;
            }
        };
        if (finalAction === 'select-single') {
            chainable.select = function () {
                return {
                    single() {
                        return {
                            then(resolve) {
                                return Promise.resolve().then(() => resolve({
                                    data: mockData,
                                    error: mockError
                                }));
                            }
                        };
                    }
                };
            };
        }
        if (finalAction === 'then-only') {
            chainable.then = function (resolve) {
                return Promise.resolve().then(() => resolve({
                    data: mockData,
                    error: mockError
                }));
            };
        }
        return chainable;
    }

    const client = {
        supabaseUrl,
        from(table) {
            capturedTable = table;
            return {
                select() {
                    capturedMethod = 'select';
                    return buildEqChain('then-only');
                },
                insert(row) {
                    capturedMethod = 'insert';
                    insertData = row;
                    return {
                        select() {
                            return {
                                single() {
                                    return {
                                        then(resolve) {
                                            return Promise.resolve().then(() => resolve({
                                                data: mockData,
                                                error: mockError
                                            }));
                                        }
                                    };
                                }
                            };
                        }
                    };
                },
                update(patch) {
                    capturedMethod = 'update';
                    updateData = patch;
                    return buildEqChain('select-single');
                },
                delete() {
                    usedDelete = true;
                    capturedMethod = 'delete';
                    return buildEqChain('then-only');
                }
            };
        },
        _captured: {
            get table() { return capturedTable; },
            get method() { return capturedMethod; },
            get eqCalls() { return eqCalls; },
            get updateData() { return updateData; },
            get insertData() { return insertData; },
            get usedDelete() { return usedDelete; }
        }
    };

    return client;
}

describe('Products Supabase Write Contract (W1-W21)', function () {

    it('W1: controlled SupabaseProductsDataSource has write methods (create/update/delete)', function () {
        const DB = loadDbForTesting();
        const ds = DB._createControlledSupabaseProductsDataSource(
            createMockClient(),
            { localOnly: true, storeId: 'test-store' }
        );
        assert.equal(typeof ds.createProduct, 'function', 'createProduct should exist');
        assert.equal(typeof ds.updateProduct, 'function', 'updateProduct should exist');
        assert.equal(typeof ds.deleteProduct, 'function', 'deleteProduct should exist');
        assert.equal(ds.name, 'SupabaseProductsDataSource');
    });

    it('W2: createProduct requires client/localOnly/storeId/localhost URL', function () {
        const DB = loadDbForTesting();
        const sampleProduct = { original_title: 'Test', brand: 'BRAND', korea_cost: 10000 };

        const dsNoClient = DB._createControlledSupabaseProductsDataSource(
            null,
            { localOnly: true, storeId: 'test-store' }
        );
        assert.throws(() => dsNoClient.createProduct(sampleProduct), /requires explicit client/i);

        const dsNoLocal = DB._createControlledSupabaseProductsDataSource(
            createMockClient(),
            { storeId: 'test-store' }
        );
        assert.throws(() => dsNoLocal.createProduct(sampleProduct), /requires localOnly/i);

        const dsNoStore = DB._createControlledSupabaseProductsDataSource(
            createMockClient(),
            { localOnly: true }
        );
        assert.throws(() => dsNoStore.createProduct(sampleProduct), /requires storeId/i);

        const dsRemote = DB._createControlledSupabaseProductsDataSource(
            createMockClient({ supabaseUrl: 'https://example.supabase.co' }),
            { localOnly: true, storeId: 'test-store' }
        );
        assert.throws(() => dsRemote.createProduct(sampleProduct), /requires localhost/i);
    });

    it('W3: updateProduct requires client/localOnly/storeId/localhost URL', function () {
        const DB = loadDbForTesting();

        const dsNoClient = DB._createControlledSupabaseProductsDataSource(
            null,
            { localOnly: true, storeId: 'test-store' }
        );
        assert.throws(() => dsNoClient.updateProduct(1, { original_title: 'X' }), /requires explicit client/i);

        const dsNoLocal = DB._createControlledSupabaseProductsDataSource(
            createMockClient(),
            { storeId: 'test-store' }
        );
        assert.throws(() => dsNoLocal.updateProduct(1, { original_title: 'X' }), /requires localOnly/i);

        const dsNoStore = DB._createControlledSupabaseProductsDataSource(
            createMockClient(),
            { localOnly: true }
        );
        assert.throws(() => dsNoStore.updateProduct(1, { original_title: 'X' }), /requires storeId/i);

        const dsRemote = DB._createControlledSupabaseProductsDataSource(
            createMockClient({ supabaseUrl: 'https://example.supabase.co' }),
            { localOnly: true, storeId: 'test-store' }
        );
        assert.throws(() => dsRemote.updateProduct(1, { original_title: 'X' }), /requires localhost/i);
    });

    it('W4: deleteProduct requires client/localOnly/storeId/localhost URL', function () {
        const DB = loadDbForTesting();

        const dsNoClient = DB._createControlledSupabaseProductsDataSource(
            null,
            { localOnly: true, storeId: 'test-store' }
        );
        assert.throws(() => dsNoClient.deleteProduct(1), /requires explicit client/i);

        const dsNoLocal = DB._createControlledSupabaseProductsDataSource(
            createMockClient(),
            { storeId: 'test-store' }
        );
        assert.throws(() => dsNoLocal.deleteProduct(1), /requires localOnly/i);

        const dsNoStore = DB._createControlledSupabaseProductsDataSource(
            createMockClient(),
            { localOnly: true }
        );
        assert.throws(() => dsNoStore.deleteProduct(1), /requires storeId/i);

        const dsRemote = DB._createControlledSupabaseProductsDataSource(
            createMockClient({ supabaseUrl: 'https://example.supabase.co' }),
            { localOnly: true, storeId: 'test-store' }
        );
        assert.throws(() => dsRemote.deleteProduct(1), /requires localhost/i);
    });

    it('W5: createProduct uses mapLegacyProductToSupabaseRow (store_id + legacy_id mapping)', async function () {
        const DB = loadDbForTesting();
        const mockRow = {
            id: 'uuid-123',
            legacy_id: 999,
            store_id: 'test-store',
            original_title: 'Test Product',
            brand: 'TESTBRAND',
            korea_cost: 50000,
            current_stock: 10
        };
        const client = createMockClient({ mockData: mockRow });

        const ds = DB._createControlledSupabaseProductsDataSource(
            client,
            { localOnly: true, storeId: 'test-store' }
        );

        const product = {
            id: 999,
            original_title: 'Test Product',
            brand: 'TESTBRAND',
            korea_cost: 50000,
            current_stock: 10
        };

        const result = await ds.createProduct(product);

        assert.equal(client._captured.table, 'products');
        assert.equal(client._captured.method, 'insert');
        assert.equal(client._captured.insertData.store_id, 'test-store',
            'store_id should be set from context, not from product');
        assert.equal(client._captured.insertData.legacy_id, 999,
            'legacy_id should be mapped from product.id');
        assert.equal(client._captured.insertData.original_title, 'Test Product');
        assert.equal(result.id, 999, 'result id should be legacy_id');
        assert.equal(result.original_title, 'Test Product');
    });

    it('W6: createProduct enforces store_id = context.storeId', async function () {
        const DB = loadDbForTesting();
        const client = createMockClient({
            mockData: { id: 'x', legacy_id: 1, store_id: 'test-store', original_title: 'X', brand: 'B' }
        });
        const ds = DB._createControlledSupabaseProductsDataSource(
            client,
            { localOnly: true, storeId: 'forced-store-id' }
        );

        const product = {
            id: 1,
            original_title: 'X',
            brand: 'B',
            store_id: 'malicious-store'
        };
        await ds.createProduct(product);

        assert.equal(client._captured.insertData.store_id, 'forced-store-id',
            'store_id should always be context.storeId, never from product');
    });

    it('W7: updateProduct uses legacy_id + store_id filters', async function () {
        const DB = loadDbForTesting();
        const mockRow = {
            id: 'uuid-1',
            legacy_id: 42,
            store_id: 'test-store',
            original_title: 'Updated',
            brand: 'BRAND'
        };
        const client = createMockClient({ mockData: mockRow });

        const ds = DB._createControlledSupabaseProductsDataSource(
            client,
            { localOnly: true, storeId: 'test-store' }
        );

        const result = await ds.updateProduct(42, { original_title: 'Updated' });

        assert.equal(client._captured.table, 'products');
        assert.equal(client._captured.method, 'update');
        assert.deepEqual(client._captured.eqCalls, [
            ['legacy_id', 42],
            ['store_id', 'test-store']
        ], 'update should filter by legacy_id and store_id');
        assert.equal(result.id, 42);
    });

    it('W8: updateProduct blocks dangerous fields (id, legacy_id, store_id, created_at)', async function () {
        const DB = loadDbForTesting();
        const mockRow = {
            id: 'uuid-1',
            legacy_id: 42,
            store_id: 'test-store',
            original_title: 'Safe',
            brand: 'BRAND'
        };
        const client = createMockClient({ mockData: mockRow });

        const ds = DB._createControlledSupabaseProductsDataSource(
            client,
            { localOnly: true, storeId: 'test-store' }
        );

        await ds.updateProduct(42, {
            id: 9999,
            legacy_id: 9999,
            store_id: 'other-store',
            created_at: '2020-01-01',
            original_title: 'Safe Update',
            korea_cost: 30000
        });

        const patch = client._captured.updateData;
        assert.equal(patch.original_title, 'Safe Update');
        assert.equal(patch.korea_cost, 30000);
        assert.equal(patch.id, undefined, 'id should not be in update patch');
        assert.equal(patch.legacy_id, undefined, 'legacy_id should not be in update patch');
        assert.equal(patch.store_id, undefined, 'store_id should not be in update patch');
        assert.equal(patch.created_at, undefined, 'created_at should not be in update patch');
        assert.ok(patch.updated_at, 'updated_at should be set automatically');
    });

    it('W9: deleteProduct uses soft delete (deleted_at update), not actual delete()', async function () {
        const DB = loadDbForTesting();
        const mockRow = {
            id: 'uuid-1',
            legacy_id: 77,
            store_id: 'test-store',
            original_title: 'Deleted Prod',
            brand: 'BRAND',
            deleted_at: new Date().toISOString()
        };
        const client = createMockClient({ mockData: mockRow });

        const ds = DB._createControlledSupabaseProductsDataSource(
            client,
            { localOnly: true, storeId: 'test-store' }
        );

        const result = await ds.deleteProduct(77);

        assert.equal(client._captured.table, 'products');
        assert.equal(client._captured.method, 'update',
            'delete should use update (soft delete), not delete()');
        assert.equal(client._captured.usedDelete, false,
            'actual delete() must not be called');
        assert.ok(client._captured.updateData.deleted_at,
            'deleted_at should be set for soft delete');
        assert.deepEqual(client._captured.eqCalls, [
            ['legacy_id', 77],
            ['store_id', 'test-store']
        ], 'soft delete should filter by legacy_id and store_id');
        assert.equal(result.id, 77);
    });

    it('W10: setProducts remains disabled (bulk overwrite not allowed)', function () {
        const DB = loadDbForTesting();
        const ds = DB._createControlledSupabaseProductsDataSource(
            createMockClient(),
            { localOnly: true, storeId: 'test-store' }
        );
        assert.throws(() => ds.setProducts([{ id: 1, original_title: 'X', brand: 'B' }]),
            /setProducts is not enabled/i,
            'setProducts should remain disabled (bulk overwrite danger)');
    });

    it('W11: write results are mapped via mapSupabaseRowToLegacyProduct', async function () {
        const DB = loadDbForTesting();
        const mockRow = {
            id: 'uuid-abc',
            legacy_id: 123,
            store_id: 'test-store',
            original_title: 'Mapped Product',
            brand: 'MAPPED',
            korea_cost: 25000,
            china_base_price: 75757,
            current_stock: 5
        };
        const client = createMockClient({ mockData: mockRow });
        const ds = DB._createControlledSupabaseProductsDataSource(
            client,
            { localOnly: true, storeId: 'test-store' }
        );

        const created = await ds.createProduct({ id: 123, original_title: 'X', brand: 'Y' });
        assert.equal(created.id, 123, 'create result should use legacy_id as id');
        assert.equal(created.original_title, 'Mapped Product');
        assert.equal(created.korea_cost, 25000);
        assert.equal(created.id !== 'uuid-abc', true, 'should not expose supabase uuid id');
    });

    it('W12: getProductsDataSource default is LocalProductsDataSource', function () {
        const DB = loadDbForTesting();
        const ds = DB.getProductsDataSource();
        assert.equal(ds.name, 'LocalProductsDataSource');
    });

    it('W13: no auto-switching to SupabaseProductsDataSource at runtime', function () {
        const DB = loadDbForTesting();
        const before = DB.getProductsDataSource().name;
        assert.equal(before, 'LocalProductsDataSource');
        DB.getProducts();
        DB.addProduct({ original_title: 'Test', brand: 'B' });
        DB.updateProduct(1, { original_title: 'Updated' });
        DB.deleteProduct(1);
        const after = DB.getProductsDataSource().name;
        assert.equal(after, 'LocalProductsDataSource',
            'runtime operations must not switch to SupabaseProductsDataSource');
    });

    it('W14: no remote supabase.co URL in write methods', function () {
        const source = readFileSync(join(__dirname, '..', 'js', 'db.js'), 'utf-8');
        const funcStart = source.indexOf('_createControlledSupabaseProductsDataSource');
        const funcEnd = source.indexOf('Products Supabase Mapping', funcStart);
        const funcBody = source.slice(funcStart, funcEnd);
        assert.equal(funcBody.indexOf('supabase.co'), -1,
            'no supabase.co URL in SupabaseProductsDataSource');
        assert.ok(funcBody.indexOf('127.0.0.1') > -1 || funcBody.indexOf('localhost') > -1,
            'localhost URL check should be present');
    });

    it('W15: no service_role string in DataSource implementation', function () {
        const source = readFileSync(join(__dirname, '..', 'js', 'db.js'), 'utf-8');
        const funcStart = source.indexOf('_createControlledSupabaseProductsDataSource');
        const funcEnd = source.indexOf('Products Supabase Mapping', funcStart);
        const funcBody = source.slice(funcStart, funcEnd).toLowerCase();
        assert.equal(funcBody.indexOf('service_role'), -1,
            'service_role should not appear in SupabaseProductsDataSource body');
        assert.equal(funcBody.indexOf('servicerole'), -1,
            'service role variant should not appear');
    });

    it('W16: no token/session/key console.log in write methods', function () {
        const source = readFileSync(join(__dirname, '..', 'js', 'db.js'), 'utf-8');
        const funcStart = source.indexOf('_createControlledSupabaseProductsDataSource');
        const funcEnd = source.indexOf('Products Supabase Mapping', funcStart);
        const funcBody = source.slice(funcStart, funcEnd);
        const logMatches = funcBody.match(/console\.\w+\s*\(/g) || [];
        assert.equal(logMatches.length, 0,
            'no console.log/error/warn in SupabaseProductsDataSource body');
    });

    it('W17: localStorage prefix lesoul_gh_ remains unchanged', function () {
        const source = readFileSync(join(__dirname, '..', 'js', 'db.js'), 'utf-8');
        assert.ok(source.indexOf("'lesoul_gh_") > -1 || source.indexOf('"lesoul_gh_') > -1,
            'lesoul_gh_ prefix should still exist in db.js');
    });

    it('W18: products.js uses async helpers, not direct Supabase calls', function () {
        const productsSource = readFileSync(join(__dirname, '..', 'js', 'products.js'), 'utf-8');
        assert.equal(productsSource.indexOf('supabase.from('), -1,
            'products.js must not contain supabase.from() calls');
        assert.equal(productsSource.indexOf('_createControlledSupabase'), -1,
            'products.js must not reference SupabaseProductsDataSource directly');
        assert.ok(productsSource.indexOf('DB.getProductsAsync') > -1 ||
            productsSource.indexOf('addProductAsync') > -1 ||
            productsSource.indexOf('updateProductAsync') > -1,
            'products.js should use async DB helpers');
    });

    it('W19: docs mention 3-5I is local-only controlled write contract, no runtime conversion', function () {
        const docFiles = [
            join(__dirname, '..', 'docs', 'ASYNC_MIGRATION_MAP.md'),
            join(__dirname, '..', 'docs', 'CURRENT_ARCHITECTURE.md')
        ];
        let found35I = false;
        let foundLocalOnly = false;
        let foundNoRuntime = false;

        for (const f of docFiles) {
            const content = readFileSync(f, 'utf-8');
            if (content.indexOf('3-5I') > -1) {
                found35I = true;
                const lower = content.toLowerCase();
                if (lower.indexOf('local-only') > -1 || lower.indexOf('local only') > -1) {
                    foundLocalOnly = true;
                }
                if (lower.indexOf('no runtime conversion') > -1 ||
                    lower.indexOf('runtime 전환 없음') > -1 ||
                    lower.indexOf('runtime 전환 아님') > -1 ||
                    lower.indexOf('runtime') > -1 && lower.indexOf('전환') > -1) {
                    foundNoRuntime = true;
                }
            }
        }
        assert.ok(found35I, 'docs should contain 3-5I section');
        assert.ok(foundLocalOnly, 'docs should mention local-only');
        assert.ok(foundNoRuntime, 'docs should mention no runtime conversion');
    });

    it('W20: js/config.js is gitignored (not committed)', function () {
        const gitignore = readFileSync(join(__dirname, '..', '.gitignore'), 'utf-8');
        assert.ok(
            gitignore.indexOf('js/config.js') > -1 ||
            gitignore.indexOf('/js/config.js') > -1,
            'js/config.js must be in .gitignore'
        );
    });

    it('W21: no data_export.json in repo', function () {
        const source = readFileSync(join(__dirname, '..', 'js', 'db.js'), 'utf-8');
        assert.equal(source.indexOf('data_export.json'), -1,
            'no data_export.json reference in db.js');
    });

});
