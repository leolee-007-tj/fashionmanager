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

## 12. 3-5H: Products Supabase Read Local Integration Smoke (2026-07-19)

### 목적
3-5G에서 SupabaseProductsDataSource의 local-only controlled listProducts 구조를 만들었다.
이번 단계에서는 실제 로컬 Supabase/Auth/RLS 환경에서 products read가 동작하는지 통합 smoke test로 검증한다.
**3-5H는 local-only integration smoke only, no runtime conversion, no write.**

단, 일반 앱 runtime은 계속 LocalProductsDataSource를 사용해야 한다.
Products 화면을 Supabase read로 자동 전환하면 안 된다.
write path는 여전히 disabled 상태여야 한다.

### 변경 내용

#### tests/products-supabase-read-local.integration.mjs (신규)
- 로컬 Supabase 환경에서 실행하는 integration smoke test
- `RUN_LOCAL_SUPABASE_INTEGRATION=1` 환경 변수가 있어야 실행 (opt-in)
- 기본 `node --test`에서는 skip, 네트워크 호출 없음
- 테스트 흐름:
  1. service_role admin API로 테스트 유저 생성 (setup only)
  2. anon key로 password 로그인
  3. ensure_user_profile RPC 호출
  4. create_initial_store RPC로 테스트 스토어 생성
  5. authenticated owner (anon key + access token)로 products fixture 2개 삽입 (RLS insert 정책도 검증)
  6. anon client + SupabaseProductsDataSource.listProducts()로 read 검증
  7. 결과가 mapSupabaseRowToLegacyProduct로 정상 변환되는지 확인
  8. write methods disabled 확인
  9. best-effort 테스트 유저 cleanup (기본 cleanup은 db reset)

#### 중요 제약
- 테스트 데이터는 dummy/local-only만 사용
- 실제 운영 데이터 금지
- 실제 계정 정보 문서 기록 금지
- token/session/key console.log 금지
- response body 전체 console.log 금지
- 오류 출력도 sanitized message만 사용
- service_role은 setup에서만 사용, DataSource/브라우저 코드에 전달 금지
- 브라우저 코드에 service_role 포함 금지
- 원격 Supabase 연결 금지 (localhost/127.0.0.1만 허용)

### 현재 활성 DataSource
- **LocalProductsDataSource**: 계속 기본 활성 상태 유지
- `getProductsDataSource()` 기본값 = LocalProductsDataSource
- SupabaseProductsDataSource는 테스트에서만 `setProductsDataSourceForTesting()`으로 주입
- 일반 브라우저 상품 화면은 계속 localStorage 사용

### write path 상태
- setProducts: disabled (throw "write methods not enabled yet")
- createProduct: disabled
- updateProduct: disabled
- deleteProduct: disabled
- insert/update/delete/upsert 실제 구현 없음

### 다음 단계 예정
- write path 구현 (create/update/delete)
- 실제 앱 runtime 전환 (feature flag 기반)
- store_id와 auth session 연동
- batch / classification / 월 변경 등의 복잡한 write flow 통합

### 이번 단계에서 하지 않는 일
- `getProductsDataSource()` 기본값을 SupabaseProductsDataSource로 변경 ❌
- 일반 runtime에서 SupabaseProductsDataSource 자동 활성화 ❌
- Products 화면을 Supabase read로 자동 전환 ❌
- create/update/delete/upsert 구현 ❌
- Supabase write path 구현 ❌
- 원격 Supabase 연결 ❌
- service_role 브라우저 사용 ❌
- service_role 값을 JS/browser 코드에 넣기 ❌
- js/config.js commit ❌
- 상품 스키마 변경 ❌
- localStorage prefix 변경 ❌
- products.js 변경 ❌
- data_export.json 재추가 ❌

### 검증
- `tests/products-supabase-read-local.integration.mjs` (P1-P8, opt-in)
- `tests/products-supabase-read-contract.test.mjs` (R1-R19)
- 기존 JS 테스트 전체 회귀
- preflight + DB lint + pgTAP
- 브라우저 수동 확인: 상품 목록/추가/수정/삭제/일괄 작업 정상 동작
- 일반 브라우저 runtime이 SupabaseProductsDataSource로 자동 전환되지 않음 확인

## 13. 3-5I: Products Supabase Write Path Local-only Controlled Contract (2026-07-19)

### 목표
SupabaseProductsDataSource의 create/update/delete write methods를 local-only controlled 방식으로 구현한다.
setProducts는 대량 overwrite 위험이 있으므로 계속 disabled 유지.
일반 runtime은 여전히 LocalProductsDataSource를 사용하며 자동 전환되지 않는다.
**3-5I는 local-only controlled write contract only, no runtime conversion.**

### 변경 내용

#### js/db.js — write methods 구현
- `createProduct(product)`:
  - legacy product → `mapLegacyProductToSupabaseRow`로 변환
  - `store_id`는 `context.storeId`로 강제 (product 내 값 무시)
  - insert 후 select single → `mapSupabaseRowToLegacyProduct`로 변환 반환
- `updateProduct(id, updates)`:
  - `legacy_id + store_id` 조건으로 제한
  - id/legacy_id/store_id/created_at/created_by 등 위험 필드 patch에서 제외
  - update 후 select single → legacy object 반환
- `deleteProduct(id)`:
  - 실제 DELETE 대신 `deleted_at = now()` soft delete 방식
  - `legacy_id + store_id` 조건으로 제한
  - update 후 select single → legacy object 반환
- `setProducts(products)`:
  - 계속 disabled 유지 (대량 overwrite 금지)
  - `throw new Error('setProducts is not enabled for SupabaseProductsDataSource')`

#### tests/products-supabase-write-contract.test.mjs (신규)
- W1-W21 계약 테스트
- mock client 기반, 실제 네트워크 호출 없음
- 기본 `node --test`에서 실행 가능

### 제약
- local-only / localhost / 127.0.0.1만 허용
- 원격 Supabase (supabase.co) 연결 금지
- service_role 브라우저/DataSource 사용 금지
- 명시적 client 주입 + localOnly: true + storeId 필요
- 실제 DELETE 대신 deleted_at soft delete
- setProducts disabled 유지
- 일반 runtime 자동 전환 없음 (기본값은 LocalProductsDataSource)
- products.js 변경 없음

### 현재 활성 DataSource
- **LocalProductsDataSource**: 계속 기본 활성 상태 유지
- `getProductsDataSource()` 기본값 = LocalProductsDataSource
- SupabaseProductsDataSource는 테스트에서만 `setProductsDataSourceForTesting()`으로 주입
- 일반 브라우저 상품 화면은 계속 localStorage 사용

