'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

function loadSupabaseClient() {
    const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'supabase-client.js'), 'utf-8');
    eval(src);
}

function makeServiceRoleJwt() {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ role: 'service_role', sub: 'test' })).toString('base64url');
    const sig = 'fakesig';
    return `${header}.${payload}.${sig}`;
}

function resetGlobals() {
    delete globalThis.LESOULSupabase;
    delete globalThis.LESOUL_CONFIG;
    delete globalThis.supabase;
}

test('T1: disabled config에서 client를 생성하지 않음', () => {
    resetGlobals();
    globalThis.LESOUL_CONFIG = Object.freeze({
        SUPABASE_ENABLED: false,
        SUPABASE_URL: '',
        SUPABASE_CLIENT_KEY: ''
    });
    loadSupabaseClient();

    const result = globalThis.LESOULSupabase.init();
    assert.strictEqual(result, null);
    assert.strictEqual(globalThis.LESOULSupabase.isEnabled(), false);
    assert.strictEqual(globalThis.LESOULSupabase.isInitialized(), false);

    const status = globalThis.LESOULSupabase.getStatus();
    assert.strictEqual(status.enabled, false);
    assert.strictEqual(status.initialized, false);
    assert.strictEqual(status.errorCode, 'SUPABASE_DISABLED');
});

test('T2: enabled 상태의 잘못된 URL 차단', () => {
    resetGlobals();
    globalThis.supabase = {
        createClient: () => ({})
    };
    loadSupabaseClient();

    assert.throws(() => {
        globalThis.LESOULSupabase.init({
            SUPABASE_ENABLED: true,
            SUPABASE_URL: 'not-a-url',
            SUPABASE_CLIENT_KEY: 'test-key'
        });
    }, (err) => {
        return err.code === 'SUPABASE_URL_INVALID';
    });
});

test('T3: enabled 상태의 빈 client key 차단', () => {
    resetGlobals();
    globalThis.supabase = {
        createClient: () => ({})
    };
    loadSupabaseClient();

    assert.throws(() => {
        globalThis.LESOULSupabase.init({
            SUPABASE_ENABLED: true,
            SUPABASE_URL: 'https://test.supabase.co',
            SUPABASE_CLIENT_KEY: ''
        });
    }, (err) => {
        return err.code === 'SUPABASE_KEY_MISSING';
    });
});

test('T4: sb_secret_ key와 service_role JWT 차단', () => {
    resetGlobals();
    globalThis.supabase = {
        createClient: () => ({})
    };
    loadSupabaseClient();

    assert.throws(() => {
        globalThis.LESOULSupabase.init({
            SUPABASE_ENABLED: true,
            SUPABASE_URL: 'https://test.supabase.co',
            SUPABASE_CLIENT_KEY: 'sb_secret_12345'
        });
    }, (err) => {
        return err.code === 'SUPABASE_SECRET_KEY_FORBIDDEN';
    });

    resetGlobals();
    globalThis.supabase = {
        createClient: () => ({})
    };
    loadSupabaseClient();

    const serviceJwt = makeServiceRoleJwt();
    assert.throws(() => {
        globalThis.LESOULSupabase.init({
            SUPABASE_ENABLED: true,
            SUPABASE_URL: 'https://test.supabase.co',
            SUPABASE_CLIENT_KEY: serviceJwt
        });
    }, (err) => {
        return err.code === 'SUPABASE_SECRET_KEY_FORBIDDEN';
    });
});

test('T5: 정상 mock config에서 client 정확히 1회 생성', () => {
    resetGlobals();
    let createCount = 0;
    const mockClient = { id: 'mock-client' };
    globalThis.supabase = {
        createClient: (url, key, opts) => {
            createCount++;
            return mockClient;
        }
    };
    loadSupabaseClient();

    const client1 = globalThis.LESOULSupabase.init({
        SUPABASE_ENABLED: true,
        SUPABASE_URL: 'https://test.supabase.co',
        SUPABASE_CLIENT_KEY: 'valid-public-key'
    });

    const client2 = globalThis.LESOULSupabase.init();

    assert.strictEqual(createCount, 1, 'createClient should be called exactly once');
    assert.strictEqual(client1, mockClient);
    assert.strictEqual(client2, mockClient);
    assert.strictEqual(globalThis.LESOULSupabase.getClient(), mockClient);
    assert.strictEqual(globalThis.LESOULSupabase.isEnabled(), true);
    assert.strictEqual(globalThis.LESOULSupabase.isInitialized(), true);

    const status = globalThis.LESOULSupabase.getStatus();
    assert.strictEqual(status.enabled, true);
    assert.strictEqual(status.initialized, true);
    assert.strictEqual(status.errorCode, null);
});

test('T6: createClient에 auth persistence 옵션 전달 확인', () => {
    resetGlobals();
    let capturedOpts = null;
    let capturedUrl = null;
    let capturedKey = null;
    globalThis.supabase = {
        createClient: (url, key, opts) => {
            capturedUrl = url;
            capturedKey = key;
            capturedOpts = opts;
            return {};
        }
    };
    loadSupabaseClient();

    globalThis.LESOULSupabase.init({
        SUPABASE_ENABLED: true,
        SUPABASE_URL: 'https://test.supabase.co',
        SUPABASE_CLIENT_KEY: 'valid-public-key'
    });

    assert.strictEqual(capturedUrl, 'https://test.supabase.co');
    assert.strictEqual(capturedKey, 'valid-public-key');
    assert.ok(capturedOpts, 'options should be passed');
    assert.ok(capturedOpts.db, 'db options should exist');
    assert.strictEqual(capturedOpts.db.schema, 'public');
    assert.ok(capturedOpts.auth, 'auth options should exist');
    assert.strictEqual(capturedOpts.auth.autoRefreshToken, true);
    assert.strictEqual(capturedOpts.auth.persistSession, true);
    assert.strictEqual(capturedOpts.auth.detectSessionInUrl, true);
});

test('T22: 브라우저 atob 경로에서 service_role JWT 차단', () => {
    resetGlobals();

    // Generate JWT before hiding Buffer
    const serviceJwt = makeServiceRoleJwt();

    // Simulate browser environment: atob exists, Buffer hidden
    const originalBuffer = globalThis.Buffer;
    const originalAtob = globalThis.atob;
    globalThis.atob = function (b64) {
        return originalBuffer.from(b64, 'base64').toString('utf-8');
    };
    // Temporarily hide Buffer so the atob path is used
    Object.defineProperty(globalThis, 'Buffer', {
        value: undefined,
        configurable: true,
        writable: true
    });

    globalThis.supabase = {
        createClient: () => ({})
    };

    try {
        loadSupabaseClient();

        assert.throws(() => {
            globalThis.LESOULSupabase.init({
                SUPABASE_ENABLED: true,
                SUPABASE_URL: 'https://test.supabase.co',
                SUPABASE_CLIENT_KEY: serviceJwt
            });
        }, (err) => {
            return err.code === 'SUPABASE_SECRET_KEY_FORBIDDEN';
        });
    } finally {
        // Restore original state
        globalThis.Buffer = originalBuffer;
        if (originalAtob !== undefined) {
            globalThis.atob = originalAtob;
        } else {
            delete globalThis.atob;
        }
    }
});
