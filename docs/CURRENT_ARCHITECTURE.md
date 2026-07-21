# 현재 아키텍처 분석서

> 본 문서는 `feature/supabase-cloud-migration` 브랜치 기준으로 작성됐다.
> 추정 내용은 "추정"으로 명시하고, 확인하지 못한 내용은 "확인 필요"로 표시한다.
> 개인정보(고객명, 전화번호, 주소, 이메일)는 포함하지 않는다.
>
> **업데이트: 3-4B 단계 Feature-Flagged Authentication Gate UI 추가 (SUPABASE_ENABLED=false 기본)

## 1. 앱 구조 개요

| 항목 | 내용 |
|---|---|
| 앱 유형 | 정적 HTML/JS/CSS 단일 페이지 애플리케이션 (서버 백엔드 없음) |
| 호스팅 | GitHub Pages (`https://{username}.github.io/{repo}/`) |
| 데이터 저장 | 브라우저 localStorage (prefix: `lesoul_gh_`) |
| Supabase | **인증 게이트 연결 (feature flag false 기본, 원격 미연결)** |
| 라우팅 | Hash 기반 (`#/dashboard`, `#/products` 등) |
| 렌더링 | 동기식 HTML 문자열 반환 → `innerHTML` 주입 |
| 다국어 | 4개 언어 (ko, zh, en, ja), `i18n.js`에서 관리 |
| 빌드 단계 | 없음 (원본 파일 그대로 브라우저에서 실행) |

### 디렉터리 구조

```
github-pages-version/
├── index.html              # 진입점, 스크립트 로드 순서 정의
├── css/
│   └── style.css           # 전역 스타일 (보라색 그라데이션 테마)
├── js/
│   ├── i18n.js             # 다국어 번역 + 언어 상태
│   ├── db.js               # localStorage 접근 계층 (유일한 데이터 게이트웨이)
│   ├── price-calculator.js # 가격 계산 공식
│   ├── classification.js   # 키워드 기반 상품 자동분류 엔진
│   ├── products.js         # 상품 관리 (목록/등록/수정/삭제/분류)
│   ├── orders.js           # 판매 관리 (목록/등록/출고/취소/완료)
│   ├── customers.js        # 고객 관리 (목록/상세/병합/집계)
│   ├── analytics.js        # 수익 분석 (월별/연간/순위 + Chart.js)
│   ├── expenses.js         # 경비 관리
│   ├── excel.js            # Excel 가져오기/내보내기 (XLSX 라이브러리)
│   ├── settings.js         # 설정 (언어/매장/가격계산/백업)
│   ├── app.js              # 메인 앱 (라우터/렌더러/대시보드/분류키워드) — 자동 초기화 제거, window.App 노출
│   ├── app_backup.js       # ★ 사용되지 않음 (index.html에서 로드 안 함, 백업 파일)
│   ├── config.example.js   # ★ Supabase 설정 예제 (git tracked, index.html에서 로드) — LESOUL_CONFIG 가드 추가
│   ├── supabase-client.js  # ★ Supabase 클라이언트 어댑터 (index.html에서 로드, enabled 시에만 초기화)
│   ├── auth-service.js     # ★ 인증 서비스 (index.html에서 로드, enabled 시에만 초기화)
│   ├── auth-ui.js          # ★ 인증 UI 렌더러 (LESOULAuthUI, #auth-root에만 렌더링)
│   └── app-bootstrap.js    # ★ 인증 게이트 부트스트랩 (LESOULAppBootstrap, feature flag 기반 라우팅)
├── tests/
│   ├── supabase-client.test.js  # ★ Supabase 클라이언트 단위 테스트 (7개)
│   ├── auth-service.test.js     # ★ 인증 서비스 단위 테스트 (15개)
│   └── app-bootstrap.test.js    # ★ 인증 게이트 부트스트랩 단위 테스트 (14개)
├── data_export.json        # ★ 운영 데이터 덤프 (추정: Flask 원본 앱에서 내보낸 데이터)
├── docs/
│   ├── BASELINE_STATUS.md  # 0단계 기준 상태 문서
│   └── (본 문서들)
└── .gitignore              # 0단계에서 추가됨
```

**참고**: `config.js`는 `.gitignore`에 포함되어 있어 git에 추적되지 않는다.
실제 Supabase URL/key는 로컬에서 `js/config.js`에만 저장한다.

## 2. 파일별 역할

### `index.html` (133줄)
- 진입점 HTML. 모든 JS/CSS에 캐시 무효화용 버전 파라미터 `?v=20260712a` 적용
- 외부 CDN 3개 로드: Font Awesome 6.4.0, Chart.js, XLSX 0.18.5 (Supabase CDN은 직접 로드하지 않음)
- 9개 메뉴 사이드바: 대시보드, 상품, 판매, 고객, 수익분석, 경비관리, 분류키워드, Excel관리, 설정
- 헤더 언어 버튼 4개 (한국어/중국어/영어/일본어)
- **3-4B 추가**: `<div id="auth-root" class="auth-root" hidden></div>` (body 첫 번째)
- **3-4B 추가**: `#auth-context-badge`와 `#auth-logout-button` (header-right, 기본 hidden)
- 스크립트 로드 순서 (3-4C2 업데이트):
  1. 업무 스크립트: i18n → db → price-calculator → classification → products → orders → customers → analytics → expenses → excel → settings
  2. **3-4C2 추가**: js/config.js (optional local config, git ignored, 404 시 앱 실행 안 중단)
  3. config.example.js (git tracked, LESOUL_CONFIG 가드로 pre-injected config 보호)
  4. 인증 스크립트: supabase-client.js → auth-service.js → auth-ui.js
  5. app.js → app-bootstrap.js (항상 마지막)
- **3-4B 추가**: 마지막 인라인 스크립트에서 `LESOULAppBootstrap.start({})` 호출

### `js/i18n.js` (654줄)
- `TRANSLATIONS` 객체: 13개 섹션(nav, dashboard, products, orders, customers, analytics, expenses, inventory, classification, excel, settings, status, common)
- 전역 변수 `currentLang`: localStorage `lesoul_gh_language`에서 직접 읽음 (DB 계층 우회)
- `setLanguage(lang)`: localStorage에 저장 + `updateAllTranslations()` 호출
- `t(section, key)`: 번역 조회 (fallback: currentLang → ko → key)
- `updateAllTranslations()`: `data-i18n`, `data-i18n-section`, `data-i18n-placeholder`, `data-i18n-title` 속성 일괄 업데이트 + store_name/subtitle 적용 + `document.title` 동적 설정

### `js/db.js` (1157줄) ★ 핵심 데이터 계층
- `DB` 객체, `prefix: 'lesoul_gh_'`
- `get(key, defaultValue)`: `localStorage.getItem(prefix+key)` → JSON.parse, 실패 시 defaultValue
- `set(key, value)`: `JSON.stringify` 후 `localStorage.setItem`
- `getNextId(collection)`: `Math.max(...items.map(i => i.id)) + 1` (숫자 ID 자동 증가)
- 컬렉션별 getter/setter: products, orders, customers, inventory_logs, expenses, keywords, settings
- `addKeyword`, `updateKeyword`, `deleteKeyword`: 키워드 전용 CRUD (deleteKeyword는 `String(k.id) !== String(id)` 문자열 비교)
- `addProduct`, `updateProduct`, `deleteProduct`: 상품 CRUD
- `addOrder`, `updateOrder`, `deleteOrder`: 주문 CRUD
- `addCustomer`, `updateCustomer`, `deleteCustomer`: 고객 CRUD
- `addInventoryLog`: 재고 로그 추가 (삭제/수정 메서드 없음)
- `addExpense`, `updateExpense`, `deleteExpense`: 경비 CRUD
- `generateProductCode(brand, year, month)`: 브랜드 3자리 + 3자리 일련번호 (예: SYS001)
- `findProductByBrandTitleCost`, `findCustomerByName`, `findDuplicateOrder`: 조회 헬퍼
- `recalculateAllPrices()`: 모든 상품 가격 재계산
- **3-5P**: `batchDeleteProductsAsync(ids)`: per-item `deleteProductAsync` 순차 호출, `{ success, failed, errors }` 결과 반환
- **3-5P**: `batchUpdateProductsAsync(ids, updates)`: per-item `updateProductAsync` 순차 호출, `{ success, failed, errors }` 결과 반환
- **3-5A**: `asyncReady(methodName, ...args)`: Promise 호환 helper
- **3-5B**: `getProductsAsync()`: async boundary, `getProductsDataSource().listProducts()`
- **3-5C**: `addProductAsync()`, `updateProductAsync()`, `deleteProductAsync()`, `setProductsAsync()`: async boundary, DataSource 호출
- **3-5D**: `getProductsDataSource()`, `setProductsDataSourceForTesting()`, `resetProductsDataSourceForTesting()`: DataSource 관리
- **3-5D**: `_createLocalProductsDataSource()`: localStorage 기반 DataSource (기본값)
- **3-5L**: `_createControlledSupabaseProductsDataSource()`: Supabase RPC 기반 DataSource (feature flag enabled 시)
- **3-5E**: `mapLegacyProductToSupabaseRow()`, `mapSupabaseRowToLegacyProduct()`: 매핑 helper
- `exportAllData()` / `importAllData(data)`: 전체 백업/복원 (복원 시 `_convertExpenses`로 구형 경비 변환)
- `_convertExpenses(expenses)`: 구형 형식(year/month/개별 항목) → 신형 형식(expense_date/category/amount) 변환. amount가 0이거나 숫자가 아니면 필터링됨 (데이터 손실 위험)
- `clearAllData()`: 모든 컬렉션 빈 배열로 초기화 (settings는 제외)
- `initDefaultKeywords()`: 29개 기본 키워드 생성 (구형 스키마: type/standard/ko(str)/zh(str)/en(str))

### `js/price-calculator.js` (24줄)
- `calculate(koreaCost, settings)`:
  - `actual_converted_cost = Math.round(koreaCost / exchange_divisor)`
  - `china_base_price = Math.round(actual_converted_cost * price_multiplier + fixed_addition)`
- `calculateProfit(sellingPrice, actualConvertedCost, quantity=1)`:
  - `profit = Math.round((sellingPrice - actualConvertedCost) * quantity)`
  - `profit_margin = Math.round((profit / totalRevenue) * 100)`
  - `cost_ratio = Math.round((actualConvertedCost / sellingPrice) * 100)`

### `js/classification.js` (262줄)
- `ClassificationService` 객체
- `classifyProduct(product)`: 저장된 분류값 우선 사용, 없으면 실시간 분류
- `classify(title)`: 8개 타입(brand/category/color/size/material/season/fit/style) 키워드 매칭
  - 4개 이상 매칭: high, 2개 이상: medium, 그 외: low
- `detectLanguage(title)`: 한글/한자/알파벳 비율로 언어 감지 (ko/zh/en/mixed)
- `matchKeyword(title, keywords)`: priority 오름차순 정렬 후 ko/zh/en/ja/other_aliases/standard_value 검색 (소문자 비교)
- `initDefaultKeywords()`: 80개 확장 기본 키워드 (신형 스키마: classification_type/standard_value/ko(array)/zh(array)/en(array)/ja(array)/priority)

### `js/products.js` (688줄)
- `Products` 객체, `state`에 `loaded` 플래그 (검색 최적화)
- `load()`: 최초 1회만 실행. `autoClassifyAll()` + `applyFilters()`. **3-5B**: async boundary 적용, `await DB.getProductsAsync()` 사용
- `autoClassifyAll()`: 저장된 분류값이 없는 상품만 실시간 분류하여 DB 저장
- `applyFilters()`: stock_year/stock_month 필터 + 11개 필드 검색 + 정렬
- `batchReclassify()`: **3-5P**: per-item `DB.updateProductAsync()` 순차 호출 (setProductsAsync 대량 overwrite 제거). 성공/실패 수 기록, Promise.all 병렬 호출 금지
- `batchMonthChange()`: **3-5P**: per-item `DB.updateProductAsync()` 순차 호출 (setProductsAsync 대량 overwrite 제거). 성공/실패 수 기록, Promise.all 병렬 호출 금지
- `batchDelete()`: **3-5P**: per-item `DB.deleteProductAsync()` 순차 호출 (setProductsAsync 대량 overwrite 제거). 성공/실패 수 기록, Promise.all 병렬 호출 금지
- `submitForm(editId)`: 상품 등록/수정. `PriceCalculator.calculate()` 호출, `detectLanguage()` 저장. **3-5C**: async boundary 적용, `await DB.addProductAsync()` / `await DB.updateProductAsync()` 사용
- `generateProductCode`는 DB 계층에서 처리

