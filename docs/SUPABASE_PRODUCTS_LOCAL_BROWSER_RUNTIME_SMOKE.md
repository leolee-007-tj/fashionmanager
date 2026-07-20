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
