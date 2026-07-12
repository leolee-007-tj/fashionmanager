'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

function loadAppBootstrap() {
    const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'app-bootstrap.js'), 'utf-8');
    eval(src);
}

function resetModule() {
    delete globalThis.LESOULAppBootstrap;
}

function makeDeps(overrides) {
    const calls = {
        appInit: 0,
        loadLibrary: 0,
        bootstrap: 0,
        signIn: 0,
        signOut: 0,
        createInitialStore: 0,
        adapterInit: 0,
        authInit: 0,
        uiInit: 0,
        uiShowSignedOut: 0,
        uiShowStoreOnboarding: 0,
        uiShowStoreSelection: 0,
        uiShowLoading: 0,
        uiShowError: 0,
        uiShowAppContext: 0,
        uiHideAuth: 0,
        uiSetBusy: 0,
        uiDestroy: 0
    };

    let bootstrapResult = { status: 'signed_out', user: null, profile: null, memberships: [] };
    let signInShouldFail = false;
    let signOutShouldFail = false;
    let createStoreShouldFail = false;
    let libraryShouldFail = false;
    let authEventCallback = null;

    const app = {
        init: () => { calls.appInit++; }
    };

    const auth = {
        init: () => { calls.authInit++; },
        bootstrapAuthenticatedUser: () => {
            calls.bootstrap++;
            return Promise.resolve(bootstrapResult);
        },
        signInWithPassword: (email, password) => {
            calls.signIn++;
            if (signInShouldFail) {
                return Promise.reject(new Error('sign-in failed'));
            }
            return Promise.resolve({ session: {}, user: { id: 'u1' } });
        },
        signOut: () => {
            calls.signOut++;
            if (signOutShouldFail) {
                return Promise.reject(new Error('sign-out failed'));
            }
            return Promise.resolve(true);
        },
        createInitialStore: (opts) => {
            calls.createInitialStore++;
            if (createStoreShouldFail) {
                return Promise.reject(new Error('create-store failed'));
            }
            return Promise.resolve('store-123');
        },
        subscribe: (cb) => {
            authEventCallback = cb;
            return function unsubscribe() { authEventCallback = null; };
        }
    };

    const supabaseAdapter = {
        init: () => { calls.adapterInit++; }
    };

    const ui = {
        init: () => { calls.uiInit++; },
        showLoading: () => { calls.uiShowLoading++; },
        showSignedOut: () => { calls.uiShowSignedOut++; },
        showStoreOnboarding: () => { calls.uiShowStoreOnboarding++; },
        showStoreSelection: () => { calls.uiShowStoreSelection++; },
        showError: () => { calls.uiShowError++; },
        showAppContext: () => { calls.uiShowAppContext++; },
        hideAuth: () => { calls.uiHideAuth++; },
        setBusy: () => { calls.uiSetBusy++; },
        destroy: () => { calls.uiDestroy++; }
    };

    const rootEl = { hidden: false };
    const appEl = { style: { display: '' } };

    const deps = {
        config: () => overrides && overrides.config ? overrides.config : { SUPABASE_ENABLED: false },
        app: () => app,
        auth: () => auth,
        supabaseAdapter: () => supabaseAdapter,
        ui: () => ui,
        loadSupabaseLibrary: () => {
            calls.loadLibrary++;
            if (libraryShouldFail) {
                return Promise.reject(new Error('library load failed'));
            }
            return Promise.resolve();
        },
        getRootElement: () => rootEl,
        getAppElement: () => appEl
    };

    return {
        deps,
        calls,
        auth,
        app,
        supabaseAdapter,
        ui,
        rootEl,
        appEl,
        setBootstrapResult: (r) => { bootstrapResult = r; },
        setSignInFail: (v) => { signInShouldFail = v; },
        setSignOutFail: (v) => { signOutShouldFail = v; },
        setCreateStoreFail: (v) => { createStoreShouldFail = v; },
        setLibraryFail: (v) => { libraryShouldFail = v; },
        fireAuthEvent: (event, session) => {
            if (authEventCallback) authEventCallback({ event, session, user: session && session.user });
        }
    };
}

// Helper: wait for all microtasks (promise chains) to settle.
function flush() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

async function startAndGetState(factory, options) {
    const ctx = factory();
    await globalThis.LESOULAppBootstrap.start({ deps: ctx.deps });
    await flush();
    return ctx;
}

