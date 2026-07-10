-- ============================================================
-- Private schema for RLS helper functions
-- ============================================================

CREATE SCHEMA IF NOT EXISTS private;

-- ============================================================
-- is_store_member: checks if the current user is an active member of the store
-- Returns false if auth.uid() is null
-- SECURITY DEFINER: must bypass store_members RLS to avoid infinite recursion
-- ============================================================

CREATE OR REPLACE FUNCTION private.is_store_member(target_store_id uuid)
RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.store_members
        WHERE store_id = target_store_id
          AND user_id = auth.uid()
          AND is_active = true
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '';

-- ============================================================
-- current_store_role: returns the current user's role in the store
-- Returns null if not a member or auth.uid() is null
-- SECURITY DEFINER: must bypass store_members RLS to avoid infinite recursion
-- ============================================================

CREATE OR REPLACE FUNCTION private.current_store_role(target_store_id uuid)
RETURNS public.member_role AS $$
DECLARE
    v_role public.member_role;
BEGIN
    SELECT role INTO v_role
    FROM public.store_members
    WHERE store_id = target_store_id
      AND user_id = auth.uid()
      AND is_active = true;

    RETURN v_role;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '';

-- ============================================================
-- has_store_role: checks if the current user has one of the allowed roles
-- Returns false if auth.uid() is null or role does not match
-- SECURITY DEFINER: must bypass store_members RLS to avoid infinite recursion
-- ============================================================

CREATE OR REPLACE FUNCTION private.has_store_role(
    target_store_id uuid,
    allowed_roles public.member_role[]
)
RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.store_members
        WHERE store_id = target_store_id
          AND user_id = auth.uid()
          AND is_active = true
          AND role = ANY(allowed_roles)
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '';

-- ============================================================
-- Permissions: lock down helper functions
-- ============================================================

-- Revoke all access from PUBLIC (includes anon, authenticated, and all roles)
REVOKE ALL ON FUNCTION private.is_store_member FROM PUBLIC;
REVOKE ALL ON FUNCTION private.current_store_role FROM PUBLIC;
REVOKE ALL ON FUNCTION private.has_store_role FROM PUBLIC;

-- Grant execute only to authenticated users
GRANT EXECUTE ON FUNCTION private.is_store_member TO authenticated;
GRANT EXECUTE ON FUNCTION private.current_store_role TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_store_role TO authenticated;