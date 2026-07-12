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
    let bootstrapDeferred = null;
    let useDeferredBootstrap = false;

    const app = {
        init: () => { calls.appInit++; }
    };

    const auth = {
        init: () => { calls.authInit++; },
        bootstrapAuthenticatedUser: () => {
            calls.bootstrap++;
            if (useDeferredBootstrap) {
                bootstrapDeferred = {};
                bootstrapDeferred.promise = new Promise((resolve) => {
                    bootstrapDeferred.resolve = (val) => resolve(val || bootstrapResult);
                });
                return bootstrapDeferred.promise;
            }
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

    function makeFakeLogoutElement() {
        const listeners = {};
        return {
            hidden: true,
            addEventListener(type, handler) {
                if (!listeners[type]) listeners[type] = [];
                listeners[type].push(handler);
            },
            removeEventListener(type, handler) {
                if (!listeners[type]) return;
                listeners[type] = listeners[type].filter((h) => h !== handler);
            },
            click() {
                if (listeners.click) {
                    listeners.click.forEach((h) => h({ preventDefault: () => {} }));
                }
            },
            listenerCount(type) {
                return listeners[type] ? listeners[type].length : 0;
            }
        };
    }

    const logoutEl = makeFakeLogoutElement();

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
        getAppElement: () => appEl,
        getLogoutElement: () => logoutEl
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
        logoutEl,
        setBootstrapResult: (r) => { bootstrapResult = r; },
        setSignInFail: (v) => { signInShouldFail = v; },
        setSignOutFail: (v) => { signOutShouldFail = v; },
        setCreateStoreFail: (v) => { createStoreShouldFail = v; },
        setLibraryFail: (v) => { libraryShouldFail = v; },
        useDeferredBootstrap: (v) => { useDeferredBootstrap = v; },
        resolveBootstrap: (val) => {
            if (bootstrapDeferred) bootstrapDeferred.resolve(val);
        },
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

test('T37: ready 상태에서 헤더 logout 클릭 시 auth.signOut 1회 호출', async () => {
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
    assert.strictEqual(ctx.logoutEl.hidden, false, 'logout button must be visible in ready state');
    const beforeSignOut = ctx.calls.signOut;
    ctx.logoutEl.click();
    await flush();
    assert.strictEqual(ctx.calls.signOut, beforeSignOut + 1, 'signOut must be called exactly once on logout click');
    globalThis.LESOULAppBootstrap.destroy();
});

test('T38: logout 버튼 연속 클릭 시 signOut은 한 번만 호출', async () => {
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
    let signOutResolve;
    let signOutCallCount = 0;
    const originalSignOut = ctx.auth.signOut;
    ctx.auth.signOut = () => {
        signOutCallCount++;
        return new Promise((resolve) => {
            signOutResolve = resolve;
        });
    };
    await globalThis.LESOULAppBootstrap.start({ deps: ctx.deps });
    await flush();
    assert.strictEqual(globalThis.LESOULAppBootstrap.getState(), 'ready');
    ctx.logoutEl.click();
    ctx.logoutEl.click();
    ctx.logoutEl.click();
    await flush();
    assert.strictEqual(signOutCallCount, 1, 'signOut must be called exactly once despite 3 clicks');
    signOutResolve();
    await flush();
    globalThis.LESOULAppBootstrap.destroy();
});

test('T39: start를 두 번 호출해도 logout listener는 하나만 등록', async () => {
    resetModule();
    loadAppBootstrap();
    const ctx = makeDeps({ config: { SUPABASE_ENABLED: true, SUPABASE_URL: 'https://test.supabase.co', SUPABASE_CLIENT_KEY: 'valid-key' } });
    ctx.setBootstrapResult({ status: 'signed_out', user: null, profile: null, memberships: [] });
    await globalThis.LESOULAppBootstrap.start({ deps: ctx.deps });
    await flush();
    const listenerCountAfterFirst = ctx.logoutEl.listenerCount('click');
    await globalThis.LESOULAppBootstrap.start({ deps: ctx.deps });
    await flush();
    const listenerCountAfterSecond = ctx.logoutEl.listenerCount('click');
    assert.strictEqual(listenerCountAfterSecond, listenerCountAfterFirst, 'logout listener count must not increase on second start');
    assert.strictEqual(listenerCountAfterSecond <= 1, true, 'at most 1 logout listener');
    globalThis.LESOULAppBootstrap.destroy();
});

test('T40: destroy 후 logout listener 제거', async () => {
    resetModule();
    loadAppBootstrap();
    const ctx = makeDeps({ config: { SUPABASE_ENABLED: true, SUPABASE_URL: 'https://test.supabase.co', SUPABASE_CLIENT_KEY: 'valid-key' } });
    ctx.setBootstrapResult({ status: 'signed_out', user: null, profile: null, memberships: [] });
    await globalThis.LESOULAppBootstrap.start({ deps: ctx.deps });
    await flush();
    assert.ok(ctx.logoutEl.listenerCount('click') >= 0, 'listener exists or not');
    globalThis.LESOULAppBootstrap.destroy();
    assert.strictEqual(ctx.logoutEl.listenerCount('click'), 0, 'logout listener must be removed after destroy');
});

test('T41: bootstrap 진행 중 INITIAL_SESSION 이벤트가 발생해도 최초 결과가 stale 처리되지 않음', async () => {
    resetModule();
    loadAppBootstrap();
    const membership = { storeId: 's1', role: 'owner', storeName: 'Store A' };
    const ctx = makeDeps({ config: { SUPABASE_ENABLED: true, SUPABASE_URL: 'https://test.supabase.co', SUPABASE_CLIENT_KEY: 'valid-key' } });
    ctx.useDeferredBootstrap(true);
    ctx.setBootstrapResult({
        status: 'ready',
        user: { id: 'u1' },
        profile: { id: 'p1' },
        memberships: [membership]
    });
    const startPromise = globalThis.LESOULAppBootstrap.start({ deps: ctx.deps });
    await flush();
    const bootstrapCallCount = ctx.calls.bootstrap;
    ctx.fireAuthEvent('INITIAL_SESSION', { user: { id: 'u1' } });
    await flush();
    assert.strictEqual(ctx.calls.bootstrap, bootstrapCallCount, 'no duplicate bootstrap during in-flight');
    ctx.resolveBootstrap();
    await flush();
    assert.strictEqual(globalThis.LESOULAppBootstrap.getState(), 'ready');
    assert.strictEqual(ctx.calls.appInit, 1, 'App.init must be called exactly once');
    globalThis.LESOULAppBootstrap.destroy();
});

test('T42: bootstrap 진행 중 SIGNED_OUT 이벤트가 발생하면 늦게 도착한 ready 결과가 무시됨', async () => {
    resetModule();
    loadAppBootstrap();
    const membership = { storeId: 's1', role: 'owner', storeName: 'Store A' };
    const ctx = makeDeps({ config: { SUPABASE_ENABLED: true, SUPABASE_URL: 'https://test.supabase.co', SUPABASE_CLIENT_KEY: 'valid-key' } });
    ctx.useDeferredBootstrap(true);
    ctx.setBootstrapResult({
        status: 'ready',
        user: { id: 'u1' },
        profile: { id: 'p1' },
        memberships: [membership]
    });
    const startPromise = globalThis.LESOULAppBootstrap.start({ deps: ctx.deps });
    await flush();
    assert.strictEqual(ctx.calls.bootstrap, 1, 'bootstrap started once');
    ctx.fireAuthEvent('SIGNED_OUT', null);
    await flush();
    assert.strictEqual(globalThis.LESOULAppBootstrap.getState(), 'signed_out');
    const cBefore = globalThis.LESOULAppBootstrap.getContext();
    assert.strictEqual(cBefore.activeMembership, null, 'activeMembership null after SIGNED_OUT');
    assert.strictEqual(ctx.calls.appInit, 0, 'App.init must be 0 before resolve');
    ctx.resolveBootstrap();
    await flush();
    await flush();
    assert.strictEqual(globalThis.LESOULAppBootstrap.getState(), 'signed_out', 'state remains signed_out after stale ready');
    const cAfter = globalThis.LESOULAppBootstrap.getContext();
    assert.strictEqual(cAfter.activeMembership, null, 'activeMembership stays null');
    assert.strictEqual(ctx.calls.appInit, 0, 'App.init still 0 — stale result ignored');
    globalThis.LESOULAppBootstrap.destroy();
    await flush();
});

test('T43: 이전 bootstrap 완료 후 새로운 SIGNED_IN 이벤트로 bootstrap 재실행 가능', async () => {
    resetModule();
    loadAppBootstrap();
    const ctx = makeDeps({ config: { SUPABASE_ENABLED: true, SUPABASE_URL: 'https://test.supabase.co', SUPABASE_CLIENT_KEY: 'valid-key' } });
    ctx.setBootstrapResult({ status: 'signed_out', user: null, profile: null, memberships: [] });
    await globalThis.LESOULAppBootstrap.start({ deps: ctx.deps });
    await flush();
    const firstBootstrap = ctx.calls.bootstrap;
    assert.strictEqual(globalThis.LESOULAppBootstrap.getState(), 'signed_out');
    const membership = { storeId: 's1', role: 'owner', storeName: 'Store A' };
    ctx.setBootstrapResult({
        status: 'ready',
        user: { id: 'u1' },
        profile: { id: 'p1' },
        memberships: [membership]
    });
    ctx.fireAuthEvent('SIGNED_IN', { user: { id: 'u1' } });
    await flush();
    assert.ok(ctx.calls.bootstrap > firstBootstrap, 'bootstrap re-ran after SIGNED_IN');
    assert.strictEqual(globalThis.LESOULAppBootstrap.getState(), 'ready', 'state becomes ready');
    assert.strictEqual(ctx.calls.appInit, 1, 'App.init called once');
    globalThis.LESOULAppBootstrap.destroy();
});