test('T23: feature disabled면 App.init 정확히 1회', async () => {
    resetModule();
    loadAppBootstrap();
    const ctx = makeDeps({ config: { SUPABASE_ENABLED: false } });
    await globalThis.LESOULAppBootstrap.start({ deps: ctx.deps });
    await flush();
    assert.strictEqual(ctx.calls.appInit, 1, 'App.init must be called exactly once in legacy mode');
    assert.strictEqual(globalThis.LESOULAppBootstrap.getState(), 'legacy');
    globalThis.LESOULAppBootstrap.destroy();
});

test('T24: feature disabled면 Supabase library 로드 0회', async () => {
    resetModule();
    loadAppBootstrap();
    const ctx = makeDeps({ config: { SUPABASE_ENABLED: false } });
    await globalThis.LESOULAppBootstrap.start({ deps: ctx.deps });
    await flush();
    assert.strictEqual(ctx.calls.loadLibrary, 0, 'CDN load must NOT be called when feature disabled');
    assert.strictEqual(ctx.calls.adapterInit, 0, 'adapter init must NOT be called');
    assert.strictEqual(ctx.calls.authInit, 0, 'auth init must NOT be called');
    globalThis.LESOULAppBootstrap.destroy();
});

test('T25: start 두 번 호출해도 App.init 중복 없음', async () => {
    resetModule();
    loadAppBootstrap();
    const ctx = makeDeps({ config: { SUPABASE_ENABLED: false } });
    await globalThis.LESOULAppBootstrap.start({ deps: ctx.deps });
    await globalThis.LESOULAppBootstrap.start({ deps: ctx.deps });
    await flush();
    assert.strictEqual(ctx.calls.appInit, 1, 'App.init must not be called twice');
    globalThis.LESOULAppBootstrap.destroy();
});

test('T26: enabled + signed_out이면 로그인 UI 표시', async () => {
    resetModule();
    loadAppBootstrap();
    const ctx = makeDeps({ config: { SUPABASE_ENABLED: true, SUPABASE_URL: 'https://test.supabase.co', SUPABASE_CLIENT_KEY: 'valid-key' } });
    ctx.setBootstrapResult({ status: 'signed_out', user: null, profile: null, memberships: [] });
    await globalThis.LESOULAppBootstrap.start({ deps: ctx.deps });
    await flush();
    assert.strictEqual(ctx.calls.uiShowSignedOut, 1, 'Signed-out UI must be shown');
    assert.strictEqual(globalThis.LESOULAppBootstrap.getState(), 'signed_out');
    globalThis.LESOULAppBootstrap.destroy();
});

test('T27: signed_out 상태에서 App.init 호출 없음', async () => {
    resetModule();
    loadAppBootstrap();
    const ctx = makeDeps({ config: { SUPABASE_ENABLED: true, SUPABASE_URL: 'https://test.supabase.co', SUPABASE_CLIENT_KEY: 'valid-key' } });
    ctx.setBootstrapResult({ status: 'signed_out', user: null, profile: null, memberships: [] });
    await globalThis.LESOULAppBootstrap.start({ deps: ctx.deps });
    await flush();
    assert.strictEqual(ctx.calls.appInit, 0, 'App.init must NOT be called when signed_out');
    globalThis.LESOULAppBootstrap.destroy();
});

test('T28: enabled + needs_store_onboarding이면 매장 생성 UI 표시', async () => {
    resetModule();
    loadAppBootstrap();
    const ctx = makeDeps({ config: { SUPABASE_ENABLED: true, SUPABASE_URL: 'https://test.supabase.co', SUPABASE_CLIENT_KEY: 'valid-key' } });
    ctx.setBootstrapResult({
        status: 'needs_store_onboarding',
        user: { id: 'u1' },
        profile: { id: 'p1' },
        memberships: []
    });
    await globalThis.LESOULAppBootstrap.start({ deps: ctx.deps });
    await flush();
    assert.strictEqual(ctx.calls.uiShowStoreOnboarding, 1, 'Store onboarding UI must be shown');
    assert.strictEqual(globalThis.LESOULAppBootstrap.getState(), 'needs_store_onboarding');
    globalThis.LESOULAppBootstrap.destroy();
});

