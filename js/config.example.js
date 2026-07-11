(function (global) {
    'use strict';

    global.LESOUL_CONFIG = Object.freeze({
        SUPABASE_ENABLED: false,
        SUPABASE_URL: '',
        SUPABASE_CLIENT_KEY: ''
    });
})(typeof window !== 'undefined' ? window : globalThis);
