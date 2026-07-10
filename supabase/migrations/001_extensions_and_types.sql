-- Enable pgcrypto for UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Member role enum
CREATE TYPE public.member_role AS ENUM (
    'owner',
    'manager',
    'staff'
);

-- Order status enum (uppercase to match existing JavaScript code)
CREATE TYPE public.order_status AS ENUM (
    'PENDING',
    'SHIPPED',
    'COMPLETED',
    'CANCELLED'
);

-- Inventory change type enum
CREATE TYPE public.inventory_change_type AS ENUM (
    'INITIAL',
    'RESERVE',
    'RELEASE',
    'SHIP',
    'RETURN',
    'ADJUSTMENT',
    'MIGRATION'
);

-- Migration status enum
CREATE TYPE public.migration_status AS ENUM (
    'PENDING',
    'RUNNING',
    'COMPLETED',
    'PARTIAL',
    'FAILED',
    'CANCELLED'
);

-- Audit action enum
CREATE TYPE public.audit_action AS ENUM (
    'INSERT',
    'UPDATE',
    'SOFT_DELETE',
    'RESTORE',
    'MIGRATE',
    'IMPORT'
);