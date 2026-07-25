# Orders Remote DataSource Contract

> 문서 버전: 1.0 (3-8A.2)
> 작성일: 2026-07-25
> 상태: **DESIGNED — NOT IMPLEMENTED**

---

## A. 목적

Orders remote 구현 전에 고정할 data source contract.

1. `orders.js`가 Supabase를 직접 호출하지 않도록 하기 위한 **boundary**
2. `js/db.js`를 gateway로 유지 (기존 ProductsDataSource 패턴 준용)
3. **local mode regression 방지** — 기존 local order flow는 영원히 유지
4. feature flag 기반 점진적 전환 (기본값 local)
5. field mapping, status transition, inventory side effect, analytics/customers compatibility를 계약으로 고정

---

## B. Feature Flags 후보

문서화만 한다. 실제 config 수정 금지.

| Flag | 기본값 | 설명 |
|---|---|---|
| `ORDERS_SUPABASE_ENABLED` | `false` | Orders remote 전체 on/off (products와 분리) |
| `ORDERS_SUPABASE_REMOTE_ENABLED` | `false` | 원격 supabase.co URL 허용 (local 개발 시에는 `ORDERS_SUPABASE_ENABLED`만으로 충분) |

### 활성화 조건 (모두 충족 필요)

1. `SUPABASE_ENABLED === true` (전역)
2. `ORDERS_SUPABASE_ENABLED === true`
3. `LESOULSupabase.isInitialized() === true`
4. `activeMembership.storeId` 존재 (매장 소속 확인)
5. client key가 `service_role`이 아님 (JWT role 검증)
6. local URL 또는 `ORDERS_SUPABASE_REMOTE_ENABLED === true`

### 정책

- 기본값 `false` → **조용히 LocalOrdersDataSource 유지**
- `ORDERS_SUPABASE_ENABLED === true`이되 다른 조건 실패 → **명확한 error throw** (조용히 fallback 금지)
- silent fallback 금지. guest 모드 (activeMembership null)는 local 유지
- `service_role` 금지, publishable key만 사용

---

## C. DataSource Interface 후보

기존 `ProductsDataSource` 패턴 (`listProducts/setProducts/createProduct/updateProduct/deleteProduct`)을 준용.

### LocalOrdersDataSource (기존)

| 메서드 | 설명 | 구현 상태 |
|---|---|---|
| `listOrders()` | 전체 주문 반환 | ✅ 구현됨 |
| `setOrders(orders)` | 전체 주문 치환 | ✅ 구현됨 |
| `createOrder(order)` | 주문 생성 | ✅ 구현됨 |
| `updateOrder(id, updates)` | 주문 수정 (유연한 status 변경) | ✅ 구현됨 |
| `deleteOrder(id)` | 주문 hard delete | ✅ 구현됨 |
| `findDuplicateOrder(criteria)` | 중복 주문 탐지 | ✅ 구현됨 |

### SupabaseOrdersDataSource (원격, 후보)

