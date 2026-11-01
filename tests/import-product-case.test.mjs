import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const context = {};
vm.runInNewContext(readFileSync(new URL('../js/excel.js', import.meta.url), 'utf8') + ';this.excel=ExcelManager;', context);
const find = context.excel._findMonthlyImportProduct;
const p = { original_title: '白上白百慕大牛仔裤M', brand: 'helvetica', stock_year: 2026, stock_month: 10 };
test('Chinese and English mixed product titles match M/m and PT/pt', () => {
    assert.equal(find([p], '白上白百慕大牛仔裤m', 'HELVETICA', 2026, 10), p);
    const other = { ...p, original_title: '셀파카고pt/네이비' };
    assert.equal(find([other], '셀파카고PT/네이비', 'helvetica', 2026, 10), other);
});
test('normalizes surrounding and repeated whitespace and full-width letters', () => {
    assert.equal(find([p], ' 白上白百慕大牛仔裤Ｍ ', ' helvetica ', 2026, 10), p);
});
test('never matches another month, brand, punctuation or ambiguous variants', () => {
    assert.equal(find([p], p.original_title, p.brand, 2026, 9), null);
    assert.equal(find([p], p.original_title, 'another brand', 2026, 10), null);
    assert.equal(find([p], '白上白百慕大牛仔裤/M', p.brand, 2026, 10), null);
    assert.equal(find([p, { ...p, size: 'another variant' }], p.original_title, p.brand, 2026, 10), null);
});
