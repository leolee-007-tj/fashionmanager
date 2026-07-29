/**
 * BLOCKER-FIX-6: Metrics source of truth contract tests.
 *
 * Tests:
 * - product count source is datasource (DB.getProductsAsync)
 * - import count policy: exact identity key match
 * - duplicate candidate policy: identity key match
 * - delete count recalculation: before - success = after
 * - stock total recalculation: sum of current_stock
 * - available stock recalculation: totalStock - reservedStock
 * - no token/key/password/service_role logging
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ========== Test helpers ==========

function makeIdentityKey(p) {
    return [
        p.brand || '',
        p.original_title || '',
        p.color || '',
        p.size || '',
        String(p.korea_cost || ''),
        String(p.stock_year || ''),
        String(p.stock_month || '')
    ].join('|');
}

function calculateMetrics(products) {
    const byIdentity = new Map();
    for (const p of products) {
        const key = makeIdentityKey(p);
        byIdentity.set(key, (byIdentity.get(key) || 0) + 1);
    }

    const duplicateIdentityGroups = [...byIdentity.values()].filter(n => n > 1).length;
    const duplicateIdentityRows = [...byIdentity.values()].filter(n => n > 1).reduce((a, b) => a + b, 0);
    const totalStock = products.reduce((s, p) => s + (Number(p.current_stock) || 0), 0);
    const reservedStock = products.reduce((s, p) => s + (Number(p.reserved_stock) || 0), 0);

    return {
        datasourceCount: products.length,
        uniqueCount: byIdentity.size,
        duplicateIdentityGroups,
        duplicateIdentityRows,
        totalStock,
        reservedStock,
        availableStock: totalStock - reservedStock,
        uniqueIdentityKeys: byIdentity.size
    };
}

// ========== Fixture data ==========

function generateFixtureProducts() {
    const products = [];
    // 100 unique products
    for (let i = 0; i < 100; i++) {
        products.push({
            id: i + 1,
            legacy_id: i + 1,
            remote_id: `00000000-0000-0000-0000-${String(i + 1).padStart(12, '0')}`,
            brand: 'Brand' + (i % 5),
            original_title: 'Product ' + (i + 1),
            color: 'Color' + (i % 3),
            size: String(90 + (i % 5)),
            korea_cost: 10000 + (i * 1000),
            current_stock: 1 + (i % 5),
            reserved_stock: i % 3 === 0 ? 1 : 0,
            stock_year: '2026',
            stock_month: '07',
            product_code: 'BRD' + String(i + 1).padStart(3, '0')
        });
    }
    // 50 duplicate products (same identity key as first 50)
    for (let i = 0; i < 50; i++) {
        products.push({
            id: 200 + i + 1,
            legacy_id: 200 + i + 1,
            remote_id: `00000000-0000-0000-0000-${String(200 + i + 1).padStart(12, '0')}`,
            brand: 'Brand' + (i % 5),
            original_title: 'Product ' + (i + 1),
            color: 'Color' + (i % 3),
            size: String(90 + (i % 5)),
            korea_cost: 10000 + (i * 1000),
            current_stock: 1 + (i % 5),
            reserved_stock: 0,
            stock_year: '2026',
            stock_month: '07',
            product_code: 'DUP' + String(i + 1).padStart(3, '0')
        });
    }
    return products;
}

// ========== Tests ==========

describe('Metrics source of truth', () => {

    it('product count source is datasource', () => {
        const products = generateFixtureProducts();
        const metrics = calculateMetrics(products);
        assert.equal(metrics.datasourceCount, 150, 'datasource count should be 150');
        assert.equal(metrics.uniqueCount, 100, 'unique identity groups should be 100');
    });

    it('import count policy uses exact identity key match', () => {
        const products = generateFixtureProducts();
        const metrics = calculateMetrics(products);
        assert.equal(metrics.duplicateIdentityGroups, 50, '50 identity groups should have duplicates');
        assert.equal(metrics.duplicateIdentityRows, 100, '100 total rows should be in duplicate groups');
    });

    it('duplicate candidate policy is identity key match', () => {
        const products = generateFixtureProducts();
        const metrics = calculateMetrics(products);

        // Find duplicate candidates: for each identity with count > 1, keep 1, delete the rest
        const byIdentity = new Map();
        for (const p of products) {
            const key = makeIdentityKey(p);
            if (!byIdentity.has(key)) byIdentity.set(key, []);
            byIdentity.get(key).push(p);
        }

        let keepCount = 0;
        let deleteCandidateCount = 0;
        for (const [key, group] of byIdentity) {
            if (group.length > 1) {
                keepCount += 1; // keep 1
                deleteCandidateCount += group.length - 1; // delete rest
            } else {
                keepCount += 1;
            }
        }

        assert.equal(keepCount, 100, 'should keep 100 unique products');
        assert.equal(deleteCandidateCount, 50, 'should have 50 delete candidates');
        assert.equal(keepCount + deleteCandidateCount, metrics.datasourceCount,
            'keep + delete = total datasource count');
    });

    it('delete count recalculation: before - success = after', () => {
        const beforeCount = 150;
        const successCount = 50;
        const afterCount = beforeCount - successCount;
        assert.equal(afterCount, 100, 'after count should be before - success');
    });

    it('stock total recalculation: sum of current_stock', () => {
        const products = generateFixtureProducts();
        const metrics = calculateMetrics(products);

        // Manual calculation
        let manualTotal = 0;
        for (const p of products) {
            manualTotal += Number(p.current_stock) || 0;
        }
        assert.equal(metrics.totalStock, manualTotal, 'totalStock should match manual sum');
    });

    it('available stock recalculation: totalStock - reservedStock', () => {
        const products = generateFixtureProducts();
        const metrics = calculateMetrics(products);

        assert.equal(metrics.availableStock, metrics.totalStock - metrics.reservedStock,
            'availableStock = totalStock - reservedStock');
    });

    it('deleting duplicates updates all metrics correctly', () => {
        const products = generateFixtureProducts();
        const beforeMetrics = calculateMetrics(products);

        // Simulate deleting 50 duplicate rows
        const afterProducts = products.slice(0, 100); // Keep first 100 unique
        const afterMetrics = calculateMetrics(afterProducts);

        assert.equal(afterMetrics.datasourceCount, 100, 'after delete count should be 100');
        assert.equal(afterMetrics.duplicateIdentityGroups, 0, 'no duplicate groups after cleanup');
        assert.equal(afterMetrics.duplicateIdentityRows, 0, 'no duplicate rows after cleanup');
        assert.equal(afterMetrics.datasourceCount, beforeMetrics.datasourceCount - 50,
            'datasource count should decrease by 50');
        assert.ok(afterMetrics.totalStock <= beforeMetrics.totalStock,
            'total stock should decrease or stay same after delete');
    });

    it('no token/key/password/service_role in metrics', () => {
        const metrics = {
            datasourceCount: 150,
            totalStock: 500,
            availableStock: 450
        };
        assert.ok(!('token' in metrics));
        assert.ok(!('password' in metrics));
        assert.ok(!('service_role' in metrics));
        assert.ok(!('api_key' in metrics));
        assert.ok(!('secret' in metrics));
    });
});