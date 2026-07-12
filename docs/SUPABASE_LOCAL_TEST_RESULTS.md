# Supabase Local Test Results

## 환경 정보

| 항목 | 값 |
|---|---|
| 실행 날짜 | 2026-07-12 (3-4B 단계 업데이트) |
| OS | macOS Intel x86_64 |
| Docker Desktop | 설치 및 실행 성공 (v29.6.1) |
| Supabase CLI 버전 | v2.109.1 |
| migration 파일명 | timestamp 형식 (`20260711000100_`~`20260711001000_`) |
| 로컬 Supabase 실행 여부 | **성공** |
| Node.js (JS 테스트) | v20.x (Docker node:20-alpine) |

## 실행 상태

로컬 Supabase DB와 pgTAP 테스트 검증 결과:

- migration 001~01000: **로컬 적용 성공** (11개 전체)
- db lint: **오류 0** (lint_exit=0)
- pgTAP 테스트: **131/131 PASS** (Files=4, Tests=131, Result: PASS)

> 이 결과는 로컬 Supabase 환경에서 검증되었습니다.
> GitHub Actions CI는 없으므로 로컬 Supabase 검증만 해당합니다.
> 원격 Supabase는 여전히 미연결 상태입니다.

## Migration 파일

| 파일명 | 상태 |
|---|---|
| `20260711000100_extensions_and_types.sql` | 로컬 적용 성공 |
| `20260711000200_initial_schema.sql` | 로컬 적용 성공 |
| `20260711000300_constraints_and_indexes.sql` | 로컬 적용 성공 |
| `20260711000400_triggers.sql` | 로컬 적용 성공 |
| `20260711000500_private_helpers.sql` | 로컬 적용 성공 |
| `20260711000600_rls_policies.sql` | 로컬 적용 성공 |
| `20260711000700_audit_functions.sql` | 로컬 적용 성공 |
| `20260711000800_auth_onboarding.sql` | 로컬 적용 성공 |
| `20260711000850_auth_onboarding_hardening.sql` | 로컬 적용 성공 |
| `20260711000900_order_inventory_rpc.sql` | 로컬 적용 성공 |
| `20260711000950_order_inventory_hardening.sql` | 로컬 적용 성공 |
| `20260711001000_staff_read_rpcs.sql` | 로컬 적용 성공 |

파일명은 Supabase CLI 표준 timestamp 형식(`YYYYMMDDHHMMSS_`)을 사용합니다.
`supabase db reset --local`으로 11개 migration 전체 적용 성공했습니다.

## db lint 결과

- 실행 명령: `supabase db lint --local --level error --fail-on error`
- 검사 대상: extensions, private, public 스키마
- 결과: **오류 0** (lint_exit=0)

## pgTAP 테스트 결과

- 실행 명령: `supabase test db --local`
- 테스트 파일:
  - `supabase/tests/rls_access_matrix.test.sql` (25 assertion) — **25/25 PASS**
  - `supabase/tests/auth_onboarding.test.sql` (20 assertion) — **20/20 PASS**
  - `supabase/tests/order_inventory_rpc.test.sql` (54 assertion) — **54/54 PASS**
  - `supabase/tests/staff_read_rpc.test.sql` (32 assertion) — **32/32 PASS**
- 설명용 시나리오 문서: `docs/RLS_ACCESS_MATRIX_SCENARIOS.sql`

| 항목 | 값 |
|---|---|
| Files | 4 |
| Tests | 131 |
| Result | **PASS** |
| All tests successful | Yes |
| 실행 시간 | 2 wallclock sec |

> 이 결과는 로컬 Supabase 환경에서 검증되었습니다.
> GitHub Actions CI는 없으므로 로컬 Supabase 검증만 해당합니다.

### 테스트 상세 (rls_access_matrix.test.sql — 25/25 PASS)

