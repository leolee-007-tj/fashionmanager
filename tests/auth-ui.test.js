'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

// --- Minimal fake DOM ---
function makeFakeNode(tagName) {
    const node = {
        tagName: (tagName || 'div').toUpperCase(),
        className: '',
        _text: '',
        hidden: false,
        disabled: false,
        type: '',
        id: '',
        required: false,
        async: false,
        src: '',
        maxLength: -1,
        autocomplete: '',
        value: '',
        style: {},
        _children: [],
        _parentNode: null,
        _listeners: {},
        _attrs: {},
        setAttribute(key, val) { this._attrs[key] = val; },
        getAttribute(key) { return this._attrs[key] !== undefined ? this._attrs[key] : null; },
        appendChild(child) {
            child._parentNode = this;
            this._children.push(child);
            return child;
        },
        removeChild(child) {
            const idx = this._children.indexOf(child);
            if (idx >= 0) {
                this._children.splice(idx, 1);
                child._parentNode = null;
            }
            return child;
        },
        addEventListener(type, fn) {
            if (!this._listeners[type]) this._listeners[type] = [];
            this._listeners[type].push(fn);
        },
        removeEventListener(type, fn) {
            if (!this._listeners[type]) return;
            this._listeners[type] = this._listeners[type].filter((f) => f !== fn);
        },
        click() {
            if (this._listeners.click) {
                this._listeners.click.forEach((fn) => fn({ preventDefault: () => {} }));
            }
        },
        querySelectorAll(selector) {
            const results = [];
            function walk(node) {
                if (selector === 'button' && node.tagName === 'BUTTON') {
                    results.push(node);
                }
                if (node._children) {
                    node._children.forEach(walk);
                }
            }
            walk(this);
            return results;
        },
        get firstChild() {
            return this._children.length > 0 ? this._children[0] : null;
        },
        get textContent() {
            if (this._children.length === 0) return this._text;
            return this._children.map((c) => c.textContent).join('');
        },
        set textContent(val) {
            this._text = val;
            this._children = [];
        }
    };
    return node;
}

function makeFakeDocument() {
    const root = makeFakeNode('div');
    root.id = 'auth-root';
    const elementsById = { 'auth-root': root };

    return {
        createElement: (tagName) => makeFakeNode(tagName),
        getElementById: (id) => elementsById[id] || null,
        querySelector: () => null,
        head: makeFakeNode('head'),
        body: makeFakeNode('body'),
        _root: root,
        _elementsById: elementsById
    };
}

// --- Helpers ---
let _originalDocument = null;

function setupDoc() {
    _originalDocument = global.document;
    const doc = makeFakeDocument();
    global.document = doc;
    delete require.cache[require.resolve('../js/auth-ui.js')];
    require('../js/auth-ui.js');
    return doc;
}

function teardownDoc() {
    global.document = _originalDocument;
    _originalDocument = null;
}

// --- Tests ---

test('T44: showError가 오류 panel을 auth-root에 추가', () => {
    const doc = setupDoc();
    try {
        const ui = global.LESOULAuthUI;
        ui.init({ root: doc._root });
        ui.showError('테스트 오류');
        assert.ok(doc._root._children.length > 0, 'panel must be appended to auth-root');
        const panel = doc._root._children[0];
        assert.ok(panel.textContent.includes('테스트 오류'), 'error message must be visible');
        ui.destroy();
    } finally {
        teardownDoc();
    }
});

test('T45: onRetry가 있으면 "다시 시도" 버튼이 실제 panel에 추가', () => {
    const doc = setupDoc();
    try {
        const ui = global.LESOULAuthUI;
        ui.init({ root: doc._root });
        ui.showError('오류', { onRetry: () => {} });
        const panel = doc._root._children[0];
        const buttons = panel.querySelectorAll('button');
        let found = false;
        for (const btn of buttons) {
            if (btn.textContent === '다시 시도') {
                found = true;
                break;
            }
        }
        assert.ok(found, 'retry button must be in the panel');
        ui.destroy();
    } finally {
        teardownDoc();
    }
});

test('T46: retry button click 시 onRetry 정확히 1회 호출', () => {
    const doc = setupDoc();
    try {
        const ui = global.LESOULAuthUI;
        ui.init({ root: doc._root });
        let retryCount = 0;
        ui.showError('오류', { onRetry: () => { retryCount++; } });
        const panel = doc._root._children[0];
        const buttons = panel.querySelectorAll('button');
        let retryBtn = null;
        for (const btn of buttons) {
            if (btn.textContent === '다시 시도') {
                retryBtn = btn;
                break;
            }
        }
        assert.ok(retryBtn, 'retry button must exist');
        retryBtn.click();
        assert.strictEqual(retryCount, 1, 'onRetry must be called exactly once');
        ui.destroy();
    } finally {
        teardownDoc();
    }
});

test('T47: onRetry가 없으면 retry button을 생성하지 않음', () => {
    const doc = setupDoc();
    try {
        const ui = global.LESOULAuthUI;
        ui.init({ root: doc._root });
        ui.showError('오류');
        const panel = doc._root._children[0];
        const buttons = panel.querySelectorAll('button');
        let found = false;
        for (const btn of buttons) {
            if (btn.textContent === '다시 시도') {
                found = true;
                break;
            }
        }
        assert.strictEqual(found, false, 'no retry button when onRetry is missing');
        ui.destroy();
    } finally {
        teardownDoc();
    }
});

test('T48: 다른 화면으로 전환하면 이전 retry listener가 제거됨', () => {
    const doc = setupDoc();
    try {
        const ui = global.LESOULAuthUI;
        ui.init({ root: doc._root });
        let retryCount = 0;
        ui.showError('오류', { onRetry: () => { retryCount++; } });
        const panel = doc._root._children[0];
        const buttons = panel.querySelectorAll('button');
        let retryBtn = null;
        for (const btn of buttons) {
            if (btn.textContent === '다시 시도') {
                retryBtn = btn;
                break;
            }
        }
        assert.ok(retryBtn, 'retry button must exist');
        // Switch to a different screen (loading) — this calls _clear().
        ui.showLoading('로딩 중...');
        // Click the old retry button — listener should have been removed.
        retryBtn.click();
        assert.strictEqual(retryCount, 0, 'previous retry listener must be removed after screen switch');
        ui.destroy();
    } finally {
        teardownDoc();
    }
});
