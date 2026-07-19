import { describe, it } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import { join } from 'node:path';

const REPO_ROOT = join(new URL('.', import.meta.url).pathname, '..');

function readFile(relativePath) {
    const fullPath = join(REPO_ROOT, relativePath);
    assert.ok(existsSync(fullPath), `File should exist: ${relativePath}`);
    return readFileSync(fullPath, 'utf-8');
}

describe('Products read async boundary contract (P1-P13)', function () {

    it('P1: js/db.js has getProductsAsync or products read async helper', function () {
        const content = readFile('js/db.js');
        assert.match(content, /getProductsAsync\s*\(/,
            'db.js should have getProductsAsync method');
        assert.match(content, /getDataSourceMode\s*\(/,
            'db.js should have getDataSourceMode helper');
        assert.match(content, /isAsyncBoundaryEnabled\s*\(/,
            'db.js should have isAsyncBoundaryEnabled helper');
    });

    it('P2: getProductsAsync is based on localStorage / existing getProducts', function () {
        const content = readFile('js/db.js');
        assert.match(content, /getProductsAsync\s*\(\s*\)\s*\{[\s\S]*?Promise\.resolve\s*\(\s*this\.getProducts\s*\(\s*\)\s*\)/,
            'getProductsAsync should wrap this.getProducts() with Promise.resolve');
    });

    it('P3: js/db.js has no supabase.from("products") call', function () {
        const content = readFile('js/db.js');
        assert.doesNotMatch(content, /supabase\s*\.\s*from\s*\(\s*['"]products['"]\s*\)/i,
            'db.js should not call supabase.from("products")');
        assert.doesNotMatch(content, /createClient\s*\(/,
            'db.js should not call createClient');
    });

    it('P4: js/products.js read path has await or Promise handling', function () {
        const content = readFile('js/products.js');
        assert.match(content, /async\s+load\s*\(/,
            'Products.load should be async function');
        assert.match(content, /await\s+DB\.getProductsAsync/,
            'Products.load should await DB.getProductsAsync');
        assert.match(content, /async\s+renderList\s*\(/,
            'Products.renderList should be async function');
        assert.match(content, /await\s+this\.load/,
            'Products.renderList should await this.load');
    });

    it('P5: Products write methods have no Supabase call', function () {
        const content = readFile('js/products.js');
        const writeMethods = ['submitForm', 'delete', 'batchDelete', 'batchReclassify', 'batchMonthChange'];
        for (const m of writeMethods) {
            const re = new RegExp(`${m}\\s*\\([^)]*\\)\\s*\\{`);
            const match = content.match(re);
            if (!match) continue;
            const startIdx = match.index + match[0].length;
            const bodySlice = content.slice(startIdx, startIdx + 3000);
            assert.doesNotMatch(bodySlice, /supabase\s*\.\s*(from|insert|update|delete|upsert|select|rpc)\s*\(/i,
                `Products.${m} should not contain Supabase CRUD calls`);
        }
        assert.doesNotMatch(content, /createClient\s*\(/,
            'products.js should not call createClient');
    });

    it('P6: other business modules unchanged or no direct Supabase call', function () {
        const otherFiles = [
            'js/orders.js',
            'js/customers.js',
            'js/expenses.js',
            'js/settings.js'
        ];
        for (const f of otherFiles) {
            const content = readFile(f);
            assert.doesNotMatch(
                content,
                /supabase\s*\.\s*(from|insert|update|delete|upsert|select|rpc)\s*\(/i,
                `${f} should not call Supabase client methods`
            );
            assert.doesNotMatch(content, /createClient\s*\(/,
                `${f} should not call createClient`);
        }
    });

    it('P7: localStorage prefix lesoul_gh_ preserved', function () {
        const content = readFile('js/db.js');
        assert.match(content, /prefix:\s*['"]lesoul_gh_['"]/,
            'db.js should keep lesoul_gh_ prefix');
    });

    it('P8: data_export.json not present', function () {
        const fullPath = join(REPO_ROOT, 'data_export.json');
        assert.ok(!existsSync(fullPath), 'data_export.json should not be present');
    });

    it('P9: js/config.js is not committed (git ignored)', function () {
        const gitignore = readFile('.gitignore');
        const lines = gitignore.split('\n');
        const found = lines.some(line => line.trim() === 'js/config.js' || line.trim() === '/js/config.js');
        assert.ok(found, 'js/config.js should be in .gitignore');
    });

    it('P10: docs explicitly state 3-5B is Products read path only, no CRUD conversion', function () {
        const results = readFile('docs/SUPABASE_LOCAL_TEST_RESULTS.md');
        assert.match(results, /3-5B.*Products read path/i,
            'SUPABASE_LOCAL_TEST_RESULTS should mention 3-5B Products read path');
        assert.match(results, /no CRUD conversion|CRUD 전환.*하지 않/i,
            'SUPABASE_LOCAL_TEST_RESULTS should state no CRUD conversion');
    });

    it('P11: ASYNC_MIGRATION_MAP records Products read path stage', function () {
        const content = readFile('docs/ASYNC_MIGRATION_MAP.md');
        assert.match(content, /3-5B/i,
            'ASYNC_MIGRATION_MAP should mention 3-5B stage');
        assert.match(content, /Products read path/i,
            'ASYNC_MIGRATION_MAP should mention Products read path');
    });

    it('P12: no service_role string in js files', function () {
        const files = ['js/db.js', 'js/products.js', 'js/app.js'];
        for (const f of files) {
            const content = readFile(f);
            assert.doesNotMatch(content, /service_role\s*key\s*[:=]\s*['"][A-Za-z0-9_\-]{20,}/i,
                `${f} should not contain actual service_role key value`);
            const matches = content.match(/service_role/gi);
            if (matches) {
                for (const m of matches) {
                    const idx = content.toLowerCase().indexOf(m.toLowerCase());
                    const context = content.slice(Math.max(0, idx - 40), idx + 40);
                    if (/금지|prohibit|no.*browser/i.test(context)) continue;
                    assert.fail(`${f} should not contain service_role usage: ${context}`);
                }
            }
        }
    });

    it('P13: no remote supabase.co URL in code', function () {
        const files = ['js/db.js', 'js/products.js', 'js/app.js'];
        for (const f of files) {
            const content = readFile(f);
            assert.doesNotMatch(content, /https?:\/\/[a-zA-Z0-9\-]+\.supabase\.(co|com|io)/i,
                `${f} should not contain remote supabase URL`);
        }
    });
});
