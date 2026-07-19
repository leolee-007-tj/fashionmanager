# Data Gateway Async Migration Map (3-5A)

> 본 문서는 `js/db.js`의 공개 메서드를 정리하고, 향후 Supabase 데이터 게이트웨이 전환을 위한 async boundary 계획을 기록한다.
> **3-5A는 실제 CRUD 전환 단계가 아니다.** 구조 준비만 수행한다.

## 1. 현재 상태 요약

- 데이터 계층: `js/db.js`의 `DB` 객체 (전역 `window.DB` / `DB`)
- 저장소: 브라우저 `localStorage`
- prefix: `lesoul_gh_`
- 동기식 API (모든 메서드가 값을 직접 반환)
- 업무 모듈(products.js, orders.js, customers.js 등)이 `DB`를 직접 호출
- 이번 단계에서는 기존 sync API를 깨지 않고 향후 async 전환 가능한 경계만 정리

## 2. db.js 공개 메서드 목록

난이도 범례:
- **A**: 단순 — 단일 컬렉션 read/write, 변환 거의 없음
- **B**: 중간 — 조회 후 가공/필터/정렬 포함
- **C**: 복잡 — 다중 컬렉션 조인 또는 비즈니스 로직 포함
- **D**: 특수 — export/import/migration, 통째로 다뤄야 함

### 2.1 기본 저장소 접근

| 메서드 | sync/async | localStorage key | 호출 모듈 | 전환 난이도 | 전환 시 주의점 | 이번 단계 변경 |
|---|---|---|---|---|---|---|
| `DB.get(key, defaultValue)` | sync | `lesoul_gh_{key}` (동적) | 내부 전용 | A | JSON.parse 실패 시 defaultValue 반환 로직 유지 | no |
| `DB.set(key, value)` | sync | `lesoul_gh_{key}` (동적) | 내부 전용 | A | JSON.stringify 후 setItem | no |
| `DB.getNextId(collection)` | sync | `lesoul_gh_{collection}` | 내부 전용 | B | Supabase 전환 시 DB의 auto-increment 또는 UUID로 교체 필요. 현재는 클라이언트에서 Math.max+1 계산 | no |
| `DB.init()` | sync | `keywords`, `settings` | app.js | B | 최초 1회만 호출. keywords와 settings 기본값 초기화 | no |

### 2.2 Products

| 메서드 | sync/async | localStorage key | 호출 모듈 | 전환 난이도 | 전환 시 주의점 | 이번 단계 변경 |
|---|---|---|---|---|---|---|
| `DB.getProducts()` | sync | `lesoul_gh_products` | products.js, orders.js, customers.js, analytics.js, settings.js, excel.js, app.js | A | 전체 배열 반환. Supabase 전환 시 `products` 테이블 select | no |
| `DB.setProducts(products)` | sync | `lesoul_gh_products` | products.js, customers.js, settings.js | A | 전체 교체. Supabase 전환 시 upsert/delete 차이 주의 | no |
| `DB.addProduct(product)` | sync | `lesoul_gh_products` | products.js, excel.js | A | id 자동 생성, created_at/updated_at 설정. Supabase insert | no |
| `DB.updateProduct(id, updates)` | sync | `lesoul_gh_products` | products.js, customers.js | A | 부분 업데이트. Supabase patch | no |
| `DB.deleteProduct(id)` | sync | `lesoul_gh_products` | products.js | A | 단일 삭제. 연관 주문 처리 주의 | no |
| `DB.generateProductCode(brand, stockYear, stockMonth)` | sync | `lesoul_gh_products` | products.js, excel.js | B | 클라이언트에서 max+1 계산. Supabase 전환 시 RPC 또는 DB sequence 고려 | no |
| `DB.findProductByBrandTitleCost(brand, title, koreaCost, stockMonth, stockYear)` | sync | `lesoul_gh_products` | excel.js | B | 복합 조건 검색. Supabase 쿼리로 변환 | no |

### 2.3 Orders

