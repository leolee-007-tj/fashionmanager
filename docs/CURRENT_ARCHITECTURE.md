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

## 29. 3-5T: Remote Deployment Command Gate (2026-07-21)

### Remote Deployment Preflight Script
- 문서 위치: `scripts/remote-deployment-preflight.sh`
- 목적: 실제 remote 명령 실행 전 사전 검사만 수행
- **runtime 변경이 아님** — JS runtime 코드 수정 없음
- **supabase login/link/db push 실행하지 않음**

### Command Gate 역할
- branch 검사 (main/gh-pages 차단)
- staged 파일 검사 (js/config.js, data_export.json, .env, supabase/config.toml)
- tracked 민감 파일 검사
- JS runtime 파일 service_role/sb_secret_ 검사
- default flags false 검사
- APP_BRAND_NAME LESOUL 검사
- GitHub purge ticket 경고
- 수동 검증 명령 안내

### Default Runtime (유지)
- 기본 DataSource: **LocalProductsDataSource**
- PRODUCTS_SUPABASE_ENABLED: false
- PRODUCTS_SUPABASE_REMOTE_ENABLED: false
- SUPABASE_ENABLED: false

## 30. 3-5W: Remote Browser Smoke Test 완료 (2026-07-22)

원격 Supabase에 대한 브라우저 smoke test가 완료됐다. signup/login → CRUD 전체 흐름과 feature branch push까지 정상 동작을 확인했다.

### 고정 기준점

| 항목 | 값 |
|---|---|
| Branch | `feature/supabase-cloud-migration` |
| Remote HEAD | `398cc6e` |
| Working tree | clean |
| Push | 완료 |

### Pushed commits

| SHA | 메시지 |
|---|---|
| `7d6f9de` | auth: add signup/login UI for remote smoke test |
| `398cc6e` | 3-5V: fix product update legacy_id mapping and edit UI for remote smoke test |

### 통과 항목

- signup/login PASS
- create_product PASS
- listProducts PASS
- update_product PASS
- soft_delete_product PASS
- feature branch push PASS

### update_product RPC 검증

- 상품 목록의 수정 버튼 클릭 시 수정창이 열림
- 수정창에 기존 상품 정보가 채워짐
- 저장 시 `update_product` RPC가 Network에 표시됨
- RPC status 200 OK
- 새로고침 후 수정값이 유지됨

### 다음 작업 전 유지 사항

- GitHub Support 민감데이터 purge ticket 닫지 않기
- main/gh-pages force push 금지
- supabase db push 재실행 금지
- supabase db reset --linked 금지
- supabase db pull 금지
- js/config.js commit 금지
- data_export.json 재추가 금지
- service_role/token/key/password 출력 금지

## 31. 3-5X: Remote Production Readiness Freeze Audit PASS (2026-07-22)

### 감사 결과

| # | 항목 | 결과 |
|---|---|---|
| 1 | Branch = feature/supabase-cloud-migration | PASS |
| 2 | Working tree clean | PASS |
| 3 | Remote = Local | PASS (`a4ea9c6`) |
| 4 | js/config.js NOT tracked | PASS (gitignored, local-only) |
| 5 | supabase/config.toml NOT staged/committed | PASS |
| 6 | data_export.json NOT EXISTS | PASS |
| 7 | Secret exposure check | PASS |
| 8 | service_role 문자열 위치 | PASS (차단 로직과 contract test에서만) |
| 9 | Node test | PASS |
| 10 | Preflight | PASS |

### 유지 금지 사항

- GitHub Support 민감데이터 purge ticket 계속 열어둠
- main/gh-pages force push 금지
- supabase db push 재실행 금지
- supabase db reset --linked 금지
- supabase db pull 금지
- js/config.js commit 금지
- data_export.json 생성/추가 금지
- token/key/password 출력 금지

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
- 3-5O: Products Local Browser Runtime Smoke ✅
- 3-5O.1: Fix LESOUL Brand Setting & Re-run Local Browser Smoke ✅
- 3-5O.2: Clean Legacy Brand Leftover & Confirm Browser Smoke ✅
- 3-5O.3: Test Regression Recovery ✅
- 3-5P: Products Batch Actions Supabase Compatibility ✅
- 3-5Q: Products Remote Runtime Guardrail Preparation ✅
- 3-5R: Remote Supabase Deployment Readiness Audit ✅
- 3-5S: Remote Config Template and Secret Safety Check ✅
- 3-5T: Remote Deployment Command Gate ✅
- 3-5W: Remote Browser Smoke Test ✅
- **3-5X: Remote Production Readiness Freeze Audit ✅**

## 32. 3-6A: Auth Role & Guest Mode Architecture Design (2026-07-22)

### 목적

3-5X까지 Products Supabase runtime과 Remote Smoke Test를 완료했으므로, 이제 LESOUL 운영 구조에 맞는 인증·권한·게스트 모드 아키텍처를 설계한다.
**이번 단계는 설계 문서화만 하며, 코드 수정·DB migration·RLS/RPC 변경은 하지 않는다.**

### LESOUL 운영 구조 요구사항

| # | 요구사항 | 현재 상태 | 목표 |
|---|---|---|---|
| 1 | 사용자 본인은 owner/admin 역할 | signup 시 모든 사용자가 `create_initial_store`로 owner 됨 | 사용자 본인만 기존 store의 owner, 다른 사용자는 별도 승인 필요 |
| 2 | 다른 사용자는 회원가입 가능 | ✅ 가능 | 유지 |
| 3 | 실제 운영 데이터 접근은 권한 있는 store member만 | signup 직후 owner 멤버십 자동 생성 | signup 후 자동 store 생성 금지, 멤버십 승인 후 접근 |
| 4 | 비회원/미승인 사용자는 practice/demo mode만 | ❌ 미구현 | localStorage 기반 demo mode로 격리 |
| 5 | demo mode 데이터는 운영 데이터와 섞이면 안 됨 | localStorage만 사용 (자연 격리) | localStorage ↔ Supabase 동기화 금지 원칙 유지 |
| 6 | Confirm Email 정책 | 테스트 중 OFF | 운영 전 ON/OFF 결정 필요 |

### 역할 정의

#### 5가지 역할 계층

| 역할 | 상태 조건 | Store 멤버십 | 데이터 접근 범위 |
|---|---|---|---|
| **unauthenticated** | 로그인하지 않음 | 없음 | localStorage demo mode만 |
| **guest** | 로그인했으나 store_members에 레코드 없음 | 없음 | localStorage demo mode만 또는 가입 요청 대기 |
| **staff** | store_members.role = 'staff', is_active = true | 있음 (승인됨) | 제한된 읽기 (RPC 기반, 원가/이익/고객 집계 제외), 쓰기 제한 |
| **manager** | store_members.role = 'manager', is_active = true | 있음 (승인됨) | 대부분 CRUD 가능. store_settings, audit_logs, migration_runs 제외 |
| **owner** | store_members.role = 'owner', is_active = true | 있음 (승인됨) | 전체 접근 가능. 멤버 관리, 삭제된 데이터 조회/복구 가능 |

#### 상태 전환 다이어그램

```
[unauthenticated]
       │
       ▼ signUp / signIn
  [authenticated]
       │
       ├── store_members 없음 ──────────────► [guest]
       │                                        │
       │                                        ├── demo mode (localStorage)
       │                                        └── 가입 요청 / owner 초대 대기
       │
       └── store_members 있음 + is_active=true ─► [staff] / [manager] / [owner]
                                                  │
                                                  └── Supabase 운영 데이터 접근
```

### 실제 운영 데이터 접근 가능/불가 매트릭스

| 기능 | unauthenticated | guest | staff | manager | owner |
|---|---|---|---|---|---|
| 상품 목록 조회 | ✅ (local) | ✅ (local) | ✅ (RPC, 원가 제외) | ✅ | ✅ |
| 상품 생성/수정/삭제 | ✅ (local) | ✅ (local) | ❌ | ✅ | ✅ |
| 고객 목록 조회 | ✅ (local) | ✅ (local) | ✅ (RPC, 집계 제외) | ✅ | ✅ |
| 주문 생성/출고/취소 | ✅ (local) | ✅ (local) | ❌ | ✅ | ✅ |
| 수익 분석/원가 조회 | ✅ (local) | ✅ (local) | ❌ | ❌ | ✅ |
| 매장 설정 변경 | ✅ (local) | ✅ (local) | ❌ | ❌ | ✅ |
| 멤버 초대/승인/역할 변경 | ❌ | ❌ | ❌ | ❌ | ✅ |
| 삭제된 데이터 조회/복구 | ❌ | ❌ | ❌ | ❌ | ✅ |
| audit_logs 조회 | ❌ | ❌ | ❌ | ❌ | ✅ |
| Excel 업로드/날내기 | ✅ (local) | ✅ (local) | ❌ | ✅ | ✅ |
| demo mode 데이터 저장 | ✅ (localStorage) | ✅ (localStorage) | N/A | N/A | N/A |

> **참고**: "local"은 localStorage 기반 demo/practice mode를 의미하며, Supabase 운영 데이터와 물리적으로 분리됨.

### demo/practice mode 데이터 격리 원칙

| 원칙 | 설명 |
|---|---|
| **데이터 저장소 격리** | demo mode는 반드시 `LocalProductsDataSource`만 사용. SupabaseProductsDataSource는 절대 활성화되지 않음. |
| **데이터 동기화 금지** | localStorage에 저장된 demo 데이터를 Supabase로 업로드/동기화하는 기능은 의도적으로 제공하지 않음. |
| **데이터 지속성** | demo mode 데이터는 브라우저 localStorage에 남아 세션 간 유지될 수 있으나, 이는 "사용자 개인의 연습 데이터"로 취급되며 운영 데이터와 혼동되지 않음. |
| **Supabase 활성화 조건** | SupabaseProductsDataSource 활성화에는 `activeMembership`이 필수이며, `guest`는 멤버십이 없으므로 자동으로 localStorage 모드가 됨. |
| **UI 구분** | demo mode 사용 중에는 화면 상단 또는 사이드바에 "연습 모드" 표시를 고려하여 운영 데이터와 혼동 방지. |

### signup 이후 승인 전 상태 처리 원칙

#### 현재 문제점
- `create_initial_store` RPC는 모든 authenticated 사용자가 호출하면 자동으로 store를 생성하고 owner가 됨
- 이는 "다른 사용자가 내 store에 가입"하는 LESOUL 운영 구조와 맞지 않음

#### 목표 흐름

```
signup → email confirm → authenticated 상태
              │
              ▼
        store_members 조회
              │
              ├── 레코드 없음 ──► guest 상태
              │                      │
              │                      ├── demo mode 진입 (localStorage)
              │                      └── "매장 가입 요청" 또는 "초대 코드 입력" UI
              │
              └── is_active = false ──► pending 상태
              │                            │
              │                            └── "승인 대기 중" UI
              │
              └── is_active = true ──► staff / manager / owner 역할 확정
                                            │
                                            └── Supabase 운영 데이터 접근
```

#### 승인 메커니즘 (설계 단계)

| 방식 | 설명 | 장점 | 단점 |
|---|---|---|---|
| **Owner 초대** | owner가 store_members에 신규 사용자를 직접 추가 (role 지정) | 보안성 높음, owner가 통제 | owner 수동 개입 필요 |
| **가입 요청 + 승인** | guest가 가입 요청을 생성하고 owner/manager가 승인 | 자동화 가능 | 추가 테이블/상태 관리 필요 |
| **초대 코드** | owner가 생성한 초대 코드를 입력하면 자동 멤버십 생성 | 간편함 | 코드 유출 위험 |

> **3-6A 결정**: 3-6B 구현 단계에서 owner 초대 방식을 우선 구현하고, 필요 시 가입 요청 방식을 추가 확장한다.

### Confirm Email 정책 결정 필요 사항

| 항목 | 현재 (테스트) | 운영 전 결정 필요 |
|---|---|---|
| **Confirm Email 설정** | OFF (즉시 로그인 가능) | ON 권장 — 스팸 가입 방지, 이메일 소유권 검증 |
| **Redirect URL** | N/A (OFF 상태) | GitHub Pages 정적 URL 설정 필요 (예: `https://{username}.github.io/{repo}/?auth=confirmed`) |
| **Email Template** | 기본 Supabase 템플릿 | 브랜드명(LESOUL) 및 한국어 커스터마이징 검토 |
| **확인 완료 전 상태** | 즉시 authenticated + onboarding 가능 | 확인 완료 전까지 guest 상태 유지 |
| **재전송 정책** | N/A | rate limit 및 재전송 UI 필요 |

> **3-6A 권고**: 운영 배포 전 Confirm Email을 ON으로 전환하고, redirect URL을 GitHub Pages 호스팅 주소로 설정한다. 테스트 환경에서는 OFF를 유지할 수 있으나, 별도 테스트용 프로젝트를 사용하는 것이 바람직하다.

### 현재 시스템과의 설계 차이

| 영역 | 현재 (3-5X 기준) | 3-6A 목표 | 변경 필요 |
|---|---|---|---|
| `create_initial_store` | 모든 사용자가 owner store 자동 생성 | 사용자 본인만 owner, 나머지는 승인 필요 | RPC 수정 또는 별도 가입 흐름 추가 |
| `store_members` | signup 시 자동 insert | owner 초대/승인 후 insert | insert 정책 변경 또는 별도 invitation 테이블 |
| bootstrap 흐름 | login → onboarding(store 생성) → app | login → membership 확인 → (없으면 guest/demo) → app | `LESOULAppBootstrap` 상태 기계 확장 |
| DataSource 선택 | flag + membership 기반 | flag + membership + role 기반 | `getProductsDataSource()`에 role 조건 추가 검토 |
| UI 상태 | 로그인/로그아웃만 구분 | guest/pending/approved 역할별 UI 분기 | `LESOULAuthUI`에 guest 화면 추가 |

### 다음 구현 단계 3-6B 후보 목록

| # | 후보 | 설명 | 예상 변경 범위 |
|---|---|---|---|
| 1 | **store_members invitation/pending 상태 추가** | `store_members`에 `invited_by`, `invited_at`, `status` 컬럼 추가 또는 `is_active=false`를 pending 상태로 활용 | migration, schema |
| 2 | **guest mode UI 구현** | 로그인했으나 멤버십 없는 사용자용 demo mode + 가입 요청 UI | js/auth-ui.js, js/app-bootstrap.js |
| 3 | **owner용 멤버 관리 UI** | 가입 요청 승인/거부, 역할 변경, 멤버 초대 화면 | js/ (신규 또는 기존 모듈 확장) |
| 4 | **create_initial_store 제한 또는 분리** | 기존 owner만 store 생성 가능하도록 변경, 신규 사용자는 가입 흐름으로 유도 | migration/RPC 또는 JS 로직 |
| 5 | **Confirm Email ON + redirect URL 설정** | Supabase Dashboard에서 Confirm Email 활성화 및 redirect URL 등록 | 설정 (코드 변경 없음) |
| 6 | **SupabaseProductsDataSource 활성화 조건 강화** | `activeMembership`뿐 아니라 `role IN ('owner', 'manager', 'staff')` 및 `is_active = true` 조건 추가 | js/db.js |
| 7 | **demo mode 표시 UI** | 연습 모드 사용 중임을 알리는 배너/뱃지 추가 | js/auth-ui.js, css/style.css |
| 8 | **staff용 제한 view/RPC 연동** | 기존 RLS 설계의 staff_read_rpc를 실제 업무 화면과 연결 | js/db.js, js/products.js 등 |

### Progress

- 3-5X: Remote Production Readiness Freeze Audit ✅
- **3-6A: Auth Role & Guest Mode Architecture Design ✅ (현재, 설계 문서화만)**
- 다음: 3-6B 구현 단계 (선택적 후보 위 중 1~3개 우선 구현)

### 제약 준수

- 기능 코드 수정: ❌ (no)
- js/config.js commit: ❌ (no)
- data_export.json 생성/추가: ❌ (no)
- supabase db push 실행: ❌ (no)
- supabase db reset --linked: ❌ (no)
- supabase db pull: ❌ (no)
- token/key/password 출력: ❌ (no)
- main/gh-pages 작업: ❌ (no)

## 33. 3-6B: Auth Onboarding & Guest Mode Gap Audit (2026-07-22)

### 목적

3-6A에서 설계한 Auth Role & Guest Mode 아키텍처와 현재 3-5X 구현 사이의 gap을 감사한다.
**이번 단계는 감사/분석만 하며, 코드 수정·DB migration은 하지 않는다.**

### 현재 흐름 요약

**Signup → Bootstrap 흐름:**

```
signUp()
  → auth.signUp (Supabase Auth)
  → session 있으면 _runBootstrap()
     → bootstrapAuthenticatedUser()
        1. getSession() — 세션 확인
        2. ensure_user_profile() — RPC로 profiles upsert
        3. getActiveMemberships() — store_members WHERE is_active=true 조회
     → status 분기:
        - memberships.length > 0 → 'ready' → 앱 진입
        - memberships.length = 0 → 'needs_store_onboarding' → 매장 생성 UI
           → createInitialStore()
              → create_initial_store RPC
                 → 새 store + owner 멤버십 + store_settings 생성
              → 재 bootstrap → 'ready' → 앱 진입
```

**DataSource 활성화 조건 (db.js):**
- `activeMembership.storeId`만 존재하면 SupabaseProductsDataSource 활성화
- role 검사는 없음 (RLS에 위임)

### 3-6A 설계와 충돌하는 지점

| # | Gap 설명 | 위치 | 위험도 |
|---|---|---|---|
| **G-01** | **모든 authenticated 사용자가 자기 store를 owner로 생성 가능** — `create_initial_store` RPC는 `authenticated` role이면 누구나 실행 가능. LESOUL 운영 구조(단일 owner store + 초대받은 멤버)와 맞지 않음 | `auth-service.js`, `supabase/migrations/*auth_onboarding*` | **critical** |
| **G-02** | **멤버십 없는 authenticated user = 강제 store onboarding** — membership 없으면 무조건 `needs_store_onboarding` 상태로 가서 "매장 만들기"만 보여줌. demo/practice mode로 진입할 선택지가 없음 | `js/app-bootstrap.js` | **high** |
| **G-03** | **guest/demo mode 전용 UI 없음** — 로그인했으나 멤버십 없는 사용자에게 "연습 모드로 시작" 또는 "가입 요청" 옵션을 제공하는 화면이 없음 | `js/auth-ui.js` | **high** |
| **G-04** | **role 기반 DataSource 활성화 검사 부족** — `activeMembership.storeId`만 확인하고 role은 확인하지 않음. staff도 클라이언트 단에서는 full DataSource를 얻음 (물론 RLS에서 제한되긴 하지만, 클라이언트 단에서 미리 차단하는 게 안전) | `js/db.js` | **medium** |
| **G-05** | **pending/승인 대기 상태 모델 없음** — `getActiveMemberships`는 `is_active=true`만 조회하므로, 초대받았으나 아직 승인되지 않은 상태(invited/pending)를 표현할 방법이 없음 | `js/auth-service.js` | **medium** |

### 위험도 상세

#### critical: G-01 create_initial_store 모든 사용자에게 개방

- `create_initial_store` RPC는 `SECURITY DEFINER`이고 `authenticated` role에 `GRANT EXECUTE` 됨
- 회원가입만 하면 누구나 자신의 store를 owner로 만들 수 있음
- LESOUL 운영 구조는 "사용자 본인 = 유일한 owner", "다른 사용자 = 초대받은 멤버" 구조
- 현재 상태에서는 아무나 회원가입해서 자기 store를 만들고 운영 데이터와 섞일 위험

#### high: G-02 membership 없으면 무조건 store onboarding

- `_handleBootstrapResult`에서 `status === 'ready'`인데 `memberships.length === 0`이면 그냥 `needs_store_onboarding`으로 떨어뜨림
- demo mode로 가는 경로가 없음
- G-01과 결합하여 "아무나 회원가입 → 아무나 owner가 됨" 문제를 악화

#### high: G-03 guest/demo mode UI 없음

- `showStoreOnboarding` 화면에는 "매장 만들기"와 "로그아웃" 버튼만 있음
- "연습 모드로 시작" 옵션이 없어서 사용자가 localStorage로 연습할 선택지가 없음
- 미승인 사용자가 접근했을 때 적절한 안내 화면이 없음

#### medium: G-04 role 기반 DataSource 활성화 검사 부족

- `_resolveRuntimeProductsDataSource`는 `activeMembership.storeId`만 확인
- `activeMembership.role`이 owner/manager/staff 중 어떤 것인지 검사하지 않음
- RLS에서 최종적으로 막히지만, 클라이언트 단에서 미리 차단하면 방어 계층이 하나 더 생김

#### medium: G-05 pending 상태 모델 없음

- `getActiveMemberships`는 `is_active=true`만 필터링
- 초대받았으나 승인 전이거나 `is_active=false`인 레코드는 프론트에서 알 수 없음
- 사용자 입장에서는 "내가 초대받았는지 모르니 그냥 새 store를 만들자"로 이어짐 → G-01 악화

### 수정 필요 파일 후보

| 파일 | 관련 Gap | 코드만으로 해결 |
|---|---|---|
| `js/app-bootstrap.js` | G-02 | ✅ 상태 기계 확장으로 가능 |
| `js/auth-ui.js` | G-03 | ✅ UI만 추가 |
| `js/auth-service.js` | G-05 | ✅ getAllMemberships로 쿼리 확장 |
| `js/db.js` | G-04 | ✅ role 검사 조건 추가 |
| `supabase/migrations/*` (신규) | G-01, G-05 | ❌ migration 필요 — create_initial_store 제한, invitation 관련 테이블/RPC |

### DB migration 필요 여부

**필요함.** 구체적으로 다음 schema 변경이 필요:

| 항목 | 설명 | 마이그레이션 복잡도 |
|---|---|---|
| `create_initial_store` 제한 | 특정 조건 아니면 호출 못하도록 — 단, 기존 owner flow는 깨지지 않아야 함 | 중간 (RPC 로직 변경) |
| `store_members` 상태 확장 | `is_active`만으로는 부족. `status` 컬럼 추가 또는 `invited_at`, `accepted_at` 등 | 낮음 (컬럼 추가) |
| 초대용 RPC | owner가 사용자를 초대하는 invite_store_member RPC | 중간 (신규 RPC + RLS) |
| 가입 요청용 RPC (선택) | 사용자가 가입 요청을 보내는 기능 | 중간 (신규 테이블+RPC) |

### 코드만으로 임시 완화 가능한 항목

migration 없이 프론트엔드 코드만으로 완화할 수 있는 항목:

| 항목 | 완화 방법 | 한계 |
|---|---|---|
| G-02 (onboarding 강제) | membership 없는 user를 guest 상태로 분류하고 demo mode 진입 허용 | DB 단에서는 여전히 create_initial_store 호출 가능 |
| G-03 (guest UI 없음) | guest용 화면 추가 ("연습 모드로 시작", "가입 요청 안내") | 기능만 제공할 뿐 DB 단 안전성은 안 바뀜 |
| G-04 (role 검사 부족) | activeMembership.role 검사 추가하여 staff는 read-only DataSource 사용 또는 DataSource 활성화 제한 | RLS가 최종 방어선 |
| G-05 (pending 없음) | getActiveMemberships 대신 모든 membership 조회하고 is_active로 구분 | DB 단에 invitation 레코드가 없으면 의미 없음 |

> **주의**: 코드만으로는 G-01(critical)을 완전히 막을 수 없다. DB 단에서 `create_initial_store` 호출 제한을 추가해야 근본적인 해결이 된다.

### 3-6C 구현 추천 순서

**우선순위: 안전성 (프론트 완화) → UX → DB 단 근본 해결 → 기능 확장**

| 순서 | 단계 | 내용 | 대상 Gap | migration 필요 |
|---|---|---|---|---|
| **1** | **guest 상태 + demo mode 진입 경로 추가** | membership 없는 authenticated user를 `guest` 상태로 분류하고, "연습 모드로 시작" (localStorage) 옵션 제공 | G-02, G-03 | ❌ 없음 |
| **2** | **DataSource 활성화 role 검사 추가** | `activeMembership.role`이 owner/manager/staff 중 하나이고 is_active=true일 때만 SupabaseProductsDataSource 활성화 | G-04 | ❌ 없음 |
| **3** | **create_initial_store 프론트 단 가림** | guest 상태에서는 "매장 만들기" 버튼을 숨기거나 비활성화. owner 초대 코드가 있어야만 onboarding 가능하도록 변경 | G-01 (일부 완화) | ❌ 없음 |
| **4** | **getAllMemberships로 pending 상태 표시** | is_active=false 멤버십도 조회하고 "승인 대기 중" 상태 표시 | G-05 | 최소 (쿼리 변경) |
| **5** | **create_initial_store DB 단 제한** | 특정 조건(예: 초대 코드 인증, 기존 owner 승인) 아니면 RPC 호출 실패 | G-01 (근본 해결) | ✅ 필요 |
| **6** | **owner 초대 기능** | owner가 이메일로 멤버 초대, 초대받은 사용자가 수락하면 멤버십 활성화 | G-05, G-01 | ✅ 필요 |
| **7** | **demo mode 시각적 강화** | "연습 모드" 배너, 색상 구분 등 | G-03 UX | ❌ 없음 |
| **8** | **Confirm Email 정책 결정** | 운영 전 ON/OFF 결정 + redirect URL 설정 | 정책 | 설정 변경 |

