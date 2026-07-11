# RLS 테스트 계획

> 본 문서는 2-5단계 보안·무결성 보완을 반영한 RLS 테스트 시나리오이다.
> 테스트 Supabase 프로젝트 전용. 운영 환경 실행 금지.
> **모든 시나리오는 미실행 상태이다.**

## 1. 테스트 환경 설정

### 1.1 테스트 Supabase 프로젝트

- 별도의 테스트 Supabase 프로젝트 생성
- 모든 migration 실행 (001 ~ 007)
- 테스트용 auth.users 데이터 생성

### 1.2 테스트 사용자

| 사용자 | UUID | 역할 |
|---|---|---|
| test_owner | `00000000-0000-0000-0000-000000000001` | store_a owner |
| test_manager | `00000000-0000-0000-0000-000000000002` | store_a manager |
| test_staff | `00000000-0000-0000-0000-000000000003` | store_a staff |
| test_other | `00000000-0000-0000-0000-000000000004` | store_b owner (store_a 멤버 아님) |

### 1.3 테스트 매장

| 매장 | UUID |
|---|---|
| store_a | `11111111-1111-1111-1111-111111111111` |
| store_b | `22222222-2222-2222-2222-222222222222` |

### 1.4 테스트 데이터

- store_a에 샘플 상품 5개 (1개는 soft-deleted)
- store_a에 샘플 고객 3명 (1명은 soft-deleted)
- store_a에 샘플 주문 5건 (1건은 soft-deleted)
- store_b에 샘플 상품 3개

## 2. 테스트 시나리오

### 2.0 테스트 실행 방식

권장 순서 (신뢰도 높음 → 낮음):

1. **Supabase CLI + pgTAP** (가장 신뢰)
   - 로컬 Supabase에서 `supabase test db`로 실행
   - `set local role authenticated` + `request.jwt.claim.sub` 설정
   - 파일: `supabase/tests/rls_access_matrix.test.sql`
   
2. **Supabase JS client** (중간 신뢰)
   - 실제 테스트 사용자 회원가입/로그인
   - 각 사용자의 access token으로 supabase-js client 생성
   - 실제 네트워크 요청으로 RLS 검증

3. **curl/Postman** (중간 신뢰)
   - publishable key + Authorization Bearer JWT
   - REST API 직접 호출

4. **SQL Editor** (가장 낮은 신뢰)
   - ⚠️ SQL Editor는 일반적으로 elevated role (postgres/supabase_admin)으로 실행되므로
     RLS를 우회할 수 있음
   - RLS 검증 목적으로 사용하지 말 것
   - 관리자 DDL 실행 용도로만 사용
   - RLS 테스트는 반드시 `set local role authenticated;` + JWT claim 설정 후 실행

### 2.1 인증 안 됨 / anon

| 번호 | 시나리오 | 예상 결과 | 테스트 방법 |
|---|---|---|---|
| 1 | anon으로 products 조회 | 0건 반환 | Supabase JS client (no auth) |
| 2 | anon으로 customers 조회 | 0건 반환 | Supabase JS client (no auth) |
| 3 | auth.uid() = null로 products 조회 | 0건 반환 | SQL Editor (set config) |

### 2.2 owner 권한

| 번호 | 시나리오 | 예상 결과 | 테스트 방법 |
|---|---|---|---|
| 4 | owner로 본인 store 조회 | 1건 반환 | Supabase JS client (owner token) |
| 5 | owner로 다른 store 조회 | 0건 반환 | Supabase JS client (owner token) |
| 6 | owner로 product insert | 성공 | Supabase JS client |
| 7 | owner로 customer insert | 성공 | Supabase JS client |
| 8 | owner로 order insert | 성공 | Supabase JS client |
| 9 | owner로 store_members insert (새 member 추가) | 성공 | Supabase JS client |
| 10 | owner로 store_members role 변경 | 성공 | Supabase JS client |
| 11 | owner로 store_settings 조회 | 성공 | Supabase JS client |
| 12 | owner로 store_settings update | 성공 | Supabase JS client |
| 13 | owner로 audit_logs 조회 | 성공 | Supabase JS client |
| 14 | owner로 migration_runs 조회 | 성공 | Supabase JS client |
| 15 | owner로 migration_runs insert | 성공 | Supabase JS client |
| 16 | owner로 soft-deleted product 조회 | >= 1건 | Supabase JS client |
| 17 | owner로 soft-deleted customer 조회 | >= 1건 | Supabase JS client |
| 18 | owner로 soft-deleted order 조회 | >= 1건 | Supabase JS client |