test('T29: ready + membership 1개면 App.init 1회 및 ready', async () => {
    resetModule();
    loadAppBootstrap();
    const membership = { storeId: 's1', role: 'owner', storeName: 'My Store' };
    const ctx = makeDeps({ config: { SUPABASE_ENABLED: true, SUPABASE_URL: 'https://test.supabase.co', SUPABASE_CLIENT_KEY: 'valid-key' } });
    ctx.setBootstrapResult({
        status: 'ready',
        user: { id: 'u1' },
        profile: { id: 'p1' },
        memberships: [membership]
    });
    await globalThis.LESOULAppBootstrap.start({ deps: ctx.deps });
    await flush();
    assert.strictEqual(ctx.calls.appInit, 1, 'App.init must be called exactly once when ready with single membership');
    assert.strictEqual(globalThis.LESOULAppBootstrap.getState(), 'ready');
    const c = globalThis.LESOULAppBootstrap.getContext();
    assert.deepStrictEqual(c.activeMembership, membership);
    globalThis.LESOULAppBootstrap.destroy();
});

test('T30: ready + membership 2개면 store selection UI 표시', async () => {
    resetModule();
    loadAppBootstrap();
    const memberships = [
        { storeId: 's1', role: 'owner', storeName: 'Store A' },
        { storeId: 's2', role: 'manager', storeName: 'Store B' }
    ];
    const ctx = makeDeps({ config: { SUPABASE_ENABLED: true, SUPABASE_URL: 'https://test.supabase.co', SUPABASE_CLIENT_KEY: 'valid-key' } });
    ctx.setBootstrapResult({
        status: 'ready',
        user: { id: 'u1' },
        profile: { id: 'p1' },
        memberships: memberships
    });
    await globalThis.LESOULAppBootstrap.start({ deps: ctx.deps });
    await flush();
    assert.strictEqual(ctx.calls.uiShowStoreSelection, 1, 'Store selection UI must be shown');
    assert.strictEqual(globalThis.LESOULAppBootstrap.getState(), 'needs_store_selection');
    assert.strictEqual(ctx.calls.appInit, 0, 'App.init must NOT be called while selecting store');
    globalThis.LESOULAppBootstrap.destroy();
});

test('T31: membership 선택 후 activeMembership 설정 및 앱 진입', async () => {
    resetModule();
    loadAppBootstrap();
    const memberships = [
        { storeId: 's1', role: 'owner', storeName: 'Store A' },
        { storeId: 's2', role: 'manager', storeName: 'Store B' }
    ];
    const ctx = makeDeps({ config: { SUPABASE_ENABLED: true, SUPABASE_URL: 'https://test.supabase.co', SUPABASE_CLIENT_KEY: 'valid-key' } });
    ctx.setBootstrapResult({
        status: 'ready',
        user: { id: 'u1' },
        profile: { id: 'p1' },
        memberships: memberships
    });
    await globalThis.LESOULAppBootstrap.start({ deps: ctx.deps });
    await flush();
    globalThis.LESOULAppBootstrap.selectMembership(memberships[1]);
    assert.strictEqual(globalThis.LESOULAppBootstrap.getState(), 'ready');
    const c = globalThis.LESOULAppBootstrap.getContext();
    assert.deepStrictEqual(c.activeMembership, memberships[1]);
    assert.strictEqual(ctx.calls.appInit, 1, 'App.init must be called after membership selection');
    globalThis.LESOULAppBootstrap.destroy();
});

test('T32: signIn 성공 후 bootstrap 재실행', async () => {
    resetModule();
    loadAppBootstrap();
    const membership = { storeId: 's1', role: 'owner', storeName: 'Store A' };
    const ctx = makeDeps({ config: { SUPABASE_ENABLED: true, SUPABASE_URL: 'https://test.supabase.co', SUPABASE_CLIENT_KEY: 'valid-key' } });
    // First bootstrap: signed_out
    ctx.setBootstrapResult({ status: 'signed_out', user: null, profile: null, memberships: [] });
    await globalThis.LESOULAppBootstrap.start({ deps: ctx.deps });
    await flush();
    const initialBootstrapCount = ctx.calls.bootstrap;
    // Update bootstrap result for next call
    ctx.setBootstrapResult({
        status: 'ready',
        user: { id: 'u1' },
        profile: { id: 'p1' },
        memberships: [membership]
    });
    // Perform sign-in
    await globalThis.LESOULAppBootstrap.signIn({ email: 'test@test.com', password: 'pass' });
    await flush();
    assert.ok(ctx.calls.bootstrap > initialBootstrapCount, 'bootstrap must be re-run after sign-in');
    assert.strictEqual(globalThis.LESOULAppBootstrap.getState(), 'ready');
    globalThis.LESOULAppBootstrap.destroy();
});

