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

### `js/db.js` (371줄) ★ 핵심 데이터 계층
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

### `js/products.js` (634줄)
- `Products` 객체, `state`에 `loaded` 플래그 (검색 최적화)
- `load()`: 최초 1회만 실행. `autoClassifyAll()` + `applyFilters()`
- `autoClassifyAll()`: 저장된 분류값이 없는 상품만 실시간 분류하여 DB 저장
- `applyFilters()`: stock_year/stock_month 필터 + 11개 필드 검색 + 정렬
- `batchReclassify()`: 선택된 상품 일괄 재분류 (기존값 덮어쓰기)
- `batchMonthChange()`: 선택 상품 년/월 일괄 변경
- `batchDelete()`: 선택 상품 일괄 삭제
- `submitForm(editId)`: 상품 등록/수정. `PriceCalculator.calculate()` 호출, `detectLanguage()` 저장
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
