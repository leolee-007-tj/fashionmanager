# Supabase 스키마 초안

> 본 문서는 Supabase PostgreSQL 스키마 설계 초안을 문서화한다.
> 실제 개인정보(고객명, 전화번호, 주소, 이메일)는 포함하지 않는다.
> 제약조건·인덱스·RLS는 다음 작업에서 추가한다.

## 1. 테이블 목록 (12개)

| 번호 | 테이블명 | 목적 |
|---|---|---|
| 1 | profiles | 사용자 프로필 (Supabase Auth와 연결) |
| 2 | stores | 매장 정보 |
| 3 | store_members | 매장-사용자 권한 관계 |
| 4 | products | 상품 관리 |
| 5 | customers | 고객 관리 |
| 6 | orders | 주문 관리 |
| 7 | inventory_logs | 재고 변경 기록 (append-only) |
| 8 | expenses | 경비 관리 |
| 9 | classification_keywords | 상품 분류 키워드 |
| 10 | store_settings | 매장 설정 |
| 11 | audit_logs | 감사 로그 (append-only) |
| 12 | migration_runs | 마이그레이션 실행 기록 |

## 2. 각 테이블 목적 및 핵심 필드

### 2.1 profiles
- **목적**: Supabase Auth 사용자의 추가 프로필 정보 저장
- **핵심 필드**: `id`(auth.users.id 참조), `display_name`, `preferred_language`
- **localStorage 매핑**: `lesoul_gh_language` → `preferred_language`
- **비고**: 이메일은 auth.users에 저장, profiles에 중복 저장하지 않음

### 2.2 stores
- **목적**: 매장 기본 정보
- **핵심 필드**: `id`, `name`, `subtitle`, `created_by`
- **localStorage 매핑**: `lesoul_gh_settings.store_name`, `lesoul_gh_settings.store_subtitle`
- **비고**: soft delete 적용

### 2.3 store_members
- **목적**: 매장 권한 관리 (다중 사용자 지원)
- **핵심 필드**: `store_id`, `user_id`, `role`, `is_active`, `invited_by`
- **비고**: member_role enum (owner/manager/staff)

### 2.4 products
- **목적**: 상품 정보 관리
- **핵심 필드**: `legacy_id`, `product_code`, `original_title`, `brand`, `korea_cost`, `actual_converted_cost`, `china_base_price`, `current_stock`, `reserved_stock`, `stock_year`, `stock_month`
- **localStorage 매핑**: `lesoul_gh_products`
- **비고**: 
  - `image`는 Base64 문자열 → 향후 Supabase Storage 이전 대상
  - soft delete 적용

### 2.5 customers
- **목적**: 고객 정보 관리
- **핵심 필드**: `legacy_id`, `name`, `wechat_nickname`, `phone`, `email`, `total_amount`, `total_profit`, `order_count`, `total_quantity`, `last_order_date`
- **localStorage 매핑**: `lesoul_gh_customers`
- **비고**:
  - 집계값(total_amount, total_profit 등)은 기존 앱 호환을 위해 유지하되 **파생 데이터**로 문서화
  - soft delete 적용
  - 고객 이름 unique 제약 없음

### 2.6 orders
- **목적**: 주문 정보 관리
- **핵심 필드**: `legacy_id`, `order_number`, `customer_id`, `product_id`, `quantity`, `selling_price`, `actual_converted_cost_at_sale`, `china_cost_at_sale`, `actual_profit`, `status`, `order_date`, `ship_date`
- **localStorage 매핑**: `lesoul_gh_orders`
- **비고**:
  - **주문 snapshot 필드**: `customer_name_snapshot`, `product_title_snapshot`, `brand_snapshot`, `category_snapshot`, `color_snapshot`, `size_snapshot`
  - 판매 당시 원가와 상품 정보를 snapshot으로 보존 → 상품 현재 원가 변경이 과거 주문 수익에 영향을 주지 않음
  - `customer_id`, `product_id` nullable → 기존 주문을 이관할 수 있도록
  - soft delete 적용

### 2.7 inventory_logs
- **목적**: 재고 변경 기록 (append-only)
- **핵심 필드**: `legacy_id`, `product_id`, `order_id`, `change_type`, `quantity_change`, `stock_before`, `stock_after`, `reserved_before`, `reserved_after`
- **localStorage 매핑**: `lesoul_gh_inventory_logs`
- **비고**:
  - append-only 테이블 (update/delete 금지)
  - inventory_change_type enum (INITIAL/RESERVE/RELEASE/SHIP/RETURN/ADJUSTMENT/MIGRATION)

### 2.8 expenses
- **목적**: 경비 관리
- **핵심 필드**: `legacy_id`, `legacy_id_text`, `expense_date`, `category`, `amount`, `description`
- **localStorage 매핑**: `lesoul_gh_expenses`
- **비고**:
  - **legacy_id 타입**: `numeric` + `legacy_id_text` (기존 `Date.now() + Math.random()` 소수점 ID 대응)
  - soft delete 적용

