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

describe('Browser auth recovery contract (C1-C12)', function () {

    it('C1: index.html has js/config.js optional hook', function () {
        const html = readFile('index.html');
        assert.match(html, /js\/config\.js\?v=local/, 'index.html should load js/config.js');
    });

    it('C2: js/config.js loads before js/config.example.js', function () {
        const html = readFile('index.html');
        const configIdx = html.indexOf('js/config.js');
        const exampleIdx = html.indexOf('js/config.example.js');
        assert.ok(configIdx >= 0, 'js/config.js should be referenced');
        assert.ok(exampleIdx >= 0, 'js/config.example.js should be referenced');
        assert.ok(configIdx < exampleIdx, 'js/config.js should appear before config.example.js');
    });

    it('C3: config.example.js defaults to SUPABASE_ENABLED=false', function () {
        const content = readFile('js/config.example.js');
        assert.match(content, /SUPABASE_ENABLED:\s*false/);
        assert.doesNotMatch(content, /SUPABASE_ENABLED:\s*true/);
    });

    it('C4: config.example.js does not overwrite existing LESOUL_CONFIG', function () {
        const content = readFile('js/config.example.js');
        assert.match(content, /if\s*\(\s*!global\.LESOUL_CONFIG\s*\)/);
    });

    it('C5: js/config.js is in .gitignore', function () {
        const gitignore = readFile('.gitignore');
        const lines = gitignore.split('\n');
        const found = lines.some(line => line.trim() === 'js/config.js' || line.trim() === '/js/config.js');
        assert.ok(found, 'js/config.js should be in .gitignore');
    });

    it('C6: no service_role actual usage in index.html/js/docs', function () {
        const files = [
            'index.html',
            'js/auth-service.js',
            'js/auth-ui.js',
            'js/app-bootstrap.js',
            'js/supabase-client.js',
            'js/config.example.js',
            'docs/SUPABASE_BROWSER_AUTH_SMOKE_TEST.md',
            'docs/SUPABASE_LOCAL_TEST_RESULTS.md',
            'docs/CURRENT_ARCHITECTURE.md'
        ];
        for (const f of files) {
            if (!existsSync(join(REPO_ROOT, f))) continue;
            const content = readFile(f);
            const matches = content.match(/service_role/gi);
            if (matches) {
                for (const m of matches) {
                    const idx = content.toLowerCase().indexOf(m.toLowerCase());
                    const context = content.slice(Math.max(0, idx - 30), idx + 30);
                    if (/service_role\s*key/i.test(context) && /브라우저|금지|prohibited|browser/i.test(context)) {
                        continue;
                    }
                    if (/service_role.*JWT|service_role.*token|service_role.*secret/i.test(context) && /차단|block|forbidden|금지/i.test(context)) {
                        continue;
                    }
                }
            }
            const actualKeyPattern = /service_role["'=:\s]*[A-Za-z0-9_\-]{20,}/;
            assert.doesNotMatch(content, actualKeyPattern, `${f} should not contain actual service_role key`);
        }
    });

    it('C7: no console.log of access_token/refresh_token in js code', function () {
        const files = [
            'js/auth-service.js',
            'js/auth-ui.js',
            'js/app-bootstrap.js',
            'js/supabase-client.js',
            'index.html'
        ];
        for (const f of files) {
            const content = readFile(f);
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (/console\s*\.\s*(log|error|warn|info|debug)/.test(line)) {
                    assert.doesNotMatch(
                        line,
                        /access_token|refresh_token|session.*token|JWT|service_role/i,
                        `${f}:${i + 1} should not log token/session values`
                    );
                }
            }
        }
    });

    it('C8: auth-ui error state has retry button', function () {
        const content = readFile('js/auth-ui.js');
        assert.match(content, /showError\s*\(/, 'should have showError function');
        assert.match(content, /다시 시도|retry/i, 'should have retry button in error state');
        assert.match(content, /onRetry/, 'should have onRetry handler');
    });

    it('C9: app-bootstrap logout failure retry calls signOut again', function () {
        const content = readFile('js/app-bootstrap.js');
        assert.match(content, /로그아웃할 수 없습니다|logout.*fail|signOut.*fail/i, 'should have logout failure message');
        assert.match(content, /signOut\s*\(/, 'should call signOut');
        const signOutCount = (content.match(/signOut\s*\(/g) || []).length;
        assert.ok(signOutCount >= 2, `should call signOut in at least 2 places (primary + retry), found ${signOutCount}`);
    });

    it('C10: unknown/null bootstrap result hides app body', function () {
        const content = readFile('js/app-bootstrap.js');
        assert.match(content, /_hideApp\s*\(/, 'should have _hideApp function');
        const hideAppCount = (content.match(/_hideApp\s*\(\s*\)/g) || []).length;
        assert.ok(hideAppCount >= 5, `_hideApp should be called in multiple error paths, found ${hideAppCount}`);
        assert.match(content, /Unknown status|unknown.*bootstrap|null.*bootstrap/i, 'should handle unknown/null bootstrap');
    });

    it('C11: no remote supabase.co URL in code/docs', function () {
        const files = [
            'index.html',
            'js/config.example.js',
            'js/auth-service.js',
            'js/auth-ui.js',
            'js/app-bootstrap.js',
            'js/supabase-client.js',
            'docs/SUPABASE_BROWSER_AUTH_SMOKE_TEST.md',
            'docs/SUPABASE_LOCAL_TEST_RESULTS.md',
            'docs/CURRENT_ARCHITECTURE.md',
            'tests/browser-auth-recovery-contract.test.mjs'
        ];
        for (const f of files) {
            if (!existsSync(join(REPO_ROOT, f))) continue;
            const content = readFile(f);
            assert.doesNotMatch(
                content,
                /https?:\/\/[a-zA-Z0-9\-]+\.supabase\.(co|com|io)/i,
                `${f} should not contain remote supabase.co URL`
            );
        }
    });

    it('C12: business modules have no Supabase conversion changes', function () {
        // 3-5D 이후 js/db.js는 data layer / ProductsDataSource / mapping layer로 분리됨.
        // db.js의 Supabase 문자열은 mapping helper 이름으로 허용되며,
        // 실제 Supabase CRUD 호출 여부는 products-supabase-mapping-contract.test.mjs가 검증.
        // 여기서는 business 업무 모듈만 검사.
        const businessFiles = [
            'js/products.js',
            'js/orders.js',
            'js/customers.js',
            'js/analytics.js',
            'js/expenses.js',
            'js/excel.js',
            'js/settings.js'
        ];
        for (const f of businessFiles) {
            const content = readFile(f);
            assert.doesNotMatch(
                content,
                /supabase|Supabase|SUPABASE/,
                `${f} should not contain Supabase code`
            );
        }
    });
});