| 메서드 | Local Equivalent | Remote Source | Input | Output | Sync/Async | Side Effects | 구현 상태 | 위험도 |
|---|---|---|---|---|---|---|---|---|
| `listOrders(filters)` | `DB.getOrders()` | `orders` table SELECT + RLS | optional filters (status, date range, customer_id) | normalized order array | **async** | 없음 (읽기 전용) | ❌ 미구현 | 낮음 |
| `getOrderById(orderId)` | `DB.getOrders().find(...)` | `orders` table SELECT by id | order uuid or legacy_id | normalized order or null | **async** | 없음 | ❌ 미구현 | 낮음 |
| `createOrder(payload)` | `DB.addOrder()` | `public.create_order` RPC | customer_id (uuid), product_id (uuid), quantity, selling_price, order_date, color, size, notes | created normalized order + inventory_logs | **async** | reserved_stock 증가, inventory_logs RESERVE 생성 | ❌ 미구현 | 중간 |
| `updatePendingOrder(orderId, payload)` | `DB.updateOrder(id, {...})` (PENDING only) | `public.update_pending_order` RPC | order uuid, + optional update fields | updated normalized order + inventory_logs | **async** | 재고 조정 (release old + reserve new) | ❌ 미구현 | 높음 |
| `shipOrder(orderId, payload)` | `Orders.submitShip()` | `public.ship_order` RPC | order uuid, ship_date, shipping_company, tracking_number | shipped normalized order + inventory_logs + profit 계산 | **async** | current_stock 차감, reserved_stock 차감, inventory_logs SHIP 생성, customer aggregate recalc | ❌ 미구현 | 높음 |
| `cancelOrder(orderId)` | `Orders.cancel()` | `public.cancel_order` RPC | order uuid | cancelled normalized order + inventory_logs | **async** | reserved_stock 복구, inventory_logs RELEASE 생성 | ❌ 미구현 | 중간 |
| `completeOrder(orderId)` | `Orders.complete()` | `public.complete_order` RPC | order uuid | completed normalized order | **async** | customer aggregate recalc | ❌ 미구현 | 낮음 |
| `deleteOrder(id)` | `DB.deleteOrder()` (hard delete) | **금지** (RPC 없음, RLS에서 DELETE 차단) | N/A | N/A | N/A | N/A | ❌ remote에서 금지 | 높음 |
| `findDuplicateOrder(criteria)` | `DB.findDuplicateOrder()` | `orders` table SELECT 중복 탐지 | order_number, customer_id, product_id, color, size | duplicate order or null | **async** | 없음 | ❌ 미구현 | 낮음 |

### 참고: 기존 ProductsDataSource 패턴

```
getOrdersDataSource() → _resolveRuntimeOrdersDataSource()
  ├── null → _createLocalOrdersDataSource()  (기본값)
  └── instance → _createControlledSupabaseOrdersDataSource(client, context)
        ├── _validateWriteContext(methodName)  (client + context + storeId + URL 검증)
        ├── _wrapWriteError(methodName, err)   (에러 래핑, code/details 보존)
        ├── listOrders()                       (SELECT with store_id + deleted_at IS NULL)
        ├── createOrder(payload)               (RPC create_order)
        ├── updatePendingOrder(id, updates)    (RPC update_pending_order)
        ├── shipOrder(id, payload)             (RPC ship_order)
        ├── cancelOrder(id)                    (RPC cancel_order)
        └── completeOrder(id)                  (RPC complete_order)
```

---

## D. Local → Remote Field Mapping

### id 매핑 (가장 중요)

| Local Field | Remote Field | 설명 |
|---|---|---|
| `id` (numeric, `getNextId('orders')`) | `legacy_id` (bigint) | 기존 numeric id 보존 |
| 신규 생성 시 local id 없음 | `id` (uuid, `gen_random_uuid()`) | 원격 생성 시 자동 uuid |
| 매핑 결과 | `remote_id` (uuid, adapter에서 별도 필드) | adapter 내부에서 uuid 보존 |

### 주문 필드 매핑

