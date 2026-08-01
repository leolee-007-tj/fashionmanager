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

const ORDERS_JS = readFile('js/orders.js');
const DB_JS = readFile('js/db.js');
const MIGRATION_SQL = readFile('supabase/migrations/20260711000900_order_inventory_rpc.sql');

describe('Order Cancel RPC Root-Cause Contract', function () {

    // ============================================================
    // RC1-RC5: safeErrors and debug summary
    // ============================================================

    it('RC1: __LAST_ORDER_DELETE_SUMMARY includes safeErrors', function () {
        const batchStart = ORDERS_JS.indexOf('_batchCancelRemote()');
        const batchEnd = ORDERS_JS.indexOf('selectDuplicates', batchStart);
        const batchSection = ORDERS_JS.slice(batchStart, batchEnd > batchStart ? batchEnd : batchStart + 2000);
        const summaryStart = batchSection.indexOf('__LAST_ORDER_DELETE_SUMMARY');
        const summaryEnd = batchSection.indexOf('};', summaryStart + 100);
        const summarySection = batchSection.slice(summaryStart, summaryEnd > summaryStart ? summaryEnd + 1 : summaryStart + 800);
        assert.match(summarySection, /safeErrors/, 'summary should include safeErrors');
    });

    it('RC2: safeErrors contains classifier/code/status/message/details/hint', function () {
        const batchStart = ORDERS_JS.indexOf('_batchCancelRemote()');
        const batchEnd = ORDERS_JS.indexOf('selectDuplicates', batchStart);
        const batchSection = ORDERS_JS.slice(batchStart, batchEnd > batchStart ? batchEnd : batchStart + 2000);
        assert.match(batchSection, /safeErrors\.push/, 'safeErrors should be pushed');
        assert.match(batchSection, /classifier/, 'safeErrors should include classifier');
        assert.match(batchSection, /e\.code/, 'safeErrors should include code');
        assert.match(batchSection, /e\.status/, 'safeErrors should include status');
        assert.match(batchSection, /e\.message/, 'safeErrors should include message');
        assert.match(batchSection, /e\.details/, 'safeErrors should include details');
        assert.match(batchSection, /e\.hint/, 'safeErrors should include hint');
    });

    it('RC3: safeErrors message/details/hint are sliced (no full UUID)', function () {
        const batchStart = ORDERS_JS.indexOf('_batchCancelRemote()');
        const batchEnd = ORDERS_JS.indexOf('selectDuplicates', batchStart);
        const batchSection = ORDERS_JS.slice(batchStart, batchEnd > batchStart ? batchEnd : batchStart + 2000);
        assert.match(batchSection, /\.slice\(0,\s*120\)/, 'safeErrors message should be sliced');
        assert.match(batchSection, /\.slice\(0,\s*160\)/, 'safeErrors details/hint should be sliced');
    });

    it('RC4: summary excludes UUID/token/key/password/email/store_id/order_id', function () {
        const batchStart = ORDERS_JS.indexOf('_batchCancelRemote()');
        const batchEnd = ORDERS_JS.indexOf('selectDuplicates', batchStart);
        const batchSection = ORDERS_JS.slice(batchStart, batchEnd > batchStart ? batchEnd : batchStart + 2000);
        const summaryStart = batchSection.indexOf('__LAST_ORDER_DELETE_SUMMARY');
        const summaryEnd = batchSection.indexOf('};', summaryStart + 100);
        const summarySection = batchSection.slice(summaryStart, summaryEnd > summaryStart ? summaryEnd + 1 : summaryStart + 800);
        assert.doesNotMatch(summarySection, /token|key|password|email|user_id|store_id|order_id|uuid.*[a-f0-9]{8}-/, 'summary should not leak sensitive info');
    });

    it('RC5: summary safeErrors is sliced (max 20)', function () {
        const batchStart = ORDERS_JS.indexOf('_batchCancelRemote()');
        const batchEnd = ORDERS_JS.indexOf('selectDuplicates', batchStart);
        const batchSection = ORDERS_JS.slice(batchStart, batchEnd > batchStart ? batchEnd : batchStart + 2000);
        assert.match(batchSection, /safeErrors:\s*safeErrors\.slice\(0,\s*20\)/, 'safeErrors should be sliced to 20');
    });

    // ============================================================
    // RC6-RC12: App.flash messages by fail reason
    // ============================================================

    it('RC6: ORDER_NOT_PENDING flash message is specific', function () {
        const batchStart = ORDERS_JS.indexOf('_batchCancelRemote()');
        const batchEnd = ORDERS_JS.indexOf('selectDuplicates', batchStart);
        const batchSection = ORDERS_JS.slice(batchStart, batchEnd > batchStart ? batchEnd : batchStart + 2000);
        assert.match(batchSection, /ORDER_NOT_PENDING/, 'should reference ORDER_NOT_PENDING');
        assert.match(batchSection, /출고\/완료 주문은 목록에서 삭제할 수 없습니다/, 'should mention shipped/completed');
    });

    it('RC7: RPC_MISSING_OR_SIGNATURE_MISMATCH flash message is specific', function () {
        const batchStart = ORDERS_JS.indexOf('_batchCancelRemote()');
        const batchEnd = ORDERS_JS.indexOf('selectDuplicates', batchStart);
        const batchSection = ORDERS_JS.slice(batchStart, batchEnd > batchStart ? batchEnd : batchStart + 2000);
        assert.match(batchSection, /RPC_MISSING_OR_SIGNATURE_MISMATCH/, 'should reference RPC_MISSING_OR_SIGNATURE_MISMATCH');
        assert.match(batchSection, /RPC 구성.*코드와 맞지 않습니다/, 'should mention RPC mismatch');
    });

    it('RC8: PERMISSION_DENIED/RLS_DENIED flash message is specific', function () {
        const batchStart = ORDERS_JS.indexOf('_batchCancelRemote()');
        const batchEnd = ORDERS_JS.indexOf('selectDuplicates', batchStart);
        const batchSection = ORDERS_JS.slice(batchStart, batchEnd > batchStart ? batchEnd : batchStart + 2000);
        assert.match(batchSection, /PERMISSION_DENIED.*RLS_DENIED/, 'should reference PERMISSION_DENIED or RLS_DENIED');
        assert.match(batchSection, /로그인\/스토어 권한\/RLS/, 'should mention login/store/RLS');
    });

    it('RC9: INVALID_REMOTE_ID flash message is specific', function () {
        const batchStart = ORDERS_JS.indexOf('_batchCancelRemote()');
        const batchEnd = ORDERS_JS.indexOf('selectDuplicates', batchStart);
        const batchSection = ORDERS_JS.slice(batchStart, batchEnd > batchStart ? batchEnd : batchStart + 2000);
        assert.match(batchSection, /INVALID_REMOTE_ID/, 'should reference INVALID_REMOTE_ID');
        assert.match(batchSection, /고유번호 연결이 잘못/, 'should mention invalid remote id');
    });

    it('RC10: ORDER_NOT_FOUND flash message is specific', function () {
        const batchStart = ORDERS_JS.indexOf('_batchCancelRemote()');
        const batchEnd = ORDERS_JS.indexOf('selectDuplicates', batchStart);
        const batchSection = ORDERS_JS.slice(batchStart, batchEnd > batchStart ? batchEnd : batchStart + 2000);
        assert.match(batchSection, /ORDER_NOT_FOUND/, 'should reference ORDER_NOT_FOUND');
        assert.match(batchSection, /새로고침/, 'should mention refresh');
    });

    it('RC11: UNKNOWN fallback message mentions summary', function () {
        const batchStart = ORDERS_JS.indexOf('_batchCancelRemote()');
        const batchEnd = ORDERS_JS.indexOf('selectDuplicates', batchStart);
        const batchSection = ORDERS_JS.slice(batchStart, batchEnd > batchStart ? batchEnd : batchStart + 2000);
        assert.match(batchSection, /상세 오류를 콘솔 summary/, 'unknown fallback should mention console summary');
    });

    it('RC12: _cancelRemote flash messages cover all classifiers', function () {
        const cancelRemoteStart = ORDERS_JS.indexOf('_cancelRemote(id) {');
        const refreshStart = ORDERS_JS.indexOf('_refreshOrdersAfterRemoteMutation()');
        const cancelRemoteSection = ORDERS_JS.slice(cancelRemoteStart, refreshStart > cancelRemoteStart ? refreshStart : cancelRemoteStart + 4000);
        assert.match(cancelRemoteSection, /ORDER_NOT_PENDING/, '_cancelRemote should handle ORDER_NOT_PENDING');
        assert.match(cancelRemoteSection, /RPC_MISSING_OR_SIGNATURE_MISMATCH/, '_cancelRemote should handle RPC_MISSING');
        assert.match(cancelRemoteSection, /PERMISSION_DENIED/, '_cancelRemote should handle PERMISSION_DENIED');
        assert.match(cancelRemoteSection, /INVALID_REMOTE_ID/, '_cancelRemote should handle INVALID_REMOTE_ID');
        assert.match(cancelRemoteSection, /ORDER_NOT_FOUND/, '_cancelRemote should handle ORDER_NOT_FOUND');
    });

    // ============================================================
    // RC13-RC18: PENDING button disabled
    // ============================================================

    it('RC13: non-PENDING delete button has no onclick', function () {
        const renderBodyStart = ORDERS_JS.indexOf('_renderListBody(products, customers)');
        const renderBodyEnd = ORDERS_JS.indexOf('toggleSelect(id)', renderBodyStart);
        const renderBodySection = ORDERS_JS.slice(renderBodyStart, renderBodyEnd > renderBodyStart ? renderBodyEnd : renderBodyStart + 2000);
        assert.match(renderBodySection, /deleteOnclick/, 'should have deleteOnclick variable');
        assert.match(renderBodySection, /isPending \? `onclick/, 'onclick should be conditional on isPending');
    });

    it('RC14: SHIPPED has specific delete title', function () {
        const renderBodyStart = ORDERS_JS.indexOf('_renderListBody(products, customers)');
        const renderBodyEnd = ORDERS_JS.indexOf('toggleSelect(id)', renderBodyStart);
        const renderBodySection = ORDERS_JS.slice(renderBodyStart, renderBodyEnd > renderBodyStart ? renderBodyEnd : renderBodyStart + 2000);
        assert.match(renderBodySection, /SHIPPED.*출고된 주문은 삭제/, 'SHIPPED should have specific title');
    });

    it('RC15: COMPLETED has specific delete title', function () {
        const renderBodyStart = ORDERS_JS.indexOf('_renderListBody(products, customers)');
        const renderBodyEnd = ORDERS_JS.indexOf('toggleSelect(id)', renderBodyStart);
        const renderBodySection = ORDERS_JS.slice(renderBodyStart, renderBodyEnd > renderBodyStart ? renderBodyEnd : renderBodyStart + 2000);
        assert.match(renderBodySection, /COMPLETED.*완료된 주문은 삭제/, 'COMPLETED should have specific title');
    });

    it('RC16: CANCELLED has specific delete title', function () {
        const renderBodyStart = ORDERS_JS.indexOf('_renderListBody(products, customers)');
        const renderBodyEnd = ORDERS_JS.indexOf('toggleSelect(id)', renderBodyStart);
        const renderBodySection = ORDERS_JS.slice(renderBodyStart, renderBodyEnd > renderBodyStart ? renderBodyEnd : renderBodyStart + 2000);
        assert.match(renderBodySection, /CANCELLED.*이미 취소된 주문/, 'CANCELLED should have specific title');
    });

    it('RC17: _batchCancelRemote skips non-PENDING before RPC call', function () {
        const batchStart = ORDERS_JS.indexOf('async _batchCancelRemote()');
        const batchEnd = ORDERS_JS.indexOf('_refreshOrdersAfterRemoteMutation', batchStart);
        const batchSection = ORDERS_JS.slice(batchStart, batchEnd > batchStart ? batchEnd : batchStart + 2000);
        // ORDER_NOT_PENDING is pushed before any cancelOrder call
        const notPendingIdx = batchSection.indexOf('ORDER_NOT_PENDING');
        const cancelOrderIdx = batchSection.indexOf('ds.cancelOrder');
        assert.ok(notPendingIdx > -1 && cancelOrderIdx > -1, 'both ORDER_NOT_PENDING and ds.cancelOrder must exist');
        assert.ok(notPendingIdx < cancelOrderIdx, 'ORDER_NOT_PENDING check should come before cancelOrder call');
    });

    it('RC18: cancelOrder is only called with remote_id (not legacy_id/id)', function () {
        const batchStart = ORDERS_JS.indexOf('async _batchCancelRemote()');
        const batchEnd = ORDERS_JS.indexOf('_refreshOrdersAfterRemoteMutation', batchStart);
        const batchSection = ORDERS_JS.slice(batchStart, batchEnd > batchStart ? batchEnd : batchStart + 2000);
        // cancelOrder should be called with remoteId variable, not key or order.id
        assert.match(batchSection, /ds\.cancelOrder\(remoteId,/, 'cancelOrder should use remoteId variable');
        assert.doesNotMatch(batchSection, /ds\.cancelOrder\(key,/, 'cancelOrder should not use raw key');
    });

    // ============================================================
    // RC19-RC22: RPC signature match
    // ============================================================

    it('RC19: cancel_order RPC signature is p_order_id uuid, p_notes text', function () {
        assert.ok(MIGRATION_SQL, 'migration SQL should exist');
        assert.match(MIGRATION_SQL, /cancel_order/, 'migration should contain cancel_order');
        assert.match(MIGRATION_SQL, /p_order_id\s+uuid/, 'signature should have p_order_id uuid');
        assert.match(MIGRATION_SQL, /p_notes\s+text/, 'signature should have p_notes text');
    });

    it('RC20: db.js _buildCancelOrderRpcPayload sends p_order_id and p_notes', function () {
        assert.ok(DB_JS, 'db.js should exist');
        const payloadStart = DB_JS.indexOf('function _buildCancelOrderRpcPayload');
        const payloadEnd = DB_JS.indexOf('function classifyCancelOrderError', payloadStart);
        const payloadSection = DB_JS.slice(payloadStart, payloadEnd > payloadStart ? payloadEnd : payloadStart + 400);
        assert.match(payloadSection, /p_order_id/, 'payload should include p_order_id');
        assert.match(payloadSection, /p_notes/, 'payload should include p_notes');
    });

    it('RC21: db.js cancelOrder validates UUID before RPC call', function () {
        assert.ok(DB_JS, 'db.js should exist');
        const cancelOrderStart = DB_JS.indexOf('cancelOrder(orderId, payload) {');
        const nextMethodStart = DB_JS.indexOf('completeOrder(orderId)', cancelOrderStart);
        const cancelOrderSection = DB_JS.slice(cancelOrderStart, nextMethodStart > cancelOrderStart ? nextMethodStart : cancelOrderStart + 600);
        assert.match(cancelOrderSection, /_validateOrderUuid/, 'cancelOrder should validate UUID');
        assert.match(cancelOrderSection, /_buildCancelOrderRpcPayload/, 'cancelOrder should build payload');
    });

    it('RC22: _callOrderRpcAndMap preserves error details for cancel_order', function () {
        assert.ok(DB_JS, 'db.js should exist');
        const rpcStart = DB_JS.indexOf('function _callOrderRpcAndMap');
        const rpcEnd = DB_JS.indexOf('function _validateOrderUuid', rpcStart);
        const rpcSection = DB_JS.slice(rpcStart, rpcEnd > rpcStart ? rpcEnd : rpcStart + 800);
        assert.match(rpcSection, /response\.error\.code/, 'should preserve error.code');
        assert.match(rpcSection, /response\.error\.details/, 'should preserve error.details');
        assert.match(rpcSection, /response\.error\.hint/, 'should preserve error.hint');
        assert.match(rpcSection, /response\.status/, 'should preserve response.status');
    });

    // ============================================================
    // RC23-RC25: Action key and UUID safety
    // ============================================================

    it('RC23: _getOrderActionKey returns string (not Number)', function () {
        assert.match(ORDERS_JS, /_getOrderActionKey\(order\)/, 'orders.js should contain _getOrderActionKey');
        const actionKeyStart = ORDERS_JS.indexOf('_getOrderActionKey(order)');
        const actionKeyEnd = ORDERS_JS.indexOf('isRemoteOrdersMode()', actionKeyStart);
        const actionKeySection = ORDERS_JS.slice(actionKeyStart, actionKeyEnd > actionKeyStart ? actionKeyEnd : actionKeyStart + 200);
        assert.match(actionKeySection, /String\(/, '_getOrderActionKey should wrap in String()');
        assert.doesNotMatch(actionKeySection, /Number\(/, '_getOrderActionKey should not use Number()');
    });

    it('RC24: UUID is never Number-converted in cancel flow', function () {
        const batchStart = ORDERS_JS.indexOf('async _batchCancelRemote()');
        const batchEnd = ORDERS_JS.indexOf('_refreshOrdersAfterRemoteMutation', batchStart);
        const batchSection = ORDERS_JS.slice(batchStart, batchEnd > batchStart ? batchEnd : batchStart + 2000);
        assert.doesNotMatch(batchSection, /Number\(o\.id\)/, 'should not use Number(o.id)');
        assert.doesNotMatch(batchSection, /Number\(o\.remote_id\)/, 'should not use Number(o.remote_id)');
        assert.doesNotMatch(batchSection, /Number\(order\.id\)/, 'should not use Number(order.id)');
    });

    it('RC25: ds is not defined regression — ds declared at function scope', function () {
        const batchStart = ORDERS_JS.indexOf('async _batchCancelRemote()');
        const batchEnd = ORDERS_JS.indexOf('_refreshOrdersAfterRemoteMutation', batchStart);
        const batchSection = ORDERS_JS.slice(batchStart, batchEnd > batchStart ? batchEnd : batchStart + 2000);
        const dsDecl = batchSection.match(/const ds\s*=\s*DB\.getOrdersDataSource/);
        assert.ok(dsDecl, '_batchCancelRemote should declare ds');
        const tryBlock = batchSection.match(/try\s*\{([\s\S]*?)\}\s*catch\s*\(/);
        if (tryBlock) {
            assert.doesNotMatch(tryBlock[1], /const ds\s*=\s*DB\.getOrdersDataSource/, 'ds should not be declared inside try block');
        }
    });

    // ============================================================
    // RC26-RC30: Count and routing
    // ============================================================

    it('RC26: cancel failure does not reduce active count', function () {
        const batchStart = ORDERS_JS.indexOf('_batchCancelRemote()');
        const batchEnd = ORDERS_JS.indexOf('selectDuplicates', batchStart);
        const batchSection = ORDERS_JS.slice(batchStart, batchEnd > batchStart ? batchEnd : batchStart + 2000);
        assert.match(batchSection, /beforeActiveCount/, 'should track beforeActiveCount');
        assert.match(batchSection, /afterActiveCount/, 'should track afterActiveCount');
        assert.match(batchSection, /countDeltaMatchesSuccess/, 'should verify countDeltaMatchesSuccess');
    });

    it('RC27: cancel success reloads and reduces active count', function () {
        const batchStart = ORDERS_JS.indexOf('_batchCancelRemote()');
        const batchEnd = ORDERS_JS.indexOf('selectDuplicates', batchStart);
        const batchSection = ORDERS_JS.slice(batchStart, batchEnd > batchStart ? batchEnd : batchStart + 2000);
        assert.match(batchSection, /_refreshOrdersAfterRemoteMutation/, 'should reload after mutation');
        assert.match(batchSection, /successCount/, 'should track successCount');
    });

    it('RC28: sales batch delete does not call Products.batchDelete', function () {
        const renderBodyStart = ORDERS_JS.indexOf('_renderListBody(products, customers)');
        const renderBodyEnd = ORDERS_JS.indexOf('toggleSelect(id)', renderBodyStart);
        const renderBodySection = ORDERS_JS.slice(renderBodyStart, renderBodyEnd > renderBodyStart ? renderBodyEnd : renderBodyStart + 2000);
        assert.match(renderBodySection, /Orders\.batchDelete/, 'sales batch delete should call Orders.batchDelete');
        assert.doesNotMatch(renderBodySection, /Products\.batchDelete/, 'sales batch delete should not call Products.batchDelete');
    });

    it('RC29: orders row checkbox data-target is orders', function () {
        const renderBodyStart = ORDERS_JS.indexOf('_renderListBody(products, customers)');
        const renderBodyEnd = ORDERS_JS.indexOf('toggleSelect(id)', renderBodyStart);
        const renderBodySection = ORDERS_JS.slice(renderBodyStart, renderBodyEnd > renderBodyStart ? renderBodyEnd : renderBodyStart + 2000);
        assert.match(renderBodySection, /row-checkbox.*data-target="orders"/, 'orders row checkbox should have data-target="orders"');
    });

    it('RC30: applyFilters excludes CANCELLED by default', function () {
        const filterStart = ORDERS_JS.indexOf('applyFilters()');
        const filterEnd = ORDERS_JS.indexOf('yearOptions', filterStart);
        const filterSection = ORDERS_JS.slice(filterStart, filterEnd > filterStart ? filterEnd : filterStart + 600);
        assert.match(filterSection, /cancelledExcluded/, 'applyFilters should check cancelledExcluded');
        assert.match(filterSection, /CANCELLED/, 'applyFilters should filter CANCELLED status');
    });
});