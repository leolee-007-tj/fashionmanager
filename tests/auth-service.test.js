'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

function loadModule(filename) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'js', filename), 'utf-8');
    eval(src);
}

function resetGlobals() {
    delete globalThis.LESOULSupabase;
    delete globalThis.LESOULAuth;
    delete globalThis.LESOUL_CONFIG;
    delete globalThis.supabase;
}

function setupMockSupabase(overrides) {
    const mockClient = {
        auth: {
            getSession: () => Promise.resolve({ data: { session: null } }),
            signInWithPassword: () => Promise.resolve({ data: {}, error: null }),
            signOut: () => Promise.resolve({ error: null }),
            onAuthStateChange: (cb) => ({ data: { unsubscribe: () => {} } })
        },
        rpc: () => Promise.resolve({ data: null, error: null }),
        from: () => ({
            select: () => ({
                eq: () => ({
                    eq: () => ({
                        order: () => Promise.resolve({ data: [], error: null })
                    }),
                    in: () => ({
                        is: () => Promise.resolve({ data: [], error: null })
                    })
                })
            })
        })
    };

    if (overrides) {
        if (overrides.auth) {
            Object.assign(mockClient.auth, overrides.auth);
        }
        if (overrides.rpc) {
            mockClient.rpc = overrides.rpc;
        }
        if (overrides.from) {
            mockClient.from = overrides.from;
        }
    }

    globalThis.supabase = {
        createClient: () => mockClient
    };

    loadModule('supabase-client.js');
    globalThis.LESOULSupabase.init({
        SUPABASE_ENABLED: true,
        SUPABASE_URL: 'https://test.supabase.co',
        SUPABASE_CLIENT_KEY: 'valid-public-key'
    });

    loadModule('auth-service.js');
    return mockClient;
}

test('T7: 빈 email/password 로그인 차단', async () => {
    resetGlobals();
    setupMockSupabase();

    await assert.rejects(async () => {
        await globalThis.LESOULAuth.signInWithPassword('', 'pass');
    }, (err) => err.code === 'AUTH_SIGN_IN_FAILED');

    await assert.rejects(async () => {
        await globalThis.LESOULAuth.signInWithPassword('test@test.com', '');
    }, (err) => err.code === 'AUTH_SIGN_IN_FAILED');

    await assert.rejects(async () => {
        await globalThis.LESOULAuth.signInWithPassword('noatsign', 'pass');
    }, (err) => err.code === 'AUTH_SIGN_IN_FAILED');
});

test('T8: signInWithPassword에 정제된 email과 password 전달', async () => {
    resetGlobals();
    let capturedEmail = null;
    let capturedPassword = null;

    setupMockSupabase({
        auth: {
            signInWithPassword: (params) => {
                capturedEmail = params.email;
                capturedPassword = params.password;
                return Promise.resolve({
                    data: {
                        session: { user: { id: 'u1' } },
                        user: { id: 'u1' }
                    },
                    error: null
                });
            }
        }
    });

    const result = await globalThis.LESOULAuth.signInWithPassword('  test@test.com  ', 'mypassword');

    assert.strictEqual(capturedEmail, 'test@test.com');
    assert.strictEqual(capturedPassword, 'mypassword');
    assert.ok(result.session);
    assert.ok(result.user);
});

test('T9: getSession이 session/user 반환', async () => {
    resetGlobals();
    const mockUser = { id: 'user-123', email: 'test@test.com' };
    const mockSession = { user: mockUser, access_token: 'tok' };

    setupMockSupabase({
        auth: {
            getSession: () => Promise.resolve({
                data: { session: mockSession }
            })
        }
    });

    const result = await globalThis.LESOULAuth.getSession();
    assert.deepStrictEqual(result.session, mockSession);
    assert.deepStrictEqual(result.user, mockUser);

    const user = await globalThis.LESOULAuth.getCurrentUser();
    assert.deepStrictEqual(user, mockUser);
});

test('T10: signOut 호출 및 true 반환', async () => {
    resetGlobals();
    let signOutCalled = false;

    setupMockSupabase({
        auth: {
            signOut: () => {
                signOutCalled = true;
                return Promise.resolve({ error: null });
            }
        }
    });

    const result = await globalThis.LESOULAuth.signOut();
    assert.strictEqual(result, true);
    assert.strictEqual(signOutCalled, true);
});

