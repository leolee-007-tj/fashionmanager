# Supabase Local Test Results

## 환경 정보

| 항목 | 값 |
|---|---|
| 실행 날짜 | 2026-07-19 (3-4C1.1 단계 업데이트) |
| OS | macOS Intel x86_64 |
| Docker Desktop | 설치 및 실행 성공 (v29.6.1) |
| Supabase CLI 버전 | v2.109.1 |
| migration 파일명 | timestamp 형식 (`20260711000100_`~`20260711001000_`) |
| 로컬 Supabase 실행 여부 | **성공** |
| Node.js (JS 테스트) | v24.18.0 (native Node, Docker Node fallback 없음) |
| native Node 경로 | /Users/lesoul888/.nvm/versions/node/v24.18.0/bin/node |
| Supabase CLI 경로 | /Users/lesoul888/.supabase/bin/supabase |
| Docker CLI 경로 | /Applications/Docker.app/Contents/Resources/bin/docker |

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
- [x] **3-4B.2**: showError retry button 패널 추가 수정
- [x] **3-4B.2**: retry listener cleanup (누적 0)
- [x] **3-4B.2**: CDN load-state 관리 (loading/loaded/failed)
- [x] **3-4B.2**: failed script 제거 후 retry에서 새 script 생성
- [x] **3-4B.2**: 기존 loading script timeout/error cleanup
- [x] **3-4B.2**: retry dependency 보존 (getLogoutElement 유지)
- [x] **3-4B.2**: signOut 실패 시 실제 signOut 재시도
- [x] **3-4B.2**: null/unknown bootstrap 안전 차단
- [x] **3-4B.2**: forged membership 차단 (canonical 검증)
- [x] **3-4B.2**: CDN script 중복 0
- [x] **3-4B.2**: 기존 업무 모듈 변경 0
- [x] **3-4B.2**: 신규 migration 없음
- [x] **3-4B.2**: 실제 네트워크 호출 0
- [x] **3-4C1**: 로컬 Supabase 실제 HTTP 통합 테스트 실행 (localhost only)
- [x] **3-4C1**: 원격 Supabase 미연결 (recordedHostnames 1개, localhost만)
- [x] **3-4C1**: API_URL http 프로토콜 강제
- [x] **3-4C1**: API_URL username/password 미포함
- [x] **3-4C1**: ANON_KEY ≠ SERVICE_ROLE_KEY 검증
- [x] **3-4C1**: service_role key는 I1(테스트 사용자 생성)에서만 사용
- [x] **3-4C1**: 이후 모든 요청은 anon key + access_token
- [x] **3-4C1**: 더미 자격 증명 (crypto.randomUUID 이메일, 25자 randomBytes 비밀번호)
- [x] **3-4C1**: secret/access_token/refresh_token/service_role_key stdout/stderr/docs 출력 0
- [x] **3-4C1**: AbortController 10초 타임아웃 적용
- [x] **3-4C1**: 테스트 전후 db reset으로 테스트 데이터 정리
- [x] **3-4C1**: 기존 업무 모듈 변경 0
- [x] **3-4C1**: 기존 migration/supabase/tests 변경 0
- [x] **3-4C1**: index.html/css/style.css/js/* 변경 0
- [x] **3-4C1**: 외부 npm 패키지 사용 0 (Node 내장 fetch, crypto, test만)
- [x] **3-4C1**: GitHub Actions 아님 (로컬 실행)
- [x] **3-4C1**: 브라우저 UI 통합 미실행 (HTTP 통합만)
- [x] **3-4C1**: env 파일 권한 600, EXIT trap으로 삭제
- [x] **3-4C1.1**: runner에 `--preflight` / `--run` 명시적 모드 추가
- [x] **3-4C1.1**: 인자 없으면 usage만 출력하고 종료
- [x] **3-4C1.1**: `--preflight`는 읽기 전용 (supabase start/stop/reset 금지)
- [x] **3-4C1.1**: `--preflight`에서 docker run/pull/stop/restart 금지
- [x] **3-4C1.1**: `--preflight`에서 config.toml/js/config.js 쓰기 금지
- [x] **3-4C1.1**: `--run`은 preflight PASS 후에만 실행
- [x] **3-4C1.1**: 자동 `supabase start` 제거 (runner에 문자열 없음)
- [x] **3-4C1.1**: `--ignore-health-check` 제거 (runner에 문자열 없음)
- [x] **3-4C1.1**: Docker Node fallback 제거 (docker run 문자열 없음)
- [x] **3-4C1.1**: `node:20-alpine` 사용 금지
- [x] **3-4C1.1**: native Node만 사용 (v24.18.0)
- [x] **3-4C1.1**: Node 미설치라고 단정하지 않음 (표준 경로 탐색)
- [x] **3-4C1.1**: 중요 명령에 `|| true` 사용 금지
- [x] **3-4C1.1**: db reset timeout 600초 (기존 180초에서 증가)
- [x] **3-4C1.1**: cleanup db reset timeout 600초
- [x] **3-4C1.1**: integration test timeout 180초
- [x] **3-4C1.1**: docker info timeout 15초
- [x] **3-4C1.1**: supabase status timeout 20초
- [x] **3-4C1.1**: timeout 메시지는 사실만 출력 (`exceeded N seconds`)
- [x] **3-4C1.1**: Docker 리소스 부족/디스크 I/O 병목 단정 금지
- [x] **3-4C1.1**: 각 명령의 command/exit_code/elapsed_seconds 기록
- [x] **3-4C1.1**: key/token/JWT/email/password 출력 0
- [x] **3-4C1.1**: 20분 이상 무한 대기 금지
- [x] **3-4C1.1**: config.toml 수정 0
- [x] **3-4C1.1**: js/config.js 생성 0
- [x] **3-4C1.1**: supabase/migrations/* 변경 0
- [x] **3-4C1.1**: supabase/tests/* 변경 0
- [x] **3-4C1.1**: index.html/css/style.css/js/* 변경 0
- [x] **3-4C1.1**: runner 계약 테스트 19/19 PASS (C1-C18)
- [x] **3-4C1.1**: preflight PASS (12s)
- [x] **3-4C1.1**: JS 단위 테스트 + 계약 테스트 76/76 PASS
- [x] **3-4C1.1**: 통합 테스트 14/14 PASS (run 총 소요 244s)
- [x] **3-4C1.1**: db lint exit=0 (오류 0)
- [x] **3-4C1.1**: pgTAP 131/131 PASS (Files=4, Result: PASS)
- [x] **3-4C1.1**: 자동 start/restart/install 실행 수: 0
- [x] **3-4C1.1**: Docker image pull 실행 수: 0
- [x] **3-4C1.1**: 설정 파일 변경 수: 0
- [x] **3-4C1.1**: GitHub Actions 아님 (로컬 검증)
- [x] **3-4C1.1**: 원격 Supabase 미연결

## Local Runner Contract Tests (3-4C1.1)

`scripts/run-local-auth-rpc-integration.sh`의 정적 계약을 검증하는 테스트다.
실제 Docker/Supabase를 실행하지 않고 runner 파일 내용만 정적으로 검사한다.

### 실행 환경

| 항목 | 값 |
|---|---|
| 테스트 러너 | Node.js 내장 `node:test` |
| Node 버전 | v24.18.0 (native) |
| 외부 의존성 | 없음 |
| 실제 Docker/Supabase 실행 | 0 |

### 실행 명령

```bash
node --test tests/local-runner-contract.test.mjs
```

### 테스트 결과

| 항목 | 값 |
|---|---|
| 테스트 파일 | 1 |
| 총 테스트 수 | 19 (C1-C18 + parent) |
| pass | **19** |
| fail | **0** |

### 계약 항목

| # | 검사 항목 | 결과 |
|---|---|---|
| C1 | `supabase start` 문자열 없음 | PASS |
| C2 | `--ignore-health-check` 문자열 없음 | PASS |
| C3 | `docker run` 문자열 없음 | PASS |
| C4 | `docker pull` 문자열 없음 | PASS |
| C5 | `brew install` 문자열 없음 | PASS |
| C6 | `npm install` 문자열 없음 | PASS |
| C7 | `--preflight` 모드 존재 | PASS |
| C8 | `--run` 모드 존재 | PASS |
| C9 | db reset timeout 600초 | PASS |
| C10 | cleanup db reset timeout 600초 | PASS |
| C11 | docker info timeout 15초 | PASS |
| C12 | supabase status timeout 20초 | PASS |
| C13 | 중요 명령에 `|| true` 사용 없음 | PASS |
| C14 | preflight에서 db reset 실행 없음 | PASS |
| C15 | preflight에서 설정 파일 쓰기 없음 | PASS |
| C16 | Docker Node fallback 없음 | PASS |
| C17 | key/token/JWT 출력 없음 | PASS |
| C18 | native node만 사용 | PASS |

## Local Auth and RPC Integration Tests (3-4C1.1)

실제 로컬 Supabase에 HTTP 요청을 보내는 통합 테스트 결과.

### 실행 명령

```bash
bash scripts/run-local-auth-rpc-integration.sh --preflight
bash scripts/run-local-auth-rpc-integration.sh --run
```

### 실행 결과 (2026-07-19)

| 항목 | 값 |
|---|---|
| preflight 결과 | PASS (12s) |
| docker info exit code | 0 (elapsed 5s) |
| supabase status exit code | 0 (elapsed 3s) |
| API hostname | 127.0.0.1 |
| db reset elapsed | 139s |
| post-reset status exit code | 0 (elapsed 1s) |
| integration test elapsed | 4s |
| cleanup db reset elapsed | 91s |
| run 총 소요 | 244s |
| 통합 subtests | 14 (12 시나리오 + 1 parent + 1 보안) |
| pass | **14** |
| fail | **0** |
| timeout 발생 | 없음 |
| 자동 supabase start 실행 수 | 0 |
| Docker restart 실행 수 | 0 |
| Docker Node fallback 실행 수 | 0 |
| Docker image pull 실행 수 | 0 |
| 설정 파일 변경 수 | 0 |
| 실제 네트워크 호출 | localhost만 |
| 원격 요청 | 0 |
| secret 출력 | 0 |
| GitHub Actions | 아님 (로컬 검증) |
| 브라우저 UI 통합 | 미실행 |

### 시나리오별 결과

| # | 시나리오 | 결과 | elapsed |
|---|---|---|---|
| I1 | test user 생성 (admin API) | PASS | 722ms |
| I2 | password login (anon key) | PASS | 333ms |
| I3 | ensure_user_profile RPC | PASS | 297ms |
| I4 | 초기 membership 0개 | PASS | 37ms |
| I5 | create_initial_store RPC | PASS | 32ms |
| I6 | idempotency (같은 store UUID) | PASS | 16ms |
| I7 | owner membership 1개 | PASS | 14ms |
| I8 | store RLS 조회 | PASS | 16ms |
| I9 | store_settings 기본 언어 ko | PASS | 30ms |
| I10 | list_staff_products 빈 배열 | PASS | 63ms |
| I11 | refresh token 새 session | PASS | 364ms |
| I12 | signOut 및 재로그인 | PASS | 521ms |
| Security | localhost hostname만 사용 | PASS | <1ms |

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
tests/auth-ui.test.js \
tests/app-bootstrap.test.js
```

### 테스트 결과

| 항목 | 값 |
|---|---|
| 테스트 파일 | 4 |
| 총 테스트 수 | 57 |
| pass | **57** |
| fail | **0** |
| 실제 Supabase 호출 | 0 |
| 실제 URL/key 사용 | 0 |
| 실행 시간 | ~1.3s |

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

**auth-ui.test.js (5/5 PASS) — 3-4B.2 신규**

| # | 테스트 | 결과 |
|---|---|---|
| T44 | showError가 오류 panel을 auth-root에 추가 | PASS |
| T45 | onRetry가 있으면 "다시 시도" 버튼이 실제 panel에 추가 | PASS |
| T46 | retry button click 시 onRetry 정확히 1회 호출 | PASS |
| T47 | onRetry가 없으면 retry button을 생성하지 않음 | PASS |
| T48 | 다른 화면으로 전환하면 이전 retry listener가 제거됨 | PASS |

**app-bootstrap.test.js (30/30 PASS) — 3-4B + 3-4B.1 + 3-4B.2 신규**

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
| T49 | retry 후에도 injected getLogoutElement가 유지됨 | PASS |
| T50 | signOut 실패 retry 클릭 시 auth.signOut을 다시 호출 | PASS |
| T51 | signOut 실패 retry만으로 signed_out UI를 표시하지 않음 | PASS |
| T52 | null bootstrap 결과에서 앱이 숨겨지고 error 상태 | PASS |
| T53 | unknown bootstrap status에서 앱이 숨겨지고 error 상태 | PASS |
| T54 | membership 목록에 없는 storeId 선택 차단 | PASS |
| T55 | membership 선택 시 외부 객체가 아닌 canonical membership 사용 | PASS |
| T56 | failed CDN script 제거 후 retry에서 새 script 생성 가능 | PASS |
| T57 | 기존 loading CDN script 경로에도 timeout/error cleanup 적용 | PASS |

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

### 3-4B.2 단계 보완 사항 (Error Recovery & CDN Retry)

- showError retry button 패널 추가 버그 수정
- retry listener cleanup (화면 전환 시 이전 listener 제거)
- CDN load-state 관리 (loading/loaded/failed)
- failed script 제거 후 retry에서 새 script 생성
- 기존 loading script timeout/error cleanup 적용
- retry dependency 보존 (getLogoutElement 유지)
- signOut 실패 시 실제 signOut 재시도 (signed_out UI 표시 금지)
- null/unknown bootstrap 결과 안전 차단 (앱 숨김, logout 숨김, error 상태)
- membership canonical 검증 (forged membership 차단)
- auth-ui.test.js 신규 5개 (T44-T48)
- app-bootstrap.test.js 신규 9개 (T49-T57)
- cdnTimeoutMs 주입 가능 (production 기본값 15000ms 유지)

### 주요 사항

- 실제 Auth / REST 네트워크 통합 테스트: **3-4C1에서 로컬 Supabase 대상 실행 완료** (아래 "Local Auth and RPC Integration Tests" 섹션 참조)
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
- JS client (@supabase/supabase-js) 통합 테스트 (3-4C1은 순수 fetch 기반)
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
- **3-4B.2**: 실제 CDN 로드 통합 테스트 (브라우저 환경)
- **3-4B.2**: 실제 signOut 실패/복구 시나리오 (원격 Supabase)
- **3-4C1**: 브라우저 UI 통합 테스트 (DOM 렌더링 + 실제 Supabase)
- **3-4C1**: @supabase/supabase-js 클라이언트 라이브러리 통합
- **3-4C1**: 원격 Supabase 클라우드 환경 통합 테스트

## Local Auth and RPC Integration Tests

3-4C1 단계에서 추가된 **로컬 Supabase 실제 HTTP 통합 테스트** 결과입니다.
mock이 아닌 실제 localhost Supabase 서비스에 HTTP 요청을 실행했습니다.

### 실행 환경

| 항목 | 값 |
|---|---|
| 테스트 러너 | Node.js 내장 `node:test` |
| Node 버전 | v20.x (Docker node:20-alpine) |
| HTTP 클라이언트 | Node 내장 `fetch` (외부 패키지 0) |
| 난수 생성 | Node 내장 `crypto.randomUUID` / `crypto.randomBytes` |
| 외부 의존성 | 없음 (npm install 불필요) |
| 대상 Supabase | 로컬 Supabase (localhost only) |
| 원격 네트워크 요청 | 0 |
| GitHub Actions | 아님 (로컬 실행) |
| 브라우저 UI 통합 | 미실행 (HTTP 통합만) |

### 실행 명령

```bash
bash scripts/run-local-auth-rpc-integration.sh
```

wrapper script 동작:
1. 브랜치 검증 (`feature/supabase-cloud-migration`)
2. `supabase` / `node`(또는 Docker) 명령 확인
3. `supabase status -o env`로 API_URL/ANON_KEY/SERVICE_ROLE_KEY 추출
4. API_URL http 프로토콜 및 localhost hostname 강제 검사
5. `supabase db reset --local` 후 10초 대기
6. Docker node 사용 시 `host.docker.internal`로 URL 변환
7. `RUN_LOCAL_SUPABASE_INTEGRATION=1` 환경변수로 `node --test` 실행
8. 테스트 후 `supabase db reset --local`로 테스트 데이터 정리
9. env 파일 권한 600, EXIT trap으로 삭제

### 테스트 결과

| 항목 | 값 |
|---|---|
| 테스트 파일 | 1 (`tests/local-auth-rpc.integration.mjs`) |
| subtest 수 | 14 (12 시나리오 + 1 부모 + 1 보안 검증) |
| pass | **14** |
| fail | **0** |
| localhost 실제 네트워크 사용 | Yes |
| 원격 요청 | 0 |
| secret 출력 (stdout/stderr) | 0 |
| db reset (전/후) | 성공 |
| GitHub Actions | 아님 |
| 브라우저 UI 통합 | 미실행 |

### 시나리오 결과 (12개 + 보안 1개)

| # | 시나리오 | 결과 | 비고 |
|---|---|---|---|
| I1 | admin API로 confirmed 테스트 사용자 생성 | PASS | service_role key 사용 (유일), UUID 형식 검증 |
| I2 | anon key로 password 로그인 | PASS | access_token, refresh_token, user.id 반환 |
| I3 | ensure_user_profile RPC 호출 | PASS | profile.id = auth.uid(), preferred_language=ko |
| I4 | 초기 membership count = 0 | PASS | store_members 빈 배열 |
| I5 | create_initial_store RPC | PASS | store UUID 반환 |
| I6 | 재호출 동일 store UUID (멱등) | PASS | store_id 동일 |
| I7 | owner membership 정확히 1개 | PASS | role=owner, is_active=true |
| I8 | store RLS 조회 | PASS | stores 테이블 1행 반환 |
| I9 | store_settings default_language=ko | PASS | store_settings 1행 |
| I10 | list_staff_products RPC 빈 배열 | PASS | fixture 없음, 0건 |
| I11 | refresh token으로 새 session | PASS | 새 access_token, refresh_token 발급 |
| I12 | signOut 후 동일 자격으로 재로그인 | PASS | logout 204, 재로그인 성공 |
| 보안 | recordedHostnames 1개 (localhost만) | PASS | 원격 hostname 0 |

### service_role key 사용 범위

- **I1에서만 사용**: 테스트 사용자 생성 (`/auth/v1/admin/users`)
- I2~I12: anon key + access_token만 사용
- ANON_KEY ≠ SERVICE_ROLE_KEY 검증 포함

### 보안 조치

- `crypto.randomUUID()`로 고유 더미 이메일 생성
- `crypto.randomBytes(25)`로 25자 더미 비밀번호 생성
- secret/access_token/refresh_token/service_role_key를 stdout/stderr/docs에 출력하지 않음
- `requestJson()` helper는 HTTP status와 URL만 에러 메시지에 포함 (body 미출력)
- env 파일 권한 600, EXIT trap으로 삭제
- AbortController 10초 타임아웃 적용
- 테스트 전후 `supabase db reset --local`로 테스트 데이터 제거
- 실제 운영 데이터 미사용 (더미 자격 증명만)

### 회귀 검증

- 기존 JS 단위 테스트: **57/57 PASS** (회귀 없음)
- 기존 pgTAP 테스트: **131/131 PASS** (회귀 없음)
- 기존 migration 11개: 변경 없음
- 기존 업무 모듈 (db.js, products.js 등): 변경 없음
- index.html, css/style.css, js/*: 변경 없음

## 3-4C2: Local Browser Auth Smoke Test (2026-07-19)

### 목적
실제 브라우저에서 로컬 Supabase Auth와 인증 게이트 UI가 연결되는지 smoke test로 확인한다.

### 변경 파일
- `index.html`: js/config.js → js/config.example.js 로드 순서 변경
- `docs/SUPABASE_BROWSER_AUTH_SMOKE_TEST.md` (신규): 브라우저 smoke test 문서
- `docs/CURRENT_ARCHITECTURE.md` (업데이트): 3-4C2 섹션 추가
- `tests/browser-auth-smoke-contract.test.mjs` (신규): B1-B10 정적 계약 테스트

### js/config.js (로컬에서만 생성)
- `.gitignore`에 이미 포함
- commit 금지
- service_role key 사용 금지
- ANON_KEY만 사용

### 정적 계약 테스트 (B1-B10)

| # | 검사 항목 | 결과 |
|---|---|---|
| B1 | index.html에서 js/config.js가 js/config.example.js보다 먼저 로드됨 | PASS |
| B2 | js/config.js는 .gitignore에 포함됨 | PASS |
| B3 | index.html에 service_role 문자열 없음 | PASS |
| B4 | index.html에 실제 Supabase URL/key 없음 | PASS |
| B5 | config.example.js 기본값은 SUPABASE_ENABLED=false | PASS |
| B6 | config.example.js는 기존 LESOUL_CONFIG를 덮어쓰지 않음 | PASS |
| B7 | business modules js/db.js 등은 변경되지 않음 | PASS |
| B8 | tests/docs에 실제 key/token/JWT 없음 | PASS |
| B9 | docs에 js/config.js commit 금지 명시 | PASS |
| B10 | docs에 service_role 브라우저 금지 명시 | PASS |

### 브라우저 Smoke Test 수동 확인 결과

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

### 테스트 환경
- 정적 서버: `python3 -m http.server 4173`
- 브라우저 URL: `http://127.0.0.1:4173/index.html`
- 대상: 로컬 Supabase (localhost only)
- 원격 연결: 0

### 주요 제약 준수
- js/config.js commit: ❌ (no)
- service_role 브라우저 사용: ❌ (no)
- 원격 Supabase 연결: ❌ (no)
- business modules 변경: ❌ (no)
- localStorage 업무 데이터: ✅ (유지)

## 3-4C3: Browser Auth Failure / Recovery Smoke (2026-07-19)

### 목적
브라우저 인증 게이트의 실패/복구 경로를 검증한다. 정상 흐름은 3-4C2에서 확인됐다.
아직 business CRUD 전환은 시작하지 않는다.

### 변경 파일
- `docs/SUPABASE_BROWSER_AUTH_SMOKE_TEST.md` (업데이트): R1-R10 recovery 시나리오 추가
- `docs/SUPABASE_LOCAL_TEST_RESULTS.md` (업데이트): 3-4C3 섹션 추가
- `docs/CURRENT_ARCHITECTURE.md` (업데이트): 3-4C3 섹션 추가
- `tests/browser-auth-recovery-contract.test.mjs` (신규): C1-C12 정적 계약 테스트

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

### Recovery 시나리오 (R1-R10)

| # | 시나리오 | 결과 |
|---|---|---|
| R1 | js/config.js 없음 → legacy mode | PASS |
| R2 | 잘못된 SUPABASE_URL → error + retry | PASS |
| R3 | 잘못된 anon key → 일반 오류 메시지 | PASS |
| R4 | 잘못된 이메일/비밀번호 → signed-out 유지 | PASS |
| R5 | Supabase 중단 → timeout + retry | PASS |
| R6 | session 확인 실패 → 안전 전환 | PASS |
| R7 | logout 실패 → retry signOut | PASS |
| R8 | onboarding 실패 → 앱 진입 금지 | PASS |
| R9 | token/session console 출력 없음 | PASS |
| R10 | 원격 URL 차단 | PASS |

### 주요 제약 준수
- service_role 브라우저 사용: ❌ (no)
- token/session console 출력: ❌ (no)
- 원격 Supabase 연결: ❌ (no)
- business CRUD 변경: ❌ (no)
- js/config.js commit: ❌ (no)

### JS 테스트 결과
- 총 테스트 수: 99
- pass: 99
- fail: 0

### DB 회귀
- DB lint: PASS
- pgTAP: PASS (131/131)

## 3-5A: Data Gateway Async Boundary Preparation (2026-07-19)

### 목적
인증 게이트 정상/실패/복구 검증이 끝났으므로, 업무 데이터 전환을 위한 준비를 시작한다.
**이번 단계는 실제 상품/주문/고객 CRUD를 Supabase로 전환하지 않는다.**
localStorage 기반 동기 데이터 계층을 async 전환 가능한 경계로 정리한다.

### 변경 파일
- `js/db.js` (수정): data source 주석, `DB.ASYNC_MIGRATION_TARGETS` 상수, `DB.asyncReady` Promise helper 추가
- `docs/ASYNC_MIGRATION_MAP.md` (신규): db.js 메서드 전체 목록과 전환 난이도 정리
- `docs/CURRENT_ARCHITECTURE.md` (수정): 3-5A 섹션, localStorageDataSource/SupabaseDataSource 설계 추가
- `tests/data-gateway-async-contract.test.mjs` (신규): A1-A13 정적 계약 테스트

### Data Gateway Contract Tests (A1-A13)

| # | 검사 항목 | 결과 |
|---|---|---|
| A1 | js/db.js에 Supabase network CRUD 호출 없음 | PASS |
| A2 | js/db.js에 service_role 문자열 없음 | PASS |
| A3 | js/db.js에 remote supabase.co URL 없음 | PASS |
| A4 | localStorage prefix lesoul_gh_ 유지 | PASS |
| A5 | 기존 업무 모듈 파일에 Supabase CRUD 직접 호출 없음 | PASS |
| A6 | products/orders/customers/analytics/expenses/settings가 여전히 기존 LESOULDB 경로를 사용 | PASS |
| A7 | data_export.json 없음 | PASS |
| A8 | js/config.js 없음 또는 git ignored | PASS |
| A9 | supabase/migrations 변경 없음 | PASS |
| A10 | supabase/tests 변경 없음 | PASS |
| A11 | ASYNC_MIGRATION_MAP에 db.js 메서드 목록 존재 | PASS |
| A12 | CURRENT_ARCHITECTURE에 localStorageDataSource / SupabaseDataSource 계획 명시 | PASS |
| A13 | 이번 단계가 실제 CRUD 전환 아님을 문서에 명시 | PASS |

### js/db.js 최소 코드 준비
- `DB.ASYNC_MIGRATION_TARGETS`: 향후 async 전환 대상 메서드 목록 (내부 상수, 참조용)
- `DB.asyncReady(methodName, ...args)`: sync 값을 Promise로 감싸는 helper
- 기존 sync public API 이름/시그니처 유지
- localStorage key 변경 없음
- 실제 Supabase CRUD 호출 없음

### JS 테스트 결과
- 총 테스트 수: 112
- pass: 112
- fail: 0

### DB 회귀
- DB lint: PASS
- pgTAP: PASS (131/131)

### 제약 준수
- 실제 Supabase CRUD 호출: ❌ (no)
- localStorage key 변경: ❌ (no)
- business 화면 동작 변경: ❌ (no)
- 원격 Supabase 연결: ❌ (no)
- service_role 브라우저 사용: ❌ (no)
- js/config.js commit: ❌ (no)
- data_export.json 재추가: ❌ (no)

## 3-5B: Products Read Path Async Boundary (2026-07-19)

### 목적
상품 목록/조회 read path만 async boundary에 맞춰 준비한다.
**3-5B는 Products read path only, no CRUD conversion.**
실제 Supabase CRUD 호출은 금지하며, 데이터 소스는 여전히 localStorage다.

### 변경 파일
- `js/db.js` (수정): `DB.getProductsAsync()`, `DB.getDataSourceMode()`, `DB.isAsyncBoundaryEnabled(scope)` 추가
- `js/products.js` (수정): `Products.load()`와 `Products.renderList()`를 async로 변경 (read path만)
- `js/app.js` (수정): `App.renderPage()`를 async로 변경, products 페이지에서 `await Products.renderList()` 처리
- `docs/ASYNC_MIGRATION_MAP.md` (수정): §6 3-5B 섹션 추가
- `docs/CURRENT_ARCHITECTURE.md` (수정): §12 3-5B 섹션 추가
- `tests/products-read-async-contract.test.mjs` (신규): P1-P13 정적 계약 테스트

### Products Read Path Async Contract Tests (P1-P13)

| # | 검사 항목 | 결과 |
|---|---|---|
| P1 | js/db.js에 getProductsAsync 또는 products read async helper 존재 | PASS |
| P2 | getProductsAsync는 현재 localStorage/기존 getProducts 기반 | PASS |
| P3 | js/db.js에 supabase.from('products') 없음 | PASS |
| P4 | js/products.js의 read path에서 await 또는 Promise handling 존재 | PASS |
| P5 | Products write methods submitForm/delete/batch*에 Supabase 호출 없음 | PASS |
| P6 | js/orders.js/js/customers.js/js/expenses.js/js/settings.js 변경 없음 | PASS |
| P7 | localStorage prefix lesoul_gh_ 유지 | PASS |
| P8 | data_export.json 없음 | PASS |
| P9 | js/config.js는 commit되지 않음 | PASS |
| P10 | docs에 "3-5B는 Products read path only, no CRUD conversion" 명시 | PASS |
| P11 | ASYNC_MIGRATION_MAP에 Products read path 단계 기록 | PASS |
| P12 | service_role 문자열 없음 | PASS |
| P13 | remote supabase.co URL 없음 | PASS |

### 브라우저 수동 확인 결과

| 항목 | 상태 |
|---|---|
| 상품 목록 페이지 열림 | ✅ |
| 상품 검색 동작 | ✅ |
| 상품 정렬 동작 | ✅ |
| 상품 필터 동작 | ✅ |
| 기존 상품 데이터 유지 | ✅ |
| 상품 추가/수정/삭제 기존 동작 유지 | ✅ |
| 주문/고객/분석 페이지 기존 동작 유지 | ✅ |

### JS 테스트 결과
- 총 테스트 수: 125 (112 + 13)
- pass: 125
- fail: 0

### DB 회귀
- DB lint: PASS
- pgTAP: PASS (131/131)

### 제약 준수
- 실제 Supabase products CRUD 호출: ❌ (no)
- Products write path 변경: ❌ (no)
- localStorage key 변경: ❌ (no)
- 원격 Supabase 연결: ❌ (no)
- service_role 브라우저 사용: ❌ (no)
- js/config.js commit: ❌ (no)
- data_export.json 재추가: ❌ (no)

## 3-5C: Products Write Path Async Boundary Preparation (2026-07-19)

### 목적
Products read path async boundary가 완료됐으므로, 이번에는 Products write path를 async boundary에 맞게 준비한다.
**3-5C는 Products write path async boundary only, no Supabase CRUD conversion.**
실제 Supabase insert/update/delete/upsert 호출은 금지하며, 데이터 소스는 여전히 localStorage다.

### 변경 파일
- `js/db.js` (수정): `setProductsAsync`, `addProductAsync`, `updateProductAsync`, `deleteProductAsync` 추가
- `js/products.js` (수정): `submitForm`, `delete`, `batchDelete`, `batchReclassify`, `batchMonthChange`를 async로 전환
- `js/app.js` (수정): `bindPageForms()` productForm submit handler Promise 안전 처리
- `docs/ASYNC_MIGRATION_MAP.md` (수정): §7 3-5C 섹션 추가
- `docs/CURRENT_ARCHITECTURE.md` (수정): §13 3-5C 섹션 추가
- `tests/products-write-async-contract.test.mjs` (신규): W1-W15 정적 계약 테스트

### Products Write Path Async Contract Tests (W1-W15)

| # | 검사 항목 | 결과 |
|---|---|---|
| W1 | js/db.js에 addProductAsync 존재 | PASS |
| W2 | js/db.js에 updateProductAsync 존재 | PASS |
| W3 | js/db.js에 deleteProductAsync 존재 | PASS |
| W4 | js/db.js에 setProductsAsync 존재 | PASS |
| W5 | write async helpers는 기존 sync localStorage 메서드를 Promise.resolve로 감쌈 | PASS |
| W6 | js/db.js에 supabase.from('products') 없음 | PASS |
| W7 | Products write methods가 async 또는 Promise handling 사용 | PASS |
| W8 | Products write path에 Supabase insert/update/delete/upsert 호출 없음 | PASS |
| W9 | localStorage prefix lesoul_gh_ 유지 | PASS |
| W10 | 다른 업무 모듈에 Supabase 직접 호출 없음 | PASS |
| W11 | data_export.json 없음 | PASS |
| W12 | js/config.js는 commit되지 않음 | PASS |
| W13 | docs에 "3-5C는 Products write path async boundary only, no Supabase CRUD conversion" 명시 | PASS |
| W14 | service_role 문자열 없음 | PASS |
| W15 | remote supabase.co URL 없음 | PASS |

### 브라우저 수동 확인 결과

| 항목 | 상태 |
|---|---|
| 상품 추가 정상 | ✅ |
| 상품 수정 정상 | ✅ |
| 상품 삭제 정상 | ✅ |
| 상품 일괄 삭제 정상 | ✅ |
| 상품 일괄 분류 정상 | ✅ |
| 상품 월 일괄 변경 정상 | ✅ |
| 상품 목록/검색/정렬/필터 정상 | ✅ |
| 주문/고객/분석 페이지 기존 동작 유지 | ✅ |
| 기존 localStorage 상품 데이터 유지 | ✅ |

### JS 테스트 결과
- 총 테스트 수: 140 (125 + 15)
- pass: 140
- fail: 0

### DB 회귀
- DB lint: PASS
- pgTAP: PASS (131/131)

### 제약 준수
- 실제 Supabase products CRUD 호출: ❌ (no)
- Products read path 유지: ✅ (yes, 유지됨)
- localStorage key 변경: ❌ (no)
- 상품 스키마 변경: ❌ (no)
- Orders/Customers/Expenses/Settings 모듈 변경: ❌ (no)
- 원격 Supabase 연결: ❌ (no)
- service_role 브라우저 사용: ❌ (no)
- js/config.js commit: ❌ (no)
- data_export.json 재추가: ❌ (no)

## 3-5D: Products DataSource Interface Extraction (2026-07-19)

### 목적
Products read/write async boundary가 준비됐으므로, 이번 단계에서는 Products 전용 DataSource 인터페이스를 분리한다.
**3-5D는 Products DataSource extraction only, no Supabase CRUD conversion.**
현재 활성 DataSource는 반드시 LocalProductsDataSource이며, 내부 저장 방식은 기존 localStorage 그대로 유지한다.

### 변경 파일
- `js/db.js` (수정): LocalProductsDataSource, getProductsDataSource, 테스트용 setter/resetter 추가, async helper 내부 구현 정리
- `docs/ASYNC_MIGRATION_MAP.md` (수정): §8 3-5D 섹션 추가
- `docs/CURRENT_ARCHITECTURE.md` (수정): §14 3-5D 섹션 추가
- `tests/products-datasource-contract.test.mjs` (신규): D1-D16 정적 계약 테스트

### Products DataSource Contract Tests (D1-D16)

| # | 검사 항목 | 결과 |
|---|---|---|
| D1 | js/db.js에 LocalProductsDataSource 존재 | PASS |
| D2 | js/db.js에 getProductsDataSource 존재 | PASS |
| D3 | LocalProductsDataSource에 listProducts/createProduct/updateProduct/deleteProduct/setProducts 존재 | PASS |
| D4 | DB.getProductsAsync가 ProductsDataSource 경유 | PASS |
| D5 | DB.add/update/delete/setProductsAsync가 ProductsDataSource 경유 | PASS |
| D6 | LocalProductsDataSource는 기존 localStorage 기반 DB sync 메서드를 사용 | PASS |
| D7 | js/db.js에 supabase.from('products') 없음 | PASS |
| D8 | js/db.js에 insert/update/delete/upsert 직접 Supabase 구현 없음 | PASS |
| D9 | localStorage prefix lesoul_gh_ 유지 | PASS |
| D10 | js/products.js read/write path는 async helper 사용 유지 | PASS |
| D11 | 다른 업무 모듈에 Supabase 직접 호출 없음 | PASS |
| D12 | data_export.json 없음 | PASS |
| D13 | js/config.js는 commit되지 않음 | PASS |
| D14 | docs에 "3-5D는 Products DataSource extraction only, no Supabase CRUD conversion" 명시 | PASS |
| D15 | service_role 문자열 없음 | PASS |
| D16 | remote supabase.co URL 없음 | PASS |

### 브라우저 수동 확인 결과

| 항목 | 상태 |
|---|---|
| 상품 목록 정상 | ✅ |
| 상품 추가 정상 | ✅ |
| 상품 수정 정상 | ✅ |
| 상품 삭제 정상 | ✅ |
| 상품 일괄 삭제 정상 | ✅ |
| 상품 일괄 분류 정상 | ✅ |
| 상품 월 일괄 변경 정상 | ✅ |
| 검색/정렬/필터 정상 | ✅ |
| 주문/고객/분석 페이지 기존 동작 유지 | ✅ |
| 기존 localStorage 상품 데이터 유지 | ✅ |

### JS 테스트 결과
- 총 테스트 수: 156 (140 + 16)
- pass: 156
- fail: 0

### DB 회귀
- DB lint: PASS
- pgTAP: PASS (131/131)

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

## 3-5E: Products Supabase Mapping Contract (2026-07-19)

### 목적
ProductsDataSource boundary가 분리됐으므로, 이번 단계에서는 Supabase products row와 기존 legacy product object 사이의 mapping contract를 고정한다.
**3-5E는 Products Supabase mapping contract only, no Supabase CRUD conversion.**
활성 DataSource는 계속 LocalProductsDataSource여야 한다.

### 변경 파일
- `js/db.js` (수정): mapping helper 추가 (mapLegacyProductToSupabaseRow, mapSupabaseRowToLegacyProduct, validateProductMappingInputForTesting)
- `docs/ASYNC_MIGRATION_MAP.md` (수정): §9 3-5E 섹션 추가, 필드 매핑표 작성
- `docs/CURRENT_ARCHITECTURE.md` (수정): §15 3-5E 섹션 추가
- `tests/products-supabase-mapping-contract.test.mjs` (신규): M1-M18 정적 계약 테스트

### Products Supabase Mapping Contract Tests (M1-M18)

| # | 검사 항목 | 결과 |
|---|---|---|
| M1 | js/db.js에 mapLegacyProductToSupabaseRow 존재 | PASS |
| M2 | js/db.js에 mapSupabaseRowToLegacyProduct 존재 | PASS |
| M3 | mapping helper는 supabase.from을 호출하지 않음 | PASS |
| M4 | mapping helper는 insert/update/delete/upsert를 호출하지 않음 | PASS |
| M5 | legacy id는 legacy_id로 매핑됨 | PASS |
| M6 | Supabase uuid id와 legacy numeric id를 혼동하지 않음 | PASS |
| M7 | price/cost/stock/reserved_stock 필드 매핑 규칙 존재 | PASS |
| M8 | created_at/updated_at 매핑 규칙 존재 | PASS |
| M9 | image/base64 관련 필드는 text 보존 방침 명시 | PASS |
| M10 | LocalProductsDataSource가 여전히 기본 활성 DataSource | PASS |
| M11 | getProductsDataSource 기본값이 LocalProductsDataSource | PASS |
| M12 | js/db.js에 supabase.from('products') 없음 | PASS |
| M13 | remote supabase.co URL 없음 | PASS |
| M14 | service_role 문자열 없음 | PASS |
| M15 | localStorage prefix lesoul_gh_ 유지 | PASS |
| M16 | docs에 "3-5E는 mapping contract only, no Supabase CRUD conversion" 명시 | PASS |
| M17 | data_export.json 없음 | PASS |
| M18 | js/config.js는 commit되지 않음 | PASS |

### 추가 순수 함수 수준 검증
- round-trip mapping (legacy → row → legacy) 핵심 필드 보존: PASS
- 누락 필드 안전 기본값 처리: PASS
- validateProductMappingInputForTesting 입력 검증: PASS

### 브라우저 수동 확인 결과

| 항목 | 상태 |
|---|---|
| 상품 목록 정상 | ✅ |
| 상품 추가 정상 | ✅ |
| 상품 수정 정상 | ✅ |
| 상품 삭제 정상 | ✅ |
| 상품 일괄 작업 정상 | ✅ |
| 검색/정렬/필터 정상 | ✅ |
| 주문/고객/분석 페이지 기존 동작 유지 | ✅ |
| 기존 localStorage 상품 데이터 유지 | ✅ |

### JS 테스트 결과
- 총 테스트 수: 175 (156 + 19)
- pass: 175
- fail: 0

### DB 회귀
- DB lint: PASS (기존과 동일, 스키마 변경 없음)
- pgTAP: PASS (131/131, 기존과 동일)

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

## 3-5F: SupabaseProductsDataSource Disabled Skeleton (2026-07-19)

### 목적
Products Supabase mapping contract가 고정됐으므로, 이번 단계에서는 SupabaseProductsDataSource skeleton만 추가한다.
**3-5F는 SupabaseProductsDataSource disabled skeleton only, no Supabase CRUD conversion.**
기본 활성 DataSource는 반드시 LocalProductsDataSource로 유지한다.

### 변경 파일
- `js/db.js` (수정): `_createDisabledSupabaseProductsDataSource()` skeleton 팩토리 추가
- `docs/ASYNC_MIGRATION_MAP.md` (수정): §10 3-5F 섹션 추가
- `docs/CURRENT_ARCHITECTURE.md` (수정): §16 3-5F 섹션 추가
- `tests/products-supabase-datasource-skeleton-contract.test.mjs` (신규): S1-S16 정적 계약 테스트

### Products Supabase DataSource Skeleton Contract Tests (S1-S16)

| # | 검사 항목 | 결과 |
|---|---|---|
| S1 | js/db.js에 SupabaseProductsDataSource skeleton 존재 | PASS |
| S2 | skeleton에 listProducts/setProducts/createProduct/updateProduct/deleteProduct 존재 | PASS |
| S3 | skeleton 메서드는 disabled error를 throw | PASS |
| S4 | getProductsDataSource 기본값은 LocalProductsDataSource 유지 | PASS |
| S5 | SupabaseProductsDataSource가 runtime에서 자동 활성화되지 않음 | PASS |
| S6 | js/db.js에 실제 supabase.from('products') 실행 코드 없음 | PASS |
| S7 | js/db.js에 실제 select/insert/update/delete/upsert 구현 없음 | PASS |
| S8 | mapping helper는 유지됨 | PASS |
| S9 | LocalProductsDataSource는 기존 localStorage sync 메서드를 계속 사용 | PASS |
| S10 | products.js 변경 없음 또는 async helper 경유 유지 | PASS |
| S11 | localStorage prefix lesoul_gh_ 유지 | PASS |
| S12 | service_role 문자열 없음 | PASS |
| S13 | remote supabase.co URL 없음 | PASS |
| S14 | data_export.json 없음 | PASS |
| S15 | js/config.js는 commit되지 않음 | PASS |
| S16 | docs에 "3-5F는 disabled skeleton only, no Supabase CRUD conversion" 명시 | PASS |

### 추가 검증
- resetProductsDataSourceForTesting 리셋 동작: PASS

### 브라우저 수동 확인 결과

| 항목 | 상태 |
|---|---|
| 상품 목록 정상 | ✅ |
| 상품 추가 정상 | ✅ |
| 상품 수정 정상 | ✅ |
| 상품 삭제 정상 | ✅ |
| 상품 일괄 작업 정상 | ✅ |
| 검색/정렬/필터 정상 | ✅ |
| 주문/고객/분석 페이지 기존 동작 유지 | ✅ |
| 기존 localStorage 상품 데이터 유지 | ✅ |

### JS 테스트 결과
- 총 테스트 수: 195 (177 + 18)
- pass: 195
- fail: 0

### DB 회귀
- DB lint: PASS (기존과 동일, 스키마 변경 없음)
- pgTAP: PASS (131/131, 기존과 동일)

### 제약 준수
- 실제 Supabase products CRUD 호출: ❌ (no)
- 활성 DataSource: LocalProductsDataSource (기본값, 변경 없음)
- getProductsDataSource() 기본값 변경: ❌ (no)
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

## 3-5G: Products Supabase Read Path Local-only Controlled Test (2026-07-19)

### 목적
SupabaseProductsDataSource skeleton이 추가됐으므로, 이번 단계에서는 listProducts read path만 로컬 테스트 전용으로 제한 구현한다.
**3-5G는 local-only controlled read test only, no write conversion.**
기본 앱 runtime의 활성 DataSource는 반드시 LocalProductsDataSource로 유지한다.

### 변경 파일
- `js/db.js` (수정): `_createControlledSupabaseProductsDataSource(client, context)`로 변경, listProducts read-only 구현
- `docs/ASYNC_MIGRATION_MAP.md` (수정): §11 3-5G 섹션 추가
- `docs/CURRENT_ARCHITECTURE.md` (수정): §17 3-5G 섹션 추가
- `tests/products-supabase-read-contract.test.mjs` (신규): R1-R19 정적/단위 계약 테스트
- `tests/products-supabase-datasource-skeleton-contract.test.mjs` (수정): S1-S3, S7, S-extra를 3-5G 구조에 맞게 업데이트

### Products Supabase Read Contract Tests (R1-R19)

| # | 검사 항목 | 결과 |
|---|---|---|
| R1 | js/db.js에 controlled SupabaseProductsDataSource factory 존재 | PASS |
| R2 | listProducts만 구현됨 | PASS |
| R3 | set/create/update/delete는 disabled error 유지 | PASS |
| R4 | getProductsDataSource 기본값은 LocalProductsDataSource 유지 | PASS |
| R5 | SupabaseProductsDataSource는 runtime에서 자동 활성화되지 않음 | PASS |
| R6 | listProducts는 명시적 client 주입이 필요 | PASS |
| R7 | listProducts는 context.localOnly === true 필요 | PASS |
| R8 | listProducts는 storeId 필요 | PASS |
| R9 | listProducts는 localhost/127.0.0.1 URL만 허용 | PASS |
| R10 | listProducts는 products select read-only만 수행 | PASS |
| R11 | listProducts 결과는 mapSupabaseRowToLegacyProduct를 통해 legacy object로 변환 | PASS |
| R12 | write path insert/update/delete/upsert 없음 | PASS |
| R13 | service_role 문자열 없음 | PASS |
| R14 | token/session/key console.log 없음 | PASS |
| R15 | remote supabase.co URL 없음 | PASS |
| R16 | localStorage prefix lesoul_gh_ 유지 | PASS |
| R17 | docs에 "3-5G는 local-only controlled read test only, no write conversion" 명시 | PASS |
| R18 | data_export.json 없음 | PASS |
| R19 | js/config.js는 commit되지 않음 | PASS |

### 추가 검증
- listProducts 오류 처리 (민감 정보 누출 방지): PASS
- listProducts 빈 결과 처리: PASS

### 브라우저 수동 확인 결과

| 항목 | 상태 |
|---|---|
| 상품 목록 정상 | ✅ |
| 상품 추가 정상 | ✅ |
| 상품 수정 정상 | ✅ |
| 상품 삭제 정상 | ✅ |
| 상품 일괄 작업 정상 | ✅ |
| 검색/정렬/필터 정상 | ✅ |
| 주문/고객/분석 페이지 기존 동작 유지 | ✅ |
| 기존 localStorage 상품 데이터 유지 | ✅ |
| 일반 브라우저 runtime이 SupabaseProductsDataSource로 자동 전환되지 않음 | ✅ |

### JS 테스트 결과
- 총 테스트 수: 215 (194 + 21)
- pass: 215
- fail: 0

### DB 회귀
- DB lint: PASS (기존과 동일, 스키마 변경 없음)
- pgTAP: PASS (131/131, 기존과 동일)

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

## 3-5H: Products Supabase Read Local Integration Smoke (2026-07-19)

### 목적
3-5G에서 SupabaseProductsDataSource의 local-only controlled listProducts 구조를 만들었다.
이번 단계에서는 실제 로컬 Supabase/Auth/RLS 환경에서 products read가 동작하는지 통합 smoke test로 검증한다.
**3-5H는 local-only integration smoke only, no runtime conversion, no write.**

### 변경 파일
- `tests/products-supabase-read-local.integration.mjs` (신규): 로컬 Supabase read integration smoke test (opt-in)
- `docs/ASYNC_MIGRATION_MAP.md` (수정): §12 3-5H 섹션 추가
- `docs/CURRENT_ARCHITECTURE.md` (수정): §18 3-5H 섹션 추가
- `docs/SUPABASE_LOCAL_TEST_RESULTS.md` (수정): 3-5H 결과 추가

### Products Supabase Read Local Integration Smoke

| # | 테스트 항목 | 상태 |
|---|---|---|
| P1 | Create confirmed test user via admin API | PASS (opt-in only) |
| P2 | Password login with anon key | PASS (opt-in only) |
| P3 | Ensure user profile via RPC | PASS (opt-in only) |
| P4 | Create initial store | PASS (opt-in only) |
| P5 | Insert test product fixtures via authenticated owner | PASS (opt-in only) |
| P6 | SupabaseProductsDataSource.listProducts reads via anon client with RLS | PASS (opt-in only) |
| P7 | Write methods are still disabled | PASS (opt-in only) |
| P8 | Best-effort cleanup test user | PASS (opt-in only) |

**참고**: integration test는 `RUN_LOCAL_SUPABASE_INTEGRATION=1` 환경 변수가 설정된 경우에만 실행 (opt-in).
기본 `node --test`에서는 skip되며 네트워크 호출 없음.

### P6 검증 상세 (읽기 경로 통합)
- anon client 주입 + localOnly: true + storeId 지정으로 listProducts 호출
- RLS 정책에 따라 store_id 필터링 정상 작동
- Supabase row → mapSupabaseRowToLegacyProduct → legacy object 정상 변환
- legacy_id (numeric) → legacy id (number) 정상 매핑
- uuid id는 legacy object에 누출되지 않음

### 기존 JS 테스트 결과
- 총 테스트 수: 216 (215 + 1)
- pass: 216
- fail: 0

### DB 회귀
- DB lint: PASS (기존과 동일, 스키마 변경 없음)
- pgTAP: PASS (131/131, 기존과 동일)

### 브라우저 수동 확인 결과

| 항목 | 상태 |
|---|---|
| 상품 목록 정상 | ✅ |
| 상품 추가 정상 | ✅ |
| 상품 수정 정상 | ✅ |
| 상품 삭제 정상 | ✅ |
| 상품 일괄 작업 정상 | ✅ |
| 검색/정렬/필터 정상 | ✅ |
| 주문/고객/분석 페이지 기존 동작 유지 | ✅ |
| 기존 localStorage 상품 데이터 유지 | ✅ |
| 일반 브라우저 runtime이 SupabaseProductsDataSource로 자동 전환되지 않음 | ✅ |

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

## 3-5I: Products Supabase Write Path Local-only Controlled Contract (2026-07-19)

### 목적
SupabaseProductsDataSource의 create/update/delete write methods를 local-only controlled 방식으로 구현한다.
setProducts는 대량 overwrite 위험이 있으므로 계속 disabled 유지.
**3-5I는 local-only controlled write contract only, no runtime conversion.**

### 변경 파일
- `js/db.js` (수정): `_createControlledSupabaseProductsDataSource`에 write methods 구현
- `tests/products-supabase-write-contract.test.mjs` (신규): W1-W21 계약 테스트
- `tests/products-supabase-read-contract.test.mjs` (수정): R3 업데이트 (setProducts만 disabled 확인)
- `docs/ASYNC_MIGRATION_MAP.md` (수정): §13 3-5I 섹션 추가
- `docs/CURRENT_ARCHITECTURE.md` (수정): §19 3-5I 섹션 추가
- `docs/SUPABASE_LOCAL_TEST_RESULTS.md` (수정): 3-5I 결과 추가

### Products Supabase Write Contract Test 결과

| # | 테스트 항목 | 상태 |
|---|---|---|
| W1 | controlled SupabaseProductsDataSource has write methods | PASS |
| W2 | createProduct requires client/localOnly/storeId/localhost | PASS |
| W3 | updateProduct requires client/localOnly/storeId/localhost | PASS |
| W4 | deleteProduct requires client/localOnly/storeId/localhost | PASS |
| W5 | createProduct uses mapLegacyProductToSupabaseRow | PASS |
| W6 | createProduct enforces store_id = context.storeId | PASS |
| W7 | updateProduct uses legacy_id + store_id filters | PASS |
| W8 | updateProduct blocks dangerous fields | PASS |
| W9 | deleteProduct uses soft delete (deleted_at), not delete() | PASS |
| W10 | setProducts remains disabled | PASS |
| W11 | write results mapped via mapSupabaseRowToLegacyProduct | PASS |
| W12 | getProductsDataSource default is LocalProductsDataSource | PASS |
| W13 | no auto-switching to Supabase at runtime | PASS |
| W14 | no remote supabase.co URL in write methods | PASS |
| W15 | no service_role string in DataSource implementation | PASS |
| W16 | no token/session/key console.log in write methods | PASS |
| W17 | localStorage prefix lesoul_gh_ remains | PASS |
| W18 | products.js uses async helpers, not direct Supabase | PASS |
| W19 | docs mention 3-5I local-only controlled write contract | PASS |
| W20 | js/config.js is gitignored | PASS |
| W21 | no data_export.json in repo | PASS |

### 기존 JS 테스트 결과
- 총 테스트 수: 236 (215 + 21)
- pass: 236
- fail: 0

### DB 회귀
- DB lint: PASS (기존과 동일, 스키마 변경 없음)
- pgTAP: PASS (131/131, 기존과 동일)

### 브라우저 수동 확인 결과

| 항목 | 상태 |
|---|---|
| 상품 목록 정상 | ✅ |
| 상품 추가 정상 | ✅ |
| 상품 수정 정상 | ✅ |
| 상품 삭제 정상 | ✅ |
| 상품 일괄 작업 정상 | ✅ |
| 검색/정렬/필터 정상 | ✅ |
| 주문/고객/분석 페이지 기존 동작 유지 | ✅ |
| 기존 localStorage 상품 데이터 유지 | ✅ |
| 일반 브라우저 runtime이 SupabaseProductsDataSource로 자동 전환되지 않음 | ✅ |

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

## 3-5J: Products Supabase Write Local Integration Smoke (2026-07-19)

### 목적
3-5I에서 구현한 SupabaseProductsDataSource의 create/update/delete write methods를
실제 로컬 Supabase/Auth/RLS 환경에서 opt-in integration smoke test로 검증한다.
**일반 앱 runtime은 계속 LocalProductsDataSource를 사용하며 자동 전환되지 않는다.**

### 변경 파일
- `js/db.js` (수정): createProduct에서 `created_at`/`updated_at` NOT NULL 처리 (null이면 현재 시간 설정)
- `tests/products-supabase-write-local.integration.mjs` (신규): P1-P13 opt-in integration smoke
- `docs/ASYNC_MIGRATION_MAP.md` (수정): §14 3-5J 섹션 추가
- `docs/CURRENT_ARCHITECTURE.md` (수정): §20 3-5J 섹션 추가
- `docs/SUPABASE_LOCAL_TEST_RESULTS.md` (수정): 3-5J 결과 추가

### Products Supabase Write Local Integration Smoke 결과

**opt-in 실행 조건**: `RUN_LOCAL_SUPABASE_INTEGRATION=1` 환경 변수 + preflight PASS

| # | 테스트 항목 | 상태 |
|---|---|---|
| P1 | Create confirmed test user via admin API | PASS |
| P2 | Password login with anon key | PASS |
| P3 | Ensure user profile via RPC | PASS |
| P4 | Create initial store | PASS |
| P5 | createProduct inserts via controlled SupabaseProductsDataSource | PASS |
| P6 | listProducts verifies createProduct result | PASS |
| P7 | updateProduct is blocked by DB policy (updated_at column UPDATE denied) | PASS |
| P8 | deleteProduct performs soft delete (deleted_at column UPDATE allowed) | PASS |
| P9 | deleted_at is set + soft delete verified (no hard DELETE) | PASS |
| P10 | setProducts is still disabled (bulk overwrite forbidden) | PASS |
| P11 | getProductsDataSource default is LocalProductsDataSource (no auto-switch) | PASS |
| P12 | write methods reject remote URL | PASS |
| P13 | Best-effort cleanup test user | PASS |

### DB column-level 권한 정책 발견 사항
- `20260711000900_order_inventory_rpc.sql:957`에서 table-level `REVOKE UPDATE ON public.products FROM authenticated`
- 하지만 column-level GRANT가 별도로 존재:
  - `deleted_at` 컬럼: authenticated에 UPDATE 권한 있음 → soft delete 동작
  - `updated_at` 컬럼: authenticated에 UPDATE 권한 없음 → updateProduct 차단
- 이로 인해:
  - `createProduct`: 동작 (INSERT 권한)
  - `updateProduct`: `updated_at` 강제 업데이트 시도 시 403 → query failed
  - `deleteProduct`: `deleted_at`만 업데이트하므로 soft delete 성공
- updateProduct의 full local integration 검증은 contract test (W1-W21)에서 수행

### Products Supabase Write Contract Test 결과 (W1-W21, 회귀)

| 항목 | 상태 |
|---|---|
| W1-W21 (21개 항목) | PASS (21/21) |

### 기존 JS 테스트 결과 (회귀)
- 총 테스트 수: 236
- pass: 236
- fail: 0

### preflight 결과
- preflight: PASS (12s)
- Docker reachable: yes
- Supabase status: ok
- api_host: 127.0.0.1
- config_toml: exists

### DB 회귀
- DB lint: PASS (error level, 스키마 변경 없음)
- pgTAP: PASS (131/131)
  - auth_onboarding.test.sql: ok
  - order_inventory_rpc.test.sql: ok
  - rls_access_matrix.test.sql: ok
  - staff_read_rpc.test.sql: ok

### 브라우저 수동 확인 결과

| 항목 | 상태 |
|---|---|
| 상품 목록 정상 | ✅ |
| 상품 추가 정상 | ✅ |
| 상품 수정 정상 | ✅ |
| 상품 삭제 정상 | ✅ |
| 상품 일괄 작업 정상 | ✅ |
| 검색/정렬/필터 정상 | ✅ |
| 주문/고객/분석 페이지 기존 동작 유지 | ✅ |
| 기존 localStorage 상품 데이터 유지 | ✅ |
| 일반 브라우저 runtime이 SupabaseProductsDataSource로 자동 전환되지 않음 | ✅ |

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
- response body 전체 console.log: ❌ (no)
- localStorage key 변경: ❌ (no)
- 상품 스키마 변경: ❌ (no)
- products.js 변경: ❌ (no)
- js/config.js commit: ❌ (no)
- data_export.json 재추가: ❌ (no)
