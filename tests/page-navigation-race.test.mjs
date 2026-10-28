import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

function setup() {
    const main = { innerHTML: '' };
    const requests = [];
    const context = {
        document: {
            getElementById: () => main,
            createElement: () => ({}),
            head: { appendChild() {} }
        },
        Analytics: { renderAsync: () => new Promise((resolve, reject) => requests.push({ resolve, reject })) },
        Expenses: { renderList: () => 'EXPENSES' },
        setTimeout() {},
        console: { error() {} }
    };
    vm.runInNewContext(readFileSync(new URL('../js/app.js', import.meta.url), 'utf8') + ';this.app=App;', context);
    let bindings = 0;
    const app = context.app;
    app.bindPageForms = () => { bindings++; };
    app.currentPage = 'analytics';
    return { app, main, requests, bindings: () => bindings };
}

for (const fails of [false, true]) {
    test(`late analytics ${fails ? 'failure' : 'response'} cannot replace expenses`, async () => {
        const ctx = setup();
        const previous = ctx.app.renderPage();
        ctx.app.currentPage = 'expenses';
        await ctx.app.renderPage();
        assert.equal(ctx.main.innerHTML, 'EXPENSES');
        if (fails) ctx.requests[0].reject(new Error('Delayed network failure'));
        else ctx.requests[0].resolve('ANALYTICS');
        await previous;
        assert.equal(ctx.main.innerHTML, 'EXPENSES');
        assert.equal(ctx.bindings(), 1);
    });
}

test('only latest request renders when the same page is refreshed twice', async () => {
    const ctx = setup();
    const older = ctx.app.renderPage();
    const newer = ctx.app.renderPage();
    ctx.requests[1].resolve('LATEST');
    await newer;
    ctx.requests[0].resolve('OLD');
    await older;
    assert.equal(ctx.main.innerHTML, 'LATEST');
    assert.equal(ctx.bindings(), 1);
});

const routes = [
    ['dashboard', []], ['products', []], ['products', ['add']], ['products', ['1', 'edit']],
    ['orders', []], ['orders', ['add']], ['orders', ['1', 'edit']], ['orders', ['1', 'ship']],
    ['customers', []], ['customers', ['add']], ['customers', ['1', 'edit']], ['customers', ['1']],
    ['analytics', []], ['expenses', []], ['expenses', ['add']], ['expenses', ['1', 'edit']],
    ['classification', []], ['smart-import', []], ['settings', []], ['members', []]
];

test('every page and form ignores older responses across every destination', async () => {
    for (let from = 0; from < routes.length; from++) {
        for (let to = 0; to < routes.length; to++) {
            if (from === to) continue;
            const main = { innerHTML: '' };
            const requests = [];
            const deferred = () => new Promise(resolve => requests.push(resolve));
            const module = () => new Proxy({}, { get: () => deferred });
            const members = module();
            const ctx = {
                document: { getElementById: () => main, createElement: () => ({}), head: { appendChild() {} } },
                window: { MemberManagement: members }, MemberManagement: members,
                Products: module(), Orders: module(), Customers: module(), Analytics: module(),
                Expenses: module(), SmartInventoryWorkbookImporter: module(), Settings: module(),
                location: { hash: '#/' + routes[from][0] }, setTimeout() {}, console
            };
            vm.runInNewContext(readFileSync(new URL('../js/app.js', import.meta.url), 'utf8') + ';this.app=App;', ctx);
            const app = ctx.app;
            app.bindPageForms = () => {};
            app.renderDashboard = deferred;
            app.renderClassification = deferred;
            [app.currentPage, app.pageArgs] = routes[from];
            const older = app.renderPage();
            [app.currentPage, app.pageArgs] = routes[to];
            ctx.location.hash = '#/' + app.currentPage;
            const newer = app.renderPage();
            assert.equal(requests.length, 2);
            requests[1]('NEW PAGE');
            await newer;
            requests[0]('OLD PAGE');
            await older;
            assert.equal(main.innerHTML, 'NEW PAGE', `${routes[from]} -> ${routes[to]}`);
        }
    }
});

test('page timers are invalidated even before hashchange is handled', () => {
    const timers = [];
    const ctx = { document: { createElement: () => ({}), head: { appendChild() {} } }, location: { hash: '#/analytics' }, setTimeout: cb => timers.push(cb) };
    vm.runInNewContext(readFileSync(new URL('../js/app.js', import.meta.url), 'utf8') + ';this.app=App;', ctx);
    ctx.app.currentPage = 'analytics';
    let calls = 0;
    ctx.app.schedulePageTask(() => { calls++; }, 50);
    ctx.location.hash = '#/expenses';
    timers[0]();
    assert.equal(calls, 0);
    ctx.app.currentPage = 'expenses';
    ctx.app.schedulePageTask(() => { calls++; }, 50);
    timers[1]();
    assert.equal(calls, 1);
});

for (const [file, name, method] of [
    ['products', 'Products', 'renderEdit'],
    ['orders', 'Orders', 'renderEdit'],
    ['orders', 'Orders', 'renderShip']
]) {
    test(`${name}.${method} cannot redirect a later page after a missing record response`, async () => {
        let active = true;
        let finish;
        const pending = new Promise(resolve => { finish = resolve; });
        const ctx = {
            App: { capturePageGuard: () => () => active, flash() {} },
            DB: { getProductsAsync: () => pending },
            location: { hash: '#/products/1/edit' }, console
        };
        vm.runInNewContext(readFileSync(new URL(`../js/${file}.js`, import.meta.url), 'utf8') + `;this.module=${name};`, ctx);
        if (name === 'Orders') {
            ctx.module.isRemoteOrdersMode = () => true;
            ctx.module._loadRemoteDataForRender = () => pending;
        }
        const render = ctx.module[method]('1');
        active = false;
        ctx.location.hash = '#/expenses';
        finish([]);
        await render;
        assert.equal(ctx.location.hash, '#/expenses');
    });
}

test('a late product image read cannot populate another product form', () => {
    let active = true;
    let reader;
    const ctx = {
        App: { capturePageGuard: () => () => active },
        FileReader: class { constructor() { reader = this; } readAsDataURL() {} }
    };
    vm.runInNewContext(readFileSync(new URL('../js/products.js', import.meta.url), 'utf8') + ';this.module=Products;', ctx);
    ctx.module.handleImage({ files: [{}] });
    active = false;
    reader.onload({ target: { result: 'OLD IMAGE' } });
    assert.equal(ctx.module.tempImage, null);
});
