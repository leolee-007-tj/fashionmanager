# Product QA Automation

## 목적

Excel 기반 상품 업로드가 정상 동작하는지 자동으로 검증한다.
사용자가 엑셀 파일을 준비하면 TRAE가 자동으로 preview/execute를 실행하여 에러를 조기에 발견한다.

## 테스트 파일 위치

권장 경로 (프로젝트 루트 기준):

- `manual-test-files/product-import-fixture.xlsx`
- `test-fixtures/products/product-import-fixture.xlsx`

파일이 없는 경우 자동 업로드 테스트를 실행하지 않고 중단된다.

## Preview Only (기본값)

기본 모드는 **PREVIEW_ONLY** — 실제 데이터 변경 없이 파일 분석 결과만 출력한다.

```bash
node scripts/product-qa-harness.mjs manual-test-files/product-import-fixture.xlsx
```

출력:
- inputRows / validRows / invalidRows
- expectedStock (current_stock 합계)
- titleOnlyUniqueCount / identityUniqueCount
- exactDuplicateCandidates / newCandidateRows
- warnings (missing cost, missing year/month, duplicate identity)

## Local Execute

```bash
RUN_PRODUCT_IMPORT_EXECUTE=1 node scripts/product-qa-harness.mjs manual-test-files/product-import-fixture.xlsx
```

조건:
- `RUN_PRODUCT_IMPORT_EXECUTE=1` 환경 변수 필요
- 브라우저 환경 (localhost:8080) 접근 가능
- preview 실행 후 실제 업로드 수행

## Remote Execute

```bash
RUN_PRODUCT_IMPORT_EXECUTE=1 RUN_REMOTE_PRODUCT_IMPORT_EXECUTE=1 node scripts/product-qa-harness.mjs manual-test-files/product-import-fixture.xlsx
```

조건 (모두 충족 필요):
1. `RUN_PRODUCT_IMPORT_EXECUTE=1`
2. `RUN_REMOTE_PRODUCT_IMPORT_EXECUTE=1`
3. Browser environment gate PASS
4. Delete capability gate PASS
5. 사용자 승인

## Remote Execute Safety Gates

### Browser Environment Gate

다음 조건이 모두 충족되어야 remote execute 허용:
- `productsDataSource = SupabaseProductsDataSource`
- `role = owner` 또는 `manager`
- `hasActiveMembership = true`
- `supabaseInitialized = true`

### Delete Capability Gate

자동 remote upload execute 전에 soft_delete_product_by_id RPC가 코드와 migration에 존재하는지 확인한다.

판정 기준:
- `js/db.js`에 `soft_delete_product_by_id` 참조
- `supabase/migrations/`에 관련 migration 파일 존재
- 둘 중 하나라도 없으면 remote execute 금지

## Report 해석법

테스트 결과는 `test-results/` 디렉터리에 저장된다.

### JSON Report (`test-results/product-qa-summary.json`)

```json
{
  "timestamp": "2026-07-29T...",
  "filePath": "...",
  "inputRows": 275,
  "validRows": 275,
  "expectedStock": 1234,
  "mode": "PREVIEW_ONLY",
  "executed": false,
  "deleteCapability": "PASS",
  "warnings": [...],
  "errors": [...]
}
```

### 주요 필드

- **mode**: `PREVIEW_ONLY` (기본) / `LOCAL_EXECUTE` / `REMOTE_EXECUTE`
- **executed**: 실제 업로드 실행 여부
- **countDeltaMatchesAdded**: `afterDatasourceCount === beforeDatasourceCount + added`
- **deleteCapability**: `PASS` / `FAIL: ...`

## 275 Hard-code 금지

모든 상품 수는 엑셀 파일에서 동적으로 읽어서 계산한다.
`275` 같은 숫자를 코드에 하드코딩하지 않는다.

## 상품목록 먼저, 다른 화면은 Read-only Smoke

1. 상품목록 자동 검증이 PASS해야 함
2. 그 후 Customers/Orders/Analytics read-only smoke 진행
3. Orders write smoke는 상품목록 안정화 후에만 허용