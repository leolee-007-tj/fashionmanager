# Supabase Staff Read RPC

## 개요

staff 역할은 기존 웹앱의 상품·고객·주문 운영 정보를 읽을 수 있어야 하지만,
원가·수익·고객 집계 등 민감한 재무 데이터는 볼 수 없어야 합니다.

이번 단계에서는 PostgreSQL view 대신 **SECURITY DEFINER RPC**를 사용하여
staff에게 제한된 읽기 전용 접근을 제공합니다.

## 왜 view가 아닌 RPC인가?

### 1. security_invoker view
- 기존 RLS를 그대로 적용
- staff는 base-table RLS에서 products/customers/orders가 0행이므로
  view를 통해서도 0행이 반환됨
- staff용 RLS policy를 추가하면 민감 필드 제외가 어려움

### 2. security_definer view
- RLS를 우회하므로 별도의 권한 검사와 필터링이 필요
- 컬럼 레벨 제한을 명시적으로 관리하기 어려움
- 잘못 구성하면 RLS 우회 위험

### 3. SECURITY DEFINER RPC (선택)
- 함수 본문에서 명시적으로 권한 검사
- 반환 컬럼을 정확히 제어
- soft-delete, cross-store 필터링을 명시적으로 구현
- 읽기 전용으로 STABLE 속성 부여 가능
- 현재 구조에서 가장 단순하고 안전

## RPC 목록

### 1. list_staff_products

```sql
public.list_staff_products(
    p_store_id uuid,
    p_search text DEFAULT NULL,
    p_limit integer DEFAULT 100,
    p_offset integer DEFAULT 0
)
RETURNS TABLE (
    id uuid,
    store_id uuid,
    product_code text,
    original_title text,
    normalized_title text,
    brand text,
    category text,
    color text,
    size text,
    material text,
    season text,
    fit text,
    style text,
    current_stock integer,
    reserved_stock integer,
    available_stock integer,
    stock_year integer,
    stock_month integer,
    image text
)
```

**정렬**: `original_title ASC, id ASC`

**검색 대상**: product_code, original_title, normalized_title, brand, category, color, size

**제외 필드**: korea_cost, actual_converted_cost, china_base_price, legacy_id, created_by, updated_by, created_at, updated_at, deleted_at, version, notes

### 2. list_staff_customers

```sql
public.list_staff_customers(
    p_store_id uuid,
    p_search text DEFAULT NULL,
    p_limit integer DEFAULT 100,
    p_offset integer DEFAULT 0
)
RETURNS TABLE (
    id uuid,
    store_id uuid,
    name text,
    wechat_nickname text,
    phone text,
    address text
)
```

**정렬**: `name ASC, id ASC`

**검색 대상**: name, wechat_nickname, phone

**제외 필드**: email, notes, level, total_amount, total_profit, order_count, total_quantity, last_order_date, legacy_id, created_by, updated_by, created_at, updated_at, deleted_at, version

### 3. list_staff_orders

```sql
public.list_staff_orders(
    p_store_id uuid,
    p_search text DEFAULT NULL,
    p_limit integer DEFAULT 100,
    p_offset integer DEFAULT 0
)
RETURNS TABLE (
    id uuid,
    store_id uuid,
    order_number text,
    customer_id uuid,
    product_id uuid,
    customer_name_snapshot text,
    product_title_snapshot text,
    brand_snapshot text,
    category_snapshot text,
    color_snapshot text,
    size_snapshot text,
    quantity integer,
    selling_price numeric,
    status public.order_status,
    order_date date,
    ship_date date,
    shipping_company text,
    tracking_number text,
    notes text
)
```

**정렬**: `order_date DESC NULLS LAST, id DESC`

**검색 대상**: order_number, customer_name_snapshot, product_title_snapshot, brand_snapshot, tracking_number

**제외 필드**: actual_converted_cost_at_sale, china_cost_at_sale, actual_profit, actual_profit_margin, actual_cost_ratio, legacy_customer_id, legacy_product_id, legacy_id, created_by, updated_by, created_at, updated_at, deleted_at, version

