-- ============================================================
-- Trigger 1: profiles (no store_id, no version, no created_by)
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_profile_update()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();

    IF NEW.id IS DISTINCT FROM OLD.id THEN
        RAISE EXCEPTION 'Changing id is not allowed';
    END IF;

    IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'Changing created_at is not allowed';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_profile_update();

-- ============================================================
-- Trigger 2: stores (no store_id column, has version, has created_by)
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_store_update()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    NEW.version = OLD.version + 1;

    IF NEW.id IS DISTINCT FROM OLD.id THEN
        RAISE EXCEPTION 'Changing id is not allowed';
    END IF;

    IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'Changing created_at is not allowed';
    END IF;

    IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION 'Changing created_by is not allowed';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_stores_updated_at
    BEFORE UPDATE ON public.stores
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_store_update();

-- ============================================================
-- Trigger 3: tables with store_id AND version AND created_by/updated_by
-- products, customers, orders, expenses, classification_keywords, store_settings
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_store_data_update()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    NEW.version = OLD.version + 1;

    IF NEW.id IS DISTINCT FROM OLD.id THEN
        RAISE EXCEPTION 'Changing id is not allowed';
    END IF;

    IF NEW.store_id IS DISTINCT FROM OLD.store_id THEN
        RAISE EXCEPTION 'Changing store_id is not allowed';
    END IF;

    IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'Changing created_at is not allowed';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_products_updated_at
    BEFORE UPDATE ON public.products
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_store_data_update();

CREATE TRIGGER trg_customers_updated_at
    BEFORE UPDATE ON public.customers
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_store_data_update();

CREATE TRIGGER trg_orders_updated_at
    BEFORE UPDATE ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_store_data_update();

CREATE TRIGGER trg_expenses_updated_at
    BEFORE UPDATE ON public.expenses
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_store_data_update();

CREATE TRIGGER trg_classification_keywords_updated_at
    BEFORE UPDATE ON public.classification_keywords
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_store_data_update();

CREATE TRIGGER trg_store_settings_updated_at
    BEFORE UPDATE ON public.store_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_store_data_update();

-- ============================================================
-- Trigger 4: store_members (has store_id, no version, no created_by/updated_by)
-- Protects: id, store_id, user_id, created_at from being changed
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_store_member_update()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();

    IF NEW.id IS DISTINCT FROM OLD.id THEN
        RAISE EXCEPTION 'Changing id is not allowed';
    END IF;

    IF NEW.store_id IS DISTINCT FROM OLD.store_id THEN
        RAISE EXCEPTION 'Changing store_id is not allowed';
    END IF;

    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
        RAISE EXCEPTION 'Changing user_id is not allowed. Deactivate existing membership and create a new one instead.';
    END IF;

    IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'Changing created_at is not allowed';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_store_members_updated_at
    BEFORE UPDATE ON public.store_members
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_store_member_update();

-- ============================================================
-- Trigger 5: audit metadata protection (created_by / updated_by)
-- Applies to: products, customers, orders, expenses, classification_keywords, store_settings
-- NOT stores (separate handling in handle_store_update)
-- NOT migration_runs (separate function)
-- NOT profiles, store_members, inventory_logs, audit_logs (no created_by/updated_by pattern)
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_audit_metadata()
RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.created_by = auth.uid();
        NEW.updated_by = auth.uid();
    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
            RAISE EXCEPTION 'Changing created_by is not allowed';
        END IF;
        NEW.updated_by = auth.uid();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_products_audit_metadata
    BEFORE INSERT OR UPDATE ON public.products
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_audit_metadata();

CREATE TRIGGER trg_customers_audit_metadata
    BEFORE INSERT OR UPDATE ON public.customers
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_audit_metadata();

CREATE TRIGGER trg_orders_audit_metadata
    BEFORE INSERT OR UPDATE ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_audit_metadata();

CREATE TRIGGER trg_expenses_audit_metadata
    BEFORE INSERT OR UPDATE ON public.expenses
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_audit_metadata();

CREATE TRIGGER trg_keywords_audit_metadata
    BEFORE INSERT OR UPDATE ON public.classification_keywords
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_audit_metadata();

CREATE TRIGGER trg_store_settings_audit_metadata
    BEFORE INSERT OR UPDATE ON public.store_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_audit_metadata();

-- ============================================================
-- Trigger 6: migration_runs metadata (initiated_by, not created_by/updated_by)
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_migration_run_metadata()
RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.initiated_by = auth.uid();
    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.initiated_by IS DISTINCT FROM OLD.initiated_by THEN
            RAISE EXCEPTION 'Changing initiated_by is not allowed';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_migration_runs_metadata
    BEFORE INSERT OR UPDATE ON public.migration_runs
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_migration_run_metadata();

