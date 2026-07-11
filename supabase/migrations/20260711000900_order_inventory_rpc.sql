-- ============================================================
-- Migration 009: Protected Order and Inventory Transaction RPC
-- ============================================================
--
-- PURPOSE:
--   Implement atomic order lifecycle management via SECURITY DEFINER RPC.
--   Replaces direct orders/products/customers DML with protected
--   transactions that maintain consistency across:
--   - order status + snapshots
--   - product stock (current_stock, reserved_stock)
--   - inventory_logs
--   - customer aggregate fields
--
-- COMPONENTS:
--   1. ALTER TABLE orders: shipping_company, tracking_number columns
--   2. private.recalculate_customer_aggregates(customer_id)
--   3. private.generate_order_number(store_id)
--   4. public.create_order(...)
--   5. public.update_pending_order(...)
--   6. public.ship_order(...)
--   7. public.cancel_order(...)
--   8. public.complete_order(...)
--   9. Direct DML restrictions (revoke permissions, drop policies)
--  10. Column-level grants for safe product/customer updates
--
-- SECURITY:
--   - All public RPC: SECURITY DEFINER, SET search_path = ''
--   - All relations schema-qualified
--   - No dynamic SQL
--   - auth.uid() is the only user identifier
--   - EXECUTE only for authenticated (owner/manager check inside)
--   - Private helpers: no EXECUTE for PUBLIC/anon/authenticated
--
-- ============================================================

-- ============================================================
-- 1. Add shipping columns to orders
-- ============================================================

ALTER TABLE public.orders
    ADD COLUMN shipping_company text,
    ADD COLUMN tracking_number text;

ALTER TABLE public.orders
    ADD CONSTRAINT chk_orders_shipping_company_length
        CHECK (shipping_company IS NULL OR length(shipping_company) <= 100),
    ADD CONSTRAINT chk_orders_tracking_number_length
        CHECK (tracking_number IS NULL OR length(tracking_number) <= 100);

-- ============================================================
-- 2. Private helper: recalculate_customer_aggregates
-- ============================================================
--
-- Recalculates customer aggregate fields from shipped/completed orders.
-- Only counts non-deleted orders in SHIPPED or COMPLETED status.
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
    -- Get store_id for validation
    SELECT store_id INTO v_store_id
    FROM public.customers
    WHERE id = p_customer_id;

    IF v_store_id IS NULL THEN
        -- Customer does not exist or is deleted; nothing to do
        RETURN;
    END IF;

    -- Aggregate from SHIPPED + COMPLETED non-deleted orders
    -- Only orders where customer's store matches order's store
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
      AND o.deleted_at IS NULL
      AND o.status IN ('SHIPPED'::public.order_status, 'COMPLETED'::public.order_status)
      AND o.store_id = v_store_id;

    -- Update customer aggregates
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