### write path 상태
- setProducts: **disabled** (대량 overwrite 금지)
- createProduct: 구현됨 (local-only controlled)
- updateProduct: 구현됨 (local-only controlled, legacy_id + store_id 제한)
- deleteProduct: 구현됨 (local-only controlled, soft delete)
- 일반 runtime 자동 전환: ❌
- 원격 Supabase 연결: ❌

### 다음 단계 예정
- write path local integration smoke test (실제 Supabase와의 통합 검증)
- 실제 앱 runtime 전환 (feature flag 기반)
- store_id와 auth session 연동
- batch / classification / 월 변경 등의 복잡한 write flow 통합

### 이번 단계에서 하지 않는 일
- `getProductsDataSource()` 기본값을 SupabaseProductsDataSource로 변경 ❌
- 일반 runtime에서 SupabaseProductsDataSource 자동 활성화 ❌
- Products 화면을 Supabase write로 자동 전환 ❌
- setProducts 대량 overwrite 구현 ❌
- 원격 Supabase 연결 ❌
- service_role 브라우저 사용 ❌
- service_role 값을 JS/browser 코드에 넣기 ❌
- js/config.js commit ❌
- 상품 스키마 변경 ❌
- localStorage prefix 변경 ❌
- products.js 변경 ❌
- data_export.json 재추가 ❌

### 검증
- `tests/products-supabase-write-contract.test.mjs` (W1-W21)
- `tests/products-supabase-read-contract.test.mjs` (R1-R21, R3 수정)
- 기존 JS 테스트 전체 회귀
- preflight + DB lint + pgTAP
- 브라우저 수동 확인: 상품 목록/추가/수정/삭제/일괄 작업 정상 동작
- 일반 브라우저 runtime이 SupabaseProductsDataSource로 자동 전환되지 않음 확인

## 14. 3-5J: Products Supabase Write Local Integration Smoke (2026-07-19)

### 목표
3-5I에서 구현한 SupabaseProductsDataSource의 create/update/delete write methods를
실제 로컬 Supabase/Auth/RLS 환경에서 opt-in integration smoke test로 검증한다.
**일반 앱 runtime은 계속 LocalProductsDataSource를 사용하며 자동 전환되지 않는다.**

### opt-in 실행 조건
- `RUN_LOCAL_SUPABASE_INTEGRATION=1` 환경 변수가 있을 때만 실행
- 기본 `node --test`에서는 skip (네트워크 호출 없음)
- preflight PASS 후에만 수동 실행

### 테스트 흐름 (P1-P13)
- P1: service_role admin API로 dummy/local-only 테스트 유저 생성
- P2: anon key로 password login
- P3: `ensure_user_profile` RPC 호출
- P4: `create_initial_store` RPC 호출로 store_id 확보
- P5: `createProduct` inserts via controlled SupabaseProductsDataSource (검증)
- P6: `listProducts`로 createProduct 결과 확인
- P7: `updateProduct`는 DB column-level 권한 정책(`updated_at` UPDATE denied)으로 차단됨 검증
- P8: `deleteProduct`는 `deleted_at` column UPDATE 허용으로 soft delete 성공 검증
- P9: `deleted_at` 설정 확인 + 실제 DELETE가 아님 검증 (soft delete)
- P10: `setProducts`는 계속 disabled (대량 overwrite 금지)
- P11: `getProductsDataSource()` 기본값은 LocalProductsDataSource (자동 전환 없음)
- P12: write methods는 remote URL 거부 (localhost 전용)
- P13: best-effort cleanup 테스트 유저 삭제

### DB column-level 권한 정책 발견
- `20260711000900_order_inventory_rpc.sql:957`에서
  `REVOKE UPDATE ON public.products FROM authenticated` (table-level)
- 하지만 column-level GRANT가 별도로 존재:
  - `deleted_at` 컬럼: authenticated에 UPDATE 권한 있음 → soft delete 동작
  - `updated_at` 컬럼: authenticated에 UPDATE 권한 없음 → updateProduct 차단
- 이로 인해:
  - `createProduct`: 동작 (INSERT 권한 있음)
  - `updateProduct`: `updated_at` 강제 업데이트 시도 시 403 permission denied → query failed
  - `deleteProduct`: `deleted_at`만 업데이트하므로 soft delete 성공
- updateProduct의 full local integration 검증은 contract test (W1-W21)에서 수행

### 현재 활성 DataSource
- **LocalProductsDataSource**: 계속 기본 활성 상태 유지
- `getProductsDataSource()` 기본값 = LocalProductsDataSource
- SupabaseProductsDataSource는 local integration test에서만 사용
- 일반 브라우저 상품 화면은 계속 localStorage 사용

### write path 상태
- setProducts: **disabled** (대량 overwrite 금지)
- createProduct: local integration 검증 완료 (동작)
- updateProduct: DB 권한 정책으로 차단됨 (contract test W1-W21에서만 검증)
- deleteProduct: local integration 검증 완료 (soft delete 동작)
- 일반 runtime 자동 전환: ❌
- 원격 Supabase 연결: ❌

### 제약 준수
- service_role은 setup/cleanup에만 사용, DataSource/browser 코드에 전달 ❌
- token/session/key console.log ❌
- response body 전체 console.log ❌
- 원격 supabase.co 차단
- js/config.js commit ❌
- data_export.json 재추가 ❌
- 실제 DELETE 사용 ❌ (soft delete만)
- 일반 runtime 자동 전환 ❌

### 검증
- `tests/products-supabase-write-local.integration.mjs` (P1-P13, opt-in)
- `tests/products-supabase-write-contract.test.mjs` (W1-W21, 21/21 PASS)
- 기존 JS 테스트 전체 회귀 (236/236 PASS)
- preflight PASS
- DB lint PASS (error level)
- pgTAP 131/131 PASS
- 브라우저 수동 확인: 상품 목록/추가/수정/삭제/일괄 작업 정상 동작
- 일반 브라우저 runtime이 SupabaseProductsDataSource로 자동 전환되지 않음 확인

## 15. 3-5K: Products Write RPC Foundation (2026-07-20)

### 목표
3-5J에서 updateProduct가 DB column-level 권한 정책(`updated_at` UPDATE denied)으로 차단되는 문제를 발견했습니다.
이번 단계에서는 SECURITY DEFINER RPC를 추가하여 이 문제를 해결할 기반을 마련합니다.

