-- ============================================================
-- pgTAP: Auth Onboarding Test
-- ============================================================
--
-- PURPOSE:
--   Verify secure auth bootstrap and initial store owner onboarding
--   functions: ensure_user_profile and create_initial_store.
--
-- EXECUTION:
--   supabase test db
--
-- CONVENTIONS:
--   - Uses pgTAP functions: plan, lives_ok, throws_ok, is, finish
--   - SET LOCAL ROLE authenticated + request.jwt.claim.sub for simulation
--   - auth.uid() is NEVER overridden
--   - No psql-only \set syntax
--   - Setup runs in admin/postgres role with JWT claims set only
--   - Cleanup: RESET ROLE, clear JWT claims, DROP helper
--   - Dummy UUIDs only -- no real user data
--
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- Setup: pgTAP extension
-- ------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

-- Assertion count: 20 (T1-T12 original + T13-T20 hardening)
SELECT plan(20);

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
-- Setup: JWT claims for onboarding test user
-- Role stays as superuser/admin. Only JWT claim is set so that
-- auth.uid() returns the test UUID for trigger created_by assignment.
-- ------------------------------------------------------------

SELECT set_config('request.jwt.claim.sub', '88888888-8888-8888-8888-888888888888', true);
SELECT set_config('request.jwt.claims',
    json_build_object(
        'sub', '88888888-8888-8888-8888-888888888888',
        'role', 'authenticated'
    )::text,
    true
);

-- ------------------------------------------------------------
-- Setup: auth.users fixture (minimal)
-- ------------------------------------------------------------

INSERT INTO auth.users (id, email)
VALUES ('88888888-8888-8888-8888-888888888888', 'onboarder@test.local');

-- Clear JWT claims, keep admin role
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);

-- ============================================================
-- T1: Unauthenticated ensure_user_profile call fails (42501)
-- ============================================================

SET LOCAL ROLE anon;
SELECT throws_ok(
    $$ SELECT public.ensure_user_profile() $$,
    '42501',
    NULL,
    'T1: Unauthenticated ensure_user_profile call fails'
);
RESET ROLE;

-- ============================================================
-- T2: Unauthenticated create_initial_store call fails (42501)
-- ============================================================

SET LOCAL ROLE anon;
SELECT throws_ok(
    $$ SELECT public.create_initial_store('Test') $$,
    '42501',
    NULL,
    'T2: Unauthenticated create_initial_store call fails'
);
RESET ROLE;

-- ============================================================
-- T3: Authenticated create_initial_store succeeds
-- ============================================================

SELECT public.set_request_user('88888888-8888-8888-8888-888888888888');

SELECT lives_ok(
    $$ SELECT public.create_initial_store('My Store', 'Store subtitle', 'ko') $$,
    'T3: Authenticated create_initial_store succeeds'
);

-- ============================================================
-- T4: Exactly 1 store row exists for the onboarded user
-- ============================================================

SELECT is(
    (SELECT count(*)::integer FROM public.stores
     WHERE created_by = '88888888-8888-8888-8888-888888888888'),
    1,
    'T4: Exactly 1 store exists for the onboarded user'
);

-- ============================================================
-- T5: stores.created_by matches auth.uid()
-- ============================================================

SELECT is(
    (SELECT created_by::text FROM public.stores
     WHERE created_by = '88888888-8888-8888-8888-888888888888' LIMIT 1),
    '88888888-8888-8888-8888-888888888888',
    'T5: stores.created_by matches auth.uid()'
);

-- ============================================================
-- T6: Exactly 1 active owner membership exists
-- ============================================================

SELECT is(
    (SELECT count(*)::integer FROM public.store_members
     WHERE user_id = '88888888-8888-8888-8888-888888888888'
       AND role = 'owner' AND is_active = true),
    1,
    'T6: Exactly 1 active owner membership exists'
);

-- ============================================================
-- T7: owner membership user_id matches auth.uid()
-- ============================================================

SELECT is(
    (SELECT user_id::text FROM public.store_members
     WHERE user_id = '88888888-8888-8888-8888-888888888888'
       AND role = 'owner' AND is_active = true LIMIT 1),
    '88888888-8888-8888-8888-888888888888',
    'T7: owner membership user_id matches auth.uid()'
);

-- ============================================================
-- T8: store_settings created with correct default_language
-- ============================================================

SELECT is(
    (SELECT count(*)::integer FROM public.store_settings ss
     JOIN public.stores s ON ss.store_id = s.id
     WHERE s.created_by = '88888888-8888-8888-8888-888888888888'
       AND ss.default_language = 'ko'),
    1,
    'T8: store_settings created with default_language = ko'
);

-- ============================================================
-- T9: Profile exists for current user
-- ============================================================

SELECT is(
    (SELECT count(*)::integer FROM public.profiles
     WHERE id = '88888888-8888-8888-8888-888888888888'),
    1,
    'T9: Profile exists for current user'
);