-- Permissions: revoke from all, no client should call this directly
REVOKE ALL ON FUNCTION private.recalculate_customer_aggregates(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.recalculate_customer_aggregates(uuid) FROM anon;
REVOKE ALL ON FUNCTION private.recalculate_customer_aggregates(uuid) FROM authenticated;

-- ============================================================
-- 3. Private helper: generate_order_number
-- ============================================================
--
-- Generates the next sequential order number for a store.
-- Format: ORD-0001, ORD-0002, ...
-- Uses advisory transaction lock per store for concurrency safety.
-- Includes deleted orders in max calculation (never reuses numbers).
--
-- ============================================================

CREATE OR REPLACE FUNCTION private.generate_order_number(
    p_store_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_max_num integer;
    v_order_number text;
BEGIN
    -- Acquire per-store advisory lock for order number generation
    -- Uses seed 1 to namespace differently from other locks
    PERFORM pg_advisory_xact_lock(hashtextextended(p_store_id::text, 1));

    -- Find the current max numeric suffix among existing order_numbers
    -- Skip non-numeric order numbers (migration/legacy)
    SELECT COALESCE(MAX(suffix_num), 0)
    INTO v_max_num
    FROM (
        SELECT
            CASE
                WHEN order_number ~ '^ORD-\d+$' THEN
                    CAST(substring(order_number from '^ORD-(\d+)$') AS integer)
                ELSE NULL
            END AS suffix_num
        FROM public.orders
        WHERE store_id = p_store_id
    ) sub
    WHERE suffix_num IS NOT NULL;

    v_order_number := 'ORD-' || LPAD((v_max_num + 1)::text, 4, '0');

    RETURN v_order_number;
END;
$$;

-- Permissions: revoke from all, no client should call this directly
REVOKE ALL ON FUNCTION private.generate_order_number(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.generate_order_number(uuid) FROM anon;
REVOKE ALL ON FUNCTION private.generate_order_number(uuid) FROM authenticated;

-- ============================================================
-- 4. RPC: create_order
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_order(
    p_store_id uuid,
    p_customer_id uuid,
    p_product_id uuid,
    p_quantity integer,
    p_selling_price numeric,
    p_order_date date DEFAULT current_date,
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
    v_role public.member_role;
    v_order public.orders;
    v_product public.products;
    v_customer public.customers;
    v_store public.stores;
    v_available_stock integer;
    v_order_number text;
    v_color text;
    v_size text;
    v_reserved_before integer;
    v_reserved_after integer;
    v_current_stock integer;
BEGIN
    -- Auth check
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;

    -- Role check: only owner or manager
    v_role := private.current_store_role(p_store_id);
    IF v_role IS NULL OR v_role NOT IN ('owner', 'manager') THEN
        RAISE EXCEPTION 'Insufficient permissions: owner or manager role required'
        USING ERRCODE = '42501';
    END IF;

    -- Validate store is active (not deleted)
    SELECT * INTO v_store FROM public.stores
    WHERE id = p_store_id AND deleted_at IS NULL;
    IF v_store IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
            MESSAGE = 'Store not found or is deleted';
    END IF;

    -- Validate customer is active and same store
    SELECT * INTO v_customer FROM public.customers
    WHERE id = p_customer_id AND store_id = p_store_id AND deleted_at IS NULL;
    IF v_customer IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
            MESSAGE = 'Customer not found or is deleted in this store';
    END IF;

    -- Validate product is active and same store, lock for update
    SELECT * INTO v_product FROM public.products
    WHERE id = p_product_id AND store_id = p_store_id AND deleted_at IS NULL
    FOR UPDATE;
    IF v_product IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
            MESSAGE = 'Product not found or is deleted in this store';
    END IF;

    -- Validate quantity
    IF p_quantity IS NULL OR p_quantity < 1 THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
            MESSAGE = 'Quantity must be at least 1';
    END IF;

    -- Validate selling price
    IF p_selling_price IS NULL OR p_selling_price <= 0 THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
            MESSAGE = 'Selling price must be greater than 0';
    END IF;

    -- Check available stock
    v_available_stock := v_product.current_stock - v_product.reserved_stock;
    IF p_quantity > v_available_stock THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
            MESSAGE = 'Insufficient available stock: requested ' || p_quantity || ', available ' || v_available_stock;
    END IF;

    -- Reserve stock
    v_reserved_before := v_product.reserved_stock;
    v_reserved_after := v_product.reserved_stock + p_quantity;
    v_current_stock := v_product.current_stock;

    UPDATE public.products
    SET reserved_stock = v_reserved_after
    WHERE id = p_product_id;

    -- Determine color/size: override or use product default
    v_color := COALESCE(p_color, v_product.color);
    v_size := COALESCE(p_size, v_product.size);

    -- Generate order number
    v_order_number := private.generate_order_number(p_store_id);

    -- Create order
    INSERT INTO public.orders (
        store_id, order_number, customer_id, product_id,
        customer_name_snapshot, product_title_snapshot,
        brand_snapshot, category_snapshot,
        color_snapshot, size_snapshot,
        quantity, selling_price,
        actual_converted_cost_at_sale, china_cost_at_sale,
        actual_profit, actual_profit_margin, actual_cost_ratio,
        status, order_date, notes
    ) VALUES (
        p_store_id, v_order_number, p_customer_id, p_product_id,
        v_customer.name, v_product.original_title,
        v_product.brand, v_product.category,
        v_color, v_size,
        p_quantity, p_selling_price,
        v_product.actual_converted_cost, v_product.china_base_price,
        0, 0, 0,
        'PENDING'::public.order_status, p_order_date, p_notes
    )
    RETURNING * INTO v_order;

    -- Create RESERVE inventory log
    INSERT INTO public.inventory_logs (
        store_id, product_id, order_id,
        change_type, quantity_change,
        stock_before, stock_after,
        reserved_before, reserved_after,
        notes
    ) VALUES (
        p_store_id, p_product_id, v_order.id,
        'RESERVE'::public.inventory_change_type, 0,
        v_current_stock, v_current_stock,
        v_reserved_before, v_reserved_after,
        'Order reservation'
    );

    RETURN v_order;
END;
$$;

-- Permissions
REVOKE ALL ON FUNCTION public.create_order(uuid, uuid, uuid, integer, numeric, date, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_order(uuid, uuid, uuid, integer, numeric, date, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_order(uuid, uuid, uuid, integer, numeric, date, text, text, text) TO authenticated;

-- ============================================================
-- 5. RPC: update_pending_order
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
    -- Auth check
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;

    -- Lock order row
    SELECT * INTO v_order FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF v_order IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
            MESSAGE = 'Order not found';
    END IF;

    v_store_id := v_order.store_id;

    -- Role check
    v_role := private.current_store_role(v_store_id);
    IF v_role IS NULL OR v_role NOT IN ('owner', 'manager') THEN
        RAISE EXCEPTION 'Insufficient permissions: owner or manager role required'
        USING ERRCODE = '42501';
    END IF;

    -- Only PENDING orders can be updated
    IF v_order.status != 'PENDING'::public.order_status THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
            MESSAGE = 'Only PENDING orders can be updated (current status: ' || v_order.status || ')';
    END IF;

    -- Validate customer
    SELECT * INTO v_customer FROM public.customers
    WHERE id = p_customer_id AND store_id = v_store_id AND deleted_at IS NULL;
    IF v_customer IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
            MESSAGE = 'Customer not found or is deleted in this store';
    END IF;

    -- Validate quantity
    IF p_quantity IS NULL OR p_quantity < 1 THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
            MESSAGE = 'Quantity must be at least 1';
    END IF;

    -- Validate selling price
    IF p_selling_price IS NULL OR p_selling_price <= 0 THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
            MESSAGE = 'Selling price must be greater than 0';
    END IF;

    v_old_product_id := v_order.product_id;
    v_old_quantity := v_order.quantity;

    -- If product changed: release old, reserve new (ordered lock to avoid deadlock)
    IF v_old_product_id != p_product_id THEN
        -- Lock products in UUID-sorted order to prevent deadlock
        IF v_old_product_id < p_product_id THEN
            SELECT * INTO v_product_old FROM public.products WHERE id = v_old_product_id AND store_id = v_store_id FOR UPDATE;
            SELECT * INTO v_product_new FROM public.products WHERE id = p_product_id AND store_id = v_store_id AND deleted_at IS NULL FOR UPDATE;
        ELSE
            SELECT * INTO v_product_new FROM public.products WHERE id = p_product_id AND store_id = v_store_id AND deleted_at IS NULL FOR UPDATE;
            SELECT * INTO v_product_old FROM public.products WHERE id = v_old_product_id AND store_id = v_store_id FOR UPDATE;
        END IF;

        IF v_product_new IS NULL THEN
            RAISE EXCEPTION USING ERRCODE = '22023',
                MESSAGE = 'New product not found or is deleted in this store';
        END IF;

        -- Release old product reservation
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

        -- RELEASE log for old product
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

        -- Reserve new product
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

        -- RESERVE log for new product
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
        -- Same product: adjust reservation quantity
        SELECT * INTO v_product_new FROM public.products
        WHERE id = p_product_id AND store_id = v_store_id FOR UPDATE;

        v_qty_diff := p_quantity - v_old_quantity;

        v_reserved_before_new := v_product_new.reserved_stock;
        v_current_stock_new := v_product_new.current_stock;

        IF v_qty_diff > 0 THEN
            -- Need to reserve more
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
            -- Release some reservation
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

    -- Determine color/size
    v_color := COALESCE(p_color, v_product_new.color);
    v_size := COALESCE(p_size, v_product_new.size);

    -- Update order (PENDING: profit fields stay 0)
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

-- Permissions
REVOKE ALL ON FUNCTION public.update_pending_order(uuid, uuid, uuid, integer, numeric, date, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_pending_order(uuid, uuid, uuid, integer, numeric, date, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_pending_order(uuid, uuid, uuid, integer, numeric, date, text, text, text) TO authenticated;

-- ============================================================
-- 6. RPC: ship_order
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
    v_revenue numeric;
    v_cost numeric;
    v_profit numeric;
    v_profit_margin numeric;
    v_cost_ratio numeric;
BEGIN
    -- Auth check
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;

    -- Lock order
    SELECT * INTO v_order FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF v_order IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
            MESSAGE = 'Order not found';
    END IF;

    v_store_id := v_order.store_id;

    -- Role check
    v_role := private.current_store_role(v_store_id);
    IF v_role IS NULL OR v_role NOT IN ('owner', 'manager') THEN
        RAISE EXCEPTION 'Insufficient permissions: owner or manager role required'
        USING ERRCODE = '42501';
    END IF;

    -- Only PENDING -> SHIPPED allowed
    IF v_order.status != 'PENDING'::public.order_status THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
            MESSAGE = 'Can only ship PENDING orders (current status: ' || v_order.status || ')';
    END IF;

    -- Sanitize shipping fields
    v_shipping_company := trim(COALESCE(p_shipping_company, ''));
    IF v_shipping_company = '' THEN
        v_shipping_company := NULL;
    END IF;

    v_tracking_number := trim(COALESCE(p_tracking_number, ''));
    IF v_tracking_number = '' THEN
        v_tracking_number := NULL;
    END IF;

    -- Lock product
    SELECT * INTO v_product FROM public.products
    WHERE id = v_order.product_id AND store_id = v_store_id
    FOR UPDATE;

    IF v_product IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
            MESSAGE = 'Product not found';
    END IF;

    -- Validate stock
    IF v_product.current_stock < v_order.quantity THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
            MESSAGE = 'Insufficient current stock: ' || v_product.current_stock || ' < ' || v_order.quantity;
    END IF;

    IF v_product.reserved_stock < v_order.quantity THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
            MESSAGE = 'Data inconsistency: reserved_stock less than order quantity';
    END IF;

    -- Record before values
    v_stock_before := v_product.current_stock;
    v_reserved_before := v_product.reserved_stock;
    v_stock_after := v_product.current_stock - v_order.quantity;
    v_reserved_after := v_product.reserved_stock - v_order.quantity;

    -- Update product stock
    UPDATE public.products
    SET
        current_stock = v_stock_after,
        reserved_stock = v_reserved_after
    WHERE id = v_order.product_id;

    -- Calculate profit based on sale-time cost snapshot
    v_revenue := v_order.selling_price * v_order.quantity;
    v_cost := COALESCE(v_order.actual_converted_cost_at_sale, 0) * v_order.quantity;
    v_profit := v_revenue - v_cost;

    IF v_revenue > 0 THEN
        v_profit_margin := (v_profit / v_revenue) * 100;
        v_cost_ratio := (v_cost / v_revenue) * 100;
    ELSE
        v_profit_margin := 0;
        v_cost_ratio := 0;
    END IF;

    -- Update order status and ship info
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

    -- Create SHIP inventory log
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

    -- Recalculate customer aggregates
    PERFORM private.recalculate_customer_aggregates(v_order.customer_id);

    RETURN v_order;
END;
$$;

-- Permissions
REVOKE ALL ON FUNCTION public.ship_order(uuid, date, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ship_order(uuid, date, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.ship_order(uuid, date, text, text) TO authenticated;

-- ============================================================
-- 7. RPC: cancel_order
-- ============================================================

CREATE OR REPLACE FUNCTION public.cancel_order(
    p_order_id uuid,
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
    v_product public.products;
    v_store_id uuid;
    v_role public.member_role;
    v_reserved_before integer;
    v_reserved_after integer;
    v_current_stock integer;
BEGIN
    -- Auth check
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;

    -- Lock order
    SELECT * INTO v_order FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF v_order IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
            MESSAGE = 'Order not found';
    END IF;

    v_store_id := v_order.store_id;

    -- Role check
    v_role := private.current_store_role(v_store_id);
    IF v_role IS NULL OR v_role NOT IN ('owner', 'manager') THEN
        RAISE EXCEPTION 'Insufficient permissions: owner or manager role required'
        USING ERRCODE = '42501';
    END IF;

    -- Only PENDING -> CANCELLED allowed
    IF v_order.status != 'PENDING'::public.order_status THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
            MESSAGE = 'Can only cancel PENDING orders (current status: ' || v_order.status || ')';
    END IF;

    -- Lock product
    SELECT * INTO v_product FROM public.products
    WHERE id = v_order.product_id AND store_id = v_store_id
    FOR UPDATE;

    IF v_product IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
            MESSAGE = 'Product not found';
    END IF;

    -- Validate reservation (data consistency check)
    IF v_product.reserved_stock < v_order.quantity THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
            MESSAGE = 'Data inconsistency: reserved_stock less than order quantity on cancel';
    END IF;

    -- Record values
    v_current_stock := v_product.current_stock;
    v_reserved_before := v_product.reserved_stock;
    v_reserved_after := v_product.reserved_stock - v_order.quantity;

    -- Release reservation
    UPDATE public.products
    SET reserved_stock = v_reserved_after
    WHERE id = v_order.product_id;

    -- Update order
    UPDATE public.orders
    SET
        status = 'CANCELLED'::public.order_status,
        notes = COALESCE(p_notes, notes)
    WHERE id = p_order_id
    RETURNING * INTO v_order;

    -- Create RELEASE inventory log
    INSERT INTO public.inventory_logs (
        store_id, product_id, order_id,
        change_type, quantity_change,
        stock_before, stock_after,
        reserved_before, reserved_after,
        notes
    ) VALUES (
        v_store_id, v_order.product_id, p_order_id,
        'RELEASE'::public.inventory_change_type, 0,
        v_current_stock, v_current_stock,
        v_reserved_before, v_reserved_after,
        'Order cancellation'
    );

    RETURN v_order;
END;
$$;

-- Permissions
REVOKE ALL ON FUNCTION public.cancel_order(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_order(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_order(uuid, text) TO authenticated;

-- ============================================================
-- 8. RPC: complete_order
-- ============================================================

CREATE OR REPLACE FUNCTION public.complete_order(
    p_order_id uuid
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid uuid;
    v_order public.orders;
    v_store_id uuid;
    v_role public.member_role;
BEGIN
    -- Auth check
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;

    -- Lock order
    SELECT * INTO v_order FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF v_order IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
            MESSAGE = 'Order not found';
    END IF;

    v_store_id := v_order.store_id;

    -- Role check
    v_role := private.current_store_role(v_store_id);
    IF v_role IS NULL OR v_role NOT IN ('owner', 'manager') THEN
        RAISE EXCEPTION 'Insufficient permissions: owner or manager role required'
        USING ERRCODE = '42501';
    END IF;

    -- Only SHIPPED -> COMPLETED allowed
    IF v_order.status != 'SHIPPED'::public.order_status THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
            MESSAGE = 'Can only complete SHIPPED orders (current status: ' || v_order.status || ')';
    END IF;

    -- Update order
    UPDATE public.orders
    SET status = 'COMPLETED'::public.order_status
    WHERE id = p_order_id
    RETURNING * INTO v_order;

    -- Recalculate customer aggregates (recompute to be safe)
    PERFORM private.recalculate_customer_aggregates(v_order.customer_id);

    RETURN v_order;
END;
$$;

-- Permissions
REVOKE ALL ON FUNCTION public.complete_order(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_order(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.complete_order(uuid) TO authenticated;

-- ============================================================
-- 9. Direct DML restrictions
-- ============================================================

-- --- orders: revoke INSERT/UPDATE, drop INSERT/UPDATE policies, keep SELECT

REVOKE INSERT, UPDATE ON public.orders FROM authenticated;

DROP POLICY IF EXISTS "Orders: owner/manager can insert" ON public.orders;
DROP POLICY IF EXISTS "Orders: owner/manager can update" ON public.orders;

-- --- products: revoke table-level UPDATE, grant column-level for safe columns

REVOKE UPDATE ON public.products FROM authenticated;

-- Column-level UPDATE for safe product fields only
-- Excluded: id, store_id, current_stock, reserved_stock, created_by, created_at, updated_by, updated_at, version
GRANT UPDATE (
    product_code, original_title, normalized_title, title_language,
    brand, category, color, size, material, season, fit, style,
    classification_status, korea_cost, actual_converted_cost,
    china_base_price, stock_year, stock_month, image, notes, deleted_at,
    legacy_id
) ON public.products TO authenticated;

-- --- customers: revoke table-level UPDATE, grant column-level for safe fields

REVOKE UPDATE ON public.customers FROM authenticated;

-- Column-level UPDATE for safe customer fields
-- Excluded: id, store_id, total_amount, total_profit, order_count, total_quantity,
--           last_order_date, created_by, created_at, updated_by, updated_at, version
GRANT UPDATE (
    name, wechat_nickname, phone, email, address, notes, level, deleted_at, legacy_id
) ON public.customers TO authenticated;
