import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const indexHtmlPath = join(__dirname, '..', 'index.html');
const gitignorePath = join(__dirname, '..', '.gitignore');
const configExamplePath = join(__dirname, '..', 'js', 'config.example.js');
const docsDir = join(__dirname, '..', 'docs');

const indexHtml = readFileSync(indexHtmlPath, 'utf8');
const gitignore = readFileSync(gitignorePath, 'utf8');
const configExample = readFileSync(configExamplePath, 'utf8');

test('Browser auth smoke contract (B1-B10)', async (t) => {
    await t.test('B1: js/config.js loads before js/config.example.js', () => {
        const configJsMatch = /<script\s+src=["']js\/config\.js[^"']*["']/.exec(indexHtml);
        const configExampleMatch = /<script\s+src=["']js\/config\.example\.js[^"']*["']/.exec(indexHtml);
        assert.ok(configJsMatch, 'js/config.js script tag must exist');
        assert.ok(configExampleMatch, 'js/config.example.js script tag must exist');
        assert.ok(
            configJsMatch.index < configExampleMatch.index,
            'js/config.js must load before js/config.example.js'
        );
    });

    await t.test('B2: js/config.js is in .gitignore', () => {
        assert.ok(
            gitignore.includes('js/config.js'),
            'js/config.js must be in .gitignore'
        );
    });

    await t.test('B3: index.html has no service_role string', () => {
        assert.ok(
            !/service_role/i.test(indexHtml),
            'index.html must not contain service_role'
        );
    });

    await t.test('B4: index.html has no real Supabase URL/key', () => {
        assert.ok(
            !/supabase\.co/i.test(indexHtml),
            'index.html must not contain supabase.co URL'
        );
        assert.ok(
            !/https?:\/\/[^'"]*supabase/i.test(indexHtml),
            'index.html must not contain real Supabase URL'
        );
        assert.ok(
            !/anon\.key/i.test(indexHtml),
            'index.html must not contain anon key'
        );
        assert.ok(
            !/service_role\.key/i.test(indexHtml),
            'index.html must not contain service_role key'
        );
    });

    await t.test('B5: config.example.js defaults to SUPABASE_ENABLED=false', () => {
        assert.ok(
            /SUPABASE_ENABLED:\s*false/.test(configExample),
            'config.example.js must default to SUPABASE_ENABLED=false'
        );
    });

    await t.test('B6: config.example.js does not overwrite existing LESOUL_CONFIG', () => {
        assert.ok(
            /if\s*\(\s*!global\.LESOUL_CONFIG\s*\)/.test(configExample) ||
            /if\s*\(\s*typeof\s+LESOUL_CONFIG\s+!==\s*['"]undefined['"]\s*\)/.test(configExample),
            'config.example.js must check if LESOUL_CONFIG exists before setting'
        );
    });

    await t.test('B7: business modules are unchanged (no Supabase conversion)', () => {
        const businessFiles = ['js/db.js', 'js/products.js', 'js/orders.js', 'js/customers.js'];
        for (const file of businessFiles) {
            const filePath = join(__dirname, '..', file);
            const content = readFileSync(filePath, 'utf8');
            assert.ok(
                !/supabase/i.test(content) && !/SUPABASE/.test(content),
                `${file} must not contain supabase references (business conversion forbidden)`
            );
        }
    });

    await t.test('B8: no real keys/tokens/JWT in tests/docs', () => {
        const testFiles = [
            'tests/supabase-client.test.js',
            'tests/auth-service.test.js',
            'tests/auth-ui.test.js',
            'tests/app-bootstrap.test.js',
            'tests/local-runner-contract.test.mjs',
            'tests/local-auth-rpc.integration.mjs'
        ];
        const forbiddenPatterns = [
            /anon\.key/i,
            /service_role\.key/i,
            /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/,
            /sk-[A-Za-z0-9_-]+/,
            /anon-[A-Za-z0-9_-]+/
        ];

        for (const file of testFiles) {
            const filePath = join(__dirname, '..', file);
            const content = readFileSync(filePath, 'utf8');
            for (const re of forbiddenPatterns) {
                assert.ok(
                    !re.test(content),
                    `${file} must not contain real key/token/JWT: ${re.source}`
                );
            }
        }
    });

    await t.test('B9: docs explicitly prohibit committing js/config.js', () => {
        const docFiles = ['SUPABASE_BROWSER_AUTH_SMOKE_TEST.md', 'SUPABASE_LOCAL_AUTH_RPC_INTEGRATION.md', 'SUPABASE_LOCAL_TEST_RESULTS.md', 'CURRENT_ARCHITECTURE.md'];
        let foundProhibition = false;
        for (const file of docFiles) {
            const filePath = join(docsDir, file);
            if (!filePath) continue;
            try {
                const content = readFileSync(filePath, 'utf8');
                if (/js\/config\.js[^']*commit.*금지|js\/config\.js[^']*must not.*commit/i.test(content)) {
                    foundProhibition = true;
                    break;
                }
            } catch (e) {
                continue;
            }
        }
        assert.ok(
            foundProhibition,
            'At least one doc file must explicitly prohibit committing js/config.js'
        );
    });

    await t.test('B10: docs explicitly prohibit service_role in browser', () => {
        const docFiles = ['SUPABASE_BROWSER_AUTH_SMOKE_TEST.md', 'SUPABASE_LOCAL_AUTH_RPC_INTEGRATION.md', 'SUPABASE_LOCAL_TEST_RESULTS.md', 'CURRENT_ARCHITECTURE.md'];
        let foundProhibition = false;
        for (const file of docFiles) {
            const filePath = join(docsDir, file);
            if (!filePath) continue;
            try {
                const content = readFileSync(filePath, 'utf8');
                if (/service_role[^']*브라우저[^']*금지|service_role[^']*browser[^']*forbidden/i.test(content)) {
                    foundProhibition = true;
                    break;
                }
            } catch (e) {
                continue;
            }
        }
        assert.ok(
            foundProhibition,
            'At least one doc file must explicitly prohibit service_role in browser'
        );
    });
});
