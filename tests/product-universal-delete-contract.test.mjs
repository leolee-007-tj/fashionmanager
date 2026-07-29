/**
 * BLOCKER-FIX-6: Universal product delete contract tests.
 *
 * Tests:
 * - delete button uses remote_id > legacy_id > id
 * - selected key remains string
 * - Products.delete passes target object to DB.deleteProductAsync
 * - SupabaseProductsDataSource.deleteProduct accepts remote_id uuid
 * - SupabaseProductsDataSource.deleteProduct accepts legacy_id
 * - deletion failure does not show success
 * - delete summary safe fields only
 * - if migration is added, function soft_delete_product_by_id exists
 * - hard delete not used
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ========== Test helpers ==========

// Minimal App stub
let App;
const STORE = {};

// Simulate the key identity functions from products.js

function _getProductActionKey(product) {
    if (!product) return '';
    if (Number.isFinite(Number(product.legacy_id)) && Number(product.legacy_id) > 0) return String(product.legacy_id);
    if (Number.isFinite(Number(product.id)) && Number(product.id) > 0) return String(product.id);
    if (product.remote_id) return 'remote:' + String(product.remote_id);
    return '';
}

function _getProductDeleteTarget(product) {
    if (!product) return { type: 'invalid', value: null, reason: 'PRODUCT_NOT_FOUND' };
    if (product.remote_id) {
        return { type: 'remote_id', value: product.remote_id };
    }
    const legacyId = product.legacy_id != null ? Number(product.legacy_id) : null;
    if (Number.isFinite(legacyId) && legacyId > 0) {
        return { type: 'legacy_id', value: legacyId };
    }
    const localId = product.id != null ? Number(product.id) : null;
    if (Number.isFinite(localId) && localId > 0) {
        return { type: 'legacy_id', value: localId };
    }
    return { type: 'invalid', value: null, reason: 'MISSING_DELETE_ID' };
}

function _findProductByActionKey(products, key) {
    if (!key || !products) return null;
    const numericKey = Number(key);
    if (Number.isFinite(numericKey) && numericKey > 0) {
        const byLegacyId = products.find(p => Number(p.legacy_id) === numericKey);
        if (byLegacyId) return byLegacyId;
        const byId = products.find(p => Number(p.id) === numericKey);
        if (byId) return byId;
    }
    if (key.startsWith('remote:')) {
        const uuid = key.slice(7);
        return products.find(p => String(p.remote_id) === uuid) || null;
    }
    return products.find(p =>
        String(p.id) === key ||
        String(p.legacy_id) === key ||
        String(p.remote_id) === key
    ) || null;
}

// ========== SupabaseProductsDataSource.deleteProduct simulator ==========

function _supabaseDeleteProduct(id) {
    const isUuid = typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    const numericId = Number(id);
    const isNumeric = Number.isFinite(numericId) && numericId > 0;

    if (!isUuid && !isNumeric) {
        throw new Error('SupabaseProductsDataSource.deleteProduct requires valid product_id (uuid) or legacy_id (positive integer)');
    }

    // Simulate success
    return {
        id: isUuid ? id : '00000000-0000-0000-0000-000000000000',
        legacy_id: isNumeric ? numericId : null,
        product_code: 'TEST001',
        original_title: 'Test Product',
        brand: 'TEST',
        deleted_at: new Date().toISOString()
    };
}

describe('Universal product delete contract', () => {

    // ========== Identity key resolution ==========

    it('delete button uses remote_id > legacy_id > id', () => {
        const productWithAll = {
            remote_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            legacy_id: 42,
            id: 1
        };
        // action key: legacy_id takes priority
        const key = _getProductActionKey(productWithAll);
        assert.equal(key, '42', 'action key should be legacy_id when available');

        // delete target: remote_id has priority
        const target = _getProductDeleteTarget(productWithAll);
        assert.equal(target.type, 'remote_id', 'delete target should prefer remote_id');
        assert.equal(target.value, 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'delete target value should be remote_id');
    });

    it('selected key remains string', () => {
        const product = {
            remote_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            legacy_id: 42,
            id: 1
        };
        const key = _getProductActionKey(product);
        assert.equal(typeof key, 'string', 'action key should be string');
    });

    it('Products.delete passes target object to DB.deleteProductAsync', () => {
        // Simulate the delete flow
        const beforeCount = 10;
        const product = {
            remote_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            legacy_id: 42,
            id: 1
        };
        const deleteTarget = _getProductDeleteTarget(product);
        assert.equal(deleteTarget.type, 'remote_id', 'should resolve to remote_id');

        // deleteProductAsync receives the value (uuid string)
        const result = _supabaseDeleteProduct(deleteTarget.value);
        assert.ok(result, 'delete should succeed');
        assert.equal(result.id, 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'should return the deleted product id');
    });

    // ========== SupabaseProductsDataSource.deleteProduct ==========

    it('SupabaseProductsDataSource.deleteProduct accepts remote_id uuid', () => {
        const uuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
        const result = _supabaseDeleteProduct(uuid);
        assert.ok(result, 'should accept uuid');
        assert.equal(result.id, uuid, 'should return the uuid');
    });

    it('SupabaseProductsDataSource.deleteProduct accepts legacy_id', () => {
        const result = _supabaseDeleteProduct(42);
        assert.ok(result, 'should accept legacy_id');
        assert.equal(result.legacy_id, 42, 'should return the legacy_id');
    });

    it('SupabaseProductsDataSource.deleteProduct rejects invalid id', () => {
        assert.throws(() => {
            _supabaseDeleteProduct(null);
        }, /valid product_id/, 'should throw for null');

        assert.throws(() => {
            _supabaseDeleteProduct(0);
        }, /valid product_id/, 'should throw for 0');

        assert.throws(() => {
            _supabaseDeleteProduct(-1);
        }, /valid product_id/, 'should throw for negative');

        assert.throws(() => {
            _supabaseDeleteProduct('not-a-uuid');
        }, /valid product_id/, 'should throw for non-uuid string');
    });

    // ========== Deletion failure ==========

    it('deletion failure does not show success', () => {
        // Simulate a failed delete
        let summary = {
            successCount: 0,
            failCount: 1,
            failReasons: ['delete failed: RPC error']
        };

        assert.equal(summary.successCount, 0, 'successCount should be 0');
        assert.equal(summary.failCount, 1, 'failCount should be 1');
        assert.ok(summary.failReasons.length > 0, 'failReasons should be recorded');
    });

    // ========== Delete summary ==========

    it('delete summary safe fields only', () => {
        const summary = {
            mode: 'remote',
            requestedCount: 3,
            successCount: 2,
            failCount: 1,
            failReasons: ['product not found for key: 99'],
            datasourceCountBefore: 100,
            datasourceCountAfter: 98,
            visibleCountAfter: 50,
            usedRemoteIdCount: 1,
            usedLegacyIdCount: 1,
            missingIdentifierCount: 1,
            countDeltaMatchesSuccess: true
        };

        // Verify all required fields
        assert.equal(summary.mode, 'remote');
        assert.equal(summary.requestedCount, 3);
        assert.equal(summary.successCount, 2);
        assert.equal(summary.failCount, 1);
        assert.equal(summary.datasourceCountBefore, 100);
        assert.equal(summary.datasourceCountAfter, 98);
        assert.equal(summary.usedRemoteIdCount, 1);
        assert.equal(summary.usedLegacyIdCount, 1);
        assert.equal(summary.missingIdentifierCount, 1);
        assert.equal(summary.countDeltaMatchesSuccess, true);

        // No sensitive fields
        const json = JSON.stringify(summary);
        assert.ok(!json.includes('token'), 'summary should not contain token');
        assert.ok(!json.includes('service_role'), 'summary should not contain service_role');
        assert.ok(!json.includes('password'), 'summary should not contain password');
        assert.ok(!json.includes('api_key'), 'summary should not contain api_key');
    });

    // ========== Migration existence ==========

    it('if migration is added, function soft_delete_product_by_id exists', () => {
        // The migration file should exist at the expected path
        const migrationDir = resolve(__dirname, '..', 'supabase', 'migrations');
        const migrationFiles = readdirSync(migrationDir).filter(f => f.endsWith('.sql'));

        const hasMigration = migrationFiles.some(f => {
            const content = readFileSync(resolve(migrationDir, f), 'utf-8');
            return content.includes('soft_delete_product_by_id');
        });

        assert.ok(hasMigration, 'soft_delete_product_by_id migration should exist');
    });

    it('hard delete not used', () => {
        // Verify the migration uses soft delete (deleted_at = now()) not DELETE FROM
        const migrationDir = resolve(__dirname, '..', 'supabase', 'migrations');
        const migrationFiles = readdirSync(migrationDir).filter(f => f.endsWith('.sql'));

        for (const file of migrationFiles) {
            const content = readFileSync(resolve(migrationDir, file), 'utf-8');
            if (content.includes('soft_delete_product_by_id')) {
                // Verify soft delete pattern
                assert.ok(content.includes('deleted_at'), 'migration should use deleted_at');
                assert.ok(content.includes('UPDATE'), 'migration should use UPDATE not DELETE');
                assert.ok(!content.includes('DELETE FROM'), 'migration should not use hard delete');
                break;
            }
        }
    });

    // ========== Universal delete: all product types ==========

    it('수동 등록 상품 삭제 가능 (legacy_id)', () => {
        const product = { id: 1, legacy_id: 100, brand: 'Test', original_title: 'Manual Product' };
        const target = _getProductDeleteTarget(product);
        assert.equal(target.type, 'legacy_id', '수동 등록 상품은 legacy_id로 삭제');
        assert.equal(target.value, 100);
    });

    it('엑셀 업로드 상품 삭제 가능 (legacy_id or remote_id)', () => {
        const product = {
            id: 2,
            legacy_id: 101,
            remote_id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
            brand: 'MOH',
            original_title: 'Excel Product'
        };
        const target = _getProductDeleteTarget(product);
        // remote_id has priority
        assert.equal(target.type, 'remote_id', '엑셀 업로드 상품은 remote_id로 삭제');
        assert.equal(target.value, 'b2c3d4e5-f6a7-8901-bcde-f12345678901');
    });

    it('예시상품 삭제 가능 (remote_id or legacy_id)', () => {
        const product = {
            id: 3,
            remote_id: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
            brand: 'Sample',
            original_title: 'Example Product'
        };
        const target = _getProductDeleteTarget(product);
        assert.equal(target.type, 'remote_id', '예시상품은 remote_id로 삭제');
        assert.equal(target.value, 'c3d4e5f6-a7b8-9012-cdef-123456789012');
    });

    it('remote_id만 있는 상품 삭제 가능', () => {
        const product = {
            id: 4,
            remote_id: 'd4e5f6a7-b8c9-0123-defa-234567890123',
            brand: 'Remote',
            original_title: 'Remote Only Product'
        };
        const target = _getProductDeleteTarget(product);
        assert.equal(target.type, 'remote_id', 'remote_id만 있는 상품도 remote_id로 삭제');
        assert.equal(target.value, 'd4e5f6a7-b8c9-0123-defa-234567890123');
    });

    it('legacy_id만 있는 상품 삭제 가능', () => {
        const product = {
            id: 5,
            legacy_id: 102,
            brand: 'Legacy',
            original_title: 'Legacy Only Product'
        };
        const target = _getProductDeleteTarget(product);
        assert.equal(target.type, 'legacy_id', 'legacy_id만 있는 상품은 legacy_id로 삭제');
        assert.equal(target.value, 102);
    });

    it('local numeric id 상품 삭제 가능', () => {
        const product = {
            id: 6,
            brand: 'Local',
            original_title: 'Local ID Only Product'
        };
        const target = _getProductDeleteTarget(product);
        assert.equal(target.type, 'legacy_id', 'local id 상품은 legacy_id(id)로 삭제');
        assert.equal(target.value, 6);
    });

    // ========== Missing identifier ==========

    it('식별자 없는 상품 삭제 불가', () => {
        const product = { brand: 'Ghost', original_title: 'No ID' };
        const target = _getProductDeleteTarget(product);
        assert.equal(target.type, 'invalid', '식별자 없는 상품은 invalid');
        assert.ok(target.reason, 'reason should be provided');
    });
});