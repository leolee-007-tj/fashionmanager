import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const productsSource = readFileSync('js/products.js', 'utf8');
const dbSource = readFileSync('js/db.js', 'utf8');
const migrationSource = readFileSync(
    'supabase/migrations/20260921090000_update_product_by_id.sql',
    'utf8'
);

function loadDbForTesting() {
    global.localStorage = {
        getItem() { return null; },
        setItem() {},
        removeItem() {}
    };
    return new Function('LESOUL_CONFIG', `${dbSource}\n; return DB;`)({});
}

test('product edit resolves UUID action keys instead of numeric-only lookup', () => {
    assert.match(productsSource, /_findProductByActionKey\(String\(editId\)\)/);
    assert.match(productsSource, /const updateId = legacyId \|\| \(hasRemoteId \? remoteId : null\)/);
    assert.match(productsSource, /DB\.updateProductAsync\(updateId, productData\)/);
});

test('product edit preserves reserved stock', () => {
    assert.match(productsSource, /reserved_stock: editId && currentProduct/);
    assert.doesNotMatch(productsSource, /reserved_stock:\s*0,\s*stock_year/);
});

test('Supabase datasource supports UUID update RPC and keeps zero stock values', () => {
    assert.match(dbSource, /update_product_by_id/);
    assert.match(dbSource, /p_product_id: remoteId/);
    assert.match(dbSource, /p_updates: updateFields/);
    assert.match(dbSource, /p_current_stock: upd\.current_stock \?\? null/);
    assert.match(dbSource, /p_reserved_stock: upd\.reserved_stock \?\? null/);
});

test('UUID-only product update calls update_product_by_id with safe fields', async () => {
    const DB = loadDbForTesting();
    const productId = '550e8400-e29b-41d4-a716-446655440000';
    let capturedName = null;
    let capturedPayload = null;
    const client = {
        supabaseUrl: 'http://127.0.0.1:54321',
        rpc(name, payload) {
            capturedName = name;
            capturedPayload = payload;
            return Promise.resolve({
                data: [{ id: productId, legacy_id: null, store_id: 'store-1', original_title: '상품', brand: '브랜드' }],
                error: null
            });
        }
    };
    const dataSource = DB._createControlledSupabaseProductsDataSource(client, {
        localOnly: true,
        storeId: 'store-1'
    });

    await dataSource.updateProduct(productId, {
        remote_id: productId,
        original_title: '상품',
        brand: '브랜드',
        korea_cost: 37200,
        current_stock: 0,
        reserved_stock: 0
    });

    assert.equal(capturedName, 'update_product_by_id');
    assert.equal(capturedPayload.p_store_id, 'store-1');
    assert.equal(capturedPayload.p_product_id, productId);
    assert.equal(capturedPayload.p_updates.korea_cost, 37200);
    assert.equal(capturedPayload.p_updates.current_stock, 0);
    assert.equal(capturedPayload.p_updates.reserved_stock, 0);
    assert.equal(capturedPayload.p_updates.remote_id, undefined);
    assert.equal(capturedPayload.p_updates.legacy_id, undefined);
});

test('UUID update RPC is store-scoped, role-checked and immutable-field safe', () => {
    assert.match(migrationSource, /CREATE OR REPLACE FUNCTION public\.update_product_by_id/);
    assert.match(migrationSource, /SECURITY DEFINER/);
    assert.match(migrationSource, /private\.current_store_role\(p_store_id\)/);
    assert.match(migrationSource, /product\.id = p_product_id/);
    assert.match(migrationSource, /product\.store_id = p_store_id/);
    assert.match(migrationSource, /jsonb_object_keys\(p_updates\)/);
    assert.doesNotMatch(migrationSource, /\bEXECUTE\s+(?:FORMAT|IMMEDIATE|\()/i);
    assert.match(migrationSource, /GRANT EXECUTE ON FUNCTION public\.update_product_by_id[\s\S]*TO authenticated/);
});
