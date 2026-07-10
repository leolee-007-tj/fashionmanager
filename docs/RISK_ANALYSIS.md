# 위험 분석서 (Risk Analysis)

> 본 문서는 Supabase 마이그레이션 시 발생 가능한 위험을 분석한다.
> 개인정보(고객명, 전화번호, 주소, 이메일)는 포함하지 않는다. 위험 여부와 파일 경로만 기록한다.

## 1. 가장 높은 위험 TOP 10

| 순위 | 위험 | 범주 | 발생 가능성 | 영향도 | 관련 파일 |
|---|---|---|---|---|---|
| 1 | `data_export.json`에 운영 데이터 + 고객명 노출 (공개 GitHub 저장소) — **부분 해결** | 보안 | 중간 (과거 SHA 캐시 잔존) | 높음 | `data_export.json` |
| 2 | 주문 원가 스냅샷 미저장 → 상품 원가 변경 시 과거 수익 왜곡 | 데이터 손실 | 높음 | 높음 | `js/orders.js` (submitAdd, submitShip), `js/excel.js` (importOrders) |
| 3 | 동기식 → 비동기 전환 시 화면 먼저 렌더링 후 데이터 누락 | 마이그레이션 | 높음 | 중간 | `js/app.js` (renderPage), 모든 모듈 |
| 4 | Excel 대량 업로드 부분 성공 시 롤백 불가 | Excel | 높음 | 높음 | `js/excel.js` (importProducts, importOrders) |
| 5 | 고객 병합 중 일부 데이터만 변경 (주문은 이동, customer_name 미갱신) | 데이터 손실 | 중간 | 중간 | `js/customers.js` (cleanupDuplicates) |
| 6 | 키워드 ID 타입 혼용 (정수 vs 소수점) → getNextId 오작동 | 데이터 무결성 | 중간 | 중간 | `js/excel.js` (importKeywords), `js/db.js` (getNextId) |
| 7 | `_convertExpenses` amount=0 유효값 필터링 → 데이터 손실 | 데이터 손실 | 중간 | 중간 | `js/db.js` (_convertExpenses) |
| 8 | 다중 사용자 동시 수정 충돌 (재고, 주문) | 동시성 | 높음 (전환 후) | 높음 | `js/orders.js` (submitShip), `js/products.js` |
| 9 | RLS 설계 오류 → 다른 store 데이터 접근 가능 | 보안 | 중간 | 높음 | (Supabase 설정, 미구현) |
| 10 | localStorage와 Supabase 중복 저장 → 데이터 불일치 | 마이그레이션 | 중간 | 중간 | `js/db.js`, 마이그레이션 스크립트 |

---

## 2. 데이터 손실 위험

### 2.1 주문 원가 스냅샷 미저장
- **발생 가능성**: 높음 (현재 코드에서 이미 발생)
- **영향도**: 높음 (과거 수익 분석 왜곡)
- **관련 파일**: `js/orders.js` (submitAdd L585-643, submitShip L706-736), `js/excel.js` (importOrders L368-390)
- **상세**:
  - GitHub Pages 앱의 자체 생성 경로는 `actual_converted_cost_at_sale`, `china_cost_at_sale`을 저장하지 않음
  - 출고 시 `actual_profit`은 계산되어 저장되지만, 원가 자체는 스냅샷으로 저장되지 않음
  - 이후 상품 원가가 변경되면(설정 변경, 재계산), `_getOrderCost()`가 현재 상품 원가를 참조하여 수익 재계산 시 저장된 `actual_profit`과 불일치 발생
  - data_export.json(Flask 데이터)에는 스냅샷이 포함되어 있어 혼재 상태
- **예방 방법**: 
  - 출고 시점에 `actual_converted_cost_at_sale`을 order에 저장하도록 코드 수정 (하지만 이번 단계에서는 금지)
  - Supabase 마이그레이션 시 주문 테이블에 `actual_converted_cost_at_sale` 컬럼 추가, 출고 트리거에서 자동 저장
- **테스트 방법**: 
  - 상품 원가 변경 후 수익 분석 페이지에서 월별 수익이 변경되는지 확인
  - 스냅샷 있는 주문(Flask 데이터)과 없는 주문(GitHub Pages 생성)의 수익 계산 결과 비교

