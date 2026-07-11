# Phase 2 Review (Supabase Schema, RLS, Audit)

> 본 문서는 2단계(스키마 설계, 제약조건, 인덱스, 트리거, RLS, 감사 로그)의 최종 검토 결과이다.
> 개인정보는 포함하지 않는다.

## 완료된 산출물

### SQL 파일 (10개)

| 파일 | 내용 | 라인 |
|---|---|---|
| `20260711000100_extensions_and_types.sql` | pgcrypto, 5개 enum | 48 |
| `20260711000200_initial_schema.sql` | 12개 테이블 | 247 |
| `20260711000300_constraints_and_indexes.sql` | 제약조건, 인덱스 | 207 |
| `20260711000400_triggers.sql` | updated_at/version, cross-store 검증 trigger | 149 |
| `20260711000500_private_helpers.sql` | private schema, RLS helper, 권한 | 83 |
| `20260711000600_rls_policies.sql` | RLS 활성화, 정책, GRANT/REVOKE | 278 |
| `20260711000700_audit_functions.sql` | audit 함수, 마스킹, trigger | 158 |
| `20260711000800_auth_onboarding.sql` | 인증 부트스트랩 RPC (ensure_user_profile, create_initial_store) | 199 |
| `20260711000850_auth_onboarding_hardening.sql` | 온보딩 검증 보완 (NULL 체크, 22023, 삭제 store 제외, 64-bit lock) | 201 |
| `20260711000900_order_inventory_rpc.sql` | 주문 lifecycle RPC + 재고 transaction + 직접 DML 차단 | 978 |
| `20260711000950_order_inventory_hardening.sql` | RPC runtime validation hardening (NULL defense, soft-delete check, integer rounding) | 475 |

### 문서 (10개)

| 파일 | 내용 |
|---|---|
| `docs/SUPABASE_SCHEMA_DRAFT.md` | 초안 스키마 설계 |
| `docs/SUPABASE_RELATIONSHIPS.md` | 외래키 관계, ER 다이어그램 |
| `docs/SUPABASE_RLS_DESIGN.md` | RLS 정책 상세 설계 |
| `docs/RLS_TEST_PLAN.md` | RLS 테스트 시나리오 56개 |
| `docs/SUPABASE_SCHEMA.md` | **최종 확정 스키마** |
| `docs/SUPABASE_MIGRATION_ORDER.md` | 실행 순서 및 주의사항 |
| `docs/SECURITY_DATA_EXPOSURE_REMEDIATION.md` | 1단계 보안 조치 (진행 중) |
| `docs/RISK_ANALYSIS.md` | 위험 분석 (부분 해결) |
| `docs/SUPABASE_AUTH_ONBOARDING.md` | 인증 부트스트랩 온보딩 설계 (3-1) |
| `docs/SUPABASE_ORDER_INVENTORY_RPC.md` | 주문/재고 보호 RPC 설계 (3-2) |

### 테스트 파일

#### 실행용 pgTAP 파일 (3개)

| 파일 | 내용 |
|---|---|
| `supabase/tests/rls_access_matrix.test.sql` | pgTAP 실행 파일, 25 assertion (로컬 PASS) |
| `supabase/tests/auth_onboarding.test.sql` | pgTAP 실행 파일, 20 assertion (온보딩 RPC + hardening, 로컬 PASS) |
| `supabase/tests/order_inventory_rpc.test.sql` | pgTAP 실행 파일, 54 assertion (주문/재고 RPC + hardening, 로컬 PASS) |

#### 설명용 시나리오 문서 (1개)

| 파일 | 내용 |
|---|---|
| `docs/RLS_ACCESS_MATRIX_SCENARIOS.sql` | 설명용 시나리오 문서, 30개 (미실행) |

---

## 통계

