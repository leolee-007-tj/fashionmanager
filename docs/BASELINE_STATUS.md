# BASELINE STATUS - Pre Supabase Migration

> 생성일: 2026-07-10  
> 목적: Supabase 클라우드 전환 작업 시작 전 기존 앱의 기준 상태를 기록

---

## 1. Git 정보

| 항목 | 값 |
|------|-----|
| Remote | `https://github.com/leolee-007-tj/fashionmanager.git` |
| 현재 브랜치 | `feature/supabase-cloud-migration` |
| 마지막 커밋 | `9890548` - 검색 속도 개선: 매 렌더링마다 자동분류/수익계산 반복하지 않도록 최적화 + 디바운스 300ms 조정 |
| 백업 태그 | `backup/pre-supabase-20260710` |

---

## 2. 실행 방법

```bash
cd /Users/lesoul888/Documents/LESOUL_STORE_APP/github-pages-version
python3 -m http.server 8080
# 브라우저에서 http://localhost:8080 접속
```

---

## 3. 현재 메뉴 구조

| 메뉴 | 파일 | 설명 |
|------|------|------|
| 대시보드 | `js/app.js` | 매출/수익 요약, 최근 판매, 재고 현황 |
| 상품 | `js/products.js` | 상품 등록/수정/삭제, 검색, 자동분류, 체크박스 일괄 처리 |
| 구매(판매) | `js/orders.js` | 판매 등록/수정/삭제, 출고 처리, 검색 |
| 고객 | `js/customers.js` | 고객 등록/수정/삭제, 검색, 상세 내역, TOP 고객 |
| 수익분석 | `js/analytics.js` | 매출/원가/수익/경비 분석, 브랜드별 통계, 환율 연동 |
| 경비관리 | `js/expenses.js` | 경비 등록/수정/삭제, 검색, 월별 필터 |
| 분류키워드 | `js/classification.js` | 키워드 등록/수정/삭제, 자동분류 엔진 |
| Excel 관리 | `js/excel.js` | 엑셀 업로드/다운로드, 템플릿 다운로드 |
| 설정 | `js/settings.js` | 언어 설정, 가격 계산 설정, 데이터 백업/복원 |

---

## 4. 정상 작동 기능

### 4.1 상품 관리
- [x] 상품 등록 (상품명, 브랜드, 카테고리, 색상, 사이즈, 소재, 원가, 재고)
- [x] 상품 수정 / 삭제
- [x] 상품 검색 (상품명, 브랜드, 종류, 색상, 사이즈, 소재, 메모, 상품번호, 원가, 판매가, 재고)
- [x] 년/월 필터
- [x] 정렬 (브랜드, 원가, 재고)
- [x] 체크박스 전체선택 / 개별선택
- [x] 선택 상품 일괄 자동분류
- [x] 선택 상품 년/월 일괄 변경
- [x] 선택 상품 일괄 삭제
- [x] 이미지 업로드

### 4.2 고객 관리
- [x] 고객 등록 (이름, 위챗닉네임, 전화, 주소, 메모)
- [x] 고객 수정 / 삭제
- [x] 고객 검색 (이름, 닉네임, 전화, 이메일, 주소, 메모, 총금액, 주문횟수)
- [x] 고객 상세 (구매 내역, 수익)
- [x] 월별 TOP 3 고객
- [x] 분기별 TOP 고객

### 4.3 판매(구매) 관리
- [x] 판매 등록 (고객, 상품, 수량, 가격, 날짜)
- [x] 판매 수정 / 삭제
- [x] 출고 처리 (SHIPPED)
- [x] 판매 취소 (CANCELLED)
- [x] 완료 처리 (COMPLETED)
- [x] 검색 및 필터

### 4.4 수익분석
- [x] 총 매출 / 원가 / 수익 / 순수익 계산
- [x] 브랜드별 통계
- [x] 월별 추이 그래프
- [x] 환율 연동 (실시간 원화 환산)
- [x] 경비 차감 순수익

### 4.5 Excel 관리
- [x] 상품 엑셀 업로드 (`상품_업로드` 시트)
- [x] 주문출고 엑셀 업로드 (`주문출고_업로드` 시트)
- [x] 엑셀 템플릿 다운로드
- [x] 데이터 엑셀 날짜 형식 지원

### 4.6 분류키워드
- [x] 키워드 CRUD
- [x] 다국어 키워드 지원 (ko, zh, en, ja)
- [x] 자동분류 엔진
- [x] 중복 키워드 정리

