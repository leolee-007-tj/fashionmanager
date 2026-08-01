# LESOUL STORE

부티크 매장 관리를 위한 정적 웹 애플리케이션입니다. 상품·주문·고객·매출 분석을 한 곳에서 관리할 수 있습니다.

> **현재 브랜치**: `feature/supabase-cloud-migration` — Supabase 원격 데이터베이스로 마이그레이션 진행 중
> **최종 작업**: 3-8A.10 (Cleanup and Go/No-Go 완료) + Cancel RPC Root-Cause Fix
> **총 커밋**: 214 commits | **개발 기간**: 2026-07-07 ~ 2026-08-01 (26일)
>
> **내부 운영 테스트**: ✅ GO | **외부 공개/상용 서비스**: ❌ NO-GO

---

## 주요 기능

| 기능 | 설명 |
|---|---|
| 상품 관리 | 등록·수정·삭제·분류, 재고 추적, Excel 일괄 업로드 |
| 주문 관리 | 주문 등록·출고·취소·완료, 상태별 필터링, 원격 RPC |
| 고객 관리 | 고객 등록·병합·구매 이력·집계, TOP3/TOP2 |
| 매출 분석 | 월별·연간 수익, 상품별 순위, Chart.js 시각화 |
| 경비 관리 | 경비 등록·조회 |
| Excel import/export | 상품·주문 데이터 일괄 업로드 및 내보내기 |
| 다국어 | 한국어·중국어·영어·일본어 |
| 인증/멤버십 | Supabase Auth, 초대코드 기반 스토어 멤버 관리 |

---

## 기술 스택

| 항목 | 내용 |
|---|---|
| 앱 유형 | 정적 HTML/JS/CSS SPA (서버 백엔드 없음) |
| 호스팅 | GitHub Pages |
| 데이터 저장 | 브라우저 localStorage → Supabase PostgreSQL (마이그레이션 중) |
| 인증 | Supabase Auth (feature flag 제어) |
| 라우팅 | Hash 기반 (`#/dashboard`, `#/products` 등) |
| 빌드 | 없음 (원본 파일 그대로 실행) |

---

## 디렉터리 구조

```
├── index.html              # 진입점
├── css/
│   └── style.css           # 프리미엄 부티크 테마
├── js/
│   ├── i18n.js             # 다국어
│   ├── db.js               # 데이터 게이트웨이 (localStorage + Supabase)
│   ├── products.js         # 상품 관리
│   ├── orders.js           # 주문 관리
│   ├── customers.js        # 고객 관리
│   ├── analytics.js        # 매출 분석
│   ├── expenses.js         # 경비 관리
│   ├── excel.js            # Excel import/export
│   ├── smart-inventory-importer.js  # 스마트 상품 import
│   ├── settings.js         # 설정
│   ├── app.js              # 메인 라우터
│   ├── supabase-client.js  # Supabase 클라이언트
│   ├── auth-service.js     # 인증 서비스
│   ├── auth-ui.js          # 인증 UI
│   └── app-bootstrap.js    # 인증 게이트
├── tests/                  # 테스트 (960+)
├── docs/                   # 문서
├── scripts/                # 배포/검증 스크립트
└── supabase/
    └── migrations/         # Supabase 마이그레이션
```

---

## 개발 노트: 전체 작업 타임라인

### Phase 1: 초기 버그 수정 및 UI 개선 (2026-07-07 ~ 07-09)

| 날짜 | 작업 내용 |
|---|---|
| 07-07 | 번역 수정, 국기-only 언어 선택기, 분류키워드 수정, Excel 템플릿 번역 |
| 07-07 | Excel 컬럼 매핑, export 제거, Excel 템플릿 추가, 재고 관리 제거 |
| 07-07 | product_code 컬럼 제거, 고객 페이지 리디자인 (VIP 제거, TOP3/TOP2, 아바타) |
| 07-07 | 체크박스 선택 완전 재구현, 전체 선택/삭제 기능 추가 |
| 07-07 | original_title → product title로 변경, 분류키워드 확장 |
| 07-07 | 구매데이터 업로드 버그 수정, "구매"→"판매" 용어 변경 |
| 07-08 | 고객 페이지: 1970.01 날짜 오류, 판매내역 정리, TOP3 이름매칭 |
| 07-08 | 수익분석 페이지 전면 재작성, 차트 y축 통일, 환율 적용 |
| 07-08 | 엑셀 날짜 일련번호(45682) 변환, 기본 연도 2026으로 변경 |
| 07-09 | 분류키워드 페이지 유형별 그룹화, 상품 목록에 분류키워드 자동 적용 |
| 07-09 | 판매 목록 기본 정렬 판매일순, 고객 목록 중복 정리, 판매 내역 수정/삭제 |
| 07-10 | 상품 검색 + 고객 검색: 검색 대상 확장, 디바운스 적용 |
| 07-10 | JS/CSS 버전 파라미터 추가 (캐시 갱신), 선택 상품 일괄 자동분류 |

