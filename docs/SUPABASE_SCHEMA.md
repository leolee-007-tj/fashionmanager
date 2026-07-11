# Supabase Schema

> 본 문서는 스키마의 현재 상태를 문서화한다.
> 초안: `docs/SUPABASE_SCHEMA_DRAFT.md`
> 개인정보는 포함하지 않는다.

## 개요

| 항목 | 수량 | 비고 |
|---|---|---|
| 테이블 | 12 | |
| enum 타입 | 5 | |
| CHECK 제약조건 | 33 | orders 배송필드 2개 추가 |
| UNIQUE 제약조건 | 5 | |
| partial unique index | 6 | |
| 일반 인덱스 | 48 | |
| RLS 정책 | 34 | orders INSERT/UPDATE 정책 제거 |
| trigger | 28 | |
| helper 함수 | 5 | recalculate_customer_aggregates, generate_order_number 추가 |
| audit 함수 | 3 | |
| security definer 함수 | 16 | 5개 주문 lifecycle RPC + 2개 온보딩 RPC + 기존 9개 |

---

## Enum 타입

| enum | 값 | 용도 |
|---|---|---|
| `member_role` | owner, manager, staff | 매장 권한 |
| `order_status` | PENDING, SHIPPED, COMPLETED, CANCELLED | 주문 상태 |
| `inventory_change_type` | INITIAL, RESERVE, RELEASE, SHIP, RETURN, ADJUSTMENT, MIGRATION | 재고 변경 |
| `migration_status` | PENDING, RUNNING, COMPLETED, PARTIAL, FAILED, CANCELLED | 마이그레이션 상태 |
| `audit_action` | INSERT, UPDATE, SOFT_DELETE, RESTORE, MIGRATE, IMPORT | 감사 로그 액션 |

---

## 테이블 상세

### profiles

| 필드 | 타입 | 필수 | 기본값 | 제약 | 비고 |
|---|---|---|---|---|---|
| id | uuid | ✅ | - | PK, FK(auth.users) | auth.users(id) ON DELETE CASCADE |
| display_name | text | - | - | - | - |
| preferred_language | text | - | - | - | `lesoul_gh_language` 매핑 |
| created_at | timestamptz | ✅ | now() | - | - |
| updated_at | timestamptz | ✅ | now() | - | trigger로 자동 갱신 |

**인덱스**: 없음
**RLS**: 본인만 조회/수정

---

### stores

| 필드 | 타입 | 필수 | 기본값 | 제약 | 비고 |
|---|---|---|---|---|---|
| id | uuid | ✅ | gen_random_uuid() | PK | - |
| name | text | ✅ | - | - | `lesoul_gh_settings.store_name` 매핑 |
| subtitle | text | - | - | - | `lesoul_gh_settings.store_subtitle` 매핑 |
| created_by | uuid | - | - | FK(auth.users) | nullable |
| created_at | timestamptz | ✅ | now() | - | - |
| updated_at | timestamptz | ✅ | now() | - | trigger |
| deleted_at | timestamptz | - | - | - | soft delete |
| version | integer | ✅ | 1 | - | trigger로 증가 |

**인덱스**: 없음 (PK 제외)
**RLS**: active member 조회, owner 수정

---

### store_members

| 필드 | 타입 | 필수 | 기본값 | 제약 | 비고 |
|---|---|---|---|---|---|
| id | uuid | ✅ | gen_random_uuid() | PK | - |
| store_id | uuid | ✅ | - | FK(stores), UNIQUE(store_id, user_id) | - |
| user_id | uuid | ✅ | - | FK(auth.users) | - |
| role | member_role | ✅ | - | - | owner/manager/staff |
| is_active | boolean | ✅ | true | - | inactive = 업무 접근 불가 |
| invited_by | uuid | - | - | FK(auth.users) | nullable |
| created_at | timestamptz | ✅ | now() | - | - |
| updated_at | timestamptz | ✅ | now() | - | trigger |

**인덱스**: user_id, store_id, store_id+role, is_active
**RLS**: active member 조회, owner insert/update

---

### products