| Local Field | Remote Field | 설명 |
|---|---|---|
| `id` (numeric) | `legacy_id` (bigint) | 기본키 매핑 |
| `order_number` | `order_number` (text) | ORD-xxxx 형식, 동일 |
| `customer_id` (numeric) | `customer_id` (uuid) + `legacy_customer_id` (bigint) | **2중 매핑 필요** |
| `product_id` (numeric) | `product_id` (uuid) + `legacy_product_id` (bigint) | **2중 매핑 필요** |
| `customer_name` | `customer_name_snapshot` (text) | local에는 없음, adapter에서 조회 또는 저장 |
| `product_name` / `product.original_title` | `product_title_snapshot` (text) | local에는 없음 |
| `brand` | `brand_snapshot` (text) | local product.brand에서 조회 |
| `category` | `category_snapshot` (text) | local product.category에서 조회 |
| `color` | `color_snapshot` (text) | local order.color와 동일 |
| `size` | `size_snapshot` (text) | local order.size와 동일 |
| `quantity` | `quantity` (integer) | 동일 |
| `selling_price` | `selling_price` (numeric) | 동일 |
| `actual_profit` | `actual_profit` (numeric) | 동일 |
| `actual_profit_margin` | `actual_profit_margin` (numeric) | 동일 |
| `actual_cost_ratio` | `actual_cost_ratio` (numeric) | 동일 |
| `actual_cost` (product.actual_converted_cost) | `actual_converted_cost_at_sale` (numeric) | **이름 다름** |
| `china_cost` (product.china_base_price) | `china_cost_at_sale` (numeric) | **이름 다름** |
| `status` | `status` (order_status enum) | 값 동일: PENDING/SHIPPED/COMPLETED/CANCELLED |
| `order_date` | `order_date` (date) | 동일 |
| `ship_date` | `ship_date` (date) | 동일 |
| `shipping_company` | `shipping_company` (text) | 동일 |
| `tracking_number` | `tracking_number` (text) | 동일 |
| `notes` | `notes` (text) | 동일 |
| `created_at` | `created_at` (timestamptz) | 동일 |
| `updated_at` | `updated_at` (timestamptz) | 동일 |
| `deleted` (local hard delete) | `deleted_at` (timestamptz, soft delete) | **삭제 방식 다름** |
| — | `store_id` (uuid NOT NULL) | remote에만 존재, context.storeId로 강제 |
| — | `created_by` (uuid) | remote에만 존재, RPC에서 auth.uid()로 자동 설정 |
| — | `updated_by` (uuid) | remote에만 존재, trigger에서 자동 설정 |
| — | `version` (integer) | remote에만 존재, trigger에서 자동 증가 |

---

## E. Remote → Local Normalized Order Shape

`orders.js`가 당장 기대하는 shape (adapter에서 변환 후 반환):

```javascript
{
    id: Number(order.legacy_id ?? null),   // local compatibility (nullable for new)
    legacy_id: Number(order.legacy_id ?? null),
    remote_id: order.id,                   // 원본 uuid (추적용)
    order_number: order.order_number,
    customer_id: Number(order.legacy_customer_id ?? null),
    customer_uuid: order.customer_id ?? null,
    customer_name: order.customer_name_snapshot ?? '',
    product_id: Number(order.legacy_product_id ?? null),
    product_uuid: order.product_id ?? null,
    product_name: order.product_title_snapshot ?? '',
    brand: order.brand_snapshot ?? '',
    category: order.category_snapshot ?? '',
    color: order.color_snapshot ?? '',
    size: order.size_snapshot ?? '',
    quantity: Number(order.quantity),
    selling_price: Number(order.selling_price),
    actual_profit: Number(order.actual_profit ?? 0),
    actual_profit_margin: Number(order.actual_profit_margin ?? 0),
    actual_cost_ratio: Number(order.actual_cost_ratio ?? 0),
    actual_cost: Number(order.actual_converted_cost_at_sale ?? 0),
    china_cost: Number(order.china_cost_at_sale ?? 0),
    status: order.status,                    // 'PENDING' | 'SHIPPED' | 'COMPLETED' | 'CANCELLED'
    order_date: order.order_date,
    ship_date: order.ship_date,
    shipping_company: order.shipping_company ?? '',
    tracking_number: order.tracking_number ?? '',
    notes: order.notes ?? '',
    created_at: order.created_at,
    updated_at: order.updated_at,
    deleted: order.deleted_at != null
}
```

### 정책

- **uuid는 `remote_id`로 노출**, `id`는 `legacy_id` 기반 (orders.js 수정 최소화)
- `id`가 null인 경우 (legacy_id 없는 신규 row)는 orders.js에서 null id 처리 필요 → 이 부분은 **후속 단계 검토**
- 장기적으로 uuid 기준으로 통일 권장 (orders.js에서 id → remote_id 참조로 전환)
- snapshot 필드가 비어 있으면 product/customer에서 조회 (fallback)

