-- ============================================================
-- Migration: Fix cancel_order to allow inactive/deleted products
-- ============================================================
--
-- PURPOSE:
--   cancel_order RPC가 soft-deleted/inactive 상품에 연결된
--   PENDING 주문을 취소할 수 있도록 수정한다.
--
-- ROOT CAUSE:
--   validate_order_store_consistency 트리거가 orders UPDATE 시
--   product_id 변경 여부와 관계없이 deleted_at IS NULL 검사를
--   수행하여, soft-deleted 상품의 PENDING 주문 취소를 차단함.
--
-- CHANGES:
--   1. validate_order_store_consistency() 수정:
--      - product_id가 변경되지 않는 UPDATE(cancel, ship, complete)는
--        deleted_at IS NULL check를 생략한다.
--      - store_id 일치 여부만 확인한다.
--      - INSERT / product_id 변경 UPDATE는 기존과 동일하게
--        active product 검증을 유지한다.
--   2. cancel_order() 강화:
--      - product 조회 시 deleted_at IS NULL 조건을 제외한다.
--      - product가 없는 경우(store mismatch)만 오류 처리.
--      - soft-deleted product의 reserved_stock 해제를 허용한다.
--      - 오류 메시지를 명확하게 분류한다.
--
-- SECURITY:
--   - SECURITY DEFINER, SET search_path = ''
--   - All relations schema-qualified
--   - No dynamic SQL
--   - auth.uid() is the only user identifier
--
-- ============================================================

-- ============================================================
-- 1. Fix validate_order_store_consistency trigger
-- ============================================================
-- 
-- product_id가 변경되지 않는 UPDATE(cancel/ship/complete)는
-- deleted_at IS NULL 검사를 하지 않는다.
-- 단, store_id 일치는 항상 확인한다.
-- ============================================================

CREATE OR REPLACE FUNCTION public.validate_order_store_consistency()
RETURNS trigger AS $$
BEGIN
    -- Validate customer_id only on INSERT or when customer_id changes
    IF (TG_OP = 'INSERT' AND NEW.customer_id IS NOT NULL)
       OR (TG_OP = 'UPDATE' AND NEW.customer_id IS DISTINCT FROM OLD.customer_id AND NEW.customer_id IS NOT NULL) THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.customers
            WHERE id = NEW.customer_id AND store_id = NEW.store_id AND deleted_at IS NULL
        ) THEN
            RAISE EXCEPTION 'customer_id must be active and belong to the same store';
        END IF;
    END IF;

    -- Validate product_id:
    -- - INSERT: product must be active (deleted_at IS NULL)
    -- - UPDATE with product_id change: product must be active
    -- - UPDATE without product_id change (cancel/ship/complete):
    --   skip deleted_at check, only verify store_id match
    IF (TG_OP = 'INSERT' AND NEW.product_id IS NOT NULL) THEN
        -- INSERT: full active check
        IF NOT EXISTS (
            SELECT 1 FROM public.products
            WHERE id = NEW.product_id AND store_id = NEW.store_id AND deleted_at IS NULL
        ) THEN
            RAISE EXCEPTION 'product_id must be active and belong to the same store';
        END IF;
    ELSIF (TG_OP = 'UPDATE' AND NEW.product_id IS DISTINCT FROM OLD.product_id AND NEW.product_id IS NOT NULL) THEN
        -- UPDATE with product_id change: full active check
        IF NOT EXISTS (
            SELECT 1 FROM public.products
            WHERE id = NEW.product_id AND store_id = NEW.store_id AND deleted_at IS NULL
        ) THEN
            RAISE EXCEPTION 'product_id must be active and belong to the same store';
        END IF;
    ELSIF (TG_OP = 'UPDATE' AND NEW.product_id IS NOT NULL
           AND NEW.product_id IS NOT DISTINCT FROM OLD.product_id) THEN
        -- UPDATE without product_id change (cancel/ship/complete):
        -- only verify store_id match, allow soft-deleted products
        IF NOT EXISTS (
            SELECT 1 FROM public.products
            WHERE id = NEW.product_id AND store_id = NEW.store_id
        ) THEN
            RAISE EXCEPTION 'ORDER_PRODUCT_STORE_MISMATCH';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '';

