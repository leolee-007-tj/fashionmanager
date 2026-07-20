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

describe('Data gateway async boundary contract (A1-A13)', function () {

    it('A1: js/db.js has no Supabase network CRUD call', function () {
        const content = readFile('js/db.js');
        assert.doesNotMatch(content, /supabase\s*\.\s*(from|insert|update|delete|select|rpc|storage|auth)\s*\(/i,
            'db.js should not call Supabase client methods');
        assert.doesNotMatch(content, /createClient\s*\(/,
            'db.js should not call Supabase createClient');
        assert.doesNotMatch(content, /fetch\s*\(\s*['"]https?:\/\//i,
            'db.js should not call fetch with remote URL');
    });

    it('A2: js/db.js has no service_role string (except forbid/금지 context)', function () {
        const content = readFile('js/db.js');
        const matches = content.match(/service_role/gi);
        if (matches) {
            for (const m of matches) {
                const idx = content.toLowerCase().indexOf(m.toLowerCase());
                const context = content.slice(Math.max(0, idx - 80), idx + 80);
                // 3-5M: service_role을 명시적으로 차단하는 코드는 허용
                if (/금지|prohibit|forbid|no.*browser|reject|block|deny|not.*allow|차단|아님|무시|throw/i.test(context)) continue;
                assert.fail('db.js should not contain service_role usage: ' + context);
            }
        }
        assert.doesNotMatch(content, /service_role\s*key\s*[:=]\s*['"][A-Za-z0-9_\-]{20,}/i,
            'db.js should not contain actual service_role key value');
    });

    it('A3: js/db.js has no remote supabase.co URL', function () {
        const content = readFile('js/db.js');
        assert.doesNotMatch(content, /https?:\/\/[a-zA-Z0-9\-]+\.supabase\.(co|com|io)/i,
            'db.js should not contain remote supabase URL');
        assert.doesNotMatch(content, /https?:\/\/(?!127\.0\.0\.1|localhost)/,
            'db.js should not contain any remote https URL');
    });

    it('A4: localStorage prefix lesoul_gh_ preserved', function () {
        const content = readFile('js/db.js');
        assert.match(content, /prefix:\s*['"]lesoul_gh_['"]/,
            'db.js should keep lesoul_gh_ prefix');
    });

    it('A5: business modules have no direct Supabase CRUD call', function () {
        const businessFiles = [
            'js/products.js',
            'js/orders.js',
            'js/customers.js',
            'js/analytics.js',
            'js/expenses.js',
            'js/excel.js',
            'js/settings.js',
            'js/app.js'
        ];
        for (const f of businessFiles) {
            const content = readFile(f);
            assert.doesNotMatch(
                content,
                /supabase\s*\.\s*(from|insert|update|delete|select|rpc|storage|auth)\s*\(/i,
                `${f} should not call Supabase client methods directly`
            );
            assert.doesNotMatch(content, /createClient\s*\(/,
                `${f} should not call Supabase createClient`);
        }
    });

    it('A6: business modules still use LESOULDB / DB path', function () {
        const businessFiles = [
            'js/products.js',
            'js/orders.js',
            'js/customers.js',
            'js/analytics.js',
            'js/expenses.js',
            'js/settings.js'
        ];
        for (const f of businessFiles) {
            const content = readFile(f);
            assert.match(content, /\bDB\b/,
                `${f} should still reference DB`);
        }
    });

    it('A7: data_export.json not present', function () {
        const fullPath = join(REPO_ROOT, 'data_export.json');
        assert.ok(!existsSync(fullPath), 'data_export.json should not be present');
    });

    it('A8: js/config.js is git ignored or absent', function () {
        const gitignore = readFile('.gitignore');
        const lines = gitignore.split('\n');
        const found = lines.some(line => line.trim() === 'js/config.js' || line.trim() === '/js/config.js');
        assert.ok(found, 'js/config.js should be in .gitignore');
    });

    it('A9: supabase/migrations unchanged', function () {
        const migrationsDir = join(REPO_ROOT, 'supabase', 'migrations');
        assert.ok(existsSync(migrationsDir), 'supabase/migrations directory should exist');
        const dbContent = readFile('js/db.js');
        assert.doesNotMatch(dbContent, /supabase\/migrations|\.sql\s|migrate\s*\(|runMigration|applyMigration/i,
            'db.js should not manipulate supabase migration files');
    });

    it('A10: supabase/tests unchanged', function () {
        const testsDir = join(REPO_ROOT, 'supabase', 'tests');
        assert.ok(existsSync(testsDir), 'supabase/tests directory should exist');
        const businessFiles = [
            'js/products.js',
            'js/orders.js',
            'js/customers.js',
            'js/analytics.js',
            'js/expenses.js',
            'js/excel.js',
            'js/settings.js',
            'js/db.js'
        ];
        for (const f of businessFiles) {
            const content = readFile(f);
            assert.doesNotMatch(content, /pgtap|pgTAP|supabase\/tests/i,
                `${f} should not reference pgTAP or supabase/tests`);
        }
    });

    it('A11: ASYNC_MIGRATION_MAP has db.js method list', function () {
        const content = readFile('docs/ASYNC_MIGRATION_MAP.md');
        assert.match(content, /Async Migration Map/i, 'should have title');
        assert.match(content, /getProducts/, 'should list getProducts');
        assert.match(content, /setProducts/, 'should list setProducts');
        assert.match(content, /addProduct/, 'should list addProduct');
        assert.match(content, /getOrders/, 'should list getOrders');
        assert.match(content, /getCustomers/, 'should list getCustomers');
        assert.match(content, /getExpenses/, 'should list getExpenses');
        assert.match(content, /getKeywords/, 'should list getKeywords');
        assert.match(content, /getSettings/, 'should list getSettings');
        assert.match(content, /exportAllData/, 'should list exportAllData');
        assert.match(content, /importAllData/, 'should list importAllData');
    });

    it('A12: CURRENT_ARCHITECTURE mentions localStorageDataSource / SupabaseDataSource plan', function () {
        const content = readFile('docs/CURRENT_ARCHITECTURE.md');
        assert.match(content, /localStorageDataSource/i,
            'should mention localStorageDataSource');
        assert.match(content, /SupabaseDataSource/i,
            'should mention SupabaseDataSource');
        assert.match(content, /data gateway/i,
            'should mention data gateway');
    });

    it('A13: docs explicitly state this step is not actual CRUD conversion', function () {
        const mapContent = readFile('docs/ASYNC_MIGRATION_MAP.md');
        assert.match(mapContent, /실제 CRUD 전환 단계가 아니다|not.*actual.*CRUD.*conversion/i,
            'ASYNC_MIGRATION_MAP should state this is not actual CRUD conversion');

        const archContent = readFile('docs/CURRENT_ARCHITECTURE.md');
        assert.match(archContent, /실제 상품\/주문\/고객 CRUD를 Supabase로 전환하지 않는다|not.*convert.*CRUD/i,
            'CURRENT_ARCHITECTURE should state this step does not convert actual CRUD');
    });
});
