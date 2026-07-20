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

/**
 * db.js 소스에서 DB 객체를 안전하게 평가하기 위한 sandbox 로더.
 * - localStorage stub 주입
 * - window 등 전역 가드
 * - 네트워크 호출 금지 (이 테스트는 순수 함수 수준 검증만)
 */
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
    // DB 객체를 반환하는 IIFE로 감싸서 sandbox에서 평가
    const factory = new Function(...Object.keys(sandbox), `${source}\n return DB;`);
    return factory(...Object.values(sandbox));
}

describe('Products Supabase mapping contract (M1-M18)', function () {

    it('M1: js/db.js has mapLegacyProductToSupabaseRow', function () {
        const content = readFile('js/db.js');
        assert.match(content, /mapLegacyProductToSupabaseRow\s*\(/,
            'db.js should have mapLegacyProductToSupabaseRow helper');
    });

    it('M2: js/db.js has mapSupabaseRowToLegacyProduct', function () {
        const content = readFile('js/db.js');
        assert.match(content, /mapSupabaseRowToLegacyProduct\s*\(/,
            'db.js should have mapSupabaseRowToLegacyProduct helper');
    });

    it('M3: mapping helpers do not call supabase.from', function () {
        const content = readFile('js/db.js');
        // mapLegacyProductToSupabaseRow 함수 본문 추출
        const legacyMatch = content.match(/mapLegacyProductToSupabaseRow\s*\([^)]*\)\s*\{([\s\S]*?)\n\s*\},/);
        assert.ok(legacyMatch, 'mapLegacyProductToSupabaseRow body should exist');
        assert.doesNotMatch(legacyMatch[1], /supabase\s*\.\s*from\s*\(/i,
            'mapLegacyProductToSupabaseRow must not call supabase.from');
        const supabaseMatch = content.match(/mapSupabaseRowToLegacyProduct\s*\([^)]*\)\s*\{([\s\S]*?)\n\s*\},/);
        assert.ok(supabaseMatch, 'mapSupabaseRowToLegacyProduct body should exist');
        assert.doesNotMatch(supabaseMatch[1], /supabase\s*\.\s*from\s*\(/i,
            'mapSupabaseRowToLegacyProduct must not call supabase.from');
    });

    it('M4: mapping helpers do not call insert/update/delete/upsert', function () {
        const content = readFile('js/db.js');
        const legacyMatch = content.match(/mapLegacyProductToSupabaseRow\s*\([^)]*\)\s*\{([\s\S]*?)\n\s*\},/);
        assert.ok(legacyMatch, 'mapLegacyProductToSupabaseRow body should exist');
        assert.doesNotMatch(legacyMatch[1], /\.(insert|update|delete|upsert)\s*\(/i,
            'mapLegacyProductToSupabaseRow must not call insert/update/delete/upsert');
        const supabaseMatch = content.match(/mapSupabaseRowToLegacyProduct\s*\([^)]*\)\s*\{([\s\S]*?)\n\s*\},/);
        assert.ok(supabaseMatch, 'mapSupabaseRowToLegacyProduct body should exist');
        assert.doesNotMatch(supabaseMatch[1], /\.(insert|update|delete|upsert)\s*\(/i,
            'mapSupabaseRowToLegacyProduct must not call insert/update/delete/upsert');
    });

    it('M5: legacy id maps to legacy_id', function () {
        const DB = loadDbForTesting();
        const legacy = { id: 42, original_title: 'Test', brand: 'BRAND', korea_cost: 1000 };
        const row = DB.mapLegacyProductToSupabaseRow(legacy);
        assert.equal(row.legacy_id, 42, 'legacy.id should map to row.legacy_id');
        assert.equal(row.id, null, 'row.id (uuid) should be null for new rows');

        const back = DB.mapSupabaseRowToLegacyProduct(row);
        assert.equal(back.id, 42, 'row.legacy_id should map back to legacy.id');
    });

    it('M6: Supabase uuid id is not confused with legacy numeric id', function () {
        const DB = loadDbForTesting();
        // Supabase row with both uuid id and legacy_id
        const row = {
            id: '550e8400-e29b-41d4-a716-446655440000', // uuid
            legacy_id: 99, // numeric
            original_title: 'Test',
            brand: 'BRAND'
        };
        const legacy = DB.mapSupabaseRowToLegacyProduct(row);
        // legacy.id must be the numeric legacy_id, NOT the uuid
        assert.equal(legacy.id, 99, 'legacy.id should be numeric legacy_id, not uuid');
        assert.equal(typeof legacy.id, 'number', 'legacy.id should be a number');
        // uuid must NOT leak into legacy object as id
        assert.notEqual(legacy.id, '550e8400-e29b-41d4-a716-446655440000',
            'uuid must not be used as legacy.id');

        // Reverse: legacy numeric id must go to legacy_id, not id
        const legacyProduct = { id: 77, original_title: 'X', brand: 'Y' };
        const mappedRow = DB.mapLegacyProductToSupabaseRow(legacyProduct);
        assert.equal(mappedRow.legacy_id, 77, 'legacy numeric id should map to legacy_id');
        assert.equal(mappedRow.id, null, 'supabase row id should be null (uuid assigned by DB)');
    });

    it('M7: price/cost/stock/reserved_stock fields have mapping rules', function () {
        const content = readFile('js/db.js');
        // 매핑 규칙 문서화 확인
        assert.match(content, /korea_cost/i, 'korea_cost mapping rule should exist');
        assert.match(content, /actual_converted_cost/i, 'actual_converted_cost mapping rule should exist');
        assert.match(content, /china_base_price/i, 'china_base_price mapping rule should exist');
        assert.match(content, /current_stock/i, 'current_stock mapping rule should exist');
        assert.match(content, /reserved_stock/i, 'reserved_stock mapping rule should exist');

        // 실제 매핑 동작 검증
        const DB = loadDbForTesting();
        const legacy = {
            id: 1,
            original_title: 'T',
            brand: 'B',
            korea_cost: 50000,
            actual_converted_cost: 30303,
            china_base_price: 90909,
            current_stock: 10,
            reserved_stock: 2
        };
        const row = DB.mapLegacyProductToSupabaseRow(legacy);
        assert.equal(row.korea_cost, 50000);
        assert.equal(row.actual_converted_cost, 30303);
        assert.equal(row.china_base_price, 90909);
        assert.equal(row.current_stock, 10);
        assert.equal(row.reserved_stock, 2);

        const back = DB.mapSupabaseRowToLegacyProduct(row);
        assert.equal(back.korea_cost, 50000);
        assert.equal(back.actual_converted_cost, 30303);
        assert.equal(back.china_base_price, 90909);
        assert.equal(back.current_stock, 10);
        assert.equal(back.reserved_stock, 2);
    });

    it('M8: created_at/updated_at mapping rules exist', function () {
        const content = readFile('js/db.js');
        assert.match(content, /created_at/i, 'created_at mapping rule should exist');
        assert.match(content, /updated_at/i, 'updated_at mapping rule should exist');

        const DB = loadDbForTesting();
        const now = new Date().toISOString();
        const legacy = { id: 1, original_title: 'T', brand: 'B', created_at: now, updated_at: now };
        const row = DB.mapLegacyProductToSupabaseRow(legacy);
        assert.equal(row.created_at, now);
        assert.equal(row.updated_at, now);

        const back = DB.mapSupabaseRowToLegacyProduct(row);
        assert.equal(back.created_at, now);
        assert.equal(back.updated_at, now);
    });

    it('M9: image/base64 fields are preserved as text', function () {
        const content = readFile('js/db.js');
        // 문서화에 text 보존 방침 명시
        assert.match(content, /image.*text|text.*image|base64.*text|text.*보존/i,
            'docs/code should state image base64 is preserved as text');

        const DB = loadDbForTesting();
        const base64Image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
        const legacy = { id: 1, original_title: 'T', brand: 'B', image: base64Image };
        const row = DB.mapLegacyProductToSupabaseRow(legacy);
        assert.equal(row.image, base64Image, 'base64 image should be preserved as text');
        assert.equal(typeof row.image, 'string', 'image should be string (text)');

        const back = DB.mapSupabaseRowToLegacyProduct(row);
        assert.equal(back.image, base64Image, 'base64 image should round-trip as text');
    });

    it('M10: LocalProductsDataSource is still the default active DataSource', function () {
        const content = readFile('js/db.js');
        // getProductsDataSource 기본값이 LocalProductsDataSource인지 확인
        assert.match(content, /getProductsDataSource\s*\([^)]*\)\s*\{[\s\S]*?_createLocalProductsDataSource\s*\(/,
            'getProductsDataSource should default to LocalProductsDataSource');
        // getProductsDataSource가 _createControlledSupabaseProductsDataSource를 직접 호출하지 않는지 확인.
        // 3-5M 이후 getProductsDataSource는 _resolveRuntimeProductsDataSource를 통해 간접적으로만
        // SupabaseProductsDataSource를 생성할 수 있으며, PRODUCTS_SUPABASE_ENABLED === true일 때만 활성화된다.
        const fnMatch = content.match(
            /getProductsDataSource\s*\([^)]*\)\s*\{([\s\S]*?)\n\s*\},\s*\n\s*\/\*\*/
        );
        assert.ok(fnMatch, 'getProductsDataSource function body should be extractable');
        assert.doesNotMatch(fnMatch[1], /_createControlledSupabaseProductsDataSource/,
            'getProductsDataSource body must not directly call _createControlledSupabaseProductsDataSource');
    });

    it('M11: getProductsDataSource default returns LocalProductsDataSource', function () {
        const DB = loadDbForTesting();
        const ds = DB.getProductsDataSource();
        assert.equal(ds.name, 'LocalProductsDataSource',
            'default DataSource must be LocalProductsDataSource');
        // Supabase DataSource가 아니어야 함
        assert.doesNotMatch(ds.name, /Supabase/i,
            'default DataSource must NOT be a Supabase data source');
    });

    it('M12: js/db.js has no supabase.from("products") call', function () {
        const content = readFile('js/db.js');
        assert.doesNotMatch(content, /supabase\s*\.\s*from\s*\(\s*['"]products['"]\s*\)/i,
            'db.js should not call supabase.from("products")');
        assert.doesNotMatch(content, /createClient\s*\(/,
            'db.js should not call createClient');
    });

    it('M13: no remote supabase.co URL in js files', function () {
        const files = ['js/db.js', 'js/products.js', 'js/app.js'];
        for (const f of files) {
            if (!existsSync(join(REPO_ROOT, f))) continue;
            const content = readFile(f);
            assert.doesNotMatch(content, /https?:\/\/[a-zA-Z0-9\-]+\.supabase\.(co|com|io)/i,
                `${f} should not contain remote supabase URL`);
        }
    });

    it('M14: no service_role string in js files (except forbid/금지 context)', function () {
        const files = ['js/db.js', 'js/products.js', 'js/app.js'];
        for (const f of files) {
            if (!existsSync(join(REPO_ROOT, f))) continue;
            const content = readFile(f);
            assert.doesNotMatch(content, /service_role\s*key\s*[:=]\s*['"][A-Za-z0-9_\-]{20,}/i,
                `${f} should not contain actual service_role key value`);
            const matches = content.match(/service_role/gi);
            if (matches) {
                for (const m of matches) {
                    const idx = content.toLowerCase().indexOf(m.toLowerCase());
                    const context = content.slice(Math.max(0, idx - 80), idx + 80);
                    // 3-5M: service_role을 명시적으로 차단하는 코드는 허용
                    if (/금지|prohibit|forbid|no.*browser|reject|block|deny|not.*allow|차단|아님|무시|throw/i.test(context)) continue;
                    assert.fail(`${f} should not contain service_role usage: ${context}`);
                }
            }
        }
    });

    it('M15: localStorage prefix lesoul_gh_ preserved', function () {
        const content = readFile('js/db.js');
        assert.match(content, /prefix:\s*['"]lesoul_gh_['"]/,
            'db.js should keep lesoul_gh_ prefix');
    });

    it('M16: docs state 3-5E is Products Supabase mapping contract only, no Supabase CRUD conversion', function () {
        const results = readFile('docs/SUPABASE_LOCAL_TEST_RESULTS.md');
        assert.match(results, /3-5E/i,
            'SUPABASE_LOCAL_TEST_RESULTS should mention 3-5E');
        assert.match(results, /mapping contract only|CRUD 전환.*하지 않|no Supabase CRUD conversion/i,
            'SUPABASE_LOCAL_TEST_RESULTS should state mapping contract only, no CRUD conversion');

        const map = readFile('docs/ASYNC_MIGRATION_MAP.md');
        assert.match(map, /3-5E/i,
            'ASYNC_MIGRATION_MAP should mention 3-5E');
        assert.match(map, /mapping contract only|CRUD 전환.*하지 않|no Supabase CRUD conversion/i,
            'ASYNC_MIGRATION_MAP should state mapping contract only, no CRUD conversion');
    });

    it('M17: data_export.json not present', function () {
        const fullPath = join(REPO_ROOT, 'data_export.json');
        assert.ok(!existsSync(fullPath), 'data_export.json should not be present');
    });

    it('M18: js/config.js is not committed (git ignored)', function () {
        const gitignore = readFile('.gitignore');
        const lines = gitignore.split('\n');
        const found = lines.some(line => line.trim() === 'js/config.js' || line.trim() === '/js/config.js');
        assert.ok(found, 'js/config.js should be in .gitignore');
    });

    // 추가 순수 함수 수준 검증
    it('M-extra: round-trip mapping preserves core fields', function () {
        const DB = loadDbForTesting();
        const original = {
            id: 123,
            product_code: 'BRD001',
            original_title: 'Test Product',
            normalized_title: 'test product',
            title_language: 'ko',
            brand: 'BRAND',
            category: 'tops',
            color: 'black',
            size: 'FREE',
            material: 'wool',
            korea_cost: 50000,
            actual_converted_cost: 30303,
            china_base_price: 90909,
            current_stock: 10,
            reserved_stock: 2,
            stock_year: 2026,
            stock_month: 7,
            image: 'data:image/png;base64,abc123',
            notes: 'test notes',
            created_at: '2026-07-19T00:00:00.000Z',
            updated_at: '2026-07-19T00:00:00.000Z'
        };
        const row = DB.mapLegacyProductToSupabaseRow(original);
        const back = DB.mapSupabaseRowToLegacyProduct(row);
        // 핵심 필드 보존 확인
        assert.equal(back.id, original.id);
        assert.equal(back.product_code, original.product_code);
        assert.equal(back.original_title, original.original_title);
        assert.equal(back.brand, original.brand);
        assert.equal(back.korea_cost, original.korea_cost);
        assert.equal(back.current_stock, original.current_stock);
        assert.equal(back.reserved_stock, original.reserved_stock);
        assert.equal(back.image, original.image);
    });

    it('M-extra: mapping helpers handle missing fields with safe defaults', function () {
        const DB = loadDbForTesting();
        // 최소한의 필드만 있는 legacy product
        const minimal = { id: 1, original_title: 'T', brand: 'B' };
        const row = DB.mapLegacyProductToSupabaseRow(minimal);
        assert.equal(row.legacy_id, 1);
        assert.equal(row.original_title, 'T');
        assert.equal(row.brand, 'B');
        assert.equal(row.current_stock, 0, 'current_stock should default to 0');
        assert.equal(row.reserved_stock, 0, 'reserved_stock should default to 0');
        assert.equal(row.korea_cost, null, 'korea_cost should default to null');
        assert.equal(row.store_id, null, 'store_id should be null (not used yet)');
        assert.equal(row.version, 1, 'version should default to 1');
    });

    it('M-extra: validateProductMappingInputForTesting rejects invalid inputs', function () {
        const DB = loadDbForTesting();
        // null 입력
        assert.throws(() => DB.validateProductMappingInputForTesting(null, 'legacy'),
            /non-null object/i);
        // 배열 입력
        assert.throws(() => DB.validateProductMappingInputForTesting([], 'legacy'),
            /non-null object/i);
        // 잘못된 kind
        assert.throws(() => DB.validateProductMappingInputForTesting({}, 'invalid'),
            /legacy.*supabase/i);
        // 정상 입력
        assert.equal(DB.validateProductMappingInputForTesting({}, 'legacy'), true);
        assert.equal(DB.validateProductMappingInputForTesting({}, 'supabase'), true);
    });
});
