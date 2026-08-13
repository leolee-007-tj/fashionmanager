-- Import historical completed sales without changing today's current stock.
-- Also converts an identical PENDING row left by an interrupted legacy import.

CREATE OR REPLACE FUNCTION public.import_historical_sale(
    p_store_id uuid,
    p_customer_id uuid,
    p_product_id uuid,
    p_quantity integer,
    p_selling_price numeric,
    p_order_date date
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_role public.member_role;
    v_customer public.customers;
    v_product public.products;
    v_order public.orders;
    v_revenue numeric;
    v_cost numeric;
    v_profit numeric;
    v_reserved_before integer;
    v_reserved_after integer;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;
    v_role := private.current_store_role(p_store_id);
    IF v_role IS NULL OR v_role NOT IN ('owner', 'manager') THEN
        RAISE EXCEPTION 'Insufficient permissions' USING ERRCODE = '42501';
    END IF;
    IF p_quantity IS NULL OR p_quantity < 1 OR p_selling_price IS NULL OR p_selling_price < 0 OR p_order_date IS NULL THEN
        RAISE EXCEPTION 'Invalid historical sale values' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_customer FROM public.customers
    WHERE id = p_customer_id AND store_id = p_store_id AND deleted_at IS NULL;
    SELECT * INTO v_product FROM public.products
    WHERE id = p_product_id AND store_id = p_store_id AND deleted_at IS NULL
    FOR UPDATE;
    IF v_customer IS NULL OR v_product IS NULL THEN
        RAISE EXCEPTION 'Customer or product not found in store' USING ERRCODE = '22023';
    END IF;

    -- Idempotent re-upload: return an already imported completed sale.
    SELECT * INTO v_order FROM public.orders
    WHERE store_id = p_store_id
      AND lower(btrim(customer_name_snapshot)) = lower(btrim(v_customer.name))
      AND lower(btrim(product_title_snapshot)) = lower(btrim(v_product.original_title))
      AND lower(btrim(COALESCE(brand_snapshot, ''))) = lower(btrim(COALESCE(v_product.brand, '')))
      AND quantity = p_quantity
      AND selling_price = p_selling_price AND order_date = p_order_date
      AND status IN ('SHIPPED'::public.order_status, 'COMPLETED'::public.order_status)
      AND deleted_at IS NULL
    ORDER BY created_at LIMIT 1;
    IF v_order IS NOT NULL THEN RETURN v_order; END IF;

    v_revenue := p_selling_price * p_quantity;
    v_cost := COALESCE(v_product.actual_converted_cost, 0) * p_quantity;
    v_profit := v_revenue - v_cost;

    -- Recover an identical PENDING order left by the old create+ship importer.
    SELECT * INTO v_order FROM public.orders
    WHERE store_id = p_store_id AND customer_id = p_customer_id
      AND product_id = p_product_id AND quantity = p_quantity
      AND selling_price = p_selling_price AND order_date = p_order_date
      AND status = 'PENDING'::public.order_status AND deleted_at IS NULL
    ORDER BY created_at LIMIT 1 FOR UPDATE;

    IF v_order IS NOT NULL THEN
        v_reserved_before := COALESCE(v_product.reserved_stock, 0);
        v_reserved_after := GREATEST(v_reserved_before - v_order.quantity, 0);
        UPDATE public.products SET reserved_stock = v_reserved_after WHERE id = v_product.id;
        INSERT INTO public.inventory_logs (
            store_id, product_id, order_id, change_type, quantity_change,
            stock_before, stock_after, reserved_before, reserved_after, notes
        ) VALUES (
            p_store_id, v_product.id, v_order.id, 'RELEASE'::public.inventory_change_type, 0,
            v_product.current_stock, v_product.current_stock,
            v_reserved_before, v_reserved_after, 'Historical import recovery'
        );
        UPDATE public.orders SET
            status = 'COMPLETED'::public.order_status,
            ship_date = p_order_date,
            actual_converted_cost_at_sale = v_product.actual_converted_cost,
            china_cost_at_sale = v_product.china_base_price,
            actual_profit = round(v_profit),
            actual_profit_margin = CASE WHEN v_revenue > 0 THEN round(v_profit / v_revenue * 100) ELSE 0 END,
            actual_cost_ratio = CASE WHEN v_revenue > 0 THEN round(v_cost / v_revenue * 100) ELSE 0 END
        WHERE id = v_order.id RETURNING * INTO v_order;
    ELSE
        INSERT INTO public.orders (
            store_id, order_number, customer_id, product_id,
            customer_name_snapshot, product_title_snapshot, brand_snapshot, category_snapshot,
            color_snapshot, size_snapshot, quantity, selling_price,
            actual_converted_cost_at_sale, china_cost_at_sale,
            actual_profit, actual_profit_margin, actual_cost_ratio,
            status, order_date, ship_date, notes
        ) VALUES (
            p_store_id, private.generate_order_number(p_store_id), p_customer_id, p_product_id,
            v_customer.name, v_product.original_title, v_product.brand, v_product.category,
            v_product.color, v_product.size, p_quantity, p_selling_price,
            v_product.actual_converted_cost, v_product.china_base_price,
            round(v_profit),
            CASE WHEN v_revenue > 0 THEN round(v_profit / v_revenue * 100) ELSE 0 END,
            CASE WHEN v_revenue > 0 THEN round(v_cost / v_revenue * 100) ELSE 0 END,
            'COMPLETED'::public.order_status, p_order_date, p_order_date, 'Historical Excel import'
        ) RETURNING * INTO v_order;
    END IF;

    PERFORM private.recalculate_customer_aggregates(p_customer_id);
    RETURN v_order;
END;
$$;

REVOKE ALL ON FUNCTION public.import_historical_sale(uuid, uuid, uuid, integer, numeric, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.import_historical_sale(uuid, uuid, uuid, integer, numeric, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.import_historical_sale(uuid, uuid, uuid, integer, numeric, date) TO authenticated;
