-- ============================================================
-- pgTAP: RLS Access Matrix Test
-- ============================================================
--
-- PURPOSE:
--   Verify Row Level Security policies and triggers for the fashion manager schema.
--
-- EXECUTION:
--   supabase test db
--   (Requires Supabase CLI with local Supabase instance)
--
-- STATUS: NOT EXECUTED. File written but not run against any database.
--
-- CONVENTIONS:
--   - Uses pgTAP functions (plan, lives_ok, throws_ok, is, finish)
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

-- Assertion count: 25 (lives_ok + throws_ok + is calls below)
SELECT plan(25);

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
-- Setup: Set owner context BEFORE creating test data
-- This ensures triggers (handle_audit_metadata etc.) set created_by correctly.
-- ------------------------------------------------------------

SELECT set_request_user('11111111-1111-1111-1111-111111111111');

-- ------------------------------------------------------------
-- Setup: test data
-- ------------------------------------------------------------
-- UUIDs:
--   owner:    11111111-1111-1111-1111-111111111111
--   manager:  22222222-2222-2222-2222-222222222222
--   staff:    33333333-3333-3333-3333-333333333333
--   other:    44444444-4444-4444-4444-444444444444
--   store_a:  aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
--   store_b:  bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb

DO $$
DECLARE
    v_user_owner uuid     := '11111111-1111-1111-1111-111111111111';
    v_user_manager uuid   := '22222222-2222-2222-2222-222222222222';
    v_user_staff uuid     := '33333333-3333-3333-3333-333333333333';
    v_user_other uuid     := '44444444-4444-4444-4444-444444444444';
    v_store_a uuid        := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    v_store_b uuid        := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    v_prod_active uuid    := 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    v_prod_to_delete uuid := 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    v_prod_deleted_2 uuid := 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0';
    v_prod_store_b uuid   := '55555555-5555-5555-5555-555555555555';
    v_cust_active uuid    := 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
    v_cust_store_b uuid   := '66666666-6666-6666-6666-666666666666';
    v_order_hist uuid     := '10101010-1010-1010-1010-101010101010';
BEGIN
    -- Insert test users into auth.users
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
            RAISE NOTICE 'Cannot insert into auth.users: %', SQLERRM;
    END;

    -- Create store A (owned by owner)
    INSERT INTO public.stores (id, name, created_by)
    VALUES (v_store_a, 'Test Store A', v_user_owner);

    -- Create store B (owned by other)
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

    -- Create active product in store A (for general use and order product_id change test)
    INSERT INTO public.products (id, store_id, product_code, original_title, brand, current_stock, created_by)
    VALUES (v_prod_active, v_store_a, 'ACT-001', 'Active Product', 'TestBrand', 100, v_user_owner);

    -- Create product in store A that will be soft-deleted AFTER order creation
    -- Step 1: Create as active
    INSERT INTO public.products (id, store_id, product_code, original_title, brand, current_stock, created_by)
    VALUES (v_prod_to_delete, v_store_a, 'HIST-001', 'Historical Product', 'TestBrand', 50, v_user_owner);

    -- Create another soft-deleted product in store A (for product_id change failure test)
    -- This product is deleted at creation time; no order references it so no trigger conflict
    INSERT INTO public.products (id, store_id, product_code, original_title, brand, current_stock, deleted_at, created_by)
    VALUES (v_prod_deleted_2, v_store_a, 'DEL-002', 'Deleted Product 2', 'TestBrand', 30, now(), v_user_owner);

    -- Create active product in store B (for cross-store test)
    INSERT INTO public.products (id, store_id, product_code, original_title, brand, current_stock, created_by)
    VALUES (v_prod_store_b, v_store_b, 'STB-001', 'Store B Product', 'TestBrand', 80, v_user_other);

    -- Create active customer in store A
    INSERT INTO public.customers (id, store_id, name, created_by)
    VALUES (v_cust_active, v_store_a, 'Active Customer', v_user_owner);

    -- Create active customer in store B (for cross-store test)
    INSERT INTO public.customers (id, store_id, name, created_by)
    VALUES (v_cust_store_b, v_store_b, 'Store B Customer', v_user_other);

    -- Step 2: Create historical order linked to active v_prod_to_delete
    -- Product is still active, so validate_order_store_consistency trigger passes
    INSERT INTO public.orders (
        id, store_id, order_number, customer_id, product_id,
        customer_name_snapshot, product_title_snapshot, brand_snapshot,
        quantity, selling_price, status, order_date, created_by
    ) VALUES (
        v_order_hist, v_store_a, 'ORD-HIST-001', v_cust_active, v_prod_to_delete,
        'Active Customer', 'Historical Product', 'TestBrand',
        1, 10000, 'COMPLETED', '2026-01-15', v_user_owner
    );

    -- Step 3: Soft-delete v_prod_to_delete AFTER order creation
    -- The order still references this product; future notes updates should succeed
    -- because product_id is not being changed.
    UPDATE public.products
    SET deleted_at = now()
    WHERE id = v_prod_to_delete;
