-- profiles table
CREATE TABLE public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    display_name text,
    preferred_language text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- stores table
CREATE TABLE public.stores (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    subtitle text,
    created_by uuid references auth.users(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz,
    version integer not null default 1
);

-- store_members table
CREATE TABLE public.store_members (
    id uuid primary key default gen_random_uuid(),
    store_id uuid not null references stores(id),
    user_id uuid not null references auth.users(id),
    role member_role not null,
    is_active boolean not null default true,
    invited_by uuid references auth.users(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- products table
CREATE TABLE public.products (
    id uuid primary key default gen_random_uuid(),
    legacy_id bigint,
    store_id uuid not null references stores(id),
    product_code text not null,
    original_title text not null,
    normalized_title text,
    title_language text,
    brand text not null,
    category text,
    color text,
    size text,
    material text,
    season text,
    fit text,
    style text,
    classification_status text,
    korea_cost numeric,
    actual_converted_cost numeric,
    china_base_price numeric,
    current_stock integer not null default 0,
    reserved_stock integer not null default 0,
    stock_year integer,
    stock_month integer,
    image text,
    notes text,
    created_by uuid,
    updated_by uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz,
    version integer not null default 1
);

-- customers table
CREATE TABLE public.customers (
    id uuid primary key default gen_random_uuid(),
    legacy_id bigint,
    store_id uuid not null references stores(id),
    name text not null,
    wechat_nickname text,
    phone text,
    email text,
    address text,
    notes text,
    level text,
    total_amount numeric not null default 0,
    total_profit numeric not null default 0,
    order_count integer not null default 0,
    total_quantity integer not null default 0,
    last_order_date date,
    created_by uuid,
    updated_by uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz,
    version integer not null default 1
);

-- orders table
CREATE TABLE public.orders (
    id uuid primary key default gen_random_uuid(),
    legacy_id bigint,
    store_id uuid not null references stores(id),
    order_number text not null,
    customer_id uuid references customers(id),
    product_id uuid references products(id),
    legacy_customer_id bigint,
    legacy_product_id bigint,
    customer_name_snapshot text,
    product_title_snapshot text,
    brand_snapshot text,
    category_snapshot text,
    color_snapshot text,
    size_snapshot text,
    quantity integer not null,
    selling_price numeric not null,
    actual_converted_cost_at_sale numeric,
    china_cost_at_sale numeric,
    actual_profit numeric,
    actual_profit_margin numeric,
    actual_cost_ratio numeric,
    status order_status not null default 'PENDING',
    order_date date,
    ship_date date,
    notes text,
    created_by uuid,
    updated_by uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz,
    version integer not null default 1
);

-- inventory_logs table (append-only)
CREATE TABLE public.inventory_logs (
    id uuid primary key default gen_random_uuid(),
    legacy_id bigint,
    store_id uuid not null references stores(id),
    product_id uuid references products(id),
    order_id uuid references orders(id),
    change_type inventory_change_type not null,
    quantity_change integer not null,
    stock_before integer,
    stock_after integer,
    reserved_before integer,
    reserved_after integer,
    notes text,
    created_by uuid,
    created_at timestamptz not null default now()
);

-- expenses table
CREATE TABLE public.expenses (
    id uuid primary key default gen_random_uuid(),
    legacy_id numeric,
    legacy_id_text text,
    store_id uuid not null references stores(id),
    expense_date date not null,
    category text not null,
    amount numeric not null,
    description text,
    source_format text,
    created_by uuid,
    updated_by uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz,
    version integer not null default 1
);

-- classification_keywords table
CREATE TABLE public.classification_keywords (
    id uuid primary key default gen_random_uuid(),
    legacy_id numeric,
    legacy_id_text text,
    store_id uuid not null references stores(id),
    classification_type text not null,
    standard_value text not null,
    ko text[] not null default '{}',
    zh text[] not null default '{}',
    en text[] not null default '{}',
    ja text[] not null default '{}',
    other_aliases text[] not null default '{}',
    priority integer not null default 100,
    is_active boolean not null default true,
    created_by uuid,
    updated_by uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz,
    version integer not null default 1
);

-- store_settings table
CREATE TABLE public.store_settings (
    id uuid primary key default gen_random_uuid(),
    store_id uuid not null references stores(id),
    store_name text,
    store_subtitle jsonb,
    exchange_divisor numeric not null default 165,
    price_multiplier numeric not null default 3,
    fixed_addition numeric not null default 40,
    base_discount_rate numeric not null default 20,
    default_language text not null default 'ko',
    created_by uuid,
    updated_by uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    version integer not null default 1
);

-- audit_logs table (append-only)
CREATE TABLE public.audit_logs (
    id bigint generated always as identity primary key,
    store_id uuid,
    table_name text not null,
    record_id uuid,
    action audit_action not null,
    old_data jsonb,
    new_data jsonb,
    changed_by uuid,
    changed_at timestamptz not null default now(),
    request_id text,
    metadata jsonb
);

-- migration_runs table
CREATE TABLE public.migration_runs (
    id uuid primary key default gen_random_uuid(),
    store_id uuid not null references stores(id),
    initiated_by uuid,
    status migration_status not null default 'PENDING',
    source_type text,
    source_fingerprint text,
    started_at timestamptz,
    completed_at timestamptz,
    product_count integer not null default 0,
    customer_count integer not null default 0,
    order_count integer not null default 0,
    inventory_log_count integer not null default 0,
    expense_count integer not null default 0,
    keyword_count integer not null default 0,
    inserted_count integer not null default 0,
    updated_count integer not null default 0,
    skipped_count integer not null default 0,
    failed_count integer not null default 0,
    validation_summary jsonb,
    error_summary jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    version integer not null default 1
);