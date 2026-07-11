# Supabase Local Test Results

## 환경 정보

| 항목 | 값 |
|---|---|
| 실행 날짜 | 2026-07-11 |
| OS | macOS Intel x86_64 |
| Docker Desktop | 설치 및 실행 성공 |
| Supabase CLI 버전 | v2.109.1 |
| supabase init 결과 | 성공 (config.toml 생성됨) |
| migration 파일명 | timestamp 형식 (`20260711000100_`~`20260711000950_`) |
| 로컬 Supabase 실행 여부 | **성공** |

## 실행 상태

로컬 Supabase DB와 pgTAP 테스트 검증 결과:

- migration 001~007: 로컬 실행 PASS (이전 단계에서 검증)
- migration 008~00950: 코드 작성 완료, 사용자 머신에서 `supabase db reset --local` 실행 필요
- pgTAP 테스트: 코드 작성 완료, 사용자 머신에서 `supabase test db --local` 실행 필요

> **주의**: 008~00950 migration과 관련 pgTAP 테스트는 이 작업 환경에 Supabase CLI/Docker가 설치되어 있지 않아 로컬에서 아직 실행되지 않았습니다. 사용자 머신에서 반드시 실행해야 합니다.

단, 다음 사항은 아직 검증되지 않았습니다:
- 원격 Supabase 프로젝트 검증 (실행 금지)
- JS client / REST API 통합 테스트
- 실제 Auth 로그인 사용자 기반 테스트
- Supabase 부가 서비스 (Storage, Edge Functions 등) 운영 준비 검증

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
| `20260711000800_auth_onboarding.sql` | 사용자 머신 실행 필요 |
| `20260711000850_auth_onboarding_hardening.sql` | 사용자 머신 실행 필요 |
| `20260711000900_order_inventory_rpc.sql` | 사용자 머신 실행 필요 |
| `20260711000950_order_inventory_hardening.sql` | 사용자 머신 실행 필요 |

파일명은 Supabase CLI 표준 timestamp 형식(`YYYYMMDDHHMMSS_`)을 사용합니다.
`supabase db reset --local`으로 10개 migration 전체 적용이 필요합니다.

## db lint 결과

- 실행 명령: `supabase db lint --local`
- 검사 대상: extensions, private, public 스키마
- 결과: migration 001~007은 **오류 없음** (이전 단계 검증)
- migration 008~00950: 사용자 머신에서 재실행 필요

## pgTAP 테스트 결과

- 실행 명령: `supabase test db --local`
- 테스트 파일:
  - `supabase/tests/rls_access_matrix.test.sql` (25 assertion)
  - `supabase/tests/auth_onboarding.test.sql` (20 assertion)
  - `supabase/tests/order_inventory_rpc.test.sql` (54 assertion)
- 설명용 시나리오 문서: `docs/RLS_ACCESS_MATRIX_SCENARIOS.sql`

| 항목 | 값 |
|---|---|
| Files | 3 |
| Tests | 99 (예상값, 사용자 머신 실행으로 확정 필요) |
| Result | **사용자 머신 실행 필요** |
| All tests successful | 사용자 머신 실행으로 확인 필요 |

> rls_access_matrix.test.sql의 25 assertion은 이전 단계에서 PASS 확인.
> auth_onboarding.test.sql의 20 assertion과 order_inventory_rpc.test.sql의 54 assertion은 사용자 머신에서 실행해야 확정.
> GitHub Actions CI는 없으므로 로컬 Supabase 검증만 해당합니다.

### 테스트 상세 (rls_access_matrix.test.sql — 25 assertion, 이전 PASS)

| # | 테스트 | 결과 | 비고 |
|---|---|---|---|
| T1 | Owner 자기 store 조회 | PASS | is |
| T2 | Owner 타 store 조회 차단 | PASS | is (0건) |
| T3 | Manager product insert 가능 | PASS | lives_ok |
| T4 | Staff products base table 0건 | PASS | is (0건) |
| T5a | Manager store_members UPDATE 완료 | PASS | lives_ok (0행, RLS 차단) |
| T5b | Staff role 유지 확인 | PASS | is |
| T6 | Cross-store customer 주문 실패 | PASS | throws_ok 42501 |
| T7 | Cross-store product 주문 실패 | PASS | throws_ok 42501 |
| T8 | Cross-store inventory_log 실패 | PASS | throws_ok 42501 |
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

### Assertion 분류 (rls_access_matrix.test.sql)

| 종류 | 수량 |
|---|---|
| lives_ok | 7 |
| throws_ok | 10 |
| is | 8 |
| **총계** | **25** |

### order_inventory_rpc.test.sql (54 assertion, 사용자 머신 실행 필요)

| 범위 | 테스트 내용 |
|---|---|
| T1-T15 | create_order 권한, snapshot, 재고 예약, DML 차단 |
| T16-T18 | update_pending_order 수량 증감, 상품 변경 |
| T19-T24 | ship_order, 재고 차감, 수익 계산, 고객 집계 |
| T25-T32 | 중복 ship/cancel/complete 차단, 상태 전환 검증 |
| T33-T35 | inventory_logs DML 차단, cross-store RLS |
| T36-T41 | NULL 입력 방어, soft-delete 검증, legacy 처리 |
| T42-T44 | 정수 반올림 검증 (profit/margin/cost_ratio) |
| T45 | 삭제 고객 집계 갱신 차단 |
| T46 | 회귀 테스트 (create→update→ship→complete) |

## 보안 확인

- [x] 원격 Supabase 미연결
- [x] 실제 운영 데이터 미사용
- [x] `supabase login` / `supabase link` 미실행
- [x] `supabase db push` 미실행
- [x] service_role key / JWT 미기록
- [x] 앱 HTML/CSS/JS 미변경
- [x] `auth.uid()` 재정의 없음
- [x] psql `\set` 문법 없음
- [x] config.toml에 실제 secret 없음 (모두 env 참조 또는 빈 값)
- [x] migration 파일명 Supabase CLI 표준 timestamp 형식
- [x] db lint 오류 없음 (migration 001~007)
- [x] pgTAP 25/25 PASS (rls_access_matrix.test.sql)
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
- staff 제한 view/RPC 구현 및 검증
- migration 008~00950 로컬 실행 (사용자 머신 필요)

## 다음 단계

사용자 머신에서 다음 명령을 실행하여 검증:

```bash
cd github-pages-version
supabase db reset --local
supabase db lint --local --level error --fail-on error
supabase test db --local
```

성공 조건:
1. migration 001~00950 전체 적용 성공
2. lint 오류 0
3. Files=3, Tests=99
4. All tests successful
5. Result: PASS
