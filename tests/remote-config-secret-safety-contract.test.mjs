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

describe('Remote Config Secret Safety Contract (3-5S)', function () {

    it('CS1: docs/SUPABASE_REMOTE_CONFIG_TEMPLATE.md exists', function () {
        const templatePath = join(__dirname, '..', 'docs', 'SUPABASE_REMOTE_CONFIG_TEMPLATE.md');
        assert.ok(existsSync(templatePath), 'SUPABASE_REMOTE_CONFIG_TEMPLATE.md should exist');
    });

    it('CS2: template has no real-looking service_role key', function () {
        const content = readFile('docs/SUPABASE_REMOTE_CONFIG_TEMPLATE.md');
        assert.doesNotMatch(content, /sb_secret_[A-Za-z0-9]{20,}/,
            'template must not contain real-looking service_role key');
        assert.doesNotMatch(content, /eyJ[A-Za-z0-9_\\-]+\.[A-Za-z0-9_\\-]+\.[A-Za-z0-9_\\-]+/,
            'template must not contain real-looking JWT');
    });

    it('CS3: template has no real-looking JWT/token', function () {
        const content = readFile('docs/SUPABASE_REMOTE_CONFIG_TEMPLATE.md');
        assert.doesNotMatch(content, /\beyJhbGciOiJ[A-Za-z0-9_\-]{30,}/,
            'template must not contain real-looking JWT');
    });

    it('CS4: template has no database password', function () {
        const content = readFile('docs/SUPABASE_REMOTE_CONFIG_TEMPLATE.md');
        assert.doesNotMatch(content, /postgres:\/\/[^:]+:[^@]+@/,
            'template must not contain postgres:// with password');
        assert.doesNotMatch(content, /DATABASE_PASSWORD\s*[:=]/,
            'template must not contain DATABASE_PASSWORD assignment');
    });

    it('CS5: template has no data_export content', function () {
        const content = readFile('docs/SUPABASE_REMOTE_CONFIG_TEMPLATE.md');
        assert.doesNotMatch(content, /"original_title":\s*"[^"]{10,}"/,
            'template must not contain product data JSON snippets');
    });

    it('CS6: template uses placeholder URL only', function () {
        const content = readFile('docs/SUPABASE_REMOTE_CONFIG_TEMPLATE.md');
        assert.ok(content.includes('YOUR_PROJECT_REF.supabase.co'),
            'template must use YOUR_PROJECT_REF placeholder');
    });

    it('CS7: template has YOUR_PROJECT_REF placeholder', function () {
        const content = readFile('docs/SUPABASE_REMOTE_CONFIG_TEMPLATE.md');
        assert.ok(content.includes('YOUR_PROJECT_REF'),
            'template must contain YOUR_PROJECT_REF placeholder');
    });

    it('CS8: template has YOUR_PUBLISHABLE_OR_ANON_KEY_ONLY placeholder', function () {
        const content = readFile('docs/SUPABASE_REMOTE_CONFIG_TEMPLATE.md');
        assert.ok(content.includes('YOUR_PUBLISHABLE_OR_ANON_KEY_ONLY'),
            'template must contain YOUR_PUBLISHABLE_OR_ANON_KEY_ONLY placeholder');
    });

    it('CS9: template states service_role is forbidden', function () {
        const content = readFile('docs/SUPABASE_REMOTE_CONFIG_TEMPLATE.md');
        assert.ok(content.includes('service_role') && content.includes('절대'),
            'template must state service_role is forbidden');
    });

    it('CS10: template states publishable/anon key only', function () {
        const content = readFile('docs/SUPABASE_REMOTE_CONFIG_TEMPLATE.md');
        assert.ok(content.includes('publishable') && content.includes('anon'),
            'template must state publishable/anon key only');
    });

    it('CS11: template states js/config.js is gitignored/local-only', function () {
        const content = readFile('docs/SUPABASE_REMOTE_CONFIG_TEMPLATE.md');
        assert.ok(content.includes('.gitignore'),
            'template must mention .gitignore');
        assert.ok(content.includes('절대 commit하지 않음'),
            'template must state never commit config.js');
    });

    it('CS12: template has rollback flags false', function () {
        const content = readFile('docs/SUPABASE_REMOTE_CONFIG_TEMPLATE.md');
        assert.ok(content.includes('SUPABASE_ENABLED: false'),
            'template must show SUPABASE_ENABLED: false in rollback');
        assert.ok(content.includes('PRODUCTS_SUPABASE_ENABLED: false'),
            'template must show PRODUCTS_SUPABASE_ENABLED: false in rollback');
        assert.ok(content.includes('PRODUCTS_SUPABASE_REMOTE_ENABLED: false'),
            'template must show PRODUCTS_SUPABASE_REMOTE_ENABLED: false in rollback');
    });

    it('CS13: js/config.js is not in repo (gitignored)', function () {
        const gitignore = readFile('.gitignore');
        assert.match(gitignore, /js\/config\.js/,
            'js/config.js must be in .gitignore');
    });

    it('CS14: data_export.json is not in repo (gitignored)', function () {
        const gitignore = readFile('.gitignore');
        assert.match(gitignore, /data_export\.json/,
            'data_export.json must be in .gitignore');
    });

    it('CS15: js/config.example.js default flags remain false', function () {
        const content = readFile('js/config.example.js');
        assert.match(content, /SUPABASE_ENABLED:\s*false/,
            'SUPABASE_ENABLED must default to false');
        assert.match(content, /PRODUCTS_SUPABASE_ENABLED:\s*false/,
            'PRODUCTS_SUPABASE_ENABLED must default to false');
        assert.match(content, /PRODUCTS_SUPABASE_REMOTE_ENABLED:\s*false/,
            'PRODUCTS_SUPABASE_REMOTE_ENABLED must default to false');
    });

    it('CS16: APP_BRAND_NAME default remains LESOUL', function () {
        const content = readFile('js/config.example.js');
        assert.match(content, /APP_BRAND_NAME:\s*['"]LESOUL['"]/,
            'APP_BRAND_NAME must default to LESOUL');
    });

    it('CS17: runbook references template document', function () {
        const content = readFile('docs/SUPABASE_REMOTE_DEPLOYMENT_RUNBOOK.md');
        assert.ok(content.includes('SUPABASE_REMOTE_CONFIG_TEMPLATE.md'),
            'runbook must reference SUPABASE_REMOTE_CONFIG_TEMPLATE.md');
    });

    it('CS18: products.js is not modified', function () {
        const content = readFile('js/products.js');
        assert.doesNotMatch(content, /SUPABASE_REMOTE_CONFIG_TEMPLATE/,
            'products.js must not reference SUPABASE_REMOTE_CONFIG_TEMPLATE');
    });

    it('CS19: css/style.css is unchanged', function () {
        const content = readFile('css/style.css');
        assert.doesNotMatch(content, /SUPABASE_REMOTE_CONFIG_TEMPLATE/,
            'css/style.css must not reference SUPABASE_REMOTE_CONFIG_TEMPLATE');
    });

    it('CS20: supabase migrations/tests are unchanged', function () {
        const migrationsDir = join(__dirname, '..', 'supabase', 'migrations');
        const testsDir = join(__dirname, '..', 'supabase', 'tests');
        if (existsSync(migrationsDir)) {
            const files = readdirSync(migrationsDir);
            files.forEach(f => {
                const content = readFileSync(join(migrationsDir, f), 'utf-8');
                assert.doesNotMatch(content, /SUPABASE_REMOTE_CONFIG_TEMPLATE/,
                    `supabase migration ${f} must not reference template`);
            });
        }
        if (existsSync(testsDir)) {
            const files = readdirSync(testsDir);
            files.forEach(f => {
                const content = readFileSync(join(testsDir, f), 'utf-8');
                assert.doesNotMatch(content, /SUPABASE_REMOTE_CONFIG_TEMPLATE/,
                    `supabase test ${f} must not reference template`);
            });
        }
    });

});