| 메서드 | sync/async | localStorage key | 호출 모듈 | 전환 난이도 | 전환 시 주의점 | 이번 단계 변경 |
|---|---|---|---|---|---|---|
| `DB.getOrders()` | sync | `lesoul_gh_orders` | orders.js, customers.js, analytics.js, app.js | A | 전체 배열 반환 | no |
| `DB.setOrders(orders)` | sync | `lesoul_gh_orders` | orders.js, customers.js | A | 전체 교체 | no |
| `DB.addOrder(order)` | sync | `lesoul_gh_orders` | orders.js, excel.js | A | id 자동 생성, created_at 설정 | no |
| `DB.updateOrder(id, updates)` | sync | `lesoul_gh_orders` | orders.js | A | 부분 업데이트. updated_at 미설정 주의 | no |
| `DB.deleteOrder(id)` | sync | `lesoul_gh_orders` | customers.js | A | 단일 삭제 | no |
| `DB.findDuplicateOrder(customerId, productId, color, size)` | sync | `lesoul_gh_orders` | excel.js | B | 중복 주문 탐지. Supabase 쿼리로 변환 | no |

### 2.4 Customers

| 메서드 | sync/async | localStorage key | 호출 모듈 | 전환 난이도 | 전환 시 주의점 | 이번 단계 변경 |
|---|---|---|---|---|---|---|
| `DB.getCustomers()` | sync | `lesoul_gh_customers` | customers.js, analytics.js, app.js | A | 전체 배열 반환 | no |
| `DB.setCustomers(customers)` | sync | `lesoul_gh_customers` | customers.js | A | 전체 교체. recalculateAll 결과 저장에 사용됨 | no |
| `DB.addCustomer(customer)` | sync | `lesoul_gh_customers` | customers.js, excel.js | A | id 자동 생성 | no |
| `DB.updateCustomer(id, updates)` | sync | `lesoul_gh_customers` | customers.js | A | 부분 업데이트. avatar_url 포함 가능 | no |
| `DB.deleteCustomer(id)` | sync | `lesoul_gh_customers` | customers.js | A | 단일 삭제. 연관 주문 처리 주의 | no |
| `DB.findCustomerByName(name)` | sync | `lesoul_gh_customers` | excel.js | B | 대소문자 무시 매칭 | no |

### 2.5 Inventory Logs

| 메서드 | sync/async | localStorage key | 호출 모듈 | 전환 난이도 | 전환 시 주의점 | 이번 단계 변경 |
|---|---|---|---|---|---|---|
| `DB.getInventoryLogs()` | sync | `lesoul_gh_inventory_logs` | analytics.js | A | 전체 배열 반환 | no |
| `DB.setInventoryLogs(logs)` | sync | `lesoul_gh_inventory_logs` | 내부 전용 | A | 전체 교체 | no |
| `DB.addInventoryLog(log)` | sync | `lesoul_gh_inventory_logs` | orders.js | A | append-only (삭제/수정 메서드 없음) | no |

### 2.6 Expenses

| 메서드 | sync/async | localStorage key | 호출 모듈 | 전환 난이도 | 전환 시 주의점 | 이번 단계 변경 |
|---|---|---|---|---|---|---|
| `DB.getExpenses()` | sync | `lesoul_gh_expenses` | expenses.js, analytics.js | A | 전체 배열 반환 | no |
| `DB.setExpenses(expenses)` | sync | `lesoul_gh_expenses` | expenses.js | A | 전체 교체 | no |
| `DB.addExpense(expense)` | sync | `lesoul_gh_expenses` | expenses.js | A | id 자동 생성 | no |
| `DB.updateExpense(id, updates)` | sync | `lesoul_gh_expenses` | expenses.js | A | 부분 업데이트 | no |
| `DB.deleteExpense(id)` | sync | `lesoul_gh_expenses` | expenses.js | A | 단일 삭제 | no |

### 2.7 Keywords (Classification)

| 메서드 | sync/async | localStorage key | 호출 모듈 | 전환 난이도 | 전환 시 주의점 | 이번 단계 변경 |
|---|---|---|---|---|---|---|
| `DB.getKeywords()` | sync | `lesoul_gh_keywords` | classification.js, settings.js, products.js | A | 전체 배열 반환 | no |
| `DB.setKeywords(keywords)` | sync | `lesoul_gh_keywords` | 내부 전용 | A | 전체 교체 | no |
| `DB.addKeyword(keyword)` | sync | `lesoul_gh_keywords` | app.js | A | id 자동 생성, created_at, is_active 기본값 | no |
| `DB.updateKeyword(id, updates)` | sync | `lesoul_gh_keywords` | app.js | A | 부분 업데이트. 문자열 비교 `String(k.id) !== String(id)` 주의 | no |
| `DB.deleteKeyword(id)` | sync | `lesoul_gh_keywords` | app.js | A | 문자열 비교로 삭제 | no |
| `DB.initDefaultKeywords()` | sync | `lesoul_gh_keywords` | 내부 (init) | C | 29개 기본 키워드 생성. 신형 스키마 사용. Supabase 전환 시 seed 데이터로 이관 | no |

