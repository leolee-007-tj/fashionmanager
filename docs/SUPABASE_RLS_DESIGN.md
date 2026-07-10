# Supabase RLS 설계 문서

> 본 문서는 2-5단계 보안·무결성 보완을 반영한 RLS 정책 설계이다.
> 개인정보는 포함하지 않는다.

## 1. 역할별 권한표

### 1.1 owner

| 테이블 | SELECT | INSERT | UPDATE | DELETE | 비고 |
|---|---|---|---|---|---|
| profiles | 본인만 | - | 본인만 | ❌ | - |
| stores | ✅ | ❌ | ✅ | ❌ | active + deleted 조회 가능 |
| store_members | ✅ | ✅ | ✅ | ❌ | 같은 store |
| products | ✅ | ✅ | ✅ | ❌ | active + deleted 조회 가능, soft delete |
| customers | ✅ | ✅ | ✅ | ❌ | active + deleted 조회 가능, soft delete |
| orders | ✅ | ✅ | ✅ | ❌ | active + deleted 조회 가능 |
| inventory_logs | ✅ | ❌ | ❌ | ❌ | append-only |
| expenses | ✅ | ✅ | ✅ | ❌ | active + deleted 조회 가능, soft delete |
| classification_keywords | ✅ | ✅ | ✅ | ❌ | active + deleted 조회 가능, soft delete |
| store_settings | ✅ | ✅ | ✅ | ❌ | 원가 공식 접근 |
| audit_logs | ✅ | ❌ | ❌ | ❌ | owner only |
| migration_runs | ✅ | ✅ | ✅ | ❌ | - |

### 1.2 manager

| 테이블 | SELECT | INSERT | UPDATE | DELETE | 비고 |
|---|---|---|---|---|---|
| profiles | 본인만 | - | 본인만 | ❌ | - |
| stores | ✅ | ❌ | ❌ | ❌ | active member |
| store_members | ✅ | ❌ | ❌ | ❌ | 조회만 |
| products | ✅ | ✅ | ✅ | ❌ | active only, soft delete |
| customers | ✅ | ✅ | ✅ | ❌ | active only, soft delete |
| orders | ✅ | ✅ | ✅ | ❌ | active only |
| inventory_logs | ✅ | ❌ | ❌ | ❌ | append-only |
| expenses | ✅ | ✅ | ✅ | ❌ | active only, soft delete |
| classification_keywords | ✅ | ✅ | ✅ | ❌ | active only |
| store_settings | ❌ | ❌ | ❌ | ❌ | 원가 공식 노출 위험 |
| audit_logs | ❌ | ❌ | ❌ | ❌ | 차단 |
| migration_runs | ❌ | ❌ | ❌ | ❌ | 차단 |

### 1.3 staff

| 테이블 | SELECT | INSERT | UPDATE | DELETE | 비고 |
|---|---|---|---|---|---|
| profiles | 본인만 | - | 본인만 | ❌ | - |
| stores | ✅ | ❌ | ❌ | ❌ | active member |
| store_members | ✅ | ❌ | ❌ | ❌ | 조회만 |
| products | ❌ | ❌ | ❌ | ❌ | base table 차단. 제한 view 미구현 |
| customers | ❌ | ❌ | ❌ | ❌ | base table 차단. 제한 view 미구현 |
| orders | ❌ | ❌ | ❌ | ❌ | base table 차단. 제한 view 미구현 |
| inventory_logs | ✅ | ❌ | ❌ | ❌ | append-only |
| expenses | ❌ | ❌ | ❌ | ❌ | 차단 |
| classification_keywords | ✅ | ❌ | ❌ | ❌ | active only, 읽기만 |
| store_settings | ❌ | ❌ | ❌ | ❌ | 차단 |
| audit_logs | ❌ | ❌ | ❌ | ❌ | 차단 |
| migration_runs | ❌ | ❌ | ❌ | ❌ | 차단 |