| 필드 | 타입 | 필수 | 기본값 | 제약 | 비고 |
|---|---|---|---|---|---|
| id | uuid | ✅ | gen_random_uuid() | PK | - |
| legacy_id | bigint | - | - | UNIQUE(store_id, legacy_id) | 기존 정수 ID 보존 |
| store_id | uuid | ✅ | - | FK(stores) | - |
| product_code | text | ✅ | - | UNIQUE(store_id, product_code) where deleted_at IS NULL | - |
| original_title | text | ✅ | - | - | `lesoul_gh_products[].title` 매핑 |
| normalized_title | text | - | - | - | 검색용 정규화 제목 |
| title_language | text | - | - | - | - |
| brand | text | ✅ | - | - | - |
| category | text | - | - | - | - |
| color | text | - | - | - | - |
| size | text | - | - | - | - |
| material | text | - | - | - | - |
| season | text | - | - | - | - |
| fit | text | - | - | - | - |
| style | text | - | - | - | - |
| classification_status | text | - | - | - | - |
| korea_cost | numeric | - | - | CHECK >= 0 OR NULL | 원가 |
| actual_converted_cost | numeric | - | - | CHECK >= 0 OR NULL | 환산된 CNY 단위 원가 |
| china_base_price | numeric | - | - | CHECK >= 0 OR NULL | 중국 원가 |
| current_stock | integer | ✅ | 0 | CHECK >= 0 | - |
| reserved_stock | integer | ✅ | 0 | CHECK >= 0 | - |
| stock_year | integer | - | - | CHECK >= 1900 OR NULL | - |
| stock_month | integer | - | - | CHECK 1-12 OR NULL | - |
| image | text | - | - | - | Base64 문자열. 향후 Storage 이전 대상 |
| notes | text | - | - | - | - |
| created_by | uuid | - | - | - | - |
| updated_by | uuid | - | - | - | - |
| created_at | timestamptz | ✅ | now() | - | - |
| updated_at | timestamptz | ✅ | now() | - | trigger |
| deleted_at | timestamptz | - | - | - | soft delete |
| version | integer | ✅ | 1 | - | trigger |

**인덱스**: store_id, store_id+brand, store_id+category, store_id+stock_year+month, store_id+deleted_at, updated_at
**RLS**: active member 조회, owner/manager insert, column-level update
**직접 DML**: current_stock, reserved_stock, id, store_id, created_by, created_at, updated_by, updated_at, version은 직접 수정 불가 (column-level grant로 제한). 나머지 상품 필드는 owner/manager가 직접 수정 가능. 재고 변경은 inventory_log 관련 RPC를 통해야 함.

---

### customers

| 필드 | 타입 | 필수 | 기본값 | 제약 | 비고 |
|---|---|---|---|---|---|
| id | uuid | ✅ | gen_random_uuid() | PK | - |
| legacy_id | bigint | - | - | UNIQUE(store_id, legacy_id) | 기존 정수 ID 보존 |
| store_id | uuid | ✅ | - | FK(stores) | - |
| name | text | ✅ | - | - | 고객명. unique 제약 없음 |
| wechat_nickname | text | - | - | - | - |
| phone | text | - | - | - | - |
| email | text | - | - | - | - |
| address | text | - | - | - | - |
| notes | text | - | - | - | - |
| level | text | - | - | - | - |
| total_amount | numeric | ✅ | 0 | CHECK >= 0 | 파생 데이터 |
| total_profit | numeric | ✅ | 0 | - | 파생 데이터. 음수 가능 (손실 주문) |
| order_count | integer | ✅ | 0 | CHECK >= 0 | 파생 데이터 |
| total_quantity | integer | ✅ | 0 | CHECK >= 0 | 파생 데이터 |
| last_order_date | date | - | - | - | - |
| created_by | uuid | - | - | - | - |
| updated_by | uuid | - | - | - | - |
| created_at | timestamptz | ✅ | now() | - | - |
| updated_at | timestamptz | ✅ | now() | - | trigger |
| deleted_at | timestamptz | - | - | - | soft delete |
| version | integer | ✅ | 1 | - | trigger |

**인덱스**: store_id, store_id+lower(name), phone, wechat_nickname, deleted_at, updated_at
**RLS**: active member 조회, owner/manager insert, column-level update
**직접 DML**: 집계 필드(total_amount, total_profit, order_count, total_quantity, last_order_date)는 직접 수정 불가 (column-level grant로 제한). 이름, 연락처, 주소, 메모 등 일반 정보는 owner/manager가 직접 수정 가능. 집계는 private.recalculate_customer_aggregates를 통해 RPC에서 갱신.

---

### orders

