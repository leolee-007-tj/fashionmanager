# Phase 2 Review (Supabase Schema, RLS, Audit)

> 본 문서는 2단계(스키마 설계, 제약조건, 인덱스, 트리거, RLS, 감사 로그)의 최종 검토 결과이다.
> 개인정보는 포함하지 않는다.

## 완료된 산출물

### SQL 파일 (7개)

| 파일 | 내용 | 라인 |
|---|---|---|
| `001_extensions_and_types.sql` | pgcrypto, 5개 enum | 48 |
| `002_initial_schema.sql` | 12개 테이블 | 247 |
| `003_constraints_and_indexes.sql` | 제약조건, 인덱스 | 207 |
| `004_triggers.sql` | updated_at/version, cross-store 검증 trigger | 149 |
| `005_private_helpers.sql` | private schema, RLS helper, 권한 | 83 |
| `006_rls_policies.sql` | RLS 활성화, 정책, GRANT/REVOKE | 278 |
| `007_audit_functions.sql` | audit 함수, 마스킹, trigger | 158 |

### 문서 (8개)

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

### 테스트 파일 (1개)

| 파일 | 내용 |
|---|---|
| `supabase/tests/rls_access_matrix.sql` | RLS 테스트 24개 시나리오 |

---

## 통계

| 항목 | 수량 |
|---|---|
| 테이블 | 12 |
| enum 타입 | 5 |
| CHECK 제약조건 | 27 |
| UNIQUE 제약조건 | 6 |
| partial unique index | 6 |
| 일반 인덱스 | 42 |
| RLS 활성화 테이블 | 12 |
| RLS 정책 | 30 |
| trigger (updated_at) | 10 |
| trigger (cross-store 검증) | 2 |
| trigger (audit) | 8 |
| helper 함수 | 3 |
| audit 함수 | 3 |
| security definer 함수 | 8 |
| 테스트 시나리오 | 56개 (문서) + 24개 (SQL) |

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
| updated_at 갱신 | ✅ | 10개 테이블 |
| version 증가 | ✅ | version 컬럼 존재 시 |
| created_at 유지 | ✅ | trigger가 created_at 변경 안 함 |
| id 변경 차단 | ✅ | RAISE EXCEPTION |
| store_id 변경 차단 | ✅ | RAISE EXCEPTION |
| append-only 테이블 update 차단 | ✅ | RLS로 INSERT/UPDATE 정책 없음 |

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

### 함수 보안

| 검사 항목 | 결과 | 비고 |
|---|---|---|
| security definer 최소 사용 | ✅ | 필요한 함수에만 적용 |
| `set search_path = ''` | ✅ | 8개 함수 모두 |
| schema-qualified relation | ✅ | public. 또는 private. 명시 |
| public/anon execute revoke | ✅ | |
| authenticated grant 최소화 | ✅ | 필요한 함수에만 |
| RLS recursion 없음 | ✅ | SECURITY DEFINER로 bypass |

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

## Parser 검사

| 항목 | 결과 |
|---|---|
| 자동 parser 검사 | ❌ 미수행 |
| 수동 정적 검사 | ✅ 수행 |
| 실제 적용 전 테스트 프로젝트 실행 | ⏳ 필요 |

**사유**: 로컬에 PostgreSQL parser가 설치되어 있지 않음. 실제 Supabase 테스트 프로젝트에서 실행 전 문법 검증 필요.

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
| SQL 문법 오류 (미실행) | 중간 | 테스트 Supabase에서 001~007 순차 실행 필요 |
| RLS 정책 42710 중복 오류 | 낮음 | 재실행 시 DROP POLICY IF EXISTS 선행 |
| reserved_stock > current_stock 데이터 존재 | 낮음 | 마이그레이션 시 정리 또는 앱 로직으로 처리 |
| staff가 원가/개인정보 컬럼 접근 | 중간 | 향후 제한 view 또는 RPC 필요 |
| 마지막 owner 제거 방지 미구현 | 중간 | 향후 trigger 또는 protected function 필요 |
| 주문 생성/상태 변경 보호된 RPC 미구현 | 중간 | 향후 구현 필요 |
| 초기 owner 생성 방식 미확정 | 낮음 | 관리자 SQL 또는 Edge Function |
| auth.uid() 오버라이드 테스트 함수 보안 | 낮음 | 테스트 전용, 운영 환경 실행 금지 |

---

## 3단계 전 필수 확인사항

- [ ] 테스트 Supabase 프로젝트 생성
- [ ] 001~007 순차 실행 및 문법 오류 확인
- [ ] RLS 테스트 시나리오 24개 실행
- [ ] 초기 owner 생성 방식 확정 (SQL Editor / Edge Function)
- [ ] staff 제한 view 설계 (원가/개인정보 숨김)
- [ ] 주문/재고 RPC 설계
- [ ] Supabase JS client 설정
- [ ] 로그인 구현 (OAuth 또는 이메일)
- [ ] localStorage → Supabase 마이그레이션 스크립트
- [ ] GitHub Support 티켓 처리 완료 확인 (과거 SHA 접근 차단)

---

## 커밋 정보

| 항목 | 값 |
|---|---|
| 브랜치 | feature/supabase-cloud-migration |
| 커밋 메시지 | `docs: finalize supabase schema and rls design` |
| 커밋 SHA | (커밋 후 기록) |

---

## 관련 문서

- 스키마: [SUPABASE_SCHEMA.md](file:///Users/lesoul888/Documents/LESOUL_STORE_APP/github-pages-version/docs/SUPABASE_SCHEMA.md)
- 실행 순서: [SUPABASE_MIGRATION_ORDER.md](file:///Users/lesoul888/Documents/LESOUL_STORE_APP/github-pages-version/docs/SUPABASE_MIGRATION_ORDER.md)
- RLS: [SUPABASE_RLS_DESIGN.md](file:///Users/lesoul888/Documents/LESOUL_STORE_APP/github-pages-version/docs/SUPABASE_RLS_DESIGN.md)