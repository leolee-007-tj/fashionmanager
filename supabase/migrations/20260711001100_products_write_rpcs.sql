-- ============================================================
-- Migration 20260711001100: Products Write RPCs
-- ============================================================
--
-- PURPOSE:
--   SECURITY DEFINER RPCs for product write operations.
--   Direct table UPDATE on public.products is revoked from
--   the authenticated role at the table level (see migration
--   20260711000900, line REVOKE UPDATE ON public.products FROM
--   authenticated). A column-level GRANT on deleted_at enables
--   soft delete via direct UPDATE, but full product updates
--   require these SECURITY DEFINER RPCs.
--
--   Owner and manager roles can create / update / soft-delete
--   products. Staff and non-members are blocked.
--
-- RPCs:
--   1. public.create_product      - insert a new product
--   2. public.update_product      - update product fields
--   3. public.soft_delete_product - set deleted_at = now()
--
-- PROPERTIES:
--   - SECURITY DEFINER, SET search_path = ''
--   - All relations schema-qualified
--   - No dynamic SQL
--   - auth.uid() required
--   - store membership + role check (owner / manager only)
--   - deleted store check
--   - Cross-store access blocked
--   - Immutable fields protected in update_product
--     (id, legacy_id, store_id, created_at, created_by)
--   - Soft delete only — no hard DELETE anywhere
--   - Explicit column list in RETURNS
--
-- ============================================================

-- ============================================================
-- 1. create_product
-- ============================================================
-- Creates a new product with owner/manager permission.
-- store_id is forced to p_store_id.
-- created_by / updated_by are set to auth.uid().
-- legacy_id is preserved if provided (for import/legacy sync).