**staff 업무 미지원**: 2-5단계에서 staff의 products/customers/orders base table SELECT를 차단했다. 제한 view 또는 보호된 RPC가 구현되기 전까지 staff는 업무 데이터에 접근할 수 없다.

## 2. 테이블별 정책 상세

### 2.1 profiles

| 정책 | 대상 | USING | WITH CHECK |
|---|---|---|---|
| Profiles: users can view their own profile | SELECT | `auth.uid() = id` | - |
| Profiles: users can update their own profile | UPDATE | `auth.uid() = id` | `auth.uid() = id` |

**비고**: 다른 사용자의 display_name 조회는 store_members 테이블을 통해 가능. 별도 조회 정책은 필요 없음.

### 2.2 stores

| 정책 | 대상 | USING | WITH CHECK |
|---|---|---|---|
| Stores: active members can view active | SELECT | `private.is_store_member(id) AND deleted_at IS NULL` | - |
| Stores: owners can view deleted | SELECT | `private.has_store_role(id, ARRAY['owner'::member_role]) AND deleted_at IS NOT NULL` | - |
| Stores: owners can update | UPDATE | `private.has_store_role(id, ARRAY['owner'::member_role])` | `private.has_store_role(id, ARRAY['owner'::member_role])` |

**비고**: 클라이언트에서 임의 store 생성은 허용하지 않음. 초기 owner 생성은 관리자 작업.

### 2.3 store_members

| 정책 | 대상 | USING | WITH CHECK |
|---|---|---|---|
| StoreMembers: active members can view same store | SELECT | `private.is_store_member(store_id)` | - |
| StoreMembers: owners can insert | INSERT | - | `private.has_store_role(store_id, ARRAY['owner'::member_role])` |
| StoreMembers: owners can update | UPDATE | `private.has_store_role(store_id, ARRAY['owner'::member_role])` | `private.has_store_role(store_id, ARRAY['owner'::member_role])` |

**비고**:
- 자기 role을 owner로 변경 불가 (RLS + trigger 필요)
- 마지막 owner 제거 방지는 `prevent_last_owner_removal()` trigger로 구현 완료
- inactive membership은 `private.is_store_member`에서 `is_active = true`로 차단

### 2.4 products

| 정책 | 대상 | USING | WITH CHECK |
|---|---|---|---|
| Products: owner/manager can view active | SELECT | `private.has_store_role(store_id, ARRAY['owner'::member_role, 'manager'::member_role]) AND deleted_at IS NULL` | - |
| Products: owners can view deleted | SELECT | `private.has_store_role(store_id, ARRAY['owner'::member_role]) AND deleted_at IS NOT NULL` | - |
| Products: owner/manager can insert | INSERT | - | `private.has_store_role(store_id, ARRAY['owner'::member_role, 'manager'::member_role])` |
| Products: owner/manager can update | UPDATE | `private.has_store_role(store_id, ARRAY['owner'::member_role, 'manager'::member_role])` | `private.has_store_role(store_id, ARRAY['owner'::member_role, 'manager'::member_role])` |

**비고**: staff base table SELECT 차단. 향후 제한 view 구현 필요.

### 2.5 customers

| 정책 | 대상 | USING | WITH CHECK |
|---|---|---|---|
| Customers: owner/manager can view active | SELECT | `private.has_store_role(store_id, ARRAY['owner'::member_role, 'manager'::member_role]) AND deleted_at IS NULL` | - |
| Customers: owners can view deleted | SELECT | `private.has_store_role(store_id, ARRAY['owner'::member_role]) AND deleted_at IS NOT NULL` | - |
| Customers: owner/manager can insert | INSERT | - | `private.has_store_role(store_id, ARRAY['owner'::member_role, 'manager'::member_role])` |
| Customers: owner/manager can update | UPDATE | `private.has_store_role(store_id, ARRAY['owner'::member_role, 'manager'::member_role])` | `private.has_store_role(store_id, ARRAY['owner'::member_role, 'manager'::member_role])` |