### `js/orders.js` (737줄)
- `Orders` 객체, 날짜 파싱 헬퍼 3개 (`_parseOrderDate`, `_extractYearMonth`, `_formatOrderDate`) - 엑셀 일련번호 지원
- `load()`: DB에서 주문 로드 + 필터 적용 (loaded 플래그 없음 - 매 렌더링마다 로드)
- `submitAdd()`: 주문 생성 시 `reserved_stock` 증가, `actual_profit: 0`으로 초기 저장. **원가 스냅샷(actual_converted_cost_at_sale, china_cost_at_sale) 저장 안 함**
- `submitShip(id)`: 출고 처리. `current_stock` 감소, `reserved_stock` 감소, `actual_profit`/`actual_profit_margin`/`actual_cost_ratio` 계산 저장, `inventory_logs` 추가. **출고 시점 원가 스냅샷 저장 안 함** - `product.actual_converted_cost`를 사용해 profit 계산
- `cancel(id)`: PENDING 주문 취소 시 `reserved_stock` 복구
- `complete(id)`: COMPLETED 상태로 변경 + `Customers.recalculateAll()`
- `submitEdit(orderId)`: 인라인 수정

### `js/customers.js` (1229줄) ★ 가장 큰 파일
- `Customers` 객체, `loaded` 플래그 최적화 적용
- `load()`: 최초 1회만 `recalculateAll()` 실행
- `recalculateAll()`: SHIPPED+COMPLETED 주문 기준 모든 고객의 total_amount, total_profit, order_count, total_quantity, last_order_date 재계산 후 **DB에 저장** (매번 계산 아님). 고객-주문 연결: `o.customer_name === c.name` (이름 매칭) 또는 `String(o.customer_id) === String(c.id)` (ID 매칭) 병용
- `cleanupDuplicates()`: 이름 기준(case-insensitive) 중복 고객 병합. 가장 오래된(인덱스가 빠른) 고객을保留, 나머지의 주문을 옮기고 삭제. `String(o.customer_id) === String(c.id)` 비교
- `getMonthTopCustomers()`: 월별 TOP3 고객
- `getQuarterTopCustomers()`: 분기별 TOP2 고객
- `renderDetail(id)`: 고객 상세 페이지 - 구매 내역, 선호 브랜드/카테고리 분석, 아바타 업로드
- 집계값(total_amount 등)은 **저장됨** (recalculateAll에서 DB.setCustomers)

### `js/analytics.js` (642줄) ★ 유일한 비동기 함수 포함
- `Analytics` 객체, `state`에 year, liveExchangeRate, liveRateUpdatedAt 보관
- `_fetchLiveExchangeRate()`: `https://open.er-api.com/v6/latest/CNY`에서 KRW 환율 가져옴 (async). 실패 시 localStorage `lesoul_gh_live_rate` 캐시 또는 195 기본값
- `_ensureRate()`: 환율 가져온 후 localStorage에 캐싱 (DB 계층 우회, 직접 localStorage 접근)
- `_getOrderCost(order, products)`: 원가 스냅샷 우선 → 상품 현재 원가 참조 (fallback 체인):
  1. `order.actual_converted_cost_at_sale`
  2. `order.china_cost_at_sale`
  3. `product.actual_converted_cost`
  4. `product.china_base_price`
  5. 0
- `calculateMonthlyStats(year)`: 월별 매출/원가/수익/경비/순이익 계산. SHIPPED+COMPLETED 주문만 집계. `_getOrderDate` = ship_date || order_date || created_at
- `getBrandRanking(year)`, `getProductRanking(year)`, `getCustomerRanking(year)`: 연간 순위
- `render()`: 동기 렌더링 (liveRate가 이미 메모리에 있을 때)
- `renderAsync()`: `_ensureRate()` 대기 후 `render()` (유일한 async 진입점)
- `renderCharts(monthlyStats)`: Chart.js로 매출/이익 막대+선 차트, 이익률 라인 차트
- **경비 집계**: `amount`가 숫자면 그대로 사용, 아니면 구형 항목(logistics_cost + flight_cost + ...) 합산

### `js/expenses.js` (301줄)
- `Expenses` 객체, 신형 스키마만 사용 (expense_date, category, amount, description)
- 카테고리 6개: 교통비, 식비, 숙박비, 배송비, 포장재, 기타
- `load()`: 매 렌더링마다 DB 로드 (loaded 플래그 없음)
- CRUD: submitForm, delete, batchDelete
- 월별 필터: `expense_date` 기준

### `js/excel.js` (483줄)
- `ExcelManager` 객체, 4가지 템플릿 다운로드 (상품/주문/고객/키워드)
- `_parseExcelDate(val)`: 엑셀 일련번호, Date 객체, YYYY-MM-DD, YYYY.MM.DD 지원
- `importProducts(rows)`: 한국매입원가 필수, 자동분류 적용, PriceCalculator 호출
- `importOrders(rows)`:
  - 같은 월 + 같은 (고객+브랜드+상품명) 기존 주문 삭제 후 덮어쓰기
  - 고객 자동 생성 (이름으로 찾기, 없으면 생성)
  - 상품 매칭 (original_title + brand, 없으면 original_title만)
  - **원가 스냅샷 저장 안 함**, product.actual_converted_cost로 profit 계산
  - 자유(自留) 처리: sellingPrice 0 허용
  - status: 'COMPLETED'로 저장
- `importCustomers(rows)`: 이름 필수, 중복 확인 없이 추가
- `importKeywords(rows)`: **`id: Date.now() + Math.random()` (소수점 ID)**, 신형 스키마(type/standard/ko(array)/zh(array)/en(array)/ja(array)/active). initDefaultKeywords와 필드명 다름 (classification.js가 fallback으로 둘 다 처리)

### `js/settings.js` (194줄)
- `Settings` 객체
- `render()`: 언어 버튼, 매장명/부제목, 가격 계산 설정, 계산 미리보기, 데이터 백업/복원
- `save()`: 설정 저장 후 `location.reload()` (전체 새로고침)
- `recalculateAll()`: 모든 상품 actual_converted_cost, china_base_price 재계산
- `exportData()`: `DB.exportAllData()` → JSON 파일 다운로드
- `importData(input)`: JSON 파일 읽기 → `DB.importAllData()` → `location.reload()`

### `js/app.js` (819줄) ★ 메인 앱
- `App` 객체, `init()`에서 DB.init + 라우터 + 사이드바 + 체크박스 핸들러 + 헤더 + 렌더링
- **3-4B 변경**: 마지막의 `document.addEventListener('DOMContentLoaded', ...)` 자동 실행 제거
- **3-4B 추가**: `window.App = App` 전역 노출 (app-bootstrap.js가 초기화 제어)
- `init()` 내부 코드는 변경 없음 (라우터/렌더링/DB.init 동작 유지)
- `handleRoute()`: hash 파싱 → currentPage/pageArgs 설정 → renderPage()
- `renderPage()`: switch-case로 페이지 라우팅. try-catch로 에러 처리. `main.innerHTML = content`로 동적 주입
- `render()`: updateAllTranslations + updateActiveNav + renderPage
- `renderDashboard()`: 대시보드 (월 매출, 이익, 재고 부족 알림, 최근 주문)
- `renderClassification()`: 분류 키워드 관리 (그룹별 렌더링, 인라인 편집, 테스트 기능, 중복 정리)
- `setupCheckboxHandlers()`: document 클릭 이벤트 위임으로 select-all-cb / row-checkbox 처리 (5개 dataTarget: orders/products/customers/expenses/keywords)
- `flash(msg, type)`: 토스트 메시지 (success/error/warning/info)
- `bindPageForms()`: 렌더링 후 폼 onsubmit 바인딩

### `js/app_backup.js` (786줄) ★ 사용되지 않음
- index.html에서 로드하지 않음 (확인 완료)
- app.js의 이전 버전 백업 파일
- 참조하는 파일 없음 (BASELINE_STATUS.md에서 언급만 됨)
- **Supabase 마이그레이션 시 제거 후보**

### `data_export.json` (76,494줄) ★ 운영 데이터 포함
- Flask 원본 앱에서 내보낸 데이터 (추정)
- 내용: products 3,032건, orders 682건, customers 132건, expenses 2건(구형 스키마), keywords 160건, settings, exported_at
- **고객 개인정보**: 132명의 name 포함 (전화/위챗/이메일/주소는 없음)
- **운영 데이터**: 682건의 주문 (selling_price, actual_profit 포함)
- Git 추적됨 (commit 9cf0a0d), .gitignore의 `data_export_*.json` 패턴과 불일치 (언더스코어+와일드카드이지만 실제 파일은 언더스코어 없음)
- **RISK_ANALYSIS.md에서 심각도 높음으로 기록**

## 3. 라우팅

### Hash 기반 라우팅
```
#/dashboard              → App.renderDashboard()
#/products               → Products.renderList()
#/products/add           → Products.renderAdd() → renderForm(null)
#/products/{id}/edit     → Products.renderEdit(id) → renderForm(product)
#/orders                 → Orders.renderList()
#/orders/add             → Orders.renderAdd() → renderForm()
#/orders/{id}/ship       → Orders.renderShip(id)
#/customers              → Customers.renderList()
#/customers/add          → Customers.renderAdd() → renderForm(null)
#/customers/{id}/edit    → Customers.renderEdit(id)
#/customers/{id}         → Customers.renderDetail(id)
#/analytics              → Analytics.render()
#/expenses               → Expenses.renderList()
#/expenses/add           → Expenses.renderAdd() → renderForm(null)
#/expenses/{id}/edit     → Expenses.renderEdit(id)
#/classification         → App.renderClassification()
#/excel                  → ExcelManager.render()
#/settings               → Settings.render()
```

### 라우팅 흐름
1. `window.addEventListener('hashchange', () => App.handleRoute())`
2. `handleRoute()`: hash 파싱 → currentPage, pageArgs, currentParams 설정 → updateActiveNav → renderPage
3. `renderPage()`: switch-case로 모듈 호출, HTML 문자열 반환 → `main.innerHTML = content`
4. `setTimeout(() => updateAllTranslations(), 50)`: 비동기 번역 적용
5. `bindPageForms()`: 폼 onsubmit 바인딩

## 4. 렌더링 흐름

### 동기식 렌더링 패턴
```
[사용자 액션]
    ↓
[이벤트 핸들러] (예: Orders.submitAdd)
    ↓
[DB.get/set] (동기 localStorage 접근)
    ↓
[App.render() 또는 location.hash 변경]
    ↓
[renderPage() → 모듈.render*()] (동기 HTML 문자열 반환)
    ↓
[main.innerHTML = content]
    ↓
[setTimeout(updateAllTranslations, 50)]
    ↓
[bindPageForms()]
```

### 예외: Analytics의 비동기 렌더링
- `Analytics.renderAsync()`: `_ensureRate()` (fetch 환율 API) 대기 후 `render()`
- 하지만 라우터는 `Analytics.render()`를 직접 호출 (동기)
- `render()` 내부에서 `state.liveExchangeRate`가 없으면 기본값 195 사용
- 환율 API 응답 후 별도 재렌더링 없음 (사용자가 다른 페이지 갔다 와야 갱신됨)

### 검색 최적화 (loaded 플래그)
- Products.load(), Customers.load(): 최초 1회만 무거운 연산(autoClassifyAll, recalculateAll) 실행
- 이후 검색 시 `applyFilters()`만 실행 (필터링 + 정렬)
- 디바운스 300ms 적용 (검색 입력)
- Orders, Expenses는 loaded 플래그 없음 (매 렌더링마다 DB 로드)

## 5. 외부 라이브러리

| 라이브러리 | 버전 | 용도 | 로드 방식 |
|---|---|---|---|
| Font Awesome | 6.4.0 | 아이콘 | cdnjs |
| Chart.js | (최신) | 수익 분석 그래프 | jsdelivr |
| XLSX (SheetJS) | 0.18.5 | Excel 가져오기/내보내기 | jsdelivr |
| 환율 API | open.er-api.com | 실시간 KRW/CNY 환율 | fetch (비동기) |

### 외부 의존성 위험
- CDN 장애 시 차트/엑셀/아이콘 미작동
- 환율 API 장애 시 기본값 195 사용 (실제 환율과 오차 발생)
- 모든 라이브러리가 HTTPS CDN으로 GitHub Pages 환경에 적합

## 6. 데이터 흐름

### 저장 흐름
```
[UI 폼 제출]
    ↓
[모듈.submit*()] (예: Products.submitForm)
    ↓
[DB.add*() 또는 DB.update*()]
    ↓
[DB.set(collection, array)] → localStorage.setItem('lesoul_gh_' + collection, JSON.stringify(array))
```

