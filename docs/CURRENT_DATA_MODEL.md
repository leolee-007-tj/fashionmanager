# 현재 데이터 모델 분석서

> 본 문서는 실제 코드(`js/db.js`, 각 모듈 파일)에서 확인한 필드를 기준으로 작성됐다.
> 추정 내용은 "추정"으로 명시한다. 개인정보는 포함하지 않는다.

## 1. localStorage Key 전체 목록

### DB 계층을 거치는 키 (prefix: `lesoul_gh_`)

| Key | 데이터 타입 | 생성 위치 | 조회 위치 | 수정 위치 | 삭제 위치 | 초기값 | 예외 처리 |
|---|---|---|---|---|---|---|---|
| `lesoul_gh_products` | `Array<Product>` | db.js `setProducts` / products.js `submitForm` / excel.js `importProducts` | db.js `getProducts` (여러 모듈) | products.js `submitForm`, `batchReclassify`, `batchMonthChange` | products.js `delete`, `batchDelete`, db.js `clearAllData` | `[]` | JSON.parse 실패 시 `[]` |
| `lesoul_gh_orders` | `Array<Order>` | db.js `setOrders` / orders.js `submitAdd` / excel.js `importOrders` | db.js `getOrders` (여러 모듈) | orders.js `submitShip`, `cancel`, `complete`, `submitEdit`, customers.js `cleanupDuplicates` | orders.js `delete`, db.js `clearAllData` | `[]` | JSON.parse 실패 시 `[]` |
| `lesoul_gh_customers` | `Array<Customer>` | db.js `setCustomers` / customers.js `submitForm` / excel.js `importCustomers`, `importOrders` | db.js `getCustomers` (여러 모듈) | customers.js `recalculateAll`, `submitInlineEdit`, `submitForm` | customers.js `delete`, `cleanupDuplicates`, db.js `clearAllData` | `[]` | JSON.parse 실패 시 `[]` |
| `lesoul_gh_inventory_logs` | `Array<InventoryLog>` | db.js `setInventoryLogs` / orders.js `submitShip` (`addInventoryLog`) | db.js `getInventoryLogs` | (수정 메서드 없음) | db.js `clearAllData` (개별 삭제 없음) | `[]` | JSON.parse 실패 시 `[]` |
| `lesoul_gh_expenses` | `Array<Expense>` | db.js `setExpenses` / expenses.js `submitForm` | db.js `getExpenses` (expenses.js, analytics.js) | expenses.js `submitForm` (edit) | expenses.js `delete`, `batchDelete`, db.js `clearAllData` | `[]` | JSON.parse 실패 시 `[]` |
| `lesoul_gh_keywords` | `Array<Keyword>` | db.js `setKeywords` / `initDefaultKeywords` / app.js 키워드 추가 / excel.js `importKeywords` | db.js `getKeywords` (classification.js, app.js) | db.js `updateKeyword`, app.js 인라인 편집 | db.js `deleteKeyword`, app.js 삭제, `cleanupKeywordDuplicates` | (없으면 `initDefaultKeywords` 실행) | JSON.parse 실패 시 `null` → `initDefaultKeywords` |
| `lesoul_gh_settings` | `Object<Settings>` | db.js `setSettings` / settings.js `save` | db.js `getSettings` (여러 모듈) | settings.js `save` | (삭제 메서드 없음) | `{store_name:'LESOUL', store_subtitle:'Store Management', exchange_divisor:165, price_multiplier:3, fixed_addition:40, base_discount_rate:20}` | JSON.parse 실패 시 기본값 객체 |

### DB 계층을 거치지 않는 키 (직접 localStorage 접근)