**특징**:
- 주문 snapshot을 그대로 반환 (base table과 join하지 않음)
- 과거 주문의 customer/product가 soft-delete됐더라도 주문 snapshot은 조회 가능

## 공통 보안 규칙

세 함수 모두 다음을 적용합니다.

- `LANGUAGE plpgsql STABLE SECURITY DEFINER`
- `SET search_path = ''`
- 모든 relation과 type을 schema-qualified로 사용
- dynamic SQL 사용 금지
- `auth.uid()`만 사용자 식별자로 사용
- PUBLIC / anon EXECUTE revoke
- authenticated EXECUTE grant

## 공통 인증·권한 검사

1. `auth.uid()`가 NULL → SQLSTATE 42501
2. `private.current_store_role(p_store_id)`가 NULL → SQLSTATE 42501
3. store가 존재하고 `deleted_at IS NULL` 확인 → 아니면 SQLSTATE 22023
4. 같은 store의 행만 반환
5. `deleted_at IS NULL`인 행만 반환 (soft-delete 필터)

## Pagination

- `p_limit`: 1 ~ 200 (범위 외 → 22023)
- `p_offset`: 0 이상 (음수 → 22023)
- LIMIT/OFFSET 적용

## 검색

- `p_search`는 NULL 허용
- trim 후 빈 문자열은 NULL 취급
- 100자 초과 → 22023
- static SQL과 ILIKE만 사용
- 사용자 입력을 SQL 문자열로 조합하지 않음

## 역할별 호출 가능 여부

| 역할 | list_staff_products | list_staff_customers | list_staff_orders | base-table SELECT |
|---|---|---|---|---|
| owner | ✅ | ✅ | ✅ | ✅ (모든 필드) |
| manager | ✅ | ✅ | ✅ | ✅ (모든 필드) |
| staff (active) | ✅ | ✅ | ✅ | ❌ (0행) |
| staff (inactive) | ❌ | ❌ | ❌ | ❌ (0행) |
| anon | ❌ | ❌ | ❌ | ❌ |

> staff에게 INSERT/UPDATE/DELETE 권한은 없습니다.

## 읽기 전용

이 세 RPC는 데이터를 변경하지 않습니다.

- 재고 수정 없음
- 주문 상태 변경 없음
- 고객 집계 변경 없음
- inventory_logs 기록 없음
- audit trigger 관련 변경 없음

## Supabase JS 호출 예시

```javascript
// staff 역할로 상품 목록 조회
const { data, error } = await supabase.rpc('list_staff_products', {
  p_store_id: 'store-uuid',
  p_search: 'T-Shirt',
  p_limit: 50,
  p_offset: 0
});

// staff 역할로 고객 검색
const { data, error } = await supabase.rpc('list_staff_customers', {
  p_store_id: 'store-uuid',
  p_search: 'Alice'
});

// staff 역할로 주문 조회
const { data, error } = await supabase.rpc('list_staff_orders', {
  p_store_id: 'store-uuid',
  p_search: 'ORD-0001'
});
```

## 프런트엔드 연결

현재 단계에서는 실제 프런트엔드 HTML/CSS/JavaScript를 수정하지 않았습니다.
RPC 스펙과 pgTAP 테스트만 완료된 상태입니다.

향후 프런트엔드 연동 시:
- 기존 직접 테이블 조회 코드를 RPC 호출로 교체
- staff 역할에서는 RPC만 사용
- owner/manager는 기존 base-table 조회 유지 또는 RPC 사용 가능

## 아직 구현되지 않은 것

- staff용 대시보드 집계 RPC
- staff용 상품 상세 단일 조회 RPC
- staff용 고객 상세 단일 조회 RPC
- staff용 주문 상세 단일 조회 RPC
- staff용 주문 상태 변경 (제한된 범위 내)
- staff용 inventory_logs 조회
- CSV 내보내기 등 bulk 조회
