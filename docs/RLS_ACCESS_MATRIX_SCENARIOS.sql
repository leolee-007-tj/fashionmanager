-- ============================================================
-- RLS Access Matrix Test Scenarios (REFERENCE ONLY)
-- ============================================================
--
-- PURPOSE:
--   Reference document describing 30 RLS test scenarios.
--   This file is NOT automatically executed by `supabase test db`.
--
-- LOCATION: docs/ — reference document, not a runnable test
--
-- ACTUAL AUTOMATED TEST:
--   supabase/tests/rls_access_matrix.test.sql
--   (pgTAP format, runs with: supabase test db --local)
--
-- STATUS:
--   - Scenarios in this file: NOT EXECUTED as-is (reference only)
--   - Automated pgTAP tests: 25/25 PASS (local, 2026-07-11)
--
-- WARNING:
--   - Do NOT run this file in production.
--   - Run only in a dedicated TEST Supabase project.
--   - Use dummy/test data only.
-- ============================================================

-- ============================================================
-- Automated test execution
-- ============================================================
--
-- Run the actual pgTAP test file:
--   supabase test db --local
--
-- Test file:
--   supabase/tests/rls_access_matrix.test.sql
--
-- Results (2026-07-11, local):
--   Files=1, Tests=25, All tests successful, Result: PASS
--
-- ============================================================
-- Manual / integration test approaches
-- ============================================================
--
-- Option A: Supabase JS Client (reliable auth testing)
-- 1. Create test users via Supabase Auth Admin API.
-- 2. Use the JS client with the test user's JWT.
-- 3. Execute supabase.from('table').select() / .insert() / .update().
-- 4. Check error.code and error.message.
--
-- Option B: curl / Postman
-- 1. Get JWT token via Auth API.
-- 2. Send REST request with Authorization Bearer <token>.
-- 3. Check response status and body.
--
-- Option C: SQL Editor (least reliable)
-- ⚠️ SQL Editor typically runs with elevated role (postgres/supabase_admin),
--    which can bypass RLS. Use only for DDL, not RLS verification.
-- 1. SET LOCAL ROLE authenticated;
-- 2. Use request.jwt.claim.sub for auth.uid() simulation.
-- 3. Not compatible with standard Supabase hosted projects.
--
-- DO NOT:
-- - Use CREATE OR REPLACE FUNCTION auth.uid() -- breaks auth system
-- - Use \set (psql-only syntax) in Supabase SQL Editor
-- - Run in production
-- - Claim "tests passed" without actual execution

-- ============================================================
-- Test Data Setup (run before each test group)
-- ============================================================
-- Replace with actual test UUIDs from your test project.
-- These are dummy values for documentation only.

-- Test store A
-- INSERT INTO public.stores (id, name) VALUES
--   ('11111111-1111-1111-1111-111111111111', 'Test Store A');

-- Test store B
-- INSERT INTO public.stores (id, name) VALUES
--   ('22222222-2222-2222-2222-222222222222', 'Test Store B');

-- Test users must be created via Supabase Auth first.
-- Their UUIDs must be obtained from auth.users(id).

-- ============================================================
-- Scenario 1: Anon / unauthenticated access blocked
-- ============================================================
-- Expected: 0 rows (no RLS policy for anon)
-- Method: Execute without Authorization header or JWT.

-- SELECT count(*) FROM public.products;
-- Expected result: 0

-- SELECT count(*) FROM public.customers;
-- Expected result: 0

-- ============================================================
-- Scenario 2: Owner can view own store
-- ============================================================
-- Precondition: Owner user is an active member of store A.
-- Expected: 1 row

-- SELECT count(*) FROM public.stores WHERE id = 'store-a-uuid';
-- Expected result: 1

-- ============================================================
-- Scenario 3: Owner cannot view other store
-- ============================================================
-- Precondition: Owner user is NOT a member of store B.
-- Expected: 0 rows

-- SELECT count(*) FROM public.stores WHERE id = 'store-b-uuid';
-- Expected result: 0

-- ============================================================
-- Scenario 4: Manager can insert product
-- ============================================================
-- Precondition: Manager is an active member of store A.
-- Expected: Success (201 or 1 row inserted)

-- INSERT INTO public.products (store_id, product_code, original_title, brand)
-- VALUES ('store-a-uuid', 'TEST001', 'Test Product', 'TestBrand');
-- Expected result: Success

-- ============================================================
-- Scenario 5: Manager cannot change store_members role
-- ============================================================
-- Precondition: Manager is active member of store A.
-- Expected: Error 403 / permission denied

-- UPDATE public.store_members
-- SET role = 'owner'
-- WHERE store_id = 'store-a-uuid' AND user_id = 'some-user-uuid';
-- Expected result: 0 rows affected or permission denied