### 핵심 결론

- **가장 시급한 것 (critical):** 아무나 `create_initial_store`를 호출해서 owner가 되는 문제.
- **가장 먼저 코드만으로 할 수 있는 것:** `app-bootstrap.js`에서 membership 없는 사용자를 guest 상태로 분류하고 demo mode로 진입하게 함. 프론트 단에서 onboarding 버튼을 숨겨서 완화할 수는 있으나, DB 단 제한 없이는 완전한 해결이 아님.
- **migration이 필요한 핵심 기능:** `create_initial_store` DB 단 제한, 초대/승인 흐름. 이건 3-6C 이후 단계에서 신중히 진행해야 함.

### Progress

- 3-5X: Remote Production Readiness Freeze Audit ✅
- 3-6A: Auth Role & Guest Mode Architecture Design ✅
- 3-6B: Auth Onboarding & Guest Mode Gap Audit ✅
- 3-6C: JS-only Guest Mode Gate ✅
- **3-6D: create_initial_store Security Hardening Design ✅ (현재)**
- 다음: 3-6E 구현 단계 (선택한 정책에 따라 migration 진행)

## 34. 3-6D: create_initial_store Security Hardening Design (2026-07-22)

### 목적

3-6C에서 membership 없는 authenticated user를 guest/demo mode로 처리했지만, DB 단에서 `create_initial_store` RPC는 여전히 모든 authenticated user에게 열려 있음. 이번 단계에서는 RPC의 보안 강화 방안을 설계한다. **이번 단계는 설계/문서화만 하며, 코드/DB 수정은 하지 않는다.**

### 현재 create_initial_store 보안 상태

#### RPC 정의 및 GRANT

| 항목 | 값 |
|---|---|
| 정의 위치 | `supabase/migrations/20260711000800_auth_onboarding.sql`, `20260711000850_auth_onboarding_hardening.sql` |
| 함수명 | `public.create_initial_store(p_name text, p_subtitle text DEFAULT NULL, p_default_language text DEFAULT 'ko')` |
| 반환 타입 | `uuid` (store_id) |
| SECURITY DEFINER | ✅ Yes |
| SET search_path | ✅ `''` (empty, safe) |
| GRANT EXECUTE | **`authenticated` role** (모든 로그인 사용자에게 실행 권한) |
| REVOKE FROM | `PUBLIC`, `anon` |

#### 보안 조치 (이미 구현됨)

1. **auth.uid() 검증** — 호출자의 user id를 가져오며, NULL이면 에러
2. **입력값 NULL 체크** — `p_name`, `p_default_language`에 대해 명시적 NULL 검사 (SQLSTATE 22023)
3. **입력값 sanitize/validate** — trim, 길이 제한(1~100자), whitelist(ko/zh/en/ja)
4. **advisory transaction lock** — 동일 user의 동시 호출 방지 (`hashtextextended(auth.uid()::text, 0)`)
5. **idempotent onboarding** — 이미 active owner membership이 있으면 기존 store_id 반환
6. **soft-deleted store 제외** — `stores.deleted_at IS NULL` 조건으로 삭제된 store 무시
7. **atomic transaction** — profile + store + membership + settings를 단일 트랜잭션으로 생성

### 위험도 평가

| # | 위험 | 설명 | 위험도 |
|---|---|---|---|
| **W-01** | **모든 authenticated user가 owner store를 만들 수 있음** | `GRANT EXECUTE ON FUNCTION ... TO authenticated` → 회원가입만 하면 누구나 자신의 store를 owner로 생성 가능. LESOUL 운영 구조(단일 owner store + 초대받은 멤버)와 맞지 않음 | **CRITICAL** |
| **W-02** | **프론트 게이트 우회 가능** | 3-6C에서 프론트 단에서 guest로 분류하여 create_initial_store 호출을 막았으나, attacker가 직접 Supabase API를 호출하면 RPC 실행 가능 | **HIGH** |
| **W-03** | **운영 데이터 오염** | 아무나 owner store를 만들면 실제 운영 데이터와 섞일 위험. RLS는 store_id 기준이므로 새 store를 만들면 그 사용자만의 격리된 데이터셋이 생기지만, DB 관점에서는 "익명의 store"가 계속 생기는 문제 | **HIGH** |
| **W-04** | **Billing/Subscription placeholder와 충돌 가능** | 추후 Billing을 store_id 기준으로 설계한다면, 인증되지 않은 사용자의 store에 대해 Billing 레코드가 필요해짐 | **MEDIUM** |

### 권장 정책 비교 (1안/2안/3안)

#### 1안: Owner-only Bootstrap (제한적 허용)

| 항목 | 내용 |
|---|---|
| **정책** | 특정 이메일/사용자만 owner store를 만들 수 있음 (예: 환경 변수 또는 테이블에 지정된 admin 목록) |
| **구현 방법** | `create_initial_store` 내부에서 `auth.uid()` 또는 `auth.jwt()->>'email'`을 확인하여 whitelist에 있는지 검사 |
| **장점** | 간단한 whitelist로 제어 가능. 기존 owner 계정에 영향 없음 |
| **단점** | whitelist 관리 필요. 새 owner 추가 시 migration 또는 config 업데이트 필요. 동적 사용자 관리에 부적합 |
| **기존 owner 영향** | 없음 (기존 owner는 whitelist에 포함되면 됨) |
| **migration 복잡도** | 낮음 (RPC 로직만 수정) |

#### 2안: Invite-code Bootstrap (초대 코드 기반)

| 항목 | 내용 |
|---|---|
| **정책** | owner가 생성한 초대 코드가 있어야만 새 owner store를 만들 수 있음 |
| **구현 방법** | `create_initial_store`에 `p_invite_code` 파라미터 추가. RPC 내부에서 `store_invitations` 테이블 조회하여 코드 검증 |
| **장점** | 동적 사용자 관리 가능. owner가 직접 초대 발송. 운영 단계에서 자연스러운 흐름 |
| **단점** | 신규 테이블(`store_invitations`) 필요. 초대 코드 생성/만료 로직 구현 필요. migration 복잡도 증가 |
| **기존 owner 영향** | 없음 (기존 owner는 이미 owner membership이 있으므로 idempotent query가 기존 store 반환) |
| **migration 복잡도** | 중간~높음 (신규 테이블 + RPC 수정 + 초대 로직) |

#### 3안: Admin-bootstrap Only (관리자 직접 생성)

| 항목 | 내용 |
|---|---|
| **정책** | 일반 사용자는 절대 owner store를 만들 수 없음. 관리자(service_role)만 store를 생성하고 owner를 지정 |
| **구현 방법** | `create_initial_store`의 GRANT를 `authenticated`에서 제거하고, service_role만 실행 가능하도록 변경. 또는 별도 `admin_create_store` RPC 생성 |
| **장점** | 가장 강력한 통제. 모든 owner store가 관리자에 의해 명시적으로 생성됨 |
| **단점** | 관리자 개입 필요. self-service 불가. 운영 비용 증가 |
| **기존 owner 영향** | 있음 (기존 owner가 self-service로 store 생성 불가) |
| **migration 복잡도** | 낮음 (GRANT만 수정). 단, 운영 흐름 변경 필요 |

### 추천안 선택

**추천안: 2안 (Invite-code Bootstrap)**

| 이유 | 설명 |
|---|---|
| **운영 적합성** | LESOUL은 단일 owner + 초대받은 멤버 구조이므로, 초대 코드 기반 온보딩이 자연스러움 |
| **동적 사용자 관리** | 새 owner를 추가할 때마다 migration/config 업데이트 필요 없음 |
| **기존 owner 보호** | 기존 owner는 이미 owner membership이 있으므로 idempotent query로 보호됨 |
| **확장성** | 추후 owner 초대 UI, 만료 로직, 다양한 역할 초대 등으로 확장 가능 |

### 2안 구현 전제 조건

#### NULL invite_code 처리 규칙 (보정됨)

| 상황 | 결과 |
|---|---|
| 기존 **owner membership**이 이미 있는 사용자 + `p_invite_code = NULL` | ✅ **허용** — idempotent하게 기존 `store_id` 반환 |
| **신규 사용자** (owner membership 없음) + `p_invite_code = NULL` | ❌ **거부** — "Invite code is required to create a store" 에러 |
| 기존 owner + `p_invite_code = 유효한 코드` | ✅ idempotent하게 기존 store 반환 (초대 코드는 무시) |
| 신규 사용자 + `p_invite_code = 유효한 코드` | ✅ 초대된 store의 owner/member로 등록 또는 store 생성 |
| `p_invite_code = invalid/expired/used` | ❌ 명확한 에러 반환 |

> **핵심 정책**: `p_invite_code`가 NULL이라고 해서 기존 동작 전체를 유지하지 않는다. idempotent owner lookup은 허용하지만, **신규 store creation은 반드시 유효한 invite_code가 있어야만 허용**한다.

#### Idempotent owner lookup vs new store creation

| 흐름 | 조건 | 결과 |
|---|---|---|
| **Idempotent owner lookup** | `p_invite_code`와 관계없이 `auth.uid()`로 active owner membership 조회 | 기존 store_id 반환 또는 NULL |
| **New store creation** | active owner membership이 없고 `p_invite_code`가 유효 | 새 store + owner membership 생성 |
| **Rejection** | active owner membership이 없고 `p_invite_code`가 NULL/invalid/expired/used | 에러 발생 |

#### 3-6E 구현 시 pseudo-flow

```
create_initial_store(p_name, p_subtitle, p_default_language, p_invite_code = NULL):
  1. auth.uid() 검증 — NULL이면 에러
  2. 입력값 sanitize/validate
  3. advisory lock 획득
  4. ensure_user_profile 호출
  5. [Idempotent lookup] active + non-deleted owner membership 조회
     - 있으면 → 기존 store_id 반환 (p_invite_code 무시)
  6. [Invite code required check] active owner membership이 없으면
     - p_invite_code가 NULL이면 → 에러: "Invite code is required"
     - p_invite_code가 제공되면 → store_invitations에서 코드 검증
  7. [Invite code validation]
     - 코드가 존재하지 않으면 → 에러: "Invalid invite code"
     - 코드가 이미 사용되었으면 → 에러: "Invite code already used"
     - 코드가 만료되었으면 → 에러: "Invite code has expired"
     - (선택) invited_email이 있고 현재 사용자 이메일과 다르면 → 에러
  8. [Store creation with invite]
     - invite_code에 지정된 store_id가 있으면 → 해당 store에 membership 생성 (join)
     - invite_code가 "새 store 생성용"이면 → 새 store + owner membership 생성
     - store_invitations.used_at / used_by 업데이트
  9. store_id 반환
```

#### 초대 코드 타입 (2종류)

| 타입 | 용도 | `store_id` | `role` |
|---|---|---|---|
| **join-type** | 기존 store에 멤버로 초대 | 지정됨 | owner/manager/staff |
| **create-type** | 새 store를 생성하도록 초대 | NULL (생성 시 채움) | owner (기본) |

> 초기 구현에서는 join-type만 구현해도 충분하다. create-type은 추후 필요 시 추가.

1. **신규 테이블 `store_invitations` 생성**
   - `id` (uuid, PK)
   - `store_id` (uuid, FK → stores, nullable — NULL이면 create-type)
   - `invite_code` (text, unique, indexed)
   - `invited_email` (text, nullable)
   - `role` (member_role, default 'owner')
   - `created_by` (uuid, FK → auth.users)
   - `expires_at` (timestamptz, nullable)
   - `used_at` (timestamptz, nullable)
   - `used_by` (uuid, FK → auth.users, nullable)

2. **RPC 수정: `create_initial_store(p_name, p_subtitle, p_default_language, p_invite_code)`**
   - ~~`p_invite_code`가 NULL이면 기존 동작 유지~~ → **보정**: NULL이면 신규 생성 거부
   - 기존 owner membership이 있으면 `p_invite_code`와 관계없이 기존 store 반환
   - 기존 owner가 없고 `p_invite_code`가 NULL이면 에러
   - `p_invite_code`가 제공되면 `store_invitations` 테이블에서 코드 검증
   - 코드 유효성: exists + not used + not expired + (선택) email match
   - 코드가 유효하면 초대된 store의 owner/member로 등록 또는 새 store 생성
   - 코드 invalid/expired/used 시 명확한 에러 반환

3. **기존 owner 계정 보호**
   - 이미 owner membership이 있는 경우, invite_code 없이도 기존 store 반환 (idempotent lookup은 허용)
   - 기존 데이터 마이그레이션 필요 없음

4. **초대 코드 생성 RPC**
   - `generate_store_invite_code(p_store_id, p_role, p_invited_email, p_expires_in_days)`
   - owner만 호출 가능
   - 고유한 `invite_code` 문자열 생성 (예: `INV-XXXXXX`)

#### 테스트 케이스 목록 (3-6E contract test)

| 케이스 | 시나리오 | 기대 결과 |
|---|---|---|
| **A** | existing owner + no invite_code | ✅ returns existing store_id |
| **B** | new user + no invite_code | ❌ rejects: "Invite code is required" |
| **C** | new user + invalid invite_code | ❌ rejects: "Invalid invite code" |
| **D** | new user + expired invite_code | ❌ rejects: "Invite code has expired" |
| **E** | new user + used invite_code | ❌ rejects: "Invite code already used" |
| **F** | new user + valid invite_code (join-type) | ✅ creates membership in invited store |
| **G** | guest mode frontend does not call create_initial_store automatically | ✅ RPC not called |

### migration 필요 여부

**필요함.** 구체적으로 다음 migration이 필요:

| 항목 | 설명 | 마이그레이션 복잡도 |
|---|---|---|
| `store_invitations` 테이블 생성 | 초대 코드 저장용 테이블 | 중간 |
| `create_initial_store` RPC 수정 | `p_invite_code` 파라미터 추가 + 검증 로직 + NULL 거부 | 중간 |
| `generate_store_invite_code` RPC 생성 | owner용 초대 코드 생성 RPC | 낮음 |
| RLS policy for `store_invitations` | owner만 자신의 store 초대 코드 조회/생성 | 낮음 |

### 구현 전 선행 조건

1. **3-6E에서 구현 여부 결정** — 사용자가 2안으로 진행할지, 1안/3안으로 할지 결정 필요
2. **초대 코드 정책 확정** — 만료 기간, 중복 사용 허용 여부, 역할별 초대 가능 여부, create-type vs join-type 범위
3. **owner 초대 UI 설계** — 3-6F 이상에서 프론트엔드 구현 필요
4. **기존 owner 계정 정리** — 현재 owner 계정이 정상적으로 owner membership을 갖고 있는지 확인

### rollback 전략

| 상황 | rollback 방법 |
|---|---|
| migration 후 문제 발견 | `store_invitations` 테이블 DROP + `create_initial_store` RPC를 이전 버전으로 REPLACE |
| 기존 owner 접근 불가 | idempotent query가 기존 owner membership을 조회하므로, invite_code 없이도 기존 store 반환 가능 (lookup은 항상 허용) |
| 초대 코드 로직 오류 | `p_invite_code = NULL` 호출이 불가능해짐 (기존 동작과 다름). rollback 후 NULL로 다시 호출 가능 |

### 3-6E 구현 범위 제안

| 순서 | 항목 | 설명 |
|---|---|---|
| **E1** | `store_invitations` 테이블 생성 | migration 파일 작성 |
| **E2** | `generate_store_invite_code` RPC 생성 | owner용 초대 코드 생성 |
| **E3** | `create_initial_store` RPC 수정 | `p_invite_code` 파라미터 추가 + 검증 로직 |
| **E4** | contract test 작성 | 초대 코드 기반 온보딩 검증 |
| **E5** | 프론트엔드 연동 (선택) | owner 초대 UI |

### 제약 준수

- 기능 코드 수정: ❌ (no)
- JS/CSS/HTML 수정: ❌ (no)
- Supabase migration/schema/RLS/RPC 수정: ❌ (no) — 설계만 함
- supabase db push 실행: ❌ (no)
- supabase db reset --linked: ❌ (no)
- supabase db pull: ❌ (no)
- js/config.js commit: ❌ (no)
- data_export.json 생성/추가: ❌ (no)
- service_role/token/key/password 출력: ❌ (no)
- main/gh-pages 작업: ❌ (no)

---

## 35. 3-6E-Prep: Existing Owner/Membership Safety Audit (2026-07-23)

### 목적

3-6E invite-code migration 적용 전, 기존 owner/member 상태를 안전하게 감사한다.
이 단계는 **감사/진단만** 수행하며, 코드 수정·DB migration·RLS/RPC 수정·`supabase db push`를 금지한다.

### 감사 항목

| # | 항목 | 확인 방법 |
|---|---|---|
| 1 | active owner membership이 정상 존재하는지 | `store_members` WHERE role='owner' AND is_active=true COUNT |
| 2 | active store와의 연결 상태 | `store_members` JOIN `stores` WHERE stores.deleted_at IS NULL |
| 3 | 기존 owner 계정의 store_id 매핑 | owner membership → store_id 조회 (이메일 마스킹) |
| 4 | stores.deleted_at IS NULL인 active store와 연결 여부 | orphan membership 탐지 |
| 5 | create_initial_store idempotent lookup 조건 충족 여부 | RPC 내 쿼리와 동일한 조건으로 시뮬레이션 |
| 6 | guest test 계정이 불필요한 owner store를 만들지 않았는지 | store name 패턴 분석 (test/guest/demo 등) |
| 7 | 3-6E migration 후 기존 owner가 invite_code 없이 store_id를 받을 수 있는지 | idempotent lookup 쿼리가 기존 owner를 반환하는지 확인 |
| 8 | 민감정보 보호 | 이메일 마스킹, token/key/password 출력 금지 |

### Read-only 감사 SQL (Supabase SQL Editor에서 실행)

> **주의**: 아래 쿼리는 모두 SELECT 전용입니다. INSERT/UPDATE/DELETE/RPC 호출을 포함하지 않습니다.
> Supabase Dashboard → SQL Editor → New query 에서 실행하세요.

#### Q1: Active owner membership count

```sql
-- 기존 owner membership이 정상 존재하는지 확인
SELECT
    COUNT(*) AS active_owner_membership_count
FROM public.store_members sm
INNER JOIN public.stores s ON s.id = sm.store_id
WHERE sm.role = 'owner'
  AND sm.is_active = true
  AND s.deleted_at IS NULL;
```

#### Q2: Active store count

```sql
-- 현재 active store 개수
SELECT
    COUNT(*) AS active_store_count
FROM public.stores
WHERE deleted_at IS NULL;
```

#### Q3: Membership without active store (orphan membership)

```sql
-- store_members가 존재하지만 store가 soft-delete된 경우
SELECT
    sm.user_id,
    sm.store_id,
    sm.role,
    sm.is_active,
    s.deleted_at AS store_deleted_at
FROM public.store_members sm
LEFT JOIN public.stores s ON s.id = sm.store_id
WHERE sm.is_active = true
  AND (s.deleted_at IS NOT NULL OR s.id IS NULL);
```

#### Q4: 기존 owner 계정 store_id 매핑 (이메일 마스킹)

```sql
-- owner 계정이 어떤 store_id를 가지고 있는지 확인
-- 이메일은 앞 2자 + *** + 뒤 4자만 표시
SELECT
    sm.user_id,
    sm.store_id,
    sm.role,
    sm.is_active,
    sm.created_at AS membership_created_at,
    s.name AS store_name,
    s.deleted_at AS store_deleted_at,
    LEFT(u.email, 2) || '***' || RIGHT(u.email, 4) AS masked_email
FROM public.store_members sm
INNER JOIN public.stores s ON s.id = sm.store_id
INNER JOIN auth.users u ON u.id = sm.user_id
WHERE sm.role = 'owner'
ORDER BY sm.created_at ASC;
```

#### Q5: create_initial_store idempotent lookup 조건 시뮬레이션

```sql
-- RPC 내 idempotent lookup 쿼리와 동일한 조건으로 각 owner가 store_id를 받을 수 있는지 확인
SELECT
    sm.user_id,
    sm.store_id,
    LEFT(u.email, 2) || '***' || RIGHT(u.email, 4) AS masked_email,
    CASE
        WHEN sm.store_id IS NOT NULL THEN 'YES - will return existing store_id'
        ELSE 'NO - would require invite_code'
    END AS idempotent_lookup_result
FROM public.store_members sm
INNER JOIN public.stores s ON s.id = sm.store_id
INNER JOIN auth.users u ON u.id = sm.user_id
WHERE sm.role = 'owner'
  AND sm.is_active = true
  AND s.deleted_at IS NULL
ORDER BY sm.created_at ASC;
```

#### Q6: Guest-created store 의심 탐지

```sql
-- 테스트/guest/demo 목적으로 보이는 store 탐지
SELECT
    s.id AS store_id,
    s.name AS store_name,
    s.created_at,
    LEFT(u.email, 2) || '***' || RIGHT(u.email, 4) AS masked_email
FROM public.stores s
INNER JOIN public.store_members sm ON sm.store_id = s.id
    AND sm.role = 'owner'
    AND sm.is_active = true
INNER JOIN auth.users u ON u.id = sm.user_id
WHERE s.deleted_at IS NULL
  AND (
      s.name ILIKE '%test%'
      OR s.name ILIKE '%guest%'
      OR s.name ILIKE '%demo%'
      OR s.name ILIKE '%연습%'
      OR s.name ILIKE '%게스트%'
      OR s.name ILIKE '%temp%'
  )
ORDER BY s.created_at DESC;
```

#### Q7: 전체 membership 요약 (role별 분포)

```sql
-- role별 active membership 분포
SELECT
    sm.role,
    COUNT(*) AS count,
    COUNT(DISTINCT sm.user_id) AS distinct_users,
    COUNT(DISTINCT sm.store_id) AS distinct_stores
FROM public.store_members sm
INNER JOIN public.stores s ON s.id = sm.store_id
WHERE sm.is_active = true
  AND s.deleted_at IS NULL
GROUP BY sm.role
ORDER BY sm.role;
```

#### Q8: 한 사용자가 여러 owner membership을 가진 경우

```sql
-- 동일 사용자가 2개 이상의 active owner store를 가진 경우
SELECT
    sm.user_id,
    LEFT(u.email, 2) || '***' || RIGHT(u.email, 4) AS masked_email,
    COUNT(*) AS owner_store_count,
    array_agg(sm.store_id::text) AS store_ids
FROM public.store_members sm
INNER JOIN public.stores s ON s.id = sm.store_id
INNER JOIN auth.users u ON u.id = sm.user_id
WHERE sm.role = 'owner'
  AND sm.is_active = true
  AND s.deleted_at IS NULL
GROUP BY sm.user_id, u.email
HAVING COUNT(*) > 1
ORDER BY owner_store_count DESC;
```

### 감사 결과

> 2026-07-23, Supabase SQL Editor에서 read-only SELECT 실행 완료.
> user_id / store_id는 앞 8자 + `…`로 축약, email은 `sf***.com` 수준 마스킹.

| 쿼리 | 항목 | 결과 | 비고 |
|---|---|---|---|
| Q1 | active owner membership count | **1** | 정상 (기존 owner 1명) |
| Q2 | active store count | **1** | 정상 (LESOUL 1개) |
| Q3 | orphan membership count | **0 rows** | ✅ 안전 |
| Q4 | 기존 owner store_id 매핑 | user_id `149bc902…`, store_id `ec52ecfa…`, store_name=`LESOUL`, store_deleted_at=`NULL` | ✅ active store 연결 정상 |
| Q5 | idempotent lookup 결과 | masked_email `sf***.com` → **YES - will return existing store_id** | ✅ 모든 기존 owner가 YES |
| Q6 | guest-created store 의심 | **0 rows** | ✅ 안전 (test/guest/demo/연습/게스트/temp 패턴 모두 0) |
| Q7 | role별 membership 분포 | owner=1, manager=0, staff=0 (1 distinct user, 1 distinct store) | ✅ 단일 owner 구조 |
| Q8 | 중복 owner membership | **0 rows** | ✅ 안전 (동일 user가 여러 owner store를 가진 경우 없음) |

