# Orders UI Remote Conversion Plan

## 목적

orders.js의 모든 local sync API 의존성을 audit하고, remote SupabaseOrdersDataSource로 전환하기 위한 구현 계획을 수립한다.

## 현재 orders.js Local Dependency Audit

### 사용 중인 Local Sync API

| API | 사용 위치 | 용도 |
|---|---|---|
| DB.getOrders() | load(), renderList(), batchDelete(), submitEdit(), delete(), submitAdd(), renderShip(), submitShip() | 주문 목록 조회, 단건 조회, order_number 생성 |
| DB.getProducts() | renderList(), batchDelete(), delete(), renderAdd(), updateProductList(), submitAdd(), cancel(), renderShip(), submitShip() | 상품명/브랜드 표시, 재고 확인, dropdown |
| DB.getCustomers() | renderList(), renderAdd(), renderShip() | 고객명 표시, dropdown |
| DB.addOrder() | submitAdd() | 주문 생성 |
| DB.updateOrder() | cancel(), complete(), submitShip() | 주문 상태 변경 |
| DB.setOrders() | batchDelete(), submitEdit(), delete() | 주문 목록 전체 교체 (remote disabled) |
| DB.updateProduct() | submitAdd(), cancel(), submitShip() | reserved_stock, current_stock 직접 변경 (remote forbidden) |
| DB.setProducts() | batchDelete(), delete() | 상품 목록 전체 교체 (remote forbidden) |
| DB.addInventoryLog() | submitShip() | 출고 로그 직접 기록 (remote forbidden) |
| DB.addCustomer() | submitAdd() | 신규 고객 생성 |
| DB.findCustomerByName() | submitAdd() | 고객명 중복 확인 |

### 위험한 Direct Side Effects

| 패턴 | 위치 | remote 전환 시 처리 |
|---|---|---|
| reserved_stock 직접 수정 | submitAdd, cancel, batchDelete, delete | RPC가 처리하므로 제거 |
| current_stock 직접 수정 | submitShip | RPC가 처리하므로 제거 |
| inventory_logs 직접 insert | submitShip | RPC가 처리하므로 제거 |
| setOrders 전체 교체 | submitEdit, batchDelete, delete | remote disabled → RPC 방식으로 전환 |

## Action별 전환 표

| Action | 현재 Local API | Remote 전환 대상 | Async 필요 | 위험도 | 난이도 |
|---|---|---|---|---|---|
| renderList / load | DB.getOrders() + DB.getProducts() + DB.getCustomers() | DB.getOrdersAsync() + DB.getProductsAsync() + customer list (async) | Yes | 중간 | 중간 |
| submitAdd | DB.addOrder() + DB.updateProduct() + DB.addCustomer() | ds.createOrder() + customer resolve (async) | Yes | 높음 | 높음 |
| submitEdit | DB.getOrders() + DB.setOrders() | ds.updatePendingOrder() | Yes | 중간 | 중간 |
| delete (PENDING) | DB.getOrders() + DB.updateProduct() + DB.setOrders() | ds.cancelOrder() | Yes | 중간 | 낮음 |
| submitShip | DB.updateProduct() + DB.updateOrder() + DB.addInventoryLog() | ds.shipOrder() | Yes | 중간 | 낮음 |
| complete | DB.updateOrder() | ds.completeOrder() | Yes | 낮음 | 낮음 |
| cancel | DB.updateProduct() + DB.updateOrder() | ds.cancelOrder() | Yes | 낮음 | 낮음 |
| batchDelete | DB.setProducts() + DB.setOrders() | 다건 cancelOrder loop | Yes | 높음 | 높음 |
| renderAdd (dropdown) | DB.getProducts() + DB.getCustomers() | DB.getProductsAsync() + customer list (async) | Yes | 낮음 | 낮음 |
| renderShip (display) | DB.getOrders() + DB.getProducts() + DB.getCustomers() | DB.getOrdersAsync() + DB.getProductsAsync() + customer list (async) | Yes | 낮음 | 낮음 |

