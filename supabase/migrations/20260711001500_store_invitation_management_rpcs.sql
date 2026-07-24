-- ============================================================
-- Migration 015: Store Invitation Management RPCs
-- ============================================================
--
-- PURPOSE:
--   Add two RPCs for owners to manage store invitations:
--   1. list_store_invite_codes() - list invites for current owner's store
--   2. revoke_store_invite_code(p_invitation_id) - revoke an invite
--
--   Both functions are SECURITY DEFINER with owner-only enforcement.
--
-- SECURITY:
--   - SECURITY DEFINER with SET search_path = ''
--   - auth.uid() is the only user identifier
--   - Owner-only enforcement via store_members join
--   - Deleted stores are excluded
--   - No dynamic SQL
--
-- ============================================================

-- ============================================================
-- Step 1: list_store_invite_codes
-- ============================================================

CREATE OR REPLACE FUNCTION public.list_store_invite_codes()
RETURNS TABLE (
    id uuid,
    invite_code text,
    invited_email text,
    role public.member_role,
    expires_at timestamptz,
    used_at timestamptz,
    revoked_at timestamptz,
    created_at timestamptz,
    status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid uuid;
    v_store_id uuid;
BEGIN
    -- Resolve caller identity
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated: auth.uid() is null';
    END IF;

    -- Look up active owner store membership
    SELECT sm.store_id INTO v_store_id
    FROM public.store_members sm
    INNER JOIN public.stores s ON s.id = sm.store_id
    WHERE sm.user_id = v_uid
      AND sm.role = 'owner'
      AND sm.is_active = true
      AND s.deleted_at IS NULL
    ORDER BY sm.created_at ASC
    LIMIT 1;

    IF v_store_id IS NULL THEN
        RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = 'Only store owners can list invite codes';
    END IF;

    -- Return invite codes for this store with calculated status
    RETURN QUERY
    SELECT
        si.id,
        si.invite_code,
        si.invited_email,
        si.role,
        si.expires_at,
        si.used_at,
        si.revoked_at,
        si.created_at,
        CASE
            WHEN si.revoked_at IS NOT NULL THEN 'revoked'
            WHEN si.used_at IS NOT NULL THEN 'used'
            WHEN si.expires_at IS NOT NULL AND si.expires_at < now() THEN 'expired'
            ELSE 'active'
        END AS status
    FROM public.store_invitations si
    WHERE si.store_id = v_store_id
    ORDER BY si.created_at DESC;
END;
$$;

-- Permissions for list_store_invite_codes
REVOKE ALL ON FUNCTION public.list_store_invite_codes() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_store_invite_codes() FROM anon;
GRANT EXECUTE ON FUNCTION public.list_store_invite_codes() TO authenticated;

-- ============================================================
-- Step 2: revoke_store_invite_code
-- ============================================================

CREATE OR REPLACE FUNCTION public.revoke_store_invite_code(p_invitation_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid uuid;
    v_store_id uuid;
    v_invite public.store_invitations;
    v_updated integer;
BEGIN
    -- Resolve caller identity
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated: auth.uid() is null';
    END IF;

    -- Validate parameter
    IF p_invitation_id IS NULL THEN
        RAISE EXCEPTION USING
            ERRCODE = '22023',
            MESSAGE = 'Invitation ID is required';
    END IF;

    -- Look up active owner store membership
    SELECT sm.store_id INTO v_store_id
    FROM public.store_members sm
    INNER JOIN public.stores s ON s.id = sm.store_id
    WHERE sm.user_id = v_uid
      AND sm.role = 'owner'
      AND sm.is_active = true
      AND s.deleted_at IS NULL
    ORDER BY sm.created_at ASC
    LIMIT 1;

    IF v_store_id IS NULL THEN
        RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = 'Only store owners can revoke invite codes';
    END IF;

    -- Fetch the invite (must belong to caller's store)
    SELECT *
      INTO v_invite
      FROM public.store_invitations
     WHERE id = p_invitation_id
       AND store_id = v_store_id;

    IF v_invite.id IS NULL THEN
        RAISE EXCEPTION USING
            ERRCODE = 'P0001',
            MESSAGE = 'Invitation not found or does not belong to your store';
    END IF;

    -- Idempotent: if already revoked, return true
    IF v_invite.revoked_at IS NOT NULL THEN
        RETURN true;
    END IF;

    -- Block revoking already-used invites
    IF v_invite.used_at IS NOT NULL THEN
        RAISE EXCEPTION USING
            ERRCODE = '22023',
            MESSAGE = 'Cannot revoke an invite code that has already been used';
    END IF;

    -- Perform revoke
    UPDATE public.store_invitations
       SET revoked_at = now(),
           revoked_by = v_uid,
           updated_at = now()
     WHERE id = p_invitation_id
       AND store_id = v_store_id;

    GET DIAGNOSTICS v_updated = ROW_COUNT;

    RETURN v_updated > 0;
END;
$$;

-- Permissions for revoke_store_invite_code
REVOKE ALL ON FUNCTION public.revoke_store_invite_code(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_store_invite_code(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.revoke_store_invite_code(uuid) TO authenticated;