test('T33: signIn 실패 시 안전한 로그인 오류 표시', async () => {
    resetModule();
    loadAppBootstrap();
    const ctx = makeDeps({ config: { SUPABASE_ENABLED: true, SUPABASE_URL: 'https://test.supabase.co', SUPABASE_CLIENT_KEY: 'valid-key' } });
    ctx.setBootstrapResult({ status: 'signed_out', user: null, profile: null, memberships: [] });
    await globalThis.LESOULAppBootstrap.start({ deps: ctx.deps });
    await flush();
    ctx.setSignInFail(true);
    const showErrorBefore = ctx.calls.uiShowError;
    await globalThis.LESOULAppBootstrap.signIn({ email: 'test@test.com', password: 'wrong' });
    await flush();
    assert.ok(ctx.calls.uiShowError > showErrorBefore, 'error UI must be shown on sign-in failure');
    // No legacy fallback: App.init still 0
    assert.strictEqual(ctx.calls.appInit, 0, 'App.init must NOT be called on sign-in failure');
    globalThis.LESOULAppBootstrap.destroy();
});

test('T34: signOut 성공 후 context 초기화 및 signed_out', async () => {
    resetModule();
    loadAppBootstrap();
    const membership = { storeId: 's1', role: 'owner', storeName: 'Store A' };
    const ctx = makeDeps({ config: { SUPABASE_ENABLED: true, SUPABASE_URL: 'https://test.supabase.co', SUPABASE_CLIENT_KEY: 'valid-key' } });
    ctx.setBootstrapResult({
        status: 'ready',
        user: { id: 'u1' },
        profile: { id: 'p1' },
        memberships: [membership]
    });
    await globalThis.LESOULAppBootstrap.start({ deps: ctx.deps });
    await flush();
    // Verify ready state
    assert.strictEqual(globalThis.LESOULAppBootstrap.getState(), 'ready');
    // Sign out
    ctx.setBootstrapResult({ status: 'signed_out', user: null, profile: null, memberships: [] });
    await globalThis.LESOULAppBootstrap.signOut();
    await flush();
    assert.strictEqual(globalThis.LESOULAppBootstrap.getState(), 'signed_out');
    const c = globalThis.LESOULAppBootstrap.getContext();
    assert.strictEqual(c.user, null, 'user must be cleared');
    assert.strictEqual(c.activeMembership, null, 'activeMembership must be cleared');
    assert.deepStrictEqual(c.memberships, [], 'memberships must be cleared');
    globalThis.LESOULAppBootstrap.destroy();
});

test('T35: library load 실패 시 error이며 legacy fallback 없음', async () => {
    resetModule();
    loadAppBootstrap();
    const ctx = makeDeps({ config: { SUPABASE_ENABLED: true, SUPABASE_URL: 'https://test.supabase.co', SUPABASE_CLIENT_KEY: 'valid-key' } });
    ctx.setLibraryFail(true);
    await globalThis.LESOULAppBootstrap.start({ deps: ctx.deps });
    await flush();
    assert.strictEqual(globalThis.LESOULAppBootstrap.getState(), 'error');
    assert.ok(ctx.calls.uiShowError >= 1, 'Error UI must be shown');
    assert.strictEqual(ctx.calls.appInit, 0, 'NO legacy fallback: App.init must remain 0');
    globalThis.LESOULAppBootstrap.destroy();
});

test('T36: SIGNED_OUT 이벤트 수신 시 앱을 숨기고 context 초기화', async () => {
    resetModule();
    loadAppBootstrap();
    const membership = { storeId: 's1', role: 'owner', storeName: 'Store A' };
    const ctx = makeDeps({ config: { SUPABASE_ENABLED: true, SUPABASE_URL: 'https://test.supabase.co', SUPABASE_CLIENT_KEY: 'valid-key' } });
    ctx.setBootstrapResult({
        status: 'ready',
        user: { id: 'u1' },
        profile: { id: 'p1' },
        memberships: [membership]
    });
    await globalThis.LESOULAppBootstrap.start({ deps: ctx.deps });
    await flush();
    assert.strictEqual(globalThis.LESOULAppBootstrap.getState(), 'ready');
    // Fire SIGNED_OUT auth event
    ctx.fireAuthEvent('SIGNED_OUT', null);
    await flush();
    assert.strictEqual(globalThis.LESOULAppBootstrap.getState(), 'signed_out');
    const c = globalThis.LESOULAppBootstrap.getContext();
    assert.strictEqual(c.user, null, 'user must be cleared on SIGNED_OUT');
    assert.strictEqual(c.activeMembership, null, 'activeMembership must be cleared on SIGNED_OUT');
    assert.deepStrictEqual(c.memberships, [], 'memberships must be cleared on SIGNED_OUT');
    globalThis.LESOULAppBootstrap.destroy();
});
