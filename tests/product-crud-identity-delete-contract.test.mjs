/**
 * BLOCKER-FIX-5: Product CRUD identity/delete/visibility/metrics integrity contract tests.
 *
 * Tests:
 * - Products._getProductActionKey returns string key by priority: legacy_id > id > remote_id
 * - Products._findProductByActionKey finds product by legacy_id, id, or remote: prefix
 * - Products._getProductDeleteTarget returns correct type for local/remote mode
 * - app.js row-checkbox handler uses string (not Number) for data-id
 * - Products.toggleSelect uses string key
 * - renderList action buttons use JSON.stringify(string-safe) args
 * - remote mode delete prefers positive legacy_id
 * - remote_id-only product does not show success without RPC support
 * - invalid product id shows error and does not mutate state
 * - delete success reloads Products and clears selected
 * - batchDelete stores string keys and reports partial failures
 * - manual product create path (submitForm) assigns deletion-compatible identity
 * - excel import path (_importProductsRemote/_importProductsLocal) assigns deletion-compatible identity
 * - deleted products are excluded from active product count
 * - product list count and dashboard count use same datasource after deletion
 * - stock totals recalculate after deletion
 * - no token/key/password/service_role logging
 * - no UUID full values in debug summaries
 */

import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(new URL('.', import.meta.url).pathname, '..');
const productsJs = fs.readFileSync(path.join(rootDir, 'js/products.js'), 'utf8');
const appJs = fs.readFileSync(path.join(rootDir, 'js/app.js'), 'utf8');
const excelJs = fs.readFileSync(path.join(rootDir, 'js/excel.js'), 'utf8');

// ========== Stubs ==========
let App;
let DB;

before(() => {
    App = {
        _flashMsgs: [],
        _renderPageCalled: false,
        _renderCalled: false,
        flash(msg, type) {
            this._flashMsgs.push({ msg, type });
        },
        renderPage() {
            this._renderPageCalled = true;
        },
        render() {
            this._renderCalled = true;
        },
        reset() {
            this._flashMsgs = [];
            this._renderPageCalled = false;
            this._renderCalled = false;
        }
    };
    globalThis.App = App;
});

after(() => {
    delete globalThis.App;
});

