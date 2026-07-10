# Supabase RLS 설계 문서

> 본 문서는 2-3단계 RLS 정책, GRANT/REVOKE, audit 함수를 기반으로 작성한다.
> 개인정보는 포함하지 않는다.

## 1. 역할별 권한표

### 1.1 owner

| 테이블 | SELECT | INSERT | UPDATE | DELETE | 비고 |
|---|---|---|---|---|---|
| profiles | 본인만 | - | 본인만 | ❌ | - |
| stores | ✅ | ❌ | ✅ | ❌ | active member |
| store_members | ✅ | ✅ | ✅ | ❌ | 같은 store |
| products | ✅ | ✅ | ✅ | ❌ | soft delete |
| customers | ✅ | ✅ | ✅ | ❌ | soft delete |
| orders | ✅ | ✅ | ✅ | ❌ | - |
| inventory_logs | ✅ | ❌ | ❌ | ❌ | append-only |
| expenses | ✅ | ✅ | ✅ | ❌ | soft delete |
| classification_keywords | ✅ | ✅ | ✅ | ❌ | soft delete |
| store_settings | ✅ | ✅ | ✅ | ❌ | 원가 공식 접근 |
| audit_logs | ✅ | ❌ | ❌ | ❌ | owner only |
| migration_runs | ✅ | ✅ | ✅ | ❌ | - |

### 1.2 manager

| 테이블 | SELECT | INSERT | UPDATE | DELETE | 비고 |
|---|---|---|---|---|---|
| profiles | 본인만 | - | 본인만 | ❌ | - |
| stores | ✅ | ❌ | ❌ | ❌ | active member |
| store_members | ✅ | ❌ | ❌ | ❌ | 조회만 |
| products | ✅ | ✅ | ✅ | ❌ | soft delete |
| customers | ✅ | ✅ | ✅ | ❌ | soft delete |
| orders | ✅ | ✅ | ✅ | ❌ | - |
| inventory_logs | ✅ | ❌ | ❌ | ❌ | append-only |
| expenses | ✅ | ✅ | ✅ | ❌ | soft delete |
| classification_keywords | ✅ | ✅ | ✅ | ❌ | - |
| store_settings | ❌ | ❌ | ❌ | ❌ | 원가 공식 노출 위험 |
| audit_logs | ❌ | ❌ | ❌ | ❌ | 차단 |
| migration_runs | ❌ | ❌ | ❌ | ❌ | 차단 |

### 1.3 staff

| 테이블 | SELECT | INSERT | UPDATE | DELETE | 비고 |
|---|---|---|---|---|---|
| profiles | 본인만 | - | 본인만 | ❌ | - |
| stores | ✅ | ❌ | ❌ | ❌ | active member |
| store_members | ✅ | ❌ | ❌ | ❌ | 조회만 |
| products | ✅ | ❌ | ❌ | ❌ | ❌ |
| customers | ✅ | ❌ | ❌ | ❌ | ❌ |
| orders | ✅ | ❌ | ❌ | ❌ | ❌ |
| inventory_logs | ✅ | ❌ | ❌ | ❌ | append-only |
| expenses | ❌ | ❌ | ❌ | ❌ | 차단 |
| classification_keywords | ✅ | ❌ | ❌ | ❌ | 읽기만 |
| store_settings | ❌ | ❌ | ❌ | ❌ | 차단 |
| audit_logs | ❌ | ❌ | ❌ | ❌ | 차단 |
| migration_runs | ❌ | ❌ | ❌ | ❌ | 차단 |

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
| Stores: active members can view | SELECT | `private.is_store_member(id)` | - |
| Stores: owners can update | UPDATE | `private.has_store_role(id, ['owner'])` | `private.has_store_role(id, ['owner'])` |

**비고**: 클라이언트에서 임의 store 생성은 허용하지 않음. 초기 owner 생성은 관리자 작업.

### 2.3 store_members

| 정책 | 대상 | USING | WITH CHECK |
|---|---|---|---|
| StoreMembers: active members can view same store | SELECT | `private.is_store_member(store_id)` | - |
| StoreMembers: owners can insert | INSERT | - | `private.has_store_role(store_id, ['owner'])` |
| StoreMembers: owners can update | UPDATE | `private.has_store_role(store_id, ['owner'])` | `private.has_store_role(store_id, ['owner'])` |

**비고**:
- 자기 role을 owner로 변경 불가 (RLS + trigger 필요)
- 마지막 owner 제거 방지는 RLS만으로 충분하지 않음 → protected function 또는 trigger 필요
- inactive membership은 `private.is_store_member`에서 `is_active = true`로 차단

### 2.4 products

| 정책 | 대상 | USING | WITH CHECK |
|---|---|---|---|
| Products: active members can view | SELECT | `private.is_store_member(store_id)` | - |
| Products: owner/manager can insert | INSERT | - | `private.has_store_role(store_id, ['owner', 'manager'])` |
| Products: owner/manager can update | UPDATE | `private.has_store_role(store_id, ['owner', 'manager'])` | `private.has_store_role(store_id, ['owner', 'manager'])` |

