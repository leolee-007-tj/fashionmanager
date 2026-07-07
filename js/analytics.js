const Analytics = {
    state: {
        year: new Date().getFullYear(),
        month: new Date().getMonth() + 1,
        period: 'month'
    },

    render() {
        const orders = DB.getOrders().filter(o => o.status === 'SHIPPED' || o.status === 'COMPLETED');
        const expenses = DB.getExpenses();
        const products = DB.getProducts();
        let filteredOrders = orders;
        let filteredExpenses = expenses;
        if (this.state.period === 'month') {
            filteredOrders = orders.filter(o => {
                const d = new Date(o.order_date || o.created_at);
                return d.getFullYear() === this.state.year && (d.getMonth() + 1) === this.state.month;
            });
            filteredExpenses = expenses.filter(e => {
                const d = new Date(e.expense_date);
                return d.getFullYear() === this.state.year && (d.getMonth() + 1) === this.state.month;
            });
        } else if (this.state.period === 'year') {
            filteredOrders = orders.filter(o => {
                const d = new Date(o.order_date || o.created_at);
                return d.getFullYear() === this.state.year;
            });
            filteredExpenses = expenses.filter(e => {
                const d = new Date(e.expense_date);
                return d.getFullYear() === this.state.year;
            });
        }
        const totalSales = filteredOrders.reduce((s, o) => s + (o.selling_price || 0) * (o.quantity || 0), 0);
        const totalProfit = filteredOrders.reduce((s, o) => s + (o.actual_profit || 0), 0);
        const totalExpenses = filteredExpenses.reduce((s, e) => s + (e.amount || 0), 0);
        const netProfit = totalProfit - totalExpenses;
        const profitMargin = totalSales > 0 ? ((netProfit / totalSales) * 100).toFixed(1) : 0;
        const totalQuantity = filteredOrders.reduce((s, o) => s + (o.quantity || 0), 0);
        const avgPrice = totalQuantity > 0 ? totalSales / totalQuantity : 0;
        const customerCount = new Set(filteredOrders.map(o => o.customer_id)).size;
        const topProducts = this.getTopProducts(filteredOrders, products);
        const topCustomers = this.getTopCustomers(filteredOrders);
        let html = `
            <div class="card">
                <div class="action-bar">
                    <div class="action-bar-left">
                        <h2><i class="fas fa-chart-bar"></i> ${t('analytics', 'title')}</h2>
                    </div>
                    <div class="action-bar-right">
                        <div class="btn-group">
                            <button class="btn btn-sm ${this.state.period === 'month' ? 'btn-primary' : 'btn-secondary'}" onclick="Analytics.setPeriod('month')">${t('common', 'month_suffix')}</button>
                            <button class="btn btn-sm ${this.state.period === 'year' ? 'btn-primary' : 'btn-secondary'}" onclick="Analytics.setPeriod('year')">${t('common', 'year_suffix')}</button>
                        </div>
                    </div>
                </div>
                <div class="filter-row">
                    <div class="form-group">
                        <label>${t('common', 'stock_year')}</label>
                        <select class="form-control" onchange="Analytics.setYear(this.value)">
                            ${this.yearOptions()}
                        </select>
                    </div>
                    ${this.state.period === 'month' ? `
                    <div class="form-group">
                        <label>${t('common', 'stock_month')}</label>
                        <select class="form-control" onchange="Analytics.setMonth(this.value)">
                            ${this.monthOptions()}
                        </select>
                    </div>
                    ` : ''}
                </div>
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-label">${t('analytics', 'total_sales')}</div>
                        <div class="stat-value">${totalSales.toLocaleString()}</div>
                        <i class="fas fa-won-sign stat-icon"></i>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">${t('analytics', 'total_profit')}</div>
                        <div class="stat-value" style="color: #28a745;">${totalProfit.toLocaleString()}</div>
                        <i class="fas fa-chart-line stat-icon"></i>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">${t('expenses', 'title')}</div>
                        <div class="stat-value" style="color: #dc3545;">${totalExpenses.toLocaleString()}</div>
                        <i class="fas fa-money-bill-wave stat-icon"></i>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">${t('analytics', 'net_profit')}</div>
                        <div class="stat-value" style="color: ${netProfit >= 0 ? '#28a745' : '#dc3545'};">${netProfit.toLocaleString()}</div>
                        <i class="fas fa-coins stat-icon"></i>
                    </div>
                </div>
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-label">${t('analytics', 'profit_margin')}</div>
                        <div class="stat-value">${profitMargin}%</div>
                        <i class="fas fa-percent stat-icon"></i>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">${t('orders', 'total_quantity')}</div>
                        <div class="stat-value">${totalQuantity.toLocaleString()}</div>
                        <i class="fas fa-shopping-bag stat-icon"></i>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">${t('analytics', 'avg_price')}</div>
                        <div class="stat-value">${Math.round(avgPrice).toLocaleString()}</div>
                        <i class="fas fa-calculator stat-icon"></i>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">${t('analytics', 'customer_count')}</div>
                        <div class="stat-value">${customerCount}</div>
                        <i class="fas fa-users stat-icon"></i>
                    </div>
                </div>
                <div class="card" style="box-shadow:none; border: 1px solid #e9ecef;">
                    <h3><i class="fas fa-chart-line"></i> ${t('analytics', 'sales_chart')}</h3>
                    <canvas id="salesChart" height="100"></canvas>
                </div>
                <div class="form-row" style="gap:1rem; flex-wrap:wrap;">
                    <div class="card" style="flex:1; min-width:300px;">
                        <h3><i class="fas fa-tshirt"></i> ${t('analytics', 'top_products')}</h3>
                        ${topProducts.length === 0 ? `<p class="text-muted">${t('common', 'no_data')}</p>` : `
                        <table class="table">
                            <thead>
                                <tr><th>${t('common', 'rank')}</th><th>${t('products', 'title')}</th><th>${t('orders', 'quantity')}</th><th>${t('analytics', 'sales')}</th></tr>
                            </thead>
                            <tbody>
                        ${topProducts.map((p, i) => `
                            <tr>
                                <td><span class="badge badge-${i < 3 ? 'vip' : 'pending'}">${i + 1}</span></td>
                                <td>${p.name}</td>
                                <td>${p.quantity}</td>
                                <td class="font-bold">${p.sales.toLocaleString()}</td>
                            </tr>
                        `).join('')}
                            </tbody>
                        </table>
                        `}
                    </div>
                    <div class="card" style="flex:1; min-width:300px;">
                        <h3><i class="fas fa-users"></i> ${t('analytics', 'top_customers')}</h3>
                        ${topCustomers.length === 0 ? `<p class="text-muted">${t('common', 'no_data')}</p>` : `
                        <table class="table">
                            <thead>
                                <tr><th>${t('common', 'rank')}</th><th>${t('customers', 'name')}</th><th>${t('orders', 'quantity')}</th><th>${t('analytics', 'sales')}</th></tr>
                            </thead>
                            <tbody>
                        ${topCustomers.map((c, i) => `
                            <tr>
                                <td><span class="badge badge-${i < 3 ? 'vip' : 'pending'}">${i + 1}</span></td>
                                <td>${c.name}</td>
                                <td>${c.count}건</td>
                                <td class="font-bold">${c.sales.toLocaleString()}</td>
                            </tr>
                        `).join('')}
                            </tbody>
                        </table>
                        `}
                    </div>
                </div>
            </div>
        `;
        setTimeout(() => this.renderChart(filteredOrders), 100);
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

    setPeriod(p) {
        this.state.period = p;
        App.render();
    },

    getTopProducts(orders, products) {
        const map = {};
        orders.forEach(o => {
            if (!map[o.product_id]) {
                const p = products.find(x => x.id === o.product_id);
                map[o.product_id] = { name: p?.original_title || '-', quantity: 0, sales: 0 };
            }
            map[o.product_id].quantity += o.quantity || 0;
            map[o.product_id].sales += (o.selling_price || 0) * (o.quantity || 0);
        });
        return Object.values(map).sort((a, b) => b.sales - a.sales).slice(0, 10);
    },

    getTopCustomers(orders) {
        const customers = DB.getCustomers();
        const map = {};
        orders.forEach(o => {
            if (!map[o.customer_id]) {
                const c = customers.find(x => x.id === o.customer_id);
                map[o.customer_id] = { name: c?.name || '-', count: 0, sales: 0 };
            }
            map[o.customer_id].count++;
            map[o.customer_id].sales += (o.selling_price || 0) * (o.quantity || 0);
        });
        return Object.values(map).sort((a, b) => b.sales - a.sales).slice(0, 10);
    },

    renderChart(orders) {
        const canvas = document.getElementById('salesChart');
        if (!canvas || typeof Chart === 'undefined') return;
        if (window.analyticsChart) {
            window.analyticsChart.destroy();
        }
        let labels = [];
        let salesData = [];
        let profitData = [];
        if (this.state.period === 'month') {
            const daysInMonth = new Date(this.state.year, this.state.month, 0).getDate();
            for (let d = 1; d <= daysInMonth; d++) {
                labels.push(`${d}${t('common', 'day_suffix')}`);
                const dayOrders = orders.filter(o => {
                    const dt = new Date(o.order_date || o.created_at);
                    return dt.getDate() === d;
                });
                salesData.push(dayOrders.reduce((s, o) => s + (o.selling_price || 0) * (o.quantity || 0), 0));
                profitData.push(dayOrders.reduce((s, o) => s + (o.actual_profit || 0), 0));
            }
        } else {
            for (let m = 1; m <= 12; m++) {
                labels.push(`${m}${t('common', 'month_suffix')}`);
                const mOrders = orders.filter(o => {
                    const dt = new Date(o.order_date || o.created_at);
                    return (dt.getMonth() + 1) === m;
                });
                salesData.push(mOrders.reduce((s, o) => s + (o.selling_price || 0) * (o.quantity || 0), 0));
                profitData.push(mOrders.reduce((s, o) => s + (o.actual_profit || 0), 0));
            }
        }
        window.analyticsChart = new Chart(canvas, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: t('analytics', 'sales'),
                        data: salesData,
                        borderColor: '#8b5cf6',
                        backgroundColor: 'rgba(139, 92, 246, 0.1)',
                        fill: true,
                        tension: 0.3
                    },
                    {
                        label: t('analytics', 'profit'),
                        data: profitData,
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        fill: true,
                        tension: 0.3
                    }
                ]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'top' }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: value => value.toLocaleString()
                        }
                    }
                }
            }
        });
    }
};
