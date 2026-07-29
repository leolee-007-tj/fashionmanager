# Metrics Source of Truth

> 본 문서는 dashboard/product list/orders/analytics에서 사용하는 모든 숫자 지표의 source of truth 정책을 정의한다.

## Product Identity Policy

### Local Product

| 항목 | 정책 |
|---|---|
| `id` | positive integer, `nextId()`로 자동 생성 |
| `legacy_id` | optional, 있으면 `id`와 동일한 numeric 값 |
| `remote_id` | 없음 (local 전용) |
| UI action key | `legacy_id` > `id` 순서로 string key 사용 |
| 삭제 가능 조건 | `id`가 positive numeric이면 항상 삭제 가능 |

### Remote Product

| 항목 | 정책 |
|---|---|
| `remote_id` | Supabase uuid (필수, RPC createProduct에서 반환) |
| `legacy_id` | positive integer (available 시, Supabase RPC createProduct에서 반환) |
| `id` | `legacy_id`와 동일하거나 fallback (local compat) |
| UI action key | `legacy_id` > `id` > `remote:id` 순서로 string key 사용 |
| 삭제 가능 조건 | `legacy_id` positive integer이면 legacy_id 기반 삭제. `remote_id` only면 `soft_delete_product_by_id` RPC로 삭제 가능 (BLOCKER-FIX-6) |

### 생성 정책 (모든 출처)

- 수동 등록 상품: `nextId()`로 positive integer `id` 생성 → `legacy_id`와 동일
- 엑셀 업로드 상품: `nextId()`로 positive integer `id` 생성 → `legacy_id`와 동일
- Remote createProduct: `p_legacy_id` = `product.id` (positive integer)
- `stock_year`/`stock_month` 필수 저장 (MISSING_STOCK_YEAR_MONTH 방지)

## Delete Policy

### 삭제 가능한 상품

| 출처 | 삭제 가능 조건 | 삭제 방식 |
|---|---|---|
| Local mode | `id` positive numeric | `localStorageDataSource.deleteProduct(id)` |
| Remote mode (legacy_id 있음) | `legacy_id` positive numeric | `soft_delete_product` RPC (`p_legacy_id`) |
| Remote mode (legacy_id 없음) | `remote_id` uuid | `soft_delete_product_by_id` RPC (`p_product_id`) — BLOCKER-FIX-6 |

### 삭제 불가능한 상품 처리

- `MISSING_DELETE_ID`: "이 상품에 삭제에 필요한 식별자가 없습니다."
- `PRODUCT_NOT_FOUND`: "상품을 찾을 수 없습니다."
- 삭제 불가능한 상품은 UI에 `disabled reason` 표시, success flash 금지
- **BLOCKER-FIX-6**: `REMOTE_ID_ONLY_NO_RPC` 더 이상 존재하지 않음 — 모든 상품 삭제 가능

### Soft Delete 원칙

- 모든 삭제는 hard delete가 아닌 soft delete (`deleted_at` 설정)
- Orders와 연결된 상품은 주문 snapshot 보존 (삭제되어도 기존 주문 record 유지)
- 삭제된 상품은 product list/dashboard/product count/stock count에서 제외

## Count Recalculation Policy

### 삭제 후 재계산해야 할 수치

| 수치 | 계산 방식 |
|---|---|
| product list 전체 상품 | `DB.getProductsAsync()` → `deleted_at IS NULL` 만 |
| product list 표시 상품 | `Products.state.filtered.length` (filter/search 적용) |
| dashboard 총상품 | `App.renderDashboard()` → `DB.getProductsAsync()` → total count |
| totalStock | `currentStock` 합계 (deleted_at IS NULL) |
| reservedStock | `reservedStock` 합계 (deleted_at IS NULL) |
| availableStock | `totalStock - reservedStock` |
| stock by filter year/month | filter 적용 후 stock totals |
| orders snapshot | 기존 주문의 product snapshot 보존 (변경 없음) |
| analytics | pending risk 시 warning 표시 (deleted product 참조) |

### 삭제 후 reload 순서

1. `Products.state.loaded = false`
2. `Products.state.selected.clear()`
3. `await Products.load()`
4. `App.renderPage()` (dashboard + product list 동시 갱신)
5. `window.__LAST_PRODUCT_DELETE_SUMMARY__` 저장 (beforeCount, afterCount, visibleCount)

### Dashboard / Product List 일치 조건

- dashboard와 product list는 같은 `DB.getProductsAsync()` datasource 기준
- `deleted_at IS NULL` 조건 동일 적용
- filter/search 영향 없이 raw count 일치

## Import Count Policy (BLOCKER-FIX-6)

### Product count vs Stock count 구분

| 구분 | 계산 방식 |
|---|---|
| 전체 상품 수 | `datasource loaded count` (deleted_at IS NULL) |
| 표시 상품 수 | `filtered count` (year/month/search 적용) |
| 전체 재고 | 모든 loaded product의 `current_stock` 합계 |
| 표시 재고 | filtered product의 `current_stock` 합계 |
| 예약 재고 | 모든 loaded product의 `reserved_stock` 합계 |
| 판매가능 재고 | `전체 재고 - 예약 재고` |
| 업로드 수량 | `inputRows` (파일 기준) vs `normalizedValidRows` (정규화 성공) |

### Duplicate candidate policy

- Import identity key: `brand + original_title + color + size + korea_cost + stock_year + stock_month`
- 완전 동일 key가 existing DB에 있어도 `DUPLICATE_CANDIDATE`로만 기록, **자동 skip하지 않음**
- 모든 유효한 행은 기본적으로 import
- 사용자가 나중에 `duplicateCandidateCount` 확인 후 정리 가능

### Delete count recalculation policy

- 삭제 후 `datasourceCountAfter` = `datasourceCountBefore - successCount`
- `countDeltaMatchesSuccess` = `datasourceCountAfter === datasourceCountBefore - successCount`
- 불일치 시 error-level warning 출력

## Identity Debug Summary

### Delete Summary 구조

```javascript
window.__LAST_PRODUCT_DELETE_SUMMARY__ = {
    mode: 'remote' | 'local',
    actionKeyType: 'legacy_id' | 'id' | 'remote_id' | 'invalid',
    targetType: 'legacy_id' | 'remote_id' | 'invalid',
    success: true | false,
    reason: string | undefined,
    beforeCount: number,
    afterCount: number,
    visibleCount: number
};
```

### Batch Delete Summary 구조

```javascript
window.__LAST_PRODUCT_BATCH_DELETE_SUMMARY__ = {
    mode: 'remote' | 'local',
    requested: number,
    success: number,
    failed: number,
    failReasons: string[] | undefined,
    beforeCount: number,
    afterCount: number,
    visibleCount: number
};
```

### 금지사항

- UUID 전체값을 summary/docs에 기록 금지
- `remote_id`는 boolean 또는 masked 형태만 기록
- `token/key/password` 출력 금지
- `service_role` 사용 금지