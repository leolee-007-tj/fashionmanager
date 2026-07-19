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

function loadDbForTesting() {
    const storage = {};
    const localStorageStub = {
        getItem(key) { return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null; },
        setItem(key, value) { storage[key] = String(value); },
        removeItem(key) { delete storage[key]; }
    };
    const sandbox = {
        localStorage: localStorageStub,
        console,
        Date,
        Math,
        JSON,
        Object,
        Array,
        Number,
        String,
        Boolean,
        Error,
        RegExp,
        Promise
    };
    const source = readFile('js/db.js');
    const factory = new Function(...Object.keys(sandbox), `${source}\n return DB;`);
    return factory(...Object.values(sandbox));
}

describe('Products Supabase DataSource Skeleton Contract (S1-S16)', function () {

    it('S1: js/db.js has SupabaseProductsDataSource skeleton', function () {
        const content = readFile('js/db.js');
        assert.match(content, /SupabaseProductsDataSource/,
            'db.js should mention SupabaseProductsDataSource');
        // 3-5G: _createDisabledSupabaseProductsDataSource가 _createControlledSupabaseProductsDataSource로 변경됨
        assert.match(content, /_createControlledSupabaseProductsDataSource\s*\(/,
            'db.js should have _createControlledSupabaseProductsDataSource factory');
    });

    it('S2: skeleton has listProducts/setProducts/createProduct/updateProduct/deleteProduct', function () {
        const content = readFile('js/db.js');
        const factoryStart = content.indexOf('_createControlledSupabaseProductsDataSource');
        assert.ok(factoryStart > -1, 'factory should exist');
        const afterFactory = content.slice(factoryStart);
        assert.match(afterFactory, /listProducts\s*\(/,
            'skeleton should have listProducts');
        assert.match(afterFactory, /setProducts\s*\(/,
            'skeleton should have setProducts');
        assert.match(afterFactory, /createProduct\s*\(/,
            'skeleton should have createProduct');
        assert.match(afterFactory, /updateProduct\s*\(/,
            'skeleton should have updateProduct');
        assert.match(afterFactory, /deleteProduct\s*\(/,
            'skeleton should have deleteProduct');
        assert.match(afterFactory, /name:\s*['"]SupabaseProductsDataSource['"]/,
            'skeleton name should be SupabaseProductsDataSource');
    });

    it('S3: write methods throw disabled error (listProducts throws validation error without client)', function () {
        const DB = loadDbForTesting();
        // 3-5G: listProducts는 client/context 없이 호출 시 validation error throw
        const skeleton = DB._createControlledSupabaseProductsDataSource(null, null);
        assert.equal(skeleton.name, 'SupabaseProductsDataSource');

        // listProducts without client → validation error (requires explicit client)
        assert.throws(
            () => skeleton.listProducts(),
            /requires explicit client/i,
            'listProducts should throw validation error without client'
        );

        // write methods → disabled error
        const writeErrPattern = /not enabled yet/i;
        assert.throws(
            () => skeleton.setProducts([]),
            writeErrPattern,
            'setProducts should throw disabled error'
        );
        assert.throws(
            () => skeleton.createProduct({}),
            writeErrPattern,
            'createProduct should throw disabled error'
        );
        assert.throws(
            () => skeleton.updateProduct(1, {}),
            writeErrPattern,
            'updateProduct should throw disabled error'
        );
        assert.throws(
            () => skeleton.deleteProduct(1),
            writeErrPattern,
            'deleteProduct should throw disabled error'
        );
    });

    it('S4: getProductsDataSource default is LocalProductsDataSource', function () {
        const DB = loadDbForTesting();
        const ds = DB.getProductsDataSource();
        assert.equal(ds.name, 'LocalProductsDataSource',
            'default DataSource must be LocalProductsDataSource');
        assert.doesNotMatch(ds.name, /Supabase/i,
            'default DataSource must NOT be SupabaseProductsDataSource');
    });

    it('S5: SupabaseProductsDataSource is not auto-activated at runtime', function () {
        const content = readFile('js/db.js');
        // getProductsDataSource 기본 경로에 SupabaseProductsDataSource가 없어야 함
        const getDsMatch = content.match(/getProductsDataSource\s*\([^)]*\)\s*\{([\s\S]*?)\n\s*\},/);
        assert.ok(getDsMatch, 'getProductsDataSource should exist');
        const getDsBody = getDsMatch[1];
        assert.doesNotMatch(getDsBody, /SupabaseProductsDataSource|_createControlledSupabaseProductsDataSource/,
            'getProductsDataSource body must not reference SupabaseProductsDataSource');

        // feature flag / config 기반 자동 전환이 없어야 함
        assert.doesNotMatch(content, /SUPABASE.*ENABLED.*products|products.*SUPABASE.*ENABLED/i,
            'no SUPABASE_ENABLED products auto-switch');
        assert.doesNotMatch(content, /session.*products.*datasource|products.*datasource.*session/i,
            'no session-based products datasource switch');
    });

    it('S6: js/db.js has no actual supabase.from("products") execution code', function () {
        const content = readFile('js/db.js');
        // 주석에 적힌 supabase.from('products')는 허용하되,
        // 실행 코드에 supabase.from('products')가 없어야 함.
        // 모든 supabase.from 매치를 찾아서 주석인지 확인.
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (/supabase\s*\.\s*from\s*\(\s*['"]products['"]\s*\)/i.test(line)) {
                const trimmed = line.trim();
                // 주석 라인이어야 함 (// 또는 *)
                if (!/^\s*\/\//.test(trimmed) && !/^\s*\*/.test(trimmed) && !/^\s*\/\*/.test(trimmed)) {
                    assert.fail(`Line ${i + 1}: supabase.from('products') found in non-comment code: ${trimmed}`);
                }
            }
        }
    });

    it('S7: js/db.js has no write CRUD (insert/update/delete/upsert); read-only select allowed (3-5G)', function () {
        const content = readFile('js/db.js');
        // 3-5G: _createControlledSupabaseProductsDataSource로 변경됨
        const factoryStart = content.indexOf('_createControlledSupabaseProductsDataSource');
        assert.ok(factoryStart > -1, 'factory should exist');
        const afterFactory = content.slice(factoryStart, factoryStart + 2500);

        // 3-5G: read-only select는 허용됨 (listProducts 구현)
        // write methods (insert/update/delete/upsert)는 금지
        assert.doesNotMatch(afterFactory, /\.insert\s*\(/i,
            'skeleton must not have .insert() (write forbidden)');
        assert.doesNotMatch(afterFactory, /\.upsert\s*\(/i,
            'skeleton must not have .upsert() (write forbidden)');
        // .update()와 .delete()는 write method에서 throw Error로 사용되므로,
        // supabase chain의 .update()/.delete()만 금지 (client.from(...).update/delete 패턴)
        assert.doesNotMatch(afterFactory, /from\s*\([^)]*\)\s*\.\s*update\s*\(/i,
            'skeleton must not have from(...).update() (write forbidden)');
        assert.doesNotMatch(afterFactory, /from\s*\([^)]*\)\s*\.\s*delete\s*\(/i,
            'skeleton must not have from(...).delete() (write forbidden)');

        // write methods는 throw new Error로 disabled 처리되어 있어야 함
        assert.match(afterFactory, /throw\s+new\s+Error\s*\(/i,
            'write methods should throw Error (disabled state)');
    });

    it('S8: mapping helpers are preserved', function () {
        const content = readFile('js/db.js');
        assert.match(content, /mapLegacyProductToSupabaseRow\s*\(/,
            'mapLegacyProductToSupabaseRow should still exist');
        assert.match(content, /mapSupabaseRowToLegacyProduct\s*\(/,
            'mapSupabaseRowToLegacyProduct should still exist');
        assert.match(content, /_SUPABASE_PRODUCT_EXTENDED_FIELDS/,
            'extended fields constant should still exist');
    });

    it('S9: LocalProductsDataSource still uses localStorage sync methods', function () {
        const DB = loadDbForTesting();
        const ds = DB.getProductsDataSource();
        assert.equal(ds.name, 'LocalProductsDataSource');

        // localStorage 기반으로 동작하는지 실제 테스트
        DB.setProducts([{ id: 1, original_title: 'Test', brand: 'B' }]);
        return ds.listProducts().then(products => {
            assert.equal(products.length, 1);
            assert.equal(products[0].original_title, 'Test');
        });
    });

    it('S10: products.js unchanged or uses async helper path', function () {
        const content = readFile('js/products.js');
        // products.js는 DB.getProductsAsync / addProductAsync 등을 사용해야 함
        assert.match(content, /getProductsAsync\s*\(/,
            'products.js should use getProductsAsync');
        assert.match(content, /addProductAsync\s*\(/,
            'products.js should use addProductAsync');
        assert.match(content, /updateProductAsync\s*\(/,
            'products.js should use updateProductAsync');
        assert.match(content, /deleteProductAsync\s*\(/,
            'products.js should use deleteProductAsync');
        // Supabase 직접 호출 없음
        assert.doesNotMatch(content, /supabase/i,
            'products.js must not contain supabase');
    });

    it('S11: localStorage prefix lesoul_gh_ preserved', function () {
        const content = readFile('js/db.js');
        assert.match(content, /prefix:\s*['"]lesoul_gh_['"]/,
            'db.js should keep lesoul_gh_ prefix');
    });

    it('S12: no service_role string in js files (actual key usage)', function () {
        const files = ['js/db.js', 'js/products.js', 'js/app.js'];
        for (const f of files) {
            if (!existsSync(join(REPO_ROOT, f))) continue;
            const content = readFile(f);
            assert.doesNotMatch(content, /service_role\s*key\s*[:=]\s*['"][A-Za-z0-9_\-]{20,}/i,
                `${f} should not contain actual service_role key value`);
        }
    });

    it('S13: no remote supabase.co URL in js files', function () {
        const files = ['js/db.js', 'js/products.js', 'js/app.js'];
        for (const f of files) {
            if (!existsSync(join(REPO_ROOT, f))) continue;
            const content = readFile(f);
            assert.doesNotMatch(content, /https?:\/\/[a-zA-Z0-9\-]+\.supabase\.(co|com|io)/i,
                `${f} should not contain remote supabase URL`);
        }
    });

    it('S14: data_export.json not present', function () {
        const fullPath = join(REPO_ROOT, 'data_export.json');
        assert.ok(!existsSync(fullPath), 'data_export.json should not be present');
    });

    it('S15: js/config.js is not committed (git ignored)', function () {
        const gitignore = readFile('.gitignore');
        const lines = gitignore.split('\n');
        const found = lines.some(line => line.trim() === 'js/config.js' || line.trim() === '/js/config.js');
        assert.ok(found, 'js/config.js should be in .gitignore');
    });

    it('S16: docs state 3-5F is disabled skeleton only, no Supabase CRUD conversion', function () {
        const results = readFile('docs/SUPABASE_LOCAL_TEST_RESULTS.md');
        assert.match(results, /3-5F/i,
            'SUPABASE_LOCAL_TEST_RESULTS should mention 3-5F');
        assert.match(results, /disabled skeleton only|skeleton only|CRUD 전환.*하지 않|no Supabase CRUD conversion/i,
            'SUPABASE_LOCAL_TEST_RESULTS should state skeleton only, no CRUD conversion');

        const map = readFile('docs/ASYNC_MIGRATION_MAP.md');
        assert.match(map, /3-5F/i,
            'ASYNC_MIGRATION_MAP should mention 3-5F');
        assert.match(map, /disabled skeleton only|skeleton only|CRUD 전환.*하지 않|no Supabase CRUD conversion/i,
            'ASYNC_MIGRATION_MAP should state skeleton only, no CRUD conversion');
    });

    // 추가 검증
    it('S-extra: resetProductsDataSourceForTesting resets to LocalProductsDataSource', function () {
        const DB = loadDbForTesting();
        // 3-5G: _createControlledSupabaseProductsDataSource 사용
        const skeleton = DB._createControlledSupabaseProductsDataSource(null, null);
        DB.setProductsDataSourceForTesting(skeleton);
        assert.equal(DB.getProductsDataSource().name, 'SupabaseProductsDataSource');

        DB.resetProductsDataSourceForTesting();
        assert.equal(DB.getProductsDataSource().name, 'LocalProductsDataSource');
    });
});