### 2.3 manager 권한

| 번호 | 시나리오 | 예상 결과 | 테스트 방법 |
|---|---|---|---|
| 19 | manager로 store 조회 | 성공 | Supabase JS client (manager token) |
| 20 | manager로 store update | 실패 (owner only) | Supabase JS client |
| 21 | manager로 product insert | 성공 | Supabase JS client |
| 22 | manager로 product update | 성공 | Supabase JS client |
| 23 | manager로 customer insert | 성공 | Supabase JS client |
| 24 | manager로 customer update | 성공 | Supabase JS client |
| 25 | manager로 order insert | 성공 | Supabase JS client |
| 26 | manager로 order update | 성공 | Supabase JS client |
| 27 | manager로 store_members role 변경 | 실패 (owner only) | Supabase JS client |
| 28 | manager로 store_settings 조회 | 실패 (owner only) | Supabase JS client |
| 29 | manager로 audit_logs 조회 | 실패 (owner only) | Supabase JS client |
| 30 | manager로 migration_runs 조회 | 실패 (owner only) | Supabase JS client |
| 31 | manager로 soft-deleted product 조회 | 0건 | Supabase JS client |
| 32 | manager로 soft-deleted customer 조회 | 0건 | Supabase JS client |
| 33 | manager로 soft-deleted order 조회 | 0건 | Supabase JS client |

### 2.4 staff 권한

| 번호 | 시나리오 | 예상 결과 | 테스트 방법 |
|---|---|---|---|
| 34 | staff로 store 조회 | 성공 | Supabase JS client (staff token) |
| 35 | staff로 product 조회 | 실패 (0건) | Supabase JS client |
| 36 | staff로 product insert | 실패 (owner/manager only) | Supabase JS client |
| 37 | staff로 product update | 실패 (owner/manager only) | Supabase JS client |
| 38 | staff로 customer 조회 | 실패 (0건) | Supabase JS client |
| 39 | staff로 customer update | 실패 (owner/manager only) | Supabase JS client |
| 40 | staff로 order 조회 | 실패 (0건) | Supabase JS client |
| 41 | staff로 order insert | 실패 (owner/manager only) | Supabase JS client |
| 42 | staff로 expenses 조회 | 실패 (owner/manager only) | Supabase JS client |
| 43 | staff로 store_settings 조회 | 실패 (owner only) | Supabase JS client |
| 44 | staff로 audit_logs 조회 | 실패 (owner only) | Supabase JS client |
| 45 | staff로 migration_runs 조회 | 실패 (owner only) | Supabase JS client |
| 46 | staff로 classification_keywords 조회 | 성공 (active only) | Supabase JS client |

### 2.5 Cross-store 공격

| 번호 | 시나리오 | 예상 결과 | 테스트 방법 |
|---|---|---|---|
| 47 | store_a owner로 store_b customer_id로 주문 생성 | 실패 (trigger 차단) | SQL Editor |
| 48 | store_a owner로 store_b product_id로 주문 생성 | 실패 (trigger 차단) | SQL Editor |
| 49 | store_a owner로 store_b product_id로 inventory_log 생성 | 실패 (trigger 차단) | SQL Editor |
| 50 | store_a owner로 store_b settings 조회 | 실패 (RLS 차단) | Supabase JS client |

### 2.6 Soft-deleted entity 연결 차단

| 번호 | 시나리오 | 예상 결과 | 테스트 방법 |
|---|---|---|---|
| 51 | store_a owner로 soft-deleted customer_id로 주문 생성 | 실패 (trigger 차단) | SQL Editor |
| 52 | store_a owner로 soft-deleted product_id로 주문 생성 | 실패 (trigger 차단) | SQL Editor |
| 53 | store_a owner로 soft-deleted product_id로 inventory_log 생성 | 실패 (trigger 차단) | SQL Editor |
| 54 | 과거 주문의 customer_id를 그대로 유지한 채 다른 필드 수정 | 성공 | SQL Editor |

