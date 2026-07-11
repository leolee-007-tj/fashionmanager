-- ============================================================
-- pgTAP: Order and Inventory RPC Test
-- ============================================================
--
-- PURPOSE:
--   Verify protected order lifecycle and inventory transaction RPCs.
--
-- COVERS:
--   - create_order
--   - update_pending_order
--   - ship_order
--   - cancel_order
--   - complete_order
--   - Direct DML restrictions
--   - Inventory log generation
--   - Customer aggregate recalculation
--
-- ASSERTIONS: 35
--
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(35);

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
    ('33333333-3333-3333-3333-333333333333', 'staff@test.local');

-- Store
INSERT INTO public.stores (id, name, created_by)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Test Store A', '11111111-1111-1111-1111-111111111111');

-- Members
INSERT INTO public.store_members (id, store_id, user_id, role, is_active, invited_by) VALUES
    ('aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner', true, '11111111-1111-1111-1111-111111111111'),
    ('aaaa2222-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'manager', true, '11111111-1111-1111-1111-111111111111'),
    ('aaaa3333-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'staff', true, '11111111-1111-1111-1111-111111111111');

-- Products
INSERT INTO public.products (id, store_id, product_code, original_title, brand, category, color, size, current_stock, reserved_stock, actual_converted_cost, china_base_price, created_by) VALUES
    ('pppppppp-pppp-pppp-pppp-pppppppppppp', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'PRD-001', 'Test Product A', 'BrandA', 'top', 'red', 'M', 50, 0, 30000, 15000, '11111111-1111-1111-1111-111111111111'),
    ('qqqqqqqq-qqqq-qqqq-qqqq-qqqqqqqqqqqq', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'PRD-002', 'Test Product B', 'BrandB', 'bottom', 'blue', 'L', 30, 0, 25000, 12000, '11111111-1111-1111-1111-111111111111'),
    ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'PRD-DEL', 'Deleted Product', 'BrandC', 'acc', 'black', 'One', 10, 0, 5000, 2000, '11111111-1111-1111-1111-111111111111');

UPDATE public.products SET deleted_at = now() WHERE id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

-- Customer
INSERT INTO public.customers (id, store_id, name, created_by)
VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Test Customer', '11111111-1111-1111-1111-111111111111');

-- Clear JWT claims, keep admin role
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);

-- ============================================================
-- T1: anon create_order blocked
-- ============================================================

SET LOCAL ROLE anon;
SELECT throws_ok(
    $$ SELECT public.create_order(
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'cccccccc-cccc-cccc-cccc-cccccccccccc',
        'pppppppp-pppp-pppp-pppp-pppppppppppp',
        2, 100000, current_date
    ) $$,
    '42501',
    NULL,
    'T1: anon create_order blocked'
);
RESET ROLE;

-- ============================================================
-- T2: staff create_order blocked
-- ============================================================

SELECT public.set_request_user('33333333-3333-3333-3333-333333333333');

SELECT throws_ok(
    $$ SELECT public.create_order(
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'cccccccc-cccc-cccc-cccc-cccccccccccc',
        'pppppppp-pppp-pppp-pppp-pppppppppppp',
        2, 100000, current_date
    ) $$,
    '42501',
    'Insufficient permissions: owner or manager role required',
    'T2: staff create_order blocked'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);

-- ============================================================
-- T3: manager create_order succeeds
-- ============================================================

SELECT public.set_request_user('22222222-2222-2222-2222-222222222222');

SELECT lives_ok(
    $$ SELECT public.create_order(
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'cccccccc-cccc-cccc-cccc-cccccccccccc',
        'pppppppp-pppp-pppp-pppp-pppppppppppp',
        2, 100000, '2026-07-01'
    ) $$,
    'T3: manager create_order succeeds'
);

-- ============================================================
-- T4: Order created with PENDING status
-- ============================================================

