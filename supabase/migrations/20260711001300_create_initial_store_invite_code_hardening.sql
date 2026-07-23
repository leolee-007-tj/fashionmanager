-- ============================================================
-- Migration 013: create_initial_store Invite-code Hardening
-- ============================================================
--
-- PURPOSE:
--   Harden create_initial_store so that a new authenticated user
--   without an active owner membership MUST provide a valid
--   join-type invite code to join an existing store.
--
--   Existing owners are protected: idempotent owner lookup runs
--   first and returns the existing store_id without requiring
--   an invite code.
--
--   This step is join-type only. create-type invitations that
--   create a brand new store are NOT implemented here.
--
--   Direct DML on store_invitations is still not granted.
--   Mutation of store_invitations is done only inside this
--   SECURITY DEFINER RPC.
--
-- SECURITY:
--   - SECURITY DEFINER with SET search_path = ''
--   - auth.uid() is the only user identifier
--   - Old 3-argument function is revoked and dropped to prevent
--     signature-based bypasses
--   - Invite code consumption uses SELECT ... FOR UPDATE to avoid
--     race conditions on concurrent redemptions
--
-- ============================================================

-- ============================================================
-- Step 1: Revoke and drop the old 3-argument signature
-- PostgreSQL allows function overloading by argument count.
-- Leaving the old 3-arg function in place would let clients
-- bypass invite-code enforcement by calling the old overload.
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.create_initial_store(text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_initial_store(text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_initial_store(text, text, text) FROM authenticated;

DROP FUNCTION IF EXISTS public.create_initial_store(text, text, text);

-- ============================================================
-- Step 2: Create hardened 4-argument create_initial_store
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_initial_store(
    p_name text,
    p_subtitle text DEFAULT NULL,
    p_default_language text DEFAULT 'ko',
    p_invite_code text DEFAULT NULL
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
    v_invite_code text;
    v_existing_store_id uuid;
    v_invite public.store_invitations;
    v_user_email text;
    v_membership_id uuid;
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

    -- ============================================================
    -- Idempotent onboarding: check for existing ACTIVE owner store
    -- Excludes soft-deleted stores (stores.deleted_at IS NULL)
    -- This runs BEFORE invite-code validation, so existing owners
    -- never need an invite code to retrieve their store.
    -- ============================================================
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

    -- ============================================================
    -- No active owner membership: invite code is required
    -- ============================================================
    v_invite_code := trim(COALESCE(p_invite_code, ''));
    IF v_invite_code = '' THEN
        RAISE EXCEPTION USING
            ERRCODE = '22023',
            MESSAGE = 'Invite code is required';
    END IF;

    -- Look up the invite code and lock the row for update
    SELECT *
      INTO v_invite
      FROM public.store_invitations
     WHERE invite_code = v_invite_code
       FOR UPDATE;

    -- Validate invite existence
    IF v_invite.id IS NULL THEN
        RAISE EXCEPTION USING
            ERRCODE = 'P0001',
            MESSAGE = 'Invalid invite code';
    END IF;

    -- Validate invite has not been revoked
    IF v_invite.revoked_at IS NOT NULL THEN
        RAISE EXCEPTION USING
            ERRCODE = 'P0001',
            MESSAGE = 'Invite code has been revoked';
    END IF;

    -- Validate invite has not been used
    IF v_invite.used_at IS NOT NULL OR v_invite.used_by IS NOT NULL THEN
        RAISE EXCEPTION USING
            ERRCODE = 'P0001',
            MESSAGE = 'Invite code already used';
    END IF;

    -- Validate invite has not expired
    IF v_invite.expires_at IS NOT NULL AND v_invite.expires_at <= now() THEN
        RAISE EXCEPTION USING
            ERRCODE = 'P0001',
            MESSAGE = 'Invite code has expired';
    END IF;

    -- Validate linked store is active
    IF EXISTS (
        SELECT 1 FROM public.stores s
        WHERE s.id = v_invite.store_id
          AND s.deleted_at IS NOT NULL
    ) THEN
        RAISE EXCEPTION USING
            ERRCODE = 'P0001',
            MESSAGE = 'Invite code is linked to a deleted store';
    END IF;

    -- Validate role is allowed (owner role invitations are not allowed in this step)
    IF v_invite.role = 'owner' THEN
        RAISE EXCEPTION USING
            ERRCODE = 'P0001',
            MESSAGE = 'Owner role invitations are not allowed';
    END IF;

    -- Validate invited email matches current user email (case-insensitive)
    IF v_invite.invited_email IS NOT NULL THEN
        SELECT email INTO v_user_email
        FROM auth.users
        WHERE id = v_uid;

        IF lower(COALESCE(v_user_email, '')) != lower(trim(v_invite.invited_email)) THEN
            RAISE EXCEPTION USING
                ERRCODE = 'P0001',
                MESSAGE = 'Invite code is not associated with your account';
        END IF;
    END IF;

    -- Idempotent membership check: if user already has an active membership
    -- in the invited store, return the store_id without creating a duplicate.
    SELECT sm.store_id INTO v_existing_store_id
    FROM public.store_members sm
    INNER JOIN public.stores s ON s.id = sm.store_id
    WHERE sm.store_id = v_invite.store_id
      AND sm.user_id = v_uid
      AND sm.is_active = true
      AND s.deleted_at IS NULL
    LIMIT 1;

    IF v_existing_store_id IS NOT NULL THEN
        -- Mark invite as used (to prevent reuse) and return store
        UPDATE public.store_invitations
           SET used_at = now(),
               used_by = v_uid,
               updated_at = now()
         WHERE id = v_invite.id;

        RETURN v_existing_store_id;
    END IF;

    -- Create membership in the invited store
    INSERT INTO public.store_members (store_id, user_id, role, is_active, invited_by)
    VALUES (v_invite.store_id, v_uid, v_invite.role, true, v_invite.created_by)
    RETURNING id INTO v_membership_id;

    -- Mark invite as used
    UPDATE public.store_invitations
       SET used_at = now(),
           used_by = v_uid,
           updated_at = now()
     WHERE id = v_invite.id;

    -- Return the joined store_id (no new store creation in this step)
    RETURN v_invite.store_id;
END;
$$;

-- ============================================================
-- Step 3: Permissions on the new 4-argument function
-- ============================================================

REVOKE ALL ON FUNCTION public.create_initial_store(text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_initial_store(text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_initial_store(text, text, text, text) TO authenticated;
