-- Re-assert the inactive-product cancellation fix on remote databases where
-- migration history exists but the function definition may have drifted.

CREATE OR REPLACE FUNCTION public.validate_order_store_consistency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF (TG_OP = 'INSERT' AND NEW.customer_id IS NOT NULL)
       OR (TG_OP = 'UPDATE' AND NEW.customer_id IS DISTINCT FROM OLD.customer_id AND NEW.customer_id IS NOT NULL) THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.customers
            WHERE id = NEW.customer_id AND store_id = NEW.store_id AND deleted_at IS NULL
        ) THEN
            RAISE EXCEPTION 'customer_id must be active and belong to the same store';
        END IF;
    END IF;

    IF (TG_OP = 'INSERT' AND NEW.product_id IS NOT NULL)
       OR (TG_OP = 'UPDATE' AND NEW.product_id IS DISTINCT FROM OLD.product_id AND NEW.product_id IS NOT NULL) THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.products
            WHERE id = NEW.product_id AND store_id = NEW.store_id AND deleted_at IS NULL
        ) THEN
            RAISE EXCEPTION 'product_id must be active and belong to the same store';
        END IF;
    ELSIF TG_OP = 'UPDATE' AND NEW.product_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.products
            WHERE id = NEW.product_id AND store_id = NEW.store_id
        ) THEN
            RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ORDER_PRODUCT_STORE_MISMATCH';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_validate_store ON public.orders;
CREATE TRIGGER trg_orders_validate_store
    BEFORE INSERT OR UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.validate_order_store_consistency();

CREATE OR REPLACE FUNCTION public.cancel_order(p_order_id uuid, p_notes text DEFAULT NULL)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_order public.orders;
    v_product public.products;
    v_role public.member_role;
    v_reserved_before integer;
    v_reserved_after integer;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF v_order IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ORDER_NOT_FOUND';
    END IF;

    v_role := private.current_store_role(v_order.store_id);
    IF v_role IS NULL OR v_role NOT IN ('owner', 'manager') THEN
        RAISE EXCEPTION 'ORDER_CANCEL_PERMISSION_DENIED' USING ERRCODE = '42501';
    END IF;
    IF v_order.status != 'PENDING'::public.order_status THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ORDER_NOT_PENDING';
    END IF;

    -- Historical orders must remain cancellable after their product is soft-deleted.
    SELECT * INTO v_product FROM public.products
    WHERE id = v_order.product_id AND store_id = v_order.store_id
    FOR UPDATE;
    IF v_product IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ORDER_PRODUCT_STORE_MISMATCH';
    END IF;

    v_reserved_before := COALESCE(v_product.reserved_stock, 0);
    v_reserved_after := GREATEST(v_reserved_before - v_order.quantity, 0);

    UPDATE public.products
    SET reserved_stock = v_reserved_after, updated_at = now()
    WHERE id = v_order.product_id;

    UPDATE public.orders
    SET status = 'CANCELLED'::public.order_status,
        notes = CASE
            WHEN NULLIF(p_notes, '') IS NOT NULL
                THEN COALESCE(v_order.notes || '; ', '') || p_notes
            ELSE v_order.notes
        END
    WHERE id = p_order_id
    RETURNING * INTO v_order;

    INSERT INTO public.inventory_logs (
        store_id, product_id, order_id, change_type, quantity_change,
        stock_before, stock_after, reserved_before, reserved_after, notes
    ) VALUES (
        v_order.store_id, v_order.product_id, v_order.id,
        'RELEASE'::public.inventory_change_type, 0,
        v_product.current_stock, v_product.current_stock,
        v_reserved_before, v_reserved_after, 'Order cancellation'
    );

    RETURN v_order;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_order(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_order(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_order(uuid, text) TO authenticated;
