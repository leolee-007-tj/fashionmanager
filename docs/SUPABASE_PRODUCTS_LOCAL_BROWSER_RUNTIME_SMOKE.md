# 3-5O: Products Local Browser Runtime Smoke

## 목적

3-5N에서 Node integration으로 검증한 Products runtime activation을 실제 브라우저 상품 화면에서 local-only flag-on 상태로 수동 검증한다.

## local-only 조건

- `js/config.js`는 `.gitignore` 대상 ignored local-only 파일
- `SUPABASE_ENABLED: true`, `PRODUCTS_SUPABASE_ENABLED: true`로 설정
- Supabase URL은 `http://127.0.0.1:54321` (localhost/127 계엸만 사용)
- anon key만 사용, service_role은 browser/runtime에 전달하지 않음

## 브라우저 시나리오 및 결과

### flag-on 상태

| 단계 | 시나리오 | 결과 | 비고 |
|---|---|---|---|
| 1 | 로그인 | PASS | local dummy 계정으로 정상 로그인 |
| 2 | store 선택 | PASS | 기존 "Browser Smoke Store" 자동 선택 |
| 3 | Products 페이지 진입 | PASS | `/products` 정상 로드 |
| 4 | `DB.getProductsDataSource().name` | **SupabaseProductsDataSource** | 콘솔 확인 |
| 5 | 상품 추가 | **BLOCKED** | `create_product` RPC가 schema cache에 없음 (PGRST202) |
| 6 | 상품 목록 | N/A | 추가 실패로 인해 확인 불가 |
| 7 | 상품 수정 | N/A | 추가 실패로 인해 확인 불가 |
| 8 | 상품 삭제 | N/A | 추가 실패로 인해 확인 불가 |
| 9 | 새로고침 후 데이터 유지 | N/A | 추가 실패로 인해 확인 불가 |
| 10 | 주문/고객/분석 페이지 접근 | PASS | `/orders`, `/customers`, `/analytics` 정상 로드 |
| 11 | 로그아웃 | PASS | `LESOULAppBootstrap.signOut()` 정상 동작 |

### flag-off 상태 (js/config.js 제거)

| 단계 | 시나리오 | 결과 | 비고 |
|---|---|---|---|
| 1 | `DB.getProductsDataSource().name` | **LocalProductsDataSource** | 콘솔 확인 |
| 2 | `LESOUL_CONFIG.PRODUCTS_SUPABASE_ENABLED` | **false** | 기본값 유지 |
| 3 | Products 페이지 | PASS | 기존 localStorage 경로로 정상 로드 |
| 4 | 일반 runtime 자동 전환 | **없음** | Supabase로 자동 전환되지 않음 |

## 발견된 문제

### 1. `create_product` RPC missing from schema cache (PGRST202)

- **증상**: `DB.addProductAsync()` → `SupabaseProductsDataSource.createProduct()` 호출 시 `PGRST202` / 404 에러
- **메시지**: "Could not find the function public.create_product(...) in the schema cache"
- **영향**: 상품 추가/수정/삭제 write path 전체 차단
- **원인 분석**:
  - `supabase/migrations/20260711001100_products_write_rpcs.sql`에 `create_product`가 정의되어 있음
  - `supabase migration list`에서 모든 migration이 Applied 상태로 표시됨
  - 그러나 실제 DB schema cache에는 `create_product`가 존재하지 않음
  - `supabase db reset` 후에도 동일 증상 지속
  - `supabase start` 시 여러 컨테이너가 unhealthy로 실패
  - **결론**: local Supabase 인프라(Docker container 상태) 문제로 판단됨. 코드 변경이 아닌 인프라 복구 필요.
- **3-5N 대비**: 3-5N opt-in integration test에서는 `create_product` RPC가 정상 동작했었음. 이는 코드 자체가 아니라 인프라 상태 차이임을 증명.

### 2. `legacy_id` 생성 누락 (코드 수정 완료)

- **증상**: `create_product` RPC 호출 시 `p_legacy_id`가 `null`로 전달되어, 신규 상품의 `legacy_id`가 DB에 저장되지 않음
- **영향**: `mapSupabaseRowToLegacyProduct`가 `id: null`을 반환하여 edit/delete URL이 `#/products/null/edit`가 됨
- **수정**: `js/db.js` `SupabaseProductsDataSource.createProduct`에서 `p_legacy_id: row.legacy_id || Date.now()`로 변경하여 임시 legacy_id 생성
- **주의**: 이 수정은 `products.js` 변경 없이 `js/db.js`만 최소 수정으로 해결

## 제약 준수

