import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

if (process.env.RUN_LOCAL_SUPABASE_INTEGRATION !== '1') {
    test('Products runtime local integration is opt-in', async (t) => {
        await t.skip('Products runtime local integration is opt-in');
    });
    process.exit(0);
}

const apiUrl = process.env.SUPABASE_LOCAL_API_URL;
const anonKey = process.env.SUPABASE_LOCAL_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY;

assert.ok(apiUrl, 'SUPABASE_LOCAL_API_URL must be set');
assert.ok(anonKey, 'SUPABASE_LOCAL_ANON_KEY must be set');
assert.ok(serviceRoleKey, 'SUPABASE_LOCAL_SERVICE_ROLE_KEY must be set');

const urlObj = new URL(apiUrl);
assert.strictEqual(urlObj.protocol, 'http:', 'API_URL must use http protocol');

const allowedHostnames = new Set(['127.0.0.1', 'localhost', '::1', 'host.docker.internal']);
assert.ok(allowedHostnames.has(urlObj.hostname),
    `API_URL hostname must be localhost (got: ${urlObj.hostname})`);
assert.notStrictEqual(anonKey, serviceRoleKey,
    'ANON_KEY and SERVICE_ROLE_KEY must be different');

// 원격 supabase.co URL 차단
assert.ok(!/supabase\.co/i.test(apiUrl), 'supabase.co remote URL is forbidden');

function assertNoSensitiveLeak(str) {
    if (!str) return;
    const lower = String(str).toLowerCase();
    assert.ok(!lower.includes(serviceRoleKey?.toLowerCase?.() || '__never__'),
        'service_role key must never appear in output');
    assert.ok(!lower.includes('eyj') || lower.length < 20,
        'JWT-like long token must not appear in output');
}

async function requestJson({ url, method = 'GET', headers = {}, body, expectedStatuses = [200] }) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
        const finalHeaders = { 'Content-Type': 'application/json', ...headers };
        const init = { method, headers: finalHeaders, signal: controller.signal };
        if (body !== undefined && body !== null) {
            init.body = JSON.stringify(body);
        }
        const response = await fetch(url, init);
        clearTimeout(timeout);
        if (!expectedStatuses.includes(response.status)) {
            const text = await response.text();
            const sanitized = `HTTP ${response.status} at ${url}: ${text.substring(0, 200)}`;
            throw new Error(sanitized);
        }
        if (response.status === 204 || response.headers.get('content-length') === '0') {
            return null;
        }
        try { return await response.json(); }
        catch (e) { throw new Error(`Invalid JSON at ${url}`); }
    } catch (err) {
        clearTimeout(timeout);
        if (err.name === 'AbortError') throw new Error(`Timeout at ${url}`);
        throw err;
    }
}

function generateDummyPassword() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    const bytes = randomBytes(25);
    let result = '';
    for (let i = 0; i < 25; i++) result += chars[bytes[i] % chars.length];
    return result;
}

function loadDbForTesting() {
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
    const source = readFileSync(join(__dirname, '..', 'js', 'db.js'), 'utf-8');
    const factory = new Function(...Object.keys(sandbox), `${source}\n return DB;`);
    return factory(...Object.values(sandbox));
}