### Phase 2: Supabase Schema Foundation (2026-07-10 ~ 07-12)

| 날짜 | 작업 내용 |
|---|---|
| 07-10 | 현재 localStorage 아키텍처 분석, 민감 데이터 제거 (git filter-repo) |
| 07-10 | Supabase 타입/기본 스키마, 제약조건/인덱스/헬퍼, RLS 감사 |
| 07-10 | Supabase 스키마/RLS 최종 설계 |
| 07-11 | Supabase trigger 런타임/테스트 이슈 해결, 마이그레이션/RLS 로컬 검증 |
| 07-11 | pgTAP 테스트 보강, order inventory RPC 검증 및 하드닝 |
| 07-11 | Auth onboarding bootstrap, secure auth client foundation |
| 07-11 | Feature-flagged Supabase Auth Gate, auth lifecycle 안정화 |
| 07-12 | Local Supabase Auth RPC integration test, preflight 결정적 실행 |

### Phase 3: Products Remote DataSource (2026-07-19 ~ 07-21)

| 날짜 | 작업 내용 |
|---|---|
| 07-19 | Data Gateway async boundary 문서화, Products read/write async boundary |
| 07-19 | Products DataSource boundary 추출, Supabase mapping contract |
| 07-19 | Products Supabase DataSource skeleton → read → write contract |
| 07-20 | Products write RPC foundation, DataSource runtime feature gate |
| 07-20 | LESOUL brand 설정, 브랜드 철자 통일 |
| 07-21 | Products remote runtime guardrail, batch actions DataSource-safe |
| 07-21 | Remote deployment readiness runbook, config secret safety |
| 07-21 | Remote deployment command gate, Auth signup/login UI |

### Phase 4: Remote Production Readiness (2026-07-21 ~ 07-23)

| 날짜 | 작업 내용 |
|---|---|
| 07-21 | Remote production readiness freeze audit (PASS) |
| 07-22 | Auth Role & Guest Mode Architecture 설계 |
| 07-22 | Auth Onboarding & Guest Mode Gap Audit |
| 07-22 | JS-only Guest Mode Gate (3-6C) |
| 07-23 | Guest mode에서 local products datasource fallback |
| 07-23 | create_initial_store 보안 하드닝 (invite code) |
| 07-23 | Store invitations foundation migration, public grants 하드닝 |

### Phase 5: Auth & Store Membership (2026-07-23 ~ 07-24)

| 날짜 | 작업 내용 |
|---|---|
| 07-23 | create_initial_store invite-code pre-push review, dry-run, remote push |
| 07-24 | Store invitation management RPCs, generate_store_invite_code |
| 07-24 | Invite code join UI, LESOUL context gate to active members |
| 07-24 | Owner member management UI, store member management RPCs |
| 07-24 | Non-owner member UI access smoke, billing subscription placeholder |

### Phase 6: Premium UI Theme (2026-07-25)

| 날짜 | 작업 내용 |
|---|---|
| 07-25 | Premium boutique UI polish plan, theme foundation |
| 07-25 | Dashboard premium cards, products premium list |
| 07-25 | Auth onboarding premium flow, member invite management premium UI |
| 07-25 | Mobile responsive premium layout |

### Phase 7: Orders Remote DataSource (2026-07-25 ~ 07-27)

| 날짜 | 작업 내용 |
|---|---|
| 07-25 | Orders Remote Data Source plan, RPC contract audit |
| 07-25 | Orders DataSource contract 설계, read-only prototype |
| 07-25 | Orders mapping tests, createOrder RPC adapter |
| 07-26 | Status RPC adapters (cancel, ship, complete) |
| 07-26 | Orders remote browser smoke 준비 및 실행 |
| 07-26 | Orders UI remote readonly rendering (3-8A.9-A) |
| 07-26 | Orders UI create remote submit (3-8A.9-B) |
| 07-26 | Orders UI cancel/edit remote (3-8A.9-C) |
| 07-27 | Orders UI ship/complete remote (3-8A.9-D) |
| 07-27 | Orders UI browser owner smoke, local regression smoke |
| 07-27 | Orders cleanup Go/No-Go, role smoke readiness |

