import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../js/customers.js', import.meta.url), 'utf8');

test('customer delete button safely quotes remote UUID', () => {
    assert.match(source, /Customers\.delete\('\$\{c\.id\}'\)/);
});

test('remote customer delete soft-deletes the selected Supabase row', () => {
    assert.match(source, /from\('customers'\)[\s\S]*?update\(\{ deleted_at: new Date\(\)\.toISOString\(\) \}\)/);
    assert.match(source, /\.eq\('store_id', storeId\)[\s\S]*?\.eq\('id', id\)/);
    assert.match(source, /\.is\('deleted_at', null\)/);
});

test('local customer delete path remains available', () => {
    assert.match(source, /DB\.deleteCustomer\(Number\(id\)\)/);
});