-- ============================================================
-- Scenario 6: Staff cannot view products base table
-- ============================================================
-- Precondition: Staff is active member of store A.
-- Expected: 0 rows (staff base table SELECT blocked for products)

-- SELECT count(*) FROM public.products WHERE store_id = 'store-a-uuid';
-- Expected result: 0

-- ============================================================
-- Scenario 7: Staff cannot view customers base table
-- ============================================================
-- Precondition: Staff is active member of store A.
-- Expected: 0 rows

-- SELECT count(*) FROM public.customers WHERE store_id = 'store-a-uuid';
-- Expected result: 0

-- ============================================================
-- Scenario 8: Staff cannot view orders base table
-- ============================================================
-- Precondition: Staff is active member of store A.
-- Expected: 0 rows

-- SELECT count(*) FROM public.orders WHERE store_id = 'store-a-uuid';
-- Expected result: 0

-- ============================================================
-- Scenario 9: Staff cannot view store_settings
-- ============================================================
-- Precondition: Staff is active member of store A.
-- Expected: 0 rows

-- SELECT count(*) FROM public.store_settings WHERE store_id = 'store-a-uuid';
-- Expected result: 0

-- ============================================================
-- Scenario 10: Owner can view audit_logs
-- ============================================================
-- Precondition: Owner is active member of store A.
-- Expected: >= 0 rows

-- SELECT count(*) FROM public.audit_logs WHERE store_id = 'store-a-uuid';
-- Expected result: >= 0

-- ============================================================
-- Scenario 11: Manager cannot view audit_logs
-- ============================================================
-- Precondition: Manager is active member of store A.
-- Expected: 0 rows

-- SELECT count(*) FROM public.audit_logs WHERE store_id = 'store-a-uuid';
-- Expected result: 0

-- ============================================================
-- Scenario 12: Staff cannot view audit_logs
-- ============================================================
-- Precondition: Staff is active member of store A.
-- Expected: 0 rows

-- SELECT count(*) FROM public.audit_logs WHERE store_id = 'store-a-uuid';
-- Expected result: 0

-- ============================================================
-- Scenario 13: Owner can view migration_runs
-- ============================================================
-- Precondition: Owner is active member of store A.
-- Expected: >= 0 rows

-- SELECT count(*) FROM public.migration_runs WHERE store_id = 'store-a-uuid';
-- Expected result: >= 0

-- ============================================================
-- Scenario 14: Staff cannot view migration_runs
-- ============================================================
-- Precondition: Staff is active member of store A.
-- Expected: 0 rows

-- SELECT count(*) FROM public.migration_runs WHERE store_id = 'store-a-uuid';
-- Expected result: 0

-- ============================================================
-- Scenario 15: Cross-store customer_id blocked for new order
-- ============================================================
-- Precondition: Store B customer exists.
-- Expected: Error (trigger blocks)

-- INSERT INTO public.orders (store_id, order_number, customer_id, quantity, selling_price)
-- VALUES ('store-a-uuid', 'ORD001', 'store-b-customer-id', 1, 100);
-- Expected result: Error - customer_id must be active and belong to the same store

-- ============================================================
-- Scenario 16: Cross-store product_id blocked for new order
-- ============================================================
-- Precondition: Store B product exists.
-- Expected: Error (trigger blocks)

-- INSERT INTO public.orders (store_id, order_number, product_id, quantity, selling_price)
-- VALUES ('store-a-uuid', 'ORD002', 'store-b-product-id', 1, 100);
-- Expected result: Error - product_id must be active and belong to the same store

-- ============================================================
-- Scenario 17: Soft-deleted customer cannot be used in new order
-- ============================================================
-- Precondition: Store A customer with deleted_at IS NOT NULL exists.
-- Expected: Error (trigger blocks)

-- INSERT INTO public.orders (store_id, order_number, customer_id, quantity, selling_price)
-- VALUES ('store-a-uuid', 'ORD003', 'soft-deleted-customer-id', 1, 100);
-- Expected result: Error - customer_id must be active and belong to the same store

-- ============================================================
-- Scenario 18: Soft-deleted product cannot be used in new order
-- ============================================================
-- Precondition: Store A product with deleted_at IS NOT NULL exists.
-- Expected: Error (trigger blocks)

-- INSERT INTO public.orders (store_id, order_number, product_id, quantity, selling_price)
-- VALUES ('store-a-uuid', 'ORD004', 'soft-deleted-product-id', 1, 100);
-- Expected result: Error - product_id must be active and belong to the same store

-- ============================================================
-- Scenario 19: Inactive member cannot access store data
-- ============================================================
-- Precondition: User is a store member with is_active = false.
-- Expected: 0 rows for all business tables.