### 2.2 `_convertExpenses` amount=0 필터링
- **발생 가능성**: 중간 (데이터 임포트 시)
- **영향도**: 중간 (경비 데이터 손실)
- **관련 파일**: `js/db.js` (L285-313)
- **상세**:
  - `_convertExpenses` 마지막에 `.filter(e => typeof e.amount === 'number' && e.amount > 0)`
  - amount가 0인 유효한 경비 항목이 필터링됨
  - 프로젝트 메모리에 "actual_converted_cost_at_sale=0 must be treated as valid value" 제약이 있으나, 경비 amount=0에 대해서는 반대로 동작
- **예방 방법**: `amount > 0` → `amount >= 0`로 변경 (하지만 이번 단계 금지). Supabase에서는 CHECK 제약조건으로 amount >= 0 명시
- **테스트 방법**: amount=0인 경비 데이터를 포함한 JSON 임포트 후 데이터 보존 확인

### 2.3 키워드 ID 타입 혼용
- **발생 가능성**: 중간 (엑셀 임포트 시)
- **영향도**: 중간 (getNextId 오작동)
- **관련 파일**: `js/excel.js` (importKeywords L465), `js/db.js` (getNextId L28-32)
- **상세**:
  - `importKeywords`: `id: Date.now() + Math.random()` (예: 1750000000000.123456)
  - `getNextId`: `Math.max(...items.map(i => i.id)) + 1` → 소수점 ID가 있으면 다음 ID가 소수점+1이 됨
  - 이후 `addKeyword`에서 생성되는 ID가 정수가 아닐 수 있음
  - `deleteKeyword`는 `String()` 비교로 안전하지만, 다른 로직에서 문제 가능
- **예방 방법**: 
  - importKeywords에서 `id: DB.getNextId('keywords')` 사용 (하지만 이번 단계 금지)
  - Supabase에서는 auto-increment bigint ID 사용, 마이그레이션 시 기존 ID 매핑
- **테스트 방법**: 엑셀로 키워드 임포트 후 `getNextId` 결과 확인

### 2.4 고객 병합 시 customer_name 미갱신
- **발생 가능성**: 중간
- **영향도**: 중간 (이름 매칭 불일치)
- **관련 파일**: `js/customers.js` (cleanupDuplicates L562-593)
- **상세**:
  - 중복 고객 병합 시 주문의 `customer_id`는 이동하지만 `customer_name`은 갱신하지 않음
  - 현재는 case-insensitive 이름 매칭으로 동작하지만, 병합 후 이름이 다른 경우(예: 'Crystal' → 'crystal') `customer_name`이 원본 유지
  - `recalculateAll`에서 `o.customer_name.toLowerCase() === c.name.toLowerCase()`로 매칭하므로 동작하지만, 데이터 불일치 존재
- **예방 방법**: 병합 시 `customer_name`도保留 고객 이름으로 갱신. Supabase에서는 customer_name 필드 제거하고 customer_id만 사용
- **테스트 방법**: 대소문자가 다른 동일 고객 병합 후 주문의 customer_name 확인

### 2.5 참조 무결성 부재
- **발생 가능성**: 높음
- **영향도**: 중간
- **관련 파일**: `js/db.js` (deleteProduct, deleteCustomer, deleteOrder)
- **상세**:
  - product 삭제 시 연결된 order, inventory_log 처리 없음 (orphan)
  - customer 삭제 시 연결된 order 처리 없음 (orphan)
  - order 삭제 시 연결된 inventory_log 처리 없음 (orphan)
  - excel importOrders에서 상품 매칭 실패 시 `product_id: 0` 저장 (존재하지 않는 ID)
- **예방 방법**: Supabase에서 외래키 제약조건 설정, ON DELETE CASCADE 또는 RESTRICT. 마이그레이션 전 orphan 데이터 정리
- **테스트 방법**: 상품/고객/주문 삭제 후 연관 데이터 확인

## 3. 보안 위험

### 3.1 ★ data_export.json 운영 데이터 노출 (심각) — 부분 해결
- **상태**: ⚠️ 부분 해결 (2026-07-10) — 현재 브랜치 및 Git 기록 재작성 완료, GitHub cached SHA 제거 대기
- **발생 가능성**: 중간 (과거 SHA 직접 접근 시 잔존)
- **영향도**: 높음
- **관련 파일**: `data_export.json`
- **상세**:
  - 132명 고객의 name 포함 (전화/위챗/이메일/주소는 없음 - 확인 완료)
  - 682건 주문의 selling_price, actual_profit 포함 (수익 정보 노출)
  - 3,032건 상품의 원가, 판매가 포함
  - Git 추적됨 (commit 9cf0a0d), GitHub 원격 저장소에 push됨
  - `.gitignore`의 `data_export_*.json` 패턴과 불일치 (실제 파일은 `data_export.json`으로 언더스코어 없음)
  - 과거 SHA로 직접 접근 시 GitHub API가 200 OK 응답 (cached views / dangling objects)
