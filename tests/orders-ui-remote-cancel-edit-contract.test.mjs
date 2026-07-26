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

describe('3-8A.9-C Orders UI Remote Cancel/Edit Contract', function () {

    // ============================================================
    // CE1-CE5: cancel remote branch 존재 확인
    // ============================================================

    it('CE1: orders.js contains _cancelRemote method', function () {
        assert.ok(ORDERS_JS, 'orders.js should exist');
        assert.match(ORDERS_JS, /_cancelRemote\(id\)\s*\{/, 'orders.js should contain _cancelRemote method');
    });

    it('CE2: cancel(id) calls isRemoteOrdersMode for branching', function () {
        const cancelStart = ORDERS_JS.indexOf('cancel(id)');
        const cancelRemoteStart = ORDERS_JS.indexOf('_cancelRemote(id) {');
        const cancelSection = cancelRemoteStart > cancelStart ? ORDERS_JS.slice(cancelStart, cancelRemoteStart) : ORDERS_JS.slice(cancelStart);
        assert.match(cancelSection, /isRemoteOrdersMode/, 'cancel should check isRemoteOrdersMode');
    });

    it('CE3: _cancelRemote uses getOrdersDataSource for cancelOrder', function () {
        const remoteStart = ORDERS_JS.indexOf('_cancelRemote(id) {');
        const completeStart = ORDERS_JS.indexOf('complete(id)');
        const remoteSection = completeStart > remoteStart ? ORDERS_JS.slice(remoteStart, completeStart) : ORDERS_JS.slice(remoteStart);
        assert.match(remoteSection, /getOrdersDataSource/, '_cancelRemote should use getOrdersDataSource');
    });

    it('CE4: _cancelRemote calls cancelOrder', function () {
        const remoteStart = ORDERS_JS.indexOf('_cancelRemote(id) {');
        const completeStart = ORDERS_JS.indexOf('complete(id)');
        const remoteSection = completeStart > remoteStart ? ORDERS_JS.slice(remoteStart, completeStart) : ORDERS_JS.slice(remoteStart);
        assert.match(remoteSection, /cancelOrder/, '_cancelRemote should call cancelOrder');
    });

    it('CE5: _cancelRemote validates remote_id', function () {
        const remoteStart = ORDERS_JS.indexOf('_cancelRemote(id) {');
        const completeStart = ORDERS_JS.indexOf('complete(id)');
        const remoteSection = completeStart > remoteStart ? ORDERS_JS.slice(remoteStart, completeStart) : ORDERS_JS.slice(remoteStart);
        assert.match(remoteSection, /remote_id/, '_cancelRemote should use remote_id');
    });

    // ============================================================
    // CE6-CE10: forbidden mutation in _cancelRemote
    // ============================================================

    it('CE6: _cancelRemote does not call DB.updateProduct', function () {
        const remoteStart = ORDERS_JS.indexOf('_cancelRemote(id) {');
        const completeStart = ORDERS_JS.indexOf('complete(id)');
        const remoteSection = completeStart > remoteStart ? ORDERS_JS.slice(remoteStart, completeStart) : ORDERS_JS.slice(remoteStart);
        assert.doesNotMatch(remoteSection, /DB\.updateProduct/, '_cancelRemote should not call DB.updateProduct');
    });

    it('CE7: _cancelRemote does not call DB.updateOrder', function () {
        const remoteStart = ORDERS_JS.indexOf('_cancelRemote(id) {');
        const completeStart = ORDERS_JS.indexOf('complete(id)');
        const remoteSection = completeStart > remoteStart ? ORDERS_JS.slice(remoteStart, completeStart) : ORDERS_JS.slice(remoteStart);
        assert.doesNotMatch(remoteSection, /DB\.updateOrder/, '_cancelRemote should not call DB.updateOrder');
    });

    it('CE8: _cancelRemote does not call DB.setOrders', function () {
        const remoteStart = ORDERS_JS.indexOf('_cancelRemote(id) {');
        const completeStart = ORDERS_JS.indexOf('complete(id)');
        const remoteSection = completeStart > remoteStart ? ORDERS_JS.slice(remoteStart, completeStart) : ORDERS_JS.slice(remoteStart);
        assert.doesNotMatch(remoteSection, /DB\.setOrders/, '_cancelRemote should not call DB.setOrders');
    });

    it('CE9: _cancelRemote does not call DB.setProducts', function () {
        const remoteStart = ORDERS_JS.indexOf('_cancelRemote(id) {');
        const completeStart = ORDERS_JS.indexOf('complete(id)');
        const remoteSection = completeStart > remoteStart ? ORDERS_JS.slice(remoteStart, completeStart) : ORDERS_JS.slice(remoteStart);
        assert.doesNotMatch(remoteSection, /DB\.setProducts/, '_cancelRemote should not call DB.setProducts');
    });

    it('CE10: _cancelRemote has try/catch error handling', function () {
        const remoteStart = ORDERS_JS.indexOf('_cancelRemote(id) {');
        const completeStart = ORDERS_JS.indexOf('complete(id)');
        const remoteSection = completeStart > remoteStart ? ORDERS_JS.slice(remoteStart, completeStart) : ORDERS_JS.slice(remoteStart);
        assert.match(remoteSection, /try\s*\{/, '_cancelRemote should have try/catch');
        assert.match(remoteSection, /catch\s*\(/, '_cancelRemote should have catch');
    });

    // ============================================================
    // CE11-CE13: delete remote branch (delete-as-cancel policy)
    // ============================================================

    it('CE11: delete(orderId) calls isRemoteOrdersMode for branching', function () {
        const deleteStart = ORDERS_JS.indexOf('delete(orderId)');
        const renderAddStart = ORDERS_JS.indexOf('renderAdd()');
        const deleteSection = renderAddStart > deleteStart ? ORDERS_JS.slice(deleteStart, renderAddStart) : ORDERS_JS.slice(deleteStart);
        assert.match(deleteSection, /isRemoteOrdersMode/, 'delete should check isRemoteOrdersMode');
    });

    it('CE12: delete(orderId) remote branch delegates to _cancelRemote', function () {
        const deleteStart = ORDERS_JS.indexOf('delete(orderId)');
        const renderAddStart = ORDERS_JS.indexOf('renderAdd()');
        const deleteSection = renderAddStart > deleteStart ? ORDERS_JS.slice(deleteStart, renderAddStart) : ORDERS_JS.slice(deleteStart);
        assert.match(deleteSection, /_cancelRemote/, 'delete remote branch should delegate to _cancelRemote');
    });

    it('CE13: delete(orderId) remote branch does not call DB.setOrders', function () {
        const deleteStart = ORDERS_JS.indexOf('delete(orderId)');
        const renderAddStart = ORDERS_JS.indexOf('renderAdd()');
        const deleteSection = renderAddStart > deleteStart ? ORDERS_JS.slice(deleteStart, renderAddStart) : ORDERS_JS.slice(deleteStart);
        // remote branch section (after isRemoteOrdersMode check, before local mode DB.setOrders)
        const remoteBranchStart = deleteSection.indexOf('isRemoteOrdersMode');
        const remoteBranch = deleteSection.slice(remoteBranchStart);
        // local mode still has DB.setOrders, but remote branch shouldn't execute it
        // verify _cancelRemote is called before DB.setOrders in the remote path
        const cancelRemoteIdx = remoteBranch.indexOf('_cancelRemote');
        const setOrdersIdx = remoteBranch.indexOf('DB.setOrders');
        if (cancelRemoteIdx !== -1 && setOrdersIdx !== -1) {
            assert.ok(cancelRemoteIdx < setOrdersIdx, '_cancelRemote should be called before DB.setOrders in delete');
        }
    });

    // ============================================================
    // CE14-CE20: submitEdit remote branch
    // ============================================================

    it('CE14: orders.js contains _submitEditRemote method', function () {
        assert.match(ORDERS_JS, /_submitEditRemote\(e, orderId\)\s*\{/, 'orders.js should contain _submitEditRemote method');
    });

    it('CE15: submitEdit calls isRemoteOrdersMode for branching', function () {
        const submitEditStart = ORDERS_JS.indexOf('submitEdit(e, orderId)');
        const submitEditRemoteStart = ORDERS_JS.indexOf('_submitEditRemote(e, orderId) {');
        const submitSection = submitEditRemoteStart > submitEditStart ? ORDERS_JS.slice(submitEditStart, submitEditRemoteStart) : ORDERS_JS.slice(submitEditStart);
        assert.match(submitSection, /isRemoteOrdersMode/, 'submitEdit should check isRemoteOrdersMode');
    });

    it('CE16: _submitEditRemote uses getOrdersDataSource for updatePendingOrder', function () {
        const remoteStart = ORDERS_JS.indexOf('_submitEditRemote(e, orderId) {');
        const deleteStart = ORDERS_JS.indexOf('delete(orderId)');
        const remoteSection = deleteStart > remoteStart ? ORDERS_JS.slice(remoteStart, deleteStart) : ORDERS_JS.slice(remoteStart);
        assert.match(remoteSection, /getOrdersDataSource/, '_submitEditRemote should use getOrdersDataSource');
    });

    it('CE17: _submitEditRemote calls updatePendingOrder', function () {
        const remoteStart = ORDERS_JS.indexOf('_submitEditRemote(e, orderId) {');
        const deleteStart = ORDERS_JS.indexOf('delete(orderId)');
        const remoteSection = deleteStart > remoteStart ? ORDERS_JS.slice(remoteStart, deleteStart) : ORDERS_JS.slice(remoteStart);
        assert.match(remoteSection, /updatePendingOrder/, '_submitEditRemote should call updatePendingOrder');
    });

    it('CE18: _submitEditRemote validates PENDING status only', function () {
        const remoteStart = ORDERS_JS.indexOf('_submitEditRemote(e, orderId) {');
        const deleteStart = ORDERS_JS.indexOf('delete(orderId)');
        const remoteSection = deleteStart > remoteStart ? ORDERS_JS.slice(remoteStart, deleteStart) : ORDERS_JS.slice(remoteStart);
        assert.match(remoteSection, /PENDING/, '_submitEditRemote should check PENDING status');
    });

    it('CE19: _submitEditRemote uses customer_uuid and product_uuid', function () {
        const remoteStart = ORDERS_JS.indexOf('_submitEditRemote(e, orderId) {');
        const deleteStart = ORDERS_JS.indexOf('delete(orderId)');
        const remoteSection = deleteStart > remoteStart ? ORDERS_JS.slice(remoteStart, deleteStart) : ORDERS_JS.slice(remoteStart);
        assert.match(remoteSection, /customer_uuid/, '_submitEditRemote should use customer_uuid');
        assert.match(remoteSection, /product_uuid/, '_submitEditRemote should use product_uuid');
    });

    it('CE20: _submitEditRemote does not call DB.setOrders', function () {
        const remoteStart = ORDERS_JS.indexOf('_submitEditRemote(e, orderId) {');
        const deleteStart = ORDERS_JS.indexOf('delete(orderId)');
        const remoteSection = deleteStart > remoteStart ? ORDERS_JS.slice(remoteStart, deleteStart) : ORDERS_JS.slice(remoteStart);
        assert.doesNotMatch(remoteSection, /DB\.setOrders/, '_submitEditRemote should not call DB.setOrders');
    });

    // ============================================================
    // CE21-CE23: forbidden mutation in _submitEditRemote
    // ============================================================

    it('CE21: _submitEditRemote does not call DB.updateProduct', function () {
        const remoteStart = ORDERS_JS.indexOf('_submitEditRemote(e, orderId) {');
        const deleteStart = ORDERS_JS.indexOf('delete(orderId)');
        const remoteSection = deleteStart > remoteStart ? ORDERS_JS.slice(remoteStart, deleteStart) : ORDERS_JS.slice(remoteStart);
        assert.doesNotMatch(remoteSection, /DB\.updateProduct/, '_submitEditRemote should not call DB.updateProduct');
    });

    it('CE22: _submitEditRemote does not call DB.updateOrder', function () {
        const remoteStart = ORDERS_JS.indexOf('_submitEditRemote(e, orderId) {');
        const deleteStart = ORDERS_JS.indexOf('delete(orderId)');
        const remoteSection = deleteStart > remoteStart ? ORDERS_JS.slice(remoteStart, deleteStart) : ORDERS_JS.slice(remoteStart);
        assert.doesNotMatch(remoteSection, /DB\.updateOrder/, '_submitEditRemote should not call DB.updateOrder');
    });

    it('CE23: _submitEditRemote has try/catch error handling', function () {
        const remoteStart = ORDERS_JS.indexOf('_submitEditRemote(e, orderId) {');
        const deleteStart = ORDERS_JS.indexOf('delete(orderId)');
        const remoteSection = deleteStart > remoteStart ? ORDERS_JS.slice(remoteStart, deleteStart) : ORDERS_JS.slice(remoteStart);
        assert.match(remoteSection, /try\s*\{/, '_submitEditRemote should have try/catch');
        assert.match(remoteSection, /catch\s*\(/, '_submitEditRemote should have catch');
    });

    // ============================================================
    // CE24-CE26: batchDelete remote branch
    // ============================================================

    it('CE24: batchDelete calls isRemoteOrdersMode for branching', function () {
        const batchStart = ORDERS_JS.indexOf('batchDelete()');
        const selectDupStart = ORDERS_JS.indexOf('selectDuplicates()');
        const batchSection = selectDupStart > batchStart ? ORDERS_JS.slice(batchStart, selectDupStart) : ORDERS_JS.slice(batchStart);
        assert.match(batchSection, /isRemoteOrdersMode/, 'batchDelete should check isRemoteOrdersMode');
    });

    it('CE25: orders.js contains _batchCancelRemote method', function () {
        assert.match(ORDERS_JS, /_batchCancelRemote\(\)\s*\{/, 'orders.js should contain _batchCancelRemote method');
    });

    it('CE26: _batchCancelRemote calls cancelOrder', function () {
        const remoteStart = ORDERS_JS.indexOf('_batchCancelRemote() {');
        const selectDupStart = ORDERS_JS.indexOf('selectDuplicates()');
        const remoteSection = selectDupStart > remoteStart ? ORDERS_JS.slice(remoteStart, selectDupStart) : ORDERS_JS.slice(remoteStart);
        assert.match(remoteSection, /cancelOrder/, '_batchCancelRemote should call cancelOrder');
    });

    // ============================================================
    // CE27-CE29: ship/complete not yet implemented in remote
    // ============================================================

    it('CE27: _cancelRemote does not contain shipOrder', function () {
        const remoteStart = ORDERS_JS.indexOf('_cancelRemote(id) {');
        const completeStart = ORDERS_JS.indexOf('complete(id)');
        const remoteSection = completeStart > remoteStart ? ORDERS_JS.slice(remoteStart, completeStart) : ORDERS_JS.slice(remoteStart);
        assert.doesNotMatch(remoteSection, /shipOrder/, '_cancelRemote should not contain shipOrder');
    });

    it('CE28: _submitEditRemote does not contain completeOrder', function () {
        const remoteStart = ORDERS_JS.indexOf('_submitEditRemote(e, orderId) {');
        const deleteStart = ORDERS_JS.indexOf('delete(orderId)');
        const remoteSection = deleteStart > remoteStart ? ORDERS_JS.slice(remoteStart, deleteStart) : ORDERS_JS.slice(remoteStart);
        assert.doesNotMatch(remoteSection, /completeOrder/, '_submitEditRemote should not contain completeOrder');
    });

    it('CE29: complete(id) has no remote branch', function () {
        const completeStart = ORDERS_JS.indexOf('complete(id)');
        const renderShipStart = ORDERS_JS.indexOf('renderShip(');
        const completeSection = renderShipStart > completeStart ? ORDERS_JS.slice(completeStart, renderShipStart) : ORDERS_JS.slice(completeStart);
        assert.doesNotMatch(completeSection, /isRemoteOrdersMode/, 'complete should not have remote branch');
        assert.doesNotMatch(completeSection, /getOrdersDataSource/, 'complete should not use getOrdersDataSource');
    });

    // ============================================================
    // CE30: _refreshOrdersAfterRemoteMutation exists
    // ============================================================

    it('CE30: orders.js contains _refreshOrdersAfterRemoteMutation', function () {
        assert.match(ORDERS_JS, /_refreshOrdersAfterRemoteMutation/, 'orders.js should contain _refreshOrdersAfterRemoteMutation');
    });
});