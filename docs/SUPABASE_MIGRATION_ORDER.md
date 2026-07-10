# Supabase Migration 실행 순서

> 본 문서는 SQL 파일 실행 순서와 주의사항을 정리한다.
> 실제 Supabase에는 아직 실행하지 않았다.

## 실행 순서

| 순서 | 파일 | 목적 | 선행 조건 | 실제 실행 |
|---|---|---|---|---|
| 1 | `001_extensions_and_types.sql` | pgcrypto 확장, 5개 enum 타입 생성 | 없음 | ❌ 미실행 |
| 2 | `002_initial_schema.sql` | 12개 테이블 생성 | 001 (enum 필요) | ❌ 미실행 |
| 3 | `003_constraints_and_indexes.sql` | CHECK 31개, UNIQUE 5개, partial unique 6개, 인덱스 48개 | 002 (테이블 필요) | ❌ 미실행 |
| 4 | `004_triggers.sql` | updated_at/version trigger 3종 분리, audit metadata 보호, cross-store 검증, 마지막 owner 보호 | 002 (테이블 필요) | ❌ 미실행 |
| 5 | `005_private_helpers.sql` | private schema, RLS helper 함수, 권한 설정 | 002 (테이블 참조) | ❌ 미실행 |
| 6 | `006_rls_policies.sql` | RLS 활성화, 정책 생성, GRANT/REVOKE | 005 (helper 함수 필요) | ❌ 미실행 |
| 7 | `007_audit_functions.sql` | audit trigger 함수, 마스킹, 권한 설정 | 002, 005 (테이블/권한) | ❌ 미실행 |
| 8 | `supabase/tests/rls_access_matrix.sql` | RLS 테스트 | 001~007 전체 | ❌ 미실행 |

## 상세 설명

### 1. 001_extensions_and_types.sql

**목적**: PostgreSQL 확장과 사용자 정의 enum 타입을 생성한다.

**내용**:
- `pgcrypto` 확장 (UUID 생성)
- `member_role` (owner, manager, staff)
- `order_status` (PENDING, SHIPPED, COMPLETED, CANCELLED)
- `inventory_change_type` (INITIAL, RESERVE, RELEASE, SHIP, RETURN, ADJUSTMENT, MIGRATION)
- `migration_status` (PENDING, RUNNING, COMPLETED, PARTIAL, FAILED, CANCELLED)
- `audit_action` (INSERT, UPDATE, SOFT_DELETE, RESTORE, MIGRATE, IMPORT)

**선행 조건**: 없음. 가장 먼저 실행한다.

**실패 시**: 후속 모든 파일이 enum 참조 오류로 실패한다.

**롤백**: `DROP TYPE`으로 enum을 제거할 수 있다. 단, 이미 참조 중인 테이블이 있으면 불가능하다.

---

### 2. 002_initial_schema.sql

**목적**: 12개 업무 테이블을 생성한다.

**내용**:
- profiles, stores, store_members, products, customers, orders, inventory_logs, expenses, classification_keywords, store_settings, audit_logs, migration_runs

**선행 조건**: 001 (enum 타입이 테이블 정의에서 사용됨)

**실패 시**: 003~007은 참조 대상 테이블이 없어 실패한다.

**롤백**: `DROP TABLE` 순서는 외래키 의존성을 고려해야 한다. inventory_logs → orders → customers/products → store_members → stores 순으로 제거 권장.

---

### 3. 003_constraints_and_indexes.sql

**목적**: CHECK 제약조건, UNIQUE 제약조건, partial unique index, 일반 인덱스를 생성한다.

**내용**:
- 31개 CHECK 제약조건
- 5개 UNIQUE 제약조건
- 6개 partial unique index
- 48개 일반 인덱스

**선행 조건**: 002 (테이블이 존재해야 함)

**실패 시**: 성능 저하. 제약조건 누락 시 데이터 무결성 문제 발생 가능.

**롤백**: `ALTER TABLE ... DROP CONSTRAINT`, `DROP INDEX`로 개별 제거 가능.

---

### 4. 004_triggers.sql

**목적**: updated_at/version 자동 갱신 trigger와 cross-store 검증 trigger를 생성한다.

