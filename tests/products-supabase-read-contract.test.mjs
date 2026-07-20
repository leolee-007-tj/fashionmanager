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

/**
 * Mock Supabase client for testing listProducts.
 * from('products').select('*').eq('store_id', id) chain을 시뮬레이션.
 */
function createMockClient(options = {}) {
    const calls = [];
    const mockData = options.data || [];
    const mockError = options.error || null;
    const supabaseUrl = options.supabaseUrl || 'http://localhost:54321';

    function buildChain() {
        const promise = new Promise((resolve) => {
            resolve({ data: mockData, error: mockError });
        });
        const chain = {
            select(columns) {
                calls.push({ method: 'select', columns });
                return chain;
            },
            eq(column, value) {
                calls.push({ method: 'eq', column, value });
                return chain;
            },
            then(resolve, reject) {
                calls.push({ method: 'then' });
                return promise.then(resolve, reject);
            },
            catch(reject) {
                return promise.catch(reject);
            }
        };
        return chain;
    }

    return {
        supabaseUrl,
        from(table) {
            calls.push({ method: 'from', table });
            return buildChain();
        },
        _calls: calls
    };
}

describe('Products Supabase Read Contract (R1-R19)', function () {

    it('R1: js/db.js has controlled SupabaseProductsDataSource factory', function () {
        const content = readFile('js/db.js');
        assert.match(content, /_createControlledSupabaseProductsDataSource\s*\(/,
            'db.js should have _createControlledSupabaseProductsDataSource factory');
    });

    it('R2: listProducts is implemented (not disabled)', function () {
        const DB = loadDbForTesting();
        const ds = DB._createControlledSupabaseProductsDataSource(
            createMockClient(),
            { localOnly: true, storeId: 'test-store' }
        );
        assert.equal(typeof ds.listProducts, 'function',
            'listProducts should be a function');
        // listProducts는 disabled error를 throw하지 않아야 함
        // (validation error는 throw할 수 있지만, 'not enabled yet'은 아니어야 함)
        try {
            ds.listProducts();
            // Promise를 반환하면 성공
        } catch (e) {
            assert.doesNotMatch(e.message, /not enabled yet/i,
                'listProducts should not throw "not enabled yet" error');
        }
    });

    it('R3: setProducts throws disabled error (create/update/delete now implemented in 3-5I)', function () {
        const DB = loadDbForTesting();
        const ds = DB._createControlledSupabaseProductsDataSource(
            createMockClient(),
            { localOnly: true, storeId: 'test-store' }
        );
        assert.throws(() => ds.setProducts([]), /setProducts is not enabled/i,
            'setProducts should be disabled (bulk overwrite not allowed)');
    });

    it('R4: getProductsDataSource default is LocalProductsDataSource', function () {
        const DB = loadDbForTesting();
        const ds = DB.getProductsDataSource();
        assert.equal(ds.name, 'LocalProductsDataSource',
            'default DataSource must be LocalProductsDataSource');
    });

    it('R5: SupabaseProductsDataSource is not auto-activated at runtime', function () {
        const content = readFile('js/db.js');
        // getProductsDataSource 본문에 _createControlledSupabaseProductsDataSource 직접 호출이 없어야 함.
        // 3-5M 이후 getProductsDataSource는 _resolveRuntimeProductsDataSource를 통해 간접적으로만
        // SupabaseProductsDataSource를 생성할 수 있으며, PRODUCTS_SUPABASE_ENABLED === true일 때만 활성화된다.
        const fnMatch = content.match(
            /getProductsDataSource\s*\([^)]*\)\s*\{([\s\S]*?)\n\s*\},\s*\n\s*\/\*\*/
        );
        assert.ok(fnMatch, 'getProductsDataSource function body should be extractable');
        assert.doesNotMatch(fnMatch[1], /_createControlledSupabaseProductsDataSource/,
            'getProductsDataSource body must not directly call _createControlledSupabaseProductsDataSource');
    });

    it('R6: listProducts requires explicit client', function () {
        const DB = loadDbForTesting();
        // client 없이 생성
        const ds = DB._createControlledSupabaseProductsDataSource(null, {
            localOnly: true, storeId: 'test-store'
        });
        assert.throws(
            () => ds.listProducts(),
            /requires explicit client/i,
            'listProducts should require explicit client'
        );
    });

    it('R7: listProducts requires context.localOnly === true', function () {
        const DB = loadDbForTesting();
        // localOnly가 false
        const ds1 = DB._createControlledSupabaseProductsDataSource(
            createMockClient(),
            { localOnly: false, storeId: 'test-store' }
        );
        assert.throws(
            () => ds1.listProducts(),
            /requires localOnly context/i,
            'listProducts should require localOnly === true'
        );
        // localOnly 없음
        const ds2 = DB._createControlledSupabaseProductsDataSource(
            createMockClient(),
            { storeId: 'test-store' }
        );
        assert.throws(
            () => ds2.listProducts(),
            /requires localOnly context/i,
            'listProducts should require localOnly === true'
        );
        // context 자체가 없음
        const ds3 = DB._createControlledSupabaseProductsDataSource(
            createMockClient(),
            null
        );
        assert.throws(
            () => ds3.listProducts(),
            /requires localOnly context/i,
            'listProducts should require localOnly === true'
        );
    });

    it('R8: listProducts requires storeId', function () {
        const DB = loadDbForTesting();
        const ds = DB._createControlledSupabaseProductsDataSource(
            createMockClient(),
            { localOnly: true }  // storeId 없음
        );
        assert.throws(
            () => ds.listProducts(),
            /requires storeId/i,
            'listProducts should require storeId'
        );
    });

    it('R9: listProducts only allows localhost/127.0.0.1 URL', function () {
        const DB = loadDbForTesting();

        // localhost 허용
        const ds1 = DB._createControlledSupabaseProductsDataSource(
            createMockClient({ supabaseUrl: 'http://localhost:54321' }),
            { localOnly: true, storeId: 'test-store' }
        );
        // listProducts 호출 시 URL 검증 통과해야 함 (thenable 반환)
        const result1 = ds1.listProducts();
        assert.ok(result1 && typeof result1.then === 'function',
            'listProducts should return a Promise for localhost URL');

        // 127.0.0.1 허용
        const ds2 = DB._createControlledSupabaseProductsDataSource(
            createMockClient({ supabaseUrl: 'http://127.0.0.1:54321' }),
            { localOnly: true, storeId: 'test-store' }
        );
        const result2 = ds2.listProducts();
        assert.ok(result2 && typeof result2.then === 'function',
            'listProducts should return a Promise for 127.0.0.1 URL');

        // 원격 URL 거부
        const ds3 = DB._createControlledSupabaseProductsDataSource(
            createMockClient({ supabaseUrl: 'https://example.supabase.co' }),
            { localOnly: true, storeId: 'test-store' }
        );
        assert.throws(
            () => ds3.listProducts(),
            /requires localhost URL/i,
            'listProducts should reject remote URL'
        );

        // context.url로 localhost 지정도 허용
        const ds4 = DB._createControlledSupabaseProductsDataSource(
            { supabaseUrl: null, from: () => { throw new Error('should not reach'); } },
            { localOnly: true, storeId: 'test-store', url: 'http://localhost:54321' }
        );
        // url 검증은 통과하지만, from이 mock이 아니므로 에러 발생 가능
        // 여기서는 URL 검증만 확인 (from 호출 전 throw되지 않아야 함)
        try {
            ds4.listProducts();
        } catch (e) {
            // URL 관련 에러가 아니어야 함
            assert.doesNotMatch(e.message, /requires localhost URL/i,
                'context.url localhost should be accepted');
        }
    });

    it('R10: listProducts performs products select read-only only', function () {
        const DB = loadDbForTesting();
        const mockClient = createMockClient({
            supabaseUrl: 'http://localhost:54321',
            data: []
        });
        const ds = DB._createControlledSupabaseProductsDataSource(mockClient, {
            localOnly: true, storeId: 'test-store'
        });

        return ds.listProducts().then(() => {
            // from('products') 호출 확인
            const fromCall = mockClient._calls.find(c => c.method === 'from');
            assert.ok(fromCall, 'should call client.from()');
            assert.equal(fromCall.table, 'products', 'should call from("products")');

            // select 호출 확인
            const selectCall = mockClient._calls.find(c => c.method === 'select');
            assert.ok(selectCall, 'should call .select()');
            assert.equal(selectCall.columns, '*', 'should select all columns');

            // eq('store_id', ...) 호출 확인
            const eqCall = mockClient._calls.find(c => c.method === 'eq');
            assert.ok(eqCall, 'should call .eq() for store_id');
            assert.equal(eqCall.column, 'store_id', 'should filter by store_id');

            // insert/update/delete/upsert 호출 없음 확인
            const writeCall = mockClient._calls.find(c =>
                c.method === 'insert' || c.method === 'update' ||
                c.method === 'delete' || c.method === 'upsert'
            );
            assert.equal(writeCall, undefined, 'should not call any write methods');
        });
    });

    it('R11: listProducts results are converted via mapSupabaseRowToLegacyProduct', function () {
        const DB = loadDbForTesting();
        const supabaseRows = [
            {
                id: 'uuid-1',
                legacy_id: 100,
                original_title: 'Test Product 1',
                brand: 'BRAND1',
                korea_cost: 50000,
                current_stock: 10,
                reserved_stock: 2,
                store_id: 'test-store',
                created_at: '2026-07-19T00:00:00.000Z',
                updated_at: '2026-07-19T00:00:00.000Z'
            },
            {
                id: 'uuid-2',
                legacy_id: 200,
                original_title: 'Test Product 2',
                brand: 'BRAND2',
                korea_cost: 30000,
                current_stock: 5,
                reserved_stock: 0,
                store_id: 'test-store',
                created_at: '2026-07-19T00:00:00.000Z',
                updated_at: '2026-07-19T00:00:00.000Z'
            }
        ];
        const mockClient = createMockClient({
            supabaseUrl: 'http://localhost:54321',
            data: supabaseRows
        });
        const ds = DB._createControlledSupabaseProductsDataSource(mockClient, {
            localOnly: true, storeId: 'test-store'
        });

        return ds.listProducts().then(products => {
            assert.equal(products.length, 2, 'should return 2 products');
            // legacy product object로 변환되었는지 확인
            assert.equal(products[0].id, 100, 'legacy_id should map to id');
            assert.equal(products[0].original_title, 'Test Product 1');
            assert.equal(products[0].brand, 'BRAND1');
            assert.equal(products[0].korea_cost, 50000);
            assert.equal(products[0].current_stock, 10);
            assert.equal(products[0].reserved_stock, 2);
            // uuid id는 legacy object에 노출하지 않음
            assert.equal(products[0].uuid, undefined, 'uuid should not leak to legacy object');

            assert.equal(products[1].id, 200, 'legacy_id should map to id');
            assert.equal(products[1].original_title, 'Test Product 2');
        });
    });

    it('R12: no write path (insert/update/delete/upsert) in controlled factory', function () {
        const content = readFile('js/db.js');
        const factoryStart = content.indexOf('_createControlledSupabaseProductsDataSource');
        assert.ok(factoryStart > -1, 'factory should exist');
        const afterFactory = content.slice(factoryStart, factoryStart + 2500);

        // .insert() / .upsert() 호출 없음
        assert.doesNotMatch(afterFactory, /\.insert\s*\(/i,
            'controlled factory must not have .insert() call');
        assert.doesNotMatch(afterFactory, /\.upsert\s*\(/i,
            'controlled factory must not have .upsert() call');
        // from(...).update() / from(...).delete() 호출 없음
        assert.doesNotMatch(afterFactory, /from\s*\([^)]*\)\s*\.\s*update\s*\(/i,
            'controlled factory must not have from(...).update() call');
        assert.doesNotMatch(afterFactory, /from\s*\([^)]*\)\s*\.\s*delete\s*\(/i,
            'controlled factory must not have from(...).delete() call');
    });

    it('R13: no service_role string in js files', function () {
        const files = ['js/db.js', 'js/products.js', 'js/app.js'];
        for (const f of files) {
            if (!existsSync(join(REPO_ROOT, f))) continue;
            const content = readFile(f);
            assert.doesNotMatch(content, /service_role\s*key\s*[:=]\s*['"][A-Za-z0-9_\-]{20,}/i,
                `${f} should not contain actual service_role key value`);
        }
    });

    it('R14: no token/session/key console.log in controlled factory', function () {
        const content = readFile('js/db.js');
        const factoryStart = content.indexOf('_createControlledSupabaseProductsDataSource');
        assert.ok(factoryStart > -1, 'factory should exist');
        const afterFactory = content.slice(factoryStart, factoryStart + 2500);

        // console.log 호출 자체가 없어야 함 (token/session/key 여부와 무관)
        assert.doesNotMatch(afterFactory, /console\s*\.\s*log\s*\(/i,
            'controlled factory must not call console.log');
        // 오류 메시지에 민감 정보 포함 금지 확인
        assert.doesNotMatch(afterFactory, /error\s*\+\s*['"].*(token|key|jwt|secret)/i,
            'error messages must not include token/key/jwt/secret');
    });

    it('R15: no remote supabase.co URL in js files', function () {
        const files = ['js/db.js', 'js/products.js', 'js/app.js'];
        for (const f of files) {
            if (!existsSync(join(REPO_ROOT, f))) continue;
            const content = readFile(f);
            assert.doesNotMatch(content, /https?:\/\/[a-zA-Z0-9\-]+\.supabase\.(co|com|io)/i,
                `${f} should not contain remote supabase URL`);
        }
    });

    it('R16: localStorage prefix lesoul_gh_ preserved', function () {
        const content = readFile('js/db.js');
        assert.match(content, /prefix:\s*['"]lesoul_gh_['"]/,
            'db.js should keep lesoul_gh_ prefix');
    });

    it('R17: docs state 3-5G is local-only controlled read test only, no write conversion', function () {
        const results = readFile('docs/SUPABASE_LOCAL_TEST_RESULTS.md');
        assert.match(results, /3-5G/i,
            'SUPABASE_LOCAL_TEST_RESULTS should mention 3-5G');
        assert.match(results, /local-only controlled read|no write conversion|write 전환.*하지 않/i,
            'SUPABASE_LOCAL_TEST_RESULTS should state local-only controlled read, no write conversion');

        const map = readFile('docs/ASYNC_MIGRATION_MAP.md');
        assert.match(map, /3-5G/i,
            'ASYNC_MIGRATION_MAP should mention 3-5G');
        assert.match(map, /local-only controlled read|no write conversion|write 전환.*하지 않/i,
            'ASYNC_MIGRATION_MAP should state local-only controlled read, no write conversion');
    });

    it('R18: data_export.json not present', function () {
        const fullPath = join(REPO_ROOT, 'data_export.json');
        assert.ok(!existsSync(fullPath), 'data_export.json should not be present');
    });

    it('R19: js/config.js is not committed (git ignored)', function () {
        const gitignore = readFile('.gitignore');
        const lines = gitignore.split('\n');
        const found = lines.some(line => line.trim() === 'js/config.js' || line.trim() === '/js/config.js');
        assert.ok(found, 'js/config.js should be in .gitignore');
    });

    // 추가 검증: listProducts error handling
    it('R-extra: listProducts handles query error without leaking sensitive info', function () {
        const DB = loadDbForTesting();
        const mockClient = createMockClient({
            supabaseUrl: 'http://localhost:54321',
            error: { message: 'JWT secret key mismatch: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' }
        });
        const ds = DB._createControlledSupabaseProductsDataSource(mockClient, {
            localOnly: true, storeId: 'test-store'
        });

        return ds.listProducts().then(
            () => { throw new Error('should have rejected'); },
            (err) => {
                // 오류 메시지에 민감 정보가 포함되지 않아야 함
                assert.match(err.message, /query failed/i,
                    'error should be generic "query failed"');
                assert.doesNotMatch(err.message, /jwt|secret|key|token/i,
                    'error message must not contain JWT/secret/key/token');
            }
        );
    });

    // 추가 검증: empty results
    it('R-extra: listProducts returns empty array for no data', function () {
        const DB = loadDbForTesting();
        const mockClient = createMockClient({
            supabaseUrl: 'http://localhost:54321',
            data: []
        });
        const ds = DB._createControlledSupabaseProductsDataSource(mockClient, {
            localOnly: true, storeId: 'test-store'
        });

        return ds.listProducts().then(products => {
            assert.ok(Array.isArray(products), 'should return an array');
            assert.equal(products.length, 0, 'should return empty array for no data');
        });
    });
});
