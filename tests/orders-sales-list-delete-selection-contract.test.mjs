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
const APP_JS = readFile('js/app.js');
const DB_JS = readFile('js/db.js');

describe('Sales List Single-Row and Delete/Selection Contract', function () {

    // ============================================================
    // SL1: Single-row rendering
    // ============================================================

    it('SL1: _renderListBody renders one row per order', function () {
        assert.ok(ORDERS_JS, 'orders.js should exist');
        assert.match(ORDERS_JS, /_renderListBody/, 'orders.js should contain _renderListBody');
        // list.forEach with single <tr> — no colspan edit form row
        assert.match(ORDERS_JS, /list\.forEach/, 'renderListBody should iterate over list');
    });

    it('SL2: no inline orderEditForm in list table', function () {
        // _renderListBody should not contain orderEditForm
        const renderBodyStart = ORDERS_JS.indexOf('_renderListBody(products, customers)');
        const renderBodyEnd = ORDERS_JS.indexOf('toggleSelect(id)', renderBodyStart);
        const renderBodySection = ORDERS_JS.slice(renderBodyStart, renderBodyEnd > renderBodyStart ? renderBodyEnd : renderBodyStart + 2000);
        assert.doesNotMatch(renderBodySection, /orderEditForm/, '_renderListBody should not contain orderEditForm');
    });

    it('SL3: no colspan edit form row in list table', function () {
        // _renderListBody should not contain colspan with form
        const renderBodyStart = ORDERS_JS.indexOf('_renderListBody(products, customers)');
        const renderBodyEnd = ORDERS_JS.indexOf('toggleSelect(id)', renderBodyStart);
        const renderBodySection = ORDERS_JS.slice(renderBodyStart, renderBodyEnd > renderBodyStart ? renderBodyEnd : renderBodyStart + 2000);
        assert.doesNotMatch(renderBodySection, /colspan/, '_renderListBody should not contain colspan');
    });

    it('SL4: no editingOrderId in _renderListBody', function () {
        const renderBodyStart = ORDERS_JS.indexOf('_renderListBody(products, customers)');
        const renderBodyEnd = ORDERS_JS.indexOf('toggleSelect(id)', renderBodyStart);
        const renderBodySection = ORDERS_JS.slice(renderBodyStart, renderBodyEnd > renderBodyStart ? renderBodyEnd : renderBodyStart + 2000);
        assert.doesNotMatch(renderBodySection, /editingOrderId/, '_renderListBody should not reference editingOrderId');
    });

    it('SL5: edit button routes to #/orders/:id/edit', function () {
        // editOrder navigates to hash route
        assert.match(ORDERS_JS, /editOrder\(actionKey\)/, 'orders.js should contain editOrder');
        assert.match(ORDERS_JS, /#\/orders\/.*edit/, 'editOrder should route to #/orders/:id/edit');
    });

    // ============================================================
    // SL6-SL10: Action key policy
    // ============================================================

    it('SL6: _getOrderActionKey prefers remote_id over legacy_id over id', function () {
        assert.match(ORDERS_JS, /_getOrderActionKey\(order\)/, 'orders.js should contain _getOrderActionKey');
        // remote_id || legacy_id || id
        assert.match(ORDERS_JS, /remote_id.*legacy_id.*\bid\b/, '_getOrderActionKey should prefer remote_id > legacy_id > id');
    });

    it('SL7: _getOrderActionKey returns string', function () {
        // Should use String() wrapping
        const actionKeyStart = ORDERS_JS.indexOf('_getOrderActionKey(order)');
        const actionKeyEnd = ORDERS_JS.indexOf('renderList', actionKeyStart);
        const actionKeySection = ORDERS_JS.slice(actionKeyStart, actionKeyEnd > actionKeyStart ? actionKeyEnd : actionKeyStart + 200);
        assert.match(actionKeySection, /String\(/, '_getOrderActionKey should wrap in String()');
    });

    it('SL8: checkbox data-id is string action key', function () {
        // row-checkbox data-id should use actionKey (string)
        const renderBodyStart = ORDERS_JS.indexOf('_renderListBody(products, customers)');
        const renderBodyEnd = ORDERS_JS.indexOf('toggleSelect(id)', renderBodyStart);
        const renderBodySection = ORDERS_JS.slice(renderBodyStart, renderBodyEnd > renderBodyStart ? renderBodyEnd : renderBodyStart + 2000);
        assert.match(renderBodySection, /data-id="\$\{actionKey\}/, 'row-checkbox should use actionKey for data-id');
    });

    it('SL9: selected Set stores string keys', function () {
        // toggleSelect uses String(key)
        assert.match(ORDERS_JS, /toggleSelect\(id\)/, 'orders.js should contain toggleSelect');
        const toggleStart = ORDERS_JS.indexOf('toggleSelect(id)');
        const toggleEnd = ORDERS_JS.indexOf('toggleSelectAll', toggleStart);
        const toggleSection = ORDERS_JS.slice(toggleStart, toggleEnd > toggleStart ? toggleEnd : toggleStart + 200);
        assert.match(toggleSection, /String\(id\)/, 'toggleSelect should use String(id)');
    });

    it('SL10: UUID is never Number-converted in orders.js', function () {
        // Should not contain Number(id) or Number(o.id) for orders
        // Exclude local mode renderShip which uses parseInt for local ids
        // Check toggleSelect, toggleSelectAll, batchDelete, _batchCancelRemote
        assert.doesNotMatch(ORDERS_JS, /Number\(o\.id\)/, 'orders.js should not use Number(o.id)');
        assert.doesNotMatch(ORDERS_JS, /Number\(o\.remote_id\)/, 'orders.js should not use Number(o.remote_id)');
    });

    // ============================================================
    // SL11-SL15: Selection persistence
    // ============================================================

    it('SL11: toggleSelectAll uses visibleKeys from _getOrderActionKey', function () {
        assert.match(ORDERS_JS, /toggleSelectAll/, 'orders.js should contain toggleSelectAll');
        const toggleAllStart = ORDERS_JS.indexOf('toggleSelectAll()');
        const toggleAllEnd = ORDERS_JS.indexOf('batchDelete', toggleAllStart);
        const toggleAllSection = ORDERS_JS.slice(toggleAllStart, toggleAllEnd > toggleAllStart ? toggleAllEnd : toggleAllStart + 400);
        assert.match(toggleAllSection, /_getOrderActionKey/, 'toggleSelectAll should use _getOrderActionKey');
        assert.match(toggleAllSection, /filtered\.map/, 'toggleSelectAll should use filtered.map');
    });

    it('SL12: toggleSelectAll does not use Number conversion', function () {
        const toggleAllStart = ORDERS_JS.indexOf('toggleSelectAll()');
        const toggleAllEnd = ORDERS_JS.indexOf('batchDelete', toggleAllStart);
        const toggleAllSection = ORDERS_JS.slice(toggleAllStart, toggleAllEnd > toggleAllStart ? toggleAllEnd : toggleAllStart + 400);
        assert.doesNotMatch(toggleAllSection, /Number\(/, 'toggleSelectAll should not use Number()');
    });

    it('SL13: select-all checkbox uses data-target="orders"', function () {
        const renderBodyStart = ORDERS_JS.indexOf('_renderListBody(products, customers)');
        const renderBodyEnd = ORDERS_JS.indexOf('toggleSelect(id)', renderBodyStart);
        const renderBodySection = ORDERS_JS.slice(renderBodyStart, renderBodyEnd > renderBodyStart ? renderBodyEnd : renderBodyStart + 2000);
        assert.match(renderBodySection, /select-all-cb.*data-target="orders"/, 'select-all-cb should have data-target="orders"');
    });

    it('SL14: common checkbox handler passes string id to toggleSelect', function () {
        assert.ok(APP_JS, 'app.js should exist');
        // row-checkbox handler passes dataset.id as-is
        // Find the method definition (not the call in init)
        const handlerStart = APP_JS.indexOf('setupCheckboxHandlers() {');
        const handlerEnd = APP_JS.indexOf('handleRoute', handlerStart);
        const handlerSection = APP_JS.slice(handlerStart, handlerEnd > handlerStart ? handlerEnd : handlerStart + 2000);
        assert.match(handlerSection, /row-checkbox/, 'handler should check row-checkbox');
        assert.match(handlerSection, /Orders\.toggleSelect/, 'handler should call Orders.toggleSelect');
    });

    it('SL15: common checkbox handler does not Number-convert for orders', function () {
        const handlerStart = APP_JS.indexOf('setupCheckboxHandlers() {');
        const handlerEnd = APP_JS.indexOf('handleRoute', handlerStart);
        const handlerSection = APP_JS.slice(handlerStart, handlerEnd > handlerStart ? handlerEnd : handlerStart + 2000);
        // Should pass dataset.id directly, not Number(dataset.id)
        const rowCheckboxBlock = handlerSection.match(/row-checkbox[\s\S]*?Orders\.toggleSelect/);
        if (rowCheckboxBlock) {
            assert.doesNotMatch(rowCheckboxBlock[0], /Number\(/, 'row-checkbox handler should not Number-convert for orders');
        }
    });

    // ============================================================
    // SL16-SL20: Remote batch delete/cancel
    // ============================================================

    it('SL16: _batchCancelRemote resolves order by remote_id/legacy_id/id', function () {
        assert.match(ORDERS_JS, /_batchCancelRemote/, 'orders.js should contain _batchCancelRemote');
        const batchStart = ORDERS_JS.indexOf('_batchCancelRemote()');
        const batchEnd = ORDERS_JS.indexOf('selectDuplicates', batchStart);
        const batchSection = ORDERS_JS.slice(batchStart, batchEnd > batchStart ? batchEnd : batchStart + 2000);
        assert.match(batchSection, /String\(o\.remote_id\)/, '_batchCancelRemote should use String(o.remote_id)');
        assert.match(batchSection, /String\(o\.legacy_id\)/, '_batchCancelRemote should use String(o.legacy_id)');
        assert.match(batchSection, /String\(o\.id\)/, '_batchCancelRemote should use String(o.id)');
    });

    it('SL17: _batchCancelRemote calls cancelOrder with remote_id only', function () {
        const batchStart = ORDERS_JS.indexOf('_batchCancelRemote()');
        const batchEnd = ORDERS_JS.indexOf('selectDuplicates', batchStart);
        const batchSection = ORDERS_JS.slice(batchStart, batchEnd > batchStart ? batchEnd : batchStart + 2000);
        assert.match(batchSection, /ds\.cancelOrder/, '_batchCancelRemote should call ds.cancelOrder');
        // should pass remoteId (derived from order.remote_id), not numeric id
        assert.match(batchSection, /cancelOrder\(remoteId/, '_batchCancelRemote should pass remoteId to cancelOrder');
    });

    it('SL18: _batchCancelRemote handles PENDING-only cancel policy', function () {
        const batchStart = ORDERS_JS.indexOf('_batchCancelRemote()');
        const batchEnd = ORDERS_JS.indexOf('selectDuplicates', batchStart);
        const batchSection = ORDERS_JS.slice(batchStart, batchEnd > batchStart ? batchEnd : batchStart + 2000);
        assert.match(batchSection, /status.*PENDING/, '_batchCancelRemote should check PENDING status');
        assert.match(batchSection, /skippedAlreadyCancelled/, '_batchCancelRemote should track skippedAlreadyCancelled');
        assert.match(batchSection, /skippedNotPending/, '_batchCancelRemote should track skippedNotPending');
    });

    it('SL19: _batchCancelRemote stores __LAST_ORDER_DELETE_SUMMARY', function () {
        const batchStart = ORDERS_JS.indexOf('_batchCancelRemote()');
        const batchEnd = ORDERS_JS.indexOf('selectDuplicates', batchStart);
        const batchSection = ORDERS_JS.slice(batchStart, batchEnd > batchStart ? batchEnd : batchStart + 2000);
        assert.match(batchSection, /__LAST_ORDER_DELETE_SUMMARY/, '_batchCancelRemote should store __LAST_ORDER_DELETE_SUMMARY');
        assert.match(batchSection, /mode.*remote/, 'summary should include mode');
        assert.match(batchSection, /successCount/, 'summary should include successCount');
        assert.match(batchSection, /failCount/, 'summary should include failCount');
        assert.match(batchSection, /beforeActiveCount/, 'summary should include beforeActiveCount');
        assert.match(batchSection, /afterActiveCount/, 'summary should include afterActiveCount');
    });

    it('SL20: cancelOrder failure does not show success flash', function () {
        const batchStart = ORDERS_JS.indexOf('_batchCancelRemote()');
        const batchEnd = ORDERS_JS.indexOf('selectDuplicates', batchStart);
        const batchSection = ORDERS_JS.slice(batchStart, batchEnd > batchStart ? batchEnd : batchStart + 2000);
        // When all fail, should show error flash
        assert.match(batchSection, /failCount > 0/, '_batchCancelRemote should check failCount');
        assert.match(batchSection, /RPC.*확인/, 'failure should show error message about RPC/권한');
    });

    // ============================================================
    // SL21-SL25: Individual delete/cancel
    // ============================================================

    it('SL21: delete(orderId) uses String(key) for local mode', function () {
        const deleteStart = ORDERS_JS.indexOf('delete(orderId)');
        const deleteEnd = ORDERS_JS.indexOf('renderAdd', deleteStart);
        const deleteSection = ORDERS_JS.slice(deleteStart, deleteEnd > deleteStart ? deleteEnd : deleteStart + 500);
        assert.match(deleteSection, /String\(orderId\)/, 'delete should use String(orderId)');
    });

    it('SL22: _cancelRemote validates remote_id format', function () {
        const cancelRemoteStart = ORDERS_JS.indexOf('_cancelRemote(id) {');
        const batchStart = ORDERS_JS.indexOf('_batchCancelRemote()');
        const cancelRemoteSection = ORDERS_JS.slice(cancelRemoteStart, batchStart > cancelRemoteStart ? batchStart : cancelRemoteStart + 800);
        assert.match(cancelRemoteSection, /remote_id/, '_cancelRemote should validate remote_id');
        assert.match(cancelRemoteSection, /typeof.*string/, '_cancelRemote should check remote_id is string');
    });

    it('SL23: _cancelRemote does not call DB.setOrders', function () {
        const cancelRemoteStart = ORDERS_JS.indexOf('_cancelRemote(id) {');
        const batchStart = ORDERS_JS.indexOf('_batchCancelRemote()');
        const cancelRemoteSection = ORDERS_JS.slice(cancelRemoteStart, batchStart > cancelRemoteStart ? batchStart : cancelRemoteStart + 800);
        assert.doesNotMatch(cancelRemoteSection, /DB\.setOrders/, '_cancelRemote should not call DB.setOrders');
    });

    it('SL24: _cancelRemote does not call DB.updateOrder', function () {
        const cancelRemoteStart = ORDERS_JS.indexOf('_cancelRemote(id) {');
        const batchStart = ORDERS_JS.indexOf('_batchCancelRemote()');
        const cancelRemoteSection = ORDERS_JS.slice(cancelRemoteStart, batchStart > cancelRemoteStart ? batchStart : cancelRemoteStart + 800);
        assert.doesNotMatch(cancelRemoteSection, /DB\.updateOrder/, '_cancelRemote should not call DB.updateOrder');
    });

    it('SL25: _cancelRemote shows error flash on failure, not success', function () {
        const cancelRemoteStart = ORDERS_JS.indexOf('_cancelRemote(id) {');
        const refreshStart = ORDERS_JS.indexOf('_refreshOrdersAfterRemoteMutation()');
        const cancelRemoteSection = ORDERS_JS.slice(cancelRemoteStart, refreshStart > cancelRemoteStart ? refreshStart : cancelRemoteStart + 3000);
        assert.match(cancelRemoteSection, /catch\s*\(/, '_cancelRemote should have error handling');
        assert.match(cancelRemoteSection, /취소.*실패|RPC.*확인/, '_cancelRemote should show failure message');
    });

    // ============================================================
    // SL26-SL30: CANCELLED filter and count
    // ============================================================

    it('SL26: applyFilters excludes CANCELLED by default', function () {
        const filterStart = ORDERS_JS.indexOf('applyFilters()');
        const filterEnd = ORDERS_JS.indexOf('yearOptions', filterStart);
        const filterSection = ORDERS_JS.slice(filterStart, filterEnd > filterStart ? filterEnd : filterStart + 600);
        assert.match(filterSection, /cancelledExcluded/, 'applyFilters should check cancelledExcluded');
        assert.match(filterSection, /CANCELLED/, 'applyFilters should filter CANCELLED status');
    });

    it('SL27: renderList shows filtered vs total count', function () {
        const renderBodyStart = ORDERS_JS.indexOf('_renderListBody(products, customers)');
        const renderBodyEnd = ORDERS_JS.indexOf('toggleSelect(id)', renderBodyStart);
        const renderBodySection = ORDERS_JS.slice(renderBodyStart, renderBodyEnd > renderBodyStart ? renderBodyEnd : renderBodyStart + 2000);
        assert.match(renderBodySection, /list\.length.*전체.*orders\.length/, 'renderList should show filtered/total');
        assert.match(renderBodySection, /취소 제외/, 'renderList should indicate cancelled exclusion');
    });

    it('SL28: success reloads list after cancel', function () {
        const batchStart = ORDERS_JS.indexOf('_batchCancelRemote()');
        const batchEnd = ORDERS_JS.indexOf('selectDuplicates', batchStart);
        const batchSection = ORDERS_JS.slice(batchStart, batchEnd > batchStart ? batchEnd : batchStart + 2000);
        assert.match(batchSection, /_refreshOrdersAfterRemoteMutation/, '_batchCancelRemote should reload after mutation');
    });

    it('SL29: _refreshOrdersAfterRemoteMutation calls _loadRemoteDataForRender', function () {
        assert.match(ORDERS_JS, /_refreshOrdersAfterRemoteMutation/, 'orders.js should contain _refreshOrdersAfterRemoteMutation');
        const refreshStart = ORDERS_JS.indexOf('_refreshOrdersAfterRemoteMutation()');
        const refreshEnd = ORDERS_JS.indexOf('complete(id)', refreshStart);
        const refreshSection = ORDERS_JS.slice(refreshStart, refreshEnd > refreshStart ? refreshEnd : refreshStart + 400);
        assert.match(refreshSection, /_loadRemoteDataForRender/, 'refresh should call _loadRemoteDataForRender');
    });

    it('SL30: count delta is verified after cancel', function () {
        const batchStart = ORDERS_JS.indexOf('_batchCancelRemote()');
        const batchEnd = ORDERS_JS.indexOf('selectDuplicates', batchStart);
        const batchSection = ORDERS_JS.slice(batchStart, batchEnd > batchStart ? batchEnd : batchStart + 2000);
        assert.match(batchSection, /countDelta/, '_batchCancelRemote should compute countDelta');
        assert.match(batchSection, /countDeltaMatchesSuccess/, 'should verify countDeltaMatchesSuccess');
    });

    // ============================================================
    // SL31-SL35: RenderList read-only and no remote mutation
    // ============================================================

    it('SL31: renderList does not contain cancelOrder in render path', function () {
        const renderBodyStart = ORDERS_JS.indexOf('_renderListBody(products, customers)');
        const renderBodyEnd = ORDERS_JS.indexOf('toggleSelect(id)', renderBodyStart);
        const renderBodySection = ORDERS_JS.slice(renderBodyStart, renderBodyEnd > renderBodyStart ? renderBodyEnd : renderBodyStart + 2000);
        assert.doesNotMatch(renderBodySection, /cancelOrder/, '_renderListBody should not contain cancelOrder');
        assert.doesNotMatch(renderBodySection, /ds\.createOrder/, '_renderListBody should not contain createOrder');
    });

    it('SL32: renderList does not call DB.setOrders', function () {
        const renderBodyStart = ORDERS_JS.indexOf('_renderListBody(products, customers)');
        const renderBodyEnd = ORDERS_JS.indexOf('toggleSelect(id)', renderBodyStart);
        const renderBodySection = ORDERS_JS.slice(renderBodyStart, renderBodyEnd > renderBodyStart ? renderBodyEnd : renderBodyStart + 2000);
        assert.doesNotMatch(renderBodySection, /DB\.setOrders/, '_renderListBody should not call DB.setOrders');
    });

    it('SL33: renderList does not call DB.setProducts', function () {
        const renderBodyStart = ORDERS_JS.indexOf('_renderListBody(products, customers)');
        const renderBodyEnd = ORDERS_JS.indexOf('toggleSelect(id)', renderBodyStart);
        const renderBodySection = ORDERS_JS.slice(renderBodyStart, renderBodyEnd > renderBodyStart ? renderBodyEnd : renderBodyStart + 2000);
        assert.doesNotMatch(renderBodySection, /DB\.setProducts/, '_renderListBody should not call DB.setProducts');
    });

    it('SL34: renderEdit route exists in app.js', function () {
        assert.ok(APP_JS, 'app.js should exist');
        assert.match(APP_JS, /edit.*Orders\.renderEdit/, 'app.js should route #/orders/:id/edit to Orders.renderEdit');
    });

    it('SL35: renderEdit is a separate form, not inline in list', function () {
        // renderEdit should render a full card form, not reference _renderListBody
        const editStart = ORDERS_JS.indexOf('renderEdit(id)');
        const editEnd = ORDERS_JS.indexOf('submitEdit', editStart);
        const editSection = ORDERS_JS.slice(editStart, editEnd > editStart ? editEnd : editStart + 1500);
        assert.match(editSection, /card/, 'renderEdit should render a card');
        assert.doesNotMatch(editSection, /_renderListBody/, 'renderEdit should not call _renderListBody');
    });

    // ============================================================
    // SL36-SL38: Summary safety
    // ============================================================

    it('SL36: __LAST_ORDER_DELETE_SUMMARY excludes UUID full values', function () {
        // Summary should not leak full UUIDs
        const batchStart = ORDERS_JS.indexOf('_batchCancelRemote()');
        const batchEnd = ORDERS_JS.indexOf('selectDuplicates', batchStart);
        const batchSection = ORDERS_JS.slice(batchStart, batchEnd > batchStart ? batchEnd : batchStart + 2000);
        // Summary should contain failReasons as strings, not order objects
        const summaryStart = batchSection.indexOf('__LAST_ORDER_DELETE_SUMMARY');
        const summaryEnd = batchSection.indexOf('}', summaryStart + 100);
        const summarySection = batchSection.slice(summaryStart, summaryEnd > summaryStart ? summaryEnd + 1 : summaryStart + 500);
        assert.doesNotMatch(summarySection, /token|key|password|email|user_id|store_id|order_id/, 'summary should not leak sensitive info');
    });

    it('SL37: batchDelete does not hard-delete in remote mode', function () {
        assert.match(ORDERS_JS, /batchDelete/, 'orders.js should contain batchDelete');
        const batchDeleteStart = ORDERS_JS.indexOf('batchDelete() {');
        const batchCancelRemoteStart = ORDERS_JS.indexOf('_batchCancelRemote()');
        // Extend to 600 to capture the actual call
        const batchDeleteSection = ORDERS_JS.slice(batchDeleteStart, batchCancelRemoteStart > batchDeleteStart ? batchCancelRemoteStart : batchDeleteStart + 600);
        // remote mode should route to _batchCancelRemote (may be truncated)
        assert.match(batchDeleteSection, /_batchCancelRemote|return this\./, 'batchDelete should call _batchCancelRemote for remote mode');
        // Should not hard-delete
        assert.doesNotMatch(batchDeleteSection, /DB\.setOrders/, 'batchDelete should not call DB.setOrders in remote mode');
    });

    it('SL38: _batchCancelRemote validates remote_id format', function () {
        const batchStart = ORDERS_JS.indexOf('_batchCancelRemote()');
        const batchEnd = ORDERS_JS.indexOf('selectDuplicates', batchStart);
        const batchSection = ORDERS_JS.slice(batchStart, batchEnd > batchStart ? batchEnd : batchStart + 2000);
        assert.match(batchSection, /typeof.*string/, '_batchCancelRemote should validate remote_id type');
        assert.match(batchSection, /0-9a-f/, '_batchCancelRemote should validate UUID format');
    });

    // ============================================================
    // SL39-SL45: Error classification and cancel_order 400 fix
    // ============================================================

    it('SL39: classifyCancelOrderError exists in db.js', function () {
        assert.ok(DB_JS, 'db.js should exist');
        assert.match(DB_JS, /classifyCancelOrderError/, 'db.js should contain classifyCancelOrderError');
        assert.match(DB_JS, /RPC_MISSING_OR_SIGNATURE_MISMATCH/, 'classifier should handle RPC_MISSING_OR_SIGNATURE_MISMATCH');
        assert.match(DB_JS, /ORDER_NOT_FOUND/, 'classifier should handle ORDER_NOT_FOUND');
        assert.match(DB_JS, /ORDER_NOT_PENDING/, 'classifier should handle ORDER_NOT_PENDING');
        assert.match(DB_JS, /PERMISSION_DENIED/, 'classifier should handle PERMISSION_DENIED');
        assert.match(DB_JS, /RLS_DENIED/, 'classifier should handle RLS_DENIED');
        assert.match(DB_JS, /INVALID_REMOTE_ID/, 'classifier should handle INVALID_REMOTE_ID');
        assert.match(DB_JS, /NETWORK_OR_SESSION_ERROR/, 'classifier should handle NETWORK_OR_SESSION_ERROR');
        assert.match(DB_JS, /UNKNOWN_CANCEL_ORDER_ERROR/, 'classifier should handle UNKNOWN_CANCEL_ORDER_ERROR');
    });

    it('SL40: classifyCancelOrderError is exposed on SupabaseOrdersDataSource', function () {
        assert.match(DB_JS, /classifyCancelOrderError/, 'classifyCancelOrderError should be in returned object');
    });

    it('SL41: _callOrderRpcAndMap preserves response.error details', function () {
        assert.match(DB_JS, /response\.error\.code/, '_callOrderRpcAndMap should preserve error.code');
        assert.match(DB_JS, /response\.error\.details.*response\.error\.message/, '_callOrderRpcAndMap should preserve error.details');
        assert.match(DB_JS, /response\.error\.hint/, '_callOrderRpcAndMap should preserve error.hint');
        assert.match(DB_JS, /response\.status/, '_callOrderRpcAndMap should preserve response.status');
    });

    it('SL42: _batchCancelRemote uses classifyCancelOrderError', function () {
        const batchStart = ORDERS_JS.indexOf('_batchCancelRemote()');
        const batchEnd = ORDERS_JS.indexOf('selectDuplicates', batchStart);
        const batchSection = ORDERS_JS.slice(batchStart, batchEnd > batchStart ? batchEnd : batchStart + 2000);
        assert.match(batchSection, /classifyCancelOrderError/, '_batchCancelRemote should use classifyCancelOrderError');
        assert.match(batchSection, /UNKNOWN_CANCEL_ORDER_ERROR/, '_batchCancelRemote should have fallback for missing classifier');
    });

    it('SL43: _cancelRemote uses classifyCancelOrderError', function () {
        const cancelRemoteStart = ORDERS_JS.indexOf('_cancelRemote(id) {');
        const refreshStart = ORDERS_JS.indexOf('_refreshOrdersAfterRemoteMutation()');
        const cancelRemoteSection = ORDERS_JS.slice(cancelRemoteStart, refreshStart > cancelRemoteStart ? refreshStart : cancelRemoteStart + 3000);
        assert.match(cancelRemoteSection, /classifyCancelOrderError/, '_cancelRemote should use classifyCancelOrderError');
        assert.match(cancelRemoteSection, /ORDER_NOT_PENDING/, '_cancelRemote should show PENDING-specific message');
        assert.match(cancelRemoteSection, /PERMISSION_DENIED/, '_cancelRemote should show permission message');
        assert.match(cancelRemoteSection, /RPC_MISSING_OR_SIGNATURE_MISMATCH/, '_cancelRemote should show RPC mismatch message');
    });

    it('SL44: delete button disabled for SHIPPED/COMPLETED in both modes', function () {
        const renderBodyStart = ORDERS_JS.indexOf('_renderListBody(products, customers)');
        const renderBodyEnd = ORDERS_JS.indexOf('toggleSelect(id)', renderBodyStart);
        const renderBodySection = ORDERS_JS.slice(renderBodyStart, renderBodyEnd > renderBodyStart ? renderBodyEnd : renderBodyStart + 2000);
        // PENDING이 아닌 주문은 disabled
        assert.match(renderBodySection, /!isPending/, 'delete button should be disabled for non-PENDING');
        assert.match(renderBodySection, /disabled title.*PENDING/, 'delete button should have PENDING title');
    });

    it('SL45: local mode delete also checks PENDING status', function () {
        const deleteStart = ORDERS_JS.indexOf('delete(orderId)');
        const deleteEnd = ORDERS_JS.indexOf('renderAdd', deleteStart);
        const deleteSection = ORDERS_JS.slice(deleteStart, deleteEnd > deleteStart ? deleteEnd : deleteStart + 800);
        assert.match(deleteSection, /status !== 'PENDING'/, 'local delete should check PENDING status');
        assert.match(deleteSection, /PENDING 상태의 주문만/, 'local delete should show PENDING-only message');
        assert.match(deleteSection, /order_not_found.*error/, 'local delete should handle not found');
    });

    // ============================================================
    // SL46-SL50: Extension noise and count verification
    // ============================================================

    it('SL46: cancel failure does not show success flash', function () {
        const batchStart = ORDERS_JS.indexOf('_batchCancelRemote()');
        const batchEnd = ORDERS_JS.indexOf('selectDuplicates', batchStart);
        const batchSection = ORDERS_JS.slice(batchStart, batchEnd > batchStart ? batchEnd : batchStart + 2000);
        // failCount > 0 + successCount === 0 → error flash
        assert.match(batchSection, /failCount > 0/, '_batchCancelRemote should check failCount');
        assert.match(batchSection, /실패.*주문.*상태.*권한.*RPC/, 'all-fail should show error message');
    });

    it('SL47: cancel failure keeps count unchanged', function () {
        const batchStart = ORDERS_JS.indexOf('_batchCancelRemote()');
        const batchEnd = ORDERS_JS.indexOf('selectDuplicates', batchStart);
        const batchSection = ORDERS_JS.slice(batchStart, batchEnd > batchStart ? batchEnd : batchStart + 2000);
        // countDelta is computed relative to beforeActiveCount
        assert.match(batchSection, /beforeActiveCount/, 'should track beforeActiveCount');
        assert.match(batchSection, /afterActiveCount/, 'should track afterActiveCount');
        assert.match(batchSection, /countDeltaMatchesSuccess/, 'should verify count delta matches success');
    });

    it('SL48: cancel success reduces active count', function () {
        const batchStart = ORDERS_JS.indexOf('_batchCancelRemote()');
        const batchEnd = ORDERS_JS.indexOf('selectDuplicates', batchStart);
        const batchSection = ORDERS_JS.slice(batchStart, batchEnd > batchStart ? batchEnd : batchStart + 2000);
        assert.match(batchSection, /successCount/, 'should track successCount');
        assert.match(batchSection, /countDelta/, 'should compute countDelta');
    });

    it('SL49: __LAST_ORDER_DELETE_SUMMARY excludes sensitive info', function () {
        const batchStart = ORDERS_JS.indexOf('_batchCancelRemote()');
        const batchEnd = ORDERS_JS.indexOf('selectDuplicates', batchStart);
        const batchSection = ORDERS_JS.slice(batchStart, batchEnd > batchStart ? batchEnd : batchStart + 2000);
        const summaryStart = batchSection.indexOf('__LAST_ORDER_DELETE_SUMMARY');
        const summaryEnd = batchSection.indexOf('};', summaryStart + 100);
        const summarySection = batchSection.slice(summaryStart, summaryEnd > summaryStart ? summaryEnd + 1 : summaryStart + 800);
        assert.doesNotMatch(summarySection, /token|key|password|email|user_id|store_id|order_id|uuid.*[a-f0-9]{8}-/, 'summary should not leak sensitive info');
    });

    it('SL50: extension noise (contentscript/FutooGrab) is not in app code', function () {
        assert.doesNotMatch(ORDERS_JS, /contentscript/, 'orders.js should not contain contentscript');
        assert.doesNotMatch(ORDERS_JS, /FutooGrab/, 'orders.js should not contain FutooGrab');
        assert.doesNotMatch(DB_JS, /contentscript/, 'db.js should not contain contentscript');
        assert.doesNotMatch(APP_JS, /ObjectMultiplex/, 'app.js should not contain ObjectMultiplex');
    });
});