### 조회 흐름
```
[페이지 렌더링]
    ↓
[모듈.load() 또는 render*()]
    ↓
[DB.get*()] → JSON.parse(localStorage.getItem('lesoul_gh_' + key))
    ↓
[필터링/정렬/집계]
    ↓
[HTML 문자열 반환]
```

### 전체 백업/복원 흐름
```
[내보내기]
DB.exportAllData() → {products, orders, customers, inventory_logs, expenses, keywords, settings, exported_at}
    ↓
Blob → 다운로드 (JSON 파일)

[가져오기]
JSON 파일 읽기 → DB.importAllData(data)
    ↓
각 컬렉션별 DB.set() 호출 (기존 데이터 덮어쓰기)
    ↓
expenses만 _convertExpenses()로 변환 (구형 → 신형)
    ↓
location.reload()
```

### 재고 연동 흐름
```
[주문 생성 (PENDING)]
product.reserved_stock += quantity

[주문 출고 (SHIPPED)]
product.current_stock -= quantity
product.reserved_stock -= quantity
inventory_logs 추가 (type: 'OUT', quantity: -order.quantity)
order.actual_profit 계산 저장

[주문 취소 (PENDING → CANCELLED)]
product.reserved_stock -= quantity

[주문 완료 (SHIPPED → COMPLETED)]
상태만 변경 (재고 변동 없음, Customers.recalculateAll() 호출)
```

## 7. Supabase 인증 게이트 (feature flag false 기본, 원격 미연결)

3-4A~3-4B 단계에서 추가된 Supabase 브라우저 클라이언트, 인증 서비스, 인증 UI, 부트스트랩 계층.
**기본 `SUPABASE_ENABLED=false`이므로 기존 localStorage 앱이 그대로 실행된다.**

### `js/config.example.js`
- Supabase 설정 예제 파일 (git tracked, index.html에서 로드)
- 실제 값 없이 빈 문자열로 구성
- `SUPABASE_ENABLED` 기본값 `false`
- **3-4B 추가**: `if (!global.LESOUL_CONFIG)` 가드로 pre-injected config 보호
- 실제 설정은 `js/config.js`에 로컬로 저장 (git ignored, 현재 미생성·미로드)

### `js/supabase-client.js` — `LESOULSupabase` 전역 객체
- Supabase 클라이언트 어댑터
- `init()`, `isEnabled()`, `isInitialized()`, `getClient()`, `getStatus()`
- `SUPABASE_ENABLED=false`이면 client 생성 안 함
- secret/service_role key 명시적 차단
- `SECURITY DEFINER` RPC와 함께 사용

### `js/auth-service.js` — `LESOULAuth` 전역 객체
- 인증 서비스 래퍼
- `signInWithPassword`, `signOut`, `getSession`, `getCurrentUser`, `subscribe`
- `ensureUserProfile`, `getActiveMemberships`, `bootstrapAuthenticatedUser`, `createInitialStore`
- 자동 매장 생성 없음 (명시적 호출로만)
- 3-4A.1: subscribe 반환 구조(`data.subscription.unsubscribe`), 오류 정규화 강화

### `js/auth-ui.js` — `LESOULAuthUI` 전역 객체 (3-4B 신규)
- 인증 UI 렌더러, `#auth-root`에만 렌더링
- 모든 동적 값은 `createElement` + `textContent` (innerHTML 금지, XSS 방지)
- 리스너 추적 및 정리 (`_activeListeners` 배열)
- 비밀번호 submit 후 입력 필드 즉시 비움
- 한국어 오류 문구만 사용
- 공개 API:
  - `init(options)`, `showLoading(message)`, `showSignedOut(handlers)`
  - `showStoreOnboarding(handlers)`, `showStoreSelection(memberships, handlers)`
  - `showError(message, handlers)`, `showAppContext(context)`
  - `hideAuth()`, `showAuth()`, `setBusy(isBusy)`, `destroy()`
- 로그인 화면: 이메일/비밀번호, @ 검증, 빈 값 차단
- 매장 생성 화면: 이름(1~100자)/부제/기본언어(ko/zh/en/ja)
- 매장 선택 화면: membership 버튼 목록, textContent 사용

### `js/app-bootstrap.js` — `LESOULAppBootstrap` 전역 객체 (3-4B 신규)
- 인증 게이트 부트스트랩, feature flag 기반 라우팅
- 의존성 주입 패턴 (`start({ deps })`로 mock 주입 가능)
- 상태 기계: `idle` → `legacy`/`loading` → `signed_out`/`needs_store_onboarding`/`needs_store_selection`/`ready`/`error`
- `_appInitCalled` 플래그로 App.init 단일 실행 보장
- Context 메모리 전용 (user/profile/memberships/activeMembership을 localStorage에 저장하지 않음)
- 동적 CDN 로드 (15초 timeout, `SUPABASE_LIBRARY_LOAD_FAILED`)
- **Legacy fallback 금지**: 인증 오류 시 자동으로 legacy 앱으로 우회하지 않음
- Bootstrap revision guard (stale 결과 방지)
- 공개 API:
  - `start(options)`, `retry()`, `signIn(credentials)`, `signOut()`
  - `createInitialStore(options)`, `selectMembership(membership)`
  - `getState()`, `getContext()`, `destroy()`
- 비활성 경로 (`SUPABASE_ENABLED !== true`):
  1. #auth-root 숨김, #app 표시
  2. App.init 정확히 1회 호출
  3. CDN 요청 0건
  4. 상태 `legacy`
- 활성 경로 (`SUPABASE_ENABLED=true`):
  1. #app 숨김, #auth-root 표시
  2. Supabase JS 동적 로드
  3. LESOULSupabase.init → LESOULAuth.init → bootstrapAuthenticatedUser
  4. 결과에 따라 화면 전환

### `tests/supabase-client.test.js` / `tests/auth-service.test.js` / `tests/app-bootstrap.test.js`
- Node 내장 test runner 사용
- mock 기반 단위 테스트 (의존성 주입)
- 실제 네트워크 호출 없음
- 총 36개 test case, 전부 PASS (7 + 15 + 14)

### 현재 상태 요약 (3-4B)
- feature flag 기본값: `SUPABASE_ENABLED=false`
- disabled mode: App.init 정확히 1회, CDN 요청 0건, 기존 앱과 동일
- enabled mode: 인증 게이트 동작 (로그인/매장생성/매장선택 화면)
- 데이터 저장: 여전히 localStorage (업무 데이터 계층 미전환)
- index.html 스크립트 순서: 인증 스크립트 + app-bootstrap.js 로드
- Supabase 원격 연결: 미연결
- config.js: 미생성·미로드 (config.example.js만 로드)
- 신규 migration: 없음 (기존 11개 유지)
- legacy fallback: 금지 (인증 오류 시 error 화면만)

## 8. 확인 필요 항목

- `data_export.json`의 정확한 출처 (Flask 앱에서 내보낸 것인지, 수동 생성인지) - "확인 필요"
- `app_backup.js`가 언제 생성됐는지 (Git 히스토리 추적 가능하지만 이번 분석 범위 외) - "확인 필요"
- Analytics의 `renderAsync()`가 실제로 호출되는 경로 (라우터는 `render()`만 호출) - "확인 필요, 현재는 호출되지 않는 것으로 보임"
- Chart.js 버전 고정 여부 (jsdelivr CDN에서 버전 태그 없이 최신 로드) - "확인 필요"

## 9. 3-4C2: Local Browser Auth Smoke Test (2026-07-19)

### 목적
실제 브라우저에서 로컬 Supabase Auth와 인증 게이트 UI가 연결되는지 smoke test로 확인한다.

### 주요 변경
- **index.html**: `js/config.js`가 `js/config.example.js`보다 먼저 로드되도록 추가
- **js/config.js**: `.gitignore`에 이미 포함, 로컬에서만 생성
- **js/config.example.js**: 기존 LESOUL_CONFIG 덮어쓰지 않는 가드 유지 (`if (!global.LESOUL_CONFIG)`)
- **새 문서**: `docs/SUPABASE_BROWSER_AUTH_SMOKE_TEST.md`
- **새 테스트**: `tests/browser-auth-smoke-contract.test.mjs` (B1-B10 정적 계약 테스트)

### js/config.js 예시 (로컬에서만 생성)
```javascript
(function (global) {
    'use strict';
    global.LESOUL_CONFIG = Object.freeze({
        SUPABASE_ENABLED: true,
        SUPABASE_URL: 'http://127.0.0.1:54321',
        SUPABASE_CLIENT_KEY: '<LOCAL_ANON_KEY_ONLY>'
    });
})(typeof window !== 'undefined' ? window : globalThis);
```

### 중요 제약
- `js/config.js` commit 금지
- `service_role` key 브라우저 사용 금지 (로컬 test user 생성에만 사용)
- 원격 Supabase 연결 금지
- business modules(js/db.js 등) 변경 금지
- localStorage 기반 업무 데이터 유지

### 브라우저 smoke 테스트 단계
1. `SUPABASE_ENABLED=true` 상태에서 legacy app이 바로 뜨지 않음
2. 로그인 화면 표시
3. dummy local test user로 로그인
4. membership 없으면 store onboarding 화면
5. 매장 생성
6. 앱 진입
7. header auth badge 표시
8. 새로고침 후 세션 유지
9. logout 버튼 클릭 시 signed-out 화면
10. 재로그인 가능

### 수동 확인 결과 (2026-07-19)
| 항목 | 상태 |
|---|---|
| 로그인 화면 표시 | ✅ |
| 로그인 성공 | ✅ |
| onboarding 화면 표시 | ✅ |
| 매장 생성 성공 | ✅ |
| 앱 진입 | ✅ |
| auth badge 표시 | ✅ |
| 새로고침 세션 유지 | ✅ |
| logout 성공 | ✅ |
| 재로그인 가능 | ✅ |
| token console 출력 | ❌ (없음) |
| service_role 브라우저 | ❌ (없음) |
| 원격 Supabase 연결 | ❌ (없음) |

## 10. 3-4C3: Browser Auth Failure / Recovery Smoke (2026-07-19)

### 목적
브라우저 인증 게이트의 실패/복구 경로를 검증한다. 정상 흐름은 3-4C2에서 확인됐다.
아직 business CRUD 전환은 시작하지 않는다.

### 주요 변경
- **새 테스트**: `tests/browser-auth-recovery-contract.test.mjs` (C1-C12 정적 계약 테스트)
- **문서 업데이트**: `docs/SUPABASE_BROWSER_AUTH_SMOKE_TEST.md`에 R1-R10 recovery 시나리오 추가
- **문서 업데이트**: `docs/SUPABASE_LOCAL_TEST_RESULTS.md`에 3-4C3 결과 추가
- **문서 업데이트**: `docs/CURRENT_ARCHITECTURE.md`에 3-4C3 섹션 추가

### 실패/복구 시나리오 (R1-R10)
| # | 시나리오 | 처리 방식 |
|---|---|---|
| R1 | js/config.js 없음 | legacy mode로 정상 실행 (SUPABASE_ENABLED=false) |
| R2 | 잘못된 SUPABASE_URL | error UI + retry, 앱 본문 숨김 |
| R3 | 잘못된 anon key | 일반 오류 메시지, key/JWT/body 미출력 |
| R4 | 잘못된 이메일/비밀번호 | signed-out 유지, password clear, 구체 사유 미노출 |
| R5 | Supabase stack 중단 | timeout → error state, retry 가능 |
| R6 | session 확인 실패 | auth-root error 또는 signed-out으로 안전 전환 |
| R7 | logout 실패 | error state + retry signOut, 중간 상태 방지 |
| R8 | onboarding 실패 | 앱 진입 금지, retry 가능 |
| R9 | token/session 출력 | console.log로 token/session/key 출력 안 함 |
| R10 | 원격 URL 차단 | supabase.co / https 원격 URL 사용 금지 |

### Recovery Contract Tests (C1-C12)
| # | 검사 항목 | 결과 |
|---|---|---|
| C1 | index.html에 js/config.js optional hook 존재 | PASS |
| C2 | js/config.js가 config.example.js보다 먼저 로드됨 | PASS |
| C3 | config.example.js 기본값 SUPABASE_ENABLED=false | PASS |
| C4 | config.example.js가 기존 LESOUL_CONFIG를 덮어쓰지 않음 | PASS |
| C5 | js/config.js는 .gitignore에 포함됨 | PASS |
| C6 | index.html/js/docs에 service_role 실제 사용 없음 | PASS |
| C7 | js 코드에 access_token/refresh_token console.log 없음 | PASS |
| C8 | auth-ui error state에 retry 버튼 존재 | PASS |
| C9 | app-bootstrap logout failure retry가 signOut 재시도 | PASS |
| C10 | unknown/null bootstrap result에서 app 본문 숨김 | PASS |
| C11 | remote supabase.co URL 없음 | PASS |
| C12 | business modules 변경 없음 | PASS |

