# 비동기 전환 지도 (Async Migration Map)

> 본 문서는 Supabase 마이그레이션 시 async/await 전환이 필요한 함수를 분석한다.
> 각 함수에 변경 등급(A/B/C/D)을 부여하고, 권장 전환 순서와 UI 영향을 기록한다.
> 추정 내용은 "추정"으로 명시한다.

## 1. 변경 등급 정의

| 등급 | 의미 | 설명 |
|---|---|---|
| **A** | 수정 불필요 | 데이터 접근 없음. 순수 렌더링/유틸리티 함수 |
| **B** | 데이터 접근부만 변경 | 함수 시그니처 유지, 내부 DB 호출을 Supabase 호출로 교체. 동기식 유지 가능 (예: 캐시된 데이터 사용) |
| **C** | async 전환 필요 | 함수 자체가 async가 되어야 함. 호출자도 await 필요 |
| **D** | 구조 재설계 필요 | 로직 자체를 변경해야 함 (트랜잭션, 부분 실패 처리, 캐시 동기화 등) |

## 2. 비동기 전환 대상 함수 전체 목록

### 2.1 App (app.js)

| 함수 | 등급 | 현재 호출자 | 변경 예상 호출자 | 비고 |
|---|---|---|---|---|
| `App.init` | C | (페이지 로드) | (페이지 로드) | DB.init()이 async가 되면 await 필요. 사용자 인증 추가 시 |
| `App.handleRoute` | B | hashchange 이벤트 | 동일 | renderPage 호출, 라우팅 자체는 변경 없음 |
| `App.renderPage` | C | handleRoute, render | 동일 | 페이지 렌더링이 async가 되면 로딩 상태 표시 필요 |
| `App.render` | C | 여러 모듈 | 동일 | renderPage 호출. async 전환 시 모든 호출자에 await 필요 |
| `App.renderDashboard` | C | renderPage | 동일 | DB.getProducts/Orders/Customers 호출 |
| `App.renderClassification` | C | renderPage | 동일 | DB.getKeywords 호출, 인라인 편집 |
| `App.updateHeader` | B | init | 동일 | DB.getSettings 호출 |
| `App.setupCheckboxHandlers` | A | init | 동일 | 이벤트 위임만, 데이터 없음 |
| `App.setupRouter` | A | init | 동일 | 이벤트 리스너만 |
| `App.setupSidebar` | A | init | 동일 | 이벤트 리스너만 |
| `App.setupLangButtons` | A | init | 동일 | 이벤트 리스너만 |
| `App.flash` | A | 여러 모듈 | 동일 | DOM 조작만 |
| `App.bindPageForms` | A | renderPage | 동일 | 이벤트 바인딩만 |
| `App.toggleKeywordSelect` | B | 체크박스 | 동일 | 상태만 변경, DB 없음 |
| `App.toggleKeywordSelectAll` | B | 체크박스 | 동일 | 상태만 변경 |
| `App.cleanupKeywordDuplicates` | C | 버튼 클릭 | 동일 | DB.getKeywords + setKeywords |

### 2.2 DB (db.js) ★ 모든 메서드가 C 등급