- **수행한 조치**:
  - `.gitignore`에 `data_export.json` 포함 정확한 패턴 추가
  - `git filter-repo`로 전체 Git 기록에서 파일 제거 (모든 브랜치 + 태그, 55개 커밋 재작성)
  - force push 완료 (main, gh-pages, feature/supabase-cloud-migration, tags)
  - 현재 브랜치/태그 트리에서는 파일 완전 제거 확인
- **남은 작업**:
  - GitHub Support에 cached views / dangling object purge 요청 필요
  - Support 처리 후 과거 SHA 404 여부 재검증 필요
- **예방 방법**:
  - `data_export.json`을 .gitignore에 추가 (`data_export*.json` 패턴으로 수정) ✅ 완료
  - Git 히스토리에서 파일 제거 (`git filter-repo` 또는 BFG) ✅ 완료
  - GitHub Support에 캐시 및 dangling object 제거 요청 ⏳ 예정
  - GitHub 저장소가 public이면 민감 정보 포함하지 않도록 주의
  - Supabase 마이그레이션 시 RLS로 데이터 보호
- **테스트 방법**: GitHub 저장소에서 data_export.json 접근 확인, .gitignore 적용 후 추적 중단 확인, 과거 SHA 404 여부 확인
- **관련 문서**: `docs/SECURITY_DATA_EXPOSURE_REMEDIATION.md`, `docs/GITHUB_SUPPORT_DATA_PURGE_REQUEST.md`

### 3.2 XSS 가능성 (HTML 문자열 직접 삽입)
- **발생 가능성**: 중간
- **영향도**: 중간
- **관련 파일**: 거의 모든 렌더링 함수 (`js/app.js`, `js/products.js`, `js/orders.js`, `js/customers.js`, `js/expenses.js`, `js/excel.js`)
- **상세**:
  - 모든 `render*()` 함수가 템플릿 리터럴로 HTML 문자열 생성 후 `innerHTML`로 주입
  - 사용자 입력(상품명, 고객명, 메모, 설명 등)이 이스케이프 없이 HTML에 삽입
  - 예: `${product.original_title}`, `${customer.name}`, `${expense.description}`
  - 악의적 입력(예: `<img src=x onerror=alert(1)>`) 시 XSS 가능
  - 단, 현재는 단일 사용자 localStorage 환경으로 실제 위험 낮음. Supabase 전환 후 다중 사용자 환경에서 위험 증가
- **예방 방법**:
  - 모든 사용자 입력을 HTML 이스케이프 (`escapeHtml()` 유틸리티 추가)
  - 또는 DOM API 사용 (`textContent`, `createElement`)
  - Supabase에서는 입력값 서버 검증 추가
- **테스트 방법**: 상품명/고객명에 `<script>alert(1)</script>` 입력 후 렌더링 확인

### 3.3 민감 수익 정보 노출
- **발생 가능성**: 높음 (현재 구조)
- **영향도**: 중간
- **관련 파일**: `js/analytics.js`, `js/orders.js`, `js/customers.js`
- **상세**:
  - 수익, 원가, 이익 정보가 모든 사용자에게 노출
  - GitHub Pages는 public이므로 누구나 접근 가능 (데이터는 localStorage에만 있지만)
  - 설정의 exchange_divisor, price_multiplier로 비즈니스 공식 노출
- **예방 방법**: Supabase 전환 후 RLS로 수익 정보 접근 제한. 인증된 사용자만 접근
- **테스트 방법**: 미인증 상태에서 수익 분석 페이지 접근 차단 확인

### 3.4 삭제 확인 부족
- **발생 가능성**: 중간
- **영향도**: 중간
- **관련 파일**: `js/db.js` (clearAllData), 일부 batch 작업
- **상세**:
  - `DB.clearAllData()`는 confirm 없이 모든 데이터 삭제 (다만 현재 UI에서 호출 안 함)
  - `Products.batchDelete`, `Orders.batchDelete` 등은 confirm 있음
  - 단일 삭제는 confirm 있음
