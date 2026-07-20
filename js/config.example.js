(function (global) {
    'use strict';

    // Respect pre-injected LESOUL_CONFIG (e.g., from js/config.js loaded earlier).
    if (!global.LESOUL_CONFIG) {
        global.LESOUL_CONFIG = Object.freeze({
            SUPABASE_ENABLED: false,
            SUPABASE_URL: '',
            SUPABASE_CLIENT_KEY: '',
            APP_BRAND_NAME: 'LESOUL',
            // 3-5M: Products runtime feature flag gate.
            // 기본값 false — 일반 runtime은 LocalProductsDataSource를 유지한다.
            // true로 설정하더라도 SUPABASE_ENABLED, localhost URL, 초기화된 client,
            // 그리고 active storeId가 모두 충족되어야 SupabaseProductsDataSource 후보가 될 수 있다.
            PRODUCTS_SUPABASE_ENABLED: false
        });
    }
})(typeof window !== 'undefined' ? window : globalThis);