| 함수 | 등급 | 현재 호출자 | 변경 예상 호출자 | 비고 |
|---|---|---|---|---|
| `DB.init` | C | App.init | App.init (await) | keywords/settings 확인. Supabase에서는 인증/스키마 확인 필요 |
| `DB.get` | C | 모든 getter | 모든 getter | `localStorage.getItem` → `supabase.from(table).select()` |
| `DB.set` | C | 모든 setter | 모든 setter | `localStorage.setItem` → `supabase.from(table).upsert()` |
| `DB.getNextId` | C | add* 메서드 | add* 메서드 | Supabase는 auto-increment UUID 사용. **D 등급 가능**: ID 생성 로직 자체 제거 |
| `DB.getProducts` | C | 여러 모듈 | 여러 모듈 | 비동기 select |
| `DB.setProducts` | C | 여러 모듈 | 여러 모듈 | 비동기 upsert. **D 등급**: 전체 배열 저장 대신 개별 row 처리 필요 |
| `DB.addProduct` | C | products.js | products.js | insert |
| `DB.updateProduct` | C | products.js, orders.js | 동일 | update |
| `DB.deleteProduct` | C | products.js | products.js | delete. **D 등급**: 연관 데이터 처리 필요 |
| `DB.getOrders` / `setOrders` | C | 여러 모듈 | 동일 | |
| `DB.addOrder` / `updateOrder` / `deleteOrder` | C | orders.js | 동일 | deleteOrder는 **D 등급**: inventory_logs 처리 필요 |
| `DB.getCustomers` / `setCustomers` | C | 여러 모듈 | 동일 | setCustomers는 **D 등급**: recalculateAll이 전체 배열 저장 |
| `DB.addCustomer` / `updateCustomer` / `deleteCustomer` | C | customers.js, excel.js | 동일 | |
| `DB.getInventoryLogs` / `setInventoryLogs` | C | analytics.js | 동일 | |
| `DB.addInventoryLog` | C | orders.js | orders.js | insert. **D 등급**: product 재고 동시 업데이트와 트랜잭션 필요 |
| `DB.getExpenses` / `setExpenses` | C | expenses.js, analytics.js | 동일 | |
| `DB.addExpense` / `updateExpense` / `deleteExpense` | C | expenses.js | 동일 | |
| `DB.getKeywords` / `setKeywords` | C | classification.js, app.js | 동일 | |
| `DB.addKeyword` / `updateKeyword` / `deleteKeyword` | C | app.js | 동일 | deleteKeyword는 문자열 비교 (안전) |
| `DB.getSettings` / `setSettings` | C | 여러 모듓 | 동일 | 단일 행 테이블로 저장 |
| `DB.generateProductCode` | C | products.js, excel.js | 동일 | **D 등급**: 동시성 문제. DB에서 MAX+1 계산 필요 |
| `DB.findProductByBrandTitleCost` | C | (현재 미사용, 추정) | 동일 | select 쿼리 |
| `DB.findCustomerByName` | C | orders.js, excel.js | 동일 | select 쿼리 (case-insensitive) |
| `DB.findDuplicateOrder` | C | (현재 미사용, 추정) | 동일 | select 쿼리 |
| `DB.recalculateAllPrices` | C | settings.js | settings.js | **D 등급**: 모든 상품 순회 업데이트. 트랜잭션 또는 배치 처리 필요 |
| `DB.exportAllData` | C | settings.js | settings.js | 모든 테이블 select. **D 등급**: 대량 데이터 다운로드 최적화 |
| `DB.importAllData` | C | settings.js | settings.js | **D 등급**: 트랜잭션 필수, 부분 실패 처리 |
| `DB._convertExpenses` | A | importAllData | (제거 예정) | 순수 변환 로직. Supabase에서는 스키마 마이그레이션으로 처리 |
| `DB.clearAllData` | D | (현재 미사용) | (사용 안 함) | RLS로 대체. **위험**: 모든 데이터 삭제 |
| `DB.initDefaultKeywords` | C | DB.init | (마이그레이션 스크립트) | 초기 데이터 시드. 앱 코드에서 제거 |

### 2.3 Products (products.js)

| 함수 | 등급 | 현재 호출자 | 변경 예상 호출자 | 비고 |
|---|---|---|---|---|
| `Products.load` | C | renderList | renderList (await) | DB.getProducts + autoClassifyAll |
| `Products.autoClassifyAll` | D | load | load | **D 등급**: 모든 상품 순회하며 DB 업데이트. 배치 처리 또는 지연 실행 필요 |
| `Products.applyFilters` | B | load, 검색 | 동일 | state.products(메모리)만 사용. DB 없음 |
| `Products.renderList` | C | renderPage | renderPage (await) | load 호출 |
| `Products.renderAdd` / `renderEdit` | B | renderPage | 동일 | DB.getProducts로 폼 데이터 |
| `Products.renderForm` | B | renderAdd, renderEdit | 동일 | DB 호출 일부 |
| `Products.submitForm` | C | 폼 제출 | 폼 제출 (await) | DB.addProduct/updateProduct. 가격 계산 |
| `Products.delete` | C | 버튼 클릭 | 동일 (await) | DB.deleteProduct. **D 등급**: 연관 주문/inventory_logs 처리 |
| `Products.batchDelete` | D | 버튼 클릭 | 동일 (await) | **D 등급**: 다중 삭제, 부분 실패 처리, 트랜잭션 |
| `Products.batchReclassify` | D | 버튼 클릭 | 동일 (await) | **D 등급**: 다중 업데이트, 트랜잭션 |
| `Products.batchMonthChange` | D | 버튼 클릭 | 동일 (await) | **D 등급**: 다중 업데이트 |
| `Products.toggleSelect` / `toggleSelectAll` | A | 체크박스 | 동일 | 상태만 |
| `Products.sort` | A | 헤더 클릭 | 동일 | 상태만 |
| `Products.setYear` / `setMonth` | A | 필터 | 동일 | 상태만 |
| `Products.handleSearch` | A | 검색 입력 | 동일 | 디바운스 + applyFilters |

