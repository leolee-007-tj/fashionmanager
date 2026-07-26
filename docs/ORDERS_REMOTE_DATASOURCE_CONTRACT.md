# Orders Remote DataSource Contract

> 문서 버전: 1.5 (3-8A.7-Prep)
> 작성일: 2026-07-26
> 상태: **BROWSER SMOKE READINESS CHECK (3-8A.7-Prep)** — dev-console adapter smoke only; UI smoke blocked (orders.js uses sync local API)

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
| **3-8A.5** | createOrder RPC Adapter | `createOrder()` → `public.create_order` 연결 | ✅ GO (adapter implemented, not remote-smoked) |
| **3-8A.6** | ship/cancel/complete RPC Adapters | `updatePendingOrder`, `shipOrder`, `cancelOrder`, `completeOrder` RPC 연결 | ✅ GO (adapters implemented, not remote-smoked) |
| **3-8A.7-Prep** | Browser Smoke Readiness Check | runtime flag / client / auth / UI integration / smoke strategy 점검 | ✅ GO (dev-console adapter smoke 전략) |
| **3-8A.7** | Browser Owner Smoke | owner 계정으로 read + create + ship + cancel + complete smoke test | NO-GO until 3-8A.7-Prep pass |
| **3-8A.8** | Analytics/Customers Compatibility | analytics + customers recalculateAll remote 연동 검증 | NO-GO until 3-8A.7 pass |
| **3-8A.9** | Staff/No-Membership Negative Smoke | staff 차단, no-membership 차단 smoke test | NO-GO |
| **3-8A.10** | Cleanup and Go/No-Go | 임시 코드 제거, 최종 검증, production go/no-go | NO-GO |

---

## L. Go/No-Go 판정

| 항목 | 판정 |
|---|---|
| 이번 단계 implementation | **NO-GO** |
| contract design | **GO** ✅ |
| read-only remote list (3-8A.3) | **GO** ✅ |
| normalized mapping tests (3-8A.4) | **GO** ✅ |
| createOrder RPC adapter (3-8A.5) | **GO** ✅ |
| status RPC adapters (3-8A.6) | **GO** ✅ |
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

## M. 3-8A.3 검증 결과 (Read-only Prototype)

| 항목 | 결과 |
|---|---|
| read-only prototype | ✅ 구현 완료 |
| JS 변경 | ✅ js/db.js + js/config.example.js |
| write methods | ❌ 모두 throw (미구현) |
| CSS 변경 | ❌ 없음 |
| HTML 변경 | ❌ 없음 |
| Migration 변경 | ❌ 없음 |
| DB push | ❌ 없음 |
| 실제 order/customer/product/inventory action | ❌ 없음 |
| Service role 사용 | ❌ 없음 |
| token/key/password 출력 | ❌ 없음 |
| 기존 tests | 833 pass |
| preflight | PASS |

---

## N. 3-8A.4 Mapping Invariants & Test Results

### N.1 Mapping Invariants

#### id / remote_id / legacy_id 정책
- `row.id` (uuid) → `order.remote_id` (원본 보존)
- `row.legacy_id` (numeric) → `order.id` + `order.legacy_id`
- legacy_id가 **없으면** `order.id = null` (신규 remote row)
- **절대**: uuid가 `order.id`로 누설되지 않음

#### customer / product uuid + legacy 2중 매핑
- `row.customer_id` (uuid) → `order.customer_uuid`
- `row.legacy_customer_id` (numeric) → `order.customer_id`
- `row.product_id` (uuid) → `order.product_uuid`
- `row.legacy_product_id` (numeric) → `order.product_id`
- local compatibility를 위해 `customer_id`/`product_id`는 여전히 numeric

#### Snapshot fields
- `customer_name_snapshot` → `customer_name`
- `product_title_snapshot` → `product_name` + `product_title`
- `brand_snapshot` → `brand`
- `category_snapshot` → `category`
- `color_snapshot` → `color`
- `size_snapshot` → `size`

#### Financial fields
- `actual_converted_cost_at_sale` → `actual_cost` (+ 원본 필드명 보존)
- `china_cost_at_sale` → `china_cost` (+ 원본 필드명 보존)
- `actual_profit_margin` → `profit_margin` (+ 원본 보존)
- `actual_cost_ratio` → `cost_ratio` (+ 원본 보존)
- 모든 숫자 필드는 `Number()`로 numeric 강제

#### null / undefined 정책
- `safeValue(v, fallback)`: `v === undefined` → fallback, `null`은 null 그대로
- 이는 `mapSupabaseRowToLegacyProduct`와 동일한 정책
- null을 빈 문자열로 변환하지 않음

#### Soft delete
- `deleted_at is null` → `deleted: false`
- `deleted_at is not null` → `deleted: true`

