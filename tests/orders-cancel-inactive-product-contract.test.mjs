import { describe, it } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import { join } from 'node:path';

const REPO_ROOT = join(new URL('.', import.meta.url).pathname, '..');

function readFile(relativePath) {
    const fullPath = join(REPO_ROOT, relativePath);
    if (!existsSync(fullPath)) return null;
    return readFileSync(fullPath, 'utf-8');
}

const DB_JS = readFile('js/db.js');
const ORDERS_JS = readFile('js/orders.js');
const MIGRATION_SQL = readFile('supabase/migrations/20260801000000_fix_cancel_order_inactive_product.sql');

// ============================================================
// Order Cancel Inactive Product Contract Tests
// ============================================================

describe('Order Cancel Inactive Product Contract', function () {

    // ============================================================
    // CIP1-CIP5: Error classifier
    // ============================================================

    it('CIP1: P0001 + product_id must be active maps to PRODUCT_INACTIVE_OR_STORE_MISMATCH_ON_CANCEL', function () {
        const classifyStart = DB_JS.indexOf('function classifyCancelOrderError(err)');
        const classifyEnd = DB_JS.indexOf('return {', classifyStart);
        const classifySection = DB_JS.slice(classifyStart, classifyEnd > classifyStart ? classifyEnd : classifyStart + 2000);
        assert.match(classifySection, /PRODUCT_INACTIVE_OR_STORE_MISMATCH_ON_CANCEL/, 'should classify P0001 product active error');
        assert.match(classifySection, /product_id must be active/, 'should detect product_id must be active message');
    });

    it('CIP2: classifyCancelOrderError handles ORDER_PRODUCT_STORE_MISMATCH', function () {
        const classifyStart = DB_JS.indexOf('function classifyCancelOrderError(err)');
        const classifyEnd = DB_JS.indexOf('return {', classifyStart);
        const classifySection = DB_JS.slice(classifyStart, classifyEnd > classifyStart ? classifyEnd : classifyStart + 2000);
        assert.match(classifySection, /ORDER_PRODUCT_STORE_MISMATCH/, 'should classify ORDER_PRODUCT_STORE_MISMATCH');
    });

    it('CIP3: classifyCancelOrderError handles ORDER_CANCEL_PERMISSION_DENIED', function () {
        const classifyStart = DB_JS.indexOf('function classifyCancelOrderError(err)');
        const classifyEnd = DB_JS.indexOf('return {', classifyStart);
        const classifySection = DB_JS.slice(classifyStart, classifyEnd > classifyStart ? classifyEnd : classifyStart + 2000);
        assert.match(classifySection, /ORDER_CANCEL_PERMISSION_DENIED/, 'should classify ORDER_CANCEL_PERMISSION_DENIED');
    });

    it('CIP4: orders.js batch delete handles PRODUCT_INACTIVE_OR_STORE_MISMATCH_ON_CANCEL', function () {
        const batchStart = ORDERS_JS.indexOf('_batchCancelRemote()');
        const batchEnd = ORDERS_JS.indexOf('selectDuplicates', batchStart);
        const batchSection = ORDERS_JS.slice(batchStart, batchEnd > batchStart ? batchEnd : batchStart + 2500);
        assert.match(batchSection, /PRODUCT_INACTIVE_OR_STORE_MISMATCH_ON_CANCEL/, 'batch delete should handle PRODUCT_INACTIVE_OR_STORE_MISMATCH_ON_CANCEL');
    });

    it('CIP5: orders.js individual cancel handles PRODUCT_INACTIVE_OR_STORE_MISMATCH_ON_CANCEL', function () {
        const cancelStart = ORDERS_JS.indexOf('async _cancelRemote(id)');
        const cancelEnd = ORDERS_JS.indexOf('async _refreshOrdersAfterRemoteMutation', cancelStart);
        const cancelSection = ORDERS_JS.slice(cancelStart, cancelEnd > cancelStart ? cancelEnd : cancelStart + 2000);
        assert.match(cancelSection, /PRODUCT_INACTIVE_OR_STORE_MISMATCH_ON_CANCEL/, 'individual cancel should handle PRODUCT_INACTIVE_OR_STORE_MISMATCH_ON_CANCEL');
    });

    // ============================================================
    // CIP6-CIP10: Migration SQL checks
    // ============================================================

    it('CIP6: cancel_order migration does not require products.deleted_at IS NULL', function () {
        // Find the cancel_order function in the migration
        const cancelStart = MIGRATION_SQL.indexOf('CREATE OR REPLACE FUNCTION public.cancel_order(');
        const cancelEnd = MIGRATION_SQL.indexOf('REVOKE ALL ON FUNCTION public.cancel_order', cancelStart);
        const cancelSection = MIGRATION_SQL.slice(cancelStart, cancelEnd > cancelStart ? cancelEnd : cancelStart + 4000);
        // The product lookup should NOT have deleted_at IS NULL
        const productSelect = cancelSection.indexOf('SELECT * INTO v_product FROM public.products');
        const productSelectEnd = cancelSection.indexOf('FOR UPDATE;', productSelect);
        const productSelectSection = cancelSection.slice(productSelect, productSelectEnd > productSelect ? productSelectEnd + 20 : productSelect + 500);
        assert.doesNotMatch(productSelectSection, /deleted_at IS NULL/, 'cancel_order should not require deleted_at IS NULL for product');
    });

    it('CIP7: cancel_order uses order.product_id from existing order', function () {
        const cancelStart = MIGRATION_SQL.indexOf('CREATE OR REPLACE FUNCTION public.cancel_order(');
        const cancelEnd = MIGRATION_SQL.indexOf('REVOKE ALL ON FUNCTION public.cancel_order', cancelStart);
        const cancelSection = MIGRATION_SQL.slice(cancelStart, cancelEnd > cancelStart ? cancelEnd : cancelStart + 4000);
        assert.match(cancelSection, /v_order\.product_id/, 'should use order.product_id from existing order');
    });

    it('CIP8: cancel_order does not accept product_id from client', function () {
        const cancelStart = MIGRATION_SQL.indexOf('CREATE OR REPLACE FUNCTION public.cancel_order(');
        const cancelEnd = MIGRATION_SQL.indexOf('AS $$', cancelStart);
        const signatureSection = MIGRATION_SQL.slice(cancelStart, cancelEnd > cancelStart ? cancelEnd + 50 : cancelStart + 500);
        // Signature should have p_order_id and p_notes only, no p_product_id
        assert.doesNotMatch(signatureSection, /p_product_id/, 'cancel_order should not accept product_id from client');
        assert.match(signatureSection, /p_order_id/, 'cancel_order should accept p_order_id');
        assert.match(signatureSection, /p_notes/, 'cancel_order should accept p_notes');
    });

    it('CIP9: trigger allows UPDATE without product_id change on soft-deleted product', function () {
        const triggerStart = MIGRATION_SQL.indexOf('CREATE OR REPLACE FUNCTION public.validate_order_store_consistency()');
        const triggerEnd = MIGRATION_SQL.indexOf('DROP TRIGGER IF EXISTS trg_orders_validate_store', triggerStart);
        const triggerSection = MIGRATION_SQL.slice(triggerStart, triggerEnd > triggerStart ? triggerEnd : triggerStart + 3000);
        // Should have the ELSIF for UPDATE without product_id change
        assert.match(triggerSection, /NOT DISTINCT FROM OLD\.product_id/, 'trigger should handle UPDATE without product_id change');
        // Should NOT have deleted_at IS NULL in the no-change branch
        const noChangeStart = triggerSection.indexOf('NOT DISTINCT FROM OLD.product_id');
        const noChangeEnd = triggerSection.indexOf('END IF;', noChangeStart + 100);
        const noChangeSection = triggerSection.slice(noChangeStart, noChangeEnd > noChangeStart ? noChangeEnd + 10 : noChangeStart + 500);
        assert.doesNotMatch(noChangeSection, /deleted_at IS NULL/, 'no-change branch should not check deleted_at IS NULL');
    });

    it('CIP10: cancel_order still rejects product from different store', function () {
        const cancelStart = MIGRATION_SQL.indexOf('CREATE OR REPLACE FUNCTION public.cancel_order(');
        const cancelEnd = MIGRATION_SQL.indexOf('REVOKE ALL ON FUNCTION public.cancel_order', cancelStart);
        const cancelSection = MIGRATION_SQL.slice(cancelStart, cancelEnd > cancelStart ? cancelEnd : cancelStart + 4000);
        assert.match(cancelSection, /store_id = v_store_id/, 'should check store_id match');
        assert.match(cancelSection, /ORDER_PRODUCT_STORE_MISMATCH/, 'should raise ORDER_PRODUCT_STORE_MISMATCH');
    });

    it('CIP11: cancel_order still rejects non-PENDING orders', function () {
        const cancelStart = MIGRATION_SQL.indexOf('CREATE OR REPLACE FUNCTION public.cancel_order(');
        const cancelEnd = MIGRATION_SQL.indexOf('REVOKE ALL ON FUNCTION public.cancel_order', cancelStart);
        const cancelSection = MIGRATION_SQL.slice(cancelStart, cancelEnd > cancelStart ? cancelEnd : cancelStart + 4000);
        assert.match(cancelSection, /PENDING/, 'should check PENDING status');
        assert.match(cancelSection, /ORDER_NOT_PENDING/, 'should raise ORDER_NOT_PENDING');
    });

    it('CIP12: cancel_order handles soft-deleted product with insufficient reserved_stock', function () {
        const cancelStart = MIGRATION_SQL.indexOf('CREATE OR REPLACE FUNCTION public.cancel_order(');
        const cancelEnd = MIGRATION_SQL.indexOf('REVOKE ALL ON FUNCTION public.cancel_order', cancelStart);
        const cancelSection = MIGRATION_SQL.slice(cancelStart, cancelEnd > cancelStart ? cancelEnd : cancelStart + 4000);
        // Should have fallback logic for soft-deleted products
        assert.match(cancelSection, /deleted_at IS NOT NULL/, 'should handle soft-deleted product case');
    });

    // ============================================================
    // CIP13-CIP15: Data preservation
    // ============================================================

    it('CIP13: cancel_order does not hard delete orders', function () {
        const cancelStart = MIGRATION_SQL.indexOf('CREATE OR REPLACE FUNCTION public.cancel_order(');
        const cancelEnd = MIGRATION_SQL.indexOf('REVOKE ALL ON FUNCTION public.cancel_order', cancelStart);
        const cancelSection = MIGRATION_SQL.slice(cancelStart, cancelEnd > cancelStart ? cancelEnd : cancelStart + 4000);
        assert.doesNotMatch(cancelSection, /DELETE FROM public\.orders/, 'should not hard delete orders');
    });

    it('CIP14: cancel_order does not hard delete products', function () {
        const cancelStart = MIGRATION_SQL.indexOf('CREATE OR REPLACE FUNCTION public.cancel_order(');
        const cancelEnd = MIGRATION_SQL.indexOf('REVOKE ALL ON FUNCTION public.cancel_order', cancelStart);
        const cancelSection = MIGRATION_SQL.slice(cancelStart, cancelEnd > cancelStart ? cancelEnd : cancelStart + 4000);
        assert.doesNotMatch(cancelSection, /DELETE FROM public\.products/, 'should not hard delete products');
    });

    it('CIP15: cancel_order releases reserved_stock safely with GREATEST', function () {
        const cancelStart = MIGRATION_SQL.indexOf('CREATE OR REPLACE FUNCTION public.cancel_order(');
        const cancelEnd = MIGRATION_SQL.indexOf('REVOKE ALL ON FUNCTION public.cancel_order', cancelStart);
        const cancelSection = MIGRATION_SQL.slice(cancelStart, cancelEnd > cancelStart ? cancelEnd : cancelStart + 4000);
        assert.match(cancelSection, /GREATEST/, 'should use GREATEST for safe reserved_stock release');
    });

    // ============================================================
    // CIP16: Summary safety
    // ============================================================

    it('CIP16: safeErrors in summary does not expose UUID/token/key/password', function () {
        const batchStart = ORDERS_JS.indexOf('_batchCancelRemote()');
        const batchEnd = ORDERS_JS.indexOf('selectDuplicates', batchStart);
        const batchSection = ORDERS_JS.slice(batchStart, batchEnd > batchStart ? batchEnd : batchStart + 2500);
        const summaryStart = batchSection.indexOf('__LAST_ORDER_DELETE_SUMMARY');
        const summaryEnd = batchSection.indexOf('};', summaryStart + 100);
        const summarySection = batchSection.slice(summaryStart, summaryEnd > summaryStart ? summaryEnd + 1 : summaryStart + 800);
        assert.doesNotMatch(summarySection, /token|key|password|secret/, 'should not expose secrets in summary');
    });

});