### 2.8 Settings

| 메서드 | sync/async | localStorage key | 호출 모듈 | 전환 난이도 | 전환 시 주의점 | 이번 단계 변경 |
|---|---|---|---|---|---|---|
| `DB.getSettings()` | sync | `lesoul_gh_settings` | settings.js, analytics.js, app.js, price-calculator.js (간접) | A | 기본값 포함 반환. Supabase 전환 시 store_settings 테이블 | no |
| `DB.getSetting(key)` | sync | `lesoul_gh_settings` | 여러 모듈 | A | 단일 키 조회 | no |
| `DB.setSettings(settings)` | sync | `lesoul_gh_settings` | settings.js | A | 전체 교체 | no |

### 2.9 집계 / 가공

| 메서드 | sync/async | localStorage key | 호출 모듈 | 전환 난이도 | 전환 시 주의점 | 이번 단계 변경 |
|---|---|---|---|---|---|---|
| `DB.recalculateAllPrices()` | sync | `lesoul_gh_products`, `lesoul_gh_settings` | settings.js | C | PriceCalculator 의존. 모든 상품 actual_converted_cost/china_base_price 재계산 후 저장. Supabase 전환 시 RPC 후보 | no |

### 2.10 Export / Import / Migration

| 메서드 | sync/async | localStorage key | 호출 모듈 | 전환 난이도 | 전환 시 주의점 | 이번 단계 변경 |
|---|---|---|---|---|---|---|
| `DB.exportAllData()` | sync | 모든 컬렉션 | settings.js | D | 전체 데이터 덤프. Supabase 전환 시 각 테이블 select 후 병합 | no |
| `DB.importAllData(data)` | sync | 모든 컬렉션 | settings.js | D | 전체 데이터 복원. `_convertExpenses`로 구형 스키마 변환 포함 | no |
| `DB._convertExpenses(expenses)` | sync | (내부) | 내부 (importAllData) | D | 구형 경비 스키마 변환. amount 0 이하 필터링 (데이터 손실 위험) | no |
| `DB.clearAllData()` | sync | 모든 컬렉션 (settings 제외) | settings.js | D | 모든 컬렉션 빈 배열로 초기화. settings는 보존 | no |

## 3. async 전환 경계 계획

### 3.1 현재: localStorageDataSource

- 모든 데이터가 `localStorage`에 저장
- `DB` 객체가 직접 `localStorage.getItem` / `setItem` 호출
- sync API (즉시 값 반환)
- 업무 모듈이 `DB`를 직접 참조

### 3.2 다음 단계: SupabaseDataSource 추가 예정

- `SupabaseDataSource` 클래스/객체 추가 예정
- 동일한 메서드 시그니처를 async로 제공
- `DB` 객체는 `localStorageDataSource` 역할을 유지하면서, 향후 data gateway가 어느 source를 사용할지 선택
- 업무 모듈은 장기적으로 `DB` 직접 접근 대신 data gateway를 통해 접근

### 3.3 이번 단계(3-5A)에서 하는 일

- db.js에 data source 개념을 주석과 얇은 wrapper로 정리
- 기존 sync API를 깨지 않는 범위에서 Promise 호환 helper 추가
- 향후 async 전환 대상 메서드 목록을 내부 상수로 정리
- **실제 Supabase CRUD 호출 없음**
- **기존 public API 이름 유지**

### 3.4 이번 단계에서 하지 않는 일

- 기존 메서드를 전부 async로 변경 ❌
- 화면 코드에 대규모 await 추가 ❌
- localStorage key 변경 ❌
- 데이터 구조 변경 ❌
- Supabase client 호출 ❌

## 4. 전환 우선순위 (참고용, 이번 단계 미실행)

