const Expenses = {
    state: {
        expenses: [],
        filtered: [],
        year: new Date().getFullYear(),
        month: new Date().getMonth() + 1,
        sortBy: 'expense_date',
        sortOrder: 'desc',
        selected: new Set()
    },

    load() {
        this.state.expenses = DB.getExpenses();
        this.applyFilters();
    },

    remoteContext() {
        if (window.LESOUL_CONFIG?.SUPABASE_ENABLED !== true) return null;
        const client = window.LESOULSupabase?.getClient();
        const storeId = window.LESOULAppBootstrap?.getContext()?.activeMembership?.storeId;
        if (!client || !storeId) throw new Error('경비를 저장하려면 로그인과 매장 연결이 필요합니다.');
        return { client, storeId };
    },

    async syncRecurring() {
        const ctx = this.remoteContext();
        if (!ctx) return;
        const result = await ctx.client.rpc('sync_recurring_expenses', { p_store_id: ctx.storeId });
        if (result.error) throw new Error(result.error.message || '반복 경비 등록 실패');
    },

    async loadAsync() {
        const ctx = this.remoteContext();
        if (!ctx) { this.load(); return; }
        await this.syncRecurring();
        const [expenses, repeats] = await Promise.all([
            ctx.client.from('expenses').select('*').eq('store_id', ctx.storeId).is('deleted_at', null),
            ctx.client.from('expense_recurrences').select('id,active').eq('store_id', ctx.storeId)
        ]);
        if (expenses.error || repeats.error) throw new Error((expenses.error || repeats.error).message);
        const active = new Set((repeats.data || []).filter(r => r.active).map(r => r.id));
        this.state.expenses = (expenses.data || []).map(e => ({ ...e, amount: Number(e.amount), monthly: active.has(e.recurrence_id) }));
        this.applyFilters();
    },

    escape(value) {
        return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    },

    applyFilters() {
        let list = [...this.state.expenses];
        if (this.state.year && this.state.month) {
            list = list.filter(e => {
                const d = new Date(e.expense_date);
                return d.getFullYear() === this.state.year && (d.getMonth() + 1) === this.state.month;
            });
        }
        list.sort((a, b) => {
            let av = a[this.state.sortBy];
            let bv = b[this.state.sortBy];
            if (this.state.sortBy === 'expense_date') {
                av = new Date(a.expense_date);
                bv = new Date(b.expense_date);
            }
            if (this.state.sortOrder === 'asc') {
                return av > bv ? 1 : -1;
            }
            return av < bv ? 1 : -1;
        });
        this.state.filtered = list;
    },

    async renderList() {
        await this.loadAsync();
        const list = this.state.filtered;
        const totalAmount = list.reduce((s, e) => s + (e.amount || 0), 0);
        const categoryTotals = {};
        list.forEach(e => {
            const cat = e.category || t('common', 'etc');
            if (!categoryTotals[cat]) categoryTotals[cat] = 0;
            categoryTotals[cat] += e.amount || 0;
        });
        let html = `
            <div class="card">
                <div class="action-bar">
                    <div class="action-bar-left">
                        <h2><i class="fas fa-money-bill-wave"></i> ${t('expenses', 'title')}</h2>
                    </div>
                    <div class="action-bar-right">
                        <a href="#/expenses/add" class="btn btn-primary"><i class="fas fa-plus"></i> ${t('expenses', 'add')}</a>
                    </div>
                </div>
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-label">${t('expenses', 'month_total')}</div>
                        <div class="stat-value" style="color: #dc3545;">${totalAmount.toLocaleString()}</div>
                        <i class="fas fa-wallet stat-icon"></i>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">${t('expenses', 'count')}</div>
                        <div class="stat-value">${list.length}</div>
                        <i class="fas fa-receipt stat-icon"></i>
                    </div>
                </div>
                <div class="filter-row">
                    <div class="form-group">
                        <label>${t('common', 'stock_year')}</label>
                        <select class="form-control" onchange="Expenses.setYear(this.value)">
                            ${this.yearOptions()}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>${t('common', 'stock_month')}</label>
                        <select class="form-control" onchange="Expenses.setMonth(this.value)">
                            ${this.monthOptions()}
                        </select>
                    </div>
                </div>
                <div class="action-bar">
                    <div class="action-bar-left">
                        <button class="btn btn-sm btn-danger" onclick="Expenses.batchDelete()">
                            <i class="fas fa-trash"></i> ${t('products', 'delete')}
                        </button>
                    </div>
                </div>
        `;
        if (list.length === 0) {
            html += `<div class="empty-state"><i class="fas fa-money-bill-wave"></i><p>${t('common', 'no_data')}</p></div>`;
        } else {
            html += `
                <div style="overflow-x:auto;">
                <table class="table">
                    <thead>
                        <tr>
                            <th style="width:40px;"><input type="checkbox" class="select-all-cb" data-target="expenses" ${list.length > 0 && list.every(e => this.state.selected.has(String(e.id))) ? 'checked' : ''}></th>
                            <th onclick="Expenses.sort('expense_date')" class="${this.state.sortBy === 'expense_date' ? 'sort-active' : ''}">
                                ${t('expenses', 'date')}
                                <i class="fas fa-sort-${this.state.sortOrder === 'asc' ? 'up' : 'down'}"></i>
                            </th>
                            <th>${t('expenses', 'category')}</th>
                            <th>${t('expenses', 'description')}</th>
                            <th onclick="Expenses.sort('amount')" class="${this.state.sortBy === 'amount' ? 'sort-active' : ''}">
                                ${t('expenses', 'amount')}
                                <i class="fas fa-sort-${this.state.sortOrder === 'asc' ? 'up' : 'down'}"></i>
                            </th>
                            <th>${t('common', 'action')}</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            list.forEach(e => {
                html += `
                    <tr>
                        <td><input type="checkbox" class="row-checkbox" data-id="${e.id}" data-target="expenses" ${this.state.selected.has(String(e.id)) ? 'checked' : ''}></td>
                        <td>${e.expense_date || '-'}</td>
                        <td><span class="badge badge-shipped">${this.escape(e.category || '-')}</span>${e.monthly ? ' · '+t('expenses', 'monthly') : ''}</td>
                        <td>${this.escape(e.description || '-')}</td>
                        <td class="text-danger font-bold">${(e.amount || 0).toLocaleString()} ${t('common', 'currency')}</td>
                        <td>
                            <a href="#/expenses/${e.id}/edit" class="btn btn-sm btn-secondary"><i class="fas fa-edit"></i></a>
                            <button class="btn btn-sm btn-danger" onclick="Expenses.delete('${e.id}')"><i class="fas fa-trash"></i></button>
                        </td>
                    </tr>
                `;
            });
            html += '</tbody></table></div>';
        }
        html += '</div>';
        return html;
    },

    yearOptions() {
        let html = '';
        for (let y = 2025; y <= 2030; y++) {
            html += `<option value="${y}" ${this.state.year === y ? 'selected' : ''}>${y}${t('common', 'year_suffix')}</option>`;
        }
        return html;
    },

    monthOptions() {
        let html = '';
        for (let m = 1; m <= 12; m++) {
            html += `<option value="${m}" ${this.state.month === m ? 'selected' : ''}>${m}${t('common', 'month_suffix')}</option>`;
        }
        return html;
    },

    setYear(val) {
        this.state.year = parseInt(val);
        App.render();
    },

    setMonth(val) {
        this.state.month = parseInt(val);
        App.render();
    },

    sort(field) {
        if (this.state.sortBy === field) {
            this.state.sortOrder = this.state.sortOrder === 'asc' ? 'desc' : 'asc';
        } else {
            this.state.sortBy = field;
            this.state.sortOrder = 'asc';
        }
        App.render();
    },

    toggleSelect(id) {
        const numId = String(id);
        if (this.state.selected.has(numId)) {
            this.state.selected.delete(numId);
        } else {
            this.state.selected.add(numId);
        }
        App.renderPage();
    },

    toggleSelectAll() {
        const total = this.state.filtered.length;
        const selectedCount = this.state.filtered.filter(e => this.state.selected.has(String(e.id))).length;
        if (selectedCount === total) {
            this.state.selected.clear();
        } else {
            this.state.selected.clear();
            this.state.filtered.forEach(e => this.state.selected.add(String(e.id)));
        }
        App.renderPage();
    },

    async batchDelete() {
        if (this.state.selected.size === 0) {
            App.flash(t('common', 'please_select'), 'warning');
            return;
        }
        if (!confirm(t('expenses', 'delete_repeat_notice'))) return;
        try { await this.removeExpenses([...this.state.selected]); }
        catch (e) { App.flash(e.message, 'error'); return; }
        this.state.selected.clear();
        App.flash(t('common', 'delete') + '!', 'success');
        App.render();
    },

    async delete(id) {
        if (!confirm(t('expenses', 'delete_repeat_notice'))) return;
        try { await this.removeExpenses([String(id)]); }
        catch (e) { App.flash(e.message, 'error'); return; }
        App.flash(t('common', 'delete') + '!', 'success');
        App.render();
    },

    renderAdd() {
        return this.renderForm(null);
    },

    async removeExpenses(ids) {
        const ctx = this.remoteContext();
        if (!ctx) { DB.setExpenses(DB.getExpenses().filter(e => !ids.includes(String(e.id)))); return; }
        const result = await ctx.client.rpc('delete_expenses', { p_store_id: ctx.storeId, p_expense_ids: ids });
        if (result.error) throw new Error(result.error.message || '경비 삭제 실패');
    },

    async renderEdit(id) {
        const isCurrentPage = App.capturePageGuard?.() || (() => true);
        await this.loadAsync();
        if (!isCurrentPage()) return '';
        const expense = this.state.expenses.find(e => String(e.id) === String(id));
        if (!expense) {
            App.flash(t('expenses', 'not_found'), 'error');
            location.hash = '#/expenses';
            return '';
        }
        return this.renderForm(expense);
    },

    renderForm(expense) {
        const isEdit = !!expense;
        const e = expense || { expense_date: new Date().toISOString().slice(0, 10), category: '', description: '', amount: 0 };
        const categories = [
            { value: '교통비', key: 'cat_transportation' },
            { value: '차량 기름값', key: 'cat_fuel' },
            { value: '쇼핑', key: 'cat_shopping' },
            { value: '월세', key: 'rent' },
            { value: '전기세', key: 'electricity' },
            { value: '식비', key: 'cat_meals' },
            { value: '숙박비', key: 'cat_accommodation' },
            { value: '배송비', key: 'cat_shipping' },
            { value: '포장재', key: 'cat_packaging' },
            { value: '기타', key: 'cat_other' }
        ];
        return `
            <div class="card">
                <h2><i class="fas fa-plus"></i> ${isEdit ? t('common', 'edit') : t('expenses', 'add')}</h2>
                <form id="expenseForm">
                    <div class="form-row">
                        <div class="form-group">
                            <label>${t('expenses', 'date')} *</label>
                            <input type="date" name="expense_date" required class="form-control" value="${e.expense_date}">
                        </div>
                        <div class="form-group">
                            <label>${t('expenses', 'category')} *</label>
                            <select name="category" required class="form-control">
                                <option value="">${t('common', 'select')}</option>
                                ${categories.map(c => `<option value="${c.value}" ${e.category === c.value ? 'selected' : ''}>${t('expenses', c.key)}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                    <div class="form-group">
                        <label>${t('expenses', 'amount')} (${t('common', 'currency')}) *</label>
                        <input type="number" name="amount" required class="form-control" value="${e.amount}" min="0" step="1">
                    </div>
                    <div class="form-group">
                        <label>${t('expenses', 'description')}</label>
                        <textarea name="description" class="form-control" rows="3">${this.escape(e.description || '')}</textarea>
                    </div>
                    <div class="form-group">
                        <label><input type="checkbox" name="monthly" ${e.monthly ? 'checked' : ''}> ${t('expenses', 'monthly')}</label>
                        <p class="text-muted">${t('expenses', 'monthly_help')}</p>
                    </div>
                    <div class="d-flex gap-2 mt-4">
                        <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> ${t('common', 'save')}</button>
                        <a href="#/expenses" class="btn btn-secondary"><i class="fas fa-arrow-left"></i> ${t('common', 'cancel')}</a>
                    </div>
                </form>
            </div>
        `;
    },

    async submitForm(editId) {
        if (this._saving) return false;
        const isCurrentPage = App.capturePageGuard?.() || (() => true);
        const fd = new FormData(document.getElementById('expenseForm'));
        const data = {
            expense_date: fd.get('expense_date'),
            category: fd.get('category'),
            description: fd.get('description') || '',
            amount: parseFloat(fd.get('amount')) || 0,
            monthly: fd.get('monthly') === 'on'
        };
        if (!data.expense_date || !data.category || !Number.isFinite(data.amount) || data.amount <= 0) {
            App.flash(t('common', 'add_required_fields'), 'error');
            return false;
        }
        this._saving = true;
        const button = document.querySelector('#expenseForm button[type="submit"]');
        if (button) button.disabled = true;
        try {
            const ctx = this.remoteContext();
            if (ctx) {
                const result = await ctx.client.rpc('save_expense', {
                    p_store_id: ctx.storeId, p_expense_id: editId || null,
                    p_expense_date: data.expense_date, p_category: data.category,
                    p_amount: data.amount, p_description: data.description, p_monthly: data.monthly
                });
                if (result.error) throw new Error(result.error.message || '경비 저장 실패');
            } else {
                if (data.monthly) throw new Error('매월 반복 경비는 Supabase 로그인 후 사용할 수 있습니다.');
                if (editId) DB.updateExpense(Number(editId), data);
                else DB.addExpense(data);
            }
            this.state.year = Number(data.expense_date.slice(0, 4));
            this.state.month = Number(data.expense_date.slice(5, 7));
            App.flash(t('common', 'save') + '!', 'success');
            if (isCurrentPage()) location.hash = '#/expenses';
        } catch (e) {
            App.flash(e.message || '경비 저장 실패', 'error');
        } finally {
            this._saving = false;
            if (button) button.disabled = false;
        }
        return false;
    }
};
