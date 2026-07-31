# Smart Excel Import (스마트 엑셀 가져오기)

> **기존 엑셀 업로드 기능을 완전히 대체합니다.**
> 고정 템플릿이 필요 없으며, 시트명/컬럼명/순서/표기가 달라도 자동으로 인식합니다.

## 핵심 원칙

1. **고정 템플릿 금지**: 사용자가 예전에 쓰던 재고정리 엑셀을 그대로 올리면 프로그램이 알아서 분석
2. **Fuzzy Matching**: 시트명, 컬럼명, 순서, 표기 차이를 유도리 있게 인식
3. **계산식 무시**: 엑셀 계산식 결과는 무시하고 앱에서 다시 계산
4. **Preview-First**: 저장은 반드시 미리보기 후 사용자 확인을 거쳐야 함
5. **No Hard-Coded Values**: 행 수, 컬럼 수 등 모든 수치는 동적으로 계산

## 동작 방식

### 1. 파일 업로드
- 사용자가 `.xlsx` 또는 `.xls` 파일을 선택
- `XLSX.read()`로 workbook 읽기

### 2. 시트 자동 분류

시트명과 헤더 패턴을 기반으로 분류:

| 분류 | 역할 | 예시 시트명 |
|------|------|------------|
| product | 상품 생성 source | 제품목록, 상품목록, products |
| inbound | 입고 생성 source | 입고, 추가입고, stock in |
| sales | 판매/출고 생성 source | 출고, 판매, 판매목록, orders |
| inventory | 검증용 (저장 안 함) | 현재재고, 재고, inventory |
| salesSummary | 검증용 (저장 안 함) | 출고액, 매출요약 |
| customerSummary | 참고용 | 고객이름, 고객, customers |
| brand | 참고/정규화용 | 브랜드목록, 브랜드, brands |

시트명이 달라도 헤더 기준으로 fallback 분류한다.

### 3. 컬럼 Fuzzy Matching

컬럼명을 정확히 맞추지 않아도 된다:

- 공백 제거, 대소문자 무시
- 한글/영문 alias 허용 (예: `제품명`=`상품명`=`title`)
- 오타/표기 차이 일부 허용
- 괄호 내용 보존하되 비교 시 보조 처리

**상품 필드 alias 예시**:
- `brand`: 브랜드, brand, Brand
- `title`: 제품명, 상품명, 품명, 아이템명, title, product_name
- `cost`: 원가, 매입원가, 한국원가, 원가(₩), 원가(KRW), cost, korea_cost
- `sellingBasePrice`: 판매가, 판매가(RMB 자동), 중국판매가, 기준판매가, base_price
- `stock`: 초기재고, 현재재고, 재고, 상품수량, 수량, stock, quantity
- `stockYear`: 입고년도, 입고연도, 년도, 연도, year, stock_year
- `stockMonth`: 입고월, 월, month, stock_month

**판매/출고 필드 alias 예시**:
- `orderDate`: 판매일, 출고일, 주문일, 결제일, 날짜, order_date, sale_date
- `customerName`: 고객이름, 고객명, 고객, 구매자, 수령인, customer, customer_name
- `source`: 판매출처, 판매처, 출처, 채널, 플랫폼, 메모, source, channel, platform
- `actualSellingPrice`: 실제판매가, 최종판매가, 결제금액, 금액, 판매금액, actual_selling_price

### 4. 계산식/Cached Value 처리

- 엑셀 셀이 formula인 경우 cached calculated value 우선 사용
- `#NAME?`, `#VALUE!`, `#REF!`, `#DIV/0!`, `#N/A` → 신뢰하지 않음
- 수식 자체는 저장하지 않음
- 앱에서 재계산 가능한 값은 재계산

재계산 대상:
- 중국 판매가, 기준 판매가
- 실제 이익, 이익률
- 현재재고, 총 원가, 총 판매가, 판매 합계

### 5. 날짜 추론

우선순위:
1. Row 내 날짜 컬럼
2. 시트 내 날짜 정보
3. 파일명에서 year/month 추론 (예: `2026_6cloth수정.xlsx` → 2026년 6월)
4. 업로드 UI 선택값
5. 없으면 warning

지원 포맷: `2026-06-01`, `2026/06/01`, `2026.06.01`, `2026年6月1日`, Excel serial date

### 6. 상품 Identity Key

중복 방지를 위한 identity key:
```
brand + normalized_title + color + size + korea_cost + stock_year + stock_month
```

색상/사이즈가 별도 컬럼에 없으면:
```
brand + normalized_title + korea_cost + stock_year + stock_month
```

- `product_code`는 identity가 아님
- `id`/`legacy_id`/`remote_id`도 identity가 아님
- 같은 identity는 목록에 하나만 존재
- 같은 파일 재업로드 시 중복 생성 금지

### 7. 상품 처리 정책

- product sheet에서 추출
- 기존 상품 identity가 있으면 새로 만들지 않음
- 신규 identity만 생성 후보
- 파일 내 같은 identity는 병합
- 재고는 합산하거나 preview에서 병합 표시