#### Status
- `PENDING`, `SHIPPED`, `COMPLETED`, `CANCELLED` 그대로 보존
- mapper 내에서 status 변환 로직 없음

#### Mapper purity
- 순수 함수: 동일 입력 → 동일 출력
- localStorage/sessionStorage 접근 없음
- fetch/네트워크 호출 없음
- Supabase client 호출 없음
- 입력 row mutation 없음

### N.2 Test Results (3-8A.4)

| 항목 | 결과 |
|---|---|
| mapping contract tests | 33 tests, 0 fail |
| 전체 tests | 866 tests, 0 fail |
| mapper purity | ✅ PASS |
| id/remote_id/legacy_id 정책 | ✅ PASS |
| customer/product 2중 매핑 | ✅ PASS |
| snapshot fields mapping | ✅ PASS |
| financial fields mapping | ✅ PASS |
| null edge case handling | ✅ PASS |
| numeric string handling | ✅ PASS |
| input mutation 없음 | ✅ PASS |
| default DataSource = LocalOrdersDataSource | ✅ PASS |
| write methods disabled | ✅ PASS (여전히 throw) |
| no migration changes | ✅ PASS |
| no secrets/tokens | ✅ PASS |
| preflight | ✅ PASS |

### N.3 js/db.js Bug Fix (3-8A.4)

`LocalOrdersDataSource`의 모든 메서드를 `Promise.resolve()`로 감싸서 `ProductsDataSource` 패턴과 일치시켰다.
3-8A.3에서 누락된 부분으로, `DB.getOrdersAsync()`가 항상 Promise를 반환하도록 보정한다.

- 영향 범위: `_createLocalOrdersDataSource` 내부
- 외부 API 변경 없음
- 기존 sync `DB.getOrders()`, `DB.addOrder()` 등은 그대로 유지

---

## O. 3-8A.5 createOrder RPC Adapter

### O.1 목적

`SupabaseOrdersDataSource.createOrder(payload)` adapter를 구현한다.
remote mode에서 주문 생성은 `public.create_order` RPC만 사용한다.

- 코드 구현 + contract tests + docs 작업
- 실제 remote DB에 주문 생성 금지
- 브라우저에서 실제 `create_order` 실행 금지
- `ship/cancel/complete/update/delete` 구현 금지

### O.2 create_order RPC Signature 확인 결과

Migration `supabase/migrations/20260711000900_order_inventory_rpc.sql`에서 확인한 정확한 signature:

```sql
CREATE OR REPLACE FUNCTION public.create_order(
    p_store_id uuid,
    p_customer_id uuid,
    p_product_id uuid,
    p_quantity integer,
    p_selling_price numeric,
    p_order_date date DEFAULT current_date,
    p_color text DEFAULT NULL,
    p_size text DEFAULT NULL,
    p_notes text DEFAULT NULL
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
```

- 반환값: 단일 `public.orders` row (uuid, not uuid scalar)
- `shipping_company` / `tracking_number`는 create_order parameter에 **없음** (ship_order에서만 처리)
- RPC 내부에서 재고 예약(reserved_stock 증가) + inventory_logs RESERVE log 생성을 atomic하게 처리

### O.3 createOrder Adapter 구현 요약

`js/db.js` 내 `_createControlledSupabaseOrdersDataSource`에 `createOrder(payload)` 메서드 추가:

1. `_validateWriteContext('createOrder')` 호출 (client/context/storeId 재검증)
2. `_buildCreateOrderRpcPayload(payload)`로 payload 검증 + RPC parameter mapping
3. `client.rpc('create_order', rpcPayload)` 호출
4. `response.error` 있으면 throw
5. `response.data` 없으면 throw
6. `db.mapSupabaseRowToLegacyOrder(response.data)`로 결과 정규화
7. 정규화된 legacy-compatible order 반환

### O.4 Payload Validation Policy

| 필드 | 검증 규칙 | 실패 시 |
|---|---|---|
| `payload` 자체 | non-null object | throw `createOrder requires non-null payload object` |
| `customer_uuid` | UUID 형식 문자열 (payload.customer_uuid 우선, 없으면 customer_id가 UUID인지 확인) | throw `createOrder requires valid customer_uuid...` |
| `product_uuid` | UUID 형식 문자열 (payload.product_uuid 우선, 없으면 product_id가 UUID인지 확인) | throw `createOrder requires valid product_uuid...` |
| `quantity` | positive integer (>= 1) | throw `createOrder requires quantity to be a positive integer` |
| `selling_price` | number >= 0 (finite) | throw `createOrder requires selling_price to be a non-negative number` |
| `order_date` | string 또는 Date 객체 (필수) | throw `createOrder requires order_date` |
| `color` | optional string (null/undefined → null) | — |
| `size` | optional string (null/undefined → null) | — |
| `notes` | optional string (null/undefined → null) | — |
| `store_id` | **payload에서 무시**, context.storeId 사용 | — |