| Key | 데이터 타입 | 생성 위치 | 조회 위치 | 수정 위치 | 삭제 위치 | 초기값 | 예외 처리 |
|---|---|---|---|---|---|---|---|
| `lesoul_gh_language` | `string` (`'ko'`/`'zh'`/`'en'`/`'ja'`) | i18n.js `setLanguage` | i18n.js 전역 `currentLang` (모듈 로드 시 1회) | i18n.js `setLanguage` | (삭제 없음) | `'ko'` | `localStorage.getItem` → `null`이면 `'ko'` |
| `lesoul_gh_live_rate` | `string` (JSON) `{rate:number, updated:string(ISO)}` | analytics.js `_ensureRate` | analytics.js `_fetchLiveExchangeRate` (캐시 폴백) | analytics.js `_ensureRate` | (삭제 없음, 만료 개념 없음) | (없음) | JSON.parse 실패 시 무시 (빈 catch) |

### ID 생성 방식

| 컬렉션 | ID 생성 방식 | 타입 | 비고 |
|---|---|---|---|
| products | `DB.getNextId('products')` = `Math.max(ids)+1` | `number` | 정수 |
| orders | `DB.getNextId('orders')` (UI) / `nextOrderId++` (excel) | `number` | 정수 |
| customers | `DB.getNextId('customers')` (UI) / `nextCustomerId++` (excel) | `number` | 정수 |
| inventory_logs | `DB.getNextId('inventory_logs')` | `number` | 정수 |
| expenses | `DB.getNextId('expenses')` / `e.id \|\| Date.now()+Math.random()` (변환 시) | `number` 또는 `number`(소수점) | `_convertExpenses`에서 소수점 ID 발생 가능 |
| keywords | `DB.getNextId('keywords')` (UI/addKeyword) / `i+1` (initDefault) / **`Date.now()+Math.random()`** (excel import) | `number` 또는 **`number`(소수점)** | **혼용 위험**: excel import 시 소수점 ID |

### 숫자 ID와 문자열 ID 비교 위치

| 위치 | 코드 | 문제 |
|---|---|---|
| db.js `deleteKeyword(id)` | `String(k.id) !== String(id)` | 문자열 비교 (안전) |
| customers.js `recalculateAll` | `String(o.customer_id) === String(c.id)` | 문자열 비교 (안전) |
| customers.js `cleanupDuplicates` | `String(o.customer_id) === String(c.id)` | 문자열 비교 (안전) |
| analytics.js `_getOrderCost` | `x.id === order.product_id \|\| x.id === Number(order.product_id)` | 숫자 비교 + Number 변환 (안전) |
| analytics.js `getProductRanking` | `x.id === pid \|\| x.id === Number(pid)` | 숫자 비교 + Number 변환 (안전) |
| analytics.js `getCustomerRanking` | `x.id === cid \|\| x.id === Number(cid)` | 숫자 비교 + Number 변환 (안전) |
| db.js `findDuplicateOrder` | `o.customer_id === customerId && o.product_id === productId` | **엄격 비교 (위험)**: 타입 불일치 시 매칭 실패 |
| db.js `findProductByBrandTitleCost` | `p.brand === brand && p.original_title === title` | 문자열 비교 (안전) |
| orders.js `submitAdd` | `p.id === productId` (productId는 parseInt 결과) | 숫자 비교 (안전) |

## 2. 컬렉션별 필드 분석

### 2.1 products

실제 코드에서 확인된 필드 (data_export.json 샘플 + products.js submitForm + excel.js importProducts 기준):