### 안전 장치 목록
- `_hideApp()`: 모든 error 경로에서 앱 본문 숨김
- `_safeErrorState()`: error + retry 버튼 표시
- bootstrap revision guard: stale 결과 무시
- signOut single-flight: 중복 로그아웃 방지
- bootstrap single-flight: 중복 bootstrap 방지
- CDN load-state 관리 (loading/loaded/failed)
- legacy fallback 금지: 인증 오류 시 자동으로 legacy 앱으로 우회하지 않음
- Context 메모리 전용: token/session을 localStorage에 저장하지 않음
- 모든 동적 값 `textContent` 사용: innerHTML 금지 (XSS 방지)

### 제약 준수
- service_role 브라우저 사용: ❌ (no)
- token/session console 출력: ❌ (no)
- 원격 Supabase 연결: ❌ (no)
- business CRUD 변경: ❌ (no)
- js/config.js commit: ❌ (no)

## 11. 3-5A: Data Gateway Async Boundary Preparation (2026-07-19)

### 목적
인증 게이트 정상/실패/복구 검증이 끝났으므로, 업무 데이터 전환을 위한 준비를 시작한다.
**이번 단계는 실제 상품/주문/고객 CRUD를 Supabase로 전환하지 않는다.**
localStorage 기반 동기 데이터 계층을 async 전환 가능한 경계로 정리한다.

### 데이터 게이트웨이 설계 개념

#### 현재: localStorageDataSource
- 모든 데이터가 `localStorage`에 저장 (prefix: `lesoul_gh_`)
- `DB` 객체가 직접 `localStorage.getItem` / `setItem` 호출
- sync API (즉시 값 반환)
- 업무 모듈(products.js, orders.js, customers.js 등)이 `DB`를 직접 참조

#### 다음 단계: SupabaseDataSource 추가 예정
- `SupabaseDataSource` 클래스/객체 추가 예정
- 동일한 메서드 시그니처를 async로 제공
- `DB` 객체는 `localStorageDataSource` 역할을 유지하면서, 향후 data gateway가 어느 source를 사용할지 선택
- 업무 모듈은 장기적으로 `DB` 직접 접근 대신 data gateway를 통해 접근

#### 이번 단계(3-5A) 구조 준비
- db.js에 data source 개념을 주석과 얇은 wrapper로 정리
- 기존 sync API를 깨지 않는 범위에서 Promise 호환 helper 추가
- 향후 async 전환 대상 메서드 목록을 내부 상수로 정리 (`DB.ASYNC_MIGRATION_TARGETS`)
- **실제 Supabase CRUD 호출 없음**
- **기존 public API 이름 유지**

### 주요 변경
- **js/db.js**: data source 주석, `DB.asyncReady` Promise helper, `DB.ASYNC_MIGRATION_TARGETS` 상수 추가
- **새 문서**: `docs/ASYNC_MIGRATION_MAP.md` (db.js 메서드 전체 정리)
- **새 테스트**: `tests/data-gateway-async-contract.test.mjs` (A1-A13 정적 계약 테스트)

### 이번 단계에서 하지 않는 일
- 기존 메서드를 전부 async로 변경 ❌
- 화면 코드에 대규모 await 추가 ❌
- localStorage key 변경 ❌
- 데이터 구조 변경 ❌
- Supabase client 호출 ❌
- localStorage 데이터 migration 실행 ❌
- remote Supabase 연결 ❌

### 제약 준수
- 실제 Supabase CRUD 호출: ❌ (no)
- localStorage key 변경: ❌ (no)
- business 화면 동작 변경: ❌ (no)
- 원격 Supabase 연결: ❌ (no)
- service_role 브라우저 사용: ❌ (no)
- js/config.js commit: ❌ (no)
- data_export.json 재추가: ❌ (no)

### 상세 문서
- db.js 메서드 전체 목록과 전환 난이도: `docs/ASYNC_MIGRATION_MAP.md`

## 12. 3-5B: Products Read Path Async Boundary (2026-07-19)

### 목적
상품 목록/조회 read path만 async boundary에 맞춰 준비한다.
**3-5B는 Products read path only, no CRUD conversion.**
실제 Supabase CRUD 호출은 금지하며, 데이터 소스는 여전히 localStorage다.

### 주요 변경
- **js/db.js**: `DB.getProductsAsync()`, `DB.getDataSourceMode()`, `DB.isAsyncBoundaryEnabled(scope)` 추가
- **js/products.js**: `Products.load()`와 `Products.renderList()`를 async로 변경 (read path만)
- **js/app.js**: `App.renderPage()`를 async로 변경, products 페이지에서 `await Products.renderList()` 처리
- **새 테스트**: `tests/products-read-async-contract.test.mjs` (P1-P13)

### async boundary 구조
```
App.renderPage() (async)
  └─ products 페이지
       └─ await Products.renderList() (async)
            └─ await Products.load() (async)
                 └─ await DB.getProductsAsync()
                      └─ Promise.resolve(DB.getProducts())  // 여전히 localStorage
```

### 제약 준수
- 실제 Supabase products CRUD 호출: ❌ (no)
- Products write path 변경: ❌ (no) — submitForm/delete/batch* 기존 sync 유지
- localStorage key 변경: ❌ (no)
- Orders/Customers/Expenses/Settings 모듈 변경: ❌ (no)
- 원격 Supabase 연결: ❌ (no)
- service_role 브라우저 사용: ❌ (no)
- js/config.js commit: ❌ (no)
- data_export.json 재추가: ❌ (no)

### 상세 문서
- Products read path 전환 상세: `docs/ASYNC_MIGRATION_MAP.md` §6

## 13. 3-5C: Products Write Path Async Boundary Preparation (2026-07-19)

### 목적
Products read path async boundary가 완료됐으므로, 이번에는 Products write path를 async boundary에 맞게 준비한다.
**3-5C는 Products write path async boundary only, no Supabase CRUD conversion.**
실제 Supabase insert/update/delete/upsert 호출은 금지하며, 데이터 소스는 여전히 localStorage다.

### 주요 변경
- **js/db.js**: `DB.setProductsAsync`, `DB.addProductAsync`, `DB.updateProductAsync`, `DB.deleteProductAsync` 추가 (모두 기존 sync 메서드를 Promise.resolve로 감쌈)
- **js/products.js**: `submitForm`, `delete`, `batchDelete`, `batchReclassify`, `batchMonthChange`를 async로 전환 (write path만)
- **js/app.js**: `bindPageForms()`에서 productForm submit handler를 Promise 안전 처리
- **새 테스트**: `tests/products-write-async-contract.test.mjs` (W1-W15)

### Products async boundary 완료 상태
```
Products read path (3-5B):
  App.renderPage() → await Products.renderList() → await Products.load() → await DB.getProductsAsync()

Products write path (3-5C):
  App.bindPageForms() → Promise.resolve(Products.submitForm()).catch()
    └─ await DB.addProductAsync() / DB.updateProductAsync()
  Products.delete() → await DB.deleteProductAsync()
  Products.batchDelete/batchReclassify/batchMonthChange() → await DB.setProductsAsync()
```

### Data source 상태
- **현재**: localStorage (prefix `lesoul_gh_`)
- **다음 단계 예정**: SupabaseDataSource 추가
- 이번 단계에서는 실제 Supabase CRUD 호출 없음

### 제약 준수
- 실제 Supabase products CRUD 호출: ❌ (no)
- localStorage key 변경: ❌ (no)
- 상품 스키마 변경: ❌ (no)
- Orders/Customers/Expenses/Settings 모듈 변경: ❌ (no)
- 원격 Supabase 연결: ❌ (no)
- service_role 브라우저 사용: ❌ (no)
- js/config.js commit: ❌ (no)
- data_export.json 재추가: ❌ (no)

### 상세 문서
- Products write path 전환 상세: `docs/ASYNC_MIGRATION_MAP.md` §7

## 14. 3-5D: Products DataSource Interface Extraction (2026-07-19)

### 목적
Products read/write async boundary가 준비됐으므로, 이번 단계에서는 Products 전용 DataSource 인터페이스를 분리한다.
**3-5D는 Products DataSource extraction only, no Supabase CRUD conversion.**
현재 활성 DataSource는 반드시 LocalProductsDataSource이며, 내부 저장 방식은 기존 localStorage 그대로 유지한다.

### Products DataSource 구조

```
DB.getProductsDataSource() → ProductsDataSource
  ├─ LocalProductsDataSource (현재 활성)
  │    ├─ listProducts() → Promise<Product[]>
  │    ├─ setProducts(products) → Promise<void>
  │    ├─ createProduct(product) → Promise<Product>
  │    ├─ updateProduct(id, updates) → Promise<Product>
  │    └─ deleteProduct(id) → Promise<boolean>
  └─ SupabaseProductsDataSource (다음 단계 예정, 미구현)
```

### 호출 흐름
```
Products.load() → await DB.getProductsAsync()
  └─ DB.getProductsDataSource().listProducts()
       └─ LocalProductsDataSource.listProducts()
            └─ Promise.resolve(db.getProducts())  // localStorage

Products.submitForm() → await DB.addProductAsync()
  └─ DB.getProductsDataSource().createProduct(product)
       └─ LocalProductsDataSource.createProduct(product)
            └─ db.addProduct(product) → Promise.resolve(result)  // localStorage
```

### 주요 변경
- **js/db.js**: `LocalProductsDataSource`, `getProductsDataSource()`, 테스트용 setter/resetter 추가
- **js/db.js**: 기존 async helper 내부 구현을 ProductsDataSource 경유로 정리
- **새 테스트**: `tests/products-datasource-contract.test.mjs` (D1-D16)
- **products.js**: 변경 없음 — 기존 async helper 호출 유지

### 인증 게이트 vs 업무 데이터 전환
- 인증 게이트 (3-4): 완료됨 — Supabase Auth와 연결
- 업무 데이터 전환 (3-5): Products DataSource 인터페이스 분리 완료
- **아직 Supabase products CRUD 호출 없음** — DataSource 인터페이스만 분리
- 다음 단계에서 SupabaseProductsDataSource 구현 예정

### 제약 준수
- 실제 Supabase products CRUD 호출: ❌ (no)
- 활성 DataSource: LocalProductsDataSource
- localStorage key 변경: ❌ (no)
- 상품 스키마 변경: ❌ (no)
- Orders/Customers/Expenses/Settings 모듈 변경: ❌ (no)
- 원격 Supabase 연결: ❌ (no)
- service_role 브라우저 사용: ❌ (no)
- js/config.js commit: ❌ (no)
- data_export.json 재추가: ❌ (no)

### 상세 문서
- Products DataSource 상세: `docs/ASYNC_MIGRATION_MAP.md` §8

## 15. 3-5E: Products Supabase Mapping Contract (2026-07-19)

### 목적
ProductsDataSource boundary가 분리됐으므로, 이번 단계에서는 Supabase products row와 기존 legacy product object 사이의 mapping contract를 고정한다.
**3-5E는 Products Supabase mapping contract only, no Supabase CRUD conversion.**
활성 DataSource는 계속 LocalProductsDataSource여야 한다.

### Products DataSource + Mapping Layer 구조

```
DB.getProductsDataSource() → ProductsDataSource
  ├─ LocalProductsDataSource (현재 활성)
  │    └─ 기존 localStorage 기반 DB sync 메서드
  └─ SupabaseProductsDataSource (다음 단계 예정, 미구현)
       └─ mapping helpers 사용 예정

Mapping Layer (순수 함수, runtime 미사용):
  DB.mapLegacyProductToSupabaseRow(product) → Supabase row
  DB.mapSupabaseRowToLegacyProduct(row) → legacy product
  DB.validateProductMappingInputForTesting(obj, kind) → boolean
```

### Mapping Layer 설명
- **순수 함수**: side-effect 없음, localStorage/네트워크/Supabase client 호출 금지
- **runtime 미사용**: 현재 app runtime에서 자동 사용하지 않음
- **다음 단계 연동**: SupabaseProductsDataSource 구현 시 mapping helper 사용 예정
- **필드 매핑**: legacy numeric id ↔ legacy_id, Supabase uuid는 별도 관리
- **image 보존**: base64 image는 text로 보존 (blob 변환하지 않음)
- **안전 기본값**: 누락 필드는 안전 기본값 처리 (앱 호환성 보존)

