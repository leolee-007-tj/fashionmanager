import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { randomBytes, randomUUID } from 'node:crypto';

if (process.env.RUN_LOCAL_SUPABASE_INTEGRATION !== '1') {
    test('Local Supabase integration is opt-in', async (t) => {
        await t.skip('Local Supabase integration is opt-in');
    });
    process.exit(0);
}

const apiUrl = process.env.SUPABASE_LOCAL_API_URL;
const anonKey = process.env.SUPABASE_LOCAL_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY;

assert.ok(apiUrl, 'API_URL must be set');
assert.ok(anonKey, 'ANON_KEY must be set');
assert.ok(serviceRoleKey, 'SERVICE_ROLE_KEY must be set');

const urlObj = new URL(apiUrl);
assert.strictEqual(urlObj.protocol, 'http:', 'API_URL must use http protocol');
assert.strictEqual(urlObj.username, '', 'API_URL must not contain username');
assert.strictEqual(urlObj.password, '', 'API_URL must not contain password');

const allowedHostnames = new Set(['127.0.0.1', 'localhost', '::1', 'host.docker.internal']);
assert.ok(allowedHostnames.has(urlObj.hostname), `API_URL hostname must be localhost (got: ${urlObj.hostname})`);
assert.notStrictEqual(anonKey, serviceRoleKey, 'ANON_KEY and SERVICE_ROLE_KEY must be different');

const recordedHostnames = new Set();

function recordHostname(url) {
    const u = new URL(url);
    recordedHostnames.add(u.hostname);
}

async function requestJson({ url, method = 'GET', headers = {}, body, expectedStatuses = [200] }) {
    recordHostname(url);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
        const finalHeaders = {
            'Content-Type': 'application/json',
            ...headers
        };
        const init = {
            method,
            headers: finalHeaders,
            signal: controller.signal
        };
        if (body !== undefined && body !== null) {
            init.body = JSON.stringify(body);
        }
        const response = await fetch(url, init);
        clearTimeout(timeout);
        if (!expectedStatuses.includes(response.status)) {
            let errorBody = '';
            try {
                errorBody = await response.text();
            } catch (e) {
                errorBody = '[unable to read body]';
            }
            throw new Error(`HTTP ${response.status} at ${url}`);
        }
        if (response.status === 204 || response.headers.get('content-length') === '0') {
            return null;
        }
        try {
            return await response.json();
        } catch (e) {
            const text = await response.text();
            throw new Error(`Invalid JSON response at ${url}`);
        }
    } catch (err) {
        clearTimeout(timeout);
        if (err.name === 'AbortError') {
            throw new Error(`Timeout at ${url}`);
        }
        throw err;
    }
}

function generateDummyPassword() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    const bytes = randomBytes(25);
    let result = '';
    for (let i = 0; i < 25; i++) {
        result += chars[bytes[i] % chars.length];
    }
    return result;
}

const testEmail = `local-auth-${randomUUID()}@example.test`;
const testPassword = generateDummyPassword();

let userId = null;
let accessToken = null;
let refreshToken = null;
let storeId = null;

