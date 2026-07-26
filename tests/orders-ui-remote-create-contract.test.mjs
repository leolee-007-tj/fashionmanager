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

describe('3-8A.9-B Orders UI Remote Create Contract', function () {

    // ============================================================
    // UC1-UC5: remote create helpers 존재 확인
    // ============================================================

    it('UC1: orders.js contains _submitAddRemote method definition', function () {
        assert.ok(ORDERS_JS, 'orders.js should exist');
        assert.match(ORDERS_JS, /_submitAddRemote\(\)\s*\{/, 'orders.js should contain _submitAddRemote method');
    });

    it('UC2: orders.js contains _renderAddRemote method definition', function () {
        assert.match(ORDERS_JS, /_renderAddRemote\(\)\s*\{/, 'orders.js should contain _renderAddRemote method');
    });

    it('UC3: submitAdd is async', function () {
        assert.match(ORDERS_JS, /async\s+submitAdd/, 'submitAdd should be async');
    });

    it('UC4: submitAdd calls isRemoteOrdersMode for branching', function () {
        const submitStart = ORDERS_JS.indexOf('async submitAdd(');
        const submitRemoteStart = ORDERS_JS.indexOf('_submitAddRemote() {');
        const submitSection = submitRemoteStart > submitStart ? ORDERS_JS.slice(submitStart, submitRemoteStart) : ORDERS_JS.slice(submitStart);
        assert.match(submitSection, /isRemoteOrdersMode/, 'submitAdd should check isRemoteOrdersMode');
    });

    it('UC5: renderAdd calls isRemoteOrdersMode for branching', function () {
        const renderAddStart = ORDERS_JS.indexOf('renderAdd()');
        const renderRemoteStart = ORDERS_JS.indexOf('_renderAddRemote() {');
        const renderSection = renderRemoteStart > renderAddStart ? ORDERS_JS.slice(renderAddStart, renderRemoteStart) : ORDERS_JS.slice(renderAddStart);
        assert.match(renderSection, /isRemoteOrdersMode/, 'renderAdd should check isRemoteOrdersMode');
    });

    // ============================================================
    // UC6-UC10: remote create uses ds.createOrder
    // ============================================================

    it('UC6: _submitAddRemote uses getOrdersDataSource for createOrder', function () {
        const remoteStart = ORDERS_JS.indexOf('_submitAddRemote() {');
        const cancelStart = ORDERS_JS.indexOf('cancel(id) {');
        const remoteSection = cancelStart > remoteStart ? ORDERS_JS.slice(remoteStart, cancelStart) : ORDERS_JS.slice(remoteStart);
        assert.match(remoteSection, /getOrdersDataSource/, '_submitAddRemote should use getOrdersDataSource');
    });

    it('UC7: _submitAddRemote calls createOrder', function () {
        const remoteStart = ORDERS_JS.indexOf('_submitAddRemote() {');
        const cancelStart = ORDERS_JS.indexOf('cancel(id) {');
        const remoteSection = cancelStart > remoteStart ? ORDERS_JS.slice(remoteStart, cancelStart) : ORDERS_JS.slice(remoteStart);
        assert.match(remoteSection, /createOrder/, '_submitAddRemote should call createOrder');
    });

    it('UC8: _submitAddRemote validates customer_uuid', function () {
        const remoteStart = ORDERS_JS.indexOf('_submitAddRemote() {');
        const cancelStart = ORDERS_JS.indexOf('cancel(id) {');
        const remoteSection = cancelStart > remoteStart ? ORDERS_JS.slice(remoteStart, cancelStart) : ORDERS_JS.slice(remoteStart);
        assert.match(remoteSection, /customer_uuid/, '_submitAddRemote should use customer_uuid');
    });

    it('UC9: _submitAddRemote validates product_uuid', function () {
        const remoteStart = ORDERS_JS.indexOf('_submitAddRemote() {');
        const cancelStart = ORDERS_JS.indexOf('cancel(id) {');
        const remoteSection = cancelStart > remoteStart ? ORDERS_JS.slice(remoteStart, cancelStart) : ORDERS_JS.slice(remoteStart);
        assert.match(remoteSection, /product_uuid/, '_submitAddRemote should use product_uuid');
    });

    it('UC10: _submitAddRemote validates quantity and selling_price', function () {
        const remoteStart = ORDERS_JS.indexOf('_submitAddRemote() {');
        const cancelStart = ORDERS_JS.indexOf('cancel(id) {');
        const remoteSection = cancelStart > remoteStart ? ORDERS_JS.slice(remoteStart, cancelStart) : ORDERS_JS.slice(remoteStart);
        assert.match(remoteSection, /quantity\s*<=\s*0\s*\|\|\s*sellingPrice\s*<=\s*0/, '_submitAddRemote should validate quantity and selling_price');
    });

    // ============================================================
    // UC11-UC16: forbidden mutation API not called in remote create path
    // ============================================================

    it('UC11: _submitAddRemote does not call DB.addOrder', function () {
        const remoteStart = ORDERS_JS.indexOf('_submitAddRemote() {');
        const cancelStart = ORDERS_JS.indexOf('cancel(id) {');
        const remoteSection = cancelStart > remoteStart ? ORDERS_JS.slice(remoteStart, cancelStart) : ORDERS_JS.slice(remoteStart);
        assert.doesNotMatch(remoteSection, /DB\.addOrder/, '_submitAddRemote should not call DB.addOrder');
    });

    it('UC12: _submitAddRemote does not call DB.updateProduct', function () {
        const remoteStart = ORDERS_JS.indexOf('_submitAddRemote() {');
        const cancelStart = ORDERS_JS.indexOf('cancel(id) {');
        const remoteSection = cancelStart > remoteStart ? ORDERS_JS.slice(remoteStart, cancelStart) : ORDERS_JS.slice(remoteStart);
        assert.doesNotMatch(remoteSection, /DB\.updateProduct/, '_submitAddRemote should not call DB.updateProduct');
    });

    it('UC13: _submitAddRemote does not call DB.addInventoryLog', function () {
        const remoteStart = ORDERS_JS.indexOf('_submitAddRemote() {');
        const cancelStart = ORDERS_JS.indexOf('cancel(id) {');
        const remoteSection = cancelStart > remoteStart ? ORDERS_JS.slice(remoteStart, cancelStart) : ORDERS_JS.slice(remoteStart);
        assert.doesNotMatch(remoteSection, /DB\.addInventoryLog/, '_submitAddRemote should not call DB.addInventoryLog');
    });

    it('UC14: _submitAddRemote does not call DB.addCustomer', function () {
        const remoteStart = ORDERS_JS.indexOf('_submitAddRemote() {');
        const cancelStart = ORDERS_JS.indexOf('cancel(id) {');
        const remoteSection = cancelStart > remoteStart ? ORDERS_JS.slice(remoteStart, cancelStart) : ORDERS_JS.slice(remoteStart);
        assert.doesNotMatch(remoteSection, /DB\.addCustomer/, '_submitAddRemote should not call DB.addCustomer');
    });

    it('UC15: _submitAddRemote does not call DB.findCustomerByName', function () {
        const remoteStart = ORDERS_JS.indexOf('_submitAddRemote() {');
        const cancelStart = ORDERS_JS.indexOf('cancel(id) {');
        const remoteSection = cancelStart > remoteStart ? ORDERS_JS.slice(remoteStart, cancelStart) : ORDERS_JS.slice(remoteStart);
        assert.doesNotMatch(remoteSection, /DB\.findCustomerByName/, '_submitAddRemote should not call DB.findCustomerByName');
    });

    it('UC16: _submitAddRemote does not call DB.setOrders or DB.setProducts', function () {
        const remoteStart = ORDERS_JS.indexOf('_submitAddRemote() {');
        const cancelStart = ORDERS_JS.indexOf('cancel(id) {');
        const remoteSection = cancelStart > remoteStart ? ORDERS_JS.slice(remoteStart, cancelStart) : ORDERS_JS.slice(remoteStart);
        assert.doesNotMatch(remoteSection, /DB\.setOrders/, '_submitAddRemote should not call DB.setOrders');
        assert.doesNotMatch(remoteSection, /DB\.setProducts/, '_submitAddRemote should not call DB.setProducts');
    });

    // ============================================================
    // UC17-UC19: _renderAddRemote uses remote fields
    // ============================================================

    it('UC17: _renderAddRemote uses customer_uuid field name', function () {
        const renderRemoteStart = ORDERS_JS.indexOf('_renderAddRemote() {');
        const toggleStart = ORDERS_JS.indexOf('toggleNewCustomer() {');
        const renderRemoteSection = toggleStart > renderRemoteStart ? ORDERS_JS.slice(renderRemoteStart, toggleStart) : ORDERS_JS.slice(renderRemoteStart);
        assert.match(renderRemoteSection, /customer_uuid/, '_renderAddRemote should use customer_uuid form field');
    });

    it('UC18: _renderAddRemote uses product_uuid field name', function () {
        const renderRemoteStart = ORDERS_JS.indexOf('_renderAddRemote() {');
        const toggleStart = ORDERS_JS.indexOf('toggleNewCustomer() {');
        const renderRemoteSection = toggleStart > renderRemoteStart ? ORDERS_JS.slice(renderRemoteStart, toggleStart) : ORDERS_JS.slice(renderRemoteStart);
        assert.match(renderRemoteSection, /product_uuid/, '_renderAddRemote should use product_uuid form field');
    });

    it('UC19: _renderAddRemote does not have new customer input group', function () {
        const renderRemoteStart = ORDERS_JS.indexOf('_renderAddRemote() {');
        const toggleStart = ORDERS_JS.indexOf('toggleNewCustomer() {');
        const renderRemoteSection = toggleStart > renderRemoteStart ? ORDERS_JS.slice(renderRemoteStart, toggleStart) : ORDERS_JS.slice(renderRemoteStart);
        assert.doesNotMatch(renderRemoteSection, /new_customer_name/, '_renderAddRemote should not have new customer name input');
    });

    // ============================================================
    // UC19a-UC19b: 3-8A.9-B.1 auto_register copy cleanup
    // ============================================================

    it('UC19a: _renderAddRemote does not contain auto_register copy', function () {
        const renderRemoteStart = ORDERS_JS.indexOf('_renderAddRemote() {');
        const toggleStart = ORDERS_JS.indexOf('toggleNewCustomer() {');
        const renderRemoteSection = toggleStart > renderRemoteStart ? ORDERS_JS.slice(renderRemoteStart, toggleStart) : ORDERS_JS.slice(renderRemoteStart);
        assert.doesNotMatch(renderRemoteSection, /auto_register/, '_renderAddRemote should not contain auto_register copy');
    });

    it('UC19b: local renderAdd still contains auto_register copy', function () {
        const renderAddStart = ORDERS_JS.indexOf('renderAdd()');
        const renderRemoteStart = ORDERS_JS.indexOf('_renderAddRemote() {');
        const renderLocalSection = renderRemoteStart > renderAddStart ? ORDERS_JS.slice(renderAddStart, renderRemoteStart) : ORDERS_JS.slice(renderAddStart);
        assert.match(renderLocalSection, /auto_register/, 'local renderAdd should still contain auto_register copy');
    });

    // ============================================================
    // UC20-UC23: local mode compatibility
    // ============================================================

    it('UC20: submitAdd local mode still uses DB.addOrder', function () {
        assert.match(ORDERS_JS, /DB\.addOrder/, 'local mode should still use DB.addOrder');
    });

    it('UC21: submitAdd local mode still uses DB.updateProduct', function () {
        const submitStart = ORDERS_JS.indexOf('async submitAdd(');
        const submitRemoteStart = ORDERS_JS.indexOf('_submitAddRemote() {');
        // local mode section: between submitAdd and _submitAddRemote method definition
        const localSection = submitRemoteStart > submitStart ? ORDERS_JS.slice(submitStart, submitRemoteStart) : ORDERS_JS.slice(submitStart);
        assert.match(localSection, /DB\.updateProduct/, 'local mode should still use DB.updateProduct');
    });

    it('UC22: renderAdd local mode still uses DB.getCustomers', function () {
        const renderAddStart = ORDERS_JS.indexOf('renderAdd()');
        const renderRemoteStart = ORDERS_JS.indexOf('_renderAddRemote() {');
        const renderLocalSection = renderRemoteStart > renderAddStart ? ORDERS_JS.slice(renderAddStart, renderRemoteStart) : ORDERS_JS.slice(renderAddStart);
        assert.match(renderLocalSection, /DB\.getCustomers/, 'local renderAdd should still use DB.getCustomers');
    });

    it('UC23: renderAdd local mode still uses DB.getProducts', function () {
        const renderAddStart = ORDERS_JS.indexOf('renderAdd()');
        const renderRemoteStart = ORDERS_JS.indexOf('_renderAddRemote() {');
        const renderLocalSection = renderRemoteStart > renderAddStart ? ORDERS_JS.slice(renderAddStart, renderRemoteStart) : ORDERS_JS.slice(renderAddStart);
        assert.match(renderLocalSection, /DB\.getProducts/, 'local renderAdd should still use DB.getProducts');
    });

    // ============================================================
    // UC24-UC26: mutation UI not yet implemented for other actions
    // ============================================================

    it('UC24: _submitAddRemote does not contain updatePendingOrder', function () {
        const remoteStart = ORDERS_JS.indexOf('_submitAddRemote() {');
        const cancelStart = ORDERS_JS.indexOf('cancel(id) {');
        const remoteSection = cancelStart > remoteStart ? ORDERS_JS.slice(remoteStart, cancelStart) : ORDERS_JS.slice(remoteStart);
        assert.doesNotMatch(remoteSection, /updatePendingOrder/, '_submitAddRemote should not contain updatePendingOrder');
    });

    it('UC25: _submitAddRemote does not contain cancelOrder', function () {
        const remoteStart = ORDERS_JS.indexOf('_submitAddRemote() {');
        const cancelStart = ORDERS_JS.indexOf('cancel(id) {');
        const remoteSection = cancelStart > remoteStart ? ORDERS_JS.slice(remoteStart, cancelStart) : ORDERS_JS.slice(remoteStart);
        assert.doesNotMatch(remoteSection, /cancelOrder/, '_submitAddRemote should not contain cancelOrder');
    });

    it('UC26: _submitAddRemote does not contain shipOrder or completeOrder', function () {
        const remoteStart = ORDERS_JS.indexOf('_submitAddRemote() {');
        const cancelStart = ORDERS_JS.indexOf('cancel(id) {');
        const remoteSection = cancelStart > remoteStart ? ORDERS_JS.slice(remoteStart, cancelStart) : ORDERS_JS.slice(remoteStart);
        assert.doesNotMatch(remoteSection, /shipOrder/, '_submitAddRemote should not contain shipOrder');
        assert.doesNotMatch(remoteSection, /completeOrder/, '_submitAddRemote should not contain completeOrder');
    });

    // ============================================================
    // UC27-UC28: error handling
    // ============================================================

    it('UC27: _submitAddRemote has try/catch error handling', function () {
        const remoteStart = ORDERS_JS.indexOf('_submitAddRemote() {');
        const cancelStart = ORDERS_JS.indexOf('cancel(id) {');
        const remoteSection = cancelStart > remoteStart ? ORDERS_JS.slice(remoteStart, cancelStart) : ORDERS_JS.slice(remoteStart);
        assert.match(remoteSection, /try\s*\{/, '_submitAddRemote should have try/catch');
        assert.match(remoteSection, /catch\s*\(/, '_submitAddRemote should have catch');
    });

    it('UC28: _submitAddRemote shows App.flash on error', function () {
        const remoteStart = ORDERS_JS.indexOf('_submitAddRemote() {');
        const cancelStart = ORDERS_JS.indexOf('cancel(id) {');
        const remoteSection = cancelStart > remoteStart ? ORDERS_JS.slice(remoteStart, cancelStart) : ORDERS_JS.slice(remoteStart);
        // catch block should have App.flash
        const catchStart = remoteSection.indexOf('catch');
        const catchEnd = remoteSection.indexOf('return false;', catchStart);
        const catchSection = catchEnd > catchStart ? remoteSection.slice(catchStart, catchEnd) : remoteSection.slice(catchStart);
        assert.match(catchSection, /App\.flash/, '_submitAddRemote catch should show App.flash');
    });
});