1. **1순위 (난이도 A)**: 단순 CRUD — getProducts/setProducts/addProduct 등
2. **2순위 (난이도 B)**: 복합 조회 — findProductByBrandTitleCost, findDuplicateOrder 등
3. **3순위 (난이도 C)**: 집계/가공 — recalculateAllPrices, initDefaultKeywords
4. **4순위 (난이도 D)**: export/import/migration — exportAllData, importAllData, clearAllData

## 5. 제약 사항

- localStorage prefix `lesoul_gh_` 변경 금지
- 기존 데이터 구조 변경 금지
- service_role key 브라우저 사용 금지
- 원격 Supabase 연결 금지
- Supabase CRUD 호출 금지 (이번 단계)
- `js/config.js` commit 금지
- `data_export.json` 재추가 금지

## 6. 3-5B: Products Read Path Async Boundary (2026-07-19)

### 목적
상품 목록/조회 read path만 async boundary에 맞춰 준비한다.
**3-5B는 Products read path only, no CRUD conversion.**
실제 Supabase CRUD 호출은 금지하며, 데이터 소스는 여전히 localStorage다.

### 변경 내용

#### js/db.js
- `DB.getProductsAsync()`: `Promise.resolve(this.getProducts())` 래핑 helper 추가
- `DB.getDataSourceMode()`: 현재 항상 `'localStorage'` 반환
- `DB.isAsyncBoundaryEnabled(scope)`: `scope === 'products-read'`일 때만 `true`
- 기존 sync `DB.getProducts()`는 유지

#### js/products.js (read path만)
- `Products.load()`: `async function`으로 변경, `DB.getProductsAsync()`를 await (미지원 시 `DB.getProducts()` fallback)
- `Products.renderList()`: `async function`으로 변경, `await this.load()` 사용
- 렌더링 결과는 기존과 동일

#### js/app.js (최소 대응)
- `App.renderPage()`: `async function`으로 변경, products 페이지에서 `await Products.renderList()` 처리
- 다른 페이지는 기존 sync 동작 유지

### 이번 단계에서 하지 않는 일
- Products write path (submitForm/delete/batchDelete/batchReclassify/batchMonthChange) 전환 ❌
- Orders/Customers/Expenses/Settings 모듈 async 전환 ❌
- supabase.from('products') 호출 ❌
- insert/update/delete/upsert 구현 ❌
- 상품 데이터 구조 변경 ❌
- localStorage prefix 변경 ❌

### 검증
- `tests/products-read-async-contract.test.mjs` (P1-P13)
- 기존 JS 테스트 전체 회귀
- preflight + DB lint + pgTAP
- 브라우저 수동 확인: 상품 목록/검색/정렬/필터 정상 동작

## 7. 3-5C: Products Write Path Async Boundary Preparation (2026-07-19)

### 목적
Products read path async boundary가 완료됐으므로, 이번에는 Products write path를 async boundary에 맞게 준비한다.
**3-5C는 Products write path async boundary only, no Supabase CRUD conversion.**
실제 Supabase insert/update/delete/upsert 호출은 금지하며, 데이터 소스는 여전히 localStorage다.

### 변경 내용

#### js/db.js
- `DB.setProductsAsync(products)`: `Promise.resolve(this.setProducts(products))` 래핑
- `DB.addProductAsync(product)`: `Promise.resolve(this.addProduct(product))` 래핑
- `DB.updateProductAsync(id, updates)`: `Promise.resolve(this.updateProduct(id, updates))` 래핑
- `DB.deleteProductAsync(id)`: `Promise.resolve(this.deleteProduct(id))` 래핑
- `DB.isAsyncBoundaryEnabled('products-write')` → `true`
- 기존 sync `DB.setProducts/addProduct/updateProduct/deleteProduct`는 유지

#### js/products.js (write path만)
- `Products.submitForm()`: `async function`, `DB.addProductAsync/updateProductAsync`를 await (미지원 시 sync fallback)
- `Products.delete(id)`: `async function`, `DB.deleteProductAsync`를 await (미지원 시 sync fallback)
- `Products.batchDelete()`: `async function`, `DB.setProductsAsync`를 await (미지원 시 sync fallback)
- `Products.batchReclassify()`: `async function`, `DB.setProductsAsync`를 await (미지원 시 sync fallback)
- `Products.batchMonthChange()`: `async function`, `DB.setProductsAsync`를 await (미지원 시 sync fallback)
- 기능 결과는 기존과 동일

