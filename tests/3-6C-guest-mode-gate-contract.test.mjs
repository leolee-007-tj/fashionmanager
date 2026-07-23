/**
 * 3-6C: JS-only Guest Mode Gate Contract
 *
 * 검증 항목:
 *  1. status='guest'이면 needs_store_onboarding으로 가지 않고 앱 진입한다.
 *  2. guest 상태에서는 createInitialStore가 호출되지 않는다.
 *  3. guest 상태에서는 SupabaseProductsDataSource가 활성화되지 않는다.
 *  4. active membership이 있는 사용자는 기존 ready 흐름을 유지한다.
 *  5. signed_out / login / logout 흐름은 기존 contract를 유지한다.
 *  6. showAppContext에 guest mode 표시가 들어간다.
 *
 * DB migration/RLS/RPC 변경 없음. JS-only 변경.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = join(__dirname, '..');

function loadAppBootstrap() {
    const src = readFileSync(join(REPO_ROOT, 'js', 'app-bootstrap.js'), 'utf-8');
    eval(src);
}

function loadAuthService() {
    const src = readFileSync(join(REPO_ROOT, 'js', 'auth-service.js'), 'utf-8');
    eval(src);
}

function loadAuthUi() {
    const src = readFileSync(join(REPO_ROOT, 'js', 'auth-ui.js'), 'utf-8');
    eval(src);
}

function loadDb() {
    const storage = {};
    const localStorageStub = {
        getItem(key) { return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null; },
        setItem(key, value) { storage[key] = String(value); },
        removeItem(key) { delete storage[key]; }
    };
    const sandbox = {
        localStorage: localStorageStub, console, Date, Math, JSON, Object, Array,
        Number, String, Boolean, Error, RegExp, Promise
    };
    const source = readFileSync(join(REPO_ROOT, 'js', 'db.js'), 'utf-8');
    const factory = new Function(...Object.keys(sandbox), `${source}\n return DB;`);
    const DB = factory(...Object.values(sandbox));
    // Expose for test assertion convenience
    globalThis.DB = DB;
    return DB;
}

function resetModules() {
    delete globalThis.LESOULAppBootstrap;
    delete globalThis.LESOULAuth;
    delete globalThis.LESOULAuthUI;
    delete globalThis.LESOULSupabase;
    delete globalThis.DB;
}

function makeDeps(overrides) {
    const calls = {
        appInit: 0,
        loadLibrary: 0,
        bootstrap: 0,
        signIn: 0,
        signOut: 0,
        createInitialStore: 0,
        bootstrapOpts: null
    };

    let bootstrapResult = { status: 'signed_out', user: null, profile: null, memberships: [] };
    let libraryShouldFail = false;
    let authEventCallback = null;

    const app = { init: () => { calls.appInit++; } };

    const auth = {
        init: () => {},
        bootstrapAuthenticatedUser: (opts) => {
            calls.bootstrap++;
            calls.bootstrapOpts = opts || null;
            return Promise.resolve(bootstrapResult);
        },
        signInWithPassword: () => Promise.resolve({ session: {}, user: { id: 'u1' } }),
        signOut: () => Promise.resolve(true),
        createInitialStore: (opts) => {
            calls.createInitialStore++;
            return Promise.resolve('store-123');
        },
        subscribe: (cb) => {
            authEventCallback = cb;
            return function unsubscribe() { authEventCallback = null; };
        }
    };

    const supabaseAdapter = { init: () => {} };

    const ui = {
        _lastMethod: null,
        init: () => { ui._lastMethod = 'init'; },
        showLoading: () => { ui._lastMethod = 'showLoading'; },
        showSignedOut: () => { ui._lastMethod = 'showSignedOut'; },
        showSignUp: () => { ui._lastMethod = 'showSignUp'; },
        showStoreOnboarding: () => { ui._lastMethod = 'showStoreOnboarding'; },
        showStoreSelection: () => { ui._lastMethod = 'showStoreSelection'; },
        showError: () => { ui._lastMethod = 'showError'; },
        showAppContext: () => { ui._lastMethod = 'showAppContext'; },
        hideAuth: () => { ui._lastMethod = 'hideAuth'; },
        showAuth: () => { ui._lastMethod = 'showAuth'; },
        setBusy: () => {},
        destroy: () => {}
    };

    const rootEl = { hidden: false };
    const appEl = { style: { display: '' } };

    const logoutEl = {
        hidden: true,
        listeners: [],
        addEventListener(type, handler) { if (type === 'click') this.listeners.push(handler); },
        removeEventListener(type, handler) {
            if (type === 'click') this.listeners = this.listeners.filter(h => h !== handler);
        },
        click() { this.listeners.forEach(h => h({ preventDefault: () => {} })); }
    };

    const deps = {
        config: () => overrides && overrides.config ? overrides.config : { SUPABASE_ENABLED: true },
        app: () => app,
        auth: () => auth,
        supabaseAdapter: () => supabaseAdapter,
        ui: () => ui,
        loadSupabaseLibrary: () => {
            calls.loadLibrary++;
            if (libraryShouldFail) return Promise.reject(new Error('library load failed'));
            return Promise.resolve();
        },
        getRootElement: () => rootEl,
        getAppElement: () => appEl,
        getLogoutElement: () => logoutEl
    };

    return {
        deps, calls, auth, app, supabaseAdapter, ui, rootEl, appEl, logoutEl,
        setBootstrapResult: (r) => { bootstrapResult = r; },
        fireAuthEvent: (event, session) => {
            if (authEventCallback) authEventCallback({ event, session, user: session && session.user });
        }
    };
}

function flush() { return new Promise(r => setTimeout(r, 0)); }

describe('3-6C: auth-service bootstrapAuthenticatedUser with allowGuestMode', () => {
    it('A1: allowGuestMode=false(default) → no membership → needs_store_onboarding', async () => {
        resetModules();
        loadAuthService();
        const fakeSession = { user: { id: 'u-no-membership' } };
        const fakeProfile = { id: 'u-no-membership' };
        globalThis.LESOULSupabase = {
            isInitialized: () => true,
            getClient: () => ({
                auth: { getSession: () => Promise.resolve({ data: { session: fakeSession }, error: null }) },
                rpc: (name) => {
                    if (name === 'ensure_user_profile') {
                        return Promise.resolve({ data: fakeProfile, error: null });
                    }
                    return Promise.resolve({ data: null, error: null });
                },
                from: () => ({
                    select: () => ({
                        eq: () => ({
                            eq: () => ({
                                order: () => Promise.resolve({ data: [], error: null })
                            })
                        })
                    })
                })
            })
        };
        const result = await globalThis.LESOULAuth.bootstrapAuthenticatedUser();
        assert.equal(result.status, 'needs_store_onboarding',
            'without allowGuestMode, no membership → needs_store_onboarding');
        assert.deepEqual(result.memberships, []);
        delete globalThis.LESOULSupabase;
    });

    it('A2: allowGuestMode=true → no membership → guest', async () => {
        resetModules();
        loadAuthService();
        const fakeSession = { user: { id: 'u-no-membership' } };
        const fakeProfile = { id: 'u-no-membership' };
        globalThis.LESOULSupabase = {
            isInitialized: () => true,
            getClient: () => ({
                auth: { getSession: () => Promise.resolve({ data: { session: fakeSession }, error: null }) },
                rpc: (name) => {
                    if (name === 'ensure_user_profile') {
                        return Promise.resolve({ data: fakeProfile, error: null });
                    }
                    return Promise.resolve({ data: null, error: null });
                },
                from: () => ({
                    select: () => ({
                        eq: () => ({
                            eq: () => ({
                                order: () => Promise.resolve({ data: [], error: null })
                            })
                        })
                    })
                })
            })
        };
        const result = await globalThis.LESOULAuth.bootstrapAuthenticatedUser({ allowGuestMode: true });
        assert.equal(result.status, 'guest',
            'with allowGuestMode=true, no membership → guest');
        assert.deepEqual(result.memberships, []);
        assert.ok(result.user, 'user must be returned');
        delete globalThis.LESOULSupabase;
    });

    it('A3: allowGuestMode=true + membership 있음 → ready', async () => {
        resetModules();
        loadAuthService();
        const fakeSession = { user: { id: 'u-with-membership' } };
        const fakeProfile = { id: 'u-with-membership' };
        const fakeMemberships = [{ store_id: 's-1', role: 'owner', is_active: true, created_at: '2026-01-01' }];
        const fakeStores = [{ id: 's-1', name: 'My Store', subtitle: null }];
        globalThis.LESOULSupabase = {
            isInitialized: () => true,
            getClient: () => ({
                auth: { getSession: () => Promise.resolve({ data: { session: fakeSession }, error: null }) },
                rpc: (name) => {
                    if (name === 'ensure_user_profile') {
                        return Promise.resolve({ data: fakeProfile, error: null });
                    }
                    return Promise.resolve({ data: null, error: null });
                },
                from: (table) => {
                    if (table === 'store_members') {
                        return {
                            select: () => ({
                                eq: () => ({
                                    eq: () => ({
                                        order: () => Promise.resolve({ data: fakeMemberships, error: null })
                                    })
                                })
                            })
                        };
                    }
                    if (table === 'stores') {
                        return {
                            select: () => ({
                                in: () => ({
                                    is: () => Promise.resolve({ data: fakeStores, error: null })
                                })
                            })
                        };
                    }
                    return {
                        select: () => Promise.resolve({ data: [], error: null })
                    };
                }
            })
        };
        const result = await globalThis.LESOULAuth.bootstrapAuthenticatedUser({ allowGuestMode: true });
        assert.equal(result.status, 'ready',
            'membership exists → ready regardless of allowGuestMode');
        assert.equal(result.memberships.length, 1);
        delete globalThis.LESOULSupabase;
    });

    it('A4: no session (signed_out) → signed_out', async () => {
        resetModules();
        loadAuthService();
        globalThis.LESOULSupabase = {
            isInitialized: () => true,
            getClient: () => ({
                auth: { getSession: () => Promise.resolve({ data: { session: null }, error: null }) },
                rpc: () => Promise.resolve({ data: null, error: null }),
                from: () => ({ select: () => Promise.resolve({ data: [], error: null }) })
            })
        };
        const result = await globalThis.LESOULAuth.bootstrapAuthenticatedUser({ allowGuestMode: true });
        assert.equal(result.status, 'signed_out');
        delete globalThis.LESOULSupabase;
    });
});

describe('3-6C: app-bootstrap _handleBootstrapResult guest 분기', () => {
    it('B1: status=guest → App.init 1회, ready state, no createInitialStore', async () => {
        resetModules();
        loadAppBootstrap();
        const ctx = makeDeps({ config: { SUPABASE_ENABLED: true, SUPABASE_URL: 'https://test.supabase.co', SUPABASE_CLIENT_KEY: 'valid-key' } });
        ctx.setBootstrapResult({
            status: 'guest',
            user: { id: 'u1' },
            profile: { id: 'p1' },
            memberships: []
        });
        await globalThis.LESOULAppBootstrap.start({ deps: ctx.deps });
        await flush();
        assert.equal(ctx.calls.appInit, 1, 'App.init must be called for guest user');
        assert.equal(globalThis.LESOULAppBootstrap.getState(), 'ready',
            'guest state shares the ready machine state but no activeMembership');
        assert.equal(ctx.calls.createInitialStore, 0,
            'createInitialStore must NOT be called in guest mode');
        const c = globalThis.LESOULAppBootstrap.getContext();
        assert.equal(c.activeMembership, null, 'activeMembership must be null in guest mode');
        assert.equal(c.user.id, 'u1', 'user must be present in context');
        assert.deepEqual(c.memberships, [], 'memberships must be empty in guest mode');
        globalThis.LESOULAppBootstrap.destroy();
    });

    it('B2: status=guest → showStoreOnboarding 호출 안 됨', async () => {
        resetModules();
        loadAppBootstrap();
        const ctx = makeDeps({ config: { SUPABASE_ENABLED: true, SUPABASE_URL: 'https://test.supabase.co', SUPABASE_CLIENT_KEY: 'valid-key' } });
        ctx.setBootstrapResult({
            status: 'guest',
            user: { id: 'u1' },
            profile: { id: 'p1' },
            memberships: []
        });
        await globalThis.LESOULAppBootstrap.start({ deps: ctx.deps });
        await flush();
        assert.equal(ctx.ui._lastMethod, 'showAppContext',
            'last UI method must be showAppContext (not showStoreOnboarding)');
        globalThis.LESOULAppBootstrap.destroy();
    });

    it('B3: status=ready + membership 1개 → 기존 ready 흐름 유지', async () => {
        resetModules();
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
        assert.equal(ctx.calls.appInit, 1, 'App.init must be called exactly once when ready with single membership');
        assert.equal(globalThis.LESOULAppBootstrap.getState(), 'ready');
        const c = globalThis.LESOULAppBootstrap.getContext();
        assert.deepEqual(c.activeMembership, membership);
        assert.equal(ctx.calls.createInitialStore, 0,
            'createInitialStore must NOT be called for active member');
        globalThis.LESOULAppBootstrap.destroy();
    });

    it('B4: status=signed_out → 기존 signed_out 흐름 유지', async () => {
        resetModules();
        loadAppBootstrap();
        const ctx = makeDeps({ config: { SUPABASE_ENABLED: true, SUPABASE_URL: 'https://test.supabase.co', SUPABASE_CLIENT_KEY: 'valid-key' } });
        ctx.setBootstrapResult({ status: 'signed_out', user: null, profile: null, memberships: [] });
        await globalThis.LESOULAppBootstrap.start({ deps: ctx.deps });
        await flush();
        assert.equal(globalThis.LESOULAppBootstrap.getState(), 'signed_out');
        assert.equal(ctx.calls.appInit, 0, 'App.init must NOT be called when signed_out');
        assert.equal(ctx.ui._lastMethod, 'showSignedOut');
        assert.equal(ctx.calls.createInitialStore, 0);
        globalThis.LESOULAppBootstrap.destroy();
    });

    it('B5: status=needs_store_onboarding → 기존 onboarding 흐름 유지', async () => {
        resetModules();
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
        assert.equal(ctx.ui._lastMethod, 'showStoreOnboarding',
            'legacy needs_store_onboarding still routes to showStoreOnboarding');
        assert.equal(globalThis.LESOULAppBootstrap.getState(), 'needs_store_onboarding');
        assert.equal(ctx.calls.appInit, 0, 'App.init must NOT be called during onboarding');
        globalThis.LESOULAppBootstrap.destroy();
    });
});

describe('3-6C: db.js guest 상태에서 SupabaseProductsDataSource 비활성화', () => {
    it('C1: guest (activeMembership null) → silent fallback to LocalProductsDataSource', async () => {
        resetModules();
        loadAppBootstrap();
        const ctx = makeDeps({ config: { SUPABASE_ENABLED: true, SUPABASE_URL: 'https://test.supabase.co', SUPABASE_CLIENT_KEY: 'valid-key' } });
        ctx.setBootstrapResult({
            status: 'guest',
            user: { id: 'u1' },
            profile: { id: 'p1' },
            memberships: []
        });
        await globalThis.LESOULAppBootstrap.start({ deps: ctx.deps });
        await flush();
        globalThis.LESOUL_CONFIG = {
            SUPABASE_ENABLED: true,
            PRODUCTS_SUPABASE_ENABLED: true,
            PRODUCTS_SUPABASE_REMOTE_ENABLED: true,
            SUPABASE_URL: 'https://test.supabase.co',
            SUPABASE_CLIENT_KEY: 'anon-test-key'
        };
        globalThis.LESOULSupabase = {
            isInitialized: () => true,
            getClient: () => ({
                supabaseUrl: 'https://test.supabase.co',
                from: () => ({ select: () => Promise.resolve({ data: [], error: null }) }),
                rpc: () => Promise.resolve({ data: null, error: null })
            })
        };
        loadDb();
        const ds = globalThis.DB.getProductsDataSource();
        assert.equal(ds.name, 'LocalProductsDataSource',
            'guest mode (activeMembership=null) with PRODUCTS_SUPABASE_ENABLED=true falls back to LocalProductsDataSource');
        globalThis.LESOULAppBootstrap.destroy();
        delete globalThis.LESOULSupabase;
    });

    it('C1.5: non-guest but no storeId (broken state) → throws (3-5M policy preserved)', async () => {
        resetModules();
        // activeMembership이 있지만 storeId가 없는 비정상 상황 (3-5M 정책)
        globalThis.LESOULAppBootstrap = {
            getContext: () => ({ activeMembership: { storeId: null, role: 'owner' } })
        };
        globalThis.LESOUL_CONFIG = {
            SUPABASE_ENABLED: true,
            PRODUCTS_SUPABASE_ENABLED: true,
            SUPABASE_URL: 'http://127.0.0.1:54321',
            SUPABASE_CLIENT_KEY: 'anon-key'
        };
        globalThis.LESOULSupabase = {
            isInitialized: () => true,
            getClient: () => ({ supabaseUrl: 'http://127.0.0.1:54321' })
        };
        loadDb();
        let threw = false;
        try {
            globalThis.DB.getProductsDataSource();
        } catch (e) {
            threw = true;
            assert.ok(/active storeId/i.test(e.message),
                'non-guest with no storeId must still throw (3-5M policy)');
        }
        assert.ok(threw, 'non-guest broken state must throw');
        delete globalThis.LESOULAppBootstrap;
        delete globalThis.LESOULSupabase;
    });

    it('C2: guest + PRODUCTS_SUPABASE_ENABLED=false → LocalProductsDataSource (silent fallback)', async () => {
        resetModules();
        loadAppBootstrap();
        const ctx = makeDeps({ config: { SUPABASE_ENABLED: true, SUPABASE_URL: 'https://test.supabase.co', SUPABASE_CLIENT_KEY: 'valid-key' } });
        ctx.setBootstrapResult({
            status: 'guest',
            user: { id: 'u1' },
            profile: { id: 'p1' },
            memberships: []
        });
        await globalThis.LESOULAppBootstrap.start({ deps: ctx.deps });
        await flush();
        globalThis.LESOUL_CONFIG = { SUPABASE_ENABLED: true };
        loadDb();
        const ds = globalThis.DB.getProductsDataSource();
        assert.equal(ds.name, 'LocalProductsDataSource',
            'guest mode without PRODUCTS_SUPABASE_ENABLED falls back to LocalProductsDataSource');
        globalThis.LESOULAppBootstrap.destroy();
    });
});

describe('3-6C: auth-ui showAppContext guest 표시', () => {
    it('D1: showAppContext에 게스트 모드/연습 데이터 표시, active member와 구분', async () => {
        resetModules();
        // DOM 스텁
        const badge = { textContent: '', hidden: true };
        const logoutBtn = { hidden: true };
        globalThis.document = {
            getElementById: (id) => {
                if (id === 'auth-context-badge') return badge;
                if (id === 'auth-logout-button') return logoutBtn;
                return null;
            },
            createElement: () => ({
                className: '', type: '', id: '', style: {},
                setAttribute: () => {}, appendChild: () => {}, addEventListener: () => {}
            }),
            querySelectorAll: () => []
        };
        globalThis.localStorage = { getItem: () => null };
        globalThis.LESOUL_CONFIG = {};
        loadAuthUi();
        globalThis.LESOULAuthUI.init({ root: { firstChild: null, appendChild: () => {}, hidden: false } });

        // guest 컨텍스트
        globalThis.LESOULAuthUI.showAppContext({
            user: { id: 'u1' },
            profile: { id: 'p1' },
            memberships: [],
            activeMembership: null
        });
        assert.ok(/게스트 모드/.test(badge.textContent), 'badge must show 게스트 모드 for guest');
        assert.ok(/연습 데이터/.test(badge.textContent), 'badge must show 연습 데이터 note');
        assert.equal(badge.hidden, false, 'badge must be visible');

        // ready 컨텍스트
        badge.textContent = '';
        globalThis.LESOULAuthUI.showAppContext({
            user: { id: 'u2' },
            profile: { id: 'p2' },
            memberships: [{ storeId: 's1', role: 'owner', storeName: 'My Store' }],
            activeMembership: { storeId: 's1', role: 'owner', storeName: 'My Store' }
        });
        assert.ok(!/게스트 모드/.test(badge.textContent), 'badge must NOT show 게스트 모드 for active member');
        assert.ok(/My Store/.test(badge.textContent), 'badge must show store name for active member');
        delete globalThis.document;
        delete globalThis.localStorage;
    });
});

describe('3-6C: AUTH_GUEST_MODE_ENABLED feature flag 전파', () => {
    it('E1: AUTH_GUEST_MODE_ENABLED=true → allowGuestMode=true 전달', async () => {
        resetModules();
        loadAppBootstrap();
        const ctx = makeDeps({ config: { SUPABASE_ENABLED: true, SUPABASE_URL: 'https://test.supabase.co', SUPABASE_CLIENT_KEY: 'valid-key', AUTH_GUEST_MODE_ENABLED: true } });
        ctx.setBootstrapResult({ status: 'signed_out', user: null, profile: null, memberships: [] });
        await globalThis.LESOULAppBootstrap.start({ deps: ctx.deps });
        await flush();
        assert.ok(ctx.calls.bootstrapOpts, 'bootstrapAuthenticatedUser must be called with opts');
        assert.equal(ctx.calls.bootstrapOpts.allowGuestMode, true,
            'AUTH_GUEST_MODE_ENABLED=true must propagate as allowGuestMode=true');
        globalThis.LESOULAppBootstrap.destroy();
    });

    it('E2: AUTH_GUEST_MODE_ENABLED 없으면 allowGuestMode=false (default)', async () => {
        resetModules();
        loadAppBootstrap();
        const ctx = makeDeps({ config: { SUPABASE_ENABLED: true, SUPABASE_URL: 'https://test.supabase.co', SUPABASE_CLIENT_KEY: 'valid-key' } });
        ctx.setBootstrapResult({ status: 'signed_out', user: null, profile: null, memberships: [] });
        await globalThis.LESOULAppBootstrap.start({ deps: ctx.deps });
        await flush();
        assert.ok(ctx.calls.bootstrapOpts, 'bootstrapAuthenticatedUser must be called with opts');
        assert.equal(ctx.calls.bootstrapOpts.allowGuestMode, false,
            'AUTH_GUEST_MODE_ENABLED not set must default allowGuestMode=false');
        globalThis.LESOULAppBootstrap.destroy();
    });
});

describe('3-6C: login/logout contract 유지 (legacy)', () => {
    it('F1: login 후 bootstrap 재실행', async () => {
        resetModules();
        loadAppBootstrap();
        const ctx = makeDeps({ config: { SUPABASE_ENABLED: true, SUPABASE_URL: 'https://test.supabase.co', SUPABASE_CLIENT_KEY: 'valid-key' } });
        ctx.setBootstrapResult({ status: 'signed_out', user: null, profile: null, memberships: [] });
        await globalThis.LESOULAppBootstrap.start({ deps: ctx.deps });
        await flush();
        const initialBootstrapCount = ctx.calls.bootstrap;
        await globalThis.LESOULAppBootstrap.signIn({ email: 't@t.com', password: 'pw' });
        await flush();
        assert.ok(ctx.calls.bootstrap > initialBootstrapCount, 'bootstrap must be re-run after sign-in');
        globalThis.LESOULAppBootstrap.destroy();
    });

    it('F2: guest 상태에서 logout → context 초기화', async () => {
        resetModules();
        loadAppBootstrap();
        const ctx = makeDeps({ config: { SUPABASE_ENABLED: true, SUPABASE_URL: 'https://test.supabase.co', SUPABASE_CLIENT_KEY: 'valid-key' } });
        ctx.setBootstrapResult({
            status: 'guest',
            user: { id: 'u1' },
            profile: { id: 'p1' },
            memberships: []
        });
        await globalThis.LESOULAppBootstrap.start({ deps: ctx.deps });
        await flush();
        assert.equal(globalThis.LESOULAppBootstrap.getState(), 'ready');
        await globalThis.LESOULAppBootstrap.signOut();
        await flush();
        assert.equal(globalThis.LESOULAppBootstrap.getState(), 'signed_out');
        const c = globalThis.LESOULAppBootstrap.getContext();
        assert.equal(c.user, null);
        assert.equal(c.activeMembership, null);
        globalThis.LESOULAppBootstrap.destroy();
    });

    it('F3: SIGNED_OUT 이벤트로 guest 상태에서도 signed_out 전환', async () => {
        resetModules();
        loadAppBootstrap();
        const ctx = makeDeps({ config: { SUPABASE_ENABLED: true, SUPABASE_URL: 'https://test.supabase.co', SUPABASE_CLIENT_KEY: 'valid-key' } });
        ctx.setBootstrapResult({
            status: 'guest',
            user: { id: 'u1' },
            profile: { id: 'p1' },
            memberships: []
        });
        await globalThis.LESOULAppBootstrap.start({ deps: ctx.deps });
        await flush();
        assert.equal(globalThis.LESOULAppBootstrap.getState(), 'ready');
        ctx.fireAuthEvent('SIGNED_OUT', null);
        await flush();
        assert.equal(globalThis.LESOULAppBootstrap.getState(), 'signed_out');
        const c = globalThis.LESOULAppBootstrap.getContext();
        assert.equal(c.user, null);
        globalThis.LESOULAppBootstrap.destroy();
    });
});
