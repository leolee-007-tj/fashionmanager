const Customers = {
    state: {
        customers: [],
        filtered: [],
        search: '',
        sortBy: 'total_amount',
        sortOrder: 'desc',
        year: 2025,
        month: null,
        selected: new Set(),
        editingCustomerId: null,
        detailSortOrder: 'desc' // desc: 최신순, asc: 오름차순
    },

    load() {
        this.state.customers = DB.getCustomers();
        this.recalculateAll();
        this.applyFilters();
    },

    recalculateAll() {
        const orders = DB.getOrders().filter(o => o.status === 'SHIPPED' || o.status === 'COMPLETED');
        const customers = DB.getCustomers();
        const products = DB.getProducts();
        
        const _getOrderCost = (o) => {
            const p = products.find(pr => pr.id === o.product_id);
            if (o.actual_converted_cost_at_sale !== null && o.actual_converted_cost_at_sale !== undefined) {
                return o.actual_converted_cost_at_sale;
            }
            if (o.china_cost_at_sale !== null && o.china_cost_at_sale !== undefined) {
                return o.china_cost_at_sale;
            }
            if (p) {
                if (p.actual_converted_cost !== null && p.actual_converted_cost !== undefined) {
                    return p.actual_converted_cost;
                }
                if (p.china_base_price !== null && p.china_base_price !== undefined) {
                    return p.china_base_price;
                }
            }
            return 0;
        };
        
        const updated = customers.map(c => {
            const nameLower = (c.name || '').toLowerCase();
            const cOrders = orders.filter(o => {
                const oName = (o.customer_name || '').toLowerCase();
                return oName === nameLower || String(o.customer_id) === String(c.id);
            });
            const totalAmount = cOrders.reduce((s, o) => s + (o.selling_price || 0) * (o.quantity || 0), 0);
            const totalCost = cOrders.reduce((s, o) => s + _getOrderCost(o) * (o.quantity || 0), 0);
            const totalProfit = totalAmount - totalCost;
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

    _extractYearMonth(dateStr) {
        if (!dateStr) return null;
        const s = String(dateStr).trim();
        const m = s.match(/(\d{4})[\.\-\/年](\d{1,2})/);
        if (m) return { year: Number(m[1]), month: Number(m[2]) };
        const d = new Date(s);
        if (!isNaN(d.getTime())) return { year: d.getFullYear(), month: d.getMonth() + 1 };
        return null;
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
                if (o.status !== 'SHIPPED' && o.status !== 'COMPLETED') return false;
                const ym = this._extractYearMonth(o.order_date || o.created_at);
                if (!ym) return false;
                return ym.year === this.state.year && ym.month === this.state.month;
            });
            list = list.filter(c => {
                const nameLower = (c.name || '').toLowerCase();
                return orders.some(o => {
                    const oName = (o.customer_name || '').toLowerCase();
                    return oName === nameLower || String(o.customer_id) === String(c.id);
                });
            });
            list = list.map(c => {
                const nameLower = (c.name || '').toLowerCase();
                const mOrders = orders.filter(o => {
                    const oName = (o.customer_name || '').toLowerCase();
                    return oName === nameLower || String(o.customer_id) === String(c.id);
                });
                const products = DB.getProducts();
                const _getOrderCost = (o) => {
                    const p = products.find(pr => pr.id === o.product_id);
                    if (o.actual_converted_cost_at_sale !== null && o.actual_converted_cost_at_sale !== undefined) {
                        return o.actual_converted_cost_at_sale;
                    }
                    if (o.china_cost_at_sale !== null && o.china_cost_at_sale !== undefined) {
                        return o.china_cost_at_sale;
                    }
                    if (p) {
                        if (p.actual_converted_cost !== null && p.actual_converted_cost !== undefined) {
                            return p.actual_converted_cost;
                        }
                        if (p.china_base_price !== null && p.china_base_price !== undefined) {
                            return p.china_base_price;
                        }
                    }
                    return 0;
                };
                const monthAmount = mOrders.reduce((s, o) => s + (o.selling_price || 0) * (o.quantity || 0), 0);
                const monthCost = mOrders.reduce((s, o) => s + _getOrderCost(o) * (o.quantity || 0), 0);
                return {
                    ...c,
                    month_amount: monthAmount,
                    month_profit: monthAmount - monthCost,
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
            return !isNaN(d.getTime()) && d.getFullYear() === year && (d.getMonth() + 1) === month && (o.status === 'SHIPPED' || o.status === 'COMPLETED');
        });
        const customers = DB.getCustomers();
        
        const amountByName = {};
        orders.forEach(o => {
            let name = (o.customer_name || '').toLowerCase().trim();
            // customer_name이 없으면 customer_id로 고객 찾기
            if (!name && o.customer_id) {
                const c = customers.find(x => String(x.id) === String(o.customer_id));
                if (c) name = (c.name || '').toLowerCase().trim();
            }
            if (!name) return;
            amountByName[name] = (amountByName[name] || 0) + (o.selling_price || 0) * (o.quantity || 0);
        });
        
        return Object.entries(amountByName)
            .sort((a, b) => b[1] - a[1])
            .slice(0, count)
            .map(([nameLower, amount]) => {
                const c = customers.find(x => (x.name || '').toLowerCase().trim() === nameLower);
                if (!c) {
                    return { customer: { id: 0, name: nameLower }, amount: amount };
                }
                return { customer: c, amount: amount };
            })
            .filter(x => x.customer);
    },

    getQuarterTopCustomers(year, quarterEndMonth, count = 2) {
        const startMonth = quarterEndMonth - 2;
        const orders = DB.getOrders().filter(o => {
            const d = new Date(o.order_date || o.created_at);
            return !isNaN(d.getTime()) && d.getFullYear() === year && (d.getMonth() + 1) >= startMonth && (d.getMonth() + 1) <= quarterEndMonth && (o.status === 'SHIPPED' || o.status === 'COMPLETED');
        });
        const customers = DB.getCustomers();
        
        const amountByName = {};
        orders.forEach(o => {
            let name = (o.customer_name || '').toLowerCase().trim();
            // customer_name이 없으면 customer_id로 고객 찾기
            if (!name && o.customer_id) {
                const c = customers.find(x => String(x.id) === String(o.customer_id));
                if (c) name = (c.name || '').toLowerCase().trim();
            }
            if (!name) return;
            amountByName[name] = (amountByName[name] || 0) + (o.selling_price || 0) * (o.quantity || 0);
        });
        
        return Object.entries(amountByName)
            .sort((a, b) => b[1] - a[1])
            .slice(0, count)
            .map(([nameLower, amount]) => {
                const c = customers.find(x => (x.name || '').toLowerCase().trim() === nameLower);
                if (!c) {
                    return { customer: { id: 0, name: nameLower }, amount: amount };
                }
                return { customer: c, amount: amount };
            })
            .filter(x => x.customer);
    },

    renderList() {
        this.load();
        const list = this.state.filtered;
        const totalAmount = list.reduce((s, c) => s + (c.total_amount || 0), 0);
        const totalProfit = list.reduce((s, c) => s + (c.total_profit || 0), 0);
        const liveRate = Analytics.state.liveExchangeRate || 195;
        const fmtCN = n => Math.round(n || 0).toLocaleString();
        const fmtKR = n => Math.round((n || 0) * liveRate).toLocaleString();
        const currency = t('common', 'currency');
        const currencyKR = t('common', 'currency_kr');

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
                        <div class="stat-value">${fmtCN(totalAmount)} <span style="font-size:0.6em; color:#999;">${currency}</span></div>
                        <div style="color:#999; font-size:0.75rem; margin-top:4px;">≈ ${fmtKR(totalAmount)} ${currencyKR}</div>
                        <i class="fas fa-yen-sign stat-icon"></i>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">${t('analytics', 'total_profit')}</div>
                        <div class="stat-value" style="color: #28a745;">${fmtCN(totalProfit)} <span style="font-size:0.6em; color:#999;">${currency}</span></div>
                        <div style="color:#999; font-size:0.75rem; margin-top:4px;">≈ ${fmtKR(totalProfit)} ${currencyKR}</div>
                        <i class="fas fa-chart-line stat-icon"></i>
                    </div>
                </div>
                <div class="filter-row">
                    <div class="form-group">
                        <label>${t('common', 'year')}</label>
                        <select class="form-control" onchange="Customers.setYear(this.value)">
                            ${this.yearOptions()}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>${t('common', 'month')}</label>
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

            <!-- 월별 TOP 3 고객 (월 필터 선택 시만 표시) -->
            ${this.state.month ? `
            <div class="card mb-4" style="background: linear-gradient(135deg, rgba(102,126,234,0.05), rgba(118,75,162,0.05));">
                <h3><i class="fas fa-trophy" style="color:#FFD700;"></i> ${this.state.year}${t('common', 'year_suffix')} ${this.state.month}${t('common', 'month_suffix')} ${t('customers', 'monthly_top3')} <span class="badge badge-info" style="margin-left:8px;">TOP 3</span></h3>
                <div style="display:flex; gap:1rem; flex-wrap:wrap; margin-top:1rem;">
                    ${monthTop.length === 0 ? `<p class="text-muted">${t('common', 'no_data')}</p>` :
                        monthTop.map((item, i) => `
                            <div style="flex:1; min-width:200px; background:#fff; border-radius:12px; padding:1rem; box-shadow:0 2px 8px rgba(0,0,0,0.06); display:flex; align-items:center; gap:1rem;">
                                <div style="width:50px; height:50px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:1.2rem; ${rankBadge(i)}">
                                    ${item.customer.avatar_url ? `<img src="${item.customer.avatar_url}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">` : (i + 1)}
                                </div>
                                <div style="flex:1;">
                                    <div style="font-weight:bold; font-size:1.05rem;">${item.customer.name}</div>
                                    <div style="color:#667eea; font-weight:bold;">${fmtCN(item.amount)} ${currency}</div>
                                    <div style="color:#999; font-size:0.75rem;">≈ ${fmtKR(item.amount)} ${currencyKR}</div>
                                </div>
                            </div>
                        `).join('')}
                </div>
            </div>
            ` : ''}

            <!-- 분기별 TOP 2 고객 (데이터 있는 분기만 표시) -->
            <div class="card mb-4" style="background: linear-gradient(135deg, rgba(118,75,162,0.05), rgba(237,30,121,0.05));">
                <h3><i class="fas fa-medal" style="color:#ED1E79;"></i> ${this.state.year}${t('common', 'year_suffix')} ${t('customers', 'quarterly_top2')} <span class="badge badge-warning" style="margin-left:8px;">TOP 2</span></h3>
                <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap:1rem; margin-top:1rem;">
                    ${this._renderQuarterCard(1, 3, q3, rankBadge, fmtCN, fmtKR, currency, currencyKR)}
                    ${this._renderQuarterCard(4, 6, q6, rankBadge, fmtCN, fmtKR, currency, currencyKR)}
                    ${this._renderQuarterCard(7, 9, q9, rankBadge, fmtCN, fmtKR, currency, currencyKR)}
                    ${this._renderQuarterCard(10, 12, q12, rankBadge, fmtCN, fmtKR, currency, currencyKR)}
                </div>
            </div>

            <!-- 고객 목록 테이블 -->
            <div class="card">
                <div class="action-bar">
                    <div class="action-bar-left">
                        <label class="checkbox-wrapper">
                            <input type="checkbox" class="select-all-cb" data-target="customers">
                            ${t('products', 'select_all')}
                        </label>
                        <button class="btn btn-sm btn-danger" onclick="Customers.batchDelete()">
                            <i class="fas fa-trash"></i> ${t('products', 'delete')}
                        </button>
                    </div>
                </div>
        `;
        if (list.length === 0) {
            html += `<div class="empty-state"><i class="fas fa-users"></i><p>${t('common', 'no_data')}</p></div>`;
        } else {
            html += `
                <div style="overflow-x:auto;">
                <table class="table">
                    <thead>
                        <tr>
                            <th style="width:40px;"><input type="checkbox" class="select-all-cb" data-target="customers"></th>
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
                const isEditing = String(this.state.editingCustomerId) === String(c.id);
                html += `
                    <tr ${isEditing ? 'style="background:#eef3ff;"' : ''}>
                        <td><input type="checkbox" class="row-checkbox" data-id="${c.id}" data-target="customers" ${this.state.selected.has(Number(c.id)) ? 'checked' : ''}></td>
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
                            <button class="btn btn-sm ${isEditing ? 'btn-warning' : 'btn-secondary'}" onclick="Customers.toggleEditCustomer('${c.id}')"><i class="fas fa-edit"></i></button>
                            <button class="btn btn-sm btn-danger" onclick="Customers.delete(${c.id})"><i class="fas fa-trash"></i></button>
                        </td>
                    </tr>
                `;
                if (isEditing) {
                    html += `
                        <tr style="background:#f8f9fa;">
                            <td colspan="8">
                                <form id="custEditForm_${c.id}" onsubmit="return Customers.submitInlineEdit(event, '${c.id}')" style="padding:12px 8px;">
                                    <div class="form-row">
                                        <div class="form-group">
                                            <label>${t('customers', 'name')} *</label>
                                            <input type="text" name="name" required class="form-control" value="${c.name || ''}">
                                        </div>
                                        <div class="form-group">
                                            <label>${t('customers', 'wechat')}</label>
                                            <input type="text" name="wechat_nickname" class="form-control" value="${c.wechat_nickname || ''}">
                                        </div>
                                        <div class="form-group">
                                            <label>${t('customers', 'phone')}</label>
                                            <input type="text" name="phone" class="form-control" value="${c.phone || ''}">
                                        </div>
                                    </div>
                                    <div class="form-row">
                                        <div class="form-group" style="flex:2;">
                                            <label>${t('customers', 'address')}</label>
                                            <input type="text" name="address" class="form-control" value="${c.address || ''}">
                                        </div>
                                        <div class="form-group" style="flex:3;">
                                            <label>${t('common', 'memo')}</label>
                                            <input type="text" name="notes" class="form-control" value="${c.notes || ''}">
                                        </div>
                                    </div>
                                    <div class="d-flex gap-2">
                                        <button type="submit" class="btn btn-primary btn-sm"><i class="fas fa-save"></i> ${t('common', 'save')}</button>
                                        <button type="button" class="btn btn-secondary btn-sm" onclick="Customers.cancelEditCustomer()">${t('common', 'cancel')}</button>
                                    </div>
                                </form>
                            </td>
                        </tr>
                    `;
                }
            });
            html += '</tbody></table></div>';
        }
        html += '</div>';
        setTimeout(() => this.updateSelectAllCheckbox(), 0);
        return html;
    },

    _renderQuarterCard(startMonth, endMonth, topList, rankBadge, fmtCN, fmtKR, currency, currencyKR) {
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
                                <div style="color:#667eea; font-size:0.85rem;">${fmtCN(item.amount)} ${currency}</div>
                                <div style="color:#999; font-size:0.75rem;">≈ ${fmtKR(item.amount)} ${currencyKR}</div>
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

    toggleSelect(id) {
        const numId = Number(id);
        if (this.state.selected.has(numId)) {
            this.state.selected.delete(numId);
        } else {
            this.state.selected.add(numId);
        }
        App.renderPage();
    },

    toggleSelectAll() {
        const total = this.state.filtered.length;
        const selectedCount = this.state.filtered.filter(c => this.state.selected.has(Number(c.id))).length;
        if (selectedCount === total) {
            this.state.selected.clear();
        } else {
            this.state.selected.clear();
            this.state.filtered.forEach(c => this.state.selected.add(Number(c.id)));
        }
        App.renderPage();
    },

    batchDelete() {
        if (this.state.selected.size === 0) {
            App.flash(t('common', 'please_select'), 'warning');
            return;
        }
        if (!confirm(this.state.selected.size + t('common', 'confirm_delete_items'))) return;
        const customers = DB.getCustomers().filter(c => !this.state.selected.has(c.id));
        DB.setCustomers(customers);
        this.state.selected.clear();
        App.flash(t('common', 'delete') + '!', 'success');
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

    toggleEditCustomer(id) {
        if (String(this.state.editingCustomerId) === String(id)) {
            this.state.editingCustomerId = null;
        } else {
            this.state.editingCustomerId = Number(id);
        }
        App.renderPage();
    },

    cancelEditCustomer() {
        this.state.editingCustomerId = null;
        App.renderPage();
    },

    submitInlineEdit(e, id) {
        e.preventDefault();
        const form = e.target;
        const fd = new FormData(form);
        const data = {
            name: (fd.get('name') || '').trim(),
            wechat_nickname: fd.get('wechat_nickname') || '',
            phone: fd.get('phone') || '',
            address: fd.get('address') || '',
            notes: fd.get('notes') || ''
        };
        if (!data.name) {
            App.flash(t('customers', 'enter_name'), 'error');
            return false;
        }
        DB.updateCustomer(Number(id), data);
        this.state.editingCustomerId = null;
        App.flash(t('common', 'save') + '!', 'success');
        App.render();
        return false;
    },

    renderDetail(id) {
        const customer = DB.getCustomers().find(c => String(c.id) === String(id));
        if (!customer) {
            App.flash(t('customers', 'not_found'), 'error');
            location.hash = '#/customers';
            return '';
        }
        const customerNameLower = (customer.name || '').toLowerCase();
        const orders = DB.getOrders()
            .filter(o => {
                const oName = (o.customer_name || '').toLowerCase();
                return oName === customerNameLower || String(o.customer_id) === String(customer.id);
            })
            .sort((a, b) => new Date(b.order_date || b.created_at) - new Date(a.order_date || a.created_at));
        const products = DB.getProducts();
        const completedOrders = orders.filter(o => o.status === 'SHIPPED' || o.status === 'COMPLETED');
        
        const _getOrderCost = (o) => {
            const p = products.find(pr => pr.id === o.product_id);
            if (o.actual_converted_cost_at_sale !== null && o.actual_converted_cost_at_sale !== undefined) {
                return o.actual_converted_cost_at_sale;
            }
            if (o.china_cost_at_sale !== null && o.china_cost_at_sale !== undefined) {
                return o.china_cost_at_sale;
            }
            if (p) {
                if (p.actual_converted_cost !== null && p.actual_converted_cost !== undefined) {
                    return p.actual_converted_cost;
                }
                if (p.china_base_price !== null && p.china_base_price !== undefined) {
                    return p.china_base_price;
                }
            }
            return 0;
        };
        
        const totalAmount = completedOrders.reduce((s, o) => s + (o.selling_price || 0) * (o.quantity || 0), 0);
        const totalCost = completedOrders.reduce((s, o) => s + _getOrderCost(o) * (o.quantity || 0), 0);
        const totalProfit = totalAmount - totalCost;
        const totalQuantity = completedOrders.reduce((s, o) => s + (o.quantity || 0), 0);
        const level = this.getLevel(totalAmount);

        const brandCounts = {};
        const categoryCounts = {};
        completedOrders.forEach(o => {
            const p = products.find(pr => pr.id === o.product_id);
            const brand = p ? p.brand : (o.brand || '-');
            const qty = o.quantity || 1;
            brandCounts[brand] = (brandCounts[brand] || 0) + qty;
            
            // 카테고리 추출: 상품 category가 있으면 사용, 없으면 분류키워드로 검색
            let category = '-';
            if (p && p.category) {
                category = p.category;
            } else if (p && p.original_title) {
                const classifyResult = ClassificationService.classify(p.original_title);
                if (classifyResult && classifyResult.category) {
                    category = classifyResult.category;
                }
            } else if (o.product_name) {
                const classifyResult = ClassificationService.classify(o.product_name);
                if (classifyResult && classifyResult.category) {
                    category = classifyResult.category;
                }
            }
            if (category && category !== '-') {
                categoryCounts[category] = (categoryCounts[category] || 0) + qty;
            }
        });
        const topBrands = Object.entries(brandCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
        const topCategories = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

        const avatar = customer.avatar_url || '';
        const liveRate = Analytics.state.liveExchangeRate || 195;
        const fmtCN = n => Math.round(n || 0).toLocaleString();
        const fmtKR = n => Math.round((n || 0) * liveRate).toLocaleString();
        const currency = t('common', 'currency');
        const currencyKR = t('common', 'currency_kr');

        let html = `
            <div class="card mb-4">
                <div class="action-bar">
                    <div class="action-bar-left">
                        <div style="display:flex; align-items:center; gap:1rem;">
                            <div style="position:relative; width:60px; height:60px;">
                                <div style="width:60px; height:60px; border-radius:50%; background:linear-gradient(135deg,#667eea,#764ba2); display:flex; align-items:center; justify-content:center; color:#fff; font-size:1.5rem; font-weight:bold; overflow:hidden; box-shadow:0 4px 12px rgba(102,126,234,0.4);">
                                    ${avatar ? `<img src="${avatar}" style="width:100%; height:100%; object-fit:cover;" id="customerAvatarImg">` : `<span id="customerAvatarImg">${(customer.name || '?').charAt(0)}</span>`}
                                </div>
                                <button onclick="Customers.showAvatarUpload('${customer.id}')" style="position:absolute; bottom:-5px; right:-5px; width:24px; height:24px; border-radius:50%; background:#667eea; border:2px solid #fff; color:#fff; font-size:0.7rem; cursor:pointer; display:flex; align-items:center; justify-content:center;">
                                    <i class="fas fa-camera"></i>
                                </button>
                                <input type="file" id="avatarUpload_${customer.id}" accept="image/*" style="display:none;" onchange="Customers.handleDetailAvatarChange(event, '${customer.id}')">
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
                        <div class="stat-value">${fmtCN(totalAmount)} <span style="font-size:0.6em; color:#999;">${currency}</span></div>
                        <div style="color:#999; font-size:0.75rem; margin-top:4px;">≈ ${fmtKR(totalAmount)} ${currencyKR}</div>
                        <i class="fas fa-yen-sign stat-icon"></i>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">${t('analytics', 'total_profit')}</div>
                        <div class="stat-value" style="color: #28a745;">${fmtCN(totalProfit)} <span style="font-size:0.6em; color:#999;">${currency}</span></div>
                        <div style="color:#999; font-size:0.75rem; margin-top:4px;">≈ ${fmtKR(totalProfit)} ${currencyKR}</div>
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
                            <th onclick="Customers.toggleDetailSort()" style="cursor:pointer;">
                                ${t('orders', 'sale_date')}
                                <i class="fas fa-sort-${this.state.detailSortOrder === 'desc' ? 'down' : 'up'}" style="margin-left:4px;"></i>
                            </th>
                            <th>${t('orders', 'brand')}</th>
                            <th>${t('orders', 'product')}</th>
                            <th>${t('orders', 'quantity')}</th>
                            <th>${t('orders', 'selling_price')}</th>
                            <th>${t('common', 'status')}</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            // 정렬 방향에 따라 orders 정렬
            const sortedOrders = [...orders].sort((a, b) => {
                const aDate = new Date(a.order_date || a.created_at);
                const bDate = new Date(b.order_date || b.created_at);
                if (isNaN(aDate.getTime())) return 1;
                if (isNaN(bDate.getTime())) return -1;
                if (this.state.detailSortOrder === 'desc') {
                    return bDate - aDate;
                }
                return aDate - bDate;
            });
            sortedOrders.forEach(o => {
                const product = products.find(p => p.id === o.product_id);
                const brand = product ? product.brand : (o.brand || '-');
                const orderDate = o.order_date ? o.order_date : (o.created_at ? new Date(o.created_at).toISOString().slice(0, 10) : '-');
                html += `
                    <tr>
                        <td>${orderDate}</td>
                        <td>${brand}</td>
                        <td>${product ? product.original_title : '-'}</td>
                        <td>${o.quantity || 1}</td>
                        <td class="font-bold">${fmtCN(o.selling_price || 0)} ${currency}</td>
                        <td><span class="badge ${statusLabels[o.status] || 'badge-pending'}">${t('orders', o.status?.toLowerCase() || 'pending')}</span></td>
                    </tr>
                `;
            });
            html += '</tbody></table></div>';
        }
        html += '</div>';
        return html;
    },

    toggleDetailSort() {
        this.state.detailSortOrder = this.state.detailSortOrder === 'desc' ? 'asc' : 'desc';
        App.renderPage();
    },

    showAvatarUpload(id) {
        document.getElementById('avatarUpload_' + id).click();
    },

    handleDetailAvatarChange(event, id) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const dataUrl = e.target.result;
            DB.updateCustomer(Number(id), { avatar_url: dataUrl });
            const avatarEl = document.getElementById('customerAvatarImg');
            if (avatarEl) {
                if (avatarEl.tagName === 'IMG') {
                    avatarEl.src = dataUrl;
                } else {
                    avatarEl.innerHTML = `<img src="${dataUrl}" style="width:100%; height:100%; object-fit:cover;" id="customerAvatarImg">`;
                }
            }
            App.flash(t('common', 'save') + '!', 'success');
        };
        reader.readAsDataURL(file);
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