#### js/app.js (최소 대응)
- `bindPageForms()`: productForm submit handler에서 `Promise.resolve(Products.submitForm(editId)).catch(...)` 처리
- 오류 발생 시 `App.flash`로 일반 오류 표시
- 다른 form handler는 기존 sync 동작 유지

### 이번 단계에서 하지 않는 일
- supabase.from('products') 호출 ❌
- Supabase insert/update/delete/upsert 구현 ❌
- 원격 Supabase 연결 ❌
- service_role 브라우저 사용 ❌
- localStorage prefix 변경 ❌
- 상품 스키마 변경 ❌
- 주문/고객 트랜잭션 로직 변경 ❌
- autoClassifyAll 로직 변경 ❌
- 가격 계산 로직 변경 ❌

### 검증
- `tests/products-write-async-contract.test.mjs` (W1-W15)
- 기존 JS 테스트 전체 회귀
- preflight + DB lint + pgTAP
- 브라우저 수동 확인: 상품 추가/수정/삭제/일괄 작업 정상 동작

## 8. 3-5D: Products DataSource Interface Extraction (2026-07-19)

### 목적
Products read/write async boundary가 준비됐으므로, 이번 단계에서는 Products 전용 DataSource 인터페이스를 분리한다.
**3-5D는 Products DataSource extraction only, no Supabase CRUD conversion.**
현재 활성 DataSource는 반드시 LocalProductsDataSource이며, 내부 저장 방식은 기존 localStorage 그대로 유지한다.

### 변경 내용

#### js/db.js
- `DB.getProductsDataSource()`: 현재 활성 Products DataSource 반환 (기본값: LocalProductsDataSource)
- `DB.setProductsDataSourceForTesting(source)`: 테스트 전용 DataSource 교체
- `DB.resetProductsDataSourceForTesting()`: 테스트 전용 DataSource 리셋
- `DB._createLocalProductsDataSource()`: LocalProductsDataSource 팩토리
  - `listProducts()` → `Promise.resolve(db.getProducts())`
  - `setProducts(products)` → `db.setProducts()`, `Promise.resolve()`
  - `createProduct(product)` → `db.addProduct()`, `Promise.resolve(result)`
  - `updateProduct(id, updates)` → `db.updateProduct()`, `Promise.resolve(result)`
  - `deleteProduct(id)` → `db.deleteProduct()`, `Promise.resolve(result)`
- 기존 async helper(`getProductsAsync`, `addProductAsync`, `updateProductAsync`, `deleteProductAsync`, `setProductsAsync`)는 내부적으로 ProductsDataSource를 경유하도록 정리
- 기존 sync public API(`DB.getProducts`, `DB.addProduct` 등)는 그대로 유지

#### Products DataSource 인터페이스 계약
```
interface ProductsDataSource {
    name: string;
    listProducts(): Promise<Product[]>;
    setProducts(products: Product[]): Promise<void>;
    createProduct(product: Product): Promise<Product>;
    updateProduct(id, updates): Promise<Product>;
    deleteProduct(id): Promise<boolean>;
}
```

### 현재 활성 DataSource
- **LocalProductsDataSource**: 기존 localStorage 기반 DB sync 메서드를 감쌈

### 다음 단계 예정
- **SupabaseProductsDataSource**: `supabase.from('products')` 기반 구현 (아직 구현 안 함)
- 실제 Supabase CRUD 호출은 다음 단계에서 수행

### 이번 단계에서 하지 않는 일
- supabase.from('products') 호출 ❌
- Supabase insert/update/delete/upsert 구현 ❌
- 원격 Supabase 연결 ❌
- service_role 브라우저 사용 ❌
- 상품 스키마 변경 ❌
- localStorage prefix 변경 ❌
- 주문/고객/재고 트랜잭션 로직 변경 ❌
- products.js submit/delete/batch 로직 재작성 ❌

### 검증
- `tests/products-datasource-contract.test.mjs` (D1-D16)
- 기존 JS 테스트 전체 회귀
- preflight + DB lint + pgTAP
- 브라우저 수동 확인: 상품 목록/추가/수정/삭제/일괄 작업 정상 동작

## 9. 3-5E: Products Supabase Mapping Contract (2026-07-19)

### 목적
ProductsDataSource boundary가 분리됐으므로, 이번 단계에서는 Supabase products row와 기존 legacy product object 사이의 mapping contract를 고정한다.
**3-5E는 Products Supabase mapping contract only, no Supabase CRUD conversion.**
활성 DataSource는 계속 LocalProductsDataSource여야 한다.

