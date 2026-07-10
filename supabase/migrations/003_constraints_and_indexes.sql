-- ============================================================
-- Constraints
-- ============================================================

-- store_members: one membership per user per store
ALTER TABLE public.store_members
    ADD CONSTRAINT unique_store_members_store_user UNIQUE (store_id, user_id);

-- products
ALTER TABLE public.products
    ADD CONSTRAINT chk_products_korea_cost_non_negative
        CHECK (korea_cost >= 0 OR korea_cost IS NULL),
    ADD CONSTRAINT chk_products_actual_converted_cost_non_negative
        CHECK (actual_converted_cost >= 0 OR actual_converted_cost IS NULL),
    ADD CONSTRAINT chk_products_china_base_price_non_negative
        CHECK (china_base_price >= 0 OR china_base_price IS NULL),
    ADD CONSTRAINT chk_products_current_stock_non_negative
        CHECK (current_stock >= 0),
    ADD CONSTRAINT chk_products_reserved_stock_non_negative
        CHECK (reserved_stock >= 0),
    ADD CONSTRAINT chk_products_stock_month_range
        CHECK (stock_month IS NULL OR (stock_month >= 1 AND stock_month <= 12)),
    ADD CONSTRAINT chk_products_stock_year_reasonable
        CHECK (stock_year IS NULL OR stock_year >= 1900);

-- customers
ALTER TABLE public.customers
    ADD CONSTRAINT chk_customers_total_amount_non_negative
        CHECK (total_amount >= 0),
    ADD CONSTRAINT chk_customers_total_profit_non_negative
        CHECK (total_profit >= 0),
    ADD CONSTRAINT chk_customers_order_count_non_negative
        CHECK (order_count >= 0),
    ADD CONSTRAINT chk_customers_total_quantity_non_negative
        CHECK (total_quantity >= 0);

-- orders
ALTER TABLE public.orders
    ADD CONSTRAINT chk_orders_quantity_positive
        CHECK (quantity > 0),
    ADD CONSTRAINT chk_orders_selling_price_non_negative
        CHECK (selling_price >= 0),
    ADD CONSTRAINT chk_orders_actual_converted_cost_at_sale_non_negative
        CHECK (actual_converted_cost_at_sale >= 0 OR actual_converted_cost_at_sale IS NULL),
    ADD CONSTRAINT chk_orders_china_cost_at_sale_non_negative
        CHECK (china_cost_at_sale >= 0 OR china_cost_at_sale IS NULL);

-- expenses
ALTER TABLE public.expenses
    ADD CONSTRAINT chk_expenses_amount_non_negative
        CHECK (amount >= 0);

-- classification_keywords
ALTER TABLE public.classification_keywords
    ADD CONSTRAINT chk_keywords_priority_non_negative
        CHECK (priority >= 0);

-- store_settings
ALTER TABLE public.store_settings
    ADD CONSTRAINT unique_store_settings_store UNIQUE (store_id),
    ADD CONSTRAINT chk_settings_exchange_divisor_positive
        CHECK (exchange_divisor > 0),
    ADD CONSTRAINT chk_settings_price_multiplier_non_negative
        CHECK (price_multiplier >= 0),
    ADD CONSTRAINT chk_settings_fixed_addition_non_negative
        CHECK (fixed_addition >= 0),
    ADD CONSTRAINT chk_settings_base_discount_rate_range
        CHECK (base_discount_rate >= 0 AND base_discount_rate <= 100),
    ADD CONSTRAINT chk_settings_default_language_valid
        CHECK (default_language IN ('ko', 'zh', 'en', 'ja'));

-- migration_runs
ALTER TABLE public.migration_runs
    ADD CONSTRAINT chk_migration_product_count_non_negative
        CHECK (product_count >= 0),
    ADD CONSTRAINT chk_migration_customer_count_non_negative
        CHECK (customer_count >= 0),
    ADD CONSTRAINT chk_migration_order_count_non_negative
        CHECK (order_count >= 0),
    ADD CONSTRAINT chk_migration_inventory_log_count_non_negative
        CHECK (inventory_log_count >= 0),
    ADD CONSTRAINT chk_migration_expense_count_non_negative
        CHECK (expense_count >= 0),
    ADD CONSTRAINT chk_migration_keyword_count_non_negative
        CHECK (keyword_count >= 0),
    ADD CONSTRAINT chk_migration_inserted_count_non_negative
        CHECK (inserted_count >= 0),
    ADD CONSTRAINT chk_migration_updated_count_non_negative
        CHECK (updated_count >= 0),
    ADD CONSTRAINT chk_migration_skipped_count_non_negative
        CHECK (skipped_count >= 0),
    ADD CONSTRAINT chk_migration_failed_count_non_negative
        CHECK (failed_count >= 0);

-- Composite unique on (store_id, id) for cross-store FK support
ALTER TABLE public.customers
    ADD CONSTRAINT unique_customers_store_id_id UNIQUE (store_id, id);

ALTER TABLE public.products
    ADD CONSTRAINT unique_products_store_id_id UNIQUE (store_id, id);

ALTER TABLE public.orders
    ADD CONSTRAINT unique_orders_store_id_id UNIQUE (store_id, id);

-- ============================================================
-- Partial Unique Indexes (soft-delete aware)
-- ============================================================

-- Active products: product_code must be unique per store
CREATE UNIQUE INDEX unique_products_active_store_code
    ON public.products (store_id, product_code)
    WHERE deleted_at IS NULL;

