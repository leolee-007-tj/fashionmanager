-- User-approved cleanup of all remote order history.
-- Preserve products, customers, stores, settings, authentication, and unrelated logs.

DO $$
DECLARE
    v_order_count bigint;
    v_inventory_log_count bigint;
BEGIN
    SELECT count(*) INTO v_order_count FROM public.orders;
    SELECT count(*) INTO v_inventory_log_count
    FROM public.inventory_logs
    WHERE order_id IS NOT NULL;

    -- Remove dependent order inventory logs before their parent orders.
    DELETE FROM public.inventory_logs WHERE order_id IS NOT NULL;
    DELETE FROM public.orders;

    -- With no orders remaining, no stock can remain reserved for an order.
    UPDATE public.products
    SET reserved_stock = 0,
        updated_at = now()
    WHERE reserved_stock IS DISTINCT FROM 0;

    -- Recalculate customer purchase aggregates from the now-empty order set.
    UPDATE public.customers
    SET total_amount = 0,
        total_profit = 0,
        order_count = 0,
        total_quantity = 0,
        last_order_date = NULL,
        updated_at = now()
    WHERE total_amount IS DISTINCT FROM 0
       OR total_profit IS DISTINCT FROM 0
       OR order_count IS DISTINCT FROM 0
       OR total_quantity IS DISTINCT FROM 0
       OR last_order_date IS NOT NULL;

    RAISE NOTICE 'Purged % orders and % linked inventory logs',
        v_order_count, v_inventory_log_count;
END;
$$;