### 변경 내용

#### js/db.js
- `DB.mapLegacyProductToSupabaseRow(product)`: legacy product object → Supabase products row (순수 함수)
- `DB.mapSupabaseRowToLegacyProduct(row)`: Supabase products row → legacy product object (순수 함수)
- `DB.validateProductMappingInputForTesting(productOrRow, kind)`: 매핑 입력값 정적 검증 (테스트용)
- `DB._SUPABASE_PRODUCT_EXTENDED_FIELDS`: Supabase 확장 필드 기본값 (frozen object)
- **활성 DataSource 변경 없음**: `getProductsDataSource()`는 여전히 LocalProductsDataSource 반환

#### mapping helper 특성
- 순수 함수 (side-effect 없음)
- localStorage 읽기/쓰기 금지
- 네트워크 호출 금지
- Supabase client 호출 금지
- 현재 runtime에서 자동 사용하지 않음 (다음 단계에서 사용 예정)

### Legacy product object ↔ Supabase products row 필드 매핑표

| Legacy field | Supabase column | 타입 | 비고 |
|---|---|---|---|
| `id` (numeric) | `legacy_id` (bigint) | number → bigint | legacy numeric id는 legacy_id로 보존 |
| — | `id` (uuid) | — | Supabase uuid, legacy numeric id와 다름. 신규 생성 시 null (DB가 gen_random_uuid()로 채움) |
| — | `store_id` (uuid) | — | 현재 브라우저 business CRUD에서 미사용. 매핑 시 null (다음 단계에서 인증 게이트와 연동) |
| `product_code` | `product_code` | text | direct copy |
| `original_title` | `original_title` | text | direct copy (필수) |
| `normalized_title` | `normalized_title` | text | direct copy |
| `title_language` | `title_language` | text | direct copy |
| `brand` | `brand` | text | direct copy (필수) |
| `category` | `category` | text | direct copy |
| `color` | `color` | text | direct copy |
| `size` | `size` | text | direct copy |
| `material` | `material` | text | direct copy |
| — | `season` | text | Supabase 전용 확장 필드 (legacy에 없음, 기본값 null) |
| — | `fit` | text | Supabase 전용 확장 필드 (기본값 null) |
| — | `style` | text | Supabase 전용 확장 필드 (기본값 null) |
| — | `classification_status` | text | Supabase 전용 확장 필드 (기본값 null) |
| `korea_cost` | `korea_cost` | numeric | direct copy |
| `actual_converted_cost` | `actual_converted_cost` | numeric | direct copy |
| `china_base_price` | `china_base_price` | numeric | direct copy |
| `current_stock` | `current_stock` | integer | direct copy (기본값 0) |
| `reserved_stock` | `reserved_stock` | integer | direct copy (기본값 0) |
| `stock_year` | `stock_year` | integer | direct copy |
| `stock_month` | `stock_month` | integer | direct copy |
| `image` (base64) | `image` | text | base64 text 보존 (이번 단계에서 blob 변환하지 않음) |
| `notes` | `notes` | text | direct copy |
| — | `created_by` | uuid | 인증 연동 후 채움 (현재 null) |
| — | `updated_by` | uuid | 인증 연동 후 채움 (현재 null) |
| `created_at` | `created_at` | timestamptz | ISO string direct copy |
| `updated_at` | `updated_at` | timestamptz | ISO string direct copy |
| — | `deleted_at` | timestamptz | Supabase 전용 soft-delete 필드 (기본값 null) |
| — | `version` | integer | Supabase 전용乐观锁 필드 (기본값 1) |

### 매핑 규칙
1. **id 분리**: legacy numeric id → `legacy_id`, Supabase uuid → `id` (혼동 방지)
2. **안전 기본값**: 누락/unknown 필드는 안전 기본값 처리 (앱 호환성 보존)
3. **image text 보존**: base64 image는 text로 보존, blob 변환하지 않음
4. **store_id 미사용**: 현재 브라우저 business CRUD에서 store_id 미사용, 매핑 시 null
5. **profit/price calculation 변경 없음**: 이번 단계에서 가격 계산 로직 변경하지 않음
6. **round-trip 보장**: legacy → row → legacy 변환 시 핵심 필드 보존