### Phase 8: Product Import Stabilization (2026-07-27 ~ 07-30)

| 날짜 | 작업 내용 |
|---|---|
| 07-27 | Product import visibility 복구 |
| 07-27 | Product list blank & delete flow 복구 |
| 07-28 | Dashboard & product list counts 정렬 |
| 07-28 | Product import month visibility 정렬 |
| 07-29 | Product delete identity handling 하드닝 |
| 07-29 | Product import counts & delete flow 보호 |
| 07-29 | Stabilization & metrics contract tests |
| 07-29 | Bulk soft delete RPC 추가, 486개 테스트 상품 정리 |
| 07-29 | Controlled product QA automation |
| 07-30 | Product upload allocator stale cache & QA harness 버그 수정 |
| 07-30 | Excel import 버그 3건 수정, 입고년도/월 자동 감지 |
| 07-30 | 고객 업로드 raw:true 적용, 고객목록 2025년부터 표시 |
| 07-30 | 모든 목록 기본 연도 2026→2025 통일, 대시보드 고객 수 '개'→'명' |

### Phase 9: Sales UI & Smart Import (2026-07-31)

| 날짜 | 작업 내용 |
|---|---|
| 07-31 | importOrders 컬럼명 인식 확장, 로깅 추가 |
| 07-31 | Excel 관리 '구매'→'판매' 용어 통일 |
| 07-31 | 입고년도/월 선택 UI 제거 (엑셀값 자동 감지) |
| 07-31 | 액션 바에서 전체선택 체크박스 제거 |
| 07-31 | 판매 UI 단순화: select 제거, text input + datalist |
| 07-31 | Import products by identity, 중복 상품 1행만 표시 |
| 07-31 | Sales list selection & delete flow 안정화 |
| 07-31 | Smart importer: fixed Excel import 대체 |
| 07-31 | Sales cancel 실패 분류 및 selection 보존 |
| 07-31 | Select-all checkbox persistence + smart import customer 저장 |

### Phase 10: Cancel RPC Root-Cause Fix (2026-07-31 ~ 08-01)

| 날짜 | 작업 내용 |
|---|---|
| 07-31 | Sales cancel crash 방지: ds ReferenceError 수정 |
| 07-31 | classifyCancelOrderError: error code/details/hint/status 기반 분류 |
| 08-01 | safeErrors: UUID/민감정보 제외한 오류 상세를 summary에 저장 |
| 08-01 | App.flash: failReasons 기준 원인별 메시지 분기 |
| 08-01 | PENDING 아닌 주문 삭제 버튼 비활성화 (onclick 제거 + title) |
| 08-01 | _batchCancelRemote: PENDING 아닌 주문은 RPC 호출 전 skip |
| 08-01 | remote_id only cancel: legacy_id/id는 RPC로 전달하지 않음 |
| 08-01 | 30개 contract test 추가 (RC1-RC30), preflight PASS |

---

## Cancel Order RPC 오류 분류 체계

`classifyCancelOrderError(error)` 함수는 다음 기준으로 실패 원인을 분류합니다:

| 분류 | 조건 | 사용자 메시지 |
|---|---|---|
| `ORDER_NOT_PENDING` | error details에 status mismatch | 대기(PENDING) 상태 주문만 삭제/취소할 수 있습니다 |
| `RPC_MISSING_OR_SIGNATURE_MISMATCH` | PGRST202, 404, function not found | cancel_order RPC 구성이 현재 코드와 맞지 않습니다 |
| `PERMISSION_DENIED` | 401/403, RLS violation | 권한 문제로 판매 삭제/취소가 실패했습니다 |
| `INVALID_REMOTE_ID` | UUID validation 실패 | 주문 고유번호 연결이 잘못되었습니다 |
| `ORDER_NOT_FOUND` | 404, order not found | 해당 주문을 찾을 수 없습니다 |
| `UNKNOWN_CANCEL_ORDER_ERROR` | 기타 | 상세 오류를 콘솔 summary에 기록했습니다 |

### 디버그: `window.__LAST_ORDER_DELETE_SUMMARY`