**legacy numeric id만 있는 경우**: remote uuid가 없으면 createOrder를 실행하지 않고 throw.

### O.5 RPC Payload Mapping

| RPC Parameter | Source | 설명 |
|---|---|---|
| `p_store_id` | `context.storeId` | untrusted payload.store_id 무시 |
| `p_customer_id` | `payload.customer_uuid` (또는 UUID 형식의 customer_id) | remote uuid만 허용 |
| `p_product_id` | `payload.product_uuid` (또는 UUID 형식의 product_id) | remote uuid만 허용 |
| `p_quantity` | `Number(payload.quantity)` | positive integer |
| `p_selling_price` | `Number(payload.selling_price)` | number >= 0 |
| `p_order_date` | `payload.order_date` (Date → YYYY-MM-DD 변환) | string |
| `p_color` | `payload.color` 또는 null | optional |
| `p_size` | `payload.size` 또는 null | optional |
| `p_notes` | `payload.notes` 또는 null | optional |

### O.6 Error Handling

다음 상황은 명확히 throw:

- missing active store / context validation 실패
- missing remote customer uuid (legacy numeric id만 있는 경우)
- missing remote product uuid (legacy numeric id만 있는 경우)
- invalid quantity (0, 음수, 소수, 누락)
- invalid selling_price (음수, NaN, 누락)
- missing order_date
- RPC error (`response.error` 존재)
- no returned order data (`response.data` null)

`_wrapCreateOrderError`는 validation 오류(`requires`, `createOrder`, `SupabaseOrdersDataSource.createOrder`, `Invalid`, `Missing`로 시작)는 그대로 throw하고, RPC 오류는 `SupabaseOrdersDataSource.createOrder RPC failed`로 wrap.

### O.7 Forbidden Direct Writes

createOrder adapter는 다음을 수행하지 **않는다**:

- `from('orders').insert(...)` 직접 호출 금지
- `from('products').update(...)` 직접 호출 금지 (재고 예약은 create_order RPC가 담당)
- `from('inventory_logs').insert(...)` 직접 호출 금지 (RESERVE log는 create_order RPC가 담당)
- `ship_order` / `cancel_order` / `complete_order` / `update_pending_order` RPC 호출 금지

### O.8 Remaining Disabled Methods

다음 write 메서드는 여전히 `throw new Error(_writeDisabledMsg)` 유지:

- `setOrders(orders)`
- `updatePendingOrder(orderId, payload)`
- `shipOrder(orderId, payload)`
- `cancelOrder(orderId)`
- `completeOrder(orderId)`
- `updateOrder(id, updates)`
- `deleteOrder(id)`
- `findDuplicateOrder(customerId, productId, color, size)`

### O.9 Local Mode Compatibility

- `ORDERS_SUPABASE_ENABLED` 기본값 `false` 유지
- 기본 DataSource = `LocalOrdersDataSource` 유지
- 기존 sync API (`DB.getOrders`, `DB.addOrder`, `DB.updateOrder`, `DB.deleteOrder`, `DB.findDuplicateOrder`) 변경 없음
- `DB.getOrdersAsync()` 등 async helper 기존 동작 유지
- runtime feature flag gate에서 `ORDERS_SUPABASE_ENABLED !== true`이면 조용히 LocalOrdersDataSource 유지

### O.10 Test Results (3-8A.5)

| 항목 | 결과 |
|---|---|
| createOrder adapter contract tests | 28 tests, 0 fail |
| 전체 tests | 894 tests, 0 fail |
| createOrder calls `client.rpc('create_order', ...)` | ✅ PASS |
| createOrder does not call `from('orders').insert` | ✅ PASS |
| createOrder does not call product update directly | ✅ PASS |
| createOrder does not insert into inventory_logs directly | ✅ PASS |
| createOrder uses context.storeId (not payload.store_id) | ✅ PASS |
| createOrder maps customer/product uuid | ✅ PASS |
| createOrder rejects legacy numeric ids without uuid | ✅ PASS |
| createOrder validates quantity / selling_price / order_date | ✅ PASS |
| createOrder normalizes RPC result with mapSupabaseRowToLegacyOrder | ✅ PASS |
| createOrder throws on RPC error / no data | ✅ PASS |
| remaining write methods still disabled | ✅ PASS |
| no forbidden RPC calls (ship/cancel/complete/update_pending) | ✅ PASS |
| local DB sync APIs unchanged | ✅ PASS |
| ORDERS_SUPABASE_ENABLED default false | ✅ PASS |
| no migration changes | ✅ PASS |
| no secrets/tokens | ✅ PASS |
| preflight | ✅ PASS |

