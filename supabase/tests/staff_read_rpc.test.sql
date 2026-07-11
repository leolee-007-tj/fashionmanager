-- ============================================================
-- pgTAP: Staff Read RPC Test
-- ============================================================
--
-- PURPOSE:
--   Verify restricted staff read RPCs for products, customers, orders.
--
-- COVERS:
--   - list_staff_products
--   - list_staff_customers
--   - list_staff_orders
--   - Permission checks (anon, non-member, inactive staff)
--   - Sensitive field exclusion
--   - Soft-delete filtering
--   - Cross-store filtering
--   - Pagination validation
--   - Base table access still blocked
--   - Staff write operations still blocked
--
-- ASSERTIONS: 32
--
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(32);

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
-- Setup (admin role)
-- ------------------------------------------------------------

SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims',
    json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

-- auth.users
INSERT INTO auth.users (id, email) VALUES
    ('11111111-1111-1111-1111-111111111111', 'owner@test.local'),
    ('22222222-2222-2222-2222-222222222222', 'manager@test.local'),
    ('33333333-3333-3333-3333-333333333333', 'staff@test.local'),
    ('44444444-4444-4444-4444-444444444444', 'inactive-staff@test.local'),
    ('99999999-9999-9999-9999-999999999999', 'other@test.local');

-- Stores
INSERT INTO public.stores (id, name, created_by) VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Store A', '11111111-1111-1111-1111-111111111111'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Store B', '99999999-9999-9999-9999-999999999999');

-- Store A members
INSERT INTO public.store_members (id, store_id, user_id, role, is_active, invited_by) VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner', true, '11111111-1111-1111-1111-111111111111'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'manager', true, '11111111-1111-1111-1111-111111111111'),
    ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'staff', true, '11111111-1111-1111-1111-111111111111'),
    ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', 'staff', false, '11111111-1111-1111-1111-111111111111');

-- Store B members
INSERT INTO public.store_members (id, store_id, user_id, role, is_active, invited_by) VALUES
    ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '99999999-9999-9999-9999-999999999999', 'owner', true, '99999999-9999-9999-9999-999999999999');

