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

    it('does not mix local expenses into remote analytics', () => {
        const start = source.indexOf('async _loadAnalyticsData()');
        const end = source.indexOf('_getSettings()', start);
        assert.match(source.slice(start, end), /this\.state\.expenses = \[\]/);
    });

    it('counts only shipped or completed orders', () => {
        assert.match(source, /o\.status === 'SHIPPED' \|\| o\.status === 'COMPLETED'/);
    });
});