| 항목 | 수량 |
|---|---|
| 테이블 | 12 |
| enum 타입 | 5 |
| CHECK 제약조건 | 33 | (009: shipping_company, tracking_number 길이 2개 추가) |
| UNIQUE 제약조건 | 5 |
| partial unique index | 6 |
| 일반 인덱스 | 48 |
| RLS 활성화 테이블 | 12 |
| RLS 정책 | 34 | (009: orders INSERT/UPDATE 정책 제거) |
| trigger (updated_at/version) | 9 | (profiles, stores, 6 store_data, store_members) |
| trigger (audit metadata) | 7 | (6개 업무 테이블 + stores 별도 처리) |
| trigger (cross-store + soft-delete 검증) | 2 | orders, inventory_logs |
| trigger (audit log) | 8 | |
| trigger (last owner 보호) | 1 | store_members |
| trigger (migration_runs metadata) | 1 | initiated_by 전용 |
| trigger 총계 | 28 | |
| helper 함수 | 5 | (009: recalculate_customer_aggregates, generate_order_number 2개 추가) |
| audit 함수 | 3 |
| security definer 함수 | 16 | (009: 5개 주문 lifecycle RPC 추가) |
| 테스트 시나리오 | 72개 (문서) + 30개 (SQL 시나리오 문서, 미실행) |
| pgTAP 테스트 파일 | 3개 (25 + 20 + 54 = 99 assertion, **로컬 Supabase 전체 PASS**) |

---

## 정적 검사 결과

### 구조

| 검사 항목 | 결과 | 비고 |
|---|---|---|
| 테이블명 일치 | ✅ | 12개 |
| 컬럼명 일치 | ✅ | 모든 SQL 파일 간 |
| enum 타입 일치 | ✅ | 5개 |
| 파일 실행 순서 | ✅ | 001 → 002 → 003 → 004 → 005 → 006 → 007 |
| 참조 전 생성 여부 | ✅ | 002가 001의 enum 참조, 003~007이 002의 테이블 참조 |

### 제약조건

| 검사 항목 | 결과 | 비고 |
|---|---|---|
| constraint 이름 중복 | ✅ 없음 | |
| index 이름 중복 | ✅ 없음 | |
| partial unique 조건 | ✅ | deleted_at IS NULL / legacy_id IS NOT NULL |
| soft delete 충돌 | ✅ | active-only + 전체 unique 분리 |
| legacy_id 소수점 손실 | ✅ | numeric + text 이중 보존 |
| amount=0 보존 | ✅ | CHECK >= 0 (0 허용) |
| actual_profit 음수 허용 | ✅ | CHECK 없음 |
| stock 제약 충돌 | ⚠️ | reserved_stock <= current_stock 미적용 (의도적) |

### 관계

| 검사 항목 | 결과 | 비고 |
|---|---|---|
| 다른 store 연결 차단 | ✅ | trigger 기반 |
| nullable 관계 | ✅ | customer_id, product_id nullable |
| 상품/고객 soft delete 후 주문 유지 | ✅ | ON DELETE NO ACTION |
| inventory log append-only | ✅ | RLS + trigger |

### 트리거

| 검사 항목 | 결과 | 비고 |
|---|---|---|
| updated_at 갱신 | ✅ | 9개 테이블 (4개 함수로 분리: profiles/stores/store_data/store_member) |
| version 증가 | ✅ | version 컬럼 존재 시 (stores + 6개 업무 테이블 + migration_runs) |
| created_at 유지 | ✅ | trigger가 created_at 변경 차단 |
| created_by 위조 차단 | ✅ | INSERT 시 auth.uid() 자동 설정, UPDATE 시 변경 차단 |
| updated_by 자동 설정 | ✅ | INSERT/UPDATE 시 auth.uid() 자동 설정 |
| id 변경 차단 | ✅ | RAISE EXCEPTION |
| store_id 변경 차단 | ✅ | RAISE EXCEPTION (store_id 있는 테이블에서만) |
| store_members user_id 변경 차단 | ✅ | RAISE EXCEPTION |
| stores no store_id 컬럼 안전 | ✅ | 별도 handle_store_update() 함수 사용 |
| migration_runs initiated_by 안전 | ✅ | 별도 handle_migration_run_metadata() 함수 사용 |
| migration_runs updated_at/version | ✅ | UPDATE 시 now() + version 증가 |
| append-only 테이블 update 차단 | ✅ | RLS로 INSERT/UPDATE 정책 없음 |
| soft-deleted entity 신규 연결 차단 | ✅ | orders, inventory_logs trigger (관계 변경 시만) |
| 과거 주문 변경 허용 | ✅ | 관계 unchanged 시 삭제 상태 재검사 안 함 |
| 마지막 owner 제거 차단 | ✅ | store_members UPDATE trigger + advisory lock |
| 동시성 owner 0명 방지 | ✅ | pg_advisory_xact_lock per store |
| trigger 함수 EXECUTE 권한 제한 | ✅ | PUBLIC/anon/authenticated에서 모두 REVOKE |

