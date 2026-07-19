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

describe('Products datasource boundary contract (D1-D16)', function () {

    it('D1: js/db.js has LocalProductsDataSource', function () {
        const content = readFile('js/db.js');
        assert.match(content, /LocalProductsDataSource/,
            'db.js should mention LocalProductsDataSource');
        assert.match(content, /_createLocalProductsDataSource\s*\(/,
            'db.js should have _createLocalProductsDataSource factory');
        assert.match(content, /name:\s*['"]LocalProductsDataSource['"]/,
            'LocalProductsDataSource should have name property');
    });

    it('D2: js/db.js has getProductsDataSource', function () {
        const content = readFile('js/db.js');
        assert.match(content, /getProductsDataSource\s*\(/,
            'db.js should have getProductsDataSource method');
        assert.match(content, /setProductsDataSourceForTesting\s*\(/,
            'db.js should have setProductsDataSourceForTesting');
        assert.match(content, /resetProductsDataSourceForTesting\s*\(/,
            'db.js should have resetProductsDataSourceForTesting');
    });

    it('D3: LocalProductsDataSource has listProducts/createProduct/updateProduct/deleteProduct/setProducts', function () {
        const content = readFile('js/db.js');
        assert.match(content, /listProducts\s*\(/,
            'LocalProductsDataSource should have listProducts');
        assert.match(content, /createProduct\s*\(/,
            'LocalProductsDataSource should have createProduct');
        assert.match(content, /updateProduct\s*\(/,
            'LocalProductsDataSource should have updateProduct');
        assert.match(content, /deleteProduct\s*\(/,
            'LocalProductsDataSource should have deleteProduct');
        assert.match(content, /setProducts\s*\(/,
            'LocalProductsDataSource should have setProducts');
    });

    it('D4: DB.getProductsAsync goes through ProductsDataSource', function () {
        const content = readFile('js/db.js');
        assert.match(content, /getProductsAsync\s*\([^)]*\)\s*\{[\s\S]*?getProductsDataSource\s*\(\s*\)\.listProducts/,
            'getProductsAsync should call getProductsDataSource().listProducts()');
    });

    it('D5: DB async write helpers go through ProductsDataSource', function () {
        const content = readFile('js/db.js');
        assert.match(content, /addProductAsync\s*\([^)]*\)\s*\{[\s\S]*?getProductsDataSource\s*\(\s*\)\.createProduct/,
            'addProductAsync should call getProductsDataSource().createProduct()');
        assert.match(content, /updateProductAsync\s*\([^)]*\)\s*\{[\s\S]*?getProductsDataSource\s*\(\s*\)\.updateProduct/,
            'updateProductAsync should call getProductsDataSource().updateProduct()');
        assert.match(content, /deleteProductAsync\s*\([^)]*\)\s*\{[\s\S]*?getProductsDataSource\s*\(\s*\)\.deleteProduct/,
            'deleteProductAsync should call getProductsDataSource().deleteProduct()');
        assert.match(content, /setProductsAsync\s*\([^)]*\)\s*\{[\s\S]*?getProductsDataSource\s*\(\s*\)\.setProducts/,
            'setProductsAsync should call getProductsDataSource().setProducts()');
    });

    it('D6: LocalProductsDataSource uses existing localStorage-based DB sync methods', function () {
        const content = readFile('js/db.js');
        const factoryMatch = content.match(/_createLocalProductsDataSource\s*\([^)]*\)\s*\{[\s\S]*?db\.getProducts\(\)/);
        assert.ok(factoryMatch, 'LocalProductsDataSource should call db.getProducts()');
        assert.match(content, /db\.setProducts\s*\(/,
            'LocalProductsDataSource should call db.setProducts()');
        assert.match(content, /db\.addProduct\s*\(/,
            'LocalProductsDataSource should call db.addProduct()');
        assert.match(content, /db\.updateProduct\s*\(/,
            'LocalProductsDataSource should call db.updateProduct()');
        assert.match(content, /db\.deleteProduct\s*\(/,
            'LocalProductsDataSource should call db.deleteProduct()');
        assert.match(content, /Promise\.resolve/,
            'LocalProductsDataSource should wrap results with Promise.resolve');
    });

    it('D7: js/db.js has no supabase.from("products") call', function () {
        const content = readFile('js/db.js');
        assert.doesNotMatch(content, /supabase\s*\.\s*from\s*\(\s*['"]products['"]\s*\)/i,
            'db.js should not call supabase.from("products")');
        assert.doesNotMatch(content, /createClient\s*\(/,
            'db.js should not call createClient');
    });

    it('D8: js/db.js has no upsert/hard delete; controlled insert/update allowed (3-5I update)', function () {
        const content = readFile('js/db.js');
        // upsert는 금지 (대량 overwrite 위험)
        assert.doesNotMatch(content, /\.upsert\s*\(/i,
            'db.js should not have .upsert() call');
        // 실제 hard delete()는 금지 (soft delete via update 사용)
        assert.doesNotMatch(content, /from\s*\([^)]*\)\s*\.\s*delete\s*\(/i,
            'db.js should not have from(...).delete() hard delete');
        // supabase.xxx 직접 호출은 금지 (client 명시적 주입만 허용)
        assert.doesNotMatch(content, /supabase\s*\.\s*(insert|upsert|update|delete)\s*\(/i,
            'db.js should not call supabase.xxx CRUD methods directly');
        // setProducts는 여전히 disabled (대량 overwrite 금지)
        assert.match(content, /setProducts[\s\S]*?throw\s+new\s+Error/i,
            'setProducts should still throw Error (disabled, no bulk overwrite)');
    });

    it('D9: localStorage prefix lesoul_gh_ preserved', function () {
        const content = readFile('js/db.js');
        assert.match(content, /prefix:\s*['"]lesoul_gh_['"]/,
            'db.js should keep lesoul_gh_ prefix');
    });

    it('D10: js/products.js read/write path keeps using async helpers', function () {
        const content = readFile('js/products.js');
        assert.match(content, /await\s+DB\.getProductsAsync/,
            'products.js read path should await DB.getProductsAsync');
        assert.match(content, /await\s+DB\.addProductAsync/,
            'products.js write path should await DB.addProductAsync');
        assert.match(content, /await\s+DB\.updateProductAsync/,
            'products.js write path should await DB.updateProductAsync');
        assert.match(content, /await\s+DB\.deleteProductAsync/,
            'products.js write path should await DB.deleteProductAsync');
        assert.match(content, /await\s+DB\.setProductsAsync/,
            'products.js write path should await DB.setProductsAsync');
    });

    it('D11: other business modules have no direct Supabase call', function () {
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

    it('D12: data_export.json not present', function () {
        const fullPath = join(REPO_ROOT, 'data_export.json');
        assert.ok(!existsSync(fullPath), 'data_export.json should not be present');
    });

    it('D13: js/config.js is not committed (git ignored)', function () {
        const gitignore = readFile('.gitignore');
        const lines = gitignore.split('\n');
        const found = lines.some(line => line.trim() === 'js/config.js' || line.trim() === '/js/config.js');
        assert.ok(found, 'js/config.js should be in .gitignore');
    });

    it('D14: docs state 3-5D is Products DataSource extraction only, no Supabase CRUD conversion', function () {
        const results = readFile('docs/SUPABASE_LOCAL_TEST_RESULTS.md');
        assert.match(results, /3-5D.*Products.*DataSource/i,
            'SUPABASE_LOCAL_TEST_RESULTS should mention 3-5D Products DataSource');
        assert.match(results, /no Supabase CRUD conversion|CRUD 전환.*하지 않/i,
            'SUPABASE_LOCAL_TEST_RESULTS should state no Supabase CRUD conversion');
    });

    it('D15: no service_role string in js/db.js', function () {
        const content = readFile('js/db.js');
        assert.doesNotMatch(content, /service_role\s*key\s*[:=]\s*['"][A-Za-z0-9_\-]{20,}/i,
            'db.js should not contain actual service_role key value');
        const matches = content.match(/service_role/gi);
        if (matches) {
            for (const m of matches) {
                const idx = content.toLowerCase().indexOf(m.toLowerCase());
                const context = content.slice(Math.max(0, idx - 40), idx + 40);
                if (/금지|prohibit|no.*browser/i.test(context)) continue;
                assert.fail(`db.js should not contain service_role usage: ${context}`);
            }
        }
    });

    it('D16: no remote supabase.co URL in code', function () {
        const files = ['js/db.js', 'js/products.js', 'js/app.js'];
        for (const f of files) {
            const content = readFile(f);
            assert.doesNotMatch(content, /https?:\/\/[a-zA-Z0-9\-]+\.supabase\.(co|com|io)/i,
                `${f} should not contain remote supabase URL`);
        }
    });
});
