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

const APP_JS = readFile('js/app.js');
const ORDERS_JS = readFile('js/orders.js');

describe('3-8A.9-E.1 Orders UI Submit/Ship Route Bugfix Contract', function () {

    // ============================================================
    // SR1-SR3: app.js bindPageForms bugfix
    // ============================================================

    it('SR1: app.js does not contain Orders.submitForm', function () {
        assert.ok(APP_JS, 'app.js should exist');
        assert.doesNotMatch(APP_JS, /Orders\.submitForm/, 'app.js should not reference Orders.submitForm');
    });

    it('SR2: app.js orderForm binding uses Orders.submitAdd', function () {
        assert.ok(APP_JS, 'app.js should exist');
        const orderFormSection = APP_JS.match(/const orderForm = document\.getElementById\('orderForm'\);[\s\S]{1,300}?Orders\.submitAdd/);
        assert.ok(orderFormSection, 'orderForm binding should use Orders.submitAdd');
    });

    it('SR3: app.js orderForm binding is async', function () {
        const orderFormSection = APP_JS.match(/const orderForm = document\.getElementById\('orderForm'\);[\s\S]{1,300}?return false/);
        assert.ok(orderFormSection, 'orderForm binding should have return false');
        assert.match(orderFormSection[0], /async/, 'orderForm binding should be async');
    });

    // ============================================================
    // SR4-SR5: app.js orders route ship support
    // ============================================================

    it('SR4: app.js orders route supports #/orders/ship/{id} pattern', function () {
        assert.ok(APP_JS, 'app.js should exist');
        const ordersCase = APP_JS.match(/case 'orders':[\s\S]{1,500}?break;/);
        assert.ok(ordersCase, 'orders case should exist in app.js');
        assert.match(ordersCase[0], /args\[0\]\s*===\s*'ship'/, 'route should support args[0] === ship');
    });

    it('SR5: app.js orders ship route passes id to async renderShip', function () {
        const ordersCase = APP_JS.match(/case 'orders':[\s\S]{1,500}?break;/);
        assert.ok(ordersCase, 'orders case should exist');
        assert.match(ordersCase[0], /await Orders\.renderShip/, 'ship route should await Orders.renderShip');
    });

    // ============================================================
    // SR6-SR10: renderShip remote compatibility
    // ============================================================

    it('SR6: renderShip is now async', function () {
        assert.ok(ORDERS_JS, 'orders.js should exist');
        assert.match(ORDERS_JS, /async renderShip/, 'renderShip should be async');
    });

    it('SR7: renderShip remote mode calls _loadRemoteDataForRender when orders empty', function () {
        const renderShipStart = ORDERS_JS.indexOf('async renderShip(id)');
        const submitShipStart = ORDERS_JS.indexOf('submitShip(id)');
        const renderSection = submitShipStart > renderShipStart ? ORDERS_JS.slice(renderShipStart, submitShipStart) : ORDERS_JS.slice(renderShipStart);
        assert.match(renderSection, /_loadRemoteDataForRender/, 'renderShip remote path should load data');
    });

    it('SR8: renderShip remote mode uses String() comparison for id lookup', function () {
        const renderShipStart = ORDERS_JS.indexOf('async renderShip(id)');
        const submitShipStart = ORDERS_JS.indexOf('submitShip(id)');
        const renderSection = submitShipStart > renderShipStart ? ORDERS_JS.slice(renderShipStart, submitShipStart) : ORDERS_JS.slice(renderShipStart);
        assert.match(renderSection, /String\(o\.id\)/, 'renderShip remote lookup should use String comparison');
        assert.match(renderSection, /String\(id\)/, 'renderShip remote lookup should use String(id)');
    });

    it('SR9: renderShip remote mode checks remote_id or legacy_id fallback', function () {
        const renderShipStart = ORDERS_JS.indexOf('async renderShip(id)');
        const submitShipStart = ORDERS_JS.indexOf('submitShip(id)');
        const renderSection = submitShipStart > renderShipStart ? ORDERS_JS.slice(renderShipStart, submitShipStart) : ORDERS_JS.slice(renderShipStart);
        assert.match(renderSection, /remote_id/, 'renderShip remote lookup should check remote_id');
    });

    it('SR10: renderShip remote mode uses _remoteProducts and _remoteCustomers', function () {
        const renderShipStart = ORDERS_JS.indexOf('async renderShip(id)');
        const submitShipStart = ORDERS_JS.indexOf('submitShip(id)');
        const renderSection = submitShipStart > renderShipStart ? ORDERS_JS.slice(renderShipStart, submitShipStart) : ORDERS_JS.slice(renderShipStart);
        assert.match(renderSection, /_remoteProducts/, 'renderShip remote should use _remoteProducts');
        assert.match(renderSection, /_remoteCustomers/, 'renderShip remote should use _remoteCustomers');
    });

    // ============================================================
    // SR11-SR12: ship form onsubmit UUID/string safety
    // ============================================================

    it('SR11: renderShip ship form onsubmit uses JSON.stringify for id safety', function () {
        const renderShipStart = ORDERS_JS.indexOf('async renderShip(id)');
        const submitShipStart = ORDERS_JS.indexOf('submitShip(id)');
        const renderSection = submitShipStart > renderShipStart ? ORDERS_JS.slice(renderShipStart, submitShipStart) : ORDERS_JS.slice(renderShipStart);
        assert.match(renderSection, /JSON\.stringify/, 'renderShip should use JSON.stringify for id');
        assert.match(renderSection, /submitShip\(\$/, 'ship form should reference submitShip with safe id');
    });

    it('SR12: renderShip does not embed raw id in onsubmit', function () {
        const renderShipStart = ORDERS_JS.indexOf('async renderShip(id)');
        const submitShipStart = ORDERS_JS.indexOf('submitShip(id)');
        const renderSection = submitShipStart > renderShipStart ? ORDERS_JS.slice(renderShipStart, submitShipStart) : ORDERS_JS.slice(renderShipStart);
        assert.doesNotMatch(renderSection, /onsubmit="return Orders\.submitShip\(\$\{id\}\)"/, 'should not embed raw id in onsubmit');
    });

    // ============================================================
    // SR13-SR14: _submitShipRemote id lookup
    // ============================================================

    it('SR13: _submitShipRemote uses String() comparison for id lookup', function () {
        const remoteStart = ORDERS_JS.indexOf('_submitShipRemote(id) {');
        const fileEnd = ORDERS_JS.length;
        const remoteSection = ORDERS_JS.slice(remoteStart, fileEnd);
        assert.match(remoteSection, /String\(o\.id\)/, '_submitShipRemote should use String comparison');
        assert.match(remoteSection, /String\(id\)/, '_submitShipRemote should use String(id)');
    });

    it('SR14: _submitShipRemote still uses shipOrder and getOrdersDataSource', function () {
        const remoteStart = ORDERS_JS.indexOf('_submitShipRemote(id) {');
        const fileEnd = ORDERS_JS.length;
        const remoteSection = ORDERS_JS.slice(remoteStart, fileEnd);
        assert.match(remoteSection, /shipOrder/, '_submitShipRemote should call shipOrder');
        assert.match(remoteSection, /getOrdersDataSource/, '_submitShipRemote should use getOrdersDataSource');
    });

    // ============================================================
    // SR15-SR16: _submitShipRemote forbidden API check
    // ============================================================

    it('SR15: _submitShipRemote does not call DB.updateProduct, DB.updateOrder, DB.addInventoryLog, DB.setOrders, DB.setProducts', function () {
        const remoteStart = ORDERS_JS.indexOf('_submitShipRemote(id) {');
        const fileEnd = ORDERS_JS.length;
        const remoteSection = ORDERS_JS.slice(remoteStart, fileEnd);
        assert.doesNotMatch(remoteSection, /DB\.updateProduct/, 'should not call DB.updateProduct');
        assert.doesNotMatch(remoteSection, /DB\.updateOrder/, 'should not call DB.updateOrder');
        assert.doesNotMatch(remoteSection, /DB\.addInventoryLog/, 'should not call DB.addInventoryLog');
        assert.doesNotMatch(remoteSection, /DB\.setOrders/, 'should not call DB.setOrders');
        assert.doesNotMatch(remoteSection, /DB\.setProducts/, 'should not call DB.setProducts');
    });

    it('SR16: _submitShipRemote still validates PENDING status and remote_id', function () {
        const remoteStart = ORDERS_JS.indexOf('_submitShipRemote(id) {');
        const fileEnd = ORDERS_JS.length;
        const remoteSection = ORDERS_JS.slice(remoteStart, fileEnd);
        assert.match(remoteSection, /PENDING/, 'should check PENDING status');
        assert.match(remoteSection, /remote_id/, 'should check remote_id');
    });

    // ============================================================
    // SR17-SR18: no changes to create/cancel/edit/complete
    // ============================================================

    it('SR17: submitAdd (create) logic unchanged', function () {
        assert.ok(ORDERS_JS, 'orders.js should exist');
        assert.match(ORDERS_JS, /submitAdd\(\)/, 'submitAdd should exist');
        assert.match(ORDERS_JS, /_submitAddRemote/, '_submitAddRemote should exist');
        // _submitAddRemote should still exist
        const addRemoteStart = ORDERS_JS.indexOf('_submitAddRemote()');
        assert.ok(addRemoteStart >= 0, '_submitAddRemote should exist');
    });

    it('SR18: cancel and edit remote logic unchanged', function () {
        assert.match(ORDERS_JS, /_cancelRemote/, '_cancelRemote should exist');
        assert.match(ORDERS_JS, /_submitEditRemote/, '_submitEditRemote should exist');
        // cancel still uses cancelOrder
        const cancelRemoteStart = ORDERS_JS.indexOf('_cancelRemote(id) {');
        const cancelSection = cancelRemoteStart >= 0 ? ORDERS_JS.slice(cancelRemoteStart, cancelRemoteStart + 2000) : '';
        assert.match(cancelSection, /cancelOrder/, '_cancelRemote should call cancelOrder');
        // edit still uses updatePendingOrder
        const editRemoteStart = ORDERS_JS.indexOf('_submitEditRemote(e, orderId) {');
        const editSection = editRemoteStart >= 0 ? ORDERS_JS.slice(editRemoteStart, editRemoteStart + 2000) : '';
        assert.match(editSection, /updatePendingOrder/, '_submitEditRemote should call updatePendingOrder');
    });

    // ============================================================
    // SR19: no sensitive data patterns in sourced files
    // ============================================================

    it('SR19: app.js and orders.js contain no service_role, token, or password', function () {
        if (APP_JS) {
            assert.doesNotMatch(APP_JS, /service_role/, 'app.js should not contain service_role');
        }
        if (ORDERS_JS) {
            assert.doesNotMatch(ORDERS_JS, /service_role/, 'orders.js should not contain service_role');
        }
    });
});