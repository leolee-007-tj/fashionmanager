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

describe('Browser auth signup contract (SU1-SU8)', function () {

    it('SU1: auth-service.js has signUp function', function () {
        const content = readFile('js/auth-service.js');
        assert.match(content, /async function signUp\s*\(/, 'should have async signUp function');
        assert.match(content, /signUp:\s*signUp/, 'should export signUp in LESOULAuth');
    });

    it('SU2: AUTH_SIGN_UP_FAILED is separated from AUTH_SIGN_IN_FAILED', function () {
        const content = readFile('js/auth-service.js');
        const signUpFailedCount = (content.match(/AUTH_SIGN_UP_FAILED/g) || []).length;
        const signInFailedCount = (content.match(/AUTH_SIGN_IN_FAILED/g) || []).length;
        assert.ok(signUpFailedCount > 0, 'should use AUTH_SIGN_UP_FAILED');
        assert.ok(signInFailedCount > 0, 'should still use AUTH_SIGN_IN_FAILED');
        assert.ok(signUpFailedCount >= 5, `AUTH_SIGN_UP_FAILED should appear at least 5 times, found ${signUpFailedCount}`);
    });

    it('SU3: auth-service signUp returns session and user', function () {
        const content = readFile('js/auth-service.js');
        assert.match(content, /client\.auth\.signUp\s*\(/, 'should call Supabase signUp');
        assert.match(content, /return\s*\{[^}]*session[^}]*user[^}]*\}/, 'should return session and user');
        assert.match(content, /session:\s*session/, 'should include session in return');
        assert.match(content, /user:\s*user/, 'should include user in return');
    });

    it('SU4: auth-ui.js has showSignUp function', function () {
        const content = readFile('js/auth-ui.js');
        assert.match(content, /function showSignUp\s*\(/, 'should have showSignUp function');
        assert.match(content, /showSignUp:\s*showSignUp/, 'should export showSignUp in LESOULAuthUI');
        assert.match(content, /onSignUp/, 'should handle onSignUp handler');
        assert.match(content, /onShowSignIn/, 'should handle onShowSignIn handler');
    });

    it('SU5: auth-ui showSignedOut has signUp link', function () {
        const content = readFile('js/auth-ui.js');
        assert.match(content, /auth-link/, 'should have auth-link class');
        assert.match(content, /회원가입/, 'should have signup text');
        assert.match(content, /auth-link-row/, 'should have auth-link-row container');
    });

    it('SU6: app-bootstrap.js has signUp function and render helpers', function () {
        const content = readFile('js/app-bootstrap.js');
        assert.match(content, /function signUp\s*\(/, 'should have signUp function');
        assert.match(content, /signUp:\s*signUp/, 'should export signUp in LESOULAppBootstrap');
        assert.match(content, /function _renderSignIn\s*\(/, 'should have _renderSignIn helper');
        assert.match(content, /function _renderSignUp\s*\(/, 'should have _renderSignUp helper');
        assert.match(content, /function _renderSignUpPending\s*\(/, 'should have _renderSignUpPending helper');
    });

    it('SU7: signUp success checks session before bootstrap', function () {
        const content = readFile('js/app-bootstrap.js');
        assert.match(content, /!result\s*\|\|\s*!result\.session/, 'should check if session exists');
        assert.match(content, /_renderSignUpPending\s*\(/, 'should render signup pending when no session');
        assert.match(content, /가입 확인 후 로그인해 주세요/, 'should show signup confirmation message');
        assert.match(content, /_runBootstrap\s*\(/, 'should run bootstrap when session exists');
    });

    it('SU8: no password/token logging in auth modules', function () {
        const files = [
            'js/auth-service.js',
            'js/auth-ui.js',
            'js/app-bootstrap.js'
        ];
        for (const f of files) {
            const content = readFile(f);
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (/console\s*\.\s*(log|error|warn|info|debug)/.test(line)) {
                    assert.doesNotMatch(
                        line,
                        /password|access_token|refresh_token|JWT|session.*token/i,
                        `${f}:${i + 1} should not log sensitive values`
                    );
                }
            }
        }
    });
});