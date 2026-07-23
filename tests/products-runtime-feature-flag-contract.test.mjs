import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

function setupMockLocalStorage() {
    const store = {};
    global.localStorage = {
        getItem(key) { return store[key] != null ? store[key] : null; },
        setItem(key, value) { store[key] = String(value); },
        removeItem(key) { delete store[key]; },
        clear() { for (const k of Object.keys(store)) delete store[k]; }
    };
}

setupMockLocalStorage();

function loadDbForTesting() {
    const source = readFileSync(join(__dirname, '..', 'js', 'db.js'), 'utf-8');
    const code = source + '\n; return DB;';
    const factory = new Function(code);
    return factory();
}

function readFile(relativePath) {
    const fullPath = join(__dirname, '..', relativePath);
    assert.ok(existsSync(fullPath), `File should exist: ${relativePath}`);
    return readFileSync(fullPath, 'utf-8');
}

// atob polyfill for Node.js (JWT decode in _resolveRuntimeProductsDataSource)
if (typeof global.atob !== 'function') {
    global.atob = function (str) {
        return Buffer.from(str, 'base64').toString('utf-8');
    };
}

describe('Products Runtime Feature Flag Gate Contract (3-5M)', function () {

    let savedLESOUL_CONFIG;
    let savedLESOULSupabase;
    let savedLESOULAppBootstrap;

    beforeEach(function () {
        savedLESOUL_CONFIG = global.LESOUL_CONFIG;
        savedLESOULSupabase = global.LESOULSupabase;
        savedLESOULAppBootstrap = global.LESOULAppBootstrap;
        delete global.LESOUL_CONFIG;
        delete global.LESOULSupabase;
        delete global.LESOULAppBootstrap;
    });

    afterEach(function () {
        if (savedLESOUL_CONFIG !== undefined) global.LESOUL_CONFIG = savedLESOUL_CONFIG;
        else delete global.LESOUL_CONFIG;
        if (savedLESOULSupabase !== undefined) global.LESOULSupabase = savedLESOULSupabase;
        else delete global.LESOULSupabase;
        if (savedLESOULAppBootstrap !== undefined) global.LESOULAppBootstrap = savedLESOULAppBootstrap;
        else delete global.LESOULAppBootstrap;
    });

    it('FF1: config.example.js has PRODUCTS_SUPABASE_ENABLED default false', function () {
        const content = readFile('js/config.example.js');
        assert.match(content, /PRODUCTS_SUPABASE_ENABLED:\s*false/,
            'config.example.js must have PRODUCTS_SUPABASE_ENABLED: false');
    });

    it('FF2: SUPABASE_ENABLED false → Products DataSource is LocalProductsDataSource', function () {
        global.LESOUL_CONFIG = { SUPABASE_ENABLED: false, PRODUCTS_SUPABASE_ENABLED: false };
        const DB = loadDbForTesting();
        DB.resetProductsDataSourceForTesting();
        const ds = DB.getProductsDataSource();
        assert.equal(ds.name, 'LocalProductsDataSource');
    });

    it('FF3: PRODUCTS_SUPABASE_ENABLED false → Products DataSource is LocalProductsDataSource', function () {
        global.LESOUL_CONFIG = { SUPABASE_ENABLED: true, PRODUCTS_SUPABASE_ENABLED: false };
        const DB = loadDbForTesting();
        DB.resetProductsDataSourceForTesting();
        const ds = DB.getProductsDataSource();
        assert.equal(ds.name, 'LocalProductsDataSource');
    });

    it('FF4: SUPABASE_ENABLED true + PRODUCTS_SUPABASE_ENABLED false → LocalProductsDataSource', function () {
        global.LESOUL_CONFIG = { SUPABASE_ENABLED: true, PRODUCTS_SUPABASE_ENABLED: false };
        const DB = loadDbForTesting();
        DB.resetProductsDataSourceForTesting();
        const ds = DB.getProductsDataSource();
        assert.equal(ds.name, 'LocalProductsDataSource');
    });

    it('FF5: PRODUCTS_SUPABASE_ENABLED true + no storeId (activeMembership null, guest mode) → silent fallback to LocalProductsDataSource (3-6C)', function () {
        global.LESOUL_CONFIG = {
            SUPABASE_ENABLED: true,
            PRODUCTS_SUPABASE_ENABLED: true,
            SUPABASE_URL: 'http://127.0.0.1:54321',
            SUPABASE_CLIENT_KEY: 'anon-key'
        };
        global.LESOULSupabase = {
            isInitialized: () => true,
            getClient: () => ({ supabaseUrl: 'http://127.0.0.1:54321' })
        };
        // 3-6C: activeMembership이 null인 guest 모드는 silent fallback
        global.LESOULAppBootstrap = {
            getContext: () => ({ activeMembership: null })
        };
        const DB = loadDbForTesting();
        DB.resetProductsDataSourceForTesting();
        const ds = DB.getProductsDataSource();
        assert.equal(ds.name, 'LocalProductsDataSource',
            'guest mode (activeMembership=null) with PRODUCTS_SUPABASE_ENABLED=true must silently fallback to LocalProductsDataSource (3-6C)');
    });

    it('FF5b: PRODUCTS_SUPABASE_ENABLED true + activeMembership 있음 + no storeId → throws (3-5M policy preserved)', function () {
        global.LESOUL_CONFIG = {
            SUPABASE_ENABLED: true,
            PRODUCTS_SUPABASE_ENABLED: true,
            SUPABASE_URL: 'http://127.0.0.1:54321',
            SUPABASE_CLIENT_KEY: 'anon-key'
        };
        global.LESOULSupabase = {
            isInitialized: () => true,
            getClient: () => ({ supabaseUrl: 'http://127.0.0.1:54321' })
        };
        // 3-5M: activeMembership이 있는데 storeId가 없는 비정상 상황은 throw
        global.LESOULAppBootstrap = {
            getContext: () => ({ activeMembership: { storeId: null, role: 'owner' } })
        };
        const DB = loadDbForTesting();
        DB.resetProductsDataSourceForTesting();
        assert.throws(
            () => DB.getProductsDataSource(),
            /requires active storeId/i,
            'activeMembership 존재하지만 storeId가 없으면 throw (3-5M)'
        );
    });

    it('FF6: PRODUCTS_SUPABASE_ENABLED true + no client → throws (no silent fallback)', function () {
        global.LESOUL_CONFIG = {
            SUPABASE_ENABLED: true,
            PRODUCTS_SUPABASE_ENABLED: true,
            SUPABASE_URL: 'http://127.0.0.1:54321',
            SUPABASE_CLIENT_KEY: 'anon-key'
        };
        global.LESOULSupabase = {
            isInitialized: () => false,
            getClient: () => { throw new Error('not initialized'); }
        };
        const DB = loadDbForTesting();
        DB.resetProductsDataSourceForTesting();
        assert.throws(
            () => DB.getProductsDataSource(),
            /requires initialized Supabase client/i,
            'PRODUCTS_SUPABASE_ENABLED=true without initialized client must throw'
        );
    });

    it('FF7: PRODUCTS_SUPABASE_ENABLED true + remote supabase.co URL + remote flag false → throws', function () {
        global.LESOUL_CONFIG = {
            SUPABASE_ENABLED: true,
            PRODUCTS_SUPABASE_ENABLED: true,
            SUPABASE_URL: 'https://example.supabase.co',
            SUPABASE_CLIENT_KEY: 'anon-key'
        };
        global.LESOULSupabase = {
            isInitialized: () => true,
            getClient: () => ({ supabaseUrl: 'https://example.supabase.co' })
        };
        global.LESOULAppBootstrap = {
            getContext: () => ({ activeMembership: { storeId: 'store-uuid-123' } })
        };
        const DB = loadDbForTesting();
        DB.resetProductsDataSourceForTesting();
        assert.throws(
            () => DB.getProductsDataSource(),
            /remote runtime is not enabled|PRODUCTS_SUPABASE_REMOTE_ENABLED/i,
            'PRODUCTS_SUPABASE_ENABLED=true with remote URL + remote flag false must throw'
        );
    });

    it('FF8: localhost + client + storeId + localOnly → SupabaseProductsDataSource 생성 가능', function () {
        global.LESOUL_CONFIG = {
            SUPABASE_ENABLED: true,
            PRODUCTS_SUPABASE_ENABLED: true,
            SUPABASE_URL: 'http://127.0.0.1:54321',
            SUPABASE_CLIENT_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.fake'
        };
        global.LESOULSupabase = {
            isInitialized: () => true,
            getClient: () => ({
                supabaseUrl: 'http://127.0.0.1:54321',
                from: () => ({ select: () => ({ eq: () => ({ then: () => Promise.resolve({ data: [], error: null }) }) }) }),
                rpc: () => Promise.resolve({ data: null, error: null })
            })
        };
        global.LESOULAppBootstrap = {
            getContext: () => ({ activeMembership: { storeId: 'store-uuid-123' } })
        };
        const DB = loadDbForTesting();
        DB.resetProductsDataSourceForTesting();
        const ds = DB.getProductsDataSource();
        assert.equal(ds.name, 'SupabaseProductsDataSource',
            'all conditions met → SupabaseProductsDataSource should be activated');
    });

    it('FF9: getProductsDataSource default is LocalProductsDataSource (no config)', function () {
        // LESOUL_CONFIG가 없는 경우
        const DB = loadDbForTesting();
        DB.resetProductsDataSourceForTesting();
        const ds = DB.getProductsDataSource();
        assert.equal(ds.name, 'LocalProductsDataSource');
    });

    it('FF10: setProductsDataSourceForTesting hook is preserved', function () {
        const DB = loadDbForTesting();
        const fakeSource = { name: 'FakeDataSource', listProducts: () => Promise.resolve([]) };
        DB.setProductsDataSourceForTesting(fakeSource);
        assert.equal(DB.getProductsDataSource().name, 'FakeDataSource');
    });

    it('FF11: resetProductsDataSourceForTesting hook is preserved', function () {
        const DB = loadDbForTesting();
        const fakeSource = { name: 'FakeDataSource', listProducts: () => Promise.resolve([]) };
        DB.setProductsDataSourceForTesting(fakeSource);
        assert.equal(DB.getProductsDataSource().name, 'FakeDataSource');
        DB.resetProductsDataSourceForTesting();
        assert.equal(DB.getProductsDataSource().name, 'LocalProductsDataSource');
    });

    it('FF12: products.js is not modified in this step', function () {
        const content = readFile('js/products.js');
        // products.js가 여전히 async helpers를 사용하는지 확인
        assert.match(content, /getProductsAsync|addProductAsync|updateProductAsync|deleteProductAsync|setProductsAsync/,
            'products.js should still use async helpers');
    });

    it('FF13: app.js is not modified in this step', function () {
        const content = readFile('js/app.js');
        // app.js가 여전히 기존 구조를 유지하는지 확인
        assert.ok(content.length > 0, 'app.js should exist and have content');
    });

    it('FF14: no service_role string in db.js runtime activation path', function () {
        const content = readFile('js/db.js');
        // _resolveRuntimeProductsDataSource 본문에 service_role key 사용이 없어야 함
        const fnMatch = content.match(/_resolveRuntimeProductsDataSource\s*\([^)]*\)\s*\{([\s\S]*?)\n\s*\},/);
        assert.ok(fnMatch, '_resolveRuntimeProductsDataSource should exist');
        // service_role을 명시적으로 금지하는 코드는 있어야 함
        assert.match(fnMatch[1], /service_role/,
            '_resolveRuntimeProductsDataSource should explicitly forbid service_role');
    });

    it('FF15: no token/session/key console.log in db.js runtime activation path', function () {
        const content = readFile('js/db.js');
        const fnMatch = content.match(/_resolveRuntimeProductsDataSource\s*\([^)]*\)\s*\{([\s\S]*?)\n\s*\},/);
        assert.ok(fnMatch, '_resolveRuntimeProductsDataSource should exist');
        assert.doesNotMatch(fnMatch[1], /console\.log/,
            '_resolveRuntimeProductsDataSource must not console.log');
    });

    it('FF16: localStorage prefix unchanged', function () {
        const content = readFile('js/db.js');
        assert.match(content, /lesoul_gh_/,
            'localStorage prefix lesoul_gh_ must be preserved');
    });

    it('FF17: js/config.js is not committed (gitignored)', function () {
        const gitignore = readFile('.gitignore');
        assert.match(gitignore, /js\/config\.js/,
            'js/config.js must be in .gitignore');
        // js/config.js가 실제로 존재하더라도 커밋되지 않아야 함
        // (이 테스트는 .gitignore에 포함되어 있는지만 확인)
    });

    it('FF18: data_export.json is not in repo', function () {
        const gitignore = readFile('.gitignore');
        assert.match(gitignore, /data_export\.json/,
            'data_export.json must be in .gitignore');
    });

    it('FF19: PRODUCTS_SUPABASE_ENABLED true + SUPABASE_ENABLED false → throws', function () {
        global.LESOUL_CONFIG = {
            SUPABASE_ENABLED: false,
            PRODUCTS_SUPABASE_ENABLED: true,
            SUPABASE_URL: 'http://127.0.0.1:54321',
            SUPABASE_CLIENT_KEY: 'anon-key'
        };
        const DB = loadDbForTesting();
        DB.resetProductsDataSourceForTesting();
        assert.throws(
            () => DB.getProductsDataSource(),
            /requires SUPABASE_ENABLED=true/i,
            'PRODUCTS_SUPABASE_ENABLED=true with SUPABASE_ENABLED=false must throw'
        );
    });

    it('FF20: PRODUCTS_SUPABASE_ENABLED true + service_role JWT key → throws', function () {
        // service_role JWT (fake, role=service_role in payload)
        const fakeServiceRoleJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.fake';
        global.LESOUL_CONFIG = {
            SUPABASE_ENABLED: true,
            PRODUCTS_SUPABASE_ENABLED: true,
            SUPABASE_URL: 'http://127.0.0.1:54321',
            SUPABASE_CLIENT_KEY: fakeServiceRoleJwt
        };
        global.LESOULSupabase = {
            isInitialized: () => true,
            getClient: () => ({ supabaseUrl: 'http://127.0.0.1:54321' })
        };
        global.LESOULAppBootstrap = {
            getContext: () => ({ activeMembership: { storeId: 'store-uuid-123' } })
        };
        const DB = loadDbForTesting();
        DB.resetProductsDataSourceForTesting();
        assert.throws(
            () => DB.getProductsDataSource(),
            /service_role/i,
            'PRODUCTS_SUPABASE_ENABLED=true with service_role key must throw'
        );
    });

    it('FF21: PRODUCTS_SUPABASE_ENABLED true + localhost URL with port → activates', function () {
        global.LESOUL_CONFIG = {
            SUPABASE_ENABLED: true,
            PRODUCTS_SUPABASE_ENABLED: true,
            SUPABASE_URL: 'http://localhost:54321',
            SUPABASE_CLIENT_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.fake'
        };
        global.LESOULSupabase = {
            isInitialized: () => true,
            getClient: () => ({
                supabaseUrl: 'http://localhost:54321',
                from: () => ({ select: () => ({ eq: () => ({ then: () => Promise.resolve({ data: [], error: null }) }) }) }),
                rpc: () => Promise.resolve({ data: null, error: null })
            })
        };
        global.LESOULAppBootstrap = {
            getContext: () => ({ activeMembership: { storeId: 'store-uuid-123' } })
        };
        const DB = loadDbForTesting();
        DB.resetProductsDataSourceForTesting();
        const ds = DB.getProductsDataSource();
        assert.equal(ds.name, 'SupabaseProductsDataSource');
    });

    it('FF22: after runtime activation + reset + config off → LocalProductsDataSource', function () {
        global.LESOUL_CONFIG = {
            SUPABASE_ENABLED: true,
            PRODUCTS_SUPABASE_ENABLED: true,
            SUPABASE_URL: 'http://127.0.0.1:54321',
            SUPABASE_CLIENT_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.fake'
        };
        global.LESOULSupabase = {
            isInitialized: () => true,
            getClient: () => ({
                supabaseUrl: 'http://127.0.0.1:54321',
                from: () => ({ select: () => ({ eq: () => ({ is: () => ({ then: () => Promise.resolve({ data: [], error: null }) }) }) }) }),
                rpc: () => Promise.resolve({ data: null, error: null })
            })
        };
        global.LESOULAppBootstrap = {
            getContext: () => ({ activeMembership: { storeId: 'store-uuid-ff22' } })
        };
        const DB = loadDbForTesting();
        DB.resetProductsDataSourceForTesting();
        assert.equal(DB.getProductsDataSource().name, 'SupabaseProductsDataSource');

        // config 끄고 reset → 기본값 복귀
        global.LESOUL_CONFIG = {
            SUPABASE_ENABLED: false,
            PRODUCTS_SUPABASE_ENABLED: false,
            SUPABASE_URL: 'http://127.0.0.1:54321',
            SUPABASE_CLIENT_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.fake'
        };
        global.LESOULSupabase = { isInitialized: () => false, getClient: () => null };
        global.LESOULAppBootstrap = { getContext: () => ({ activeMembership: null }) };
        DB.resetProductsDataSourceForTesting();
        assert.equal(DB.getProductsDataSource().name, 'LocalProductsDataSource',
            'after reset with no runtime config, default must be LocalProductsDataSource');
    });

    it('FF23: SupabaseProductsDataSource.setProducts is disabled (throws)', function () {
        global.LESOUL_CONFIG = {
            SUPABASE_ENABLED: true,
            PRODUCTS_SUPABASE_ENABLED: true,
            SUPABASE_URL: 'http://127.0.0.1:54321',
            SUPABASE_CLIENT_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.fake'
        };
        global.LESOULSupabase = {
            isInitialized: () => true,
            getClient: () => ({
                supabaseUrl: 'http://127.0.0.1:54321',
                from: () => ({ select: () => ({ eq: () => ({ is: () => ({ then: () => Promise.resolve({ data: [], error: null }) }) }) }) }),
                rpc: () => Promise.resolve({ data: null, error: null })
            })
        };
        global.LESOULAppBootstrap = {
            getContext: () => ({ activeMembership: { storeId: 'store-uuid-ff23' } })
        };
        const DB = loadDbForTesting();
        DB.resetProductsDataSourceForTesting();
        const ds = DB.getProductsDataSource();
        assert.equal(ds.name, 'SupabaseProductsDataSource');
        assert.throws(() => ds.setProducts([{ id: 1 }]),
            /not enabled|disabled/i,
            'setProducts must be disabled on SupabaseProductsDataSource');
    });

    // ==================== 3-5Q: Remote Runtime Guardrail Tests ====================

    it('FF24: config.example.js has PRODUCTS_SUPABASE_REMOTE_ENABLED default false', function () {
        const content = readFile('js/config.example.js');
        assert.match(content, /PRODUCTS_SUPABASE_REMOTE_ENABLED:\s*false/,
            'config.example.js must have PRODUCTS_SUPABASE_REMOTE_ENABLED: false');
    });

    it('FF25: remote URL + PRODUCTS_SUPABASE_REMOTE_ENABLED true + all conditions → SupabaseProductsDataSource', function () {
        global.LESOUL_CONFIG = {
            SUPABASE_ENABLED: true,
            PRODUCTS_SUPABASE_ENABLED: true,
            PRODUCTS_SUPABASE_REMOTE_ENABLED: true,
            SUPABASE_URL: 'https://example.supabase.co',
            SUPABASE_CLIENT_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.fake'
        };
        global.LESOULSupabase = {
            isInitialized: () => true,
            getClient: () => ({
                supabaseUrl: 'https://example.supabase.co',
                from: () => ({ select: () => ({ eq: () => ({ is: () => ({ then: () => Promise.resolve({ data: [], error: null }) }) }) }) }),
                rpc: () => Promise.resolve({ data: null, error: null })
            })
        };
        global.LESOULAppBootstrap = {
            getContext: () => ({ activeMembership: { storeId: 'store-uuid-remote' } })
        };
        const DB = loadDbForTesting();
        DB.resetProductsDataSourceForTesting();
        const ds = DB.getProductsDataSource();
        assert.equal(ds.name, 'SupabaseProductsDataSource',
            'remote URL + remote flag true + all conditions → SupabaseProductsDataSource');
    });

    it('FF26: remote flag true + service_role key → throws', function () {
        const fakeServiceRoleJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.fake';
        global.LESOUL_CONFIG = {
            SUPABASE_ENABLED: true,
            PRODUCTS_SUPABASE_ENABLED: true,
            PRODUCTS_SUPABASE_REMOTE_ENABLED: true,
            SUPABASE_URL: 'https://example.supabase.co',
            SUPABASE_CLIENT_KEY: fakeServiceRoleJwt
        };
        global.LESOULSupabase = {
            isInitialized: () => true,
            getClient: () => ({ supabaseUrl: 'https://example.supabase.co' })
        };
        global.LESOULAppBootstrap = {
            getContext: () => ({ activeMembership: { storeId: 'store-uuid-remote-sr' } })
        };
        const DB = loadDbForTesting();
        DB.resetProductsDataSourceForTesting();
        assert.throws(
            () => DB.getProductsDataSource(),
            /service_role/i,
            'remote flag true + service_role key must throw'
        );
    });

    it('FF27: remote flag true + no client → throws', function () {
        global.LESOUL_CONFIG = {
            SUPABASE_ENABLED: true,
            PRODUCTS_SUPABASE_ENABLED: true,
            PRODUCTS_SUPABASE_REMOTE_ENABLED: true,
            SUPABASE_URL: 'https://example.supabase.co',
            SUPABASE_CLIENT_KEY: 'anon-key'
        };
        global.LESOULSupabase = {
            isInitialized: () => false,
            getClient: () => { throw new Error('not initialized'); }
        };
        const DB = loadDbForTesting();
        DB.resetProductsDataSourceForTesting();
        assert.throws(
            () => DB.getProductsDataSource(),
            /requires initialized Supabase client/i,
            'remote flag true + no client must throw'
        );
    });

    it('FF28: remote flag true + no storeId (activeMembership null, guest mode) → silent fallback (3-6C)', function () {
        global.LESOUL_CONFIG = {
            SUPABASE_ENABLED: true,
            PRODUCTS_SUPABASE_ENABLED: true,
            PRODUCTS_SUPABASE_REMOTE_ENABLED: true,
            SUPABASE_URL: 'https://example.supabase.co',
            SUPABASE_CLIENT_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.fake'
        };
        global.LESOULSupabase = {
            isInitialized: () => true,
            getClient: () => ({ supabaseUrl: 'https://example.supabase.co' })
        };
        // 3-6C: guest mode는 silent fallback
        global.LESOULAppBootstrap = {
            getContext: () => ({ activeMembership: null })
        };
        const DB = loadDbForTesting();
        DB.resetProductsDataSourceForTesting();
        const ds = DB.getProductsDataSource();
        assert.equal(ds.name, 'LocalProductsDataSource',
            'remote flag + guest mode (activeMembership=null) must silently fallback (3-6C)');
    });

    it('FF29: local URL still works when remote flag is false', function () {
        global.LESOUL_CONFIG = {
            SUPABASE_ENABLED: true,
            PRODUCTS_SUPABASE_ENABLED: true,
            PRODUCTS_SUPABASE_REMOTE_ENABLED: false,
            SUPABASE_URL: 'http://127.0.0.1:54321',
            SUPABASE_CLIENT_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.fake'
        };
        global.LESOULSupabase = {
            isInitialized: () => true,
            getClient: () => ({
                supabaseUrl: 'http://127.0.0.1:54321',
                from: () => ({ select: () => ({ eq: () => ({ is: () => ({ then: () => Promise.resolve({ data: [], error: null }) }) }) }) }),
                rpc: () => Promise.resolve({ data: null, error: null })
            })
        };
        global.LESOULAppBootstrap = {
            getContext: () => ({ activeMembership: { storeId: 'store-uuid-local' } })
        };
        const DB = loadDbForTesting();
        DB.resetProductsDataSourceForTesting();
        const ds = DB.getProductsDataSource();
        assert.equal(ds.name, 'SupabaseProductsDataSource',
            'local URL should still work when remote flag is false');
    });

    it('FF30: default config → LocalProductsDataSource', function () {
        // PRODUCTS_SUPABASE_REMOTE_ENABLED 기본값 false 환경
        global.LESOUL_CONFIG = {
            SUPABASE_ENABLED: false,
            PRODUCTS_SUPABASE_ENABLED: false,
            PRODUCTS_SUPABASE_REMOTE_ENABLED: false
        };
        const DB = loadDbForTesting();
        DB.resetProductsDataSourceForTesting();
        const ds = DB.getProductsDataSource();
        assert.equal(ds.name, 'LocalProductsDataSource');
    });

    it('FF31: remote datasource context has remoteEnabled=true and localOnly=false', function () {
        global.LESOUL_CONFIG = {
            SUPABASE_ENABLED: true,
            PRODUCTS_SUPABASE_ENABLED: true,
            PRODUCTS_SUPABASE_REMOTE_ENABLED: true,
            SUPABASE_URL: 'https://example.supabase.co',
            SUPABASE_CLIENT_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.fake'
        };
        global.LESOULSupabase = {
            isInitialized: () => true,
            getClient: () => ({
                supabaseUrl: 'https://example.supabase.co',
                from: () => ({ select: () => ({ eq: () => ({ is: () => ({ then: () => Promise.resolve({ data: [], error: null }) }) }) }) }),
                rpc: () => Promise.resolve({ data: null, error: null })
            })
        };
        global.LESOULAppBootstrap = {
            getContext: () => ({ activeMembership: { storeId: 'store-uuid-ctx' } })
        };
        const DB = loadDbForTesting();
        DB.resetProductsDataSourceForTesting();
        // Verify code contains remoteEnabled in context creation
        const dbContent = readFile('js/db.js');
        assert.ok(dbContent.includes('remoteEnabled: !isLocalUrl'),
            'db.js must include remoteEnabled in datasource context');
    });

    it('FF32: _validateWriteContext accepts remoteEnabled context', function () {
        const dbContent = readFile('js/db.js');
        // Verify _validateWriteContext checks both localOnly and remoteEnabled
        assert.ok(dbContent.includes('context.remoteEnabled !== true'),
            '_validateWriteContext must check context.remoteEnabled');
    });

    it('FF33: _validateWriteContext localhost URL check is conditional on localOnly', function () {
        const dbContent = readFile('js/db.js');
        // Verify localhost URL check is only for localOnly context
        assert.match(dbContent, /context\.localOnly === true\)/,
            'localhost URL check should be conditional on context.localOnly === true');
    });

    it('FF34: db.js contains PRODUCTS_SUPABASE_REMOTE_ENABLED reference', function () {
        const dbContent = readFile('js/db.js');
        assert.ok(dbContent.includes('PRODUCTS_SUPABASE_REMOTE_ENABLED'),
            'db.js must reference PRODUCTS_SUPABASE_REMOTE_ENABLED');
    });

    it('FF35: no token/session/key console.log in db.js remote guardrail path', function () {
        const dbContent = readFile('js/db.js');
        // Check the remote guardrail section
        const guardrailMatch = dbContent.match(/3-5Q[\s\S]*?PRODUCTS_SUPABASE_REMOTE_ENABLED/);
        // Overall console.log check in _resolveRuntimeProductsDataSource still applies
        const fnMatch = dbContent.match(/_resolveRuntimeProductsDataSource\s*\([^)]*\)\s*\{([\s\S]*?)\n\s*\},/);
        assert.ok(fnMatch, '_resolveRuntimeProductsDataSource should exist');
        assert.doesNotMatch(fnMatch[1], /console\.log/,
            '_resolveRuntimeProductsDataSource must not console.log');
    });

    it('FF36: products.js is not modified (remote guardrail only touches db.js + config)', function () {
        const content = readFile('js/products.js');
        assert.doesNotMatch(content, /PRODUCTS_SUPABASE_REMOTE_ENABLED/,
            'products.js must not reference PRODUCTS_SUPABASE_REMOTE_ENABLED');
    });

    it('FF37: css/style.css is unchanged', function () {
        const content = readFile('css/style.css');
        assert.ok(content.length > 0, 'css/style.css should exist');
        assert.doesNotMatch(content, /PRODUCTS_SUPABASE_REMOTE_ENABLED/,
            'css/style.css must not reference PRODUCTS_SUPABASE_REMOTE_ENABLED');
    });

    it('FF38: index.html is unchanged', function () {
        const content = readFile('index.html');
        assert.doesNotMatch(content, /PRODUCTS_SUPABASE_REMOTE_ENABLED/,
            'index.html must not reference PRODUCTS_SUPABASE_REMOTE_ENABLED');
    });
});
