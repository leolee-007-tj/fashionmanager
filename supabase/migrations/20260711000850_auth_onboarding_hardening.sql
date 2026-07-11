-- ============================================================
-- Migration 00850: Auth Onboarding Validation Hardening
-- ============================================================
--
-- PURPOSE:
--   Harden the onboarding RPC functions against NULL input bypass,
--   deleted-store idempotency leaks, and advisory lock collisions.
--
-- CHANGES:
--   1. ensure_user_profile: explicit NULL check for p_preferred_language
--      (previously lower(trim(NULL)) = NULL, and NULL NOT IN (...) = NULL,
--       bypassing the IF guard). Input errors now use SQLSTATE 22023.
--   2. create_initial_store: explicit NULL checks for p_name and
--      p_default_language. Input errors use SQLSTATE 22023.
--   3. create_initial_store: idempotent owner-store query now JOINs stores
--      and requires stores.deleted_at IS NULL, so a user whose only store
--      was soft-deleted can re-onboard with a fresh store.
--   4. Advisory lock key changed from seed 54321 to seed 0 for a
--      deterministic 64-bit key per auth.uid().
--
-- Does NOT modify migration 008. Uses CREATE OR REPLACE FUNCTION.
--
-- ============================================================

-- ============================================================
-- Harden ensure_user_profile
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

    -- Explicit NULL check for preferred_language
    -- Prevents lower(trim(NULL)) = NULL bypass where NULL NOT IN (...) = NULL
    IF p_preferred_language IS NULL THEN
        RAISE EXCEPTION USING
            ERRCODE = '22023',
            MESSAGE = 'preferred_language is required';
    END IF;

    -- Sanitize display_name: trim, empty string -> NULL
    v_display_name := trim(COALESCE(p_display_name, ''));
    IF v_display_name = '' THEN
        v_display_name := NULL;
    END IF;

    -- Validate preferred_language (trim + lowercase + whitelist)
    v_language := lower(trim(p_preferred_language));
    IF v_language NOT IN ('ko', 'zh', 'en', 'ja') THEN
        RAISE EXCEPTION 'Invalid preferred_language: %. Must be one of: ko, zh, en, ja', v_language
        USING ERRCODE = '22023';
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
-- Harden create_initial_store
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

    -- Explicit NULL check for store name
    IF p_name IS NULL THEN
        RAISE EXCEPTION USING
            ERRCODE = '22023',
            MESSAGE = 'Store name is required';
    END IF;

    -- Validate and sanitize store name
    v_name := trim(p_name);
    IF v_name = '' OR length(v_name) > 100 THEN
        RAISE EXCEPTION USING
            ERRCODE = '22023',
            MESSAGE = 'Store name must be between 1 and 100 characters after trimming';
    END IF;

    -- Validate and sanitize subtitle (NULL allowed, empty -> NULL)
    v_subtitle := trim(COALESCE(p_subtitle, ''));
    IF v_subtitle = '' THEN
        v_subtitle := NULL;
    END IF;

    -- Explicit NULL check for default_language
    IF p_default_language IS NULL THEN
        RAISE EXCEPTION USING
            ERRCODE = '22023',
            MESSAGE = 'default_language is required';
    END IF;

    -- Validate default_language (trim + lowercase + whitelist)
    v_language := lower(trim(p_default_language));
    IF v_language NOT IN ('ko', 'zh', 'en', 'ja') THEN
        RAISE EXCEPTION 'Invalid default_language: %. Must be one of: ko, zh, en, ja', v_language
        USING ERRCODE = '22023';
    END IF;

    -- Acquire advisory transaction lock (64-bit deterministic key per user)
    PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

    -- Ensure profile exists (uses same language for consistency)
    PERFORM public.ensure_user_profile(NULL, v_language);

    -- Idempotent onboarding: check for existing ACTIVE owner store
    -- Excludes soft-deleted stores (stores.deleted_at IS NULL)
    SELECT sm.store_id INTO v_existing_store_id
    FROM public.store_members sm
    INNER JOIN public.stores s ON s.id = sm.store_id
    WHERE sm.user_id = v_uid
      AND sm.role = 'owner'
      AND sm.is_active = true
      AND s.deleted_at IS NULL
    ORDER BY sm.created_at ASC
    LIMIT 1;

    IF v_existing_store_id IS NOT NULL THEN
        -- User already has an active, non-deleted owner store -- return it
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