### 2.4 Orders (orders.js)

| 함수 | 등급 | 현재 호출자 | 변경 예상 호출자 | 비고 |
|---|---|---|---|---|
| `Orders.load` | C | renderList | renderList (await) | DB.getOrders |
| `Orders.applyFilters` | B | load, 검색 | 동일 | 메모리만 |
| `Orders.renderList` | C | renderPage | renderPage (await) | load 호출 |
| `Orders.renderAdd` | C | renderPage | renderPage (await) | DB.getProducts/Customers |
| `Orders.renderShip` | C | renderPage | renderPage (await) | DB.getOrders/Products/Customers |
| `Orders.submitAdd` | D | 폼 제출 | 폼 제출 (await) | **D 등급**: 고객 생성 + 상품 재고 업데이트 + 주문 생성. 트랜잭션 필요 |
| `Orders.submitShip` | D | 폼 제출 | 폼 제출 (await) | **D 등급**: 상품 재고 업데이트 + 주문 업데이트 + inventory_log 추가. 트랜잭션 필수 |
| `Orders.cancel` | D | 버튼 클릭 | 동일 (await) | **D 등급**: 상품 재고 복구 + 주문 상태 업데이트. 트랜잭션 |
| `Orders.complete` | D | 버튼 클릭 | 동일 (await) | **D 등급**: 주문 업데이트 + Customers.recalculateAll. 트랜잭션 |
| `Orders.submitEdit` | C | 폼 제출 | 동일 (await) | DB.updateOrder |
| `Orders.delete` | D | 버튼 클릭 | 동일 (await) | **D 등급**: inventory_logs 처리, product 재고 복구 필요 |
| `Orders.batchDelete` | D | 버튼 클릭 | 동일 (await) | **D 등급**: 다중 삭제 + 트랜잭션 |
| `Orders.toggleSelect` / `toggleSelectAll` | A | 체크박스 | 동일 | |
| `Orders.sort` / `setYear` / `setMonth` | A | UI | 동일 | |

### 2.5 Customers (customers.js)

| 함수 | 등급 | 현재 호출자 | 변경 예상 호출자 | 비고 |
|---|---|---|---|---|
| `Customers.load` | C | renderList | renderList (await) | DB.getCustomers + recalculateAll |
| `Customers.recalculateAll` | D | load, complete, ship | 동일 (await) | **D 등급**: 모든 고객의 집계값 재계산 후 전체 저장. 배치 업데이트 또는 트리거로 대체 |
| `Customers.applyFilters` | B | load, 검색 | 동일 | 메모리만 |
| `Customers.renderList` | C | renderPage | renderPage (await) | load 호출 |
| `Customers.renderDetail` | C | renderPage | renderPage (await) | DB.getOrders/Products/Customers |
| `Customers.renderAdd` / `renderEdit` | B | renderPage | 동일 | |
| `Customers.renderForm` | B | renderAdd/Edit | 동일 | |
| `Customers.submitForm` | C | 폼 제출 | 동일 (await) | DB.addCustomer/updateCustomer |
| `Customers.submitInlineEdit` | C | 폼 제출 | 동일 (await) | DB.updateCustomer |
| `Customers.delete` | D | 버튼 클릭 | 동일 (await) | **D 등급**: 연관 주문 처리 |
| `Customers.batchDelete` | D | 버튼 클릭 | 동일 (await) | **D 등급**: 다중 삭제 + 주문 처리 |
| `Customers.cleanupDuplicates` | D | 버튼 클릭 | 동일 (await) | **D 등급**: 주문 customer_id 이동 + 고객 삭제. 트랜잭션 필수 |
| `Customers.getMonthTopCustomers` | C | renderList | 동일 (await) | DB.getOrders/Customers |
| `Customers.getQuarterTopCustomers` | C | renderList | 동일 (await) | DB.getOrders/Customers |
| `Customers.getLevel` | A | renderList | 동일 | 순수 계산 |
| `Customers.toggleSelect` / `toggleSelectAll` | A | 체크박스 | 동일 | |
| `Customers.sort` / `setYear` / `setMonth` | A | UI | 동일 | |
| `Customers.handleSearch` | A | 검색 | 동일 | 디바운스 |

