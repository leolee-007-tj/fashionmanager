/**
 * 3-5V: Product Update Legacy ID Mapping Contract
 *
 * Remote Smoke Test에서 product update가 "상품을 찾을 수 없음"으로 실패한 원인을
 * fix한 후, mapping과 update 경로의 정확성을 검증한다.
 *
 * 검증 범위:
 *  - V1: mapSupabaseRowToLegacyProduct가 remote row.legacy_id를 보존한다
 *  - V2: listProducts 후 반환된 product에 id와 legacy_id가 모두 존재한다
 *  - V3: createProduct 반환 직후 map된 product에 id와 legacy_id가 모두 존재한다
 *  - V4: updateProductAsync가 update_product RPC에 정확한 p_legacy_id를 넘긴다
 *  - V5: updateProduct가 id 또는 updates.legacy_id에서 legacy id를 추출한다
 *  - V6: updateProduct가 NaN/undefined/null id를 거부하고 RPC를 호출하지 않는다
 *  - V7: isProductCodeDuplicateError가 23505/409/메시지/상세코드 기반 중복을 판별한다
 *  - V8: _wrapWriteError가 원본 에러의 code/details를 보존한다
 */
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
    let capturedRpcName = null;
    let capturedRpcPayload = null;

    const client = {
        supabaseUrl,
        from() { return { select() { return { eq() { return { is() { return Promise.resolve({ data: [], error: null }); } }; } }; } }; },
        rpc(fnName, payload) {
            capturedRpcName = fnName;
            capturedRpcPayload = payload;
            return Promise.resolve().then(() => ({
                data: mockData,
                error: mockError
            }));
        },
        _captured: {
            get rpcName() { return capturedRpcName; },
            get rpcPayload() { return capturedRpcPayload; }
        }
    };

    return client;
}