### 현재 Runtime 상태
- **활성 DataSource**: LocalProductsDataSource (변경 없음)
- **데이터 저장**: localStorage (기존과 동일)
- **mapping helper**: runtime에서 호출하지 않음 (다음 단계에서 사용)

### 인증 게이트 vs 업무 데이터 전환
- 인증 게이트 (3-4): 완료됨 — Supabase Auth와 연결
- 업무 데이터 전환 (3-5):
  - 3-5A: async boundary 준비 ✅
  - 3-5B: Products read path async ✅
  - 3-5C: Products write path async ✅
  - 3-5D: Products DataSource interface extraction ✅
  - 3-5E: Products Supabase mapping contract ✅ (현재)
  - 다음: SupabaseProductsDataSource 구현 예정
- **아직 Supabase products CRUD 호출 없음** — mapping contract만 고정
- 인증 게이트와 업무 데이터 전환은 여전히 분리되어 있음

### 제약 준수
- 실제 Supabase products CRUD 호출: ❌ (no)
- 활성 DataSource: LocalProductsDataSource (변경 없음)
- mapping helper의 네트워크/localStorage 호출: ❌ (no)
- localStorage key 변경: ❌ (no)
- 상품 스키마 변경: ❌ (no)
- products.js 변경: ❌ (no)
- Orders/Customers/Expenses/Settings 모듈 변경: ❌ (no)
- 원격 Supabase 연결: ❌ (no)
- service_role 브라우저 사용: ❌ (no)
- js/config.js commit: ❌ (no)
- data_export.json 재추가: ❌ (no)

### 상세 문서
- Products mapping 상세: `docs/ASYNC_MIGRATION_MAP.md` §9

## 16. 3-5F: SupabaseProductsDataSource Disabled Skeleton (2026-07-19)

### 목적
Products Supabase mapping contract가 고정됐으므로, 이번 단계에서는 SupabaseProductsDataSource skeleton만 추가한다.
**3-5F는 SupabaseProductsDataSource disabled skeleton only, no Supabase CRUD conversion.**
기본 활성 DataSource는 반드시 LocalProductsDataSource로 유지한다.
실제 Supabase products read/write 전환은 아직 하지 않는다.

### Products DataSource 구조

```
DB.getProductsDataSource() → ProductsDataSource
  ├─ LocalProductsDataSource (현재 활성, 기본값)
  │    └─ 기존 localStorage 기반 DB sync 메서드
  └─ SupabaseProductsDataSource (disabled skeleton, 미사용)
       ├─ name: 'SupabaseProductsDataSource'
       ├─ listProducts() → throws "not enabled yet"
       ├─ setProducts() → throws "not enabled yet"
       ├─ createProduct() → throws "not enabled yet"
       ├─ updateProduct() → throws "not enabled yet"
       └─ deleteProduct() → throws "not enabled yet"

Mapping Layer (순수 함수, runtime 미사용):
  DB.mapLegacyProductToSupabaseRow / mapSupabaseRowToLegacyProduct
```

### 현재 Runtime 상태
- **활성 DataSource**: LocalProductsDataSource (변경 없음, 기본값)
- **데이터 저장**: localStorage (기존과 동일)
- **SupabaseProductsDataSource**: skeleton만 존재, runtime에서 자동 사용하지 않음
- **자동 전환 없음**: feature flag / config / auth session 기반 자동 전환 없음

### 인증 게이트 vs 업무 데이터 전환
- 인증 게이트 (3-4): 완료됨 — Supabase Auth와 연결
- 업무 데이터 전환 (3-5):
  - 3-5A: async boundary 준비 ✅
  - 3-5B: Products read path async ✅
  - 3-5C: Products write path async ✅
  - 3-5D: Products DataSource interface extraction ✅
  - 3-5E: Products Supabase mapping contract ✅
  - 3-5F: SupabaseProductsDataSource disabled skeleton ✅ (현재)
  - 다음: SupabaseProductsDataSource 실제 CRUD 구현 예정
- **아직 Supabase products CRUD 호출 없음** — skeleton만 추가
- 인증 게이트와 업무 데이터 전환은 여전히 분리되어 있음

### 제약 준수
- 실제 Supabase products CRUD 호출: ❌ (no)
- 활성 DataSource: LocalProductsDataSource (기본값, 변경 없음)
- getProductsDataSource() 기본값 변경: ❌ (no)
- skeleton 메서드는 모두 disabled error throw
- 실제 supabase.from('products') 실행: ❌ (no)
- 실제 select/insert/update/delete/upsert 구현: ❌ (no)
- feature flag / config / auth session 기반 자동 전환: ❌ (no)
- localStorage key 변경: ❌ (no)
- 상품 스키마 변경: ❌ (no)
- products.js 변경: ❌ (no)
- Orders/Customers/Expenses/Settings 모듈 변경: ❌ (no)
- 원격 Supabase 연결: ❌ (no)
- service_role 브라우저 사용: ❌ (no)
- js/config.js commit: ❌ (no)
- data_export.json 재추가: ❌ (no)

### 상세 문서
- Products skeleton 상세: `docs/ASYNC_MIGRATION_MAP.md` §10

## 17. 3-5G: Products Supabase Read Path Local-only Controlled Test (2026-07-19)

### 목적
SupabaseProductsDataSource skeleton이 추가됐으므로, 이번 단계에서는 listProducts read path만 로컬 테스트 전용으로 제한 구현한다.
**3-5G는 local-only controlled read test only, no write conversion.**
기본 앱 runtime의 활성 DataSource는 반드시 LocalProductsDataSource로 유지한다.

### Products DataSource 현재 상태

```
DB.getProductsDataSource() → ProductsDataSource
  ├─ LocalProductsDataSource (기본 runtime, 활성)
  │    └─ 기존 localStorage 기반 DB sync 메서드
  └─ SupabaseProductsDataSource (local-only controlled read test 가능)
       ├─ listProducts() → local-only controlled read (구현됨)
       │    ├─ client 명시적 주입 필요
       │    ├─ context.localOnly === true 필요
       │    ├─ storeId 필요
       │    ├─ localhost/127.0.0.1 URL만 허용
       │    ├─ products select read-only
       │    └─ mapSupabaseRowToLegacyProduct로 결과 변환
       ├─ setProducts()    → throw "write not enabled" (disabled)
       ├─ createProduct()  → throw "write not enabled" (disabled)
       ├─ updateProduct()  → throw "write not enabled" (disabled)
       └─ deleteProduct()  → throw "write not enabled" (disabled)
```

### 현재 Runtime 상태
- **활성 DataSource**: LocalProductsDataSource (기본값, 변경 없음)
- **데이터 저장**: localStorage (기존과 동일)
- **SupabaseProductsDataSource**: `setProductsDataSourceForTesting()`으로만 주입 가능
- **자동 전환 없음**: feature flag / config / auth session 기반 자동 전환 없음
- **write disabled**: create/update/delete/setProducts는 모두 disabled error

### listProducts local-only 조건
1. client 명시적 주입 필요 (없으면 throw)
2. context.localOnly === true 필요 (아니면 throw)
3. storeId 필요 (없으면 throw)
4. localhost/127.0.0.1 URL만 허용 (원격이면 throw)
5. products table select read-only만 수행
6. 결과는 mapSupabaseRowToLegacyProduct로 legacy object로 변환
7. token/session/key console.log 금지
8. 오류 메시지에 key/JWT/token/body 포함 금지

### 인증 게이트 vs 업무 데이터 전환
- 인증 게이트 (3-4): 완료됨 — Supabase Auth와 연결
- 업무 데이터 전환 (3-5):
  - 3-5A: async boundary 준비 ✅
  - 3-5B: Products read path async ✅
  - 3-5C: Products write path async ✅
  - 3-5D: Products DataSource interface extraction ✅
  - 3-5E: Products Supabase mapping contract ✅
  - 3-5F: SupabaseProductsDataSource disabled skeleton ✅
  - 3-5G: Products Supabase read path local-only controlled test ✅ (현재)
  - 다음: write path 구현, runtime 전환 예정
- **아직 일반 앱 runtime은 localStorage 사용** — SupabaseProductsDataSource는 테스트 전용
- 인증 게이트와 업무 데이터 전환은 여전히 분리되어 있음

### 제약 준수
- 실제 Supabase products write 호출: ❌ (no)
- 활성 DataSource: LocalProductsDataSource (기본값, 변경 없음)
- getProductsDataSource() 기본값 변경: ❌ (no)
- 일반 runtime에서 SupabaseProductsDataSource 자동 활성화: ❌ (no)
- create/update/delete/upsert 구현: ❌ (no)
- 원격 Supabase 연결: ❌ (no)
- service_role 브라우저 사용: ❌ (no)
- localStorage key 변경: ❌ (no)
- 상품 스키마 변경: ❌ (no)
- products.js 변경: ❌ (no)
- js/config.js commit: ❌ (no)
- data_export.json 재추가: ❌ (no)

### 상세 문서
- Products read controlled test 상세: `docs/ASYNC_MIGRATION_MAP.md` §11

## 18. 3-5H: Products Supabase Read Local Integration Smoke (2026-07-19)

### 목적
3-5G에서 SupabaseProductsDataSource의 local-only controlled listProducts 구조를 만들었다.
이번 단계에서는 실제 로컬 Supabase/Auth/RLS 환경에서 products read가 동작하는지 통합 smoke test로 검증한다.
**3-5H는 local-only integration smoke only, no runtime conversion, no write.**

### Products DataSource 현재 상태

```
Runtime default: LocalProductsDataSource (localStorage)

Test-only (opt-in):
  SupabaseProductsDataSource (local-only read)
    ├─ listProducts() → anon client + RLS + store_id 필터 → mapping → legacy objects
    ├─ setProducts()    → throw "write not enabled" (disabled)
    ├─ createProduct()  → throw "write not enabled" (disabled)
    ├─ updateProduct()  → throw "write not enabled" (disabled)
    └─ deleteProduct()  → throw "write not enabled" (disabled)
```

### Local Integration Smoke Test
- 파일: `tests/products-supabase-read-local.integration.mjs`
- 실행 조건: `RUN_LOCAL_SUPABASE_INTEGRATION=1` 환경 변수 (opt-in)
- 기본 `node --test`: skip, 네트워크 호출 없음
- 테스트 흐름:
  1. service_role admin API로 테스트 유저 생성 (setup only)
  2. anon key로 password 로그인
  3. ensure_user_profile + create_initial_store
  4. authenticated owner (anon key + access token)로 products fixture 2개 삽입 (RLS insert 정책도 검증)
  5. anon client + SupabaseProductsDataSource.listProducts()로 read 검증
  6. 결과가 mapSupabaseRowToLegacyProduct로 정상 변환 확인
  7. write methods disabled 확인
  8. best-effort 테스트 유저 cleanup (기본 cleanup은 db reset)

### 현재 Runtime 상태
- **활성 DataSource**: LocalProductsDataSource (기본값, 변경 없음)
- **데이터 저장**: localStorage (기존과 동일)
- **SupabaseProductsDataSource**: 테스트에서만 주입, runtime에서 자동 사용하지 않음
- **write disabled**: create/update/delete/setProducts 모두 disabled error
- **자동 전환 없음**: feature flag / config / auth session 기반 자동 전환 없음

### 인증 게이트 vs 업무 데이터 전환
- 인증 게이트 (3-4): 완료됨 — Supabase Auth와 연결
- 업무 데이터 전환 (3-5):
  - 3-5A: async boundary 준비 ✅
  - 3-5B: Products read path async ✅
  - 3-5C: Products write path async ✅
  - 3-5D: Products DataSource interface extraction ✅
  - 3-5E: Products Supabase mapping contract ✅
  - 3-5F: SupabaseProductsDataSource disabled skeleton ✅
  - 3-5G: Products Supabase read path local-only controlled test ✅
  - 3-5H: Products Supabase read local integration smoke ✅ (현재)
  - 다음: write path 구현, runtime 전환 예정
- **아직 일반 앱 runtime은 localStorage 사용**
- 인증 게이트와 업무 데이터 전환은 여전히 분리되어 있음

### 제약 준수
- 실제 Supabase products write 호출: ❌ (no)
- 활성 DataSource: LocalProductsDataSource (기본값, 변경 없음)
- getProductsDataSource() 기본값 변경: ❌ (no)
- 일반 runtime에서 SupabaseProductsDataSource 자동 활성화: ❌ (no)
- create/update/delete/upsert 구현: ❌ (no)
- 원격 Supabase 연결: ❌ (no)
- service_role 브라우저 사용: ❌ (no)
- service_role 값을 JS/browser 코드에 넣기: ❌ (no)
- localStorage key 변경: ❌ (no)
- 상품 스키마 변경: ❌ (no)
- products.js 변경: ❌ (no)
- js/config.js commit: ❌ (no)
- data_export.json 재추가: ❌ (no)

