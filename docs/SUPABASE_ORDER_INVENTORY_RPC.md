# Protected Order and Inventory Transaction RPC

## 1. Order State Transition Diagram

```
  PENDING ──ship_order()──▶ SHIPPED ──complete_order()──▶ COMPLETED
     │
     └──cancel_order()──▶ CANCELLED
```

**Allowed transitions:**
- PENDING → SHIPPED (ship_order)
- PENDING → CANCELLED (cancel_order)
- SHIPPED → COMPLETED (complete_order)

**Forbidden transitions (SQLSTATE 22023):**
- SHIPPED → PENDING
- COMPLETED → PENDING
- COMPLETED → SHIPPED
- CANCELLED → PENDING
- CANCELLED → SHIPPED
- SHIPPED → CANCELLED
- Same-state re-application

All invalid state transitions return SQLSTATE 22023 with a descriptive message.

## 2. RPC Signatures

### create_order

```sql
public.create_order(
    p_store_id uuid,
    p_customer_id uuid,
    p_product_id uuid,
    p_quantity integer,
    p_selling_price numeric,
    p_order_date date DEFAULT current_date,
    p_color text DEFAULT NULL,
    p_size text DEFAULT NULL,
    p_notes text DEFAULT NULL
) RETURNS public.orders
```

- Status is always **PENDING** (client cannot set it)
- Snapshots are populated automatically from product/customer rows
- Order number auto-generated: `ORD-0001`, `ORD-0002`, ...
- Reservation uses `SELECT ... FOR UPDATE` on product row

### update_pending_order

```sql
public.update_pending_order(
    p_order_id uuid,
    p_customer_id uuid,
    p_product_id uuid,
    p_quantity integer,
    p_selling_price numeric,
    p_order_date date,
    p_color text DEFAULT NULL,
    p_size text DEFAULT NULL,
    p_notes text DEFAULT NULL
) RETURNS public.orders
```

- Only **PENDING** orders can be modified
- **Input validation:** `p_customer_id`, `p_product_id`, `p_order_date` cannot be NULL
- **Active product validation:** Only non-deleted products (`deleted_at IS NULL`) can be used
- **Legacy order handling:** Orders with NULL `product_id` are blocked with explicit error
- **Data inconsistency check:** If existing order product not found, explicit error raised
- Product changes: release old product reservation, reserve new product
  - Products locked in UUID-sorted order to prevent deadlock
- Quantity changes on same product: adjust reservation by delta
  - Increase: RESERVE additional quantity
  - Decrease: RELEASE excess quantity
- Profit fields remain 0 in PENDING state

### ship_order

```sql
public.ship_order(
    p_order_id uuid,
    p_ship_date date DEFAULT current_date,
    p_shipping_company text DEFAULT NULL,
    p_tracking_number text DEFAULT NULL
) RETURNS public.orders
```

- PENDING → SHIPPED transition
- Deducts both `current_stock` and `reserved_stock`
- Calculates revenue, profit, margin, cost ratio from cost snapshot with **integer rounding** (matches web app)
  - `profit = round((selling_price - actual_converted_cost) * quantity)`
  - `profit_margin = round((profit_raw / revenue) * 100)` — uses raw profit before rounding
  - `cost_ratio = round(actual_converted_cost / selling_price * 100)` — unit ratio
- Creates SHIP inventory log
- Recalculates customer aggregates
- Validates stock before deducting (never goes negative)

### cancel_order

```sql
public.cancel_order(
    p_order_id uuid,
    p_notes text DEFAULT NULL
) RETURNS public.orders
```

- PENDING → CANCELLED transition
- Releases reserved stock (current_stock unchanged)
- Creates RELEASE inventory log
- Shipped/completed orders cannot be cancelled

### complete_order

```sql
public.complete_order(
    p_order_id uuid
) RETURNS public.orders
```

- SHIPPED → COMPLETED transition
- No stock changes
- No inventory log
- Recalculates customer aggregates

## 3. Transaction and Row Lock Order

### create_order
```
1. auth.uid() + role check
2. SELECT stores FOR SHARE (implicit via deleted_at check)
3. SELECT customers (validation)
4. SELECT products FOR UPDATE (stock check + reservation)
5. UPDATE products (reserved_stock += quantity)
6. INSERT orders (PENDING)
7. INSERT inventory_logs (RESERVE)
```