## Remote DataSource Mapping

| Local API | Remote Method | 비고 |
|---|---|---|
| DB.getOrders() | DB.getOrdersAsync() | async, Promise 반환 |
| DB.getProducts() | DB.getProductsAsync() | async, 이미 구현됨 |
| DB.getCustomers() | client.from('customers').select() | async 전환 필요 (getCustomersAsync 없음) |
| DB.addOrder() | ds.createOrder(payload) | RPC payload: customer_uuid, product_uuid, quantity, selling_price, order_date, color, size, notes |
| DB.updateOrder(id, {status: 'CANCELLED'}) | ds.cancelOrder(id, {notes}) | cancel은 RPC로 |
| DB.updateOrder(id, {status: 'COMPLETED'}) | ds.completeOrder(id) | complete는 RPC로 |
| DB.updateOrder(id, {...}) | ds.updatePendingOrder(id, payload) | edit은 updatePendingOrder로 |
| DB.updateOrder(id, {...ship}) | ds.shipOrder(id, payload) | ship은 shipOrder로 |
| DB.updateProduct(...) | FORBIDDEN | RPC가 처리 |
| DB.addInventoryLog(...) | FORBIDDEN | RPC가 처리 |
| DB.setOrders(...) | FORBIDDEN (disabled) | 사용 불가 |
| DB.setProducts(...) | FORBIDDEN | RPC가 처리 |
| DB.addCustomer() | supabase insert | async 전환 필요 |
| DB.findCustomerByName() | supabase select | async 전환 필요 |

## Forbidden Direct Side Effects

remote mode에서는 다음 작업이 절대 금지된다:

- DB.updateProduct() 직접 호출 (reserved_stock, current_stock 수정)
- DB.addInventoryLog() 직접 호출
- DB.setOrders() 직접 호출 (disabled)
- DB.setProducts() 직접 호출
- orders table 직접 INSERT/UPDATE/DELETE
- products table 직접 UPDATE
- inventory_logs table 직접 INSERT

이 모든 side effect는 create_order, update_pending_order, ship_order, cancel_order, complete_order RPC가 atomic하게 처리한다.

## Async UI Requirements

### Loading State

- 모든 remote 호출은 async → UI에 loading indicator 필요
- renderList()가 async로 전환되면 초기 렌더링 시 loading 상태 표시
- 각 action 버튼 클릭 시 버튼 disabled + spinner

### Error Handling

- 모든 remote 호출은 try/catch 필요
- 에러 시 사용자 친화적 메시지 표시 (App.flash)
- RLS permission error → 권한 없음 메시지
- Network error → 연결 실패 메시지

### Remote/Local Branch

- remote mode 판단: `DB.getOrdersDataSource().name === 'SupabaseOrdersDataSource'`
- local mode: 기존 sync API 그대로 사용
- remote mode: async DataSource 사용
- 분기점을 Orders 모듈 초기화 시 한 번만 판단

## Implementation Split

### 3-8A.9-A: Orders UI read-only remote list rendering ✅ 완료 (2026-07-26)

- renderList() / load() async 전환 ✅
- DB.getOrdersAsync() + DB.getProductsAsync() + customer async list ✅
- loading/error handling 추가 ✅
- local mode와 remote mode 분기 ✅
- tests: 22 contract tests, 0 fail ✅
- preflight: PASS ✅

### 3-8A.9-B: Orders UI create form remote submit ✅ 완료 (2026-07-26)

- submitAdd() async 전환 + isRemoteOrdersMode() 분기 ✅
- _submitAddRemote(): ds.createOrder() 사용 ✅
- _renderAddRemote(): customer_uuid / product_uuid 폼 필드 사용 ✅
- updateProductList() remote 분기: cached _remoteProducts 사용 ✅
- customer_uuid / product_uuid 검증 ✅
- DB.addOrder / DB.updateProduct / DB.addInventoryLog 금지 ✅
- 신규 customer 자동 생성 금지 ✅
- contract tests: 28 tests, 0 fail ✅
- preflight: PASS ✅

