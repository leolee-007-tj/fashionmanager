import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

function readFile(relativePath) {
    const fullPath = join(__dirname, '..', relativePath);
    assert.ok(existsSync(fullPath), `File should exist: ${relativePath}`);
    return readFileSync(fullPath, 'utf-8');
}

describe('Remote Deployment Readiness Contract (3-5R)', function () {

    it('RD1: docs/SUPABASE_REMOTE_DEPLOYMENT_RUNBOOK.md exists', function () {
        const runbookPath = join(__dirname, '..', 'docs', 'SUPABASE_REMOTE_DEPLOYMENT_RUNBOOK.md');
        assert.ok(existsSync(runbookPath), 'SUPABASE_REMOTE_DEPLOYMENT_RUNBOOK.md should exist');
    });

    it('RD2: runbook states supabase login/link/db push are "planned commands" only, not executed in this step', function () {
        const content = readFile('docs/SUPABASE_REMOTE_DEPLOYMENT_RUNBOOK.md');
        assert.ok(content.includes('이 단계(3-5R)에서는 아래 명령을 실행하지 않는다'),
            'runbook must state commands are not executed in this step');
        assert.ok(content.includes('실제 배포 시 실행 예정 순서를 기록한 것이다'),
            'runbook must state commands are planned for actual deployment');
    });

    it('RD3: PRODUCTS_SUPABASE_REMOTE_ENABLED default is false', function () {
        const content = readFile('js/config.example.js');
        assert.match(content, /PRODUCTS_SUPABASE_REMOTE_ENABLED:\s*false/,
            'PRODUCTS_SUPABASE_REMOTE_ENABLED must default to false');
    });

    it('RD4: PRODUCTS_SUPABASE_ENABLED default is false', function () {
        const content = readFile('js/config.example.js');
        assert.match(content, /PRODUCTS_SUPABASE_ENABLED:\s*false/,
            'PRODUCTS_SUPABASE_ENABLED must default to false');
    });

    it('RD5: APP_BRAND_NAME default is LESOUL', function () {
        const content = readFile('js/config.example.js');
        assert.match(content, /APP_BRAND_NAME:\s*['"]LESOUL['"]/,
            'APP_BRAND_NAME must default to LESOUL');
    });

    it('RD6: js/config.js is not in repo (gitignored)', function () {
        const gitignore = readFile('.gitignore');
        assert.match(gitignore, /js\/config\.js/,
            'js/config.js must be in .gitignore');
    });

    it('RD7: data_export.json is not in repo (gitignored)', function () {
        const gitignore = readFile('.gitignore');
        assert.match(gitignore, /data_export\.json/,
            'data_export.json must be in .gitignore');
    });

    it('RD8: service_role string is not in allowed browser config', function () {
        const content = readFile('js/config.example.js');
        const configObjMatch = content.match(/global\.LESOUL_CONFIG = Object\.freeze\(\{([\s\S]*?)\}\)/);
        assert.ok(configObjMatch, 'config object should exist');
        let configBody = configObjMatch[1];
        configBody = configBody.replace(/\/\/.*$/gm, '');
        assert.doesNotMatch(configBody, /service_role/,
            'service_role must not appear in actual config values');
    });

    it('RD9: runbook states service_role is forbidden in browser', function () {
        const content = readFile('docs/SUPABASE_REMOTE_DEPLOYMENT_RUNBOOK.md');
        assert.ok(content.includes('service_role key'),
            'runbook must mention service_role key');
        assert.ok(content.includes('브라우저 config에 넣으면 안 된다'),
            'runbook must state service_role is forbidden in browser config');
    });

    it('RD10: runbook states only anon/publishable key is allowed', function () {
        const content = readFile('docs/SUPABASE_REMOTE_DEPLOYMENT_RUNBOOK.md');
        assert.ok(content.includes('publishable/anon key only'),
            'runbook must state only publishable/anon key is allowed');
    });

    it('RD11: runbook has stop criteria', function () {
        const content = readFile('docs/SUPABASE_REMOTE_DEPLOYMENT_RUNBOOK.md');
        assert.ok(content.includes('## 5. Stop Criteria'),
            'runbook must have Stop Criteria section');
    });

    it('RD12: runbook has rollback criteria', function () {
        const content = readFile('docs/SUPABASE_REMOTE_DEPLOYMENT_RUNBOOK.md');
        assert.ok(content.includes('## 6. Rollback 기준'),
            'runbook must have Rollback section');
    });

    it('RD13: runbook states dummy data only', function () {
        const content = readFile('docs/SUPABASE_REMOTE_DEPLOYMENT_RUNBOOK.md');
        assert.ok(content.includes('dummy user만 사용'),
            'runbook must state dummy user only');
        assert.ok(content.includes('dummy store만 사용'),
            'runbook must state dummy store only');
        assert.ok(content.includes('dummy products만 사용'),
            'runbook must state dummy products only');
    });

    it('RD14: runbook forbids real customer/product private data', function () {
        const content = readFile('docs/SUPABASE_REMOTE_DEPLOYMENT_RUNBOOK.md');
        assert.ok(content.includes('실제 운영 데이터 사용 금지'),
            'runbook must forbid real operational data');
    });

    it('RD15: runbook has GitHub Support purge ticket notice', function () {
        const content = readFile('docs/SUPABASE_REMOTE_DEPLOYMENT_RUNBOOK.md');
        assert.ok(content.includes('GitHub Support purge ticket'),
            'runbook must mention GitHub Support purge ticket');
    });

    it('RD16: runbook forbids git filter-repo re-run', function () {
        const content = readFile('docs/SUPABASE_REMOTE_DEPLOYMENT_RUNBOOK.md');
        assert.ok(content.includes('git filter-repo 재실행 금지'),
            'runbook must forbid git filter-repo re-run');
    });

    it('RD17: runbook forbids main/gh-pages force push', function () {
        const content = readFile('docs/SUPABASE_REMOTE_DEPLOYMENT_RUNBOOK.md');
        assert.ok(content.includes('main/gh-pages force push 금지'),
            'runbook must forbid main/gh-pages force push');
    });

    it('RD18: products.js is not modified', function () {
        const content = readFile('js/products.js');
        assert.doesNotMatch(content, /PRODUCTS_SUPABASE_REMOTE_ENABLED/,
            'products.js must not reference PRODUCTS_SUPABASE_REMOTE_ENABLED');
    });

    it('RD19: css/style.css is unchanged', function () {
        const content = readFile('css/style.css');
        assert.doesNotMatch(content, /PRODUCTS_SUPABASE_REMOTE_ENABLED/,
            'css/style.css must not reference PRODUCTS_SUPABASE_REMOTE_ENABLED');
    });

    it('RD20: supabase migrations/tests are unchanged', function () {
        const migrationsDir = join(__dirname, '..', 'supabase', 'migrations');
        const testsDir = join(__dirname, '..', 'supabase', 'tests');
        if (existsSync(migrationsDir)) {
            const files = readdirSync(migrationsDir);
            files.forEach(f => {
                const content = readFileSync(join(migrationsDir, f), 'utf-8');
                assert.doesNotMatch(content, /PRODUCTS_SUPABASE_REMOTE_ENABLED/,
                    `supabase migration ${f} must not reference PRODUCTS_SUPABASE_REMOTE_ENABLED`);
            });
        }
        if (existsSync(testsDir)) {
            const files = readdirSync(testsDir);
            files.forEach(f => {
                const content = readFileSync(join(testsDir, f), 'utf-8');
                assert.doesNotMatch(content, /PRODUCTS_SUPABASE_REMOTE_ENABLED/,
                    `supabase test ${f} must not reference PRODUCTS_SUPABASE_REMOTE_ENABLED`);
            });
        }
    });

});
