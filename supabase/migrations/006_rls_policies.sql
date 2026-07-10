-- ============================================================
-- RLS Policies
-- ============================================================

-- ============================================================
-- Enable RLS on all tables
-- ============================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classification_keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.migration_runs ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- GRANT/REVOKE base permissions
-- ============================================================

-- Revoke all from anon for business tables
REVOKE ALL ON public.profiles FROM anon;
REVOKE ALL ON public.stores FROM anon;
REVOKE ALL ON public.store_members FROM anon;
REVOKE ALL ON public.products FROM anon;
REVOKE ALL ON public.customers FROM anon;
REVOKE ALL ON public.orders FROM anon;
REVOKE ALL ON public.inventory_logs FROM anon;
REVOKE ALL ON public.expenses FROM anon;
REVOKE ALL ON public.classification_keywords FROM anon;
REVOKE ALL ON public.store_settings FROM anon;
REVOKE ALL ON public.audit_logs FROM anon;
REVOKE ALL ON public.migration_runs FROM anon;

-- Grant authenticated basic permissions (RLS will filter)
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.stores TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.store_members TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.products TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.customers TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.orders TO authenticated;
GRANT SELECT ON public.inventory_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.expenses TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.classification_keywords TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.store_settings TO authenticated;
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.migration_runs TO authenticated;

-- No DELETE for business tables (soft delete only)
REVOKE DELETE ON public.profiles FROM authenticated;
REVOKE DELETE ON public.stores FROM authenticated;
REVOKE DELETE ON public.store_members FROM authenticated;
REVOKE DELETE ON public.products FROM authenticated;
REVOKE DELETE ON public.customers FROM authenticated;
REVOKE DELETE ON public.orders FROM authenticated;
REVOKE DELETE ON public.inventory_logs FROM authenticated;
REVOKE DELETE ON public.expenses FROM authenticated;
REVOKE DELETE ON public.classification_keywords FROM authenticated;
REVOKE DELETE ON public.store_settings FROM authenticated;
REVOKE DELETE ON public.audit_logs FROM authenticated;
REVOKE DELETE ON public.migration_runs FROM authenticated;

-- ============================================================
-- profiles policies
-- ============================================================

CREATE POLICY "Profiles: users can view their own profile"
    ON public.profiles
    FOR SELECT TO authenticated
    USING (auth.uid() = id);

CREATE POLICY "Profiles: users can update their own profile"
    ON public.profiles
    FOR UPDATE TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- ============================================================
-- stores policies
-- ============================================================

CREATE POLICY "Stores: active members can view active"
    ON public.stores
    FOR SELECT TO authenticated
    USING (private.is_store_member(id) AND deleted_at IS NULL);

CREATE POLICY "Stores: owners can view deleted"
    ON public.stores
    FOR SELECT TO authenticated
    USING (private.has_store_role(id, ARRAY['owner'::member_role]) AND deleted_at IS NOT NULL);

CREATE POLICY "Stores: owners can update"
    ON public.stores
    FOR UPDATE TO authenticated
    USING (private.has_store_role(id, ARRAY['owner'::member_role]))
    WITH CHECK (private.has_store_role(id, ARRAY['owner'::member_role]));

-- ============================================================
-- store_members policies
-- ============================================================

CREATE POLICY "StoreMembers: active members can view same store"
    ON public.store_members
    FOR SELECT TO authenticated
    USING (private.is_store_member(store_id));

CREATE POLICY "StoreMembers: owners can insert"
    ON public.store_members
    FOR INSERT TO authenticated
    WITH CHECK (private.has_store_role(store_id, ARRAY['owner'::member_role]));

CREATE POLICY "StoreMembers: owners can update"
    ON public.store_members
    FOR UPDATE TO authenticated
    USING (private.has_store_role(store_id, ARRAY['owner'::member_role]))
    WITH CHECK (private.has_store_role(store_id, ARRAY['owner'::member_role]));

-- ============================================================
-- products policies
-- staff base table SELECT blocked; owner/manager only
-- ============================================================

