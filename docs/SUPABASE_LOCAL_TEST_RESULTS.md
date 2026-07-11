# Supabase Local Test Results

## 환경 정보

| 항목 | 값 |
|---|---|
| 실행 날짜 | 2026-07-11 |
| OS | macOS Intel x86_64 |
| Docker Desktop | 설치 및 실행 성공 (v29.6.1) |
| Supabase CLI 버전 | v2.109.1 |
| migration 파일명 | timestamp 형식 (`20260711000100_`~`20260711001000_`) |
| 로컬 Supabase 실행 여부 | **성공** |

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
- [x] 앱 HTML/CSS/JS 미변경
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