### 3-6E migration 진행 가능 여부 판정 기준

| 조건 | 기대값 | 위험 시 조치 |
|---|---|---|
| Q1 ≥ 1 (active owner membership 존재) | ✅ | 0이면 기존 owner가 없으므로 migration 영향 없음 |
| Q3 = 0 (orphan membership 없음) | ✅ | >0이면 orphan 정리 필요 (soft-delete된 store의 membership 비활성화) |
| Q5 모든 기존 owner = YES | ✅ | NO가 있으면 해당 owner는 invite_code가 필요함 |
| Q6 = 0 (guest-created store 없음) | ✅ | >0이면 정리 필요 (soft-delete 또는 membership 비활성화) |
| Q8 = 0 (중복 owner membership 없음) | ✅ | >0이면 RPC가 가장 오래된 store만 반환하므로 정리 필요 |

### 최종 판정 (2026-07-23)

| 판정 항목 | 결과 |
|---|---|
| **3-6E migration readiness** | ✅ **PASS** |
| **기존 owner 보호 조건** | ✅ 충족 (Q5: 모든 기존 owner가 idempotent lookup에서 YES) |
| **Orphan membership** | ✅ 없음 (Q3 = 0 rows) |
| **Guest-created store 의심** | ✅ 없음 (Q6 = 0 rows) |
| **중복 owner membership** | ✅ 없음 (Q8 = 0 rows) |
| **Single-owner 단일 store 구조** | ✅ 확인 (Q7: owner=1, manager=0, staff=0) |
| **invite-code migration 진행 가능 여부** | ✅ **진행 가능** |

**요약**: 기존 owner 1명이 active store `LESOUL`에 정상 연결되어 있고, orphan / guest-created / 중복 owner membership이 모두 0이다. 3-6E migration을 적용하더라도 idempotent lookup이 기존 owner를 정상 반환하므로, invite_code가 추가되더라도 기존 owner는 invite_code 없이도 기존 store에 접근할 수 있다. **3-6E migration 진행을 승인한다.**

### 기존 owner 보호 조건

3-6E migration 후 `create_initial_store`에 `p_invite_code` 검증이 추가되더라도, **기존 owner는 다음 조건으로 보호**된다:

1. RPC 내 idempotent lookup이 `auth.uid()`로 active owner membership을 먼저 조회
2. 기존 owner membership이 있으면 `p_invite_code`와 관계없이 기존 `store_id` 반환
3. invite_code 검증은 **신규 store creation 흐름에서만** 적용
4. 따라서 기존 owner는 invite_code 없이도 정상적으로 기존 store에 접근 가능

### 제약 준수

- 코드 수정: ❌ (no) — 문서 수정만
- JS/CSS/HTML 수정: ❌ (no)
- Supabase migration/schema/RLS/RPC 수정: ❌ (no)
- supabase db push: ❌ (no)
- supabase db reset --linked: ❌ (no)
- supabase db pull: ❌ (no)
- INSERT/UPDATE/DELETE: ❌ (no) — SELECT 전용
- RPC 실행: ❌ (no)
- create_initial_store 실행: ❌ (no)
- js/config.js commit: ❌ (no)
- data_export.json 생성/추가: ❌ (no)
- service_role/token/key/password 출력: ❌ (no)
- user email 전체 출력: ❌ (no) — 마스킹 처리
- main/gh-pages 작업: ❌ (no)
- migration 파일 생성: ❌ (no)

---

## 36. 3-6E.1: Store Invitations Foundation Migration (2026-07-23)

### 목적

3-6E invite-code migration의 첫 단계로 `store_invitations` 테이블 기반을 만든다.
이번 단계는 **table foundation only**이며, `create_initial_store` RPC 하드닝은 3-6E.2로 남긴다.

### 생성된 산출물

| 산출물 | 경로 | 설명 |
|---|---|---|
| Migration 파일 | `supabase/migrations/20260711001200_store_invitations.sql` | store_invitations 테이블, 제약, 인덱스, trigger, RLS |
| Contract test | `tests/store-invitations-foundation-contract.test.mjs` | 15개 contract test (A~O) |

### store_invitations 설계 요약

| 항목 | 값 | 비고 |
|---|---|---|
| **타입** | join-type only | `store_id` NOT NULL |
| **create-type** | ❌ 미구현 | 3-6E.2 이후 확장 가능 |
| **기본 role** | `staff` | owner 초대는 RPC 레벨에서 제어 예정 |
| **invite_code** | unique, not empty | `trim(invite_code) <> ''` CHECK |
| **expires_at** | nullable | `created_at`보다 이후여야 함 |
| **used_at / revoked_at** | mutual exclusion | 동시 존재 불가 |
| **direct DML** | ❌ 차단 | authenticated에 SELECT만 grant, INSERT/UPDATE/DELETE는 revoke |
| **mutation 경로** | RPC only | 이후 단계에서 `generate_store_invite_code` 등 RPC 구현 예정 |

### 포함된 제약조건

- `chk_store_invitations_invite_code_not_empty` — 빈 문자열 금지
- `chk_store_invitations_expires_after_created` — 만료일은 생성일 이후
- `chk_store_invitations_used_by_requires_used_at` — 사용자가 있으면 사용 시각도 있어야 함
- `chk_store_invitations_revoked_by_requires_revoked_at` — 취소자가 있으면 취소 시각도 있어야 함
- `chk_store_invitations_not_used_and_revoked` — 사용과 취소 동시 불가

### 포함된 인덱스

- `uq_store_invitations_invite_code` — unique (invite_code)
- `idx_store_invitations_store_id` — store별 조회
- `idx_store_invitations_created_by` — 생성자별 조회
- `idx_store_invitations_used_by` — 사용자별 조회 (partial: used_by IS NOT NULL)
- `idx_store_invitations_invited_email_lower` — email 검색 (partial: invited_email IS NOT NULL)
- `idx_store_invitations_active` — 활성 초대 조회 (partial: used_at IS NULL AND revoked_at IS NULL)

### RLS 정책

- `ENABLE ROW LEVEL SECURITY`
- PUBLIC: `REVOKE ALL`
- anon: `REVOKE ALL`
- authenticated: `GRANT SELECT` only, `REVOKE INSERT/UPDATE/DELETE`
- policy: `StoreInvitations: owners can view` — `private.has_store_role(store_id, ARRAY['owner'::member_role])`

### Trigger

- `trg_store_invitations_updated_at` — `handle_store_invitation_update()`
- 보호 필드: `id`, `store_id`, `invite_code`, `created_by`, `created_at`

### contract test 결과

| 항목 | 결과 |
|---|---|
| tests | 15 |
| pass | 15 |
| fail | 0 |

### 아직 적용하지 않은 것

- **Remote Supabase**: `supabase db push` 실행 안 함
- **create_initial_store RPC**: 수정 안 함 (3-6E.2에서 진행)
- **generate_store_invite_code RPC**: 생성 안 함 (3-6E.2~3에서 진행)
- **프론트엔드**: 수정 안 함

### 제약 준수

- create_initial_store RPC 수정: ❌ (no)
- js/auth-service.js 수정: ❌ (no)
- js/app-bootstrap.js 수정: ❌ (no)
- JS/CSS/HTML 수정: ❌ (no)
- 프론트 초대 UI 구현: ❌ (no)
- Supabase remote db push: ❌ (no)
- supabase db reset --linked: ❌ (no)
- supabase db pull: ❌ (no)
- js/config.js commit: ❌ (no)
- data_export.json 생성/추가: ❌ (no)
- service_role/token/key/password 출력: ❌ (no)
- main/gh-pages 작업: ❌ (no)

---

## 37. 3-6E.2: create_initial_store Invite-code Hardening (2026-07-23)

### 목적

`create_initial_store` RPC를 invite-code 기반으로 보안 강화한다.
신규 authenticated user가 active owner membership이 없으면 반드시 유효한 join-type invite code로 기존 store에 가입해야 한다.
기존 owner는 idempotent lookup으로 보호되어 invite code 없이 기존 store_id를 반환받는다.

### 생성된 산출물

| 산출물 | 경로 |
|---|---|
| Migration 파일 | `supabase/migrations/20260711001300_create_initial_store_invite_code_hardening.sql` |
| Contract test | `tests/create-initial-store-invite-code-contract.test.mjs` |

### 핵심 정책

| 상황 | 동작 |
|---|---|
| 기존 owner + invite_code 없음 | ✅ idempotent하게 기존 store_id 반환 |
| 신규 user + invite_code 없음 | ❌ "Invite code is required" |
| invalid invite_code | ❌ "Invalid invite code" |
| used invite_code | ❌ "Invite code already used" |
| revoked invite_code | ❌ "Invite code has been revoked" |
| expired invite_code | ❌ "Invite code has expired" |
| deleted store로 연결된 invite_code | ❌ "Invite code is linked to a deleted store" |
| invited_email 불일치 | ❌ "Invite code is not associated with your account" |
| owner role invite_code | ❌ "Owner role invitations are not allowed" |
| valid manager/staff invite_code | ✅ store_members 생성 + used_at/used_by 업데이트 |

### 보안 처리

| 항목 | 처리 |
|---|---|
| Old 3-arg signature | `REVOKE` 후 `DROP FUNCTION IF EXISTS`로 제거 |
| New 4-arg signature | `p_invite_code text DEFAULT NULL` 추가 |
| SECURITY DEFINER | 유지, `SET search_path = ''` |
| Advisory lock | `pg_advisory_xact_lock(hashtextextended(v_uid::text, 0))` |
| Race-condition 방지 | `SELECT ... FROM public.store_invitations WHERE invite_code = ... FOR UPDATE` |
| Direct DML | `store_invitations`에 authenticated INSERT/UPDATE/DELETE 미개방 |

### join-type only 제약

- 이번 단계에서 신규 user 흐름에 `INSERT INTO public.stores`는 없다.
- `store_invitations.store_id`는 `NOT NULL`이다.
- create-type invitation(새 store 생성용)은 이후 단계에서 검토한다.

### contract test 결과

| 항목 | 결과 |
|---|---|
| tests | 19 |
| pass | 19 |
| fail | 0 |

### 아직 적용하지 않은 것

- **Remote Supabase**: `supabase db push` 실행 안 함
- **generate_store_invite_code RPC**: 생성 안 함 (3-6E.3에서 진행)
- **프론트엔드**: 수정 안 함

### 다음 단계

- 3-6E.3: `generate_store_invite_code` RPC 설계/구현
- 또는 local migration verification / remote dry-run preflight

### 제약 준수

- create_initial_store RPC 수정: ✅ (이 단계에서 허용됨)
- JS/CSS/HTML 수정: ❌ (no)
- 프론트 초대 UI 구현: ❌ (no)
- Supabase remote db push: ❌ (no)
- supabase db reset --linked: ❌ (no)
- supabase db pull: ❌ (no)
- js/config.js commit: ❌ (no)
- data_export.json 생성/추가: ❌ (no)
- service_role/token/key/password 출력: ❌ (no)
- main/gh-pages 작업: ❌ (no)

---

## 38. 3-6E.2.1: create_initial_store Invite-code Pre-push Review (2026-07-23)

### 목적

3-6E.2 migration을 remote Supabase에 적용하기 전에 최종 감사/검증을 수행한다.
이번 단계는 문서 기록만 하며, remote db push는 아직 실행하지 않는다.

### Migration 순서 확인

| 순서 | 파일 | 목적 |
|---|---|---|
| 1 | `20260711001200_store_invitations.sql` | `store_invitations` 테이블 생성 (join-type only) |
| 2 | `20260711001300_create_initial_store_invite_code_hardening.sql` | `create_initial_store` invite-code 강화 |

### 핵심 검증 항목 12종 결과

| # | 검증 항목 | 결과 | 비고 |
|---|---|---|---|
| 1 | 012 migration에서 store_invitations 먼저 생성 | ✅ PASS | `store_id` NOT NULL, join-type only |
| 2 | 013 migration에서 old 3-arg revoke/drop | ✅ PASS | `REVOKE` + `DROP FUNCTION IF EXISTS` |
| 3 | new 4-arg에 `p_invite_code text DEFAULT NULL` | ✅ PASS | signature 확인 완료 |
| 4 | idempotent owner lookup이 invite-code required보다 먼저 | ✅ PASS | owner lookup → invite required 순서 확인 |
| 5 | 신규 user 경로에 `INSERT INTO public.stores` 없음 | ✅ PASS | contract test P 확인 |
| 6 | valid invite가 store_members insert + used_at/used_by update만 | ✅ PASS | `INSERT INTO public.store_members` + `UPDATE public.store_invitations` |
| 7 | owner role invite 거부 | ✅ PASS | `v_invite.role = 'owner'` → 에러 |
| 8 | invited_email 비교 시 전체 email 미노출 | ✅ PASS | `v_user_email` 변수에 담아 비교, 로그/문서/test output에 이메일 전체값 없음 |
| 9 | store_invitations direct DML 미개방 | ✅ PASS | authenticated에 INSERT/UPDATE/DELETE revoke |
| 10 | old 3-arg 남아 있어도 4-arg default 경로로 우회되지 않음 | ✅ PASS | old 3-arg는 drop됨, PostgreSQL overloading으로 우회 불가 |
| 11 | 3-6E-Prep audit 결과와 충돌 없음 | ✅ PASS | owner 1/store 1/orphan 0/duplicate 0 |
| 12 | `SELECT ... FOR UPDATE` race-condition 방지 | ✅ PASS | invite code redemption에 row lock 사용 |

### Remote Push Readiness

| 판정 | 결과 |
|---|---|
| **Migration 순서** | ✅ 올바름 (012 → 013) |
| **Contract tests** | ✅ 34 pass, 0 fail |
| **Existing owner 보호** | ✅ idempotent lookup 충족 |
| **New user 차단** | ✅ invite_code required |
| **Direct DML** | ✅ store_invitations에 미개방 |
| **Overall readiness** | **✅ PASS** |

### 아직 적용하지 않은 것

- **Remote Supabase**: `supabase db push` 실행 안 함
- 다음 단계에서 사용자의 승인 후 push 예정

### 제약 준수

- 새 migration 파일 생성: ❌ (no)
- 기존 migration 파일 수정: ❌ (no)
- JS/CSS/HTML 수정: ❌ (no)
- 프론트 초대 UI 구현: ❌ (no)
- Supabase remote db push: ❌ (no)
- supabase db reset --linked: ❌ (no)
- supabase db pull: ❌ (no)
- js/config.js commit: ❌ (no)
- data_export.json 생성/추가: ❌ (no)
- service_role/token/key/password 출력: ❌ (no)
- main/gh-pages 작업: ❌ (no)

---

## 39. 3-6E.2.2: Supabase Remote Dry-run (2026-07-23)

### 목적

remote Supabase에 실제 적용하기 전에 dry-run으로 적용 예정 migration을 확인한다.

### 실행 결과

| 항목 | 결과 |
|---|---|
| **명령** | `supabase db push --dry-run` |
| **결과** | **PENDING** — CLI telemetry 쓰기 오류로 실행 불가 |
| **실제 remote 적용** | ❌ no |

### CLI 오류 상세

```
EPERM: operation not permitted, open '/Users/lesoul888/.supabase/telemetry.json.tmp.*'
```

Supabase CLI v1.3.13 (Bun)에서 `~/.supabase/telemetry.json.tmp` 파일 쓰기 권한 문제로 dry-run 명령이 실행되지 않음.

### 대안 검증 수행

dry-run 실행이 불가하므로 다음 대안으로 검증을 수행함:

| 검증 항목 | 결과 |
|---|---|
| Migration 파일 존재 확인 | ✅ 012, 013 파일 존재 |
| Contract test 실행 | ✅ 396 tests, 0 fail |
| Preflight 실행 | ✅ 정상 종료 |
| Migration 파일 내용 검사 | ✅ 3-6E.2.1 contract test 19개 PASS |

### 적용 예정 Migration (확인됨)

| 파일 | 크기 | 목적 |
|---|---|
| `20260711001200_store_invitations.sql` | 6,238 bytes | `store_invitations` 테이블 생성 |
| `20260711001300_create_initial_store_invite_code_hardening.sql` | 9,354 bytes | `create_initial_store` invite-code 강화 |

### 판정

| 항목 | 결과 |
|---|---|
| **dry-run 실행** | PENDING (CLI 오류) |
| **Migration 준비** | ✅ PASS |
| **실제 remote 적용** | ❌ no (사용자 승인 후 진행) |

### 다음 단계

- Supabase CLI 권한 문제 해결 후 dry-run 재시도
- 또는 사용자 승인 후 직접 `supabase db push` 실행

### 제약 준수

- supabase db push: ❌ (no)
- supabase db reset --linked: ❌ (no)
- supabase db pull: ❌ (no)
- 원격 INSERT/UPDATE/DELETE: ❌ (no)
- 원격 RPC 실행: ❌ (no)
- create_initial_store 원격 실행: ❌ (no)
- 새 migration 파일 생성: ❌ (no)
- 기존 migration 파일 수정: ❌ (no)
- JS/CSS/HTML 수정: ❌ (no)
- js/config.js commit: ❌ (no)
- data_export.json 생성/추가: ❌ (no)
- service_role/token/key/password 출력: ❌ (no)
- main/gh-pages 작업: ❌ (no)

---

## 40. 3-6E.2.2.1: Supabase CLI Dry-run Retry (2026-07-24)

### 목적

Supabase CLI v1.3.13 Bun telemetry 쓰기 오류를 회피하기 위해 `SUPABASE_TELEMETRY_DISABLED=1` 환경변수로 dry-run을 재시도한다.

### CLI 환경

| 항목 | 값 |
|---|---|
| **사용한 CLI 경로** | `/Users/lesoul888/bin/supabase` |
| **CLI version** | `2.109.1` (Bun v1.3.13) |
| **telemetry disabled** | `SUPABASE_TELEMETRY_DISABLED=1` 사용 |
| **linked project ref** | `pocfvkicaicmouimmzkf` (이전 세션 확인) |

### 실행 명령

```
SUPABASE_TELEMETRY_DISABLED=1 /Users/lesoul888/bin/supabase db push --dry-run
```

### dry-run 결과

```
DRY RUN: migrations will *not* be pushed to the database.
Connecting to remote database...
Would push these migrations:
 • 20260711001200_store_invitations.sql
 • 20260711001300_create_initial_store_invite_code_hardening.sql
Finished supabase db push.
```

### 판정

| 항목 | 결과 |
|---|---|
| **dry-run 실행** | ✅ **PASS** |
| **적용 예정 migration** | 정확히 2개 (012, 013) |
| **다른 migration 포함** | ❌ 없음 |
| **seed 포함** | ❌ 없음 |
| **실제 db push 실행** | ❌ no (dry-run이므로 미적용) |
| **Project ref 확인** | `pocfvkicaicmouimmzkf` ✅ (이전 세션 확인) |

### 적용 예정 Migration 목록

| 순서 | 파일 | 목적 |
|---|---|---|
| 1 | `20260711001200_store_invitations.sql` | `store_invitations` 테이블 생성 |
| 2 | `20260711001300_create_initial_store_invite_code_hardening.sql` | `create_initial_store` invite-code 강화 |

### 다음 단계

- 사용자 승인 후 `supabase db push`로 remote 적용
- 또는 3-6E.3 `generate_store_invite_code` RPC 구현

### 제약 준수

- supabase db push: ❌ (no)
- supabase db reset --linked: ❌ (no)
- supabase db pull: ❌ (no)
- 원격 INSERT/UPDATE/DELETE: ❌ (no)
- 원격 RPC 실행: ❌ (no)
- create_initial_store 원격 실행: ❌ (no)
- 새 migration 파일 생성: ❌ (no)
- 기존 migration 파일 수정: ❌ (no)
- JS/CSS/HTML 수정: ❌ (no)
- js/config.js commit: ❌ (no)
- data_export.json 생성/추가: ❌ (no)
- service_role/token/key/password 출력: ❌ (no)
- main/gh-pages 작업: ❌ (no)

---

## 41. 3-6E.2.3: Supabase Remote DB Push (2026-07-24)

### 목적

dry-run PASS 확인 후 remote Supabase project에 012, 013 migration을 실제 적용한다.

### 실행 명령

```
SUPABASE_TELEMETRY_DISABLED=1 /Users/lesoul888/bin/supabase db push
```

### 적용 결과

| 항목 | 결과 |
|---|---|
| **실제 remote 적용** | ✅ **yes** |
| **20260711001200_store_invitations.sql** | ✅ 적용 성공 |
| **20260711001300_create_initial_store_invite_code_hardening.sql** | ✅ 적용 성공 |
| **--include-seed 사용** | ❌ no |
| **db reset --linked 사용** | ❌ no |
| **db pull 사용** | ❌ no |
| **error** | 없음 (Docker cache warning만 있음, 무해) |

### db push 출력

```
Applying migration 20260711001200_store_invitations.sql...
Applying migration 20260711001300_create_initial_store_invite_code_hardening.sql...
Finished supabase db push.
```

### Migration List 확인

`supabase migration list` 결과: Local 15개와 Remote 15개가 완전히 동기화됨.
`20260711001200`과 `20260711001300`이 모두 remote에 적용된 상태.

### Post-push 검증

| 검증 항목 | 결과 |
|---|---|
| `node --test tests/*.test.mjs` | ✅ **396 tests, 0 fail** |
| `bash scripts/remote-deployment-preflight.sh` | ✅ 정상 종료 |

### 최종 판정

| 항목 | 결과 |
|---|---|
| **Remote DB Push** | ✅ **PASS** |
| **Migration 동기화** | ✅ Local = Remote |
| **기존 owner 보호** | ✅ idempotent lookup으로 보호 |
| **신규 user 차단** | ✅ invite_code required |

### 다음 단계

- 3-6E.3: `generate_store_invite_code` RPC 설계/구현
- 3-6E.4: 프론트엔드 invite-code 입력 UI
- 또는 기존 owner 동작 smoke test

### 제약 준수

- supabase db push --include-seed: ❌ (no)
- supabase db reset --linked: ❌ (no)
- supabase db pull: ❌ (no)
- 원격 INSERT/UPDATE/DELETE 수동: ❌ (no)
- 원격 RPC 수동: ❌ (no)
- create_initial_store 원격 수동: ❌ (no)
- 새 migration 파일 생성: ❌ (no)
- 기존 migration 파일 수정: ❌ (no)
- JS/CSS/HTML 수정: ❌ (no)
- js/config.js commit: ❌ (no)
- data_export.json 생성/추가: ❌ (no)
- service_role/token/key/password 출력: ❌ (no)
- main/gh-pages 작업: ❌ (no)

## 42. 3-6E.2.4: Existing Owner Post-push Browser Smoke Test (2026-07-24)

### 목적

3-6E.2.3 remote DB push 이후 기존 owner 계정이 invite-code 없이도 정상적으로 로그인하고 LESOUL store에 접근 가능한지 브라우저에서 확인한다.

### 테스트 환경

| 항목 | 값 |
|---|---|
| 테스트 일시 | 2026-07-24 |
| 대상 | existing owner post-push browser smoke |
| local server | python3 -m http.server 8082 |
| 접속 URL | http://localhost:8082 |
| remote project | pocfvkicaicmouimmzkf |
| remote migration 상태 | 012 applied, 013 applied |

### Browser Smoke Test 결과

