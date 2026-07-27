# LESOUL STORE

부티크 매장 관리를 위한 정적 웹 애플리케이션입니다. 상품·주문·고객·매출 분석을 한 곳에서 관리할 수 있습니다.

> **현재 브랜치**: `feature/supabase-cloud-migration` — Supabase 원격 데이터베이스로 마이그레이션 진행 중  
> **최종 작업 단계**: 3-8A.9-E (Orders UI browser owner smoke 완료)

---

## 주요 기능

| 기능 | 설명 |
|---|---|
| 상품 관리 | 등록·수정·삭제·분류, 재고 추적, Excel 일괄 업로드 |
| 주문 관리 | 주문 등록·출고·취소·완료, 상태별 필터링 |
| 고객 관리 | 고객 등록·병합·구매 이력·집계 |
| 매출 분석 | 월별·연간 수익, 상품별 순위, Chart.js 시각화 |
| 경비 관리 | 경비 등록·조회 |
| Excel import/export | 상품·주문 데이터 일괄 업로드 및 내보내기 |
| 다국어 | 한국어·중국어·영어·일본어 |

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
│   ├── settings.js         # 설정
│   ├── app.js              # 메인 라우터
│   ├── supabase-client.js  # Supabase 클라이언트
│   ├── auth-service.js     # 인증 서비스
│   ├── auth-ui.js          # 인증 UI
│   └── app-bootstrap.js    # 인증 게이트
├── tests/                  # 테스트 (930+)
├── docs/                   # 문서
└── supabase/
    └── migrations/         # Supabase 마이그레이션
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
| **3-8A.9-A** | **Orders UI read-only remote list rendering** | ✅ |
| **3-8A.9-B** | **Orders UI create remote submit** | ✅ |
| **3-8A.9-C** | **Orders UI cancel/edit remote** | ✅ |
| **3-8A.9-D** | **Orders UI ship/complete remote** | ✅ |
| **3-8A.9-E** | **Orders UI browser owner smoke** | ✅ |

### 진행 중 / 예정

| 단계 | 내용 | 상태 |
|---|---|---|
| 3-8A.9-F | Local mode regression smoke | 🔜 예정 |

---

## 시작하기

### 로컬 실행

```bash
# 저장소 클론
git clone git@github.com:leolee-007-tj/fashionmanager.git
cd fashionmanager

# 브랜치 전환
git checkout feature/supabase-cloud-migration

# 로컬 서버 실행 (포트 8080)
python3 -m http.server 8080
```

브라우저에서 `http://localhost:8080`으로 접속합니다.

### 테스트 실행

```bash
# 전체 테스트 (1090+ tests)
node --test tests/*.test.mjs

# Preflight 검사
bash scripts/remote-deployment-preflight.sh
```

---

## 보안

- `js/config.js`는 로컬 전용 파일이며 Git에 커밋되지 않습니다
- `service_role` 키는 브라우저에서 절대 사용하지 않습니다
- Supabase API 키는 publishable/anon key만 사용합니다
- `data_export.json` 등 민감 데이터는 커밋되지 않습니다

---

## 문서

| 문서 | 내용 |
|---|---|
| [docs/CURRENT_ARCHITECTURE.md](docs/CURRENT_ARCHITECTURE.md) | 전체 아키텍처 및 단계별 구현 기록 |
| [docs/ORDERS_REMOTE_DATASOURCE_CONTRACT.md](docs/ORDERS_REMOTE_DATASOURCE_CONTRACT.md) | Orders DataSource 계약 |
| [docs/ORDERS_UI_REMOTE_CONVERSION_PLAN.md](docs/ORDERS_UI_REMOTE_CONVERSION_PLAN.md) | Orders UI 원격 전환 계획 |
| [docs/SUPABASE_REMOTE_DEPLOYMENT_RUNBOOK.md](docs/SUPABASE_REMOTE_DEPLOYMENT_RUNBOOK.md) | 원격 배포 가이드 |