- UI 리뉴얼: ❌ 없음
- products.js 변경: ❌ 없음
- app.js 변경: ❌ 없음
- css/style.css 변경: ❌ 없음
- index.html 변경: ❌ 없음
- supabase migrations/tests 변경: ❌ 없음
- 원격 supabase.co URL 허용: ❌ 없음
- service_role 브라우저 사용: ❌ 없음
- js/config.js commit: ❌ 없음 (ignored 상태 유지)
- data_export.json 포함: ❌ 없음
- 원격 Supabase 연결: ❌ 없음
- Orders/Customers/Analytics 전환: ❌ 없음

## 다음 단계 판단

1. **local Supabase 인프라 복구**: `supabase start` 시 여러 컨테이너가 unhealthy로 실패하는 문제 해결 필요. Docker Desktop 재시작 또는 `supabase db reset` 재시도.
2. **브라우저 write smoke 재수행**: 인프라 복구 후 상품 추가/수정/삭제/새로고침/삭제 제외 확인 재시도.
3. **현재까지 검증된 사항**:
   - runtime flag gate가 브라우저에서 `SupabaseProductsDataSource`를 정상 선택함 ✅
   - flag-off 시 `LocalProductsDataSource`로 정상 복귀함 ✅
   - `legacy_id` 생성 버그 수정 완료 ✅
   - 기존 JS 테스트 259/259 PASS ✅

## 3-5O.1: Brand Setting Fix & Local Browser Smoke Re-run (2026-07-20)

### 브랜드명 LESOUL 설정 관련 변경

#### 변경 파일
- `index.html`: `<title>`과 `<h1 class="store-name">`에서 "LES SOUL" → "LESOUL"로 수정
- `js/auth-ui.js`: 로그인 화면 logo에서 "LES SOUL" → "LESOUL"로 수정
- `js/db.js`: `getSettings()` 기본값 `store_name: 'LES SOUL'` → `LESOUL`; `getBrandName()` / `setBrandName()` resolver 추가
- `js/app.js`: `updateHeader()`에서 `DB.getBrandName()` 사용하도록 변경
- `js/i18n.js`: `app_brand_name` 번역 추가
- `js/settings.js`: 설정 화면에 브랜드명 입력 필드 추가
- `js/config.example.js`: `APP_BRAND_NAME: 'LESOUL'` 기본값 추가
- `docs/CURRENT_DATA_MODEL.md`: 기본값 문서 업데이트
- `tests/brand-setting-contract.test.mjs`: 신규 contract test

#### 브랜드 resolver 동작 규칙
1. localStorage (`lesoul_gh_app_brand_name`)에 사용자가 저장한 브랜드명이 있으면 그 값을 사용
2. 없으면 `LESOUL_CONFIG.APP_BRAND_NAME` 사용
3. 그것도 없으면 "LESOUL" 사용
4. 빈 문자열, null, undefined, 공백만 있는 값은 무시하고 "LESOUL"로 복구

#### 브랜드 설정 구조
- 설정 화면("매장명 설정")에 "앱 브랜드명" 입력 필드 추가
- 사용자가 브랜드명을 저장하면 localStorage에 저장됨
- 저장 후 페이지 새로고침 시 변경된 브랜드명이 header/login 화면에 표시됨
- 빈 값 저장 시 LESOUL로 복구

### PGRST202 문제 해결

**해결 여부**: ✅ 해결됨

**원인**: 3-5O 초기 실행 시 Supabase Docker 컨테이너가 제대로 실행되지 않았음

**해결 방법**:
- `supabase status`로 Supabase가 실행 중인지 확인
- `RUN_LOCAL_SUPABASE_INTEGRATION=1 node --test tests/products-runtime-local.integration.mjs` 실행
- **결과**: 16/16 PASS — `create_product` RPC가 정상 동작

### 브라우저 flag-on smoke 재수행 예정

인프라 복구 후 브라우저에서 다음 시나리오 재수행 예정:
- 로그인 → store 선택 → Products 페이지 진입 → `DB.getProductsDataSource().name === SupabaseProductsDataSource` 확인
- 상품 추가 → 새로고침 후 유지 확인
- 상품 수정 → 변경 확인
- 상품 삭제 (soft delete) → 목록에서 제외 확인
- 로그아웃 / 재로그인 후 데이터 유지 확인

### brand-setting contract 테스트 결과

`node --test tests/brand-setting-contract.test.mjs`
- **13/13 PASS**

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

## 3-5O.3: Test Regression Recovery (2026-07-20)

### PGRST202 해결 상태
- **해결됨** ✅
- `supabase db lint --local --level error --fail-on error`: PASS (exit=0)
- `supabase test db --local`: 161/161 PASS (exit=0)

### Products runtime local integration
- `RUN_LOCAL_SUPABASE_INTEGRATION=1 node --test tests/products-runtime-local.integration.mjs`
- **16/16 PASS** ✅

### 전체 JS 테스트 회귀
- **272/272 PASS** ✅ (완전 복구)
- auth-ui 5개 테스트 실패 → `_getBrandName()`에 localStorage 안전 가드 추가로 해결