test('Local Supabase Auth and RPC Integration', async (t) => {
    await t.test('I1: Create confirmed test user via admin API', async () => {
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
                user_metadata: {
                    test_scope: 'local-integration'
                }
            },
            expectedStatuses: [200, 201]
        });
        assert.ok(response && response.id, 'User ID must be returned');
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        assert.ok(uuidRegex.test(response.id), 'User ID must be UUID format');
        assert.strictEqual(response.email, testEmail, 'Email must match');
        userId = response.id;
    });

    await t.test('I2: Password login with anon key', async () => {
        const response = await requestJson({
            url: `${apiUrl}/auth/v1/token?grant_type=password`,
            method: 'POST',
            headers: {
                'apikey': anonKey
            },
            body: {
                email: testEmail,
                password: testPassword
            },
            expectedStatuses: [200]
        });
        assert.ok(response && response.access_token, 'Access token must be returned');
        assert.ok(response.refresh_token, 'Refresh token must be returned');
        assert.ok(response.user && response.user.id, 'User must be returned');
        assert.strictEqual(response.user.id, userId, 'User ID must match');
        accessToken = response.access_token;
        refreshToken = response.refresh_token;
    });

    await t.test('I3: Ensure user profile via RPC', async () => {
        const response = await requestJson({
            url: `${apiUrl}/rest/v1/rpc/ensure_user_profile`,
            method: 'POST',
            headers: {
                'apikey': anonKey,
                'Authorization': `Bearer ${accessToken}`
            },
            body: {
                p_display_name: 'Local Integration User',
                p_preferred_language: 'ko'
            },
            expectedStatuses: [200]
        });
        assert.ok(response && response.id, 'Profile ID must be returned');
        assert.strictEqual(response.id, userId, 'Profile ID must match auth user ID');
        assert.strictEqual(response.preferred_language, 'ko', 'Preferred language must be ko');
        assert.strictEqual(response.display_name, 'Local Integration User', 'Display name must match');
    });

    await t.test('I4: Initial membership count is 0', async () => {
        const response = await requestJson({
            url: `${apiUrl}/rest/v1/store_members?select=store_id,role,is_active&user_id=eq.${userId}&is_active=eq.true`,
            method: 'GET',
            headers: {
                'apikey': anonKey,
                'Authorization': `Bearer ${accessToken}`
            },
            expectedStatuses: [200]
        });
        assert.ok(Array.isArray(response), 'Response must be array');
        assert.strictEqual(response.length, 0, 'Initial membership count must be 0');
    });

    await t.test('I5: Create initial store via RPC', async () => {
        const response = await requestJson({
            url: `${apiUrl}/rest/v1/rpc/create_initial_store`,
            method: 'POST',
            headers: {
                'apikey': anonKey,
                'Authorization': `Bearer ${accessToken}`
            },
            body: {
                p_name: 'Local Integration Store',
                p_subtitle: 'Local Test',
                p_default_language: 'ko'
            },
            expectedStatuses: [200]
        });
        assert.ok(response, 'Response must exist');
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        assert.ok(uuidRegex.test(response), 'Returned value must be UUID');
        storeId = response;
    });

    await t.test('I6: Idempotency - same store UUID on re-call', async () => {
        const response = await requestJson({
            url: `${apiUrl}/rest/v1/rpc/create_initial_store`,
            method: 'POST',
            headers: {
                'apikey': anonKey,
                'Authorization': `Bearer ${accessToken}`
            },
            body: {
                p_name: 'Different Name',
                p_subtitle: 'Different Subtitle',
                p_default_language: 'ko'
            },
            expectedStatuses: [200]
        });
        assert.strictEqual(response, storeId, 'Store ID must be the same on second call');
    });

    await t.test('I7: Owner membership is exactly 1', async () => {
        const response = await requestJson({
            url: `${apiUrl}/rest/v1/store_members?select=store_id,role,is_active&user_id=eq.${userId}&is_active=eq.true`,
            method: 'GET',
            headers: {
                'apikey': anonKey,
                'Authorization': `Bearer ${accessToken}`
            },
            expectedStatuses: [200]
        });
        assert.ok(Array.isArray(response), 'Response must be array');
        assert.strictEqual(response.length, 1, 'Membership count must be 1');
        assert.strictEqual(response[0].store_id, storeId, 'Store ID must match');
        assert.strictEqual(response[0].role, 'owner', 'Role must be owner');
        assert.strictEqual(response[0].is_active, true, 'Must be active');
    });

    await t.test('I8: Store RLS query works', async () => {
        const response = await requestJson({
            url: `${apiUrl}/rest/v1/stores?select=id,name,subtitle&id=eq.${storeId}&deleted_at=is.null`,
            method: 'GET',
            headers: {
                'apikey': anonKey,
                'Authorization': `Bearer ${accessToken}`
            },
            expectedStatuses: [200]
        });
        assert.ok(Array.isArray(response), 'Response must be array');
        assert.strictEqual(response.length, 1, 'Must return exactly 1 row');
        assert.strictEqual(response[0].id, storeId, 'Store ID must match');
        assert.strictEqual(response[0].name, 'Local Integration Store', 'Store name must match');
    });

    await t.test('I9: Store settings default language is ko', async () => {
        const response = await requestJson({
            url: `${apiUrl}/rest/v1/store_settings?select=store_id,store_name,default_language&store_id=eq.${storeId}`,
            method: 'GET',
            headers: {
                'apikey': anonKey,
                'Authorization': `Bearer ${accessToken}`
            },
            expectedStatuses: [200]
        });
        assert.ok(Array.isArray(response), 'Response must be array');
        assert.strictEqual(response.length, 1, 'Must return exactly 1 row');
        assert.strictEqual(response[0].store_id, storeId, 'Store ID must match');
        assert.strictEqual(response[0].default_language, 'ko', 'Default language must be ko');
    });

    await t.test('I10: list_staff_products RPC returns empty array', async () => {
        const response = await requestJson({
            url: `${apiUrl}/rest/v1/rpc/list_staff_products`,
            method: 'POST',
            headers: {
                'apikey': anonKey,
                'Authorization': `Bearer ${accessToken}`
            },
            body: {
                p_store_id: storeId,
                p_search: null,
                p_limit: 100,
                p_offset: 0
            },
            expectedStatuses: [200]
        });
        assert.ok(Array.isArray(response), 'Response must be array');
        assert.strictEqual(response.length, 0, 'Must return empty array (no fixtures)');
    });

    await t.test('I11: Refresh token to get new session', async () => {
        const response = await requestJson({
            url: `${apiUrl}/auth/v1/token?grant_type=refresh_token`,
            method: 'POST',
            headers: {
                'apikey': anonKey
            },
            body: {
                refresh_token: refreshToken
            },
            expectedStatuses: [200]
        });
        assert.ok(response && response.access_token, 'New access token must be returned');
        assert.ok(response.refresh_token, 'New refresh token must be returned');
        assert.ok(response.user && response.user.id, 'User must be returned');
        assert.strictEqual(response.user.id, userId, 'User ID must match');
        accessToken = response.access_token;
        refreshToken = response.refresh_token;
    });

    await t.test('I12: SignOut and re-login with same credentials', async () => {
        await requestJson({
            url: `${apiUrl}/auth/v1/logout`,
            method: 'POST',
            headers: {
                'apikey': anonKey,
                'Authorization': `Bearer ${accessToken}`
            },
            expectedStatuses: [200, 204]
        });

        const loginResponse = await requestJson({
            url: `${apiUrl}/auth/v1/token?grant_type=password`,
            method: 'POST',
            headers: {
                'apikey': anonKey
            },
            body: {
                email: testEmail,
                password: testPassword
            },
            expectedStatuses: [200]
        });
        assert.ok(loginResponse && loginResponse.access_token, 'Access token must be returned');
        assert.ok(loginResponse.refresh_token, 'Refresh token must be returned');
        assert.ok(loginResponse.user && loginResponse.user.id, 'User must be returned');
        assert.strictEqual(loginResponse.user.id, userId, 'User ID must match original');
    });
});

test('Security: Only localhost hostnames were used', async () => {
    assert.strictEqual(recordedHostnames.size, 1, 'Only one hostname should be recorded');
    const hostname = recordedHostnames.values().next().value;
    assert.ok(allowedHostnames.has(hostname), `Hostname must be localhost (got: ${hostname})`);
});