| 필드 | 타입 | 필수 | 기본값 | 생성 위치 | 비고 |
|---|---|---|---|---|---|
| `id` | number | 필수 | `getNextId` | db.js `addProduct` | 정수 |
| `product_code` | string | 필수 | `generateProductCode` | db.js `generateProductCode` | 'BRAND+3자리 숫자' (예: SYS001). 동일 브랜드 내 최대값+1 |
| `original_title` | string | 필수 | (없음) | products.js `submitForm`, excel.js | 상품명, 수정 불가 |
| `brand` | string | 필수 | (없음) | products.js, excel.js | 브랜드명 |
| `category` | string \| null | 선택 | `''` 또는 `null` | 자동분류, 수동 | 종류 |
| `color` | string \| null | 선택 | `''` 또는 `null` | 자동분류, 수동 | 색상 |
| `size` | string \| null | 선택 | `''` 또는 `null` | 자동분류, 수동 | 사이즈 |
| `material` | string \| null | 선택 | `''` 또는 `null` | 자동분류, 수동 | 소재 |
| `korea_cost` | number | 필수 | (없음) | products.js, excel.js | 한국 매입 원가 (KRW) |
| `actual_converted_cost` | number | 필수 | `PriceCalculator.calculate` | price-calculator.js | `Math.round(korea_cost / exchange_divisor)` |
| `china_base_price` | number | 필수 | `PriceCalculator.calculate` | price-calculator.js | `Math.round(actual_converted_cost * price_multiplier + fixed_addition)` |
| `current_stock` | number | 필수 | `0` | products.js, excel.js | 현재 재고 |
| `reserved_stock` | number | 필수 | `0` | products.js | 예약 재고 (주문 시 증가, 출고/취소 시 감소) |
| `stock_year` | number | 필수 | `new Date().getFullYear()` | products.js, excel.js | 입고 년도 |
| `stock_month` | number | 필수 | `new Date().getMonth()+1` | products.js, excel.js | 입고 월 |
| `image` | string \| null | 선택 | `null` | products.js (아바타 업로드) | Base64 인코딩 이미지 (추정) |
| `notes` | string | 선택 | `''` | products.js | 메모 |
| `title_language` | string | 선택 | `detectLanguage` 결과 | classification.js | 'ko'/'zh'/'en'/'mixed_*' |
| `normalized_title` | string | 선택 | title과 동일 | products.js | 정규화 제목 (현재는 원본과 동일) |
| `classification_status` | string | 선택 | (자동분류 결과) | classification.js | 'auto_complete'/'needs_review'/'failed'/'pending'. **data_export.json에만 존재, UI 생성 시 저장 안 함** |
| `created_at` | string(ISO) | 필수 | `new Date().toISOString()` | db.js `addProduct` | 생성 시각 |
| `updated_at` | string(ISO) | 필수 | `new Date().toISOString()` | db.js `updateProduct`, 자동분류 | 수정 시각 |

**사용되지 않는 필드 (요구사항에 언급됐으나 코드에 없음)**:
- `initial_stock`: 코드 어디에도 존재하지 않음. 초기 재고는 `current_stock`으로 직접 설정

### 2.2 customers

| 필드 | 타입 | 필수 | 기본값 | 생성 위치 | 비고 |
|---|---|---|---|---|---|
| `id` | number | 필수 | `getNextId` | db.js `addCustomer` | 정수 |
| `name` | string | 필수 | (없음) | customers.js, excel.js | 고객명 (case-insensitive 비교) |
| `wechat_nickname` | string | 선택 | `''` | customers.js, excel.js | 위챗 닉네임 |
| `phone` | string | 선택 | `''` | customers.js, excel.js | 전화번호 |
| `email` | string | 선택 | (없음) | (UI에서 입력 가능, 코드에서 참조만) | 이메일. **applyFilters에서 참조하지만 생성 시 설정 안 함** |
| `address` | string | 선택 | `''` | customers.js, excel.js | 주소 |
| `notes` | string | 선택 | `''` | customers.js, excel.js | 메모 |
| `total_amount` | number | 집계 | `0` | customers.js `recalculateAll` | 누적 구매 금액. **저장됨** (매번 계산 아님) |
| `total_profit` | number | 집계 | `0` | customers.js `recalculateAll` | 누적 수익. **저장됨** |
| `order_count` | number | 집계 | `0` | customers.js `recalculateAll` | 주문 수. **저장됨** |
| `total_quantity` | number | 집계 | `0` | customers.js `recalculateAll` | 총 수량. **저장됨** |
| `last_order_date` | string \| null | 집계 | `null` | customers.js `recalculateAll` | 최근 주문일. **저장됨** |
| `level` | string | 선택 | `'normal'` | excel.js `importOrders`, `importCustomers` | 'normal'/'bronze'/'silver'/'gold'/'vip'. **UI 생성 시 설정 안 함, getLevel()로 동적 계산** |
| `created_at` | string(ISO) | 필수 | `new Date().toISOString()` | db.js `addCustomer` | 생성 시각 |
| `updated_at` | string(ISO) | 선택 | (excel.js에서만 설정) | excel.js | 수정 시각. **db.js `updateCustomer`는 updated_at 설정 안 함** |