### 현재 활성 DataSource
- **LocalProductsDataSource**: 계속 활성 상태 유지
- mapping helper는 runtime에서 자동 사용하지 않음

### 다음 단계 예정
- **SupabaseProductsDataSource**: `supabase.from('products')` 기반 구현 (아직 구현 안 함)
- SupabaseProductsDataSource에서 mapping helper 사용 예정
- 실제 Supabase CRUD 호출은 다음 단계에서 수행

### 이번 단계에서 하지 않는 일
- `supabase.from('products')` 호출 ❌
- Supabase select/insert/update/delete/upsert 구현 ❌
- 원격 Supabase 연결 ❌
- service_role 브라우저 사용 ❌
- ProductsDataSource를 Supabase로 활성화 ❌
- 상품 스키마 변경 ❌
- localStorage prefix 변경 ❌
- 주문/고객/재고 트랜잭션 로직 변경 ❌
- products.js 변경 ❌
- feature flag로 실제 Supabase products read/write 켜는 코드 추가 ❌

### 검증
- `tests/products-supabase-mapping-contract.test.mjs` (M1-M18)
- 기존 JS 테스트 전체 회귀
- preflight + DB lint + pgTAP
- 브라우저 수동 확인: 상품 목록/추가/수정/삭제/일괄 작업 정상 동작

## 10. 3-5F: SupabaseProductsDataSource Disabled Skeleton (2026-07-19)

### 목적
Products Supabase mapping contract가 고정됐으므로, 이번 단계에서는 SupabaseProductsDataSource skeleton만 추가한다.
**3-5F는 SupabaseProductsDataSource disabled skeleton only, no Supabase CRUD conversion.**
기본 활성 DataSource는 반드시 LocalProductsDataSource로 유지한다.
실제 Supabase products read/write 전환은 아직 하지 않는다.

### 변경 내용

#### js/db.js
- `DB._createDisabledSupabaseProductsDataSource()`: SupabaseProductsDataSource skeleton 팩토리 추가
- skeleton 메서드: `name`, `listProducts()`, `setProducts(products)`, `createProduct(product)`, `updateProduct(id, updates)`, `deleteProduct(id)`
- **모든 메서드는 `throw new Error('SupabaseProductsDataSource is not enabled yet')`**
- **활성 DataSource 변경 없음**: `getProductsDataSource()`는 여전히 LocalProductsDataSource 반환
- runtime에서 자동 생성/활성화하지 않음
- feature flag / config / auth session 기반 자동 전환 없음

#### skeleton 특성
- disabled 상태: 모든 메서드 호출 시 명확히 실패
- 실제 `supabase.from('products')` 호출 없음
- 실제 select/insert/update/delete/upsert 구현 없음
- 네트워크 호출 없음
- mapping helper는 참조만 (실제 호출은 다음 단계에서)

### SupabaseProductsDataSource 구조 (skeleton)

```
SupabaseProductsDataSource (disabled skeleton)
  ├─ name: 'SupabaseProductsDataSource'
  ├─ listProducts() → throws "not enabled yet"
  ├─ setProducts(products) → throws "not enabled yet"
  ├─ createProduct(product) → throws "not enabled yet"
  ├─ updateProduct(id, updates) → throws "not enabled yet"
  └─ deleteProduct(id) → throws "not enabled yet"
```

### 현재 활성 DataSource
- **LocalProductsDataSource**: 계속 활성 상태 유지
- `getProductsDataSource()` 기본값 = LocalProductsDataSource
- SupabaseProductsDataSource는 skeleton만 존재, runtime에서 자동 사용하지 않음

### 다음 단계 예정
- SupabaseProductsDataSource 실제 구현: `supabase.from('products')` 기반 CRUD
- mapping helper를 사용한 legacy ↔ row 변환
- store_id와 auth session 연동
- 단계적 활성화 전략 (read-only → write → full)

### 이번 단계에서 하지 않는 일
- `getProductsDataSource()` 기본값을 SupabaseProductsDataSource로 변경 ❌
- 실제 `supabase.from('products')` 실행 ❌
- 실제 select/insert/update/delete/upsert 구현 ❌
- 원격 Supabase 연결 ❌
- service_role 브라우저 사용 ❌
- feature flag로 SupabaseProductsDataSource 자동 활성화 ❌
- js/config.js 값으로 products data source 전환 ❌
- auth session 기반으로 products data source 전환 ❌
- 상품 스키마 변경 ❌
- localStorage prefix 변경 ❌
- products.js 변경 ❌
- 주문/고객/재고 트랜잭션 로직 변경 ❌