### 3-8A.9-B.1: Orders UI remote create customer copy cleanup ✅ 완료 (2026-07-26)

- _renderAddRemote(): auto_register 문구 제거 ✅
- local renderAdd(): 기존 auto_register 유지 ✅
- 기능 로직 변경 없음 ✅
- DB mutation 없음 ✅

### 3-8A.9-C: Orders UI cancel/edit pending remote actions ✅ 완료 (2026-07-26)

- cancel(id): ds.cancelOrder(remoteId) 사용 ✅
- delete(orderId): cancelOrder로 위임 (hard delete 금지) ✅
- submitEdit(e, orderId): ds.updatePendingOrder(remoteId, payload) 사용 ✅
- batchDelete(): 각 PENDING 주문 cancelOrder 호출 ✅
- _cancelRemote / _submitEditRemote / _batchCancelRemote helper ✅
- _refreshOrdersAfterRemoteMutation 공통 helper ✅
- PENDING only updatePendingOrder ✅
- customer_uuid / product_uuid 검증 ✅
- DB.updateProduct / DB.updateOrder / DB.setOrders / DB.setProducts 금지 ✅
- contract tests: 30 tests, 1012 total, 0 fail ✅
- preflight: PASS ✅

### 3-8A.9-D: Orders UI ship/complete remote actions ✅ 완료 (2026-07-27)

- submitShip(id): remote mode에서 `ds.shipOrder(remoteId, payload)` 사용 ✅
- complete(id): remote mode에서 `ds.completeOrder(remoteId)` 사용 ✅
- renderShip(id): remote mode에서 cached `_remoteProducts` / `_remoteCustomers` 사용 ✅
- `_submitShipRemote(id)`, `_completeRemote(id)` helper 추가 ✅
- PENDING 상태만 shipOrder 허용 ✅
- SHIPPED 상태만 completeOrder 허용 ✅
- DB.updateProduct / DB.updateOrder / DB.addInventoryLog / DB.setOrders 금지 ✅
- local mode 기존 submitShip/complete 흐름 보존 ✅
- contract tests: 28 tests, 1090 total, 0 fail ✅
- preflight: PASS ✅

### 3-8A.9-E: Orders UI browser owner smoke ✅ 완료 (2026-07-27)

- 사용자 승인 후 실제 remote DB mutation 실행 ✅
- create → PENDING ✅ (`ds.createOrder()`)
- ship → SHIPPED ✅ (`ds.shipOrder()`)
- complete → COMPLETED ✅ (`ds.completeOrder()`)
- PENDING → SHIPPED → COMPLETED 상태 전이 검증 ✅
- forbidden behavior not observed ✅
- 발견된 이슈:
  - app.js bindPageForms() 버그: `Orders.submitForm()` 미존재 → ✅ 3-8A.9-E.1 수정 완료
  - renderShip remote form 렌더링 이슈 → ✅ 3-8A.9-E.1 수정 완료
- tests: 1090 pass, 0 fail ✅
- preflight: PASS ✅

### 3-8A.9-E.1: Orders UI submit and ship route bugfix ✅ 완료 (2026-07-27)

- app.js bindPageForms: `Orders.submitForm()` → `await Orders.submitAdd()` ✅
- orders route: `#/orders/ship/{id}` + `#/orders/{id}/ship` 모두 지원 ✅
- renderShip: async + remote data preload ✅
- ship form onsubmit: `JSON.stringify(String(id))` UUID safety ✅
- _submitShipRemote id lookup: `String(o.id) === String(id)` ✅
- create/cancel/edit/complete 로직 변경 없음 ✅
- no remote DB mutation ✅
- tests: 1109 pass, 0 fail ✅
- preflight: PASS ✅

