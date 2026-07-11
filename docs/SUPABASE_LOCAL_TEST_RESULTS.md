# Supabase Local Test Results

## 환경 정보

| 항목 | 값 |
|---|---|
| 실행 날짜 | 2026-07-11 |
| OS | macOS Intel x86_64 |
| Docker Desktop | 설치 및 실행 성공 |
| Supabase CLI 버전 | v2.109.1 |
| supabase init 결과 | 성공 (config.toml 생성됨) |
| migration 파일명 | timestamp 형식 (`20260711000100_`~`20260711000700_`) |
| 로컬 Supabase 실행 여부 | **성공** |

## 실행 상태

✅ **로컬 Supabase DB와 pgTAP 테스트가 모두 성공했습니다.**

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

파일명은 Supabase CLI 표준 timestamp 형식(`YYYYMMDDHHMMSS_`)을 사용합니다.
`supabase db reset --local`으로 7개 migration 전체 적용이 확인되었습니다.

## db lint 결과

- 실행 명령: `supabase db lint --local`
- 검사 대상: extensions, private, public 스키마
- 결과: **오류 없음**

## pgTAP 테스트 결과

- 실행 명령: `supabase test db --local`
- 테스트 파일: `supabase/tests/rls_access_matrix.test.sql`
- 설명용 시나리오 문서: `docs/RLS_ACCESS_MATRIX_SCENARIOS.sql`

| 항목 | 값 |
|---|---|
| Files | 1 |
| Tests | 25 |
| Result | **PASS** |
| All tests successful | Yes |

### 테스트 상세

| # | 테스트 | 결과 | 비고 |
|---|---|---|---|
| T1 | Owner 자기 store 조회 | PASS | is |
| T2 | Owner 타 store 조회 차단 | PASS | is (0건) |
| T3 | Manager product insert 가능 | PASS | lives_ok |
| T4 | Staff products base table 0건 | PASS | is (0건) |
| T5a | Manager store_members UPDATE 완료 | PASS | lives_ok (0행, RLS 차단) |
| T5b | Staff role 유지 확인 | PASS | is |
| T6 | Cross-store customer 주문 실패 | PASS | throws_ok P0001 |
| T7 | Cross-store product 주문 실패 | PASS | throws_ok P0001 |
| T8 | Cross-store inventory_log 실패 | PASS | throws_ok P0001 |
| T9 | Soft-deleted product 신규 주문 실패 | PASS | throws_ok P0001 |
| T10 | 과거 주문 notes 수정 성공 | PASS | lives_ok |
| T11 | 과거 주문 product_id → deleted product 변경 실패 | PASS | throws_ok P0001 |
| T12 | 과거 주문 product_id → active product 변경 성공 | PASS | lives_ok |
| T13 | 마지막 owner 비활성화 실패 | PASS | throws_ok P0001 |
| T14 | 마지막 owner role 변경 실패 | PASS | throws_ok P0001 |
| T15 | store_members user_id 변경 실패 | PASS | throws_ok P0001 |
| T16 | Product created_by = auth.uid() | PASS | is |
| T17 | Migration_runs insert 성공 | PASS | lives_ok |
| T18 | Migration_runs initiated_by 검증 | PASS | is |
| T19 | Migration_runs update 성공 | PASS | lives_ok |
| T20 | Migration_runs version 증가 | PASS | is (version=2) |
| T21 | Stores update 성공 | PASS | lives_ok |
| T22 | Physical DELETE 차단 | PASS | throws_ok SQLSTATE 42501 (permission denied) |
| T23 | Owner deleted product 조회 가능 | PASS | is (2건) |
| T24 | Manager deleted product 조회 불가 | PASS | is (0건) |

### Assertion 분류

| 종류 | 수량 |
|---|---|
| lives_ok | 7 |
| throws_ok | 9 |
| is | 9 |
| **총계** | **25** |

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
- [x] db lint 오류 없음
- [x] pgTAP 25/25 PASS

## 아직 검증되지 않은 항목

- 원격 Supabase 클라우드 환경에서의 migration 적용
- JS client (@supabase/supabase-js) 통합 테스트
- REST API / PostgREST 동작 검증
- 실제 Auth 로그인 사용자 기반 테스트
- Storage, Edge Functions, Realtime 등 부가 서비스
- 대량 데이터 성능 테스트
- 동시성/race condition 통합 테스트
- staff 제한 view/RPC 구현 및 검증
- 주문/재고 관리 보호된 RPC 구현 및 검증
- 초기 store/owner 생성 흐름 검증

## 다음 단계

Phase 3 (로그인·프런트엔드 구현) 진행 전 다음을 고려:
1. staff 업무용 제한 view 또는 보안 RPC 구현
2. 주문 생성·상태 변경·재고 관리 보호된 RPC 구현
3. 초기 store 생성 및 owner onboarding 흐름 설계
4. JS client 통합 테스트 추가