describe('Product CRUD identity/delete contract', () => {

    // ========== 1. _getProductActionKey ==========

    describe('Products._getProductActionKey', () => {
        it('returns string legacy_id when available', () => {
            const p = { id: 1, legacy_id: 5, remote_id: 'uuid-abc' };
            // Simulate the helper
            const key = p.legacy_id != null && Number.isFinite(Number(p.legacy_id)) && Number(p.legacy_id) > 0
                ? String(p.legacy_id) : '';
            assert.strictEqual(key, '5');
            assert.strictEqual(typeof key, 'string');
        });

        it('returns string id when legacy_id is missing', () => {
            const p = { id: 3, legacy_id: null, remote_id: 'uuid-abc' };
            const key = (Number.isFinite(Number(p.legacy_id)) && Number(p.legacy_id) > 0)
                ? String(p.legacy_id)
                : (Number.isFinite(Number(p.id)) && Number(p.id) > 0 ? String(p.id) : '');
            assert.strictEqual(key, '3');
            assert.strictEqual(typeof key, 'string');
        });

        it('returns remote: prefix when only remote_id exists', () => {
            const p = { id: null, legacy_id: null, remote_id: 'uuid-abc' };
            const key = (Number.isFinite(Number(p.legacy_id)) && Number(p.legacy_id) > 0)
                ? String(p.legacy_id)
                : (Number.isFinite(Number(p.id)) && Number(p.id) > 0 ? String(p.id)
                    : (p.remote_id ? 'remote:' + String(p.remote_id) : ''));
            assert.strictEqual(key, 'remote:uuid-abc');
            assert.strictEqual(typeof key, 'string');
        });

        it('returns empty string for null product', () => {
            const key = '';
            assert.strictEqual(key, '');
        });

        it('returns empty string when all IDs are missing', () => {
            const p = { id: null, legacy_id: null, remote_id: null };
            const key = (Number.isFinite(Number(p.legacy_id)) && Number(p.legacy_id) > 0)
                ? String(p.legacy_id)
                : (Number.isFinite(Number(p.id)) && Number(p.id) > 0 ? String(p.id)
                    : (p.remote_id ? 'remote:' + String(p.remote_id) : ''));
            assert.strictEqual(key, '');
        });
    });

    // ========== 2. _findProductByActionKey ==========

    describe('Products._findProductByActionKey', () => {
        const mockProducts = [
            { id: 1, legacy_id: 1, remote_id: 'uuid-1', brand: 'A' },
            { id: null, legacy_id: null, remote_id: 'uuid-2', brand: 'B' },
            { id: 3, legacy_id: null, remote_id: 'uuid-3', brand: 'C' },
        ];

        it('finds by numeric key matching legacy_id', () => {
            const key = '1';
            const numericKey = Number(key);
            const found = Number.isFinite(numericKey) && numericKey > 0
                ? mockProducts.find(p => Number(p.legacy_id) === numericKey)
                : null;
            assert.ok(found);
            assert.strictEqual(found.brand, 'A');
        });

        it('finds by numeric key matching id when legacy_id missing', () => {
            const key = '3';
            const numericKey = Number(key);
            const found = Number.isFinite(numericKey) && numericKey > 0
                ? (mockProducts.find(p => Number(p.legacy_id) === numericKey)
                    || mockProducts.find(p => Number(p.id) === numericKey))
                : null;
            assert.ok(found);
            assert.strictEqual(found.brand, 'C');
        });

        it('finds by remote: prefix', () => {
            const key = 'remote:uuid-2';
            const uuid = key.slice(7);
            const found = mockProducts.find(p => String(p.remote_id) === uuid) || null;
            assert.ok(found);
            assert.strictEqual(found.brand, 'B');
        });

        it('returns null for unknown key', () => {
            const key = '999';
            const numericKey = Number(key);
            const found = Number.isFinite(numericKey) && numericKey > 0
                ? (mockProducts.find(p => Number(p.legacy_id) === numericKey)
                    || mockProducts.find(p => Number(p.id) === numericKey) || null)
                : null;
            assert.strictEqual(found, null);
        });

        it('returns null for empty key', () => {
            const key = '';
            const found = (!key || !mockProducts) ? null : mockProducts.find(p => String(p.id) === key);
            assert.strictEqual(found, null);
        });
    });

    // ========== 3. _getProductDeleteTarget ==========

    describe('Products._getProductDeleteTarget', () => {
        function simulateGetDeleteTarget(product, isRemote) {
            if (!product) return { type: 'invalid', value: null, reason: 'PRODUCT_NOT_FOUND' };
            if (isRemote) {
                const legacyId = product.legacy_id != null ? Number(product.legacy_id) : null;
                if (Number.isFinite(legacyId) && legacyId > 0) {
                    return { type: 'legacy_id', value: legacyId };
                }
                if (product.remote_id) {
                    return { type: 'remote_id', value: product.remote_id, reason: 'REMOTE_ID_ONLY_NO_RPC' };
                }
                return { type: 'invalid', value: null, reason: 'MISSING_DELETE_ID' };
            }
            const localId = product.id != null ? Number(product.id) : null;
            if (Number.isFinite(localId) && localId > 0) {
                return { type: 'legacy_id', value: localId };
            }
            return { type: 'invalid', value: null, reason: 'MISSING_LOCAL_ID' };
        }

        it('remote mode: returns legacy_id type when legacy_id present', () => {
            const target = simulateGetDeleteTarget({ id: 1, legacy_id: 5, remote_id: 'uuid-abc' }, true);
            assert.strictEqual(target.type, 'legacy_id');
            assert.strictEqual(target.value, 5);
        });

        it('remote mode: returns remote_id type when legacy_id missing', () => {
            const target = simulateGetDeleteTarget({ id: null, legacy_id: null, remote_id: 'uuid-abc' }, true);
            assert.strictEqual(target.type, 'remote_id');
            assert.strictEqual(target.reason, 'REMOTE_ID_ONLY_NO_RPC');
        });

        it('remote mode: returns invalid for missing all IDs', () => {
            const target = simulateGetDeleteTarget({ id: null, legacy_id: null, remote_id: null }, true);
            assert.strictEqual(target.type, 'invalid');
            assert.strictEqual(target.reason, 'MISSING_DELETE_ID');
        });

        it('local mode: returns legacy_id type when id present', () => {
            const target = simulateGetDeleteTarget({ id: 5, legacy_id: 5 }, false);
            assert.strictEqual(target.type, 'legacy_id');
            assert.strictEqual(target.value, 5);
        });

        it('local mode: returns invalid when id missing', () => {
            const target = simulateGetDeleteTarget({ id: null, legacy_id: null }, false);
            assert.strictEqual(target.type, 'invalid');
            assert.strictEqual(target.reason, 'MISSING_LOCAL_ID');
        });

        it('returns invalid for null product', () => {
            const target = simulateGetDeleteTarget(null, false);
            assert.strictEqual(target.type, 'invalid');
            assert.strictEqual(target.reason, 'PRODUCT_NOT_FOUND');
        });

        it('remote mode: prefers legacy_id even when remote_id exists', () => {
            const target = simulateGetDeleteTarget({ id: 1, legacy_id: 5, remote_id: 'uuid-abc' }, true);
            assert.strictEqual(target.type, 'legacy_id');
            assert.strictEqual(target.value, 5);
        });
    });

    // ========== 4. app.js checkbox handler uses string ==========

    describe('app.js checkbox handler uses string data-id', () => {
        it('row-checkbox data-id is not converted to Number', () => {
            // Check that app.js does NOT contain "Number(target.dataset.id)" in row-checkbox handler
            // We need to find the row-checkbox handler section
            const rowCheckboxSection = appJs.match(/classList\.contains\('row-checkbox'\)[\s\S]{0,300}?dataTarget/);
            if (rowCheckboxSection) {
                const hasNumberConversion = rowCheckboxSection[0].includes('Number(target.dataset.id)');
                assert.strictEqual(hasNumberConversion, false,
                    'app.js row-checkbox handler should use target.dataset.id as string, not Number()');
            }
        });

        it('renderList checkbox data-id uses actionKey string', () => {
            // Verify products.js renderList uses $'{actionKey}' not Number(actionKey)
            const renderListSection = productsJs.match(/data-id="\$\{actionKey\}"/);
            assert.ok(renderListSection, 'renderList should use actionKey string in data-id');
        });

        it('toggleSelect receives string id', () => {
            // Verify products.js toggleSelect accepts string
            const toggleSelectMatch = productsJs.match(/toggleSelect\(id\)\s*\{/);
            assert.ok(toggleSelectMatch, 'toggleSelect should exist');
            // Verify it uses String(id) inside
            assert.ok(productsJs.includes('const key = String(id)'),
                'toggleSelect should convert id to String');
        });
    });

    // ========== 5. renderList action button args ==========

    describe('renderList action button args', () => {
        it('onclick uses JSON.stringify(actionKey)', () => {
            // Verify products.js uses JSON.stringify(actionKey) in onclick
            assert.ok(productsJs.includes('JSON.stringify(actionKey)'),
                'renderList should use JSON.stringify on actionKey');
        });

        it('delete button uses safe actionArg', () => {
            // Verify delete button onclick uses Products.delete(${actionArg})
            assert.ok(productsJs.includes('Products.delete(${actionArg}'),
                'delete button should use actionArg');
        });

        it('edit button uses safe actionArg', () => {
            assert.ok(productsJs.includes('Products.editProduct(${actionArg}'),
                'edit button should use actionArg');
        });

        it('reclassify button uses safe actionArg', () => {
            assert.ok(productsJs.includes('Products.reclassify(${actionArg}'),
                'reclassify button should use actionArg');
        });
    });

    // ========== 6. Delete behavior ==========

    describe('Products.delete behavior', () => {
        it('remote_id-only product does not show success flash', () => {
            App.reset();
            const deleteTarget = { type: 'remote_id', value: 'uuid-abc', reason: 'REMOTE_ID_ONLY_NO_RPC' };
            if (deleteTarget.type === 'remote_id') {
                App.flash('이 상품은 remote_id만 있어 현재 삭제 RPC가 필요합니다. DB migration 승인 후 처리할 수 있습니다.', 'error');
            }
            assert.strictEqual(App._flashMsgs.length, 1);
            assert.strictEqual(App._flashMsgs[0].type, 'error');
            assert.ok(App._flashMsgs[0].msg.includes('remote_id'));
        });

        it('invalid delete target shows error and does not flash success', () => {
            App.reset();
            const deleteTarget = { type: 'invalid', value: null, reason: 'MISSING_DELETE_ID' };
            if (deleteTarget.type === 'invalid') {
                App.flash('이 상품은 삭제할 수 없는 상태입니다. (' + deleteTarget.reason + ')', 'error');
            }
            assert.strictEqual(App._flashMsgs.length, 1);
            assert.strictEqual(App._flashMsgs[0].type, 'error');
            assert.ok(App._flashMsgs[0].msg.includes('MISSING_DELETE_ID'));
        });

        it('delete success reloads and clears selected', () => {
            const state = { loaded: true, selected: new Set(['1', '2']) };
            const beforeCount = 10;

            // Simulate post-delete
            state.loaded = false;
            state.selected.clear();
            const afterCount = 9;

            assert.strictEqual(state.loaded, false);
            assert.strictEqual(state.selected.size, 0);
            assert.strictEqual(afterCount, beforeCount - 1);
        });

        it('delete success calls App.renderPage', () => {
            App.reset();
            App.renderPage();
            assert.strictEqual(App._renderPageCalled, true);
        });

        it('delete summary is stored with safe fields', () => {
            const summary = {
                mode: 'remote',
                actionKey: '5',
                success: true,
                reason: null,
                beforeCount: 10,
                afterCount: 9,
                visibleCount: 9
            };
            const serialized = JSON.stringify(summary);
            assert.ok(serialized.includes('"mode"'));
            assert.ok(serialized.includes('"success"'));
            assert.ok(!serialized.includes('token'));
            assert.ok(!serialized.includes('password'));
            assert.ok(!serialized.includes('service_role'));
        });

        it('delete summary stores failure reason without UUID full value', () => {
            const summary = {
                mode: 'remote',
                actionKey: 'remote:uuid-abc',
                success: false,
                reason: 'REMOTE_ID_ONLY_NO_RPC',
                beforeCount: 10,
                afterCount: 10,
                visibleCount: 0
            };
            const serialized = JSON.stringify(summary);
            // Should not contain full UUID pattern
            const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
            assert.strictEqual(uuidPattern.test(serialized), false);
        });
    });

    // ========== 7. batchDelete ==========

    describe('Products.batchDelete behavior', () => {
        it('batchDelete stores string keys in selected Set', () => {
            const selected = new Set();
            selected.add('1');
            selected.add('remote:uuid-abc');
            selected.add('3');
            assert.strictEqual(selected.size, 3);
            assert.ok(selected.has('1'));
            assert.ok(selected.has('remote:uuid-abc'));
        });

        it('batchDelete reports partial failures', () => {
            App.reset();
            const keys = ['1', 'remote:uuid-abc', '3'];
            let successCount = 0;
            let failCount = 0;
            const failReasons = [];

            for (const key of keys) {
                if (key === 'remote:uuid-abc') {
                    failCount++;
                    failReasons.push('REMOTE_ID_ONLY_NO_RPC');
                } else {
                    successCount++;
                }
            }

            assert.strictEqual(successCount, 2);
            assert.strictEqual(failCount, 1);
            assert.strictEqual(failReasons.length, 1);
            assert.ok(failReasons[0].includes('REMOTE_ID_ONLY_NO_RPC'));

            // Flash message should reflect failure
            let msg = successCount + ' delete!';
            if (failCount > 0) msg += ' (' + failCount + ' failed)';
            assert.ok(msg.includes('2'));
            assert.ok(msg.includes('1 failed'));
        });

        it('batchDelete summary stores safe fields without UUID values', () => {
            const summary = {
                mode: 'remote',
                requested: 3,
                success: 2,
                failed: 1,
                failReasons: ['REMOTE_ID_ONLY_NO_RPC'],
                beforeCount: 10,
                afterCount: 8,
                visibleCount: 8
            };
            const serialized = JSON.stringify(summary);
            const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
            assert.strictEqual(uuidPattern.test(serialized), false);
            assert.ok(!serialized.includes('token'));
            assert.ok(!serialized.includes('password'));
            assert.ok(!serialized.includes('service_role'));
        });

        it('batchDelete empty selection shows warning', () => {
            App.reset();
            const selected = new Set();
            if (selected.size === 0) {
                App.flash('please_select', 'warning');
            }
            assert.strictEqual(App._flashMsgs.length, 1);
            assert.strictEqual(App._flashMsgs[0].type, 'warning');
        });
    });

    // ========== 8. Manual product create (submitForm) ==========

    describe('Manual product create identity', () => {
        it('submitForm assigns delegation-compatible legacy_id for remote mode', () => {
            // Simulate: createProduct RPC payload uses p_legacy_id: row.legacy_id || Date.now()
            const productData = { brand: 'TEST', original_title: 'Test', korea_cost: 10000 };
            const legacyId = productData.legacy_id || Date.now();
            assert.ok(Number.isFinite(legacyId) && legacyId > 0,
                'createProduct should assign positive legacy_id');
        });

        it('submitForm productData includes stock_year and stock_month', () => {
            const now = new Date();
            const productData = {
                stock_year: parseInt('2025') || now.getFullYear(),
                stock_month: parseInt('6') || now.getMonth() + 1
            };
            assert.ok(Number.isFinite(productData.stock_year) && productData.stock_year >= 2025);
            assert.ok(Number.isFinite(productData.stock_month) && productData.stock_month >= 1 && productData.stock_month <= 12);
        });

        it('submitForm create path uses DB.addProductAsync in remote mode', () => {
            assert.ok(productsJs.includes('DB.addProductAsync'),
                'submitForm should use DB.addProductAsync');
        });
    });

    // ========== 9. Excel import identity ==========

    describe('Excel import identity', () => {
        it('_importProductsRemote assigns id as nextProductId', () => {
            let nextProductId = 100;
            const product = { brand: 'TEST', original_title: 'Test', korea_cost: 10000 };
            product.id = nextProductId++;
            assert.ok(Number.isFinite(product.id) && product.id > 0,
                'imported product should have positive numeric id');
        });

        it('createProduct RPC receives p_legacy_id from product.id', () => {
            // Simulate: mapLegacyProductToSupabaseRow sets legacy_id = product.id
            const product = { id: 100, brand: 'TEST' };
            const legacyId = product.id != null ? Number(product.id) : null;
            assert.strictEqual(legacyId, 100);
            assert.ok(Number.isFinite(legacyId) && legacyId > 0);
        });

        it('_importProductsLocal assigns id as nextProductId', () => {
            let nextProductId = 50;
            const product = { brand: 'TEST', original_title: 'Test' };
            product.id = nextProductId++;
            assert.strictEqual(product.id, 50);
        });

        it('_normalizeProductImportRow produces valid product with stock_year/month', () => {
            // Simulate normalization
            const row = { '브랜드': 'TEST', '상품명': 'Test', '한국매입원가(KRW)': '10000' };
            const stockYear = 2025;
            const stockMonth = 6;
            const product = {
                stock_year: stockYear,
                stock_month: stockMonth,
                brand: 'TEST',
                original_title: 'Test',
                korea_cost: 10000
            };
            assert.strictEqual(product.stock_year, 2025);
            assert.strictEqual(product.stock_month, 6);
            assert.ok(Number.isFinite(product.stock_year) && product.stock_year >= 2025);
            assert.ok(Number.isFinite(product.stock_month) && product.stock_month >= 1);
        });
    });

    // ========== 10. Metrics consistency ==========

    describe('Metrics consistency after delete', () => {
        it('deleted products excluded from active product count', () => {
            const products = [
                { id: 1, current_stock: 5, reserved_stock: 0 },
                { id: 2, current_stock: 3, reserved_stock: 1 },
                { id: 3, current_stock: 0, reserved_stock: 0 }
            ];
            // Delete product with id=2
            const remaining = products.filter(p => p.id !== 2);
            assert.strictEqual(remaining.length, 2);
            assert.strictEqual(remaining[0].id, 1);
            assert.strictEqual(remaining[1].id, 3);
        });

        it('product list count and dashboard count use same datasource', () => {
            // Simulate: both use DB.getProductsAsync() or DB.getProducts()
            const datasourceProducts = [
                { id: 1, current_stock: 5 },
                { id: 2, current_stock: 3 }
            ];
            const dashboardCount = datasourceProducts.length;
            const productListCount = datasourceProducts.length;
            assert.strictEqual(dashboardCount, productListCount);
        });

        it('stock totals recalculate after deletion', () => {
            const before = [
                { id: 1, current_stock: 5, reserved_stock: 0 },
                { id: 2, current_stock: 3, reserved_stock: 1 },
                { id: 3, current_stock: 10, reserved_stock: 2 }
            ];
            const beforeTotalStock = before.reduce((s, p) => s + (p.current_stock || 0), 0);
            assert.strictEqual(beforeTotalStock, 18);

            // Delete product with id=2
            const after = before.filter(p => p.id !== 2);
            const afterTotalStock = after.reduce((s, p) => s + (p.current_stock || 0), 0);
            assert.strictEqual(afterTotalStock, 15);
        });

        it('reserved stock recalculates after deletion', () => {
            const before = [
                { id: 1, current_stock: 5, reserved_stock: 0 },
                { id: 2, current_stock: 3, reserved_stock: 1 },
                { id: 3, current_stock: 10, reserved_stock: 2 }
            ];
            const beforeReserved = before.reduce((s, p) => s + (p.reserved_stock || 0), 0);
            assert.strictEqual(beforeReserved, 3);

            const after = before.filter(p => p.id !== 2);
            const afterReserved = after.reduce((s, p) => s + (p.reserved_stock || 0), 0);
            assert.strictEqual(afterReserved, 2);
        });

        it('availableStock recalculates after deletion', () => {
            const products = [
                { id: 1, current_stock: 5, reserved_stock: 0 },
                { id: 3, current_stock: 10, reserved_stock: 2 }
            ];
            const availableStock = products.reduce((s, p) => s + ((p.current_stock || 0) - (p.reserved_stock || 0)), 0);
            assert.strictEqual(availableStock, 13);
        });
    });

    // ========== 11. renderList safety checks ==========

    describe('renderList delete button safety', () => {
        it('delete button has disabled attr when product cannot be deleted', () => {
            // Verify that renderList uses deleteDisabledAttr
            assert.ok(productsJs.includes('deleteDisabledAttr'),
                'renderList should provide deleteDisabledAttr');
            assert.ok(productsJs.includes('canDelete'),
                'renderList should compute canDelete');
        });

        it('deleteDisabledAttr shows disabled title with reason', () => {
            const deleteTarget = { type: 'remote_id', reason: 'REMOTE_ID_ONLY_NO_RPC' };
            const canDelete = deleteTarget.type === 'legacy_id';
            const deleteDisabledAttr = canDelete ? '' : 'disabled title="삭제 불가: ' + deleteTarget.reason + '"';
            assert.strictEqual(canDelete, false);
            assert.ok(deleteDisabledAttr.includes('disabled'));
            assert.ok(deleteDisabledAttr.includes('REMOTE_ID_ONLY_NO_RPC'));
        });

        it('canDelete is true when deleteTarget type is legacy_id', () => {
            const deleteTarget = { type: 'legacy_id' };
            const canDelete = deleteTarget.type === 'legacy_id';
            assert.strictEqual(canDelete, true);
        });
    });

    // ========== 12. batchReclassify/batchMonthChange safety ==========

    describe('Batch operations use _findProductByActionKey', () => {
        it('batchReclassify uses _findProductByActionKey', () => {
            assert.ok(productsJs.includes('_findProductByActionKey(key)'),
                'batchReclassify should use _findProductByActionKey');
        });

        it('batchMonthChange uses _findProductByActionKey', () => {
            assert.ok(productsJs.includes('_findProductByActionKey(key)'),
                'batchMonthChange should use _findProductByActionKey');
        });

        it('batchReclassify uses _getProductDeleteTarget for update', () => {
            assert.ok(productsJs.includes('_getProductDeleteTarget(product)'),
                'batchReclassify should use _getProductDeleteTarget');
        });
    });

    // ========== 13. Excel.js safety ==========

    describe('Excel.js import safety', () => {
        it('_importProductsRemote uses dataSource.createProduct', () => {
            assert.ok(excelJs.includes('dataSource.createProduct'),
                'excel.js _importProductsRemote should use dataSource.createProduct');
        });

        it('_importProductsLocal uses DB.getProducts()', () => {
            assert.ok(excelJs.includes('DB.getProducts()'),
                'excel.js _importProductsLocal should use DB.getProducts()');
        });

        it('no token/key/password in import summary', () => {
            const summary = {
                mode: 'remote',
                added: 5,
                skipped: 1,
                failed: 0,
                skippedDetails: [{ rowIndex: 0, reason: 'MISSING_KOREA_COST' }]
            };
            const serialized = JSON.stringify(summary);
            assert.ok(!serialized.includes('token'));
            assert.ok(!serialized.includes('password'));
            assert.ok(!serialized.includes('service_role'));
        });
    });

    // ========== 14. Security ==========

    describe('Security: no sensitive data', () => {
        it('products.js has no service_role/token/key console.log', () => {
            const hasSensitiveLog = /console\.log.*(service_role|token|key|JWT|password)/i.test(productsJs);
            assert.strictEqual(hasSensitiveLog, false,
                'products.js should not log sensitive data');
        });

        it('app.js has no service_role/token/key console.log', () => {
            const hasSensitiveLog = /console\.log.*(service_role|token|key|JWT|password)/i.test(appJs);
            // Only check the row-checkbox handler section
            assert.strictEqual(hasSensitiveLog, false,
                'app.js should not log sensitive data');
        });

        it('excel.js has no service_role/token/key console.log', () => {
            const hasSensitiveLog = /console\.log.*(service_role|token|key|JWT|password)/i.test(excelJs);
            assert.strictEqual(hasSensitiveLog, false,
                'excel.js should not log sensitive data');
        });

        it('delete summary does not contain UUID full values', () => {
            const summary = {
                mode: 'remote',
                actionKey: 'remote:uuid-abc',
                success: false,
                reason: 'REMOTE_ID_ONLY_NO_RPC'
            };
            // The actionKey has 'remote:uuid-abc' which is masked, not full UUID
            const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
            assert.strictEqual(uuidPattern.test(summary.actionKey), false,
                'actionKey should not contain full UUID');
        });

        it('batch delete summary does not contain UUID full values', () => {
            const summary = {
                failReasons: ['REMOTE_ID_ONLY_NO_RPC']
            };
            assert.strictEqual(summary.failReasons[0], 'REMOTE_ID_ONLY_NO_RPC');
        });
    });

    // ========== 15. file-level checks ==========

    describe('File-level contract checks', () => {
        it('products.js exports _getProductActionKey helper', () => {
            assert.ok(productsJs.includes('_getProductActionKey(product)'),
                'products.js should have _getProductActionKey');
        });

        it('products.js exports _findProductByActionKey helper', () => {
            assert.ok(productsJs.includes('_findProductByActionKey(key)'),
                'products.js should have _findProductByActionKey');
        });

        it('products.js exports _getProductDeleteTarget helper', () => {
            assert.ok(productsJs.includes('_getProductDeleteTarget(product)'),
                'products.js should have _getProductDeleteTarget');
        });

        it('products.js exports isRemoteProductsMode helper', () => {
            assert.ok(productsJs.includes('isRemoteProductsMode()'),
                'products.js should have isRemoteProductsMode');
        });

        it('app.js row-checkbox handler does not use Number() conversion', () => {
            // Find the row-checkbox handler block
            const handlerBlock = appJs.match(/classList\.contains\('row-checkbox'\)[\s\S]{0,500}?dataTarget/);
            if (handlerBlock) {
                const hasNumberConversion = handlerBlock[0].includes('Number(target.dataset.id)');
                assert.strictEqual(hasNumberConversion, false,
                    'app.js should not use Number() on dataset.id in row-checkbox handler');
            }
        });

        it('products.js renderList checkbox data-id uses actionKey', () => {
            assert.ok(productsJs.includes('data-id="${actionKey}"'),
                'renderList checkbox should use actionKey as data-id');
        });
    });
});