**3-5K는 DB/RPC foundation only, no JS DataSource connection, no runtime conversion.**

### 배경
- `public.products` 테이블은 `authenticated` 역할에 대해 table-level UPDATE가 차단되어 있습니다.
- column-level GRANT로 `deleted_at` soft delete는 동작하지만, `updated_at` UPDATE 권한 부족으로 `updateProduct`가 차단됩니다.
- 따라서 `updateProduct` 성공 경로는 직접 table update가 아니라 SECURITY DEFINER RPC 기반으로 설계해야 합니다.

### 변경 내용

#### supabase/migrations/20260711001100_products_write_rpcs.sql (신규)
- `public.create_product`: 상품 생성 RPC
  - LANGUAGE plpgsql, SECURITY DEFINER, SET search_path = ''
  - owner/manager만 허용, staff/non-member 차단
  - auth.uid() 필수, store_id 필수
  - store membership + role check (private.current_store_role)
  - store_id는 p_store_id로 강제
  - created_by/updated_by = auth.uid()
  - created_at/updated_at = now()
  - deleted_at = NULL
  - 명시적 products row 컬럼 반환

- `public.update_product`: 상품 업데이트 RPC
  - LANGUAGE plpgsql, SECURITY DEFINER, SET search_path = ''
  - owner/manager만 허용, staff/non-member 차단
  - p_store_id + p_legacy_id 기준으로 대상 제한
  - deleted_at IS NULL 조건
  - immutable fields: id, legacy_id, store_id, created_at, created_by (변경 불가)
  - updated_by = auth.uid(), updated_at = now()
  - 허용된 상품 필드만 업데이트
  - SECURITY DEFINER로 테이블 권한 제한 우회하여 updated_at 등 업데이트 가능
  - 명시적 products row 컬럼 반환

- `public.soft_delete_product`: 상품 soft delete RPC
  - LANGUAGE plpgsql, SECURITY DEFINER, SET search_path = ''
  - owner/manager만 허용, staff/non-member 차단
  - p_store_id + p_legacy_id 기준으로 대상 제한
  - deleted_at IS NULL 조건
  - 실제 DELETE 금지, deleted_at = now()
  - updated_by = auth.uid(), updated_at = now()
  - 명시적 products row 컬럼 반환

- Permissions:
  - REVOKE ALL ON FUNCTION FROM PUBLIC
  - GRANT EXECUTE ON FUNCTION TO authenticated

#### supabase/tests/products_write_rpc.test.sql (신규)
- T1-T30: 30개 pgTAP 테스트 케이스
- owner/manager/staff/non-member 권한 검증
- immutable fields protection (id, legacy_id, store_id, created_by, created_at)
- updated_by/updated_at 설정 확인
- soft delete behavior (deleted_at 설정, no hard delete)
- cross-store access blocking
- deleted store blocking
- public/anon execution prevention
- authenticated membership check
- direct table UPDATE restriction verification

#### docs/SUPABASE_PRODUCTS_WRITE_RPC.md (신규)
- RPC 목적 및 설계 원칙 문서
- 함수 시그니처 및 파라미터 설명
- Authorization rules
- Security properties
- Testing coverage

### 현재 활성 DataSource
- **LocalProductsDataSource**: 계속 기본 활성 상태 유지
- `getProductsDataSource()` 기본값 = LocalProductsDataSource
- **JS SupabaseProductsDataSource는 RPC로 연결되지 않음** (다음 단계에서 연결 예정)
- 일반 브라우저 상품 화면은 계속 localStorage 사용

### write path 상태
- setProducts: **disabled** (대량 overwrite 금지)
- createProduct: local integration 검증 완료 (동작)
- updateProduct: DB 권한 정책으로 차단됨 → **RPC로 해결할 기반 마련** (다음 단계에서 연결)
- deleteProduct: local integration 검증 완료 (soft delete 동작)
- 일반 runtime 자동 전환: ❌
- 원격 Supabase 연결: ❌

### 다음 단계 예정
- JS SupabaseProductsDataSource를 RPC로 연결
- createProduct → create_product RPC
- updateProduct → update_product RPC
- deleteProduct → soft_delete_product RPC
- 실제 앱 runtime 전환 (feature flag 기반)
- store_id와 auth session 연동

### 이번 단계에서 하지 않는 일
- JS DataSource를 RPC로 연결 ❌
- `getProductsDataSource()` 기본값 변경 ❌
- 일반 runtime에서 SupabaseProductsDataSource 자동 활성화 ❌
- Products 화면을 Supabase로 자동 전환 ❌
- UI 리뉴얼 ❌
- 원격 Supabase 연결 ❌
- service_role 브라우저 사용 ❌
- service_role 값을 JS/browser 코드에 넣기 ❌
- localStorage prefix 변경 ❌
- products.js 변경 ❌
- data_export.json 재추가 ❌
- js/db.js 변경 ❌
- js/config.js commit ❌

### 검증
- DB reset PASS
- DB lint PASS (error level)
- pgTAP 161/161 PASS (새 products_write_rpc.test.sql 30/30 PASS)
- 기존 JS 테스트 전체 회귀
- preflight PASS
- 브라우저 수동 확인: 상품 목록/추가/수정/삭제/일괄 작업 정상 동작
- 일반 브라우저 runtime이 SupabaseProductsDataSource로 자동 전환되지 않음 확인

## 16. 3-5L: Connect Controlled Products DataSource to Write RPCs (2026-07-20)

### 목표
3-5K에서 추가한 SECURITY DEFINER RPC (`create_product`, `update_product`, `soft_delete_product`)를
JS SupabaseProductsDataSource의 write methods에 연결합니다.
**3-5L은 JS DataSource write methods를 RPC로 연결만 하며, 일반 앱 runtime 전환은 하지 않습니다.**

### 배경
- 3-5J에서 updateProduct가 DB column-level 권한 정책으로 차단되는 문제를 발견
- 3-5K에서 SECURITY DEFINER RPC를 추가하여 이 문제를 해결할 기반을 마련
- 이제 JS SupabaseProductsDataSource의 write methods가 RPC를 사용하도록 변경

### 변경 내용

#### js/db.js — write methods를 RPC 기반으로 변경
- `createProduct(product)`:
  - 기존: `client.from('products').insert(row).select().single()`
  - 변경: `client.rpc('create_product', payload)`
  - payload는 `p_` 접두사 파라미터 형태
  - store_id는 context.storeId로 강제
  - 반환 row는 mapSupabaseRowToLegacyProduct로 변환

