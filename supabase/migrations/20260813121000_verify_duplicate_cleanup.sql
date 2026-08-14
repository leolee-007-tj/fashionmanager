DO $$
DECLARE
    v_active_customers integer;
    v_active_products integer;
    v_active_sales integer;
    v_customer_groups integer;
    v_product_groups integer;
    v_sales_groups integer;
BEGIN
    SELECT count(*) INTO v_active_customers
      FROM public.customers WHERE deleted_at IS NULL;
    SELECT count(*) INTO v_active_products
      FROM public.products WHERE deleted_at IS NULL;
    SELECT count(*) INTO v_active_sales
      FROM public.orders WHERE deleted_at IS NULL;

    SELECT count(*) INTO v_customer_groups FROM (
        SELECT 1 FROM public.customers
         WHERE deleted_at IS NULL
         GROUP BY store_id,
                  lower(regexp_replace(btrim(name), '[[:space:][:punct:]]+', '', 'g'))
        HAVING count(*) > 1
    ) duplicate_groups;

    SELECT count(*) INTO v_product_groups FROM (
        SELECT 1 FROM public.products
         WHERE deleted_at IS NULL
         GROUP BY store_id,
                  lower(regexp_replace(btrim(brand), '[[:space:][:punct:]]+', '', 'g')),
                  lower(regexp_replace(btrim(original_title), '[[:space:][:punct:]]+', '', 'g')),
                  lower(regexp_replace(btrim(COALESCE(color, '')), '[[:space:][:punct:]]+', '', 'g')),
                  lower(regexp_replace(btrim(COALESCE(size, '')), '[[:space:][:punct:]]+', '', 'g'))
        HAVING count(*) > 1
    ) duplicate_groups;

    SELECT count(*) INTO v_sales_groups FROM (
        SELECT 1 FROM public.orders
         WHERE deleted_at IS NULL
           AND status IN ('SHIPPED'::public.order_status, 'COMPLETED'::public.order_status)
         GROUP BY store_id,
                  lower(regexp_replace(btrim(COALESCE(customer_name_snapshot, '')), '[[:space:][:punct:]]+', '', 'g')),
                  order_date,
                  lower(regexp_replace(btrim(COALESCE(product_title_snapshot, '')), '[[:space:][:punct:]]+', '', 'g'))
        HAVING count(*) > 1
    ) duplicate_groups;

    RAISE NOTICE 'Duplicate verification: active customers %, products %, orders %; duplicate groups customers %, products %, sales %',
        v_active_customers, v_active_products, v_active_sales,
        v_customer_groups, v_product_groups, v_sales_groups;

    IF v_customer_groups <> 0 OR v_product_groups <> 0 OR v_sales_groups <> 0 THEN
        RAISE EXCEPTION 'Duplicate verification failed';
    END IF;
END;
$$;
