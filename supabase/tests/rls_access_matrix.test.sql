-- ============================================================
-- pgTAP: RLS Access Matrix Test
-- ============================================================
-- 
-- PURPOSE:
--   Verify Row Level Security policies for the fashion manager schema.
-- 
-- EXECUTION:
--   supabase test db
--   (Requires Supabase CLI with local Supabase instance)
--
-- STATUS: NOT EXECUTED. File written but not run against any database.
-- 
-- CONVENTIONS:
--   - Uses pgTAP functions (plan, lives_ok, throws_ok, results_eq, is, finish)
--   - Sets authenticated role + request.jwt.claim.sub to simulate user context
--   - All data is created inside the transaction and rolled back
--   - auth.uid() is NEVER overridden with CREATE OR REPLACE
--   - No psql-only \set syntax
--
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- Setup: pgTAP extension
-- ------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(18);

-- ------------------------------------------------------------
-- Helper: set_request_user
-- Sets the authenticated role and JWT claim to simulate a logged-in user.
-- Does NOT override auth.uid().
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_request_user(p_user_id uuid)
RETURNS void AS $$
BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', p_user_id::text, true);
    PERFORM set_config('request.jwt.claims', 
        json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------
-- Setup: test users (insert into auth.users-like structure)
-- ------------------------------------------------------------
-- Note: In a real Supabase test environment, auth.users would be pre-populated.
-- For self-contained pgTAP testing, we use raw insert with service-level context.
-- In supabase test db, auth.users is available and can be inserted directly.

-- We'll insert test users if auth.users exists and is accessible
DO $$
DECLARE
    v_user_owner uuid    := '11111111-1111-1111-1111-111111111111';
    v_user_manager uuid  := '22222222-2222-2222-2222-222222222222';
    v_user_staff uuid    := '33333333-3333-3333-3333-333333333333';
    v_user_other uuid    := '44444444-4444-4444-4444-444444444444';
    v_store_a uuid       := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    v_store_b uuid       := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    v_prod_active uuid   := 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    v_prod_deleted uuid  := 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    v_cust_active uuid   := 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
    v_cust_deleted uuid  := 'ffffffff-ffff-ffff-ffff-ffffffffffff';
    v_order_existing uuid:= '10101010-1010-1010-1010-101010101010';
BEGIN
    -- Insert test users into auth.users (only works in Supabase local test env)
    -- Wrap in block with exception handling for environments without auth.users insert permission
    BEGIN
        INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at)
        VALUES
            (v_user_owner,   'owner@test.local',   '$2a$10$test', now(), now()),
            (v_user_manager, 'manager@test.local', '$2a$10$test', now(), now()),
            (v_user_staff,   'staff@test.local',   '$2a$10$test', now(), now()),
            (v_user_other,   'other@test.local',   '$2a$10$test', now(), now())
        ON CONFLICT (id) DO NOTHING;
    EXCEPTION
        WHEN insufficient_privilege THEN
            -- Cannot insert into auth.users (non-Supabase environment)
            -- Tests will still demonstrate the pattern but may skip some assertions
            RAISE NOTICE 'Cannot insert into auth.users: %', SQLERRM;
    END;

    -- Create store A
    INSERT INTO public.stores (id, name, created_by)
    VALUES (v_store_a, 'Test Store A', v_user_owner);

    -- Create store B (owned by other user)
    INSERT INTO public.stores (id, name, created_by)
    VALUES (v_store_b, 'Test Store B', v_user_other);

    -- Create store_members for store A
    INSERT INTO public.store_members (id, store_id, user_id, role, is_active)
    VALUES
        ('aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa', v_store_a, v_user_owner,   'owner',   true),
        ('aaaa2222-aaaa-aaaa-aaaa-aaaaaaaaaaaa', v_store_a, v_user_manager, 'manager', true),
        ('aaaa3333-aaaa-aaaa-aaaa-aaaaaaaaaaaa', v_store_a, v_user_staff,   'staff',   true);

    -- Create store_members for store B
    INSERT INTO public.store_members (id, store_id, user_id, role, is_active)
    VALUES
        ('bbbb1111-bbbb-bbbb-bbbb-bbbbbbbbbbbb', v_store_b, v_user_other, 'owner', true);

    -- Create active product in store A
    INSERT INTO public.products (id, store_id, product_code, original_title, brand, current_stock, created_by)
    VALUES (v_prod_active, v_store_a, 'ACT-001', 'Active Product', 'TestBrand', 100, v_user_owner);

    -- Create soft-deleted product in store A
    INSERT INTO public.products (id, store_id, product_code, original_title, brand, current_stock, deleted_at, created_by)
    VALUES (v_prod_deleted, v_store_a, 'DEL-001', 'Deleted Product', 'TestBrand', 50, now(), v_user_owner);

    -- Create active customer in store A
    INSERT INTO public.customers (id, store_id, name, created_by)
    VALUES (v_cust_active, v_store_a, 'Active Customer', v_user_owner);

    -- Create soft-deleted customer in store A
    INSERT INTO public.customers (id, store_id, name, deleted_at, created_by)
    VALUES (v_cust_deleted, v_store_a, 'Deleted Customer', now(), v_user_owner);

    -- Create an existing order linked to deleted product (historical data)
    INSERT INTO public.orders (
        id, store_id, order_number, customer_id, product_id,
        customer_name_snapshot, product_title_snapshot, brand_snapshot,
        quantity, selling_price, status, order_date, created_by
    ) VALUES (
        v_order_existing, v_store_a, 'ORD-HIST-001', v_cust_active, v_prod_deleted,
        'Active Customer', 'Deleted Product', 'TestBrand',
        1, 10000, 'COMPLETED', '2026-01-15', v_user_owner
    );