### 3-8A.9-F: Legacy local mode regression smoke ✅ 완료 (2026-07-27)

- remote mode OFF 상태에서 기존 기능 정상 동작 확인
- localStorage 기반 orders CRUD 검증
- create → PENDING ✅
- edit pending → 가격 수정 ✅
- cancel → CANCELLED + reserved_stock 복구 ✅
- ship → SHIPPED + current_stock 감소 + inventory_logs 생성 ✅
- complete → COMPLETED + Customers.recalculateAll ✅
- forbidden remote behavior not observed ✅
- tests: 1109 pass, 0 fail ✅
- preflight: PASS ✅

## Rollback Plan

| 단계 | 검증 내용 | 방식 |
|---|---|---|
| 3-8A.9-E.1 | remote list rendering | browser owner, load + renderList 확인 |
| 3-8A.9-E.2 | remote create order | browser owner, createOrder smoke (1회) |
| 3-8A.9-E.3 | remote edit pending | browser owner, updatePendingOrder (1회) |
| 3-8A.9-E.4 | remote cancel | browser owner, cancelOrder (1회) |
| 3-8A.9-E.5 | remote ship | browser owner, shipOrder (1회) |
| 3-8A.9-E.6 | remote complete | browser owner, completeOrder (1회) |
| 3-8A.9-F.1 | local mode regression | ORDERS_SUPABASE_ENABLED=false, 모든 기능 확인 | ✅ 완료 |

### Rollback Strategy

- orders.js 원본은 git으로 보존
- remote mode 분기 실패 시 local mode로 fallback
- remote mode는 ORDERS_SUPABASE_ENABLED flag로 on/off
- js/config.js에서 ORDERS_SUPABASE_ENABLED=false로 설정하면 local mode로 복귀

## Go/No-Go (Plan Audit)

| 항목 | 판정 |
|---|---|
| orders.js audit 완료 | ✅ GO |
| local dependency 파악 | ✅ 11개 API, 12개 함수 |
| remote DataSource mapping | ✅ 7개 RPC + async helpers |
| forbidden side effects 식별 | ✅ 4개 패턴 |
| async requirement | ✅ loading + error handling 필요 |
| implementation split | ✅ 6단계 |
| local mode 보존 | ✅ 분기 설계 |
| rollback 가능 | ✅ flag 기반 |

---

## 3-8A.10: Cleanup and Go/No-Go ✅ 완료 (2026-07-27)

### Orders UI Remote Conversion 1차 완료

| 단계 | 내용 | 상태 |
|---|---|---|
| 3-8A.9-A | read-only remote list rendering | ✅ |
| 3-8A.9-B | remote create submit | ✅ |
| 3-8A.9-C | remote cancel/edit pending | ✅ |
| 3-8A.9-D | remote ship/complete | ✅ |
| 3-8A.9-E | browser owner remote smoke | ✅ |
| 3-8A.9-E.1 | submit/ship route bugfix | ✅ |
| 3-8A.9-F | local mode regression smoke | ✅ |

### Remaining Stages

| 우선순위 | 단계 | 내용 |
|---|---|---|
| 1 | 3-8A.10-A | Manager/Staff browser smoke (optional) |
| 2 | 3-8A.10-B | Remote UI post-bugfix smoke (recommended) |
| 3 | 3-8B | Analytics/Customers remote integration audit |
| 4 | 3-9 | Backup/export/import policy |

### 결론

| 항목 | 판정 |
|---|---|
| Internal LESOUL owner operation test | ✅ GO |
| 제한된 내부 사용자/관리자 검증 | ✅ GO |
| 외부 공개 서비스/상용 SaaS/결제 포함 | ❌ NO-GO |
| GitHub sensitive-data Support ticket 완료 전 공개 홍보/배포 | ❌ NO-GO |
| 데이터 백업/복구 정책 없는 실사용 확대 | ❌ NO-GO |