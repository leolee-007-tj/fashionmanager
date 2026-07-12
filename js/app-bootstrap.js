(function (global) {
    'use strict';

    // Feature-flagged authentication gate bootstrap.
    //
    // Default path (SUPABASE_ENABLED !== true):
    //   - No Supabase CDN request.
    //   - No LESOULSupabase / LESOULAuth init.
    //   - #auth-root hidden, #app shown.
    //   - App.init() called exactly once.
    //   - State: 'legacy'.
    //
    // Enabled path:
    //   - #app hidden, #auth-root shown, loading UI.
    //   - Dynamically load Supabase CDN if not already present.
    //   - LESOULSupabase.init(config) -> LESOULAuth.init() -> bootstrapAuthenticatedUser().
    //   - Route to signed_out / needs_store_onboarding / needs_store_selection / ready.
    //   - App.init() called exactly once when entering the app.
    //   - On any library load failure: error UI, NO legacy fallback.
    //
    // Security rules:
    //   - Context is memory-only; never written to localStorage.
    //   - access_token / refresh_token / session object never copied into long-lived context.
    //   - No console logging of tokens, events, or Supabase raw errors.
    //   - No automatic legacy fallback on auth failures.

    var CDN_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    var CDN_TIMEOUT_MS = 15000;

    var _state = 'idle';
    var _context = {
        user: null,
        profile: null,
        memberships: [],
        activeMembership: null
    };
    var _appInitCalled = false;
    var _unsubAuth = null;
    var _started = false;
    var _bootstrapRevision = 0;
    var _bootstrapInFlight = null;
    var _logoutElement = null;
    var _logoutClickHandler = null;
    var _signOutInFlight = null;

    // Default dependency providers (overridable via start({ deps })).
    var _deps = null;

    function _makeError(code, message) {
        var err = new Error(message);
        err.code = code;
        return err;
    }

    function _defaultGetConfig() {
        return (global.LESOUL_CONFIG || {});
    }

    function _defaultGetApp() {
        return global.App;
    }

    function _defaultGetAuth() {
        return global.LESOULAuth;
    }

    function _defaultGetSupabaseAdapter() {
        return global.LESOULSupabase;
    }

    function _defaultGetUI() {
        return global.LESOULAuthUI;
    }

    function _defaultGetRootElement() {
        return document.getElementById('auth-root');
    }

    function _defaultGetAppElement() {
        return document.getElementById('app');
    }

    function _defaultGetLogoutElement() {
        return document.getElementById('auth-logout-button');
    }

    function _defaultLoadSupabaseLibrary(timeoutMs) {
        return new Promise(function (resolve, reject) {
            if (global.supabase && typeof global.supabase.createClient === 'function') {
                resolve();
                return;
            }
            var timeout = (typeof timeoutMs === 'number' && timeoutMs > 0) ? timeoutMs : CDN_TIMEOUT_MS;
            var existing = document.querySelector('script[data-supabase-cdn="true"]');
            if (existing) {
                var existingState = existing.getAttribute('data-load-state');
                if (existingState === 'loading') {
                    var settledExisting = false;
                    var timerExisting = setTimeout(function () {
                        if (settledExisting) return;
                        settledExisting = true;
                        existing.setAttribute('data-load-state', 'failed');
                        try { existing.parentNode && existing.parentNode.removeChild(existing); } catch (e) { /* ignore */ }
                        reject(_makeError('SUPABASE_LIBRARY_LOAD_FAILED', 'Supabase library load failed'));
                    }, timeout);
                    existing.addEventListener('load', function () {
                        if (settledExisting) return;
                        settledExisting = true;
                        clearTimeout(timerExisting);
                        if (global.supabase && typeof global.supabase.createClient === 'function') {
                            existing.setAttribute('data-load-state', 'loaded');
                            resolve();
                        } else {
                            existing.setAttribute('data-load-state', 'failed');
                            try { existing.parentNode && existing.parentNode.removeChild(existing); } catch (e) { /* ignore */ }
                            reject(_makeError('SUPABASE_LIBRARY_LOAD_FAILED', 'Supabase library load failed'));
                        }
                    });
                    existing.addEventListener('error', function () {
                        if (settledExisting) return;
                        settledExisting = true;
                        clearTimeout(timerExisting);
                        existing.setAttribute('data-load-state', 'failed');
                        try { existing.parentNode && existing.parentNode.removeChild(existing); } catch (e) { /* ignore */ }
                        reject(_makeError('SUPABASE_LIBRARY_LOAD_FAILED', 'Supabase library load failed'));
                    });
                    return;
                }
                if (existingState === 'loaded') {
                    if (global.supabase && typeof global.supabase.createClient === 'function') {
                        resolve();
                        return;
                    }
                    // loaded but no global.supabase — remove and create new.
                    try { existing.parentNode && existing.parentNode.removeChild(existing); } catch (e) { /* ignore */ }
                } else if (existingState === 'failed') {
                    // Remove failed script and create new.
                    try { existing.parentNode && existing.parentNode.removeChild(existing); } catch (e) { /* ignore */ }
                }
            }
            var script = document.createElement('script');
            script.src = CDN_URL;
            script.setAttribute('data-supabase-cdn', 'true');
            script.setAttribute('data-load-state', 'loading');
            script.async = true;

            var settled = false;
            var timer = setTimeout(function () {
                if (settled) return;
                settled = true;
                script.setAttribute('data-load-state', 'failed');
                try { script.parentNode && script.parentNode.removeChild(script); } catch (e) { /* ignore */ }
                reject(_makeError('SUPABASE_LIBRARY_LOAD_FAILED', 'Supabase library load failed'));
            }, timeout);

            script.onload = function () {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                if (global.supabase && typeof global.supabase.createClient === 'function') {
                    script.setAttribute('data-load-state', 'loaded');
                    resolve();
                } else {
                    script.setAttribute('data-load-state', 'failed');
                    try { script.parentNode && script.parentNode.removeChild(script); } catch (e) { /* ignore */ }
                    reject(_makeError('SUPABASE_LIBRARY_LOAD_FAILED', 'Supabase library load failed'));
                }
            };
            script.onerror = function () {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                script.setAttribute('data-load-state', 'failed');
                try { script.parentNode && script.parentNode.removeChild(script); } catch (e) { /* ignore */ }
                reject(_makeError('SUPABASE_LIBRARY_LOAD_FAILED', 'Supabase library load failed'));
            };
            document.head.appendChild(script);
        });
    }

    function _resolveDeps(options) {
        var deps = (options && options.deps) || {};
        var resolved = {
            config: deps.config || _defaultGetConfig,
            app: deps.app || _defaultGetApp,
            auth: deps.auth || _defaultGetAuth,
            supabaseAdapter: deps.supabaseAdapter || _defaultGetSupabaseAdapter,
            ui: deps.ui || _defaultGetUI,
            loadSupabaseLibrary: deps.loadSupabaseLibrary || function () { return _defaultLoadSupabaseLibrary(deps.cdnTimeoutMs); },
            getRootElement: deps.getRootElement || _defaultGetRootElement,
            getAppElement: deps.getAppElement || _defaultGetAppElement,
            getLogoutElement: deps.getLogoutElement || _defaultGetLogoutElement
        };
        return resolved;
    }

    function _resetContext() {
        _context.user = null;
        _context.profile = null;
        _context.memberships = [];
        _context.activeMembership = null;
    }

    function _enterLegacyMode() {
        var appEl = _deps.getAppElement();
        var rootEl = _deps.getRootElement();
        if (appEl) appEl.style.display = '';
        if (rootEl) rootEl.hidden = true;
        var ui = _deps.ui();
        if (ui) ui.hideAuth();
        _callAppInitOnce();
        _state = 'legacy';
    }

    function _callAppInitOnce() {
        if (_appInitCalled) return;
        var app = _deps.app();
        if (app && typeof app.init === 'function') {
            app.init();
            _appInitCalled = true;
        }
    }

    function _enterApp() {
        var rootEl = _deps.getRootElement();
        var appEl = _deps.getAppElement();
        if (rootEl) rootEl.hidden = true;
        if (appEl) appEl.style.display = '';
        _callAppInitOnce();
        var ui = _deps.ui();
        if (ui) ui.showAppContext(_context);
        var logoutEl = _deps.getLogoutElement();
        if (logoutEl) logoutEl.hidden = false;
        _state = 'ready';
    }

    function _invalidateBootstrap() {
        _bootstrapRevision += 1;
        _bootstrapInFlight = null;
    }

    function _bindLogoutButton() {
        var btn = _deps.getLogoutElement();
        if (!btn) return;
        if (_logoutElement === btn && _logoutClickHandler) return;
        _unbindLogoutButton();
        _logoutClickHandler = function (e) {
            if (e && typeof e.preventDefault === 'function') e.preventDefault();
            if (_state !== 'ready') return;
            signOut();
        };
        btn.addEventListener('click', _logoutClickHandler);
        _logoutElement = btn;
    }

    function _unbindLogoutButton() {
        if (_logoutElement && _logoutClickHandler) {
            try {
                _logoutElement.removeEventListener('click', _logoutClickHandler);
            } catch (e) { /* ignore */ }
        }
        _logoutElement = null;
        _logoutClickHandler = null;
    }

    function _hideApp() {
        var appEl = _deps.getAppElement();
        if (appEl) appEl.style.display = 'none';
    }

    function _showAuth() {
        var rootEl = _deps.getRootElement();
        if (rootEl) rootEl.hidden = false;
    }

    function _showUI(method, args) {
        var ui = _deps.ui();
        if (!ui || typeof ui[method] !== 'function') return;
        if (Array.isArray(args)) {
            ui[method].apply(ui, args);
        } else {
            ui[method](args);
        }
    }

    function _safeErrorState(message) {
        _hideApp();
        _showAuth();
        var logoutEl = _deps.getLogoutElement();
        if (logoutEl) logoutEl.hidden = true;
        _showUI('showError', [message, { onRetry: function () { retry(); } }]);
        _state = 'error';
    }

    function _handleBootstrapResult(result) {
        if (!result) {
            _safeErrorState('일시적인 오류가 발생했습니다.');
            return;
        }
        var status = result.status;
        _context.user = result.user || null;
        _context.profile = result.profile || null;
        _context.memberships = Array.isArray(result.memberships) ? result.memberships : [];
        _context.activeMembership = null;

        if (status === 'signed_out') {
            _hideApp();
            _showAuth();
            _showUI('showSignedOut', [{
                onSignIn: function (credentials) { signIn(credentials); }
            }]);
            _state = 'signed_out';
            return;
        }

        if (status === 'needs_store_onboarding') {
            _hideApp();
            _showAuth();
            _showUI('showStoreOnboarding', [{
                onCreateStore: function (opts) { createInitialStore(opts); },
                onSignOut: function () { signOut(); }
            }]);
            _state = 'needs_store_onboarding';
            return;
        }

        if (status === 'ready') {
            if (_context.memberships.length === 0) {
                // Treat as needs_store_onboarding per spec.
                _hideApp();
                _showAuth();
                _showUI('showStoreOnboarding', [{
                    onCreateStore: function (opts) { createInitialStore(opts); },
                    onSignOut: function () { signOut(); }
                }]);
                _state = 'needs_store_onboarding';
                return;
            }
            if (_context.memberships.length === 1) {
                _context.activeMembership = _context.memberships[0];
                _enterApp();
                return;
            }
            // 2+ memberships: needs_store_selection
            _hideApp();
            _showAuth();
            _showUI('showStoreSelection', [_context.memberships, {
                onSelectMembership: function (membership) { selectMembership(membership); },
                onSignOut: function () { signOut(); }
            }]);
            _state = 'needs_store_selection';
            return;
        }

        // Unknown status.
        _safeErrorState('일시적인 오류가 발생했습니다.');
    }

    function _runBootstrap() {
        if (_bootstrapInFlight) {
            return _bootstrapInFlight;
        }
        var myRevision = ++_bootstrapRevision;
        var auth = _deps.auth();
        var trackedPromise = Promise.resolve()
            .then(function () {
                return auth.bootstrapAuthenticatedUser();
            })
            .then(function (result) {
                if (myRevision !== _bootstrapRevision) return;
                _handleBootstrapResult(result);
            })
            ['catch'](function () {
                if (myRevision !== _bootstrapRevision) return;
                _hideApp();
                _showAuth();
                _showUI('showError', ['인증 서비스를 시작할 수 없습니다.', { onRetry: function () { retry(); } }]);
                _state = 'error';
            })
            .then(function () {
                if (_bootstrapInFlight === trackedPromise) {
                    _bootstrapInFlight = null;
                }
            });
        _bootstrapInFlight = trackedPromise;
        return trackedPromise;
    }

    function _subscribeAuthEvents() {
        if (_unsubAuth) return;
        var auth = _deps.auth();
        if (!auth || typeof auth.subscribe !== 'function') return;
        try {
            _unsubAuth = auth.subscribe(function (payload) {
                var ev = payload && payload.event;
                if (ev === 'SIGNED_OUT') {
                    _invalidateBootstrap();
                    _resetContext();
                    _hideApp();
                    var logoutEl = _deps.getLogoutElement();
                    if (logoutEl) logoutEl.hidden = true;
                    _showAuth();
                    _showUI('showSignedOut', [{
                        onSignIn: function (credentials) { signIn(credentials); }
                    }]);
                    _state = 'signed_out';
                    return;
                }
                if (ev === 'INITIAL_SESSION' || ev === 'SIGNED_IN') {
                    _runBootstrap();
                    return;
                }
                if (ev === 'USER_UPDATED') {
                    _runBootstrap();
                    return;
                }
                if (ev === 'TOKEN_REFRESHED') {
                    // No re-render needed.
                    return;
                }
            });
        } catch (e) {
            // subscribe failure is non-fatal.
        }
    }

    function start(options) {
        if (_started) {
            // Idempotent: do not double-register listeners or double-init App.
            return Promise.resolve();
        }
        _started = true;
        _deps = _resolveDeps(options);

        var config = _deps.config() || {};
        if (config.SUPABASE_ENABLED !== true) {
            // Legacy mode — existing app behavior.
            _enterLegacyMode();
            return Promise.resolve();
        }

        // Enabled mode.
        var rootEl = _deps.getRootElement();
        var ui = _deps.ui();
        if (ui && rootEl) {
            ui.init({ root: rootEl });
        }
        _hideApp();
        _showAuth();
        ui.showLoading('로딩 중...');
        _state = 'loading';

        return _deps.loadSupabaseLibrary()
            .then(function () {
                var adapter = _deps.supabaseAdapter();
                if (!adapter || typeof adapter.init !== 'function') {
                    throw _makeError('SUPABASE_LIBRARY_LOAD_FAILED', 'Supabase adapter missing');
                }
                adapter.init({
                    SUPABASE_ENABLED: true,
                    SUPABASE_URL: config.SUPABASE_URL,
                    SUPABASE_CLIENT_KEY: config.SUPABASE_CLIENT_KEY
                });
                var auth = _deps.auth();
                if (!auth || typeof auth.init !== 'function') {
                    throw _makeError('SUPABASE_LIBRARY_LOAD_FAILED', 'Auth service missing');
                }
                auth.init();
                _subscribeAuthEvents();
                _bindLogoutButton();
                return _runBootstrap();
            })
            .catch(function (err) {
                // No legacy fallback on enabled-mode failure.
                _hideApp();
                _showAuth();
                _showUI('showError', ['인증 서비스를 시작할 수 없습니다.', { onRetry: function () { retry(); } }]);
                _state = 'error';
            });
    }

    function retry() {
        if (_state !== 'error') return Promise.resolve();
        // Reset started flag so start() runs again.
        _started = false;
        return start({ deps: _deps ? {
            config: _deps.config,
            app: _deps.app,
            auth: _deps.auth,
            supabaseAdapter: _deps.supabaseAdapter,
            ui: _deps.ui,
            loadSupabaseLibrary: _deps.loadSupabaseLibrary,
            getRootElement: _deps.getRootElement,
            getAppElement: _deps.getAppElement,
            getLogoutElement: _deps.getLogoutElement
        } : undefined });
    }

    function signIn(credentials) {
        var auth = _deps && _deps.auth();
        if (!auth) return Promise.resolve();
        var ui = _deps.ui();
        if (ui) ui.setBusy(true);
        return Promise.resolve()
            .then(function () {
                return auth.signInWithPassword(credentials.email, credentials.password);
            })
            .then(function () {
                if (ui) ui.setBusy(false);
                return _runBootstrap();
            })
            .catch(function () {
                if (ui) ui.setBusy(false);
                _showUI('showSignedOut', [{
                    onSignIn: function (c) { signIn(c); }
                }]);
                // Show generic error message via UI error box inside signed-out screen.
                // Re-render with error: use showError-like inline message by re-rendering signed-out.
                _showUI('showError', ['로그인할 수 없습니다. 이메일과 비밀번호를 확인해 주세요.', {
                    onRetry: function () {
                        _showUI('showSignedOut', [{
                            onSignIn: function (c) { signIn(c); }
                        }]);
                    }
                }]);
                _state = 'signed_out';
            });
    }

    function signOut() {
        if (_signOutInFlight) {
            return _signOutInFlight;
        }
        var auth = _deps && _deps.auth();
        var ui = _deps.ui();
        if (ui) ui.setBusy(true);
        var tracked = Promise.resolve()
            .then(function () {
                if (!auth) return;
                return auth.signOut();
            })
            .then(function () {
                if (ui) ui.setBusy(false);
                _invalidateBootstrap();
                _resetContext();
                _hideApp();
                var logoutEl = _deps.getLogoutElement();
                if (logoutEl) logoutEl.hidden = true;
                _showAuth();
                _showUI('showSignedOut', [{
                    onSignIn: function (c) { signIn(c); }
                }]);
                _state = 'signed_out';
            })
            .catch(function () {
                if (ui) ui.setBusy(false);
                _hideApp();
                var logoutEl = _deps.getLogoutElement();
                if (logoutEl) logoutEl.hidden = true;
                _showAuth();
                _showUI('showError', ['로그아웃할 수 없습니다.', {
                    onRetry: function () {
                        signOut();
                    }
                }]);
                _state = 'error';
            })
            .then(function () {
                if (_signOutInFlight === tracked) {
                    _signOutInFlight = null;
                }
            });
        _signOutInFlight = tracked;
        return tracked;
    }

    function createInitialStore(opts) {
        var auth = _deps && _deps.auth();
        var ui = _deps.ui();
        if (ui) ui.setBusy(true);
        return Promise.resolve()
            .then(function () {
                if (!auth) return;
                return auth.createInitialStore(opts);
            })
            .then(function () {
                if (ui) ui.setBusy(false);
                return _runBootstrap();
            })
            .catch(function () {
                if (ui) ui.setBusy(false);
                _showUI('showError', ['매장을 만들 수 없습니다.', {
                    onRetry: function () {
                        _showUI('showStoreOnboarding', [{
                            onCreateStore: function (o) { createInitialStore(o); },
                            onSignOut: function () { signOut(); }
                        }]);
                    }
                }]);
            });
    }

    function selectMembership(membership) {
        if (_state !== 'needs_store_selection') return;
        if (!membership || !membership.storeId) {
            _safeErrorState('일시적인 오류가 발생했습니다.');
            return;
        }
        var canonical = null;
        for (var i = 0; i < _context.memberships.length; i++) {
            if (_context.memberships[i].storeId === membership.storeId) {
                canonical = _context.memberships[i];
                break;
            }
        }
        if (!canonical) {
            _safeErrorState('일시적인 오류가 발생했습니다.');
            return;
        }
        _context.activeMembership = canonical;
        _enterApp();
    }

    function getState() {
        return _state;
    }

    function getContext() {
        // Return a shallow copy to prevent external mutation.
        return {
            user: _context.user,
            profile: _context.profile,
            memberships: _context.memberships.slice(),
            activeMembership: _context.activeMembership
        };
    }

    function destroy() {
        if (_unsubAuth) {
            try { _unsubAuth(); } catch (e) { /* ignore */ }
            _unsubAuth = null;
        }
        _unbindLogoutButton();
        _invalidateBootstrap();
        if (_deps) {
            var ui = _deps.ui();
            if (ui && typeof ui.destroy === 'function') ui.destroy();
        }
        _resetContext();
        _appInitCalled = false;
        _started = false;
        _state = 'idle';
        _signOutInFlight = null;
    }

    global.LESOULAppBootstrap = Object.freeze({
        start: start,
        retry: retry,
        signIn: signIn,
        signOut: signOut,
        createInitialStore: createInitialStore,
        selectMembership: selectMembership,
        getState: getState,
        getContext: getContext,
        destroy: destroy
    });
})(typeof window !== 'undefined' ? window : globalThis);