실패 후 브라우저 콘솔에서 확인 가능:
```js
window.__LAST_ORDER_DELETE_SUMMARY
// {
//   mode, requestedCount, successCount, failCount,
//   skippedNotPending, invalidIdCount,
//   beforeActiveCount, afterActiveCount, countDelta,
//   failReasons: ["ORDER_NOT_PENDING", ...],
//   safeErrors: [{ classifier, code, status, message, details, hint }]
// }
```

---

## Supabase 마이그레이션 진행 상황

### 완료된 단계

| 단계 | 내용 | 상태 |
|---|---|---|
| 3-4B | Auth Gate UI (feature flag) | ✅ |
| 3-5C | Products write async boundary | ✅ |
| 3-5L | Products Supabase DataSource + RPC | ✅ |
| 3-6E | Store Invitations / Members RPC | ✅ |
| 3-7B~G | Premium UI Theme | ✅ |
| 3-8A.2 | Orders DataSource Contract | ✅ |
| 3-8A.3 | Orders Read-only Prototype | ✅ |
| 3-8A.4 | Orders Mapping Tests | ✅ |
| 3-8A.5 | createOrder RPC Adapter | ✅ |
| 3-8A.6 | Status RPC Adapters | ✅ |
| 3-8A.7 | Browser Owner Smoke | ✅ |
| 3-8A.9-Prep | Orders UI remote conversion audit | ✅ |
| 3-8A.9-A | Orders UI read-only remote list rendering | ✅ |
| 3-8A.9-B | Orders UI create remote submit | ✅ |
| 3-8A.9-C | Orders UI cancel/edit remote | ✅ |
| 3-8A.9-D | Orders UI ship/complete remote | ✅ |
| 3-8A.9-E | Orders UI browser owner smoke | ✅ |
| 3-8A.9-F | Local mode regression smoke | ✅ |
| 3-8A.10 | Cleanup and Go/No-Go | ✅ |
| Cancel-FIX | Cancel RPC root-cause fix + safeErrors + 30 tests | ✅ |

### 예정

| 단계 | 내용 | 상태 |
|---|---|---|
| 3-8A.10-A | Manager/Staff browser smoke | 🔜 예정 |
| 3-8A.10-B | Remote UI post-bugfix smoke | 🔜 예정 |
| 3-8B | Analytics/Customers remote integration audit | 🔜 예정 |
| 3-9 | Backup/export/import policy | 🔜 예정 |

---

## 시작하기

### 로컬 실행

```bash
git clone git@github.com:leolee-007-tj/fashionmanager.git
cd fashionmanager
git checkout feature/supabase-cloud-migration
python3 -m http.server 8080
```

브라우저에서 `http://localhost:8080`으로 접속합니다.

### 테스트 실행

```bash
# 전체 테스트
node --test tests/*.test.mjs

# Cancel RPC contract tests (30 tests)
node --test tests/orders-cancel-rpc-root-cause-contract.test.mjs

# Preflight 검사
bash scripts/remote-deployment-preflight.sh
```

---

## 보안

- `js/config.js`는 로컬 전용 파일이며 Git에 커밋되지 않습니다
- `service_role` 키는 브라우저에서 절대 사용하지 않습니다
- Supabase API 키는 publishable/anon key만 사용합니다
- `data_export.json` 등 민감 데이터는 커밋되지 않습니다
- `__LAST_ORDER_DELETE_SUMMARY`에 UUID/token/key/password 미포함

---

## 문서

| 문서 | 내용 |
|---|---|
| [docs/CURRENT_ARCHITECTURE.md](docs/CURRENT_ARCHITECTURE.md) | 전체 아키텍처 및 단계별 구현 기록 |
| [docs/ORDERS_REMOTE_DATASOURCE_CONTRACT.md](docs/ORDERS_REMOTE_DATASOURCE_CONTRACT.md) | Orders DataSource 계약 |
| [docs/ORDERS_UI_REMOTE_CONVERSION_PLAN.md](docs/ORDERS_UI_REMOTE_CONVERSION_PLAN.md) | Orders UI 원격 전환 계획 |
| [docs/SUPABASE_REMOTE_DEPLOYMENT_RUNBOOK.md](docs/SUPABASE_REMOTE_DEPLOYMENT_RUNBOOK.md) | 원격 배포 가이드 |
| [docs/METRICS_SOURCE_OF_TRUTH.md](docs/METRICS_SOURCE_OF_TRUTH.md) | 메트릭 기준 문서 |