### O.11 Go/No-Go

| 항목 | 판정 |
|---|---|
| 3-8A.5 createOrder adapter 구현 | **GO** ✅ |
| remote browser smoke (createOrder 실제 호출) | **NO-GO** (이번 단계에서 금지) |
| ship/cancel/complete/update/delete adapter | **NO-GO** (3-8A.6 예정) |
| production order remote 전환 | **NO-GO** |

### O.12 다음 단계

- **3-8A.6**: ship/cancel/complete RPC Adapters (`shipOrder`, `cancelOrder`, `completeOrder` RPC 연결)
- **3-8A.7**: Browser Owner Smoke (owner 계정으로 read + create + ship + cancel + complete smoke test)
- **3-8A.8**: Analytics/Customers Compatibility 검증

---

## P. 3-8A.6 Status RPC Adapters

### P.1 목적

`SupabaseOrdersDataSource`에 상태 전환 RPC adapter 4개를 추가한다:
- `updatePendingOrder` → `public.update_pending_order`
- `shipOrder` → `public.ship_order`
- `cancelOrder` → `public.cancel_order`
- `completeOrder` → `public.complete_order`

이번 단계에서도 실제 remote DB에 주문 생성/수정/출고/취소/완료 실행 금지.
테스트는 mock/static 중심으로만 진행한다.

### P.2 RPC Signature 확인 결과

Migration `supabase/migrations/20260711000950_order_inventory_hardening.sql`에서 확인:

**update_pending_order:**
```sql
CREATE OR REPLACE FUNCTION public.update_pending_order(
    p_order_id uuid,
    p_customer_id uuid,
    p_product_id uuid,
    p_quantity integer,
    p_selling_price numeric,
    p_order_date date,
    p_color text DEFAULT NULL,
    p_size text DEFAULT NULL,
    p_notes text DEFAULT NULL
)
RETURNS public.orders
```

**ship_order:**
```sql
CREATE OR REPLACE FUNCTION public.ship_order(
    p_order_id uuid,
    p_ship_date date DEFAULT current_date,
    p_shipping_company text DEFAULT NULL,
    p_tracking_number text DEFAULT NULL
)
RETURNS public.orders
```

**cancel_order:**
```sql
CREATE OR REPLACE FUNCTION public.cancel_order(
    p_order_id uuid,
    p_notes text DEFAULT NULL
)
RETURNS public.orders
```

**complete_order:**
```sql
CREATE OR REPLACE FUNCTION public.complete_order(
    p_order_id uuid
)
RETURNS public.orders
```

- 반환값: 모두 단일 `public.orders` row
- `shipping_company` / `tracking_number`는 `ship_order`에서만 처리
- hardening migration에서 signature 변경 없음

### P.3 updatePendingOrder RPC Mapping

| RPC Parameter | Source | 설명 |
|---|---|---|
| `p_order_id` | `orderId` (remote uuid) | UUID 검증 필수, legacy numeric 거부 |
| `p_customer_id` | `payload.customer_uuid` (또는 UUID 형식의 customer_id) | remote uuid만 허용 |
| `p_product_id` | `payload.product_uuid` (또는 UUID 형식의 product_id) | remote uuid만 허용 |
| `p_quantity` | `Number(payload.quantity)` | positive integer (>= 1) |
| `p_selling_price` | `Number(payload.selling_price)` | number >= 0 (finite) |
| `p_order_date` | `payload.order_date` (Date → YYYY-MM-DD 변환) | 필수 |
| `p_color` | `payload.color` 또는 null | optional |
| `p_size` | `payload.size` 또는 null | optional |
| `p_notes` | `payload.notes` 또는 null | optional |

### P.4 shipOrder RPC Mapping

| RPC Parameter | Source | 설명 |
|---|---|---|
| `p_order_id` | `orderId` (remote uuid) | UUID 검증 필수 |
| `p_ship_date` | `payload.ship_date` (Date → YYYY-MM-DD 변환) | optional, 없으면 RPC 기본값 `current_date` |
| `p_shipping_company` | `payload.shipping_company` | optional |
| `p_tracking_number` | `payload.tracking_number` | optional |

### P.5 cancelOrder RPC Mapping

| RPC Parameter | Source | 설명 |
|---|---|---|
| `p_order_id` | `orderId` (remote uuid) | UUID 검증 필수 |
| `p_notes` | `payload.notes` | optional |

### P.6 completeOrder RPC Mapping

| RPC Parameter | Source | 설명 |
|---|---|---|
| `p_order_id` | `orderId` (remote uuid) | UUID 검증 필수 |

### P.7 Payload Validation Policy

