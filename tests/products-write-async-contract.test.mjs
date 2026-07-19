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

describe('Products write async boundary contract (W1-W15)', function () {

    it('W1: js/db.js has addProductAsync', function () {
        const content = readFile('js/db.js');
        assert.match(content, /addProductAsync\s*\(/,
            'db.js should have addProductAsync method');
    });

    it('W2: js/db.js has updateProductAsync', function () {
        const content = readFile('js/db.js');
        assert.match(content, /updateProductAsync\s*\(/,
            'db.js should have updateProductAsync method');
    });

    it('W3: js/db.js has deleteProductAsync', function () {
        const content = readFile('js/db.js');
        assert.match(content, /deleteProductAsync\s*\(/,
            'db.js should have deleteProductAsync method');
    });

    it('W4: js/db.js has setProductsAsync', function () {
        const content = readFile('js/db.js');
        assert.match(content, /setProductsAsync\s*\(/,
            'db.js should have setProductsAsync method');
    });

    it('W5: write async helpers wrap existing sync localStorage methods with Promise.resolve', function () {
        const content = readFile('js/db.js');
        assert.match(content, /addProductAsync\s*\([^)]*\)\s*\{[\s\S]*?Promise\.resolve\s*\(\s*this\.addProduct\s*\(/,
            'addProductAsync should wrap this.addProduct with Promise.resolve');
        assert.match(content, /updateProductAsync\s*\([^)]*\)\s*\{[\s\S]*?Promise\.resolve\s*\(\s*this\.updateProduct\s*\(/,
            'updateProductAsync should wrap this.updateProduct with Promise.resolve');
        assert.match(content, /deleteProductAsync\s*\([^)]*\)\s*\{[\s\S]*?Promise\.resolve\s*\(\s*this\.deleteProduct\s*\(/,
            'deleteProductAsync should wrap this.deleteProduct with Promise.resolve');
        assert.match(content, /setProductsAsync\s*\([^)]*\)\s*\{[\s\S]*?Promise\.resolve\s*\(\s*this\.setProducts\s*\(/,
            'setProductsAsync should wrap this.setProducts with Promise.resolve');
    });

    it('W6: js/db.js has no supabase.from("products") call', function () {
        const content = readFile('js/db.js');
        assert.doesNotMatch(content, /supabase\s*\.\s*from\s*\(\s*['"]products['"]\s*\)/i,
            'db.js should not call supabase.from("products")');
        assert.doesNotMatch(content, /createClient\s*\(/,
            'db.js should not call createClient');
    });

    it('W7: Products write methods are async or use Promise handling', function () {
        const content = readFile('js/products.js');
        const writeMethods = ['submitForm', 'delete', 'batchDelete', 'batchReclassify', 'batchMonthChange'];
        for (const m of writeMethods) {
            const re = new RegExp(`async\\s+${m}\\s*\\(`);
            assert.match(content, re, `Products.${m} should be async function`);
        }
        // submitForm uses await for addProductAsync/updateProductAsync
        assert.match(content, /await\s+DB\.(addProductAsync|updateProductAsync)/,
            'submitForm should await DB write async helper');
        // delete uses await for deleteProductAsync
        assert.match(content, /await\s+DB\.deleteProductAsync/,
            'delete should await DB.deleteProductAsync');
        // batch methods use await for setProductsAsync
        assert.match(content, /await\s+DB\.setProductsAsync/,
            'batch methods should await DB.setProductsAsync');
    });

    it('W8: Products write path has no Supabase insert/update/delete/upsert call', function () {
        const content = readFile('js/products.js');
        assert.doesNotMatch(content, /supabase\s*\.\s*(from|insert|update|delete|upsert|select|rpc)\s*\(/i,
            'products.js should not call Supabase client methods');
        assert.doesNotMatch(content, /createClient\s*\(/,
            'products.js should not call createClient');
    });

    it('W9: localStorage prefix lesoul_gh_ preserved', function () {
        const content = readFile('js/db.js');
        assert.match(content, /prefix:\s*['"]lesoul_gh_['"]/,
            'db.js should keep lesoul_gh_ prefix');
    });

    it('W10: other business modules have no direct Supabase call', function () {
        const otherFiles = [
            'js/orders.js',
            'js/customers.js',
            'js/analytics.js',
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

    it('W11: data_export.json not present', function () {
        const fullPath = join(REPO_ROOT, 'data_export.json');
        assert.ok(!existsSync(fullPath), 'data_export.json should not be present');
    });

    it('W12: js/config.js is not committed (git ignored)', function () {
        const gitignore = readFile('.gitignore');
        const lines = gitignore.split('\n');
        const found = lines.some(line => line.trim() === 'js/config.js' || line.trim() === '/js/config.js');
        assert.ok(found, 'js/config.js should be in .gitignore');
    });

    it('W13: docs state 3-5C is Products write path async boundary only, no Supabase CRUD conversion', function () {
        const results = readFile('docs/SUPABASE_LOCAL_TEST_RESULTS.md');
        assert.match(results, /3-5C.*Products write path/i,
            'SUPABASE_LOCAL_TEST_RESULTS should mention 3-5C Products write path');
        assert.match(results, /no Supabase CRUD conversion|CRUD 전환.*하지 않/i,
            'SUPABASE_LOCAL_TEST_RESULTS should state no Supabase CRUD conversion');
    });

    it('W14: no service_role string in js files', function () {
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

    it('W15: no remote supabase.co URL in code', function () {
        const files = ['js/db.js', 'js/products.js', 'js/app.js'];
        for (const f of files) {
            const content = readFile(f);
            assert.doesNotMatch(content, /https?:\/\/[a-zA-Z0-9\-]+\.supabase\.(co|com|io)/i,
                `${f} should not contain remote supabase URL`);
        }
    });
});