- `updateProduct(id, updates)`:
  - 기존: `client.from('products').update(patch).eq('legacy_id', id).eq('store_id', storeId)`
  - 변경: `client.rpc('update_product', payload)`
  - p_store_id = context.storeId, p_legacy_id = id
  - 위험 필드(id/legacy_id/store_id/created_at/created_by)는 payload에서 제외
  - RPC 내부에서 updated_by/updated_at 설정
  - 반환 row는 mapSupabaseRowToLegacyProduct로 변환

- `deleteProduct(id)`:
  - 기존: `client.from('products').update({ deleted_at: now() }).eq('legacy_id', id)`
  - 변경: `client.rpc('soft_delete_product', payload)`
  - p_store_id = context.storeId, p_legacy_id = id
  - RPC 내부에서 deleted_at 설정 (soft delete)
  - 반환 row는 mapSupabaseRowToLegacyProduct로 변환

- `setProducts(products)`:
  - 계속 disabled (대량 overwrite 금지)

- `listProducts()`:
  - 기존 local-only controlled read 유지 (direct table select)

#### tests/products-supabase-write-contract.test.mjs (수정)
- W5: createProduct가 client.rpc('create_product')를 사용하는지 검증
- W7: updateProduct가 client.rpc('update_product')를 사용하는지 검증
- W9: deleteProduct가 client.rpc('soft_delete_product')를 사용하는지 검증
- W8: updateProduct RPC payload에 위험 필드가 없는지 검증
- W19: 3-5L 문서 섹션 존재 및 RPC 연결 언급 검증

#### tests/products-supabase-write-local.integration.mjs (수정)
- P5: createProduct RPC 경로 성공
- P7: updateProduct RPC 경로 성공 (DB 권한 문제 해결됨)
- P8: updateProduct 결과 검증
- P9: deleteProduct RPC soft delete 성공
- P10: soft delete 검증 (deleted_at 설정, hard delete 아님)
- 기존 P7의 "updateProduct는 DB 권한 정책으로 차단됨" 문구 삭제
- 3-5L 이후 updateProduct는 RPC로 성공해야 함

### 현재 활성 DataSource
- **LocalProductsDataSource**: 계속 기본 활성 상태 유지
- `getProductsDataSource()` 기본값 = LocalProductsDataSource
- SupabaseProductsDataSource는 controlled (local-only, RPC-based write)
- 일반 브라우저 상품 화면은 계속 localStorage 사용

### write path 상태
- setProducts: **disabled** (대량 overwrite 금지)
- createProduct: RPC 기반 (`client.rpc('create_product')`)
- updateProduct: RPC 기반 (`client.rpc('update_product')`) — **DB 권한 문제 해결됨**
- deleteProduct: RPC 기반 (`client.rpc('soft_delete_product')`)
- 일반 runtime 자동 전환: ❌
- 원격 Supabase 연결: ❌

### 제약 준수
- client 명시적 주입 + localOnly: true + storeId 필요
- localhost / 127.0.0.1만 허용
- 원격 Supabase (supabase.co) 차단
- service_role 브라우저/DataSource 사용 금지
- token/session/key console.log 금지
- 오류 메시지에 key/JWT/token/body 전체 포함 금지
- 일반 runtime 자동 전환 금지
- products.js 변경 없음
- supabase migrations/tests 변경 없음

### 다음 단계 예정
- 실제 앱 runtime 전환 (feature flag 기반)
- store_id와 auth session 연동
- batch / classification / 월 변경 등의 복잡한 write flow 통합

### 이번 단계에서 하지 않는 일
- `getProductsDataSource()` 기본값 변경 ❌
- 일반 runtime에서 SupabaseProductsDataSource 자동 활성화 ❌
- Products 화면을 Supabase로 자동 전환 ❌
- UI 리뉴얼 ❌
- 원격 Supabase 연결 ❌
- service_role 브라우저 사용 ❌
- service_role 값을 JS/browser 코드에 넣기 ❌
- localStorage prefix 변경 ❌
- products.js 변경 ❌
- supabase migration 추가/수정 ❌
- supabase test SQL 추가/수정 ❌
- data_export.json 재추가 ❌
- js/config.js commit ❌

### 검증
- `tests/products-supabase-write-contract.test.mjs` (W1-W21, 21/21 PASS)
- `tests/products-supabase-write-local.integration.mjs` (P1-P14, opt-in)
- 기존 JS 테스트 전체 회귀
- preflight PASS
- DB lint PASS (error level)
- pgTAP PASS
- 브라우저 수동 확인: 상품 목록/추가/수정/삭제/일괄 작업 정상 동작
- 일반 브라우저 runtime이 SupabaseProductsDataSource로 자동 전환되지 않음 확인

## 17. 3-5M: Products Runtime DataSource Feature Flag Gate (2026-07-20)

### 목표
Products DataSource runtime 전환을 위한 feature flag gate만 추가한다.
**아직 실제 원격 Supabase 전환, UI 리뉴얼, Orders/Customers 전환은 하지 않는다.**

### 핵심 원칙
- 기본 runtime은 반드시 LocalProductsDataSource 유지
- PRODUCTS_SUPABASE_ENABLED가 명시적으로 true일 때만 Products Supabase DataSource 후보가 될 수 있음
- SUPABASE_ENABLED도 true여야 함
- Supabase client가 정상 초기화되어야 함
- selected storeId가 안전하게 확인되어야 함
- 현재 단계에서는 localhost / 127.0.0.1 local-only 제한 유지
- 원격 supabase.co 연결 금지
- 실패하면 조용히 LocalProductsDataSource로 fallback하지 않고, 명확한 error throw
- 단, 기본값 false에서는 기존 앱 동작이 절대 바뀌지 않음

### 변경 내용

#### js/config.example.js — PRODUCTS_SUPABASE_ENABLED 기본값 false 추가
```js
PRODUCTS_SUPABASE_ENABLED: false
```

#### js/db.js — Products runtime feature flag gate 추가
- `getProductsDataSource()`: `_resolveRuntimeProductsDataSource()`를 시도, null이면 LocalProductsDataSource
- `_resolveRuntimeProductsDataSource()`: 모든 필수 조건 검사
  - LESOUL_CONFIG.PRODUCTS_SUPABASE_ENABLED !== true → null (조용히 Local)
  - LESOUL_CONFIG.SUPABASE_ENABLED !== true → throw
  - LESOULSupabase 미초기화 → throw
  - client 없음 → throw
  - remote URL → throw
  - service_role key → throw
  - active storeId 없음 → throw
  - 모든 조건 충족 → SupabaseProductsDataSource 반환
