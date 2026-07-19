import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const runnerPath = join(__dirname, '..', 'scripts', 'run-local-auth-rpc-integration.sh');

const runner = readFileSync(runnerPath, 'utf8');

// Helper: extract the body of a function (between its definition and the next
// top-level closing brace at column 0). Used for preflight-scoped checks.
function extractFunctionBody(src, fnName) {
    const startRe = new RegExp(`${fnName}\\(\\)\\s*\\{`);
    const startMatch = startRe.exec(src);
    if (!startMatch) return '';
    const startIdx = startMatch.index + startMatch[0].length;
    let depth = 1;
    let i = startIdx;
    while (i < src.length && depth > 0) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') depth--;
        i++;
    }
    return src.slice(startIdx, i - 1);
}

test('Local runner contract (C1-C18)', async (t) => {
    await t.test('C1: no "supabase start" string', () => {
        assert.ok(
            !/supabase\s+start/.test(runner),
            'runner must not contain "supabase start" (auto-start is forbidden)'
        );
    });

    await t.test('C2: no "--ignore-health-check" string', () => {
        assert.ok(
            !runner.includes('--ignore-health-check'),
            'runner must not bypass health checks with --ignore-health-check'
        );
    });

    await t.test('C3: no "docker run" string', () => {
        assert.ok(
            !/docker\s+run/.test(runner),
            'runner must not use "docker run" (Docker Node fallback is forbidden)'
        );
    });

    await t.test('C4: no "docker pull" string', () => {
        assert.ok(
            !/docker\s+pull/.test(runner),
            'runner must not use "docker pull"'
        );
    });

    await t.test('C5: no "brew install" string', () => {
        assert.ok(
            !/brew\s+install/.test(runner),
            'runner must not auto-install packages via brew'
        );
    });

    await t.test('C6: no "npm install" string', () => {
        assert.ok(
            !/npm\s+install/.test(runner),
            'runner must not auto-install npm packages'
        );
    });

    await t.test('C7: --preflight mode exists', () => {
        assert.ok(
            runner.includes('--preflight'),
            'runner must support --preflight mode'
        );
    });

    await t.test('C8: --run mode exists', () => {
        assert.ok(
            runner.includes('--run'),
            'runner must support --run mode'
        );
    });

    await t.test('C9: db reset timeout is 600 seconds', () => {
        assert.ok(
            /run_with_timeout\s+600[^)]*db reset/.test(runner),
            'db reset must use a 600s timeout'
        );
    });

    await t.test('C10: cleanup db reset timeout is 600 seconds', () => {
        assert.ok(
            /run_with_timeout\s+600[^)]*db reset \(cleanup\)/.test(runner),
            'cleanup db reset must use a 600s timeout'
        );
    });

    await t.test('C11: docker info timeout exists', () => {
        assert.ok(
            /run_with_timeout\s+15[^)]*docker/.test(runner),
            'docker info must have a 15s timeout'
        );
    });

    await t.test('C12: supabase status timeout exists', () => {
        assert.ok(
            /run_with_timeout\s+20[^)]*supabase\s+status/.test(runner),
            'supabase status must have a 20s timeout'
        );
    });

    await t.test('C13: no "|| true" on critical commands', () => {
        const lines = runner.split('\n');
        const criticalPatterns = [
            /supabase\s+status/,
            /supabase\s+db\s+reset/,
            /node\s+--test/,
            /docker\s+info/,
        ];
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('#')) continue;
            const isCritical = criticalPatterns.some((re) => re.test(trimmed));
            if (isCritical) {
                assert.ok(
                    !/\|\|\s*true/.test(trimmed),
                    `critical command must not use "|| true": ${trimmed}`
                );
            }
        }
    });

    await t.test('C14: preflight does not run db reset', () => {
        const body = extractFunctionBody(runner, 'run_preflight');
        assert.ok(body, 'run_preflight function must exist');
        assert.ok(
            !/db\s+reset/.test(body),
            'preflight must not run "db reset" (read-only)'
        );
    });

    await t.test('C15: preflight does not write config files', () => {
        const body = extractFunctionBody(runner, 'run_preflight');
        assert.ok(
            !/>[\s>]*supabase\/config\.toml/.test(body),
            'preflight must not write to supabase/config.toml'
        );
        assert.ok(
            !/>[\s>]*js\/config\.js/.test(body),
            'preflight must not write to js/config.js'
        );
    });

    await t.test('C16: no Docker Node fallback', () => {
        assert.ok(
            !/node:20-alpine/.test(runner),
            'runner must not use node:20-alpine Docker image (Docker Node fallback forbidden)'
        );
        assert.ok(
            !/USE_DOCKER_NODE/.test(runner),
            'runner must not have USE_DOCKER_NODE logic (Docker Node fallback forbidden)'
        );
    });

    await t.test('C17: no key/token/JWT values printed', () => {
        const forbiddenPatterns = [
            /echo\s+.*\$\{?ANON_KEY/,
            /echo\s+.*\$\{?SERVICE_ROLE_KEY/,
            /printf\s+.*\$\{?ANON_KEY/,
            /printf\s+.*\$\{?SERVICE_ROLE_KEY/,
            /echo\s+.*\$anon_key/,
            /echo\s+.*\$service_role_key/,
            /echo\s+.*\$accessToken/,
            /echo\s+.*\$refreshToken/,
            /printf\s+.*\$anon_key/,
            /printf\s+.*\$service_role_key/,
            /echo\s+.*\$access_token/,
            /echo\s+.*\$refresh_token/,
        ];
        for (const re of forbiddenPatterns) {
            assert.ok(
                !re.test(runner),
                `runner must not print key/token values: pattern ${re.source} found`
            );
        }
    });

    await t.test('C18: native node only', () => {
        // Must include native node discovery (zsh login shell or standard paths).
        assert.ok(
            runner.includes('zsh -l') || runner.includes('/usr/local/bin/node') || runner.includes('/opt/homebrew/bin/node'),
            'runner must discover native Node via zsh login shell or standard install paths'
        );
        // Must not contain docker-based node execution paths.
        assert.ok(
            !/docker\s+run[^]*node:20/.test(runner),
            'runner must not execute node via Docker (native node only)'
        );
    });
});