| 필드 | 타입 | 필수 | 기본값 | 제약 | 비고 |
|---|---|---|---|---|---|
| id | uuid | ✅ | gen_random_uuid() | PK | - |
| legacy_id | bigint | - | - | UNIQUE(store_id, legacy_id) | 기존 정수 ID 보존 |
| store_id | uuid | ✅ | - | FK(stores) | - |
| order_number | text | ✅ | - | UNIQUE(store_id, order_number) where deleted_at IS NULL | - |
| customer_id | uuid | - | - | FK(customers), nullable | 기존 주문 이관 시 매칭 실패 가능 |
| product_id | uuid | - | - | FK(products), nullable | 기존 주문 이관 시 매칭 실패 가능 |
| legacy_customer_id | bigint | - | - | - | - |
| legacy_product_id | bigint | - | - | - | - |
| customer_name_snapshot | text | - | - | - | 주문 시점 고객명 스냅샷 |
| product_title_snapshot | text | - | - | - | 주문 시점 상품명 스냅샷 |
| brand_snapshot | text | - | - | - | 주문 시점 브랜드 스냅샷 |
| category_snapshot | text | - | - | - | 주문 시점 카테고리 스냅샷 |
| color_snapshot | text | - | - | - | 주문 시점 색상 스냅샷 |
| size_snapshot | text | - | - | - | 주문 시점 사이즈 스냅샷 |
| quantity | integer | ✅ | - | CHECK > 0 | - |
| selling_price | numeric | ✅ | - | CHECK >= 0 | - |
| actual_converted_cost_at_sale | numeric | - | - | CHECK >= 0 OR NULL | 주문 시점 환산 CNY 단위 원가 스냅샷 |
| china_cost_at_sale | numeric | - | - | CHECK >= 0 OR NULL | 주문 시점 중국 기준가(CNY) 스냅샷 |
| actual_profit | numeric | - | - | - | 음수 가능 |
| actual_profit_margin | numeric | - | - | - | 음수 가능 |
| actual_cost_ratio | numeric | - | - | - | - |
| status | order_status | ✅ | 'PENDING' | - | - |
| order_date | date | - | - | - | - |
| ship_date | date | - | - | - | - |
| shipping_company | text | - | - | ≤100자 | 009 migration 추가 |
| tracking_number | text | - | - | ≤100자 | 009 migration 추가 |
| notes | text | - | - | - | - |
| created_by | uuid | - | - | - | - |
| updated_by | uuid | - | - | - | - |
| created_at | timestamptz | ✅ | now() | - | - |
| updated_at | timestamptz | ✅ | now() | - | trigger |
| deleted_at | timestamptz | - | - | - | soft delete |
| version | integer | ✅ | 1 | - | trigger |

**인덱스**: store_id, customer_id, product_id, status, order_date, ship_date, store_id+status+order_date, deleted_at, updated_at
**RLS**: active member 조회만 가능. INSERT/UPDATE는 보호된 RPC를 통해서만 가능.
**Cross-store 검증**: trigger (customer_id, product_id가 같은 store에 속하는지)
**직접 DML**: INSERT/UPDATE 권한 revoke. 주문 변경은 create_order, update_pending_order, ship_order, cancel_order, complete_order RPC 사용.

---

### inventory_logs

| 필드 | 타입 | 필수 | 기본값 | 제약 | 비고 |
|---|---|---|---|---|---|
| id | uuid | ✅ | gen_random_uuid() | PK | - |
| legacy_id | bigint | - | - | - | 기존 정수 ID 보존 |
| store_id | uuid | ✅ | - | FK(stores) | - |
| product_id | uuid | - | - | FK(products), nullable | - |
| order_id | uuid | - | - | FK(orders), nullable | - |
| change_type | inventory_change_type | ✅ | - | - | - |
| quantity_change | integer | ✅ | - | - | 양수/음수 가능 |
| stock_before | integer | - | - | - | - |
| stock_after | integer | - | - | - | - |
| reserved_before | integer | - | - | - | - |
| reserved_after | integer | - | - | - | - |
| notes | text | - | - | - | - |
| created_by | uuid | - | - | - | - |
| created_at | timestamptz | ✅ | now() | - | - |

**인덱스**: store_id, product_id, order_id, created_at, change_type
**RLS**: active member 조회만. INSERT/UPDATE/DELETE 차단 (append-only)
**Cross-store 검증**: trigger (product_id, order_id가 같은 store에 속하는지)

---

### expenses