| # | 테스트 | 결과 | 비고 |
|---|---|---|---|
| T1 | Owner 자기 store 조회 | PASS | is |
| T2 | Owner 타 store 조회 차단 | PASS | is (0건) |
| T3 | Manager product insert 가능 | PASS | lives_ok |
| T4 | Staff products base table 0건 | PASS | is (0건) |
| T5a | Manager store_members UPDATE 완료 | PASS | lives_ok (0행, RLS 차단) |
| T5b | Staff role 유지 확인 | PASS | is |
| T6 | Cross-store customer rejected by create_order RPC | PASS | throws_ok 22023 |
| T7 | Cross-store product rejected by create_order RPC | PASS | throws_ok 22023 |
| T8 | Cross-store inventory_log 실패 | PASS | throws_ok P0001 |
| T9 | Direct orders INSERT 차단 | PASS | throws_ok 42501 |
| T10 | Direct orders UPDATE 차단 | PASS | throws_ok 42501 |
| T11 | Direct current_stock UPDATE 차단 | PASS | throws_ok 42501 |
| T12 | Direct customer aggregate UPDATE 차단 | PASS | throws_ok 42501 |
| T13 | Soft-deleted product 신규 주문 실패 | PASS | throws_ok 22023 |
| T14 | 과거 주문 notes 수정 — direct UPDATE 차단 | PASS | throws_ok 42501 |
| T15 | 과거 주문 product_id → deleted product 변경 — direct UPDATE 차단 | PASS | throws_ok 42501 |
| T16 | 마지막 owner 비활성화 실패 | PASS | throws_ok 22023 |
| T17 | 마지막 owner role 변경 실패 | PASS | throws_ok 22023 |
| T18 | store_members user_id 변경 실패 | PASS | throws_ok 22023 |
| T19 | Product created_by = auth.uid() | PASS | is |
| T20 | Migration_runs insert 성공 | PASS | lives_ok |
| T21 | Migration_runs initiated_by 검증 | PASS | is |
| T22 | Migration_runs update 성공 | PASS | lives_ok |
| T23 | Migration_runs version 증가 | PASS | is (version=2) |
| T24 | Stores update 성공 | PASS | lives_ok |
| T25 | Physical DELETE 차단 | PASS | throws_ok 42501 |

### 테스트 상세 (auth_onboarding.test.sql — 20/20 PASS)

| # | 테스트 | 결과 | 비고 |
|---|---|---|---|
| T1 | 미인증 ensure_user_profile 차단 | PASS | throws_ok 42501 |
| T2 | 미인증 create_initial_store 차단 | PASS | throws_ok 42501 |
| T3 | 인증 create_initial_store 성공 | PASS | lives_ok |
| T4 | 스토어 1개 존재 | PASS | is |
| T5 | created_by = auth.uid() | PASS | is |
| T6 | 활성 owner 멤버십 1개 | PASS | is |
| T7 | 멤버십 user_id = auth.uid() | PASS | is |
| T8 | store_settings default_language = ko | PASS | is |
| T9 | 프로필 존재 | PASS | is |
| T10 | 재호출 동일 store_id (멱등) | PASS | is |
| T11 | 중복 생성 없음 | PASS | is |
| T12 | 빈 store 이름 실패 | PASS | throws_ok 22023 |
| T13 | NULL language 실패 | PASS | throws_ok 22023 |
| T14 | NULL default_language 실패 | PASS | throws_ok 22023 |
| T15 | NULL name 실패 | PASS | throws_ok 22023 |
| T16 | 빈 문자열 name 실패 | PASS | throws_ok 22023 |
| T17 | 101자 name 실패 | PASS | throws_ok 22023 |
| T18 | 삭제 후 재온보딩 새 활성 store 반환 | PASS | is |
| T19 | 재온보딩 후 활성 store 1개 | PASS | is |
| T20 | EXECUTE 권한 authenticated만 | PASS | is |

### 테스트 상세 (order_inventory_rpc.test.sql — 54/54 PASS)