| 필드 | 검증 규칙 | 적용 Adapter |
|---|---|---|
| `orderId` | remote uuid 필수, legacy numeric id 거부 | all |
| `customer_uuid` | UUID 형식 문자열 (customer_uuid 우선, customer_id fallback) | updatePendingOrder |
| `product_uuid` | UUID 형식 문자열 (product_uuid 우선, product_id fallback) | updatePendingOrder |
| `quantity` | positive integer (>= 1) | updatePendingOrder |
| `selling_price` | number >= 0 (finite) | updatePendingOrder |
| `order_date` | string 또는 Date 객체 (필수) | updatePendingOrder |
| `color` / `size` / `notes` | optional string | updatePendingOrder |
| `ship_date` | optional string 또는 Date | shipOrder |
| `shipping_company` / `tracking_number` | optional string | shipOrder |

### P.8 Common Helpers

- `_callOrderRpcAndMap(rpcName, rpcPayload, methodName)`: RPC 호출 → response 검증 → `mapSupabaseRowToLegacyOrder` 매핑
- `_validateOrderUuid(orderId, methodName)`: orderId UUID 검증
- `_buildUpdatePendingOrderRpcPayload(orderId, payload)`: update_pending_order payload 빌더
- `_buildShipOrderRpcPayload(orderId, payload)`: ship_order payload 빌더
- `_buildCancelOrderRpcPayload(orderId, payload)`: cancel_order payload 빌더

### P.9 Direct Write 금지 준수

모든 adapter는 다음을 수행하지 **않는다**:
- `from('orders').insert/update/delete` 직접 호출 금지
- `from('products').update` 직접 호출 금지 (재고 변경은 RPC가 담당)
- `from('inventory_logs').insert` 직접 호출 금지 (재고 로그는 RPC가 담당)

### P.10 Remaining Disabled Methods

다음 write 메서드는 여전히 `throw new Error(_writeDisabledMsg)` 유지:
- `setOrders(orders)`
- `updateOrder(id, updates)`
- `deleteOrder(id)`
- `findDuplicateOrder(customerId, productId, color, size)`

### P.11 Local Mode Compatibility

- `ORDERS_SUPABASE_ENABLED` 기본값 `false` 유지
- 기본 DataSource = `LocalOrdersDataSource` 유지
- 기존 sync API 변경 없음
- runtime feature flag gate에서 `ORDERS_SUPABASE_ENABLED !== true`이면 조용히 LocalOrdersDataSource 유지

### P.12 Test Results (3-8A.6)

| 항목 | 결과 |
|---|---|
| status RPC adapter contract tests | 33 tests, 0 fail |
| 전체 tests | 930 tests, 0 fail |
| updatePendingOrder calls client.rpc('update_pending_order') | ✅ PASS |
| shipOrder calls client.rpc('ship_order') | ✅ PASS |
| cancelOrder calls client.rpc('cancel_order') | ✅ PASS |
| completeOrder calls client.rpc('complete_order') | ✅ PASS |
| UUID validation for all adapters | ✅ PASS |
| payload validation (quantity, selling_price, uuid mapping) | ✅ PASS |
| shipping fields mapping | ✅ PASS |
| response normalization through mapSupabaseRowToLegacyOrder | ✅ PASS |
| error handling (RPC error, no data) | ✅ PASS |
| no direct table insert/update/delete | ✅ PASS |
| createOrder adapter still works | ✅ PASS |
| setOrders/updateOrder/deleteOrder/findDuplicateOrder still disabled | ✅ PASS |
| ORDERS_SUPABASE_ENABLED default false | ✅ PASS |
| no migration changes | ✅ PASS |
| no secrets/tokens | ✅ PASS |
| local DB sync APIs unchanged | ✅ PASS |
| tests use mock clients only | ✅ PASS |
| preflight | ✅ PASS |

### P.13 Go/No-Go

| 항목 | 판정 |
|---|---|
| updatePendingOrder adapter 구현 | ✅ GO |
| shipOrder adapter 구현 | ✅ GO |
| cancelOrder adapter 구현 | ✅ GO |
| completeOrder adapter 구현 | ✅ GO |
| contract tests 통과 | ✅ GO (33 tests, 0 fail) |
| 전체 tests 통과 | ✅ GO (930 tests, 0 fail) |
| local mode regression 없음 | ✅ GO |
| no migration | ✅ GO |
| no db push | ✅ GO |
| no actual order/customer/product/inventory action | ✅ GO |
| no direct insert/update/delete | ✅ GO |
| no service_role / secrets | ✅ GO |
| preflight PASS | ✅ GO |
| setOrders/updateOrder/deleteOrder/findDuplicateOrder | ✅ GO (여전히 disabled) |
| remote browser smoke | **NO-GO** (3-8A.7 예정) |

### P.14 다음 단계

