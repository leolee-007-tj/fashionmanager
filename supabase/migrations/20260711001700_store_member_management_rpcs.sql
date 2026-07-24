-- ============================================================
-- Migration 017: Store Member Management RPCs
-- ============================================================
--
-- PURPOSE:
--   Add two RPCs for owners to manage store members:
--   1. list_store_members() - list members for current owner's store
--   2. deactivate_store_member(p_member_id) - deactivate a non-owner member
--
--   Both functions are SECURITY DEFINER with owner-only enforcement.
--
-- SECURITY:
--   - SECURITY DEFINER with SET search_path = ''
--   - auth.uid() is the only user identifier
--   - Owner-only enforcement via store_members join
--   - Deleted stores are excluded
--   - Cross-store access blocked
--   - Owner role members cannot be deactivated
--   - Self-deactivation blocked
--   - No DELETE — only is_active=false update
--   - No dynamic SQL
--   - user_id/store_id not exposed in return columns
--   - email masked in return columns
--
-- ============================================================

-- ============================================================
-- Step 1: list_store_members
-- ============================================================

CREATE OR REPLACE FUNCTION public.list_store_members()
RETURNS TABLE (
    member_id uuid,
    role public.member_role,
    is_active boolean,
    joined_at timestamptz,
    display_name text,
    masked_email text
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
            MESSAGE = 'Only store owners can list store members';
    END IF;

    -- Return members for this store with masked email
    -- user_id and store_id are intentionally NOT returned
    RETURN QUERY
    SELECT
        sm.id AS member_id,
        sm.role,
        sm.is_active,
        sm.created_at AS joined_at,
        p.display_name,
        CASE
            WHEN au.email IS NULL THEN NULL
            WHEN position('@' IN au.email) <= 2 THEN '***' || substring(au.email FROM position('@' IN au.email))
            ELSE left(au.email, 2) || '***' || substring(au.email FROM position('@' IN au.email))
        END AS masked_email
    FROM public.store_members sm
    LEFT JOIN public.profiles p ON p.id = sm.user_id
    LEFT JOIN auth.users au ON au.id = sm.user_id
    WHERE sm.store_id = v_store_id
    ORDER BY sm.created_at ASC;
END;
$$;

-- Permissions for list_store_members
REVOKE ALL ON FUNCTION public.list_store_members() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_store_members() FROM anon;
GRANT EXECUTE ON FUNCTION public.list_store_members() TO authenticated;

-- ============================================================
-- Step 2: deactivate_store_member
-- ============================================================

CREATE OR REPLACE FUNCTION public.deactivate_store_member(p_member_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid uuid;
    v_store_id uuid;
    v_member public.store_members;
    v_updated integer;
BEGIN
    -- Resolve caller identity
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated: auth.uid() is null';
    END IF;

    -- Validate parameter
    IF p_member_id IS NULL THEN
        RAISE EXCEPTION USING
            ERRCODE = '22023',
            MESSAGE = 'Member ID is required';
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
            MESSAGE = 'Only store owners can deactivate store members';
    END IF;

    -- Fetch the target member (must belong to caller's store)
    SELECT *
      INTO v_member
      FROM public.store_members
     WHERE id = p_member_id
       AND store_id = v_store_id;

    IF v_member.id IS NULL THEN
        RAISE EXCEPTION USING
            ERRCODE = 'P0001',
            MESSAGE = 'Member not found or does not belong to your store';
    END IF;

    -- Block self-deactivation
    IF v_member.user_id = v_uid THEN
        RAISE EXCEPTION USING
            ERRCODE = '22023',
            MESSAGE = 'You cannot deactivate your own membership';
    END IF;

    -- Block deactivating owner role members
    IF v_member.role = 'owner' THEN
        RAISE EXCEPTION USING
            ERRCODE = '22023',
            MESSAGE = 'Cannot deactivate an owner role member';
    END IF;

    -- Idempotent: if already inactive, return true
    IF v_member.is_active = false THEN
        RETURN true;
    END IF;

    -- Perform deactivation (NO DELETE — only soft deactivation)
    UPDATE public.store_members
       SET is_active = false,
           updated_at = now()
     WHERE id = p_member_id
       AND store_id = v_store_id;

    GET DIAGNOSTICS v_updated = ROW_COUNT;

    RETURN v_updated > 0;
END;
$$;

-- Permissions for deactivate_store_member
REVOKE ALL ON FUNCTION public.deactivate_store_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.deactivate_store_member(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.deactivate_store_member(uuid) TO authenticated;
