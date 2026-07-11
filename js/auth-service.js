(function (global) {
    'use strict';

    var _initialized = false;
    var VALID_LANGUAGES = ['ko', 'zh', 'en', 'ja'];

    function _makeError(code, message) {
        var err = new Error(message);
        err.code = code;
        return err;
    }

    function _getClient() {
        if (!global.LESOULSupabase || !global.LESOULSupabase.getClient) {
            throw _makeError('SUPABASE_NOT_INITIALIZED', 'Supabase client is not available');
        }
        return global.LESOULSupabase.getClient();
    }

    function init() {
        if (!global.LESOULSupabase) {
            throw _makeError('SUPABASE_NOT_INITIALIZED', 'Supabase client module not loaded');
        }
        _initialized = true;
        return true;
    }

    async function getSession() {
        var client = _getClient();
        var result = await client.auth.getSession();
        var session = (result && result.data && result.data.session) || null;
        var user = (session && session.user) || null;
        return { session: session, user: user };
    }

    async function getCurrentUser() {
        var result = await getSession();
        return result.user;
    }

    async function signInWithPassword(email, password) {
        var trimmedEmail = (email || '').trim();
        if (!trimmedEmail) {
            throw _makeError('AUTH_SIGN_IN_FAILED', 'Sign in failed');
        }
        if (trimmedEmail.indexOf('@') === -1) {
            throw _makeError('AUTH_SIGN_IN_FAILED', 'Sign in failed');
        }
        if (!password || password === '') {
            throw _makeError('AUTH_SIGN_IN_FAILED', 'Sign in failed');
        }

        var client = _getClient();
        try {
            var result = await client.auth.signInWithPassword({
                email: trimmedEmail,
                password: password
            });
            if (result.error) {
                throw _makeError('AUTH_SIGN_IN_FAILED', 'Sign in failed');
            }
            var session = (result.data && result.data.session) || null;
            var user = (result.data && result.data.user) || null;
            return { session: session, user: user };
        } catch (e) {
            if (e && e.code === 'AUTH_SIGN_IN_FAILED') {
                throw e;
            }
            throw _makeError('AUTH_SIGN_IN_FAILED', 'Sign in failed');
        }
    }

    async function signOut() {
        var client = _getClient();
        try {
            await client.auth.signOut();
        } catch (e) {
            // ignore sign out errors
        }
        return true;
    }

    function subscribe(callback) {
        var client = _getClient();
        var subscription = client.auth.onAuthStateChange(function (event, session) {
            try {
                callback({
                    event: event,
                    session: session,
                    user: (session && session.user) || null
                });
            } catch (e) {
                // prevent callback errors from breaking the listener
            }
        });

        return function unsubscribe() {
            try {
                if (subscription && typeof subscription.data === 'object' &&
                    typeof subscription.data.unsubscribe === 'function') {
                    subscription.data.unsubscribe();
                } else if (subscription && typeof subscription.unsubscribe === 'function') {
                    subscription.unsubscribe();
                }
            } catch (e) {
                // ignore
            }
        };
    }

    async function ensureUserProfile(displayName, preferredLanguage) {
        if (displayName === undefined) displayName = null;
        if (preferredLanguage === undefined) preferredLanguage = 'ko';

        var user = await getCurrentUser();
        if (!user) {
            throw _makeError('AUTH_SESSION_REQUIRED', 'Authentication required');
        }

        if (VALID_LANGUAGES.indexOf(preferredLanguage) === -1) {
            throw _makeError('AUTH_SIGN_IN_FAILED', 'Invalid language');
        }

        var trimmedName = displayName ? displayName.trim() : null;
        if (trimmedName === '') trimmedName = null;

        var client = _getClient();
        var result = await client.rpc('ensure_user_profile', {
            p_display_name: trimmedName,
            p_preferred_language: preferredLanguage
        });

        if (result.error) {
            throw _makeError('AUTH_SIGN_IN_FAILED', 'Profile setup failed');
        }

        return result.data;
    }

    async function getActiveMemberships() {
        var user = await getCurrentUser();
        if (!user) {
            throw _makeError('AUTH_SESSION_REQUIRED', 'Authentication required');
        }

        var client = _getClient();

        var membersResult = await client
            .from('store_members')
            .select('store_id, role, is_active, created_at')
            .eq('user_id', user.id)
            .eq('is_active', true)
            .order('created_at', { ascending: true });

        if (membersResult.error) {
            throw _makeError('AUTH_SIGN_IN_FAILED', 'Failed to load memberships');
        }

        var memberships = membersResult.data || [];
        if (memberships.length === 0) {
            return [];
        }

        var storeIds = memberships.map(function (m) { return m.store_id; });

        var storesResult = await client
            .from('stores')
            .select('id, name, subtitle')
            .in('id', storeIds)
            .is('deleted_at', null);

        if (storesResult.error) {
            throw _makeError('AUTH_SIGN_IN_FAILED', 'Failed to load stores');
        }

        var stores = storesResult.data || [];
        var storeMap = {};
        for (var i = 0; i < stores.length; i++) {
            storeMap[stores[i].id] = stores[i];
        }

        var result = [];
        for (var j = 0; j < memberships.length; j++) {
            var m = memberships[j];
            var store = storeMap[m.store_id];
            if (!store) continue;
            result.push({
                storeId: m.store_id,
                role: m.role,
                storeName: store.name,
                storeSubtitle: store.subtitle || null
            });
        }

        return result;
    }

    async function bootstrapAuthenticatedUser(options) {
        if (!options) options = {};
        var displayName = options.displayName !== undefined ? options.displayName : null;
        var preferredLanguage = options.preferredLanguage !== undefined ? options.preferredLanguage : 'ko';

        var sessionResult = await getSession();
        if (!sessionResult.user) {
            return {
                status: 'signed_out',
                user: null,
                profile: null,
                memberships: []
            };
        }

        var profile = await ensureUserProfile(displayName, preferredLanguage);
        var memberships = await getActiveMemberships();

        if (memberships.length > 0) {
            return {
                status: 'ready',
                user: sessionResult.user,
                profile: profile,
                memberships: memberships
            };
        } else {
            return {
                status: 'needs_store_onboarding',
                user: sessionResult.user,
                profile: profile,
                memberships: []
            };
        }
    }

    async function createInitialStore(options) {
        if (!options) options = {};
        var name = options.name;
        var subtitle = options.subtitle !== undefined ? options.subtitle : null;
        var defaultLanguage = options.defaultLanguage !== undefined ? options.defaultLanguage : 'ko';

        var user = await getCurrentUser();
        if (!user) {
            throw _makeError('AUTH_SESSION_REQUIRED', 'Authentication required');
        }

        var trimmedName = (name || '').trim();
        if (!trimmedName || trimmedName.length < 1 || trimmedName.length > 100) {
            throw _makeError('AUTH_SIGN_IN_FAILED', 'Store name is invalid');
        }

        var trimmedSubtitle = subtitle ? subtitle.trim() : null;
        if (trimmedSubtitle === '') trimmedSubtitle = null;

        if (VALID_LANGUAGES.indexOf(defaultLanguage) === -1) {
            throw _makeError('AUTH_SIGN_IN_FAILED', 'Invalid language');
        }

        var client = _getClient();
        var result = await client.rpc('create_initial_store', {
            p_name: trimmedName,
            p_subtitle: trimmedSubtitle,
            p_default_language: defaultLanguage
        });

        if (result.error) {
            throw _makeError('AUTH_SIGN_IN_FAILED', 'Store creation failed');
        }

        return result.data;
    }

    global.LESOULAuth = Object.freeze({
        init: init,
        getSession: getSession,
        getCurrentUser: getCurrentUser,
        signInWithPassword: signInWithPassword,
        signOut: signOut,
        subscribe: subscribe,
        ensureUserProfile: ensureUserProfile,
        getActiveMemberships: getActiveMemberships,
        bootstrapAuthenticatedUser: bootstrapAuthenticatedUser,
        createInitialStore: createInitialStore
    });
})(typeof window !== 'undefined' ? window : globalThis);