- **예방 방법**: Supabase에서는 soft delete 권장. 삭제 전 백업 자동화
- **테스트 방법**: 각 삭제 경로에서 confirm 동작 확인

### 3.5 입력값 검증 부족
- **발생 가능성**: 중간
- **영향도**: 중간
- **관련 파일**: 모든 submitForm 함수
- **상세**:
  - 상품명, 고객명에 빈 문자열만 trim 체크
  - 숫자 필드(korea_cost, selling_price, amount)에 음수 입력 가능 (일부 min 속성 있지만 JS 검증 미흡)
  - 날짜 필드에 임의 문자열 입력 가능
  - 이메일, 전화번호 형식 검증 없음
- **예방 방법**: 입력값 검증 함수 추가, Supabase CHECK 제약조건
- **테스트 방법**: 음수, 빈 문자열, 특수문자 입력 시 동작 확인

### 3.6 외부 CDN/환율 API 의존성
- **발생 가능성**: 낮음
- **영향도**: 낮음
- **관련 파일**: `index.html` (CDN), `js/analytics.js` (환율 API)
- **상세**:
  - Font Awesome, Chart.js, XLSX를 CDN에서 로드. CDN 장애 시 기능 일부 미작동
  - 환율 API 장애 시 기본값 195 사용 (실제 환율과 오차)
  - CDN이 중간자 공격 대상이 될 수 있음 (SRI 없음)
- **예방 방법**: SRI(Subresource Integrity) 추가, 환율 캐싱 강화, fallback CDN
- **테스트 방법**: CDN 차단 환경에서 동작 확인

### 3.7 공개 GitHub Pages 사용 위험
- **발생 가능성**: 중간
- **영향도**: 중간
- **관련 파일**: 전체 앱
- **상세**:
  - 저장소가 public이면 코드, 비즈니스 로직, 가격 계산 공식이 공개
  - Supabase URL, anon key가 코드에 포함되면 누구나 접근 가능 (RLS 없으면)
  - 환율 API 호출이 클라이언트에서 발생 (API 키 노출 시 남용 가능)
- **예방 방법**: 
  - 저장소 private 전환 또는 민감 정보 제외
  - Supabase RLS 필수 설정
  - 환율 API를 Supabase Edge Function으로 프록시 (API 키 숨김)
- **테스트 방법**: 미인증 상태에서 Supabase 데이터 접근 차단 확인

### 3.8 설정/백업 파일 노출 - 부분 해결
- **상태**: ⚠️ 부분 해결 (2026-07-10) — .gitignore 수정 및 기록 재작성 완료, GitHub 캐시 제거 대기
- **발생 가능성**: ~~낮음~~ 중간 (과거 SHA 캐시 잔존)
- **영향도**: ~~중간~~ 높음
- **관련 파일**: `data_export.json`, `.gitignore`
- **상세**:
  - `.gitignore`에 `*.backup`, `*.backup.json`, `backups/`, `data_export_*.json` 패턴 있음
  - 단, `data_export.json` (언더스코어 없음)은 패턴 불일치로 추적됨 → **해결: `data_export.json`을 .gitignore에 정확히 추가** ✅
  - Supabase 설정 파일(`js/config.js`)은 .gitignore에 포함됨
- **수행한 조치**: `.gitignore`에 `data_export.json`, `data_export*.json`, `data-export*.json`, `exports/`, `private-data/`, `*.sqlite`, `*.db` 추가 ✅
- **남은 작업**: GitHub Support 캐시 purge 요청 (3.1 참조)
- **예방 방법**: .gitignore 패턴 수정, 히스토리 정리
- **테스트 방법**: `git ls-files`로 추적 파일 확인

## 4. 동시성 위험

### 4.1 다중 기기 동시 수정 충돌
- **발생 가능성**: 높음 (Supabase 전환 후)
- **영향도**: 높음
- **관련 파일**: `js/orders.js` (submitShip), `js/products.js` (batchReclassify), `js/customers.js` (recalculateAll)
- **상세**:
  - 현재 localStorage는 단일 기기 단독 사용
  - Supabase 전환 후 다중 기기/사용자가 동시에 같은 상품/주문 수정 가능
  - `current_stock`, `reserved_stock` 동시 업데이트 시 Lost Update 발생
  - `recalculateAll`이 전체 고객 집계값 덮어쓰기 시 다른 사용자의 변경사항 사라짐
