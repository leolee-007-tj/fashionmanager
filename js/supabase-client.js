(function (global) {
    'use strict';

    var _client = null;
    var _initialized = false;
    var _enabled = false;
    var _errorCode = null;

    function _makeError(code, message) {
        var err = new Error(message);
        err.code = code;
        return err;
    }

    function _decodeJwtPayload(token) {
        try {
            var parts = token.split('.');
            if (parts.length !== 3) return null;
            var payload = parts[1];
            var base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
            var decoded;
            if (typeof atob === 'function') {
                decoded = atob(base64);
            } else if (typeof Buffer !== 'undefined') {
                decoded = Buffer.from(base64, 'base64').toString('utf-8');
            } else {
                return null;
            }
            return JSON.parse(decoded);
        } catch (e) {
            return null;
        }
    }

    function _isSecretKey(key) {
        if (typeof key !== 'string') return false;
        if (key.indexOf('sb_secret_') === 0) return true;
        var payload = _decodeJwtPayload(key);
        if (payload && payload.role === 'service_role') return true;
        return false;
    }

    function init(config) {
        if (_initialized) {
            return _client;
        }

        var cfg = config || (global.LESOUL_CONFIG || {});

        if (!cfg.SUPABASE_ENABLED) {
            _enabled = false;
            _initialized = false;
            _errorCode = 'SUPABASE_DISABLED';
            return null;
        }

        _enabled = true;

        var url = cfg.SUPABASE_URL;
        var key = cfg.SUPABASE_CLIENT_KEY;

        if (!url || typeof url !== 'string') {
            _errorCode = 'SUPABASE_URL_INVALID';
            throw _makeError('SUPABASE_URL_INVALID', 'Supabase URL is invalid');
        }

        if (url.indexOf('http://') !== 0 && url.indexOf('https://') !== 0) {
            _errorCode = 'SUPABASE_URL_INVALID';
            throw _makeError('SUPABASE_URL_INVALID', 'Supabase URL must start with http:// or https://');
        }

        if (!key || typeof key !== 'string' || key.trim() === '') {
            _errorCode = 'SUPABASE_KEY_MISSING';
            throw _makeError('SUPABASE_KEY_MISSING', 'Supabase client key is required');
        }

        if (_isSecretKey(key)) {
            _errorCode = 'SUPABASE_SECRET_KEY_FORBIDDEN';
            throw _makeError('SUPABASE_SECRET_KEY_FORBIDDEN', 'Secret or service_role keys are forbidden in browser');
        }

        if (!global.supabase || typeof global.supabase.createClient !== 'function') {
            _errorCode = 'SUPABASE_LIBRARY_MISSING';
            throw _makeError('SUPABASE_LIBRARY_MISSING', 'Supabase JS library is not loaded');
        }

        _client = global.supabase.createClient(url, key, {
            db: {
                schema: 'public'
            },
            auth: {
                autoRefreshToken: true,
                persistSession: true,
                detectSessionInUrl: true
            }
        });

        _initialized = true;
        _errorCode = null;
        return _client;
    }

    function isEnabled() {
        return _enabled;
    }

    function isInitialized() {
        return _initialized;
    }

    function getClient() {
        if (!_initialized) {
            throw _makeError('SUPABASE_NOT_INITIALIZED', 'Supabase client is not initialized');
        }
        return _client;
    }

    function getStatus() {
        return {
            enabled: _enabled,
            initialized: _initialized,
            errorCode: _errorCode
        };
    }

    global.LESOULSupabase = Object.freeze({
        init: init,
        isEnabled: isEnabled,
        isInitialized: isInitialized,
        getClient: getClient,
        getStatus: getStatus
    });
})(typeof window !== 'undefined' ? window : globalThis);