**비고**: staff base table SELECT 차단. 향후 제한 view 구현 필요.

### 2.6 orders

| 정책 | 대상 | USING | WITH CHECK |
|---|---|---|---|
| Orders: owner/manager can view active | SELECT | `private.has_store_role(store_id, ARRAY['owner'::member_role, 'manager'::member_role]) AND deleted_at IS NULL` | - |
| Orders: owners can view deleted | SELECT | `private.has_store_role(store_id, ARRAY['owner'::member_role]) And deleted_at IS NOT NULL` | - |
| Orders: owner/manager can insert | INSERT | - | `private.has_store_role(store_id, ARRAY['owner'::member_role, 'manager'::member_role])` |
| Orders: owner/manager can update | UPDATE | `private.has_store_role(store_id, ARRAY['owner'::member_role, 'manager'::member_role])` | `private.has_store_role(store_id, ARRAY['owner'::member_role, 'manager'::member_role])` |

**비고**:
- staff는 주문 등록 불가
- 상태 전환은 향후 RPC 권장
- 물리 DELETE 정책 없음
- 다른 store customer/product 연결은 DB constraint + trigger로 차단
- soft-deleted customer/product 연결도 trigger로 차단

### 2.7 inventory_logs

| 정책 | 대상 | USING | WITH CHECK |
|---|---|---|---|
| InventoryLogs: active members can view | SELECT | `private.is_store_member(store_id)` | - |

**비고**: 일반 클라이언트 insert/update/delete 금지. 향후 보호된 주문 RPC만 insert. soft-deleted product/order 연결은 trigger로 차단.

### 2.8 expenses

| 정책 | 대상 | USING | WITH CHECK |
|---|---|---|---|
| Expenses: owner/manager can view active | SELECT | `private.has_store_role(store_id, ARRAY['owner'::member_role, 'manager'::member_role]) AND deleted_at IS NULL` | - |
| Expenses: owners can view deleted | SELECT | `private.has_store_role(store_id, ARRAY['owner'::member_role]) AND deleted_at IS NOT NULL` | - |
| Expenses: owner/manager can insert | INSERT | - | `private.has_store_role(store_id, ARRAY['owner'::member_role, 'manager'::member_role])` |
| Expenses: owner/manager can update | UPDATE | `private.has_store_role(store_id, ARRAY['owner'::member_role, 'manager'::member_role])` | `private.has_store_role(store_id, ARRAY['owner'::member_role, 'manager'::member_role])` |

**비고**: staff 차단

### 2.9 classification_keywords

| 정책 | 대상 | USING | WITH CHECK |
|---|---|---|---|
| Keywords: active members can view active | SELECT | `private.is_store_member(store_id) AND deleted_at IS NULL` | - |
| Keywords: owners can view deleted | SELECT | `private.has_store_role(store_id, ARRAY['owner'::member_role]) And deleted_at IS NOT NULL` | - |
| Keywords: owner/manager can insert | INSERT | - | `private.has_store_role(store_id, ARRAY['owner'::member_role, 'manager'::member_role])` |
| Keywords: owner/manager can update | UPDATE | `private.has_store_role(store_id, ARRAY['owner'::member_role, 'manager'::member_role])` | `private.has_store_role(store_id, ARRAY['owner'::member_role, 'manager'::member_role])` |

**비고**: staff 읽기만 (active rows)

### 2.10 store_settings

| 정책 | 대상 | USING | WITH CHECK |
|---|---|---|---|
| StoreSettings: owners can view | SELECT | `private.has_store_role(store_id, ARRAY['owner'::member_role])` | - |
| StoreSettings: owners can insert | INSERT | - | `private.has_store_role(store_id, ARRAY['owner'::member_role])` |
| StoreSettings: owners can update | UPDATE | `private.has_store_role(store_id, ARRAY['owner'::member_role])` | `private.has_store_role(store_id, ARRAY['owner'::member_role])` |

