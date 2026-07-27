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

describe('3-8A.9-D Orders UI Remote Ship/Complete Contract', function () {

    // ============================================================
    // SC1-SC11: submitShip remote branch
    // ============================================================

    it('SC1: orders.js contains _submitShipRemote method', function () {
        assert.ok(ORDERS_JS, 'orders.js should exist');
        assert.match(ORDERS_JS, /_submitShipRemote\(id\)\s*\{/, 'orders.js should contain _submitShipRemote method');
    });

    it('SC2: submitShip(id) calls isRemoteOrdersMode for branching', function () {
        const submitShipStart = ORDERS_JS.indexOf('submitShip(id)');
        const submitShipRemoteStart = ORDERS_JS.indexOf('_submitShipRemote(id) {');
        const submitSection = submitShipRemoteStart > submitShipStart ? ORDERS_JS.slice(submitShipStart, submitShipRemoteStart) : ORDERS_JS.slice(submitShipStart);
        assert.match(submitSection, /isRemoteOrdersMode/, 'submitShip should check isRemoteOrdersMode');
    });

    it('SC3: _submitShipRemote uses getOrdersDataSource for shipOrder', function () {
        const remoteStart = ORDERS_JS.indexOf('_submitShipRemote(id) {');
        const fileEnd = ORDERS_JS.length;
        const remoteSection = ORDERS_JS.slice(remoteStart, fileEnd);
        assert.match(remoteSection, /getOrdersDataSource/, '_submitShipRemote should use getOrdersDataSource');
    });

    it('SC4: _submitShipRemote calls shipOrder', function () {
        const remoteStart = ORDERS_JS.indexOf('_submitShipRemote(id) {');
        const fileEnd = ORDERS_JS.length;
        const remoteSection = ORDERS_JS.slice(remoteStart, fileEnd);
        assert.match(remoteSection, /shipOrder/, '_submitShipRemote should call shipOrder');
    });

    it('SC5: _submitShipRemote validates PENDING status only', function () {
        const remoteStart = ORDERS_JS.indexOf('_submitShipRemote(id) {');
        const fileEnd = ORDERS_JS.length;
        const remoteSection = ORDERS_JS.slice(remoteStart, fileEnd);
        assert.match(remoteSection, /PENDING/, '_submitShipRemote should check PENDING status');
    });

    it('SC6: _submitShipRemote validates remote_id', function () {
        const remoteStart = ORDERS_JS.indexOf('_submitShipRemote(id) {');
        const fileEnd = ORDERS_JS.length;
        const remoteSection = ORDERS_JS.slice(remoteStart, fileEnd);
        assert.match(remoteSection, /remote_id/, '_submitShipRemote should use remote_id');
    });

    it('SC7: _submitShipRemote does not call DB.updateProduct', function () {
        const remoteStart = ORDERS_JS.indexOf('_submitShipRemote(id) {');
        const fileEnd = ORDERS_JS.length;
        const remoteSection = ORDERS_JS.slice(remoteStart, fileEnd);
        assert.doesNotMatch(remoteSection, /DB\.updateProduct/, '_submitShipRemote should not call DB.updateProduct');
    });

    it('SC8: _submitShipRemote does not call DB.updateOrder', function () {
        const remoteStart = ORDERS_JS.indexOf('_submitShipRemote(id) {');
        const fileEnd = ORDERS_JS.length;
        const remoteSection = ORDERS_JS.slice(remoteStart, fileEnd);
        assert.doesNotMatch(remoteSection, /DB\.updateOrder/, '_submitShipRemote should not call DB.updateOrder');
    });

    it('SC9: _submitShipRemote does not call DB.addInventoryLog', function () {
        const remoteStart = ORDERS_JS.indexOf('_submitShipRemote(id) {');
        const fileEnd = ORDERS_JS.length;
        const remoteSection = ORDERS_JS.slice(remoteStart, fileEnd);
        assert.doesNotMatch(remoteSection, /DB\.addInventoryLog/, '_submitShipRemote should not call DB.addInventoryLog');
    });

    it('SC10: _submitShipRemote does not call DB.setOrders', function () {
        const remoteStart = ORDERS_JS.indexOf('_submitShipRemote(id) {');
        const fileEnd = ORDERS_JS.length;
        const remoteSection = ORDERS_JS.slice(remoteStart, fileEnd);
        assert.doesNotMatch(remoteSection, /DB\.setOrders/, '_submitShipRemote should not call DB.setOrders');
    });

    it('SC11: _submitShipRemote has try/catch error handling', function () {
        const remoteStart = ORDERS_JS.indexOf('_submitShipRemote(id) {');
        const fileEnd = ORDERS_JS.length;
        const remoteSection = ORDERS_JS.slice(remoteStart, fileEnd);
        assert.match(remoteSection, /try\s*\{/, '_submitShipRemote should have try/catch');
        assert.match(remoteSection, /catch\s*\(/, '_submitShipRemote should have catch');
    });

    // ============================================================
    // SC12-SC22: complete remote branch
    // ============================================================

    it('SC12: orders.js contains _completeRemote method', function () {
        assert.match(ORDERS_JS, /_completeRemote\(id\)\s*\{/, 'orders.js should contain _completeRemote method');
    });

    it('SC13: complete(id) calls isRemoteOrdersMode for branching', function () {
        const completeStart = ORDERS_JS.indexOf('complete(id)');
        const completeRemoteStart = ORDERS_JS.indexOf('_completeRemote(id) {');
        const completeSection = completeRemoteStart > completeStart ? ORDERS_JS.slice(completeStart, completeRemoteStart) : ORDERS_JS.slice(completeStart);
        assert.match(completeSection, /isRemoteOrdersMode/, 'complete should check isRemoteOrdersMode');
    });

    it('SC14: _completeRemote uses getOrdersDataSource for completeOrder', function () {
        const remoteStart = ORDERS_JS.indexOf('_completeRemote(id) {');
        const renderShipStart = ORDERS_JS.indexOf('renderShip(');
        const remoteSection = renderShipStart > remoteStart ? ORDERS_JS.slice(remoteStart, renderShipStart) : ORDERS_JS.slice(remoteStart);
        assert.match(remoteSection, /getOrdersDataSource/, '_completeRemote should use getOrdersDataSource');
    });

    it('SC15: _completeRemote calls completeOrder', function () {
        const remoteStart = ORDERS_JS.indexOf('_completeRemote(id) {');
        const renderShipStart = ORDERS_JS.indexOf('renderShip(');
        const remoteSection = renderShipStart > remoteStart ? ORDERS_JS.slice(remoteStart, renderShipStart) : ORDERS_JS.slice(remoteStart);
        assert.match(remoteSection, /completeOrder/, '_completeRemote should call completeOrder');
    });

    it('SC16: _completeRemote validates SHIPPED status only', function () {
        const remoteStart = ORDERS_JS.indexOf('_completeRemote(id) {');
        const renderShipStart = ORDERS_JS.indexOf('renderShip(');
        const remoteSection = renderShipStart > remoteStart ? ORDERS_JS.slice(remoteStart, renderShipStart) : ORDERS_JS.slice(remoteStart);
        assert.match(remoteSection, /SHIPPED/, '_completeRemote should check SHIPPED status');
    });

    it('SC17: _completeRemote validates remote_id', function () {
        const remoteStart = ORDERS_JS.indexOf('_completeRemote(id) {');
        const renderShipStart = ORDERS_JS.indexOf('renderShip(');
        const remoteSection = renderShipStart > remoteStart ? ORDERS_JS.slice(remoteStart, renderShipStart) : ORDERS_JS.slice(remoteStart);
        assert.match(remoteSection, /remote_id/, '_completeRemote should use remote_id');
    });

    it('SC18: _completeRemote does not call DB.updateOrder', function () {
        const remoteStart = ORDERS_JS.indexOf('_completeRemote(id) {');
        const renderShipStart = ORDERS_JS.indexOf('renderShip(');
        const remoteSection = renderShipStart > remoteStart ? ORDERS_JS.slice(remoteStart, renderShipStart) : ORDERS_JS.slice(remoteStart);
        assert.doesNotMatch(remoteSection, /DB\.updateOrder/, '_completeRemote should not call DB.updateOrder');
    });

    it('SC19: _completeRemote does not call DB.setOrders', function () {
        const remoteStart = ORDERS_JS.indexOf('_completeRemote(id) {');
        const renderShipStart = ORDERS_JS.indexOf('renderShip(');
        const remoteSection = renderShipStart > remoteStart ? ORDERS_JS.slice(remoteStart, renderShipStart) : ORDERS_JS.slice(remoteStart);
        assert.doesNotMatch(remoteSection, /DB\.setOrders/, '_completeRemote should not call DB.setOrders');
    });

    it('SC20: _completeRemote has try/catch error handling', function () {
        const remoteStart = ORDERS_JS.indexOf('_completeRemote(id) {');
        const renderShipStart = ORDERS_JS.indexOf('renderShip(');
        const remoteSection = renderShipStart > remoteStart ? ORDERS_JS.slice(remoteStart, renderShipStart) : ORDERS_JS.slice(remoteStart);
        assert.match(remoteSection, /try\s*\{/, '_completeRemote should have try/catch');
        assert.match(remoteSection, /catch\s*\(/, '_completeRemote should have catch');
    });

    // ============================================================
    // SC21-SC23: renderShip remote compatibility
    // ============================================================

    it('SC21: renderShip uses isRemoteOrdersMode for remote data source', function () {
        const renderShipStart = ORDERS_JS.indexOf('renderShip(id)');
        const submitShipStart = ORDERS_JS.indexOf('submitShip(id)');
        const renderSection = submitShipStart > renderShipStart ? ORDERS_JS.slice(renderShipStart, submitShipStart) : ORDERS_JS.slice(renderShipStart);
        assert.match(renderSection, /isRemoteOrdersMode/, 'renderShip should check isRemoteOrdersMode');
    });

    it('SC22: renderShip remote branch uses _remoteProducts', function () {
        const renderShipStart = ORDERS_JS.indexOf('renderShip(id)');
        const submitShipStart = ORDERS_JS.indexOf('submitShip(id)');
        const renderSection = submitShipStart > renderShipStart ? ORDERS_JS.slice(renderShipStart, submitShipStart) : ORDERS_JS.slice(renderShipStart);
        assert.match(renderSection, /_remoteProducts/, 'renderShip remote branch should use _remoteProducts');
    });

    it('SC23: renderShip remote branch uses _remoteCustomers', function () {
        const renderShipStart = ORDERS_JS.indexOf('renderShip(id)');
        const submitShipStart = ORDERS_JS.indexOf('submitShip(id)');
        const renderSection = submitShipStart > renderShipStart ? ORDERS_JS.slice(renderShipStart, submitShipStart) : ORDERS_JS.slice(renderShipStart);
        assert.match(renderSection, /_remoteCustomers/, 'renderShip remote branch should use _remoteCustomers');
    });

    // ============================================================
    // SC24-SC25: local mode preservation
    // ============================================================

    it('SC24: submitShip local mode still calls DB.updateProduct, DB.updateOrder, DB.addInventoryLog', function () {
        const submitShipStart = ORDERS_JS.indexOf('submitShip(id)');
        const submitShipRemoteStart = ORDERS_JS.indexOf('_submitShipRemote(id) {');
        const localSection = submitShipRemoteStart > submitShipStart ? ORDERS_JS.slice(submitShipStart, submitShipRemoteStart) : ORDERS_JS.slice(submitShipStart);
        assert.match(localSection, /DB\.updateProduct/, 'local submitShip should call DB.updateProduct');
        assert.match(localSection, /DB\.updateOrder/, 'local submitShip should call DB.updateOrder');
        assert.match(localSection, /DB\.addInventoryLog/, 'local submitShip should call DB.addInventoryLog');
    });

    it('SC25: complete local mode still calls DB.updateOrder', function () {
        const completeStart = ORDERS_JS.indexOf('complete(id)');
        const completeRemoteStart = ORDERS_JS.indexOf('_completeRemote(id) {');
        const localSection = completeRemoteStart > completeStart ? ORDERS_JS.slice(completeStart, completeRemoteStart) : ORDERS_JS.slice(completeStart);
        assert.match(localSection, /DB\.updateOrder/, 'local complete should call DB.updateOrder');
    });

    // ============================================================
    // SC26-SC28: create/cancel/edit pending unchanged
    // ============================================================

    it('SC26: submitAdd local mode still uses DB.addOrder and DB.updateProduct', function () {
        const submitAddStart = ORDERS_JS.indexOf('submitAdd()');
        const submitAddRemoteStart = ORDERS_JS.indexOf('_submitAddRemote()');
        const localSection = submitAddRemoteStart > submitAddStart ? ORDERS_JS.slice(submitAddStart, submitAddRemoteStart) : ORDERS_JS.slice(submitAddStart);
        assert.match(localSection, /DB\.addOrder/, 'local submitAdd should call DB.addOrder');
        assert.match(localSection, /DB\.updateProduct/, 'local submitAdd should call DB.updateProduct');
    });

    it('SC27: cancel local mode still uses DB.updateProduct and DB.updateOrder', function () {
        const cancelStart = ORDERS_JS.indexOf('cancel(id)');
        const cancelRemoteStart = ORDERS_JS.indexOf('_cancelRemote(id) {');
        const localSection = cancelRemoteStart > cancelStart ? ORDERS_JS.slice(cancelStart, cancelRemoteStart) : ORDERS_JS.slice(cancelStart);
        assert.match(localSection, /DB\.updateProduct/, 'local cancel should call DB.updateProduct');
        assert.match(localSection, /DB\.updateOrder/, 'local cancel should call DB.updateOrder');
    });

    it('SC28: submitEdit local mode still uses DB.setOrders', function () {
        const submitEditStart = ORDERS_JS.indexOf('submitEdit(e, orderId)');
        const submitEditRemoteStart = ORDERS_JS.indexOf('_submitEditRemote(e, orderId) {');
        const localSection = submitEditRemoteStart > submitEditStart ? ORDERS_JS.slice(submitEditStart, submitEditRemoteStart) : ORDERS_JS.slice(submitEditStart);
        assert.match(localSection, /DB\.setOrders/, 'local submitEdit should call DB.setOrders');
    });
});
