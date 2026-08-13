CREATE OR REPLACE FUNCTION public.soft_delete_customer(
    p_store_id uuid,
    p_customer_id uuid
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

    UPDATE public.customers
       SET deleted_at = now(),
           updated_at = now(),
           updated_by = auth.uid(),
           version = version + 1
     WHERE id = p_customer_id
       AND store_id = p_store_id
       AND deleted_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.soft_delete_customer(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.soft_delete_customer(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_customer(uuid, uuid) TO authenticated;
