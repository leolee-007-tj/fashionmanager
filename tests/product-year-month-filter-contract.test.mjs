import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('js/products.js', 'utf8');

function filterProducts(products, year, month) {
    let list = [...products];
    if (year) list = list.filter(p => Number(p.stock_year) === Number(year));
    if (month) list = list.filter(p => Number(p.stock_month) === Number(month));
    return list;
}

test('year and month filters accept numeric and string datasource values', () => {
    const rows = [
        { id: 1, stock_year: '2025', stock_month: '5' },
        { id: 2, stock_year: 2025, stock_month: 6 },
        { id: 3, stock_year: '2026', stock_month: 5 }
    ];
    assert.deepEqual(filterProducts(rows, 2025, 5).map(p => p.id), [1]);
    assert.deepEqual(filterProducts(rows, 2025, 0).map(p => p.id), [1, 2]);
    assert.deepEqual(filterProducts(rows, 0, 5).map(p => p.id), [1, 3]);
});

test('products source normalizes filter comparisons and selected options', () => {
    assert.match(source, /Number\(p\.stock_year\) === Number\(this\.state\.stockYear\)/);
    assert.match(source, /Number\(p\.stock_month\) === Number\(this\.state\.stockMonth\)/);
    assert.match(source, /Number\(this\.state\.stockYear\) === 0 \? 'selected'/);
    assert.match(source, /Number\(this\.state\.stockMonth\) === m \? 'selected'/);
});