-- All products: legacy_id must not collide even with soft-deleted rows
CREATE UNIQUE INDEX unique_products_legacy_id
    ON public.products (store_id, legacy_id)
    WHERE legacy_id IS NOT NULL;

-- Active customers: no additional active-only unique beyond name (name is intentionally not unique)
CREATE UNIQUE INDEX unique_customers_legacy_id
    ON public.customers (store_id, legacy_id)
    WHERE legacy_id IS NOT NULL;

-- Active orders: order_number must be unique per store
CREATE UNIQUE INDEX unique_orders_active_store_number
    ON public.orders (store_id, order_number)
    WHERE deleted_at IS NULL;

-- All orders: legacy_id must not collide even with soft-deleted rows
CREATE UNIQUE INDEX unique_orders_legacy_id
    ON public.orders (store_id, legacy_id)
    WHERE legacy_id IS NOT NULL;

-- Active keywords: (store_id, classification_type, standard_value) must be unique
CREATE UNIQUE INDEX unique_keywords_active_store_type_standard
    ON public.classification_keywords (store_id, classification_type, standard_value)
    WHERE deleted_at IS NULL;

-- ============================================================
-- Indexes
-- ============================================================

-- store_members
CREATE INDEX idx_store_members_user_id ON public.store_members (user_id);
CREATE INDEX idx_store_members_store_id ON public.store_members (store_id);
CREATE INDEX idx_store_members_store_id_role ON public.store_members (store_id, role);
CREATE INDEX idx_store_members_is_active ON public.store_members (is_active);

-- products
CREATE INDEX idx_products_store_id ON public.products (store_id);
CREATE INDEX idx_products_store_id_brand ON public.products (store_id, brand);
CREATE INDEX idx_products_store_id_category ON public.products (store_id, category);
CREATE INDEX idx_products_store_id_stock_year_month ON public.products (store_id, stock_year, stock_month);
CREATE INDEX idx_products_store_id_deleted_at ON public.products (store_id, deleted_at);
CREATE INDEX idx_products_updated_at ON public.products (updated_at);

-- customers
CREATE INDEX idx_customers_store_id ON public.customers (store_id);
CREATE INDEX idx_customers_store_id_lower_name ON public.customers (store_id, lower(name));
CREATE INDEX idx_customers_phone ON public.customers (phone);
CREATE INDEX idx_customers_wechat_nickname ON public.customers (wechat_nickname);
CREATE INDEX idx_customers_deleted_at ON public.customers (deleted_at);
CREATE INDEX idx_customers_updated_at ON public.customers (updated_at);

-- orders
CREATE INDEX idx_orders_store_id ON public.orders (store_id);
CREATE INDEX idx_orders_customer_id ON public.orders (customer_id);
CREATE INDEX idx_orders_product_id ON public.orders (product_id);
CREATE INDEX idx_orders_status ON public.orders (status);
CREATE INDEX idx_orders_order_date ON public.orders (order_date);
CREATE INDEX idx_orders_ship_date ON public.orders (ship_date);
CREATE INDEX idx_orders_store_id_status_order_date ON public.orders (store_id, status, order_date);
CREATE INDEX idx_orders_deleted_at ON public.orders (deleted_at);
CREATE INDEX idx_orders_updated_at ON public.orders (updated_at);

-- inventory_logs
CREATE INDEX idx_inventory_logs_store_id ON public.inventory_logs (store_id);
CREATE INDEX idx_inventory_logs_product_id ON public.inventory_logs (product_id);
CREATE INDEX idx_inventory_logs_order_id ON public.inventory_logs (order_id);
CREATE INDEX idx_inventory_logs_created_at ON public.inventory_logs (created_at);
CREATE INDEX idx_inventory_logs_change_type ON public.inventory_logs (change_type);

-- expenses
CREATE INDEX idx_expenses_store_id ON public.expenses (store_id);
CREATE INDEX idx_expenses_expense_date ON public.expenses (expense_date);
CREATE INDEX idx_expenses_category ON public.expenses (category);
CREATE INDEX idx_expenses_deleted_at ON public.expenses (deleted_at);

-- classification_keywords
CREATE INDEX idx_keywords_store_id ON public.classification_keywords (store_id);
CREATE INDEX idx_keywords_classification_type ON public.classification_keywords (classification_type);
CREATE INDEX idx_keywords_priority ON public.classification_keywords (priority);
CREATE INDEX idx_keywords_is_active ON public.classification_keywords (is_active);
CREATE INDEX idx_keywords_deleted_at ON public.classification_keywords (deleted_at);

-- audit_logs
CREATE INDEX idx_audit_logs_store_id ON public.audit_logs (store_id);
CREATE INDEX idx_audit_logs_table_name ON public.audit_logs (table_name);
CREATE INDEX idx_audit_logs_record_id ON public.audit_logs (record_id);
CREATE INDEX idx_audit_logs_changed_at ON public.audit_logs (changed_at);
CREATE INDEX idx_audit_logs_changed_by ON public.audit_logs (changed_by);

-- migration_runs
CREATE INDEX idx_migration_runs_store_id ON public.migration_runs (store_id);
CREATE INDEX idx_migration_runs_status ON public.migration_runs (status);
CREATE INDEX idx_migration_runs_source_fingerprint ON public.migration_runs (source_fingerprint);
CREATE INDEX idx_migration_runs_created_at ON public.migration_runs (created_at);