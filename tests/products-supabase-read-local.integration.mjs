import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

if (process.env.RUN_LOCAL_SUPABASE_INTEGRATION !== '1') {
    test('Local Supabase integration is opt-in', async (t) => {
        await t.skip('Local Supabase integration is opt-in');
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

// 민감 정보 절대 로그에 출력하지 않음
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
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
        const finalHeaders = { 'Content-Type': 'application/json', ...headers };
        const init = { method, headers: finalHeaders, signal: controller.signal };
        if (body !== undefined && body !== null) {
            init.body = JSON.stringify(body);
        }
        const response = await fetch(url, init);
        clearTimeout(timeout);
        if (!expectedStatuses.includes(response.status)) {
            let errorBody = '';
            try { errorBody = await response.text(); } catch (e) { errorBody = '[unreadable]'; }
            const sanitized = `HTTP ${response.status} at ${url}`;
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

// DB 객체 로드 (for SupabaseProductsDataSource + mapping helper)
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

const testEmail = `local-products-read-${randomUUID()}@example.test`;
const testPassword = generateDummyPassword();

let userId = null;
let accessToken = null;
let storeId = null;

test('Products Supabase Read Local Integration Smoke', async (t) => {

    // === Setup: create test user, login, ensure profile, create store ===

    await t.test('P1: Create confirmed test user via admin API', async () => {
        const response = await requestJson({
            url: `${apiUrl}/auth/v1/admin/users`,
            method: 'POST',
            headers: {
                'apikey': serviceRoleKey,
                'Authorization': `Bearer ${serviceRoleKey}`
            },
            body: {
                email: testEmail,
                password: testPassword,
                email_confirm: true,
                user_metadata: { test_scope: 'products-read-local-integration' }
            },
            expectedStatuses: [200, 201]
        });
        assert.ok(response && response.id, 'User ID must be returned');
        userId = response.id;
    });

    await t.test('P2: Password login with anon key', async () => {
        const response = await requestJson({
            url: `${apiUrl}/auth/v1/token?grant_type=password`,
            method: 'POST',
            headers: { 'apikey': anonKey },
            body: { email: testEmail, password: testPassword },
            expectedStatuses: [200]
        });
        assert.ok(response && response.access_token, 'Access token must be returned');
        assert.ok(response.user && response.user.id === userId, 'User ID must match');
        accessToken = response.access_token;
    });

    await t.test('P3: Ensure user profile via RPC', async () => {
        const response = await requestJson({
            url: `${apiUrl}/rest/v1/rpc/ensure_user_profile`,
            method: 'POST',
            headers: {
                'apikey': anonKey,
                'Authorization': `Bearer ${accessToken}`
            },
            body: {
                p_display_name: 'Products Read Test User',
                p_preferred_language: 'ko'
            },
            expectedStatuses: [200]
        });
        assert.ok(response && response.id === userId, 'Profile ID must match');
    });

    await t.test('P4: Create initial store', async () => {
        const response = await requestJson({
            url: `${apiUrl}/rest/v1/rpc/create_initial_store`,
            method: 'POST',
            headers: {
                'apikey': anonKey,
                'Authorization': `Bearer ${accessToken}`
            },
            body: {
                p_name: 'Products Read Test Store',
                p_subtitle: 'Local Integration',
                p_default_language: 'ko'
            },
            expectedStatuses: [200]
        });
        assert.ok(response, 'create_initial_store must return a value');
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        assert.ok(uuidRegex.test(response), 'Store ID must be UUID');
        storeId = response;
    });

    // === Insert test fixtures via authenticated user (owner) — also validates RLS insert policy ===

    await t.test('P5: Insert test product fixtures via authenticated owner', async () => {
        const fixtures = [
            {
                store_id: storeId,
                legacy_id: 9001,
                product_code: 'PRD001',
                original_title: 'Local Integration Test Product 1',
                brand: 'TESTBRAND',
                category: 'tops',
                korea_cost: 50000,
                actual_converted_cost: 30303,
                china_base_price: 90909,
                current_stock: 10,
                reserved_stock: 2,
                stock_year: 2026,
                stock_month: 7,
                color: 'black',
                size: 'FREE'
            },
            {
                store_id: storeId,
                legacy_id: 9002,
                product_code: 'PRD002',
                original_title: 'Local Integration Test Product 2',
                brand: 'TESTBRAND',
                category: 'pants',
                korea_cost: 30000,
                actual_converted_cost: 18182,
                china_base_price: 54545,
                current_stock: 5,
                reserved_stock: 0,
                stock_year: 2026,
                stock_month: 6,
                color: 'white',
                size: 'M'
            }
        ];

        for (const fx of fixtures) {
            await requestJson({
                url: `${apiUrl}/rest/v1/products`,
                method: 'POST',
                headers: {
                    'apikey': anonKey,
                    'Authorization': `Bearer ${accessToken}`,
                    'Prefer': 'return=representation'
                },
                body: fx,
                expectedStatuses: [200, 201]
            });
        }
    });

    // === Test: SupabaseProductsDataSource.listProducts() ===

    await t.test('P6: SupabaseProductsDataSource.listProducts reads via anon client with RLS', async () => {
        const DB = loadDbForTesting();

        // anon client를 직접 만들어서 주입 (Supabase client 모듈 없이 REST API 호출)
        const anonClient = {
            supabaseUrl: apiUrl,
            from(table) {
                const chain = {
                    _table: table,
                    _select: null,
                    _eq: {},
                    select(columns) {
                        this._select = columns;
                        return this;
                    },
                    eq(column, value) {
                        this._eq[column] = value;
                        return this;
                    },
                    then(resolve, reject) {
                        const eqPairs = Object.entries(this._eq)
                            .map(([k, v]) => `${k}=eq.${encodeURIComponent(v)}`)
                            .join('&');
                        const url = `${apiUrl}/rest/v1/${table}?${eqPairs}&select=${encodeURIComponent(this._select || '*')}`;
                        return fetch(url, {
                            method: 'GET',
                            headers: {
                                'apikey': anonKey,
                                'Authorization': `Bearer ${accessToken}`
                            }
                        }).then(r => r.json()).then(data => ({
                            data: Array.isArray(data) ? data : null,
                            error: Array.isArray(data) ? null : (data?.message ? { message: data.message } : null)
                        })).then(resolve, reject);
                    },
                    catch(reject) {
                        return Promise.reject().catch(reject);
                    }
                };
                return chain;
            }
        };

        const ds = DB._createControlledSupabaseProductsDataSource(
            anonClient,
            { localOnly: true, storeId: storeId }
        );
        assert.equal(ds.name, 'SupabaseProductsDataSource');

        const products = await ds.listProducts();

        assert.ok(Array.isArray(products), 'listProducts must return an array');
        assert.equal(products.length, 2, 'must return 2 test products');

        // mapping 검증: legacy product object 형태
        const p1 = products.find(p => p.id === 9001);
        assert.ok(p1, 'product with legacy_id 9001 must exist');
        assert.equal(p1.original_title, 'Local Integration Test Product 1');
        assert.equal(p1.brand, 'TESTBRAND');
        assert.equal(p1.korea_cost, 50000);
        assert.equal(p1.current_stock, 10);
        assert.equal(p1.reserved_stock, 2);
        // legacy object에 uuid가 누출되지 않아야 함
        assert.equal(p1.uuid, undefined, 'uuid must not leak to legacy product object');
        assert.equal(typeof p1.id, 'number', 'legacy id must be number');

        const p2 = products.find(p => p.id === 9002);
        assert.ok(p2, 'product with legacy_id 9002 must exist');
        assert.equal(p2.category, 'pants');
        assert.equal(p2.stock_month, 6);
    });

    // === write methods disabled 검증 ===

    await t.test('P7: Write methods are still disabled', async () => {
        const DB = loadDbForTesting();
        const anonClient = {
            supabaseUrl: apiUrl,
            from() {
                throw new Error('should not be called for write methods');
            }
        };
        const ds = DB._createControlledSupabaseProductsDataSource(
            anonClient,
            { localOnly: true, storeId: storeId }
        );
        const pattern = /not enabled yet/i;
        assert.throws(() => ds.setProducts([]), pattern, 'setProducts disabled');
        assert.throws(() => ds.createProduct({}), pattern, 'createProduct disabled');
        assert.throws(() => ds.updateProduct(1, {}), pattern, 'updateProduct disabled');
        assert.throws(() => ds.deleteProduct(1), pattern, 'deleteProduct disabled');
    });

    // === Cleanup: best-effort test user deletion (db reset in runner is primary cleanup) ===

    await t.test('P8: Best-effort cleanup test user', async () => {
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
        } catch (_e) {
            // Cleanup failure is non-fatal — db reset in runner handles full cleanup
        }
    });

});
