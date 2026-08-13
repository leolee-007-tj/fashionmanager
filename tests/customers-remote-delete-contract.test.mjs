import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../js/customers.js', import.meta.url), 'utf8');

test('customer delete button safely quotes remote UUID', () => {
    assert.match(source, /Customers\.delete\('\$\{c\.id\}'\)/);
});

test('remote customer delete calls the store-scoped soft-delete RPC', () => {
    assert.match(source, /rpc\('soft_delete_customer'/);
    assert.match(source, /p_store_id: storeId/);
    assert.match(source, /p_customer_id: id/);
});

test('customer soft-delete migration is role-scoped and authenticated only', () => {
    const migration = fs.readFileSync(new URL('../supabase/migrations/20260813030000_soft_delete_customer.sql', import.meta.url), 'utf8');
    assert.match(migration, /private\.has_store_role/);
    assert.match(migration, /deleted_at\s*=\s*now\(\)/);
    assert.match(migration, /GRANT EXECUTE[\s\S]*TO authenticated/);
    assert.match(migration, /REVOKE ALL[\s\S]*FROM anon/);
});

test('local customer delete path remains available', () => {
    assert.match(source, /DB\.deleteCustomer\(Number\(id\)\)/);
});
