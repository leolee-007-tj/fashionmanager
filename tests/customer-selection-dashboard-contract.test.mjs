import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const customers = fs.readFileSync(new URL('../js/customers.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');

test('customer selection keeps UUIDs as distinct strings', () => {
    assert.match(customers, /const customerId = String\(id\)/);
    assert.match(customers, /selected\.has\(String\(c\.id\)\)/);
    assert.doesNotMatch(customers, /const numId = Number\(id\)/);
});

test('dashboard shows only recent sale customer, brand, and product columns', () => {
    const start = app.indexOf('async renderDashboard()');
    const end = app.indexOf('// ==================== 분류키워드', start);
    const dashboard = app.slice(start, end);
    assert.match(dashboard, /최근판매/);
    assert.match(dashboard, /<th>고객이름<\/th><th>브랜드<\/th><th>상품<\/th>/);
    assert.doesNotMatch(dashboard, /orders\.order_number/);
    assert.doesNotMatch(dashboard, /dashboard\.low_stock/);
    assert.doesNotMatch(dashboard, /pendingOrders/);
});