### 상세 문서
- Products read local integration 상세: `docs/ASYNC_MIGRATION_MAP.md` §12

## 19. 3-5I: Products Supabase Write Path Local-only Controlled Contract (2026-07-19)

### 목표
SupabaseProductsDataSource의 create/update/delete write methods를 local-only controlled 방식으로 구현한다.
setProducts는 대량 overwrite 위험이 있으므로 계속 disabled 유지.
일반 runtime은 여전히 LocalProductsDataSource를 사용하며 자동 전환되지 않는다.
**3-5I는 local-only controlled write contract only, no runtime conversion.**

### Products DataSource 현재 상태

```
Runtime default: LocalProductsDataSource (localStorage)

Test-only (controlled / opt-in):
  SupabaseProductsDataSource (local-only read + write)
    ├─ listProducts()   → anon client + RLS + store_id 필터 → mapping → legacy objects
    ├─ createProduct()  → mapLegacy → insert (store_id 강제) → mapping → legacy object
    ├─ updateProduct()  → legacy_id + store_id 필터 → update (위험 필드 차단) → mapping → legacy object
    ├─ deleteProduct()  → legacy_id + store_id 필터 → soft delete (deleted_at) → mapping → legacy object
    └─ setProducts()    → throw "setProducts is not enabled" (disabled — bulk overwrite 금지)
```

### Write Methods 세부 규칙

#### createProduct
- `mapLegacyProductToSupabaseRow`로 변환 후 insert
- `store_id`는 `context.storeId`로 강제 (product 내 값 무시)
- insert 후 `.select().single()`로 결과 조회
- 결과를 `mapSupabaseRowToLegacyProduct`로 변환 후 반환

#### updateProduct
- `legacy_id + store_id` 이중 필터로 대상 제한
- id/legacy_id/store_id/created_at/created_by 등 위험 필드는 patch에서 제외
- `updated_at` 자동 설정
- update 후 `.select().single()`로 결과 조회 → legacy 변환 반환

#### deleteProduct
- 실제 `delete()` 호출 ❌
- `deleted_at = new Date().toISOString()`로 soft delete
- `legacy_id + store_id` 이중 필터
- update 후 결과 → legacy 변환 반환

#### setProducts
- 계속 disabled 유지
- 대량 overwrite 위험으로 인해 명시적으로 금지

### Contract Test
- 파일: `tests/products-supabase-write-contract.test.mjs`
- W1-W21 검증 항목
- mock client 기반, 실제 네트워크 호출 없음
- 기본 `node --test`에서 실행 가능

### 현재 Runtime 상태
- **활성 DataSource**: LocalProductsDataSource (기본값, 변경 없음)
- **데이터 저장**: localStorage (기존과 동일)
- **SupabaseProductsDataSource**: 테스트에서만 주입, runtime에서 자동 사용하지 않음
- **setProducts disabled**: 대량 overwrite 금지
- **자동 전환 없음**: feature flag / config / auth session 기반 자동 전환 없음

### 인증 게이트 vs 업무 데이터 전환
- 인증 게이트 (3-4): 완료됨 — Supabase Auth와 연결
- 업무 데이터 전환 (3-5):
  - 3-5A: async boundary 준비 ✅
  - 3-5B: Products read path async ✅
  - 3-5C: Products write path async ✅
  - 3-5D: Products DataSource interface extraction ✅
  - 3-5E: Products Supabase mapping contract ✅
  - 3-5F: SupabaseProductsDataSource disabled skeleton ✅
  - 3-5G: Products Supabase read path local-only controlled test ✅
  - 3-5H: Products Supabase read local integration smoke ✅
  - 3-5I: Products Supabase write path local-only controlled contract ✅ (현재)
  - 다음: write path local integration smoke, runtime 전환 예정
- **아직 일반 앱 runtime은 localStorage 사용**
- 인증 게이트와 업무 데이터 전환은 여전히 분리되어 있음

### 제약 준수
- 실제 Supabase products write 호출: ✅ (controlled test only, runtime no)
- 활성 DataSource: LocalProductsDataSource (기본값, 변경 없음)
- getProductsDataSource() 기본값 변경: ❌ (no)
- 일반 runtime에서 SupabaseProductsDataSource 자동 활성화: ❌ (no)
- setProducts 대량 overwrite 구현: ❌ (no, disabled 유지)
- delete 방식: soft delete (deleted_at) — 실제 DELETE ❌
- 원격 Supabase 연결: ❌ (no)
- service_role 브라우저 사용: ❌ (no)
- service_role 값을 JS/browser 코드에 넣기: ❌ (no)
- localStorage key 변경: ❌ (no)
- 상품 스키마 변경: ❌ (no)
- products.js 변경: ❌ (no)
- js/config.js commit: ❌ (no)
- data_export.json 재추가: ❌ (no)

### 상세 문서
- Products write contract 상세: `docs/ASYNC_MIGRATION_MAP.md` §13

## 20. 3-5J: Products Supabase Write Local Integration Smoke (2026-07-19)

### 목표
3-5I에서 구현한 SupabaseProductsDataSource의 create/update/delete write methods를
실제 로컬 Supabase/Auth/RLS 환경에서 opt-in integration smoke test로 검증한다.
**일반 앱 runtime은 계속 LocalProductsDataSource를 사용하며 자동 전환되지 않는다.**

### Products DataSource 현재 상태

```
Runtime default: LocalProductsDataSource (localStorage)

Test-only (controlled / opt-in):
  SupabaseProductsDataSource (local-only read + write)
    ├─ listProducts()   → local integration 검증 완료 (동작)
    ├─ createProduct()  → local integration 검증 완료 (동작, created_at/updated_at NOT NULL 처리)
    ├─ updateProduct()  → DB column-level 권한 정책으로 차단 (updated_at UPDATE denied)
    │                     contract test W1-W21에서만 검증
    ├─ deleteProduct()  → local integration 검증 완료 (soft delete 동작, deleted_at column UPDATE 허용)
    └─ setProducts()    → throw "setProducts is not enabled" (disabled — bulk overwrite 금지)
```

### DB column-level 권한 정책
- `20260711000900_order_inventory_rpc.sql:957`에서 table-level `REVOKE UPDATE ON public.products FROM authenticated`
- 하지만 column-level GRANT가 별도로 존재:
  - `deleted_at` 컬럼: authenticated에 UPDATE 권한 → soft delete 동작
  - `updated_at` 컬럼: authenticated에 UPDATE 권한 없음 → updateProduct 차단
- 이로 인해:
  - `createProduct`: INSERT 권한으로 동작
  - `updateProduct`: `updated_at` 강제 업데이트 시도 시 403 → query failed
  - `deleteProduct`: `deleted_at`만 업데이트하므로 soft delete 성공

### Integration Test
- 파일: `tests/products-supabase-write-local.integration.mjs`
- opt-in: `RUN_LOCAL_SUPABASE_INTEGRATION=1` 환경 변수일 때만 실행
- 기본 `node --test`에서는 skip (네트워크 호출 없음)
- P1-P13 검증 항목 (13개)
- service_role은 setup/cleanup에만 사용, DataSource/browser에 전달 ❌

### 현재 Runtime 상태
- **활성 DataSource**: LocalProductsDataSource (기본값, 변경 없음)
- **데이터 저장**: localStorage (기존과 동일)
- **SupabaseProductsDataSource**: local integration test에서만 사용
- **setProducts disabled**: 대량 overwrite 금지
- **자동 전환 없음**: feature flag / config / auth session 기반 자동 전환 없음

### 인증 게이트 vs 업무 데이터 전환
- 인증 게이트 (3-4): 완료됨 — Supabase Auth와 연결
- 업무 데이터 전환 (3-5):
  - 3-5A: async boundary 준비 ✅
  - 3-5B: Products read path async ✅
  - 3-5C: Products write path async ✅
  - 3-5D: Products DataSource interface extraction ✅
  - 3-5E: Products Supabase mapping contract ✅
  - 3-5F: SupabaseProductsDataSource disabled skeleton ✅
  - 3-5G: Products Supabase read path local-only controlled test ✅
  - 3-5H: Products Supabase read local integration smoke ✅
  - 3-5I: Products Supabase write path local-only controlled contract ✅
  - 3-5J: Products Supabase write local integration smoke ✅ (현재)
  - 다음: runtime 전환 예정
- **아직 일반 앱 runtime은 localStorage 사용**
- 인증 게이트와 업무 데이터 전환은 여전히 분리되어 있음

### 제약 준수
- 활성 DataSource: LocalProductsDataSource (기본값, 변경 없음)
- getProductsDataSource() 기본값 변경: ❌ (no)
- 일반 runtime에서 SupabaseProductsDataSource 자동 활성화: ❌ (no)
- setProducts 대량 overwrite 구현: ❌ (no, disabled 유지)
- delete 방식: soft delete (deleted_at) — 실제 DELETE ❌
- 원격 Supabase 연결: ❌ (no)
- service_role 브라우저 사용: ❌ (no)
- service_role 값을 JS/browser 코드에 넣기: ❌ (no)
- service_role은 setup/cleanup에만 사용: ✅
- token/session/key console.log: ❌ (no)
- localStorage key 변경: ❌ (no)
- 상품 스키마 변경: ❌ (no)
- products.js 변경: ❌ (no)
- js/config.js commit: ❌ (no)
- data_export.json 재추가: ❌ (no)

### 상세 문서
- Products write local integration 상세: `docs/ASYNC_MIGRATION_MAP.md` §14

## 21. 3-5K: Products Write RPC Foundation (2026-07-20)

### 목표
3-5J에서 `updateProduct`가 DB column-level 권한 정책(`updated_at` UPDATE denied)으로 차단되는 문제를 발견했습니다.
이번 단계에서는 SECURITY DEFINER RPC를 추가하여 이 문제를 해결할 기반을 마련합니다.

**3-5K는 DB/RPC foundation only, no JS DataSource connection, no runtime conversion.**

### 배경
- `public.products` 테이블은 `authenticated` 역할에 대해 table-level UPDATE가 차단되어 있습니다.
- column-level GRANT로 `deleted_at` soft delete는 동작하지만, `updated_at` UPDATE 권한 부족으로 `updateProduct`가 차단됩니다.
- 따라서 `updateProduct` 성공 경로는 직접 table update가 아니라 SECURITY DEFINER RPC 기반으로 설계해야 합니다.

### 추가된 RPC

| RPC 함수 | 목적 |
|---|---|
| `public.create_product` | 상품 생성 (SECURITY DEFINER, owner/manager만 허용) |
| `public.update_product` | 상품 업데이트 (SECURITY DEFINER, immutable fields 보호) |
| `public.soft_delete_product` | 상품 soft delete (SECURITY DEFINER, 실제 DELETE 금지) |

### RPC 보안 속성
- **SECURITY DEFINER**: `postgres`로 실행, RLS 우회
- **SET search_path = ''**: 스키마 주입 방지
- **auth.uid() 필수**: 인증 확인
- **store membership + role check**: owner/manager만 허용, staff/non-member 차단
- **deleted store check**: 삭제된 스토어 접근 차단
- **cross-store access blocking**: 타 스토어 상품 접근 차단
- **No dynamic SQL**: 모든 쿼리가 정적
- **Explicit column lists**: `SELECT *` 또는 `RETURNING *` 금지
- **Public revoke**: `REVOKE ALL FROM PUBLIC`
- **Authenticated grant**: `GRANT EXECUTE TO authenticated`

### update_product immutable fields
- `id`: 변경 불가
- `legacy_id`: 변경 불가
- `store_id`: 변경 불가
- `created_at`: 변경 불가
- `created_by`: 변경 불가

### 현재 Runtime 상태
- **활성 DataSource**: LocalProductsDataSource (기본값, 변경 없음)
- **데이터 저장**: localStorage (기존과 동일)
- **JS SupabaseProductsDataSource**: RPC로 연결되지 않음 (다음 단계에서 연결 예정)
- **일반 브라우저 상품 화면**: 계속 localStorage 사용

### 인증 게이트 vs 업무 데이터 전환
- 인증 게이트 (3-4): 완료됨 — Supabase Auth와 연결
- 업무 데이터 전환 (3-5):
  - 3-5A: async boundary 준비 ✅
  - 3-5B: Products read path async ✅
  - 3-5C: Products write path async ✅
  - 3-5D: Products DataSource interface extraction ✅
  - 3-5E: Products Supabase mapping contract ✅
  - 3-5F: SupabaseProductsDataSource disabled skeleton ✅
  - 3-5G: Products Supabase read path local-only controlled test ✅
  - 3-5H: Products Supabase read local integration smoke ✅
  - 3-5I: Products Supabase write path local-only controlled contract ✅
  - 3-5J: Products Supabase write local integration smoke ✅
  - 3-5K: Products Write RPC Foundation ✅ (현재)
  - 다음: JS DataSource를 RPC로 연결, runtime 전환 예정