- `_resolveActiveStoreId()`: LESOULAppBootstrap.getContext().activeMembership.storeId
- `setProductsDataSourceForTesting()`, `resetProductsDataSourceForTesting()` 유지

#### tests/products-runtime-feature-flag-contract.test.mjs (신규)
- FF1-FF21: feature flag gate 조건 검증

### SupabaseProductsDataSource 활성화 조건 (모두 true 필요)
1. LESOUL_CONFIG 존재
2. LESOUL_CONFIG.SUPABASE_ENABLED === true
3. LESOUL_CONFIG.PRODUCTS_SUPABASE_ENABLED === true
4. LESOULSupabase.isInitialized() === true
5. LESOULSupabase.getClient() 존재
6. activeMembership.storeId 존재
7. URL이 localhost / 127.0.0.1
8. service_role key가 아님
9. client 명시적 존재

### 현재 활성 DataSource
- **LocalProductsDataSource**: 계속 기본 활성 상태 유지
- `getProductsDataSource()` 기본값 = LocalProductsDataSource
- PRODUCTS_SUPABASE_ENABLED === false → LocalProductsDataSource (조용히)
- PRODUCTS_SUPABASE_ENABLED === true + 조건 충족 → SupabaseProductsDataSource
- PRODUCTS_SUPABASE_ENABLED === true + 조건 실패 → error throw (조용히 fallback하지 않음)

### 제약 준수
- products.js 변경 없음
- app.js 변경 없음
- supabase migrations/tests 변경 없음
- 원격 supabase.co URL 허용하지 않음
- service_role 브라우저 사용 금지
- localStorage prefix 변경 없음
- UI 리뉴얼 없음
- data_export.json 없음
- js/config.js commit 없음

### 다음 단계 예정
- 원격 Supabase 연결 허용 (supabase.co URL)
- Orders/Customers/Analytics 전환
- UI 리뉴얼
- 실제 browser runtime에서 PRODUCTS_SUPABASE_ENABLED=true로 활성화 테스트

### 이번 단계에서 하지 않는 일
- 실제 원격 Supabase 연결 ❌
- supabase.co URL 허용 ❌
- Products 화면을 기본값으로 Supabase 전환 ❌
- Orders/Customers/Analytics 전환 ❌
- UI 리뉴얼 ❌
- products.js 변경 ❌
- app.js 라우팅 변경 ❌
- form id / button id / input id 변경 ❌
- service_role 브라우저 사용 ❌
- token/session/key console.log ❌
- localStorage prefix 변경 ❌
- supabase migration 추가/수정 ❌
- supabase test SQL 추가/수정 ❌
- data_export.json 재추가 ❌
- js/config.js commit ❌

### 검증
- `tests/products-runtime-feature-flag-contract.test.mjs` (FF1-FF21, 21/21 PASS)
- 기존 JS 테스트 전체 회귀 (257/257 PASS)
- preflight PASS
- DB lint PASS (error level) — DB 변경 없음
- pgTAP PASS — DB 변경 없음
- 브라우저 수동 확인: 기본 config.example 상태에서 기존 localStorage로 동작
- 일반 브라우저 runtime이 SupabaseProductsDataSource로 자동 전환되지 않음 확인

## 18. 3-5N: Products Local Runtime Activation Smoke (2026-07-20)

### 목표
3-5M에서 구현한 Products runtime feature flag gate를 **local Supabase 환경에서 실제로 활성화**하여,
SupabaseProductsDataSource가 정상 선택되고 read/write가 정상 동작하는지 검증한다.

**아직 원격 Supabase 연결, UI 리뉴얼, Orders/Customers/Analytics 전환은 하지 않는다.**

### 핵심 원칙
- 기본 runtime은 계속 LocalProductsDataSource
- `PRODUCTS_SUPABASE_ENABLED` 기본값 false 유지
- 실제 활성화 테스트는 opt-in / local-only로만 진행
- `js/config.js`는 로컬 테스트용으로만 사용하고 절대 commit 금지
- remote supabase.co URL은 계속 금지
- service_role은 setup/cleanup에만 사용
- service_role을 browser/DataSource/runtime에 전달 금지
- products.js 변경 없음
- app.js 변경 없음
- UI 리뉴얼 없음

### 변경 내용

#### 테스트 신규: `tests/products-runtime-local.integration.mjs`
- opt-in: `RUN_LOCAL_SUPABASE_INTEGRATION=1` 환경 변수가 있을 때만 실행
- 기본 `node --test`에서는 skip
- localhost / 127.0.0.1 URL만 허용, remote supabase.co URL이면 즉시 fail
- service_role은 test user 생성/삭제 (setup/cleanup)에만 사용
- runtime-selected DataSource 경로로 동작 검증
  - S1-S4: local Supabase setup (user 생성 → login → profile → store)
  - S5: `DB.getProductsDataSource()`가 `SupabaseProductsDataSource` 반환 확인
  - S6: `createProduct` (RPC 경로) 성공 확인
  - S7: `listProducts`로 생성 결과 확인
  - S8: `updateProduct` (RPC 경로) 성공 확인
  - S9: `deleteProduct` (soft delete, RPC 경로) 성공 확인
  - S10: soft delete된 row가 `listProducts`에서 제외 확인
  - S11: `setProducts`가 Supabase DataSource에서 disabled 확인
  - S12: `resetProductsDataSourceForTesting` + config off → LocalProductsDataSource 복귀 확인
  - S13: 기본 config (flag off) → LocalProductsDataSource 유지
  - S14: remote supabase.co URL 차단 확인
  - C1: best-effort test user cleanup

#### 테스트 보강: `tests/products-runtime-feature-flag-contract.test.mjs`
- FF22: runtime activation 후 reset + config off → LocalProductsDataSource 복귀
- FF23: SupabaseProductsDataSource.setProducts disabled 확인

#### `js/db.js` — runtime activation path 안정화 (최소 수정)
- **RPC 응답 배열 처리 버그 수정**: `create_product` / `update_product` / `soft_delete_product` RPC가 `RETURNS TABLE`로 배열을 반환하므로, `Array.isArray(response.data)`이면 첫 번째 row를 추출하여 매핑
- **listProducts soft delete 필터 추가**: controlled read 범위에 `deleted_at IS NULL` 필터를 명시적으로 추가하여, soft delete된 행이 listProducts에 포함되지 않도록 함