| 범위 | 테스트 내용 | 결과 |
|---|---|---|
| T1-T3 | create_order 권한 (anon/staff 차단, manager 성공) | PASS |
| T4-T5 | 주문 PENDING 상태, snapshot 검증 | PASS |
| T6-T8 | reserved_stock 증가, current_stock 불변, RESERVE log | PASS |
| T9-T11 | 재고 부족, cross-store customer/product, deleted product 차단 | PASS |
| T12-T15 | 직접 DML 차단 (orders INSERT/UPDATE, current_stock, customer aggregate) | PASS |
| T16-T18 | update_pending_order 수량 증감, 상품 변경 | PASS |
| T19-T24 | ship_order, 재고 차감, 수익 계산, 고객 집계 | PASS |
| T25-T32 | 중복 ship/cancel/complete 차단, 상태 전환 검증 | PASS |
| T33-T35 | inventory_logs DML 차단, cross-store RLS | PASS |
| T36-T41 | NULL 입력 방어, soft-delete 검증, legacy 처리, 데이터 불일치 | PASS |
| T42-T44 | 정수 반올림 검증 (profit=66, margin=67, cost_ratio=33) | PASS |
| T45 | 삭제 고객 집계 갱신 차단 (sentinel 123 유지) | PASS |
| T46 | 회귀 테스트 (create→update→ship→complete) | PASS |

### 테스트 상세 (staff_read_rpc.test.sql — 32/32 PASS)

| # | 테스트 | 결과 | 비고 |
|---|---|---|---|
| T1 | anon list_staff_products 차단 | PASS | throws_ok 42501 |
| T2 | 비회원 list_staff_products 차단 | PASS | throws_ok 42501 |
| T3 | inactive staff 차단 | PASS | throws_ok 42501 |
| T4 | active staff 자기 store active product 조회 | PASS | is (2건) |
| T5 | 삭제 product 제외 | PASS | is (0건) |
| T6 | 타 store product 제외 | PASS | is (0건) |
| T7 | product payload korea_cost 제외 | PASS | is (false) |
| T8 | product payload actual_converted_cost 제외 | PASS | is (false) |
| T9 | product payload china_base_price 제외 | PASS | is (false) |
| T10 | product 검색어 필터 정상 작동 | PASS | is (1건) |
| T11 | active staff 자기 store active customer 조회 | PASS | is (2건) |
| T12 | 삭제 customer 제외 | PASS | is (0건) |
| T13 | 타 store customer 제외 | PASS | is (0건) |
| T14 | customer payload 안전 필드 존재 | PASS | is (true) |
| T15 | customer payload total_amount 제외 | PASS | is (false) |
| T16 | customer payload total_profit 제외 | PASS | is (false) |
| T17 | customer payload order_count 제외 | PASS | is (false) |
| T18 | active staff 자기 store active order 조회 | PASS | is (1건) |
| T19 | 삭제 order 제외 | PASS | is (0건) |
| T20 | 타 store order 제외 | PASS | is (0건) |
| T21 | order payload 안전 필드 존재 | PASS | is (true) |
| T22 | order payload actual_converted_cost_at_sale 제외 | PASS | is (false) |
| T23 | order payload actual_profit 제외 | PASS | is (false) |
| T24 | order payload profit_margin/cost_ratio 제외 | PASS | is (false) |
| T25 | owner 제한 product RPC 호출 가능 | PASS | lives_ok |
| T26 | manager 제한 customer RPC 호출 가능 | PASS | lives_ok |
| T27 | p_limit = 0 차단 | PASS | throws_ok 22023 |
| T28 | p_offset = -1 차단 | PASS | throws_ok 22023 |
| T29 | staff products base table 0건 유지 | PASS | is (0건) |
| T30 | staff customers base table 0건 유지 | PASS | is (0건) |
| T31 | staff orders base table 0건 유지 | PASS | is (0건) |
| T32 | staff create_order 차단 | PASS | throws_ok 42501 |

## 보안 확인

