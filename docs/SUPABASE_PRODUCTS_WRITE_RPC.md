# Products Write RPC Foundation

## Overview

SECURITY DEFINER RPCs for product write operations in the Supabase cloud migration.

## Why RPCs Are Needed

The `public.products` table has table-level UPDATE revoked from the `authenticated` role
(see migration `20260711000900_order_inventory_rpc.sql`). This prevents direct UPDATE on most columns.

A column-level GRANT exists for soft delete operations (`deleted_at`), but full product updates
(including `updated_at`) are blocked without SECURITY DEFINER RPCs.

These RPCs solve the permission problem by executing as the `postgres` user (SECURITY DEFINER),
while enforcing application-level authorization checks internally.

## RPC List

### 1. `public.create_product`

Creates a new product.

**Parameters:**
- `p_store_id uuid` (required)
- `p_product_code text` (required)
- `p_original_title text` (required)
- `p_brand text` (required)
- `p_normalized_title text` (optional)
- `p_title_language text` (optional)
- `p_category text` (optional)
- `p_color text` (optional)
- `p_size text` (optional)
- `p_material text` (optional)
- `p_season text` (optional)
- `p_fit text` (optional)
- `p_style text` (optional)
- `p_classification_status text` (optional)
- `p_korea_cost numeric` (optional)
- `p_actual_converted_cost numeric` (optional)
- `p_china_base_price numeric` (optional)
- `p_current_stock integer` (default: 0)
- `p_reserved_stock integer` (default: 0)
- `p_stock_year integer` (optional)
- `p_stock_month integer` (optional)
- `p_image text` (optional)
- `p_notes text` (optional)
- `p_legacy_id bigint` (optional)

**Behavior:**
- `store_id` is forced to `p_store_id`
- `created_by` and `updated_by` set to `auth.uid()`
- `created_at` and `updated_at` set to `now()`
- `deleted_at` set to `NULL`
- `version` initialized to `1`

### 2. `public.update_product`

Updates mutable product fields.

**Parameters:**
- `p_store_id uuid` (required)
- `p_legacy_id bigint` (required)
- `p_product_code text` (optional)
- `p_original_title text` (optional)
- `p_normalized_title text` (optional)
- `p_title_language text` (optional)
- `p_brand text` (optional)
- `p_category text` (optional)
- `p_color text` (optional)
- `p_size text` (optional)
- `p_material text` (optional)
- `p_season text` (optional)
- `p_fit text` (optional)
- `p_style text` (optional)
- `p_classification_status text` (optional)
- `p_korea_cost numeric` (optional)
- `p_actual_converted_cost numeric` (optional)
- `p_china_base_price numeric` (optional)
- `p_current_stock integer` (optional)
- `p_reserved_stock integer` (optional)
- `p_stock_year integer` (optional)
- `p_stock_month integer` (optional)
- `p_image text` (optional)
- `p_notes text` (optional)
- `p_version integer` (optional)

**Immutable Fields (cannot be changed):**
- `id`
- `legacy_id`
- `store_id`
- `created_at`
- `created_by`

**Behavior:**
- Locates product by `p_store_id + p_legacy_id`
- Only updates non-NULL parameters (NULL preserves existing values)
- Sets `updated_by` to `auth.uid()`
- Sets `updated_at` to `now()`
- Increments `version`

### 3. `public.soft_delete_product`

Soft-deletes a product by setting `deleted_at`.

**Parameters:**
- `p_store_id uuid` (required)
- `p_legacy_id bigint` (required)

**Behavior:**
- Sets `deleted_at` to `now()`
- Sets `updated_by` to `auth.uid()`
- Sets `updated_at` to `now()`
- Increments `version`
- **Hard DELETE is never performed**

## Authorization Rules

### Allowed Roles
- `owner` - full CRUD access
- `manager` - full CRUD access

### Blocked Roles
- `staff` - read-only, no write access
- `non-member` - no access to store resources

### Additional Checks
- Authentication required (`auth.uid()` not NULL)
- Store must exist and not be deleted (`deleted_at IS NULL`)
- Cross-store access is blocked
- Only active products (`deleted_at IS NULL`) can be updated

## Security Properties

- **SECURITY DEFINER**: Executes as `postgres`, bypassing RLS
- **SET search_path = ''**: Prevents schema injection
- **No dynamic SQL**: All queries are static
- **Schema-qualified relations**: `public.products`, `public.stores`
- **Explicit column lists**: No `SELECT *` or `RETURNING *`
- **Public revoke**: `REVOKE ALL FROM PUBLIC`
- **Authenticated grant**: `GRANT EXECUTE TO authenticated`

## Testing

Test file: `supabase/tests/products_write_rpc.test.sql`

**Test Coverage:**
1. Owner can create product
2. Manager can create product
3. Staff cannot create product
4. Non-member cannot create product
5. Owner can update product
6. Manager can update product
7. Staff cannot update product
8. Non-member cannot update product
9. Update cannot change `id`
10. Update cannot change `legacy_id`
11. Update cannot change `store_id`
12. Update cannot change `created_by`
13. Update cannot change `created_at`
14. Update sets `updated_by`
15. Update sets `updated_at`
16. Owner can soft delete product
17. Manager can soft delete product
18. Staff cannot soft delete product
19. Non-member cannot soft delete product
20. Soft delete sets `deleted_at`
21. Soft delete does not hard delete row
22. Cross-store update blocked
23. Cross-store soft delete blocked
24. Deleted store blocked
25. Public/anon cannot execute RPC
26. Authenticated non-member cannot create product
27. Direct table UPDATE on `updated_at` blocked

## Migration File

```
supabase/migrations/20260711001100_products_write_rpcs.sql
```

## Runtime Integration Status

**This is a foundation-only change.**

- JS `SupabaseProductsDataSource` is NOT connected to these RPCs yet
- Runtime default is still `LocalProductsDataSource`
- No UI changes
- No JS code changes
- This is preparation for future migration phase where JS DataSource will be updated