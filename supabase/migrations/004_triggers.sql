-- ============================================================
-- Common trigger function: updated_at + version + immutable id/store_id
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_updated_at_and_version()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();

    -- Prevent changing id
    IF NEW.id IS DISTINCT FROM OLD.id THEN
        RAISE EXCEPTION 'Changing id is not allowed';
    END IF;

    -- Prevent changing store_id if the table has it
    IF to_jsonb(OLD) ? 'store_id' AND NEW.store_id IS DISTINCT FROM OLD.store_id THEN
        RAISE EXCEPTION 'Changing store_id is not allowed';
    END IF;

    -- Increment version if the table has it
    IF to_jsonb(OLD) ? 'version' THEN
        NEW.version = OLD.version + 1;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Apply to tables with updated_at (excluding append-only tables)
-- ============================================================

CREATE TRIGGER trg_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at_and_version();

CREATE TRIGGER trg_stores_updated_at
    BEFORE UPDATE ON public.stores
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at_and_version();

CREATE TRIGGER trg_store_members_updated_at
    BEFORE UPDATE ON public.store_members
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at_and_version();

CREATE TRIGGER trg_products_updated_at
    BEFORE UPDATE ON public.products
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at_and_version();

CREATE TRIGGER trg_customers_updated_at
    BEFORE UPDATE ON public.customers
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at_and_version();

CREATE TRIGGER trg_orders_updated_at
    BEFORE UPDATE ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at_and_version();

CREATE TRIGGER trg_expenses_updated_at
    BEFORE UPDATE ON public.expenses
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at_and_version();

CREATE TRIGGER trg_classification_keywords_updated_at
    BEFORE UPDATE ON public.classification_keywords
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at_and_version();

CREATE TRIGGER trg_store_settings_updated_at
    BEFORE UPDATE ON public.store_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at_and_version();

CREATE TRIGGER trg_migration_runs_updated_at
    BEFORE UPDATE ON public.migration_runs
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at_and_version();

-- ============================================================
-- Cross-store validation triggers
-- ============================================================

-- orders: customer_id and product_id must belong to the same store
CREATE OR REPLACE FUNCTION public.validate_order_store_consistency()
RETURNS trigger AS $$
BEGIN
    IF NEW.customer_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.customers
            WHERE id = NEW.customer_id AND store_id = NEW.store_id
        ) THEN
            RAISE EXCEPTION 'customer_id does not belong to the same store';
        END IF;
    END IF;

    IF NEW.product_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.products
            WHERE id = NEW.product_id AND store_id = NEW.store_id
        ) THEN
            RAISE EXCEPTION 'product_id does not belong to the same store';
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

-- inventory_logs: product_id and order_id must belong to the same store
CREATE OR REPLACE FUNCTION public.validate_inventory_log_store_consistency()
RETURNS trigger AS $$
BEGIN
    IF NEW.product_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.products
            WHERE id = NEW.product_id AND store_id = NEW.store_id
        ) THEN
            RAISE EXCEPTION 'product_id does not belong to the same store';
        END IF;
    END IF;

    IF NEW.order_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.orders
            WHERE id = NEW.order_id AND store_id = NEW.store_id
        ) THEN
            RAISE EXCEPTION 'order_id does not belong to the same store';
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