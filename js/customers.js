const Customers = {
    state: {
        customers: [],
        filtered: [],
        search: '',
        sortBy: 'total_amount',
        sortOrder: 'desc',
        year: new Date().getFullYear(),
        month: null
    },

    load() {
        this.state.customers = DB.getCustomers();
        this.recalculateAll();
        this.applyFilters();
    },

    recalculateAll() {
        const orders = DB.getOrders().filter(o => o.status === 'SHIPPED' || o.status === 'COMPLETED');
        const customers = DB.getCustomers();
        const updated = customers.map(c => {
            const cOrders = orders.filter(o => o.customer_id === c.id);
            const totalAmount = cOrders.reduce((s, o) => s + (o.selling_price || 0) * (o.quantity || 0), 0);
            const totalProfit = cOrders.reduce((s, o) => s + (o.actual_profit || 0), 0);
            const orderCount = cOrders.length;
            const totalQuantity = cOrders.reduce((s, o) => s + (o.quantity || 0), 0);
            let lastOrderDate = null;
            if (cOrders.length > 0) {
                cOrders.sort((a, b) => new Date(b.order_date || b.created_at) - new Date(a.order_date || a.created_at));
                lastOrderDate = cOrders[0].order_date || cOrders[0].created_at;
            }
            return { ...c, total_amount: totalAmount, total_profit: totalProfit, order_count: orderCount, total_quantity: totalQuantity, last_order_date: lastOrderDate };
        });
        DB.setCustomers(updated);
        this.state.customers = updated;
    },

    applyFilters() {
        let list = [...this.state.customers];
        if (this.state.search) {
            const s = this.state.search.toLowerCase();
            list = list.filter(c =>
                (c.name || '').toLowerCase().includes(s) ||
                (c.wechat_nickname || '').toLowerCase().includes(s) ||
                (c.phone || '').includes(s)
            );
        }
        if (this.state.year && this.state.month) {
            const orders = DB.getOrders().filter(o => {
                const d = new Date(o.order_date || o.created_at);
                return d.getFullYear() === this.state.year && (d.getMonth() + 1) === this.state.month && (o.status === 'SHIPPED' || o.status === 'COMPLETED');
            });
            list = list.filter(c => orders.some(o => o.customer_id === c.id));
            list = list.map(c => {
                const mOrders = orders.filter(o => o.customer_id === c.id);
                return {
                    ...c,
                    month_amount: mOrders.reduce((s, o) => s + (o.selling_price || 0) * (o.quantity || 0), 0),
                    month_profit: mOrders.reduce((s, o) => s + (o.actual_profit || 0), 0),
                    month_count: mOrders.length
                };
            });
        }
        list.sort((a, b) => {
            let av = a[this.state.sortBy];
            let bv = b[this.state.sortBy];
            if (typeof av === 'string') {
                av = av.toLowerCase();
                bv = bv.toLowerCase();
            }
            if (this.state.sortOrder === 'asc') {
                return av > bv ? 1 : -1;
            }
            return av < bv ? 1 : -1;
        });
        this.state.filtered = list;
    },

    getMonthTopCustomers(year, month, count = 3) {
        const orders = DB.getOrders().filter(o => {
            const d = new Date(o.order_date || o.created_at);
            return d.getFullYear() === year && (d.getMonth() + 1) === month && (o.status === 'SHIPPED' || o.status === 'COMPLETED');
        });
        const amountByCustomer = {};
        orders.forEach(o => {
            if (!amountByCustomer[o.customer_id]) amountByCustomer[o.customer_id] = 0;
            amountByCustomer[o.customer_id] += (o.selling_price || 0) * (o.quantity || 0);
        });
        const customers = DB.getCustomers();
        return Object.entries(amountByCustomer)
            .sort((a, b) => b[1] - a[1])
            .slice(0, count)
            .map(([cid, amount]) => {
                const c = customers.find(x => x.id == cid);
                return { customer: c, amount: amount };
            })
            .filter(x => x.customer);
    },

    getQuarterTopCustomers(year, quarterEndMonth, count = 2) {
        const startMonth = quarterEndMonth - 2;
        const orders = DB.getOrders().filter(o => {
            const d = new Date(o.order_date || o.created_at);
            return d.getFullYear() === year && (d.getMonth() + 1) >= startMonth && (d.getMonth() + 1) <= quarterEndMonth && (o.status === 'SHIPPED' || o.status === 'COMPLETED');
        });
        const amountByCustomer = {};
        orders.forEach(o => {
            if (!amountByCustomer[o.customer_id]) amountByCustomer[o.customer_id] = 0;
            amountByCustomer[o.customer_id] += (o.selling_price || 0) * (o.quantity || 0);
        });
        const customers = DB.getCustomers();
        return Object.entries(amountByCustomer)
            .sort((a, b) => b[1] - a[1])
            .slice(0, count)
            .map(([cid, amount]) => {
                const c = customers.find(x => x.id == cid);
                return { customer: c, amount: amount };
            })
            .filter(x => x.customer);
    },

    renderList() {
        this.load();
        const list = this.state.filtered;
        const totalAmount = list.reduce((s, c) => s + (c.total_amount || 0), 0);
        const totalProfit = list.reduce((s, c) => s + (c.total_profit || 0), 0);

        const monthTop = this.getMonthTopCustomers(this.state.year, this.state.month || new Date().getMonth() + 1, 3);
        const currentMonth = this.state.month || new Date().getMonth() + 1;
        const q3 = this.getQuarterTopCustomers(this.state.year, 3, 2);
        const q6 = this.getQuarterTopCustomers(this.state.year, 6, 2);
        const q9 = this.getQuarterTopCustomers(this.state.year, 9, 2);
        const q12 = this.getQuarterTopCustomers(this.state.year, 12, 2);

        const rankBadge = (i) => {
            if (i === 0) return 'style="background:linear-gradient(135deg,#FFD700,#FFA500);color:#fff;padding:2px 8px;border-radius:50%;font-weight:bold;"';
            if (i === 1) return 'style="background:linear-gradient(135deg,#C0C0C0,#A0A0A0);color:#fff;padding:2px 8px;border-radius:50%;font-weight:bold;"';
            if (i === 2) return 'style="background:linear-gradient(135deg,#CD7F32,#8B4513);color:#fff;padding:2px 8px;border-radius:50%;font-weight:bold;"';
            return `style="background:#667eea;color:#fff;padding:2px 8px;border-radius:50%;font-weight:bold;"`;
        };

        let html = `
            <div class="card mb-4">
                <div class="action-bar">
                    <div class="action-bar-left">
                        <h2><i class="fas fa-users"></i> ${t('customers', 'title')}</h2>
                    </div>
                    <div class="action-bar-right">
                        <a href="#/customers/add" class="btn btn-primary"><i class="fas fa-plus"></i> ${t('customers', 'add')}</a>
                    </div>
                </div>
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-label">${t('customers', 'total_count')}</div>
                        <div class="stat-value">${list.length}</div>
                        <i class="fas fa-users stat-icon"></i>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">${t('analytics', 'total_sales')}</div>
                        <div class="stat-value">${totalAmount.toLocaleString()}</div>
                        <i class="fas fa-won-sign stat-icon"></i>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">${t('analytics', 'total_profit')}</div>
                        <div class="stat-value" style="color: #28a745;">${totalProfit.toLocaleString()}</div>
                        <i class="fas fa-chart-line stat-icon"></i>
                    </div>
                </div>
                <div class="filter-row">
                    <div class="form-group">
                        <label>${t('common', 'stock_year')}</label>
                        <select class="form-control" onchange="Customers.setYear(this.value)">
                            ${this.yearOptions()}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>${t('common', 'stock_month')}</label>
                        <select class="form-control" onchange="Customers.setMonth(this.value)">
                            <option value="">${t('customers', 'all')}</option>
                            ${this.monthOptions()}
                        </select>
                    </div>
                    <div class="form-group search-box">
                        <label>${t('customers', 'search')}</label>
                        <input type="text" class="form-control" placeholder="${t('common', 'search')}..."
                            value="${this.state.search}" oninput="Customers.setSearch(this.value)">
                    </div>
                </div>
            </div>

            <!-- 월별 TOP 3 고객 -->
            <div class="card mb-4" style="background: linear-gradient(135deg, rgba(102,126,234,0.05), rgba(118,75,162,0.05));">
                <h3><i class="fas fa-trophy" style="color:#FFD700;"></i> ${this.state.year}${t('common', 'year_suffix')} ${currentMonth}${t('common', 'month_suffix')} ${t('customers', 'monthly_top3')} <span class="badge badge-info" style="margin-left:8px;">TOP 3</span></h3>
                <div style="display:flex; gap:1rem; flex-wrap:wrap; margin-top:1rem;">
                    ${monthTop.length === 0 ? `<p class="text-muted">${t('common', 'no_data')}</p>` :
                        monthTop.map((item, i) => `
                            <div style="flex:1; min-width:200px; background:#fff; border-radius:12px; padding:1rem; box-shadow:0 2px 8px rgba(0,0,0,0.06); display:flex; align-items:center; gap:1rem;">
                                <div style="width:50px; height:50px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:1.2rem; ${rankBadge(i)}">
                                    ${item.customer.avatar_url ? `<img src="${item.customer.avatar_url}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">` : (i + 1)}
                                </div>
                                <div style="flex:1;">
                                    <div style="font-weight:bold; font-size:1.05rem;">${item.customer.name}</div>
                                    <div style="color:#667eea; font-weight:bold;">${item.amount.toLocaleString()} ${t('common', 'currency')}</div>
                                </div>
                            </div>
                        `).join('')}
                </div>
            </div>

            <!-- 분기별 TOP 2 고객 -->
            <div class="card mb-4" style="background: linear-gradient(135deg, rgba(118,75,162,0.05), rgba(237,30,121,0.05));">
                <h3><i class="fas fa-medal" style="color:#ED1E79;"></i> ${this.state.year}${t('common', 'year_suffix')} ${t('customers', 'quarterly_top2')} <span class="badge badge-warning" style="margin-left:8px;">TOP 2</span></h3>
                <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap:1rem; margin-top:1rem;">
                    ${this._renderQuarterCard(1, 3, q3, rankBadge)}
                    ${this._renderQuarterCard(4, 6, q6, rankBadge)}
                    ${this._renderQuarterCard(7, 9, q9, rankBadge)}
                    ${this._renderQuarterCard(10, 12, q12, rankBadge)}
                </div>
            </div>

            <!-- 고객 목록 테이블 -->
            <div class="card">
        `;
        if (list.length === 0) {
            html += `<div class="empty-state"><i class="fas fa-users"></i><p>${t('common', 'no_data')}</p></div>`;
        } else {
            html += `
                <div style="overflow-x:auto;">
                <table class="table">
                    <thead>
                        <tr>
                            <th>${t('customers', 'avatar') || ''}</th>
                            <th onclick="Customers.sort('name')" class="${this.state.sortBy === 'name' ? 'sort-active' : ''}">
                                ${t('customers', 'name')}
                                <i class="fas fa-sort-${this.state.sortOrder === 'asc' ? 'up' : 'down'}"></i>
                            </th>
                            <th>${t('customers', 'wechat')}</th>
                            <th>${t('customers', 'phone')}</th>
                            <th onclick="Customers.sort('order_count')" class="${this.state.sortBy === 'order_count' ? 'sort-active' : ''}">
                                ${t('customers', 'order_count')}
                                <i class="fas fa-sort-${this.state.sortOrder === 'asc' ? 'up' : 'down'}"></i>
                            </th>
                            <th onclick="Customers.sort('total_amount')" class="${this.state.sortBy === 'total_amount' ? 'sort-active' : ''}">
                                ${t('customers', 'total_amount')}
                                <i class="fas fa-sort-${this.state.sortOrder === 'asc' ? 'up' : 'down'}"></i>
                            </th>
                            <th>${t('common', 'action')}</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            list.forEach(c => {
                html += `
                    <tr>
                        <td>
                            <div style="width:36px; height:36px; border-radius:50%; background:#667eea; display:flex; align-items:center; justify-content:center; color:#fff; font-weight:bold; overflow:hidden;">
                                ${c.avatar_url ? `<img src="${c.avatar_url}" style="width:100%; height:100%; object-fit:cover;">` : (c.name || '?').charAt(0)}
                            </div>
                        </td>
                        <td><strong>${c.name || '-'}</strong></td>
                        <td>${c.wechat_nickname || '-'}</td>
                        <td>${c.phone || '-'}</td>
                        <td>${c.order_count || 0}${t('customers', 'count_suffix')}</td>
                        <td class="font-bold">${(c.total_amount || 0).toLocaleString()} ${t('common', 'currency')}</td>
                        <td>
                            <a href="#/customers/${c.id}" class="btn btn-sm btn-info"><i class="fas fa-eye"></i></a>
                            <a href="#/customers/${c.id}/edit" class="btn btn-sm btn-secondary"><i class="fas fa-edit"></i></a>
                            <button class="btn btn-sm btn-danger" onclick="Customers.delete(${c.id})"><i class="fas fa-trash"></i></button>
                        </td>
                    </tr>
                `;
            });
            html += '</tbody></table></div>';
        }
        html += '</div>';
        return html;
    },

    _renderQuarterCard(startMonth, endMonth, topList, rankBadge) {
        const quarterNum = Math.ceil(endMonth / 3);
        return `
            <div style="background:#fff; border-radius:12px; padding:1rem; box-shadow:0 2px 8px rgba(0,0,0,0.06);">
                <div style="font-weight:bold; margin-bottom:0.8rem; color:#764ba2;">
                    <i class="fas fa-calendar"></i> ${t('customers', 'quarter') || '분기'} ${quarterNum} (${startMonth}~${endMonth}${t('common', 'month_suffix')})
                </div>
                ${topList.length === 0 ? `<p class="text-muted" style="font-size:0.9rem;">${t('common', 'no_data')}</p>` :
                    topList.map((item, i) => `
                        <div style="display:flex; align-items:center; gap:0.7rem; padding:0.5rem 0; border-bottom:${i < topList.length - 1 ? '1px solid #eee' : 'none'};">
                            <div style="width:36px; height:36px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:0.9rem; ${rankBadge(i)}">
                                ${item.customer.avatar_url ? `<img src="${item.customer.avatar_url}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">` : (i + 1)}
                            </div>
                            <div style="flex:1; min-width:0;">
                                <div style="font-weight:600; font-size:0.95rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${item.customer.name}</div>
                                <div style="color:#666; font-size:0.85rem;">${item.amount.toLocaleString()} ${t('common', 'currency')}</div>
                            </div>
                        </div>
                    `).join('')}
            </div>
        `;
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
        this.recalculateAll();
        this.applyFilters();
        App.render();
    },

    setMonth(val) {
        this.state.month = val ? parseInt(val) : null;
        this.recalculateAll();
        this.applyFilters();
        App.render();
    },

    setSearch(val) {
        this.state.search = val;
        this.applyFilters();
        App.renderPage();
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

    getLevel(amount) {
        if (amount >= 3000) return { name: t('customers', 'level_gold'), class: 'gold' };
        if (amount >= 1000) return { name: t('customers', 'level_silver'), class: 'silver' };
        if (amount >= 500) return { name: t('customers', 'level_bronze'), class: 'bronze' };
        return { name: t('customers', 'level_normal'), class: 'pending' };
    },

    delete(id) {
        if (!confirm(t('common', 'confirm_delete') + '?')) return;
        DB.deleteCustomer(id);
        App.flash(t('common', 'delete') + '!', 'success');
        App.render();
    },

    renderDetail(id) {
        const customer = DB.getCustomers().find(c => c.id === parseInt(id));
        if (!customer) {
            App.flash(t('customers', 'not_found'), 'error');
            location.hash = '#/customers';
            return '';
        }
        const orders = DB.getOrders()
            .filter(o => o.customer_id === customer.id)
            .sort((a, b) => new Date(b.order_date || b.created_at) - new Date(a.order_date || a.created_at));
        const products = DB.getProducts();
        const completedOrders = orders.filter(o => o.status === 'SHIPPED' || o.status === 'COMPLETED');
        const totalAmount = completedOrders.reduce((s, o) => s + (o.selling_price || 0) * (o.quantity || 0), 0);
        const totalProfit = completedOrders.reduce((s, o) => s + (o.actual_profit || 0), 0);
        const totalQuantity = completedOrders.reduce((s, o) => s + (o.quantity || 0), 0);
        const level = this.getLevel(totalAmount);

        const brandCounts = {};
        const categoryCounts = {};
        const monthGroups = {};
        completedOrders.forEach(o => {
            const p = products.find(pr => pr.id === o.product_id);
            const brand = p ? p.brand : (o.brand || '-');
            const category = p ? p.category : '-';
            const qty = o.quantity || 1;
            brandCounts[brand] = (brandCounts[brand] || 0) + qty;
            if (category) categoryCounts[category] = (categoryCounts[category] || 0) + qty;
            const d = new Date(o.order_date || o.created_at);
            const monthKey = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}`;
            if (!monthGroups[monthKey]) monthGroups[monthKey] = [];
            monthGroups[monthKey].push({ product: p ? p.original_title : '-', brand: brand, category: category, qty: qty });
        });
        const topBrands = Object.entries(brandCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
        const topCategories = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
        const sortedMonths = Object.keys(monthGroups).sort();

        const avatar = customer.avatar_url || '';

        let html = `
            <div class="card mb-4">
                <div class="action-bar">
                    <div class="action-bar-left">
                        <div style="display:flex; align-items:center; gap:1rem;">
                            <div style="width:60px; height:60px; border-radius:50%; background:linear-gradient(135deg,#667eea,#764ba2); display:flex; align-items:center; justify-content:center; color:#fff; font-size:1.5rem; font-weight:bold; overflow:hidden; box-shadow:0 4px 12px rgba(102,126,234,0.4);">
                                ${avatar ? `<img src="${avatar}" style="width:100%; height:100%; object-fit:cover;">` : (customer.name || '?').charAt(0)}
                            </div>
                            <div>
                                <h2 style="margin:0;">${customer.name || '-'}</h2>
                                <span class="badge badge-${level.class}" style="margin-top:4px;">${level.name}</span>
                            </div>
                        </div>
                    </div>
                    <div class="action-bar-right">
                        <a href="#/customers/${customer.id}/edit" class="btn btn-secondary"><i class="fas fa-edit"></i> ${t('common', 'edit')}</a>
                        <a href="#/customers" class="btn btn-secondary"><i class="fas fa-arrow-left"></i> ${t('common', 'back')}</a>
                    </div>
                </div>
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-label">${t('customers', 'total_amount')}</div>
                        <div class="stat-value">${totalAmount.toLocaleString()}</div>
                        <i class="fas fa-won-sign stat-icon"></i>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">${t('analytics', 'total_profit')}</div>
                        <div class="stat-value" style="color: #28a745;">${totalProfit.toLocaleString()}</div>
                        <i class="fas fa-chart-line stat-icon"></i>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">${t('customers', 'order_count')}</div>
                        <div class="stat-value">${orders.length}</div>
                        <i class="fas fa-shopping-bag stat-icon"></i>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">${t('customers', 'total_purchases')}</div>
                        <div class="stat-value">${totalQuantity}${t('dashboard', 'items')}</div>
                        <i class="fas fa-tshirt stat-icon"></i>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>${t('customers', 'wechat')}</label>
                        <p><strong>${customer.wechat_nickname || '-'}</strong></p>
                    </div>
                    <div class="form-group">
                        <label>${t('customers', 'phone')}</label>
                        <p><strong>${customer.phone || '-'}</strong></p>
                    </div>
                    <div class="form-group">
                        <label>${t('customers', 'address')}</label>
                        <p><strong>${customer.address || '-'}</strong></p>
                    </div>
                </div>
                <div class="form-group">
                    <label>${t('common', 'memo')}</label>
                    <p>${customer.notes || '-'}</p>
                </div>
            </div>

            <!-- 구매 분석 -->
            <div class="form-row" style="gap:1rem; flex-wrap:wrap;">
                <div class="card" style="flex:1; min-width:280px;">
                    <h3><i class="fas fa-heart text-danger"></i> ${t('customers', 'preferred_brand')}</h3>
                    ${topBrands.length === 0 ? `<p class="text-muted">${t('common', 'no_data')}</p>` :
                        topBrands.map(([brand, qty], i) => `
                            <div class="d-flex justify-between align-items-center" style="padding:0.5rem 0; border-bottom:1px solid #eee;">
                                <span><strong>${i + 1}.</strong> ${brand}</span>
                                <span class="badge badge-info">${qty}${t('dashboard', 'items')}</span>
                            </div>
                        `).join('')}
                </div>
                <div class="card" style="flex:1; min-width:280px;">
                    <h3><i class="fas fa-heart text-danger"></i> ${t('customers', 'preferred_category')}</h3>
                    ${topCategories.length === 0 ? `<p class="text-muted">${t('common', 'no_data')}</p>` :
                        topCategories.map(([cat, qty], i) => `
                            <div class="d-flex justify-between align-items-center" style="padding:0.5rem 0; border-bottom:1px solid #eee;">
                                <span><strong>${i + 1}.</strong> ${cat}</span>
                                <span class="badge badge-info">${qty}${t('dashboard', 'items')}</span>
                            </div>
                        `).join('')}
                </div>
            </div>

            <div class="card mt-4">
                <h3><i class="fas fa-calendar-alt"></i> ${t('customers', 'monthly_purchase_history') || '월별 구매 내역'}</h3>
                ${sortedMonths.length === 0 ? `<p class="text-muted">${t('common', 'no_data')}</p>` :
                    sortedMonths.map(m => `
                        <div style="margin-bottom:1rem;">
                            <h4 style="color:#667eea; margin-bottom:0.5rem;">${m}</h4>
                            <div class="d-flex flex-wrap gap-2">
                                ${monthGroups[m].map(item => `
                                    <span class="badge badge-secondary" style="font-size:0.85rem; padding:0.4rem 0.7rem;">
                                        ${item.brand} ${item.product} ${item.qty}${t('dashboard', 'items')}
                                    </span>
                                `).join('')}
                            </div>
                        </div>
                    `).join('')}
            </div>

            <div class="card mt-4">
                <h3><i class="fas fa-history"></i> ${t('orders', 'title')} ${t('common', 'history')}</h3>
        `;
        if (orders.length === 0) {
            html += `<div class="empty-state"><i class="fas fa-shopping-cart"></i><p>${t('common', 'no_data')}</p></div>`;
        } else {
            const statusLabels = { PENDING: 'badge-pending', SHIPPED: 'badge-shipped', COMPLETED: 'badge-completed', CANCELLED: 'badge-cancelled' };
            html += `
                <div style="overflow-x:auto;">
                <table class="table">
                    <thead>
                        <tr>
                            <th>${t('orders', 'order_number')}</th>
                            <th>${t('orders', 'sale_date')}</th>
                            <th>${t('orders', 'product')}</th>
                            <th>${t('orders', 'quantity')}</th>
                            <th>${t('orders', 'selling_price')}</th>
                            <th>${t('common', 'status')}</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            orders.forEach(o => {
                const product = products.find(p => p.id === o.product_id);
                html += `
                    <tr>
                        <td><strong>#${o.order_number || o.id}</strong></td>
                        <td>${o.order_date || new Date(o.created_at).toISOString().slice(0, 10)}</td>
                        <td>${product ? product.original_title : '-'}</td>
                        <td>${o.quantity}</td>
                        <td class="font-bold">${(o.selling_price || 0).toLocaleString()} ${t('common', 'currency')}</td>
                        <td><span class="badge ${statusLabels[o.status] || 'badge-pending'}">${t('orders', o.status?.toLowerCase() || 'pending')}</span></td>
                    </tr>
                `;
            });
            html += '</tbody></table></div>';
        }
        html += '</div>';
        return html;
    },

    renderAdd() {
        return this.renderForm(null);
    },

    renderEdit(id) {
        const customer = DB.getCustomers().find(c => c.id === parseInt(id));
        if (!customer) {
            App.flash(t('customers', 'not_found'), 'error');
            location.hash = '#/customers';
            return '';
        }
        return this.renderForm(customer);
    },

    renderForm(customer) {
        const isEdit = !!customer;
        const c = customer || { name: '', wechat_nickname: '', phone: '', address: '', notes: '', avatar_url: '' };
        const avatar = c.avatar_url || '';
        return `
            <div class="card">
                <h2><i class="fas fa-plus"></i> ${isEdit ? t('common', 'edit') : t('customers', 'add')}</h2>
                <form id="customerForm" onsubmit="return Customers.submitForm(${isEdit ? customer.id : 'null'})">
                    <div class="form-row">
                        <div class="form-group" style="flex:0 0 auto;">
                            <label>${t('customers', 'avatar') || '프로필 사진'}</label>
                            <div style="display:flex; align-items:center; gap:1rem;">
                                <div id="avatarPreview" style="width:80px; height:80px; border-radius:50%; background:linear-gradient(135deg,#667eea,#764ba2); display:flex; align-items:center; justify-content:center; color:#fff; font-size:2rem; font-weight:bold; overflow:hidden;">
                                    ${avatar ? `<img src="${avatar}" style="width:100%; height:100%; object-fit:cover;">` : (c.name || '?').charAt(0)}
                                </div>
                                <div>
                                    <input type="file" id="avatarFile" accept="image/*" style="display:none;" onchange="Customers.handleAvatarChange(event)">
                                    <button type="button" class="btn btn-secondary btn-sm" onclick="document.getElementById('avatarFile').click()">
                                        <i class="fas fa-upload"></i> ${t('customers', 'upload_avatar') || '사진 업로드'}
                                    </button>
                                    <button type="button" class="btn btn-outline-danger btn-sm" style="margin-left:0.5rem;" onclick="Customers.clearAvatar()">
                                        <i class="fas fa-times"></i> ${t('common', 'delete')}
                                    </button>
                                    <p class="text-muted" style="font-size:0.8rem; margin-top:0.3rem;">${t('customers', 'avatar_hint') || '권장 크기: 200x200'}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    <input type="hidden" id="avatarUrl" name="avatar_url" value="${c.avatar_url || ''}">
                    <div class="form-row">
                        <div class="form-group">
                            <label>${t('customers', 'name')} *</label>
                            <input type="text" name="name" required class="form-control" value="${c.name || ''}">
                        </div>
                        <div class="form-group">
                            <label>${t('customers', 'wechat')}</label>
                            <input type="text" name="wechat_nickname" class="form-control" value="${c.wechat_nickname || ''}">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>${t('customers', 'phone')}</label>
                            <input type="text" name="phone" class="form-control" value="${c.phone || ''}">
                        </div>
                        <div class="form-group">
                            <label>${t('customers', 'address')}</label>
                            <input type="text" name="address" class="form-control" value="${c.address || ''}">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>${t('common', 'memo')}</label>
                        <textarea name="notes" class="form-control" rows="3">${c.notes || ''}</textarea>
                    </div>
                    <div class="d-flex gap-2 mt-4">
                        <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> ${t('common', 'save')}</button>
                        <a href="#/customers" class="btn btn-secondary"><i class="fas fa-arrow-left"></i> ${t('common', 'cancel')}</a>
                    </div>
                </form>
            </div>
        `;
    },

    handleAvatarChange(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const dataUrl = e.target.result;
            document.getElementById('avatarUrl').value = dataUrl;
            const preview = document.getElementById('avatarPreview');
            preview.innerHTML = `<img src="${dataUrl}" style="width:100%; height:100%; object-fit:cover;">`;
        };
        reader.readAsDataURL(file);
    },

    clearAvatar() {
        document.getElementById('avatarUrl').value = '';
        const preview = document.getElementById('avatarPreview');
        const nameInput = document.querySelector('input[name="name"]');
        const firstChar = nameInput ? (nameInput.value || '?').charAt(0) : '?';
        preview.innerHTML = firstChar;
    },

    submitForm(editId) {
        const fd = new FormData(document.getElementById('customerForm'));
        const data = {
            name: (fd.get('name') || '').trim(),
            wechat_nickname: fd.get('wechat_nickname') || '',
            phone: fd.get('phone') || '',
            address: fd.get('address') || '',
            notes: fd.get('notes') || '',
            avatar_url: fd.get('avatar_url') || ''
        };
        if (!data.name) {
            App.flash(t('customers', 'enter_name'), 'error');
            return false;
        }
        if (editId) {
            DB.updateCustomer(parseInt(editId), data);
        } else {
            DB.addCustomer(data);
        }
        App.flash(t('common', 'save') + '!', 'success');
        location.hash = '#/customers';
        return false;
    }
};
