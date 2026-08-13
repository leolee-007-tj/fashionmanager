import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sql = readFileSync(join(root, 'supabase/migrations/20260813010000_purge_all_order_history.sql'), 'utf8');

describe('Order history purge contract', () => {
    it('deletes linked inventory logs before orders', () => {
        const logs = sql.indexOf('DELETE FROM public.inventory_logs WHERE order_id IS NOT NULL');
        const orders = sql.indexOf('DELETE FROM public.orders');
        assert.ok(logs >= 0 && orders > logs);
    });

    it('resets product reservations', () => {
        assert.match(sql, /UPDATE public\.products[\s\S]*?reserved_stock = 0/);
    });

    it('resets all customer purchase aggregates', () => {
        assert.match(sql, /total_amount = 0/);
        assert.match(sql, /total_profit = 0/);
        assert.match(sql, /order_count = 0/);
        assert.match(sql, /total_quantity = 0/);
        assert.match(sql, /last_order_date = NULL/);
    });

    it('does not delete products, customers, stores, settings, or auth users', () => {
        assert.doesNotMatch(sql, /DELETE FROM public\.products/);
        assert.doesNotMatch(sql, /DELETE FROM public\.customers/);
        assert.doesNotMatch(sql, /DELETE FROM public\.stores/);
        assert.doesNotMatch(sql, /DELETE FROM public\.store_settings/);
        assert.doesNotMatch(sql, /DELETE FROM auth\.users/);
    });
});