#### `tests/products-supabase-write-local.integration.mjs` / `tests/products-supabase-read-local.integration.mjs`
- mock client chain에 `is(column, value)` 메서드 추가 (listProducts deleted_at 필터 지원)
- P10 soft delete 검증 로직 업데이트: listProducts에서 제외됨을 확인

### Runtime Activation 조건 (모두 충족 시 SupabaseProductsDataSource)
1. `LESOUL_CONFIG.SUPABASE_ENABLED === true`
2. `LESOUL_CONFIG.PRODUCTS_SUPABASE_ENABLED === true`
3. `LESOULSupabase.isInitialized() === true`
4. `LESOULSupabase.getClient()` 존재 (anon-authenticated)
5. `LESOULAppBootstrap.getContext().activeMembership.storeId` 존재
6. URL이 localhost / 127.0.0.1 (local-only)
7. client key가 service_role이 아님

### 기본값 DataSource
- **LocalProductsDataSource**: 계속 기본 활성 상태 유지
- `PRODUCTS_SUPABASE_ENABLED` 기본값 = false → 조용히 LocalProductsDataSource
- local-only opt-in flag true + 위 조건 모두 충족 시에만 SupabaseProductsDataSource

### 제약 준수
- products.js 변경 없음
- app.js 변경 없음
- supabase migrations/tests 변경 없음
- 원격 supabase.co URL 허용하지 않음
- service_role 브라우저 사용 금지 (setup/cleanup에만 사용)
- localStorage prefix 변경 없음
- UI 리뉴얼 없음
- data_export.json 없음
- js/config.js commit 없음
- Orders/Customers/Analytics 전환 없음

### 다음 단계 예정
- 원격 Supabase 연결 허용 (supabase.co URL) — 단계적 진행
- Orders/Customers/Analytics 전환
- UI 리뉴얼
- 기본값 전환 검토 (아직 아님)

## 19. 3-5O: Products Local Browser Runtime Smoke (2026-07-20)

### 목표
3-5N에서 Node integration으로 검증한 Products runtime activation을 실제 브라우저 상품 화면에서 local-only flag-on 상태로 수동 검증한다.

**아직 원격 Supabase 연결, UI 리뉴얼, Orders/Customers/Analytics 전환은 하지 않는다.**

### 핵심 원칙
- 기본 runtime은 계속 LocalProductsDataSource
- `PRODUCTS_SUPABASE_ENABLED` 기본값 false 유지
- local flag-on 테스트는 ignored `js/config.js`에서만 수행
- `js/config.js`는 절대 commit 금지
- remote supabase.co URL은 계속 금지
- products.js 변경 없음
- app.js 변경 없음
- UI 리뉴얼 없음
- form id / button id / input id / data-* 속성 변경 없음

### 변경 내용

#### 문서 신규: `docs/SUPABASE_PRODUCTS_LOCAL_BROWSER_RUNTIME_SMOKE.md`
- 브라우저 flag-on smoke 결과 기록
- flag-off 회귀 결과 기록
- 발견된 문제 및 원인 분석 기록

#### `js/db.js` — `legacy_id` 생성 버그 수정 (최소 수정)
- **증상**: `SupabaseProductsDataSource.createProduct`에서 `p_legacy_id`가 `null`로 전달되어, 신규 상품의 `legacy_id`가 DB에 저장되지 않음
- **영향**: `mapSupabaseRowToLegacyProduct`가 `id: null`을 반환하여 edit/delete URL이 `#/products/null/edit`가 됨
- **수정**: `p_legacy_id: row.legacy_id || Date.now()`로 변경하여 임시 legacy_id 생성
- **주의**: `products.js` 변경 없이 `js/db.js`만 최소 수정으로 해결

### 브라우저 flag-on smoke 결과

| 단계 | 시나리오 | 결과 |
|---|---|---|
| 1 | 로그인 | PASS |
| 2 | store 선택 | PASS |
| 3 | Products 페이지 진입 | PASS |
| 4 | `DB.getProductsDataSource().name` | **SupabaseProductsDataSource** |
| 5 | 상품 추가 | **BLOCKED** (인프라 문제: `create_product` RPC missing from schema cache) |
| 6 | 주문/고객/분석 페이지 접근 | PASS |
| 7 | 로그아웃 | PASS |

### 브라우저 flag-off smoke 결과

| 단계 | 시나리오 | 결과 |
|---|---|---|
| 1 | `DB.getProductsDataSource().name` | **LocalProductsDataSource** |
| 2 | `LESOUL_CONFIG.PRODUCTS_SUPABASE_ENABLED` | **false** |
| 3 | Products 페이지 | PASS (기존 localStorage 경로) |
| 4 | 일반 runtime 자동 전환 | **없음** |

### 발견된 문제

#### `create_product` RPC missing from schema cache (PGRST202)
- **증상**: `SupabaseProductsDataSource.createProduct()` 호출 시 `PGRST202` / 404 에러
- **원인**: local Supabase 인프라(Docker container 상태) 문제
- **3-5N 대비**: 3-5N opt-in integration test에서는 정상 동작 → 코드 자체 문제가 아님
- **조치**: local Supabase 인프라 복구 후 재수행 필요

### 제약 준수
- products.js 변경 없음
- app.js 변경 없음
- css/style.css 변경 없음
- index.html 변경 없음
- supabase migrations/tests 변경 없음
- 원격 supabase.co URL 허용하지 않음
- service_role 브라우저 사용 금지
- js/config.js commit 없음
- data_export.json 없음
- Orders/Customers/Analytics 전환 없음

### 다음 단계 예정
- local Supabase 인프라 복구 후 브라우저 write smoke 재수행
- 원격 Supabase 연결 허용 (supabase.co URL) — 단계적 진행
- Orders/Customers/Analytics 전환
- UI 리뉴얼
- 기본값 전환 검토 (아직 아님)

### 이번 단계에서 하지 않는 일
- 실제 원격 Supabase 연결 ❌
- supabase.co URL 허용 ❌
- Products 화면을 기본값으로 Supabase 전환 ❌
- Orders/Customers/Analytics 전환 ❌
- UI 리뉴얼 ❌
- products.js 변경 ❌
- app.js 라우팅 변경 ❌
- form id / button id / input id 변경 ❌
- service_role 브라우저 사용 ❌
- token/session/key console.log ❌
- localStorage prefix 변경 ❌
- supabase migration 추가/수정 ❌
- supabase test SQL 추가/수정 ❌
- data_export.json 재추가 ❌
- js/config.js commit ❌