- **3-8A.7-Prep**: Browser Smoke Readiness Check (runtime flag / client / auth / UI integration 점검)
- **3-8A.7**: Browser Owner Smoke (owner 계정으로 read + create + ship + cancel + complete smoke test)
- **3-8A.8**: Analytics/Customers Compatibility 검증

---

## Q. 3-8A.7-Prep Browser Smoke Readiness Check

### Q.1 목적

3-8A.7 Browser Owner Smoke 실행 전에 현재 아키텍처의 준비 상태를 점검한다.
이번 단계는 readiness check + docs-only 작업이다. 코드 수정은 없다.

### Q.2 Readiness Summary

| 항목 | 상태 | 판정 |
|---|---|---|
| Runtime flag readiness | `ORDERS_SUPABASE_ENABLED: false` 기본, `js/config.js` override 가능 | ✅ GO |
| Supabase client readiness | `isInitialized()` / `getClient()` / `service_role` 차단 / remote URL guardrail | ✅ GO |
| Owner auth readiness | `activeMembership.role === 'owner'` + `storeId` context | ✅ GO |
| Orders UI integration | `orders.js`가 sync local DB API 사용, remote adapter 호출 안 함 | ❌ UI smoke 불가 |
| Dev-console adapter smoke | `DB.getOrdersDataSource()` → adapter 직접 호출 가능 | ✅ GO |

### Q.3 UI Smoke 불가능 판정 근거

`js/orders.js`의 모든 주문 관련 함수는 `DB.getOrders()` / `DB.addOrder()` / `DB.updateOrder()` /
`DB.updateProduct()` / `DB.addInventoryLog()` 등 sync local DB API를 직접 호출한다.
`DB.getOrdersDataSource()` 또는 `DB.getOrdersAsync()`를 호출하지 않으며,
`DB._resolveRuntimeOrdersDataSource()`는 `getOrdersDataSource()` 내부에서만 호출된다.

`orders.js`가 remote adapter를 호출하려면 `DB.getOrders()` → `DB.getOrdersDataSource().listOrders()` 등의
전환이 필요하지만, 이는 `orders.js` 수정이 필요하고 현재 단계에서는 금지된다.

따라서 3-8A.7는 **Dev-Console Adapter Smoke** 방식으로 진행한다.

### Q.4 Dev-Console Adapter Smoke 흐름

```
1. js/config.js 설정 (ORDERS_SUPABASE_ENABLED: true, localhost URL)
2. supabase start (local Supabase)
3. 브라우저에서 owner 계정 로그인 + active store 선택
4. Browser Dev Console에서:
   const ds = DB.getOrdersDataSource();
   // ds.name === 'SupabaseOrdersDataSource' 확인
5. smoke sequence:
   a. ds.listOrders() → read 확인
   b. ds.createOrder({customer_uuid, product_uuid, quantity:1, selling_price, order_date, notes: '[SMOKE TEST 3-8A.7]'})
   c. ds.updatePendingOrder(orderId, {...}) → 수정 확인
   d. ds.shipOrder(orderId, {ship_date, shipping_company, tracking_number}) → 출고 확인
   e. ds.completeOrder(orderId) → 완료 확인
   f. 별도 order: ds.createOrder(...) → ds.cancelOrder(orderId) → 취소 확인
   g. stock / reserved_stock / inventory_logs / customer aggregate 확인
```

### Q.5 Actual Mutation 승인 필요 조건

- 실제 order 생성 전 사용자에게 명시적 승인 요청
- `notes` 필드에 `[SMOKE TEST 3-8A.7]` 표시
- smoke quantity는 최소(1)로 설정
- ship 후에는 재고가 실제 차감되므로 주의
- cancel 가능한 PENDING order와 ship/complete용 order 분리

### Q.6 Smoke Data Policy

| 항목 | 정책 |
|---|---|
| Smoke order 식별 | `notes` 필드에 `[SMOKE TEST 3-8A.7]` 표시 |
| 실제 ID 기록 | 문서/commit/log에 customer/product/order ID 전체값 기록 금지 |
| Cleanup | smoke 완료 후 cancel 가능한 order는 cancel, ship된 order는 `[SMOKE]` notes로 구분 |
| Stock 복구 | cancel된 order는 reserved_stock 자동 복구, ship된 order는 stock 차감 상태 유지 |
| Service role | smoke 중에도 service_role key 사용 금지, publishable key만 사용 |

### Q.7 Go/No-Go

| 항목 | 판정 |
|---|---|
| 3-8A.7-Prep readiness check | ✅ GO |
| 3-8A.7 진입 (dev-console adapter smoke) | ✅ GO |
| 3-8A.7 진입 (UI smoke) | ❌ NO-GO |

### Q.8 다음 단계