- **예방 방법**:
  - Supabase Realtime으로 변경사항 브로드캐스트
  - 낙관적 동시성 제어 (updated_at 타임스탬프 비교)
  - 재고 업데이트는 원자적 연산으로 (SQL 함수, 트리거)
  - 집계값은 뷰 또는 트리거로 실시간 계산 (저장값 사용 안 함)
- **테스트 방법**: 두 기기에서 동시 출고 처리 후 재고 일치 확인

### 4.2 재고 동시 차감
- **발생 가능성**: 높음 (Supabase 전환 후)
- **영향도**: 높음
- **관련 파일**: `js/orders.js` (submitAdd L619, submitShip L712-714)
- **상세**:
  - 현재: `DB.updateProduct(productId, { reserved_stock: (product.reserved_stock || 0) + quantity })`
  - 읽고-수정-쓰기 패턴으로 동시성 문제 발생
  - 두 사용자가 동시에 같은 상품 주문 시 reserved_stock이 한 번만 증가할 수 있음
- **예방 방법**: 
  - SQL 원자적 업데이트: `UPDATE products SET reserved_stock = reserved_stock + ? WHERE id = ?`
  - Supabase RPC 함수로 구현
- **테스트 방법**: 동시 주문 10개 실행 후 reserved_stock 정확성 확인

### 4.3 generateProductCode 동시성
- **발생 가능성**: 중간
- **영향도**: 중간
- **관련 파일**: `js/db.js` (generateProductCode L207-218)
- **상세**:
  - 클라이언트에서 MAX+1 계산. 두 사용자가 동시에 같은 브랜드 상품 등록 시 중복 코드 발생
- **예방 방법**: 
  - DB 시퀀스 또는 auto-increment 사용
  - 또는 DB 함수로 원자적 코드 생성
  - unique 제약조건으로 중복 방지 (동시성 실패 시 재시도)
- **테스트 방법**: 동시 상품 등록 10개 실행 후 product_code 유일성 확인

## 5. 마이그레이션 위험

### 5.1 동기식 → 비동기 전환 시 화면 먼저 렌더링
- **발생 가능성**: 높음
- **영향도**: 중간
- **관련 파일**: `js/app.js` (renderPage), 모든 모듈
- **상세**:
  - 현재 `renderPage()`가 동기식으로 HTML 반환 → `innerHTML` 즉시 주입
  - 비동기 전환 시 `await` 전에 빈 화면 또는 이전 데이터 표시
  - 사용자가 깜빡임/지연 인지
- **예방 방법**:
  - 스켈레톤 UI 또는 로딩 스피너 표시
  - 데이터 캐싱으로 즉시 렌더링 후 백그라운드 갱신 (stale-while-revalidate)
  - 페이지 전환 시 페이드 효과
- **테스트 방법**: 네트워크 지연 환경에서 페이지 전환 동작 확인

### 5.2 UUID와 기존 숫자 ID 혼용
- **발생 가능성**: 중간
- **영향도**: 중간
- **관련 파일**: `js/db.js` (getNextId), 모든 ID 참조
- **상세**:
  - 기존: 숫자 ID (1, 2, 3, ...)
  - Supabase: UUID 권장
  - 마이그레이션 시 기존 숫자 ID를 UUID로 매핑 필요
  - 외래키(product_id, customer_id, order_id)도 매핑 필요
  - `String(id)` 비교 코드는 안전하지만, `===` 비교 코드는 위험
- **예방 방법**:
  - 마이그레이션 스크립트로 ID 매핑 테이블 생성
  - 또는 Supabase에서 bigint ID 유지 (UUID 강제 아님)
  - ID 타입 통일 (숫자 또는 문자열)
- **테스트 방법**: 마이그레이션 후 외래키 관계 무결성 확인

### 5.3 주문과 재고 일부만 저장
- **발생 가능성**: 중간
- **영향도**: 높음
- **관련 파일**: `js/orders.js` (submitShip)
- **상세**:
  - 출고 시 product 업데이트, order 업데이트, inventory_log 추가 3개 연산
  - 네트워크 실패 시 일부만 저장될 수 있음 (product는 감소했으나 order 미저장)
  - 현재 localStorage는 원자적이지만 Supabase는 각 호출이 별도
- **예방 방법**:
  - Supabase RPC 함수로 트랜잭션 처리
  - 또는 클라이언트에서 순차적 await + 실패 시 보상 트랜잭션
  -Supabase 함수로 원자적 출고 처리 구현