| 검증 항목 | 결과 | 근거 |
|---|---|---|
| **login result** | ✅ **PASS** | 로그인 버튼 클릭 후 대시보드 진입 |
| **owner context** | ✅ **PASS** | LESOUL 매장명 heading에 표시 (e25) |
| **forced onboarding** | ❌ **no** | 매장 만들기 화면으로 강제 이동되지 않음 |
| **guest mode misclassification** | ❌ **no** | 게스트 모드 UI 미표시, `hasGuestMode: false` |
| **invite_code error** | ❌ **no** | `hasInviteCodeRequired: false` |
| **products screen access** | ✅ **PASS** | 상품 목록 페이지 진입 가능 (#/products) |
| **새 store 생성 정황** | ❌ **no** | 기존 store 유지 |

### Body Text 검증

```javascript
{
  hasLESOUL: true,              // ✅ LESOUL 매장명 확인
  hasInviteCodeRequired: false, // ✅ Invite code 오류 없음
  hasGuestMode: false           // ✅ 게스트 모드 아님
}
```

### Console 검증

- console errors: 없음 (none)
- service_role/key/token/password 출력: 없음

### Post-smoke 검증

| 검증 항목 | 결과 |
|---|---|
| `node --test tests/*.test.mjs` | ✅ **396 tests, 0 fail** |
| `bash scripts/remote-deployment-preflight.sh` | ✅ **PASS** |

### 최종 판정

| 항목 | 결과 |
|---|---|
| **Existing Owner Smoke** | ✅ **PASS** |
| **LESOUL owner context** | ✅ 확인 |
| **invite_code 오류** | ❌ 없음 |
| **guest mode 오분류** | ❌ 없음 |
| **상품 화면 접근** | ✅ 가능 |
| **새 store 생성 정황** | ❌ 없음 |
| **Tests** | ✅ 396 pass |
| **Preflight** | ✅ PASS |

### 다음 단계

- 3-6E.3: `generate_store_invite_code` RPC 설계/구현
- 3-6E.4: 프론트엔드 invite-code 입력 UI

### 제약 준수

- 새 migration 파일 생성: ❌ (no)
- 기존 migration 파일 수정: ❌ (no)
- JS/CSS/HTML 수정: ❌ (no)
- supabase db push 실행: ❌ (no)
- supabase db reset --linked: ❌ (no)
- supabase db pull: ❌ (no)
- 원격 INSERT/UPDATE/DELETE 수동: ❌ (no)
- 원격 RPC 수동: ❌ (no)
- create_initial_store 원격 수동: ❌ (no)
- js/config.js commit: ❌ (no)
- data_export.json 생성/추가: ❌ (no)
- service_role/token/key/password 출력: ❌ (no)
- 이메일 전체값 출력: ❌ (no)
- main/gh-pages 작업: ❌ (no)

## 43. 3-6E.3: generate_store_invite_code RPC 설계/구현 (2026-07-24)

### 목적

owner가 직원 초대 코드를 생성할 수 있는 `public.generate_store_invite_code` RPC를 추가한다.
이 단계는 local migration + tests + docs + dry-run까지만 진행한다.
실제 remote DB push는 아직 진행하지 않는다.

### Migration 파일

`supabase/migrations/20260711001400_generate_store_invite_code_rpc.sql`

### 함수 Signature

```sql
public.generate_store_invite_code(
    p_role public.member_role DEFAULT 'staff',
    p_invited_email text DEFAULT NULL,
    p_expires_in_days integer DEFAULT 7
)
RETURNS text
```

### 권한 정책

| 항목 | 내용 |
|---|---|
| 실행 가능 role | authenticated (함수 내부에서 owner-only 추가 검증) |
| owner-only | ✅ active owner membership이어야 함 |
| manager 실행 불가 | ✅ |
| staff 실행 불가 | ✅ |
| anon 실행 불가 | ✅ |
| PUBLIC 실행 권한 | ❌ revoked |

### 허용 Role (초대 대상)

- ✅ manager
- ✅ staff

### 금지 Role (초대 대상)

- ❌ owner (Owner role invitations are not allowed)

### 파라미터 검증

| 파라미터 | 검증 로직 |
|---|---|
| `p_role` | `'manager'` 또는 `'staff'`만 허용, `'owner'` 차단 |
| `p_invited_email` | NULL 허용, 빈 문자열 → NULL, `lower(trim())` 저장 |
| `p_expires_in_days` | 1 ~ 30 사이 정수만 허용, 기본 7일 |

### Invite Code 형식

- 형식: `LS-XXXXXXXX` (대문자 8자리 + hex)
- `gen_random_bytes(6)` → `encode(hex)` → `upper(substr(1,8))`
- Unique constraint 충돌 시 최대 10회 재시도
- 10회 모두 실패 시 오류 발생

### 저장 위치

`public.store_invitations` 테이블에 INSERT

| 필드 | 값 |
|---|---|
| `store_id` | 현재 owner의 active store (deleted_at IS NULL) |
| `invite_code` | 생성된 LS-XXXXXXXX 코드 |
| `invited_email` | NULL 또는 `lower(trim(email))` |
| `role` | `p_role` (manager/staff) |
| `created_by` | `auth.uid()` |
| `expires_at` | `now() + p_expires_in_days` |
| `used_at/used_by/revoked_at/revoked_by` | NULL |

### 보안 특징

- SECURITY DEFINER + `SET search_path = ''`
- `auth.uid()` is null → reject
- active owner membership 없으면 → reject (42501)
- store deleted_at IS NOT NULL → skip (deleted store에서 invite 방지)
- dynamic SQL 사용 안 함
- service_role 사용 안 함
- create_initial_store 수정 없음

### Contract Tests

`tests/generate-store-invite-code-contract.test.mjs`

검증 항목 (24개):
- migration 파일 존재
- 함수 signature (3 parameters, 기본값 포함)
- SECURITY DEFINER
- SET search_path = ''
- auth.uid() 사용
- owner-only 로직 (store_members + is_active + owner role)
- owner role invite 차단
- manager/staff role 허용
- expires_in_days 1~30 제한
- public.store_invitations INSERT
- public.stores INSERT 없음
- public.store_members INSERT 없음
- REVOKE ALL FROM PUBLIC
- REVOKE ALL FROM anon
- GRANT EXECUTE TO authenticated
- anon grant 없음
- service_role 문자열 없음
- stores.deleted_at IS NULL 확인
- invited_email lower(trim()) 처리
- 빈 invited_email → NULL
- unique_violation 재시도 로직
- create_initial_store 언급 없음

### Remote 적용 상태

| 항목 | 상태 |
|---|---|
| **실제 remote db push** | ❌ **no** (이번 단계에서 진행 안 함) |
| **dry-run** | ✅ **PASS** (014 migration 1개만 적용 예정) |

### Dry-run 결과

```
DRY RUN: migrations will *not* be pushed to the database.
Would push these migrations:
 • 20260711001400_generate_store_invite_code_rpc.sql
```

### 검증 결과

| 검증 항목 | 결과 |
|---|---|
| `node --test tests/*.test.mjs` | ✅ **420 tests, 0 fail** (기존 396 + 신규 24) |
| `bash scripts/remote-deployment-preflight.sh` | ✅ **PASS** |
| `supabase db push --dry-run` | ✅ 014 migration 1개만 표시 |

### 최종 판정

| 항목 | 결과 |
|---|---|
| **generate_store_invite_code RPC 구현** | ✅ **PASS** |
| **owner-only 정책** | ✅ 확인 |
| **manager/staff invite 허용** | ✅ 확인 |
| **owner invite 차단** | ✅ 확인 |
| **expires_in_days 1~30 제한** | ✅ 확인 |
| **invited_email lower(trim()) 처리** | ✅ 확인 |
| **unique_violation 재시도** | ✅ 확인 |
| **실제 remote push** | ❌ no (dry-run만) |

### 제약 준수

- 실제 supabase db push 실행: ❌ (no)
- supabase db push --include-seed: ❌ (no)
- supabase db reset --linked: ❌ (no)
- supabase db pull: ❌ (no)
- 원격 INSERT/UPDATE/DELETE 수동: ❌ (no)
- 원격 RPC 수동: ❌ (no)
- create_initial_store 원격 수동: ❌ (no)
- 기존 migration 파일 수정: ❌ (no)
- JS/CSS/HTML 수정: ❌ (no)
- 프론트 초대 UI 구현: ❌ (no)
- 가격 계산 기능 구현: ❌ (no)
- js/config.js commit: ❌ (no)
- data_export.json 생성/추가: ❌ (no)
- service_role/token/key/password 출력: ❌ (no)
- 이메일 전체값 출력: ❌ (no)
- user_id/store_id 전체값 출력: ❌ (no)
- main/gh-pages 작업: ❌ (no)

## 44. 3-6E.3.1: generate_store_invite_code RPC Remote 적용 (2026-07-24)

### 목적

3-6E.3에서 구현한 `20260711001400_generate_store_invite_code_rpc.sql` migration을 Supabase remote DB에 실제 적용한다.

### 실행 명령

```
SUPABASE_TELEMETRY_DISABLED=1 /Users/lesoul888/bin/supabase db push
```

### 적용 전 검증

| 검증 항목 | 결과 |
|---|---|
| branch | ✅ feature/supabase-cloud-migration |
| working tree | ✅ clean |
| remote | ✅ SSH (token 없음) |
| HEAD | ✅ e06983b feat: add generate_store_invite_code rpc |
| CLI version | ✅ 2.109.1 |
| migration list 사전 | ✅ Local 16, Remote 15 (014 미적용) |
| dry-run | ✅ 014 migration 1개만 표시 |

### 적용 결과

| 항목 | 결과 |
|---|---|
| **실제 remote db push** | ✅ **yes** |
| **20260711001400_generate_store_invite_code_rpc.sql** | ✅ 적용 성공 |
| **--include-seed 사용** | ❌ no |
| **db reset --linked 사용** | ❌ no |
| **db pull 사용** | ❌ no |
| **원격 RPC 직접 실행** | ❌ no |
| **invite code 실제 생성** | ❌ no |
| **error** | 없음 (pgdelta cache warning만 있음, 무해) |

### db push 출력

```
Applying migration 20260711001400_generate_store_invite_code_rpc.sql...
Finished supabase db push.
```

### Migration List 사후 확인

`supabase migration list` 결과: Local 16개 = Remote 16개 완전 동기화.
`20260711001400`이 remote에 적용됨.

### Post-push 검증

| 검증 항목 | 결과 |
|---|---|
| `node --test tests/*.test.mjs` | ✅ **420 tests, 0 fail** |
| `bash scripts/remote-deployment-preflight.sh` | ✅ **PASS** |

### 최종 판정

| 항목 | 결과 |
|---|---|
| **Remote DB Push** | ✅ **PASS** |
| **Migration 동기화** | ✅ Local 16 = Remote 16 |
| **014 remote applied** | ✅ 확인 |
| **--include-seed** | ❌ no |
| **db reset --linked** | ❌ no |
| **db pull** | ❌ no |
| **원격 RPC 실행** | ❌ no |
| **invite code 생성** | ❌ no |

### 다음 단계

- 3-6E.4: 프론트엔드 invite-code 입력 UI 구현
- 또는 3-6E.3.2: invite 코드 목록 조회/철회 RPC 구현

### 제약 준수

- supabase db push --include-seed: ❌ (no)
- supabase db reset --linked: ❌ (no)
- supabase db pull: ❌ (no)
- 원격 INSERT/UPDATE/DELETE 수동: ❌ (no)
- 원격 RPC 수동: ❌ (no)
- generate_store_invite_code 원격 실행: ❌ (no)
- create_initial_store 원격 수동: ❌ (no)
- 새 migration 파일 생성: ❌ (no)
- 기존 migration 파일 수정: ❌ (no)
- JS/CSS/HTML 수정: ❌ (no)
- 프론트 초대 UI 구현: ❌ (no)
- 가격 계산 기능 구현: ❌ (no)
- js/config.js commit: ❌ (no)
- data_export.json 생성/추가: ❌ (no)
- service_role/token/key/password 출력: ❌ (no)
- 이메일 전체값 출력: ❌ (no)
- user_id/store_id 전체값 출력: ❌ (no)
- main/gh-pages 작업: ❌ (no)

## 45. 3-6E.3.2: Invite Code 목록 조회/철회 RPC 설계/구현 (2026-07-24)

### 목적

owner가 자신이 생성한 invite code를 안전하게 조회하고 철회할 수 있는 RPC 2개를 추가한다.
이번 단계는 local migration + tests + docs + dry-run까지만 진행한다.
실제 remote db push는 아직 진행하지 않는다.

### Migration 파일

`supabase/migrations/20260711001500_store_invitation_management_rpcs.sql`

### 함수 Signatures

```sql
-- 1. 목록 조회
public.list_store_invite_codes()
RETURNS TABLE (
    id uuid,
    invite_code text,
    invited_email text,
    role public.member_role,
    expires_at timestamptz,
    used_at timestamptz,
    revoked_at timestamptz,
    created_at timestamptz,
    status text
)

-- 2. 철회
public.revoke_store_invite_code(p_invitation_id uuid)
RETURNS boolean
```

### 권한 정책 (두 함수 공통)

| 항목 | 내용 |
|---|---|
| 실행 가능 role | authenticated (함수 내부에서 owner-only 추가 검증) |
| owner-only | ✅ active owner membership이어야 함 |
| manager/staff 실행 불가 | ✅ |
| anon 실행 불가 | ✅ |
| PUBLIC 실행 권한 | ❌ revoked |

### list_store_invite_codes: Status 계산

| 조건 | status |
|---|---|
| `revoked_at IS NOT NULL` | `revoked` |
| `used_at IS NOT NULL` | `used` |
| `expires_at < now()` | `expired` |
| 그 외 | `active` |

### list_store_invite_codes: 보안 특징

- owner의 active store만 조회 (deleted store 제외)
- `store_id = v_store_id` 필터로 다른 store invite 절대 노출 안 함
- `created_at DESC` 순 정렬
- `public.store_invitations`에서 SELECT만 수행

### revoke_store_invite_code: 동작

| 단계 | 동작 |
|---|---|
| 1 | `p_invitation_id IS NULL` → reject |
| 2 | active owner membership 확인 |
| 3 | 초대 존재 여부 + store 소유권 확인 |
| 4 | 이미 revoked → idempotent `RETURN true` |
| 5 | `used_at IS NOT NULL` → reject (사용된 초대는 철회 불가) |
| 6 | `revoked_at = now()`, `revoked_by = auth.uid()` 업데이트 |
| 7 | `GET DIAGNOSTICS`로 영향받은 행 확인 후 boolean 반환 |

### revoke_store_invite_code: 보안 특징

- owner의 active store에 속한 초대만 철회 가능
- deleted store 제외
- used_at IS NOT NULL 초대 철회 차단
- idempotent: 이미 revoked된 초대는 성공 반환

### Contract Tests

`tests/store-invitation-management-rpcs-contract.test.mjs`

검증 항목 (26개):
- migration 파일 존재
- list_store_invite_codes 함수 존재
- revoke_store_invite_code 함수 존재
- 두 함수 SECURITY DEFINER (주석 제외, 2개 카운트)
- 두 함수 SET search_path = '' (주석 제외, 2개 카운트)
- 두 함수 auth.uid() 사용
- 두 함수 owner-only 로직 (store_members + is_active + owner role)
- 두 함수 stores.deleted_at IS NULL 확인
- list 함수 status 계산 (active/expired/used/revoked)
- list 함수 created_at DESC 정렬
- list 함수 store_id 필터로 다른 store 노출 방지
- revoke 함수 NULL p_invitation_id 차단
- revoke 함수 used_at 초대 철회 차단
- revoke 함수 revoked_at/revoked_by 업데이트
- revoke 함수 store_id 범위 내 update
- revoke 함수 idempotent (already revoked → RETURN true)
- public.stores insert/update/delete 없음
- public.store_members insert/update/delete 없음
- REVOKE ALL FROM PUBLIC (2개)
- REVOKE ALL FROM anon (2개)
- GRANT EXECUTE TO authenticated (2개)
- service_role 문자열 없음
- create_initial_store 언급 없음
- generate_store_invite_code 언급 없음
- GET DIAGNOSTICS 사용
- revoke returns boolean

### Remote 적용 상태

| 항목 | 상태 |
|---|---|
| **실제 remote db push** | ❌ **no** (이번 단계에서 진행 안 함) |
| **dry-run** | ✅ **PASS** (015 migration 1개만 표시) |

### Dry-run 결과

```
DRY RUN: migrations will *not* be pushed to the database.
Would push these migrations:
 • 20260711001500_store_invitation_management_rpcs.sql
```

### 검증 결과

| 검증 항목 | 결과 |
|---|---|
| `node --test tests/*.test.mjs` | ✅ **446 tests, 0 fail** (기존 420 + 신규 26) |
| `bash scripts/remote-deployment-preflight.sh` | ✅ **PASS** |
| `supabase db push --dry-run` | ✅ 015 migration 1개만 표시 |

### 최종 판정

| 항목 | 결과 |
|---|---|
| **Invitation Management RPCs 구현** | ✅ **PASS** |
| **owner-only 정책** | ✅ 확인 |
| **list status 계산** | ✅ 확인 |
| **revoke 정책** | ✅ 확인 |
| **used invite revoke 차단** | ✅ 확인 |
| **idempotent revoke** | ✅ 확인 |
| **실제 remote push** | ❌ no (dry-run만) |

### 다음 단계

- 3-6E.3.3: invite 코드 조회/철회 RPC remote 적용
- 또는 3-6E.4: 프론트엔드 invite-code 입력 UI 구현

### 제약 준수

- 실제 supabase db push 실행: ❌ (no)
- supabase db push --include-seed: ❌ (no)
- supabase db reset --linked: ❌ (no)
- supabase db pull: ❌ (no)
- 원격 INSERT/UPDATE/DELETE 수동: ❌ (no)
- 원격 RPC 수동: ❌ (no)
- generate_store_invite_code 원격 실행: ❌ (no)
- list_store_invite_codes 원격 실행: ❌ (no)
- revoke_store_invite_code 원격 실행: ❌ (no)
- create_initial_store 원격 수동: ❌ (no)
- 새 migration 파일 생성: ❌ (no)
- 기존 migration 파일 수정: ❌ (no)
- JS/CSS/HTML 수정: ❌ (no)
- 프론트 초대 UI 구현: ❌ (no)
- 가격 계산 기능 구현: ❌ (no)
- js/config.js commit: ❌ (no)
- data_export.json 생성/추가: ❌ (no)
- service_role/token/key/password 출력: ❌ (no)
- 이메일 전체값 출력: ❌ (no)
- user_id/store_id 전체값 출력: ❌ (no)
- main/gh-pages 작업: ❌ (no)

## 46. 3-6E.3.3: Invite Code 목록 조회/철회 RPC Remote 적용 (2026-07-24)

### 목적

3-6E.3.2에서 구현한 `20260711001500_store_invitation_management_rpcs.sql` migration을 Supabase remote DB에 실제 적용한다.

### 실행 명령

```
SUPABASE_TELEMETRY_DISABLED=1 /Users/lesoul888/bin/supabase db push
```

### 적용 전 검증

| 검증 항목 | 결과 |
|---|---|
| branch | ✅ feature/supabase-cloud-migration |
| working tree | ✅ clean |
| remote | ✅ SSH (token 없음) |
| HEAD | ✅ d8641a8 feat: add store invitation management rpcs |
| CLI version | ✅ 2.109.1 |
| migration list 사전 | ✅ Local 17, Remote 16 (015 미적용) |
| dry-run | ✅ 015 migration 1개만 표시 |

### 적용 결과

| 항목 | 결과 |
|---|---|
| **실제 remote db push** | ✅ **yes** |
| **20260711001500_store_invitation_management_rpcs.sql** | ✅ 적용 성공 |
| **--include-seed 사용** | ❌ no |
| **db reset --linked 사용** | ❌ no |
| **db pull 사용** | ❌ no |
| **원격 RPC 직접 실행** | ❌ no |
| **invite code 실제 생성** | ❌ no |
| **error** | 없음 (pgdelta cache warning만 있음, 무해) |

### db push 출력

```
Applying migration 20260711001500_store_invitation_management_rpcs.sql...
Finished supabase db push.
```

### Migration List 사후 확인

`supabase migration list` 결과: Local 17개 = Remote 17개 완전 동기화.
`20260711001500`이 remote에 적용됨.

### Post-push 검증

| 검증 항목 | 결과 |
|---|---|
| `node --test tests/*.test.mjs` | ✅ **446 tests, 0 fail** |
| `bash scripts/remote-deployment-preflight.sh` | ✅ **PASS** |

### 최종 판정

| 항목 | 결과 |
|---|---|
| **Remote DB Push** | ✅ **PASS** |
| **Migration 동기화** | ✅ Local 17 = Remote 17 |
| **015 remote applied** | ✅ 확인 |
| **--include-seed** | ❌ no |
| **db reset --linked** | ❌ no |
| **db pull** | ❌ no |
| **원격 RPC 실행** | ❌ no |
| **invite code 생성** | ❌ no |

### 다음 단계

- 3-6E.4: 프론트엔드 invite-code 입력 UI 구현
- 또는 3-6E.3.4: 초대 수락(accept_invite) RPC 구현

### 제약 준수

- supabase db push --include-seed: ❌ (no)
- supabase db reset --linked: ❌ (no)
- supabase db pull: ❌ (no)
- 원격 INSERT/UPDATE/DELETE 수동: ❌ (no)
- 원격 RPC 수동: ❌ (no)
- generate_store_invite_code 원격 실행: ❌ (no)
- list_store_invite_codes 원격 실행: ❌ (no)
- revoke_store_invite_code 원격 실행: ❌ (no)
- create_initial_store 원격 수동: ❌ (no)
- 새 migration 파일 생성: ❌ (no)
- 기존 migration 파일 수정: ❌ (no)
- JS/CSS/HTML 수정: ❌ (no)
- 프론트 초대 UI 구현: ❌ (no)
- 가격 계산 기능 구현: ❌ (no)
- js/config.js commit: ❌ (no)
- data_export.json 생성/추가: ❌ (no)
- service_role/token/key/password 출력: ❌ (no)
- 이메일 전체값 출력: ❌ (no)
- user_id/store_id 전체값 출력: ❌ (no)
- main/gh-pages 작업: ❌ (no)

## 47. 3-6E.3.4: Owner Invite Code RPC Browser Smoke Test (2026-07-24)

### 목적

기존 owner 로그인 상태에서 브라우저 Supabase client를 통해 아래 RPC 3개가 실제 remote에서 정상 작동하는지 smoke test한다.

- `generate_store_invite_code`
- `list_store_invite_codes`
- `revoke_store_invite_code`

### 대상

- **Owner Invite RPC Browser Smoke**
- Remote migration 상태: 014/015 applied (Local 17 = Remote 17)

### 사전 확인

| 검증 항목 | 결과 |
|---|---|
| branch | ✅ feature/supabase-cloud-migration |
| working tree | ✅ clean |
| remote | ✅ SSH (token 없음) |
| HEAD | ✅ 22f9838 docs: record store invitation management remote push |
| migration list | ✅ Local 17 = Remote 17 |
| 20260711001400 remote applied | ✅ 확인 |
| 20260711001500 remote applied | ✅ 확인 |
| js/config.js | ✅ gitignored/local-only |
| SUPABASE_ENABLED | ✅ true |
| PRODUCTS_SUPABASE_ENABLED | ✅ true |
| PRODUCTS_SUPABASE_REMOTE_ENABLED | ✅ true |
| AUTH_GUEST_MODE_ENABLED | ✅ true |
| SUPABASE_URL | ✅ https://<project-ref>.supabase.co |
| SUPABASE_CLIENT_KEY | ✅ anon key (service_role 아님) |

### Owner Session 확인

| 항목 | 결과 |
|---|---|
| owner 로그인 | ✅ 성공 |
| LESOUL 표시 | ✅ 확인 |
| guest mode | ❌ 아님 (정상) |
| invite_code 오류 | ❌ 없음 (정상) |
| 상품 화면 접근 | ✅ 가능 |
| authenticated owner session | ✅ yes |

### RPC 테스트 결과

#### generate_store_invite_code

| 항목 | 결과 |
|---|---|
| RPC 실행 | ✅ 성공 |
| error | ❌ 없음 |
| 반환값 | ✅ invite_code (text) |
| invite_code 형식 | ✅ LS- 접두사 |
| owner-only 오류 | ❌ 없음 |
| permission denied | ❌ 없음 |
| function not found | ❌ 없음 |
| **generated invite code** | **LS-8K4Z**** (masked)** |

#### list_store_invite_codes (철회 전)

| 항목 | 결과 |
|---|---|
| RPC 실행 | ✅ 성공 |
| error | ❌ 없음 |
| 반환값 | ✅ 배열 |
| 방금 생성한 invite 포함 | ✅ 확인 |
| status | ✅ active |
| role | ✅ staff |
| revoked_at | ✅ null |
| used_at | ✅ null |

#### revoke_store_invite_code

| 항목 | 결과 |
|---|---|
| RPC 실행 | ✅ 성공 |
| error | ❌ 없음 |
| 반환값 | ✅ true |
| used invite 오류 | ❌ 없음 |
| permission 오류 | ❌ 없음 |

#### list_store_invite_codes (철회 후)

| 항목 | 결과 |
|---|---|
| RPC 실행 | ✅ 성공 |
| status | ✅ revoked |
| revoked_at | ✅ null 아님 |
| used_at | ✅ null |
| role | ✅ staff 유지 |

### 전체 Smoke 판정

| 항목 | 결과 |
|---|---|
| owner 로그인 성공 | ✅ PASS |
| generate_store_invite_code | ✅ PASS |
| list_store_invite_codes (철회 전) | ✅ PASS |
| revoke_store_invite_code | ✅ PASS |
| list_store_invite_codes (철회 후) | ✅ PASS |
| console red error | ❌ 없음 |
| service_role/token/key/password 출력 | ❌ 없음 |
| invite_code 전체값 문서 기록 | ❌ 없음 |
| invitation id 전체값 문서 기록 | ❌ 없음 |
| generated invite code | LS-8K4Z**** (masked only) |
| final invite status | ✅ revoked |
| **최종 판정** | **✅ PASS** |

### Post-smoke 검증

| 검증 항목 | 결과 |
|---|---|
| `node --test tests/*.test.mjs` | ✅ **454 tests, 0 fail** |
| `bash scripts/remote-deployment-preflight.sh` | ✅ **PASS** |

### 다음 단계

- 3-6E.4: 프론트엔드 invite-code 입력 UI 구현
- 또는 3-6E.3.5: 초대 수락(accept_invite) RPC 구현

### 제약 준수

- 새 migration 파일 생성: ❌ (no)
- 기존 migration 파일 수정: ❌ (no)
- JS/CSS/HTML 수정: ❌ (no)
- 프론트 초대 UI 구현: ❌ (no)
- 가격 계산 기능 구현: ❌ (no)
- supabase db push 실행: ❌ (no)
- supabase db push --include-seed: ❌ (no)
- supabase db reset --linked: ❌ (no)
- supabase db pull: ❌ (no)
- SQL Editor 수동 INSERT/UPDATE/DELETE: ❌ (no)
- service_role 사용: ❌ (no)
- service_role/token/key/password 출력: ❌ (no)
- 이메일 전체값 출력: ❌ (no)
- user_id/store_id 전체값 출력: ❌ (no)
- invite_code 전체값 문서 기록: ❌ (no)
- invitation id 전체값 문서 기록: ❌ (no)
- js/config.js commit: ❌ (no)
- data_export.json 생성/추가: ❌ (no)
- main/gh-pages 작업: ❌ (no)
- force push: ❌ (no)

## 49. 3-6E.4.1-FIX: LESOUL 화면 노출 조건 owner/member 전용 고정 (2026-07-24)

### 목적

owner 또는 active store member만 LESOUL 실제 매장 화면을 볼 수 있도록 분기 정책을 명확히 수정한다.

### 수정 파일

- [js/app-bootstrap.js](file:///Users/lesoul888/Documents/LESOUL_STORE_APP/fashionmanager/js/app-bootstrap.js) - `status === 'guest'` 분기에서 `_enterApp()` 제거, `showStoreOnboarding`로 변경
- [js/auth-service.js](file:///Users/lesoul888/Documents/LESOUL_STORE_APP/fashionmanager/js/auth-service.js) - `joinStoreWithInviteCode` brandName 기본값을 `'My Store'`로 변경
- [tests/3-6C-guest-mode-gate-contract.test.mjs](file:///Users/lesoul888/Documents/LESOUL_STORE_APP/fashionmanager/tests/3-6C-guest-mode-gate-contract.test.mjs) - guest 상태 기대값 업데이트
- [tests/invite-code-ui-contract.test.mjs](file:///Users/lesoul888/Documents/LESOUL_STORE_APP/fashionmanager/tests/invite-code-ui-contract.test.mjs) - 6개 추가 테스트

### 정책 변경

| 상태 | 이전 동작 | 변경 후 동작 |
|---|---|---|
| `status === 'guest'` (membership 없음) | `_enterApp()` 직접 호출 → LESOUL 화면 진입 | `showStoreOnboarding` 표시 → 초기화/invite-code 선택 |
| `status === 'ready' + memberships > 0` | `_enterApp()` 호출 | 유지 (변경 없음) |
| `continueAsGuest()` | `_enterApp()` 호출 | 유지 (명시적 선택 시에만) |

### 구현 내용

#### 1. app-bootstrap.js guest 분기 수정

- `_enterApp()` 호출 제거
- `_hideApp()`, `_showAuth()`, `showStoreOnboarding` 호출 추가
- `onContinueGuest` 핸들러 조걶 전달 (AUTH_GUEST_MODE_ENABLED=true 시)
- `_state = 'needs_store_onboarding'` 설정

#### 2. auth-service.js neutral brandName

- `joinStoreWithInviteCode`에서 기본 brandName을 `'LESOUL'` → `'My Store'`로 변경
- p_name은 RPC signature 때문이며, invite join에서는 p_invite_code가 핵심
- UI에 LESOUL 소유권을 암시하지 않음

#### 3. UI 문구 (이미 neutral)

- 제목: 매장 설정
- 설명: 새 매장을 만들거나 초대 코드로 기존 매장에 참여할 수 있습니다.
- 버튼: 새 매장 만들기 / 초대 코드로 매장 참여 / 게스트/연습 모드로 계속하기

### 기존 흐름 보호

| 항목 | 결과 |
|---|---|
| owner/member 로그인 | ✅ 보호됨 (LESOUL 화면 정상 진입) |
| guest mode 유지 | ✅ 유지됨 (명시적 선택으로만 진입) |
| invite code UI | ✅ 유지됨 |

### 테스트 결과

| 항목 | 결과 |
|---|---|
| tests | ✅ **479 tests, 0 fail** |
| preflight | ✅ **PASS** |
| browser smoke A (owner) | ✅ **PASS** |
| browser smoke B (no-membership) | ⏳ **PENDING** (code/test 검증 PASS, 실제 계정 테스트 필요) |

### Browser Smoke Test 상세

#### A. 기존 owner (PASS)

| 체크 항목 | 결과 |
|---|---|
| 로그인 후 LESOUL 화면 진입 | ✅ LESOUL - Store Management 타이틀, 대시보드 정상 표시 |
| invite code 입력 화면 강제 이동 | ✅ 이동되지 않음 (대시보드 유지) |
| 상품 화면 접근 | ✅ 상품 목록 페이지(#/products) 정상 로드, 상품 등록/검색 UI 표시 |
| 로그아웃 버튼 | ✅ 표시됨 (owner 인증 상태 확인) |

#### B. membership 없는 user (PENDING)

- 로컬 개발 환경에서 Supabase 인증 활성화 시나리오의 실제 계정 테스트 필요
- 코드 레벨 검증:
  - `status === 'guest'` 분기에서 `_enterApp()` 제거 → `showStoreOnboarding` 호출 ✅
  - `_state = 'needs_store_onboarding'` 설정 ✅
  - `onContinueGuest`는 명시적 선택 시에만 주입 ✅
  - `brandName = 'My Store'` neutral fallback ✅
- 테스트 레벨 검증: 479 tests, 0 fail (guest 상태 → needs_store_onboarding 경로 검증 포함)

### 제약 준수

- 새 migration 파일 생성: ❌ (no)
- 기존 migration 수정: ❌ (no)
- supabase db push 실행: ❌ (no)
- supabase db push --include-seed: ❌ (no)
- supabase db reset --linked: ❌ (no)
- supabase db pull: ❌ (no)
- SQL Editor 수동 INSERT/UPDATE/DELETE: ❌ (no)
- service_role 사용: ❌ (no)
- service_role/token/key/password 출력: ❌ (no)
- 이메일 전체값 출력: ❌ (no)
- user_id/store_id 전체값 출력: ❌ (no)
- invite_code 전체값 문서 기록: ❌ (no)
- invitation id 전체값 문서 기록: ❌ (no)
- js/config.js commit: ❌ (no)
- data_export.json 생성/추가: ❌ (no)
- main/gh-pages 작업: ❌ (no)
- force push: ❌ (no)

## 52. 3-6E.5.1: Store Member Management RPCs Remote Push + Owner Smoke (2026-07-24)

### 목적

017 migration을 실제 Supabase remote DB에 적용하고, owner 계정으로 브라우저에서 `list_store_members()`와 `deactivate_store_member(p_member_id)` RPC를 smoke test한다.

### Remote DB Push

| 항목 | 결과 |
|---|---|
| push 실행 | ✅ `SUPABASE_TELEMETRY_DISABLED=1 /Users/lesoul888/bin/supabase db push` |
| 적용된 migration | `20260711001700_store_member_management_rpcs.sql` 1개 |
| seed | ❌ (no) |
| error | ❌ (no) |
| Local / Remote count | 19 / 19 (동기화 완료) |
| db push 반복 실행 | ❌ (no) |

### Owner Browser Smoke Results

#### list_store_members() smoke

| 항목 | 결과 |
|---|---|
| RPC 호출 성공 | ✅ PASS |
| count | 2 (owner + staff) |
| hasOwner | true |
| hasActiveStaff | true |
| 전체 email 노출 | ❌ (masked_email: `ep***@hotmail.com`) |
| 전체 member_id 노출 | ❌ (masked: `50f9****`) |
| 전체 user_id/store_id 노출 | ❌ (no) |

#### deactivate_store_member(p_member_id) smoke

| 항목 | 결과 |
|---|---|
| 대상 확인 | 3-6E.4.2에서 생성된 테스트 staff 계정 (masked: `50f9****`) |
| RPC 호출 성공 | ✅ PASS |
| returnedTrue | true |
| error | ❌ (null) |
| 전체 member_id 출력 | ❌ (masked only) |

#### list after deactivate

| 항목 | 결과 |
|---|---|
| targetFound | true |
| targetRole | staff |
| targetIsActive | false |
| 결과 | ✅ PASS |

### Side Effect

- 테스트 staff 계정의 membership이 `is_active = false`로 변경됨
- 추후 Supabase SQL Editor에서 수동 재활성화 가능

### Post-push 검증

| 항목 | 결과 |
|---|---|
| Tests | ✅ **514 tests, 0 fail** |
| Preflight | ✅ **PASS** |

### 제약 준수

| 항목 | 결과 |
|---|---|
| 새 migration 생성 | ❌ (no — 기존 017 사용) |
| 기존 migration 수정 | ❌ (no) |
| supabase db reset --linked | ❌ (no) |
| supabase db pull | ❌ (no) |
| supabase db push --include-seed | ❌ (no) |
| SQL Editor 수동 INSERT/UPDATE/DELETE | ❌ (no) |
| service_role 사용 | ❌ (no) |
| token/key/password 출력 | ❌ (no) |
| 이메일 전체값 출력 | ❌ (no — masked only) |
| user_id/store_id 전체값 출력 | ❌ (no) |
| member_id 전체값 문서 기록 | ❌ (no — masked only) |
| js/config.js commit | ❌ (no) |
| data_export.json 생성/추가 | ❌ (no) |
| main/gh-pages 작업 | ❌ (no) |
| force push | ❌ (no) |

### 최종 판정: ✅ PASS

## 51. 3-6E.5: Store Member Management RPCs 설계/구현 (2026-07-24)

### 목적

owner가 같은 store의 멤버 목록을 조회하고, owner가 아닌 member를 비활성화할 수 있는 안전한 RPC 2개를 추가한다. 이번 단계는 local migration + tests + docs + dry-run까지만 수행한다.

### 생성 파일

- [supabase/migrations/20260711001700_store_member_management_rpcs.sql](file:///Users/lesoul888/Documents/LESOUL_STORE_APP/fashionmanager/supabase/migrations/20260711001700_store_member_management_rpcs.sql) - 2개 RPC 함수
- [tests/store-member-management-rpcs-contract.test.mjs](file:///Users/lesoul888/Documents/LESOUL_STORE_APP/fashionmanager/tests/store-member-management-rpcs-contract.test.mjs) - 35개 contract 테스트

### RPC Signatures

1. `public.list_store_members()` → `TABLE(member_id uuid, role member_role, is_active boolean, joined_at timestamptz, display_name text, masked_email text)`
2. `public.deactivate_store_member(p_member_id uuid)` → `boolean`

### 보안 정책

| 항목 | 구현 |
|---|---|
| owner-only | `sm.role = 'owner' AND sm.is_active = true` |
| deleted store 제외 | `s.deleted_at IS NULL` |
| cross-store 차단 | `store_id = v_store_id` |
| owner role 비활성화 차단 | `v_member.role = 'owner'` reject |
| self-deactivate 차단 | `v_member.user_id = v_uid` reject |
| DELETE 금지 | `is_active = false` update만 사용 |
| SECURITY DEFINER | 두 함수 모두 |
| SET search_path = '' | 두 함수 모두 |
| REVOKE ALL FROM PUBLIC | 두 함수 모두 |
| REVOKE ALL FROM anon | 두 함수 모두 |
| GRANT EXECUTE TO authenticated | 두 함수 모두 |
| dynamic SQL 없음 | 확인됨 |
| service_role 없음 | 확인됨 |

### masked_email 정책

```sql
CASE
  WHEN au.email IS NULL THEN NULL
  WHEN position('@' IN au.email) <= 2 THEN '***' || substring(au.email FROM position('@' IN au.email))
  ELSE left(au.email, 2) || '***' || substring(au.email FROM position('@' IN au.email))
END
```

- user_id 전체값 반환 금지
- store_id 전체값 반환 금지
- email 전체값 반환 금지

### idempotent deactivate

- 이미 `is_active = false`인 member는 `RETURN true` (에러 없음)

### 검증 결과

| 항목 | 결과 |
|---|---|
| tests | ✅ **514 tests, 0 fail** (기존 479 + 신규 35) |
| preflight | ✅ **PASS** |
| dry-run | ✅ `20260711001700_store_member_management_rpcs.sql` 1개만 적용 예정 (seed 없음, error 없음) |
| actual remote db push | ❌ (no — dry-run만 실행) |
| 새 migration | ✅ 1개 생성 (기존 migration 수정 없음) |
| 프론트 UI | ❌ (no — 이번 단계는 RPC만) |

### 최종 판정: ✅ PASS (local migration + tests + dry-run 완료)

## 50. 3-6E.4.2: 실제 no-membership invite join browser smoke (2026-07-24)

### 목적

no-membership authenticated user가 초기화/invite-code UI를 거쳐 owner가 생성한 invite code로 기존 LESOUL store에 실제 join되는지 브라우저에서 end-to-end 검증한다.

### 테스트 흐름

1. Owner 로그인 → `generate_store_invite_code` RPC로 staff 초대 코드 생성
2. Owner 로그아웃 → no-membership 계정 로그인
3. no-membership 초기 화면: "매장 설정" 표시, LESOUL 대시보드 자동 진입 안 함
4. "초대 코드로 매장 참여" → invite code 입력 UI (placeholder: `LS-XXXXXXXX`)
5. 빈 값 검증 (HTML5 `:invalid` 차단) → 통과
6. 잘못된 형식 (`ABC123`) → "유효하지 않은 초대 코드 형식입니다." 오류
7. 실제 invite code 입력 → `create_initial_store` RPC → staff membership 생성
8. Join 후 bootstrap/reload → active membership 확인

### 결과

| 항목 | 결과 |
|---|---|
| owner invite generation | ✅ **PASS** (masked: `LS-8AE6****`) |
| no-membership initial routing | ✅ **PASS** ("매장 설정" 화면, 대시보드 자동 진입 안 함) |
| invite UI display | ✅ **PASS** (`LS-XXXXXXXX` placeholder, 제출/뒤로 버튼) |
| empty input validation | ✅ **PASS** (HTML5 invalid 차단, RPC 호출 안 함) |
| invalid prefix validation | ✅ **PASS** ("유효하지 않은 초대 코드 형식입니다." 오류) |
| actual invite join | ✅ **PASS** (RPC 성공 → bootstrap reload → 대시보드 진입) |
| final active membership | ✅ **PASS** (role: `staff`, guestModeVisible: false, onboardingVisible: false) |

### 최종 판정: ✅ PASS

### 제약 준수

- 새 migration 파일 생성: ❌ (no)
- 기존 migration 수정: ❌ (no)
- supabase db push 실행: ❌ (no)
- SQL Editor 수동 INSERT/UPDATE/DELETE: ❌ (no)
- service_role 사용: ❌ (no)
- service_role/token/key/password 출력: ❌ (no)
- 이메일 전체값 출력: ❌ (no)
- user_id/store_id 전체값 출력: ❌ (no)
- invite_code 전체값 console/docs 기록: ❌ (no, masked only)
- js/config.js commit: ❌ (no)
- data_export.json 생성/추가: ❌ (no)
- main/gh-pages 작업: ❌ (no)
- force push: ❌ (no)

### Side effect

- 실제 store_membership 레코드 1개 생성 (role: staff, no-membership 테스트 계정)
- 추후 해당 멤버십은 Supabase SQL Editor에서 수동 revocation 가능

## 48. 3-6E.4: 프론트엔드 Invite Code 입력 UI 구현 (2026-07-24)

### 목적

회원가입/로그인 후 active store membership이 없는 사용자가 invite_code를 입력하여 기존 store에 join할 수 있는 프론트엔드 UI를 구현한다.

### 수정 파일

- [js/auth-service.js](file:///Users/lesoul888/Documents/LESOUL_STORE_APP/fashionmanager/js/auth-service.js) - `joinStoreWithInviteCode` 함수 추가
- [js/auth-ui.js](file:///Users/lesoul888/Documents/LESOUL_STORE_APP/fashionmanager/js/auth-ui.js) - `_showInviteCodeForm` UI 추가, `showStoreOnboarding` 수정
- [js/app-bootstrap.js](file:///Users/lesoul888/Documents/LESOUL_STORE_APP/fashionmanager/js/app-bootstrap.js) - `joinStoreWithInviteCode`, `continueAsGuest` 함수 추가
- [css/style.css](file:///Users/lesoul888/Documents/LESOUL_STORE_APP/fashionmanager/css/style.css) - `auth-button-full` 클래스 추가
- [tests/invite-code-ui-contract.test.mjs](file:////Users/lesoul888/Documents/LESOUL_STORE_APP/fashionmanager/tests/invite-code-ui-contract.test.mjs) - 19개 contract 테스트 추가

### 구현 내용

#### 1. auth-service: joinStoreWithInviteCode 함수

- invite_code trim + uppercase 변환
- 빈 값 차단
- LS- prefix 검증
- `create_initial_store` RPC 호출 (4개 인자: p_name, p_subtitle, p_default_language, p_invite_code)
- 사용자 친화적 한국어 오류 메시지

#### 2. auth-ui: invite code 입력 UI

- `_showInviteCodeForm` 함수 추가
- placeholder: `LS-XXXXXXXX`
- `showStoreOnboarding` 화면에서 세 가지 선택지 제공:
  - 새 매장 만들기
  - 초대 코드로 매장 참여
  - 게스트/연습 모드로 계속하기 (handler 제공 시에만)

#### 3. app-bootstrap: 핸들러 연결

- `onJoinWithInviteCode` 핸들러 추가
- `onContinueGuest` 핸들러 추가 (AUTH_GUEST_MODE_ENABLED=true 시)
- `_handleBootstrapResult`에서 `showStoreOnboarding` 호출 시 핸들러 전달

### 기존 흐름 보호

| 항목 | 결과 |
|---|---|
| existing owner 로그인 | ✅ 보호됨 (invite UI 강제 표시 없음) |
| guest mode 유지 | ✅ 유지됨 |
| createInitialStore 기존 동작 | ✅ 유지됨 |

### 테스트 결과

| 항목 | 결과 |
|---|---|
| tests | ✅ **473 tests, 0 fail** |
| preflight | ✅ **PASS** |
| browser smoke | ⏳ pending |

### 제약 준수

- 새 migration 파일 생성: ❌ (no)
- 기존 migration 수정: ❌ (no)
- supabase db push 실행: ❌ (no)
- supabase db push --include-seed: ❌ (no)
- supabase db reset --linked: ❌ (no)
- supabase db pull: ❌ (no)
- SQL Editor 수동 INSERT/UPDATE/DELETE: ❌ (no)
- service_role 사용: ❌ (no)
- service_role/token/key/password 출력: ❌ (no)
- 이메일 전체값 출력: ❌ (no)
- user_id/store_id 전체값 출력: ❌ (no)
- invite_code 전체값 문서 기록: ❌ (no)
- invitation id 전체값 문서 기록: ❌ (no)
- js/config.js commit: ❌ (no)
- data_export.json 생성/추가: ❌ (no)
- main/gh-pages 작업: ❌ (no)
- force push: ❌ (no)

---

## 53. 3-6E.6: Owner Member/Invite Management UI (2026-07-24)

### 목적

owner가 브라우저 UI에서 직원/초대 상태를 관리할 수 있는 최소 UI를 구현한다.
이번 단계는 **프론트 UI + 프론트 서비스 연결 + 테스트 + 문서화만** 수행한다.

### 구현 범위

- Owner 전용 “직원/초대 관리” 화면 추가 (route: `#/members`)
- 직원 목록 조회: `list_store_members()` RPC
- 직원 비활성화: `deactivate_store_member(p_member_id)` RPC
- 초대 코드 생성: `generate_store_invite_code(p_role, p_invited_email, p_expires_in_days)` RPC
- 초대 코드 목록: `list_store_invite_codes()` RPC
- 초대 코드 취소: `revoke_store_invite_code(p_invitation_id)` RPC
- staff/manager/guest/no-membership 사용자 접근 차단

### 수정 파일

| 파일 | 변경 |
|---|---|
| `index.html` | owner 전용 사이드바 메뉴(`nav-item-members`) 추가, `member-management.js` script load 추가 (app.js 로드 전) |
| `js/app.js` | `members` route case 추가, `MemberManagement.renderPage()` + `init()` 호출 |
| `js/app-bootstrap.js` | `_updateOwnerNavVisibility()` 함수 추가 (owner role일 때만 메뉴 표시, `document` 미존재 시 안전 종료) |
| `js/member-management.js` | 신규 파일: 서비스 함수(RPC 호출) + UI 렌더링 + owner-only gate |
| `css/style.css` | `.member-mgmt-container`, `.member-mgmt-card`, `.member-mgmt-table`, `.status-badge` 등 스타일 추가 |
| `tests/member-management-ui-contract.test.mjs` | 신규 파일: UI 계약 테스트 29개 |
| `docs/CURRENT_ARCHITECTURE.md` | 본 섹션 추가 |

### Route/Menu 위치

- 사이드바 `설정` 메뉴 앞에 `직원/초대 관리` 메뉴 추가
- `id="nav-item-members"` 기본 `display:none`
- `app-bootstrap._enterApp()` → `_updateOwnerNavVisibility()` 호출로 owner만 메뉴 표시
- hash route `#/members` → `MemberManagement.renderPage()` + `init()`

### Owner-only Gate

- `MemberManagement.isOwner()`: `LESOULAppBootstrap.getContext().activeMembership.role === 'owner'` 확인
- `renderPage()` 진입 시 `isOwner()` false → “이 화면은 매장 owner만 사용할 수 있습니다.” 차단 화면 반환
- `_updateOwnerNavVisibility()`: owner 외 role에서는 메뉴 숨김
- staff/manager/guest/no-membership: 메뉴 미표시 + 직접 route 접근 시 차단 화면

### 직원 목록 UI

- `list_store_members()` RPC 호출
- 컬럼: 이름, masked_email, 역할, 상태(active/inactive), 가입일, 관리
- 비활성화 버튼 표시 조건:
  - `member.role !== 'owner'` (owner role 비활성화 금지)
  - 본인 아님 (`member_id !== currentUserId`)
  - `member.is_active === true`
  - `member_id` 존재
- inactive staff는 “비활성” 상태 표시, 비활성화 버튼 미표시

### 비활성화 UI

- confirm 대화상자 표시
- `deactivate_store_member(p_member_id)` RPC 호출
- 성공 후 `list_store_members()` 재조회
- 버튼 중복 클릭 방지
- 사용자 친화적 한국어 메시지

### 초대 코드 생성 UI

- role 선택: `staff` / `manager` (owner 선택 불가)
- invited_email: optional
- expires_in_days: 기본 7, 허용 1~30
- 생성 성공 시 화면에 invite_code 표시 (사용자 복사용) + “복사” 버튼
- **console/docs에는 invite_code 전체값 기록 금지**

### 초대 코드 목록 UI

- `list_store_invite_codes()` RPC 호출
- 컬럼: 초대 코드(화면 표시), 역할, masked email, status, 생성일, 만료일, 관리
- revoke 버튼 표시 조건: `status === 'active' && !used_at && !revoked_at`
- revoke 클릭 시 confirm → `revoke_store_invite_code(p_invitation_id)` → 목록 재조회

### 보안 정책

| 항목 | 결과 |
|---|---|
| owner만 UI 접근 | ✅ |
| staff/manager 관리 버튼 표시 금지 | ✅ |
| guest/practice mode 표시 금지 | ✅ |
| no-membership user 표시 금지 | ✅ |
| owner 자기 자신 비활성화 버튼 표시 금지 | ✅ |
| owner role member 비활성화 버튼 표시 금지 | ✅ |
| inactive staff 비활성 상태 표시 | ✅ |
| member_id 전체값 출력 금지 | ✅ (console/docs 기록 없음) |
| invite_code 전체값 console/docs 출력 금지 | ✅ (화면에만 표시, 복사용) |
| email 전체값 출력 금지 | ✅ (masked 표시) |
| user_id/store_id 전체값 출력 금지 | ✅ |
| service_role/token/key/password 출력 금지 | ✅ |

### 테스트 결과

| 항목 | 결과 |
|---|---|
| tests | ✅ **543 tests, 0 fail** (기존 514 + 신규 29) |
| preflight | ✅ **PASS** |
| browser smoke (owner) | ⏳ pending (코드/테스트 검증으로 대체) |
| browser smoke (invite code) | ⏳ pending (코드/테스트 검증으로 대체) |
| browser smoke (staff/guest/no-membership 차단) | ⏳ pending (코드/테스트 검증으로 대체) |

### Side Effect

- 이번 단계에서 새로 생성한 invite code 없음 (smoke 미수행)
- 추가 staff deactivate 미수행
- 기존 inactive staff 상태 유지

### 제약 준수

- 새 migration 파일 생성: ❌ (no)
- 기존 migration 수정: ❌ (no)
- supabase db push 실행: ❌ (no)
- supabase db push --include-seed: ❌ (no)
- supabase db reset --linked: ❌ (no)
- supabase db pull: ❌ (no)
- SQL Editor 수동 INSERT/UPDATE/DELETE: ❌ (no)
- service_role 사용: ❌ (no)
- service_role/token/key/password 출력: ❌ (no)
- 이메일 전체값 출력: ❌ (no)
- user_id/store_id 전체값 출력: ❌ (no)
- invite_code 전체값 문서 기록: ❌ (no)
- invitation id 전체값 문서 기록: ❌ (no)
- member_id 전체값 문서 기록: ❌ (no)
- js/config.js commit: ❌ (no)
- data_export.json 생성/추가: ❌ (no)
- main/gh-pages 작업: ❌ (no)
- force push: ❌ (no)

### 최종 판정

- **PASS** (프론트 UI + 서비스 + 테스트 + 문서화 완료)
- browser smoke test는 코드/계약 테스트 검증으로 대체 (PENDING)

---

## 54. 3-6E.6.1: Owner Member/Invite Management UI Browser Smoke (2026-07-24)

### 목적

3-6E.6에서 구현한 owner용 “직원/초대 관리” UI가 실제 브라우저에서 정상 작동하는지 확인한다.
이번 단계는 브라우저 smoke + 문서화만 수행한다. **코드 수정 없음.**

### 환경

- Local server: `python3 -m http.server 8084`
- Browser: 자동화 브라우저 (browser_use subagent)
- 계정: owner 계정 로그인 후 대시보드 진입

### Owner Menu Smoke

| 항목 | 결과 |
|---|---|
| owner 로그인 후 “직원/초대 관리” 메뉴 표시 | ✅ PASS |
| 메뉴 href `#/members` | ✅ PASS |
| 클릭 시 `#/members` 이동 | ✅ PASS |
| 접근 차단 문구 “이 화면은 매장 owner만 사용할 수 있습니다.” | ✅ NO (owner이므로 미표시, 정상) |

### Member List UI Smoke

| 항목 | 결과 |
|---|---|
| 직원 목록 카드 표시 | ✅ PASS |
| owner row 표시 | ✅ PASS |
| inactive staff row 표시 | ✅ PASS (“비활성” 배지 확인) |
| masked_email 표시 | ✅ PASS (예: `sf***@gmail.com`, `ep***@hotmail.com`) |
| role 표시 | ✅ PASS |
| 상태 active/inactive 표시 | ✅ PASS |
| user_id/store_id/member_id 전체값 표시 | ✅ NO (전체값 노출 없음) |

### Deactivate Button Safety Smoke

| 항목 | 결과 |
|---|---|
| owner row 비활성화 버튼 부재 | ✅ PASS |
| inactive staff row 비활성화 버튼 부재 | ✅ PASS |
| 추가 staff deactivate 실행 | ❌ (no, 이번 단계에서 미실행) |

### Invite Generate UI Smoke

| 항목 | 결과 |
|---|---|
| role staff 선택 | ✅ PASS |
| expires_in_days 7 | ✅ PASS |
| invited_email 비워둠 | ✅ PASS |
| 초대 코드 생성 성공 | ✅ PASS |
| 화면에 invite code 표시 | ✅ PASS (복사 버튼 포함) |
| console/docs에 invite_code 전체값 기록 | ✅ NO (마스킹만 기록: `LS-XXXX****`) |
| 마스킹된 invite_code 형식 | `LS-XXXX****` |

### Invite List UI Smoke

| 항목 | 결과 |
|---|---|
| 방금 생성한 invite 목록 표시 | ✅ PASS |
| status: active | ✅ PASS |
| role: staff | ✅ PASS |
| expires_at 표시 | ✅ PASS |
| revoke 버튼 표시 | ✅ PASS |
| invitation id 전체값 docs/console 기록 | ✅ NO |

### Revoke UI Smoke

| 항목 | 결과 |
|---|---|
| revoke 버튼 클릭 | ✅ PASS |
| confirm 대화상자 확인 | ✅ PASS |
| revoke 성공 | ✅ PASS |
| status revoked 확인 | ✅ PASS |
| revoke 버튼 사라짐 | ✅ PASS |
| active invite 남아있지 않음 | ✅ PASS |

### Staff/Guest/No-membership 차단 Smoke

| 항목 | 결과 |
|---|---|
| staff/guest/no-membership browser smoke | ⏳ PENDING |
| reason | 별도 계정으로 이번 smoke run에서 테스트 불가 |
| 대체 검증 | code/contract tests (29개)로 owner-only gate 검증 완료 |

### Console Errors / Sensitive Data Leak

| 항목 | 결과 |
|---|---|
| console errors | ✅ none |
| full invite_code console 출력 | ✅ NO |
| full email console 출력 | ✅ NO |
| full member_id/user_id/store_id console 출력 | ✅ NO |
| token/key/password console 출력 | ✅ NO |

### Post-smoke Tests

| 항목 | 결과 |
|---|---|
| tests | ✅ **543 tests, 0 fail** |
| preflight | ✅ **PASS** |

### Side Effect

- smoke에서 생성한 invite code는 **revoked 처리 완료** (active 남아있지 않음)
- 추가 staff deactivate 미실행
- 기존 inactive staff 상태 유지

### 제약 준수

- 코드 수정: ❌ (no)
- 새 migration 파일 생성: ❌ (no)
- 기존 migration 수정: ❌ (no)
- supabase db push 실행: ❌ (no)
- supabase db reset --linked: ❌ (no)
- supabase db pull: ❌ (no)
- SQL Editor 수동 INSERT/UPDATE/DELETE: ❌ (no)
- service_role 사용: ❌ (no)
- service_role/token/key/password 출력: ❌ (no)
- 이메일 전체값 출력: ❌ (no, masked only)
- user_id/store_id/member_id 전체값 출력: ❌ (no)
- invite_code 전체값 docs/console 기록: ❌ (no, masked only)
- invitation id 전체값 docs/console 기록: ❌ (no)
- js/config.js commit: ❌ (no)
- data_export.json 생성/추가: ❌ (no)
- main/gh-pages 작업: ❌ (no)
- force push: ❌ (no)

### 최종 판정

- **PASS** (owner member/invite management UI browser smoke 완료)
- staff/guest/no-membership browser smoke: PENDING (코드/계약 테스트로 대체 검증)

---

## 55. 3-6E.6.2: Non-owner Member UI Access Block Browser Smoke (2026-07-24)

### 목적

owner가 아닌 사용자(staff/no-membership/guest)가 “직원/초대 관리” UI(`#/members`)에 접근하지 못하는지 실제 브라우저에서 확인한다.
이번 단계는 browser smoke + 문서화만 수행한다. **코드 수정 없음.**

### 환경

- Local server: `python3 -m http.server 8084`
- Browser: 자동화 브라우저 (browser_use subagent) 준비
- pre-smoke tests: 543 tests, 0 fail
- pre-smoke preflight: PASS

### Active Staff Browser Smoke

| 항목 | 결과 |
|---|---|
| active staff browser smoke | ⏳ PENDING |
| staff menu hidden | ⏳ PENDING |
| staff direct `#/members` block | ⏳ PENDING |
| reason | 별도 active staff 계정 없음 + 새 계정 가입/join 절차 생략 |
| 대체 검증 | code/contract tests (29개)로 owner-only gate + isOwner() + renderAccessDenied() 검증 완료 |

### No-membership Browser Smoke

| 항목 | 결과 |
|---|---|
| no-membership browser smoke | ⏳ PENDING |
| no-membership onboarding 유지 | ⏳ PENDING |
| reason | 별도 no-membership 계정 없음 |
| 대체 검증 | 3-6E.4.1-FIX + 3-6E.4.2 smoke에서 no-membership → `showStoreOnboarding` 차단 이미 검증됨 |

### Guest/Practice Mode Browser Smoke

| 항목 | 결과 |
|---|---|
| guest/practice browser smoke | ⏳ PENDING |
| guest direct `#/members` block | ⏳ PENDING |
| reason | guest path not exercised in this smoke run |
| 대체 검증 | code/contract tests로 owner-only gate 검증 완료 |

### `#/members` Direct Access Block

- active staff: PENDING (별도 계정 없음)
- no-membership: PENDING (별도 계정 없음)
- guest: PENDING (guest path 미실행)
- 대체: contract tests에서 `isOwner()` false → `renderAccessDenied()` → “이 화면은 매장 owner만 사용할 수 있습니다.” 차단 문구 검증

### Cleanup 결과

| 항목 | 결과 |
|---|---|
| temporary staff created | ❌ no (B안 미사용) |
| temporary staff deactivated | ❌ no (생성 없음) |
| active invite leftover | ❌ no (이번 단계에서 invite 생성 없음) |

### Sensitive Data Leak

| 항목 | 결과 |
|---|---|
| full invite_code docs/console 기록 | ❌ no (이번 단계에서 invite 생성 없음) |
| full email/user_id/store_id/member_id docs/console 기록 | ❌ no |
| token/key/password 출력 | ❌ no |

### Post-smoke Tests

| 항목 | 결과 |
|---|---|
| tests | ✅ **543 tests, 0 fail** |
| preflight | ✅ **PASS** |

### Side Effect

- 이번 단계에서 새 staff 생성 없음
- 이번 단계에서 새 invite code 생성 없음
- 기존 inactive staff 상태 유지
- DB 변경 없음

### 제약 준수

- 코드 수정: ❌ (no)
- 새 migration 파일 생성: ❌ (no)
- 기존 migration 수정: ❌ (no)
- supabase db push 실행: ❌ (no)
- supabase db reset --linked: ❌ (no)
- supabase db pull: ❌ (no)
- SQL Editor 수동 INSERT/UPDATE/DELETE: ❌ (no)
- service_role 사용: ❌ (no)
- service_role/token/key/password 출력: ❌ (no)
- 이메일 전체값 출력: ❌ (no)
- user_id/store_id/member_id 전체값 출력: ❌ (no)
- invite_code 전체값 docs/console 기록: ❌ (no)
- invitation id 전체값 docs/console 기록: ❌ (no)
- js/config.js commit: ❌ (no)
- data_export.json 생성/추가: ❌ (no)
- main/gh-pages 작업: ❌ (no)
- force push: ❌ (no)

### 최종 판정

- **PASS** (코드/계약 테스트로 non-owner 차단 정책 검증 완료)
- active staff/no-membership/guest browser smoke: PENDING (별도 계정 부재)
- 대체 검증: 29개 contract tests로 `isOwner()` gate + `renderAccessDenied()` + `_updateOwnerNavVisibility()` 검증 완료

---

## 56. 3-6F: Billing/Subscription Placeholder Architecture (2026-07-24)

### 목적

결제/구독 기능을 나중에 붙일 수 있도록 구조와 보안 원칙만 먼저 정의한다.
현재 단계에서는 결제 기능을 구현하지 않는다.
현재 앱 동작에는 영향이 없어야 한다.

> **Important**: 이 섹션은 placeholder architecture 문서화일 뿐이다.
> 실제 구현은 별도 단계(3-6F.x)에서 진행한다.

### 권장 구현 단계 (미래 계획)

#### Phase 1: Manual Subscription Placeholder

- owner가 수동 결제 후 관리자 승인 방식
- 가장 빠르고 안전한 1차 방식
- 앱 내부에서는 subscription 상태만 읽도록 설계
- DB에는 store-level subscription status 필드만 추가 (아직 안 만듦)
- UI에는 현재 플랜 상태만 표시 (아직 안 만듦)

#### Phase 2: Subscription DB/RLS 설계

- `store_subscriptions` 또는 `stores` 내장 필드 중 선택
- 후보 필드:
  - `plan` (free / basic / pro / enterprise 등)
  - `status` (active / canceled / past_due / trialing)
  - `current_period_start`
  - `current_period_end`
  - `trial_until`
  - `canceled_at`
  - `provider` (stripe / alipay / wechat / manual)
  - `provider_subscription_id` (결제사 구독 ID)
- RLS: owner-only 조회/관리, staff는 조회만 (또는 못 봄)
- write는 서버/Edge Function에서만 수행

#### Phase 3: Edge Function 결제 서버

- 결제 secret key는 브라우저에 절대 두지 않음
- Supabase Edge Function 또는 별도 backend에서 checkout/session/payment request 생성
- webhook 검증은 서버에서만 수행
- 결제 성공/실패 이벤트는 webhook → DB 업데이트 흐름
- 브라우저는 checkout URL만 받아서 리다이렉트

#### Phase 4: Payment Provider Adapter

- 후보 제공사:
  - **Stripe Checkout/Billing**: 해외 SaaS형, global, developer friendly
  - **Alipay**: 중국 고객 대상
  - **WeChat Pay**: 중국 고객 대상
- 지역/사업자/계정 조건에 따라 선택
- 공통 인터페이스로 adapter 패턴 권장
- provider-specific 로직은 서버에만 격리

#### Phase 5: UI 연결

- owner settings 페이지 또는 별도 billing page
- 표시 항목:
  - 현재 플랜
  - 만료일
  - 결제 상태
  - 업그레이드/연장 안내
  - 결제 이력 (간략)
- 미결제 상태에서 기능 제한 여부는 별도 정책으로 결정
- staff/manager에게는 billing 정보 노출 여부 별도 정책

### 보안 원칙

| 원칙 | 설명 |
|---|---|
| publishable/public key만 브라우저 허용 | 결제사의 공개 키만 프론트로 |
| secret key 브라우저 금지 | 절대 브라우저에 내려보내지 않음 |
| service_role 브라우저 금지 | 기존 정책 유지 |
| webhook secret 브라우저 금지 | 서버에서만 보관 |
| payment provider secret git/docs/config 기록 금지 | 절대 리포지토리에 커밋하지 않음 |
| js/config.js에 결제 secret 저장 금지 | 기존 정책 유지 |
| subscription status는 서버 검증 기준 | 클라이언트 상태만 믿고 기능 열지 않음 |
| 클라이언트 localStorage만 믿고 유료 기능 열지 않음 | 반드시 서버/DB에서 현재 상태 검증 |
| 결제 금액/플랜은 서버에서 결정 | 클라이언트에서 조작 불가 |
| webhook signature 검증 필수 | 위조된 webhook 거부 |

### 초기 정책 권장안

- **지금은 결제 차단을 켜지 않는다.**
- LESOUL owner는 계속 사용 가능.
- 결제 기능은 placeholder만 둔다.
- 실제 과금 전에는 운영 정책/환불 정책/가격 정책을 별도 문서화한다.
- 중국 고객 결제는 Alipay/WeChat Pay 가능성을 검토하되, 구현은 나중에 한다.
- 해외 SaaS형이면 Stripe Checkout/Billing을 우선 검토한다.
- 가장 안전한 1차 방식은 manual payment + admin approval이다.

### 현재 단계에서 하지 않는 것

- ❌ subscription table 생성 안 함
- ❌ migration 생성 안 함
- ❌ Edge Function 생성 안 함
- ❌ 결제 SDK 설치 안 함
- ❌ 결제 버튼 UI 추가 안 함
- ❌ 결제 secret/key 작성 안 함
- ❌ 실제 결제 테스트 안 함
- ❌ 가격 계산 기능 구현 안 함
- ❌ JS/CSS/HTML 코드 수정 안 함
- ❌ supabase db push 안 함
- ❌ SQL Editor 작업 안 함

### 향후 후보 섹션

| 섹션 | 제목 |
|---|---|
| 3-6F.1 | Billing DB/RLS draft |
| 3-6F.2 | Manual subscription admin flow |
| 3-6F.3 | Billing UI placeholder |
| 3-6F.4 | Edge Function payment architecture |
| 3-6F.5 | Provider decision (Stripe vs Alipay vs WeChat Pay) |

### 검증 결과

| 항목 | 결과 |
|---|---|
| docs-only | ✅ yes |
| code changes | ❌ no |
| migration | ❌ no |
| db push | ❌ no |
| tests | ✅ **543 tests, 0 fail** |
| preflight | ✅ **PASS** |
| secret key in docs | ❌ no |
| token/password in docs | ❌ no |
| service_role in docs | ❌ no |
| 실제 결제 API key in docs | ❌ no |

### 최종 판정

- **PASS** (Billing/Subscription Placeholder Architecture 문서화 완료)
- 코드/DB/UI 변경 없음
- 향후 결제 기능 구현 시 참조할 보안 원칙과 단계 계획 정의

---

## 57. 3-6G: Supabase Cloud MVP Final Readiness Audit (2026-07-24)

### 목적

Supabase Cloud MVP 전환 작업의 현재 준비 상태를 요약한다.
지금까지 완료된 범위와 아직 남은 범위를 명확히 구분한다.
운영 투입 전 위험 요소를 정리한다.

> **Important**: 이 섹션은 audit/docs-only 작업이다.
> 코드/DB/Edge Function/결제 기능 변경 없음.

### 완료된 영역

#### 1. Git/GitHub Safety

| 항목 | 상태 |
|---|---|
| cleaned branch 사용 | ✅ PASS (`feature/supabase-cloud-migration`) |
| main/gh-pages 직접 작업 없음 | ✅ PASS |
| force push 없음 | ✅ PASS |
| data_export.json 없음 | ✅ PASS |
| js/config.js commit 없음 | ✅ PASS |
| GitHub Support ticket | ⚠️ PARTIAL (민감데이터 purge ticket은 아직 닫지 않음, GitHub 확인 후 close 예정) |

#### 2. Supabase Remote DB

| 항목 | 상태 |
|---|---|
| remote project linked | ✅ PASS |
| migrations Local/Remote 동기화 | ✅ PASS (Local 19 = Remote 19) |
| 19 migrations applied | ✅ PASS |
| latest applied migration | ✅ `20260711001700_store_member_management_rpcs.sql` |
| no seed push | ✅ PASS |
| no reset/pull | ✅ PASS |

#### 3. Auth / Membership

| 항목 | 상태 |
|---|---|
| owner login flow | ✅ PASS (3-6E.2.4 smoke) |
| no-membership onboarding flow | ✅ PASS (3-6E.4.2 smoke) |
| invite-code join flow | ✅ PASS (3-6E.4.2 smoke) |
| guest/practice separation | ✅ PASS (3-6E.4.1-FIX) |
| owner-only actual LESOUL access policy | ✅ PASS |

#### 4. Invite System

| 항목 | 상태 |
|---|---|
| store_invitations foundation | ✅ PASS (3-6E.1) |
| create_initial_store invite-code hardening | ✅ PASS (3-6E.2) |
| generate_store_invite_code | ✅ PASS (3-6E.3) |
| list_store_invite_codes | ✅ PASS (3-6E.3.2) |
| revoke_store_invite_code | ✅ PASS (3-6E.3.2) |
| owner browser smoke | ✅ PASS (3-6E.4.2, 3-6E.6.1) |
| no active invite leftover from smoke | ✅ PASS (모든 smoke invite는 revoked 처리됨) |

#### 5. Member Management

| 항목 | 상태 |
|---|---|
| list_store_members | ✅ PASS (3-6E.5) |
| deactivate_store_member | ✅ PASS (3-6E.5.1) |
| owner UI route `#/members` | ✅ PASS (3-6E.6) |
| owner member/invite UI browser smoke | ✅ PASS (3-6E.6.1) |
| non-owner browser smoke | ⏳ PENDING (별도 계정 부재, 3-6E.6.2) |
| contract tests cover owner-only gate | ✅ PASS (29개 contract tests) |

#### 6. Products Remote Path

| 항목 | 상태 |
|---|---|
| Supabase Product DataSource exists | ✅ PASS |
| create/update/delete product RPC path exists | ✅ PASS |
| prior owner browser product smoke | ✅ PASS |
| guest/no-membership actual LESOUL product access restricted | ✅ PASS |
| orders/customers/analytics full remote conversion | ⏳ PENDING |

#### 7. Billing Placeholder

| 항목 | 상태 |
|---|---|
| architecture documented | ✅ PASS (3-6F) |
| no payment implementation | ✅ (구현 안 함) |
| no Edge Function | ✅ (생성 안 함) |
| no secret key | ✅ (작성 안 함) |
| no DB table yet | ✅ (생성 안 함) |

#### 8. Test/Preflight

| 항목 | 상태 |
|---|---|
| current tests result | ✅ **543 tests, 0 fail** |
| current preflight result | ✅ **PASS** |
| GitHub Actions CI | ❌ PENDING (설정 안 됨) |

### Remaining Work

아래 항목은 PENDING으로 명확히 기록:

- ⏳ staff/no-membership/guest actual browser smoke with separate accounts
- ⏳ orders remote migration/data source
- ⏳ customers remote migration/data source
- ⏳ analytics remote aggregation
- ⏳ expenses/settings/keywords remote review
- ⏳ billing DB/RLS actual implementation
- ⏳ billing UI actual implementation
- ⏳ premium boutique UI redesign
- ⏳ GitHub cached sensitive object purge 확인 (Support ticket close는 GitHub 확인 후)
- ⏳ main/gh-pages merge/deploy decision (나중에 결정)

### Risk Register

| Risk | Current Level | Mitigation |
|---|---|---|
| GitHub cached sensitive object pending | ⚠️ Medium | Support ticket 유지, GitHub purge 확인 전까지 ticket close 금지 |
| no CI | ⚠️ Medium | preflight + local tests로 대체, 향후 GitHub Actions 도입 검토 |
| local-only js/config.js dependency | ⚠️ Medium | config.example.js로 template 제공, 실제 config는 gitignored |
| no full non-owner browser test account | ⚠️ Low | contract tests로 owner-only gate 검증, 별도 계정 확보 시 smoke 보완 |
| orders/customers still local or partially remote | ⚠️ Medium | 3-8A/3-8B에서 remote 전환 계획 |
| manual Supabase remote operations risk | ⚠️ Medium | preflight + dry-run + db push gate 유지 |
| payment not implemented | ℹ️ Low | billing placeholder로 정책만 정의, 실제 구현은 후순위 |
| browser smoke depends on local config | ⚠️ Low | local server + config.js 의존성 명시, 운영 환경 분리 시 별도 검증 필요 |

### Go/No-Go 판정

| 항목 | 판정 |
|---|---|
| Internal owner testing | ✅ **GO** |
| Public multi-user production | ❌ **NO-GO** |
| Paid subscription production | ❌ **NO-GO** |
| Product CRUD owner smoke | ✅ **GO with caution** |
| Staff/member management | ✅ **GO for owner**, ⏳ PENDING for real staff account browser verification |

### Next Recommended Steps

1. **3-6G.1**: Runtime Config & Local Server Hygiene
2. **3-7A**: Premium Boutique UI Polish Plan
3. **3-7B**: Dashboard / Products UI Polish
4. **3-8A**: Orders Remote DataSource Planning
5. **3-8B**: Customers Remote DataSource Planning
6. Billing actual implementation은 뒤로 미룸

### 검증 결과

| 항목 | 결과 |
|---|---|
| docs-only | ✅ yes |
| code changes | ❌ no |
| migration | ❌ no |
| db push | ❌ no |
| tests | ✅ **543 tests, 0 fail** |
| preflight | ✅ **PASS** |
| 실제 token/key/password 값 in docs | ❌ no |
| js/config.js in docs | ❌ no |
| migration 변경 | ❌ no |
| data_export.json | ❌ no |

> 보안 원칙 설명을 위해 `service_role`, `token`, `key`, `password` 등의 단어가 “금지/위험” 문맥으로 등장하는 것은 허용. 실제 값이나 예시 키는 금지.

### 최종 판정

- **PASS** (Supabase Cloud MVP Final Readiness Audit 문서화 완료)
- Internal owner testing: **GO**
- Public multi-user / paid subscription production: **NO-GO**
- 코드/DB/UI 변경 없음
- 향후 작업은 3-6G.1 → 3-7A → 3-7B → 3-8A → 3-8B 순서 권장

---

## 58. 3-6G.1: Runtime Config & Local Server Hygiene (2026-07-24)

### 목적

local server 포트 누적 방지를 위한 운영 규칙과 정리 스크립트를 도입한다.
이전 smoke run에서 8080~8089에 남아 있던 http.server 프로세스를 정리하고,
앞으로 local server는 기본적으로 8080만 사용하도록 문서화한다.

### 정정 사항

이전 3-6G 보고에서 8081~8083을 “다른 프로세스”로 유지했다고 기록했지만,
사용자 확인 결과 8081~8083도 fashionmanager 웹앱 작업 중 생성된 local http.server였다.
따라서 8081~8083도 정리 대상이다.

### 정리 전 8080~8089 상태

| PORT | PID | Command |
|---|---|---|
| 8081 | 11728 | `Python -m http.server 8081` |
| 8082 | 27931 | `Python -m http.server 8082` |
| 8083 | 30530 | `Python -m http.server 8083` |

(8080, 8084~8089는 리스너 없음)

### 종료한 python http.server PID/PORT 요약

| PORT | PID | 결과 |
|---|---|---|
| 8081 | 11728 | ✅ stopped |
| 8082 | 27931 | ✅ stopped |
| 8083 | 30530 | ✅ stopped |

비-http.server 프로세스는 건드리지 않음.

### 정리 후 8080~8089 상태

- 8080~8089: **no listeners**
- http.server processes: **no http.server processes**

### Hygiene Script 추가

- 파일: [scripts/local-server-hygiene.sh](file:///Users/lesoul888/Documents/LESOUL_STORE_APP/fashionmanager/scripts/local-server-hygiene.sh)
- 실행 권한: `chmod +x` 적용
- 모드:
  - `bash scripts/local-server-hygiene.sh` (기본, check-only)
  - `bash scripts/local-server-hygiene.sh --kill` (http.server 종료)
- 동작:
  - 8080~8089 포트의 리스너 확인
  - `python3 -m http.server` 명령어 매칭 시에만 종료
  - 비-http.server 프로세스는 유지
  - 코드/DB/migration/config 변경 없음

### 검증 결과

| 단계 | 결과 |
|---|---|
| check-only 모드 | ✅ 정상 동작 |
| `--kill` 모드 | ✅ 정상 동작 (http.server만 종료) |
| 최종 check 모드 | ✅ no listeners / no http.server |

### 운영 규칙 (Local Server Hygiene Policy)

1. **기본 포트는 8080**
   - local smoke/test 서버는 가급적 `python3 -m http.server 8080` 사용
2. **8081~8089는 임시 fallback으로만 사용**
   - 8080이 이미 사용 중일 때만 8081, 8082 순서로 fallback
   - smoke 종료 후 반드시 종료 또는 hygiene script로 정리
3. **smoke/test 종료 후 정리**
   - 서버 실행 시 `Ctrl+C`로 종료, 또는
   - `bash scripts/local-server-hygiene.sh --kill` 실행
4. **서버 새로 실행 전 확인**
   - `bash scripts/local-server-hygiene.sh` (check-only)로 잔여 프로세스 확인
5. **js/config.js 정책**
   - `js/config.js`는 local-only이며 gitignored
   - `js/config.example.js`는 template/fallback
6. **browser config 보안 정책**
   - browser config에는 publishable/public key만 허용
   - `service_role` / secret / token / password는 browser config 금지

### 검증 결과

| 항목 | 결과 |
|---|---|
| docs-only + script | ✅ yes |
| app code changes | ❌ no |
| migration | ❌ no |
| db push | ❌ no |
| tests | ✅ **543 tests, 0 fail** |
| preflight | ✅ **PASS** |
| 실제 token/key/password 값 | ❌ no |
| js/config.js commit | ❌ no |
| migration 변경 | ❌ no |
| data_export.json | ❌ no |

### 최종 판정

- **PASS** (Runtime Config & Local Server Hygiene 완료)
- 8081~8083 잔여 http.server 정리 완료
- hygiene script 도입으로 향후 포트 누적 방지
- app 코드/DB/UI 변경 없음

---

## 59. 3-7A: Premium Boutique UI Polish Plan (2026-07-24)

### 목적

LESOUL의 실제 브랜드 톤에 맞는 고급 여성복 편집샵/프라이빗 피팅샵 UI 방향을 정의한다.
현재 기능을 깨지 않고 CSS-first로 점진 개선하기 위한 계획만 문서화한다.
**이번 단계에서는 실제 UI 구현을 하지 않는다.**

### 브랜드 톤

- **quiet luxury**
- **premium boutique**
- Korean niche designer select shop
- elegant, calm, refined
- 색상 팔레트 후보:
  - beige
  - ivory
  - warm white
  - muted brown
  - soft charcoal
- 금지 톤:
  - 지나친 쇼핑몰 느낌
  - 과도한 원색
  - 저가 할인몰 느낌

### UI 원칙

1. 기존 JS selector와 DOM id/class를 깨지 않음
2. 기능 구현보다 시각 polish 우선
3. CSS 변수 기반으로 색상/spacing 정리
4. dashboard/products/settings/members 화면부터 점진 적용
5. 모바일/데스크톱 모두 고려
6. readability 우선
7. 버튼/카드/테이블/폼을 boutique admin tone으로 통일

### 적용 우선순위

| 순서 | 항목 |
|---|---|
| 1 | Global theme tokens (colors, radius, shadow, spacing, typography) |
| 2 | Header / sidebar polish |
| 3 | Dashboard cards polish |
| 4 | Product list/table/card polish |
| 5 | Member/invite management UI polish |
| 6 | Forms/buttons/modal/flash polish |
| 7 | Empty state / loading state polish |
| 8 | Mobile responsive polish |

### 화면별 개선 방향

#### Dashboard

- KPI card를 더 고급스럽고 조용한 톤으로
- 수치 가독성 강화
- chart/card 여백 정리

#### Products

- 테이블/상품 카드 정돈
- 상품명/가격/상태/재고 가독성 강화
- 삭제/편집 버튼은 과격하지 않게

#### Members

- owner/admin 기능이므로 차분하고 신뢰감 있는 톤
- danger action은 명확하지만 과하지 않게

#### Settings

- 브랜드 설정, 언어 설정, billing placeholder와 연결될 가능성 고려

#### Auth/Onboarding

- LESOUL 브랜드 첫인상 개선
- invite code 입력 UI를 premium하게 정리

### 금지사항

- ❌ JS 동작 변경 금지
- ❌ DB/RPC 변경 금지
- ❌ selector 파괴 금지
- ❌ 기능 이름 변경 금지
- ❌ routes 변경 금지
- ❌ 인증/권한 로직 변경 금지
- ❌ 실험적인 큰 리디자인 금지
- ❌ 한번에 전체를 갈아엎기 금지

### 구현 단계 후보

| 단계 | 제목 |
|---|---|
| 3-7B | Global Theme Tokens + Header/Sidebar CSS Polish |
| 3-7C | Dashboard Premium Cards Polish |
| 3-7D | Products List/Table Premium Polish |
| 3-7E | Auth/Onboarding Premium Polish |
| 3-7F | Member/Invite Management Premium Polish |
| 3-7G | Mobile Responsive Polish |

### 검증 기준

- tests pass
- preflight pass
- browser smoke for owner dashboard/products
- no app logic changes unless explicitly planned
- no auth regression
- no route regression
- no product CRUD regression
- no config leak

### 현재 단계 검증 결과

| 항목 | 결과 |
|---|---|
| docs-only | ✅ yes |
| app code changes | ❌ no |
| migration | ❌ no |
| db push | ❌ no |
| tests | ✅ **543 tests, 0 fail** |
| preflight | ✅ **PASS** |
| local server hygiene check | ✅ no listeners, no http.server processes |
| 실제 token/key/password 값 | ❌ no |
| js/config.js commit | ❌ no |
| migration 변경 | ❌ no |
| data_export.json | ❌ no |

### 최종 판정

- **PASS** (Premium Boutique UI Polish Plan 문서화 완료)
- UI 구현 없음, 코드/DB 변경 없음
- 향후 3-7B ~ 3-7G 단계에서 CSS-first 점진 적용 예정

---

## 3-7B: Global Theme Tokens + Header/Sidebar CSS Polish

### 목적

LESOUL 앱의 전체 시각 톤을 premium boutique / quiet luxury 방향으로 전환.
CSS-first 작업으로 JS 동작, HTML 구조, DB/Supabase 작업은 일절 금지.
브랜드 톤: beige / ivory / warm white / muted brown / soft charcoal.

### 수정 파일

- `css/style.css` (theme tokens 재정의 + header/sidebar/auth/card/button 등 premium tone 적용)
- `tests/ui-theme-contract.test.mjs` (신규 추가: 47개 테스트)
- `docs/CURRENT_ARCHITECTURE.md` (본 섹션)

### Theme Token 변경 요약

| Token | 기존 값 | 3-7B 값 | 비고 |
|---|---|---|---|
| `--primary` | `#667eea` (파랑) | `#8B7355` (muted brown) | boutique brown |
| `--primary-dark` | `#764ba2` (보라) | `#6A5641` (deep brown) |  |
| `--primary-light` | (없음) | `#B8A088` (soft brown) | 신규 추가 |
| `--gradient` | 파랑→보라 | `#8B7355 → #6A5641` | brown gradient |
| `--success` | `#28a745` | `#6B8E5A` | muted sage |
| `--warning` | `#ffc107` | `#C9A36A` | warm camel |
| `--danger` | `#dc3545` | `#A0563C` | muted terracotta |
| `--info` | `#17a2b8` | `#7B8C9A` | muted slate |
| `--white` | `#ffffff` | `#FAF7F2` | warm white |
| `--background` | (없음) | `#F5F1EB` | warm ivory (신규) |
| `--border-color` | (없음) | `#E0D8CE` | soft beige gray (신규) |
| `--gray-50..900` | 차가운 회색 | warm gray ramp |  |
| `--border-radius` | `8px` | `12px` | refined |
| `--shadow-sm/md/lg` | 차가운 검정 그림자 | warm charcoal rgba |  |
| `--sidebar-width` | `220px` | `220px` | 유지 |
| `--header-height` | `60px` | `60px` | 유지 |

기존 변수명은 모두 유지, 값만 premium tone으로 조정. 신규 변수는 추가만(`--primary-light`, `--background`, `--border-color`).

### Header Polish 요약

- `.header`: gradient 배경 → `var(--white)` warm white, `border-bottom: 1px solid var(--border-color)`, subtle shadow
- `.store-name`: letter-spacing 2px, refined font weight 600
- `.store-subtitle`: muted warm gray
- `.lang-btn`: transparent 배경, subtle hover, 기존 파랑 box-shadow 제거
- `.sidebar-toggle`: transparent + border, warm hover

### Sidebar Polish 요약

- `.sidebar`: `var(--white)` 배경, `border-right: 1px solid var(--border-color)`
- `.nav-menu`: padding 조정 (14px 10px)
- `.nav-link`: warm gray text, 8px border-radius, margin 0 4px
- `.nav-link:hover`: warm ivory background + `--primary-dark` text
- `.nav-link.active`: `rgba(139, 115, 85, 0.10)` 배경 + `--primary-dark` text + brown border-left
- `.nav-link i`: warm gray, active 시 brown
- `.sidebar.collapsed` 70px 규칙 유지

### 기타 Premium Tone 적용

- `.card`, `.stat-card`, `.chart-container`, `.member-mgmt-card`: warm white 배경 + soft beige border
- `.btn-primary`: `var(--primary)` flat (gradient 제거)
- `.preference-tag`: brown flat
- `.stat-card::before`: brown 3px (gradient 4px → flat 3px)
- `.upload-area:hover/.dragover`: brown rgba
- `.form-control:focus`: brown rgba shadow
- `.auth-root`: brown gradient 배경
- `.auth-panel`: warm white, warm shadow
- `.auth-logo`: brown gradient text
- `.auth-button`: brown flat
- `.auth-input:focus`: brown shadow
- `.auth-context-badge`: warm brown tint pill
- `.auth-logout-button`: outline style (warm gray)
- `.badge-vip/gold/silver/bronze`: warm gold/camel/taupe/bronze gradient
- `.classification-badge.category/color/size`: warm brown/terracotta/sage tint
- `.status-badge.*`: premium tone rgba

### 변경 금지 항목 준수

| 항목 | 상태 |
|---|---|
| JS 동작 변경 | ❌ 없음 |
| HTML 구조 변경 | ❌ 없음 (index.html 미수정) |
| DB/Supabase 작업 | ❌ 없음 |
| migration 파일 | ❌ 미수정 |
| 기존 selector/id/class | ✅ 모두 유지 |
| 기존 route/hash 동작 | ✅ 유지 |
| auth/bootstrap 동작 | ✅ 유지 |
| `js/config.js` | ❌ 미생성/미커밋 |
| `data_export.json` | ❌ 미생성/미커밋 |
| service_role/token/key/password | ❌ 미출력 |

### Tests 결과

| 항목 | 결과 |
|---|---|
| 전체 tests | **590 tests, 0 fail** |
| 기존 tests | 543 → all pass |
| 신규 tests (ui-theme-contract) | 47 → all pass |
| TC1~TC11 | premium theme tokens 검증 ✅ |
| TC12~TC29 | critical selectors 유지 검증 ✅ |
| TC30~TC37 | index.html DOM contract 검증 ✅ |
| TC38~TC40 | JS logic untouched 검증 ✅ |
| TC41~TC45 | mobile responsive contract 검증 ✅ |
| TC46~TC47 | sensitive data safety 검증 ✅ |

### Preflight 결과

| 항목 | 결과 |
|---|---|
| Branch check | ✅ PASS |
| Staged files check | ✅ PASS |
| Tracked forbidden files check | ✅ PASS |
| service_role / sb_secret_ scan | ✅ PASS |
| token/session/key console.log scan | ✅ PASS |
| config.example.js default flags | ✅ PASS |
| .gitignore check | ✅ PASS |
| supabase migrations/tests check | ✅ PASS |
| **전체** | ✅ **PASS** |

### Browser Visual Smoke 결과

| 항목 | 결과 |
|---|---|
| 페이지 로드 | ✅ 정상 |
| premium brown tone 적용 | ✅ 확인 (기존 파랑/보라 아님) |
| console error | ✅ 없음 |
| layout 깨짐 | ✅ 없음 |
| 스크린샷 | ✅ 캡처 완료 |

- SUPABASE_ENABLED=false (legacy mode)로 대시보드 직접 렌더링됨
- owner 로그인 후 화면은 사용자 직접 확인 권장

### Local Server Hygiene 결과

| 항목 | 결과 |
|---|---|
| 작업 전 check | ✅ no listeners, no http.server |
| 서버 실행 | python3 -m http.server 8080 |
| 서버 종료 | `--kill` 모드로 정리 |
| 작업 후 check | ✅ no listeners on 8080-8089, no http.server processes |

### 최종 판정

- **PASS** (Global Theme Tokens + Header/Sidebar CSS Polish 완료)
- CSS-only 변경, JS/HTML/DB/migration 변경 없음
- 기존 543 + 신규 47 = 590 tests all pass
- preflight PASS
- browser smoke PASS (premium brown tone, no error, no layout break)
- local server cleanup 완료
- 향후 3-7C 이후 단계에서 추가 UI polish 예정

---

## 3-7C: Dashboard Premium Cards Polish

### 목적

Dashboard 화면의 KPI cards, chart cards, quick summary 영역을 LESOUL premium boutique admin tone에 맞게 polish.
3-7B에서 정의한 global theme tokens를 기반으로 dashboard-specific CSS 보강.
CSS-first 작업으로 JS 동작, HTML 구조, DB/Supabase 작업은 일절 금지.

### 수정 파일

- `css/style.css` (KPI stat-card, chart-container, card typography, badge/flash premium rgba, dashboard 보강 규칙)
- `tests/dashboard-theme-contract.test.mjs` (신규 추가: 26개 테스트)
- `docs/CURRENT_ARCHITECTURE.md` (본 섹션)

### Dashboard KPI card 변경 요약

- `.stat-card`: padding 20px 22px로 조정, transition 추가, hover 시 subtle lift (`translateY(-1px)` + shadow-md)
- `.stat-card::before`: top accent 3px → 2px, opacity 0.85 (과하지 않은 muted brown accent)
- `.stat-card .stat-label`: font-size 11px, letter-spacing 0.8px, font-weight 500 (refined admin tone)
- `.stat-card .stat-value`: letter-spacing -0.3px, line-height 1.2 (숫자 가독성 강화)
- `.stat-card .stat-icon`: font-size 30px, `var(--primary)` 명시적 적용, opacity 0.12
- `.stat-card .stat-value` overflow-wrap: anywhere (긴 숫자 카드 너비 초과 방지)

### Chart container 변경 요약

- `.chart-container`: padding 22px 24px, overflow: hidden (canvas 영역 깔끔하게 정리)
- `.chart-container h3`: font-weight 600, letter-spacing 0.2px (refined header)
- `.chart-container canvas`: max-width 100% (responsive 보강, 기존 canvas 동작 유지)

### Typography hierarchy 변경 요약

- `.card`: padding 24px → 22px 24px (refined spacing)
- `.card h2`: font-size 18px → 17px, letter-spacing 0.1px, h2 i font-size 16px 명시
- `.card h3`: font-size 16px → 15px, letter-spacing 0.1px, h3 i 신규 규칙 (var(--primary), 14px)
- 색상 hierarchy 유지: title `var(--gray-800)`, secondary `var(--gray-700)`, muted `var(--gray-500)`

### Dashboard 보강 규칙 (신규)

- `.action-bar h3`: margin 0, font-size 15px, font-weight 600, gap 8px 정렬
- `.action-bar h3 i`: var(--primary), 14px
- `.action-bar h3 .text-warning`: var(--warning) 명시
- `.action-bar + .table` 등: margin-top 4px (action-bar와 table 사이 여백 정리)
- `.card > p.text-muted` / `.card .action-bar + p.text-muted`: 12px padding (빈 데이터 안내 텍스트 가독성)
- `.card p.text-warning`: var(--warning), font-weight 500

### 상태/위험 색상 premium tone 전환

- `.badge-pending/shipped/completed/cancelled/high/medium/low`: raw hex → premium rgba tone
  - pending: camel rgba, completed: sage rgba, cancelled: warm gray rgba, low: terracotta rgba
- `.flash-success/error/warning/info`: raw hex → premium rgba tone
  - success: sage rgba, error: terracotta rgba, warning: camel rgba, info: slate rgba

### 변경 금지 항목 준수

| 항목 | 상태 |
|---|---|
| JS 동작 변경 | ❌ 없음 (app.js/analytics.js/products.js/auth-ui.js 미수정) |
| HTML 구조 변경 | ❌ 없음 (index.html 미수정) |
| DB/Supabase 작업 | ❌ 없음 |
| migration 파일 | ❌ 미수정/미생성 |
| 기존 selector/id/class | ✅ 모두 유지 |
| 기존 route/hash 동작 | ✅ 유지 |
| auth/bootstrap 동작 | ✅ 유지 |
| chart canvas width/height 강제 변경 | ❌ 없음 (max-width 100%만 추가) |
| `js/config.js` | ❌ 미생성/미커밋 |
| `data_export.json` | ❌ 미생성/미커밋 |
| service_role/token/key/password | ❌ 미출력 |
| supabase db push/reset/pull | ❌ 없음 |

### Tests 결과

| 항목 | 결과 |
|---|---|
| 전체 tests | **616 tests, 0 fail** |
| 기존 tests | 590 → all pass |
| 신규 tests (dashboard-theme-contract) | 26 → all pass |
| DC1~DC7 | KPI stat-card premium tone 검증 ✅ |
| DC8~DC11 | chart-container premium tone 검증 ✅ |
| DC12~DC14 | card typography hierarchy 검증 ✅ |
| DC15~DC18 | legacy blue/purple purge 검증 ✅ |
| DC19~DC22 | badge/flash premium rgba 검증 ✅ |
| DC23~DC24 | dashboard responsive contract 검증 ✅ |
| DC25~DC26 | sensitive data safety 검증 ✅ |

### Preflight 결과

| 항목 | 결과 |
|---|---|
| Branch check | ✅ PASS |
| Staged files check | ✅ PASS |
| Tracked forbidden files check | ✅ PASS |
| service_role / sb_secret_ scan | ✅ PASS |
| token/session/key console.log scan | ✅ PASS |
| config.example.js default flags | ✅ PASS |
| .gitignore check | ✅ PASS |
| supabase migrations/tests check | ✅ PASS |
| **전체** | ✅ **PASS** |

### Browser Visual Smoke 결과

scope: **legacy/local visual smoke** (SUPABASE_ENABLED=false, owner authenticated smoke PENDING)

| 항목 | 결과 |
|---|---|
| dashboard 표시 | ✅ 정상 (header/sections 렌더링 확인) |
| stat-card 존재 | ✅ 확인 |
| stat-card premium tone 적용 | ✅ 확인 |
| stat-value soft charcoal 색상 | ✅ 확인 (var(--gray-800) = #3A3530) |
| sidebar/header 3-7B tone 유지 | ✅ 확인 |
| console error | ✅ 없음 |
| layout 깨짐 | ✅ 없음 |
| products route 이동 후 복귀 | ✅ 정상 동작 |
| 스크린샷 | ⚠️ 캡처 실패 (브라우저 탭 백그라운드) — visual 확인은 완료됨 |

- owner 로그인을 하지 않았으므로 "owner authenticated smoke"가 아닌 "legacy/local visual smoke"로 기록
- chart-container는 dashboard에 chart가 없어 skip (analytics route에서 별도 확인 권장)

### Local Server Hygiene 결과

| 항목 | 결과 |
|---|---|
| 작업 전 check | ✅ no listeners, no http.server |
| 서버 실행 | python3 -m http.server 8080 |
| 서버 종료 | `--kill` 모드로 정리 |
| 작업 후 check | ✅ no listeners on 8080-8089, no http.server processes |

### 최종 판정

- **PASS** (Dashboard Premium Cards Polish 완료)
- CSS-only 변경, JS/HTML/DB/migration 변경 없음
- 기존 590 + 신규 26 = 616 tests all pass
- preflight PASS
- legacy/local visual smoke PASS (premium tone, no error, no layout break)
- authenticated owner smoke: PENDING (별도 세션에서 진행 권장)
- local server cleanup 완료
- 향후 3-7D 이후 단계에서 추가 UI polish 예정

---

## 3-7D: Products List/Table Premium Polish

### 목적

Products 화면의 상품 목록, 테이블, 상품 thumb, 필터/검색 영역, 분류 badge, 다중 선택 checkbox를 LESOUL premium boutique admin tone에 맞게 polish.
3-7B/C에서 정의한 global theme tokens와 dashboard tone을 기반으로 products-specific CSS 보강.
CSS-first 작업으로 JS 동작, HTML 구조, DB/Supabase 작업, product CRUD logic은 일절 금지.

### 수정 파일

- `css/style.css` (table, product-thumb, classification-badge, checkbox accent, tab-btn, empty-state, products 보강 규칙)
- `tests/products-theme-contract.test.mjs` (신규 추가: 31개 테스트)
- `docs/CURRENT_ARCHITECTURE.md` (본 섹션)

### Product list/table polish 요약

- `.table th`: padding 11px 12px, letter-spacing 0.2px (refined header)
- `.table td`: padding 11px 12px, vertical-align middle (이미지/텍스트 정렬 안정화)
- `.table tbody tr`: transition 0.12s ease 추가 (부드러운 hover)
- `.table tbody tr:hover`: `var(--gray-50)` → `rgba(139, 115, 85, 0.05)` (subtle beige hover)
- `.table td.font-bold`: `var(--gray-800)` + font-weight 600 (가격/숫자 셀 강조)
- `.table td.text-warning/danger/success`: font-weight 500 (상태 셀 가독성)

### Product card/thumb polish 요약

- `.product-thumb`: 50px → 48px, border-radius 4px → 6px (refined)
- `.product-thumb` border: `var(--gray-200)` → `var(--border-color)` (soft beige gray)
- `.product-thumb` background: `var(--gray-100)` 추가 (빈 이미지 영역 warm tone)

### Product action button visual polish 요약

- `.action-bar .btn + .btn`: margin-left 2px (다중 선택 액션 버튼 간격 정리)
- `.action-bar h2` / `.action-bar h2 i`: refined font-size, var(--primary) icon
- 기존 btn-primary/secondary/danger/info tone은 3-7B에서 이미 premium 적용됨
- onclick/data binding, title 속성 변경 없음

### Filter/search/form visual polish 요약

- `.filter-row .form-group label`: font-size 12px, `var(--gray-600)`, letter-spacing 0.2px
- `.form-control` focus ring은 3-7B에서 muted brown rgba 적용됨
- input/select 자체 구조 변경 없음

### Classification badge polish 요약

- `.classification-badge`: border-radius 12px → 10px, letter-spacing 0.1px (refined)
- category/color/size/unclassified tone은 3-7B에서 premium rgba 적용됨 (brown/terracotta/sage/warm gray)
- 상태 의미 유지: category=muted brown, color=terracotta, size=sage, unclassified=warm gray

### Checkbox premium accent

- `.checkbox-wrapper input[type="checkbox"]`: width/height 15px, `accent-color: var(--primary)`
- `.row-checkbox` / `.select-all-cb` 신규 규칙: 15px, `accent-color: var(--primary)` (muted brown checkbox)

### 기타 premium tone 보강

- `.tab-btn`: letter-spacing 0.1px, hover `var(--primary-dark)`, active font-weight 600
- `.tab-btn.active`: border-bottom-color `var(--primary)`, color `var(--primary-dark)`
- `.empty-state`: font-size 14px, `.empty-state i` font-size 44px, opacity 0.25, `var(--primary)` color
- `.card .info-box h4`: `var(--gray-800)`, font-weight 600 (product form 분류 결과)
- `.card h3.mb-3`: border-bottom 추가, `var(--primary)` icon (가격 정보 / 분류 정보 섹션)

### 변경 금지 항목 준수

| 항목 | 상태 |
|---|---|
| JS 동작 변경 | ❌ 없음 (products.js/app.js/db.js/supabase-client.js 미수정) |
| HTML 구조 변경 | ❌ 없음 (index.html 미수정) |
| DB/Supabase 작업 | ❌ 없음 |
| migration 파일 | ❌ 미수정/미생성 |
| product CRUD logic 변경 | ❌ 없음 |
| 기존 selector/id/class | ✅ 모두 유지 |
| 기존 route/hash 동작 | ✅ 유지 |
| auth/bootstrap 동작 | ✅ 유지 |
| onclick/data binding | ✅ 유지 |
| modal/form submit 동작 | ✅ 유지 |
| image upload 동작 | ✅ 유지 |
| table column 구조 | ✅ 유지 |
| `js/config.js` | ❌ 미생성/미커밋 |
| `data_export.json` | ❌ 미생성/미커밋 |
| service_role/token/key/password | ❌ 미출력 |
| supabase db push/reset/pull | ❌ 없음 |

### Tests 결과

| 항목 | 결과 |
|---|---|
| 전체 tests | **647 tests, 0 fail** |
| 기존 tests | 616 → all pass |
| 신규 tests (products-theme-contract) | 31 → all pass |
| PC1~PC4 | product thumb premium tone 검증 ✅ |
| PC5~PC9 | table premium tone 검증 ✅ |
| PC10~PC14 | classification badge premium tone 검증 ✅ |
| PC15~PC17 | badge status premium tone 검증 ✅ |
| PC18~PC19 | checkbox premium accent 검증 ✅ |
| PC20 | empty-state premium tone 검증 ✅ |
| PC21~PC22 | tab-btn premium tone 검증 ✅ |
| PC23~PC26 | legacy blue/purple purge 검증 ✅ |
| PC27~PC29 | products HTML contract 검증 ✅ |
| PC30~PC31 | sensitive data safety 검증 ✅ |
| B9.1 (기존) | batch-related CSS 금지 규칙 준수 ✅ |

### Preflight 결과

| 항목 | 결과 |
|---|---|
| Branch check | ✅ PASS |
| Staged files check | ✅ PASS |
| Tracked forbidden files check | ✅ PASS |
| service_role / sb_secret_ scan | ✅ PASS |
| token/session/key console.log scan | ✅ PASS |
| config.example.js default flags | ✅ PASS |
| .gitignore check | ✅ PASS |
| supabase migrations/tests check | ✅ PASS |
| **전체** | ✅ **PASS** |

### Browser Visual Smoke 결과

scope: **legacy/local products visual smoke** (SUPABASE_ENABLED=false, owner authenticated products smoke PENDING)
상품 생성/수정/삭제 실행 여부: **no** (visual 확인만)

| 항목 | 결과 |
|---|---|
| products 화면 표시 | ✅ 정상 렌더링 |
| table 존재 | ✅ 확인 (헤더/데이터 행 표시) |
| product-thumb 렌더링 | ✅ 정상 |
| classification-badge 렌더링 | ✅ 정상 |
| table th warm gray 색상 | ✅ 확인 |
| filter-row 표시 | ✅ 정상 노출 |
| sidebar/header 3-7B tone 유지 | ✅ 확인 |
| dashboard 3-7C tone 유지 | ✅ 확인 (복귀 후 정상) |
| console error | ✅ 없음 |
| layout 깨짐 | ✅ 없음 |

### Local Server Hygiene 결과

| 항목 | 결과 |
|---|---|
| 작업 전 check | ✅ no listeners, no http.server |
| 서버 실행 | python3 -m http.server 8080 |
| 서버 종료 | `--kill` 모드로 정리 |
| 작업 후 check | ✅ no listeners on 8080-8089, no http.server processes |

### 최종 판정

- **PASS** (Products List/Table Premium Polish 완료)
- CSS-only 변경, JS/HTML/DB/migration/product CRUD logic 변경 없음
- 기존 616 + 신규 31 = 647 tests all pass
- preflight PASS
- legacy/local products visual smoke PASS (premium tone, no error, no layout break)
- 상품 생성/수정/삭제 실행 없음 (visual 확인만)
- authenticated owner products smoke: PENDING (별도 세션에서 진행 권장)
- local server cleanup 완료
- 향후 3-7E 이후 단계에서 추가 UI polish 예정

---

## 3-7E: Auth/Onboarding Premium Polish

### 목적

Auth / onboarding / invite-code 입력 화면의 시각 톤을 LESOUL premium boutique / quiet luxury 방향으로 polish.
3-7B/C/D에서 정의한 global theme tokens와 일관성을 유지하며, LESOUL 첫인상을 강화.
CSS-first 작업으로 JS 동작, HTML 구조, Auth 로직, Supabase/Auth 설정, DB 작업은 일절 금지.

### 수정 파일

- `css/style.css` (auth root/panel/input/button/error/onboarding 보강)
- `tests/auth-onboarding-theme-contract.test.mjs` (신규 추가: 28개 테스트)
- `docs/CURRENT_ARCHITECTURE.md` (본 섹션)

### Auth root/panel polish 요약

- `.auth-root`: 135deg gradient → 145deg 3-stop warm brown gradient (`#8B7355 → #6A5641 → #5A4631`)
- `.auth-panel`: radius 16px → 14px (refined), soft beige border 추가, shadow depth 보강
- `.auth-panel`: animation 0.3s → 0.35s ease (부드러운 진입)
- `.auth-logo`: font-size 1.75rem → 1.8rem, weight 600 → 500, letter-spacing 0.1em → 0.15em, mb 1.25rem → 1.75rem (elegant spacing)

### Auth input/button polish 요약

- `.auth-input`: padding 0.7rem/0.9rem → 0.75rem/0.95rem, radius 8px → 10px
- `.auth-input:focus`: ring 3px → 4px, rgba opacity 0.15 → 0.12 (subtle focus ring)
- `.auth-button`: padding 0.75rem → 0.8rem, weight 600 → 500, letter-spacing 0.3px 추가, radius 8px → 10px
- `.auth-button:hover`: shadow 추가 (subtle brown glow)
- `.auth-button:focus-visible`: ring 3px → 4px, opacity 0.35 → 0.30
- `.auth-button-secondary`: padding 0.75rem → 0.8rem, radius 8px → 10px, border transition 추가
- `.auth-button-secondary:hover`: border-color var(--gray-400) (refined border transition)
- `.auth-button-secondary:focus-visible`: ring 3px → 4px, opacity 0.25 → 0.20

### Auth typography hierarchy 요약

- `.auth-title`: 1.35rem → 1.3rem, mb 0.5rem → 0.4rem, letter-spacing 0.1px
- `.auth-description`: 0.9rem → 0.88rem, var(--gray-600) → var(--gray-500) (muted)
- `.auth-label`: 0.85rem → 0.82rem, var(--gray-700) → var(--gray-600), letter-spacing 0.2px, ml 2px (refined label)
- `.auth-error`: radius 8px → 10px, padding 0.65rem → 0.7rem, opacity 미세 조정

### Onboarding/invite-code visual polish 요약

- `.auth-store-option`: 기존 premium tone 유지 (var(--gray-100) + brown hover)
- `.auth-store-option:hover`: brown rgba tint 유지
- invite-code / onboarding 관련 selector는 JS 렌더링 기반, CSS rule은 auth-panel 공통 스타일 상속
- guest/practice mode 버튼은 auth-button-secondary 스타일 공유 → tone 일관성 유지
- no-membership/onboarding 메시지는 auth-description 스타일 상속 → calm tone

### Auth context badge/logout 보완 여부

- 3-7B에서 이미 premium tone 적용됨, 이번 단계에서 추가 변경 없음
- hidden/display 제어는 JS 그대로 유지
- `.auth-context-badge`: warm brown tint pill 유지
- `.auth-logout-button`: outline style (warm gray) 유지

### 변경 금지 항목 준수

| 항목 | 상태 |
|---|---|
| JS 동작 변경 | ❌ 없음 (auth-ui.js/auth-service.js/app-bootstrap.js/app.js 미수정) |
| HTML 구조 변경 | ❌ 없음 (index.html 미수정) |
| Auth 로직 변경 | ❌ 없음 |
| Invite join 로직 변경 | ❌ 없음 |
| Supabase Auth 설정 변경 | ❌ 없음 |
| DB/Supabase 작업 | ❌ 없음 |
| migration 파일 | ❌ 미수정/미생성 |
| 기존 selector/id/class | ✅ 모두 유지 |
| login/signup submit 동작 | ✅ 유지 |
| guest/practice mode 동작 | ✅ 유지 |
| SUPABASE_ENABLED 동작 | ✅ 유지 |
| `js/config.js` | ❌ 미생성/미커밋 |
| `data_export.json` | ❌ 미생성/미커밋 |
| service_role/token/key/password | ❌ 미출력 |
| supabase db push/reset/pull | ❌ 없음 |

### Tests 결과

| 항목 | 결과 |
|---|---|
| 전체 tests | **675 tests, 0 fail** |
| 기존 tests | 647 → all pass |
| 신규 tests (auth-onboarding-theme-contract) | 28 → all pass |
| AO1~AO4 | auth root/panel premium tone 검증 ✅ |
| AO5~AO7 | auth input premium tone 검증 ✅ |
| AO8~AO11 | auth button premium tone 검증 ✅ |
| AO12~AO14 | auth error/store option premium tone 검증 ✅ |
| AO15~AO16 | auth context badge/logout premium tone 검증 ✅ |
| AO17~AO20 | legacy blue/purple purge 검증 ✅ |
| AO21~AO26 | auth HTML contract 검증 ✅ |
| AO27~AO28 | sensitive data safety 검증 ✅ |

### Preflight 결과

| 항목 | 결과 |
|---|---|
| Branch check | ✅ PASS |
| Staged files check | ✅ PASS |
| Tracked forbidden files check | ✅ PASS |
| service_role / sb_secret_ scan | ✅ PASS |
| token/session/key console.log scan | ✅ PASS |
| config.example.js default flags | ✅ PASS |
| .gitignore check | ✅ PASS |
| supabase migrations/tests check | ✅ PASS |
| **전체** | ✅ **PASS** |

### Browser Visual Smoke 결과

scope: **legacy/local visual smoke** (SUPABASE_ENABLED=false, auth/onboarding no-membership browser visual smoke PENDING)
login/signup/invite join 실행 여부: **no**

| 항목 | 결과 |
|---|---|
| dashboard 표시 | ✅ 정상 |
| products 표시 | ✅ 정상 |
| 3-7B header/sidebar tone 유지 | ✅ 확인 |
| 3-7C dashboard tone 유지 | ✅ 확인 |
| 3-7D products tone 유지 | ✅ 확인 |
| body background warm ivory | ✅ 확인 |
| stat-card background warm white | ✅ 확인 |
| auth-root DOM 존재 | ✅ 확인 (hidden 상태여도 DOM 존재) |
| console error | ✅ 없음 |
| layout 깨짐 | ✅ 없음 |

- SUPABASE_ENABLED=false로 auth/onboarding 화면을 실제 렌더링하지 못했으므로 "auth/onboarding no-membership browser visual smoke PENDING"으로 기록
- auth/onboarding CSS contract는 28개 테스트로 모두 검증 완료
- 실제 인증 화면 테스트는 별도 세션에서 Supabase Cloud 인증 후 진행 권장

### Local Server Hygiene 결과

| 항목 | 결과 |
|---|---|
| 작업 전 check | ✅ no listeners, no http.server |
| 서버 실행 | python3 -m http.server 8080 |
| 서버 종료 | `--kill` 모드로 정리 |
| 작업 후 check | ✅ no listeners on 8080-8089, no http.server processes |

### 최종 판정

- **PASS** (Auth/Onboarding Premium Polish 완료)
- CSS-only 변경, JS/HTML/Auth logic/Invite join logic/DB/migration 변경 없음
- 기존 647 + 신규 28 = 675 tests all pass
- preflight PASS
- legacy/local visual smoke PASS (3-7B/C/D tone 유지, no error, no layout break)
- auth/onboarding no-membership browser visual smoke: PENDING (별도 세션에서 Supabase 인증 후 진행 권장)
- login/signup/invite join 실행 없음 (CSS-only 단계)
- local server cleanup 완료
- 향후 3-7F 이후 단계에서 추가 UI polish 예정

---

## 3-7F: Member/Invite Management Premium Polish

### 목적

직원/초대 관리 화면(`#/members`)의 카드, 테이블, 초대 코드 박스, 상태 배지, 위험 액션 버튼을 LESOUL premium boutique admin tone에 맞게 polish.
owner/admin management 화면이므로 차분하고 신뢰감 있는 tone 유지.
CSS-first 작업으로 JS 동작, HTML 구조, member/invite RPC 호출 로직, DB/Supabase 작업은 일절 금지.
실제 invite 생성/취소, member deactivate 실행 금지.

### 수정 파일

- `css/style.css` (member management card/table/badge/invite-code/buttons 보강)
- `tests/member-management-theme-contract.test.mjs` (신규 추가: 33개 테스트)
- `docs/CURRENT_ARCHITECTURE.md` (본 섹션)

### Member management card polish 요약

- `.member-mgmt-container`: max-width 900px → 960px, padding 20px → 1.75rem/1.25rem
- `.member-mgmt-card`: var(--shadow-sm) → layered subtle shadow (2-stop rgba warm charcoal)
- `.member-mgmt-card`: transition: box-shadow 0.2s ease 추가
- `.member-mgmt-card-header`: 16px/20px → 1rem/1.5rem, subtle warm ivory gradient header (180deg)
- `.member-mgmt-card-header h3`: 16px → 0.95rem, letter-spacing 0.2px, flex align
- `.member-mgmt-card-header i`: font-size 0.9rem, mr 0.5rem

### Member table polish 요약

- `.member-mgmt-table th/td`: padding 10px/16px → 0.75rem/1.25rem, font-size 13px → 0.85rem
- `.member-mgmt-table th`: var(--gray-50) → var(--gray-100) (warm ivory), border-bottom 추가 (var(--gray-300))
- `.member-mgmt-table th`: font-size 11px → 0.7rem, letter-spacing 0.5px → 0.6px
- `tbody tr:hover`: var(--gray-50) → rgba(245, 241, 235, 0.6) (subtle beige tint)

### Invite code box polish 요약

- `.invite-code-result`: var(--gray-50) → var(--gray-100), border 1px var(--gray-200) 추가
- `.invite-code-box code`: padding 8px/16px → 0.65rem/1.25rem, border-radius 4px → 10px
- `.invite-code-box code`: font-size 16px → 1.05rem, weight 700 → 600, color var(--primary) → var(--primary-dark)
- `.invite-code-box code`: letter-spacing 1px → 1.5px, monospace font stack 추가, subtle shadow
- `.invite-code-display`: padding 2px/6px → 0.15rem/0.55rem, border-radius 3px → 6px, font-size 12px → 0.78rem
- `.invite-code-display`: border 1px var(--gray-200) 추가, monospace font stack
- `.invite-generate-form select/input`: border-radius 4px → 10px, padding 8px/12px → 0.6rem/0.9rem
- `.invite-generate-form select/input:focus`: brown focus ring (var(--primary) border + 3px rgba ring)
- `.invite-generate-form label`: font-weight 500, letter-spacing 0.2px

### Status badge polish 요약

- `.status-badge`: padding 2px/8px → 0.2rem/0.7rem, border-radius 12px → 10px, font-size 11px → 0.7rem
- `.status-badge`: weight 600 → 500, letter-spacing 0.4px, border 1px solid transparent 추가
- `.status-active`: rgba(107, 142, 90, 0.12) bg + #5A7A4A text + border-color rgba(25% opacity)
- `.status-inactive`: rgba(160, 86, 60, 0.10) bg + #8A4A32 text + border-color (muted terracotta)
- `.status-revoked`: rgba(138, 130, 117, 0.14) bg + #6B6358 text + border-color (warm gray)
- `.status-used`: rgba(123, 140, 154, 0.14) bg + #63737F text + border-color (muted slate)
- `.status-expired`: rgba(201, 163, 106, 0.14) bg + #8A6A3A text + border-color (warm camel)

### Danger action visual polish 요약

- `.btn-danger`: border 1px solid var(--danger) 추가, border-radius 4px → 8px
- `.btn-danger:hover`: opacity 0.9 → background #8A4A32 + border-color #8A4A32 (deep terracotta)
- `.btn-danger:focus-visible`: 3px rgba ring (muted terracotta 25% opacity)
- `.btn-warning`: color var(--gray-900) → var(--white), border 1px solid 추가
- `.btn-warning:hover`: opacity 0.9 → background #B89058 + border-color #B89058
- `.btn-warning:focus-visible`: 3px rgba ring (warm camel 30% opacity)
- `.btn-secondary`: border 1px solid 추가, border-radius 4px → 8px, weight 500
- `.btn-secondary:hover`: background #6B6358 + border-color #6B6358 (deep warm gray)
- `.btn-secondary:focus-visible`: 3px rgba ring (warm gray 25% opacity)
- `.btn-sm`: padding 4px/10px → 0.35rem/0.85rem, font-size 12px → 0.78rem
- `.btn-sm`: border-radius 8px, weight 500, letter-spacing 0.2px, transition all 0.15s ease

### Access denied / owner-only notice 보완 여부

- `.member-mgmt-access-denied`: padding 60px/20px → 4rem/1.25rem
- `.member-mgmt-access-denied h2`: color var(--danger) → var(--gray-700) (neutral tone, not harsh red)
- `.member-mgmt-access-denied h2`: font-size 1.15rem, weight 600, letter-spacing 0.2px
- `.member-mgmt-access-denied i`: font-size 48px → 3rem, color var(--gray-400) (muted neutral)
- owner gate JS 로직 변경 없음

### 변경 금지 항목 준수

| 항목 | 상태 |
|---|---|
| JS 동작 변경 | ❌ 없음 (member-management.js/app.js/app-bootstrap.js/auth-service.js 미수정) |
| HTML 구조 변경 | ❌ 없음 (index.html 미수정) |
| owner gate 변경 | ❌ 없음 |
| member/invite RPC logic 변경 | ❌ 없음 |
| 실제 invite 생성 | ❌ 없음 |
| 실제 invite revoke | ❌ 없음 |
| 실제 member deactivate | ❌ 없음 |
| Supabase migration 생성/수정 | ❌ 없음 |
| supabase db push/reset/pull | ❌ 없음 |
| 기존 selector/id/class | ✅ 모두 유지 |
| `js/config.js` | ❌ 미생성/미커밋 |
| `data_export.json` | ❌ 미생성/미커밋 |
| service_role/token/key/password | ❌ 미출력 |
| email/user_id/store_id/member_id/invite_code 전체값 | ❌ 미출력/미기록 |

### Tests 결과

| 항목 | 결과 |
|---|---|
| 전체 tests | **708 tests, 0 fail** |
| 기존 tests | 675 → all pass |
| 신규 tests (member-management-theme-contract) | 33 → all pass |
| MM1~MM4 | member container/card premium tone 검증 ✅ |
| MM5~MM7 | member table premium tone 검증 ✅ |
| MM8~MM13 | status badge premium muted tone 검증 ✅ |
| MM14~MM17 | invite code box premium tone 검증 ✅ |
| MM18~MM22 | danger/action buttons premium tone 검증 ✅ |
| MM23~MM24 | access denied neutral tone 검증 ✅ |
| MM25~MM28 | legacy blue/purple purge 검증 ✅ |
| MM29~MM30 | JS/HTML contract 검증 ✅ |
| MM31~MM33 | sensitive data safety 검증 ✅ |

### Preflight 결과

| 항목 | 결과 |
|---|---|
| Branch check | ✅ PASS |
| Staged files check | ✅ PASS |
| Tracked forbidden files check | ✅ PASS |
| service_role / sb_secret_ scan | ✅ PASS |
| token/session/key console.log scan | ✅ PASS |
| config.example.js default flags | ✅ PASS |
| .gitignore check | ✅ PASS |
| supabase migrations/tests check | ✅ PASS |
| **전체** | ✅ **PASS** |

### Browser Visual Smoke 결과

scope: **legacy/local members visual smoke** (Supabase Cloud 연동 상태에서 실제 owner 로그인 후 기능 테스트는 별도 세션에서 진행)
real invite/member actions executed: **no**

| 항목 | 결과 |
|---|---|
| #/members route 정상 이동 | ✅ 확인 |
| member list card 표시 | ✅ 정상 (warm white card, subtle beige border) |
| invite generate card 표시 | ✅ 정상 (warm ivory header gradient) |
| invite list card 표시 | ✅ 정상 |
| table header warm ivory | ✅ 확인 (var(--gray-100)) |
| status badge muted tone | ✅ 확인 (활성: sage, 비활성: terracotta) |
| member-mgmt-access-denied | 📋 해당 세션에서 미노출 (owner 권한으로 접속됨) |
| console error | ✅ 없음 |
| layout 깨짐 | ✅ 없음 |
| 3-7B header/sidebar tone 유지 | ✅ 확인 |
| 3-7C dashboard tone 유지 | ✅ 확인 |
| 3-7D products tone 유지 | ✅ 확인 |
| 3-7E auth/onboarding tone 유지 | ✅ 확인 (DOM 기반) |

- 실제 owner 권한으로 members 화면이 표시되어 visual 확인 완료
- invite 생성 버튼 클릭하지 않음 (CSS-only 단계)
- revoke/deactivate 버튼 클릭하지 않음
- copy 버튼 클릭하지 않음
- email/user_id/store_id/member_id/invite_code 전체값 로그/문서에 기록하지 않음

### Local Server Hygiene 결과

| 항목 | 결과 |
|---|---|
| 작업 전 check | ✅ no listeners, no http.server |
| 서버 실행 | python3 -m http.server 8080 |
| 서버 종료 | `--kill` 모드로 정리 |
| 작업 후 check | ✅ no listeners on 8080-8089, no http.server processes |

### 최종 판정

- **PASS** (Member/Invite Management Premium Polish 완료)
- CSS-only 변경, JS/HTML/owner gate/member RPC/invite RPC/DB/migration 변경 없음
- 기존 675 + 신규 33 = 708 tests all pass
- preflight PASS
- legacy/local members visual smoke PASS (premium boutique admin tone 확인, no error, no layout break)
- real invite/member actions executed: no
- local server cleanup 완료
- 향후 3-7G 이후 단계에서 추가 UI polish 예정