### RLS

| 검사 항목 | 결과 | 비고 |
|---|---|---|
| 12개 테이블 RLS 활성화 | ✅ | |
| anon 차단 | ✅ | anon 정책 없음, REVOKE ALL |
| inactive member 차단 | ✅ | is_active = true 체크 |
| owner/manager/staff 구분 | ✅ | |
| privilege escalation 차단 | ✅ | store_members UPDATE는 owner만 |
| UPDATE SELECT 정책 | ✅ | USING 구문 있음 |
| USING/WITH CHECK 구분 | ✅ | INSERT/UPDATE에 WITH CHECK |
| DELETE 기본 차단 | ✅ | REVOKE DELETE |
| cross-store 접근 차단 | ✅ | RLS + trigger 이중 차단 |
| soft delete SELECT 필터 | ✅ | deleted_at IS NULL for active rows |
| owner 복구 SELECT | ✅ | owner can view deleted_at IS NOT NULL |
| staff base table 차단 | ✅ | products/customers/orders SELECT blocked for staff |
| manager deleted rows 차단 | ✅ | manager cannot view soft-deleted rows |

### 함수 보안

| 검사 항목 | 결과 | 비고 |
|---|---|---|
| security definer 최소 사용 | ✅ | 필요한 함수에만 적용 |
| `set search_path = ''` | ✅ | 9개 함수 모두 |
| schema-qualified relation | ✅ | public. 또는 private. 명시 |
| public/anon execute revoke | ✅ | trigger 함수, audit 함수 모두 |
| authenticated grant 최소화 | ✅ | 필요한 함수에만 |
| RLS recursion 없음 | ✅ | SECURITY DEFINER로 bypass |
| 정확한 함수 signature | ✅ | 매개변수 타입까지 명시 |

### 감사 로그

| 검사 항목 | 결과 | 비고 |
|---|---|---|
| 직접 insert 차단 | ✅ | RLS + 권한 제한 |
| phone/email/address/image/notes 마스킹 | ✅ | #- 연산자로 제거 |
| soft delete/restore 구분 | ✅ | determine_audit_action 함수 |
| token/password/secret 미기록 | ✅ | 마스킹 대상 |

### 민감정보

| 검사 항목 | 결과 | 비고 |
|---|---|---|
| 실제 고객명 | ✅ 없음 | |
| 실제 주문 | ✅ 없음 | |
| 실제 상품 원가 | ✅ 없음 | |
| key/secret | ✅ 없음 | |
| data_export.json | ✅ 없음 | SQL 파일에 없음 |

---

## Parser / 실행 검사

| 항목 | 결과 |
|---|---|
| 자동 parser 검사 | ❌ 미수행 (별도 parser 도구 없음) |
| 수동 정적 검사 | ✅ 수행 |
| 로컬 Supabase migration 적용 | ✅ 10개 전체 성공 (001~00950) |
| supabase db lint | ✅ 오류 없음 (001~00950, lint_exit=0) |
| pgTAP 로컬 실행 | ✅ 99/99 PASS (Files=3, Tests=99, Result: PASS) |
| 원격 Supabase 검증 | ❌ 미실행 (금지됨) |
| JS client 통합 테스트 | ❌ 미실행 |
| REST API 통합 테스트 | ❌ 미실행 |
| 실제 Auth 로그인 기반 테스트 | ❌ 미실행 |

**로컬 DB 구조와 RLS 자동화 검증은 통과했으나, 원격 클라우드 환경과 클라이언트 통합은 별도 검증이 필요하다.**

---

## 앱 코드 변경

