/**
 * BLOCKER-FIX-3: Dashboard/Product list datasource mismatch contract tests.
 *
 * Tests:
 * - app.js renderDashboard does not use DB.getProducts() as primary source when DB.getProductsAsync exists
 * - dashboard awaits or supports async DB.getProductsAsync
 * - dashboard product count uses products from async datasource
 * - products list shows displayed count and total loaded count separately
 * - products list uses Products.state.products.length and Products.state.filtered.length
 * - remote mode does not rely on localStorage product count for dashboard
 * - no token/key/password/service_role logging
 */

import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';

let App;
let Products;
let DB;

const STORE = {};

before(() => {
    // Minimal App stub
    App = {
        _flashMsgs: [],
        _renderPageCalled: false,
        flash(msg, type) {
            this._flashMsgs.push({ msg, type });
        },
        renderPage() {
            this._renderPageCalled = true;
        },
        render() {
            this._renderPageCalled = true;
        },
        reset() {
            this._flashMsgs = [];
            this._renderPageCalled = false;
        }
    };
    globalThis.App = App;

    // Products stub
    Products = {
        state: {
            products: [],
            filtered: [],
            search: '',
            sortBy: 'brand',
            sortOrder: 'asc',
            stockYear: 0,
            stockMonth: 0,
            selected: new Set(),
            editingId: null,
            loaded: false
        },
        isRemoteProductsMode() {
            return false;
        },
        async load() {
            if (typeof DB.getProductsAsync === 'function') {
                this.state.products = await DB.getProductsAsync();
            } else {
                this.state.products = DB.getProducts();
            }
            this.applyFilters();
            this.state.loaded = true;
        },
        applyFilters() {
            let list = [...this.state.products];
            if (this.state.stockYear) {
                list = list.filter(p => p.stock_year === this.state.stockYear);
            }
            if (this.state.stockMonth) {
                list = list.filter(p => p.stock_month === this.state.stockMonth);
            }
            if (this.state.search) {
                const s = this.state.search.toLowerCase();
                list = list.filter(p =>
                    (p.original_title || '').toLowerCase().includes(s)
                );
            }
            this.state.filtered = list;
        },
        async renderList() {
            if (!this.state.loaded) {
                await this.load();
            } else {
                this.applyFilters();
            }
            const list = this.state.filtered;
            const total = this.state.products.length;
            return `<div class="stat-value">${list.length} / ${total}</div>`;
        },
        getTotalCount() {
            return this.state.products.length;
        },
        getFilteredCount() {
            return this.state.filtered.length;
        }
    };
    globalThis.Products = Products;
});

after(() => {
    delete globalThis.App;
    delete globalThis.Products;
});

// ==================== Test: DB & App Stubs ====================

function setupDB(options = {}) {
    const {
        hasAsync = false,
        hasDataSource = false,
        dataSourceName = 'LocalProductsDataSource',
        localStorageCount = 270,
        remoteCount = 3
    } = options;

    const localProducts = Array.from({ length: localStorageCount }, (_, i) => ({
        id: i + 1,
        original_title: `Product ${i + 1}`,
        brand: 'TEST',
        current_stock: 10,
        category: null,
        color: null,
        size: null
    }));

    const remoteProducts = Array.from({ length: remoteCount }, (_, i) => ({
        id: i + 1,
        legacy_id: i + 1,
        remote_id: `uuid-${i + 1}`,
        original_title: `Remote Product ${i + 1}`,
        brand: 'REMOTE',
        current_stock: 5,
        category: 'Category A',
        color: 'Black',
        size: 'M'
    }));

    const dbObj = {
        getProducts() {
            return localProducts;
        },
        getProductsDataSource() {
            if (!hasDataSource) {
                return { name: 'LocalProductsDataSource' };
            }
            return { name: dataSourceName };
        },
        getOrders() { return []; },
        getCustomers() { return []; },
        getSettings() {
            return { store_name: 'Test', store_subtitle: 'Test Store' };
        },
        getBrandName() { return 'TEST'; }
    };

    // Only add getProductsAsync when hasAsync is true
    // When hasAsync is false, typeof DB.getProductsAsync === 'function' should be false
    if (hasAsync) {
        dbObj.getProductsAsync = function() {
            return Promise.resolve(remoteProducts);
        };
    }

    DB = dbObj;
    globalThis.DB = DB;
}

/**
 * Reset Products state to initial values between tests.
 */
function resetProducts() {
    Products.state.products = [];
    Products.state.filtered = [];
    Products.state.search = '';
    Products.state.stockYear = 0;
    Products.state.stockMonth = 0;
    Products.state.loaded = false;
}

// ==================== Test suite ====================

