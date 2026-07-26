import { describe, it } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import { join } from 'node:path';

const REPO_ROOT = join(new URL('.', import.meta.url).pathname, '..');

function readFile(relativePath) {
    const fullPath = join(REPO_ROOT, relativePath);
    if (!existsSync(fullPath)) return null;
    return readFileSync(fullPath, 'utf-8');
}

const ORDERS_JS = readFile('js/orders.js');
const APP_JS = readFile('js/app.js');

describe('3-8A.9-A Orders UI Remote Read-only Contract', function () {

    // ============================================================
    // UR1-UR5: remote read-only helpers 존재 확인
    // ============================================================

    it('UR1: orders.js contains isRemoteOrdersMode', function () {
        assert.ok(ORDERS_JS, 'orders.js should exist');
        assert.match(ORDERS_JS, /isRemoteOrdersMode/, 'orders.js should contain isRemoteOrdersMode');
    });

    it('UR2: orders.js contains _loadRemoteDataForRender', function () {
        assert.match(ORDERS_JS, /_loadRemoteDataForRender/, 'orders.js should contain _loadRemoteDataForRender');
    });

    it('UR3: orders.js contains _renderListBody', function () {
        assert.match(ORDERS_JS, /_renderListBody/, 'orders.js should contain _renderListBody');
    });

    it('UR4: orders.js renderList is async', function () {
        assert.match(ORDERS_JS, /async\s+renderList/, 'renderList should be async');
    });

    it('UR5: app.js uses await Orders.renderList()', function () {
        assert.ok(APP_JS, 'app.js should exist');
        assert.match(APP_JS, /await\s+Orders\.renderList\(\)/, 'app.js should use await Orders.renderList()');
    });

    // ============================================================
    // UR6-UR9: remote read-only path uses correct DataSource
    // ============================================================

    it('UR6: _loadRemoteDataForRender uses DB.getOrdersAsync', function () {
        assert.match(ORDERS_JS, /DB\.getOrdersAsync/, 'should use DB.getOrdersAsync for remote orders');
    });

    it('UR7: _loadRemoteDataForRender uses DB.getProductsAsync', function () {
        assert.match(ORDERS_JS, /DB\.getProductsAsync/, 'should use DB.getProductsAsync for remote products');
    });

    it('UR8: _loadRemoteDataForRender uses Supabase customers read-only SELECT', function () {
        assert.match(ORDERS_JS, /from\('customers'\)/, 'should use customers table read');
        assert.match(ORDERS_JS, /\.is\('deleted_at',\s*null\)/, 'should filter deleted_at IS NULL');
    });

    it('UR9: isRemoteOrdersMode checks SupabaseOrdersDataSource name', function () {
        assert.match(ORDERS_JS, /SupabaseOrdersDataSource/, 'should check for SupabaseOrdersDataSource');
    });

    // ============================================================
    // UR10-UR14: forbidden mutation API not called in read-only path
    // ============================================================

    it('UR10: _renderListBody does not call DB.updateProduct', function () {
        // _renderListBody should not contain DB.updateProduct
        const bodyStart = ORDERS_JS.indexOf('_renderListBody(');
        const renderListStart = ORDERS_JS.indexOf('async renderList(');
        const bodyEnd = ORDERS_JS.indexOf('yearOptions', bodyStart);
        const bodySection = bodyEnd > bodyStart ? ORDERS_JS.slice(bodyStart, bodyEnd) : ORDERS_JS.slice(bodyStart);
        assert.doesNotMatch(bodySection, /DB\.updateProduct/, '_renderListBody should not call DB.updateProduct');
    });

    it('UR11: _renderListBody does not call DB.addInventoryLog', function () {
        const bodyStart = ORDERS_JS.indexOf('_renderListBody(');
        const bodyEnd = ORDERS_JS.indexOf('yearOptions', bodyStart);
        const bodySection = bodyEnd > bodyStart ? ORDERS_JS.slice(bodyStart, bodyEnd) : ORDERS_JS.slice(bodyStart);
        assert.doesNotMatch(bodySection, /DB\.addInventoryLog/, '_renderListBody should not call DB.addInventoryLog');
    });

    it('UR12: _renderListBody does not call DB.setOrders', function () {
        const bodyStart = ORDERS_JS.indexOf('_renderListBody(');
        const bodyEnd = ORDERS_JS.indexOf('yearOptions', bodyStart);
        const bodySection = bodyEnd > bodyStart ? ORDERS_JS.slice(bodyStart, bodyEnd) : ORDERS_JS.slice(bodyStart);
        assert.doesNotMatch(bodySection, /DB\.setOrders/, '_renderListBody should not call DB.setOrders');
    });

    it('UR13: _renderListBody does not call DB.setProducts', function () {
        const bodyStart = ORDERS_JS.indexOf('_renderListBody(');
        const bodyEnd = ORDERS_JS.indexOf('yearOptions', bodyStart);
        const bodySection = bodyEnd > bodyStart ? ORDERS_JS.slice(bodyStart, bodyEnd) : ORDERS_JS.slice(bodyStart);
        assert.doesNotMatch(bodySection, /DB\.setProducts/, '_renderListBody should not call DB.setProducts');
    });

    it('UR14: _loadRemoteDataForRender does not call DB.getOrders (sync)', function () {
        // _loadRemoteDataForRender should use DB.getOrdersAsync, not sync DB.getOrders()
        // slice only the _loadRemoteDataForRender function body (between the function start and the next `load()`)
        const loadStart = ORDERS_JS.indexOf('_loadRemoteDataForRender');
        const nextLoad = ORDERS_JS.indexOf('load()', loadStart + 1);
        const loadSection = nextLoad > loadStart ? ORDERS_JS.slice(loadStart, nextLoad) : ORDERS_JS.slice(loadStart);
        assert.doesNotMatch(loadSection, /DB\.getOrders\(\)/, '_loadRemoteDataForRender should not use sync DB.getOrders()');
    });

    // ============================================================
    // UR15-UR17: mutation UI not yet implemented
    // ============================================================

    it('UR15: renderList does not contain createOrder remote submit', function () {
        const renderListStart = ORDERS_JS.indexOf('async renderList(');
        const renderListBodyStart = ORDERS_JS.indexOf('_renderListBody(');
        const renderListSection = renderListBodyStart > renderListStart ? ORDERS_JS.slice(renderListStart, renderListBodyStart) : ORDERS_JS.slice(renderListStart);
        assert.doesNotMatch(renderListSection, /createOrder/, 'renderList should not contain createOrder remote submit');
    });

    it('UR16: renderList does not contain cancelOrder remote submit', function () {
        const renderListStart = ORDERS_JS.indexOf('async renderList(');
        const renderListBodyStart = ORDERS_JS.indexOf('_renderListBody(');
        const renderListSection = renderListBodyStart > renderListStart ? ORDERS_JS.slice(renderListStart, renderListBodyStart) : ORDERS_JS.slice(renderListStart);
        assert.doesNotMatch(renderListSection, /cancelOrder/, 'renderList should not contain cancelOrder remote submit');
    });

    it('UR17: renderList does not contain shipOrder remote submit', function () {
        const renderListStart = ORDERS_JS.indexOf('async renderList(');
        const renderListBodyStart = ORDERS_JS.indexOf('_renderListBody(');
        const renderListSection = renderListBodyStart > renderListStart ? ORDERS_JS.slice(renderListStart, renderListBodyStart) : ORDERS_JS.slice(renderListStart);
        assert.doesNotMatch(renderListSection, /shipOrder/, 'renderList should not contain shipOrder remote submit');
    });

    // ============================================================
    // UR18-UR20: local mode compatibility
    // ============================================================

    it('UR18: renderList local mode uses DB.getOrders (sync)', function () {
        assert.match(ORDERS_JS, /DB\.getOrders\(\)/, 'should still use sync DB.getOrders() for local mode');
    });

    it('UR19: renderList local mode uses DB.getProducts (sync)', function () {
        assert.match(ORDERS_JS, /DB\.getProducts\(\)/, 'should still use sync DB.getProducts() for local mode');
    });

    it('UR20: renderList local mode uses DB.getCustomers (sync)', function () {
        assert.match(ORDERS_JS, /DB\.getCustomers\(\)/, 'should still use sync DB.getCustomers() for local mode');
    });

    // ============================================================
    // UR21-UR22: error handling
    // ============================================================

    it('UR21: _loadRemoteDataForRender has try/catch error handling', function () {
        const loadStart = ORDERS_JS.indexOf('_loadRemoteDataForRender');
        const renderListStart = ORDERS_JS.indexOf('async renderList(');
        const loadSection = renderListStart > loadStart ? ORDERS_JS.slice(loadStart, renderListStart) : ORDERS_JS.slice(loadStart);
        assert.match(loadSection, /try\s*\{/, '_loadRemoteDataForRender should have try/catch');
        assert.match(loadSection, /catch\s*\(/, '_loadRemoteDataForRender should have catch');
    });

    it('UR22: _loadRemoteDataForRender sets empty state on error', function () {
        const loadStart = ORDERS_JS.indexOf('_loadRemoteDataForRender');
        const renderListStart = ORDERS_JS.indexOf('async renderList(');
        const loadSection = renderListStart > loadStart ? ORDERS_JS.slice(loadStart, renderListStart) : ORDERS_JS.slice(loadStart);
        assert.match(loadSection, /this\.state\.orders\s*=\s*\[\]/, 'should set empty orders on error');
    });
});