**내용**:
- `handle_profile_update()`: profiles (store_id/version 없음)
- `handle_store_data_update()`: store_id + version 테이블 8개
- `handle_store_member_update()`: store_members (store_id만, version 없음)
- `handle_audit_metadata()`: created_by/updated_by 보호 (7개 테이블)
- `validate_order_store_consistency()`: orders cross-store + soft-deleted 차단
- `validate_inventory_log_store_consistency()`: inventory_logs cross-store + soft-deleted 차단
- `prevent_last_owner_removal()`: 마지막 owner 보호

**선행 조건**: 002 (테이블 필요)

**실패 시**: 데이터 업데이트 시 timestamp/version 관리 누락, cross-store 데이터 오염 가능.

**롤백**: `DROP TRIGGER`, `DROP FUNCTION`으로 제거 가능.

---

### 5. 005_private_helpers.sql

**목적**: private schema와 RLS helper 함수를 생성한다.

**내용**:
- `private.is_store_member()`: active membership 확인
- `private.current_store_role()`: 역할 반환
- `private.has_store_role()`: 역할 집합 확인
- 권한 설정 (REVOKE/GRANT)

**선행 조건**: 002 (store_members 테이블 참조)

**실패 시**: 006의 RLS 정책이 함수 없이 실패한다.

**롤백**: `DROP FUNCTION`, `DROP SCHEMA`로 제거 가능.

---

### 6. 006_rls_policies.sql

**목적**: 모든 업무 테이블에 RLS를 활성화하고 정책을 생성한다.

**내용**:
- 12개 테이블 RLS 활성화
- 36개 정책 (soft-delete SELECT 이중화, staff base table 차단 반영)
- GRANT/REVOKE 설정

**선행 조건**: 005 (helper 함수 필요)

**실패 시**: 데이터 접근 제어 누락.

**롤백**: `DROP POLICY`, `ALTER TABLE ... DISABLE ROW LEVEL SECURITY`로 제거 가능.

**주의**: 정책 생성은 `CREATE POLICY`이며, PostgreSQL은 `CREATE POLICY IF NOT EXISTS`를 지원하지 않는다. 동일 이름의 정책이 이미 존재하면 42710 오류가 발생한다. 재실행 시 DROP POLICY IF EXISTS로 선행 제거가 필요하다.

---

### 7. 007_audit_functions.sql

**목적**: 감사 로그 trigger 함수를 생성하고 적용한다.

**내용**:
- `private.mask_sensitive_data()`: 민감 필드 마스킹
- `private.determine_audit_action()`: 액션 유형 판별
- `public.log_audit()`: 메인 audit 함수
- 8개 테이블에 audit trigger 적용

**선행 조건**: 002, 005 (테이블 존재, 권한 설정)

**실패 시**: 데이터 변경 이력 추적 누락.

**롤백**: `DROP TRIGGER`, `DROP FUNCTION`으로 제거 가능.

---

### 8. supabase/tests/rls_access_matrix.sql

**목적**: RLS 정책을 테스트한다.

**내용**:
- 30개 SQL 테스트 시나리오 (미실행)
- auth.uid() 오버라이드 없음
- 주석으로만 작성된 예상 결과 문서

**선행 조건**: 001~007 전체

**실패 시**: 테스트 실패만 발생. 프로덕션 데이터에는 영향 없음.

**주의**:
- ⚠️ **운영 환경에서 실행 금지**
- ⚠️ 본 파일은 시나리오 문서일 뿐, 실제 실행된 테스트가 아님
- ⚠️ Supabase JS client 또는 SQL Editor에서 별도로 실행 필요

---

## Supabase CLI 실행 방법 (참고)

```bash
# Supabase 프로젝트 초기화 후
supabase db reset

# 또는 개별 파일 실행 (SQL Editor에서)
# 001 ~ 007 순서대로 붙여넣기
```

**실제 실행은 다음 단계에서 수행한다.**

---

## 관련 문서

- 스키마: [SUPABASE_SCHEMA.md](./SUPABASE_SCHEMA.md)
- RLS: [SUPABASE_RLS_DESIGN.md](./SUPABASE_RLS_DESIGN.md)
- 테스트 계획: [RLS_TEST_PLAN.md](./RLS_TEST_PLAN.md)