SELECT is(
    (SELECT status::text FROM public.orders WHERE customer_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' ORDER BY created_at DESC LIMIT 1),
    'PENDING',
    'T4: New order has PENDING status'
);

-- ============================================================
-- T5: Order snapshot fields populated from product/customer
-- ============================================================

SELECT is(
    (SELECT customer_name_snapshot FROM public.orders WHERE store_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' ORDER BY created_at DESC LIMIT 1),
    'Test Customer',
    'T5: Order customer_name_snapshot matches customer name'
);

-- ============================================================
-- T6: reserved_stock increased after order creation
-- ============================================================

SELECT is(
    (SELECT reserved_stock FROM public.products WHERE id = 'pppppppp-pppp-pppp-pppp-pppppppppppp'),
    2,
    'T6: reserved_stock increased by order quantity'
);

-- ============================================================
-- T7: current_stock unchanged after order creation
-- ============================================================

SELECT is(
    (SELECT current_stock FROM public.products WHERE id = 'pppppppp-pppp-pppp-pppp-pppppppppppp'),
    50,
    'T7: current_stock unchanged after order creation'
);

-- ============================================================
-- T8: RESERVE inventory log created
-- ============================================================

SELECT is(
    (SELECT count(*)::integer FROM public.inventory_logs
     WHERE product_id = 'pppppppp-pppp-pppp-pppp-pppppppppppp'
       AND change_type = 'RESERVE'),
    1,
    'T8: RESERVE inventory log created'
);

-- ============================================================
-- T9: Insufficient stock order fails (22023)
-- ============================================================

SELECT throws_ok(
    $$ SELECT public.create_order(
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'cccccccc-cccc-cccc-cccc-cccccccccccc',
        'qqqqqqqq-qqqq-qqqq-qqqq-qqqqqqqqqqqq',
        100, 50000, '2026-07-02'
    ) $$,
    '22023',
    NULL,
    'T9: Insufficient stock order fails with 22023'
);

-- ============================================================
-- T10: Cross-store customer order blocked
-- ============================================================

-- We use the same product and a non-existent customer_id to test
SELECT throws_ok(
    $$ SELECT public.create_order(
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'ffffffff-ffff-ffff-ffff-ffffffffffff',
        'pppppppp-pppp-pppp-pppp-pppppppppppp',
        1, 10000, '2026-07-02'
    ) $$,
    '22023',
    'Customer not found or is deleted in this store',
    'T10: Cross-store / non-existent customer order blocked'
);

-- ============================================================
-- T11: Deleted product order blocked
-- ============================================================

SELECT throws_ok(
    $$ SELECT public.create_order(
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'cccccccc-cccc-cccc-cccc-cccccccccccc',
        'dddddddd-dddd-dddd-dddd-dddddddddddd',
        1, 10000, '2026-07-02'
    ) $$,
    '22023',
    'Product not found or is deleted in this store',
    'T11: Deleted product order blocked'
);

-- ============================================================
-- T12: Direct orders INSERT blocked (42501)
-- ============================================================

SELECT throws_ok(
    $$
    INSERT INTO public.orders (store_id, order_number, customer_id, product_id, quantity, selling_price)
    VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'DIR-001',
            'cccccccc-cccc-cccc-cccc-cccccccccccc',
            'pppppppp-pppp-pppp-pppp-pppppppppppp', 1, 10000);
    $$,
    '42501',
    NULL,
    'T12: Direct orders INSERT blocked by permission'
);

-- ============================================================
-- T13: Direct orders UPDATE blocked (42501)
-- ============================================================

SELECT throws_ok(
    $$
    UPDATE public.orders SET selling_price = 9999
    WHERE customer_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    $$,
    '42501',
    NULL,
    'T13: Direct orders UPDATE blocked by permission'
);

-- ============================================================
-- T14: Direct current_stock UPDATE blocked (42501)
-- ============================================================

SELECT throws_ok(
    $$
    UPDATE public.products SET current_stock = 999
    WHERE id = 'pppppppp-pppp-pppp-pppp-pppppppppppp';
    $$,
    '42501',
    NULL,
    'T14: Direct current_stock UPDATE blocked (column-level grant)'
);

-- ============================================================
-- T15: Direct customer aggregate UPDATE blocked (42501)
-- ============================================================

SELECT throws_ok(
    $$
    UPDATE public.customers SET total_amount = 999999
    WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    $$,
    '42501',
    NULL,
    'T15: Direct customer total_amount UPDATE blocked (column-level grant)'
);

-- ============================================================
-- T16: Pending order quantity increase reserves more stock
-- ============================================================

-- Get the order id first
CREATE TEMP TABLE _test_order AS
SELECT id FROM public.orders
WHERE customer_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
ORDER BY created_at DESC LIMIT 1;

SELECT lives_ok(
    $$
    SELECT public.update_pending_order(
        (SELECT id FROM _test_order),
        'cccccccc-cccc-cccc-cccc-cccccccccccc',
        'pppppppp-pppp-pppp-pppp-pppppppppppp',
        5, 120000, '2026-07-01'
    )
    $$,
    'T16: Pending order quantity increase succeeds'
);

SELECT is(
    (SELECT reserved_stock FROM public.products WHERE id = 'pppppppp-pppp-pppp-pppp-pppppppppppp'),
    5,
    'T16b: reserved_stock increased after quantity increase (2 -> 5)'
);

-- ============================================================
-- T17: Pending order quantity decrease releases stock
-- ============================================================

SELECT lives_ok(
    $$
    SELECT public.update_pending_order(
        (SELECT id FROM _test_order),
        'cccccccc-cccc-cccc-cccc-cccccccccccc',
        'pppppppp-pppp-pppp-pppp-pppppppppppp',
        2, 100000, '2026-07-01'
    )
    $$,
    'T17: Pending order quantity decrease succeeds'
);

SELECT is(
    (SELECT reserved_stock FROM public.products WHERE id = 'pppppppp-pppp-pppp-pppp-pppppppppppp'),
    2,
    'T17b: reserved_stock decreased after quantity decrease (5 -> 2)'
);

-- ============================================================
-- T18: Pending order product change releases old, reserves new
-- ============================================================

SELECT lives_ok(
    $$
    SELECT public.update_pending_order(
        (SELECT id FROM _test_order),
        'cccccccc-cccc-cccc-cccc-cccccccccccc',
        'qqqqqqqq-qqqq-qqqq-qqqq-qqqqqqqqqqqq',
        3, 80000, '2026-07-01'
    )
    $$,
    'T18: Pending order product change succeeds'
);

SELECT is(
    (SELECT reserved_stock FROM public.products WHERE id = 'pppppppp-pppp-pppp-pppp-pppppppppppp'),
    0,
    'T18b: Old product reserved_stock released (2 -> 0)'
);

SELECT is(
    (SELECT reserved_stock FROM public.products WHERE id = 'qqqqqqqq-qqqq-qqqq-qqqq-qqqqqqqqqqqq'),
    3,
    'T18c: New product reserved_stock increased (0 -> 3)'
);

-- ============================================================
-- T19: Ship order succeeds
-- ============================================================

-- Restore to product A for ship test
SELECT public.update_pending_order(
    (SELECT id FROM _test_order),
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'pppppppp-pppp-pppp-pppp-pppppppppppp',
    2, 100000, '2026-07-01'
);

SELECT lives_ok(
    $$
    SELECT public.ship_order(
        (SELECT id FROM _test_order),
        '2026-07-05',
        'KoreaPost',
        'TRK123456789'
    )
    $$,
    'T19: Ship order succeeds'
);

-- ============================================================
-- T20: current_stock decreased after shipment
-- ============================================================

SELECT is(
    (SELECT current_stock FROM public.products WHERE id = 'pppppppp-pppp-pppp-pppp-pppppppppppp'),
    48,
    'T20: current_stock decreased after shipment (50 -> 48)'
);

-- ============================================================
-- T21: reserved_stock decreased after shipment
-- ============================================================

SELECT is(
    (SELECT reserved_stock FROM public.products WHERE id = 'pppppppp-pppp-pppp-pppp-pppppppppppp'),
    0,
    'T21: reserved_stock decreased after shipment (2 -> 0)'
);

-- ============================================================
-- T22: SHIP inventory log created
-- ============================================================

SELECT is(
    (SELECT count(*)::integer FROM public.inventory_logs
     WHERE product_id = 'pppppppp-pppp-pppp-pppp-pppppppppppp'
       AND change_type = 'SHIP'),
    1,
    'T22: SHIP inventory log created'
);

-- ============================================================
-- T23: Profit calculated from sale-time cost snapshot
-- ============================================================

SELECT is(
    (SELECT round(actual_profit)::integer FROM public.orders WHERE id = (SELECT id FROM _test_order)),
    140000,
    'T23: actual_profit = revenue - cost = 200000 - 60000 = 140000'
);

-- ============================================================
-- T24: Customer aggregates updated after shipment
-- ============================================================

SELECT is(
    (SELECT total_amount::integer FROM public.customers WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
    200000,
    'T24: Customer total_amount updated after shipment (100000 * 2)'
);

-- ============================================================
-- T25: Duplicate ship blocked
-- ============================================================

SELECT throws_ok(
    $$ SELECT public.ship_order((SELECT id FROM _test_order)) $$,
    '22023',
    NULL,
    'T25: Duplicate ship blocked (already SHIPPED)'
);

-- ============================================================
-- T26: Cancel pending order succeeds and releases reservation
-- ============================================================

-- Create a new pending order first
SELECT public.create_order(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'qqqqqqqq-qqqq-qqqq-qqqq-qqqqqqqqqqqq',
    1, 50000, '2026-07-10'
);

CREATE TEMP TABLE _cancel_order AS
SELECT id FROM public.orders ORDER BY created_at DESC LIMIT 1;

SELECT lives_ok(
    $$ SELECT public.cancel_order((SELECT id FROM _cancel_order)) $$,
    'T26: Cancel pending order succeeds'
);

-- ============================================================
-- T27: Reservation released after cancel
-- ============================================================

SELECT is(
    (SELECT reserved_stock FROM public.products WHERE id = 'qqqqqqqq-qqqq-qqqq-qqqq-qqqqqqqqqqqq'),
    0,
    'T27: reserved_stock released after cancel (was 1, now 0)'
);

-- ============================================================
-- T28: RELEASE log created on cancel
-- ============================================================

SELECT is(
    (SELECT count(*)::integer FROM public.inventory_logs
     WHERE product_id = 'qqqqqqqq-qqqq-qqqq-qqqq-qqqqqqqqqqqq'
       AND change_type = 'RELEASE'),
    1,
    'T28: RELEASE inventory log created on cancel'
);

-- ============================================================
-- T29: Cancelling shipped order fails
-- ============================================================

SELECT throws_ok(
    $$ SELECT public.cancel_order((SELECT id FROM _test_order)) $$,
    '22023',
    NULL,
    'T29: Cancelling shipped order fails'
);

-- ============================================================
-- T30: Complete shipped order succeeds
-- ============================================================

SELECT lives_ok(
    $$ SELECT public.complete_order((SELECT id FROM _test_order)) $$,
    'T30: Complete shipped order succeeds'
);

-- ============================================================
-- T31: Duplicate complete blocked
-- ============================================================

SELECT throws_ok(
    $$ SELECT public.complete_order((SELECT id FROM _test_order)) $$,
    '22023',
    NULL,
    'T31: Duplicate complete blocked (already COMPLETED)'
);

-- ============================================================
-- T32: Invalid state transition blocked (COMPLETED -> SHIPPED not possible via RPC)
-- ============================================================

-- Test: trying to cancel a completed order (should fail because status != PENDING)
SELECT throws_ok(
    $$ SELECT public.cancel_order((SELECT id FROM _test_order)) $$,
    '22023',
    'Can only cancel PENDING orders (current status: COMPLETED)',
    'T32: Invalid state transition blocked (COMPLETED cancel fails)'
);

-- ============================================================
-- T33: inventory_logs direct INSERT blocked
-- ============================================================

SELECT throws_ok(
    $$
    INSERT INTO public.inventory_logs (store_id, product_id, change_type, quantity_change, stock_before, stock_after, reserved_before, reserved_after)
    VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            'pppppppp-pppp-pppp-pppp-pppppppppppp',
            'ADJUSTMENT', 5, 48, 53, 0, 0);
    $$,
    '42501',
    NULL,
    'T33: Direct inventory_logs INSERT blocked'
);

-- ============================================================
-- T34: Cross-store order access blocked
-- ============================================================

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);