-- ============================================================
-- Trigger 7: Cross-store validation + soft-deleted entity block
-- orders
-- Only validates when relationship is changed (or new row)
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

    -- Validate product_id only on INSERT or when product_id changes
    IF (TG_OP = 'INSERT' AND NEW.product_id IS NOT NULL)
       OR (TG_OP = 'UPDATE' AND NEW.product_id IS DISTINCT FROM OLD.product_id AND NEW.product_id IS NOT NULL) THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.products
            WHERE id = NEW.product_id AND store_id = NEW.store_id AND deleted_at IS NULL
        ) THEN
            RAISE EXCEPTION 'product_id must be active and belong to the same store';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '';

CREATE TRIGGER trg_orders_validate_store
    BEFORE INSERT OR UPDATE ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_order_store_consistency();

-- ============================================================
-- Trigger 8: Cross-store validation + soft-deleted entity block
-- inventory_logs
-- Only validates when relationship changes (or new row)
-- ============================================================

CREATE OR REPLACE FUNCTION public.validate_inventory_log_store_consistency()
RETURNS trigger AS $$
BEGIN
    -- Validate product_id only on INSERT or when product_id changes
    IF (TG_OP = 'INSERT' AND NEW.product_id IS NOT NULL)
       OR (TG_OP = 'UPDATE' AND NEW.product_id IS DISTINCT FROM OLD.product_id AND NEW.product_id IS NOT NULL) THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.products
            WHERE id = NEW.product_id AND store_id = NEW.store_id AND deleted_at IS NULL
        ) THEN
            RAISE EXCEPTION 'product_id must be active and belong to the same store';
        END IF;
    END IF;

    -- Validate order_id only on INSERT or when order_id changes
    IF (TG_OP = 'INSERT' AND NEW.order_id IS NOT NULL)
       OR (TG_OP = 'UPDATE' AND NEW.order_id IS DISTINCT FROM OLD.order_id AND NEW.order_id IS NOT NULL) THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.orders
            WHERE id = NEW.order_id AND store_id = NEW.store_id AND deleted_at IS NULL
        ) THEN
            RAISE EXCEPTION 'order_id must be active and belong to the same store';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '';

CREATE TRIGGER trg_inventory_logs_validate_store
    BEFORE INSERT OR UPDATE ON public.inventory_logs
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_inventory_log_store_consistency();

-- ============================================================
-- Trigger 9: Prevent last active owner removal
-- Uses advisory transaction lock per store for concurrency safety
-- ============================================================

CREATE OR REPLACE FUNCTION public.prevent_last_owner_removal()
RETURNS trigger AS $$
DECLARE
    v_owner_count integer;
BEGIN
    -- Only check if this is an active owner being changed in a way that reduces the count
    IF OLD.is_active = true AND OLD.role = 'owner' THEN
        IF (NEW.role != 'owner') OR (NEW.is_active = false) OR (NEW.user_id IS DISTINCT FROM OLD.user_id) THEN

            -- Acquire per-store advisory transaction lock to prevent race conditions
            PERFORM pg_advisory_xact_lock(hashtextextended(OLD.store_id::text, 0));

            -- Re-check with the lock held
            SELECT count(*) INTO v_owner_count
            FROM public.store_members
            WHERE store_id = OLD.store_id
              AND role = 'owner'
              AND is_active = true
              AND id != OLD.id;

            IF v_owner_count = 0 THEN
                RAISE EXCEPTION 'Cannot remove the last active owner of a store';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '';

CREATE TRIGGER trg_store_members_prevent_last_owner_removal
    BEFORE UPDATE ON public.store_members
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_last_owner_removal();

-- ============================================================
-- Revoke EXECUTE on trigger functions from PUBLIC/anon/authenticated
-- Triggers do not need explicit EXECUTE grants to fire,
-- but we want to prevent direct RPC calls from clients.
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.handle_profile_update() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_profile_update() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_profile_update() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.handle_store_update() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_store_update() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_store_update() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.handle_store_data_update() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_store_data_update() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_store_data_update() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.handle_store_member_update() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_store_member_update() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_store_member_update() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.handle_audit_metadata() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_audit_metadata() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_audit_metadata() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.handle_migration_run_metadata() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_migration_run_metadata() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_migration_run_metadata() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.validate_order_store_consistency() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_order_store_consistency() FROM anon;
REVOKE EXECUTE ON FUNCTION public.validate_order_store_consistency() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.validate_inventory_log_store_consistency() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_inventory_log_store_consistency() FROM anon;
REVOKE EXECUTE ON FUNCTION public.validate_inventory_log_store_consistency() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.prevent_last_owner_removal() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prevent_last_owner_removal() FROM anon;
REVOKE EXECUTE ON FUNCTION public.prevent_last_owner_removal() FROM authenticated;