### 4.7 설정
- [x] 언어 전환 (한국어, 중국어, 영어, 일본어)
- [x] 가격 계산 설정
- [x] 데이터 JSON 백업/복원
- [x] localStorage 데이터 초기화

---

## 5. 기존 오류 및 경고

| 위치 | 유형 | 내용 | 비고 |
|------|------|------|------|
| `js/analytics.js:31` | `console.warn` | 환율 가져오기 실패 (네트워크 오류 시) | 폴리백 환율(195) 적용 |
| `js/app.js:169` | `console.error` | 페이지 렌더링 예외 처리 | 사용자 플래시 메시지로 전환 |
| `js/db.js:19` | `catch` | localStorage JSON 파싱 실패 | 기본값 반환 |
| `js/settings.js:188` | `catch` | JSON 백업 복원 실패 | 사용자 알림 |
| `js/excel.js:189` | `catch` | 엑셀 파싱 실패 | 사용자 알림 |

---

## 6. 현재 데이터 저장 구조

| 저장소 | 방식 | 키 프리픽스 |
|--------|------|------------|
| localStorage | JSON 직렬화 | `lesoul_gh_` |

### 6.1 localStorage 키 목록

| 키 | 데이터 | 설명 |
|----|--------|------|
| `lesoul_gh_products` | 상품 배열 | 상품 정보 |
| `lesoul_gh_orders` | 주문 배열 | 판매/출고 내역 |
| `lesoul_gh_customers` | 고객 배열 | 고객 정보 + 집계 데이터 |
| `lesoul_gh_expenses` | 경비 배열 | 경비 내역 |
| `lesoul_gh_keywords` | 키워드 배열 | 분류키워드 |
| `lesoul_gh_inventory_logs` | 입출고 배열 | 재고 변동 로그 |
| `lesoul_gh_settings` | 객체 | 앱 설정 |
| `lesoul_gh_language` | 문자열 | 현재 언어 (ko/zh/en/ja) |

---

## 7. 테스트 정보

| 항목 | 값 |
|------|-----|
| 테스트 날짜 | 2026-07-10 |
| 테스트 환경 | macOS, Python 3.13, Chrome/Safari |
| 로컬 서버 | `http://localhost:8080` |
| GitHub Pages | `https://leolee-007-tj.github.io/fashionmanager/` |

---

## 8. 금지사항 (Supabase 전환 작업 중)

- [ ] **기존 파일 삭제 금지** - `js/*.js`, `css/style.css`, `index.html` 등
- [ ] **localStorage 삭제 금지** - 기존 사용자 데이터 보존
- [ ] **기존 데이터 초기화 금지** - `lesoul_gh_*` 키 유지
- [ ] **main 브랜치 직접 수정 금지** - 모든 작업은 `feature/supabase-cloud-migration` 브랜치에서
- [ ] **Supabase 구현 시작 금지** - 0단계 문서 작성 완료 전까지

---

## 9. 파일 구조

```
github-pages-version/
├── index.html              # 메인 HTML
├── css/
│   └── style.css           # 전체 스타일
├── js/
│   ├── app.js              # 라우터, 렌더링, 공통 기능
│   ├── db.js               # localStorage 데이터 계층
│   ├── i18n.js             # 다국어 번역
│   ├── products.js         # 상품 관리
│   ├── orders.js           # 판매(주문) 관리
│   ├── customers.js        # 고객 관리
│   ├── analytics.js        # 수익분석
│   ├── expenses.js         # 경비 관리
│   ├── classification.js   # 분류키워드 + 자동분류 엔진
│   ├── excel.js            # 엑셀 업로드/다운로드
│   ├── settings.js         # 설정 + 백업/복원
│   ├── price-calculator.js # 가격 계산 로직
│   └── app_backup.js       # 앱 백업 (사용 안 함)
├── data_export.json        # 샘플 데이터
└── docs/
    └── BASELINE_STATUS.md  # 본 문서
```

---

## 10. 커밋 이력 (최근)

```
9890548 검색 속도 개선: 매 렌더링마다 자동분류/수익계산 반복하지 않도록 최적화 + 디바운스 300ms 조정
3499b83 버전 파라미터 20260710b로 업데이트 - 캐시 강제 갱신
b9ebe7a 고객 검색: 검색 대상 확장 + 디바운스 적용으로 입력 부드럽게 개선
bdb1142 상품 검색: 검색 대상 확장 + 디바운스 적용으로 입력 부드럽게 개선
16f8f0c 상품 목록에 선택 상품 일괄 자동분류 기능 추가
```
