-- Owner-only cleanup for repeated historical Excel imports.
-- Identity requested by the store owner: customer name + sale date + product title.

CREATE OR REPLACE FUNCTION public.deduplicate_historical_sales(p_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_role public.member_role;
    v_duplicate_ids uuid[] := ARRAY[]::uuid[];
    v_orders_deleted integer := 0;
    v_logs_deleted integer := 0;
    v_customer record;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;

    v_role := private.current_store_role(p_store_id);
    IF v_role IS NULL OR v_role <> 'owner'::public.member_role THEN
        RAISE EXCEPTION 'Owner permission required' USING ERRCODE = '42501';
    END IF;

    SELECT COALESCE(array_agg(ranked.id), ARRAY[]::uuid[])
      INTO v_duplicate_ids
      FROM (
          SELECT o.id,
                 row_number() OVER (
                     PARTITION BY
                         o.store_id,
                         lower(btrim(COALESCE(o.customer_name_snapshot, ''))),
                         o.order_date,
                         lower(btrim(COALESCE(o.product_title_snapshot, '')))
                     ORDER BY o.created_at ASC, o.id ASC
                 ) AS duplicate_rank
            FROM public.orders o
           WHERE o.store_id = p_store_id
             AND o.deleted_at IS NULL
             AND o.status IN ('SHIPPED'::public.order_status, 'COMPLETED'::public.order_status)
      ) AS ranked
     WHERE ranked.duplicate_rank > 1;

    IF cardinality(v_duplicate_ids) > 0 THEN
        DELETE FROM public.inventory_logs
         WHERE store_id = p_store_id
           AND order_id = ANY(v_duplicate_ids);
        GET DIAGNOSTICS v_logs_deleted = ROW_COUNT;

        DELETE FROM public.orders
         WHERE store_id = p_store_id
           AND id = ANY(v_duplicate_ids);
        GET DIAGNOSTICS v_orders_deleted = ROW_COUNT;
    END IF;

    FOR v_customer IN
        SELECT id FROM public.customers
         WHERE store_id = p_store_id AND deleted_at IS NULL
    LOOP
        PERFORM private.recalculate_customer_aggregates(v_customer.id);
    END LOOP;

    RETURN jsonb_build_object(
        'orders_deleted', v_orders_deleted,
        'inventory_logs_deleted', v_logs_deleted,
        'duplicate_groups_cleaned', (
            SELECT count(*)
              FROM (
                  SELECT 1
                    FROM public.orders o
                   WHERE o.store_id = p_store_id
                     AND o.deleted_at IS NULL
                     AND o.status IN ('SHIPPED'::public.order_status, 'COMPLETED'::public.order_status)
                   GROUP BY lower(btrim(COALESCE(o.customer_name_snapshot, ''))),
                            o.order_date,
                            lower(btrim(COALESCE(o.product_title_snapshot, '')))
                  HAVING count(*) > 1
              ) remaining
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.deduplicate_historical_sales(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.deduplicate_historical_sales(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.deduplicate_historical_sales(uuid) TO authenticated;
