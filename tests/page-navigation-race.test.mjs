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