- **아직 일반 앱 runtime은 localStorage 사용**
- 인증 게이트와 업무 데이터 전환은 여전히 분리되어 있음

### 제약 준수
- JS DataSource RPC 연결: ❌ (no, 다음 단계)
- getProductsDataSource() 기본값 변경: ❌ (no)
- 일반 runtime에서 SupabaseProductsDataSource 자동 활성화: ❌ (no)
- Products 화면 Supabase 자동 전환: ❌ (no)
- UI 리뉴얼: ❌ (no)
- 원격 Supabase 연결: ❌ (no)
- service_role 브라우저 사용: ❌ (no)
- service_role 값 JS/browser 코드에 넣기: ❌ (no)
- localStorage prefix 변경: ❌ (no)
- products.js 변경: ❌ (no)
- data_export.json 재추가: ❌ (no)
- js/db.js 변경: ❌ (no)
- js/config.js commit: ❌ (no)

### 상세 문서
- Products write RPC 상세: `docs/SUPABASE_PRODUCTS_WRITE_RPC.md`
- ASYNC_MIGRATION_MAP: `docs/ASYNC_MIGRATION_MAP.md` §15

## 22. 3-5L: Connect Controlled Products DataSource to Write RPCs (2026-07-20)

### 목표
3-5K에서 추가한 SECURITY DEFINER RPC (`create_product`, `update_product`, `soft_delete_product`)를
JS SupabaseProductsDataSource의 write methods에 연결합니다.

**3-5L은 JS DataSource write methods를 RPC로 연결만 하며, 일반 앱 runtime 전환은 하지 않습니다.**

### 변경 내용

#### js/db.js — write methods를 RPC 기반으로 변경
- `createProduct(product)`: `client.rpc('create_product', payload)` 사용
- `updateProduct(id, updates)`: `client.rpc('update_product', payload)` 사용
- `deleteProduct(id)`: `client.rpc('soft_delete_product', payload)` 사용
- `setProducts(products)`: 계속 disabled
- `listProducts()`: 기존 local-only controlled read 유지

#### RPC payload 구성
- `p_` 접두사 파라미터 사용
- `p_store_id`: context.storeId로 강제
- `p_legacy_id`: id 파라미터
- 위험 필드(id/legacy_id/store_id/created_at/created_by)는 payload에서 제외
- RPC 내부에서 updated_by/updated_at/deleted_at 설정

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

### Progress
- 3-5A: Data Gateway Async Boundary Preparation ✅
- 3-5B: Products Read Path Async Boundary ✅
- 3-5C: Products Write Path Async Boundary Preparation ✅
- 3-5D: Products DataSource Interface Extraction ✅
- 3-5E: Products Supabase mapping contract ✅
- 3-5F: SupabaseProductsDataSource disabled skeleton ✅
- 3-5G: Products Supabase read path local-only controlled test ✅
- 3-5H: Products Supabase read local integration smoke ✅
- 3-5I: Products Supabase write path local-only controlled contract ✅
- 3-5J: Products Supabase write local integration smoke ✅
- 3-5K: Products Write RPC Foundation ✅
- 3-5L: Connect Controlled Products DataSource to Write RPCs ✅ (현재)
- 다음: 실제 앱 runtime 전환 (feature flag 기반)
- **아직 일반 앱 runtime은 localStorage 사용**
- 인증 게이트와 업무 데이터 전환은 여전히 분리되어 있음

### 제약 준수
- JS DataSource RPC 연결: ✅ (완료)
- getProductsDataSource() 기본값 변경: ❌ (no)
- 일반 runtime에서 SupabaseProductsDataSource 자동 활성화: ❌ (no)
- Products 화면 Supabase 자동 전환: ❌ (no)
- UI 리뉴얼: ❌ (no)
- 원격 Supabase 연결: ❌ (no)
- service_role 브라우저 사용: ❌ (no)
- service_role 값 JS/browser 코드에 넣기: ❌ (no)
- localStorage prefix 변경: ❌ (no)
- products.js 변경: ❌ (no)
- supabase migrations/tests 변경: ❌ (no)
- data_export.json 재추가: ❌ (no)
- js/config.js commit: ❌ (no)

### 상세 문서
- Products write RPC 상세: `docs/SUPABASE_PRODUCTS_WRITE_RPC.md`
- ASYNC_MIGRATION_MAP: `docs/ASYNC_MIGRATION_MAP.md` §16

## 23. 3-5M: Products Runtime DataSource Feature Flag Gate (2026-07-20)

### 목표
Products DataSource runtime 전환을 위한 feature flag gate만 추가한다.
**아직 실제 원격 Supabase 전환, UI 리뉴얼, Orders/Customers 전환은 하지 않는다.**

### 핵심 원칙
- 기본 runtime은 반드시 LocalProductsDataSource 유지
- PRODUCTS_SUPABASE_ENABLED가 명시적으로 true일 때만 Products Supabase DataSource 후보가 될 수 있음
- 실패하면 조용히 LocalProductsDataSource로 fallback하지 않고, 명확한 error throw
- 단, 기본값 false에서는 기존 앱 동작이 절대 바뀌지 않음

### LESOUL_CONFIG.PRODUCTS_SUPABASE_ENABLED
- 기본값: `false` (js/config.example.js)
- `true`로 설정하더라도 다른 필수 조건이 모두 충족되어야 SupabaseProductsDataSource 후보가 됨

### SupabaseProductsDataSource 활성화 조건 (모두 true 필요)
1. LESOUL_CONFIG 존재
2. LESOUL_CONFIG.SUPABASE_ENABLED === true
3. LESOUL_CONFIG.PRODUCTS_SUPABASE_ENABLED === true
4. LESOULSupabase.isInitialized() === true
5. LESOULSupabase.getClient() 존재
6. activeMembership.storeId 존재 (LESOULAppBootstrap.getContext())
7. URL이 localhost / 127.0.0.1
8. service_role key가 아님
9. client 명시적 존재

### ProductsDataSource 선택 로직
```
getProductsDataSource()
  → _resolveRuntimeProductsDataSource()
    → PRODUCTS_SUPABASE_ENABLED !== true → null → LocalProductsDataSource (조용히)
    → PRODUCTS_SUPABASE_ENABLED === true + 필수 조건 실패 → throw Error
    → PRODUCTS_SUPABASE_ENABLED === true + 모든 조건 충족 → SupabaseProductsDataSource
```

### 현재 활성 DataSource
- **LocalProductsDataSource**: 기본 활성 상태 유지
- `getProductsDataSource()` 기본값 = LocalProductsDataSource
- PRODUCTS_SUPABASE_ENABLED === false → LocalProductsDataSource
- SupabaseProductsDataSource는 controlled (local-only, RPC-based write)

### Progress
- 3-5A: Data Gateway Async Boundary Preparation ✅
- 3-5B: Products Read Path Async Boundary ✅
- 3-5C: Products Write Path Async Boundary Preparation ✅
- 3-5D: Products DataSource Interface Extraction ✅
- 3-5E: Products Supabase mapping contract ✅
- 3-5F: SupabaseProductsDataSource disabled skeleton ✅
- 3-5G: Products Supabase read path local-only controlled test ✅
- 3-5H: Products Supabase read local integration smoke ✅
- 3-5I: Products Supabase write path local-only controlled contract ✅
- 3-5J: Products Supabase write local integration smoke ✅
- 3-5K: Products Write RPC Foundation ✅
- 3-5L: Connect Controlled Products DataSource to Write RPCs ✅
- 3-5M: Products Runtime DataSource Feature Flag Gate ✅ (현재)
- 다음: 원격 Supabase 연결 허용, Orders/Customers/Analytics 전환
- **아직 일반 앱 runtime은 localStorage 사용**
- 인증 게이트와 업무 데이터 전환은 여전히 분리되어 있음

### 제약 준수
- PRODUCTS_SUPABASE_ENABLED 기본값 false: ✅
- getProductsDataSource() 기본값 LocalProductsDataSource: ✅
- products.js 변경: ❌ (no)
- app.js 변경: ❌ (no)
- supabase migrations/tests 변경: ❌ (no)
- 원격 supabase.co URL 허용: ❌ (no)
- service_role 브라우저 사용: ❌ (no)
- UI 리뉴얼: ❌ (no)
- data_export.json 재추가: ❌ (no)
- js/config.js commit: ❌ (no)

### 상세 문서
- ASYNC_MIGRATION_MAP: `docs/ASYNC_MIGRATION_MAP.md` §17

## 24. 3-5N: Products Local Runtime Activation Smoke (2026-07-20)

### 목표
3-5M에서 구현한 Products runtime feature flag gate를 **local Supabase 환경에서 실제로 활성화**하여,
SupabaseProductsDataSource가 정상 선택되고 read/write가 정상 동작하는지 end-to-end로 검증한다.

**아직 원격 Supabase 연결, UI 리뉴얼, Orders/Customers/Analytics 전환은 하지 않는다.**

### 핵심 원칙
- 기본 runtime은 계속 **LocalProductsDataSource**
- `PRODUCTS_SUPABASE_ENABLED` 기본값 **false** 유지
- 실제 활성화 테스트는 opt-in / local-only로만 진행
- `js/config.js`는 로컬 테스트용으로만 사용하고 절대 commit 금지
- remote supabase.co URL은 계속 금지
- service_role은 setup/cleanup에만 사용, browser/DataSource/runtime에 전달 금지
- products.js 변경 없음
- app.js 변경 없음
- UI 리뉴얼 없음

### 현재 ProductsDataSource 상태
```
getProductsDataSource()
  ├─ 기본값 (PRODUCTS_SUPABASE_ENABLED=false) → LocalProductsDataSource (localStorage)
  └─ opt-in local activation (모든 조건 충족 시) → SupabaseProductsDataSource
       ├─ name: 'SupabaseProductsDataSource'
       ├─ listProducts()   → client.from('products').select('*').eq('store_id', ...).is('deleted_at', null)
       ├─ createProduct()  → client.rpc('create_product', payload)
       ├─ updateProduct()  → client.rpc('update_product', payload)
       ├─ deleteProduct()  → client.rpc('soft_delete_product', payload)  (soft delete)
       └─ setProducts()   → disabled (throws)
```

### Runtime Activation 조건 (모두 충족 시 SupabaseProductsDataSource)
1. `LESOUL_CONFIG.SUPABASE_ENABLED === true`
2. `LESOUL_CONFIG.PRODUCTS_SUPABASE_ENABLED === true`
3. `LESOULSupabase.isInitialized() === true`
4. `LESOULSupabase.getClient()` 존재 (anon-authenticated)
5. `LESOULAppBootstrap.getContext().activeMembership.storeId` 존재
6. URL이 localhost / 127.0.0.1 (local-only)
7. client key가 service_role이 아님

### listProducts controlled read 규칙
- `store_id = :store_id` (강제)
- `deleted_at IS NULL` (soft delete된 행 제외)
- owner라도 deleted 행은 listProducts에 포함되지 않음
- 직접 raw query로는 접근 가능하나, DataSource 계층에서는 명시적 필터링

### Write methods
- `createProduct`: `create_product` RPC (SECURITY DEFINER, store_id 강제)
- `updateProduct`: `update_product` RPC (SECURITY DEFINER, legacy_id + store_id 조건)
- `deleteProduct`: `soft_delete_product` RPC (SECURITY DEFINER, deleted_at 설정, hard DELETE 아님)
- `setProducts`: **disabled** (bulk overwrite 금지)

### Progress
- 3-5A: Data Gateway Async Boundary Preparation ✅
- 3-5B: Products Read Path Async Boundary ✅
- 3-5C: Products Write Path Async Boundary Preparation ✅
- 3-5D: Products DataSource Interface Extraction ✅
- 3-5E: Products Supabase mapping contract ✅
- 3-5F: SupabaseProductsDataSource disabled skeleton ✅
- 3-5G: Products Supabase read path local-only controlled test ✅
- 3-5H: Products Supabase read local integration smoke ✅
- 3-5I: Products Supabase write path local-only controlled contract ✅
- 3-5J: Products Supabase write local integration smoke ✅
- 3-5K: Products Write RPC Foundation ✅
- 3-5L: Connect Controlled Products DataSource to Write RPCs ✅
- 3-5M: Products Runtime DataSource Feature Flag Gate ✅
- 3-5N: Products Local Runtime Activation Smoke ✅ (현재)
- 다음: 원격 Supabase 연결 허용 검토, Orders/Customers/Analytics 전환
- **일반 앱 기본 runtime은 여전히 LocalProductsDataSource (localStorage)**
- 인증 게이트와 업무 데이터 전환은 여전히 분리되어 있음

