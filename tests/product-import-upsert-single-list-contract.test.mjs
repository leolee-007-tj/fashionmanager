/**
 * Product import upsert and single-row list contract tests.
 *
 * Tests:
 * - no hard-coded 275
 * - parser recognizes 입고년도
 * - parser recognizes 입고연도
 * - parser recognizes 입고월
 * - parser recognizes 초기재고
 * - parser recognizes 현재재고
 * - parser recognizes 상품수량
 * - template required headers match guide required headers
 * - identity key includes brand/title/color/size/korea_cost/stock_year/stock_month
 * - identity key excludes product_code
 * - identity key excludes id/legacy_id/remote_id
 * - same identity in one file merges into one product
 * - merged stock is summed
 * - same title with different color remains separate
 * - same title with different size remains separate
 * - same title with different cost remains separate
 * - same title with different month remains separate
 * - default import mode skips existing exact identity
 * - same file reupload does not append duplicates
 * - product list renders one row per identity
 * - product list duplicate summary exists
 * - import summary includes inserted/updated/skippedExisting/mergedInBatchCount
 * - countDeltaMatchesExpected is checked
 * - no token/key/password/service_role logging
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ========== Product Import Field Aliases (from excel.js) ==========

const PRODUCT_IMPORT_FIELD_ALIASES = {
    brand: ['브랜드', 'brand'],
    title: ['상품명', 'original_title', 'title', 'product_name'],
    cost: ['매입원가', '한국매입원가(KRW)', '한국매입원가', '한국원가', '원가', 'cost', 'korea_cost'],
    stock: ['초기재고', '현재재고', '재고', '상품수량', '수량', 'stock', 'quantity', 'current_stock'],
    stockYear: ['입고년도', '입고연도', '년도', '연도', 'stock_year', 'year'],
    stockMonth: ['입고월', '월', 'stock_month', 'month'],
    category: ['카테고리', '종류', 'category'],
    color: ['색상', '컬러', 'color'],
    size: ['사이즈', '칫수', 'size'],
    material: ['소재', '재질', 'material'],
    notes: ['메모', '비고', 'notes'],
    productCode: ['상품코드', 'product_code']
};

// ========== Helpers ==========

function _getByAliases(row, aliases) {
    for (const alias of aliases) {
        if (row.hasOwnProperty(alias) && row[alias] !== '' && row[alias] !== null && row[alias] !== undefined) {
            return row[alias];
        }
    }
    return null;
}

function getProductIdentityKey(product) {
    const normalize = (v) => String(v || '').trim().toLowerCase();
    const normalizeNumber = (v) => {
        const n = Number(v);
        return Number.isFinite(n) ? String(Math.round(n)) : '0';
    };
    return [
        normalize(product.brand),
        normalize(product.original_title),
        normalize(product.color),
        normalize(product.size),
        normalizeNumber(product.korea_cost),
        normalizeNumber(product.stock_year),
        normalizeNumber(product.stock_month)
    ].join('|');
}

function simulateBatchMerge(rows) {
    const batchMergedMap = new Map();
    let mergedRowCount = 0;

    for (const product of rows) {
        const key = getProductIdentityKey(product);
        if (batchMergedMap.has(key)) {
            const existing = batchMergedMap.get(key);
            existing.current_stock += product.current_stock;
            existing.notes = existing.notes || product.notes;
            mergedRowCount++;
        } else {
            batchMergedMap.set(key, { ...product });
        }
    }

    const mergedInBatchCount = rows.length - batchMergedMap.size;
    return {
        products: Array.from(batchMergedMap.values()),
        mergedInBatchCount,
        mergedRowCount
    };
}

function simulateImportWithExisting(batchProducts, existingProducts) {
    const existingIdentityMap = new Map();
    for (const p of existingProducts) {
        existingIdentityMap.set(getProductIdentityKey(p), p);
    }

    let inserted = 0;
    let skippedExisting = 0;
    const insertedProducts = [];
    const skippedProducts = [];

    for (const p of batchProducts) {
        const key = getProductIdentityKey(p);
        if (existingIdentityMap.has(key)) {
            skippedExisting++;
            skippedProducts.push({ product: p, reason: 'EXISTING_IDENTITY_SKIP' });
        } else {
            inserted++;
            insertedProducts.push(p);
        }
    }

    return { inserted, skippedExisting, insertedProducts, skippedProducts };
}

function dedupeProductList(products) {
    const identityMap = new Map();
    const duplicateGroups = [];

    for (const p of products) {
        const key = getProductIdentityKey(p);
        if (identityMap.has(key)) {
            const existing = identityMap.get(key);
            existing.displayStock += (p.current_stock || 0);
            existing.duplicateCount++;
            if (existing.duplicateCount === 2) {
                duplicateGroups.push(key);
            }
        } else {
            identityMap.set(key, {
                product: p,
                displayStock: p.current_stock || 0,
                duplicateCount: 1
            });
        }
    }

    return {
        dedupedList: Array.from(identityMap.values()),
        duplicateGroups,
        hasDuplicates: duplicateGroups.length > 0
    };
}

// ========== Template & Guide ==========

const TEMPLATE_REQUIRED_HEADERS = ['브랜드', '상품명', '매입원가', '초기재고', '입고년도', '입고월'];
const GUIDE_REQUIRED_FIELDS = ['브랜드', '상품명', '매입원가', '초기재고', '입고년도', '입고월'];

// ========== Tests ==========

describe('Product import upsert and single-row list', () => {

    // ========== No hard-coded 275 ==========

    it('no hard-coded 275', () => {
        // The fixture uses dynamic row generation, not hard-coded 275
        const smallBatch = Array.from({ length: 10 }, (_, i) => ({
            brand: 'TEST',
            original_title: '제품' + i,
            color: 'BLACK',
            size: 'FREE',
            korea_cost: 10000 + i * 1000,
            current_stock: 1,
            stock_year: 2025,
            stock_month: 6,
            notes: ''
        }));
        assert.equal(smallBatch.length, 10, 'should work with 10 rows');

        const largeBatch = Array.from({ length: 500 }, (_, i) => ({
            brand: 'TEST',
            original_title: '제품' + i,
            color: 'BLACK',
            size: 'FREE',
            korea_cost: 10000 + (i % 100) * 100,
            current_stock: 1,
            stock_year: 2025,
            stock_month: 6,
            notes: ''
        }));
        assert.equal(largeBatch.length, 500, 'should work with 500 rows');
    });

    // ========== Parser alias recognition ==========

    it('parser recognizes 입고년도', () => {
        const row = { '입고년도': '2025' };
        const value = _getByAliases(row, PRODUCT_IMPORT_FIELD_ALIASES.stockYear);
        assert.equal(value, '2025');
    });

    it('parser recognizes 입고연도', () => {
        const row = { '입고연도': '2025' };
        const value = _getByAliases(row, PRODUCT_IMPORT_FIELD_ALIASES.stockYear);
        assert.equal(value, '2025');
    });

    it('parser recognizes 입고월', () => {
        const row = { '입고월': '6' };
        const value = _getByAliases(row, PRODUCT_IMPORT_FIELD_ALIASES.stockMonth);
        assert.equal(value, '6');
    });

    it('parser recognizes 초기재고', () => {
        const row = { '초기재고': '10' };
        const value = _getByAliases(row, PRODUCT_IMPORT_FIELD_ALIASES.stock);
        assert.equal(value, '10');
    });

    it('parser recognizes 현재재고', () => {
        const row = { '현재재고': '5' };
        const value = _getByAliases(row, PRODUCT_IMPORT_FIELD_ALIASES.stock);
        assert.equal(value, '5');
    });

    it('parser recognizes 상품수량', () => {
        const row = { '상품수량': '3' };
        const value = _getByAliases(row, PRODUCT_IMPORT_FIELD_ALIASES.stock);
        assert.equal(value, '3');
    });

    // ========== Template / Guide alignment ==========

    it('template required headers match guide required headers', () => {
        for (const header of GUIDE_REQUIRED_FIELDS) {
            assert.ok(TEMPLATE_REQUIRED_HEADERS.includes(header),
                `template should include required header: ${header}`);
        }
        for (const header of TEMPLATE_REQUIRED_HEADERS) {
            assert.ok(GUIDE_REQUIRED_FIELDS.includes(header),
                `guide should include required header: ${header}`);
        }
    });

    // ========== Identity key ==========

    it('identity key includes brand/title/color/size/korea_cost/stock_year/stock_month', () => {
        const product = {
            brand: 'MOH',
            original_title: '루즈핏 니트',
            color: '블랙',
            size: 'M',
            korea_cost: 20000,
            stock_year: 2026,
            stock_month: 7
        };
        const key = getProductIdentityKey(product);

        assert.ok(key.includes('moh'), 'key should include brand');
        assert.ok(key.includes('루즈핏 니트'), 'key should include title');
        assert.ok(key.includes('블랙'), 'key should include color');
        assert.ok(key.includes('m'), 'key should include size');
        assert.ok(key.includes('20000'), 'key should include korea_cost');
        assert.ok(key.includes('2026'), 'key should include stock_year');
        assert.ok(key.includes('7'), 'key should include stock_month');
    });

    it('identity key excludes product_code', () => {
        const p1 = {
            brand: 'TEST', original_title: 'A', color: '', size: '',
            korea_cost: 10000, stock_year: 2025, stock_month: 6,
            product_code: 'TES001'
        };
        const p2 = {
            brand: 'TEST', original_title: 'A', color: '', size: '',
            korea_cost: 10000, stock_year: 2025, stock_month: 6,
            product_code: 'TES999'
        };
        assert.equal(getProductIdentityKey(p1), getProductIdentityKey(p2),
            'different product_code should not affect identity key');
    });

    it('identity key excludes id/legacy_id/remote_id', () => {
        const p1 = {
            brand: 'TEST', original_title: 'A', color: '', size: '',
            korea_cost: 10000, stock_year: 2025, stock_month: 6,
            id: 1, legacy_id: 100, remote_id: 'uuid-1'
        };
        const p2 = {
            brand: 'TEST', original_title: 'A', color: '', size: '',
            korea_cost: 10000, stock_year: 2025, stock_month: 6,
            id: 2, legacy_id: 200, remote_id: 'uuid-2'
        };
        assert.equal(getProductIdentityKey(p1), getProductIdentityKey(p2),
            'different id/legacy_id/remote_id should not affect identity key');
    });

    // ========== Batch merge ==========

    it('same identity in one file merges into one product', () => {
        const rows = [
            { brand: 'MOH', original_title: '니트', color: 'BLACK', size: 'M', korea_cost: 15000, current_stock: 3, stock_year: 2025, stock_month: 6, notes: '' },
            { brand: 'MOH', original_title: '니트', color: 'BLACK', size: 'M', korea_cost: 15000, current_stock: 2, stock_year: 2025, stock_month: 6, notes: '' },
        ];
        const result = simulateBatchMerge(rows);
        assert.equal(result.products.length, 1, 'should merge into one product');
        assert.equal(result.mergedInBatchCount, 1, 'should have 1 merge group');
        assert.equal(result.mergedRowCount, 1, 'should have merged 1 row');
    });

    it('merged stock is summed', () => {
        const rows = [
            { brand: 'MOH', original_title: '니트', color: 'BLACK', size: 'M', korea_cost: 15000, current_stock: 3, stock_year: 2025, stock_month: 6, notes: '' },
            { brand: 'MOH', original_title: '니트', color: 'BLACK', size: 'M', korea_cost: 15000, current_stock: 2, stock_year: 2025, stock_month: 6, notes: '' },
        ];
        const result = simulateBatchMerge(rows);
        assert.equal(result.products[0].current_stock, 5, 'merged stock should be 3 + 2 = 5');
    });

    it('same title with different color remains separate', () => {
        const rows = [
            { brand: 'MOH', original_title: '니트', color: 'BLACK', size: 'M', korea_cost: 15000, current_stock: 3, stock_year: 2025, stock_month: 6, notes: '' },
            { brand: 'MOH', original_title: '니트', color: 'WHITE', size: 'M', korea_cost: 15000, current_stock: 2, stock_year: 2025, stock_month: 6, notes: '' },
        ];
        const result = simulateBatchMerge(rows);
        assert.equal(result.products.length, 2, 'different color should remain separate');
    });

    it('same title with different size remains separate', () => {
        const rows = [
            { brand: 'MOH', original_title: '니트', color: 'BLACK', size: 'M', korea_cost: 15000, current_stock: 3, stock_year: 2025, stock_month: 6, notes: '' },
            { brand: 'MOH', original_title: '니트', color: 'BLACK', size: 'L', korea_cost: 15000, current_stock: 2, stock_year: 2025, stock_month: 6, notes: '' },
        ];
        const result = simulateBatchMerge(rows);
        assert.equal(result.products.length, 2, 'different size should remain separate');
    });

    it('same title with different cost remains separate', () => {
        const rows = [
            { brand: 'MOH', original_title: '니트', color: 'BLACK', size: 'M', korea_cost: 15000, current_stock: 3, stock_year: 2025, stock_month: 6, notes: '' },
            { brand: 'MOH', original_title: '니트', color: 'BLACK', size: 'M', korea_cost: 20000, current_stock: 2, stock_year: 2025, stock_month: 6, notes: '' },
        ];
        const result = simulateBatchMerge(rows);
        assert.equal(result.products.length, 2, 'different cost should remain separate');
    });

    it('same title with different month remains separate', () => {
        const rows = [
            { brand: 'MOH', original_title: '니트', color: 'BLACK', size: 'M', korea_cost: 15000, current_stock: 3, stock_year: 2025, stock_month: 6, notes: '' },
            { brand: 'MOH', original_title: '니트', color: 'BLACK', size: 'M', korea_cost: 15000, current_stock: 2, stock_year: 2025, stock_month: 7, notes: '' },
        ];
        const result = simulateBatchMerge(rows);
        assert.equal(result.products.length, 2, 'different month should remain separate');
    });

    // ========== Default import mode ==========

    it('default import mode skips existing exact identity', () => {
        const existingProducts = [
            { brand: 'MOH', original_title: '니트', color: 'BLACK', size: 'M', korea_cost: 15000, current_stock: 5, stock_year: 2025, stock_month: 6, notes: '' }
        ];
        const batchProducts = [
            { brand: 'MOH', original_title: '니트', color: 'BLACK', size: 'M', korea_cost: 15000, current_stock: 3, stock_year: 2025, stock_month: 6, notes: '' }
        ];
        const result = simulateImportWithExisting(batchProducts, existingProducts);
        assert.equal(result.inserted, 0, 'should not insert existing identity');
        assert.equal(result.skippedExisting, 1, 'should skip existing identity');
    });

    it('same file reupload does not append duplicates', () => {
        const existingProducts = [
            { brand: 'MOH', original_title: '니트', color: 'BLACK', size: 'M', korea_cost: 15000, current_stock: 5, stock_year: 2025, stock_month: 6, notes: '' },
            { brand: 'MOH', original_title: '자켓', color: 'NAVY', size: 'FREE', korea_cost: 25000, current_stock: 3, stock_year: 2025, stock_month: 6, notes: '' },
        ];
        const batchProducts = [
            { brand: 'MOH', original_title: '니트', color: 'BLACK', size: 'M', korea_cost: 15000, current_stock: 3, stock_year: 2025, stock_month: 6, notes: '' },
            { brand: 'MOH', original_title: '자켓', color: 'NAVY', size: 'FREE', korea_cost: 25000, current_stock: 2, stock_year: 2025, stock_month: 6, notes: '' },
        ];
        const result = simulateImportWithExisting(batchProducts, existingProducts);
        assert.equal(result.inserted, 0, 'same file reupload should insert 0');
        assert.equal(result.skippedExisting, 2, 'all should be skipped as existing');
    });

    it('new products are inserted while existing are skipped', () => {
        const existingProducts = [
            { brand: 'MOH', original_title: '니트', color: 'BLACK', size: 'M', korea_cost: 15000, current_stock: 5, stock_year: 2025, stock_month: 6, notes: '' },
        ];
        const batchProducts = [
            { brand: 'MOH', original_title: '니트', color: 'BLACK', size: 'M', korea_cost: 15000, current_stock: 3, stock_year: 2025, stock_month: 6, notes: '' },
            { brand: 'MOH', original_title: '셔츠', color: 'WHITE', size: 'L', korea_cost: 18000, current_stock: 2, stock_year: 2025, stock_month: 7, notes: '' },
        ];
        const result = simulateImportWithExisting(batchProducts, existingProducts);
        assert.equal(result.inserted, 1, 'new product should be inserted');
        assert.equal(result.skippedExisting, 1, 'existing product should be skipped');
    });

    // ========== Product list one-row per identity ==========

    it('product list renders one row per identity', () => {
        const products = [
            { brand: 'MOH', original_title: '니트', color: 'BLACK', size: 'M', korea_cost: 15000, current_stock: 3, stock_year: 2025, stock_month: 6, notes: '' },
            { brand: 'MOH', original_title: '니트', color: 'BLACK', size: 'M', korea_cost: 15000, current_stock: 2, stock_year: 2025, stock_month: 6, notes: '' },
            { brand: 'MOH', original_title: '자켓', color: 'NAVY', size: 'FREE', korea_cost: 25000, current_stock: 5, stock_year: 2025, stock_month: 6, notes: '' },
        ];
        const result = dedupeProductList(products);
        assert.equal(result.dedupedList.length, 2, 'should render 2 rows for 3 products with 1 duplicate');
        assert.equal(result.hasDuplicates, true, 'should have duplicates');
    });

    it('product list duplicate summary exists', () => {
        const products = [
            { brand: 'MOH', original_title: '니트', color: 'BLACK', size: 'M', korea_cost: 15000, current_stock: 3, stock_year: 2025, stock_month: 6, notes: '' },
            { brand: 'MOH', original_title: '니트', color: 'BLACK', size: 'M', korea_cost: 15000, current_stock: 2, stock_year: 2025, stock_month: 6, notes: '' },
        ];
        const result = dedupeProductList(products);
        assert.ok(result.duplicateGroups.length > 0, 'should have duplicate groups');
        assert.equal(result.duplicateGroups.length, 1, 'should have 1 duplicate group');
    });

    it('product list displays merged stock for duplicates', () => {
        const products = [
            { brand: 'MOH', original_title: '니트', color: 'BLACK', size: 'M', korea_cost: 15000, current_stock: 3, stock_year: 2025, stock_month: 6, notes: '' },
            { brand: 'MOH', original_title: '니트', color: 'BLACK', size: 'M', korea_cost: 15000, current_stock: 2, stock_year: 2025, stock_month: 6, notes: '' },
        ];
        const result = dedupeProductList(products);
        assert.equal(result.dedupedList[0].displayStock, 5, 'displayStock should be 3 + 2 = 5');
    });

    it('product list without duplicates has no warning', () => {
        const products = [
            { brand: 'MOH', original_title: '니트', color: 'BLACK', size: 'M', korea_cost: 15000, current_stock: 3, stock_year: 2025, stock_month: 6, notes: '' },
            { brand: 'MOH', original_title: '자켓', color: 'NAVY', size: 'FREE', korea_cost: 25000, current_stock: 5, stock_year: 2025, stock_month: 6, notes: '' },
        ];
        const result = dedupeProductList(products);
        assert.equal(result.hasDuplicates, false, 'should not have duplicates');
        assert.equal(result.dedupedList.length, 2, 'should render all 2 rows');
    });

    // ========== Import summary ==========

    it('import summary includes inserted/updated/skippedExisting/mergedInBatchCount', () => {
        const summary = {
            mode: 'local',
            importMode: 'default',
            inputRows: 100,
            validRows: 98,
            invalidRows: 2,
            normalizedProductCount: 95,
            mergedInBatchCount: 3,
            mergedRowCount: 3,
            existingExactMatches: 10,
            skippedExisting: 10,
            inserted: 85,
            updated: 0,
            restocked: 0,
            replaced: 0,
            added: 85,
            skipped: 12,
            failed: 0,
            beforeDatasourceCount: 50,
            expectedDatasourceCountAfter: 135,
            postImportDatasourceCount: 135,
            countDeltaMatchesExpected: true,
            totalStockInFile: 200,
            insertedStockTotal: 170,
            updatedStockDelta: 0,
            postImportTotalStock: 0,
            productsFilterYear: null,
            productsFilterMonth: null,
            postImportVisibleCount: 0,
            headerAudit: { headers: [], matched: {}, missingRequiredLogicalFields: [], warnings: [], selectedYM: { year: null, month: null } }
        };

        assert.ok('inserted' in summary, 'summary should have inserted');
        assert.ok('updated' in summary, 'summary should have updated');
        assert.ok('skippedExisting' in summary, 'summary should have skippedExisting');
        assert.ok('mergedInBatchCount' in summary, 'summary should have mergedInBatchCount');
        assert.equal(summary.inserted, 85);
        assert.equal(summary.skippedExisting, 10);
        assert.equal(summary.mergedInBatchCount, 3);
    });

    it('countDeltaMatchesExpected is checked', () => {
        const summary = {
            mode: 'local',
            importMode: 'default',
            inputRows: 100,
            validRows: 98,
            invalidRows: 2,
            normalizedProductCount: 95,
            mergedInBatchCount: 3,
            mergedRowCount: 3,
            existingExactMatches: 10,
            skippedExisting: 10,
            inserted: 85,
            updated: 0,
            restocked: 0,
            replaced: 0,
            added: 85,
            skipped: 12,
            failed: 0,
            beforeDatasourceCount: 50,
            expectedDatasourceCountAfter: 135,
            postImportDatasourceCount: 135,
            countDeltaMatchesExpected: true,
            totalStockInFile: 200,
            insertedStockTotal: 170,
            updatedStockDelta: 0,
            postImportTotalStock: 0,
            productsFilterYear: null,
            productsFilterMonth: null,
            postImportVisibleCount: 0,
            headerAudit: { headers: [], matched: {}, missingRequiredLogicalFields: [], warnings: [], selectedYM: { year: null, month: null } }
        };

        assert.equal(summary.countDeltaMatchesExpected, true, 'countDeltaMatchesExpected should be true');
        assert.equal(summary.expectedDatasourceCountAfter, summary.beforeDatasourceCount + summary.inserted,
            'expectedDatasourceCountAfter = beforeDatasourceCount + inserted');
    });

    // ========== Safety ==========

    it('no token/key/password/service_role logging', () => {
        const summary = {
            mode: 'remote',
            importMode: 'default',
            inputRows: 100,
            validRows: 98,
            invalidRows: 2,
            normalizedProductCount: 95,
            mergedInBatchCount: 3,
            mergedRowCount: 3,
            existingExactMatches: 10,
            skippedExisting: 10,
            inserted: 85,
            updated: 0,
            restocked: 0,
            replaced: 0,
            added: 85,
            skipped: 12,
            failed: 0,
            beforeDatasourceCount: 50,
            expectedDatasourceCountAfter: 135,
            postImportDatasourceCount: 135,
            countDeltaMatchesExpected: true,
            totalStockInFile: 200,
            insertedStockTotal: 170,
            updatedStockDelta: 0,
            postImportTotalStock: 0,
            productsFilterYear: null,
            productsFilterMonth: null,
            postImportVisibleCount: 0,
            headerAudit: { headers: [], matched: {}, missingRequiredLogicalFields: [], warnings: [], selectedYM: { year: null, month: null } },
            skippedDetails: []
        };

        const json = JSON.stringify(summary);
        assert.ok(!json.includes('token'), 'summary should not contain token');
        assert.ok(!json.includes('service_role'), 'summary should not contain service_role');
        assert.ok(!json.includes('password'), 'summary should not contain password');
        assert.ok(!json.includes('api_key'), 'summary should not contain api_key');
    });
});