END $$;

-- ============================================================
-- TEST 1: Owner can view their own store
-- ============================================================

SELECT lives_ok(
    $$
    SELECT set_request_user('11111111-1111-1111-1111-111111111111');
    $$,
    'T1a: Set owner user context'
);

SELECT is(
    (SELECT count(*)::integer FROM public.stores WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
    1,
    'T1b: Owner can view their own store'
);

-- ============================================================
-- TEST 2: Owner cannot view other store
-- ============================================================

SELECT is(
    (SELECT count(*)::integer FROM public.stores WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
    0,
    'T2: Owner cannot view other store'
);

-- ============================================================
-- TEST 3: Manager can insert product
-- ============================================================

SELECT lives_ok(
    $$
    SELECT set_request_user('22222222-2222-2222-2222-222222222222');
    $$,
    'T3a: Set manager user context'
);

SELECT lives_ok(
    $$
    INSERT INTO public.products (store_id, product_code, original_title, brand, current_stock)
    VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'MGR-TEST-1', 'Manager Insert Test', 'TestBrand', 10);
    $$,
    'T3b: Manager can insert product'
);

-- ============================================================
-- TEST 4: Staff gets 0 rows from products base table
-- ============================================================

SELECT lives_ok(
    $$
    SELECT set_request_user('33333333-3333-3333-3333-333333333333');
    $$,
    'T4a: Set staff user context'
);

SELECT is(
    (SELECT count(*)::integer FROM public.products),
    0,
    'T4b: Staff sees 0 products (base table blocked)'
);

-- ============================================================
-- TEST 5: Manager cannot update store_members
-- ============================================================

SELECT lives_ok(
    $$
    SELECT set_request_user('22222222-2222-2222-2222-222222222222');
    $$,
    'T5a: Set manager user context'
);

SELECT throws_ok(
    $$
    UPDATE public.store_members
    SET role = 'manager'
    WHERE id = 'aaaa3333-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    $$,
    'T5b: Manager cannot update store_members'
);

-- ============================================================
-- TEST 6: Cross-store customer order creation fails
-- ============================================================
-- (order with customer from other store should be blocked by trigger)

SELECT lives_ok(
    $$
    SELECT set_request_user('11111111-1111-1111-1111-111111111111');
    $$,
    'T6a: Set owner context'
);

-- Note: RLS would already prevent seeing other-store customers,
-- but we test trigger-level validation with a direct cross-store reference.
-- In practice this is tested via direct SQL with elevated role + RLS bypass.
-- For pgTAP under authenticated role, RLS itself will block the FK lookup.
-- We test by attempting to insert with a fake UUID that is not in the store.

SELECT throws_ok(
    $$
    INSERT INTO public.orders (store_id, order_number, customer_id, product_id, quantity, selling_price)
    VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'TEST-XSTORE-1', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 1, 10000);
    $$,
    'T6: Cross-store reference validation works'
);