**비고**: manager와 staff 차단. 원가 공식 노출 위험. 향후 안전한 공개 설정 view 별도 설계

### 2.11 audit_logs

| 정책 | 대상 | USING | WITH CHECK |
|---|---|---|---|
| AuditLogs: owners can view | SELECT | `private.has_store_role(store_id, ARRAY['owner'::member_role])` | - |

**비고**: 일반 클라이언트 직접 insert/update/delete 금지

### 2.12 migration_runs

| 정책 | 대상 | USING | WITH CHECK |
|---|---|---|---|
| MigrationRuns: owners can view | SELECT | `private.has_store_role(store_id, ARRAY['owner'::member_role])` | - |
| MigrationRuns: owners can insert | INSERT | - | `private.has_store_role(store_id, ARRAY['owner'::member_role])` |
| MigrationRuns: owners can update | UPDATE | `private.has_store_role(store_id, ARRAY['owner'::member_role])` | `private.has_store_role(store_id, ARRAY['owner'::member_role])` |

## 3. Soft Delete 정책 설계

PostgreSQL의 여러 SELECT 정책은 OR로 결합된다.

| 테이블 | active SELECT | deleted SELECT | 결과 |
|---|---|---|---|
| stores | `is_store_member AND deleted_at IS NULL` | `owner AND deleted_at IS NOT NULL` | owner는 둘 다 조회. manager/staff는 active만 |
| products | `owner/manager AND deleted_at IS NULL` | `owner AND deleted_at IS NOT NULL` | owner는 둘 다 조회. manager는 active만 |
| customers | `owner/manager AND deleted_at IS NULL` | `owner AND deleted_at IS NOT NULL` | owner는 둘 다 조회. manager는 active만 |
| orders | `owner/manager AND deleted_at IS NULL` | `owner AND deleted_at IS NOT NULL` | owner는 둘 다 조회. manager는 active만 |
| expenses | `owner/manager AND deleted_at IS NULL` | `owner AND deleted_at IS NOT NULL` | owner는 둘 다 조회. manager는 active만 |
| classification_keywords | `is_store_member AND deleted_at IS NULL` | `owner AND deleted_at IS NOT NULL` | owner는 둘 다 조회. manager/staff는 active만 |

**UPDATE 정책**: UPDATE는 USING과 WITH CHECK를 모두 만족해야 한다. soft-deleted row를 수정하려면 USING에서 해당 row가 보여야 하는데, manager/staff는 deleted row를 볼 수 없으므로 자연스럽게 UPDATE도 불가능하다. owner는 deleted row도 볼 수 있으므로 UPDATE 가능 (예: 복구를 위한 notes 수정).

**복구 (restore)**: owner가 deleted_at을 NULL로 업데이트하면 `determine_audit_action()`에서 RESTORE로 기록된다. 별도의 보호된 RPC 없이 owner UPDATE 권한으로 가능하다.

## 4. Helper 함수

| 함수 | 스키마 | 설명 |
|---|---|---|
| `is_store_member(target_store_id uuid)` | private | 현재 사용자가 해당 store의 active 멤버인지 |
| `current_store_role(target_store_id uuid)` | private | 현재 사용자의 해당 store 내 역할 |
| `has_store_role(target_store_id uuid, allowed_roles member_role[])` | private | 현재 사용자가 지정된 역할 중 하나인지 |

## 5. RLS 재귀 방지

RLS 정책 낶부에서 `private.is_store_member`, `private.current_store_role`, `private.has_store_role` 함수를 호출할 경우 store_members 테이블의 RLS 정책을 다시 호출하면서 무한 재귀가 발생할 수 있다.

**해결 방안**:
- 모든 private helper 함수를 `SECURITY DEFINER`로 정의
- `SET search_path = ''`로 search_path 공격 방지
- 함수 내에서 `public.store_members`를 schema-qualified 이름으로 조회
- 이로 인해 RLS가 bypass되고 재귀가 발생하지 않음