**집계값 저장 vs 계산**:
- `total_amount`, `total_profit`, `order_count`, `total_quantity`, `last_order_date`: **저장됨** (`recalculateAll`에서 `DB.setCustomers` 호출)
- `level`: 저장되지만 UI에서는 `getLevel(total_amount)`로 동적 계산 (저장값과 다를 수 있음)

### 2.3 orders

| 필드 | 타입 | 필수 | 기본값 | 생성 위치 | 비고 |
|---|---|---|---|---|---|
| `id` | number | 필수 | `getNextId` | db.js `addOrder` | 정수 |
| `order_number` | string | 필수 | `'ORD-0001'` (UI) / `'SAL-0001'` (excel) | orders.js `submitAdd`, excel.js | 판매 번호. UI는 ORD-, 엑셀은 SAL- 접두사 |
| `customer_id` | number | 필수 | (없음) | orders.js, excel.js | 고객 ID |
| `customer_name` | string | 선택 | (없음) | excel.js `importOrders` | **UI 생성 시 저장 안 함**, 엑셀 임포트 시에만 저장. customers.js에서 이름 매칭에 사용 |
| `product_id` | number | 필수 | (없음) 또는 `0` | orders.js, excel.js | 상품 ID. **엑셀 임포트 시 상품 매칭 실패하면 0** |
| `brand` | string | 선택 | `''` | excel.js | 브랜드. **UI 생성 시 저장 안 함** |
| `product_name` | string | 선택 | (없음) | excel.js | **data_export.json에 존재하지만 UI/excel 생성 시 저장 안 함** |
| `color` | string | 선택 | `''` | orders.js, excel.js | 색상 |
| `size` | string | 선택 | `''` | orders.js, excel.js | 사이즈 |
| `quantity` | number | 필수 | (없음) | orders.js, excel.js | 수량. **엑셀 임포트 시 항상 1** |
| `selling_price` | number | 필수 | (없음) | orders.js, excel.js | 최종 흥정가 (CNY) |
| `actual_converted_cost_at_sale` | number | 선택 | (설정 안 함) | **코드 어디에서도 설정 안 함** | 판매 당시 원가 스냅샷. **data_export.json에만 존재 (Flask에서 가져온 데이터)**. `_getOrderCost`에서 우선 사용 |
| `china_cost_at_sale` | number | 선택 | (설정 안 함) | **코드 어디에서도 설정 안 함** | 판매 당시 중국 원가 스냅샷. **data_export.json에만 존재**. `_getOrderCost`에서 2순위 사용 |
| `actual_profit` | number | 필수 | `0` (UI) / 계산값 (excel) | orders.js `submitShip`, excel.js | 실제 수익. **UI는 출고 시 계산, 엑셀은 임포트 시 계산** |
| `actual_profit_margin` | number | 선택 | `0` | orders.js `submitShip`, excel.js | 수익률 (%) |
| `actual_cost_ratio` | number | 선택 | `0` | orders.js `submitShip`, excel.js | 원가율 (%) |
| `status` | string | 필수 | `'PENDING'` (UI) / `'COMPLETED'` (excel) | orders.js, excel.js | 'PENDING'/'SHIPPED'/'COMPLETED'/'CANCELLED' |
| `order_date` | string | 필수 | `new Date().toISOString().slice(0,10)` | orders.js, excel.js | 판매일 (YYYY-MM-DD) |
| `ship_date` | string \| null | 선택 | `null` | orders.js `submitShip`, excel.js | 출고일. **UI는 출고 시 오늘 날짜, 엑셀은 엑셀 데이터** |
| `shipping_company` | string | 선택 | `''` | orders.js `submitShip`, excel.js | 택배사 |
| `tracking_number` | string | 선택 | `''` | orders.js `submitShip`, excel.js | 운송장번호 |
| `is_zi_liu` | boolean | 선택 | (설정 안 함) | excel.js | 자유(自留) 여부. **UI 생성 시 설정 안 함** |
| `created_at` | string(ISO) | 필수 | `new Date().toISOString()` | db.js `addOrder` | 생성 시각 |
| `updated_at` | string(ISO) | 선택 | (excel.js에서만 설정) | excel.js | 수정 시각. **db.js `updateOrder`는 updated_at 설정 안 함** |