- **테스트 방법**: 네트워크 중단 시뮬레이션 후 데이터 일관성 확인

### 5.4 고객 병합 중 일부 데이터만 변경
- **발생 가능성**: 중간
- **영향도**: 중간
- **관련 파일**: `js/customers.js` (cleanupDuplicates)
- **상세**:
  - 주문 customer_id 업데이트 + 고객 삭제 2개 연산
  - 네트워크 실패 시 주문만 이동하고 고객이 남거나, 반대의 경우
  - 또한 customer_name 필드 미갱신 문제 (2.4 참조)
- **예방 방법**: 트랜잭션 처리, 보상 로직
- **테스트 방법**: 병합 중 네트워크 실패 시뮬레이션

### 5.5 판매 당시 원가 유실
- **발생 가능성**: 높음 (마이그레이션 시)
- **영향도**: 높음
- **관련 파일**: `js/orders.js`, `js/db.js`
- **상세**: 2.1 참조. GitHub Pages 생성 주문은 스냅샷 없음. 마이그레이션 시 해당 주문들의 원가를 상품 현재 원가로 채우거나 0으로 둬야 함
- **예방 방법**: 
  - 마이그레이션 전 출고 시점 원가 저장하도록 코드 수정 (이번 단계 금지)
  - 또는 마이그레이션 스크립트에서 `actual_converted_cost_at_sale`이 NULL이면 `product.actual_converted_cost`로 채움
- **테스트 방법**: 마이그레이션 후 수익 분석 결과 비교

### 5.6 localStorage와 Supabase 중복 저장
- **발생 가능성**: 중간
- **영향도**: 중간
- **관련 파일**: `js/db.js`, 마이그레이션 스크립트
- **상세**:
  - 마이그레이션 기간 중 localStorage와 Supabase 양쪽에 데이터가 존재 가능
  - 어느 쪽이 진짜인지 불분명
  - 사용자가 마이그레이션 전 localStorage에 데이터 추가하면 동기화 누락
- **예방 방법**:
  - 마이그레이션 1회 실행 후 localStorage 읽기 전용으로 전환
  - 또는 즉시 Supabase만 사용, localStorage는 백업용
  - 명확한 컷오버 시점 설정
- **테스트 방법**: 마이그레이션 후 localStorage/Supabase 데이터 비교

### 5.7 마이그레이션 재실행 시 중복 생성
- **발생 가능성**: 중간
- **영향도**: 높음
- **관련 파일**: 마이그레이션 스크립트 (미작성)
- **상세**:
  - 마이그레이션 스크립트 재실행 시 같은 데이터가 중복 삽입될 수 있음
  - 특히 ID가 자동 생성되는 Supabase에서 기존 숫자 ID와 충돌
- **예방 방법**:
  - 마이그레이션 스크립트에 idempotency 체크 (기존 ID 존재 여부 확인)
  - `ON CONFLICT DO NOTHING` 또는 `DO UPDATE`
  - 마이그레이션 완료 플래그 설정
- **테스트 방법**: 마이그레이션 스크립트 2회 실행 후 데이터 중복 확인

### 5.8 날짜/시간대 차이
- **발생 가능성**: 중간
- **영향도**: 중간
- **관련 파일**: `js/orders.js` (_parseOrderDate, _extractYearMonth), `js/analytics.js` (_extractYearMonth)
- **상세**:
  - 현재: `new Date().toISOString()` (UTC), `order_date`는 'YYYY-MM-DD' 문자열
  - Supabase: `timestamptz` 컬럼. 클라이언트 시간대에 따라 표시 다름
  - 월별 집계 시 시간대 차이로 월 경계 넘어갈 수 있음
  - 프로젝트 메모리: "Date parsing for sales data must use regex to extract year/month directly from 'yyyy-mm-dd' string to avoid timezone issues"
- **예방 방법**:
  - 날짜는 `date` 타입(시간 없음) 사용
  - 또는 `timestamptz` + 앱에서 UTC 고정
  - 월별 집계는 서버에서 실행 (RPC 함수)
- **테스트 방법**: 다른 시간대 기기에서 월별 집계 결과 비교

## 6. Excel 위험

### 6.1 대량 업로드 부분 성공
- **발생 가능성**: 높음
- **영향도**: 높음
- **관련 파일**: `js/excel.js` (importProducts, importOrders, importCustomers, importKeywords)
- **상세**:
  - 현재: 모든 행을 순회하며 배열에 push, 마지막에 `DB.setProducts(products)` 1회 호출
  - Supabase 전환 후: 각 행을 개별 insert. 네트워크 실패 시 일부만 저장
  - 3,032개 상품 업로드 시 중간 실패 가능
  - 자동분류, 가격 계산 중 오류 시 일부 행만 스킵
