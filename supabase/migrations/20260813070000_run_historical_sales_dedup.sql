-- One-time cleanup approved by the owner. Abort without deleting anything if
-- duplicate historical sales exist in more than one store.
DO $$
DECLARE
    v_store_id uuid;
    v_candidate_store_count integer;
    v_duplicate_ids uuid[];
    v_orders_deleted integer := 0;
    v_logs_deleted integer := 0;
    v_customer record;
BEGIN
    WITH duplicate_stores AS (
        SELECT grouped.store_id
          FROM (
              SELECT o.store_id,
                     lower(btrim(COALESCE(o.customer_name_snapshot, ''))) AS customer_name,
                     o.order_date,
                     lower(btrim(COALESCE(o.product_title_snapshot, ''))) AS product_title
                FROM public.orders o
               WHERE o.deleted_at IS NULL
                 AND o.status IN ('SHIPPED'::public.order_status, 'COMPLETED'::public.order_status)
               GROUP BY o.store_id,
                        lower(btrim(COALESCE(o.customer_name_snapshot, ''))),
                        o.order_date,
                        lower(btrim(COALESCE(o.product_title_snapshot, '')))
              HAVING count(*) > 1
          ) grouped
         GROUP BY grouped.store_id
    )
    SELECT count(*), (array_agg(store_id))[1]
      INTO v_candidate_store_count, v_store_id
      FROM duplicate_stores;

    IF v_candidate_store_count = 0 THEN
        RAISE NOTICE 'Historical sale dedup: no duplicates found';
        RETURN;
    END IF;
    IF v_candidate_store_count <> 1 THEN
        RAISE EXCEPTION 'Historical sale dedup aborted: duplicates exist in % stores', v_candidate_store_count;
    END IF;

    SELECT array_agg(ranked.id)
      INTO v_duplicate_ids
      FROM (
          SELECT o.id,
                 row_number() OVER (
                     PARTITION BY lower(btrim(COALESCE(o.customer_name_snapshot, ''))),
                                  o.order_date,
                                  lower(btrim(COALESCE(o.product_title_snapshot, '')))
                     ORDER BY o.created_at ASC, o.id ASC
                 ) AS duplicate_rank
            FROM public.orders o
           WHERE o.store_id = v_store_id
             AND o.deleted_at IS NULL
             AND o.status IN ('SHIPPED'::public.order_status, 'COMPLETED'::public.order_status)
      ) ranked
     WHERE ranked.duplicate_rank > 1;

    DELETE FROM public.inventory_logs
     WHERE store_id = v_store_id AND order_id = ANY(v_duplicate_ids);
    GET DIAGNOSTICS v_logs_deleted = ROW_COUNT;

    DELETE FROM public.orders
     WHERE store_id = v_store_id AND id = ANY(v_duplicate_ids);
    GET DIAGNOSTICS v_orders_deleted = ROW_COUNT;

    FOR v_customer IN
        SELECT id FROM public.customers
         WHERE store_id = v_store_id AND deleted_at IS NULL
    LOOP
        PERFORM private.recalculate_customer_aggregates(v_customer.id);
    END LOOP;

    RAISE NOTICE 'Historical sale dedup complete: orders_deleted=%, inventory_logs_deleted=%',
        v_orders_deleted, v_logs_deleted;
END;
$$;