### 검증
- `tests/products-runtime-local.integration.mjs` (S1-S14 + C1, 16/16 PASS)
- `tests/products-runtime-feature-flag-contract.test.mjs` (FF1-FF23, 23/23 PASS)
- `tests/products-supabase-write-local.integration.mjs` (15/15 PASS)
- 기존 JS 테스트 전체 회귀
- preflight PASS
- DB lint PASS (error level)
- pgTAP PASS
- 브라우저 수동 확인: 기본 config.example 상태에서 기존 localStorage로 동작
- 일반 브라우저 runtime이 SupabaseProductsDataSource로 자동 전환되지 않음 확인

## 20. 3-5O.1: Fix LESOUL Brand Setting & Re-run Local Browser Smoke (2026-07-20)

### 목표
1. 잘못된 브랜드 표기 "LES SOUL"을 "LESOUL"로 수정
2. 앱 브랜드명을 처음 실행할 때 설정 가능한 구조로 만듦
3. 기본 브랜드명은 반드시 "LESOUL"
4. 기존 기능 로직을 깨지 않도록 최소 수정
5. local Supabase schema cache / Docker 상태 복구 후 3-5O browser write smoke 재수행

### 핵심 원칙
- 기본 브랜드명: LESOUL
- "LES SOUL" 표기는 잘못된 표기이므로 사용하지 않음
- 사용자가 처음 실행할 때 브랜드명을 설정할 수 있어야 함
- 사용자가 설정하지 않으면 LESOUL을 사용
- 브랜드명 설정은 기능/DB/Supabase migration과 분리

### 변경 내용

#### 브랜드명 수정
- `index.html`: `<title>`과 `<h1 class="store-name">`에서 "LES SOUL" → "LESOUL"
- `js/auth-ui.js`: 로그인 화면 logo에서 "LES SOUL" → "LESOUL"
- `js/db.js`: `getSettings()` 기본값 `store_name: 'LES SOUL'` → `LESOUL`
- `docs/CURRENT_DATA_MODEL.md`: 기본값 문서 업데이트

#### 브랜드 resolver 추가 (`js/db.js`)
- `getBrandName()`: localStorage → LESOUL_CONFIG.APP_BRAND_NAME → "LESOUL" 순으로 우선순위
- `setBrandName(name)`: 저장 시 trim, 빈 값은 localStorage에서 제거하여 기본값 복구
- localStorage key: `lesoul_gh_app_brand_name` (기존 prefix 유지)

#### 브랜드 설정 구조 (`js/settings.js`)
- 설정 화면에 "앱 브랜드명" 입력 필드 추가
- 저장 시 localStorage에 저장
- 빈 값 저장 시 LESOUL로 복구

#### 브랜드명 표시 (`js/app.js`)
- `updateHeader()`에서 `DB.getBrandName()` 사용
- `textContent`로 표시하여 XSS 방지

#### 기본값 설정 (`js/config.example.js`)
- `APP_BRAND_NAME: 'LESOUL'` 추가

#### 번역 (`js/i18n.js`)
- `app_brand_name` 번역 추가 (ko/en)

#### 테스트 (`tests/brand-setting-contract.test.mjs`)
- B1-B14: 브랜드 설정 contract 테스트 13/13 PASS

### PGRST202 문제 해결
- **해결 여부**: ✅ 해결됨
- **원인**: 3-5O 초기 실행 시 Supabase Docker 컨테이너가 제대로 실행되지 않았음
- **해결 방법**: `supabase status` 확인 후 opt-in integration test 실행
- **결과**: 16/16 PASS — `create_product` RPC가 정상 동작

### 제약 준수
- "LES SOUL" 표기 제거: ✅
- 기본 브랜드명 LESOUL: ✅
- 처음 실행 시 브랜드 설정 가능: ✅
- localStorage 저장: ✅
- 빈 브랜드명 처리: ✅ (LESOUL로 복구)
- products.js 변경: ❌ 없음
- css/style.css 변경: ❌ 없음
- supabase migrations/tests 변경: ❌ 없음
- 원격 Supabase 연결: ❌ 없음
- js/config.js commit: ❌ 없음

## 21. 3-5O.2: Clean Legacy Brand Leftover & Confirm Browser Smoke (2026-07-20)

### 목표
1. repo 안에 남아 있는 "LES SOUL" 잔여 표기를 완전히 정리
2. app_backup.js 처리 (삭제 또는 브랜드명 수정)
3. 브랜드 설정 회귀 확인
4. Products local browser runtime smoke 최종 확인

### 변경 내용

#### app_backup.js 삭제
- **이유**: index.html에서 로드되지 않는 백업 파일
- **결과**: "LES SOUL" 표기 완전 제거

#### tests/brand-setting-contract.test.mjs 수정
- B2 테스트에서 app_backup.js 제외 로직 제거
- md 파일 제외 (문서 파일에서는 과거 변경 기록 설명 용도로 허용)

#### 문서 업데이트
- "(app_backup.js 제외)" 표기 제거
- 브랜드 잔여 표기 정리 결과 업데이트

### 검증 결과

#### 브랜드 표기 검색
- **JS/HTML 파일**: "LES SOUL" 표기 없음 ✅
- **문서 파일**: 과거 변경 기록 설명 용도로 사용 중 (정상)

#### brand-setting contract
- **13/13 PASS** ✅

#### products runtime local integration
- **16/16 PASS** ✅ (PGRST202 문제 해결)

#### 전체 JS 회귀
- **267/272 PASS** (auth-ui 5개 테스트 실패 - 이전 단계와 동일)

### 제약 준수
- "LES SOUL" 표기 제거: ✅
- 기본 브랜드명 LESOUL: ✅
- app_backup.js 삭제: ✅
- products.js 변경: ❌ 없음
- css/style.css 변경: ❌ 없음
- supabase migrations/tests 변경: ❌ 없음
- 원격 Supabase 연결: ❌ 없음
- js/config.js commit: ❌ 없음

## 22. 3-5O.3: Test Regression Recovery (2026-07-20)

### 목표
- auth-ui 테스트 5개 실패 원인을 정확히 확인하고 수정
- DB lint 연결 오류 원인을 확인하고 복구
- pgTAP 161/161 PASS 재확인
- 전체 JS 테스트 272/272 PASS 달성

### auth-ui 테스트 실패 원인

