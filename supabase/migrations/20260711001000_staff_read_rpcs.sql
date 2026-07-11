-- ============================================================
-- Migration 20260711001000: Staff Read RPCs
-- ============================================================
--
-- PURPOSE:
--   Restricted read-only SECURITY DEFINER RPCs for staff users.
--   Staff cannot see base tables directly (RLS returns 0 rows),
--   so these RPCs provide safe, column-limited operational data.
--
-- RPCs:
--   1. public.list_staff_products  - products without cost/profit fields
--   2. public.list_staff_customers - customers without aggregates/private fields
--   3. public.list_staff_orders    - orders without cost/profit fields
--
-- PROPERTIES:
--   - SECURITY DEFINER, SET search_path = ''
--   - STABLE, read-only
--   - All relations schema-qualified
--   - No dynamic SQL
--   - auth.uid() + store membership check
--   - Pagination: limit (1..200), offset (>=0)
--   - Search: ILIKE on safe columns, static SQL only
--
-- ============================================================

-- ============================================================
-- 1. list_staff_products
-- ============================================================

CREATE OR REPLACE FUNCTION public.list_staff_products(
    p_store_id uuid,
    p_search text DEFAULT NULL,
    p_limit integer DEFAULT 100,
    p_offset integer DEFAULT 0
)
RETURNS TABLE (
    id uuid,
    store_id uuid,
    product_code text,
    original_title text,
    normalized_title text,
    brand text,
    category text,
    color text,
    size text,
    material text,
    season text,
    fit text,
    style text,
    current_stock integer,
    reserved_stock integer,
    available_stock integer,
    stock_year integer,
    stock_month integer,
    image text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid uuid;
    v_role public.member_role;
    v_search text;
BEGIN
    -- 1. Auth check
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;

    -- 2. Store membership check
    v_role := private.current_store_role(p_store_id);
    IF v_role IS NULL THEN
        RAISE EXCEPTION 'Insufficient permissions' USING ERRCODE = '42501';
    END IF;

    -- 3. Store exists and not deleted
    IF NOT EXISTS (
        SELECT 1 FROM public.stores s
        WHERE s.id = p_store_id
          AND s.deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'Store not found or is deleted' USING ERRCODE = '22023';
    END IF;

    -- 4. Pagination validation
    IF p_limit IS NULL OR p_limit < 1 OR p_limit > 200 THEN
        RAISE EXCEPTION 'p_limit must be between 1 and 200' USING ERRCODE = '22023';
    END IF;
    IF p_offset IS NULL OR p_offset < 0 THEN
        RAISE EXCEPTION 'p_offset must be >= 0' USING ERRCODE = '22023';
    END IF;

    -- 5. Search normalization
    v_search := NULLIF(TRIM(COALESCE(p_search, '')), '');
    IF v_search IS NOT NULL AND char_length(v_search) > 100 THEN
        RAISE EXCEPTION 'p_search must be 100 characters or less' USING ERRCODE = '22023';
    END IF;

    -- 6. Return query
    RETURN QUERY
    SELECT
        p.id AS id,
        p.store_id AS store_id,
        p.product_code,
        p.original_title,
        p.normalized_title,
        p.brand,
        p.category,
        p.color,
        p.size,
        p.material,
        p.season,
        p.fit,
        p.style,
        p.current_stock,
        p.reserved_stock,
        (p.current_stock - p.reserved_stock)::integer AS available_stock,
        p.stock_year,
        p.stock_month,
        p.image
    FROM public.products p
    WHERE p.store_id = p_store_id
      AND p.deleted_at IS NULL
      AND (
        v_search IS NULL
        OR p.product_code ILIKE '%' || v_search || '%'
        OR p.original_title ILIKE '%' || v_search || '%'
        OR p.normalized_title ILIKE '%' || v_search || '%'
        OR p.brand ILIKE '%' || v_search || '%'
        OR p.category ILIKE '%' || v_search || '%'
        OR p.color ILIKE '%' || v_search || '%'
        OR p.size ILIKE '%' || v_search || '%'
      )
    ORDER BY p.original_title ASC, p.id ASC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

-- ============================================================
-- 2. list_staff_customers
-- ============================================================

CREATE OR REPLACE FUNCTION public.list_staff_customers(
    p_store_id uuid,
    p_search text DEFAULT NULL,
    p_limit integer DEFAULT 100,
    p_offset integer DEFAULT 0
)
RETURNS TABLE (
    id uuid,
    store_id uuid,
    name text,
    wechat_nickname text,
    phone text,
    address text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid uuid;
    v_role public.member_role;
    v_search text;
BEGIN
    -- 1. Auth check
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;

    -- 2. Store membership check
    v_role := private.current_store_role(p_store_id);
    IF v_role IS NULL THEN
        RAISE EXCEPTION 'Insufficient permissions' USING ERRCODE = '42501';
    END IF;

    -- 3. Store exists and not deleted
    IF NOT EXISTS (
        SELECT 1 FROM public.stores s
        WHERE s.id = p_store_id
          AND s.deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'Store not found or is deleted' USING ERRCODE = '22023';
    END IF;

    -- 4. Pagination validation
    IF p_limit IS NULL OR p_limit < 1 OR p_limit > 200 THEN
        RAISE EXCEPTION 'p_limit must be between 1 and 200' USING ERRCODE = '22023';
    END IF;
    IF p_offset IS NULL OR p_offset < 0 THEN
        RAISE EXCEPTION 'p_offset must be >= 0' USING ERRCODE = '22023';
    END IF;

    -- 5. Search normalization
    v_search := NULLIF(TRIM(COALESCE(p_search, '')), '');
    IF v_search IS NOT NULL AND char_length(v_search) > 100 THEN
        RAISE EXCEPTION 'p_search must be 100 characters or less' USING ERRCODE = '22023';
    END IF;

    -- 6. Return query
    RETURN QUERY
    SELECT
        c.id AS id,
        c.store_id AS store_id,
        c.name AS name,
        c.wechat_nickname,
        c.phone,
        c.address
    FROM public.customers c
    WHERE c.store_id = p_store_id
      AND c.deleted_at IS NULL
      AND (
        v_search IS NULL
        OR c.name ILIKE '%' || v_search || '%'
        OR c.wechat_nickname ILIKE '%' || v_search || '%'
        OR c.phone ILIKE '%' || v_search || '%'
      )
    ORDER BY c.name ASC, c.id ASC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

-- ============================================================
-- 3. list_staff_orders
-- ============================================================

CREATE OR REPLACE FUNCTION public.list_staff_orders(
    p_store_id uuid,
    p_search text DEFAULT NULL,
    p_limit integer DEFAULT 100,
    p_offset integer DEFAULT 0
)
RETURNS TABLE (
    id uuid,
    store_id uuid,
    order_number text,
    customer_id uuid,
    product_id uuid,
    customer_name_snapshot text,
    product_title_snapshot text,
    brand_snapshot text,
    category_snapshot text,
    color_snapshot text,
    size_snapshot text,
    quantity integer,
    selling_price numeric,
    status public.order_status,
    order_date date,
    ship_date date,
    shipping_company text,
    tracking_number text,
    notes text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid uuid;
    v_role public.member_role;
    v_search text;
BEGIN
    -- 1. Auth check
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;

    -- 2. Store membership check
    v_role := private.current_store_role(p_store_id);
    IF v_role IS NULL THEN
        RAISE EXCEPTION 'Insufficient permissions' USING ERRCODE = '42501';
    END IF;

    -- 3. Store exists and not deleted
    IF NOT EXISTS (
        SELECT 1 FROM public.stores s
        WHERE s.id = p_store_id
          AND s.deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'Store not found or is deleted' USING ERRCODE = '22023';
    END IF;

    -- 4. Pagination validation
    IF p_limit IS NULL OR p_limit < 1 OR p_limit > 200 THEN
        RAISE EXCEPTION 'p_limit must be between 1 and 200' USING ERRCODE = '22023';
    END IF;
    IF p_offset IS NULL OR p_offset < 0 THEN
        RAISE EXCEPTION 'p_offset must be >= 0' USING ERRCODE = '22023';
    END IF;

    -- 5. Search normalization
    v_search := NULLIF(TRIM(COALESCE(p_search, '')), '');
    IF v_search IS NOT NULL AND char_length(v_search) > 100 THEN
        RAISE EXCEPTION 'p_search must be 100 characters or less' USING ERRCODE = '22023';
    END IF;

    -- 6. Return query - uses order snapshots, no join to base tables
    RETURN QUERY
    SELECT
        o.id AS id,
        o.store_id AS store_id,
        o.order_number AS order_number,
        o.customer_id,
        o.product_id,
        o.customer_name_snapshot,
        o.product_title_snapshot,
        o.brand_snapshot,
        o.category_snapshot,
        o.color_snapshot,
        o.size_snapshot,
        o.quantity,
        o.selling_price,
        o.status,
        o.order_date,
        o.ship_date,
        o.shipping_company,
        o.tracking_number,
        o.notes
    FROM public.orders o
    WHERE o.store_id = p_store_id
      AND o.deleted_at IS NULL
      AND (
        v_search IS NULL
        OR o.order_number ILIKE '%' || v_search || '%'
        OR o.customer_name_snapshot ILIKE '%' || v_search || '%'
        OR o.product_title_snapshot ILIKE '%' || v_search || '%'
        OR o.brand_snapshot ILIKE '%' || v_search || '%'
        OR o.tracking_number ILIKE '%' || v_search || '%'
      )
    ORDER BY o.order_date DESC NULLS LAST, o.id DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

-- ============================================================
-- 4. Function permissions
-- ============================================================

-- list_staff_products
REVOKE ALL ON FUNCTION public.list_staff_products(uuid, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_staff_products(uuid, text, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.list_staff_products(uuid, text, integer, integer) TO authenticated;

-- list_staff_customers
REVOKE ALL ON FUNCTION public.list_staff_customers(uuid, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_staff_customers(uuid, text, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.list_staff_customers(uuid, text, integer, integer) TO authenticated;

-- list_staff_orders
REVOKE ALL ON FUNCTION public.list_staff_orders(uuid, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_staff_orders(uuid, text, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.list_staff_orders(uuid, text, integer, integer) TO authenticated;