-- SELECT count(*) FROM public.stores WHERE id = 'store-a-uuid';
-- Expected result: 0

-- ============================================================
-- Scenario 20: Last active owner removal blocked
-- ============================================================
-- Precondition: Only one active owner exists for store A.
-- Expected: Error (trigger blocks)

-- UPDATE public.store_members
-- SET is_active = false
-- WHERE store_id = 'store-a-uuid' AND role = 'owner';
-- Expected result: Error - Cannot remove the last active owner of a store

-- ============================================================
-- Scenario 21: Last owner role change blocked
-- ============================================================
-- Precondition: Only one active owner exists for store A.
-- Expected: Error (trigger blocks)

-- UPDATE public.store_members
-- SET role = 'manager'
-- WHERE store_id = 'store-a-uuid' AND role = 'owner';
-- Expected result: Error - Cannot remove the last active owner of a store

-- ============================================================
-- Scenario 22: Physical DELETE blocked
-- ============================================================
-- Precondition: Owner of store A.
-- Expected: Error (permission denied)

-- DELETE FROM public.products WHERE store_id = 'store-a-uuid';
-- Expected result: Error - permission denied

-- ============================================================
-- Scenario 23: Self role escalation blocked
-- ============================================================
-- Precondition: Manager tries to change their own role to owner.
-- Expected: 0 rows affected (RLS blocks)

-- UPDATE public.store_members
-- SET role = 'owner'
-- WHERE store_id = 'store-a-uuid' AND user_id = auth.uid();
-- Expected result: 0 rows affected or permission denied

-- ============================================================
-- Scenario 24: Inventory logs direct insert blocked
-- ============================================================
-- Precondition: Owner of store A.
-- Expected: Error (no INSERT policy)

-- INSERT INTO public.inventory_logs (store_id, product_id, change_type, quantity_change)
-- VALUES ('store-a-uuid', 'product-id', 'SHIP', -1);
-- Expected result: Error - permission denied

-- ============================================================
-- Scenario 25: Owner can view soft-deleted products
-- ============================================================
-- Precondition: Owner of store A, soft-deleted product exists.
-- Expected: >= 1 row

-- SELECT count(*) FROM public.products
-- WHERE store_id = 'store-a-uuid' AND deleted_at IS NOT NULL;
-- Expected result: >= 1

-- ============================================================
-- Scenario 26: Manager cannot view soft-deleted products
-- ============================================================
-- Precondition: Manager of store A, soft-deleted product exists.
-- Expected: 0 rows

-- SELECT count(*) FROM public.products
-- WHERE store_id = 'store-a-uuid' AND deleted_at IS NOT NULL;
-- Expected result: 0

-- ============================================================
-- Scenario 27: Soft-deleted rows excluded from active views
-- ============================================================
-- Precondition: Owner/manager of store A.
-- Expected: Soft-deleted rows do NOT appear in normal active queries.

-- SELECT count(*) FROM public.products
-- WHERE store_id = 'store-a-uuid' AND deleted_at IS NULL;
-- Expected result: Only active rows

-- ============================================================
-- Scenario 28: created_by tampering blocked
-- ============================================================
-- Precondition: Owner of store A updates a product.
-- Expected: created_by remains unchanged; updated_by = auth.uid().

-- UPDATE public.products SET original_title = 'New Title' WHERE id = 'product-id';
-- Then verify: SELECT created_by, updated_by FROM public.products WHERE id = 'product-id';
-- Expected: created_by unchanged, updated_by = current user UUID

-- ============================================================
-- Scenario 29: Manager cannot update store_settings
-- ============================================================
-- Precondition: Manager of store A.
-- Expected: 0 rows affected

-- UPDATE public.store_settings SET exchange_divisor = 200 WHERE store_id = 'store-a-uuid';
-- Expected result: 0 rows affected or permission denied

-- ============================================================
-- Scenario 30: Manager can view expenses
-- ============================================================
-- Precondition: Manager of store A.
-- Expected: >= 0 rows

-- SELECT count(*) FROM public.expenses WHERE store_id = 'store-a-uuid';
-- Expected result: >= 0

-- ============================================================
-- Execution Status
-- ============================================================
--
-- Total scenarios documented: 30
-- Actually executed: 0 (not yet run in any test Supabase project)
-- Passed: N/A
-- Failed: N/A
--
-- To execute: Create a test Supabase project, run migrations 001-007,
-- create test users via Auth Admin API, and run these statements
-- through the Supabase JS client or SQL Editor while authenticated.
--
-- See also: docs/RLS_TEST_PLAN.md for detailed JS test examples.
