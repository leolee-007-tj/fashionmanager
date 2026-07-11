-- ============================================================
-- Migration 00950: Order/Inventory RPC Runtime Validation and Hardening
-- ============================================================
--
-- PURPOSE:
--   Harden existing RPC functions with additional runtime validation:
--   1. NULL input defense for update_pending_order
--   2. Soft-deleted product validation
--   3. Legacy product_id NULL handling
--   4. Integer rounding for profit calculations (matches web app)
--   5. Customer deleted_at check in aggregate helper
--
-- ============================================================

-- ============================================================
-- 1. Hardened recalculate_customer_aggregates
-- ============================================================
--
-- Added: deleted_at IS NULL check for customer
--
-- ============================================================

CREATE OR REPLACE FUNCTION private.recalculate_customer_aggregates(
    p_customer_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_store_id uuid;
    v_total_amount numeric := 0;
    v_total_profit numeric := 0;
    v_order_count integer := 0;
    v_total_quantity integer := 0;
    v_last_order_date date;
BEGIN
    SELECT store_id INTO v_store_id
    FROM public.customers
    WHERE id = p_customer_id
      AND deleted_at IS NULL;

    IF v_store_id IS NULL THEN
        RETURN;
    END IF;

    SELECT
        COALESCE(SUM(o.selling_price * o.quantity), 0),
        COALESCE(SUM(o.actual_profit), 0),
        COALESCE(COUNT(*), 0),
        COALESCE(SUM(o.quantity), 0),
        MAX(o.order_date)
    INTO
        v_total_amount,
        v_total_profit,
        v_order_count,
        v_total_quantity,
        v_last_order_date
    FROM public.orders o
    WHERE o.customer_id = p_customer_id
      AND o.store_id = v_store_id
      AND o.deleted_at IS NULL
      AND o.status IN ('SHIPPED'::public.order_status, 'COMPLETED'::public.order_status);

    UPDATE public.customers
    SET
        total_amount = v_total_amount,
        total_profit = v_total_profit,
        order_count = v_order_count,
        total_quantity = v_total_quantity,
        last_order_date = v_last_order_date
    WHERE id = p_customer_id;
END;
$$;

REVOKE ALL ON FUNCTION private.recalculate_customer_aggregates(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.recalculate_customer_aggregates(uuid) FROM anon;
REVOKE ALL ON FUNCTION private.recalculate_customer_aggregates(uuid) FROM authenticated;

-- ============================================================
-- 2. Hardened update_pending_order
-- ============================================================
--
-- Added:
--   - NULL checks for p_customer_id, p_product_id, p_order_date
--   - Active product validation (deleted_at IS NULL) in same-product path
--   - Legacy order product_id NULL handling
--   - Data inconsistency check for missing existing product
--
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_pending_order(
    p_order_id uuid,
    p_customer_id uuid,
    p_product_id uuid,
    p_quantity integer,
    p_selling_price numeric,
    p_order_date date,
    p_color text DEFAULT NULL,
    p_size text DEFAULT NULL,
    p_notes text DEFAULT NULL
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid uuid;
    v_order public.orders;
    v_product_new public.products;
    v_product_old public.products;
    v_customer public.customers;
    v_old_product_id uuid;
    v_old_quantity integer;
    v_store_id uuid;
    v_role public.member_role;
    v_qty_diff integer;
    v_color text;
    v_size text;
    v_reserved_before_old integer;
    v_reserved_after_old integer;
    v_current_stock_old integer;
    v_reserved_before_new integer;
    v_reserved_after_new integer;
    v_current_stock_new integer;
    v_available_new integer;
BEGIN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_order FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF v_order IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
            MESSAGE = 'Order not found';
    END IF;

    v_store_id := v_order.store_id;

    v_role := private.current_store_role(v_store_id);
    IF v_role IS NULL OR v_role NOT IN ('owner', 'manager') THEN
        RAISE EXCEPTION 'Insufficient permissions: owner or manager role required'
        USING ERRCODE = '42501';
    END IF;

    IF v_order.status != 'PENDING'::public.order_status THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
            MESSAGE = 'Only PENDING orders can be updated (current status: ' || v_order.status || ')';
    END IF;

    IF p_customer_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
            MESSAGE = 'Customer ID cannot be null';
    END IF;

    IF p_product_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
            MESSAGE = 'Product ID cannot be null';
    END IF;

    IF p_order_date IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
            MESSAGE = 'Order date cannot be null';
    END IF;

    SELECT * INTO v_customer FROM public.customers
    WHERE id = p_customer_id AND store_id = v_store_id AND deleted_at IS NULL;
    IF v_customer IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
            MESSAGE = 'Customer not found or is deleted in this store';
    END IF;

    IF p_quantity IS NULL OR p_quantity < 1 THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
            MESSAGE = 'Quantity must be at least 1';
    END IF;

    IF p_selling_price IS NULL OR p_selling_price <= 0 THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
            MESSAGE = 'Selling price must be greater than 0';
    END IF;

    v_old_product_id := v_order.product_id;
    v_old_quantity := v_order.quantity;

    IF v_old_product_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
            MESSAGE = 'Legacy order has no product_id and must be repaired before update';
    END IF;

    IF v_old_product_id != p_product_id THEN
        IF v_old_product_id < p_product_id THEN
            SELECT * INTO v_product_old FROM public.products
            WHERE id = v_old_product_id AND store_id = v_store_id FOR UPDATE;
            SELECT * INTO v_product_new FROM public.products
            WHERE id = p_product_id AND store_id = v_store_id AND deleted_at IS NULL FOR UPDATE;
        ELSE
            SELECT * INTO v_product_new FROM public.products
            WHERE id = p_product_id AND store_id = v_store_id AND deleted_at IS NULL FOR UPDATE;
            SELECT * INTO v_product_old FROM public.products
            WHERE id = v_old_product_id AND store_id = v_store_id FOR UPDATE;
        END IF;

        IF v_product_old IS NULL THEN
            RAISE EXCEPTION USING ERRCODE = '22023',
                MESSAGE = 'Data inconsistency: existing order product not found';
        END IF;

        IF v_product_new IS NULL THEN
            RAISE EXCEPTION USING ERRCODE = '22023',
                MESSAGE = 'Product not found or is deleted in this store';
        END IF;

        v_reserved_before_old := v_product_old.reserved_stock;
        v_reserved_after_old := v_product_old.reserved_stock - v_old_quantity;
        v_current_stock_old := v_product_old.current_stock;

        IF v_reserved_after_old < 0 THEN
            RAISE EXCEPTION USING ERRCODE = '22023',
                MESSAGE = 'Data inconsistency: reserved_stock would go negative on release';
        END IF;

        UPDATE public.products
        SET reserved_stock = v_reserved_after_old
        WHERE id = v_old_product_id;

        INSERT INTO public.inventory_logs (
            store_id, product_id, order_id,
            change_type, quantity_change,
            stock_before, stock_after,
            reserved_before, reserved_after,
            notes
        ) VALUES (
            v_store_id, v_old_product_id, p_order_id,
            'RELEASE'::public.inventory_change_type, 0,
            v_current_stock_old, v_current_stock_old,
            v_reserved_before_old, v_reserved_after_old,
            'Pending order product change - release old'
        );

        v_available_new := v_product_new.current_stock - v_product_new.reserved_stock;
        IF p_quantity > v_available_new THEN
            RAISE EXCEPTION USING ERRCODE = '22023',
                MESSAGE = 'Insufficient available stock on new product';
        END IF;

        v_reserved_before_new := v_product_new.reserved_stock;
        v_reserved_after_new := v_product_new.reserved_stock + p_quantity;
        v_current_stock_new := v_product_new.current_stock;

        UPDATE public.products
        SET reserved_stock = v_reserved_after_new
        WHERE id = p_product_id;

        INSERT INTO public.inventory_logs (
            store_id, product_id, order_id,
            change_type, quantity_change,
            stock_before, stock_after,
            reserved_before, reserved_after,
            notes
        ) VALUES (
            v_store_id, p_product_id, p_order_id,
            'RESERVE'::public.inventory_change_type, 0,
            v_current_stock_new, v_current_stock_new,
            v_reserved_before_new, v_reserved_after_new,
            'Pending order product change - reserve new'
        );

    ELSE
        SELECT * INTO v_product_new FROM public.products
        WHERE id = p_product_id AND store_id = v_store_id AND deleted_at IS NULL FOR UPDATE;

        IF v_product_new IS NULL THEN
            RAISE EXCEPTION USING ERRCODE = '22023',
                MESSAGE = 'Product not found or is deleted in this store';
        END IF;

        v_qty_diff := p_quantity - v_old_quantity;

        v_reserved_before_new := v_product_new.reserved_stock;
        v_current_stock_new := v_product_new.current_stock;

        IF v_qty_diff > 0 THEN
            v_available_new := v_product_new.current_stock - v_product_new.reserved_stock;
            IF v_qty_diff > v_available_new THEN
                RAISE EXCEPTION USING ERRCODE = '22023',
                    MESSAGE = 'Insufficient available stock for quantity increase';
            END IF;

            v_reserved_after_new := v_product_new.reserved_stock + v_qty_diff;

            UPDATE public.products
            SET reserved_stock = v_reserved_after_new
            WHERE id = p_product_id;

            INSERT INTO public.inventory_logs (
                store_id, product_id, order_id,
                change_type, quantity_change,
                stock_before, stock_after,
                reserved_before, reserved_after,
                notes
            ) VALUES (
                v_store_id, p_product_id, p_order_id,
                'RESERVE'::public.inventory_change_type, 0,
                v_current_stock_new, v_current_stock_new,
                v_reserved_before_new, v_reserved_after_new,
                'Pending order quantity increase'
            );

        ELSIF v_qty_diff < 0 THEN
            v_reserved_after_new := v_product_new.reserved_stock + v_qty_diff;

            IF v_reserved_after_new < 0 THEN
                RAISE EXCEPTION USING ERRCODE = '22023',
                    MESSAGE = 'Data inconsistency: reserved_stock would go negative';
            END IF;

            UPDATE public.products
            SET reserved_stock = v_reserved_after_new
            WHERE id = p_product_id;

            INSERT INTO public.inventory_logs (
                store_id, product_id, order_id,
                change_type, quantity_change,
                stock_before, stock_after,
                reserved_before, reserved_after,
                notes
            ) VALUES (
                v_store_id, p_product_id, p_order_id,
                'RELEASE'::public.inventory_change_type, 0,
                v_current_stock_new, v_current_stock_new,
                v_reserved_before_new, v_reserved_after_new,
                'Pending order quantity decrease'
            );
        END IF;
    END IF;

    v_color := COALESCE(p_color, v_product_new.color);
    v_size := COALESCE(p_size, v_product_new.size);

    UPDATE public.orders
    SET
        customer_id = p_customer_id,
        product_id = p_product_id,
        customer_name_snapshot = v_customer.name,
        product_title_snapshot = v_product_new.original_title,
        brand_snapshot = v_product_new.brand,
        category_snapshot = v_product_new.category,
        color_snapshot = v_color,
        size_snapshot = v_size,
        quantity = p_quantity,
        selling_price = p_selling_price,
        actual_converted_cost_at_sale = v_product_new.actual_converted_cost,
        china_cost_at_sale = v_product_new.china_base_price,
        actual_profit = 0,
        actual_profit_margin = 0,
        actual_cost_ratio = 0,
        order_date = p_order_date,
        notes = p_notes
    WHERE id = p_order_id
    RETURNING * INTO v_order;

    RETURN v_order;
END;
$$;

REVOKE ALL ON FUNCTION public.update_pending_order(uuid, uuid, uuid, integer, numeric, date, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_pending_order(uuid, uuid, uuid, integer, numeric, date, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_pending_order(uuid, uuid, uuid, integer, numeric, date, text, text, text) TO authenticated;

-- ============================================================
-- 3. Hardened ship_order with integer rounding (matches web app)
-- ============================================================
--
-- Changed:
--   - profit = round((selling_price - actual_converted_cost) * quantity)
--   - profit_margin = round((profit_raw / revenue) * 100) - uses raw before rounding
--   - cost_ratio = round(actual_converted_cost / selling_price * 100) - unit ratio
--
-- ============================================================

CREATE OR REPLACE FUNCTION public.ship_order(
    p_order_id uuid,
    p_ship_date date DEFAULT current_date,
    p_shipping_company text DEFAULT NULL,
    p_tracking_number text DEFAULT NULL
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid uuid;
    v_order public.orders;
    v_product public.products;
    v_store_id uuid;
    v_role public.member_role;
    v_shipping_company text;
    v_tracking_number text;
    v_stock_before integer;
    v_stock_after integer;
    v_reserved_before integer;
    v_reserved_after integer;
    v_profit_raw numeric;
    v_revenue numeric;
    v_profit integer;
    v_profit_margin integer;
    v_cost_ratio integer;
BEGIN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_order FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF v_order IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
            MESSAGE = 'Order not found';
    END IF;

    v_store_id := v_order.store_id;

    v_role := private.current_store_role(v_store_id);
    IF v_role IS NULL OR v_role NOT IN ('owner', 'manager') THEN
        RAISE EXCEPTION 'Insufficient permissions: owner or manager role required'
        USING ERRCODE = '42501';
    END IF;

    IF v_order.status != 'PENDING'::public.order_status THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
            MESSAGE = 'Can only ship PENDING orders (current status: ' || v_order.status || ')';
    END IF;

    v_shipping_company := trim(COALESCE(p_shipping_company, ''));
    IF v_shipping_company = '' THEN
        v_shipping_company := NULL;
    END IF;

    v_tracking_number := trim(COALESCE(p_tracking_number, ''));
    IF v_tracking_number = '' THEN
        v_tracking_number := NULL;
    END IF;

    SELECT * INTO v_product FROM public.products
    WHERE id = v_order.product_id AND store_id = v_store_id AND deleted_at IS NULL
    FOR UPDATE;

    IF v_product IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
            MESSAGE = 'Product not found or is deleted';
    END IF;

    IF v_product.current_stock < v_order.quantity THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
            MESSAGE = 'Insufficient current stock: ' || v_product.current_stock || ' < ' || v_order.quantity;
    END IF;

    IF v_product.reserved_stock < v_order.quantity THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
            MESSAGE = 'Data inconsistency: reserved_stock less than order quantity';
    END IF;

    v_stock_before := v_product.current_stock;
    v_reserved_before := v_product.reserved_stock;
    v_stock_after := v_product.current_stock - v_order.quantity;
    v_reserved_after := v_product.reserved_stock - v_order.quantity;

    UPDATE public.products
    SET
        current_stock = v_stock_after,
        reserved_stock = v_reserved_after
    WHERE id = v_order.product_id;

    v_profit_raw :=
        (v_order.selling_price - COALESCE(v_order.actual_converted_cost_at_sale, 0))
        * v_order.quantity;

    v_revenue := v_order.selling_price * v_order.quantity;

    v_profit := round(v_profit_raw);

    IF v_revenue > 0 THEN
        v_profit_margin := round((v_profit_raw / v_revenue) * 100);
        v_cost_ratio := round(
            COALESCE(v_order.actual_converted_cost_at_sale, 0)
            / v_order.selling_price
            * 100
        );
    ELSE
        v_profit_margin := 0;
        v_cost_ratio := 0;
    END IF;

    UPDATE public.orders
    SET
        status = 'SHIPPED'::public.order_status,
        ship_date = p_ship_date,
        shipping_company = v_shipping_company,
        tracking_number = v_tracking_number,
        actual_profit = v_profit,
        actual_profit_margin = v_profit_margin,
        actual_cost_ratio = v_cost_ratio
    WHERE id = p_order_id
    RETURNING * INTO v_order;

    INSERT INTO public.inventory_logs (
        store_id, product_id, order_id,
        change_type, quantity_change,
        stock_before, stock_after,
        reserved_before, reserved_after,
        notes
    ) VALUES (
        v_store_id, v_order.product_id, p_order_id,
        'SHIP'::public.inventory_change_type, -v_order.quantity,
        v_stock_before, v_stock_after,
        v_reserved_before, v_reserved_after,
        'Order shipment'
    );

    PERFORM private.recalculate_customer_aggregates(v_order.customer_id);

    RETURN v_order;
END;
$$;

REVOKE ALL ON FUNCTION public.ship_order(uuid, date, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ship_order(uuid, date, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.ship_order(uuid, date, text, text) TO authenticated;