-- ============================================================
-- T10: Second create_initial_store returns same store_id (idempotent)
-- ============================================================

SELECT is(
    public.create_initial_store('My Store', NULL, 'ko'),
    (SELECT id FROM public.stores WHERE created_by = '88888888-8888-8888-8888-888888888888' LIMIT 1),
    'T10: Second create_initial_store returns same store_id (idempotent)'
);

-- ============================================================
-- T11: No duplicate store/membership/settings after second call
-- ============================================================

SELECT is(
    (SELECT count(*)::integer FROM public.stores WHERE created_by = '88888888-8888-8888-8888-888888888888')
    + (SELECT count(*)::integer FROM public.store_members WHERE user_id = '88888888-8888-8888-8888-888888888888' AND role = 'owner' AND is_active = true)
    + (SELECT count(*)::integer FROM public.store_settings ss JOIN public.stores s ON ss.store_id = s.id WHERE s.created_by = '88888888-8888-8888-8888-888888888888'),
    3,
    'T11: No duplicate store/membership/settings after second call (1+1+1=3)'
);

-- ============================================================
-- T12: Empty store name fails with clear SQLSTATE
-- ============================================================

SELECT throws_ok(
    $$ SELECT public.create_initial_store('   ', NULL, 'ko') $$,
    '22023',
    'Store name must be between 1 and 100 characters after trimming',
    'T12: Empty store name fails with SQLSTATE 22023'
);

-- ============================================================
-- T13: ensure_user_profile with NULL language fails (22023)
-- ============================================================

SELECT throws_ok(
    $$ SELECT public.ensure_user_profile(NULL, NULL) $$,
    '22023',
    'preferred_language is required',
    'T13: ensure_user_profile with NULL language fails with 22023'
);

-- ============================================================
-- T14: create_initial_store with NULL default_language fails (22023)
-- ============================================================

SELECT throws_ok(
    $$ SELECT public.create_initial_store('Test', NULL, NULL) $$,
    '22023',
    'default_language is required',
    'T14: create_initial_store with NULL default_language fails with 22023'
);

-- ============================================================
-- T15: create_initial_store with NULL name fails (22023)
-- ============================================================

SELECT throws_ok(
    $$ SELECT public.create_initial_store(NULL, NULL, 'ko') $$,
    '22023',
    'Store name is required',
    'T15: create_initial_store with NULL name fails with 22023'
);

-- ============================================================
-- T16: create_initial_store with empty string name fails (22023)
-- ============================================================

SELECT throws_ok(
    $$ SELECT public.create_initial_store('', NULL, 'ko') $$,
    '22023',
    'Store name must be between 1 and 100 characters after trimming',
    'T16: create_initial_store with empty name fails with 22023'
);

-- ============================================================
-- T17: create_initial_store with 101-char name fails (22023)
-- ============================================================

SELECT throws_ok(
    $$ SELECT public.create_initial_store(repeat('a', 101), NULL, 'ko') $$,
    '22023',
    'Store name must be between 1 and 100 characters after trimming',
    'T17: create_initial_store with 101-char name fails with 22023'
);

-- ============================================================
-- T18: Re-onboarding after store deletion returns new active store
--      (deleted store_id is NOT returned)
-- ============================================================

-- Soft-delete the existing store
UPDATE public.stores
SET deleted_at = now()
WHERE created_by = '88888888-8888-8888-8888-888888888888'
  AND deleted_at IS NULL;

-- create_initial_store should create a new active store
-- The returned store_id must belong to a non-deleted store
SELECT is(
    (SELECT count(*)::integer FROM public.stores s
     WHERE s.id = public.create_initial_store('New Store 2', NULL, 'ko')
       AND s.deleted_at IS NULL),
    1,
    'T18: Re-onboarding after deletion returns new active store (not deleted store_id)'
);

-- ============================================================
-- T19: Exactly 1 active store exists after re-onboarding
-- ============================================================

SELECT is(
    (SELECT count(*)::integer FROM public.stores
     WHERE created_by = '88888888-8888-8888-8888-888888888888'
       AND deleted_at IS NULL),
    1,
    'T19: Exactly 1 active store after re-onboarding (deleted store excluded)'
);

-- ============================================================
-- T20: EXECUTE granted only to authenticated (not anon) for both functions
-- ============================================================

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);

SELECT is(
    (SELECT count(*)::integer FROM pg_proc p
     JOIN pg_namespace n ON p.pronamespace = n.oid
     WHERE n.nspname = 'public'
       AND p.proname IN ('ensure_user_profile', 'create_initial_store')
       AND has_function_privilege('authenticated', p.oid, 'EXECUTE') = true
       AND has_function_privilege('anon', p.oid, 'EXECUTE') = false),
    2,
    'T20: EXECUTE granted only to authenticated (not anon) for both onboarding functions'
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