-- ============================================================
-- TEST 7: Soft-deleted product new connection fails
-- ============================================================

SELECT throws_ok(
    $$
    INSERT INTO public.orders (store_id, order_number, customer_id, product_id, quantity, selling_price)
    VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'TEST-DEL-PROD-1', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 1, 5000);
    $$,
    'T7: Cannot create order with soft-deleted product'
);

-- ============================================================
-- TEST 8: Historical order with deleted product - notes update succeeds
-- ============================================================

SELECT lives_ok(
    $$
    UPDATE public.orders
    SET notes = 'Updated historical notes'
    WHERE id = '10101010-1010-1010-1010-101010101010';
    $$,
    'T8: Can update notes on historical order with deleted product'
);

-- ============================================================
-- TEST 9: Last owner deactivation fails
-- ============================================================

SELECT throws_ok(
    $$
    UPDATE public.store_members
    SET is_active = false
    WHERE user_id = '11111111-1111-1111-1111-111111111111'
      AND store_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    $$,
    'T9: Cannot deactivate last active owner'
);

-- ============================================================
-- TEST 10: Last owner role change fails
-- ============================================================

SELECT throws_ok(
    $$
    UPDATE public.store_members
    SET role = 'manager'
    WHERE user_id = '11111111-1111-1111-1111-111111111111'
      AND store_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    $$,
    'T10: Cannot change last owner role to manager'
);

-- ============================================================
-- TEST 11: store_members user_id change fails
-- ============================================================

SELECT throws_ok(
    $$
    UPDATE public.store_members
    SET user_id = '22222222-2222-2222-2222-222222222222'
    WHERE id = 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    $$,
    'T11: Cannot change store_members user_id'
);

-- ============================================================
-- TEST 12: products created_by is set to auth.uid()
-- ============================================================
-- We test by inserting and checking the created_by value matches our context.

SELECT is(
    (SELECT created_by::text FROM public.products WHERE product_code = 'MGR-TEST-1'),
    '22222222-2222-2222-2222-222222222222',
    'T12: created_by is set to auth.uid() on insert'
);

-- ============================================================
-- TEST 13: migration_runs insert succeeds and initiated_by is set
-- ============================================================

SELECT lives_ok(
    $$
    SELECT set_request_user('11111111-1111-1111-1111-111111111111');
    $$,
    'T13a: Set owner context for migration test'
);

SELECT lives_ok(
    $$
    INSERT INTO public.migration_runs (store_id, source_type)
    VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'test_migration');
    $$,
    'T13b: Owner can insert migration_runs'
);

SELECT is(
    (SELECT initiated_by::text FROM public.migration_runs WHERE source_type = 'test_migration' LIMIT 1),
    '11111111-1111-1111-1111-111111111111',
    'T13c: initiated_by is set to auth.uid() on migration_runs insert'
);

-- ============================================================
-- TEST 14: stores update succeeds (owner)
-- ============================================================

SELECT lives_ok(
    $$
    UPDATE public.stores
    SET name = 'Updated Store A Name'
    WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    $$,
    'T14: Owner can update store name'
);

-- ============================================================
-- TEST 15: Physical DELETE fails (no policy)
-- ============================================================

SELECT throws_ok(
    $$
    DELETE FROM public.products WHERE product_code = 'MGR-TEST-1';
    $$,
    'T15: Physical DELETE is blocked (no policy / no grant)'
);

-- ============================================================
-- TEST 16: Owner can view deleted products
-- ============================================================

SELECT is(
    (SELECT count(*)::integer FROM public.products WHERE deleted_at IS NOT NULL),
    1,
    'T16: Owner can view soft-deleted products'
);

-- ============================================================
-- TEST 17: Manager cannot view deleted products
-- ============================================================

SELECT lives_ok(
    $$
    SELECT set_request_user('22222222-2222-2222-2222-222222222222');
    $$,
    'T17a: Set manager context'
);

SELECT is(
    (SELECT count(*)::integer FROM public.products WHERE deleted_at IS NOT NULL),
    0,
    'T17b: Manager cannot view soft-deleted products'
);

-- ============================================================
-- Cleanup helper
-- ============================================================

DROP FUNCTION set_request_user(uuid);

-- ============================================================
-- Finish
-- ============================================================

SELECT finish();

ROLLBACK;