### 브랜드 잔여 표기 정리 상태
- **JS/HTML 파일**: "LES SOUL" 표기 없음 ✅
- **문서 파일**: 과거 변경 기록 설명 용도로만 사용 중 (정상)

### auth-ui 수정 내역
- `js/auth-ui.js`의 `_getBrandName()`에 localStorage 안전 가드 추가
- `typeof localStorage !== 'undefined'` 체크로 Node.js 테스트 환경에서도 동작

### 제약 준수
- 기본 브랜드명 LESOUL: ✅
- products.js 변경: ❌ 없음
- css/style.css 변경: ❌ 없음
- supabase migrations/tests 변경: ❌ 없음
- 원격 Supabase 연결: ❌ 없음

## 3-5P: Products Batch Actions Supabase Compatibility (2026-07-21)

### batch actions 브라우저 smoke 결과

#### local flag-off (기본 localStorage mode)
- 기존 localStorage 상품 목록 정상 ✅
- 상품 추가/수정/삭제 정상 ✅
- 일괄 삭제 정상 ✅
- 일괄 분류 변경 정상 ✅
- 일괄 연도/월 변경 정상 ✅
- 검색/정렬/필터 정상 ✅

#### local flag-on (SupabaseProductsDataSource mode)
- `js/config.js` 사용: SUPABASE_ENABLED=true, PRODUCTS_SUPABASE_ENABLED=true
- local API URL + anon key만 사용 ✅
- 로그인/store 선택 정상 ✅
- Products 페이지 진입 정상 ✅
- 상품 여러 개 생성 정상 ✅
- 일괄 삭제 정상 (soft delete via soft_delete_product RPC) ✅
- 일괄 분류 변경 정상 (per-item update via update_product RPC) ✅
- 일괄 연도/월 변경 정상 (per-item update via update_product RPC) ✅
- 새로고침 후 결과 유지 ✅
- 삭제 상품 목록 제외 ✅

### batch actions 처리 방식
- **batchDelete**: per-item `DB.deleteProductAsync(id)` 순차 호출
- **batchReclassify**: per-item `DB.updateProductAsync(id, { category, color, size, material })` 순차 호출
- **batchMonthChange**: per-item `DB.updateProductAsync(id, { stock_year, stock_month })` 순차 호출
- **Promise.all 병렬 호출**: 금지 (순차 for loop 사용)
- **setProductsAsync**: Supabase runtime에서 사용 금지
- **성공/실패 처리**: 각 항목별로 성공/실패 수 기록, flash 메시지로 표시

### 제약 준수
- setProducts disabled 유지: ✅
- products.js가 Supabase client를 직접 참조하지 않음: ✅
- Promise.all 대량 병렬 호출 없음: ✅
- UI 구조 변경: ❌ 없음
- CSS 변경: ❌ 없음
- supabase migrations/tests 변경: ❌ 없음
- 원격 Supabase 연결: ❌ 없음

## 3-5Q: Products Remote Runtime Guardrail Preparation (2026-07-21)

### local runtime smoke 유지
- 기존 local flag-on/flag-off 브라우저 동작 동일 ✅
- 상품 목록/추가/수정/삭제/일괄 작업 정상 동작 ✅
- `PRODUCTS_SUPABASE_ENABLED=false`에서 LocalProductsDataSource 유지 ✅

### remote guardrail 동작
- remote guardrail은 실제 원격 연결이 아니라 차단/조건 검증만 수행
- `PRODUCTS_SUPABASE_REMOTE_ENABLED` 기본값 `false`에서:
  - remote URL(supabase.co) 감지 시 즉시 차단
  - error: "Products Supabase remote runtime is not enabled"
  - dummy URL/key만 사용, **실제 네트워크 호출 없음**
- `PRODUCTS_SUPABASE_REMOTE_ENABLED=true`에서:
  - remote URL + 모든 필수 조건 충족 시 SupabaseProductsDataSource 후보 생성 가능
  - 단, service_role key는 계속 차단

### local flag-on에서 기존 runtime 정상 동작
- local URL(localhost/127.0.0.1)은 `PRODUCTS_SUPABASE_REMOTE_ENABLED=false`여도 기존 조건 충족 시 허용
- `_validateWriteContext`가 `context.localOnly`와 `context.remoteEnabled` 모두 지원
- 브라우저 flag-on smoke 결과: 기존 3-5P 결과와 동일

### 제약 준수
- PRODUCTS_SUPABASE_REMOTE_ENABLED 기본값 false: ✅
- 실제 원격 Supabase 연결: ❌ 없음
- products.js 변경: ❌ 없음
- css/style.css 변경: ❌ 없음
- supabase migrations/tests 변경: ❌ 없음
- js/config.js commit: ❌ 없음
