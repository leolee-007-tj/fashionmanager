-- ============================================================
-- pgTAP: RLS Access Matrix Test
-- ============================================================
--
-- PURPOSE:
--   Verify Row Level Security policies and triggers for the fashion manager schema.
--
-- EXECUTION:
--   supabase test db
--   (Requires Supabase CLI with local Supabase instance and Docker)
--
-- STATUS: NOT EXECUTED. File written but not run against any database.
--
-- CONVENTIONS:
--   - Uses pgTAP functions: plan, lives_ok, throws_ok, is, finish
--   - SET LOCAL ROLE authenticated + request.jwt.claim.sub for user simulation
--   - All data inside transaction, rolled back at end
--   - auth.uid() is NEVER overridden
--   - No psql-only \set syntax
--   - Setup runs in admin/postgres role with JWT claims set only
--   - Cleanup: RESET ROLE, clear JWT claims, DROP helper
--
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- Setup: pgTAP extension
-- ------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

-- Assertion count: 25 (lives_ok 7 + throws_ok 9 + is 9)
SELECT plan(25);

-- ------------------------------------------------------------
-- Helper: set_request_user
-- Sets authenticated role and JWT claim to simulate a logged-in user.
-- Does NOT override auth.uid().
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
-- Setup: JWT claims for owner (store A)
-- Role stays as superuser/admin. Only JWT claim is set so that
-- auth.uid() returns the owner UUID for trigger created_by assignment.
-- ------------------------------------------------------------

SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims',
    json_build_object(
        'sub', '11111111-1111-1111-1111-111111111111',
        'role', 'authenticated'
    )::text,
    true
);

-- ------------------------------------------------------------
-- Setup: auth.users test fixtures
-- ------------------------------------------------------------
-- Minimal fields only.
-- On failure, test will fail (no exception swallowing).

INSERT INTO auth.users (id, email)
VALUES
    ('11111111-1111-1111-1111-111111111111', 'owner@test.local'),
    ('22222222-2222-2222-2222-222222222222', 'manager@test.local'),
    ('33333333-3333-3333-3333-333333333333', 'staff@test.local'),
    ('44444444-4444-4444-4444-444444444444', 'other@test.local')
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- Setup: store A + its members + products + customers
-- (current JWT claim = owner user)
-- ------------------------------------------------------------

-- Store A
INSERT INTO public.stores (id, name, created_by)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Test Store A', '11111111-1111-1111-1111-111111111111');

-- Store members for store A
INSERT INTO public.store_members (id, store_id, user_id, role, is_active)
VALUES
    ('aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner',   true),
    ('aaaa2222-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'manager', true),
    ('aaaa3333-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'staff',   true);

-- Active product in store A
INSERT INTO public.products (id, store_id, product_code, original_title, brand, current_stock, created_by)
VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'ACT-001', 'Active Product', 'TestBrand', 100, '11111111-1111-1111-1111-111111111111');

-- Product to be soft-deleted AFTER order creation (for historical order test)
INSERT INTO public.products (id, store_id, product_code, original_title, brand, current_stock, created_by)
VALUES ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'HIST-001', 'Historical Product', 'TestBrand', 50, '11111111-1111-1111-1111-111111111111');

-- Another soft-deleted product (for product_id change failure test)
-- No order references it, so deleted_at can be set at creation.
INSERT INTO public.products (id, store_id, product_code, original_title, brand, current_stock, deleted_at, created_by)
VALUES ('d0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'DEL-002', 'Deleted Product 2', 'TestBrand', 30, now(), '11111111-1111-1111-1111-111111111111');

-- Active customer in store A
INSERT INTO public.customers (id, store_id, name, created_by)
VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Active Customer', '11111111-1111-1111-1111-111111111111');

-- Historical order linked to active product dddddddd (will be deleted later)
INSERT INTO public.orders (
    id, store_id, order_number, customer_id, product_id,
    customer_name_snapshot, product_title_snapshot, brand_snapshot,
    quantity, selling_price, status, order_date, created_by
) VALUES (
    '10101010-1010-1010-1010-101010101010',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'ORD-HIST-001',
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    'dddddddd-dddd-dddd-dddd-dddddddddddd',
    'Active Customer', 'Historical Product', 'TestBrand',
    1, 10000, 'COMPLETED', '2026-01-15',
    '11111111-1111-1111-1111-111111111111'
);

-- Soft-delete the product AFTER order creation
UPDATE public.products
SET deleted_at = now()
WHERE id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

-- ------------------------------------------------------------
-- Setup: store B + its owner + products + customers
-- Switch JWT claim to other owner for store B data
-- ------------------------------------------------------------

SELECT set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
SELECT set_config('request.jwt.claims',
    json_build_object(
        'sub', '44444444-4444-4444-4444-444444444444',
        'role', 'authenticated'
    )::text,
    true
);

-- Store B
INSERT INTO public.stores (id, name, created_by)
VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Test Store B', '44444444-4444-4444-4444-444444444444');

-- Store member for store B
INSERT INTO public.store_members (id, store_id, user_id, role, is_active)
VALUES ('bbbb1111-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '44444444-4444-4444-4444-444444444444', 'owner', true);

-- Active product in store B (for cross-store test)
INSERT INTO public.products (id, store_id, product_code, original_title, brand, current_stock, created_by)
VALUES ('55555555-5555-5555-5555-555555555555', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'STB-001', 'Store B Product', 'TestBrand', 80, '44444444-4444-4444-4444-444444444444');

-- Active customer in store B (for cross-store test)
INSERT INTO public.customers (id, store_id, name, created_by)
VALUES ('66666666-6666-6666-6666-666666666666', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Store B Customer', '44444444-4444-4444-4444-444444444444');

-- ------------------------------------------------------------
-- Setup: Clear JWT claims, keep admin role
-- ------------------------------------------------------------

SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);

-- ============================================================
-- T1: Owner can view their own store
-- ============================================================

SELECT public.set_request_user('11111111-1111-1111-1111-111111111111');

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

SELECT public.set_request_user('22222222-2222-2222-2222-222222222222');

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

SELECT public.set_request_user('33333333-3333-3333-3333-333333333333');

SELECT is(
    (SELECT count(*)::integer FROM public.products),
    0,
    'T4: Staff sees 0 products (base table blocked)'
);

-- ============================================================
-- T5: Manager cannot update store_members (RLS blocks = 0 rows)
-- ============================================================

SELECT public.set_request_user('22222222-2222-2222-2222-222222222222');

SELECT lives_ok(
    $$
    UPDATE public.store_members
    SET role = 'manager'
    WHERE id = 'aaaa3333-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    $$,
    'T5a: Manager store_members UPDATE completes (0 rows, RLS blocked)'
);

SELECT is(
    (SELECT role::text FROM public.store_members WHERE id = 'aaaa3333-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
    'staff',
    'T5b: Staff role unchanged after manager UPDATE attempt'
);

-- ============================================================
-- T6: Cross-store customer order creation fails (trigger P0001)
-- ============================================================

SELECT public.set_request_user('11111111-1111-1111-1111-111111111111');

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
    'P0001',
    'customer_id must be active and belong to the same store',
    'T6: Cross-store customer order creation fails with trigger error'
);

-- ============================================================
-- T7: Cross-store product order creation fails (trigger P0001)
-- ============================================================

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
    'P0001',
    'product_id must be active and belong to the same store',
    'T7: Cross-store product order creation fails with trigger error'
);

-- ============================================================
-- T8: Cross-store inventory_log creation fails (trigger P0001)
-- inventory_logs has no INSERT RLS for authenticated, so we test
-- the trigger logic directly in admin role.
-- ============================================================

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);