test('T11: subscribe가 auth 이벤트 전달하고 unsubscribe 가능', async () => {
    resetGlobals();
    let callback = null;
    let unsubscribeCalled = false;

    setupMockSupabase({
        auth: {
            onAuthStateChange: (cb) => {
                callback = cb;
                return {
                    data: {
                        unsubscribe: () => {
                            unsubscribeCalled = true;
                        }
                    }
                };
            }
        }
    });

    let receivedEvent = null;
    let receivedUser = null;
    const unsub = globalThis.LESOULAuth.subscribe((payload) => {
        receivedEvent = payload.event;
        receivedUser = payload.user;
    });

    const mockUser = { id: 'u1' };
    callback('SIGNED_IN', { user: mockUser });

    assert.strictEqual(receivedEvent, 'SIGNED_IN');
    assert.deepStrictEqual(receivedUser, mockUser);

    unsub();
    assert.strictEqual(unsubscribeCalled, true);
});

test('T12: ensureUserProfile이 정확한 RPC 이름과 인자 사용', async () => {
    resetGlobals();
    let capturedRpcName = null;
    let capturedParams = null;
    const mockProfile = { id: 'p1', display_name: 'Test' };

    setupMockSupabase({
        auth: {
            getSession: () => Promise.resolve({
                data: { session: { user: { id: 'u1' } } }
            })
        },
        rpc: (name, params) => {
            capturedRpcName = name;
            capturedParams = params;
            return Promise.resolve({ data: mockProfile, error: null });
        }
    });

    const result = await globalThis.LESOULAuth.ensureUserProfile('My Name', 'ko');

    assert.strictEqual(capturedRpcName, 'ensure_user_profile');
    assert.strictEqual(capturedParams.p_display_name, 'My Name');
    assert.strictEqual(capturedParams.p_preferred_language, 'ko');
    assert.deepStrictEqual(result, mockProfile);
});

test('T13: bootstrapAuthenticatedUser가 세션 없을 때 signed_out 반환', async () => {
    resetGlobals();
    setupMockSupabase({
        auth: {
            getSession: () => Promise.resolve({
                data: { session: null }
            })
        }
    });

    const result = await globalThis.LESOULAuth.bootstrapAuthenticatedUser();
    assert.strictEqual(result.status, 'signed_out');
    assert.strictEqual(result.user, null);
    assert.strictEqual(result.profile, null);
    assert.deepStrictEqual(result.memberships, []);
});

test('T14: 세션은 있지만 membership이 없으면 needs_store_onboarding 반환', async () => {
    resetGlobals();
    const mockUser = { id: 'u1' };
    const mockProfile = { id: 'p1' };

    setupMockSupabase({
        auth: {
            getSession: () => Promise.resolve({
                data: { session: { user: mockUser } }
            })
        },
        rpc: (name, params) => {
            if (name === 'ensure_user_profile') {
                return Promise.resolve({ data: mockProfile, error: null });
            }
            return Promise.resolve({ data: null, error: null });
        },
        from: () => ({
            select: () => ({
                eq: () => ({
                    eq: () => ({
                        order: () => Promise.resolve({ data: [], error: null })
                    }),
                    in: () => ({
                        is: () => Promise.resolve({ data: [], error: null })
                    })
                })
            })
        })
    });

    const result = await globalThis.LESOULAuth.bootstrapAuthenticatedUser();
    assert.strictEqual(result.status, 'needs_store_onboarding');
    assert.deepStrictEqual(result.user, mockUser);
    assert.deepStrictEqual(result.profile, mockProfile);
    assert.deepStrictEqual(result.memberships, []);
});

test('T15: createInitialStore가 정확한 RPC 이름과 인자 사용', async () => {
    resetGlobals();
    let capturedRpcName = null;
    let capturedParams = null;
    const mockStoreId = 'store-123';

    setupMockSupabase({
        auth: {
            getSession: () => Promise.resolve({
                data: { session: { user: { id: 'u1' } } }
            })
        },
        rpc: (name, params) => {
            capturedRpcName = name;
            capturedParams = params;
            return Promise.resolve({ data: mockStoreId, error: null });
        }
    });

    const result = await globalThis.LESOULAuth.createInitialStore({
        name: '  My Store  ',
        subtitle: '  Sub  ',
        defaultLanguage: 'en'
    });

    assert.strictEqual(capturedRpcName, 'create_initial_store');
    assert.strictEqual(capturedParams.p_name, 'My Store');
    assert.strictEqual(capturedParams.p_subtitle, 'Sub');
    assert.strictEqual(capturedParams.p_default_language, 'en');
    assert.strictEqual(result, mockStoreId);
});
