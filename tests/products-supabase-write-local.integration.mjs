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

// anon client를 직접 만들어서 주입 (Supabase client 모듈 없이 REST API 호출)
// service_role은 절대 전달하지 않음 — anon key + access token만 사용
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
            },
            catch(reject) {
                return Promise.reject().catch(reject);
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

    return {
        supabaseUrl: apiUrl,
        from(table) {
            return buildChain(table);
        }
    };
}

const testEmail = `local-products-write-${randomUUID()}@example.test`;
const testPassword = generateDummyPassword();

let userId = null;
let accessToken = null;
let storeId = null;

test('Products Supabase Write Local Integration Smoke', async (t) => {

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
                user_metadata: { test_scope: 'products-write-local-integration' }
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
                p_display_name: 'Products Write Test User',
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
                p_name: 'Products Write Test Store',
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

    // === createProduct integration test (local-only controlled write) ===

    await t.test('P5: createProduct inserts via controlled SupabaseProductsDataSource', async () => {
        const DB = loadDbForTesting();
        const anonClient = createAnonRestClient(accessToken);

        const ds = DB._createControlledSupabaseProductsDataSource(
            anonClient,
            { localOnly: true, storeId: storeId }
        );
        assert.equal(ds.name, 'SupabaseProductsDataSource');

        const newProduct = {
            id: 9101,
            product_code: 'WTEST001',
            original_title: 'Write Test Product 1',
            brand: 'WRITETEST',
            category: 'tops',
            korea_cost: 75000,
            actual_converted_cost: 45455,
            china_base_price: 136364,
            current_stock: 20,
            reserved_stock: 3,
            stock_year: 2026,
            stock_month: 7,
            color: 'blue',
            size: 'L'
        };

        const created = await ds.createProduct(newProduct);

        // 반환값은 legacy product object
        assert.equal(created.id, 9101, 'legacy_id must be restored as legacy id');
        assert.equal(created.original_title, 'Write Test Product 1');
        assert.equal(created.brand, 'WRITETEST');
        assert.equal(created.korea_cost, 75000);
        assert.equal(created.current_stock, 20);
        assert.equal(created.color, 'blue');
        // uuid는 legacy object에 노출되지 않아야 함
        assert.equal(created.uuid, undefined, 'uuid must not leak to legacy product');
        assert.equal(typeof created.id, 'number', 'legacy id must be number');

        assertNoSensitiveLeak(JSON.stringify(created));
    });

    await t.test('P6: listProducts verifies createProduct result', async () => {
        const DB = loadDbForTesting();
        const anonClient = createAnonRestClient(accessToken);

        const ds = DB._createControlledSupabaseProductsDataSource(
            anonClient,
            { localOnly: true, storeId: storeId }
        );

        const products = await ds.listProducts();
        assert.ok(Array.isArray(products), 'listProducts must return an array');
        assert.ok(products.length >= 1, 'must return at least 1 product');

        const created = products.find(p => p.id === 9101);
        assert.ok(created, 'created product (legacy_id 9101) must be visible via listProducts');
        assert.equal(created.original_title, 'Write Test Product 1');
        assert.equal(created.brand, 'WRITETEST');
        assert.equal(created.korea_cost, 75000);

        assertNoSensitiveLeak(JSON.stringify(products));
    });

    // === update/delete: DB column-level 권한 정책 검증 ===
    // 20260711000900_order_inventory_rpc.sql:957에서
    // REVOKE UPDATE ON public.products FROM authenticated 실행됨 (table-level).
    // 하지만 column-level GRANT가 별도로 존재:
    //   - deleted_at 컬럼: authenticated에 UPDATE 권한 있음 → soft delete 동작
    //   - updated_at 컬럼: authenticated에 UPDATE 권한 없음 → updateProduct 차단
    // 이로 인해:
    //   - updateProduct는 updated_at 강제 업데이트 시도 시 403 permission denied 반환
    //   - deleteProduct는 deleted_at 업데이트만 수행하므로 soft delete 성공
    // updateProduct의 full local integration 검증은 contract test (W1-W21)에서 수행.

    await t.test('P7: updateProduct is blocked by DB policy (updated_at column UPDATE denied)', async () => {
        const DB = loadDbForTesting();
        const anonClient = createAnonRestClient(accessToken);

        const ds = DB._createControlledSupabaseProductsDataSource(
            anonClient,
            { localOnly: true, storeId: storeId }
        );

        // updateProduct는 patch에 updated_at을 강제로 추가함 (js/db.js).
        // DB column-level 권한 정책상 authenticated 역할은 updated_at 컬럼에
        // UPDATE 권한이 없음 (GRANT 없음). PostgREST가 403 permission denied 반환,
        // _wrapWriteError가 query failed로 변환.
        await assert.rejects(
            () => ds.updateProduct(9101, { original_title: 'Should Not Update' }),
            (err) => {
                assert.ok(err instanceof Error, 'must be Error instance');
                assert.ok(/query failed/i.test(err.message),
                    `error must indicate query failed, got: ${err.message}`);
                // service_role token leak 방지
                assertNoSensitiveLeak(err.message);
                return true;
            },
            'updateProduct must be blocked by DB policy (updated_at column UPDATE denied)'
        );

        // 실제 row가 변경되지 않았는지 확인
        const products = await ds.listProducts();
        const unchanged = products.find(p => p.id === 9101);
        assert.ok(unchanged, 'product must still exist after blocked update');
        assert.equal(unchanged.original_title, 'Write Test Product 1',
            'original_title must NOT be changed by blocked updateProduct');
    });

    await t.test('P8: deleteProduct performs soft delete (deleted_at column UPDATE allowed)', async () => {
        const DB = loadDbForTesting();
        const anonClient = createAnonRestClient(accessToken);

        const ds = DB._createControlledSupabaseProductsDataSource(
            anonClient,
            { localOnly: true, storeId: storeId }
        );

        // deleteProduct는 soft delete (UPDATE deleted_at)를 수행.
        // DB column-level 권한 정책상 authenticated 역할은 deleted_at 컬럼에
        // UPDATE 권한이 부여되어 있음. 따라서 soft delete가 성공해야 함.
        const result = await ds.deleteProduct(9101);

        // 반환값은 legacy product object (soft delete 후 상태)
        assert.ok(result, 'deleteProduct must return a result');
        assert.equal(result.id, 9101, 'deleted product id must be 9101');

        assertNoSensitiveLeak(JSON.stringify(result));
    });

    await t.test('P9: deleted_at is set + soft delete verified (no hard DELETE)', async () => {
        // 1. 직접 REST API로 row를 조회해서 deleted_at이 설정되었는지 확인
        //    owner는 deleted row도 볼 수 있음 (RLS 정책: owners can view deleted).
        const url = `${apiUrl}/rest/v1/products?legacy_id=eq.9101&store_id=eq.${storeId}&select=deleted_at,legacy_id`;
        const resp = await fetch(url, {
            method: 'GET',
            headers: {
                'apikey': anonKey,
                'Authorization': `Bearer ${accessToken}`
            }
        });
        assert.ok(resp.ok, `direct query must succeed, got HTTP ${resp.status}`);
        const data = await resp.json();
        assert.ok(Array.isArray(data), 'must return array');
        assert.ok(data.length > 0, 'product row must still exist (soft delete, NOT hard DELETE)');
        assert.ok(data[0].deleted_at, 'deleted_at must be set (soft delete performed)');
        assert.notEqual(data[0].deleted_at, null,
            'deleted_at must NOT be null — soft delete was applied');

        // 2. 현재 RLS 설계 기준 명확화:
        //    - `Products: owner/manager can view active` (deleted_at IS NULL)
        //    - `Products: owners can view deleted` (deleted_at IS NOT NULL)
        //    두 정책이 OR로 결합되므로 owner는 active + deleted 모두 listProducts에서 반환됨.
        //    이는 현재 설계 기준에 맞으며, 향후 DataSource에서 명시적 필터링이 필요한 경우
        //    별도 단계에서 추가 예정.
        const DB = loadDbForTesting();
        const anonClient = createAnonRestClient(accessToken);
        const ds = DB._createControlledSupabaseProductsDataSource(
            anonClient,
            { localOnly: true, storeId: storeId }
        );
        const products = await ds.listProducts();
        const softDeletedRow = products.find(p => p.id === 9101);
        // owner는 deleted row도 볼 수 있으므로, soft deleted row가 여전히 반환될 수 있음.
        // 핵심 검증: 실제 DELETE가 아니라 soft delete (deleted_at 설정)가 수행되었다는 것.
        assert.ok(data[0].deleted_at !== null,
            'soft delete must set deleted_at (verified via direct query)');

        assertNoSensitiveLeak(JSON.stringify(data));
        assertNoSensitiveLeak(JSON.stringify(products));
    });

    // === setProducts disabled 검증 ===

    await t.test('P10: setProducts is still disabled (bulk overwrite forbidden)', async () => {
        const DB = loadDbForTesting();
        const anonClient = createAnonRestClient(accessToken);

        const ds = DB._createControlledSupabaseProductsDataSource(
            anonClient,
            { localOnly: true, storeId: storeId }
        );

        assert.throws(
            () => ds.setProducts([{ id: 1, original_title: 'X', brand: 'B' }]),
            /setProducts is not enabled/i,
            'setProducts must throw disabled error'
        );
    });

    // === runtime 기본 DataSource 확인 ===

    await t.test('P11: getProductsDataSource default is LocalProductsDataSource (no auto-switch)', async () => {
        const DB = loadDbForTesting();
        const ds = DB.getProductsDataSource();
        assert.equal(ds.name, 'LocalProductsDataSource',
            'runtime default must be LocalProductsDataSource');
        assert.notEqual(ds.name, 'SupabaseProductsDataSource',
            'runtime must NOT auto-switch to SupabaseProductsDataSource');
    });

    // === local-only 조건 검증 ===

    await t.test('P12: write methods reject remote URL', async () => {
        const DB = loadDbForTesting();
        const remoteClient = {
            supabaseUrl: 'https://example.supabase.co',
            from() { throw new Error('should not reach remote client'); }
        };

        const ds = DB._createControlledSupabaseProductsDataSource(
            remoteClient,
            { localOnly: true, storeId: storeId }
        );

        assert.throws(() => ds.createProduct({ id: 1, original_title: 'X', brand: 'B' }),
            /requires localhost/i, 'createProduct must reject remote URL');
        assert.throws(() => ds.updateProduct(1, { original_title: 'X' }),
            /requires localhost/i, 'updateProduct must reject remote URL');
        assert.throws(() => ds.deleteProduct(1),
            /requires localhost/i, 'deleteProduct must reject remote URL');
    });

    // === Cleanup: best-effort test user deletion (db reset in runner is primary cleanup) ===

    await t.test('P13: Best-effort cleanup test user', async () => {
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
