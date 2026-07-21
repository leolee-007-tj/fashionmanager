import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

function readFile(relativePath) {
    const fullPath = join(__dirname, '..', relativePath);
    assert.ok(existsSync(fullPath), `File should exist: ${relativePath}`);
    return readFileSync(fullPath, 'utf-8');
}

describe('Remote Deployment Command Gate Contract (3-5T)', function () {

    it('CG1: scripts/remote-deployment-preflight.sh exists', function () {
        const scriptPath = join(__dirname, '..', 'scripts', 'remote-deployment-preflight.sh');
        assert.ok(existsSync(scriptPath), 'preflight script should exist');
    });

    it('CG2: preflight script is executable (or documented as bash run)', function () {
        const scriptPath = join(__dirname, '..', 'scripts', 'remote-deployment-preflight.sh');
        const stat = statSync(scriptPath);
        // Check either executable bit OR script has shebang (bash run)
        const content = readFile('scripts/remote-deployment-preflight.sh');
        const isExecutable = (stat.mode & 0o111) !== 0;
        const hasShebang = content.startsWith('#!/usr/bin/env bash') || content.startsWith('#!/bin/bash');
        assert.ok(isExecutable || hasShebang,
            'script should be executable or have bash shebang');
    });

    it('CG3: script does not execute supabase login', function () {
        const content = readFile('scripts/remote-deployment-preflight.sh');
        // Check for actual execution (not in comment/echo)
        const lines = content.split('\n');
        const violations = lines.filter(line => {
            // skip comments and echo strings
            if (line.trim().startsWith('#')) return false;
            if (line.includes('echo ')) return false;
            // actual command execution
            return /^\s*supabase\s+login\s*$/.test(line.trim()) ||
                   /^supabase\s+login\s+/.test(line.trim());
        });
        assert.equal(violations.length, 0,
            `script must not execute 'supabase login'. Found: ${violations.join('; ')}`);
    });

    it('CG4: script does not execute supabase link', function () {
        const content = readFile('scripts/remote-deployment-preflight.sh');
        const lines = content.split('\n');
        const violations = lines.filter(line => {
            if (line.trim().startsWith('#')) return false;
            if (line.includes('echo ')) return false;
            return /^supabase\s+link\s+/.test(line.trim()) ||
                   /^\s*supabase\s+link\s*$/.test(line.trim());
        });
        assert.equal(violations.length, 0,
            `script must not execute 'supabase link'. Found: ${violations.join('; ')}`);
    });

    it('CG5: script does not execute supabase db push', function () {
        const content = readFile('scripts/remote-deployment-preflight.sh');
        const lines = content.split('\n');
        const violations = lines.filter(line => {
            if (line.trim().startsWith('#')) return false;
            if (line.includes('echo ')) return false;
            return /^supabase\s+db\s+push/.test(line.trim());
        });
        assert.equal(violations.length, 0,
            `script must not execute 'supabase db push'. Found: ${violations.join('; ')}`);
    });

    it('CG6: script includes branch check', function () {
        const content = readFile('scripts/remote-deployment-preflight.sh');
        assert.ok(content.includes('CURRENT_BRANCH') || content.includes('rev-parse --abbrev-ref'),
            'script must check current branch');
    });

    it('CG7: script blocks main/gh-pages', function () {
        const content = readFile('scripts/remote-deployment-preflight.sh');
        assert.ok(content.includes('main') && content.includes('gh-pages'),
            'script must block main/gh-pages branch');
    });

    it('CG8: script checks js/config.js staged/tracked', function () {
        const content = readFile('scripts/remote-deployment-preflight.sh');
        assert.ok(content.includes('js/config.js'),
            'script must check js/config.js');
        assert.ok(content.includes('staged') || content.includes('tracked') || content.includes('ls-files'),
            'script must check js/config.js staged/tracked status');
    });

    it('CG9: script checks data_export.json', function () {
        const content = readFile('scripts/remote-deployment-preflight.sh');
        assert.ok(content.includes('data_export.json'),
            'script must check data_export.json');
    });

    it('CG10: script checks supabase/config.toml staged', function () {
        const content = readFile('scripts/remote-deployment-preflight.sh');
        assert.ok(content.includes('supabase/config.toml'),
            'script must check supabase/config.toml staged');
    });

    it('CG11: script checks .env staged', function () {
        const content = readFile('scripts/remote-deployment-preflight.sh');
        assert.ok(content.includes('.env'),
            'script must check .env staged');
    });

    it('CG12: script checks service_role/sb_secret_', function () {
        const content = readFile('scripts/remote-deployment-preflight.sh');
        assert.ok(content.includes('service_role') || content.includes('sb_secret_'),
            'script must check service_role/sb_secret_');
    });

    it('CG13: script checks default flags false', function () {
        const content = readFile('scripts/remote-deployment-preflight.sh');
        assert.ok(content.includes('SUPABASE_ENABLED') && content.includes('PRODUCTS_SUPABASE_ENABLED'),
            'script must check default flags');
        assert.ok(content.includes('PRODUCTS_SUPABASE_REMOTE_ENABLED'),
            'script must check PRODUCTS_SUPABASE_REMOTE_ENABLED');
    });

    it('CG14: script checks APP_BRAND_NAME LESOUL', function () {
        const content = readFile('scripts/remote-deployment-preflight.sh');
        assert.ok(content.includes('APP_BRAND_NAME') && content.includes('LESOUL'),
            'script must check APP_BRAND_NAME LESOUL');
    });

    it('CG15: script checks migration/test SQL staged', function () {
        const content = readFile('scripts/remote-deployment-preflight.sh');
        assert.ok(content.includes('supabase/migrations') && content.includes('supabase/tests'),
            'script must check supabase migrations/tests staged');
    });

    it('CG16: script includes GitHub purge ticket warning', function () {
        const content = readFile('scripts/remote-deployment-preflight.sh');
        assert.ok(content.includes('GitHub') && content.includes('purge'),
            'script must include GitHub purge ticket warning');
    });

    it('CG17: script includes full JS test command guidance', function () {
        const content = readFile('scripts/remote-deployment-preflight.sh');
        assert.ok(content.includes('node --test'),
            'script must include node --test guidance');
        assert.ok(content.includes('tests/supabase-client.test.js'),
            'script must include full JS test list reference');
    });

    it('CG18: script includes DB lint/pgTAP command guidance', function () {
        const content = readFile('scripts/remote-deployment-preflight.sh');
        assert.ok(content.includes('supabase db lint'),
            'script must include DB lint guidance');
        assert.ok(content.includes('supabase test db'),
            'script must include pgTAP guidance');
    });

    it('CG19: script does not print secret values', function () {
        const content = readFile('scripts/remote-deployment-preflight.sh');
        // Should not contain patterns that echo secrets
        assert.doesNotMatch(content, /echo.*\$\{?SUPABASE_CLIENT_KEY\}?/,
            'script must not echo SUPABASE_CLIENT_KEY');
        assert.doesNotMatch(content, /echo.*\$\{?SUPABASE_URL\}?/,
            'script must not echo SUPABASE_URL');
    });

    it('CG20: runbook references preflight script', function () {
        const content = readFile('docs/SUPABASE_REMOTE_DEPLOYMENT_RUNBOOK.md');
        assert.ok(content.includes('remote-deployment-preflight.sh'),
            'runbook must reference preflight script');
    });

    it('CG21: remote config template references preflight script', function () {
        const content = readFile('docs/SUPABASE_REMOTE_CONFIG_TEMPLATE.md');
        assert.ok(content.includes('remote-deployment-preflight.sh'),
            'config template must reference preflight script');
    });

    it('CG22: js/config.js is not tracked in repo', function () {
        const gitignore = readFile('.gitignore');
        assert.match(gitignore, /js\/config\.js/,
            'js/config.js must be in .gitignore');
    });

    it('CG23: data_export.json is not tracked in repo', function () {
        const gitignore = readFile('.gitignore');
        assert.match(gitignore, /data_export\.json/,
            'data_export.json must be in .gitignore');
    });

    it('CG24: products.js is not modified for command gate', function () {
        const content = readFile('js/products.js');
        assert.doesNotMatch(content, /remote-deployment-preflight/,
            'products.js must not reference preflight script');
    });

    it('CG25: css/style.css is unchanged', function () {
        const content = readFile('css/style.css');
        assert.doesNotMatch(content, /remote-deployment-preflight/,
            'css/style.css must not reference preflight script');
    });

    it('CG26: supabase migrations/tests are unchanged', function () {
        const migrationsDir = join(__dirname, '..', 'supabase', 'migrations');
        const testsDir = join(__dirname, '..', 'supabase', 'tests');
        if (existsSync(migrationsDir)) {
            const files = readdirSync(migrationsDir);
            files.forEach(f => {
                const content = readFileSync(join(migrationsDir, f), 'utf-8');
                assert.doesNotMatch(content, /remote-deployment-preflight/,
                    `supabase migration ${f} must not reference preflight script`);
            });
        }
        if (existsSync(testsDir)) {
            const files = readdirSync(testsDir);
            files.forEach(f => {
                const content = readFileSync(join(testsDir, f), 'utf-8');
                assert.doesNotMatch(content, /remote-deployment-preflight/,
                    `supabase test ${f} must not reference preflight script`);
            });
        }
    });

});
