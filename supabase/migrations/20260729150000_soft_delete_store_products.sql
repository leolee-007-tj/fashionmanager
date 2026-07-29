-- BLOCKER-FIX-6: Bulk soft delete all products for a store.
-- Used for emergency cleanup: soft deletes all non-deleted products in a store.
-- SECURITY DEFINER, owner/manager only, soft delete only (no hard delete).

-- Drop existing if any (for idempotent re-run)
DROP FUNCTION IF EXISTS public.soft_delete_store_products(uuid);

-- RPC: soft_delete_store_products
CREATE OR REPLACE FUNCTION public.soft_delete_store_products(
    p_store_id uuid
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
    updated_at timestamptz,
    deleted_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid uuid;
    v_role public.member_role;
    v_now timestamptz;
    v_count bigint;
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

    -- 4. Soft delete all non-deleted products in the store (single UPDATE)
    v_now := now();
    RETURN QUERY
    WITH updated AS (
        UPDATE public.products
        SET
            deleted_at = v_now,
            updated_by = v_uid,
            updated_at = v_now,
            version = public.products.version + 1
        WHERE public.products.store_id = p_store_id
          AND public.products.deleted_at IS NULL
        RETURNING
            public.products.id,
            public.products.legacy_id,
            public.products.store_id,
            public.products.product_code,
            public.products.original_title,
            public.products.brand,
            public.products.deleted_at,
            public.products.updated_by,
            public.products.updated_at
    ),
    counted AS (
        SELECT COUNT(*) AS cnt FROM updated
    )
    SELECT
        u.id,
        u.legacy_id,
        u.store_id,
        u.product_code,
        u.original_title,
        u.brand,
        u.deleted_at,
        u.updated_by,
        u.updated_at,
        c.cnt AS deleted_count
    FROM updated u, counted c;
END;
$$;

-- Revoke all from PUBLIC
REVOKE ALL ON FUNCTION public.soft_delete_store_products(uuid) FROM PUBLIC;

-- Grant execute to authenticated only
GRANT EXECUTE ON FUNCTION public.soft_delete_store_products(uuid) TO authenticated;