### 2.7 Privilege Escalation

| 번호 | 시나리오 | 예상 결과 | 테스트 방법 |
|---|---|---|---|
| 55 | manager가 자기 role을 owner로 변경 | 실패 (RLS 차단) | SQL Editor |
| 56 | staff가 자기 role을 manager로 변경 | 실패 (RLS 차단) | SQL Editor |
| 57 | 마지막 owner가 자신을 inactive로 변경 | 실패 (trigger 차단) | SQL Editor |
| 58 | 마지막 owner가 자신의 role을 manager로 변경 | 실패 (trigger 차단) | SQL Editor |

### 2.8 데이터 작성자 메타데이터 보호

| 번호 | 시나리오 | 예상 결과 | 테스트 방법 |
|---|---|---|---|
| 59 | INSERT 시 created_by를 임의 UUID로 설정 | 무시되고 auth.uid()로 덮어씀 | SQL Editor |
| 60 | UPDATE 시 created_by를 다른 UUID로 변경 | 실패 (trigger 차단) | SQL Editor |
| 61 | UPDATE 시 updated_by가 auth.uid()로 자동 설정 | 성공 | SQL Editor |

### 2.9 데이터 삭제

| 번호 | 시나리오 | 예상 결과 | 테스트 방법 |
|---|---|---|---|
| 62 | owner로 product 물리 DELETE | 실패 (권한 없음) | Supabase JS client |
| 63 | owner로 customer 물리 DELETE | 실패 (권한 없음) | Supabase JS client |
| 64 | owner로 product soft delete (deleted_at 설정) | 성공 | Supabase JS client |
| 65 | owner로 customer soft delete | 성공 | Supabase JS client |
| 66 | owner로 soft-deleted product 복구 (deleted_at = NULL) | 성공 | Supabase JS client |

### 2.10 Append-only 테이블

| 번호 | 시나리오 | 예상 결과 | 테스트 방법 |
|---|---|---|---|
| 67 | owner로 inventory_logs 직접 insert | 실패 (RLS 차단) | Supabase JS client |
| 68 | owner로 inventory_logs update | 실패 (RLS 차단) | Supabase JS client |
| 69 | owner로 inventory_logs DELETE | 실패 (권한 없음) | Supabase JS client |
| 70 | owner로 audit_logs 직접 insert | 실패 (RLS 차단) | Supabase JS client |

### 2.11 비활성 멤버

| 번호 | 시나리오 | 예상 결과 | 테스트 방법 |
|---|---|---|---|
| 71 | inactive member로 store 조회 | 실패 (is_store_member에서 차단) | Supabase JS client |
| 72 | inactive member로 product 조회 | 실패 | Supabase JS client |

## 3. REST API 테스트

### 3.1 테스트 도구

- curl
- Postman
- Supabase JS client

### 3.2 테스트 요청

```bash
# anon 요청 (no Authorization header)
curl "https://<project_id>.supabase.co/rest/v1/products"

# authenticated 요청
curl -H "Authorization: Bearer <jwt_token>" \
     -H "apikey: <anon_key>" \
     "https://<project_id>.supabase.co/rest/v1/products"

# INSERT 요청
curl -X POST -H "Authorization: Bearer <jwt_token>" \
     -H "apikey: <anon_key>" \
     -H "Content-Type: application/json" \
     -d '{"store_id": "...", "product_code": "TEST", ...}' \
     "https://<project_id>.supabase.co/rest/v1/products"
```

### 3.3 테스트 결과 확인

| HTTP 상태 | 의미 |
|---|---|
| 200 | 성공 |
| 201 | INSERT 성공 |
| 401 | 인증 실패 (no token) |
| 403 | 권한 없음 (RLS 차단) |
| 400 | 요청 파라미터 오류 |
| 404 | 리소스 없음 |

## 4. Publishable Key 테스트

publishable key (anon key)로 API 호출 시:
- anon 정책이 없으므로 모든 업무 데이터 조회 실패
- 인증 필요한 endpoint는 401 반환

