CREATE OR REPLACE FUNCTION public.cleanup_all_duplicates(p_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role public.member_role;
    v_group record;
    v_dup uuid;
    v_customers integer := 0;
    v_products integer := 0;
    v_sales integer := 0;
    v_logs integer := 0;
    v_count integer;
    v_customer record;
BEGIN
    v_role := private.current_store_role(p_store_id);
    IF auth.uid() IS NULL OR v_role IS NULL OR v_role <> 'owner'::public.member_role THEN
        RAISE EXCEPTION 'Owner permission required' USING ERRCODE = '42501';
    END IF;

    -- Merge duplicate customers by normalized visible name.
    FOR v_group IN
        SELECT (array_agg(id ORDER BY created_at, id))[1] AS keep_id,
               (array_agg(id ORDER BY created_at, id))[2:] AS duplicate_ids
          FROM public.customers
         WHERE store_id = p_store_id AND deleted_at IS NULL
         GROUP BY lower(regexp_replace(btrim(name), '[[:space:][:punct:]]+', '', 'g'))
        HAVING count(*) > 1
    LOOP
        FOREACH v_dup IN ARRAY v_group.duplicate_ids LOOP
            UPDATE public.orders SET customer_id = v_group.keep_id
             WHERE store_id = p_store_id AND customer_id = v_dup;
            UPDATE public.customers SET deleted_at = now(), updated_at = now()
             WHERE id = v_dup AND store_id = p_store_id;
            v_customers := v_customers + 1;
        END LOOP;
    END LOOP;

    -- Merge duplicate products without adding duplicated stock quantities.
    FOR v_group IN
        SELECT (array_agg(id ORDER BY created_at, id))[1] AS keep_id,
               (array_agg(id ORDER BY created_at, id))[2:] AS duplicate_ids,
               max(current_stock) AS current_stock,
               max(korea_cost) FILTER (WHERE korea_cost > 0) AS korea_cost,
               max(actual_converted_cost) FILTER (WHERE actual_converted_cost > 0) AS actual_cost
          FROM public.products
         WHERE store_id = p_store_id AND deleted_at IS NULL
         GROUP BY lower(regexp_replace(btrim(brand), '[[:space:][:punct:]]+', '', 'g')),
                  lower(regexp_replace(btrim(original_title), '[[:space:][:punct:]]+', '', 'g')),
                  lower(regexp_replace(btrim(COALESCE(color, '')), '[[:space:][:punct:]]+', '', 'g')),
                  lower(regexp_replace(btrim(COALESCE(size, '')), '[[:space:][:punct:]]+', '', 'g'))
        HAVING count(*) > 1
    LOOP
        UPDATE public.products SET
            current_stock = v_group.current_stock,
            korea_cost = COALESCE(v_group.korea_cost, korea_cost),
            actual_converted_cost = COALESCE(v_group.actual_cost, actual_converted_cost),
            updated_at = now()
        WHERE id = v_group.keep_id;
        FOREACH v_dup IN ARRAY v_group.duplicate_ids LOOP
            UPDATE public.orders SET product_id = v_group.keep_id
             WHERE store_id = p_store_id AND product_id = v_dup;
            UPDATE public.inventory_logs SET product_id = v_group.keep_id
             WHERE store_id = p_store_id AND product_id = v_dup;
            UPDATE public.products SET deleted_at = now(), current_stock = 0,
                   reserved_stock = 0, updated_at = now()
             WHERE id = v_dup AND store_id = p_store_id;
            v_products := v_products + 1;
        END LOOP;
    END LOOP;

    -- Remove duplicate completed sales after customer/product references merge.
    WITH ranked AS (
        SELECT id, row_number() OVER (
            PARTITION BY store_id,
                lower(regexp_replace(btrim(COALESCE(customer_name_snapshot, '')), '[[:space:][:punct:]]+', '', 'g')),
                order_date,
                lower(regexp_replace(btrim(COALESCE(product_title_snapshot, '')), '[[:space:][:punct:]]+', '', 'g'))
            ORDER BY created_at, id
        ) AS rn
        FROM public.orders
        WHERE store_id = p_store_id AND deleted_at IS NULL
          AND status IN ('SHIPPED'::public.order_status, 'COMPLETED'::public.order_status)
    ), duplicate_orders AS (
        SELECT id FROM ranked WHERE rn > 1
    )
    DELETE FROM public.inventory_logs l USING duplicate_orders d
     WHERE l.store_id = p_store_id AND l.order_id = d.id;
    GET DIAGNOSTICS v_logs = ROW_COUNT;

    WITH ranked AS (
        SELECT id, row_number() OVER (
            PARTITION BY store_id,
                lower(regexp_replace(btrim(COALESCE(customer_name_snapshot, '')), '[[:space:][:punct:]]+', '', 'g')),
                order_date,
                lower(regexp_replace(btrim(COALESCE(product_title_snapshot, '')), '[[:space:][:punct:]]+', '', 'g'))
            ORDER BY created_at, id
        ) AS rn
        FROM public.orders
        WHERE store_id = p_store_id AND deleted_at IS NULL
          AND status IN ('SHIPPED'::public.order_status, 'COMPLETED'::public.order_status)
    )
    DELETE FROM public.orders o USING ranked r
     WHERE o.id = r.id AND r.rn > 1;
    GET DIAGNOSTICS v_sales = ROW_COUNT;

    -- Rebuild reservations and customer purchase statistics.
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
        'customers_deleted', v_customers,
        'products_deleted', v_products,
        'sales_deleted', v_sales,
        'inventory_logs_deleted', v_logs
    );
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_all_duplicates(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cleanup_all_duplicates(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.cleanup_all_duplicates(uuid) TO authenticated;