describe('Product Update Legacy ID Mapping Contract (V1-V8)', function () {

    it('V1: mapSupabaseRowToLegacyProduct preserves row.legacy_id and exposes remote_id', function () {
        const DB = loadDbForTesting();
        const row = {
            id: 'uuid-abc',
            legacy_id: 42,
            store_id: 'test-store',
            original_title: 'Sample',
            brand: 'BRAND',
            korea_cost: 10000,
            current_stock: 5
        };
        const mapped = DB.mapSupabaseRowToLegacyProduct(row);
        assert.equal(mapped.id, 42, 'mapped.id should equal legacy_id');
        assert.equal(mapped.legacy_id, 42, 'mapped.legacy_id should equal row.legacy_id');
        assert.equal(mapped.remote_id, 'uuid-abc', 'mapped.remote_id should equal row.id');
        assert.equal(mapped.original_title, 'Sample');
        assert.equal(mapped.brand, 'BRAND');
    });

    it('V2: listProducts returns products with both id and legacy_id', async function () {
        const DB = loadDbForTesting();
        const mockRows = [
            { id: 'uuid-1', legacy_id: 100, store_id: 's', original_title: 'A', brand: 'B', korea_cost: 1000, current_stock: 1 },
            { id: 'uuid-2', legacy_id: 200, store_id: 's', original_title: 'B', brand: 'B', korea_cost: 2000, current_stock: 2 }
        ];
        const client = {
            supabaseUrl: 'http://127.0.0.1:54321',
            from() {
                return {
                    select() {
                        return {
                            eq() {
                                return {
                                    is() {
                                        return Promise.resolve({ data: mockRows, error: null });
                                    }
                                };
                            }
                        };
                    }
                };
            }
        };

        const ds = DB._createControlledSupabaseProductsDataSource(
            client,
            { localOnly: true, storeId: 's' }
        );
        const result = await ds.listProducts();
        assert.equal(result.length, 2);
        for (const p of result) {
            assert.ok(typeof p.id === 'number', 'product.id should be a number');
            assert.ok(typeof p.legacy_id === 'number', 'product.legacy_id should be a number');
            assert.equal(p.id, p.legacy_id, 'product.id should equal product.legacy_id');
        }
        assert.equal(result[0].legacy_id, 100);
        assert.equal(result[1].legacy_id, 200);
    });

    it('V3: createProduct return value has both id and legacy_id', async function () {
        const DB = loadDbForTesting();
        const mockRow = {
            id: 'uuid-new',
            legacy_id: 999,
            store_id: 'test-store',
            original_title: 'New',
            brand: 'NEWBRAND',
            korea_cost: 5000,
            current_stock: 1
        };
        const client = createMockClient({ mockData: mockRow });
        const ds = DB._createControlledSupabaseProductsDataSource(
            client,
            { localOnly: true, storeId: 'test-store' }
        );

        const product = {
            id: 999,
            original_title: 'New',
            brand: 'NEWBRAND',
            korea_cost: 5000,
            current_stock: 1
        };
        const result = await ds.createProduct(product);
        assert.equal(result.id, 999, 'returned id should be legacy_id');
        assert.equal(result.legacy_id, 999, 'returned legacy_id should be set');
        assert.equal(result.remote_id, 'uuid-new', 'returned remote_id should be set');
    });

    it('V4: updateProductAsync sends exact p_legacy_id to update_product RPC', async function () {
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

        await ds.updateProduct(42, { original_title: 'Updated' });
        assert.equal(client._captured.rpcName, 'update_product');
        assert.equal(client._captured.rpcPayload.p_legacy_id, 42,
            'p_legacy_id should be exactly the id parameter');
        assert.equal(client._captured.rpcPayload.p_store_id, 'test-store');
        assert.equal(client._captured.rpcPayload.p_original_title, 'Updated');
    });

    it('V5: updateProduct prefers updates.legacy_id over id when both are provided', async function () {
        const DB = loadDbForTesting();
        const mockRow = {
            id: 'uuid-x',
            legacy_id: 777,
            store_id: 's',
            original_title: 'X',
            brand: 'B'
        };
        const client = createMockClient({ mockData: mockRow });
        const ds = DB._createControlledSupabaseProductsDataSource(
            client,
            { localOnly: true, storeId: 's' }
        );

        // id=999 (잘못된 값) but updates.legacy_id=777 (올바른 값)
        await ds.updateProduct(999, { original_title: 'X', legacy_id: 777 });
        assert.equal(client._captured.rpcPayload.p_legacy_id, 777,
            'p_legacy_id should be updates.legacy_id, not id parameter');
    });

    it('V6: updateProduct rejects NaN/null/undefined id without calling RPC', async function () {
        const DB = loadDbForTesting();
        const client = createMockClient({ mockData: null });
        const ds = DB._createControlledSupabaseProductsDataSource(
            client,
            { localOnly: true, storeId: 's' }
        );

        assert.throws(
            () => ds.updateProduct(null, { original_title: 'X' }),
            /requires valid legacy_id/i
        );
        assert.throws(
            () => ds.updateProduct(undefined, { original_title: 'X' }),
            /requires valid legacy_id/i
        );
        assert.throws(
            () => ds.updateProduct('not-a-number', { original_title: 'X' }),
            /requires valid legacy_id/i
        );
        assert.throws(
            () => ds.updateProduct(0, { original_title: 'X' }),
            /requires valid legacy_id/i
        );
        assert.throws(
            () => ds.updateProduct(-1, { original_title: 'X' }),
            /requires valid legacy_id/i
        );
        assert.equal(client._captured.rpcName, null, 'RPC should not have been called');
    });

    it('V7: isProductCodeDuplicateError detects 23505/409/duplicate key/messages', function () {
        const DB = loadDbForTesting();
        assert.equal(DB.isProductCodeDuplicateError(null), false);
        assert.equal(DB.isProductCodeDuplicateError(undefined), false);
        assert.equal(DB.isProductCodeDuplicateError(new Error('some other error')), false);
        assert.equal(DB.isProductCodeDuplicateError({ code: '23505' }), true);
        assert.equal(DB.isProductCodeDuplicateError({ code: '409' }), true);
        assert.equal(DB.isProductCodeDuplicateError({ message: 'unique_products_active_store_code violated' }), true);
        assert.equal(DB.isProductCodeDuplicateError({ details: 'duplicate key value violates unique constraint unique_products_active_store_code' }), true);
        assert.equal(DB.isProductCodeDuplicateError({ message: 'duplicate key', details: 'product_code conflict' }), true);
    });

    it('V8: _wrapWriteError preserves original error code/details for duplicate detection', async function () {
        const DB = loadDbForTesting();
        const originalErr = {
            code: '23505',
            message: 'duplicate key value violates unique constraint "unique_products_active_store_code"',
            details: 'Key (store_id, product_code)=(abc, XYZ001) already exists.'
        };
        const client = {
            supabaseUrl: 'http://127.0.0.1:54321',
            from() { return { select() { return { eq() { return { is() { return Promise.resolve({ data: null, error: null }); } }; } }; } }; },
            rpc() {
                return Promise.resolve().then(() => ({ data: null, error: originalErr }));
            }
        };
        const ds = DB._createControlledSupabaseProductsDataSource(
            client,
            { localOnly: true, storeId: 's' }
        );

        let caught = null;
        try {
            await ds.createProduct({ original_title: 'X', brand: 'B' });
        } catch (e) {
            caught = e;
        }
        assert.ok(caught, 'should throw');
        assert.equal(caught.code, '23505', 'wrapped error should preserve code');
        assert.ok(caught.details, 'wrapped error should preserve details');
        assert.equal(DB.isProductCodeDuplicateError(caught), true,
            'wrapped error should be detected as duplicate');
    });
});