- [x] 원격 Supabase 미연결
- [x] 실제 운영 데이터 미사용
- [x] `supabase login` / `supabase link` 미실행
- [x] `supabase db push` 미실행
- [x] service_role key / JWT 미기록
- [x] 앱 HTML/CSS/JS 변경: index.html, css/style.css, js/app.js, js/config.example.js만 (업무 모듈 미변경)
- [x] `auth.uid()` 재정의 없음
- [x] psql `\set` 문법 없음
- [x] config.toml에 실제 secret 없음
- [x] migration 파일명 Supabase CLI 표준 timestamp 형식
- [x] db lint 오류 없음 (migration 001~01000)
- [x] pgTAP 131/131 PASS (로컬 Supabase)
- [x] staff base-table RLS 유지 (0건)
- [x] staff 민감 필드 제외 (원가, 수익, 고객 집계)
- [x] staff 쓰기 권한 없음
- [x] config.toml 커밋하지 않음
- [x] data_export.json 미생성
- [x] **3-4B**: feature flag 기본값 `SUPABASE_ENABLED=false`
- [x] **3-4B**: 실제 URL/key 포함 0
- [x] **3-4B**: index.html에 Supabase CDN 직접 태그 없음
- [x] **3-4B**: disabled 경로에서 CDN loader 미호출
- [x] **3-4B**: App.init 정확히 한 번 (disabled mode)
- [x] **3-4B**: auth-root 기본 hidden
- [x] **3-4B**: logout 및 badge 기본 hidden
- [x] **3-4B**: 기존 메뉴·라우터·localStorage 기능 유지
- [x] **3-4B**: js/config.js commit 없음
- [x] **3-4B**: 신규 migration 없음
- [x] **3-4B**: secret/service_role key 포함 0
- [x] **3-4B**: legacy fallback 금지 (인증 오류 시 error 화면만)
- [x] **3-4B**: token을 context에 저장하지 않음
- [x] **3-4B**: 실제 네트워크 호출 0 (mock 기반 테스트)
- [x] **3-4B.1**: 헤더 logout 버튼 signOut lifecycle에 연결
- [x] **3-4B.1**: logout listener 단일 등록 (중복 0)
- [x] **3-4B.1**: signOut single-flight (중복 호출 0)
- [x] **3-4B.1**: bootstrap single-flight (동시 실행 최대 1)
- [x] **3-4B.1**: bootstrap revision 순서 수정 (in-flight 체크 우선)
- [x] **3-4B.1**: SIGNED_OUT bootstrap invalidation
- [x] **3-4B.1**: 늦은 ready 결과 무시 (App.init 0 유지)
- [x] **3-4B.1**: SIGNED_OUT 후 activeMembership null
- [x] **3-4B.1**: destroy 시 listener 정리 + bootstrap 무효화
- [x] **3-4B.1**: 기존 업무 모듈 변경 0 (db.js, products.js 등)
- [x] **3-4B.1**: 신규 migration 없음
- [x] **3-4B.1**: 실제 네트워크 호출 0

## JavaScript Foundation Unit Tests

3-4A, 3-4A.1, 3-4B 단계에서 추가된 Supabase JS 클라이언트, 인증 서비스, 인증 게이트 부트스트랩에 대한
단위 테스트 결과입니다. **mock 기반이며 실제 네트워크 호출은 없습니다.**

### 실행 환경

| 항목 | 값 |
|---|---|
| 테스트 러너 | Node.js 내장 `node:test` |
| Node 버전 | v20.x (Docker node:20-alpine) |
| 외부 의존성 | 없음 (npm install 불필요) |
| mock 방식 | global.supabase에 mock client 주입 + 의존성 주입 |
| 실제 네트워크 호출 | 0 |

### 실행 명령

```bash
node --test \
tests/supabase-client.test.js \
tests/auth-service.test.js \
tests/app-bootstrap.test.js
```

### 테스트 결과

| 항목 | 값 |
|---|---|
| 테스트 파일 | 3 |
| 총 테스트 수 | 43 |
| pass | **43** |
| fail | **0** |
| 실제 Supabase 호출 | 0 |
| 실제 URL/key 사용 | 0 |
| 실행 시간 | ~2.0s |

### 테스트 상세

**supabase-client.test.js (7/7 PASS)**