SELECT throws_ok(
    $$
    INSERT INTO public.inventory_logs (store_id, product_id, change_type, quantity_change)
    VALUES (
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        '55555555-5555-5555-5555-555555555555',
        'ADJUSTMENT',
        10
    );
    $$,
    'P0001',
    'product_id must be active and belong to the same store',
    'T8: Cross-store inventory_log product connection fails with trigger error'
);

-- Restore owner context
SELECT public.set_request_user('11111111-1111-1111-1111-111111111111');

-- ============================================================
-- T9: Soft-deleted product new order fails (trigger P0001)
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
    'P0001',
    'product_id must be active and belong to the same store',
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
    'P0001',
    'product_id must be active and belong to the same store',
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
-- T13: Last owner deactivation fails (trigger P0001)
-- ============================================================

SELECT throws_ok(
    $$
    UPDATE public.store_members
    SET is_active = false
    WHERE user_id = '11111111-1111-1111-1111-111111111111'
      AND store_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    $$,
    'P0001',
    'Cannot remove the last active owner of a store',
    'T13: Cannot deactivate last active owner'
);

-- ============================================================
-- T14: Last owner role change fails (trigger P0001)
-- ============================================================

SELECT throws_ok(
    $$
    UPDATE public.store_members
    SET role = 'manager'
    WHERE user_id = '11111111-1111-1111-1111-111111111111'
      AND store_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    $$,
    'P0001',
    'Cannot remove the last active owner of a store',
    'T14: Cannot change last owner role to manager'
);

-- ============================================================
-- T15: store_members user_id change fails (trigger P0001)
-- ============================================================

SELECT throws_ok(
    $$
    UPDATE public.store_members
    SET user_id = '22222222-2222-2222-2222-222222222222'
    WHERE id = 'aaaa3333-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    $$,
    'P0001',
    'Changing user_id is not allowed. Deactivate existing membership and create a new one instead.',
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

-- ============================================================
-- T18: migration_runs initiated_by matches auth.uid()
-- ============================================================

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
-- T20: migration_runs version incremented
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
-- T22: Physical DELETE fails (permission denied / no policy)
-- ============================================================

SELECT throws_ok(
    $$
    DELETE FROM public.products WHERE product_code = 'MGR-TEST-1';
    $$,
    'T22: Physical DELETE is blocked (permission or policy)'
);

-- ============================================================
-- T23: Owner can view soft-deleted products
-- ============================================================

SELECT is(
    (SELECT count(*)::integer FROM public.products WHERE deleted_at IS NOT NULL),
    2,
    'T23: Owner can view soft-deleted products (HIST-001, DEL-002)'
);

-- ============================================================
-- T24: Manager cannot view soft-deleted products
-- ============================================================

SELECT public.set_request_user('22222222-2222-2222-2222-222222222222');

SELECT is(
    (SELECT count(*)::integer FROM public.products WHERE deleted_at IS NOT NULL),
    0,
    'T24: Manager cannot view soft-deleted products'
);

-- ============================================================
-- Cleanup: reset role, clear JWT claims, drop helper
-- ============================================================

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);

DROP FUNCTION IF EXISTS public.set_request_user(uuid);

-- ============================================================
-- Finish
-- ============================================================

SELECT finish();

ROLLBACK;