**판매 당시 원가 보존 분석**:
- **GitHub Pages 앱의 자체 생성 경로(submitAdd, submitShip, importOrders)는 원가 스냅샷을 저장하지 않음**
- `actual_converted_cost_at_sale`, `china_cost_at_sale` 필드는 data_export.json(Flask에서 내보낸 데이터)에만 존재
- `_getOrderCost()`는 스냅샷이 있으면 사용, 없으면 `product.actual_converted_cost`(현재값) 참조
- **위험**: 상품 원가가 설정 변경/재계산으로 바뀌면, 스냅샷 없는 주문의 수익이 왜곡됨. 단, `actual_profit`은 출고 시점에 계산되어 저장되므로 저장된 수익값 자체는 보존됨

### 2.4 inventory_logs

| 필드 | 타입 | 필수 | 기본값 | 생성 위치 | 비고 |
|---|---|---|---|---|---|
| `id` | number | 필수 | `getNextId` | db.js `addInventoryLog` | 정수 |
| `product_id` | number | 필수 | (없음) | orders.js `submitShip` | 상품 ID |
| `order_id` | number | 선택 | (없음) | orders.js `submitShip` | 주문 ID. **연결 필드** |
| `type` | string | 필수 | (없음) | orders.js | 'OUT' (현재 코드에서는 OUT만 사용) |
| `quantity` | number | 필수 | (없음) | orders.js | 변경 수량 (음수, 예: -1) |
| `reason` | string | 선택 | (없음) | orders.js | 사유 (예: '출고') |
| `created_at` | string(ISO) | 필수 | `new Date().toISOString()` | db.js `addInventoryLog` | 생성 시각 |

**주문 연결**: `order_id` 필드로 주문과 연결. **수정/삭제 메서드 없음** (추가만 가능)
**변경 전후 재고**: 저장하지 않음 (현재 재고는 product에서만 추적)

### 2.5 expenses (이중 스키마)

#### 신형 스키마 (expenses.js에서 사용)

| 필드 | 타입 | 필수 | 기본값 | 생성 위치 | 비고 |
|---|---|---|---|---|---|
| `id` | number | 필수 | `getNextId` | db.js `addExpense` | 정수 |
| `expense_date` | string | 필수 | `new Date().toISOString().slice(0,10)` | expenses.js | 날짜 (YYYY-MM-DD) |
| `category` | string | 필수 | (없음) | expenses.js | '교통비'/'식비'/'숙박비'/'배송비'/'포장재'/'기타' |
| `amount` | number | 필수 | (없음) | expenses.js | 금액 (CNY) |
| `description` | string | 선택 | `''` | expenses.js | 설명 |
| `created_at` | string(ISO) | 필수 | `new Date().toISOString()` | db.js `addExpense` | 생성 시각 |

#### 구형 스키마 (data_export.json에 존재, `_convertExpenses`로 변환 대상)