### 검증
- `tests/products-supabase-datasource-skeleton-contract.test.mjs` (S1-S16)
- 기존 JS 테스트 전체 회귀
- preflight + DB lint + pgTAP
- 브라우저 수동 확인: 상품 목록/추가/수정/삭제/일괄 작업 정상 동작

## 11. 3-5G: Products Supabase Read Path Local-only Controlled Test (2026-07-19)

### 목적
SupabaseProductsDataSource skeleton이 추가됐으므로, 이번 단계에서는 listProducts read path만 로컬 테스트 전용으로 제한 구현한다.
**3-5G는 local-only controlled read test only, no write conversion.**
기본 앱 runtime의 활성 DataSource는 반드시 LocalProductsDataSource로 유지한다.

### 변경 내용

#### js/db.js
- `_createDisabledSupabaseProductsDataSource()` → `_createControlledSupabaseProductsDataSource(client, context)`로 변경
- **listProducts만 구현** (read-only, local-only controlled)
- **write methods (setProducts/createProduct/updateProduct/deleteProduct)는 계속 disabled error 유지**
- 기본 `getProductsDataSource()`는 LocalProductsDataSource 유지
- runtime에서 자동 생성/활성화하지 않음
- `setProductsDataSourceForTesting()`으로만 주입 가능

#### listProducts local-only 조건
1. **client 명시적 주입 필요**: client가 없으면 throw
2. **context.localOnly === true 필요**: localOnly가 true가 아니면 throw
3. **storeId 필요**: storeId가 없으면 throw
4. **localhost/127.0.0.1 URL만 허용**: 원격 URL이면 throw
5. **products select read-only**: `client.from('products').select('*').eq('store_id', storeId)`만 수행
6. **결과 변환**: `mapSupabaseRowToLegacyProduct(row)`로 legacy object로 변환
7. **민감 정보 보호**: token/session/key console.log 금지, 오류 메시지에 key/JWT/token/body 포함 금지

### SupabaseProductsDataSource 구조 (3-5G)

```
_createControlledSupabaseProductsDataSource(client, context) → {
  name: 'SupabaseProductsDataSource',
  listProducts() → local-only controlled read (구현됨),
  setProducts()    → throw "write methods not enabled yet",
  createProduct()  → throw "write methods not enabled yet",
  updateProduct()  → throw "write methods not enabled yet",
  deleteProduct()  → throw "write methods not enabled yet"
}
```

### 현재 활성 DataSource
- **LocalProductsDataSource**: 계속 기본 활성 상태 유지
- `getProductsDataSource()` 기본값 = LocalProductsDataSource
- SupabaseProductsDataSource는 `setProductsDataSourceForTesting()`으로만 주입 가능
- 일반 브라우저 상품 화면은 이번 단계에서도 localStorage 사용

### 다음 단계 예정
- write path 구현 (create/update/delete)
- 실제 앱 runtime 전환 (feature flag 기반)
- store_id와 auth session 연동

### 이번 단계에서 하지 않는 일
- `getProductsDataSource()` 기본값을 SupabaseProductsDataSource로 변경 ❌
- 일반 runtime에서 SupabaseProductsDataSource 자동 활성화 ❌
- Products 화면을 Supabase read로 자동 전환 ❌
- create/update/delete/upsert 구현 ❌
- Supabase write path 구현 ❌
- 원격 Supabase 연결 ❌
- service_role 브라우저 사용 ❌
- js/config.js commit ❌
- 상품 스키마 변경 ❌
- localStorage prefix 변경 ❌
- products.js 변경 ❌
- data_export.json 재추가 ❌

### 검증
- `tests/products-supabase-read-contract.test.mjs` (R1-R19)
- `tests/products-supabase-datasource-skeleton-contract.test.mjs` (S1-S16, 업데이트됨)
- 기존 JS 테스트 전체 회귀
- preflight + DB lint + pgTAP
- 브라우저 수동 확인: 상품 목록/추가/수정/삭제/일괄 작업 정상 동작
- 일반 브라우저 runtime이 SupabaseProductsDataSource로 자동 전환되지 않음 확인