CREATE POLICY "Products: owner/manager can view active"
    ON public.products
    FOR SELECT TO authenticated
    USING (private.has_store_role(store_id, ARRAY['owner'::member_role, 'manager'::member_role]) AND deleted_at IS NULL);

CREATE POLICY "Products: owners can view deleted"
    ON public.products
    FOR SELECT TO authenticated
    USING (private.has_store_role(store_id, ARRAY['owner'::member_role]) AND deleted_at IS NOT NULL);

CREATE POLICY "Products: owner/manager can insert"
    ON public.products
    FOR INSERT TO authenticated
    WITH CHECK (private.has_store_role(store_id, ARRAY['owner'::member_role, 'manager'::member_role]));

CREATE POLICY "Products: owner/manager can update"
    ON public.products
    FOR UPDATE TO authenticated
    USING (private.has_store_role(store_id, ARRAY['owner'::member_role, 'manager'::member_role]))
    WITH CHECK (private.has_store_role(store_id, ARRAY['owner'::member_role, 'manager'::member_role]));

-- ============================================================
-- customers policies
-- staff base table SELECT blocked; owner/manager only
-- ============================================================

CREATE POLICY "Customers: owner/manager can view active"
    ON public.customers
    FOR SELECT TO authenticated
    USING (private.has_store_role(store_id, ARRAY['owner'::member_role, 'manager'::member_role]) AND deleted_at IS NULL);

CREATE POLICY "Customers: owners can view deleted"
    ON public.customers
    FOR SELECT TO authenticated
    USING (private.has_store_role(store_id, ARRAY['owner'::member_role]) AND deleted_at IS NOT NULL);

CREATE POLICY "Customers: owner/manager can insert"
    ON public.customers
    FOR INSERT TO authenticated
    WITH CHECK (private.has_store_role(store_id, ARRAY['owner'::member_role, 'manager'::member_role]));

CREATE POLICY "Customers: owner/manager can update"
    ON public.customers
    FOR UPDATE TO authenticated
    USING (private.has_store_role(store_id, ARRAY['owner'::member_role, 'manager'::member_role]))
    WITH CHECK (private.has_store_role(store_id, ARRAY['owner'::member_role, 'manager'::member_role]));

-- ============================================================
-- orders policies
-- staff base table SELECT blocked; owner/manager only
-- ============================================================

CREATE POLICY "Orders: owner/manager can view active"
    ON public.orders
    FOR SELECT TO authenticated
    USING (private.has_store_role(store_id, ARRAY['owner'::member_role, 'manager'::member_role]) AND deleted_at IS NULL);

CREATE POLICY "Orders: owners can view deleted"
    ON public.orders
    FOR SELECT TO authenticated
    USING (private.has_store_role(store_id, ARRAY['owner'::member_role]) AND deleted_at IS NOT NULL);

CREATE POLICY "Orders: owner/manager can insert"
    ON public.orders
    FOR INSERT TO authenticated
    WITH CHECK (private.has_store_role(store_id, ARRAY['owner'::member_role, 'manager'::member_role]));

CREATE POLICY "Orders: owner/manager can update"
    ON public.orders
    FOR UPDATE TO authenticated
    USING (private.has_store_role(store_id, ARRAY['owner'::member_role, 'manager'::member_role]))
    WITH CHECK (private.has_store_role(store_id, ARRAY['owner'::member_role, 'manager'::member_role]));

-- ============================================================
-- inventory_logs policies (append-only, no client write)
-- ============================================================

CREATE POLICY "InventoryLogs: active members can view"
    ON public.inventory_logs
    FOR SELECT TO authenticated
    USING (private.is_store_member(store_id));

-- No INSERT/UPDATE/DELETE policies - only protected RPC can write

-- ============================================================
-- expenses policies
-- ============================================================

CREATE POLICY "Expenses: owner/manager can view active"
    ON public.expenses
    FOR SELECT TO authenticated
    USING (private.has_store_role(store_id, ARRAY['owner'::member_role, 'manager'::member_role]) AND deleted_at IS NULL);