| 필드 | 타입 | 비고 |
|---|---|---|
| `id` | number | |
| `year` | number | 연도 |
| `month` | number | 월 |
| `expense_date` | string | (구형에도 존재 가능) |
| `total_expense` | number | 총경비 (참고용, 변환 시 사용 안 함) |
| `logistics_cost` | number | 물류비 |
| `flight_cost` | number | 비행기 |
| `hotel_cost` | number | 호텔 |
| `stay_cost` | number | 체류비 |
| `electricity_cost` | number | 전기세 |
| `rent_cost` | number | 월세 |
| `other_cost` | number | 기타 |
| `notes` | string | 메모 → `description`으로 변환 |
| `created_at` | string(ISO) | |

**변환 로직** (`_convertExpenses`):
- `amount`가 숫자이고 `expense_date`가 있으면 그대로 유지 (신형)
- `year`+`month`가 있으면 각 비용 항목을 합산하여 `amount`로 변환, `expense_date`는 `{year}-{month}-01`로 생성
- `amount`가 0이거나 숫자가 아니면 **필터링됨 (데이터 손실)**
- `id`가 없으면 `Date.now() + Math.random()` (소수점 ID)

### 2.6 keywords (이중 스키마)

#### 스키마 A: db.js `initDefaultKeywords` + db.js `addKeyword` (구형)

| 필드 | 타입 | 비고 |
|---|---|---|
| `id` | number | 정수 (i+1 또는 getNextId) |
| `type` | string | 'brand'/'category'/'color'/'size'/'material' |
| `standard` | string | 표준값 |
| `ko` | string | 쉼표로 구분된 키워드 |
| `zh` | string | 쉼표로 구분된 키워드 |
| `en` | string | 쉼표로 구분된 키워드 |
| `other_aliases` | string | 기타 별칭 |
| `priority` | number | 우선순위 |
| `is_active` | boolean | 사용 여부 |
| `created_at` | string(ISO) | |

#### 스키마 B: classification.js `initDefaultKeywords` + excel.js `importKeywords` (신형)

| 필드 | 타입 | 비고 |
|---|---|---|
| `id` | number | 정수 (classification) 또는 **소수점 (excel: Date.now()+Math.random())** |
| `classification_type` | string | 'brand'/'category'/'color'/'size'/'material' |
| `standard_value` | string | 표준값 |
| `ko_keywords` | string \| Array | 쉼표 문자열 (classification) 또는 배열 (excel) |
| `zh_keywords` | string \| Array | |
| `en_keywords` | string \| Array | |
| `ja_keywords` | string \| Array | |
| `other_aliases` | string | |
| `priority` | number | |
| `is_active` | boolean | classification / **`active` (excel, 필드명 다름)** |
| `created_at` | string(ISO) | |

**classification.js `matchKeyword`의 호환성 처리**:
- `kw.ko_keywords || kw.ko` (둘 다 지원)
- `kw.classification_type || k.type` (둘 다 지원)
- 단, `is_active` vs `active` 필드명 차이는 classification.js에서 `k.is_active !== false`로 확인 (excel import의 `active: true`는 무시됨, 기본값 true로 간주)

### 2.7 settings

| 필드 | 타입 | 필수 | 기본값 | 비고 |
|---|---|---|---|---|
| `store_name` | string | 필수 | `'LESOUL'` | 매장명 |
| `store_subtitle` | string \| object | 필수 | `'Store Management'` 또는 `{ko,zh,en,ja}` | 부제목. **문자열이거나 다국어 객체일 수 있음** |
| `exchange_divisor` | number | 필수 | `165` | 환율 나눗수 (KRW→CNY) |
| `price_multiplier` | number | 필수 | `3` | 판매가 배수 |
| `fixed_addition` | number | 필수 | `40` | 고정 추가금 (CNY) |
| `base_discount_rate` | number | 선택 | `20` | 기본 할인율. **코드에서 사용되지 않음** (price-calculator.js에서 참조 안 함) |

## 3. 데이터 관계 분석

### 3.1 products ↔ orders

- **관계**: 1:N (한 상품에 여러 주문)
- **참조 방향**: orders.`product_id` → products.`id`
- **참조 무결성 검사**: 
  - orders.js `submitAdd`: `DB.getProducts().find(p => p.id === productId)`로 존재 확인 (있어야 생성)
  - excel.js `importOrders`: 상품 매칭 실패 시 `product_id: 0`으로 저장 (참조 무결성 위반)