## 6. Security Definer 함수 목록

| 함수 | 스키마 | 이유 |
|---|---|---|
| `private.is_store_member` | private | RLS 재귀 방지 |
| `private.current_store_role` | private | RLS 재귀 방지 |
| `private.has_store_role` | private | RLS 재귀 방지 |
| `private.mask_sensitive_data` | private | audit 함수 낶부 사용 |
| `private.determine_audit_action` | private | audit 함수 낶부 사용 |
| `public.log_audit` | public | audit trigger 호출 |
| `public.validate_order_store_consistency` | public | cross-store 검증 + soft-deleted entity 차단 |
| `public.validate_inventory_log_store_consistency` | public | cross-store 검증 + soft-deleted entity 차단 |
| `public.prevent_last_owner_removal` | public | 마지막 owner 보호 |

## 7. search_path 설정

모든 SECURITY DEFINER 함수에 `SET search_path = ''` 적용:
- `private.is_store_member`
- `private.current_store_role`
- `private.has_store_role`
- `private.mask_sensitive_data`
- `private.determine_audit_action`
- `public.log_audit`
- `public.validate_order_store_consistency`
- `public.validate_inventory_log_store_consistency`
- `public.prevent_last_owner_removal`

## 8. GRANT/REVOKE 요약

### 8.1 anon

- 모든 업무 테이블: `REVOKE ALL`
- helper 함수: `REVOKE ALL`
- audit 함수: `REVOKE ALL`

### 8.2 authenticated

| 테이블 | 권한 |
|---|---|
| profiles | SELECT, INSERT, UPDATE |
| stores | SELECT, INSERT, UPDATE |
| store_members | SELECT, INSERT, UPDATE |
| products | SELECT, INSERT, UPDATE |
| customers | SELECT, INSERT, UPDATE |
| orders | SELECT, INSERT, UPDATE |
| inventory_logs | SELECT |
| expenses | SELECT, INSERT, UPDATE |
| classification_keywords | SELECT, INSERT, UPDATE |
| store_settings | SELECT, INSERT, UPDATE |
| audit_logs | SELECT |
| migration_runs | SELECT, INSERT, UPDATE |

- **모든 테이블**: `REVOKE DELETE` (soft delete only)
- **staff 차단**: RLS 정책에서 products/customers/orders SELECT를 owner/manager로 제한. 테이블 자체의 GRANT는 authenticated 전체에 있지만 RLS가 실제 접근을 차단한다.

### 8.3 private schema

- `REVOKE ALL ON SCHEMA private FROM PUBLIC`
- `GRANT USAGE ON SCHEMA private TO authenticated`
- helper 함수: `REVOKE ALL FROM PUBLIC`, `GRANT EXECUTE TO authenticated`

### 8.4 audit 함수

- `REVOKE ALL FROM PUBLIC`
- trigger만 실행 가능

## 9. 컬럼 수준 보안 한계

RLS는 행 단위 보안이므로 특정 컬럼만 숨길 수 없다.

**문제**:
- staff가 products 테이블을 조회하면 원가(korea_cost, actual_converted_cost, china_base_price)도 함께 보임
- staff가 customers 테이블을 조회하면 phone, email, address도 함께 보임

**2-5단계 대응**:
- staff의 products/customers/orders base table SELECT를 완전히 차단
- 불완전한 view보다 차단이 우선

**향후 방안**:
1. **제한 view**: staff용 view 생성 시 원가/개인정보 컬럼 제외
2. **RPC**: 데이터 접근을 보호된 함수로 감싸기

## 10. staff 제한 view/RPC 향후 설계

### 10.1 products_readonly view (staff용)

```sql
CREATE VIEW public.products_readonly AS
SELECT
    id,
    store_id,
    product_code,
    original_title,
    brand,
    category,
    color,
    size,
    material,
    season,
    fit,
    style,
    current_stock,
    image
FROM public.products
WHERE deleted_at IS NULL;
```

