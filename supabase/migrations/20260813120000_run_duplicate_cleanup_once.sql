-- Run the owner-only duplicate cleanup once for the single store that currently
-- contains duplicate customers, products, or completed sales.  Fail closed if
-- more than one store is a candidate so a deployment can never sweep unrelated
-- stores silently.
DO $$
DECLARE
    v_store_id uuid;
    v_owner_id uuid;
    v_candidate_count integer;
    v_result jsonb;
BEGIN
    WITH candidate_stores AS (
        SELECT store_id
          FROM public.customers
         WHERE deleted_at IS NULL
         GROUP BY store_id,
                  lower(regexp_replace(btrim(name), '[[:space:][:punct:]]+', '', 'g'))
        HAVING count(*) > 1

        UNION

        SELECT store_id
          FROM public.products
         WHERE deleted_at IS NULL
         GROUP BY store_id,
                  lower(regexp_replace(btrim(brand), '[[:space:][:punct:]]+', '', 'g')),
                  lower(regexp_replace(btrim(original_title), '[[:space:][:punct:]]+', '', 'g')),
                  lower(regexp_replace(btrim(COALESCE(color, '')), '[[:space:][:punct:]]+', '', 'g')),
                  lower(regexp_replace(btrim(COALESCE(size, '')), '[[:space:][:punct:]]+', '', 'g'))
        HAVING count(*) > 1

        UNION

        SELECT store_id
          FROM public.orders
         WHERE deleted_at IS NULL
           AND status IN ('SHIPPED'::public.order_status, 'COMPLETED'::public.order_status)
         GROUP BY store_id,
                  lower(regexp_replace(btrim(COALESCE(customer_name_snapshot, '')), '[[:space:][:punct:]]+', '', 'g')),
                  order_date,
                  lower(regexp_replace(btrim(COALESCE(product_title_snapshot, '')), '[[:space:][:punct:]]+', '', 'g'))
        HAVING count(*) > 1
    )
    SELECT count(*), min(store_id::text)::uuid
      INTO v_candidate_count, v_store_id
      FROM candidate_stores;

    IF v_candidate_count = 0 THEN
        RAISE NOTICE 'Duplicate cleanup: no candidate store found';
        RETURN;
    END IF;

    IF v_candidate_count <> 1 THEN
        RAISE EXCEPTION 'Duplicate cleanup aborted: expected one candidate store, found %',
            v_candidate_count;
    END IF;

    SELECT sm.user_id
      INTO v_owner_id
      FROM public.store_members sm
     WHERE sm.store_id = v_store_id
       AND sm.role = 'owner'::public.member_role
       AND sm.is_active = true
     ORDER BY sm.created_at, sm.user_id
     LIMIT 1;

    IF v_owner_id IS NULL THEN
        RAISE EXCEPTION 'Duplicate cleanup aborted: candidate store has no active owner';
    END IF;

    -- cleanup_all_duplicates intentionally requires an authenticated owner.
    -- Migrations have no JWT, so impersonate only the verified active owner for
    -- this transaction-local call, then clear the claim immediately.
    PERFORM set_config('request.jwt.claim.sub', v_owner_id::text, true);
    v_result := public.cleanup_all_duplicates(v_store_id);
    PERFORM set_config('request.jwt.claim.sub', '', true);

    RAISE NOTICE 'Duplicate cleanup result: %', v_result;
END;
$$;