| 필드 | 타입 | 필수 | 기본값 | 제약 | 비고 |
|---|---|---|---|---|---|
| id | uuid | ✅ | gen_random_uuid() | PK | - |
| legacy_id | numeric | - | - | - | 소수점 ID 보존 |
| legacy_id_text | text | - | - | - | 소수점 ID 문자열 보존 |
| store_id | uuid | ✅ | - | FK(stores) | - |
| expense_date | date | ✅ | - | - | - |
| category | text | ✅ | - | - | - |
| amount | numeric | ✅ | - | CHECK >= 0 | 0원 허용 |
| description | text | - | - | - | - |
| source_format | text | - | - | - | - |
| created_by | uuid | - | - | - | - |
| updated_by | uuid | - | - | - | - |
| created_at | timestamptz | ✅ | now() | - | - |
| updated_at | timestamptz | ✅ | now() | - | trigger |
| deleted_at | timestamptz | - | - | - | soft delete |
| version | integer | ✅ | 1 | - | trigger |

**인덱스**: store_id, expense_date, category, deleted_at
**RLS**: owner/manager만

---

### classification_keywords

| 필드 | 타입 | 필수 | 기본값 | 제약 | 비고 |
|---|---|---|---|---|---|
| id | uuid | ✅ | gen_random_uuid() | PK | - |
| legacy_id | numeric | - | - | - | 소수점 ID 보존 |
| legacy_id_text | text | - | - | - | 소수점 ID 문자열 보존 |
| store_id | uuid | ✅ | - | FK(stores) | - |
| classification_type | text | ✅ | - | - | - |
| standard_value | text | ✅ | - | - | - |
| ko | text[] | ✅ | '{}' | - | 한국어 키워드 |
| zh | text[] | ✅ | '{}' | - | 중국어 키워드 |
| en | text[] | ✅ | '{}' | - | 영어 키워드 |
| ja | text[] | ✅ | '{}' | - | 일본어 키워드 |
| other_aliases | text[] | ✅ | '{}' | - | 기타 키워드 |
| priority | integer | ✅ | 100 | CHECK >= 0 | - |
| is_active | boolean | ✅ | true | - | - |
| created_by | uuid | - | - | - | - |
| updated_by | uuid | - | - | - | - |
| created_at | timestamptz | ✅ | now() | - | - |
| updated_at | timestamptz | ✅ | now() | - | trigger |
| deleted_at | timestamptz | - | - | - | soft delete |
| version | integer | ✅ | 1 | - | trigger |

**인덱스**: store_id, classification_type, priority, is_active, deleted_at
**RLS**: active member 조회, owner/manager insert/update

---

### store_settings

| 필드 | 타입 | 필수 | 기본값 | 제약 | 비고 |
|---|---|---|---|---|---|
| id | uuid | ✅ | gen_random_uuid() | PK | - |
| store_id | uuid | ✅ | - | FK(stores), UNIQUE | 매장당 1행 |
| store_name | text | - | - | - | - |
| store_subtitle | jsonb | - | - | - | 다국어 지원 |
| exchange_divisor | numeric | ✅ | 165 | CHECK > 0 | 환율 나눗셈 |
| price_multiplier | numeric | ✅ | 3 | CHECK >= 0 | 가격 배수 |
| fixed_addition | numeric | ✅ | 40 | CHECK >= 0 | 고정 추가금 |
| base_discount_rate | numeric | ✅ | 20 | CHECK 0-100 | 기본 할인율 |
| default_language | text | ✅ | 'ko' | CHECK IN ('ko','zh','en','ja') | - |
| created_by | uuid | - | - | - | - |
| updated_by | uuid | - | - | - | - |
| created_at | timestamptz | ✅ | now() | - | - |
| updated_at | timestamptz | ✅ | now() | - | trigger |
| version | integer | ✅ | 1 | - | trigger |

**인덱스**: 없음 (store_id UNIQUE 제외)
**RLS**: owner만

---

### audit_logs

| 필드 | 타입 | 필수 | 기본값 | 제약 | 비고 |
|---|---|---|---|---|---|
| id | bigint | ✅ | generated always as identity | PK | - |
| store_id | uuid | - | - | - | - |
| table_name | text | ✅ | - | - | - |
| record_id | uuid | - | - | - | - |
| action | audit_action | ✅ | - | - | INSERT/UPDATE/SOFT_DELETE/RESTORE |
| old_data | jsonb | - | - | - | 마스킹 적용 |
| new_data | jsonb | - | - | - | 마스킹 적용 |
| changed_by | uuid | - | - | - | auth.uid() |
| changed_at | timestamptz | ✅ | now() | - | - |
| request_id | text | - | - | - | - |
| metadata | jsonb | - | - | - | - |

**인덱스**: store_id, table_name, record_id, changed_at, changed_by
**RLS**: owner 조회만. INSERT/UPDATE/DELETE 차단 (append-only, trigger만 insert)

