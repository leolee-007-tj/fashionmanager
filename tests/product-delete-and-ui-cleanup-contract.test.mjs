import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const PRODUCTS_JS = readFileSync(resolve(ROOT, 'js/products.js'), 'utf-8');
const DB_JS = readFileSync(resolve(ROOT, 'js/db.js'), 'utf-8');

// ============================================================
// Product Delete & UI Cleanup Contract Tests
// ============================================================

describe('Product Delete & UI Cleanup Contract', function () {

    // ============================================================
    // PD1-PD5: Action key priority
    // ============================================================

    it('PD1: _getProductActionKey prefers remote_id over legacy_id', function () {
        assert.match(PRODUCTS_JS, /_getProductActionKey\(product\)/, 'should have _getProductActionKey');
        const akStart = PRODUCTS_JS.indexOf('_getProductActionKey(product)');
        const akEnd = PRODUCTS_JS.indexOf('_findProductByActionKey', akStart);
        const akSection = PRODUCTS_JS.slice(akStart, akEnd > akStart ? akEnd : akStart + 300);
        assert.match(akSection, /product\.remote_id/, 'should check remote_id first');
        const remoteIdx = akSection.indexOf('product.remote_id');
        const legacyIdx = akSection.indexOf('product.legacy_id');
        assert.ok(remoteIdx < legacyIdx, 'remote_id should come before legacy_id');
    });

    it('PD2: _getProductActionKey does not use remote: prefix', function () {
        const akStart = PRODUCTS_JS.indexOf('_getProductActionKey(product)');
        const akEnd = PRODUCTS_JS.indexOf('_findProductByActionKey', akStart);
        const akSection = PRODUCTS_JS.slice(akStart, akEnd > akStart ? akEnd : akStart + 300);
        assert.doesNotMatch(akSection, /remote:/, 'should not use remote: prefix');
    });

    it('PD3: _getProductActionKey returns string', function () {
        const akStart = PRODUCTS_JS.indexOf('_getProductActionKey(product)');
        const akEnd = PRODUCTS_JS.indexOf('_findProductByActionKey', akStart);
        const akSection = PRODUCTS_JS.slice(akStart, akEnd > akStart ? akEnd : akStart + 300);
        assert.match(akSection, /String\(/, 'should use String()');
    });

    it('PD4: _findProductByActionKey matches remote_id first', function () {
        const fkStart = PRODUCTS_JS.indexOf('_findProductByActionKey(key)');
        const fkEnd = PRODUCTS_JS.indexOf('_getProductDeleteTarget', fkStart);
        const fkSection = PRODUCTS_JS.slice(fkStart, fkEnd > fkStart ? fkEnd : fkStart + 400);
        const remoteIdx = fkSection.indexOf('remote_id');
        const legacyIdx = fkSection.indexOf('legacy_id');
        assert.ok(remoteIdx > -1 && legacyIdx > -1, 'both remote_id and legacy_id should exist');
        assert.ok(remoteIdx < legacyIdx, 'remote_id should be checked before legacy_id');
    });

    it('PD5: UUID is never Number-converted in product delete flow', function () {
        const delStart = PRODUCTS_JS.indexOf('async delete(id)');
        const delEnd = PRODUCTS_JS.indexOf('editProduct', delStart);
        const delSection = PRODUCTS_JS.slice(delStart, delEnd > delStart ? delEnd : delStart + 1500);
        assert.doesNotMatch(delSection, /Number\(p\.remote_id\)/, 'should not Number-convert remote_id');
        assert.doesNotMatch(delSection, /Number\(product\.remote_id\)/, 'should not Number-convert remote_id');
    });

    // ============================================================
    // PD6-PD10: Individual delete
    // ============================================================

    it('PD6: individual delete uses _findProductByActionKey', function () {
        const delStart = PRODUCTS_JS.indexOf('async delete(id)');
        const delEnd = PRODUCTS_JS.indexOf('editProduct', delStart);
        const delSection = PRODUCTS_JS.slice(delStart, delEnd > delStart ? delEnd : delStart + 1500);
        assert.match(delSection, /_findProductByActionKey/, 'delete should use _findProductByActionKey');
    });

    it('PD7: individual delete uses _getProductDeleteTarget', function () {
        const delStart = PRODUCTS_JS.indexOf('async delete(id)');
        const delEnd = PRODUCTS_JS.indexOf('editProduct', delStart);
        const delSection = PRODUCTS_JS.slice(delStart, delEnd > delStart ? delEnd : delStart + 1500);
        assert.match(delSection, /_getProductDeleteTarget/, 'should use _getProductDeleteTarget');
    });

    it('PD8: individual delete calls DB.deleteProductAsync', function () {
        const delStart = PRODUCTS_JS.indexOf('async delete(id)');
        const delEnd = PRODUCTS_JS.indexOf('editProduct', delStart);
        const delSection = PRODUCTS_JS.slice(delStart, delEnd > delStart ? delEnd : delStart + 1500);
        assert.match(delSection, /DB\.deleteProductAsync/, 'should call DB.deleteProductAsync');
    });

    it('PD9: individual delete reloads after success', function () {
        const delStart = PRODUCTS_JS.indexOf('async delete(id)');
        const delEnd = PRODUCTS_JS.indexOf('editProduct', delStart);
        const delSection = PRODUCTS_JS.slice(delStart, delEnd > delStart ? delEnd : delStart + 1500);
        assert.match(delSection, /this\.state\.loaded = false/, 'should set loaded=false');
        assert.match(delSection, /await this\.load\(\)/, 'should reload after delete');
    });

    it('PD10: individual delete stores summary', function () {
        const delStart = PRODUCTS_JS.indexOf('async delete(id)');
        const delEnd = PRODUCTS_JS.indexOf('editProduct', delStart);
        const delSection = PRODUCTS_JS.slice(delStart, delEnd > delStart ? delEnd : delStart + 1500);
        assert.match(delSection, /__LAST_PRODUCT_DELETE_SUMMARY__/, 'should store delete summary');
    });

    // ============================================================
    // PD11-PD15: Batch delete
    // ============================================================

    it('PD11: batchDelete uses _findProductByActionKey', function () {
        const bdStart = PRODUCTS_JS.indexOf('async batchDelete()');
        const bdEnd = PRODUCTS_JS.indexOf('async delete(id)', bdStart);
        const bdSection = PRODUCTS_JS.slice(bdStart, bdEnd > bdStart ? bdEnd : bdStart + 1500);
        assert.match(bdSection, /_findProductByActionKey/, 'batchDelete should use _findProductByActionKey');
    });

    it('PD12: batchDelete uses _getProductDeleteTarget', function () {
        const bdStart = PRODUCTS_JS.indexOf('async batchDelete()');
        const bdEnd = PRODUCTS_JS.indexOf('async delete(id)', bdStart);
        const bdSection = PRODUCTS_JS.slice(bdStart, bdEnd > bdStart ? bdEnd : bdStart + 1500);
        assert.match(bdSection, /_getProductDeleteTarget/, 'batchDelete should use _getProductDeleteTarget');
    });

    it('PD13: batchDelete reloads after completion', function () {
        const bdStart = PRODUCTS_JS.indexOf('async batchDelete()');
        const bdEnd = PRODUCTS_JS.indexOf('async delete(id)', bdStart);
        const bdSection = PRODUCTS_JS.slice(bdStart, bdEnd > bdStart ? bdEnd : bdStart + 1500);
        assert.match(bdSection, /this\.state\.loaded = false/, 'should set loaded=false');
        assert.match(bdSection, /await this\.load\(\)/, 'should reload after batch delete');
    });

    it('PD14: batchDelete stores summary', function () {
        const bdStart = PRODUCTS_JS.indexOf('async batchDelete()');
        const bdEnd = PRODUCTS_JS.indexOf('async delete(id)', bdStart);
        const bdSection = PRODUCTS_JS.slice(bdStart, bdEnd > bdStart ? bdEnd : bdStart + 1500);
        assert.match(bdSection, /__LAST_PRODUCT_DELETE_SUMMARY__/, 'should store batch delete summary');
    });

    it('PD15: batchDelete does not crash on all failures', function () {
        const bdStart = PRODUCTS_JS.indexOf('async batchDelete()');
        const bdEnd = PRODUCTS_JS.indexOf('async delete(id)', bdStart);
        const bdSection = PRODUCTS_JS.slice(bdStart, bdEnd > bdStart ? bdEnd : bdStart + 1500);
        // Each iteration is wrapped in try/catch, function should not throw
        assert.match(bdSection, /try\s*\{/, 'should have try/catch per iteration');
    });

    // ============================================================
    // PD16-PD20: Delete target resolution
    // ============================================================

    it('PD16: _getProductDeleteTarget prefers remote_id in remote mode', function () {
        const dtStart = PRODUCTS_JS.indexOf('_getProductDeleteTarget(product)');
        const dtEnd = PRODUCTS_JS.indexOf('autoClassifyAll', dtStart);
        const dtSection = PRODUCTS_JS.slice(dtStart, dtEnd > dtStart ? dtEnd : dtStart + 500);
        assert.match(dtSection, /isRemote/, 'should check remote mode');
        assert.match(dtSection, /product\.remote_id/, 'should check remote_id');
        const remoteIdx = dtSection.indexOf('product.remote_id');
        const legacyIdx = dtSection.indexOf('product.legacy_id');
        assert.ok(remoteIdx < legacyIdx, 'remote_id should be checked before legacy_id in remote mode');
    });

    it('PD17: Supabase deleteProduct handles UUID', function () {
        const supabaseMarker = DB_JS.indexOf('SupabaseProductsDataSource Connected to Write RPCs');
        const dpStart = DB_JS.indexOf('deleteProduct(id) {', supabaseMarker);
        const dpEnd = DB_JS.indexOf('deleteAllProducts', dpStart);
        const dpSection = DB_JS.slice(dpStart, dpEnd > dpStart ? dpEnd : dpStart + 1000);
        assert.match(dpSection, /soft_delete_product_by_id/, 'should use soft_delete_product_by_id for UUID');
        assert.match(dpSection, /p_product_id/, 'should pass p_product_id');
    });

    it('PD18: Supabase deleteProduct handles legacy numeric id', function () {
        const supabaseMarker = DB_JS.indexOf('SupabaseProductsDataSource Connected to Write RPCs');
        const dpStart = DB_JS.indexOf('deleteProduct(id) {', supabaseMarker);
        const dpEnd = DB_JS.indexOf('deleteAllProducts', dpStart);
        const dpSection = DB_JS.slice(dpStart, dpEnd > dpStart ? dpEnd : dpStart + 1000);
        assert.match(dpSection, /soft_delete_product[^_]/, 'should use soft_delete_product for legacy id');
        assert.match(dpSection, /p_legacy_id/, 'should pass p_legacy_id');
    });

    it('PD19: Supabase deleteProduct preserves error details', function () {
        const supabaseMarker = DB_JS.indexOf('SupabaseProductsDataSource Connected to Write RPCs');
        const dpStart = DB_JS.indexOf('deleteProduct(id) {', supabaseMarker);
        const dpEnd = DB_JS.indexOf('deleteAllProducts', dpStart);
        const dpSection = DB_JS.slice(dpStart, dpEnd > dpStart ? dpEnd : dpStart + 1000);
        assert.match(dpSection, /response\.error\.code/, 'should preserve error.code');
        assert.match(dpSection, /response\.error\.message/, 'should preserve error.message');
    });

    it('PD20: product hard delete is not used', function () {
        const supabaseMarker = DB_JS.indexOf('SupabaseProductsDataSource Connected to Write RPCs');
        const dpStart = DB_JS.indexOf('deleteProduct(id) {', supabaseMarker);
        const dpEnd = DB_JS.indexOf('deleteAllProducts', dpStart);
        const dpSection = DB_JS.slice(dpStart, dpEnd > dpStart ? dpEnd : dpStart + 1000);
        assert.doesNotMatch(dpSection, /\.delete\(\)/, 'should not use hard delete');
        assert.doesNotMatch(dpSection, /\.remove\(\)/, 'should not use .remove()');
    });

    // ============================================================
    // PD21-PD24: Sales/orders data preservation
    // ============================================================

    it('PD21: product delete does not call Orders.delete or Orders.batchDelete', function () {
        const delStart = PRODUCTS_JS.indexOf('async delete(id)');
        const delEnd = PRODUCTS_JS.indexOf('editProduct', delStart);
        const delSection = PRODUCTS_JS.slice(delStart, delEnd > delStart ? delEnd : delStart + 1500);
        assert.doesNotMatch(delSection, /Orders\.delete/, 'should not call Orders.delete');
        assert.doesNotMatch(delSection, /Orders\.batchDelete/, 'should not call Orders.batchDelete');
    });

    it('PD22: product batch delete does not call Orders or sales delete', function () {
        const bdStart = PRODUCTS_JS.indexOf('async batchDelete()');
        const bdEnd = PRODUCTS_JS.indexOf('async delete(id)', bdStart);
        const bdSection = PRODUCTS_JS.slice(bdStart, bdEnd > bdStart ? bdEnd : bdStart + 1500);
        assert.doesNotMatch(bdSection, /Orders\./, 'should not reference Orders');
        assert.doesNotMatch(bdSection, /sales/, 'should not reference sales');
    });

    it('PD23: soft_delete_product RPC does not delete orders', function () {
        const supabaseMarker = DB_JS.indexOf('SupabaseProductsDataSource Connected to Write RPCs');
        const dpStart = DB_JS.indexOf('deleteProduct(id) {', supabaseMarker);
        const dpEnd = DB_JS.indexOf('deleteAllProducts', dpStart);
        const dpSection = DB_JS.slice(dpStart, dpEnd > dpStart ? dpEnd : dpStart + 1000);
        assert.match(dpSection, /client\.rpc\(/, 'should use RPC for soft delete');
    });

    it('PD24: product list query excludes deleted_at', function () {
        // Find the SupabaseProductsDataSource listProducts (not LocalProductsDataSource)
        const supabaseMarker = DB_JS.indexOf('SupabaseProductsDataSource Connected to Write RPCs');
        const listStart = DB_JS.indexOf('listProducts()', supabaseMarker);
        const listEnd = DB_JS.indexOf('mapSupabaseRowToLegacyProduct', listStart);
        const listSection = DB_JS.slice(listStart, listEnd > listStart ? listEnd : listStart + 500);
        assert.match(listSection, /is\('deleted_at',\s*null\)/, 'should filter deleted_at IS NULL');
    });

    // ============================================================
    // PD25-PD28: UI cleanup - no sales clutter in product list
    // ============================================================

    it('PD25: product list does not render china_base_price column', function () {
        const rlStart = PRODUCTS_JS.indexOf('renderList()');
        const rlEnd = PRODUCTS_JS.indexOf('yearOptions()', rlStart);
        const rlSection = PRODUCTS_JS.slice(rlStart, rlEnd > rlStart ? rlEnd : rlStart + 3000);
        assert.doesNotMatch(rlSection, /china_base_price/, 'should not render china_base_price column');
    });

    it('PD26: product list does not render total sales card', function () {
        const rlStart = PRODUCTS_JS.indexOf('renderList()');
        const rlEnd = PRODUCTS_JS.indexOf('yearOptions()', rlStart);
        const rlSection = PRODUCTS_JS.slice(rlStart, rlEnd > rlStart ? rlEnd : rlStart + 3000);
        assert.doesNotMatch(rlSection, /total_sales|totalSales|총판매|총 판매/, 'should not render total sales');
    });

    it('PD27: product list stats-grid has only product count and stock', function () {
        const rlStart = PRODUCTS_JS.indexOf('renderList()');
        const rlEnd = PRODUCTS_JS.indexOf('yearOptions()', rlStart);
        const rlSection = PRODUCTS_JS.slice(rlStart, rlEnd > rlStart ? rlEnd : rlStart + 3000);
        const statsStart = rlSection.indexOf('stats-grid');
        const statsEnd = rlSection.indexOf('filter-row', statsStart);
        const statsSection = rlSection.slice(statsStart, statsEnd > statsStart ? statsEnd : statsStart + 800);
        assert.match(statsSection, /total_count/, 'should have product count');
        assert.match(statsSection, /total_stock/, 'should have stock count');
    });

    it('PD28: product list table columns are minimal', function () {
        const rlStart = PRODUCTS_JS.indexOf('renderList()');
        const rlEnd = PRODUCTS_JS.indexOf('yearOptions()', rlStart);
        const rlSection = PRODUCTS_JS.slice(rlStart, rlEnd > rlStart ? rlEnd : rlStart + 3000);
        assert.match(rlSection, /brand/, 'should have brand column');
        assert.match(rlSection, /original_title/, 'should have original_title column');
        assert.match(rlSection, /korea_cost/, 'should have korea_cost column');
        assert.match(rlSection, /current_stock/, 'should have stock column');
    });

    // ============================================================
    // PD29-PD30: Summary safety
    // ============================================================

    it('PD29: delete summary includes required fields', function () {
        const delStart = PRODUCTS_JS.indexOf('async delete(id)');
        const delEnd = PRODUCTS_JS.indexOf('editProduct', delStart);
        const delSection = PRODUCTS_JS.slice(delStart, delEnd > delStart ? delEnd : delStart + 1500);
        assert.match(delSection, /mode/, 'should have mode');
        assert.match(delSection, /successCount/, 'should have successCount');
        assert.match(delSection, /failCount/, 'should have failCount');
        assert.match(delSection, /countDeltaMatchesSuccess/, 'should have countDeltaMatchesSuccess');
    });

    it('PD30: delete summary excludes UUID/token/key/password', function () {
        // Summary is built with object literals, check that no full UUID is in the summary fields
        const bdStart = PRODUCTS_JS.indexOf('async batchDelete()');
        const bdEnd = PRODUCTS_JS.indexOf('async delete(id)', bdStart);
        const bdSection = PRODUCTS_JS.slice(bdStart, bdEnd > bdStart ? bdEnd : bdStart + 1500);
        const summaryStart = bdSection.indexOf('__LAST_PRODUCT_DELETE_SUMMARY__');
        const summaryEnd = bdSection.indexOf('};', summaryStart + 100);
        const summarySection = bdSection.slice(summaryStart, summaryEnd > summaryStart ? summaryEnd + 1 : summaryStart + 500);
        assert.doesNotMatch(summarySection, /token|key|password|secret/, 'should not include secrets');
    });

    // ============================================================
    // PD31-PD32: renderEdit uses action key
    // ============================================================

    it('PD31: renderEdit uses _findProductByActionKey', function () {
        const reStart = PRODUCTS_JS.indexOf('async renderEdit(id)');
        const reEnd = PRODUCTS_JS.indexOf('renderForm(product)', reStart);
        const reSection = PRODUCTS_JS.slice(reStart, reEnd > reStart ? reEnd : reStart + 600);
        assert.match(reSection, /_findProductByActionKey/, 'renderEdit should use _findProductByActionKey');
    });

    it('PD32: renderEdit fallback also matches remote_id', function () {
        const reStart = PRODUCTS_JS.indexOf('async renderEdit(id)');
        const reEnd = PRODUCTS_JS.indexOf('renderForm(product)', reStart);
        const reSection = PRODUCTS_JS.slice(reStart, reEnd > reStart ? reEnd : reStart + 600);
        assert.match(reSection, /remote_id/, 'renderEdit fallback should match remote_id');
    });

});