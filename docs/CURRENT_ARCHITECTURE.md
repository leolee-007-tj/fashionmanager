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

