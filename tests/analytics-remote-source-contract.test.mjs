import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(root, 'js/analytics.js'), 'utf8');

describe('Analytics remote source contract', () => {
    it('loads remote orders and products asynchronously', () => {
        assert.match(source, /DB\.getOrdersAsync\(\)/);
        assert.match(source, /DB\.getProductsAsync\(\)/);
        assert.match(source, /await this\._loadAnalyticsData\(\)/);
    });

    it('loads Supabase expenses without mixing local expenses', () => {
        const start = source.indexOf('async _loadAnalyticsData()');
        const end = source.indexOf('_getSettings()', start);
        const section = source.slice(start, end);
        assert.match(section, /from\('expenses'\)/);
        assert.match(section, /this\.state\.expenses = expenseResult\.data \|\| \[\]/);
    });

    it('continuously isolates remote analytics from local orders and expenses', () => {
        const start = source.indexOf('async _loadAnalyticsData()');
        const end = source.indexOf('_getSettings()', start);
        const section = source.slice(start, end);
        assert.match(section, /lesoul_gh_remote_analytics_cleanup_v2/);
        assert.match(section, /DB\.setOrders\(\[\]\)/);
        assert.match(section, /DB\.setExpenses\(\[\]\)/);
        assert.doesNotMatch(section, /if\s*\(localStorage\.getItem/);
        assert.doesNotMatch(section, /DB\.setProducts\(\[\]\)/);
        assert.doesNotMatch(section, /DB\.setCustomers\(\[\]\)/);
        assert.doesNotMatch(section, /clearAllData/);
    });

    it('counts only shipped or completed orders', () => {
        assert.match(source, /o\.status === 'SHIPPED' \|\| o\.status === 'COMPLETED'/);
    });

    it('calculates cost from product Korea cost and manager exchange divisor', () => {
        assert.match(source, /Number\(product\.korea_cost\) \/ divisor/);
        assert.match(source, /this\._getSettings\(\)\.exchange_divisor/);
    });

    it('calculates net profit and net profit margin after expenses', () => {
        assert.match(source, /const netProfit = profit - totalExpense/);
        assert.match(source, /const netProfitMargin = totalRevenue > 0 \? \(netProfit \/ totalRevenue \* 100\)/);
    });

    it('loads and uses remote store settings', () => {
        assert.match(source, /from\('store_settings'\)/);
        assert.match(source, /this\.state\.settings = settingsResult\.data\?\.\[0\] \|\| null/);
    });
});