### 2.6 Analytics (analytics.js) ★ 이미 부분 비동기

| 함수 | 등급 | 현재 호출자 | 변경 예상 호출자 | 비고 |
|---|---|---|---|---|
| `Analytics._fetchLiveExchangeRate` | C | _ensureRate | _ensureRate (await) | 이미 async. fetch 유지 |
| `Analytics._ensureRate` | C | renderAsync | renderAsync (await) | 이미 async |
| `Analytics.renderAsync` | C | (현재 미사용) | renderPage (await) | **라우터에서 호출하도록 변경 필요** |
| `Analytics.render` | C | renderPage | renderPage (await) | DB.getOrders/Products/Expenses/Customers. **동기식이지만 데이터가 async가 되면 await 필요** |
| `Analytics.calculateMonthlyStats` | C | render | render (await) | DB.getOrders/Products/Expenses |
| `Analytics.calculateAnnualStats` | A | render | 동일 | 순수 계산 (monthlyStats만 사용) |
| `Analytics.getBrandRanking` | C | render | render (await) | DB.getOrders/Products |
| `Analytics.getProductRanking` | C | render | render (await) | DB.getOrders/Products |
| `Analytics.getCustomerRanking` | C | render | render (await) | DB.getOrders/Customers |
| `Analytics._getOrderCost` | A | calculateMonthlyStats 등 | 동일 | 메모리 데이터만 |
| `Analytics._getShippedOrders` | C | calculateMonthlyStats 등 | 동일 (await) | DB.getOrders |
| `Analytics._extractYearMonth` | A | 여러 함수 | 동일 | 순수 계산 |
| `Analytics._getOrderDate` | A | 여러 함수 | 동일 | 순수 계산 |
| `Analytics.renderCharts` | A | render | 동일 | Chart.js만 |
| `Analytics.yearOptions` / `setYear` | A | render, UI | 동일 | |

### 2.7 Expenses (expenses.js)

| 함수 | 등급 | 현재 호출자 | 변경 예상 호출자 | 비고 |
|---|---|---|---|---|
| `Expenses.load` | C | renderList | renderList (await) | DB.getExpenses |
| `Expenses.applyFilters` | B | load | 동일 | 메모리만 |
| `Expenses.renderList` | C | renderPage | renderPage (await) | load 호출 |
| `Expenses.renderAdd` / `renderEdit` | B | renderPage | 동일 | |
| `Expenses.renderForm` | B | renderAdd/Edit | 동일 | |
| `Expenses.submitForm` | C | 폼 제출 | 동일 (await) | DB.addExpense/updateExpense |
| `Expenses.delete` | C | 버튼 클릭 | 동일 (await) | DB.deleteExpense |
| `Expenses.batchDelete` | D | 버튼 클릭 | 동일 (await) | **D 등급**: 다중 삭제 |
| `Expenses.toggleSelect` / `toggleSelectAll` | A | 체크박스 | 동일 | |
| `Expenses.sort` / `setYear` / `setMonth` | A | UI | 동일 | |

### 2.8 Excel (excel.js)

| 함수 | 등급 | 현재 호출자 | 변경 예상 호출자 | 비고 |
|---|---|---|---|---|
| `ExcelManager.render` | A | renderPage | 동일 | 정적 HTML |
| `ExcelManager._downloadSheet` | A | 템플릿 다운로드 | 동일 | XLSX만 |
| `ExcelManager.downloadProductTemplate` 등 | A | 버튼 | 동일 | 정적 데이터 |
| `ExcelManager._parseExcelDate` | A | importData | 동일 | 순수 계산 |
| `ExcelManager._formatDate` | A | importOrders | 동일 | 순수 계산 |
| `ExcelManager.importData` | C | 버튼 | 동일 (await) | FileReader → importProducts/Orders/Customers/Keywords |
| `ExcelManager.importProducts` | D | importData | importData (await) | **D 등급**: 대량 insert, 부분 실패, 자동분류, 가격 계산. 트랜잭션/배치 처리 |
| `ExcelManager.importOrders` | D | importData | importData (await) | **D 등급**: 대량 insert + 고객 자동 생성 + 상품 매칭 + 같은 월 덮어쓰기. 복잡한 트랜잭션 |
| `ExcelManager.importCustomers` | D | importData | importData (await) | **D 등급**: 대량 insert, 중복 확인 없음 |
| `ExcelManager.importKeywords` | D | importData | importData (await) | **D 등급**: 대량 insert, ID 생성 방식 변경 필요 |