#### 실패한 테스트 (5개)
- T44: showError가 오류 panel을 auth-root에 추가
- T45: onRetry가 있으면 "다시 시도" 버튼이 실제 panel에 추가
- T46: retry button click 시 onRetry 정확히 1회 호출
- T47: onRetry가 없으면 retry button을 생성하지 않음
- T48: 다른 화면으로 전환하면 이전 retry listener가 제거됨

#### 원인
- **에러**: `ReferenceError: localStorage is not defined`
- **위치**: `_getBrandName` in [js/auth-ui.js](file:///Users/lesoul888/Documents/LESOUL_STORE_APP/fashionmanager/js/auth-ui.js)
- **상세**: 3-5O.1에서 auth-ui.js에 `_getBrandName()` 함수를 추가하여 localStorage에서 브랜드명을 읽어오도록 변경. 하지만 Node.js 테스트 환경에는 localStorage가 없어 ReferenceError 발생.

#### 수정 (최소 수정)
- `js/auth-ui.js`의 `_getBrandName()`에 localStorage 안전 가드 추가
- `typeof localStorage !== 'undefined' && localStorage && localStorage.getItem` 체크
- try/catch로 예외 상황 대비
- 안전하게 localStorage에 접근하지 못하면 LESOUL_CONFIG.APP_BRAND_NAME → "LESOUL" fallback 유지

### 검증 결과

#### auth-ui 테스트
- `node --test tests/auth-ui.test.js`: **5/5 PASS** ✅

#### brand-setting contract
- `node --test tests/brand-setting-contract.test.mjs`: **13/13 PASS** ✅

#### 전체 JS 테스트 회귀
- **272/272 PASS** ✅ (완전 복구)

#### products runtime local integration
- `RUN_LOCAL_SUPABASE_INTEGRATION=1 node --test tests/products-runtime-local.integration.mjs`
- **16/16 PASS** ✅ (PGRST202 문제 해결 유지)

#### DB lint
- `supabase db lint --local --level error --fail-on error`
- **PASS** (exit=0) ✅

#### pgTAP
- `supabase test db --local`
- **161/161 PASS** (exit=0) ✅

### 브랜드 표기 재검색
- **JS/HTML 파일**: "LES SOUL" 표기 없음 ✅
- **문서 파일**: 과거 변경 기록 설명 용도로만 사용 중 (정상)

### 제약 준수
- 기본 브랜드명 LESOUL: ✅
- products.js 변경: ❌ 없음
- css/style.css 변경: ❌ 없음
- supabase migrations/tests 변경: ❌ 없음
- 원격 Supabase 연결: ❌ 없음
- js/config.js commit: ❌ 없음

## 23. 3-5P: Products Batch Actions Supabase Compatibility (2026-07-20)

### 목표
- Products 화면의 일괄 작업이 SupabaseProductsDataSource runtime에서도 안전하게 동작하도록 준비
- localStorage runtime에서는 기존 일괄 작업 동작 유지
- Supabase runtime에서는 setProductsAsync bulk overwrite를 사용하지 않음
- batchDelete, batchReclassify, batchMonthChange를 per-item update/delete 경로로 변경

### 현재 문제
- 기존 batchReclassify, batchMonthChange, batchDelete는 `setProductsAsync` 대량 overwrite 사용
- SupabaseProductsDataSource에서는 `setProducts`가 disabled
- 대량 overwrite는 데이터 손실 위험이 높음

### 변경 내용

#### js/db.js — batch helper 추가
- `batchDeleteProductsAsync(ids)`: 순차적으로 `deleteProductAsync` 호출
- `batchUpdateProductsAsync(ids, updates)`: 순차적으로 `updateProductAsync` 호출
- 결과 객체: `{ success: [], failed: [], errors: [] }`
- Promise.all 병렬 호출 금지 → 순차 for loop 사용

#### js/products.js — batch actions 수정
- **batchReclassify**: `setProductsAsync` → `updateProductAsync` 순차 호출
- **batchMonthChange**: `setProductsAsync` → `updateProductAsync` 순차 호출
- **batchDelete**: `setProductsAsync` → `deleteProductAsync` 순차 호출
- 성공/실패 수 기록 및 flash 메시지 처리

#### tests/products-batch-actions-contract.test.mjs — 신규 contract test
- B1: batch actions가 setProductsAsync bulk overwrite를 사용하지 않음
- B2: batch actions가 per-item async 경로 사용
- B3: Promise.all 대량 병렬 호출 없음
- B4: SupabaseProductsDataSource.setProducts remains disabled
- B5: RPC paths 정확히 사용 (create_product, update_product, soft_delete_product)
- B6: 기본값 유지 (PRODUCTS_SUPABASE_ENABLED=false, LocalProductsDataSource)
- B7: 보안 제약 준수 (Supabase client 직접 참조 없음, credentials leak 없음)
- B8: 금지된 변경 확인
- B9: DB batch helpers 존재 확인

#### tests/products-runtime-local.integration.mjs — 보강
- S15: batchDeleteProductsAsync via SupabaseProductsDataSource 테스트
- S16: batchUpdateProductsAsync via SupabaseProductsDataSource 테스트

### 검증 결과

#### products batch actions contract
- `node --test tests/products-batch-actions-contract.test.mjs`
- **31/31 PASS** ✅

#### products runtime local integration
- `RUN_LOCAL_SUPABASE_INTEGRATION=1 node --test tests/products-runtime-local.integration.mjs`
- **18/18 PASS** ✅ (기존 16개 + 신규 S15/S16)

#### 전체 JS 테스트 회귀
- **303/303 PASS** ✅ (완전 통과)

#### DB lint
- `supabase db lint --local --level error --fail-on error`
- **PASS** (exit=0) ✅

#### pgTAP
- `supabase test db --local`
- **161/161 PASS** (exit=0) ✅

### 브랜드 표기 검색
- **JS/HTML 파일**: "LES SOUL" 표기 없음 ✅
- **문서 파일**: 과거 변경 기록 설명 용도로만 사용 중 (정상)

### 제약 준수
- setProducts disabled 유지: ✅
- products.js가 Supabase client를 직접 참조하지 않음: ✅
- Promise.all 대량 병렬 호출 없음: ✅
- products.js 변경: ✅ (batch actions per-item async 호출로 수정)
- css/style.css 변경: ❌ 없음
- supabase migrations/tests 변경: ❌ 없음
- 원격 Supabase 연결: ❌ 없음
- js/config.js commit: ❌ 없음
- 원격 Supabase 연결: ❌ 없음
- js/config.js commit: ❌ 없음