### update_pending_order (product change)
```
1. SELECT orders FOR UPDATE
2. Lock products in UUID-sorted order:
   - old product: SELECT FOR UPDATE
   - new product: SELECT FOR UPDATE (active check)
3. UPDATE old product (reserved_stock -= old_qty)
4. INSERT inventory_logs (RELEASE, old product)
5. UPDATE new product (reserved_stock += new_qty)
6. INSERT inventory_logs (RESERVE, new product)
7. UPDATE orders (snapshot refresh)
```

### ship_order
```
1. SELECT orders FOR UPDATE (status check)
2. SELECT products FOR UPDATE
3. UPDATE products (current_stock -= qty, reserved_stock -= qty)
4. UPDATE orders (status=SHIPPED, ship info, profit calculation)
5. INSERT inventory_logs (SHIP)
6. SELECT customers (validate store match, implicit)
7. UPDATE customers (recalculate aggregates)
```

### Advisory Locks
- Order number generation: `pg_advisory_xact_lock(hashtextextended(store_id::text, 1))`
  - Seed 1 for order-number namespace
- Onboarding uses seed 0 (different namespace)

## 4. Order Snapshot Policy

The following fields are **snapshots** — copied from source records at order creation/update time:

| Snapshot Field | Source | When Updated |
|---|---|---|
| `customer_name_snapshot` | customers.name | create_order, update_pending_order |
| `product_title_snapshot` | products.original_title | create_order, update_pending_order |
| `brand_snapshot` | products.brand | create_order, update_pending_order |
| `category_snapshot` | products.category | create_order, update_pending_order |
| `color_snapshot` | p_color OR products.color | create_order, update_pending_order |
| `size_snapshot` | p_size OR products.size | create_order, update_pending_order |
| `actual_converted_cost_at_sale` | products.actual_converted_cost | create_order, update_pending_order, ship_order |
| `china_cost_at_sale` | products.china_base_price | create_order, update_pending_order |

**Cost snapshot semantics:**
- `actual_converted_cost_at_sale`: The sale-time converted unit cost in CNY. Used for profit calculation.
- `china_cost_at_sale`: The sale-time China base/reference price in CNY. Informational only.

## 5. Stock and Reserved Stock Calculation

```
available_stock = current_stock - reserved_stock
```

| Operation | current_stock | reserved_stock |
|---|---|---|
| create_order | unchanged | + quantity |
| update_pending (qty increase) | unchanged | + delta |
| update_pending (qty decrease) | unchanged | - delta |
| update_pending (product change) | old: unchanged, new: unchanged | old: - old_qty, new: + new_qty |
| ship_order | - quantity | - quantity |
| cancel_order | unchanged | - quantity |
| complete_order | unchanged | unchanged |

**Rules:**
- Negative stock is never hidden with `GREATEST(..., 0)`
- If stock would go negative, the operation fails with SQLSTATE 22023
- This indicates a data consistency issue that must be investigated

## 6. Inventory Log Types

| Type | Triggered By | quantity_change | stock_before/after | reserved_before/after |
|---|---|---|---|---|
| INITIAL | Migration/initial setup | + total | 0 → total | 0 → 0 |
| RESERVE | create_order, update_pending (increase/change) | 0 | same, same | before → after |
| RELEASE | cancel_order, update_pending (decrease/change) | 0 | same, same | before → after |
| SHIP | ship_order | - quantity | before → after | before → after |
| RETURN | Return processing (not yet implemented) | + quantity | before → after | 0 → 0 |
| ADJUSTMENT | Manual adjustment | +/- delta | before → after | before → after |
| MIGRATION | Data migration | varies | varies | varies |

All logs include:
- `store_id`, `product_id`, `order_id`
- `change_type` (enum)
- `quantity_change` (signed integer)
- `stock_before`, `stock_after` (current_stock values)
- `reserved_before`, `reserved_after`
- `notes`
- `created_by` (auth.uid() via trigger)

## 7. Customer Aggregate Calculation

`private.recalculate_customer_aggregates(p_customer_id)` recalculates from scratch:

```sql
total_amount    = SUM(selling_price * quantity)
total_profit    = SUM(actual_profit)
order_count     = COUNT(*)
total_quantity  = SUM(quantity)
last_order_date = MAX(order_date)
```

**Only includes:**
- Non-deleted orders (`deleted_at IS NULL`)
- SHIPPED or COMPLETED status
- Orders in the same store as the customer