### 2.9 Settings (settings.js)

| 함수 | 등급 | 현재 호출자 | 변경 예상 호출자 | 비고 |
|---|---|---|---|---|
| `Settings.render` | B | renderPage | 동일 | DB.getSettings/Keywords |
| `Settings.renderCalcPreview` | A | render | 동일 | 순수 계산 |
| `Settings.bindCalcPreview` | A | render | 동일 | 이벤트만 |
| `Settings.save` | C | 폼 제출 | 동일 (await) | DB.setSettings + location.reload |
| `Settings.recalculateAll` | D | 버튼 클릭 | 동일 (await) | **D 등급**: 모든 상품 가격 재계산. 배치 업데이트 |
| `Settings.exportData` | C | 버튼 클릭 | 동일 (await) | DB.exportAllData → Blob 다운로드 |
| `Settings.importData` | D | 파일 선택 | 동일 (await) | **D 등급**: DB.importAllData + location.reload. 트랜잭션 |

### 2.10 Classification (classification.js)

| 함수 | 등급 | 현재 호출자 | 변경 예상 호출자 | 비고 |
|---|---|---|---|---|
| `ClassificationService.classifyProduct` | C | products.js | 동일 (await) | DB 저장값 확인. **B 등급 가능**: product 객체 받아서 처리 |
| `ClassificationService.classify` | C | 여러 모듈 | 동일 (await) | DB.getKeywords 호출 |
| `ClassificationService.detectLanguage` | A | 여러 모듈 | 동일 | 순수 계산 |
| `ClassificationService.matchKeyword` | A | classify | 동일 | 메모리만 |
| `ClassificationService.emptyResult` | A | classify 등 | 동일 | |
| `ClassificationService.getTestTitles` | A | renderClassification | 동일 | |
| `ClassificationService.initDefaultKeywords` | D | (마이그레이션) | (제거) | **D 등급**: 초기 데이터 시드. 마이그레이션 스크립트로 이동 |

### 2.11 PriceCalculator (price-calculator.js)

| 함수 | 등급 | 현재 호출자 | 변경 예상 호출자 | 비고 |
|---|---|---|---|---|
| `PriceCalculator.calculate` | B | products.js, excel.js, settings.js | 동일 | settings를 인자로 받음. settings가 async 조회면 호출자가 await |
| `PriceCalculator.calculateProfit` | A | orders.js, analytics.js | 동일 | 순수 계산 |

### 2.12 i18n (i18n.js)

| 함수 | 등급 | 현재 호출자 | 변경 예상 호출자 | 비고 |
|---|---|---|---|---|
| `setLanguage` | B | 언어 버튼 | 동일 | localStorage → Supabase user_settings 테이블 (옵션) |
| `t` | A | 여러 모듈 | 동일 | 메모리만 |
| `updateAllTranslations` | A | 여러 모듈 | 동일 | DOM만 |

## 3. 등급별 통계

| 등급 | 함수 수 | 비고 |
|---|---|---|
| A (수정 불필요) | 약 35개 | 순수 렌더링/유틸리티/계산 |
| B (데이터 접근부만) | 약 18개 | 시그니처 유지, 내부만 교체 |
| C (async 전환 필요) | 약 55개 | await 추가, 호출자 변경 |
| D (구조 재설계 필요) | 약 18개 | 트랜잭션/배치/부분 실패 처리 |

**총 함수 수**: 약 126개 (추정, 정확한 카운트는 "확인 필요")

## 4. 권장 전환 순서

### Phase 1: 기반 계층 (db.js)
1. `DB.get` / `DB.set` → Supabase 호출로 교체 (async)
2. 모든 getter/setter를 async화
3. `DB.getNextId` 제거 (Supabase auto-increment 사용)
4. `DB.init` → 인증/스키마 확인

### Phase 2: 데이터 계층 (CRUD)
5. `DB.addProduct` / `updateProduct` / `deleteProduct`
6. `DB.addOrder` / `updateOrder` / `deleteOrder`
7. `DB.addCustomer` / `updateCustomer` / `deleteCustomer`
8. `DB.addExpense` / `updateExpense` / `deleteExpense`
9. `DB.addInventoryLog`
10. `DB.addKeyword` / `updateKeyword` / `deleteKeyword`
11. `DB.getSettings` / `setSettings`

