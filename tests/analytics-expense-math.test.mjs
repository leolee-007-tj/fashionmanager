import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

function setup() {
    const context = { DB: {}, console };
    vm.runInNewContext(readFileSync(new URL('../js/analytics.js', import.meta.url), 'utf8') + ';this.analytics=Analytics;', context);
    const a = context.analytics;
    a.state.orders = [
        { product_uuid: 'second-uuid', product_id: null, brand: 'Brand B', quantity: 2, selling_price: 500, order_date: '2026-09-10', status: 'COMPLETED' },
        { product_uuid: 'first-uuid', product_id: null, brand: 'Brand A', quantity: 1, selling_price: 300, order_date: '2026-10-10', status: 'COMPLETED' }
    ];
    a.state.products = [
        { remote_id: 'first-uuid', id: null, legacy_id: null, korea_cost: 16500, category: '상의' },
        { remote_id: 'second-uuid', id: null, legacy_id: null, korea_cost: 33000, category: '바지' }
    ];
    a.state.settings = { exchange_divisor: 165 };
    a.state.expenses = [
        { id: 'fuel', expense_date: '2026-09-20', amount: '100', category: '차량 기름값' },
        { id: 'shopping', expense_date: '2026-09-21', amount: '50', category: '쇼핑' },
        { id: 'repeat-sep', recurrence_id: 'rent', expense_date: '2026-09-01', amount: '200' },
        { id: 'repeat-oct', recurrence_id: 'rent', expense_date: '2026-10-01', amount: '200' }
    ];
    return a;
}

test('UUID product matching never treats missing legacy IDs as equal', () => {
    const a = setup();
    assert.equal(a._getOrderCost(a.state.orders[0], a.state.products), 200);
    assert.equal(a._getOrderCost({ product_id: null, actual_converted_cost_at_sale: 77 }, a.state.products), 77);
    assert.equal(a._getOrderCost({ product_uuid: 'deleted-product', actual_converted_cost_at_sale: 88 }, a.state.products), 88);
    assert.equal(a._getOrderCost({ product_id: 12 }, [{ id: 12, korea_cost: 49500 }]), 300);
});

test('expenses reduce net profit once, without altering gross profit or other months', () => {
    const a = setup();
    const months = a.calculateMonthlyStats(2026);
    const sep = months[8], oct = months[9];
    assert.equal(sep.total_revenue, 1000);
    assert.equal(sep.total_cost, 400);
    assert.equal(sep.profit, 600);
    assert.equal(sep.profit_margin, 60);
    assert.equal(sep.total_expense, 350);
    assert.equal(sep.net_profit, 250);
    assert.equal(sep.net_profit_margin, 25);
    assert.equal(oct.total_expense, 200);
    assert.equal(oct.net_profit, 0);
    assert.equal(a.getProductRanking(2026).find(r => r.title === '바지').quantity, 2);
    const annual = a.calculateAnnualStats(2026, months);
    assert.equal(annual.total_revenue, 1300);
    assert.equal(annual.total_cost, 500);
    assert.equal(annual.total_expense, 550);
    assert.equal(annual.profit, 800);
    assert.equal(annual.net_profit, 250);
    assert.equal(annual.net_profit_margin, 250 / 1300 * 100);
});

test('manager exchange rate changes cost consistently in totals and brand ranking', () => {
    const a = setup();
    a.state.settings.exchange_divisor = 330;
    assert.equal(a.calculateMonthlyStats(2026)[8].total_cost, 200);
    assert.equal(a.getBrandRanking(2026).find(r => r.brand === 'Brand B').cost, 200);
    assert.equal(a.calculateMonthlyStats(2026)[8].net_profit, 450);
});

test('expense-only months keep a real loss without NaN or infinity', () => {
    const a = setup();
    a.state.orders = [];
    const month = a.calculateMonthlyStats(2026)[8];
    assert.equal(month.net_profit, -350);
    assert.equal(month.net_profit_margin, 0);
    assert.equal(Number.isFinite(month.net_profit_margin), true);
});

test('legacy expense components are numeric and amount rows are not counted twice', () => {
    const a = setup();
    a.state.expenses = [
        { expense_date: '2026-09-20', amount: '100', rent_cost: '999' },
        { expense_date: '2026-09-21', logistics_cost: '30', flight_cost: '20', rent_cost: '50' }
    ];
    assert.equal(a.calculateMonthlyStats(2026)[8].total_expense, 200);
});