### 2.9 classification_keywords
- **목적**: 상품 자동분류 키워드
- **핵심 필드**: `legacy_id`, `legacy_id_text`, `classification_type`, `standard_value`, `ko[]`, `zh[]`, `en[]`, `ja[]`, `other_aliases[]`, `priority`, `is_active`
- **localStorage 매핑**: `lesoul_gh_keywords`
- **비고**:
  - **legacy_id 타입**: `numeric` + `legacy_id_text` (엑셀 임포트 시 `Date.now() + Math.random()` 소수점 ID 대응)
  - 기존 문자열 키워드는 마이그레이션 과정에서 1개 요소 배열로 변환
  - soft delete 적용

### 2.10 store_settings
- **목적**: 매장 설정 (가격 계산 파라미터 등)
- **핵심 필드**: `store_id`, `store_name`, `store_subtitle`, `exchange_divisor`, `price_multiplier`, `fixed_addition`, `base_discount_rate`, `default_language`
- **localStorage 매핑**: `lesoul_gh_settings`
- **비고**:
  - 매장당 한 행을 기본으로 함
  - `store_subtitle`은 jsonb 타입 (다국어 지원)
  - soft delete 미적용

### 2.11 audit_logs
- **목적**: 데이터 변경 감사 로그
- **핵심 필드**: `table_name`, `record_id`, `action`, `old_data`, `new_data`, `changed_by`, `request_id`
- **비고**:
  - append-only 테이블
  - audit_action enum (INSERT/UPDATE/SOFT_DELETE/RESTORE/MIGRATE/IMPORT)
  - 일반 클라이언트 직접 CRUD를 허용하지 않을 예정

### 2.12 migration_runs
- **목적**: 마이그레이션 실행 기록
- **핵심 필드**: `store_id`, `status`, `source_type`, `source_fingerprint`, `started_at`, `completed_at`, `product_count`, `customer_count`, `order_count`, `inserted_count`, `updated_count`, `skipped_count`, `failed_count`, `validation_summary`, `error_summary`
- **비고**:
  - migration_status enum (PENDING/RUNNING/COMPLETED/PARTIAL/FAILED/CANCELLED)

## 3. UUID와 legacy_id 사용 방식

| 방식 | 설명 |
|---|---|
| **새 기본 키** | `uuid` 타입, `gen_random_uuid()` 기본값 |
| **기존 ID 보존** | `legacy_id` 필드에 보존 (products/customers/orders/inventory_logs: bigint, expenses/classification_keywords: numeric) |
| **소수점 ID 대응** | expenses, classification_keywords에는 `legacy_id_text` 필드를 추가하여 소수점 ID 손실 방지 |
| **외래키 매핑** | orders 테이블에 `legacy_customer_id`, `legacy_product_id`를 추가하여 기존 주문 이관 시 참조 가능 |

## 4. soft delete 적용 테이블

- stores ✅
- products ✅
- customers ✅
- orders ✅
- expenses ✅
- classification_keywords ✅

## 5. append-only 테이블

- inventory_logs ✅
- audit_logs ✅

## 6. 주문 snapshot 필드

주문 테이블의 snapshot 필드 목적:

| 필드 | 목적 |
|---|---|
| `customer_name_snapshot` | 주문 생성 시 고객명 보존. 고객 이름 변경 시 과거 주문 영향 없음 |
| `product_title_snapshot` | 주문 생성 시 상품명 보존 |
| `brand_snapshot` | 주문 생성 시 브랜드 보존 |
| `category_snapshot` | 주문 생성 시 카테고리 보존 |
| `color_snapshot` | 주문 생성 시 색상 보존 |
| `size_snapshot` | 주문 생성 시 사이즈 보존 |
| `actual_converted_cost_at_sale` | 판매 당시 원가 스냅샷 |
| `china_cost_at_sale` | 판매 당시 중국 원가 스냅샷 |

## 7. expenses와 keywords의 소수점 legacy ID 대응

기존 JavaScript 코드에서 다음과 같은 소수점 ID 생성 방식이 사용됨:
- `Date.now() + Math.random()` (예: 1750000000000.123456)

대응 방안:
- `legacy_id` 필드를 `numeric` 타입으로 정의 (소수점 유지)
- `legacy_id_text` 필드를 `text` 타입으로 추가 (정확한 문자열 보존)

## 8. 현재 상태 및 다음 작업

### 완료
- ✅ 확장과 enum 타입 정의 (pgcrypto, 5개 enum)
- ✅ 12개 테이블 기본 구조 생성
- ✅ legacy_id 필드 추가
- ✅ soft delete 패턴 적용
- ✅ 주문 snapshot 필드 추가

### 다음 작업 (2-2단계)
- ⏳ 제약조건 추가 (UNIQUE, FOREIGN KEY, CHECK)
- ⏳ 인덱스 추가 (검색 성능 최적화)
- ⏳ RLS 정책 설정
- ⏳ 트리거 및 함수 추가 (updated_at 자동 갱신, 재고 원자적 업데이트)
- ⏳ 마이그레이션 스크립트 작성