---

### migration_runs

| 필드 | 타입 | 필수 | 기본값 | 제약 | 비고 |
|---|---|---|---|---|---|
| id | uuid | ✅ | gen_random_uuid() | PK | - |
| store_id | uuid | ✅ | - | FK(stores) | - |
| initiated_by | uuid | - | - | - | - |
| status | migration_status | ✅ | 'PENDING' | - | - |
| source_type | text | - | - | - | - |
| source_fingerprint | text | - | - | - | 중복 감지용 |
| started_at | timestamptz | - | - | - | - |
| completed_at | timestamptz | - | - | - | - |
| product_count | integer | ✅ | 0 | CHECK >= 0 | - |
| customer_count | integer | ✅ | 0 | CHECK >= 0 | - |
| order_count | integer | ✅ | 0 | CHECK >= 0 | - |
| inventory_log_count | integer | ✅ | 0 | CHECK >= 0 | - |
| expense_count | integer | ✅ | 0 | CHECK >= 0 | - |
| keyword_count | integer | ✅ | 0 | CHECK >= 0 | - |
| inserted_count | integer | ✅ | 0 | CHECK >= 0 | - |
| updated_count | integer | ✅ | 0 | CHECK >= 0 | - |
| skipped_count | integer | ✅ | 0 | CHECK >= 0 | - |
| failed_count | integer | ✅ | 0 | CHECK >= 0 | - |
| validation_summary | jsonb | - | - | - | - |
| error_summary | jsonb | - | - | - | - |
| created_at | timestamptz | ✅ | now() | - | - |
| updated_at | timestamptz | ✅ | now() | - | trigger |
| version | integer | ✅ | 1 | - | trigger |

**인덱스**: store_id, status, source_fingerprint, created_at
**RLS**: owner만

---

## 설계 결정 사항

### UUID와 legacy_id

| 테이블 | legacy_id 타입 | legacy_id_text | 이유 |
|---|---|---|---|
| products | bigint | - | 정수 ID |
| customers | bigint | - | 정수 ID |
| orders | bigint | - | 정수 ID |
| inventory_logs | bigint | - | 정수 ID |
| expenses | numeric | ✅ | `Date.now() + Math.random()` 소수점 대응 |
| classification_keywords | numeric | ✅ | 엑셀 임포트 시 소수점 ID 대응 |

### Soft Delete 테이블

stores, products, customers, orders, expenses, classification_keywords

### Append-only 테이블

inventory_logs, audit_logs

### Version 관리

updated_at/version trigger 적용 테이블:
profiles, stores, store_members, products, customers, orders, expenses, classification_keywords, store_settings, migration_runs

### 주문 Snapshot

| 필드 | 목적 |
|---|---|
| customer_name_snapshot | 고객명 변경 시 과거 주문 영향 없음 |
| product_title_snapshot | 상품명 변경 시 과거 주문 영향 없음 |
| brand_snapshot, category_snapshot, color_snapshot, size_snapshot | 상품 정보 변경 시 과거 주문 영향 없음 |
| actual_converted_cost_at_sale, china_cost_at_sale | 원가 변경 시 과거 주문 수익 영향 없음 |

### 같은 Store 외래키 검증

orders와 inventory_logs에 trigger 기반 cross-store 검증 적용.
nullable FK도 정상 처리 (NULL이면 검증 스킵).

### 키워드 배열 변환

기존 문자열 키워드는 마이그레이션 시 `[value]` 형태의 1개 요소 배열로 변환.

### 경비 소수점 legacy ID

`legacy_id`(numeric) + `legacy_id_text`(text) 이중 보존으로 소수점 손실 방지.

### reserved_stock 제약 미적용

`products`에 `reserved_stock <= current_stock` CHECK 제약을 적용하지 않음.
이유: 기존 앱에서 초과 예약 가능, 마이그레이션 데이터 충돌 위험.

---

## 관련 문서

- 초안: [SUPABASE_SCHEMA_DRAFT.md](./SUPABASE_SCHEMA_DRAFT.md)
- 관계: [SUPABASE_RELATIONSHIPS.md](./SUPABASE_RELATIONSHIPS.md)
- RLS: [SUPABASE_RLS_DESIGN.md](./SUPABASE_RLS_DESIGN.md)
- 테스트: [RLS_TEST_PLAN.md](./RLS_TEST_PLAN.md)
- 실행 순서: [SUPABASE_MIGRATION_ORDER.md](./SUPABASE_MIGRATION_ORDER.md)