| # | 테스트 | 결과 |
|---|---|---|
| T1 | disabled config에서 client를 생성하지 않음 | PASS |
| T2 | enabled 상태의 잘못된 URL 차단 | PASS |
| T3 | enabled 상태의 빈 client key 차단 | PASS |
| T4 | sb_secret_ key와 service_role JWT 차단 | PASS |
| T5 | 정상 mock config에서 client 정확히 1회 생성 | PASS |
| T6 | createClient에 auth persistence 옵션 전달 확인 | PASS |
| T22 | 브라우저 atob 경로에서 service_role JWT 차단 | PASS |

**auth-service.test.js (15/15 PASS)**

| # | 테스트 | 결과 |
|---|---|---|
| T7 | 빈 email/password 로그인 차단 | PASS |
| T8 | signInWithPassword에 정제된 email과 password 전달 | PASS |
| T9 | getSession이 session/user 반환 | PASS |
| T10 | signOut 호출 및 true 반환 | PASS |
| T11 | subscribe가 auth 이벤트 전달하고 unsubscribe 가능 | PASS |
| T12 | ensureUserProfile이 정확한 RPC 이름과 인자 사용 | PASS |
| T13 | bootstrapAuthenticatedUser가 세션 없을 때 signed_out 반환 | PASS |
| T14 | 세션은 있지만 membership이 없으면 needs_store_onboarding 반환 | PASS |
| T15 | createInitialStore가 정확한 RPC 이름과 인자 사용 | PASS |
| T16 | subscribe가 data.subscription.unsubscribe를 호출 | PASS |
| T17 | unsubscribe를 두 번 호출해도 실제 해제는 한 번만 실행 (idempotent) | PASS |
| T18 | 함수가 아닌 callback 차단 — AUTH_CALLBACK_INVALID | PASS |
| T19 | getSession 반환 error 차단 — AUTH_SESSION_FAILED | PASS |
| T20 | signOut 반환 error 차단 — AUTH_SIGN_OUT_FAILED | PASS |
| T21 | LESOULAuth.init이 초기화되지 않은 client를 차단 | PASS |

**app-bootstrap.test.js (21/21 PASS) — 3-4B + 3-4B.1 신규**

| # | 테스트 | 결과 |
|---|---|---|
| T23 | feature disabled면 App.init 정확히 1회 | PASS |
| T24 | feature disabled면 Supabase library 로드 0회 | PASS |
| T25 | start 두 번 호출해도 App.init 중복 없음 | PASS |
| T26 | enabled + signed_out이면 로그인 UI 표시 | PASS |
| T27 | signed_out 상태에서 App.init 호출 없음 | PASS |
| T28 | enabled + needs_store_onboarding이면 매장 생성 UI 표시 | PASS |
| T29 | ready + membership 1개면 App.init 1회 및 ready | PASS |
| T30 | ready + membership 2개면 store selection UI 표시 | PASS |
| T31 | membership 선택 후 activeMembership 설정 및 앱 진입 | PASS |
| T32 | signIn 성공 후 bootstrap 재실행 | PASS |
| T33 | signIn 실패 시 안전한 로그인 오류 표시 | PASS |
| T34 | signOut 성공 후 context 초기화 및 signed_out | PASS |
| T35 | library load 실패 시 error이며 legacy fallback 없음 | PASS |
| T36 | SIGNED_OUT 이벤트 수신 시 앱을 숨기고 context 초기화 | PASS |
| T37 | ready 상태에서 헤더 logout 클릭 시 auth.signOut 1회 호출 | PASS |
| T38 | logout 버튼 연속 클릭 시 signOut은 한 번만 호출 | PASS |
| T39 | start를 두 번 호출해도 logout listener는 하나만 등록 | PASS |
| T40 | destroy 후 logout listener 제거 | PASS |
| T41 | bootstrap 진행 중 INITIAL_SESSION 이벤트가 발생해도 최초 결과가 stale 처리되지 않음 | PASS |
| T42 | bootstrap 진행 중 SIGNED_OUT 이벤트가 발생하면 늦게 도착한 ready 결과가 무시됨 | PASS |
| T43 | 이전 bootstrap 완료 후 새로운 SIGNED_IN 이벤트로 bootstrap 재실행 가능 | PASS |