---

## F. Status Transition Mapping

| Local Action | Local Flow | Remote RPC | 입력 상태 | 출력 상태 | 비고 |
|---|---|---|---|---|---|
| 주문 생성 (submitAdd) | `DB.addOrder()` + `DB.updateProduct({reserved_stock})` | `public.create_order` | 없음 | `PENDING` | RPC가 재고 예약 + inventory_logs RESERVE 생성 |
| 주문 편집 (submitEdit PENDING) | `DB.updateOrder(id, {...})` | `public.update_pending_order` | `PENDING` (아니면 차단) | `PENDING` (업데이트됨) | RPC가 product swap 시 재고 조정 |
| 주문 출고 (submitShip) | `DB.updateProduct({current_stock, reserved_stock})` + `DB.updateOrder({status:'SHIPPED', ...})` + `DB.addInventoryLog({type:'OUT'})` | `public.ship_order` | `PENDING` (아니면 차단) | `SHIPPED` | RPC가 재고 차감 + profit 계산 + inventory_logs SHIP 생성 |
| 주문 취소 (cancel) | `DB.updateProduct({reserved_stock 복구})` + `DB.updateOrder({status:'CANCELLED'})` | `public.cancel_order` | `PENDING` (아니면 차단) | `CANCELLED` | RPC가 재고 복구 + inventory_logs RELEASE 생성 |
| 주문 완료 (complete) | `DB.updateOrder({status:'COMPLETED'})` + `Customers.recalculateAll()` | `public.complete_order` | `SHIPPED` (아니면 차단) | `COMPLETED` | RPC가 customer aggregate recalc |
| 주문 hard delete (delete/batchDelete) | `DB.deleteOrder(id)` | **금지** → `cancel_order`로 대체 | N/A | `CANCELLED` | remote hard delete 불가 |

### 상태 전이 다이어그램

```
PENDING ──create_order──► PENDING (초기 생성)
  │                         │
  │                         ├──update_pending_order──► PENDING (편집)
  │                         │
  │                     cancel_order
  │                         │
  │                         ▼
  │                     CANCELLED
  │
  │                     ship_order
  │                         │
  │                         ▼
  └────────────────► SHIPPED
                            │
                            ├──complete_order──► COMPLETED
```

---

## G. Inventory Side Effect Boundary

| 모드 | 재고 조정 주체 | 방식 |
|---|---|---|
| **Local** (기본) | `orders.js`가 직접 | `DB.updateProduct(productId, { reserved_stock: ... })`, `DB.updateProduct(productId, { current_stock: ... })` |
| **Remote** (원격) | **RPC가 atomic 처리** | `public.create_order`: `reserved_stock += quantity` + `inventory_logs RESERVE`<br>`public.ship_order`: `current_stock -= quantity`, `reserved_stock -= quantity` + `inventory_logs SHIP`<br>`public.cancel_order`: `reserved_stock -= quantity` + `inventory_logs RELEASE` |

### 정책

- **Remote mode**: `orders.js`가 stock/reserved_stock을 직접 조정하면 **안 됨**
- **Remote mode**: RPC가 inventory_logs와 stock/reserved_stock을 atomic transaction으로 처리
- **DataSource 성공 후**: UI에서 `DB.getProducts()` + `DB.getOrders()`를 reload하여 화면 refresh
- **실패 시**: UI에 명확한 error 표시, local fallback으로 재고 변경 **금지**
- 재고 차감/복구는 반드시 RPC transaction 안에서만 발생

---

## H. Analytics Compatibility

### 현재 의존성

