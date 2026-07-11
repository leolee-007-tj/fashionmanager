-- ============================================================
-- Migration 008: Secure Auth Bootstrap and Initial Store Owner Onboarding
-- ============================================================
--
-- PURPOSE:
--   Solve the bootstrap deadlock: new authenticated users cannot create
--   profiles, stores, store_members, or store_settings because RLS
--   lacks INSERT policies for regular users.
--   This migration provides two SECURITY DEFINER RPC functions that
--   bypass RLS while using auth.uid() for user identity.
--
-- FUNCTIONS:
--   1. ensure_user_profile(p_display_name, p_preferred_language)
--      -> Creates or returns existing profile for auth.uid()
--   2. create_initial_store(p_name, p_subtitle, p_default_language)
--      -> Atomic onboarding: profile + store + membership + settings
--      -> Idempotent: returns existing store_id if user already has
--         an active owner membership
--
-- SECURITY:
--   - SECURITY DEFINER with SET search_path = ''
--   - All relations schema-qualified
--   - No dynamic SQL
--   - auth.uid() is the only user identifier (no user_id parameter)
--   - EXECUTE granted only to authenticated role
--   - Advisory transaction lock prevents concurrent duplicate creation
--
-- ============================================================

-- ============================================================
-- Function 1: ensure_user_profile
-- ============================================================
--
-- Creates or updates a profile for the current authenticated user.
-- Returns the user's profile row.
--
-- Idempotent: if profile already exists, updates only non-null fields.
-- display_name is preserved if p_display_name is null or empty.
-- preferred_language is always updated to the provided value.
--
-- ============================================================

CREATE OR REPLACE FUNCTION public.ensure_user_profile(
    p_display_name text DEFAULT NULL,
    p_preferred_language text DEFAULT 'ko'
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid uuid;
    v_display_name text;
    v_language text;
    v_profile public.profiles;
BEGIN
    -- Resolve caller identity
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated: auth.uid() is null';
    END IF;

    -- Sanitize display_name: trim, empty string -> NULL
    v_display_name := trim(COALESCE(p_display_name, ''));
    IF v_display_name = '' THEN
        v_display_name := NULL;
    END IF;

    -- Validate preferred_language
    v_language := lower(trim(p_preferred_language));
    IF v_language NOT IN ('ko', 'zh', 'en', 'ja') THEN
        RAISE EXCEPTION 'Invalid preferred_language: %. Must be one of: ko, zh, en, ja', v_language;
    END IF;

    -- Upsert profile
    -- ON CONFLICT: preserve existing display_name if new value is NULL
    INSERT INTO public.profiles AS p (id, display_name, preferred_language)
    VALUES (v_uid, v_display_name, v_language)
    ON CONFLICT (id) DO UPDATE SET
        display_name = CASE
            WHEN v_display_name IS NOT NULL THEN v_display_name
            ELSE p.display_name
        END,
        preferred_language = v_language,
        updated_at = now()
    RETURNING * INTO v_profile;

    RETURN v_profile;
END;
$$;

-- Permissions: only authenticated can execute
REVOKE ALL ON FUNCTION public.ensure_user_profile(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_user_profile(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.ensure_user_profile(text, text) TO authenticated;

-- ============================================================
-- Function 2: create_initial_store
-- ============================================================
--
-- Atomic onboarding for a new authenticated user.
-- Creates profile, store, owner membership, and store_settings
-- in a single transaction.
--
-- Idempotent onboarding: if the user already has an active owner
-- membership, returns the existing store_id without creating
-- duplicates.
--
-- Advisory transaction lock prevents concurrent duplicate calls
-- from the same user.
--
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_initial_store(
    p_name text,
    p_subtitle text DEFAULT NULL,
    p_default_language text DEFAULT 'ko'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid uuid;
    v_name text;
    v_subtitle text;
    v_language text;
    v_store_id uuid;
    v_existing_store_id uuid;
BEGIN
    -- Resolve caller identity
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated: auth.uid() is null';
    END IF;

    -- Validate and sanitize store name
    v_name := trim(COALESCE(p_name, ''));
    IF v_name = '' OR length(v_name) > 100 THEN
        RAISE EXCEPTION 'Store name must be between 1 and 100 characters after trimming';
    END IF;

    -- Validate and sanitize subtitle
    v_subtitle := trim(COALESCE(p_subtitle, ''));
    IF v_subtitle = '' THEN
        v_subtitle := NULL;
    END IF;

    -- Validate default_language
    v_language := lower(trim(p_default_language));
    IF v_language NOT IN ('ko', 'zh', 'en', 'ja') THEN
        RAISE EXCEPTION 'Invalid default_language: %. Must be one of: ko, zh, en, ja', v_language;
    END IF;

    -- Acquire advisory transaction lock to prevent concurrent duplicate creation
    -- Uses seed 54321 to namespace differently from prevent_last_owner_removal (seed 0)
    PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text, 54321));

    -- Ensure profile exists (uses same language for consistency)
    PERFORM public.ensure_user_profile(NULL, v_language);

    -- Idempotent onboarding: check if user already has an active owner store
    SELECT sm.store_id INTO v_existing_store_id
    FROM public.store_members sm
    WHERE sm.user_id = v_uid
      AND sm.role = 'owner'
      AND sm.is_active = true
    ORDER BY sm.created_at ASC
    LIMIT 1;

    IF v_existing_store_id IS NOT NULL THEN
        -- User already has an active owner store -- return it
        RETURN v_existing_store_id;
    END IF;

    -- Create new store
    INSERT INTO public.stores (name, subtitle, created_by)
    VALUES (v_name, v_subtitle, v_uid)
    RETURNING id INTO v_store_id;

    -- Create owner membership
    INSERT INTO public.store_members (store_id, user_id, role, is_active, invited_by)
    VALUES (v_store_id, v_uid, 'owner'::public.member_role, true, v_uid);

    -- Create store settings
    -- created_by/updated_by are auto-set by handle_audit_metadata trigger
    INSERT INTO public.store_settings (store_id, store_name, default_language)
    VALUES (v_store_id, v_name, v_language);

    RETURN v_store_id;
END;
$$;

-- Permissions: only authenticated can execute
REVOKE ALL ON FUNCTION public.create_initial_store(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_initial_store(text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_initial_store(text, text, text) TO authenticated;