- **예방 방법**:
  - Supabase 배치 insert 사용 (`insert([array])`)
  - 트랜잭션으로 전체 성공 또는 전체 실패
  - 진행률 표시 + 실패 행 재시도 옵션
  - 또는 Supabase Edge Function으로 서버에서 처리
- **테스트 방법**: 대량 엑셀 업로드 중 네트워크 차단 시뮬레이션

### 6.2 같은 월 덮어쓰기 로직
- **발생 가능성**: 중간
- **영향도**: 중간
- **관련 파일**: `js/excel.js` (importOrders L311-328)
- **상세**:
  - 업로드된 (고객+브랜드+상품명) 키와 같은 월의 기존 주문을 삭제 후 새로 추가
  - 삭제와 추가가 별도 연산. 네트워크 실패 시 데이터 손실 가능
  - 고객/상품 매칭이 엄격하지 않음 (이름만으로 매칭)
- **예방 방법**: 트랜잭션 처리, 백업 후 덮어쓰기
- **테스트 방법**: 덮어쓰기 중 실패 시 기존 데이터 보존 확인

### 6.3 날짜 변환 오류
- **발생 가능성**: 중간
- **영향도**: 중간
- **관련 파일**: `js/excel.js` (_parseExcelDate L120-141)
- **상세**:
  - 엑셀 일련번호, Date 객체, YYYY-MM-DD, YYYY.MM.DD 지원
  - 지원하지 않는 형식 시 `new Date()`(현재 시간)로 폴백
  - 시간대 차이로 날짜 1일 어긋날 수 있음
- **예방 방법**: 날짜 형식 엄격 검증, 오류 행 스킵 옵션
- **테스트 방법**: 다양한 날짜 형식 엑셀 업로드

### 6.4 오류 행 처리
- **발생 가능성**: 중간
- **영향도**: 낮음
- **관련 파일**: `js/excel.js`
- **상세**:
  - 필수 필드 누락 시 `skipped++` 후 다음 행 진행
  - 사용자에게 스킵 수만 표시, 어느 행인지 상세 안 함
  - 오류 행의 원인 미제공
- **예방 방법**: 오류 행 상세 로그, 미리보기 단계에서 검증
- **테스트 방법**: 일부 행에 오류 데이터 포함 업로드

## 7. 계산 오류 위험

### 7.1 반올림 누적 오차
- **발생 가능성**: 중간
- **영향도**: 낮음
- **관련 파일**: `js/price-calculator.js`, `js/analytics.js`
- **상세**:
  - `actual_converted_cost = Math.round(korea_cost / exchange_divisor)` - 1차 반올림
  - `china_base_price = Math.round(actual_converted_cost * multiplier + addition)` - 2차 반올림
  - 월별 집계 시 반올림된 값들의 합산 → 누적 오차
  - `actual_profit`도 Math.round
- **예방 방법**: 계산은 소수점 유지, 표시만 반올림. 또는 decimal 타입 사용
- **테스트 방법**: 대량 주문의 월별 수익 합계와 개별 주문 수익 합계 비교

### 7.2 수량 곱셈 위치
- **발생 가능성**: 낮음
- **영향도**: 중간
- **관련 파일**: `js/analytics.js` (calculateMonthlyStats L101-103)
- **상세**:
  - `totalRevenue = orders.reduce((s, o) => s + (o.selling_price || 0) * (o.quantity || 0), 0)`
  - `totalCost = orders.reduce((s, o) => s + this._getOrderCost(o, products) * (o.quantity || 0), 0)`
  - 수량을 곱한 후 합산. 정상 로직
  - 단, 엑셀 임포트 시 quantity 항상 1이므로 실제로는 수량 곱셈 효과 없음
- **예방 방법**: 현재 로직 유지. 다중 수량 주문 지원 시 검증 필요
- **테스트 방법**: quantity=5인 주문 수익 계산 확인

### 7.3 취소 주문 제외 여부
- **발생 가능성**: 낮음
- **영향도**: 낮음
- **관련 파일**: `js/analytics.js` (_getShippedOrders L84-86)
- **상세**:
  - `_getShippedOrders`: `filter(o => o.status === 'SHIPPED' || o.status === 'COMPLETED')`
  - PENDING, CANCELLED 제외. 정상 로직
  - 단, PENDING 주문의 reserved_stock은 재고에 영향. 수익에는 미포함