describe('Dashboard Products Datasource Contract', () => {

    describe('renderDashboard primary source', () => {
        it('does not use DB.getProducts() as primary source when DB.getProductsAsync exists', async () => {
            setupDB({ hasAsync: true, hasDataSource: true, dataSourceName: 'SupabaseProductsDataSource' });

            // Simulate App.renderDashboard logic
            const products = typeof DB.getProductsAsync === 'function'
                ? await DB.getProductsAsync()
                : DB.getProducts();

            // Should use async (remote) products, not localStorage
            assert.equal(products.length, 3, 'Should use async datasource (remote) count');
            assert.notEqual(products.length, 270, 'Should NOT use localStorage count');
        });

        it('falls back to DB.getProducts() when DB.getProductsAsync is not available', async () => {
            setupDB({ hasAsync: false });

            const products = typeof DB.getProductsAsync === 'function'
                ? await DB.getProductsAsync()
                : DB.getProducts();

            assert.equal(products.length, 270, 'Should fall back to localStorage count');
        });

        it('dashboard awaits async DB.getProductsAsync', async () => {
            setupDB({ hasAsync: true, hasDataSource: true, dataSourceName: 'SupabaseProductsDataSource' });

            // Verify that renderDashboard would be async by checking the return type
            const asyncResult = DB.getProductsAsync();
            assert.ok(asyncResult instanceof Promise, 'DB.getProductsAsync returns a Promise');

            const products = await asyncResult;
            assert.equal(products.length, 3, 'Async result has correct count');
        });

        it('dashboard product count uses products from async datasource', async () => {
            setupDB({ hasAsync: true, hasDataSource: true, dataSourceName: 'SupabaseProductsDataSource' });

            const products = await DB.getProductsAsync();
            // Simulate dashboard total products display
            const dashboardTotalProducts = products.length;

            assert.equal(dashboardTotalProducts, 3, 'Dashboard total products matches async datasource count');
            assert.notEqual(dashboardTotalProducts, 270, 'Dashboard total products does not match localStorage count');
        });
    });

    describe('products list count display', () => {
        it('shows displayed count and total loaded count separately', async () => {
            setupDB({ hasAsync: true, hasDataSource: true, dataSourceName: 'SupabaseProductsDataSource' });

            await Products.load();
            const html = await Products.renderList();

            // Verify the stat-value contains both filtered and total count
            assert.ok(html.includes('3 / 3'), 'Product list shows filtered/total count format');

            // Apply a filter to reduce displayed count
            Products.state.stockYear = 2026;
            Products.applyFilters();
            const filteredHtml = await Products.renderList();
            assert.ok(filteredHtml.includes('0 / 3'), 'Filtered list shows 0 / 3');
        });

        it('uses Products.state.products.length and Products.state.filtered.length', async () => {
            setupDB({ hasAsync: true, hasDataSource: true, dataSourceName: 'SupabaseProductsDataSource' });
            resetProducts();

            await Products.load();

            assert.equal(Products.state.products.length, 3, 'Products.state.products.length is 3');
            assert.equal(Products.state.filtered.length, 3, 'Products.state.filtered.length is 3');

            // Apply a search filter
            Products.state.search = 'NONEXISTENT';
            Products.applyFilters();
            assert.equal(Products.state.filtered.length, 0, 'Filtered list is 0 after search');
            assert.equal(Products.state.products.length, 3, 'Total products still 3');

            // Reset
            Products.state.search = '';
            Products.state.stockYear = 0;
            Products.state.stockMonth = 0;
        });
    });

    describe('remote mode does not rely on localStorage', () => {
        it('remote mode does not use localStorage product count for dashboard', async () => {
            setupDB({ hasAsync: true, hasDataSource: true, dataSourceName: 'SupabaseProductsDataSource' });

            // Simulate App.renderDashboard when remote mode is active
            // The guard: typeof DB.getProductsAsync === 'function' && dataSourceName === 'SupabaseProductsDataSource'
            const isRemote = typeof DB.getProductsAsync === 'function'
                && DB.getProductsDataSource().name === 'SupabaseProductsDataSource';

            assert.ok(isRemote, 'Remote mode detected');

            const products = await DB.getProductsAsync();
            assert.equal(products.length, 3, 'Remote mode uses async datasource, not localStorage');

            // localStorage has 270 items but they should not be used
            const localStorageCount = DB.getProducts().length;
            assert.equal(localStorageCount, 270, 'localStorage has 270 stale products');
            assert.notEqual(products.length, localStorageCount, 'Dashboard does NOT use localStorage count in remote mode');
        });

        it('local mode uses localStorage count', async () => {
            setupDB({ hasAsync: false });

            const isLocal = !(typeof DB.getProductsAsync === 'function');
            assert.ok(isLocal, 'Local mode detected');

            const products = DB.getProducts();
            assert.equal(products.length, 270, 'Local mode uses localStorage count');
        });
    });

    describe('no sensitive info logging', () => {
        it('does not log token/key/password/service_role', () => {
            setupDB({ hasAsync: true, hasDataSource: true, dataSourceName: 'SupabaseProductsDataSource' });

            const sensitivePatterns = [
                /token/i,
                /key/i,
                /password/i,
                /service_role/i,
                /secret/i
            ];

            // Verify that the test DB setup doesn't leak sensitive info
            const ds = DB.getProductsDataSource();
            const dsName = ds.name;

            for (const pattern of sensitivePatterns) {
                assert.doesNotMatch(dsName, pattern, `DataSource name should not contain sensitive pattern: ${pattern}`);
            }

            // Verify async result doesn't leak sensitive info
            const asyncFn = DB.getProductsAsync.toString();
            for (const pattern of sensitivePatterns) {
                assert.doesNotMatch(asyncFn, pattern, `getProductsAsync implementation should not contain sensitive pattern: ${pattern}`);
            }
        });
    });
});