-- Re-create trigger to ensure it uses the updated function
DROP TRIGGER IF EXISTS trg_orders_validate_store ON public.orders;

CREATE TRIGGER trg_orders_validate_store
    BEFORE INSERT OR UPDATE ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_order_store_consistency();

-- ============================================================
-- 2. Fix cancel_order RPC
-- ============================================================
-- 
-- product 조회 시 deleted_at IS NULL 제외.
-- soft-deleted product의 reserved_stock 해제 허용.
-- 오류 메시지 명확화.
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
            MESSAGE = 'ORDER_NOT_FOUND';
    END IF;

    v_store_id := v_order.store_id;

    -- Role check
    v_role := private.current_store_role(v_store_id);
    IF v_role IS NULL OR v_role NOT IN ('owner', 'manager') THEN
        RAISE EXCEPTION 'ORDER_CANCEL_PERMISSION_DENIED'
        USING ERRCODE = '42501';
    END IF;

    -- Only PENDING -> CANCELLED allowed
    IF v_order.status != 'PENDING'::public.order_status THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
            MESSAGE = 'ORDER_NOT_PENDING';
    END IF;

    -- Lock product (use order.product_id from existing order, NOT from client)
    -- Do NOT require deleted_at IS NULL - soft-deleted products can still be cancelled
    SELECT * INTO v_product FROM public.products
    WHERE id = v_order.product_id AND store_id = v_store_id
    FOR UPDATE;

    IF v_product IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
            MESSAGE = 'ORDER_PRODUCT_STORE_MISMATCH';
    END IF;

    -- Validate reservation (data consistency check)
    -- Product may be soft-deleted, but reserved_stock should still be valid
    IF v_product.reserved_stock < v_order.quantity THEN
        -- If product is soft-deleted and reserved_stock < quantity,
        -- still allow cancel (the reservation was released on delete)
        IF v_product.deleted_at IS NOT NULL THEN
            -- Skip reservation release, just cancel the order
            UPDATE public.orders
            SET
                status = 'CANCELLED'::public.order_status,
                notes = CASE
                    WHEN p_notes IS NOT NULL AND p_notes != '' THEN
                        COALESCE(v_order.notes || '; ', '') || p_notes
                    ELSE v_order.notes
                END
            WHERE id = p_order_id
            RETURNING * INTO v_order;

            RETURN v_order;
        END IF;

        RAISE EXCEPTION USING ERRCODE = '22023',
            MESSAGE = 'Data inconsistency: reserved_stock less than order quantity on cancel';
    END IF;

    -- Record values
    v_current_stock := v_product.current_stock;
    v_reserved_before := v_product.reserved_stock;
    v_reserved_after := v_product.reserved_stock - v_order.quantity;

    -- Release reservation (use GREATEST to prevent negative)
    UPDATE public.products
    SET reserved_stock = GREATEST(COALESCE(v_reserved_after, 0), 0),
        updated_at = now()
    WHERE id = v_order.product_id;

    -- Update order
    UPDATE public.orders
    SET
        status = 'CANCELLED'::public.order_status,
        notes = CASE
            WHEN p_notes IS NOT NULL AND p_notes != '' THEN
                COALESCE(v_order.notes || '; ', '') || p_notes
            ELSE v_order.notes
        END
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
        v_reserved_before, GREATEST(COALESCE(v_reserved_after, 0), 0),
        'Order cancellation'
    );

    RETURN v_order;
END;
$$;

-- Permissions (re-grant)
REVOKE ALL ON FUNCTION public.cancel_order(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_order(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_order(uuid, text) TO authenticated;