-- Store B setup in admin
SELECT set_config('request.jwt.claim.sub', '99999999-9999-9999-9999-999999999999', true);
SELECT set_config('request.jwt.claims',
    json_build_object('sub', '99999999-9999-9999-9999-999999999999', 'role', 'authenticated')::text, true);

INSERT INTO auth.users (id, email) VALUES ('99999999-9999-9999-9999-999999999999', 'other@test.local');
INSERT INTO public.stores (id, name, created_by) VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Store B', '99999999-9999-9999-9999-999999999999');
INSERT INTO public.store_members (id, store_id, user_id, role, is_active, invited_by)
VALUES ('bbbb9999-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '99999999-9999-9999-9999-999999999999', 'owner', true, '99999999-9999-9999-9999-999999999999');

SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);

-- Switch to Store B owner, try to access Store A's order
SELECT public.set_request_user('99999999-9999-9999-9999-999999999999');

SELECT is(
    (SELECT count(*)::integer FROM public.orders
     WHERE id = (SELECT id FROM _test_order)),
    0,
    'T34: Cross-store owner cannot see other stores orders (RLS)'
);

-- ============================================================
-- T35: Order status is COMPLETED (final state check)
-- ============================================================

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);

SELECT public.set_request_user('11111111-1111-1111-1111-111111111111');

SELECT is(
    (SELECT status::text FROM public.orders WHERE id = (SELECT id FROM _test_order)),
    'COMPLETED',
    'T35: Final order status is COMPLETED'
);

-- ============================================================
-- Cleanup
-- ============================================================

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);

DROP FUNCTION IF EXISTS public.set_request_user(uuid);
DROP TABLE IF EXISTS _test_order;
DROP TABLE IF EXISTS _cancel_order;

-- ============================================================
-- Finish
-- ============================================================

SELECT finish();

ROLLBACK;
