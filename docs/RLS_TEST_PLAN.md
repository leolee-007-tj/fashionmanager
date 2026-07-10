# RLS 테스트 계획

> 본 문서는 2-3단계 RLS 테스트 시나리오를 문서화한다.
> 테스트 Supabase 프로젝트 전용. 운영 환경 실행 금지.

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

- store_a에 샘플 상품 5개
- store_a에 샘플 고객 3명
- store_a에 샘플 주문 5건
- store_b에 샘플 상품 3개

## 2. 테스트 시나리오

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

### 2.3 manager 권한

| 번호 | 시나리오 | 예상 결과 | 테스트 방법 |
|---|---|---|---|
| 16 | manager로 store 조회 | 성공 | Supabase JS client (manager token) |
| 17 | manager로 store update | 실패 (owner only) | Supabase JS client |
| 18 | manager로 product insert | 성공 | Supabase JS client |
| 19 | manager로 product update | 성공 | Supabase JS client |
| 20 | manager로 customer insert | 성공 | Supabase JS client |
| 21 | manager로 customer update | 성공 | Supabase JS client |
| 22 | manager로 order insert | 성공 | Supabase JS client |
| 23 | manager로 order update | 성공 | Supabase JS client |
| 24 | manager로 store_members role 변경 | 실패 (owner only) | Supabase JS client |
| 25 | manager로 store_settings 조회 | 실패 (owner only) | Supabase JS client |
| 26 | manager로 audit_logs 조회 | 실패 (owner only) | Supabase JS client |
| 27 | manager로 migration_runs 조회 | 실패 (owner only) | Supabase JS client |

### 2.4 staff 권한

| 번호 | 시나리오 | 예상 결과 | 테스트 방법 |
|---|---|---|---|
| 28 | staff로 store 조회 | 성공 | Supabase JS client (staff token) |
| 29 | staff로 product 조회 | 성공 | Supabase JS client |
| 30 | staff로 product insert | 실패 (owner/manager only) | Supabase JS client |
| 31 | staff로 product update | 실패 (owner/manager only) | Supabase JS client |
| 32 | staff로 customer 조회 | 성공 | Supabase JS client |
| 33 | staff로 customer update | 실패 (owner/manager only) | Supabase JS client |
| 34 | staff로 order 조회 | 성공 | Supabase JS client |
| 35 | staff로 order insert | 실패 (owner/manager only) | Supabase JS client |
| 36 | staff로 expenses 조회 | 실패 (owner/manager only) | Supabase JS client |
| 37 | staff로 store_settings 조회 | 실패 (owner only) | Supabase JS client |
| 38 | staff로 audit_logs 조회 | 실패 (owner only) | Supabase JS client |
| 39 | staff로 migration_runs 조회 | 실패 (owner only) | Supabase JS client |

### 2.5 Cross-store 공격

| 번호 | 시나리오 | 예상 결과 | 테스트 방법 |
|---|---|---|---|
| 40 | store_a owner로 store_b customer_id로 주문 생성 | 실패 (trigger 차단) | SQL Editor |
| 41 | store_a owner로 store_b product_id로 주문 생성 | 실패 (trigger 차단) | SQL Editor |
| 42 | store_a owner로 store_b product_id로 inventory_log 생성 | 실패 (trigger 차단) | SQL Editor |
| 43 | store_a owner로 store_b settings 조회 | 실패 (RLS 차단) | Supabase JS client |

### 2.6 Privilege Escalation

| 번호 | 시나리오 | 예상 결과 | 테스트 방법 |
|---|---|---|---|
| 44 | manager가 자기 role을 owner로 변경 | 실패 (RLS 차단) | SQL Editor |
| 45 | staff가 자기 role을 manager로 변경 | 실패 (RLS 차단) | SQL Editor |
| 46 | 마지막 owner가 자신을 inactive로 변경 | 실패 (trigger 차단 / 보호 필요) | SQL Editor |

### 2.7 데이터 삭제

| 번호 | 시나리오 | 예상 결과 | 테스트 방법 |
|---|---|---|---|
| 47 | owner로 product 물리 DELETE | 실패 (권한 없음) | Supabase JS client |
| 48 | owner로 customer 물리 DELETE | 실패 (권한 없음) | Supabase JS client |
| 49 | owner로 product soft delete (deleted_at 설정) | 성공 | Supabase JS client |
| 50 | owner로 customer soft delete | 성공 | Supabase JS client |

### 2.8 Append-only 테이블

| 번호 | 시나리오 | 예상 결과 | 테스트 방법 |
|---|---|---|---|
| 51 | owner로 inventory_logs 직접 insert | 실패 (RLS 차단) | Supabase JS client |
| 52 | owner로 inventory_logs update | 실패 (RLS 차단) | Supabase JS client |
| 53 | owner로 inventory_logs DELETE | 실패 (권한 없음) | Supabase JS client |
| 54 | owner로 audit_logs 직접 insert | 실패 (RLS 차단) | Supabase JS client |

### 2.9 비활성 멤버

| 번호 | 시나리오 | 예상 결과 | 테스트 방법 |
|---|---|---|---|
| 55 | inactive member로 store 조회 | 실패 (is_store_member에서 차단) | Supabase JS client |
| 56 | inactive member로 product 조회 | 실패 | Supabase JS client |

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
| 1 | 0건 | 0건 | ✅ | - |
| 2 | 0건 | 0건 | ✅ | - |
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

## 9. 테스트 완료 후 정리

- 테스트 Supabase 프로젝트 삭제
- 테스트 데이터 삭제
- 테스트 사용자 삭제
- 테스트 결과 문서 저장