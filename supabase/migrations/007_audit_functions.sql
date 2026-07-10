-- ============================================================
-- Audit Log Functions
-- ============================================================

-- ============================================================
-- Helper: mask sensitive fields in JSON data
-- ============================================================

CREATE OR REPLACE FUNCTION private.mask_sensitive_data(data jsonb)
RETURNS jsonb AS $$
BEGIN
    RETURN data
        #- '{phone}'
        #- '{email}'
        #- '{address}'
        #- '{image}'
        #- '{token}'
        #- '{password}'
        #- '{secret}'
        #- '{notes}'
        #- '{wechat_nickname}';
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '';

-- ============================================================
-- Helper: determine audit action based on row changes
-- ============================================================

CREATE OR REPLACE FUNCTION private.determine_audit_action(old_row jsonb, new_row jsonb)
RETURNS public.audit_action AS $$
BEGIN
    IF old_row IS NULL THEN
        RETURN 'INSERT';
    END IF;

    IF new_row IS NULL THEN
        RETURN 'UPDATE';
    END IF;

    IF (old_row ->> 'deleted_at') IS NULL AND (new_row ->> 'deleted_at') IS NOT NULL THEN
        RETURN 'SOFT_DELETE';
    END IF;

    IF (old_row ->> 'deleted_at') IS NOT NULL AND (new_row ->> 'deleted_at') IS NULL THEN
        RETURN 'RESTORE';
    END IF;

    RETURN 'UPDATE';
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '';

-- ============================================================
-- Main audit log function
-- ============================================================

CREATE OR REPLACE FUNCTION public.log_audit()
RETURNS trigger AS $$
DECLARE
    v_action public.audit_action;
    v_old_data jsonb;
    v_new_data jsonb;
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_action := 'INSERT';
        v_old_data := NULL;
        v_new_data := private.mask_sensitive_data(to_jsonb(NEW));
    ELSIF TG_OP = 'UPDATE' THEN
        v_action := private.determine_audit_action(to_jsonb(OLD), to_jsonb(NEW));
        v_old_data := private.mask_sensitive_data(to_jsonb(OLD));
        v_new_data := private.mask_sensitive_data(to_jsonb(NEW));
    ELSE
        RETURN NEW;
    END IF;

    INSERT INTO public.audit_logs (
        store_id,
        table_name,
        record_id,
        action,
        old_data,
        new_data,
        changed_by,
        changed_at,
        request_id,
        metadata
    ) VALUES (
        CASE WHEN to_jsonb(NEW) ? 'store_id' THEN (NEW.store_id)::uuid ELSE NULL END,
        TG_TABLE_NAME,
        CASE WHEN to_jsonb(NEW) ? 'id' THEN (NEW.id)::uuid ELSE NULL END,
        v_action,
        v_old_data,
        v_new_data,
        auth.uid(),
        now(),
        NULL,
        NULL
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '';

-- ============================================================
-- Apply audit triggers to business tables
-- ============================================================

CREATE TRIGGER trg_store_members_audit
    AFTER INSERT OR UPDATE ON public.store_members
    FOR EACH ROW
    EXECUTE FUNCTION public.log_audit();

CREATE TRIGGER trg_products_audit
    AFTER INSERT OR UPDATE ON public.products
    FOR EACH ROW
    EXECUTE FUNCTION public.log_audit();

CREATE TRIGGER trg_customers_audit
    AFTER INSERT OR UPDATE ON public.customers
    FOR EACH ROW
    EXECUTE FUNCTION public.log_audit();

CREATE TRIGGER trg_orders_audit
    AFTER INSERT OR UPDATE ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.log_audit();

CREATE TRIGGER trg_expenses_audit
    AFTER INSERT OR UPDATE ON public.expenses
    FOR EACH ROW
    EXECUTE FUNCTION public.log_audit();

CREATE TRIGGER trg_classification_keywords_audit
    AFTER INSERT OR UPDATE ON public.classification_keywords
    FOR EACH ROW
    EXECUTE FUNCTION public.log_audit();

CREATE TRIGGER trg_store_settings_audit
    AFTER INSERT OR UPDATE ON public.store_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.log_audit();

CREATE TRIGGER trg_migration_runs_audit
    AFTER INSERT OR UPDATE ON public.migration_runs
    FOR EACH ROW
    EXECUTE FUNCTION public.log_audit();

-- ============================================================
-- Permission restrictions for audit functions
-- ============================================================

REVOKE ALL ON FUNCTION private.mask_sensitive_data(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.determine_audit_action(jsonb, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_audit() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_audit() FROM anon;
REVOKE EXECUTE ON FUNCTION public.log_audit() FROM authenticated;

-- No GRANT to any role - only triggers can execute these functions