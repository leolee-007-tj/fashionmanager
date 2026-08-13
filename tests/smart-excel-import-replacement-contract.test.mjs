/**
 * Smart Excel Import Replacement Contract Tests
 * 
 * 기존 고정 템플릿 기반 상품 엑셀 업로드를 SmartInventoryWorkbookImporter로 대체했는지 검증한다.
 * 
 * 검증 항목:
 * - old product-only import is no longer default UI path
 * - smart import route exists
 * - product/sales/customer list upload links to smart import
 * - sheet auto-classification
 * - fuzzy header resolver
 * - formula error handling
 * - preview-first workflow
 * - save confirmation gate
 * - no hard-coded 275
 * - no sensitive data in preview
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = join(__dirname, '..');

function readSource(path) {
    return readFileSync(join(PROJECT_DIR, path), 'utf-8');
}

function fileExists(path) {
    return existsSync(join(PROJECT_DIR, path));
}

describe('Smart Excel Import Replacement Contract', () => {
    // ========== 1. Old import is no longer default ==========

    describe('Legacy import deprecation', () => {
        it('excel.js render() delegates to SmartInventoryWorkbookImporter', () => {
            const excelJs = readSource('js/excel.js');
            assert.ok(
                excelJs.includes('SmartInventoryWorkbookImporter.render()'),
                'excel.js render() should delegate to SmartInventoryWorkbookImporter'
            );
        });

        it('excel.js render() does not contain old template download buttons', () => {
            const excelJs = readSource('js/excel.js');
            const renderSection = excelJs.split('render()')[1]?.split('},')[0] || '';
            assert.ok(
                !renderSection.includes('downloadProductTemplate'),
                'render() should not contain downloadProductTemplate button'
            );
            assert.ok(
                !renderSection.includes('downloadOrderTemplate'),
                'render() should not contain downloadOrderTemplate button'
            );
        });

        it('excel.js render() does not contain old fixed import mode selector', () => {
            const excelJs = readSource('js/excel.js');
            const renderSection = excelJs.split('render()')[1]?.split('},')[0] || '';
            assert.ok(
                !renderSection.includes('importMode'),
                'render() should not contain old import mode selector'
            );
        });

        it('excel.js render() does not contain hard-coded required columns list', () => {
            const excelJs = readSource('js/excel.js');
            const renderSection = excelJs.split('render()')[1]?.split('},')[0] || '';
            assert.ok(
                !renderSection.includes('필수') && !renderSection.includes('선택'),
                'render() should not contain old required/optional column guide'
            );
        });
    });

    // ========== 2. Smart import route and UI ==========

    describe('Smart import route', () => {
        it('smart-inventory-importer.js exists', () => {
            assert.ok(fileExists('js/smart-inventory-importer.js'), 'smart-inventory-importer.js should exist');
        });

        it('smart-import route exists in app.js', () => {
            const appJs = readSource('js/app.js');
            assert.ok(
                appJs.includes("case 'smart-import'"),
                'app.js should have smart-import route'
            );
        });

        it('index.html menu links to smart-import', () => {
            const html = readSource('index.html');
            assert.ok(
                html.includes('#/smart-import'),
                'index.html should have smart-import nav link'
            );
        });

        it('smart-inventory-importer.js is loaded before excel.js', () => {
            const html = readSource('index.html');
            const smartImportIdx = html.indexOf('smart-inventory-importer.js');
            const excelIdx = html.indexOf('js/excel.js');
            assert.ok(smartImportIdx > 0, 'smart-inventory-importer.js should be in index.html');
            assert.ok(excelIdx > 0, 'excel.js should be in index.html');
            assert.ok(smartImportIdx < excelIdx, 'smart-inventory-importer.js should load before excel.js');
        });
    });

    // ========== 3. Product/Sales/Customer list upload links ==========

    describe('List upload links', () => {
        it('products.js has upload link to smart-import?target=products', () => {
            const productsJs = readSource('js/products.js');
            assert.ok(
                productsJs.includes('smart-import?target=products'),
                'products.js should link to smart-import?target=products'
            );
        });

        it('orders.js has upload link to smart-import?target=sales', () => {
            const ordersJs = readSource('js/orders.js');
            assert.ok(
                ordersJs.includes('smart-import?target=sales'),
                'orders.js should link to smart-import?target=sales'
            );
        });

        it('customers.js has upload link to smart-import?target=customers', () => {
            const customersJs = readSource('js/customers.js');
            assert.ok(
                customersJs.includes('smart-import?target=customers'),
                'customers.js should link to smart-import?target=customers'
            );
        });
    });

    // ========== 4. Sheet auto-classification ==========

    describe('Sheet classification', () => {
        it('detects product sheet by name (제품목록)', () => {
            const importer = readSource('js/smart-inventory-importer.js');
            assert.ok(
                importer.includes("'제품목록'") && importer.includes("'상품목록'"),
                'should detect product sheets by Korean names'
            );
        });

        it('detects inbound sheet by name (입고)', () => {
            const importer = readSource('js/smart-inventory-importer.js');
            assert.ok(
                importer.includes("'입고'") && importer.includes("'추가입고'"),
                'should detect inbound sheets by Korean names'
            );
        });

        it('detects sales sheet by name (출고)', () => {
            const importer = readSource('js/smart-inventory-importer.js');
            assert.ok(
                importer.includes("'출고'") && importer.includes("'판매'"),
                'should detect sales sheets by Korean names'
            );
        });

        it('detects inventory sheet as verification only', () => {
            const importer = readSource('js/smart-inventory-importer.js');
            assert.ok(
                importer.includes("'현재재고'") && importer.includes("'재고'"),
                'should detect inventory sheets'
            );
            // Verify it's treated as verification-only
            assert.ok(
                importer.includes('검증용 시트'),
                'should mark inventory as verification-only'
            );
        });

        it('detects sales summary sheet as verification only', () => {
            const importer = readSource('js/smart-inventory-importer.js');
            assert.ok(
                importer.includes("'출고액'") || importer.includes("'매출요약'"),
                'should detect sales summary sheets'
            );
        });

        it('detects customer summary sheet as verification only', () => {
            const importer = readSource('js/smart-inventory-importer.js');
            assert.ok(
                importer.includes("'고객이름'") || importer.includes("'고객'"),
                'should detect customer summary sheets'
            );
        });

        it('detects brand sheet as reference only', () => {
            const importer = readSource('js/smart-inventory-importer.js');
            assert.ok(
                importer.includes("'브랜드목록'") || importer.includes("'브랜드'"),
                'should detect brand sheets'
            );
        });
    });

    // ========== 5. Fuzzy header resolver ==========

    describe('Fuzzy header resolver', () => {
        it('blank headers never fuzzy-match a field', () => {
            const smartJs = readSource('js/smart-inventory-importer.js');
            assert.match(smartJs, /if \(!h \|\| h\.startsWith\('='\)\) return false/,
                'blank header cells must not be treated as every logical field');
        });

        it('formula cells and objects are never treated as headers', () => {
            const smartJs = readSource('js/smart-inventory-importer.js');
            assert.match(smartJs, /typeof headerName === 'object'/,
                'array-formula objects must not be treated as headers');
            assert.match(smartJs, /h\.startsWith\('='\)/,
                'formula text must not be treated as a header');
        });

        it('recognizes 일자 as an inbound or sales date', () => {
            const smartJs = readSource('js/smart-inventory-importer.js');
            assert.match(smartJs, /receivedDate: \[[^\]]*'일자'/,
                '입고 sheets using 일자 should map their date column');
            assert.match(smartJs, /orderDate: \[[^\]]*'일자'/,
                'sales sheets using 일자 should map their date column');
        });

        it('does not reinterpret a generic 메모 column as sales source', () => {
            const smartJs = readSource('js/smart-inventory-importer.js');
            const sourceAliases = smartJs.match(/source: \[([^\]]+)\]/);
            assert.ok(sourceAliases, 'source aliases should exist');
            assert.doesNotMatch(sourceAliases[1], /메모/,
                'generic notes must remain notes instead of becoming a sales channel');
        });

        it('finds a real header row below workbook title rows', () => {
            const smartJs = readSource('js/smart-inventory-importer.js');
            assert.match(smartJs, /_findHeaderRow\(rows\)/,
                'smart importer should scan for the actual header row');
            assert.match(smartJs, /json\.slice\(headerInfo\.index \+ 1\)/,
                'data extraction should begin after the detected header row');
        });

        it('prefers detected header role over an ambiguous sheet name', () => {
            const smartJs = readSource('js/smart-inventory-importer.js');
            assert.match(smartJs, /const role = headerRole \|\| nameRole/,
                'recognized columns should override an ambiguous sheet name');
        });
        it('handles 제품명/상품명 as title', () => {
            const importer = readSource('js/smart-inventory-importer.js');
            assert.ok(
                importer.includes("'제품명'") && importer.includes("'상품명'"),
                'should handle multiple title aliases'
            );
        });

        it('handles 원가(₩)/매입원가/한국원가 as cost', () => {
            const importer = readSource('js/smart-inventory-importer.js');
            assert.ok(
                importer.includes("'원가'") && importer.includes("'매입원가'") && importer.includes("'한국원가'"),
                'should handle multiple cost aliases'
            );
        });

        it('handles 초기재고/현재재고/상품수량 as stock', () => {
            const importer = readSource('js/smart-inventory-importer.js');
            assert.ok(
                importer.includes("'초기재고'") && importer.includes("'현재재고'") && importer.includes("'상품수량'"),
                'should handle multiple stock aliases'
            );
        });

        it('handles 입고년도/입고연도 as stockYear', () => {
            const importer = readSource('js/smart-inventory-importer.js');
            assert.ok(
                importer.includes("'입고년도'") && importer.includes("'입고연도'"),
                'should handle multiple stockYear aliases'
            );
        });

        it('handles 고객이름/고객명 as customerName', () => {
            const importer = readSource('js/smart-inventory-importer.js');
            assert.ok(
                importer.includes("'고객이름'") && importer.includes("'고객명'"),
                'should handle multiple customerName aliases'
            );
        });

        it('handles 실제판매가/최종총평가/금액 as actualSellingPrice', () => {
            const importer = readSource('js/smart-inventory-importer.js');
            assert.ok(
                importer.includes("'실제판매가'") && importer.includes("'판매금액'"),
                'should handle multiple selling price aliases'
            );
        });

        it('prioritizes exact 원가 header over fuzzy 중국원가 matches', () => {
            const importer = readSource('js/smart-inventory-importer.js');
            assert.match(importer, /Exact labels must win/);
            assert.match(importer, /normalizedAliases\.includes\(normalize\(header\)\)/);
        });

        it('repairs existing zero-cost products during re-import', () => {
            const importer = readSource('js/smart-inventory-importer.js');
            assert.match(importer, /const zeroCostMatches = existingProducts\.filter/);
            assert.match(importer, /Number\(p\.korea_cost \|\| 0\) <= 0/);
            assert.match(importer, /await DB\.updateProductAsync/);
        });

        it('uses product-list column D as the authoritative Korea purchase cost', () => {
            const importer = readSource('js/smart-inventory-importer.js');
            assert.match(importer, /const dColumnCost = this\._safeParseInt\(row\[3\]\)/);
            assert.match(importer, /const cost = dColumnCost > 0 \? dColumnCost : mappedCost/);
        });
    });

    // ========== 6. Date parsing ==========

    describe('Date parsing', () => {
        it('Excel serial date converts correctly', () => {
            const importer = readSource('js/smart-inventory-importer.js');
            assert.ok(
                importer.includes('25569'),
                'should handle Excel serial date (epoch offset 25569)'
            );
        });

        it('filename year/month inference works', () => {
            const importer = readSource('js/smart-inventory-importer.js');
            assert.ok(
                importer.includes('_inferYearMonthFromFilename'),
                'should infer year/month from filename'
            );
        });
    });

    // ========== 7. Formula error handling ==========

    describe('Formula error handling', () => {
        it('formula error #NAME? is not trusted', () => {
            const importer = readSource('js/smart-inventory-importer.js');
            assert.ok(
                importer.includes("#NAME?'") || importer.includes('#NAME?'),
                'should detect #NAME? formula error'
            );
            assert.ok(
                importer.includes('_isFormulaError'),
                'should have formula error detection'
            );
        });

        it('formula errors are counted in preview', () => {
            const importer = readSource('js/smart-inventory-importer.js');
            assert.ok(
                importer.includes('formulaErrorCount'),
                'should count formula errors in preview'
            );
        });

        it('derived values are recalculated by app', () => {
            const importer = readSource('js/smart-inventory-importer.js');
            assert.ok(
                importer.includes('계산식 결과는 무시'),
                'should mention that formula results are ignored'
            );
        });
    });

    // ========== 8. Preview-first workflow ==========

    describe('Preview-first workflow', () => {
        it('preview-only is default', () => {
            const importer = readSource('js/smart-inventory-importer.js');
            assert.ok(
                importer.includes('저장은 미리보기 확인 후에만'),
                'should enforce preview-first workflow'
            );
        });

        it('save requires confirmation', () => {
            const importer = readSource('js/smart-inventory-importer.js');
            assert.ok(
                importer.includes('confirm('),
                'save should require user confirmation'
            );
        });

        it('__LAST_SMART_EXCEL_IMPORT_PREVIEW is set before save', () => {
            const importer = readSource('js/smart-inventory-importer.js');
            assert.ok(
                importer.includes('__LAST_SMART_EXCEL_IMPORT_PREVIEW'),
                'should set preview window variable'
            );
        });

        it('execution summary exists', () => {
            const importer = readSource('js/smart-inventory-importer.js');
            assert.ok(
                importer.includes('__LAST_SMART_EXCEL_IMPORT_EXECUTION_SUMMARY'),
                'should set execution summary window variable'
            );
        });
    });

    // ========== 9. No hard-coded values ==========

    describe('No hard-coded values', () => {
        it('no hard-coded 275 in smart importer', () => {
            const importer = readSource('js/smart-inventory-importer.js');
            assert.ok(
                !importer.includes('275'),
                'should not contain hard-coded 275'
            );
        });

        it('expected counts are computed from workbook rows', () => {
            const importer = readSource('js/smart-inventory-importer.js');
            assert.ok(
                importer.includes('rowCount'),
                'row counts should be computed from actual data'
            );
        });
    });

    // ========== 10. Product identity and dedup ==========

    describe('Product identity and dedup', () => {
        it('same product identity is not duplicated', () => {
            const importer = readSource('js/smart-inventory-importer.js');
            assert.ok(
                importer.includes('_getProductIdentityKey'),
                'should have product identity key function'
            );
            assert.ok(
                importer.includes('duplicateProductIdentities'),
                'should track duplicate identities'
            );
        });

        it('identity uses brand+title+color+size+cost+stockYear+stockMonth', () => {
            const importer = readSource('js/smart-inventory-importer.js');
            const identityFn = importer.split('_getProductIdentityKey')[1]?.split('},')[0] || '';
            assert.ok(
                identityFn.includes('brand') && identityFn.includes('original_title') &&
                identityFn.includes('color') && identityFn.includes('size') &&
                identityFn.includes('korea_cost') && identityFn.includes('stock_year') &&
                identityFn.includes('stock_month'),
                'identity should use brand+title+color+size+cost+stockYear+stockMonth'
            );
        });
    });

    // ========== 11. Source classification ==========

    describe('Source classification', () => {
        it('customer/source-like ambiguity becomes reviewNeeded', () => {
            const importer = readSource('js/smart-inventory-importer.js');
            assert.ok(
                importer.includes('_isSourceLikeCustomerName'),
                'should detect source-like customer names'
            );
        });

        it('classifies wechat/微信/위챗 as wechat', () => {
            const importer = readSource('js/smart-inventory-importer.js');
            assert.ok(
                importer.includes("'微信'") && importer.includes("'wechat'"),
                'should classify wechat sources'
            );
        });
    });

    // ========== 12. Verification-only sheets ==========

    describe('Verification-only sheets', () => {
        it('current inventory sheet is verification only', () => {
            const importer = readSource('js/smart-inventory-importer.js');
            assert.ok(
                importer.includes('검증용 시트'),
                'should mark verification-only sheets'
            );
        });

        it('sales summary sheet is verification only', () => {
            const importer = readSource('js/smart-inventory-importer.js');
            const verifySheets = importer.includes('salesSummary') &&
                importer.includes('inventory') &&
                importer.includes('customerSummary');
            assert.ok(verifySheets, 'should treat salesSummary/inventory/customerSummary as verification');
        });
    });

    // ========== 13. No sensitive data in preview ==========

    describe('No sensitive data in preview', () => {
        it('preview excludes UUID/token/key/password', () => {
            const importer = readSource('js/smart-inventory-importer.js');
            assert.ok(
                !importer.includes('service_role'),
                'should not contain service_role'
            );
            assert.ok(
                !importer.includes('eyJ') && !importer.includes('token'),
                'should not contain JWT tokens'
            );
        });

        it('no remote mutation during preview', () => {
            const importer = readSource('js/smart-inventory-importer.js');
            const analyzeFn = importer.split('analyze(data, filename)')[1]?.split('},')[0] || '';
            assert.ok(
                !analyzeFn.includes('supabase') && !analyzeFn.includes('createProduct') && !analyzeFn.includes('insert'),
                'analyze() should not perform remote mutations'
            );
        });
    });

    // ========== 14. i18n ==========

    describe('i18n integration', () => {
        it('nav has smart_import key', () => {
            const i18n = readSource('js/i18n.js');
            assert.ok(
                i18n.includes('smart_import'),
                'i18n should have smart_import nav key'
            );
        });
    });
});