### 8. 입고 처리 정책

- inbound sheet에서 추출
- 상품 identity와 연결
- 기존 상품이면 입고 수량 반영 후보
- 없는 상품이면 `unmatchedInboundProduct`로 표시
- 자동으로 새 상품 생성하지 않음 (사용자 승인 필요)

### 9. 판매/출고 처리 정책

- outbound/sales sheet에서 추출
- 판매일, 브랜드, 제품명, 수량, 고객이름, 판매가, 판매출처 추출
- 상품 matching 성공 row만 판매 생성 후보
- 고객 matching 성공 또는 신규 고객 생성 후보
- matching 실패는 `reviewNeeded`

### 10. 고객 처리 정책

- sales/outbound sheet의 고객이름 컬럼 우선
- customer summary sheet는 참고용
- 기존 고객 이름과 매칭
- 없으면 신규 고객 후보
- source-like 값은 고객으로 저장하지 않고 `reviewNeeded`

**source-like 예시**: 手机, 发货, 自留, 微信, 淘宝, 小红书, phone, delivery, self-use, wechat, taobao

### 11. 판매출처 자동 분류

- `微信` / `위챗` / `wechat` → wechat
- `淘宝` / `taobao` → taobao
- `小红书` / `xiaohongshu` → xiaohongshu
- `手机` / `phone` → phone
- `自留` → self_use
- `发货` → delivery_note
- 헷갈리는 경우 자동 저장하지 않고 `reviewNeeded`

### 12. Verification-Only 시트

저장 source가 아니라 검증용:

| 시트 | 용도 |
|------|------|
| 현재재고 | 앱 계산 재고와 비교, mismatch warning |
| 출고액 | 앱 계산 판매액/이익/마진과 비교, mismatch warning |
| 고객이름 | 출고 sheet 고객 추출 결과와 비교, summary-only |
| 브랜드목록 | brand normalization/reference, 상품 생성 source로 직접 사용 안 함 |

## Preview Data Model

`window.__LAST_SMART_EXCEL_IMPORT_PREVIEW`:

```
{
  workbookName, detectedSheets, sheetRoles,
  inferredYear, inferredMonth,
  productRows, validProductRows,
  inboundRows, validInboundRows,
  salesRows, validSalesRows,
  detectedCustomers, detectedSources,
  newProductCandidates, existingProductMatches,
  duplicateProductIdentities,
  newCustomerCandidates, existingCustomerMatches,
  salesCreateCandidates, unmatchedSalesProducts,
  unmatchedInboundProducts,
  formulaErrorCount, inventoryVerificationMismatchCount,
  salesSummaryMismatchCount, reviewNeededCount,
  warnings, errors
}
```

## 저장 실행 Gate

실제 저장은 아래 조건 모두 필요:
1. preview generated
2. user confirm
3. 저장 대상 선택 (products/sales/customers/all)
4. remote mode면 activeMembership owner/manager 확인
5. datasource 확인
6. validation pass
7. reviewNeeded row는 자동 저장하지 않음

## 저장 정책

- **상품**: 신규만 생성, 기존은 중복 생성 금지
- **입고**: matching 성공 상품만 반영
- **판매**: matching 성공 상품/고객만 생성
- **고객**: 이름 매칭 후 신규 후보만 생성
- **재고**: source-of-truth 정책에 맞게 반영

## 저장 후 Summary

`window.__LAST_SMART_EXCEL_IMPORT_EXECUTION_SUMMARY`:

```
{
  mode, selectedTargets,
  productsInserted, productsMatched, productsSkipped,
  customersInserted, customersMatched,
  ordersInserted, ordersSkipped,
  inboundApplied, inboundSkipped,
  reviewNeededSkipped, failed,
  beforeCounts, afterCounts,
  countDeltaChecks, stockDeltaChecks,
  warnings, errors
}
```

## 기존 목록과 연결

- **상품목록**: smart import 후 `Products.state.loaded = false` → `Products.load()`, 동일 identity 중복 방지
- **판매목록**: smart import 후 Orders reload, 판매일은 order_date 기준
- **고객목록**: smart import 후 Customers reload, 고객명 중복 방지
- **대시보드/분석**: smart import 후 같은 datasource 기준으로 재계산

## 라우팅

- `#/smart-import` → 기본 스마트 가져오기
- `#/smart-import?target=products` → 상품목록에서 연결
- `#/smart-import?target=sales` → 판매목록에서 연결
- `#/smart-import?target=customers` → 고객목록에서 연결

## 절대 금지 사항

- 사용자 확인 없이 remote 실제 저장 실행 금지
- 사용자 확인 없이 상품/판매/고객/재고 대량 생성 금지
- 사용자 확인 없이 cleanup/delete 실행 금지
- hard-coded 숫자 (예: 275) 금지
- UUID/token/key/password/email 노출 금지
- service_role 사용 금지