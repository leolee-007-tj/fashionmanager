-- ============================================================
-- Migration 20260711001800: Soft Delete Product By ID (uuid)
-- ============================================================
--
-- PURPOSE:
--   기존 soft_delete_product RPC가 p_legacy_id(bigint)만 지원하여
--   remote_id(uuid)만 있는 상품(예: Supabase 직접 등록 상품)의
--   삭제가 불가능했다. 본 RPC는 p_product_id(uuid)로 삭제하여
--   모든 상품의 삭제를 가능하게 한다.
--
--   BLOCKER-FIX-6: Universal product delete.
--   삭제 키 우선순위: remote_id > legacy_id > id
--   remote_id = products.id (uuid) 이므로 p_product_id로 전달.
--
-- RPCs:
--   1. public.soft_delete_product_by_id - set deleted_at = now() by product uuid
--
-- PROPERTIES:
--   - SECURITY DEFINER, SET search_path = ''
--   - All relations schema-qualified
--   - No dynamic SQL
--   - auth.uid() required
--   - store membership + role check (owner / manager only)
--   - Cross-store access blocked
--   - Hard delete NOT used
-- ============================================================

-- Drop existing if re-running
DROP FUNCTION IF EXISTS public.soft_delete_product_by_id(uuid, uuid);

-- ============================================================
-- RPC: soft_delete_product_by_id
-- ============================================================
-- Soft delete by product uuid (remote_id). Returns deleted row.
CREATE OR REPLACE FUNCTION public.soft_delete_product_by_id(
    p_store_id uuid,
    p_product_id uuid
)
RETURNS TABLE (
    id uuid,
    legacy_id bigint,
    store_id uuid,
    product_code text,
    original_title text,
    brand text,
    deleted_at timestamptz,
    updated_by uuid,
    updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid uuid;
    v_role public.member_role;
    v_now timestamptz;
    v_product_id uuid;
BEGIN
    -- 1. Auth check
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;

    -- 2. Store exists and not deleted
    IF NOT EXISTS (
        SELECT 1 FROM public.stores s
        WHERE s.id = p_store_id
          AND s.deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'Store not found or is deleted' USING ERRCODE = '22023';
    END IF;

    -- 3. Store membership + role check (owner / manager only)
    v_role := private.current_store_role(p_store_id);
    IF v_role IS NULL OR v_role NOT IN ('owner', 'manager') THEN
        RAISE EXCEPTION 'Insufficient permissions' USING ERRCODE = '42501';
    END IF;

    -- 4. Locate active product by store_id + id (uuid)
    SELECT p.id INTO v_product_id
    FROM public.products p
    WHERE p.store_id = p_store_id
      AND p.id = p_product_id
      AND p.deleted_at IS NULL
    LIMIT 1;

    IF v_product_id IS NULL THEN
        RAISE EXCEPTION 'Product not found or already deleted' USING ERRCODE = '22023';
    END IF;

    -- 5. Soft delete (set deleted_at)
    v_now := now();
    RETURN QUERY
    UPDATE public.products
    SET
        deleted_at = v_now,
        updated_by = v_uid,
        updated_at = v_now,
        version = public.products.version + 1
    WHERE public.products.id = v_product_id
    RETURNING
        public.products.id,
        public.products.legacy_id,
        public.products.store_id,
        public.products.product_code,
        public.products.original_title,
        public.products.brand,
        public.products.deleted_at,
        public.products.updated_by,
        public.products.updated_at;
END;
$$;

-- ============================================================
-- Permissions
-- ============================================================

-- Revoke all from PUBLIC (includes anon, authenticated, etc.)
REVOKE ALL ON FUNCTION public.soft_delete_product_by_id(uuid, uuid) FROM PUBLIC;

-- Grant execute to authenticated only
GRANT EXECUTE ON FUNCTION public.soft_delete_product_by_id(uuid, uuid) TO authenticated;

-- ============================================================
-- REQUIRES_USER_APPROVAL_FOR_REMOTE_MIGRATION
-- ============================================================
-- Supabase 원격 DB에 이 migration을 적용하려면
-- `supabase db push` 또는 Supabase SQL Editor를 통해
-- 사용자가 직접 승인 후 실행해야 한다.
-- 본 파일은 로컬 저장소에만 추가되며, 원격 DB는 자동 변경되지 않는다.