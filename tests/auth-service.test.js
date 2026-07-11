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
            onAuthStateChange: (cb) => ({
                data: {
                    subscription: {
                        unsubscribe: () => {}
                    }
                }
            })
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
                        subscription: {
                            unsubscribe: () => {
                                unsubscribeCalled = true;
                            }
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

test('T16: subscribe가 data.subscription.unsubscribe를 호출', () => {
    resetGlobals();
    let unsubscribeCallCount = 0;

    setupMockSupabase({
        auth: {
            onAuthStateChange: (cb) => ({
                data: {
                    subscription: {
                        unsubscribe: () => {
                            unsubscribeCallCount++;
                        }
                    }
                }
            })
        }
    });

    const unsub = globalThis.LESOULAuth.subscribe(() => {});
    unsub();

    assert.strictEqual(unsubscribeCallCount, 1, 'subscription.unsubscribe should be called exactly once');
});

test('T17: unsubscribe를 두 번 호출해도 실제 해제는 한 번만 실행', () => {
    resetGlobals();
    let unsubscribeCallCount = 0;

    setupMockSupabase({
        auth: {
            onAuthStateChange: (cb) => ({
                data: {
                    subscription: {
                        unsubscribe: () => {
                            unsubscribeCallCount++;
                        }
                    }
                }
            })
        }
    });

    const unsub = globalThis.LESOULAuth.subscribe(() => {});
    unsub();
    unsub();
    unsub();

    assert.strictEqual(unsubscribeCallCount, 1, 'unsubscribe should only execute once (idempotent)');
});

test('T18: 함수가 아닌 callback 차단 — AUTH_CALLBACK_INVALID', () => {
    resetGlobals();
    setupMockSupabase();

    assert.throws(() => {
        globalThis.LESOULAuth.subscribe('not-a-function');
    }, (err) => err.code === 'AUTH_CALLBACK_INVALID');

    assert.throws(() => {
        globalThis.LESOULAuth.subscribe(null);
    }, (err) => err.code === 'AUTH_CALLBACK_INVALID');

    assert.throws(() => {
        globalThis.LESOULAuth.subscribe(undefined);
    }, (err) => err.code === 'AUTH_CALLBACK_INVALID');
});

test('T19: getSession 반환 error 차단 — AUTH_SESSION_FAILED', async () => {
    resetGlobals();
    setupMockSupabase({
        auth: {
            getSession: () => Promise.resolve({
                data: { session: null },
                error: { message: 'session error' }
            })
        }
    });

    await assert.rejects(async () => {
        await globalThis.LESOULAuth.getSession();
    }, (err) => err.code === 'AUTH_SESSION_FAILED');
});

test('T20: signOut 반환 error 차단 — AUTH_SIGN_OUT_FAILED', async () => {
    resetGlobals();
    setupMockSupabase({
        auth: {
            signOut: () => Promise.resolve({
                error: { message: 'signout error' }
            })
        }
    });

    await assert.rejects(async () => {
        await globalThis.LESOULAuth.signOut();
    }, (err) => err.code === 'AUTH_SIGN_OUT_FAILED');
});

test('T21: LESOULAuth.init이 초기화되지 않은 client를 차단', () => {
    resetGlobals();
    // Load auth-service without initializing supabase-client
    const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'auth-service.js'), 'utf-8');
    eval(src);

    assert.throws(() => {
        globalThis.LESOULAuth.init();
    }, (err) => err.code === 'SUPABASE_NOT_INITIALIZED');
});