```javascript
// analytics.js
_getShippedOrders() {
    return DB.getOrders().filter(o => o.status === 'SHIPPED' || o.status === 'COMPLETED');
}

// _getOrderCost: snapshot 우선, product fallback
_getOrderCost(order, products) {
    if (order.actual_converted_cost_at_sale !== undefined && order.actual_converted_cost_at_sale !== null) {
        return order.actual_converted_cost_at_sale;
    }
    const product = products.find(p => p.id === order.product_id);
    return product?.actual_converted_cost || 0;
}
```

### 정책

- `analytics.js`는 `DB.getOrders()`에 의존 → **remote mode에서 `DB.getOrders()`가 normalized remote orders를 반환해야 함**
- `_getShippedOrders()`의 shipped/completed 기준 유지
- 원가 계산은 snapshot (`actual_converted_cost_at_sale`) 우선, product fallback은 후순위 (local compatibility)
- analytics remote conversion은 **별도 단계 (3-8A.8)**에서 검증
- 단기: `DB.getOrders()` → DataSource.listOrders() → local adapter 또는 remote adapter

### 위험

- analytics가 `DB.getOrders()`를 직접 호출하므로, remote orders 구현 시 `DB.getOrders()` 내부에서 DataSource 라우팅 필요
- shipped/completed 주문만 집계하는데, remote에서도 동일 filter 적용 필요

---

## I. Customers Compatibility

### 현재 의존성

```javascript
// customers.js recalculateAll()
recalculateAll() {
    const orders = DB.getOrders().filter(o => o.status === 'SHIPPED' || o.status === 'COMPLETED');
    // ... 집계 계산 ...
}
```

### 정책

- **Remote mode에서 `Customers.recalculateAll()`이 client-side로 집계하면 안 될 수 있음**
  - RPC (`private.recalculate_customer_aggregates`)가 server-side에서 집계를 처리하므로 client 중복 계산 위험
- **단기**: remote order write 후 `Customers.recalculateAll()` 호출은 유지 (중복 계산되더라도 결과는 동일)
- **장기**: customer aggregate RPC/source of truth를 remote로 통일 → client recalculateAll은 remote data refresh 용도로만 사용
- remote mode에서 customers reload 필요: order write 성공 후 `DB.getCustomers()` refresh

---

## J. Error Handling Contract

| 시나리오 | User-facing Message | Retry 가능 | Local Fallback | 데이터 변경 |
|---|---|---|---|---|
| 활성 store 없음 | "매장이 선택되지 않았습니다" | 아니오 | 조용히 local 유지 | 아니오 |
| 멤버십 없음 | "매장 멤버십이 없습니다" | 아니오 | 조용히 local 유지 | 아니오 |
| staff 권한 거부 | "주문 생성 권한이 없습니다" | 아니오 | local 유지 (staff는 local에서도 제한) | 아니오 |
| 상품 삭제됨 | "상품을 찾을 수 없습니다" | 아니오 | 아니오 | 아니오 |
| 고객 삭제됨 | "고객을 찾을 수 없습니다" | 아니오 | 아니오 | 아니오 |
| 재고 부족 | "재고가 충분하지 않습니다" | 수량 수정 후 재시도 | 아니오 | 아니오 |
| 잘못된 상태 전이 | "이 상태에서는 해당 작업을 수행할 수 없습니다" | 상태 확인 후 재시도 | 아니오 | 아니오 |
| 네트워크 실패 (RPC 성공 후) | "작업이 완료되었으나 화면 새로고침에 실패했습니다" | 새로고침 버튼 | 아니오 | **서버측에는 이미 반영됨** |
| 중복 주문 의심 | "중복된 주문일 수 있습니다. 확인 후 다시 시도해주세요" | 주문번호 확인 후 재시도 | 아니오 | 아니오 |
| stale version/conflict | "데이터가 변경되었습니다. 새로고침 후 다시 시도해주세요" | 새로고침 후 재시도 | 아니오 | 아니오 |
| RPC 서버 에러 | "서버 오류가 발생했습니다" | 재시도 | 아니오 | **서버측 변경 가능** |