CREATE POLICY "Expenses: owners can view deleted"
    ON public.expenses
    FOR SELECT TO authenticated
    USING (private.has_store_role(store_id, ARRAY['owner'::member_role]) AND deleted_at IS NOT NULL);

CREATE POLICY "Expenses: owner/manager can insert"
    ON public.expenses
    FOR INSERT TO authenticated
    WITH CHECK (private.has_store_role(store_id, ARRAY['owner'::member_role, 'manager'::member_role]));

CREATE POLICY "Expenses: owner/manager can update"
    ON public.expenses
    FOR UPDATE TO authenticated
    USING (private.has_store_role(store_id, ARRAY['owner'::member_role, 'manager'::member_role]))
    WITH CHECK (private.has_store_role(store_id, ARRAY['owner'::member_role, 'manager'::member_role]));

-- ============================================================
-- classification_keywords policies
-- ============================================================

CREATE POLICY "Keywords: active members can view active"
    ON public.classification_keywords
    FOR SELECT TO authenticated
    USING (private.is_store_member(store_id) AND deleted_at IS NULL);

CREATE POLICY "Keywords: owners can view deleted"
    ON public.classification_keywords
    FOR SELECT TO authenticated
    USING (private.has_store_role(store_id, ARRAY['owner'::member_role]) AND deleted_at IS NOT NULL);

CREATE POLICY "Keywords: owner/manager can insert"
    ON public.classification_keywords
    FOR INSERT TO authenticated
    WITH CHECK (private.has_store_role(store_id, ARRAY['owner'::member_role, 'manager'::member_role]));

CREATE POLICY "Keywords: owner/manager can update"
    ON public.classification_keywords
    FOR UPDATE TO authenticated
    USING (private.has_store_role(store_id, ARRAY['owner'::member_role, 'manager'::member_role]))
    WITH CHECK (private.has_store_role(store_id, ARRAY['owner'::member_role, 'manager'::member_role]));

-- ============================================================
-- store_settings policies
-- ============================================================

CREATE POLICY "StoreSettings: owners can view"
    ON public.store_settings
    FOR SELECT TO authenticated
    USING (private.has_store_role(store_id, ARRAY['owner'::member_role]));

CREATE POLICY "StoreSettings: owners can insert"
    ON public.store_settings
    FOR INSERT TO authenticated
    WITH CHECK (private.has_store_role(store_id, ARRAY['owner'::member_role]));

CREATE POLICY "StoreSettings: owners can update"
    ON public.store_settings
    FOR UPDATE TO authenticated
    USING (private.has_store_role(store_id, ARRAY['owner'::member_role]))
    WITH CHECK (private.has_store_role(store_id, ARRAY['owner'::member_role]));

-- ============================================================
-- audit_logs policies (owner view only)
-- ============================================================

CREATE POLICY "AuditLogs: owners can view"
    ON public.audit_logs
    FOR SELECT TO authenticated
    USING (private.has_store_role(store_id, ARRAY['owner'::member_role]));

-- No INSERT/UPDATE/DELETE policies - only audit triggers can write

-- ============================================================
-- migration_runs policies
-- ============================================================

CREATE POLICY "MigrationRuns: owners can view"
    ON public.migration_runs
    FOR SELECT TO authenticated
    USING (private.has_store_role(store_id, ARRAY['owner'::member_role]));

CREATE POLICY "MigrationRuns: owners can insert"
    ON public.migration_runs
    FOR INSERT TO authenticated
    WITH CHECK (private.has_store_role(store_id, ARRAY['owner'::member_role]));

CREATE POLICY "MigrationRuns: owners can update"
    ON public.migration_runs
    FOR UPDATE TO authenticated
    USING (private.has_store_role(store_id, ARRAY['owner'::member_role]))
    WITH CHECK (private.has_store_role(store_id, ARRAY['owner'::member_role]));