- **3-8A.7**: Browser Owner Smoke — dev-console adapter smoke
  - Owner 계정으로 로그인 후 `DB.getOrdersDataSource()` adapter 직접 호출
  - `createOrder` / `updatePendingOrder` / `shipOrder` / `cancelOrder` / `completeOrder` 검증
  - `listOrders` read 확인
  - stock / inventory_logs / customer aggregate side effect 확인

---

## R. 3-8A.7A Runtime Readiness Result (2026-07-26)

### DataSource Selection

| 항목 | 결과 |
|---|---|
| DataSource name | `SupabaseOrdersDataSource` |
| listOrders | ✅ function exists |
| createOrder | ✅ function exists |
| updatePendingOrder | ✅ function exists |
| shipOrder | ✅ function exists |
| cancelOrder | ✅ function exists |
| completeOrder | ✅ function exists |

### listOrders Read-Only

| 항목 | 결과 |
|---|---|
| 호출 성공 | ✅ |
| 반환된 order 수 | 0 (데이터 없음, 정상) |
| 응답 형식 | 정상 |

### Smoke Data Candidates

| 항목 | 결과 |
|---|---|
| hasCustomerUuid | false (고객 데이터 없음) |
| hasProductUuid | true (5개 상품) |
| availableStockGte1 | true (3개 상품 재고 ≥ 1) |

### Mutation Smoke Status

| 항목 | 상태 |
|---|---|
| create_order 호출 | ❌ pending |
| update_pending_order 호출 | ❌ pending |
| ship_order 호출 | ❌ pending |
| cancel_order 호출 | ❌ pending |
| complete_order 호출 | ❌ pending |

### Next Step

- **3-8A.7B**: Browser Owner Mutation Smoke — 명시적 승인 필요
  - customer uuid가 없으므로 smoke용 customer 생성 또는 기존 데이터 필요

---

## S. 3-8A.7B-Prep Customer Readiness Plan (2026-07-26)

### 3-8A.7B Blocked Reason

- `create_order` RPC는 `p_customer_id uuid`를 필수 파라미터로 요구
- RPC 내부에서 customer 존재 여부 검증 (`WHERE id = p_customer_id AND store_id = p_store_id AND deleted_at IS NULL`)
- 3-8A.7A에서 `hasCustomerUuid: false` 확인 → 현재 mutation smoke BLOCKED

### Customer UUID Dependency

| 항목 | 내용 |
|---|---|
| `create_order` param | `p_customer_id uuid` (필수) |
| `update_pending_order` param | `p_customer_id uuid` (필수) |
| customers table 필수 필드 | `store_id` (uuid, NOT NULL), `name` (text, NOT NULL) |
| customers RLS insert | `"Customers: owner/manager can insert"` — authenticated owner/manager 허용 |

### Smoke Customer Policy

| 항목 | 정책 |
|---|---|
| 생성 방식 | dev-console `supabase.from('customers').insert(...)` |
| 키 제약 | publishable/anon key only, service_role 금지 |
| 필수 데이터 | `store_id` (owner session), `name` |
| 식별자 | `name`, `notes`에 `[SMOKE TEST 3-8A.7B]` 표시 |
| UUID 기록 | 전체값 기록 금지 |
| Cleanup | smoke 완료 후 soft delete 가능 |

### Mutation Smoke Prerequisite

3-8A.7B mutation smoke 실행 전 선행 조건:
1. `3-8A.7B-CustomerSeed`: 사용자 승인 후 dev-console에서 smoke customer 1건 생성
2. 생성 후 customer uuid 존재 확인 (hasCustomerUuid: true)
3. customer uuid 확보 후 3-8A.7B mutation smoke 진행

### 3-8A.7B Path Plan

| 경로 | 순서 | customer aggregate 영향 |
|---|---|---|
| **Path A** | createOrder → cancelOrder | 변동 후 복구 (최종 영향 없음) |
| **Path B** | createOrder → shipOrder → completeOrder | stock 차감, aggregate 증가 (cleanup 필요) |

### Next Step

- **3-8A.7B-CustomerSeed**: 사용자 명시적 승인 필요
- **3-8A.7B**: customer 확보 후 mutation smoke (조건부 GO)

---

## T. 3-8A.7B-CustomerSeed Result (2026-07-26)

### Seed Execution

| 항목 | 결과 |
|---|---|
| 사용자 승인 | "승인한다" (2026-07-26) |
| 실행 방식 | dev-console `LESOULSupabase.getClient().from('customers').insert(...)` |
| 키 | publishable/anon key only |
| RLS | `"Customers: owner/manager can insert"` |

### Result

| 항목 | seed 전 | seed 후 |
|---|---|---|
| hasCustomerUuid | false | true |
| count | 0 | 1 |
| inserted | - | true |
| nameOk | - | true |
| notesOk | - | true |
| error | null | null |

### Customer Dependency Resolved