- **삭제 시 동작**:
  - product 삭제 시 연결된 order 처리: **아무 처리 없음** (order.product_id가 orphan 됨)
- **존재하지 않는 product_id 처리**:
  - analytics.js `_getOrderCost`: product 찾기 실패 시 원가 0 반환
  - analytics.js `getProductRanking`: product 찾기 실패 시 title '-'
- **ID 비교**: 숫자 비교 (order.product_id는 number, product.id는 number). 단 excel import 시 0이 될 수 있음

### 3.2 customers ↔ orders

- **관계**: 1:N (한 고객에 여러 주문)
- **참조 방향**: orders.`customer_id` → customers.`id` (공식) + orders.`customer_name` → customers.`name` (비공식, 병용)
- **참조 무결성 검사**:
  - orders.js `submitAdd`: 고객 ID 또는 새 이름으로 고객 생성 (있어야 함)
  - excel.js `importOrders`: 고객 없으면 자동 생성
- **삭제 시 동작**:
  - customer 삭제 시 연결된 order 처리: **아무 처리 없음** (order.customer_id가 orphan 됨)
- **존재하지 않는 customer_id 처리**:
  - analytics.js `getCustomerRanking`: customer 찾기 실패 시 name '-'
  - customers.js `renderDetail`: customer 찾기 실패 시 처리 확인 필요
- **고객 병합 시 주문 연결**:
  - `cleanupDuplicates()`: 중복 고객의 주문 `customer_id`를保留 고객 ID로 변경. **customer_name 필드는 변경하지 않음** (이름 매칭이 case-insensitive이므로 호환됨)
- **이름 매칭**: `o.customer_name.toLowerCase() === c.name.toLowerCase()` (case-insensitive)

### 3.3 products ↔ inventory_logs

- **관계**: 1:N
- **참조 방향**: inventory_logs.`product_id` → products.`id`, inventory_logs.`order_id` → orders.`id`
- **생성**: orders.js `submitShip`에서만 생성 (type: 'OUT')
- **삭제 시 동작**:
  - product 삭제 시 연결된 inventory_log: **아무 처리 없음**
  - order 삭제 시 연결된 inventory_log: **아무 처리 없음**
- **수정/삭제**: inventory_log 자체의 수정/삭제 메서드 없음

### 3.4 orders ↔ inventory_logs

- **관계**: 1:1 (출고 시 1개 로그 생성)
- **참조 방향**: inventory_logs.`order_id` → orders.`id`
- **생성**: `submitShip`에서만. 취소/완료 시 로그 추가 없음
- **삭제 시 동작**: order 삭제 시 연결된 inventory_log: **아무 처리 없음**

### 3.5 expenses ↔ 월별 수익 분석

- **관계**: expenses는 analytics의 월별 순이익 계산에만 사용
- **조인 방식**: analytics.js `calculateMonthlyStats`에서 `expense_date`의 년/월로 필터링하여 합산
- **참조 무결성**: 없음 (독립 컬렉션)
- **이중 스키마 처리**: analytics.js에서 `amount`가 숫자면 그대로, 아니면 구형 항목 합산

### 3.6 keywords ↔ 상품 자동분류

- **관계**: keywords는 classification.js의 `classify()`에서만 사용
- **조인 방식**: `DB.getKeywords().filter(k => k.is_active !== false)` → 타입별 필터 → `matchKeyword`로 매칭
- **참조 무결성**: 없음 (keywords는 독립)
- **자동분류 결과 저장**: `autoClassifyAll`에서 product의 category/color/size/material 필드에 저장. keyword 자체는 변경 없음

### 3.7 settings ↔ 상품 가격 계산

