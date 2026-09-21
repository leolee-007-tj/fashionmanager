import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('js/smart-inventory-importer.js', 'utf8');
const index = readFileSync('index.html', 'utf8');

test('smart preview is hydrated from current Supabase data', () => {
    assert.match(source, /await this\._hydrateRemotePreview\(preview\)/);
    assert.match(source, /DB\.getProductsAsync\(\)/);
    assert.match(source, /client\.from\('customers'\)\.select\('id,name'\)/);
});

test('sales import accepts rows without a brand when title and customer exist', () => {
    assert.match(source, /salesRows = extractedData\.salesRows\.filter\(r => r\.title && r\.customerName\)/);
    assert.doesNotMatch(source, /salesRows = extractedData\.salesRows\.filter\(r => r\.title && r\.brand && r\.customerName\)/);
});

test('post-save refresh waits for products orders customers and analytics', () => {
    assert.match(source, /async _refreshLiveDataAfterSave/);
    assert.match(source, /Promise\.allSettled\(refreshTasks\)/);
    assert.match(source, /Orders\._loadRemoteDataForRender\(\)/);
    assert.match(source, /Customers\.loadAsync\(\)/);
    assert.match(source, /Analytics\._loadAnalyticsData\(\)/);
    assert.match(source, /await this\._refreshLiveDataAfterSave\(target, summary\)/);
});

test('save result exposes inserted duplicate and skipped sales counts', () => {
    assert.match(source, /ordersDuplicates: 0/);
    assert.match(source, /summary\.ordersDuplicates = Number\(importResult\?\.duplicates\)/);
    assert.match(source, /id = 'smartImportExecutionResult'/);
    assert.match(source, /저장된 결과 바로 보기/);
});

test('save is single-flight and browser cache version is bumped', () => {
    assert.match(source, /if \(this\._saving\)/);
    assert.match(source, /await this\._executeSave\(preview, target\)/);
    assert.match(index, /smart-inventory-importer\.js\?v=20260921c/);
});