### 제약 준수
- PRODUCTS_SUPABASE_ENABLED 기본값 false: ✅
- getProductsDataSource() 기본값 LocalProductsDataSource: ✅
- local-only opt-in activation: ✅

## 25. 3-5O: Products Local Browser Runtime Smoke (2026-07-20)

### 목표
3-5N에서 Node integration으로 검증한 Products runtime activation을 실제 브라우저 상품 화면에서 local-only flag-on 상태로 수동 검증한다.

### Architecture 상태

```
┌─────────────────────────────────────────────────────────────┐
│ Browser Runtime                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ LESOUL_CONFIG (js/config.js — ignored, local-only) │   │
│  │  SUPABASE_ENABLED: true                             │   │
│  │  PRODUCTS_SUPABASE_ENABLED: true                    │   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                  │
│  ┌───────────────────────┴───────────────────────┐         │
│  │ DB.getProductsDataSource()                     │         │
│  │  → SupabaseProductsDataSource (flag-on)        │         │
│  │  → LocalProductsDataSource (flag-off/default)  │         │
│  └────────────────────────────────────────────────┘         │
│                          │                                  │
│  ┌───────────────────────┴───────────────────────┐         │
│  │ Products.js (변경 없음)                         │         │
│  │  saveProduct() → DB.addProductAsync()          │         │
│  │  editProduct() → DB.updateProductAsync()       │         │
│  │  deleteProduct() → DB.deleteProductAsync()     │         │
│  └────────────────────────────────────────────────┘         │
│                          │                                  │
│  ┌───────────────────────┴───────────────────────┐         │
│  │ SupabaseProductsDataSource                     │         │
│  │  createProduct() → create_product RPC          │         │
│  │  updateProduct() → update_product RPC          │         │
│  │  deleteProduct() → soft_delete_product RPC     │         │
│  │  listProducts() → controlled read (local-only) │         │
│  │  setProducts() → disabled                      │         │
│  └────────────────────────────────────────────────┘         │
└─────────────────────────────────────────────────────────────┘
```

### 브라우저 smoke 결과

| 항목 | flag-on | flag-off |
|---|---|---|
| `DB.getProductsDataSource().name` | SupabaseProductsDataSource | LocalProductsDataSource |
| 로그인 | ✅ | N/A (local 모드) |
| store 선택 | ✅ | N/A |
| Products 페이지 진입 | ✅ | ✅ |
| 상품 추가 | BLOCKED (인프라) | ✅ (localStorage) |
| 주문/고객/분석 | ✅ | ✅ |
| 로그아웃 | ✅ | N/A |

### 발견된 문제

#### `create_product` RPC missing from schema cache (PGRST202)
- **증상**: `SupabaseProductsDataSource.createProduct()` 호출 시 `PGRST202` / 404 에러
- **원인**: local Supabase 인프라(Docker container 상태) 문제
- **3-5N 대비**: 3-5N opt-in integration test에서는 정상 동작 → 코드 자체 문제가 아님
- **조치**: local Supabase 인프라 복구 후 재수행 필요

#### `legacy_id` 생성 누락 (수정 완료)
- **증상**: 신규 상품 `legacy_id`가 null → edit/delete URL이 `#/products/null/edit`
- **수정**: `js/db.js` `createProduct`에서 `p_legacy_id: row.legacy_id || Date.now()`로 변경

### Progress
- 3-5A: Data Gateway Async Boundary Preparation ✅
- 3-5B: Products Read Path Async Boundary ✅
- 3-5C: Products Write Path Async Boundary Preparation ✅
- 3-5D: Products DataSource Interface Extraction ✅
- 3-5E: Products Supabase mapping contract ✅
- 3-5F: SupabaseProductsDataSource disabled skeleton ✅
- 3-5G: Products Supabase read path local-only controlled test ✅
- 3-5H: Products Supabase read local integration smoke ✅
- 3-5I: Products Supabase write path local-only controlled contract ✅
- 3-5J: Products Supabase write local integration smoke ✅
- 3-5K: Products Write RPC Foundation ✅
- 3-5L: Connect Controlled Products DataSource to Write RPCs ✅
- 3-5M: Products Runtime DataSource Feature Flag Gate ✅
- 3-5N: Products Local Runtime Activation Smoke ✅
- 3-5O: Products Local Browser Runtime Smoke ⚠️ (flag-on write blocked by infra)
- 3-5O.1: Fix LESOUL Brand Setting & Re-run Local Browser Smoke ✅
- 3-5O.2: Clean Legacy Brand Leftover & Confirm Browser Smoke ✅
- 3-5O.3: Test Regression Recovery ✅
- 다음: 원격 Supabase 연결 허용 검토, Orders/Customers/Analytics 전환
- **일반 앱 기본 runtime은 여전히 LocalProductsDataSource (localStorage)**
- 인증 게이트와 업무 데이터 전환은 여전히 분리되어 있음

### 제약 준수
- PRODUCTS_SUPABASE_ENABLED 기본값 false: ✅
- getProductsDataSource() 기본값 LocalProductsDataSource: ✅
- local-only opt-in activation: ✅
- products.js 변경 없음: ✅
- app.js 변경 없음: ✅
- UI 리뉴얼 없음: ✅
- remote supabase.co URL 허용: ❌ (no)
- products.js 변경: ❌ (no)
- app.js 변경: ❌ (no)
- supabase migrations/tests 변경: ❌ (no)
- service_role 브라우저 사용: ❌ (no)
- UI 리뉴얼: ❌ (no)
- data_export.json 재추가: ❌ (no)
- js/config.js commit: ❌ (no)
- Orders/Customers/Analytics 전환: ❌ (no)

### 상세 문서
- ASYNC_MIGRATION_MAP: `docs/ASYNC_MIGRATION_MAP.md` §18

## 26. 3-5Q: Products Remote Runtime Guardrail Preparation (2026-07-21)

### 목표
Products Supabase runtime이 나중에 원격 Supabase 프로젝트에서도 안전하게 켜질 수 있도록 remote guardrail flag만 준비한다.
**실제 원격 Supabase 연결은 하지 않는다.**

### LESOUL_CONFIG.PRODUCTS_SUPABASE_REMOTE_ENABLED
- 기본값: `false` (js/config.example.js)
- `true`로 설정하더라도 다른 필수 조건이 모두 충족되어야 SupabaseProductsDataSource 후보가 됨
- remote URL이 감지되면 이 flag가 명시적으로 `true`여야만 후보 생성 가능

### ProductsDataSource URL 허용 정책

| URL 유형 | 조건 | 결과 |
|---|---|---|
| local URL (localhost / 127.0.0.1) | `PRODUCTS_SUPABASE_ENABLED=true` + 기타 조건 충족 | 허용 (SupabaseProductsDataSource 후보) |
| remote URL (supabase.co) | `PRODUCTS_SUPABASE_REMOTE_ENABLED=false` | 차단 (error: "Products Supabase remote runtime is not enabled") |
| remote URL (supabase.co) | `PRODUCTS_SUPABASE_REMOTE_ENABLED=true` + `PRODUCTS_SUPABASE_ENABLED=true` + 기타 조건 충족 | 후보 허용 (SupabaseProductsDataSource) |

### _validateWriteContext 지원
- `db.js`의 `_validateWriteContext(context)`가 `context.localOnly`와 `context.remoteEnabled` 모두 지원
- `context.localOnly === true`: local-only 조건 검증 (기존 동작)
- `context.remoteEnabled === true`: remote 허용 조건 검증 (3-5Q 추가)
- `service_role` key는 `remoteEnabled === true`라도 계속 차단

### SupabaseProductsDataSource 활성화 조건 (remote URL 시)
1. LESOUL_CONFIG 존재
2. LESOUL_CONFIG.SUPABASE_ENABLED === true
3. LESOUL_CONFIG.PRODUCTS_SUPABASE_ENABLED === true
4. LESOUL_CONFIG.PRODUCTS_SUPABASE_REMOTE_ENABLED === true
5. LESOULSupabase.isInitialized() === true
6. LESOULSupabase.getClient() 존재
7. activeMembership.storeId 존재
8. URL이 supabase.co 패턴 (remote)
9. service_role key가 아님
10. client 명시적 존재

### 현재 활성 DataSource
- **LocalProductsDataSource**: 계속 기본 활성 상태 유지
- `PRODUCTS_SUPABASE_ENABLED === false` → LocalProductsDataSource
- `PRODUCTS_SUPABASE_REMOTE_ENABLED === false`에서 remote URL → 차단 (error throw)
- remote flag `true` + 모든 조건 충족 시에만 SupabaseProductsDataSource 후보

### 제약 준수
- PRODUCTS_SUPABASE_REMOTE_ENABLED 기본값 false: ✅
- products.js 변경: ❌ (no)
- css/style.css 변경: ❌ (no)
- supabase migrations/tests 변경: ❌ (no)
- 실제 원격 Supabase 연결: ❌ (no, flag만 준비)
- service_role 브라우저 사용: ❌ (no)
- js/config.js commit: ❌ (no)
- data_export.json 재추가: ❌ (no)

### 상세 문서
- ASYNC_MIGRATION_MAP: `docs/ASYNC_MIGRATION_MAP.md` §24

## 27. 3-5R: Remote Supabase Deployment Readiness Audit (2026-07-21)

### Remote Deployment Runbook
- 문서 위치: `docs/SUPABASE_REMOTE_DEPLOYMENT_RUNBOOK.md`
- 목적: 실제 원격 Supabase 연결 전 readiness audit 및 deployment 가이드
- **이 단계에서는 실제 remote 연결을 하지 않는다.**

### 현재 Runtime Default
- **기본 DataSource**: LocalProductsDataSource
- PRODUCTS_SUPABASE_ENABLED: false
- PRODUCTS_SUPABASE_REMOTE_ENABLED: false

### Remote Guardrail Status
- remote URL + PRODUCTS_SUPABASE_REMOTE_ENABLED=false → 차단
- remote URL + PRODUCTS_SUPABASE_REMOTE_ENABLED=true + 모든 조건 → 후보 허용
- service_role key는 remote flag true라도 계속 차단

### Deployment Readiness Checklist
1. Git working tree clean
2. feature/supabase-cloud-migration 브랜치에서만 진행
3. GitHub Support purge ticket 아직 닫지 않음 → main/gh-pages force push 금지
4. git filter-repo 재실행 금지
5. data_export.json 없음
6. js/config.js 없음 (gitignored)
7. service_role key가 JS/browser/repo에 없음
8. local DB lint PASS
9. pgTAP PASS
10. 전체 JS 테스트 PASS

### Allowed Browser Config
- SUPABASE_ENABLED=true
- PRODUCTS_SUPABASE_ENABLED=true
- PRODUCTS_SUPABASE_REMOTE_ENABLED=true
- SUPABASE_URL=remote project URL
- SUPABASE_CLIENT_KEY=publishable/anon key only
- APP_BRAND_NAME='LESOUL' 또는 사용자 브랜드명

### Forbidden Secrets
- service_role key
- secret key
- database password
- JWT secret
- access token
- refresh token
- personal access token
- data_export.json 내용
- 실제 고객/상품 private export

## 28. 3-5S: Remote Config Template and Secret Safety Check (2026-07-21)

### Remote Config Template
- 문서 위치: `docs/SUPABASE_REMOTE_CONFIG_TEMPLATE.md`
- 목적: 실제 remote deployment 전 ignored `js/config.js` 수동 생성 시 참고
- **실제 key, token, project URL을 넣지 않음**
- placeholder만 사용: `YOUR_PROJECT_REF`, `YOUR_PUBLISHABLE_OR_ANON_KEY_ONLY`

### js/config.js Local-Only Ignored File 원칙
- `js/config.js`는 `.gitignore` 대상
- **절대 commit하지 않음**
- 개발자 로컬에서만 수동 생성
- git status에서 staged 되면 즉시 unstage
- 배포 환경에서는 안전한 방식으로 주입

### Default Runtime
- 기본 DataSource: **LocalProductsDataSource**
- PRODUCTS_SUPABASE_ENABLED: false
- PRODUCTS_SUPABASE_REMOTE_ENABLED: false
- SUPABASE_ENABLED: false
- APP_BRAND_NAME: LESOUL

### Secret Safety
- service_role key 금지
- secret key 금지
- database password 금지
- JWT secret 금지
- token/session/key console.log 금지
- data_export 내용 금지