## 5. Service Role 미사용 확인

- 클라이언트 코드에 service_role key가 포함되지 않는지 확인
- 모든 API 호출에 anon key + JWT token만 사용
- service_role는 관리 작업(SQL Editor, CLI)에서만 사용

## 6. 테스트 실행 순서

1. 테스트 Supabase 프로젝트 생성
2. migration 실행 (001 ~ 007)
3. 테스트 사용자 생성 (auth.users)
4. 테스트 매장 생성 (stores)
5. 테스트 멤버십 생성 (store_members)
6. 테스트 데이터 생성 (products, customers, orders)
7. 각 시나리오 테스트 실행
8. 결과 기록 및 검증

## 7. 테스트 결과 기록

테스트 실행 후 다음을 기록:

| 시나리오 | 실제 결과 | 예상 결과 | 일치 여부 | 비고 |
|---|---|---|---|---|
| 1 | - | 0건 | - | 미실행 |
| 2 | - | 0건 | - | 미실행 |
| ... | ... | ... | ... | ... |

## 8. 실패 시 처리

RLS 정책 실패 시 다음을 확인:

1. **auth.uid() 값**: 테스트 사용자의 JWT token이 올바른지
2. **store_members 데이터**: 테스트 사용자가 올바른 store에 등록되었는지
3. **is_active 상태**: store_members.is_active = true인지
4. **RLS 정책**: CREATE POLICY 문이 올바르게 실행되었는지
5. **GRANT/REVOKE**: authenticated에 적절한 권한이 부여되었는지
6. **helper 함수**: private.is_store_member 등 함수가 정상 동작하는지
7. **SECURITY DEFINER**: helper 함수가 RLS를 bypass하는지
8. **soft delete 필터**: deleted_at IS NULL 조건이 예상대로 작동하는지

## 9. 테스트 완료 후 정리

- 테스트 Supabase 프로젝트 삭제
- 테스트 데이터 삭제
- 테스트 사용자 삭제
- 테스트 결과 문서 저장

## 10. 실행 상태

| 항목 | 수량 |
|---|---|
| 문서화된 시나리오 총계 | 72개 |
| pgTAP assertion (rls_access_matrix.test.sql) | 25개 |
| 실제 실행된 시나리오 | 0개 (미실행) |
| 통과 | N/A |
| 실패 | N/A |

**본 문서의 모든 시나리오와 pgTAP 테스트는 실제 Supabase 테스트 프로젝트에서 실행되지 않았다.**

### 10.1 pgTAP 테스트 파일 구조

- 파일: `supabase/tests/rls_access_matrix.test.sql`
- plan(25): 25개 assertion (lives_ok 7 + throws_ok 9 + is 9)
- BEGIN/ROLLBACK으로 트랜잭션 격리
- `public.set_request_user(uuid)` 헬퍼 함수로 `SET LOCAL ROLE authenticated` + `request.jwt.claim.sub` 설정
- auth.uid() 재정의 없음
- psql \set 없음
- setup: 관리자 역할 유지 + JWT claim만 설정 (SET ROLE authenticated 없이)
- store A 데이터: owner claim으로 생성
- store B 데이터: other owner claim으로 생성
- setup 완료 후 claim 초기화
- inventory enum: `ADJUSTMENT` (실제 enum 값 사용)
- throws_ok: SQLSTATE `P0001` + 정확한 오류 메시지로 검증
- historical order setup 순서: active product 생성 → order 생성 → product soft delete → notes 수정
- cross-store 테스트: store B UUID 명시적 사용 (product: 55555555-5555-5555-5555-555555555555, customer: 66666666-6666-6666-6666-666666666666)
- manager store_members UPDATE: lives_ok (0 rows) + is (role unchanged) 방식
- cleanup: RESET ROLE + SELECT set_config (JWT claim 초기화) + DROP FUNCTION IF EXISTS public.set_request_user(uuid)
- auth.users fixture: id, email 최소 필드만, 실패 시 테스트 전체 실패 (예외 삼키지 않음)
- 미실행 상태: Supabase CLI + Docker 필요
