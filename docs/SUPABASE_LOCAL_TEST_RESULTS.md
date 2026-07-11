# Supabase Local Test Results

## 환경 정보

| 항목 | 값 |
|---|---|
| 실행 날짜 | 2026-07-11 |
| OS | macOS |
| Docker 버전 | 미설치 (Docker Desktop 설치 권한 없음) |
| Supabase CLI 버전 | v2.109.1 (직접 다운로드, HOME=/tmp/supa_home 우회) |
| supabase init 결과 | 성공 (config.toml 생성됨) |
| migration 파일명 인식 | timestamp 형식으로 변경 완료 (`20260711000100_`~`20260711000700_`) |
| 로컬 Supabase 실행 여부 | **미실행** (Docker 없음) |

## 실행 상태

⚠️ **Docker Desktop이 설치되어 있지 않아 로컬 Supabase DB와 테스트를 실행하지 못했습니다.**

Supabase CLI는 다운로드되어 `supabase init`은 성공했지만, `supabase start`에 Docker가 필요합니다.
migration 파일명은 Supabase CLI 표준 timestamp 형식으로 변경되었습니다.

## 코드 수정 내용

### 1. pgTAP 테스트 파일 (`supabase/tests/rls_access_matrix.test.sql`)

다음 사항을 수정했습니다:

| 항목 | 수정 전 | 수정 후 |
|---|---|---|
| setup 역할 | `SET ROLE authenticated` 먼저 호출 | 관리자 역할 유지 + JWT claim만 설정 |
| auth.users fixture | `encrypted_password`, `email_confirmed_at` 등 포함 | `id, email` 최소 필드만 |
| auth.users 실패 처리 | `EXCEPTION WHEN`으로 무시 | 실패 시 테스트 실패 (예외 전파) |
| inventory enum | `RESTOCK` (없는 값) | `ADJUSTMENT` (실제 enum 값) |
| throws_ok | 메시지만 검증 | SQLSTATE `P0001` + 정확한 메시지 검증 |
| cleanup PERFORM | `PERFORM set_config(...)` | `SELECT set_config(...)` |
| helper 함수 schema | `set_request_user` | `public.set_request_user` |
| plan 수 | 25 | 25 (lives_ok 7 + throws_ok 9 + is 9) |

### 2. migration trigger 수정

`004_triggers.sql`의 `handle_migration_run_metadata()`에 다음 추가 (2-6단계에서 이미 완료):

- UPDATE 시 `updated_at = now()`
- UPDATE 시 `version = OLD.version + 1`
- id, store_id, created_at, initiated_by 변경 차단

## Migration 파일

| 파일명 | 상태 |
|---|---|
| `20260711000100_extensions_and_types.sql` | 작성 완료 |
| `20260711000200_initial_schema.sql` | 작성 완료 |
| `20260711000300_constraints_and_indexes.sql` | 작성 완료 |
| `20260711000400_triggers.sql` | 작성 완료 |
| `20260711000500_private_helpers.sql` | 작성 완료 |
| `20260711000600_rls_policies.sql` | 작성 완료 |
| `20260711000700_audit_functions.sql` | 작성 완료 |

파일명은 Supabase CLI 표준 timestamp 형식(`YYYYMMDDHHMMSS_`)을 사용합니다.
`supabase migration new test_format`으로 생성된 파일명(`20260711030012_test_format.sql`)과 동일한 패턴입니다.
**실제 Supabase start 후 migration 적용 여부는 미확인입니다.**

## 테스트 계획

Supabase CLI와 Docker 설치 후 다음 순서로 실행:

```bash
# 1. 초기화 (config.toml 생성)
supabase init

# 2. 로컬 Supabase 시작
supabase start

# 3. migration 인식 확인
supabase migration list --local

# 4. 전체 migration 적용
supabase db reset

# 5. lint 검사
supabase db lint

# 6. pgTAP 테스트 실행
supabase test db supabase/tests/rls_access_matrix.test.sql
```

## pgTAP 테스트 개요

| 항목 | 수량 |
|---|---|
| plan 수 | 25 |
| lives_ok | 7 |
| throws_ok | 9 |
| is | 9 |
| 테스트 파일 | `supabase/tests/rls_access_matrix.test.sql` |
| 실행 여부 | **미실행** |
| 통과 | N/A |
| 실패 | N/A |

## 테스트 범위

1. Owner 자기 store 조회
2. Owner 타 store 조회 차단
3. Manager product insert 가능
4. Staff products base table 0건
5. Manager store_members update 차단 (0행)
6. Cross-store customer 주문 실패
7. Cross-store product 주문 실패
8. Cross-store inventory_log 실패
9. Soft-deleted product 신규 주문 실패
10. 과거 주문 notes 수정 성공
11. 과거 주문 product_id → deleted product 변경 실패
12. 과거 주문 product_id → active product 변경 성공
13. 마지막 owner 비활성화 실패
14. 마지막 owner role 변경 실패
15. store_members user_id 변경 실패
16. Product created_by = auth.uid() 검증
17. Migration_runs insert 성공
18. Migration_runs initiated_by 검증
19. Migration_runs update 성공
20. Migration_runs version 증가 검증
21. Stores update 성공
22. Physical DELETE 차단
23. Owner deleted product 조회 가능
24. Manager deleted product 조회 불가

## 보안 확인

- [x] 원격 Supabase 미연결
- [x] 실제 운영 데이터 미사용
- [x] `supabase login` / `supabase link` 미실행
- [x] service_role key / JWT 미기록
- [x] 앱 HTML/CSS/JS 미변경
- [x] `auth.uid()` 재정의 없음
- [x] psql `\set` 문법 없음
- [x] config.toml에 실제 secret 없음 (모두 env 참조 또는 빈 값)
- [x] migration 파일명 Supabase CLI 표준 timestamp 형식
- [ ] 실제 테스트 통과 여부 (미실행, Docker 필요)

## 다음 단계

Supabase CLI와 Docker 설치 후 테스트 실행이 필요합니다.