**When no orders exist:**
- `total_amount = 0`, `total_profit = 0`, `order_count = 0`, `total_quantity = 0`
- `last_order_date = NULL`

**Triggered by:**
- `ship_order` (first time order ships)
- `complete_order` (re-verify)

## 8. Direct DML Restrictions

### orders
- INSERT: REVOKEd from authenticated
- UPDATE: REVOKEd from authenticated
- SELECT: retained (via RLS policies)
- All mutations go through RPC

### products
- Table-level UPDATE: REVOKEd from authenticated
- Column-level UPDATE granted for safe fields:
  - `product_code, original_title, normalized_title, title_language`
  - `brand, category, color, size, material, season, fit, style`
  - `classification_status, korea_cost, actual_converted_cost, china_base_price`
  - `stock_year, stock_month, image, notes, deleted_at, legacy_id`
- Columns NOT directly updatable:
  - `id, store_id, current_stock, reserved_stock`
  - `created_by, created_at, updated_by, updated_at, version`
  - (These are maintained by triggers and RPC functions)

### customers
- Table-level UPDATE: REVOKEd from authenticated
- Column-level UPDATE granted for safe fields:
  - `name, wechat_nickname, phone, email, address, notes, level, deleted_at, legacy_id`
- Columns NOT directly updatable:
  - `id, store_id, total_amount, total_profit, order_count, total_quantity, last_order_date`
  - `created_by, created_at, updated_by, updated_at, version`

### inventory_logs
- INSERT/UPDATE/DELETE: never granted to authenticated
- Only populated by SECURITY DEFINER RPC functions

## 9. Role-based Access

| Operation | owner | manager | staff | anon |
|---|---|---|---|---|
| create_order | ✅ | ✅ | ❌ | ❌ |
| update_pending_order | ✅ | ✅ | ❌ | ❌ |
| ship_order | ✅ | ✅ | ❌ | ❌ |
| cancel_order | ✅ | ✅ | ❌ | ❌ |
| complete_order | ✅ | ✅ | ❌ | ❌ |
| View orders (own store) | ✅ | ✅ | ✅ (view) | ❌ |
| Direct orders INSERT | ❌ | ❌ | ❌ | ❌ |
| Direct orders UPDATE | ❌ | ❌ | ❌ | ❌ |
| Direct stock UPDATE | ❌ | ❌ | ❌ | ❌ |
| Direct aggregate UPDATE | ❌ | ❌ | ❌ | ❌ |
| Direct inventory_log INSERT | ❌ | ❌ | ❌ | ❌ |

## 10. Supabase JS RPC Usage Examples

```javascript
// Create a pending order
const { data: order, error } = await supabase.rpc('create_order', {
  p_store_id: 'store-uuid',
  p_customer_id: 'customer-uuid',
  p_product_id: 'product-uuid',
  p_quantity: 2,
  p_selling_price: 50000,
  p_order_date: '2026-07-11',
  p_color: 'Red',
  p_size: 'M'
})

// Update pending order
const { data: updated, error } = await supabase.rpc('update_pending_order', {
  p_order_id: 'order-uuid',
  p_customer_id: 'customer-uuid',
  p_product_id: 'product-uuid',
  p_quantity: 3,
  p_selling_price: 75000,
  p_order_date: '2026-07-11'
})

// Ship order
const { data: shipped, error } = await supabase.rpc('ship_order', {
  p_order_id: 'order-uuid',
  p_ship_date: '2026-07-12',
  p_shipping_company: 'KoreaPost',
  p_tracking_number: '1234567890'
})

// Cancel order
const { data: cancelled, error } = await supabase.rpc('cancel_order', {
  p_order_id: 'order-uuid',
  p_notes: 'Customer requested cancel'
})

// Complete order
const { data: completed, error } = await supabase.rpc('complete_order', {
  p_order_id: 'order-uuid'
})
```

## 11. Not Yet Implemented

- **Return processing** (RETURN inventory log type, return RPC, refund logic)
- **Bulk order operations** (batch ship, batch cancel)
- **Order search/filter views** for staff with limited columns
- **Order number custom prefix configuration**
- **Partial shipment** (splitting one order into multiple shipments)
- **Backorder / pre-order support** (negative reservation)
- **Frontend integration** (Supabase JS client hookups to actual UI)
