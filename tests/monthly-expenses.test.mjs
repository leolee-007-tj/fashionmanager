import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function setup(options = {}) {
    const calls = [], flashes = [];
    const form = { expense_date: '2026-10-28', category: '차량 기름값', amount: '100', description: '연료', monthly: 'on' };
    const client = {
        rpc: async (name, args) => { calls.push({ name, args }); return options.error ? { error: { message: options.error } } : { data: 'saved' }; },
        from: name => ({ select: () => ({ eq: () => name === 'expenses'
            ? { is: async () => ({ data: [{ id: 'expense-uuid', amount: '100', recurrence_id: 'repeat-uuid', expense_date: '2026-10-28' }] }) }
            : Promise.resolve({ data: [{ id: 'repeat-uuid', active: true }] }) }) })
    };
    const button = { disabled: false };
    const ctx = {
        window: { LESOUL_CONFIG: { SUPABASE_ENABLED: true }, LESOULSupabase: { getClient: () => client }, LESOULAppBootstrap: { getContext: () => ({ activeMembership: { storeId: 'store-uuid' } }) } },
        document: { getElementById: () => ({}), querySelector: () => button },
        FormData: class { get(key) { return form[key]; } },
        App: { capturePageGuard: () => () => options.current !== false, flash: message => flashes.push(message), render() {}, renderPage() {} },
        location: { hash: '#/expenses/add' },
        t: (section, key) => key,
        DB: { getExpenses() { throw new Error('Local storage must not be used in remote mode'); } },
        console
    };
    vm.runInNewContext(readFileSync(new URL('../js/expenses.js', import.meta.url), 'utf8') + ';this.expenses=Expenses;', ctx);
    return { ctx, expenses: ctx.expenses, calls, flashes, form, button };
}

test('expense form offers fuel, shopping and monthly recurrence and escapes description', () => {
    const { expenses } = setup();
    const html = expenses.renderForm({ id: 'expense-uuid', description: '</textarea><script>bad</script>', monthly: true });
    assert.match(html, /value="차량 기름값"/);
    assert.match(html, /value="쇼핑"/);
    assert.match(html, /name="monthly" checked/);
    assert.ok(!html.includes('<script>bad</script>'));
});

test('recurring expense saves to Supabase with a UUID without local writes', async () => {
    const { expenses, calls, ctx, button } = setup();
    await expenses.submitForm('expense-uuid');
    assert.equal(calls[0].name, 'save_expense');
    assert.equal(calls[0].args.p_monthly, true);
    assert.equal(calls[0].args.p_expense_id, 'expense-uuid');
    assert.equal(calls[0].args.p_amount, 100);
    assert.equal(ctx.location.hash, '#/expenses');
    assert.equal(button.disabled, false);
});

test('turning off repeat sends false and errors leave form available', async () => {
    const { expenses, calls, form, flashes, ctx, button } = setup({ error: 'write denied' });
    form.monthly = null;
    await expenses.submitForm('expense-uuid');
    assert.equal(calls[0].args.p_monthly, false);
    assert.ok(flashes.includes('write denied'));
    assert.equal(ctx.location.hash, '#/expenses/add');
    assert.equal(button.disabled, false);
    assert.equal(expenses._saving, false);
});

test('load fills due recurring expenses then reads Supabase amounts and flags', async () => {
    const { expenses, calls } = setup();
    expenses.state.year = 2026; expenses.state.month = 10;
    await expenses.loadAsync();
    assert.equal(calls[0].name, 'sync_recurring_expenses');
    assert.equal(expenses.state.expenses[0].amount, 100);
    assert.equal(expenses.state.expenses[0].monthly, true);
    assert.equal(expenses.state.filtered.length, 1);
});

test('UUID checkboxes select only one row and delete preserves UUIDs', async () => {
    const { expenses, calls } = setup();
    expenses.toggleSelect('first-uuid');
    assert.equal(expenses.state.selected.size, 1);
    assert.equal(expenses.state.selected.has('second-uuid'), false);
    await expenses.removeExpenses(['first-uuid']);
    assert.equal(calls[0].name, 'delete_expenses');
    assert.equal(calls[0].args.p_expense_ids[0], 'first-uuid');
});

test('late expense save never navigates away from another page', async () => {
    const { expenses, ctx } = setup({ current: false });
    ctx.location.hash = '#/products';
    await expenses.submitForm(null);
    assert.equal(ctx.location.hash, '#/products');
});