| 항목 | 상태 |
|---|---|
| hasCustomerUuid | ✅ true |
| 3-8A.7B mutation smoke prerequisite | ✅ 충족 |
| UUID 전체값 기록 | 기록하지 않음 |

### Mutation Smoke Prerequisite Status

| 항목 | 상태 |
|---|---|
| Customer uuid 확보 | ✅ 완료 |
| Product uuid 확보 | ✅ (3-8A.7A, 5개 상품) |
| Available stock | ✅ (availableStockGte1) |
| 3-8A.7B 진입 | ✅ GO |

### Next Step

- **3-8A.7B**: Browser Owner Mutation Smoke

---

## U. 3-8A.7B-A Path A Result (2026-07-26)

### create → cancel Path Status

| 단계 | 결과 |
|---|---|
| createOrder | ✅ created, status=PENDING, quantity=1 |
| After-create | ✅ reservedStockIncreasedBy1 |
| cancelOrder | ✅ cancelled, status=CANCELLED |
| After-cancel | ✅ reservedStockRestored, hasReserveLog=true, hasReleaseOrCancelLog=true, logCount=2 |

### Reserved Stock Restore

| 항목 | 결과 |
|---|---|
| 생성 시 reserved_stock | +1 |
| cancel 시 reserved_stock | 복구 (원래 값으로) |
| 최종 영향 | 없음 |

### Inventory Log Result

| 항목 | 결과 |
|---|---|
| RESERVE log | ✅ 있음 |
| RELEASE/CANCEL log | ✅ 있음 |
| 총 log 수 | 2 |

### Mutation Smoke Path A Status

| 항목 | 상태 |
|---|---|
| createOrder adapter | ✅ 정상 동작 확인 |
| cancelOrder adapter | ✅ 정상 동작 확인 |
| reserved stock | ✅ 증가/복구 정상 |
| inventory logs | ✅ 2건 기록 |
| updatePendingOrder | ❌ 호출 안 함 |
| shipOrder | ❌ 호출 안 함 |
| completeOrder | ❌ 호출 안 함 |
| UUID 전체값 기록 | 기록하지 않음 |

### Next Step

- **3-8A.8**: updatePendingOrder RPC Adapter

---

## V. 3-8A.7B-B Path B Result (2026-07-26)

### create → ship → complete Path Status

| 단계 | 결과 |
|---|---|
| createOrder | ✅ PENDING, reservedStockIncreasedBy1 |
| After-create | ✅ productReadOk, no errors |
| shipOrder | ✅ SHIPPED, currentStockDecreasedBy1, reservedStockRestored |
| After-ship | ✅ hasReserveLog, hasShipLog, productReadOk, no errors |
| completeOrder | ✅ COMPLETED, customerOrderCountIncreased, customerQuantityIncreased |
| After-complete | ✅ orderReadOk, customerReadOk, no errors |

### Current/Reserved Stock Result

| 항목 | 결과 |
|---|---|
| create 시 reserved_stock | +1 |
| ship 시 current_stock | -1 |
| ship 시 reserved_stock | 복구 (0으로) |
| 최종 current_stock 영향 | -1 (실제 차감) |
| 최종 reserved_stock 영향 | 0 (복구 완료) |

### Inventory Log Result

| 항목 | 결과 |
|---|---|
| RESERVE log | ✅ 1건 |
| SHIP log | ✅ 1건 |
| 총 log 수 | 2건 |
| RELEASE/CANCEL log | ❌ 없음 (Path B이므로) |

### Customer Aggregate Result

| 항목 | before | after | 증가 |
|---|---|---|---|
| order_count | 0 | 1 | +1 |
| total_quantity | 0 | 1 | +1 |

### Mutation Smoke Path B Status

| 항목 | 상태 |
|---|---|
| createOrder adapter | ✅ 정상 동작 확인 |
| shipOrder adapter | ✅ 정상 동작 확인 |
| completeOrder adapter | ✅ 정상 동작 확인 |
| current_stock 차감 | ✅ 정상 |
| reserved_stock 복구 | ✅ 정상 |
| inventory logs | ✅ 2건 기록 (RESERVE + SHIP) |
| customer aggregate | ✅ 증가 확인 |
| cancelOrder | ❌ 호출 안 함 |
| updatePendingOrder | ❌ 호출 안 함 |
| UUID 전체값 기록 | 기록하지 않음 |

### Remaining Risks

| 위험 | 상태 |
|---|---|
| updatePendingOrder 미검증 | ⚠️ 3-8A.8에서 별도 검증 예정 |
| multi-quantity smoke | ⚠️ quantity=1만 검증, N>1 별도 필요 |
| UI integration | ⚠️ dev-console only, UI smoke 미수행 |

### Next Step

- **3-8A.8**: updatePendingOrder RPC Adapter