CREATE OR REPLACE FUNCTION public.create_product(
    p_store_id uuid,
    p_product_code text,
    p_original_title text,
    p_brand text,
    p_normalized_title text DEFAULT NULL,
    p_title_language text DEFAULT NULL,
    p_category text DEFAULT NULL,
    p_color text DEFAULT NULL,
    p_size text DEFAULT NULL,
    p_material text DEFAULT NULL,
    p_season text DEFAULT NULL,
    p_fit text DEFAULT NULL,
    p_style text DEFAULT NULL,
    p_classification_status text DEFAULT NULL,
    p_korea_cost numeric DEFAULT NULL,
    p_actual_converted_cost numeric DEFAULT NULL,
    p_china_base_price numeric DEFAULT NULL,
    p_current_stock integer DEFAULT 0,
    p_reserved_stock integer DEFAULT 0,
    p_stock_year integer DEFAULT NULL,
    p_stock_month integer DEFAULT NULL,
    p_image text DEFAULT NULL,
    p_notes text DEFAULT NULL,
    p_legacy_id bigint DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    legacy_id bigint,
    store_id uuid,
    product_code text,
    original_title text,
    normalized_title text,
    title_language text,
    brand text,
    category text,
    color text,
    size text,
    material text,
    season text,
    fit text,
    style text,
    classification_status text,
    korea_cost numeric,
    actual_converted_cost numeric,
    china_base_price numeric,
    current_stock integer,
    reserved_stock integer,
    stock_year integer,
    stock_month integer,
    image text,
    notes text,
    created_by uuid,
    updated_by uuid,
    created_at timestamptz,
    updated_at timestamptz,
    deleted_at timestamptz,
    version integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid uuid;
    v_role public.member_role;
    v_now timestamptz;
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

    -- 4. Validate required fields
    IF p_product_code IS NULL OR TRIM(p_product_code) = '' THEN
        RAISE EXCEPTION 'product_code is required' USING ERRCODE = '22023';
    END IF;
    IF p_original_title IS NULL OR TRIM(p_original_title) = '' THEN
        RAISE EXCEPTION 'original_title is required' USING ERRCODE = '22023';
    END IF;
    IF p_brand IS NULL OR TRIM(p_brand) = '' THEN
        RAISE EXCEPTION 'brand is required' USING ERRCODE = '22023';
    END IF;

    -- 5. Defaults
    v_now := now();
    IF p_current_stock IS NULL THEN p_current_stock := 0; END IF;
    IF p_reserved_stock IS NULL THEN p_reserved_stock := 0; END IF;

    -- 6. Insert
    RETURN QUERY
    INSERT INTO public.products (
        store_id,
        product_code,
        original_title,
        normalized_title,
        title_language,
        brand,
        category,
        color,
        size,
        material,
        season,
        fit,
        style,
        classification_status,
        korea_cost,
        actual_converted_cost,
        china_base_price,
        current_stock,
        reserved_stock,
        stock_year,
        stock_month,
        image,
        notes,
        legacy_id,
        created_by,
        updated_by,
        created_at,
        updated_at,
        deleted_at,
        version
    ) VALUES (
        p_store_id,
        TRIM(p_product_code),
        TRIM(p_original_title),
        NULLIF(TRIM(COALESCE(p_normalized_title, '')), ''),
        NULLIF(TRIM(COALESCE(p_title_language, '')), ''),
        TRIM(p_brand),
        NULLIF(TRIM(COALESCE(p_category, '')), ''),
        NULLIF(TRIM(COALESCE(p_color, '')), ''),
        NULLIF(TRIM(COALESCE(p_size, '')), ''),
        NULLIF(TRIM(COALESCE(p_material, '')), ''),
        NULLIF(TRIM(COALESCE(p_season, '')), ''),
        NULLIF(TRIM(COALESCE(p_fit, '')), ''),
        NULLIF(TRIM(COALESCE(p_style, '')), ''),
        NULLIF(TRIM(COALESCE(p_classification_status, '')), ''),
        p_korea_cost,
        p_actual_converted_cost,
        p_china_base_price,
        p_current_stock,
        p_reserved_stock,
        p_stock_year,
        p_stock_month,
        NULLIF(TRIM(COALESCE(p_image, '')), ''),
        NULLIF(TRIM(COALESCE(p_notes, '')), ''),
        p_legacy_id,
        v_uid,
        v_uid,
        v_now,
        v_now,
        NULL,
        1
    )
    RETURNING
        public.products.id,
        public.products.legacy_id,
        public.products.store_id,
        public.products.product_code,
        public.products.original_title,
        public.products.normalized_title,
        public.products.title_language,
        public.products.brand,
        public.products.category,
        public.products.color,
        public.products.size,
        public.products.material,
        public.products.season,
        public.products.fit,
        public.products.style,
        public.products.classification_status,
        public.products.korea_cost,
        public.products.actual_converted_cost,
        public.products.china_base_price,
        public.products.current_stock,
        public.products.reserved_stock,
        public.products.stock_year,
        public.products.stock_month,
        public.products.image,
        public.products.notes,
        public.products.created_by,
        public.products.updated_by,
        public.products.created_at,
        public.products.updated_at,
        public.products.deleted_at,
        public.products.version;
END;
$$;

-- ============================================================
-- 2. update_product
-- ============================================================
-- Updates mutable product fields.
-- Identified by p_store_id + p_legacy_id (active product only).
-- Immutable fields: id, legacy_id, store_id, created_at, created_by
-- updated_by / updated_at are set by the RPC.
-- Solves the table-level UPDATE revocation for authenticated role.

CREATE OR REPLACE FUNCTION public.update_product(
    p_store_id uuid,
    p_legacy_id bigint,
    p_product_code text DEFAULT NULL,
    p_original_title text DEFAULT NULL,
    p_normalized_title text DEFAULT NULL,
    p_title_language text DEFAULT NULL,
    p_brand text DEFAULT NULL,
    p_category text DEFAULT NULL,
    p_color text DEFAULT NULL,
    p_size text DEFAULT NULL,
    p_material text DEFAULT NULL,
    p_season text DEFAULT NULL,
    p_fit text DEFAULT NULL,
    p_style text DEFAULT NULL,
    p_classification_status text DEFAULT NULL,
    p_korea_cost numeric DEFAULT NULL,
    p_actual_converted_cost numeric DEFAULT NULL,
    p_china_base_price numeric DEFAULT NULL,
    p_current_stock integer DEFAULT NULL,
    p_reserved_stock integer DEFAULT NULL,
    p_stock_year integer DEFAULT NULL,
    p_stock_month integer DEFAULT NULL,
    p_image text DEFAULT NULL,
    p_notes text DEFAULT NULL,
    p_version integer DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    legacy_id bigint,
    store_id uuid,
    product_code text,
    original_title text,
    normalized_title text,
    title_language text,
    brand text,
    category text,
    color text,
    size text,
    material text,
    season text,
    fit text,
    style text,
    classification_status text,
    korea_cost numeric,
    actual_converted_cost numeric,
    china_base_price numeric,
    current_stock integer,
    reserved_stock integer,
    stock_year integer,
    stock_month integer,
    image text,
    notes text,
    created_by uuid,
    updated_by uuid,
    created_at timestamptz,
    updated_at timestamptz,
    deleted_at timestamptz,
    version integer
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

    -- 4. Locate active product by store_id + legacy_id
    SELECT p.id INTO v_product_id
    FROM public.products p
    WHERE p.store_id = p_store_id
      AND p.legacy_id = p_legacy_id
      AND p.deleted_at IS NULL
    LIMIT 1;

    IF v_product_id IS NULL THEN
        RAISE EXCEPTION 'Product not found' USING ERRCODE = '22023';
    END IF;

    -- 5. Defaults
    v_now := now();

    -- 6. Update — only mutable fields, immutable fields are never touched.
    --    Fields that are NULL are not changed (COALESCE preserves existing).
    RETURN QUERY
    UPDATE public.products
    SET
        product_code = COALESCE(NULLIF(TRIM(p_product_code), ''), public.products.product_code),
        original_title = COALESCE(NULLIF(TRIM(p_original_title), ''), public.products.original_title),
        normalized_title = CASE
            WHEN p_normalized_title IS NOT NULL THEN NULLIF(TRIM(p_normalized_title), '')
            ELSE public.products.normalized_title
        END,
        title_language = CASE
            WHEN p_title_language IS NOT NULL THEN NULLIF(TRIM(p_title_language), '')
            ELSE public.products.title_language
        END,
        brand = COALESCE(NULLIF(TRIM(p_brand), ''), public.products.brand),
        category = CASE
            WHEN p_category IS NOT NULL THEN NULLIF(TRIM(p_category), '')
            ELSE public.products.category
        END,
        color = CASE
            WHEN p_color IS NOT NULL THEN NULLIF(TRIM(p_color), '')
            ELSE public.products.color
        END,
        size = CASE
            WHEN p_size IS NOT NULL THEN NULLIF(TRIM(p_size), '')
            ELSE public.products.size
        END,
        material = CASE
            WHEN p_material IS NOT NULL THEN NULLIF(TRIM(p_material), '')
            ELSE public.products.material
        END,
        season = CASE
            WHEN p_season IS NOT NULL THEN NULLIF(TRIM(p_season), '')
            ELSE public.products.season
        END,
        fit = CASE
            WHEN p_fit IS NOT NULL THEN NULLIF(TRIM(p_fit), '')
            ELSE public.products.fit
        END,
        style = CASE
            WHEN p_style IS NOT NULL THEN NULLIF(TRIM(p_style), '')
            ELSE public.products.style
        END,
        classification_status = CASE
            WHEN p_classification_status IS NOT NULL THEN NULLIF(TRIM(p_classification_status), '')
            ELSE public.products.classification_status
        END,
        korea_cost = CASE WHEN p_korea_cost IS NOT NULL THEN p_korea_cost ELSE public.products.korea_cost END,
        actual_converted_cost = CASE WHEN p_actual_converted_cost IS NOT NULL THEN p_actual_converted_cost ELSE public.products.actual_converted_cost END,
        china_base_price = CASE WHEN p_china_base_price IS NOT NULL THEN p_china_base_price ELSE public.products.china_base_price END,
        current_stock = CASE WHEN p_current_stock IS NOT NULL THEN p_current_stock ELSE public.products.current_stock END,
        reserved_stock = CASE WHEN p_reserved_stock IS NOT NULL THEN p_reserved_stock ELSE public.products.reserved_stock END,
        stock_year = CASE WHEN p_stock_year IS NOT NULL THEN p_stock_year ELSE public.products.stock_year END,
        stock_month = CASE WHEN p_stock_month IS NOT NULL THEN p_stock_month ELSE public.products.stock_month END,
        image = CASE
            WHEN p_image IS NOT NULL THEN NULLIF(TRIM(p_image), '')
            ELSE public.products.image
        END,
        notes = CASE
            WHEN p_notes IS NOT NULL THEN NULLIF(TRIM(p_notes), '')
            ELSE public.products.notes
        END,
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
        public.products.normalized_title,
        public.products.title_language,
        public.products.brand,
        public.products.category,
        public.products.color,
        public.products.size,
        public.products.material,
        public.products.season,
        public.products.fit,
        public.products.style,
        public.products.classification_status,
        public.products.korea_cost,
        public.products.actual_converted_cost,
        public.products.china_base_price,
        public.products.current_stock,
        public.products.reserved_stock,
        public.products.stock_year,
        public.products.stock_month,
        public.products.image,
        public.products.notes,
        public.products.created_by,
        public.products.updated_by,
        public.products.created_at,
        public.products.updated_at,
        public.products.deleted_at,
        public.products.version;
END;
$$;

-- ============================================================
-- 3. soft_delete_product
-- ============================================================
-- Sets deleted_at = now() on a product.
-- Identified by p_store_id + p_legacy_id (active product only).
-- Hard DELETE is never performed.
-- updated_by / updated_at are also set.

CREATE OR REPLACE FUNCTION public.soft_delete_product(
    p_store_id uuid,
    p_legacy_id bigint
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

    -- 4. Locate active product by store_id + legacy_id
    SELECT p.id INTO v_product_id
    FROM public.products p
    WHERE p.store_id = p_store_id
      AND p.legacy_id = p_legacy_id
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
REVOKE ALL ON FUNCTION public.create_product(uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, numeric, numeric, numeric, integer, integer, integer, integer, text, text, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_product(uuid, bigint, text, text, text, text, text, text, text, text, text, text, text, text, text, numeric, numeric, numeric, integer, integer, integer, integer, text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.soft_delete_product(uuid, bigint) FROM PUBLIC;

-- Grant execute to authenticated only
GRANT EXECUTE ON FUNCTION public.create_product(uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, numeric, numeric, numeric, integer, integer, integer, integer, text, text, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_product(uuid, bigint, text, text, text, text, text, text, text, text, text, text, text, text, text, numeric, numeric, numeric, integer, integer, integer, integer, text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_product(uuid, bigint) TO authenticated;