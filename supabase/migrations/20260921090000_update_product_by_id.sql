-- Allow owner/manager users to update products that have no legacy_id.
-- The browser sends the immutable product UUID plus a strictly whitelisted JSON object.

CREATE OR REPLACE FUNCTION public.update_product_by_id(
    p_store_id uuid,
    p_product_id uuid,
    p_updates jsonb
)
RETURNS SETOF public.products
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid uuid;
    v_role public.member_role;
BEGIN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;

    v_role := private.current_store_role(p_store_id);
    IF v_role IS NULL OR v_role NOT IN ('owner', 'manager') THEN
        RAISE EXCEPTION 'Insufficient permissions' USING ERRCODE = '42501';
    END IF;

    IF p_updates IS NULL OR jsonb_typeof(p_updates) <> 'object' THEN
        RAISE EXCEPTION 'updates must be a JSON object' USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_object_keys(p_updates) AS item(key)
        WHERE item.key NOT IN (
            'product_code', 'original_title', 'normalized_title', 'title_language',
            'brand', 'category', 'color', 'size', 'material', 'season', 'fit',
            'style', 'classification_status', 'korea_cost', 'actual_converted_cost',
            'china_base_price', 'current_stock', 'reserved_stock', 'stock_year',
            'stock_month', 'image', 'notes'
        )
    ) THEN
        RAISE EXCEPTION 'updates contain unsupported fields' USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    UPDATE public.products AS product
       SET product_code = CASE WHEN p_updates ? 'product_code'
                THEN COALESCE(NULLIF(BTRIM(p_updates->>'product_code'), ''), product.product_code)
                ELSE product.product_code END,
           original_title = CASE WHEN p_updates ? 'original_title'
                THEN COALESCE(NULLIF(BTRIM(p_updates->>'original_title'), ''), product.original_title)
                ELSE product.original_title END,
           normalized_title = CASE WHEN p_updates ? 'normalized_title'
                THEN NULLIF(BTRIM(p_updates->>'normalized_title'), '')
                ELSE product.normalized_title END,
           title_language = CASE WHEN p_updates ? 'title_language'
                THEN NULLIF(BTRIM(p_updates->>'title_language'), '')
                ELSE product.title_language END,
           brand = CASE WHEN p_updates ? 'brand'
                THEN COALESCE(NULLIF(BTRIM(p_updates->>'brand'), ''), product.brand)
                ELSE product.brand END,
           category = CASE WHEN p_updates ? 'category'
                THEN NULLIF(BTRIM(p_updates->>'category'), '') ELSE product.category END,
           color = CASE WHEN p_updates ? 'color'
                THEN NULLIF(BTRIM(p_updates->>'color'), '') ELSE product.color END,
           size = CASE WHEN p_updates ? 'size'
                THEN NULLIF(BTRIM(p_updates->>'size'), '') ELSE product.size END,
           material = CASE WHEN p_updates ? 'material'
                THEN NULLIF(BTRIM(p_updates->>'material'), '') ELSE product.material END,
           season = CASE WHEN p_updates ? 'season'
                THEN NULLIF(BTRIM(p_updates->>'season'), '') ELSE product.season END,
           fit = CASE WHEN p_updates ? 'fit'
                THEN NULLIF(BTRIM(p_updates->>'fit'), '') ELSE product.fit END,
           style = CASE WHEN p_updates ? 'style'
                THEN NULLIF(BTRIM(p_updates->>'style'), '') ELSE product.style END,
           classification_status = CASE WHEN p_updates ? 'classification_status'
                THEN NULLIF(BTRIM(p_updates->>'classification_status'), '')
                ELSE product.classification_status END,
           korea_cost = CASE WHEN p_updates ? 'korea_cost'
                THEN COALESCE(NULLIF(p_updates->>'korea_cost', '')::numeric, product.korea_cost)
                ELSE product.korea_cost END,
           actual_converted_cost = CASE WHEN p_updates ? 'actual_converted_cost'
                THEN COALESCE(NULLIF(p_updates->>'actual_converted_cost', '')::numeric, product.actual_converted_cost)
                ELSE product.actual_converted_cost END,
           china_base_price = CASE WHEN p_updates ? 'china_base_price'
                THEN COALESCE(NULLIF(p_updates->>'china_base_price', '')::numeric, product.china_base_price)
                ELSE product.china_base_price END,
           current_stock = CASE WHEN p_updates ? 'current_stock'
                THEN COALESCE(NULLIF(p_updates->>'current_stock', '')::integer, product.current_stock)
                ELSE product.current_stock END,
           reserved_stock = CASE WHEN p_updates ? 'reserved_stock'
                THEN COALESCE(NULLIF(p_updates->>'reserved_stock', '')::integer, product.reserved_stock)
                ELSE product.reserved_stock END,
           stock_year = CASE WHEN p_updates ? 'stock_year'
                THEN COALESCE(NULLIF(p_updates->>'stock_year', '')::integer, product.stock_year)
                ELSE product.stock_year END,
           stock_month = CASE WHEN p_updates ? 'stock_month'
                THEN COALESCE(NULLIF(p_updates->>'stock_month', '')::integer, product.stock_month)
                ELSE product.stock_month END,
           image = CASE WHEN p_updates ? 'image'
                THEN NULLIF(p_updates->>'image', '') ELSE product.image END,
           notes = CASE WHEN p_updates ? 'notes'
                THEN NULLIF(BTRIM(p_updates->>'notes'), '') ELSE product.notes END,
           updated_by = v_uid,
           updated_at = now(),
           version = COALESCE(product.version, 0) + 1
     WHERE product.id = p_product_id
       AND product.store_id = p_store_id
       AND product.deleted_at IS NULL
    RETURNING product.*;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product not found' USING ERRCODE = '22023';
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.update_product_by_id(uuid, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_product_by_id(uuid, uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_product_by_id(uuid, uuid, jsonb) TO authenticated;