### 10.2 customers_readonly view (staff용)

```sql
CREATE VIEW public.customers_readonly AS
SELECT
    id,
    store_id,
    name,
    wechat_nickname,
    level,
    order_count
FROM public.customers
WHERE deleted_at IS NULL;
```

### 10.3 주문 생성 RPC

```sql
CREATE FUNCTION public.create_order(...)
RETURNS public.orders AS $$
BEGIN
    -- validation logic
    -- insert order
    -- update inventory
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '';
```

## 11. 초기 owner 생성 방식

공개 클라이언트가 임의 owner를 생성할 수 있는 정책을 만들지 않는다.

**안전한 방안**:

1. **Supabase SQL Editor에서 관리자 수행**
   - service_role로 로그인한 관리자가 직접 store와 store_members 생성
   - 가장 간단하지만 매번 관리자 개입 필요

2. **서버 측 관리 함수 (권장)**
   ```sql
   CREATE FUNCTION public.create_store_with_owner(name text, owner_email text)
   RETURNS public.stores AS $$
   DECLARE
       v_owner_id uuid;
       v_store public.stores;
   BEGIN
       SELECT id INTO v_owner_id FROM auth.users WHERE email = owner_email;
       INSERT INTO public.stores (name, created_by) VALUES (name, v_owner_id) RETURNING * INTO v_store;
       INSERT INTO public.store_members (store_id, user_id, role) VALUES (v_store.id, v_owner_id, 'owner');
       RETURN v_store;
   END;
   $$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = '';
   ```

3. **Edge Function**
   - 관리자 API 토큰으로 호출
   - 보안 검증 후 store 생성

4. **별도 bootstrap 절차**
   - 초기 데이터 시드 SQL 파일
   - 서비스 시작 시 한 번만 실행

**금지 방안**:
- service_role key를 브라우저에 넣는 방식
- 클라이언트에서 직접 store_members에 owner로 insert하는 정책

## 12. 마지막 owner 제거 방지

`prevent_last_owner_removal()` trigger로 구현 완료.

- store_members UPDATE 시 마지막 active owner인지 확인
- role이 owner에서 다른 값으로 변경되거나 is_active가 false로 변경되면 차단
- 동시 업데이트에서도 count 쿼리로 안전하게 확인
- manager와 staff는 store_members UPDATE 권한이 없으므로 trigger와 무관하게 이미 차단됨

## 13. 정책 수 요약

| 테이블 | SELECT | INSERT | UPDATE | DELETE | 합계 |
|---|---|---|---|---|---|
| profiles | 1 | 0 | 1 | 0 | 2 |
| stores | 2 | 0 | 1 | 0 | 3 |
| store_members | 1 | 1 | 1 | 0 | 3 |
| products | 2 | 1 | 1 | 0 | 4 |
| customers | 2 | 1 | 1 | 0 | 4 |
| orders | 2 | 1 | 1 | 0 | 4 |
| inventory_logs | 1 | 0 | 0 | 0 | 1 |
| expenses | 2 | 1 | 1 | 0 | 4 |
| classification_keywords | 2 | 1 | 1 | 0 | 4 |
| store_settings | 1 | 1 | 1 | 0 | 3 |
| audit_logs | 1 | 0 | 0 | 0 | 1 |
| migration_runs | 1 | 1 | 1 | 0 | 3 |
| **총계** | **18** | **8** | **10** | **0** | **36** |

## 14. 관련 문서

- 스키마: [SUPABASE_SCHEMA.md](./SUPABASE_SCHEMA.md)
- 실행 순서: [SUPABASE_MIGRATION_ORDER.md](./SUPABASE_MIGRATION_ORDER.md)
- 테스트 계획: [RLS_TEST_PLAN.md](./RLS_TEST_PLAN.md)