### Phase 3: 복잡한 트랜잭션 (D 등급)
12. `Orders.submitShip` (재고 + 주문 + 로그)
13. `Orders.submitAdd` (고객 + 재고 + 주문)
14. `Orders.cancel` (재고 복구 + 주문)
15. `Customers.cleanupDuplicates` (주문 이동 + 고객 삭제)
16. `Customers.recalculateAll` (배치 업데이트)
17. `Products.autoClassifyAll` (배치 업데이트)
18. `Settings.recalculateAll` (배치 업데이트)

### Phase 4: 대량 처리 (D 등급)
19. `ExcelManager.importProducts`
20. `ExcelManager.importOrders`
21. `ExcelManager.importCustomers`
22. `ExcelManager.importKeywords`
23. `DB.importAllData` / `Settings.importData`
24. `DB.exportAllData` / `Settings.exportData`

### Phase 5: 렌더링 계층 (C 등급)
25. `App.init` / `renderPage` / `render`
26. 각 모듈의 `load` / `renderList` / `renderDetail`
27. 각 `submitForm` / `delete` / `batchDelete`

### Phase 6: 최적화
28. 로딩 상태 UI 추가 (스켈레톤/스피너)
29. 에러 처리 UI 추가
30. 캐시 전략 구현 (옵션)
31. `Analytics.renderAsync`를 라우터에 연결

## 5. 기존 UI 영향

### 5.1 동기식 렌더링 → 비동기 렌더링
- **현재**: `renderPage()`가 동기적으로 HTML 반환 → `main.innerHTML = content`
- **전환 후**: `renderPage()`가 async → 로딩 중 빈 화면 또는 스피너 표시 필요
- **영향**: 모든 페이지 전환 시 깜빡임 발생 가능. 스켈레톤 UI 권장

### 5.2 폼 제출 → 비동기 저장
- **현재**: `submitForm()` 동기 저장 → `location.hash` 변경 → 즉시 렌더링
- **전환 후**: `submitForm()` async → 저장 중 버튼 비활성화, 성공 후 이동
- **영향**: 사용자가 중복 클릭 가능. 디바운스/비활성화 처리 필요

### 5.3 일괄 작업 (batch*)
- **현재**: 동기적으로 모든 처리 완료 후 `App.render()`
- **전환 후**: 비동기 처리 중 진행 표시. 부분 실패 시 부분 성공 여부 표시
- **영향**: 대량 엑셀 임포트 시 수 초~수십 초 소요. 진행률 표시 권장

### 5.4 검색/필터
- **현재**: `applyFilters()` 메모리 기반 동기 처리
- **전환 후**: 메모리 캐시 유지 시 동기식 가능. DB 쿼리 시 디바운스 필수
- **영향**: 캐시 동기화 전략 필요 (데이터 변경 시 캐시 무효화)

### 5.5 페이지 새로고침 의존
- **현재**: `Settings.save()`, `Settings.importData()`가 `location.reload()` 사용
- **전환 후**: 전체 새로고침 없이 상태 갱신. 단, Supabase 클라이언트 재초기화 필요 시 유지
- **영향**: 새로고침 제거 시 상태 동기화 주의

### 5.6 loaded 플래그 패턴
- **현재**: Products.load(), Customers.load()에서 `loaded` 플래그로 최초 1회만 DB 로드
- **전환 후**: Supabase 실시간 구독 시 데이터 변경 시 자동 갱신. loaded 플래그 제거 가능
- **영향**: 다중 사용자 환경에서 실시간 동기화 가능. 단, 충돌 처리 필요

## 6. 확인 필요 항목

- 정확한 함수 카운트 (일부 프라이빗 메서드 누락 가능) - "확인 필요"
- `DB.findProductByBrandTitleCost`, `DB.findDuplicateOrder`의 실제 사용 여부 (grep에서 호출 확인 못함) - "확인 필요, 현재 미사용으로 보임"
- `Analytics.renderAsync`의 호출 경로 (라우터가 render()만 호출) - "확인 필요, 현재 데드 코드로 보임"
- Supabase Realtime 구독 사용 여부 (성능 vs 복잡도 트레이드오프) - "확인 필요, 설계 결정 사항"