// anon REST client with RPC support (실제 Supabase client 없이 REST API 호출)
function createAnonRestClient(accessToken) {
    const authHeaders = {
        'apikey': anonKey,
        'Authorization': `Bearer ${accessToken}`
    };

    function buildChain(table) {
        const state = {
            _filters: [],
            _select: '*',
            _body: null,
            _method: null,
            _prefer: null,
            _single: false
        };

        const chain = {
            select(columns) {
                state._select = columns || '*';
                return this;
            },
            eq(column, value) {
                state._filters.push(`${column}=eq.${encodeURIComponent(value)}`);
                return this;
            },
            is(column, value) {
                const encoded = value === null ? 'null' : encodeURIComponent(value);
                state._filters.push(`${column}=is.${encoded}`);
                return this;
            },
            insert(row) {
                state._method = 'POST';
                state._body = row;
                state._prefer = 'return=representation';
                return this;
            },
            update(patch) {
                state._method = 'PATCH';
                state._body = patch;
                state._prefer = 'return=representation';
                return this;
            },
            single() {
                state._single = true;
                return {
                    then(resolve, reject) {
                        return executeQuery().then(resolve, reject);
                    }
                };
            },
            then(resolve, reject) {
                return executeQuery().then(resolve, reject);
            }
        };

        async function executeQuery() {
            const filterQuery = state._filters.length > 0
                ? '&' + state._filters.join('&')
                : '';
            const selectQuery = `&select=${encodeURIComponent(state._select || '*')}`;

            if (state._method === 'POST') {
                const url = `${apiUrl}/rest/v1/${table}`;
                const headers = {
                    ...authHeaders,
                    'Content-Type': 'application/json',
                    'Prefer': state._prefer,
                    'Accept': state._single ? 'application/vnd.pgrst.object+json' : 'application/json'
                };
                const resp = await fetch(url, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(state._body)
                });
                const text = await resp.text();
                if (!resp.ok) {
                    return { data: null, error: { message: `HTTP ${resp.status}: ${text.substring(0, 200)}` } };
                }
                try {
                    const data = JSON.parse(text);
                    return { data: state._single ? (Array.isArray(data) ? data[0] : data) : data, error: null };
                } catch (e) {
                    return { data: null, error: { message: `Invalid JSON response: ${text.substring(0, 200)}` } };
                }
            }

            if (state._method === 'PATCH') {
                const url = `${apiUrl}/rest/v1/${table}?${filterQuery ? filterQuery.substring(1) : ''}${selectQuery}`;
                const headers = {
                    ...authHeaders,
                    'Content-Type': 'application/json',
                    'Prefer': state._prefer,
                    'Accept': state._single ? 'application/vnd.pgrst.object+json' : 'application/json'
                };
                const resp = await fetch(url, {
                    method: 'PATCH',
                    headers,
                    body: JSON.stringify(state._body)
                });
                const text = await resp.text();
                if (!resp.ok) {
                    return { data: null, error: { message: `PATCH HTTP ${resp.status}: ${text.substring(0, 200)}` } };
                }
                try {
                    const data = JSON.parse(text);
                    return { data: state._single ? (Array.isArray(data) ? data[0] : data) : data, error: null };
                } catch (e) {
                    return { data: null, error: { message: `PATCH Invalid JSON: ${text.substring(0, 200)}` } };
                }
            }

            // default: GET (select)
            const url = `${apiUrl}/rest/v1/${table}?${filterQuery ? filterQuery.substring(1) + '&' : ''}select=${encodeURIComponent(state._select || '*')}`;
            const resp = await fetch(url, { method: 'GET', headers: authHeaders });
            const text = await resp.text();
            if (!resp.ok) {
                return { data: null, error: { message: `HTTP ${resp.status}` } };
            }
            try {
                const data = JSON.parse(text);
                return { data: Array.isArray(data) ? data : null, error: Array.isArray(data) ? null : { message: 'Unexpected response' } };
            } catch (e) {
                return { data: null, error: { message: 'Invalid JSON response' } };
            }
        }

        return chain;
    }

    // RPC 호출 지원
    async function rpc(fnName, payload) {
        const url = `${apiUrl}/rest/v1/rpc/${fnName}`;
        const resp = await fetch(url, {
            method: 'POST',
            headers: {
                ...authHeaders,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        const text = await resp.text();
        if (!resp.ok) {
            return { data: null, error: { message: `RPC ${fnName} HTTP ${resp.status}: ${text.substring(0, 200)}` } };
        }
        try {
            const data = JSON.parse(text);
            return { data, error: null };
        } catch (e) {
            return { data: null, error: { message: `RPC ${fnName} Invalid JSON: ${text.substring(0, 200)}` } };
        }
    }

    return {
        supabaseUrl: apiUrl,
        from(table) {
            return buildChain(table);
        },
        rpc
    };
}

const testUserEmail = `products-runtime-${randomBytes(6).toString('hex')}@test.local`;
const testUserPassword = generateDummyPassword();
let accessToken = '';
let userId = '';
let storeId = '';

test('Products Runtime Local Activation Smoke (3-5N)', async (t) => {

    // === Setup: test user via admin API (service_role) ===
    await t.test('S1: Create confirmed test user via admin API (service_role only, no browser)', async () => {
        const signUpUrl = `${apiUrl}/auth/v1/admin/users`;
        const resp = await requestJson({
            url: signUpUrl,
            method: 'POST',
            headers: {
                'apikey': serviceRoleKey,
                'Authorization': `Bearer ${serviceRoleKey}`
            },
            body: {
                email: testUserEmail,
                password: testUserPassword,
                email_confirm: true,
                role: 'authenticated'
            },
            expectedStatuses: [200, 201]
        });
        assert.ok(resp && resp.id, 'test user must be created');
        userId = resp.id;

        assertNoSensitiveLeak(userId);
    });

    // === Anon login (anon key만 사용) ===
    await t.test('S2: Password login with anon key (no service_role in browser context)', async () => {
        const signInUrl = `${apiUrl}/auth/v1/token?grant_type=password`;
        const resp = await requestJson({
            url: signInUrl,
            method: 'POST',
            headers: { 'apikey': anonKey },
            body: { email: testUserEmail, password: testUserPassword },
            expectedStatuses: [200]
        });
        assert.ok(resp.access_token, 'access_token must be present');
        accessToken = resp.access_token;
        assert.ok(accessToken.length > 20, 'access_token must be a valid token');
    });

    // === Ensure profile ===
    await t.test('S3: ensure_user_profile via RPC', async () => {
        const resp = await requestJson({
            url: `${apiUrl}/rest/v1/rpc/ensure_user_profile`,
            method: 'POST',
            headers: {
                'apikey': anonKey,
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: {},
            expectedStatuses: [200]
        });
        assert.ok(resp, 'ensure_user_profile must return');
    });

    // === Create initial store ===
    await t.test('S4: create_initial_store via RPC', async () => {
        const resp = await requestJson({
            url: `${apiUrl}/rest/v1/rpc/create_initial_store`,
            method: 'POST',
            headers: {
                'apikey': anonKey,
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: {
                p_name: 'Runtime Test Store',
                p_subtitle: 'Local Integration',
                p_default_language: 'ko'
            },
            expectedStatuses: [200]
        });
        assert.ok(resp, 'create_initial_store must return a value');
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const sid = typeof resp === 'string' ? resp : (resp.store_id || resp.id || resp);
        assert.ok(uuidRegex.test(sid), 'Store ID must be UUID');
        storeId = sid;

        assertNoSensitiveLeak(storeId);
    });

    // === Runtime activation: feature flag + client + context 설정 ===
    await t.test('S5: DB.getProductsDataSource() selects SupabaseProductsDataSource when all conditions met', async () => {
        const DB = loadDbForTesting();

        // global LESOUL_CONFIG 설정 (테스트 sandbox 내부)
        const sandboxGlobal = global;

        const originalConfig = sandboxGlobal.LESOUL_CONFIG;
        const originalSupabase = sandboxGlobal.LESOULSupabase;
        const originalBootstrap = sandboxGlobal.LESOULAppBootstrap;

        try {
            sandboxGlobal.LESOUL_CONFIG = {
                SUPABASE_ENABLED: true,
                PRODUCTS_SUPABASE_ENABLED: true,
                SUPABASE_URL: apiUrl,
                SUPABASE_CLIENT_KEY: anonKey
            };

            const anonClient = createAnonRestClient(accessToken);

            sandboxGlobal.LESOULSupabase = {
                isInitialized: () => true,
                getClient: () => anonClient
            };

            sandboxGlobal.LESOULAppBootstrap = {
                getContext: () => ({
                    activeMembership: {
                        storeId: storeId,
                        role: 'owner'
                    }
                })
            };

            DB.resetProductsDataSourceForTesting();

            const ds = DB.getProductsDataSource();
            assert.equal(ds.name, 'SupabaseProductsDataSource',
                'when all conditions met, runtime must select SupabaseProductsDataSource');
        } finally {
            sandboxGlobal.LESOUL_CONFIG = originalConfig;
            sandboxGlobal.LESOULSupabase = originalSupabase;
            sandboxGlobal.LESOULAppBootstrap = originalBootstrap;
        }
    });

    // === Runtime createProduct via DataSource (RPC 경로) ===
    await t.test('S6: createProduct via runtime-selected SupabaseProductsDataSource (RPC)', async () => {
        const DB = loadDbForTesting();
        const sandboxGlobal = global;

        const originalConfig = sandboxGlobal.LESOUL_CONFIG;
        const originalSupabase = sandboxGlobal.LESOULSupabase;
        const originalBootstrap = sandboxGlobal.LESOULAppBootstrap;

        try {
            sandboxGlobal.LESOUL_CONFIG = {
                SUPABASE_ENABLED: true,
                PRODUCTS_SUPABASE_ENABLED: true,
                SUPABASE_URL: apiUrl,
                SUPABASE_CLIENT_KEY: anonKey
            };

            const anonClient = createAnonRestClient(accessToken);

            sandboxGlobal.LESOULSupabase = {
                isInitialized: () => true,
                getClient: () => anonClient
            };

            sandboxGlobal.LESOULAppBootstrap = {
                getContext: () => ({
                    activeMembership: { storeId, role: 'owner' }
                })
            };

            DB.resetProductsDataSourceForTesting();
            const ds = DB.getProductsDataSource();
            assert.equal(ds.name, 'SupabaseProductsDataSource');

            const product = {
                id: 8101,
                product_code: 'RT-TEST-001',
                original_title: 'Runtime Activation Test',
                brand: 'RUNTIME',
                category: 'dress',
                korea_cost: 50000,
                current_stock: 15,
                color: 'white',
                size: 'M'
            };

            const created = await ds.createProduct(product);
            assert.equal(created.id, 8101);
            assert.equal(created.original_title, 'Runtime Activation Test');
            assert.equal(created.brand, 'RUNTIME');

            assertNoSensitiveLeak(JSON.stringify(created));
        } finally {
            sandboxGlobal.LESOUL_CONFIG = originalConfig;
            sandboxGlobal.LESOULSupabase = originalSupabase;
            sandboxGlobal.LESOULAppBootstrap = originalBootstrap;
        }
    });

    // === Runtime listProducts via DataSource ===
    await t.test('S7: listProducts via runtime-selected SupabaseProductsDataSource', async () => {
        const DB = loadDbForTesting();
        const sandboxGlobal = global;

        const originalConfig = sandboxGlobal.LESOUL_CONFIG;
        const originalSupabase = sandboxGlobal.LESOULSupabase;
        const originalBootstrap = sandboxGlobal.LESOULAppBootstrap;

        try {
            sandboxGlobal.LESOUL_CONFIG = {
                SUPABASE_ENABLED: true,
                PRODUCTS_SUPABASE_ENABLED: true,
                SUPABASE_URL: apiUrl,
                SUPABASE_CLIENT_KEY: anonKey
            };

            const anonClient = createAnonRestClient(accessToken);

            sandboxGlobal.LESOULSupabase = {
                isInitialized: () => true,
                getClient: () => anonClient
            };

            sandboxGlobal.LESOULAppBootstrap = {
                getContext: () => ({
                    activeMembership: { storeId, role: 'owner' }
                })
            };

            DB.resetProductsDataSourceForTesting();
            const ds = DB.getProductsDataSource();

            const products = await ds.listProducts();
            assert.ok(Array.isArray(products), 'listProducts must return array');
            const found = products.find(p => p.id === 8101);
            assert.ok(found, 'created product must appear in listProducts');
            assert.equal(found.original_title, 'Runtime Activation Test');

            assertNoSensitiveLeak(JSON.stringify(products));
        } finally {
            sandboxGlobal.LESOUL_CONFIG = originalConfig;
            sandboxGlobal.LESOULSupabase = originalSupabase;
            sandboxGlobal.LESOULAppBootstrap = originalBootstrap;
        }
    });

    // === Runtime updateProduct via DataSource (RPC 경로) ===
    await t.test('S8: updateProduct via runtime-selected SupabaseProductsDataSource (RPC)', async () => {
        const DB = loadDbForTesting();
        const sandboxGlobal = global;

        const originalConfig = sandboxGlobal.LESOUL_CONFIG;
        const originalSupabase = sandboxGlobal.LESOULSupabase;
        const originalBootstrap = sandboxGlobal.LESOULAppBootstrap;

        try {
            sandboxGlobal.LESOUL_CONFIG = {
                SUPABASE_ENABLED: true,
                PRODUCTS_SUPABASE_ENABLED: true,
                SUPABASE_URL: apiUrl,
                SUPABASE_CLIENT_KEY: anonKey
            };

            const anonClient = createAnonRestClient(accessToken);

            sandboxGlobal.LESOULSupabase = {
                isInitialized: () => true,
                getClient: () => anonClient
            };

            sandboxGlobal.LESOULAppBootstrap = {
                getContext: () => ({
                    activeMembership: { storeId, role: 'owner' }
                })
            };

            DB.resetProductsDataSourceForTesting();
            const ds = DB.getProductsDataSource();

            const updated = await ds.updateProduct(8101, {
                original_title: 'Runtime Updated',
                korea_cost: 60000,
                color: 'black'
            });

            assert.equal(updated.id, 8101);
            assert.equal(updated.original_title, 'Runtime Updated');
            assert.equal(updated.korea_cost, 60000);
            assert.equal(updated.color, 'black');

            assertNoSensitiveLeak(JSON.stringify(updated));
        } finally {
            sandboxGlobal.LESOUL_CONFIG = originalConfig;
            sandboxGlobal.LESOULSupabase = originalSupabase;
            sandboxGlobal.LESOULAppBootstrap = originalBootstrap;
        }
    });

    // === Runtime deleteProduct (soft delete) via DataSource (RPC 경로) ===
    await t.test('S9: deleteProduct (soft delete) via runtime-selected SupabaseProductsDataSource (RPC)', async () => {
        const DB = loadDbForTesting();
        const sandboxGlobal = global;

        const originalConfig = sandboxGlobal.LESOUL_CONFIG;
        const originalSupabase = sandboxGlobal.LESOULSupabase;
        const originalBootstrap = sandboxGlobal.LESOULAppBootstrap;

        try {
            sandboxGlobal.LESOUL_CONFIG = {
                SUPABASE_ENABLED: true,
                PRODUCTS_SUPABASE_ENABLED: true,
                SUPABASE_URL: apiUrl,
                SUPABASE_CLIENT_KEY: anonKey
            };

            const anonClient = createAnonRestClient(accessToken);

            sandboxGlobal.LESOULSupabase = {
                isInitialized: () => true,
                getClient: () => anonClient
            };

            sandboxGlobal.LESOULAppBootstrap = {
                getContext: () => ({
                    activeMembership: { storeId, role: 'owner' }
                })
            };

            DB.resetProductsDataSourceForTesting();
            const ds = DB.getProductsDataSource();

            const result = await ds.deleteProduct(8101);
            assert.ok(result, 'deleteProduct must return a result');
            assert.equal(result.id, 8101);

            assertNoSensitiveLeak(JSON.stringify(result));
        } finally {
            sandboxGlobal.LESOUL_CONFIG = originalConfig;
            sandboxGlobal.LESOULSupabase = originalSupabase;
            sandboxGlobal.LESOULAppBootstrap = originalBootstrap;
        }
    });

    // === Soft delete 확인 ===
    await t.test('S10: soft deleted product excluded from listProducts', async () => {
        const DB = loadDbForTesting();
        const sandboxGlobal = global;

        const originalConfig = sandboxGlobal.LESOUL_CONFIG;
        const originalSupabase = sandboxGlobal.LESOULSupabase;
        const originalBootstrap = sandboxGlobal.LESOULAppBootstrap;

        try {
            sandboxGlobal.LESOUL_CONFIG = {
                SUPABASE_ENABLED: true,
                PRODUCTS_SUPABASE_ENABLED: true,
                SUPABASE_URL: apiUrl,
                SUPABASE_CLIENT_KEY: anonKey
            };

            const anonClient = createAnonRestClient(accessToken);

            sandboxGlobal.LESOULSupabase = {
                isInitialized: () => true,
                getClient: () => anonClient
            };

            sandboxGlobal.LESOULAppBootstrap = {
                getContext: () => ({
                    activeMembership: { storeId, role: 'owner' }
                })
            };

            DB.resetProductsDataSourceForTesting();
            const ds = DB.getProductsDataSource();

            const products = await ds.listProducts();
            const found = products.find(p => p.id === 8101);
            assert.equal(found, undefined,
                'soft deleted product must not appear in listProducts');
        } finally {
            sandboxGlobal.LESOUL_CONFIG = originalConfig;
            sandboxGlobal.LESOULSupabase = originalSupabase;
            sandboxGlobal.LESOULAppBootstrap = originalBootstrap;
        }
    });

    // === setProducts disabled ===
    await t.test('S11: setProducts is disabled on runtime SupabaseProductsDataSource', async () => {
        const DB = loadDbForTesting();
        const sandboxGlobal = global;

        const originalConfig = sandboxGlobal.LESOUL_CONFIG;
        const originalSupabase = sandboxGlobal.LESOULSupabase;
        const originalBootstrap = sandboxGlobal.LESOULAppBootstrap;

        try {
            sandboxGlobal.LESOUL_CONFIG = {
                SUPABASE_ENABLED: true,
                PRODUCTS_SUPABASE_ENABLED: true,
                SUPABASE_URL: apiUrl,
                SUPABASE_CLIENT_KEY: anonKey
            };

            const anonClient = createAnonRestClient(accessToken);

            sandboxGlobal.LESOULSupabase = {
                isInitialized: () => true,
                getClient: () => anonClient
            };

            sandboxGlobal.LESOULAppBootstrap = {
                getContext: () => ({
                    activeMembership: { storeId, role: 'owner' }
                })
            };

            DB.resetProductsDataSourceForTesting();
            const ds = DB.getProductsDataSource();

            assert.throws(
                () => ds.setProducts([{ id: 1, original_title: 'Test' }]),
                /not enabled|disabled/i,
                'setProducts must be disabled on SupabaseProductsDataSource'
            );
        } finally {
            sandboxGlobal.LESOUL_CONFIG = originalConfig;
            sandboxGlobal.LESOULSupabase = originalSupabase;
            sandboxGlobal.LESOULAppBootstrap = originalBootstrap;
        }
    });

    // === reset 후 기본값 LocalProductsDataSource ===
    await t.test('S12: resetProductsDataSourceForTesting returns to LocalProductsDataSource', async () => {
        const DB = loadDbForTesting();
        const sandboxGlobal = global;

        const originalConfig = sandboxGlobal.LESOUL_CONFIG;
        const originalSupabase = sandboxGlobal.LESOULSupabase;
        const originalBootstrap = sandboxGlobal.LESOULAppBootstrap;

        try {
            sandboxGlobal.LESOUL_CONFIG = {
                SUPABASE_ENABLED: true,
                PRODUCTS_SUPABASE_ENABLED: true,
                SUPABASE_URL: apiUrl,
                SUPABASE_CLIENT_KEY: anonKey
            };

            const anonClient = createAnonRestClient(accessToken);

            sandboxGlobal.LESOULSupabase = {
                isInitialized: () => true,
                getClient: () => anonClient
            };

            sandboxGlobal.LESOULAppBootstrap = {
                getContext: () => ({
                    activeMembership: { storeId, role: 'owner' }
                })
            };

            DB.resetProductsDataSourceForTesting();
            const supabaseDs = DB.getProductsDataSource();
            assert.equal(supabaseDs.name, 'SupabaseProductsDataSource');

            // flag를 끄고 reset하면 다시 LocalProductsDataSource로 돌아가야 함
            sandboxGlobal.LESOUL_CONFIG = {
                SUPABASE_ENABLED: false,
                PRODUCTS_SUPABASE_ENABLED: false,
                SUPABASE_URL: apiUrl,
                SUPABASE_CLIENT_KEY: anonKey
            };
            sandboxGlobal.LESOULSupabase = {
                isInitialized: () => false,
                getClient: () => null
            };
            sandboxGlobal.LESOULAppBootstrap = {
                getContext: () => ({ activeMembership: null })
            };

            DB.resetProductsDataSourceForTesting();
            const localDs = DB.getProductsDataSource();
            assert.equal(localDs.name, 'LocalProductsDataSource',
                'after reset with no runtime activation, default must be LocalProductsDataSource');
        } finally {
            sandboxGlobal.LESOUL_CONFIG = originalConfig;
            sandboxGlobal.LESOULSupabase = originalSupabase;
            sandboxGlobal.LESOULAppBootstrap = originalBootstrap;
        }
    });

    // === 기본 config (PRODUCTS_SUPABASE_ENABLED=false)에서는 LocalProductsDataSource ===
    await t.test('S13: PRODUCTS_SUPABASE_ENABLED=false → LocalProductsDataSource (default)', async () => {
        const DB = loadDbForTesting();
        const sandboxGlobal = global;

        const originalConfig = sandboxGlobal.LESOUL_CONFIG;
        const originalSupabase = sandboxGlobal.LESOULSupabase;
        const originalBootstrap = sandboxGlobal.LESOULAppBootstrap;

        try {
            sandboxGlobal.LESOUL_CONFIG = {
                SUPABASE_ENABLED: false,
                PRODUCTS_SUPABASE_ENABLED: false,
                SUPABASE_URL: apiUrl,
                SUPABASE_CLIENT_KEY: anonKey
            };

            const anonClient = createAnonRestClient(accessToken);

            sandboxGlobal.LESOULSupabase = {
                isInitialized: () => true,
                getClient: () => anonClient
            };

            sandboxGlobal.LESOULAppBootstrap = {
                getContext: () => ({
                    activeMembership: { storeId, role: 'owner' }
                })
            };

            DB.resetProductsDataSourceForTesting();
            const ds = DB.getProductsDataSource();
            assert.equal(ds.name, 'LocalProductsDataSource',
                'with PRODUCTS_SUPABASE_ENABLED=false, must use LocalProductsDataSource');
        } finally {
            sandboxGlobal.LESOUL_CONFIG = originalConfig;
            sandboxGlobal.LESOULSupabase = originalSupabase;
            sandboxGlobal.LESOULAppBootstrap = originalBootstrap;
        }
    });

    // === remote URL 차단 ===
    await t.test('S14: remote supabase.co URL blocks runtime activation', async () => {
        const DB = loadDbForTesting();
        const sandboxGlobal = global;

        const originalConfig = sandboxGlobal.LESOUL_CONFIG;
        const originalSupabase = sandboxGlobal.LESOULSupabase;
        const originalBootstrap = sandboxGlobal.LESOULAppBootstrap;

        try {
            sandboxGlobal.LESOUL_CONFIG = {
                SUPABASE_ENABLED: true,
                PRODUCTS_SUPABASE_ENABLED: true,
                SUPABASE_URL: 'https://example.supabase.co',
                SUPABASE_CLIENT_KEY: anonKey
            };

            const fakeRemoteClient = {
                supabaseUrl: 'https://example.supabase.co',
                from: () => ({ select: () => ({ eq: () => ({ then: () => Promise.resolve({ data: [], error: null }) }) }) }),
                rpc: () => Promise.resolve({ data: null, error: null })
            };

            sandboxGlobal.LESOULSupabase = {
                isInitialized: () => true,
                getClient: () => fakeRemoteClient
            };

            sandboxGlobal.LESOULAppBootstrap = {
                getContext: () => ({
                    activeMembership: { storeId, role: 'owner' }
                })
            };

            DB.resetProductsDataSourceForTesting();

            assert.throws(
                () => DB.getProductsDataSource(),
                /localhost URL/i,
                'remote URL must block runtime activation'
            );
        } finally {
            sandboxGlobal.LESOUL_CONFIG = originalConfig;
            sandboxGlobal.LESOULSupabase = originalSupabase;
            sandboxGlobal.LESOULAppBootstrap = originalBootstrap;
        }
    });

    // === Cleanup: best-effort test user deletion ===
    await t.test('C1: Best-effort cleanup test user', async () => {
        try {
            await requestJson({
                url: `${apiUrl}/auth/v1/admin/users/${userId}`,
                method: 'DELETE',
                headers: {
                    'apikey': serviceRoleKey,
                    'Authorization': `Bearer ${serviceRoleKey}`
                },
                expectedStatuses: [200, 204]
            });
        } catch (e) {
            // best-effort — db reset in runner is primary cleanup
            console.warn('cleanup warning (best-effort):', e.message);
        }
    });
});
