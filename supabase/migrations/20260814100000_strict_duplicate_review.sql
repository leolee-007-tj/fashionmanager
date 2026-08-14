-- Strict duplicate review and deletion workflow.
-- Product identity intentionally includes cost and stock period; order identity
-- includes customer, date, brand, title, quantity, and selling price.

CREATE OR REPLACE FUNCTION public.list_strict_duplicates(p_store_id uuid)
RETURNS TABLE (
    entity_type text,
    group_key text,
    record_id uuid,
    keep_id uuid,
    is_keeper boolean,
    label text,
    details jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role public.member_role;
BEGIN
    v_role := private.current_store_role(p_store_id);
    IF auth.uid() IS NULL OR v_role IS NULL OR v_role <> 'owner'::public.member_role THEN
        RAISE EXCEPTION 'Owner permission required' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    WITH normalized AS (
        SELECT c.*,
               lower(regexp_replace(btrim(c.name), '[[:space:][:punct:]]+', '', 'g')) AS dup_key,
               first_value(c.id) OVER (
                   PARTITION BY c.store_id,
                       lower(regexp_replace(btrim(c.name), '[[:space:][:punct:]]+', '', 'g'))
                   ORDER BY c.created_at, c.id
               ) AS canonical_id,
               count(*) OVER (
                   PARTITION BY c.store_id,
                       lower(regexp_replace(btrim(c.name), '[[:space:][:punct:]]+', '', 'g'))
               ) AS group_count
          FROM public.customers c
         WHERE c.store_id = p_store_id AND c.deleted_at IS NULL
    )
    SELECT 'customer', n.dup_key, n.id, n.canonical_id, n.id = n.canonical_id,
           n.name,
           jsonb_build_object('name', n.name, 'created_at', n.created_at)
      FROM normalized n WHERE n.group_count > 1

    UNION ALL

    SELECT 'product', p.dup_key, p.id, p.canonical_id, p.id = p.canonical_id,
           concat_ws(' / ', p.brand, p.original_title, NULLIF(p.color, ''), NULLIF(p.size, '')),
           jsonb_build_object(
               'brand', p.brand, 'title', p.original_title,
               'color', p.color, 'size', p.size,
               'korea_cost', p.korea_cost, 'stock_year', p.stock_year,
               'stock_month', p.stock_month, 'created_at', p.created_at
           )
      FROM (
          SELECT x.*,
                 concat_ws('|',
                     lower(regexp_replace(btrim(x.brand), '[[:space:][:punct:]]+', '', 'g')),
                     lower(regexp_replace(btrim(x.original_title), '[[:space:][:punct:]]+', '', 'g')),
                     lower(regexp_replace(btrim(COALESCE(x.color, '')), '[[:space:][:punct:]]+', '', 'g')),
                     lower(regexp_replace(btrim(COALESCE(x.size, '')), '[[:space:][:punct:]]+', '', 'g')),
                     COALESCE(round(x.korea_cost)::text, '0'),
                     COALESCE(x.stock_year::text, '0'), COALESCE(x.stock_month::text, '0')
                 ) AS dup_key,
                 first_value(x.id) OVER (
                     PARTITION BY x.store_id,
                         lower(regexp_replace(btrim(x.brand), '[[:space:][:punct:]]+', '', 'g')),
                         lower(regexp_replace(btrim(x.original_title), '[[:space:][:punct:]]+', '', 'g')),
                         lower(regexp_replace(btrim(COALESCE(x.color, '')), '[[:space:][:punct:]]+', '', 'g')),
                         lower(regexp_replace(btrim(COALESCE(x.size, '')), '[[:space:][:punct:]]+', '', 'g')),
                         round(COALESCE(x.korea_cost, 0)), COALESCE(x.stock_year, 0), COALESCE(x.stock_month, 0)
                     ORDER BY x.created_at, x.id
                 ) AS canonical_id,
                 count(*) OVER (
                     PARTITION BY x.store_id,
                         lower(regexp_replace(btrim(x.brand), '[[:space:][:punct:]]+', '', 'g')),
                         lower(regexp_replace(btrim(x.original_title), '[[:space:][:punct:]]+', '', 'g')),
                         lower(regexp_replace(btrim(COALESCE(x.color, '')), '[[:space:][:punct:]]+', '', 'g')),
                         lower(regexp_replace(btrim(COALESCE(x.size, '')), '[[:space:][:punct:]]+', '', 'g')),
                         round(COALESCE(x.korea_cost, 0)), COALESCE(x.stock_year, 0), COALESCE(x.stock_month, 0)
                 ) AS group_count
            FROM public.products x
           WHERE x.store_id = p_store_id AND x.deleted_at IS NULL
      ) p WHERE p.group_count > 1

    UNION ALL

    SELECT 'sale', o.dup_key, o.id, o.canonical_id, o.id = o.canonical_id,
           concat_ws(' / ', o.customer_name_snapshot, o.brand_snapshot, o.product_title_snapshot),
           jsonb_build_object(
               'customer', o.customer_name_snapshot, 'date', o.order_date,
               'brand', o.brand_snapshot, 'title', o.product_title_snapshot,
               'quantity', o.quantity, 'selling_price', o.selling_price,
               'created_at', o.created_at
           )
      FROM (
          SELECT x.*,
                 concat_ws('|',
                     lower(regexp_replace(btrim(COALESCE(x.customer_name_snapshot, '')), '[[:space:][:punct:]]+', '', 'g')),
                     x.order_date::text,
                     lower(regexp_replace(btrim(COALESCE(x.brand_snapshot, '')), '[[:space:][:punct:]]+', '', 'g')),
                     lower(regexp_replace(btrim(COALESCE(x.product_title_snapshot, '')), '[[:space:][:punct:]]+', '', 'g')),
                     x.quantity::text, x.selling_price::text
                 ) AS dup_key,
                 first_value(x.id) OVER (
                     PARTITION BY x.store_id,
                         lower(regexp_replace(btrim(COALESCE(x.customer_name_snapshot, '')), '[[:space:][:punct:]]+', '', 'g')),
                         x.order_date,
                         lower(regexp_replace(btrim(COALESCE(x.brand_snapshot, '')), '[[:space:][:punct:]]+', '', 'g')),
                         lower(regexp_replace(btrim(COALESCE(x.product_title_snapshot, '')), '[[:space:][:punct:]]+', '', 'g')),
                         x.quantity, x.selling_price
                     ORDER BY x.created_at, x.id
                 ) AS canonical_id,
                 count(*) OVER (
                     PARTITION BY x.store_id,
                         lower(regexp_replace(btrim(COALESCE(x.customer_name_snapshot, '')), '[[:space:][:punct:]]+', '', 'g')),
                         x.order_date,
                         lower(regexp_replace(btrim(COALESCE(x.brand_snapshot, '')), '[[:space:][:punct:]]+', '', 'g')),
                         lower(regexp_replace(btrim(COALESCE(x.product_title_snapshot, '')), '[[:space:][:punct:]]+', '', 'g')),
                         x.quantity, x.selling_price
                 ) AS group_count
            FROM public.orders x
           WHERE x.store_id = p_store_id AND x.deleted_at IS NULL
             AND x.status IN ('SHIPPED'::public.order_status, 'COMPLETED'::public.order_status)
      ) o WHERE o.group_count > 1
    ORDER BY 1, 2, 5 DESC, 3;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_strict_duplicates(
    p_store_id uuid,
    p_customer_ids uuid[] DEFAULT ARRAY[]::uuid[],
    p_product_ids uuid[] DEFAULT ARRAY[]::uuid[],
    p_order_ids uuid[] DEFAULT ARRAY[]::uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role public.member_role;
    v_row record;
    v_keep_id uuid;
    v_customers integer := 0;
    v_products integer := 0;
    v_sales integer := 0;
    v_logs integer := 0;
    v_customer record;
BEGIN
    v_role := private.current_store_role(p_store_id);
    IF auth.uid() IS NULL OR v_role IS NULL OR v_role <> 'owner'::public.member_role THEN
        RAISE EXCEPTION 'Owner permission required' USING ERRCODE = '42501';
    END IF;

    FOR v_row IN SELECT * FROM public.list_strict_duplicates(p_store_id)
        WHERE entity_type = 'customer' AND NOT is_keeper
          AND record_id = ANY(COALESCE(p_customer_ids, ARRAY[]::uuid[]))
    LOOP
        UPDATE public.orders SET customer_id = v_row.keep_id
         WHERE store_id = p_store_id AND customer_id = v_row.record_id;
        UPDATE public.customers SET deleted_at = now(), updated_at = now()
         WHERE store_id = p_store_id AND id = v_row.record_id AND deleted_at IS NULL;
        IF FOUND THEN v_customers := v_customers + 1; END IF;
    END LOOP;

    FOR v_row IN SELECT * FROM public.list_strict_duplicates(p_store_id)
        WHERE entity_type = 'product' AND NOT is_keeper
          AND record_id = ANY(COALESCE(p_product_ids, ARRAY[]::uuid[]))
    LOOP
        v_keep_id := v_row.keep_id;
        UPDATE public.orders SET product_id = v_keep_id
         WHERE store_id = p_store_id AND product_id = v_row.record_id;
        UPDATE public.inventory_logs SET product_id = v_keep_id
         WHERE store_id = p_store_id AND product_id = v_row.record_id;
        UPDATE public.products SET deleted_at = now(), current_stock = 0,
               reserved_stock = 0, updated_at = now()
         WHERE store_id = p_store_id AND id = v_row.record_id AND deleted_at IS NULL;
        IF FOUND THEN v_products := v_products + 1; END IF;
    END LOOP;

    DELETE FROM public.inventory_logs l
     WHERE l.store_id = p_store_id
       AND l.order_id = ANY(COALESCE(p_order_ids, ARRAY[]::uuid[]))
       AND EXISTS (
           SELECT 1 FROM public.list_strict_duplicates(p_store_id) d
            WHERE d.entity_type = 'sale' AND NOT d.is_keeper
              AND d.record_id = l.order_id
       );
    GET DIAGNOSTICS v_logs = ROW_COUNT;

    DELETE FROM public.orders o
     WHERE o.store_id = p_store_id
       AND o.id = ANY(COALESCE(p_order_ids, ARRAY[]::uuid[]))
       AND EXISTS (
           SELECT 1 FROM public.list_strict_duplicates(p_store_id) d
            WHERE d.entity_type = 'sale' AND NOT d.is_keeper
              AND d.record_id = o.id
       );
    GET DIAGNOSTICS v_sales = ROW_COUNT;

    UPDATE public.products p SET reserved_stock = COALESCE((
        SELECT sum(o.quantity)::integer FROM public.orders o
         WHERE o.product_id = p.id AND o.store_id = p_store_id
           AND o.deleted_at IS NULL AND o.status = 'PENDING'::public.order_status
    ), 0), updated_at = now()
    WHERE p.store_id = p_store_id AND p.deleted_at IS NULL;

    FOR v_customer IN SELECT id FROM public.customers
        WHERE store_id = p_store_id AND deleted_at IS NULL
    LOOP
        PERFORM private.recalculate_customer_aggregates(v_customer.id);
    END LOOP;

    RETURN jsonb_build_object(
        'customers_deleted', v_customers, 'products_deleted', v_products,
        'sales_deleted', v_sales, 'inventory_logs_deleted', v_logs
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_strict_duplicates(p_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_customer_ids uuid[];
    v_product_ids uuid[];
    v_order_ids uuid[];
BEGIN
    SELECT COALESCE(array_agg(record_id) FILTER (WHERE entity_type = 'customer' AND NOT is_keeper), ARRAY[]::uuid[]),
           COALESCE(array_agg(record_id) FILTER (WHERE entity_type = 'product' AND NOT is_keeper), ARRAY[]::uuid[]),
           COALESCE(array_agg(record_id) FILTER (WHERE entity_type = 'sale' AND NOT is_keeper), ARRAY[]::uuid[])
      INTO v_customer_ids, v_product_ids, v_order_ids
      FROM public.list_strict_duplicates(p_store_id);
    RETURN public.delete_strict_duplicates(p_store_id, v_customer_ids, v_product_ids, v_order_ids);
END;
$$;

REVOKE ALL ON FUNCTION public.list_strict_duplicates(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_strict_duplicates(uuid, uuid[], uuid[], uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cleanup_strict_duplicates(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_strict_duplicates(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_strict_duplicates(uuid, uuid[], uuid[], uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_strict_duplicates(uuid) TO authenticated;