-- Products - Store A
INSERT INTO public.products (id, store_id, product_code, original_title, brand, category, color, size, current_stock, reserved_stock, actual_converted_cost, china_base_price, korea_cost, created_by) VALUES
    ('10000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'PRD-A01', 'T-Shirt Red', 'BrandA', 'top', 'red', 'M', 50, 2, 30000, 15000, 80000, '11111111-1111-1111-1111-111111111111'),
    ('10000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'PRD-A02', 'Pants Blue', 'BrandB', 'bottom', 'blue', 'L', 30, 0, 25000, 12000, 60000, '11111111-1111-1111-1111-111111111111');

-- Deleted product - Store A
INSERT INTO public.products (id, store_id, product_code, original_title, brand, category, color, size, current_stock, reserved_stock, actual_converted_cost, china_base_price, korea_cost, created_by, deleted_at) VALUES
    ('10000000-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'PRD-DEL', 'Deleted Product', 'BrandC', 'acc', 'black', 'One', 10, 0, 5000, 2000, 10000, '11111111-1111-1111-1111-111111111111', now());

-- Product - Store B
INSERT INTO public.products (id, store_id, product_code, original_title, brand, category, color, size, current_stock, reserved_stock, actual_converted_cost, china_base_price, korea_cost, created_by) VALUES
    ('20000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'PRD-B01', 'B Store Item', 'BrandX', 'acc', 'green', 'One', 10, 0, 10000, 5000, 20000, '99999999-9999-9999-9999-999999999999');

-- Customers - Store A
INSERT INTO public.customers (id, store_id, name, wechat_nickname, phone, total_amount, total_profit, order_count, created_by) VALUES
    ('30000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Alice', 'alice_wx', '01012345678', 100000, 30000, 2, '11111111-1111-1111-1111-111111111111'),
    ('30000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Bob', 'bob_wx', '01098765432', 50000, 10000, 1, '11111111-1111-1111-1111-111111111111');

-- Deleted customer - Store A
INSERT INTO public.customers (id, store_id, name, wechat_nickname, phone, total_amount, total_profit, order_count, created_by, deleted_at) VALUES
    ('30000000-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Charlie', 'charlie_wx', '01011112222', 20000, 5000, 1, '11111111-1111-1111-1111-111111111111', now());

-- Customer - Store B
INSERT INTO public.customers (id, store_id, name, wechat_nickname, phone, created_by) VALUES
    ('40000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Dave', 'dave_wx', '01033334444', '99999999-9999-9999-9999-999999999999');

-- Orders - Store A (active)
INSERT INTO public.orders (id, store_id, order_number, customer_id, product_id, customer_name_snapshot, product_title_snapshot, brand_snapshot, category_snapshot, color_snapshot, size_snapshot, quantity, selling_price, actual_converted_cost_at_sale, actual_profit, actual_profit_margin, actual_cost_ratio, status, order_date, shipping_company, tracking_number, created_by) VALUES
    ('50000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'ORD-0001', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Alice', 'T-Shirt Red', 'BrandA', 'top', 'red', 'M', 2, 100000, 30000, 140000, 70, 30, 'SHIPPED', '2026-07-01', 'KoreaPost', 'TRK123456', '11111111-1111-1111-1111-111111111111');

-- Deleted order - Store A
INSERT INTO public.orders (id, store_id, order_number, customer_id, product_id, customer_name_snapshot, product_title_snapshot, brand_snapshot, category_snapshot, color_snapshot, size_snapshot, quantity, selling_price, actual_converted_cost_at_sale, actual_profit, actual_profit_margin, actual_cost_ratio, status, order_date, created_by, deleted_at) VALUES
    ('50000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'ORD-DEL', '30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'Bob', 'Pants Blue', 'BrandB', 'bottom', 'blue', 'L', 1, 50000, 25000, 25000, 50, 50, 'COMPLETED', '2026-07-02', '11111111-1111-1111-1111-111111111111', now());

-- Order - Store B
INSERT INTO public.orders (id, store_id, order_number, customer_id, product_id, customer_name_snapshot, product_title_snapshot, brand_snapshot, category_snapshot, color_snapshot, size_snapshot, quantity, selling_price, status, order_date, created_by) VALUES
    ('60000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'ORD-B01', '40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Dave', 'B Store Item', 'BrandX', 'acc', 'green', 'One', 1, 20000, 'PENDING', '2026-07-03', '99999999-9999-9999-9999-999999999999');

-- Clear JWT claims, keep admin role
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);

-- ============================================================
-- T1: anon list_staff_products blocked
-- ============================================================

SET LOCAL ROLE anon;

SELECT throws_ok(
    $$ SELECT public.list_staff_products('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') $$,
    '42501',
    NULL,
    'T1: anon list_staff_products blocked (42501)'
);

RESET ROLE;

-- ============================================================
-- T2: Non-member user list_staff_products blocked
-- ============================================================

SELECT public.set_request_user('99999999-9999-9999-9999-999999999999');

SELECT throws_ok(
    $$ SELECT public.list_staff_products('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') $$,
    '42501',
    'Insufficient permissions',
    'T2: Non-member list_staff_products blocked (42501)'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);

-- ============================================================
-- T3: Inactive staff list_staff_products blocked
-- ============================================================

SELECT public.set_request_user('44444444-4444-4444-4444-444444444444');

SELECT throws_ok(
    $$ SELECT public.list_staff_products('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') $$,
    '42501',
    'Insufficient permissions',
    'T3: Inactive staff list_staff_products blocked (42501)'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);

-- ============================================================
-- T4: Active staff sees 2 active products in own store
-- ============================================================

SELECT public.set_request_user('33333333-3333-3333-3333-333333333333');

SELECT is(
    (SELECT count(*)::integer FROM public.list_staff_products('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')),
    2,
    'T4: Active staff sees 2 active products in own store'
);

-- ============================================================
-- T5: Deleted product excluded from list
-- ============================================================

SELECT is(
    (
        SELECT count(*)::integer
        FROM public.list_staff_products('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
        WHERE id = '10000000-0000-0000-0000-000000000003'
    ),
    0,
    'T5: Deleted product excluded from staff product list'
);

-- ============================================================
-- T6: Cross-store product excluded
-- ============================================================

SELECT is(
    (
        SELECT count(*)::integer
        FROM public.list_staff_products('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
        WHERE id = '20000000-0000-0000-0000-000000000001'
    ),
    0,
    'T6: Cross-store product excluded from staff product list'
);

-- ============================================================
-- T7: Product payload excludes korea_cost
-- ============================================================

SELECT is(
    (
        SELECT to_jsonb(p) ? 'korea_cost'
        FROM public.list_staff_products('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') p
        LIMIT 1
    ),
    false,
    'T7: Product payload excludes korea_cost'
);

-- ============================================================
-- T8: Product payload excludes actual_converted_cost
-- ============================================================

SELECT is(
    (
        SELECT to_jsonb(p) ? 'actual_converted_cost'
        FROM public.list_staff_products('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') p
        LIMIT 1
    ),
    false,
    'T8: Product payload excludes actual_converted_cost'
);

-- ============================================================
-- T9: Product payload excludes china_base_price
-- ============================================================

SELECT is(
    (
        SELECT to_jsonb(p) ? 'china_base_price'
        FROM public.list_staff_products('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') p
        LIMIT 1
    ),
    false,
    'T9: Product payload excludes china_base_price'
);

-- ============================================================
-- T10: Product search filter works
-- ============================================================

SELECT is(
    (
        SELECT count(*)::integer
        FROM public.list_staff_products('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'T-Shirt')
    ),
    1,
    'T10: Product search filter works (T-Shirt matches 1 product)'
);

-- ============================================================
-- T11: Active staff sees 2 active customers in own store
-- ============================================================

SELECT is(
    (SELECT count(*)::integer FROM public.list_staff_customers('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')),
    2,
    'T11: Active staff sees 2 active customers in own store'
);

-- ============================================================
-- T12: Deleted customer excluded from list
-- ============================================================

SELECT is(
    (
        SELECT count(*)::integer
        FROM public.list_staff_customers('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
        WHERE id = '30000000-0000-0000-0000-000000000003'
    ),
    0,
    'T12: Deleted customer excluded from staff customer list'
);

-- ============================================================
-- T13: Cross-store customer excluded
-- ============================================================

SELECT is(
    (
        SELECT count(*)::integer
        FROM public.list_staff_customers('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
        WHERE id = '40000000-0000-0000-0000-000000000001'
    ),
    0,
    'T13: Cross-store customer excluded from staff customer list'
);

-- ============================================================
-- T14: Customer payload includes safe fields
-- ============================================================

SELECT is(
    (
        SELECT to_jsonb(c) ?& array['name', 'wechat_nickname', 'phone', 'address']
        FROM public.list_staff_customers('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') c
        LIMIT 1
    ),
    true,
    'T14: Customer payload includes name/wechat_nickname/phone/address'
);

-- ============================================================
-- T15: Customer payload excludes total_amount
-- ============================================================

SELECT is(
    (
        SELECT to_jsonb(c) ? 'total_amount'
        FROM public.list_staff_customers('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') c
        LIMIT 1
    ),
    false,
    'T15: Customer payload excludes total_amount'
);

-- ============================================================
-- T16: Customer payload excludes total_profit
-- ============================================================

SELECT is(
    (
        SELECT to_jsonb(c) ? 'total_profit'
        FROM public.list_staff_customers('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') c
        LIMIT 1
    ),
    false,
    'T16: Customer payload excludes total_profit'
);

-- ============================================================
-- T17: Customer payload excludes order_count
-- ============================================================

SELECT is(
    (
        SELECT to_jsonb(c) ? 'order_count'
        FROM public.list_staff_customers('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') c
        LIMIT 1
    ),
    false,
    'T17: Customer payload excludes order_count'
);

-- ============================================================
-- T18: Active staff sees 1 active order in own store
-- ============================================================

SELECT is(
    (SELECT count(*)::integer FROM public.list_staff_orders('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')),
    1,
    'T18: Active staff sees 1 active order in own store'
);

-- ============================================================
-- T19: Deleted order excluded from list
-- ============================================================

SELECT is(
    (
        SELECT count(*)::integer
        FROM public.list_staff_orders('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
        WHERE id = '50000000-0000-0000-0000-000000000002'
    ),
    0,
    'T19: Deleted order excluded from staff order list'
);

-- ============================================================
-- T20: Cross-store order excluded
-- ============================================================

SELECT is(
    (
        SELECT count(*)::integer
        FROM public.list_staff_orders('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
        WHERE id = '60000000-0000-0000-0000-000000000001'
    ),
    0,
    'T20: Cross-store order excluded from staff order list'
);

-- ============================================================
-- T21: Order payload includes safe fields
-- ============================================================

SELECT is(
    (
        SELECT to_jsonb(o) ?& array['selling_price', 'status', 'shipping_company', 'tracking_number']
        FROM public.list_staff_orders('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') o
        LIMIT 1
    ),
    true,
    'T21: Order payload includes selling_price/status/shipping_company/tracking_number'
);

-- ============================================================
-- T22: Order payload excludes actual_converted_cost_at_sale
-- ============================================================

SELECT is(
    (
        SELECT to_jsonb(o) ? 'actual_converted_cost_at_sale'
        FROM public.list_staff_orders('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') o
        LIMIT 1
    ),
    false,
    'T22: Order payload excludes actual_converted_cost_at_sale'
);

-- ============================================================
-- T23: Order payload excludes actual_profit
-- ============================================================

SELECT is(
    (
        SELECT to_jsonb(o) ? 'actual_profit'
        FROM public.list_staff_orders('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') o
        LIMIT 1
    ),
    false,
    'T23: Order payload excludes actual_profit'
);

-- ============================================================
-- T24: Order payload excludes actual_profit_margin and actual_cost_ratio
-- ============================================================

SELECT is(
    (
        SELECT to_jsonb(o) ?| array['actual_profit_margin', 'actual_cost_ratio']
        FROM public.list_staff_orders('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') o
        LIMIT 1
    ),
    false,
    'T24: Order payload excludes actual_profit_margin and actual_cost_ratio'
);

-- ============================================================
-- T25: Owner can call restricted product RPC
-- ============================================================

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);

SELECT public.set_request_user('11111111-1111-1111-1111-111111111111');

SELECT lives_ok(
    $$ SELECT public.list_staff_products('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') $$,
    'T25: Owner can call list_staff_products RPC'
);

-- ============================================================
-- T26: Manager can call restricted customer RPC
-- ============================================================

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);

SELECT public.set_request_user('22222222-2222-2222-2222-222222222222');

SELECT lives_ok(
    $$ SELECT public.list_staff_customers('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') $$,
    'T26: Manager can call list_staff_customers RPC'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);

-- Switch to staff role for T27-T32
SELECT public.set_request_user('33333333-3333-3333-3333-333333333333');

-- ============================================================
-- T27: p_limit = 0 blocked (22023)
-- ============================================================

SELECT throws_ok(
    $$ SELECT public.list_staff_products('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', NULL, 0, 0) $$,
    '22023',
    'p_limit must be between 1 and 200',
    'T27: p_limit = 0 blocked (22023)'
);

-- ============================================================
-- T28: p_offset = -1 blocked (22023)
-- ============================================================

SELECT throws_ok(
    $$ SELECT public.list_staff_products('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', NULL, 10, -1) $$,
    '22023',
    'p_offset must be >= 0',
    'T28: p_offset = -1 blocked (22023)'
);

-- ============================================================
-- T29: Staff products base table still 0 rows
-- ============================================================

SELECT is(
    (SELECT count(*)::integer FROM public.products WHERE store_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
    0,
    'T29: Staff products base table still returns 0 rows (RLS intact)'
);

-- ============================================================
-- T30: Staff customers base table still 0 rows
-- ============================================================

SELECT is(
    (SELECT count(*)::integer FROM public.customers WHERE store_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
    0,
    'T30: Staff customers base table still returns 0 rows (RLS intact)'
);

-- ============================================================
-- T31: Staff orders base table still 0 rows
-- ============================================================

SELECT is(
    (SELECT count(*)::integer FROM public.orders WHERE store_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
    0,
    'T31: Staff orders base table still returns 0 rows (RLS intact)'
);

-- ============================================================
-- T32: Staff create_order blocked (42501)
-- ============================================================

SELECT throws_ok(
    $$
    SELECT public.create_order(
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        '30000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000001',
        1, 10000, '2026-07-10'
    )
    $$,
    '42501',
    'Insufficient permissions: owner or manager role required',
    'T32: Staff create_order blocked (42501)'
);

-- ============================================================
-- Cleanup
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