**비고**: staff는 향후 제한 view 사용

### 2.5 customers

| 정책 | 대상 | USING | WITH CHECK |
|---|---|---|---|
| Customers: active members can view | SELECT | `private.is_store_member(store_id)` | - |
| Customers: owner/manager can insert | INSERT | - | `private.has_store_role(store_id, ['owner', 'manager'])` |
| Customers: owner/manager can update | UPDATE | `private.has_store_role(store_id, ['owner', 'manager'])` | `private.has_store_role(store_id, ['owner', 'manager'])` |

**비고**: staff 수정 범위는 RLS만으로 컬럼 제한이 어려우므로 향후 RPC/view로 제한

### 2.6 orders

| 정책 | 대상 | USING | WITH CHECK |
|---|---|---|---|
| Orders: active members can view | SELECT | `private.is_store_member(store_id)` | - |
| Orders: owner/manager can insert | INSERT | - | `private.has_store_role(store_id, ['owner', 'manager'])` |
| Orders: owner/manager can update | UPDATE | `private.has_store_role(store_id, ['owner', 'manager'])` | `private.has_store_role(store_id, ['owner', 'manager'])` |

**비고**:
- staff는 주문 등록 불가
- 상태 전환은 향후 RPC 권장
- 물리 DELETE 정책 없음
- 다른 store customer/product 연결은 DB constraint로 차단

### 2.7 inventory_logs

| 정책 | 대상 | USING | WITH CHECK |
|---|---|---|---|
| InventoryLogs: active members can view | SELECT | `private.is_store_member(store_id)` | - |

**비고**: 일반 클라이언트 insert/update/delete 금지. 향후 보호된 주문 RPC만 insert

### 2.8 expenses

| 정책 | 대상 | USING | WITH CHECK |
|---|---|---|---|
| Expenses: owner/manager can view | SELECT | `private.has_store_role(store_id, ['owner', 'manager'])` | - |
| Expenses: owner/manager can insert | INSERT | - | `private.has_store_role(store_id, ['owner', 'manager'])` |
| Expenses: owner/manager can update | UPDATE | `private.has_store_role(store_id, ['owner', 'manager'])` | `private.has_store_role(store_id, ['owner', 'manager'])` |

**비고**: staff 차단

### 2.9 classification_keywords

| 정책 | 대상 | USING | WITH CHECK |
|---|---|---|---|
| Keywords: active members can view | SELECT | `private.is_store_member(store_id)` | - |
| Keywords: owner/manager can insert | INSERT | - | `private.has_store_role(store_id, ['owner', 'manager'])` |
| Keywords: owner/manager can update | UPDATE | `private.has_store_role(store_id, ['owner', 'manager'])` | `private.has_store_role(store_id, ['owner', 'manager'])` |

**비고**: staff 읽기만

### 2.10 store_settings

| 정책 | 대상 | USING | WITH CHECK |
|---|---|---|---|
| StoreSettings: owners can view | SELECT | `private.has_store_role(store_id, ['owner'])` | - |
| StoreSettings: owners can insert | INSERT | - | `private.has_store_role(store_id, ['owner'])` |
| StoreSettings: owners can update | UPDATE | `private.has_store_role(store_id, ['owner'])` | `private.has_store_role(store_id, ['owner'])` |

**비고**: manager와 staff 차단. 원가 공식 노출 위험. 향후 안전한 공개 설정 view 별도 설계

### 2.11 audit_logs

| 정책 | 대상 | USING | WITH CHECK |
|---|---|---|---|
| AuditLogs: owners can view | SELECT | `private.has_store_role(store_id, ['owner'])` | - |

**비고**: 일반 클라이언트 직접 insert/update/delete 금지

### 2.12 migration_runs

| 정책 | 대상 | USING | WITH CHECK |
|---|---|---|---|
| MigrationRuns: owners can view | SELECT | `private.has_store_role(store_id, ['owner'])` | - |
| MigrationRuns: owners can insert | INSERT | - | `private.has_store_role(store_id, ['owner'])` |
| MigrationRuns: owners can update | UPDATE | `private.has_store_role(store_id, ['owner'])` | `private.has_store_role(store_id, ['owner'])` |

## 3. Helper 함수

| 함수 | 스키마 | 설명 |
|---|---|---|
| `is_store_member(target_store_id uuid)` | private | 현재 사용자가 해당 store의 active 멤버인지 |
| `current_store_role(target_store_id uuid)` | private | 현재 사용자의 해당 store 내 역할 |
| `has_store_role(target_store_id uuid, allowed_roles member_role[])` | private | 현재 사용자가 지정된 역할 중 하나인지 |

## 4. RLS 재귀 방지

