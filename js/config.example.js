(function (global) {
    'use strict';

    // Respect pre-injected LESOUL_CONFIG (e.g., from js/config.js loaded earlier).
    if (!global.LESOUL_CONFIG) {
        global.LESOUL_CONFIG = Object.freeze({
            SUPABASE_ENABLED: false,
            SUPABASE_URL: '',
            SUPABASE_CLIENT_KEY: ''
        });
    }
})(typeof window !== 'undefined' ? window : globalThis);
