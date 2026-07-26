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

### 3-8A.9-A: Orders UI read-only remote list rendering

- renderList() / load() async 전환
- DB.getOrdersAsync() + DB.getProductsAsync() + customer async list
- loading/error handling 추가
- local mode와 remote mode 분기

### 3-8A.9-B: Orders UI create form remote submit

- submitAdd() async 전환
- ds.createOrder() 사용
- customer lookup/resolve async 전환
- product dropdown async 전환
- reserved_stock 직접 수정 제거

### 3-8A.9-C: Orders UI cancel/edit pending remote actions

- cancel() / delete() → ds.cancelOrder()
- submitEdit() → ds.updatePendingOrder()
- batchDelete() → 다건 cancelOrder loop (선택적)

### 3-8A.9-D: Orders UI ship/complete remote actions

- submitShip() → ds.shipOrder()
- complete() → ds.completeOrder()
- renderShip() display async 전환

### 3-8A.9-E: Orders UI browser owner smoke

- 각 단계 smoke test (read-only → create → edit → cancel → ship → complete)
- local mode regression smoke
- 브라우저 owner session에서 실제 동작 검증

### 3-8A.9-F: Legacy local mode regression smoke

- remote mode OFF 상태에서 기존 기능 정상 동작 확인
- localStorage 기반 orders CRUD 검증

## Smoke Plan

| 단계 | 검증 내용 | 방식 |
|---|---|---|
| 3-8A.9-E.1 | remote list rendering | browser owner, load + renderList 확인 |
| 3-8A.9-E.2 | remote create order | browser owner, createOrder smoke (1회) |
| 3-8A.9-E.3 | remote edit pending | browser owner, updatePendingOrder (1회) |
| 3-8A.9-E.4 | remote cancel | browser owner, cancelOrder (1회) |
| 3-8A.9-E.5 | remote ship | browser owner, shipOrder (1회) |
| 3-8A.9-E.6 | remote complete | browser owner, completeOrder (1회) |
| 3-8A.9-F.1 | local mode regression | ORDERS_SUPABASE_ENABLED=false, 모든 기능 확인 |

## Rollback Plan

- orders.js 원본은 git으로 보존
- remote mode 분기 실패 시 local mode로 fallback
- remote mode는 ORDERS_SUPABASE_ENABLED flag로 on/off
- js/config.js에서 ORDERS_SUPABASE_ENABLED=false로 설정하면 local mode로 복귀

## Go/No-Go

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