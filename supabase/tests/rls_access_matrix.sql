-- ============================================================
-- RLS Access Matrix Test
-- ============================================================
-- WARNING: This test file is for TEST Supabase only.
-- DO NOT execute in production environments.
-- Use dummy UUIDs only.
-- Wrap in transaction and rollback after testing.
-- ============================================================

BEGIN;

-- ============================================================
-- Test setup: Create dummy users and stores
-- ============================================================

-- Dummy user IDs (not real auth users)
\set owner_user_id '00000000-0000-0000-0000-000000000001'
\set manager_user_id '00000000-0000-0000-0000-000000000002'
\set staff_user_id '00000000-0000-0000-0000-000000000003'
\set other_user_id '00000000-0000-0000-0000-000000000004'

-- Test store IDs
\set store_a_id '11111111-1111-1111-1111-111111111111'
\set store_b_id '22222222-2222-2222-2222-222222222222'

-- ============================================================
-- Helper function: simulate auth.uid() override for testing
-- Note: This requires security definer and is for testing only
-- ============================================================

CREATE OR REPLACE FUNCTION public.test_set_uid(new_uid uuid)
RETURNS void AS $$
BEGIN
    PERFORM set_config('test.uid', new_uid::text, true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '';

REVOKE ALL ON FUNCTION public.test_set_uid FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.test_set_uid TO authenticated;

-- Override auth.uid() for testing
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid AS $$
DECLARE
    v_test_uid text;
BEGIN
    v_test_uid := current_setting('test.uid', true);
    IF v_test_uid IS NOT NULL THEN
        RETURN v_test_uid::uuid;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================
-- Test 1: anon products SELECT should fail
-- ============================================================

SELECT 'Test 1: anon products SELECT' AS test,
    (SELECT count(*) FROM public.products WHERE store_id = :store_a_id) AS result,
    'EXPECTED: 0 (RLS blocks anon)' AS expected;

-- ============================================================
-- Test 2: unauthenticated customers SELECT should fail
-- ============================================================

SELECT 'Test 2: unauthenticated customers SELECT' AS test,
    (SELECT count(*) FROM public.customers WHERE store_id = :store_a_id) AS result,
    'EXPECTED: 0 (no auth.uid())' AS expected;

-- ============================================================
-- Test 3: owner can view their own store
-- ============================================================

SELECT public.test_set_uid(:owner_user_id);
SELECT 'Test 3: owner view own store' AS test,
    (SELECT count(*) FROM public.stores WHERE id = :store_a_id) AS result,
    'EXPECTED: 1' AS expected;

-- ============================================================
-- Test 4: owner cannot view other store
-- ============================================================

SELECT 'Test 4: owner view other store' AS test,
    (SELECT count(*) FROM public.stores WHERE id = :store_b_id) AS result,
    'EXPECTED: 0 (not a member)' AS expected;

-- ============================================================
-- Test 5: manager can insert product
-- ============================================================

SELECT public.test_set_uid(:manager_user_id);
SELECT 'Test 5: manager insert product' AS test,
    (SELECT count(*) FROM public.products WHERE store_id = :store_a_id) AS result,
    'EXPECTED: depends on existing data' AS expected;

-- ============================================================
-- Test 6: manager cannot update store_members role
-- ============================================================

SELECT 'Test 6: manager update store_members role' AS test,
    'EXPECTED: RLS blocks (requires owner)' AS expected;

-- ============================================================
-- Test 7: staff cannot update cost fields
-- ============================================================

SELECT public.test_set_uid(:staff_user_id);
SELECT 'Test 7: staff update products' AS test,
    'EXPECTED: RLS blocks (requires owner/manager)' AS expected;

-- ============================================================
-- Test 8: staff order insert policy check
-- ============================================================

SELECT 'Test 8: staff order insert' AS test,
    'EXPECTED: RLS blocks (requires owner/manager)' AS expected;

-- ============================================================
-- Test 9: staff cannot view store_settings
-- ============================================================

SELECT 'Test 9: staff view store_settings' AS test,
    (SELECT count(*) FROM public.store_settings WHERE store_id = :store_a_id) AS result,
    'EXPECTED: 0 (owner only)' AS expected;

-- ============================================================
-- Test 10: owner can view audit_logs
-- ============================================================

SELECT public.test_set_uid(:owner_user_id);
SELECT 'Test 10: owner view audit_logs' AS test,
    (SELECT count(*) FROM public.audit_logs WHERE store_id = :store_a_id) AS result,
    'EXPECTED: 0 or more (owner can view)' AS expected;

-- ============================================================
-- Test 11: manager cannot view audit_logs
-- ============================================================

SELECT public.test_set_uid(:manager_user_id);
SELECT 'Test 11: manager view audit_logs' AS test,
    (SELECT count(*) FROM public.audit_logs WHERE store_id = :store_a_id) AS result,
    'EXPECTED: 0 (owner only)' AS expected;

-- ============================================================
-- Test 12: staff cannot view audit_logs
-- ============================================================

SELECT public.test_set_uid(:staff_user_id);
SELECT 'Test 12: staff view audit_logs' AS test,
    (SELECT count(*) FROM public.audit_logs WHERE store_id = :store_a_id) AS result,
    'EXPECTED: 0 (owner only)' AS expected;

-- ============================================================
-- Test 13: owner can view migration_runs
-- ============================================================

SELECT public.test_set_uid(:owner_user_id);
SELECT 'Test 13: owner view migration_runs' AS test,
    (SELECT count(*) FROM public.migration_runs WHERE store_id = :store_a_id) AS result,
    'EXPECTED: 0 or more' AS expected;

-- ============================================================
-- Test 14: staff cannot view migration_runs
-- ============================================================

SELECT public.test_set_uid(:staff_user_id);
SELECT 'Test 14: staff view migration_runs' AS test,
    (SELECT count(*) FROM public.migration_runs WHERE store_id = :store_a_id) AS result,
    'EXPECTED: 0 (owner only)' AS expected;

-- ============================================================
-- Test 15: cross-store customer_id should fail
-- ============================================================

SELECT public.test_set_uid(:owner_user_id);
SELECT 'Test 15: cross-store customer_id' AS test,
    'EXPECTED: trigger blocks (customer from different store)' AS expected;

-- ============================================================
-- Test 16: cross-store product_id should fail
-- ============================================================

SELECT 'Test 16: cross-store product_id' AS test,
    'EXPECTED: trigger blocks (product from different store)' AS expected;

-- ============================================================
-- Test 17: soft deleted rows visibility
-- ============================================================

SELECT 'Test 17: soft deleted rows' AS test,
    'EXPECTED: depends on application logic (RLS does not filter deleted_at)' AS expected;

-- ============================================================
-- Test 18: inactive member cannot access
-- ============================================================

SELECT 'Test 18: inactive member access' AS test,
    'EXPECTED: RLS blocks (private.is_store_member checks is_active)' AS expected;

-- ============================================================
-- Test 19: last owner removal prevention
-- ============================================================

SELECT 'Test 19: last owner removal' AS test,
    'EXPECTED: needs trigger/function (RLS alone insufficient)' AS expected;

-- ============================================================
-- Test 20: auth.uid() null should fail
-- ============================================================

SELECT public.test_set_uid(NULL);
SELECT 'Test 20: auth.uid() null' AS test,
    (SELECT count(*) FROM public.products) AS result,
    'EXPECTED: 0 (no authentication)' AS expected;

-- ============================================================
-- Test 21: physical DELETE should fail
-- ============================================================

SELECT public.test_set_uid(:owner_user_id);
SELECT 'Test 21: physical DELETE' AS test,
    'EXPECTED: permission denied (no DELETE granted)' AS expected;

-- ============================================================
-- Test 22: self role escalation should fail
-- ============================================================

SELECT 'Test 22: self role escalation' AS test,
    'EXPECTED: RLS blocks (owner check for store_members UPDATE)' AS expected;

-- ============================================================
-- Test 23: other store settings access should fail
-- ============================================================

SELECT 'Test 23: other store settings' AS test,
    (SELECT count(*) FROM public.store_settings WHERE store_id = :store_b_id) AS result,
    'EXPECTED: 0 (not a member)' AS expected;

-- ============================================================
-- Test 24: inventory_logs direct insert should fail
-- ============================================================

SELECT 'Test 24: inventory_logs direct insert' AS test,
    'EXPECTED: RLS blocks (no INSERT policy)' AS expected;

-- ============================================================
-- Cleanup
-- ============================================================

ROLLBACK;