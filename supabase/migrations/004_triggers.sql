-- ============================================================
-- Trigger 1: profiles (no store_id, no version)
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_profile_update()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();

    -- Prevent changing id
    IF NEW.id IS DISTINCT FROM OLD.id THEN
        RAISE EXCEPTION 'Changing id is not allowed';
    END IF;

    -- Prevent changing created_at
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
-- Trigger 2: tables with store_id AND version
-- stores, products, customers, orders, expenses, classification_keywords, store_settings, migration_runs
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_store_data_update()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    NEW.version = OLD.version + 1;

    -- Prevent changing id
    IF NEW.id IS DISTINCT FROM OLD.id THEN
        RAISE EXCEPTION 'Changing id is not allowed';
    END IF;

    -- Prevent changing store_id
    IF NEW.store_id IS DISTINCT FROM OLD.store_id THEN
        RAISE EXCEPTION 'Changing store_id is not allowed';
    END IF;

    -- Prevent changing created_at
    IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'Changing created_at is not allowed';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_stores_updated_at
    BEFORE UPDATE ON public.stores
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_store_data_update();

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

CREATE TRIGGER trg_migration_runs_updated_at
    BEFORE UPDATE ON public.migration_runs
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_store_data_update();

-- ============================================================
-- Trigger 3: store_members (has store_id, no version)
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_store_member_update()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();

    -- Prevent changing id
    IF NEW.id IS DISTINCT FROM OLD.id THEN
        RAISE EXCEPTION 'Changing id is not allowed';
    END IF;

    -- Prevent changing store_id
    IF NEW.store_id IS DISTINCT FROM OLD.store_id THEN
        RAISE EXCEPTION 'Changing store_id is not allowed';
    END IF;

    -- Prevent changing created_at
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
-- Trigger 4: audit metadata protection (created_by / updated_by)
-- Applies to: products, customers, orders, expenses, classification_keywords, store_settings, migration_runs
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_audit_metadata()
RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.created_by = auth.uid();
        NEW.updated_by = auth.uid();
    ELSIF TG_OP = 'UPDATE' THEN
        -- Prevent tampering with created_by
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

CREATE TRIGGER trg_migration_runs_audit_metadata
    BEFORE INSERT OR UPDATE ON public.migration_runs
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_audit_metadata();

-- ============================================================
-- Trigger 5: Cross-store validation + soft-deleted entity block
-- orders
-- ============================================================

CREATE OR REPLACE FUNCTION public.validate_order_store_consistency()
RETURNS trigger AS $$
BEGIN
    IF NEW.customer_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.customers
            WHERE id = NEW.customer_id AND store_id = NEW.store_id AND deleted_at IS NULL
        ) THEN
            RAISE EXCEPTION 'customer_id must be active and belong to the same store';
        END IF;
    END IF;

    IF NEW.product_id IS NOT NULL THEN
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
-- Trigger 6: Cross-store validation + soft-deleted entity block
-- inventory_logs
-- ============================================================

CREATE OR REPLACE FUNCTION public.validate_inventory_log_store_consistency()
RETURNS trigger AS $$
BEGIN
    IF NEW.product_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.products
            WHERE id = NEW.product_id AND store_id = NEW.store_id AND deleted_at IS NULL
        ) THEN
            RAISE EXCEPTION 'product_id must be active and belong to the same store';
        END IF;
    END IF;

    IF NEW.order_id IS NOT NULL THEN
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
-- Trigger 7: Prevent last active owner removal
-- ============================================================

CREATE OR REPLACE FUNCTION public.prevent_last_owner_removal()
RETURNS trigger AS $$
DECLARE
    v_owner_count integer;
BEGIN
    -- Only check if role is being changed away from owner or is_active becoming false
    IF (OLD.role = 'owner' AND NEW.role != 'owner')
       OR (OLD.is_active = true AND NEW.is_active = false) THEN

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

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '';

CREATE TRIGGER trg_store_members_prevent_last_owner_removal
    BEFORE UPDATE ON public.store_members
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_last_owner_removal();