### 3-4B 단계 보완 사항

- `LESOULAuthUI` 전역 객체 (IIFE) — 인증 UI 렌더러
- `LESOULAppBootstrap` 전역 객체 (IIFE) — 인증 게이트 부트스트랩
- 의존성 주입 패턴 (`start({ deps })`)으로 mock 기반 단위 테스트
- App.init 단일 실행 보장 (`_appInitCalled` 플래그)
- Bootstrap revision guard (stale 결과 방지)
- 동적 CDN 로드 (15초 timeout, `SUPABASE_LIBRARY_LOAD_FAILED`)
- Legacy fallback 금지 (인증 오류 시 error 화면만)
- Context 메모리 전용 (token/session을 context에 저장하지 않음)
- `#auth-root`에만 인증 화면 렌더링
- 모든 동적 값은 `createElement` + `textContent` (innerHTML 금지)
- 비밀번호 submit 후 입력 필드 즉시 비움
- 한국어 안전 오류 문구만 사용

### 3-4B.1 단계 보완 사항 (Logout & Concurrency)

- 헤더 logout 버튼 실제 signOut lifecycle에 연결
- logout listener 단일 등록 (중복 바인딩 방지)
- signOut single-flight 구현 (동시 호출 시 1회만 실행)
- bootstrap single-flight 구현
- bootstrap revision 증가 순서 수정 (in-flight 체크 우선)
- SIGNED_OUT bootstrap invalidation 구현
- 늦은 ready 결과 차단 (stale 결과 무시)
- destroy 시 listener 정리 + bootstrap 무효화
- SIGNED_OUT 후 App.init 호출 0 검증
- SIGNED_OUT 후 activeMembership null 검증
- concurrent bootstrap 최대 1개 검증
- 종료된 bootstrap 이후 다음 bootstrap 재실행 가능 검증
- logout listener 중복 0 검증
- localStorage 접근 0 검증
- 실제 네트워크 호출 0 검증

### 주요 사항

- 실제 Auth / REST 네트워크 통합 테스트는 아직 미실행
- 실제 원격 Supabase 미연결
- index.html에 auth gate 연결 (config.example.js, supabase-client.js, auth-service.js, auth-ui.js, app.js, app-bootstrap.js 로드)
- 기존 localStorage 앱 미변경 (db.js, products.js, orders.js, customers.js, analytics.js, expenses.js, excel.js, settings.js diff 0)
- 기존 DB migration 11개, pgTAP 131개 회귀 없음
- `global.atob`를 mock한 테스트는 `finally` 블록에서 원래 상태로 복원
- 테스트 간 global 상태 누출 없음 (`resetGlobals()` 호출)
- feature flag disabled 검증: App.init 1회, CDN 요청 0건
- token을 context에 저장하지 않음 검증 완료
- localStorage 접근 0 (테스트 환경)
- App.init은 lifecycle 전체에서 최대 1회 검증 완료

## 아직 검증되지 않은 항목

- 원격 Supabase 클라우드 환경에서의 migration 적용
- JS client (@supabase/supabase-js) 통합 테스트
- REST API / PostgREST 동작 검증
- 실제 Auth 로그인 사용자 기반 테스트
- Storage, Edge Functions, Realtime 등 부가 서비스
- 대량 데이터 성능 테스트
- 동시성/race condition 통합 테스트
- staff용 대시보드 집계 RPC
- staff용 반품/교환 처리
- staff용 제한된 주문 상태 변경
- **3-4B**: 실제 Supabase 프로젝트 연결 (URL/key 입력)
- **3-4B**: 브라우저 통합 테스트 (실제 DOM 렌더링)
- **3-4B**: config.js 로딩 및 활성화
- **3-4B**: 업무 데이터 계층의 Supabase 전환