END $$;

-- ============================================================
-- T1: Owner can view their own store
-- ============================================================

SELECT is(
    (SELECT count(*)::integer FROM public.stores WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
    1,
    'T1: Owner can view their own store'
);

-- ============================================================
-- T2: Owner cannot view other store
-- ============================================================

SELECT is(
    (SELECT count(*)::integer FROM public.stores WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
    0,
    'T2: Owner cannot view other store'
);

-- ============================================================
-- T3: Manager can insert product
-- ============================================================

SELECT set_request_user('22222222-2222-2222-2222-222222222222');

SELECT lives_ok(
    $$
    INSERT INTO public.products (store_id, product_code, original_title, brand, current_stock)
    VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'MGR-TEST-1', 'Manager Insert Test', 'TestBrand', 10);
    $$,
    'T3: Manager can insert product'
);

-- ============================================================
-- T4: Staff gets 0 rows from products base table
-- ============================================================

SELECT set_request_user('33333333-3333-3333-3333-333333333333');

SELECT is(
    (SELECT count(*)::integer FROM public.products),
    0,
    'T4: Staff sees 0 products (base table blocked)'
);

-- ============================================================
-- T5: Manager cannot update store_members (RLS blocks, 0 rows affected)
-- ============================================================

SELECT set_request_user('22222222-2222-2222-2222-222222222222');

-- RLS policy allows only owners to UPDATE store_members.
-- Manager gets 0 rows updated (no exception, just silently blocked).
SELECT lives_ok(
    $$
    UPDATE public.store_members
    SET role = 'manager'
    WHERE id = 'aaaa3333-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    $$,
    'T5a: Manager store_members UPDATE completes (0 rows affected, no error)'
);

-- Verify the staff role is unchanged
SELECT is(
    (SELECT role::text FROM public.store_members WHERE id = 'aaaa3333-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
    'staff',
    'T5b: Staff role unchanged after manager UPDATE attempt'
);

-- ============================================================
-- T6: Cross-store customer order creation fails (trigger)
-- ============================================================

SELECT set_request_user('11111111-1111-1111-1111-111111111111');

-- Store A order with Store B customer
SELECT throws_ok(
    $$
    INSERT INTO public.orders (store_id, order_number, customer_id, product_id, quantity, selling_price)
    VALUES (
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'TEST-XSTORE-CUST',
        '66666666-6666-6666-6666-666666666666',
        'cccccccc-cccc-cccc-cccc-cccccccccccc',
        1, 10000
    );
    $$,
    'T6: Cross-store customer order creation fails'
);

-- ============================================================
-- T7: Cross-store product order creation fails (trigger)
-- ============================================================

-- Store A order with Store B product
SELECT throws_ok(
    $$
    INSERT INTO public.orders (store_id, order_number, customer_id, product_id, quantity, selling_price)
    VALUES (
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'TEST-XSTORE-PROD',
        'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
        '55555555-5555-5555-5555-555555555555',
        1, 10000
    );
    $$,
    'T7: Cross-store product order creation fails'
);

-- ============================================================
-- T8: Cross-store inventory_log creation fails (trigger)
-- ============================================================
-- inventory_logs has no INSERT policy for authenticated, so RLS blocks first.
-- To test the trigger itself, we bypass RLS by resetting to superuser.

RESET ROLE;

SELECT throws_ok(
    $$
    INSERT INTO public.inventory_logs (store_id, product_id, change_type, quantity_change)
    VALUES (
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        '55555555-5555-5555-5555-555555555555',
        'RESTOCK',
        10
    );
    $$,
    'T8: Cross-store inventory_log product connection fails'
);

-- Restore owner context
SELECT set_request_user('11111111-1111-1111-1111-111111111111');

-- ============================================================
-- T9: Soft-deleted product new order connection fails (trigger)
-- ============================================================

SELECT throws_ok(
    $$
    INSERT INTO public.orders (store_id, order_number, customer_id, product_id, quantity, selling_price)
    VALUES (
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'TEST-DEL-PROD-NEW',
        'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
        'dddddddd-dddd-dddd-dddd-dddddddddddd',
        1, 5000
    );
    $$,
    'T9: Cannot create new order with soft-deleted product'
);

-- ============================================================
-- T10: Historical order notes update succeeds (product_id unchanged)
-- ============================================================

SELECT lives_ok(
    $$
    UPDATE public.orders
    SET notes = 'Updated historical notes'
    WHERE id = '10101010-1010-1010-1010-101010101010';
    $$,
    'T10: Can update notes on historical order with deleted product'
);

-- ============================================================
-- T11: Historical order product_id change to deleted product fails
-- ============================================================

SELECT throws_ok(
    $$
    UPDATE public.orders
    SET product_id = 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0'
    WHERE id = '10101010-1010-1010-1010-101010101010';
    $$,
    'T11: Cannot change product_id to another soft-deleted product'
);

-- ============================================================
-- T12: Historical order product_id change to active product succeeds
-- ============================================================

SELECT lives_ok(
    $$
    UPDATE public.orders
    SET product_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
    WHERE id = '10101010-1010-1010-1010-101010101010';
    $$,
    'T12: Can change product_id to active product'
);

-- ============================================================
-- T13: Last owner deactivation fails
-- ============================================================

SELECT throws_ok(
    $$
    UPDATE public.store_members
    SET is_active = false
    WHERE user_id = '11111111-1111-1111-1111-111111111111'
      AND store_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    $$,
    'T13: Cannot deactivate last active owner'
);

-- ============================================================
-- T14: Last owner role change fails
-- ============================================================

SELECT throws_ok(
    $$
    UPDATE public.store_members
    SET role = 'manager'
    WHERE user_id = '11111111-1111-1111-1111-111111111111'
      AND store_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    $$,
    'T14: Cannot change last owner role to manager'
);

-- ============================================================
-- T15: Staff membership user_id change fails (trigger)
-- ============================================================
-- Use staff membership (not owner) to test user_id protection.
-- Owner can UPDATE store_members (RLS allows), but trigger blocks user_id change.

SELECT throws_ok(
    $$
    UPDATE public.store_members
    SET user_id = '22222222-2222-2222-2222-222222222222'
    WHERE id = 'aaaa3333-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    $$,
    'T15: Cannot change store_members user_id'
);

-- ============================================================
-- T16: Product created_by is set to auth.uid() (manager)
-- ============================================================

SELECT is(
    (SELECT created_by::text FROM public.products WHERE product_code = 'MGR-TEST-1'),
    '22222222-2222-2222-2222-222222222222',
    'T16: created_by is set to auth.uid() on product insert'
);

-- ============================================================
-- T17: migration_runs insert succeeds and initiated_by is set
-- ============================================================

SELECT lives_ok(
    $$
    INSERT INTO public.migration_runs (store_id, source_type)
    VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'test_migration');
    $$,
    'T17: Owner can insert migration_runs'
);

SELECT is(
    (SELECT initiated_by::text FROM public.migration_runs WHERE source_type = 'test_migration' LIMIT 1),
    '11111111-1111-1111-1111-111111111111',
    'T18: initiated_by is set to auth.uid() on migration_runs insert'
);

-- ============================================================
-- T19: migration_runs UPDATE succeeds (updated_at/version trigger)
-- ============================================================

SELECT lives_ok(
    $$
    UPDATE public.migration_runs
    SET status = 'COMPLETED', completed_at = now()
    WHERE source_type = 'test_migration';
    $$,
    'T19: Owner can update migration_runs status'
);

-- ============================================================
-- T20: migration_runs version incremented after update
-- ============================================================

SELECT is(
    (SELECT version FROM public.migration_runs WHERE source_type = 'test_migration' LIMIT 1),
    2,
    'T20: migration_runs version incremented to 2 after update'
);

-- ============================================================
-- T21: stores update succeeds (owner)
-- ============================================================

SELECT lives_ok(
    $$
    UPDATE public.stores
    SET name = 'Updated Store A Name'
    WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    $$,
    'T21: Owner can update store name'
);

-- ============================================================
-- T22: Physical DELETE fails (no policy / no grant)
-- ============================================================

SELECT throws_ok(
    $$
    DELETE FROM public.products WHERE product_code = 'MGR-TEST-1';
    $$,
    'T22: Physical DELETE is blocked'
);

-- ============================================================
-- T23: Owner can view soft-deleted products
-- ============================================================

SELECT is(
    (SELECT count(*)::integer FROM public.products WHERE deleted_at IS NOT NULL),
    2,
    'T23: Owner can view soft-deleted products (2 deleted: HIST-001, DEL-002)'
);

-- ============================================================
-- T24: Manager cannot view soft-deleted products
-- ============================================================

SELECT set_request_user('22222222-2222-2222-2222-222222222222');

SELECT is(
    (SELECT count(*)::integer FROM public.products WHERE deleted_at IS NOT NULL),
    0,
    'T24: Manager cannot view soft-deleted products'
);

-- ============================================================
-- Cleanup: reset role, clear JWT claims, drop helper
-- ============================================================

RESET ROLE;
PERFORM set_config('request.jwt.claim.sub', '', true);
PERFORM set_config('request.jwt.claims', '', true);

DROP FUNCTION IF EXISTS set_request_user(uuid);

-- ============================================================
-- Finish
-- ============================================================

SELECT finish();

ROLLBACK;
