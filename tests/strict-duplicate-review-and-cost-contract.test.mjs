import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const importer = readFileSync('js/smart-inventory-importer.js', 'utf8');
const settings = readFileSync('js/settings.js', 'utf8');
const migration = readFileSync('supabase/migrations/20260814100000_strict_duplicate_review.sql', 'utf8');

test('smart import resolves Korea cost by header and never by row position', () => {
    assert.match(importer, /_getFieldValue\(rowObj, fieldMap, 'cost'\)/);
    assert.doesNotMatch(importer, /dColumnCost|row\[3\].*cost/i);
});

test('settings exposes review, select-all, selected-delete, and direct cleanup', () => {
    assert.match(settings, /loadDuplicateReview/);
    assert.match(settings, /selectAllDuplicateCandidates/);
    assert.match(settings, /deleteSelectedDuplicates/);
    assert.match(settings, /cleanup_strict_duplicates/);
    assert.match(settings, /strict-duplicate-checkbox:not\(:disabled\)/);
});

test('strict duplicate RPC protects canonical records and scopes owner access', () => {
    assert.match(migration, /list_strict_duplicates/);
    assert.match(migration, /delete_strict_duplicates/);
    assert.match(migration, /cleanup_strict_duplicates/);
    assert.match(migration, /NOT is_keeper/);
    assert.match(migration, /Owner permission required/);
});

test('strict product and sale identities include all required business fields', () => {
    assert.match(migration, /round\(COALESCE\(x\.korea_cost, 0\)\)/);
    assert.match(migration, /COALESCE\(x\.stock_year, 0\)/);
    assert.match(migration, /COALESCE\(x\.stock_month, 0\)/);
    assert.match(migration, /x\.quantity, x\.selling_price/);
    assert.match(migration, /brand_snapshot/);
});