### 정책

- RPC 호출 성공 후 UI refresh 실패 시, **서버측 변경은 이미 반영됨** → 재시도가 아니라 refresh만 필요
- 네트워크 실패 시도: idempotent RPC가 아니므로 신중한 재시도 필요
- 모든 error는 `_wrapWriteError`로 래핑하여 `code`, `details` 보존
- user-facing message는 한국어로 통일 (기존 앱 정책)

---

## K. Implementation Phases

| 단계 | 설명 | 구현 내용 | Go/No-Go |
|---|---|---|---|
| **3-8A.2** | Contract Design | 이 문서 + contract tests | ✅ GO |
| **3-8A.3** | Read-only listOrders | `listOrders()` 원격 조회 prototype, RLS SELECT 기반 | ✅ NEXT |
| **3-8A.4** | Normalized Mapping Tests | field mapping, status transition, shape contract 단위 테스트 | ✅ NEXT |
| **3-8A.5** | createOrder RPC Adapter | `createOrder()` → `public.create_order` 연결 | NO-GO until 3-8A.3 + 3-8A.4 pass |
| **3-8A.6** | ship/cancel/complete RPC Adapters | `shipOrder`, `cancelOrder`, `completeOrder` RPC 연결 | NO-GO until 3-8A.5 pass |
| **3-8A.7** | Browser Owner Smoke | owner 계정으로 read + create + ship + cancel + complete smoke test | NO-GO until 3-8A.6 pass |
| **3-8A.8** | Analytics/Customers Compatibility | analytics + customers recalculateAll remote 연동 검증 | NO-GO until 3-8A.7 pass |
| **3-8A.9** | Staff/No-Membership Negative Smoke | staff 차단, no-membership 차단 smoke test | NO-GO |
| **3-8A.10** | Cleanup and Go/No-Go | 임시 코드 제거, 최종 검증, production go/no-go | NO-GO |

---

## L. Go/No-Go 판정

| 항목 | 판정 |
|---|---|
| 이번 단계 implementation | **NO-GO** |
| contract design | **GO** ✅ |
| read-only remote list (3-8A.3) | **NEXT** |
| createOrder runtime (3-8A.5) | **NO-GO** until 3-8A.3 + 3-8A.4 pass |
| production order remote 전환 | **NO-GO** until 3-8A.7 + 3-8A.8 pass |

### Go 기준 (3-8A.5 진입 조건)

1. [x] 3-8A.1 audit 완료 (50 contract tests pass)
2. [x] 3-8A.2 contract design 완료 (이 문서 + 17 contract tests pass)
3. [ ] 3-8A.3 read-only listOrders smoke pass
4. [ ] 3-8A.4 normalized mapping tests pass
5. [ ] 전체 787+ tests pass
6. [ ] preflight PASS

### Production Go 기준

1. [ ] 3-8A.7 browser smoke (owner) pass
2. [ ] 3-8A.8 analytics/customers regression pass
3. [ ] 3-8A.9 negative smoke pass
4. [ ] 3-8A.10 cleanup 완료
5. [ ] 1000+ tests, 0 fail
6. [ ] 모든 regression tests pass
7. [ ] 최종 preflight PASS

---

## M. 이번 단계 검증 결과

| 항목 | 결과 |
|---|---|
| design-only 작업 | ✅ 확인 |
| JS 변경 | ❌ 없음 |
| CSS 변경 | ❌ 없음 |
| HTML 변경 | ❌ 없음 |
| Migration 변경 | ❌ 없음 |
| DB push | ❌ 없음 |
| 실제 order/customer/product/inventory action | ❌ 없음 |
| Service role 사용 | ❌ 없음 |
| token/key/password 출력 | ❌ 없음 |
| 구현된 feature flag | ❌ 문서화만 |
| 구현된 DataSource | ❌ 문서화만 |
| 기존 787 tests | PENDING |
| preflight | PENDING |
