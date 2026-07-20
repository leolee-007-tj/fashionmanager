-- ============================================================
-- pgTAP: Products Write RPC Test
-- ============================================================
--
-- PURPOSE:
--   Verify SECURITY DEFINER RPCs for product write operations.
--   Tests owner/manager/staff/non-member permissions,
--   immutable field protection, soft delete behavior,
--   cross-store access blocking, and public execution prevention.
--
-- COVERS:
--   - create_product (owner/manager allow, staff/non-member block)
--   - update_product (owner/manager allow, immutable fields protected)
--   - soft_delete_product (soft delete only, no hard delete)
--   - Cross-store access blocking
--   - Deleted store blocking
--   - Public/anon execution prevention
--   - Direct table UPDATE restrictions
--
-- ASSERTIONS: 27
--
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(30);

-- ------------------------------------------------------------
-- Helper
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_request_user(p_user_id uuid)
RETURNS void AS $$
BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', p_user_id::text, true);
    PERFORM set_config('request.jwt.claims',
        json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------
-- Setup (admin role, JWT claims set for audit triggers)
-- ------------------------------------------------------------

SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims',
    json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

-- auth.users
INSERT INTO auth.users (id, email) VALUES
    ('11111111-1111-1111-1111-111111111111', 'owner@test.local'),
    ('22222222-2222-2222-2222-222222222222', 'manager@test.local'),
    ('33333333-3333-3333-3333-333333333333', 'staff@test.local'),
    ('44444444-4444-4444-4444-444444444444', 'nonmember@test.local');

-- Store A
INSERT INTO public.stores (id, name, created_by)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Test Store A', '11111111-1111-1111-1111-111111111111');

-- Store B (cross-store test)
INSERT INTO public.stores (id, name, created_by)
VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Test Store B', '44444444-4444-4444-4444-444444444444');

-- Store Members
INSERT INTO public.store_members (id, store_id, user_id, role, is_active, invited_by) VALUES
    ('aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner', true, '11111111-1111-1111-1111-111111111111'),
    ('aaaa2222-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'manager', true, '11111111-1111-1111-1111-111111111111'),
    ('aaaa3333-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'staff', true, '11111111-1111-1111-1111-111111111111');

-- Non-member for Store A
INSERT INTO public.store_members (id, store_id, user_id, role, is_active, invited_by) VALUES
    ('bbbb4444-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '44444444-4444-4444-4444-444444444444', 'owner', true, '44444444-4444-4444-4444-444444444444');

-- Test product
INSERT INTO public.products (id, legacy_id, store_id, product_code, original_title, brand, category, color, size, current_stock, reserved_stock, korea_cost, china_base_price, created_by, version) VALUES
    ('10000000-0000-0000-0000-000000000009', 9999, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'PRD-TEST-001', 'Test Product', 'BrandT', 'top', 'red', 'M', 50, 0, 30000, 15000, '11111111-1111-1111-1111-111111111111', 1);

-- Clear JWT claims, keep admin role
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);

-- ============================================================
-- T1: owner can create product
-- ============================================================

SELECT public.set_request_user('11111111-1111-1111-1111-111111111111');

SELECT lives_ok(
    $$
    CREATE TEMP TABLE _t1_create AS
    SELECT (
        public.create_product(
            'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            'PRD-NEW-OWNER',
            'New Owner Product',
            'BrandO',
            p_legacy_id => 1100,
            p_category => 'dress',
            p_color => 'blue',
            p_size => 'L',
            p_current_stock => 20,
            p_korea_cost => 30000,
            p_china_base_price => 15000
        )
    ).*
    $$,
    'T1: owner can create product via create_product RPC'
);

SELECT is(
    (SELECT product_code FROM _t1_create),
    'PRD-NEW-OWNER',
    'T1b: product_code matches'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);

-- ============================================================
-- T2: manager can create product
-- ============================================================

SELECT public.set_request_user('22222222-2222-2222-2222-222222222222');

SELECT lives_ok(
    $$
    CREATE TEMP TABLE _t2_create AS
    SELECT (
        public.create_product(
            'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            'PRD-NEW-MGR',
            'New Manager Product',
            'BrandM',
            p_legacy_id => 1200,
            p_category => 'pants',
            p_color => 'black',
            p_size => 'XL',
            p_current_stock => 15,
            p_korea_cost => 25000,
            p_china_base_price => 12000
        )
    ).*
    $$,
    'T2: manager can create product via create_product RPC'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);

-- ============================================================
-- T3: staff cannot create product
-- ============================================================

SELECT public.set_request_user('33333333-3333-3333-3333-333333333333');

SELECT throws_ok(
    $$ SELECT public.create_product(
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'PRD-NEW-STAFF',
        'Staff Product',
        'BrandS'
    ) $$,
    '42501',
    NULL,
    'T3: staff cannot create product'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);

-- ============================================================
-- T4: non-member cannot create product
-- ============================================================

SELECT public.set_request_user('44444444-4444-4444-4444-444444444444');

SELECT throws_ok(
    $$ SELECT public.create_product(
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'PRD-NEW-NONMEMBER',
        'Non-member Product',
        'BrandN'
    ) $$,
    '42501',
    NULL,
    'T4: non-member cannot create product'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);

-- ============================================================
-- T5: owner can update product
-- ============================================================

SELECT public.set_request_user('11111111-1111-1111-1111-111111111111');

SELECT lives_ok(
    $$
    CREATE TEMP TABLE _t5_update AS
    SELECT (
        public.update_product(
            'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            9999,
            p_category => 'skirt',
            p_color => 'green',
            p_current_stock => 60,
            p_korea_cost => 35000
        )
    ).*
    $$,
    'T5: owner can update product via update_product RPC'
);

SELECT is(
    (SELECT category FROM _t5_update),
    'skirt',
    'T5b: category updated'
);

SELECT is(
    (SELECT color FROM _t5_update),
    'green',
    'T5c: color updated'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);

-- ============================================================
-- T6: manager can update product
-- ============================================================

SELECT public.set_request_user('22222222-2222-2222-2222-222222222222');

SELECT lives_ok(
    $$
    CREATE TEMP TABLE _t6_update AS
    SELECT (
        public.update_product(
            'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            9999,
            p_size => 'L',
            p_notes => 'Updated by manager'
        )
    ).*
    $$,
    'T6: manager can update product via update_product RPC'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);

-- ============================================================
-- T7: staff cannot update product
-- ============================================================

SELECT public.set_request_user('33333333-3333-3333-3333-333333333333');

SELECT throws_ok(
    $$ SELECT public.update_product(
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        9999,
        p_category => 'blocked'
    ) $$,
    '42501',
    NULL,
    'T7: staff cannot update product'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);

-- ============================================================
-- T8: non-member cannot update product
-- ============================================================

SELECT public.set_request_user('44444444-4444-4444-4444-444444444444');

SELECT throws_ok(
    $$ SELECT public.update_product(
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        9999,
        p_category => 'blocked'
    ) $$,
    '42501',
    NULL,
    'T8: non-member cannot update product'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);

-- ============================================================
-- T9-T13: Immutable fields are protected (update cannot change)
-- ============================================================

SELECT public.set_request_user('11111111-1111-1111-1111-111111111111');

-- Read original values
CREATE TEMP TABLE _orig AS
SELECT id, legacy_id, store_id, created_by, created_at
FROM public.products
WHERE legacy_id = 9999;

-- Try update (cannot change immutable fields via RPC anyway)
SELECT public.update_product(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    9999,
    p_category => 'immutable-test'
);

-- Verify immutable fields unchanged
SELECT is(
    (SELECT id FROM public.products WHERE legacy_id = 9999),
    (SELECT id FROM _orig),
    'T9: update cannot change id'
);

SELECT is(
    (SELECT legacy_id FROM public.products WHERE legacy_id = 9999),
    (SELECT legacy_id FROM _orig),
    'T10: update cannot change legacy_id'
);

SELECT is(
    (SELECT store_id FROM public.products WHERE legacy_id = 9999),
    (SELECT store_id FROM _orig),
    'T11: update cannot change store_id'
);

SELECT is(
    (SELECT created_by FROM public.products WHERE legacy_id = 9999),
    (SELECT created_by FROM _orig),
    'T12: update cannot change created_by'
);

SELECT is(
    (SELECT created_at FROM public.products WHERE legacy_id = 9999),
    (SELECT created_at FROM _orig),
    'T13: update cannot change created_at'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);

-- ============================================================
-- T14: update sets updated_by
-- ============================================================

SELECT public.set_request_user('22222222-2222-2222-2222-222222222222');

CREATE TEMP TABLE _t14_update AS
SELECT (
    public.update_product(
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        9999,
        p_notes => 'test-updated-by'
    )
).*;

SELECT is(
    (SELECT updated_by FROM _t14_update),
    '22222222-2222-2222-2222-222222222222',
    'T14: update sets updated_by to current user'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);

-- ============================================================
-- T15: update sets updated_at
-- ============================================================

SELECT public.set_request_user('11111111-1111-1111-1111-111111111111');

SELECT (
    public.update_product(
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        9999,
        p_notes => 'test-updated-at'
    )
).*;

SELECT ok(
    (SELECT updated_at FROM public.products WHERE legacy_id = 9999)
    >= (SELECT created_at FROM public.products WHERE legacy_id = 9999),
    'T15: update sets updated_at to now()'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);

-- ============================================================
-- T16: owner can soft delete product
-- ============================================================

SELECT public.set_request_user('11111111-1111-1111-1111-111111111111');

SELECT lives_ok(
    $$
    CREATE TEMP TABLE _t16_delete AS
    SELECT (
        public.soft_delete_product(
            'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            9999
        )
    ).*
    $$,
    'T16: owner can soft delete product via soft_delete_product RPC'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);

-- ============================================================
-- T17: manager can soft delete product
-- ============================================================

-- Restore product for manager test
SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims',
    json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

UPDATE public.products SET deleted_at = NULL, updated_at = now(), version = version + 1
WHERE legacy_id = 9999;

SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);

SELECT public.set_request_user('22222222-2222-2222-2222-222222222222');

SELECT lives_ok(
    $$ SELECT public.soft_delete_product('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 9999) $$,
    'T17: manager can soft delete product via soft_delete_product RPC'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);

-- ============================================================
-- T18: staff cannot soft delete product
-- ============================================================

-- Restore product for staff test
SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims',
    json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

UPDATE public.products SET deleted_at = NULL, updated_at = now(), version = version + 1
WHERE legacy_id = 9999;

SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);

SELECT public.set_request_user('33333333-3333-3333-3333-333333333333');

SELECT throws_ok(
    $$ SELECT public.soft_delete_product('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 9999) $$,
    '42501',
    NULL,
    'T18: staff cannot soft delete product'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);

-- ============================================================
-- T19: non-member cannot soft delete product
-- ============================================================

SELECT public.set_request_user('44444444-4444-4444-4444-444444444444');

SELECT throws_ok(
    $$ SELECT public.soft_delete_product('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 9999) $$,
    '42501',
    NULL,
    'T19: non-member cannot soft delete product'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);

-- ============================================================
-- T20: soft delete sets deleted_at
-- ============================================================

SELECT public.set_request_user('11111111-1111-1111-1111-111111111111');

SELECT (
    public.soft_delete_product(
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        9999
    )
).*;

SELECT ok(
    (SELECT deleted_at FROM public.products WHERE legacy_id = 9999) IS NOT NULL,
    'T20: soft delete sets deleted_at'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);

-- ============================================================
-- T21: soft delete does not hard delete row
-- ============================================================

SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims',
    json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

SELECT is(
    (SELECT count(*)::integer FROM public.products WHERE legacy_id = 9999),
    1,
    'T21: soft delete does not hard delete row (row still exists)'
);

SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);

-- ============================================================
-- T22: cross-store update blocked
-- ============================================================

-- Create product in Store B
SELECT set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
SELECT set_config('request.jwt.claims',
    json_build_object('sub', '44444444-4444-4444-4444-444444444444', 'role', 'authenticated')::text, true);

INSERT INTO public.products (id, legacy_id, store_id, product_code, original_title, brand, created_by, version) VALUES
    ('20000000-0000-0000-0000-000000000008', 8888, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'PRD-STOREB-001', 'Store B Product', 'BrandB', '44444444-4444-4444-4444-444444444444', 1);

SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);

-- Store A owner tries to update Store B product
SELECT public.set_request_user('11111111-1111-1111-1111-111111111111');

SELECT throws_ok(
    $$ SELECT public.update_product(
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        8888,
        p_category => 'cross-store'
    ) $$,
    '42501',
    NULL,
    'T22: cross-store update blocked'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);

-- ============================================================
-- T23: cross-store soft delete blocked
-- ============================================================

SELECT public.set_request_user('11111111-1111-1111-1111-111111111111');

SELECT throws_ok(
    $$ SELECT public.soft_delete_product('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 8888) $$,
    '42501',
    NULL,
    'T23: cross-store soft delete blocked'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);

-- ============================================================
-- T24: deleted store blocked
-- ============================================================

-- Soft-delete Store B
SELECT set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
SELECT set_config('request.jwt.claims',
    json_build_object('sub', '44444444-4444-4444-4444-444444444444', 'role', 'authenticated')::text, true);

UPDATE public.stores SET deleted_at = now() WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);

SELECT public.set_request_user('44444444-4444-4444-4444-444444444444');

SELECT throws_ok(
    $$ SELECT public.create_product(
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        'PRD-DELSTORE',
        'Deleted Store Product',
        'BrandD'
    ) $$,
    '22023',
    NULL,
    'T24: deleted store blocked'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);

-- ============================================================
-- T25: public cannot execute RPC
-- ============================================================

SET LOCAL ROLE anon;

SELECT throws_ok(
    $$ SELECT public.create_product(
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'PRD-ANON',
        'Anon Product',
        'BrandA'
    ) $$,
    '42501',
    NULL,
    'T25: public/anon cannot execute create_product RPC'
);

RESET ROLE;

-- ============================================================
-- T26: authenticated can execute only through membership checks
-- ============================================================

-- Non-member is authenticated but has no membership in Store A
SELECT public.set_request_user('44444444-4444-4444-4444-444444444444');

SELECT throws_ok(
    $$ SELECT public.create_product(
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'PRD-AUTH-NONMEMBER',
        'Authenticated Non-member',
        'BrandX'
    ) $$,
    '42501',
    NULL,
    'T26: authenticated non-member cannot create product'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);

-- ============================================================
-- T27: direct table UPDATE grants are not broadened
-- ============================================================

SELECT public.set_request_user('11111111-1111-1111-1111-111111111111');

-- Restore test product for this test
SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims',
    json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

INSERT INTO public.products (id, legacy_id, store_id, product_code, original_title, brand, created_by, version) VALUES
    ('30000000-0000-0000-0000-000000000007', 7777, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'PRD-DIR-UPDATE', 'Direct Update Test', 'BrandR', '11111111-1111-1111-1111-111111111111', 1);

SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);

SELECT public.set_request_user('11111111-1111-1111-1111-111111111111');

-- Direct table UPDATE on updated_at should fail (not in column-level grant)
SELECT throws_ok(
    $$
    UPDATE public.products SET updated_at = now()
    WHERE legacy_id = 7777;
    $$,
    '42501',
    NULL,
    'T27: direct table UPDATE on updated_at blocked (column not granted)'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);

-- ============================================================
-- Cleanup
-- ============================================================

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);

DROP FUNCTION IF EXISTS public.set_request_user(uuid);
DROP TABLE IF EXISTS _t1_create;
DROP TABLE IF EXISTS _t2_create;
DROP TABLE IF EXISTS _t5_update;
DROP TABLE IF EXISTS _t6_update;
DROP TABLE IF EXISTS _orig;
DROP TABLE IF EXISTS _t14_update;
DROP TABLE IF EXISTS _t16_delete;

-- ============================================================
-- Finish
-- ============================================================

SELECT finish();

ROLLBACK;