- **예방 방법**: 현재 로직 유지
- **테스트 방법**: 각 상태 주문의 수익 집계 확인

### 7.4 SHIPPED vs COMPLETED 처리 차이
- **발생 가능성**: 낮음
- **영향도**: 낮음
- **관련 파일**: `js/analytics.js`, `js/customers.js`
- **상세**:
  - 수익 집계: SHIPPED + COMPLETED 모두 포함 (동일)
  - 재고: SHIPPED에서 current_stock 감소, COMPLETED는 변동 없음
  - 둘 다 수익에 포함되므로 이중 집계 위험 없음
- **예방 방법**: 현재 로직 유지
- **테스트 방법**: SHIPPED → COMPLETED 전환 후 수익 변동 없음 확인

### 7.5 날짜 기준 (order_date vs ship_date vs created_at)
- **발생 가능성**: 중간
- **영향도**: 중간
- **관련 파일**: `js/analytics.js` (_getOrderDate L66-68)
- **상세**:
  - `_getOrderDate`: `order.ship_date || order.order_date || order.created_at`
  - ship_date 우선. 없으면 order_date, 그것도 없으면 created_at
  - 엑셀 임포트 시 status='COMPLETED', ship_date=null이면 order_date 사용
  - UI 출고 시 ship_date=오늘, order_date=주문일. 수익은 출고일 기준으로 월에 집계
  - 프로젝트 메모리: "Sales data must use '판매일' to determine month (not '입고년도')" - order_date 사용 원칙
  - **잠재 불일치**: order_date가 6월이고 ship_date가 7월이면 7월로 집계됨
- **예방 방법**: 날짜 기준 명확화 (order_date vs ship_date). 설정 옵션 추가
- **테스트 방법**: order_date와 ship_date가 다른 주문의 월별 집계 확인

### 7.6 과거 주문 원가 보존
- **발생 가능성**: 높음 (이미 발생)
- **영향도**: 높음
- **관련 파일**: `js/orders.js`, `js/analytics.js` (_getOrderCost)
- **상세**: 2.1 참조. 스냅샷 없는 주문은 상품 현재 원가 참조
- **예방 방법**: 2.1 참조
- **테스트 방법**: 2.1 참조

## 8. 우선순위 요약

### 즉시 조치 필요 (마이그레이션 전)
1. ~~**data_export.json Git 히스토리 제거** + .gitignore 수정 (보안 3.1)~~ ✅ 기록 재작성 완료 (GitHub 캐시 제거 대기)
2. **GitHub Support에 cached data purge 요청** (보안 3.1) — 과거 SHA 직접 접근 차단
3. **주문 원가 스냅샷 저장 로직 설계** (데이터 2.1) - 구현은 2단계 이후
4. **참조 무결성 정리 스크립트 작성** (데이터 2.5) - orphan 데이터 정리

### 마이그레이션 중 필수
4. **트랜잭션 설계** (출고, 병합, 임포트) (동시성 4.1, 마이그레이션 5.3)
5. **RLS 정책 설계** (보안 3.3, 3.7, 마이그레이션 5.9)
6. **ID 매핑 전략 수립** (마이그레이션 5.2)
7. **동시성 제어 구현** (재고, product_code) (동시성 4.2, 4.3)
8. **로딩 UI 구현** (마이그레이션 5.1)

### 마이그레이션 후 검증
9. **데이터 일관성 검증** (마이그레이션 5.6, 5.7)
10. **날짜/시간대 검증** (마이그레이션 5.8, 계산 7.5)
11. **XSS 방어 구현** (보안 3.2)
12. **입력값 검증 강화** (보안 3.5)

## 9. 확인 필요 항목

- `DB.findDuplicateOrder`, `DB.findProductByBrandTitleCost`의 실제 사용 여부 - "확인 필요"
- `DB.clearAllData`의 UI 호출 경로 - "확인 필요, 현재 UI에서 호출 안 함"
- 환율 API의 정확한 동작 (KRW per 1 CNY인지 역수인지) - "확인 필요"
- Chart.js 버전 고정 여부 - "확인 필요"
- Supabase 무료 티어 한도 (행 수, 동시 연결) - "확인 필요, 설계 결정 사항"
