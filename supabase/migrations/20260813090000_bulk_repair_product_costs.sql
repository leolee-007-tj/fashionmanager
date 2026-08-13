CREATE OR REPLACE FUNCTION public.bulk_repair_product_costs(
    p_store_id uuid,
    p_rows jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_row jsonb;
    v_cost numeric;
    v_updated integer := 0;
    v_count integer;
    v_divisor numeric := 165;
BEGIN
    IF NOT private.has_store_role(
        p_store_id,
        ARRAY['owner'::public.member_role, 'manager'::public.member_role]
    ) THEN
        RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
    END IF;
    IF jsonb_typeof(p_rows) <> 'array' THEN
        RAISE EXCEPTION 'rows must be an array' USING ERRCODE = '22023';
    END IF;

    SELECT COALESCE(exchange_divisor, 165) INTO v_divisor
      FROM public.store_settings WHERE store_id = p_store_id;
    v_divisor := COALESCE(v_divisor, 165);

    FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
    LOOP
        v_cost := NULLIF(v_row->>'cost', '')::numeric;
        IF v_cost IS NULL OR v_cost <= 0 THEN CONTINUE; END IF;

        UPDATE public.products p
           SET korea_cost = v_cost,
               actual_converted_cost = round(v_cost / v_divisor),
               updated_at = now(),
               updated_by = auth.uid(),
               version = version + 1
         WHERE p.store_id = p_store_id
           AND p.deleted_at IS NULL
           AND lower(regexp_replace(btrim(p.brand), '[[:space:][:punct:]]+', '', 'g'))
             = lower(regexp_replace(btrim(COALESCE(v_row->>'brand', '')), '[[:space:][:punct:]]+', '', 'g'))
           AND lower(regexp_replace(btrim(p.original_title), '[[:space:][:punct:]]+', '', 'g'))
             = lower(regexp_replace(btrim(COALESCE(v_row->>'title', '')), '[[:space:][:punct:]]+', '', 'g'));
        GET DIAGNOSTICS v_count = ROW_COUNT;
        v_updated := v_updated + v_count;
    END LOOP;

    RETURN jsonb_build_object(
        'updated', v_updated,
        'zero_remaining', (
            SELECT count(*) FROM public.products
             WHERE store_id = p_store_id AND deleted_at IS NULL AND COALESCE(korea_cost, 0) <= 0
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_repair_product_costs(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bulk_repair_product_costs(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.bulk_repair_product_costs(uuid, jsonb) TO authenticated;