- **관계**: settings의 exchange_divisor, price_multiplier, fixed_addition이 PriceCalculator에 사용
- **사용 위치**:
  - products.js `submitForm`: 상품 생성/수정 시 가격 계산
  - excel.js `importProducts`: 엑셀 임포트 시 가격 계산
  - settings.js `recalculateAll`: 모든 상품 가격 재계산
  - db.js `recalculateAllPrices`: 동일
- **설정 변경 영향**: 
  - 설정 변경 후 `recalculateAll` 실행하지 않으면 기존 상품의 actual_converted_cost, china_base_price는 갱신되지 않음
  - 단, 신규 상품 등록 시에는 새 설정이 적용됨

## 4. 과거 데이터 호환 구조

### 4.1 expenses 이중 스키마
- 구형: year/month + 개별 항목(logistics_cost, flight_cost, ...)
- 신형: expense_date + category + amount
- 변환 시점: `DB.importAllData()` 시 `_convertExpenses()` 호출
- 변환 조건: `amount`가 숫자가 아니거나 `expense_date`가 없으면 구형으로 간주
- **데이터 손실**: amount가 0이거나 숫자가 아니면 필터링됨

### 4.2 keywords 이중 스키마
- 구형 (db.js initDefault): type/standard/ko(str)/zh(str)/en(str)/is_active
- 신형 (classification.js initDefault, excel import): classification_type/standard_value/ko_keywords(str 또는 array)/is_active (또는 active)
- 호환 처리: classification.js `matchKeyword`에서 `||`로 둘 다 지원
- **변환 없음**: 두 스키마가 공존하며, 정규화되지 않음

### 4.3 orders 원가 스냅샷
- data_export.json(Flask 원본): `actual_converted_cost_at_sale`, `china_cost_at_sale` 포함
- GitHub Pages 자체 생성: 스냅샷 필드 없음 (undefined)
- 호환 처리: `_getOrderCost()`에서 undefined/null 체크 후 fallback

### 4.4 customer_id 타입 혼용
- UI 생성: number (DB.getNextId)
- excel import: number (nextCustomerId++)
- DB import: 원본 데이터 타입 유지 (number)
- 비교: `String(o.customer_id) === String(c.id)`로 안전 처리 (일부 위치)
- **위험 위치**: db.js `findDuplicateOrder`는 엄격 비교 (`===`)

## 5. JSON 파싱 실패 시 처리 방식

### DB.get(key, defaultValue)
```javascript
try {
    const data = localStorage.getItem(this.prefix + key);
    return data ? JSON.parse(data) : defaultValue;
} catch (e) {
    return defaultValue;  // JSON.parse 실패 시 조용히 defaultValue 반환
}
```
- 에러 로깅 없음
- 사용자에게 알림 없음
- 손상된 데이터는 무시되고 기본값으로 대체

### i18n.js `lesoul_gh_language`
- `localStorage.getItem` → `null`이면 `'ko'` (단순 문자열, JSON.parse 없음)

### analytics.js `lesoul_gh_live_rate`
```javascript
const cached = localStorage.getItem('lesoul_gh_live_rate');
if (cached) {
    try {
        const obj = JSON.parse(cached);
        // ...
    } catch (e) {}  // 조용히 무시
}
```
- 파싱 실패 시 195 기본값 사용

## 6. 확인 필요 항목

- customers.js `email` 필드: applyFilters에서 참조하지만, UI 폼/엑셀 임포트에서 생성하지 않음. 어디서 설정되는지 "확인 필요"
- orders.js `product_name` 필드: data_export.json에 존재하지만 UI/excel 생성 시 저장 안 함. 어디서 사용되는지 "확인 필요" (analytics.js getProductRanking은 product.original_title을 사용)
- customers.js `level` 필드: excel import 시 'normal'으로 저장, UI에서는 getLevel()로 동적 계산. 저장값과 계산값의 불일치 가능성 "확인 필요"
- inventory_logs `quantity` 음수 표현: -order.quantity로 저장. 재고 증가(IN) 로그는 현재 코드에서 생성되지 않음. "확인 필요: 입고 로그 기능이 계획됐는지"
