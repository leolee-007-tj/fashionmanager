CREATE OR REPLACE FUNCTION public.repair_product_cost(
    p_store_id uuid,
    p_product_id uuid,
    p_korea_cost numeric,
    p_actual_converted_cost numeric,
    p_china_base_price numeric
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_count integer;
BEGIN
    IF NOT private.has_store_role(
        p_store_id,
        ARRAY['owner'::public.member_role, 'manager'::public.member_role]
    ) THEN
        RAISE EXCEPTION 'permission denied';
    END IF;
    IF p_korea_cost IS NULL OR p_korea_cost <= 0 THEN
        RAISE EXCEPTION 'korea_cost must be positive';
    END IF;

    UPDATE public.products
       SET korea_cost = p_korea_cost,
           actual_converted_cost = p_actual_converted_cost,
           china_base_price = p_china_base_price,
           updated_at = now(),
           updated_by = auth.uid(),
           version = version + 1
     WHERE id = p_product_id
       AND store_id = p_store_id
       AND deleted_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.repair_product_cost(uuid, uuid, numeric, numeric, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.repair_product_cost(uuid, uuid, numeric, numeric, numeric) FROM anon;
GRANT EXECUTE ON FUNCTION public.repair_product_cost(uuid, uuid, numeric, numeric, numeric) TO authenticated;