| 항목 | 변경 수 |
|---|---|
| index.html | 0 |
| css/style.css | 0 |
| js/*.js | 0 |
| localStorage 데이터 | 0 |
| 기존 앱 실행 가능 | ✅ |
| 새 콘솔 오류 | 없음 |

---

## 남은 위험

| 위험 | 수준 | 대응 |
|---|---|---|
| SQL 문법 오류 | 낮음 | 로컬 7개 migration 적용 성공, lint 통과 |
| RLS 정책 42710 중복 오류 | 낮음 | 재실행 시 DROP POLICY IF EXISTS 선행 |
| reserved_stock > current_stock 데이터 존재 | 낮음 | 마이그레이션 시 정리 또는 앱 로직으로 처리 |
| staff 업무 기능 미지원 | 중간 | base table SELECT 차단됨. 제한 view/RPC 구현 전 staff는 업무 데이터 접근 불가 |
| 주문 생성/상태 변경 보호된 RPC 미구현 | 중간 | 향후 구현 필요 |
| 초기 owner 생성 방식 미확정 | 낮음→해결 | 3-1 onboarding RPC로 해결 (ensure_user_profile + create_initial_store) |
| JS client 통합 테스트 미실행 | 중간 | @supabase/supabase-js 클라이언트로 RLS 재검증 필요 |
| REST API / PostgREST 동작 미확인 | 낮음 | 실제 network 요청으로 검증 필요 |
| 실제 Auth 로그인 사용자 테스트 미실행 | 중간 | 실제 회원가입/로그인 흐름 검증 필요 |
| 원격 Supabase 클라우드 검증 미실행 | 중간 | 운영 배포 전 원격 환경에서 재검증 필요 |
| GitHub Support 과거 객체 purge 미완료 | 낮음 | 지원 티켓 처리 대기 중 |
| 대량 데이터 성능 미검증 | 낮음 | Phase 3 이후 성능 테스트 필요 |
| 동시성/race condition 통합 테스트 미실행 | 낮음 | advisory lock 로직은 단위 수준에서 검증, 실제 동시성 통합은 별도 |

---

## 3단계 전 필수 확인사항

### Phase 2에서 완료된 항목

- [x] 001~007 migration 로컬 적용 성공
- [x] supabase db lint 오류 없음
- [x] pgTAP 99/99 PASS (로컬 Supabase — 25 RLS + 20 onboarding + 54 order/inventory)
- [x] 로컬 DB 구조 + RLS 자동화 검증 통과
- [x] trigger runtime 오류 해결
- [x] soft delete SELECT 정책
- [x] 마지막 owner 보호
- [x] created_by/updated_by 위조 차단
- [x] staff base table 차단

### Phase 3-1 완료: Auth Onboarding Bootstrap

- [x] 008 migration 추가 (ensure_user_profile, create_initial_store)
- [x] bootstrap deadlock 해결 (SECURITY DEFINER RPC)
- [x] idempotent onboarding (중복 호출 시 기존 store_id 반환)
- [x] advisory transaction lock (동시성 제어)
- [x] pgTAP onboarding 테스트 12개 추가

### Phase 3-1.1 완료: Auth Onboarding Validation Hardening

- [x] 00850 hardening migration 추가 (CREATE OR REPLACE FUNCTION)
- [x] explicit NULL 입력 차단 (p_preferred_language, p_name, p_default_language)
- [x] SQLSTATE 22023 적용 (모든 입력 검증 오류)
- [x] 삭제된 store는 idempotent onboarding 대상에서 제외
- [x] advisory lock 64-bit 결정적 키 (hashtextextended seed 0)
- [x] pgTAP 테스트 8개 추가 (T13-T20: NULL 검증, 삭제 store, 권한 확인)
- [x] 총 20 assertion (12 → 20)

### Phase 3-2 완료: Protected Order and Inventory Transaction RPC

- [x] 009 migration 추가 (orders 배송필드, 2개 private helper, 5개 공개 RPC, DML 차단)
- [x] create_order RPC (PENDING 생성, 예약 재고, RESERVE log, snapshot 자동 저장)
- [x] update_pending_order RPC (수량/상품 변경 시 예약 조정, deadlock 방지 UUID 정렬)
- [x] ship_order RPC (PENDING→SHIPPED, 실제 재고 차감, 수익 계산, 고객 집계 갱신)
- [x] cancel_order RPC (PENDING→CANCELLED, 예약 해제, RELEASE log)
- [x] complete_order RPC (SHIPPED→COMPLETED, 고객 집계 재계산)
- [x] orders 직접 INSERT/UPDATE 권한 revoke + 정책 삭제
- [x] products 재고 컬럼 직접 수정 차단 (column-level grant)
- [x] customers 집계 컬럼 직접 수정 차단 (column-level grant)
- [x] pgTAP 테스트 54개 추가 (생성/수정/출고/취소/완료 + DML 차단 + cross-store + hardening + 회귀)
- [x] 주문번호 자동 생성 (ORD-0001 형식, store별, advisory lock)

### Phase 3-2.1 완료: Order/Inventory RPC Hardening

- [x] 00950 migration 추가 (NULL 입력 방어, soft-delete 검증, legacy 처리, 정수 반올림)
- [x] update_pending_order: p_customer_id, p_product_id, p_order_date NULL 차단 (22023)
- [x] update_pending_order: 같은 상품 경로에서도 deleted_at IS NULL 검증
- [x] update_pending_order: 기존 product_id NULL 시 명확한 오류 (legacy repair 필요)
- [x] update_pending_order: 기존 product 행 없을 시 데이터 불일치 오류
- [x] ship_order: 정수 반올림 (profit, profit_margin, cost_ratio) — 기존 웹앱과 동일
- [x] recalculate_customer_aggregates: deleted_at IS NULL 고객만 집계 갱신
- [x] actual_converted_cost 단위를 CNY로 문서 수정
- [x] china_cost_at_sale을 중국 기준가(CNY)로 문서 수정

### Phase 3-2.2 완료: pgTAP Suite Repair

- [x] 잘못된 UUID 5종 교체 (pppp→10000000-...001, qqqq→...002, rrrr→...003, llll→20000000-...001, iiii→20000000-...002)
- [x] T41 FK 위반 fixture 수정 (session_replication_role = replica로 우회 후 origin 복원)
- [x] T45 삭제 고객 테스트 수정 (create_order 호출 제거, helper 직접 호출로 sentinel 검증)
- [x] pgTAP plan 수 수정 (46 → 54, 실제 assertion 수와 일치)
- [x] 총 99 assertion (25 + 20 + 54), 로컬 Supabase 전체 PASS

### Phase 3-2.3 완료: Deterministic pgTAP Fixtures and Local Validation

- [x] auth_onboarding T18/T19 수정: create_initial_store 반환 ID를 temp table에 저장
- [x] order_inventory_rpc T3/T26/T36/T42/T46 수정: create_order 반환 ID를 직접 저장 (created_at 정렬 제거)
- [x] order_inventory_rpc T28 수정: order_id 기준 RELEASE log 검사
- [x] rls_access_matrix T6/T7 수정: 직접 INSERT 대신 create_order RPC로 cross-store 검증 (22023)
- [x] 로컬 Supabase 전체 검증 성공: migration 10개 적용, lint 오류 0, Files=3, Tests=99, Result: PASS

### Phase 3 전 추가 준비 (미완료)

- [ ] staff 제한 view 설계 (원가/개인정보 숨김)
- [ ] Supabase JS client 설정
- [ ] 로그인 구현 (OAuth 또는 이메일)
- [ ] localStorage → Supabase 마이그레이션 스크립트
- [ ] JS client 통합 테스트
- [ ] 원격 Supabase 클라우드 환경 검증
- [ ] GitHub Support 티켓 처리 완료 확인 (과거 SHA 접근 차단)

---

## 커밋 정보

| 항목 | 값 |
|---|---|
| 브랜치 | feature/supabase-cloud-migration |
| 최신 커밋 메시지 | `test: make supabase pgTAP fixtures deterministic` |
| 최신 커밋 SHA | a5bd3286b163f3ae23d821d980d41bcbe0a07a13 |
| Phase 2 상태 | 로컬 DB 구조 + RLS 자동화 검증 통과 |

---

## 관련 문서

- 스키마: [SUPABASE_SCHEMA.md](./SUPABASE_SCHEMA.md)
- 실행 순서: [SUPABASE_MIGRATION_ORDER.md](./SUPABASE_MIGRATION_ORDER.md)
- RLS: [SUPABASE_RLS_DESIGN.md](./SUPABASE_RLS_DESIGN.md)
- 테스트 계획: [RLS_TEST_PLAN.md](./RLS_TEST_PLAN.md)