RLS 정책 내부에서 `private.is_store_member`, `private.current_store_role`, `private.has_store_role` 함수를 호출할 경우 store_members 테이블의 RLS 정책을 다시 호출하면서 무한 재귀가 발생할 수 있다.

**해결 방안**:
- 모든 private helper 함수를 `SECURITY DEFINER`로 정의
- `SET search_path = ''`로 search_path 공격 방지
- 함수 내에서 `public.store_members`를 schema-qualified 이름으로 조회
- 이로 인해 RLS가 bypass되고 재귀가 발생하지 않음

## 5. Security Definer 함수 목록

| 함수 | 스키마 | 이유 |
|---|---|---|
| `private.is_store_member` | private | RLS 재귀 방지 |
| `private.current_store_role` | private | RLS 재귀 방지 |
| `private.has_store_role` | private | RLS 재귀 방지 |
| `private.mask_sensitive_data` | private | audit 함수 내부 사용 |
| `private.determine_audit_action` | private | audit 함수 내부 사용 |
| `public.log_audit` | public | audit trigger 호출 |
| `public.validate_order_store_consistency` | public | cross-store 검증 |
| `public.validate_inventory_log_store_consistency` | public | cross-store 검증 |

## 6. search_path 설정

모든 SECURITY DEFINER 함수에 `SET search_path = ''` 적용:
- `private.is_store_member`
- `private.current_store_role`
- `private.has_store_role`
- `private.mask_sensitive_data`
- `private.determine_audit_action`
- `public.log_audit`
- `public.validate_order_store_consistency`
- `public.validate_inventory_log_store_consistency`

## 7. GRANT/REVOKE 요약

### 7.1 anon

- 모든 업무 테이블: `REVOKE ALL`
- helper 함수: `REVOKE ALL`
- audit 함수: `REVOKE ALL`

### 7.2 authenticated

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

### 7.3 private schema

- `REVOKE ALL ON SCHEMA private FROM PUBLIC`
- helper 함수: `REVOKE ALL FROM PUBLIC`, `GRANT EXECUTE TO authenticated`

### 7.4 audit 함수

- `REVOKE ALL FROM PUBLIC`
- trigger만 실행 가능

## 8. 컬럼 수준 보안 한계

RLS는 행 단위 보안이므로 특정 컬럼만 숨길 수 없다.

**문제**:
- staff가 products 테이블을 조회하면 원가(korea_cost, actual_converted_cost, china_base_price)도 함께 보임
- staff가 customers 테이블을 조회하면 phone, email, address도 함께 보임

**해결 방안 (향후)**:
1. **제한 view**: staff용 view 생성 시 원가/개인정보 컬럼 제외
2. **column privilege**: PostgreSQL column-level GRANT 사용
3. **RPC**: 데이터 접근을 보호된 함수로 감싸기

## 9. staff 제한 view/RPC 향후 설계

### 9.1 products_readonly view (staff용)

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

### 9.2 customers_readonly view (staff용)

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

### 9.3 주문 생성 RPC

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

## 10. 초기 owner 생성 방식

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

## 11. 마지막 owner 제거 방지

RLS만으로는 마지막 owner 제거를 방지할 수 없다. owner가 자신을 inactive로 만들거나 다른 사용자의 role을 변경할 수 있기 때문.

**해결 방안**:

1. **Trigger 기반**: store_members UPDATE 시 마지막 owner인지 확인
   ```sql
   CREATE FUNCTION public.prevent_last_owner_removal()
   RETURNS trigger AS $$
   BEGIN
       IF NEW.role != 'owner' AND OLD.role = 'owner' THEN
           IF NOT EXISTS (
               SELECT 1 FROM public.store_members
               WHERE store_id = NEW.store_id AND role = 'owner' AND id != NEW.id
           ) THEN
               RAISE EXCEPTION 'Cannot remove the last owner';
           END IF;
       END IF;
       RETURN NEW;
   END;
   $$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = '';
   ```

2. **Protected RPC**: store_members 변경을 보호된 함수로 감싸기

## 12. 정책 수 요약

| 테이블 | SELECT | INSERT | UPDATE | DELETE | 합계 |
|---|---|---|---|---|---|
| profiles | 1 | 0 | 1 | 0 | 2 |
| stores | 1 | 0 | 1 | 0 | 2 |
| store_members | 1 | 1 | 1 | 0 | 3 |
| products | 1 | 1 | 1 | 0 | 3 |
| customers | 1 | 1 | 1 | 0 | 3 |
| orders | 1 | 1 | 1 | 0 | 3 |
| inventory_logs | 1 | 0 | 0 | 0 | 1 |
| expenses | 1 | 1 | 1 | 0 | 3 |
| classification_keywords | 1 | 1 | 1 | 0 | 3 |
| store_settings | 1 | 1 | 1 | 0 | 3 |
| audit_logs | 1 | 0 | 0 | 0 | 1 |
| migration_runs | 1 | 1 | 1 | 0 | 3 |
| **총계** | **12** | **8** | **8** | **0** | **28** |