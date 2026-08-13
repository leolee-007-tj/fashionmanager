const Analytics = {
    state: {
        year: new Date().getFullYear(),
        liveExchangeRate: null,
        liveRateUpdatedAt: null,
        orders: null,
        products: null,
        expenses: null,
        settings: null
    },

    _isRemoteMode() {
        try {
            const ds = DB.getOrdersDataSource();
            return ds && ds.name === 'SupabaseOrdersDataSource';
        } catch (e) {
            return false;
        }
    },

    async _loadAnalyticsData() {
        if (this._isRemoteMode()) {
            // Remote analytics must never inherit stale browser sales/expenses.
            // Keep clearing these two legacy stores because older cached builds or
            // imports can recreate them after the original one-time cleanup ran.
            // Preserve products, customers, settings, authentication and all
            // unrelated keys.
            DB.setOrders([]);
            DB.setExpenses([]);
            localStorage.setItem('lesoul_gh_remote_analytics_cleanup_v2', 'done');
            const client = window.LESOULSupabase && window.LESOULSupabase.getClient();
            const storeId = window.LESOULAppBootstrap?.getContext?.()?.activeMembership?.storeId;
            const [orders, products, expenseResult, settingsResult] = await Promise.all([
                DB.getOrdersAsync(),
                DB.getProductsAsync(),
                client && storeId ? client.from('expenses').select('*').eq('store_id', storeId).is('deleted_at', null) : Promise.resolve({ data: [] }),
                client && storeId ? client.from('store_settings').select('*').eq('store_id', storeId).limit(1) : Promise.resolve({ data: [] })
            ]);
            this.state.orders = Array.isArray(orders) ? orders : [];
            this.state.products = Array.isArray(products) ? products : [];
            if (expenseResult.error) throw new Error(expenseResult.error.message || '경비 조회 실패');
            if (settingsResult.error) throw new Error(settingsResult.error.message || '설정 조회 실패');
            this.state.expenses = expenseResult.data || [];
            this.state.settings = settingsResult.data?.[0] || null;
            return;
        }
        this.state.orders = DB.getOrders();
        this.state.products = DB.getProducts();
        this.state.expenses = DB.getExpenses();
        this.state.settings = DB.getSettings();
    },

    _getSettings() {
        try {
            return this.state.settings || DB.getSettings() || { exchange_divisor: 165, price_multiplier: 3, fixed_addition: 40 };
        } catch (e) {
            return { exchange_divisor: 165, price_multiplier: 3, fixed_addition: 40 };
        }
    },

    // 오늘 현재 환율을 인터넷에서 가져옴 (계산용 설정환율과 별도)
    async _fetchLiveExchangeRate() {
        if (this.state.liveExchangeRate) return this.state.liveExchangeRate;
        try {
            // exchangerate-api.com 무료 API (KRW/CNY)
            const resp = await fetch('https://open.er-api.com/v6/latest/CNY');
            if (resp.ok) {
                const data = await resp.json();
                if (data && data.rates && data.rates.KRW) {
                    this.state.liveExchangeRate = data.rates.KRW;
                    this.state.liveRateUpdatedAt = new Date();
                    return this.state.liveExchangeRate;
                }
            }
        } catch (e) {
            console.warn('환율 가져오기 실패:', e);
        }
        // 실패 시 최근 캐시 또는 기본값
        const cached = localStorage.getItem('lesoul_gh_live_rate');
        if (cached) {
            try {
                const obj = JSON.parse(cached);
                this.state.liveExchangeRate = obj.rate;
                this.state.liveRateUpdatedAt = new Date(obj.updated);
                return obj.rate;
            } catch (e) {}
        }
        return 195; // 1 CNY = 195 KRW 기본값
    },

    async _ensureRate() {
        await this._fetchLiveExchangeRate();
        if (this.state.liveExchangeRate) {
            localStorage.setItem('lesoul_gh_live_rate', JSON.stringify({
                rate: this.state.liveExchangeRate,
                updated: this.state.liveRateUpdatedAt ? this.state.liveRateUpdatedAt.toISOString() : new Date().toISOString()
            }));
        }
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

    _getOrderDate(order) {
        return order.ship_date || order.order_date || order.created_at;
    },

    _getOrderCost(order, products, exchangeDivisor) {
        const product = products.find(p =>
            String(p.remote_id || '') === String(order.product_uuid || '') ||
            String(p.id || '') === String(order.product_id || '') ||
            String(p.legacy_id || '') === String(order.product_id || '')
        );
        const divisor = Number(exchangeDivisor) > 0 ? Number(exchangeDivisor) : 165;
        if (product && Number(product.korea_cost) > 0) {
            return Number(product.korea_cost) / divisor;
        }
        if (order.actual_converted_cost_at_sale !== undefined && order.actual_converted_cost_at_sale !== null && order.actual_converted_cost_at_sale !== '') {
            return order.actual_converted_cost_at_sale;
        }
        if (order.china_cost_at_sale !== undefined && order.china_cost_at_sale !== null && order.china_cost_at_sale !== '') {
            return order.china_cost_at_sale;
        }
        if (product) {
            return (product.actual_converted_cost != null) ? product.actual_converted_cost : 0;
        }
        return 0;
    },

    _getShippedOrders() {
        const orders = Array.isArray(this.state.orders) ? this.state.orders : DB.getOrders();
        return orders.filter(o => o.status === 'SHIPPED' || o.status === 'COMPLETED');
    },

    calculateMonthlyStats(year) {
        const allOrders = this._getShippedOrders();
        const products = Array.isArray(this.state.products) ? this.state.products : DB.getProducts();
        const expenses = Array.isArray(this.state.expenses) ? this.state.expenses : DB.getExpenses();
        const exchangeDivisor = Number(this._getSettings().exchange_divisor) || 165;
        const stats = [];

        for (let month = 1; month <= 12; month++) {
            const orders = allOrders.filter(o => {
                const ym = this._extractYearMonth(this._getOrderDate(o));
                if (!ym) return false;
                return ym.year === year && ym.month === month;
            });

            const totalQuantity = orders.reduce((s, o) => s + (o.quantity || 0), 0);
            const totalRevenue = orders.reduce((s, o) => s + (o.selling_price || 0) * (o.quantity || 0), 0);
            const totalCost = orders.reduce((s, o) => s + this._getOrderCost(o, products, exchangeDivisor) * (o.quantity || 0), 0);
            const profit = totalRevenue - totalCost;
            const costRatio = totalRevenue > 0 ? (totalCost / totalRevenue * 100) : 0;
            const profitMargin = totalRevenue > 0 ? (profit / totalRevenue * 100) : 0;

            // 해당 월의 경비 합산
            const monthExpenses = expenses.filter(e => {
                const ym = this._extractYearMonth(e.expense_date);
                return ym && ym.year === year && ym.month === month;
            });
            const totalExpense = monthExpenses.reduce((s, e) => {
                // Flask MonthlyExpense.total_expense 와 동일한 계산
                if (e.amount !== null && e.amount !== undefined && e.amount !== '') return s + (Number(e.amount) || 0);
                const sum = (e.logistics_cost || e.logistics || 0) + 
                            (e.flight_cost || e.flight || 0) + 
                            (e.hotel_cost || e.hotel || 0) + 
                            (e.stay_cost || e.stay || 0) + 
                            (e.electricity_cost || e.electricity || 0) + 
                            (e.rent_cost || 0) + 
                            (e.other_cost || e.other || 0);
                return s + sum;
            }, 0);

            const netProfit = profit - totalExpense;
            const netProfitMargin = totalRevenue > 0 ? (netProfit / totalRevenue * 100) : 0;

            stats.push({
                month: month,
                month_name: month + '월',
                order_count: orders.length,
                total_quantity: totalQuantity,
                total_revenue: totalRevenue,
                total_cost: totalCost,
                profit: profit,
                cost_ratio: costRatio,
                profit_margin: profitMargin,
                total_expense: totalExpense,
                net_profit: netProfit,
                net_profit_margin: netProfitMargin
            });
        }

        return stats;
    },

    calculateAnnualStats(year, monthlyStats) {
        const annual = {
            order_count: 0,
            total_quantity: 0,
            total_revenue: 0,
            total_cost: 0,
            profit: 0,
            total_expense: 0,
            net_profit: 0,
            cost_ratio: 0,
            profit_margin: 0,
            net_profit_margin: 0
        };
        monthlyStats.forEach(m => {
            annual.order_count += m.order_count;
            annual.total_quantity += m.total_quantity;
            annual.total_revenue += m.total_revenue;
            annual.total_cost += m.total_cost;
            annual.total_expense += m.total_expense;
        });
        annual.profit = annual.total_revenue - annual.total_cost;
        annual.net_profit = annual.profit - annual.total_expense;
        annual.cost_ratio = annual.total_revenue > 0 ? (annual.total_cost / annual.total_revenue * 100) : 0;
        annual.profit_margin = annual.total_revenue > 0 ? (annual.profit / annual.total_revenue * 100) : 0;
        annual.net_profit_margin = annual.total_revenue > 0 ? (annual.net_profit / annual.total_revenue * 100) : 0;
        return annual;
    },

    getBrandRanking(year) {
        const allOrders = this._getShippedOrders();
        const products = Array.isArray(this.state.products) ? this.state.products : DB.getProducts();
        const orders = allOrders.filter(o => {
            const ym = this._extractYearMonth(this._getOrderDate(o));
            return ym && ym.year === year;
        });
        const map = {};
        orders.forEach(o => {
            const brand = o.brand || '';
            if (!brand) return;
            if (!map[brand]) map[brand] = { brand: brand, quantity: 0, revenue: 0, cost: 0, profit: 0 };
            map[brand].quantity += o.quantity || 0;
            map[brand].revenue += (o.selling_price || 0) * (o.quantity || 0);
            map[brand].cost += this._getOrderCost(o, products) * (o.quantity || 0);
        });
        Object.values(map).forEach(b => { b.profit = b.revenue - b.cost; });
        return Object.values(map).sort((a, b) => b.profit - a.profit);
    },

    getProductRanking(year) {
        const allOrders = this._getShippedOrders();
        const products = Array.isArray(this.state.products) ? this.state.products : DB.getProducts();
        const orders = allOrders.filter(o => {
            const ym = this._extractYearMonth(this._getOrderDate(o));
            return ym && ym.year === year;
        });
        const map = {};
        orders.forEach(o => {
            const pid = o.product_id || 0;
            const p = products.find(x =>
                String(x.remote_id || '') === String(pid) ||
                String(x.id || '') === String(pid) ||
                String(x.legacy_id || '') === String(pid)
            );
            const category = String(o.category || o.category_snapshot || p?.category || '미분류').trim() || '미분류';
            if (!map[category]) map[category] = { title: category, quantity: 0, revenue: 0 };
            map[category].quantity += o.quantity || 0;
            map[category].revenue += (o.selling_price || 0) * (o.quantity || 0);
        });
        return Object.values(map).sort((a, b) => b.quantity - a.quantity);
    },

    getCustomerRanking(year) {
        const allOrders = this._getShippedOrders();
        const orders = allOrders.filter(o => {
            const ym = this._extractYearMonth(this._getOrderDate(o));
            return ym && ym.year === year;
        });
        const map = {};
        orders.forEach(o => {
            const name = String(o.customer_name || o.customer_name_snapshot || '미확인').trim() || '미확인';
            const key = name.toLowerCase();
            if (!map[key]) map[key] = { name, quantity: 0, amount: 0, order_count: 0 };
            map[key].quantity += o.quantity || 0;
            map[key].amount += (o.selling_price || 0) * (o.quantity || 0);
            map[key].order_count += 1;
        });
        return Object.values(map).sort((a, b) => b.quantity - a.quantity || b.amount - a.amount);
    },

    async renderAsync() {
        await this._loadAnalyticsData();
        await this._ensureRate();
        return this.render();
    },

    render() {
        const year = this.state.year;
        const monthlyStats = this.calculateMonthlyStats(year);
        const annualStats = this.calculateAnnualStats(year, monthlyStats);
        const brandRanking = this.getBrandRanking(year);
        const productRanking = this.getProductRanking(year);
        const customerRanking = this.getCustomerRanking(year);
        const settings = this._getSettings();
        // 계산용 설정 환율 (중국 원가 환산에 사용)
        const calcExchangeDivisor = settings.exchange_divisor || 165;
        // 표시용 라이브 환율 (오늘 현재 인터넷 환율)
        const liveRate = this.state.liveExchangeRate || 195;
        const rateDate = this.state.liveRateUpdatedAt;

        const fmtCN = n => Math.round(n || 0).toLocaleString();
        const fmtKR = n => Math.round((n || 0) * liveRate).toLocaleString();
        const fmtPct = n => Math.round(n || 0).toString();
        const currency = t('common', 'currency');
        const currencyKR = t('common', 'currency_kr');

        let html = `
            <div class="card">
                <div class="action-bar">
                    <div class="action-bar-left">
                        <h2><i class="fas fa-chart-line"></i> ${t('analytics', 'title')}</h2>
                    </div>
                    <div class="action-bar-right">
                        <form class="d-flex gap-2" onsubmit="return false;">
                            <select class="form-control" onchange="Analytics.setYear(this.value)" style="width:120px;">
                                ${this.yearOptions()}
                            </select>
                        </form>
                    </div>
                </div>

                <h3 class="mb-3"><i class="fas fa-calendar-alt"></i> ${year}${t('common', 'year_suffix')} ${t('analytics', 'annual')}</h3>

                <!-- 연간 요약 카드 (2줄 배치) -->
                <!-- 첫째 줄: 매출액 / 매출이익 / 순이익 -->
                <div class="form-row" style="gap:0.75rem;">
                    <div class="form-group" style="flex:1;">
                        <div class="info-box" style="background:#e3f2fd; text-align:center; padding:1rem; border-radius:8px;">
                            <h4 style="color:#1565c0; margin-bottom:0.5rem;">${t('analytics', 'revenue')}</h4>
                            <h2 style="color:#1565c0; margin:0;">${fmtCN(annualStats.total_revenue)} ${currency}</h2>
                            <p style="color:#666; margin:0.5rem 0 0; font-size:13px;">
                                <span style="color:#888;">${t('analytics', 'korea_price')}: </span>
                                <strong>${fmtKR(annualStats.total_revenue)} ${currencyKR}</strong>
                            </p>
                            <p style="color:#666; margin:0.25rem 0 0; font-size:12px;">${t('analytics', 'sales_quantity')}: ${annualStats.total_quantity}${t('common', 'pieces')}</p>
                        </div>
                    </div>
                    <div class="form-group" style="flex:1;">
                        <div class="info-box" style="background:#e8f5e9; text-align:center; padding:1rem; border-radius:8px;">
                            <h4 style="color:#2e7d32; margin-bottom:0.5rem;">${t('analytics', 'profit')}</h4>
                            <h2 style="color:#2e7d32; margin:0;">${fmtCN(annualStats.profit)} ${currency}</h2>
                            <p style="color:#666; margin:0.5rem 0 0; font-size:13px;">
                                <span style="color:#888;">${t('analytics', 'korea_price')}: </span>
                                <strong>${fmtKR(annualStats.profit)} ${currencyKR}</strong>
                            </p>
                            <p style="color:#666; margin:0.25rem 0 0; font-size:12px;">${t('analytics', 'profit_margin')}: ${fmtPct(annualStats.profit_margin)}%</p>
                        </div>
                    </div>
                    <div class="form-group" style="flex:1;">
                        <div class="info-box" style="background:#f3e5f5; text-align:center; padding:1rem; border-radius:8px;">
                            <h4 style="color:#6a1b9a; margin-bottom:0.5rem;">${t('analytics', 'net_profit')}</h4>
                            <h2 style="color:${annualStats.net_profit >= 0 ? '#2e7d32' : '#c62828'}; margin:0;">${fmtCN(annualStats.net_profit)} ${currency}</h2>
                            <p style="color:#666; margin:0.5rem 0 0; font-size:13px;">
                                <span style="color:#888;">${t('analytics', 'korea_price')}: </span>
                                <strong style="color:${annualStats.net_profit >= 0 ? '#2e7d32' : '#c62828'};">${fmtKR(annualStats.net_profit)} ${currencyKR}</strong>
                            </p>
                            <p style="color:#666; margin:0.25rem 0 0; font-size:12px;">${t('analytics', 'net_profit_margin')}: ${fmtPct(annualStats.net_profit_margin)}%</p>
                        </div>
                    </div>
                </div>
                <!-- 둘째 줄: 원가 / 경비 -->
                <div class="form-row" style="gap:0.75rem; margin-top:0.75rem;">
                    <div class="form-group" style="flex:1;">
                        <div class="info-box" style="background:#fff3e0; text-align:center; padding:1rem; border-radius:8px;">
                            <h4 style="color:#e65100; margin-bottom:0.5rem;">${t('analytics', 'cost')}</h4>
                            <h2 style="color:#e65100; margin:0;">${fmtCN(annualStats.total_cost)} ${currency}</h2>
                            <p style="color:#666; margin:0.5rem 0 0; font-size:13px;">
                                <span style="color:#888;">${t('analytics', 'korea_price')}: </span>
                                <strong>${fmtKR(annualStats.total_cost)} ${currencyKR}</strong>
                            </p>
                            <p style="color:#666; margin:0.25rem 0 0; font-size:12px;">${t('analytics', 'cost_ratio')}: ${fmtPct(annualStats.cost_ratio)}%</p>
                        </div>
                    </div>
                    <div class="form-group" style="flex:1;">
                        <div class="info-box" style="background:#fce4ec; text-align:center; padding:1rem; border-radius:8px;">
                            <h4 style="color:#c2185b; margin-bottom:0.5rem;">${t('analytics', 'expense')}</h4>
                            <h2 style="color:#c2185b; margin:0;">${fmtCN(annualStats.total_expense)} ${currency}</h2>
                            <p style="color:#666; margin:0.5rem 0 0; font-size:13px;">
                                <span style="color:#888;">${t('analytics', 'korea_price')}: </span>
                                <strong>${fmtKR(annualStats.total_expense)} ${currencyKR}</strong>
                            </p>
                            <p style="color:#666; margin:0.25rem 0 0; font-size:12px;">${t('expenses', 'title')}</p>
                        </div>
                    </div>
                </div>
                <p class="text-muted text-right" style="font-size:12px; margin-top:0.5rem;">
                    <i class="fas fa-info-circle"></i> ${t('analytics', 'korea_price')}: ${t('analytics', 'exchange_info')}
                    (1 CNY ≈ ${liveRate.toFixed(2)} KRW${rateDate ? ' / ' + rateDate.toLocaleString(currentLang === 'ko' ? 'ko-KR' : 'en-US') : ''})
                </p>

                <!-- 그래프: 월별 매출/이익 -->
                <div class="card mt-4" style="box-shadow:none; border:1px solid #e9ecef;">
                    <h3 class="mb-3"><i class="fas fa-chart-bar"></i> ${t('analytics', 'monthly_trend')}</h3>
                    <canvas id="revenueChart" height="100"></canvas>
                </div>

                <!-- 그래프: 월별 이익률 -->
                <div class="card mt-4" style="box-shadow:none; border:1px solid #e9ecef;">
                    <h3 class="mb-3"><i class="fas fa-chart-line"></i> ${t('analytics', 'monthly')} ${t('analytics', 'net_profit_margin')}</h3>
                    <canvas id="profitMarginChart" height="100"></canvas>
                </div>

                <!-- 월별 상세 테이블 -->
                <div class="card mt-4">
                    <h3 class="mb-3"><i class="fas fa-table"></i> ${t('analytics', 'monthly')} ${t('analytics', 'detail_stats')}</h3>
                    <div style="overflow-x:auto;">
                    <table class="table">
                        <thead>
                            <tr>
                                <th>${t('analytics', 'month')}</th>
                                <th class="text-center">${t('analytics', 'order_count')}</th>
                                <th class="text-center">${t('analytics', 'sales_quantity')}</th>
                                <th class="text-right">${t('analytics', 'revenue')}</th>
                                <th class="text-right">${t('analytics', 'cost')}</th>
                                <th class="text-right">${t('analytics', 'profit')}</th>
                                <th class="text-right">${t('analytics', 'expense')}</th>
                                <th class="text-right"><strong>${t('analytics', 'net_profit')}</strong></th>
                                <th class="text-right">${t('analytics', 'cost_ratio')}</th>
                                <th class="text-right">${t('analytics', 'net_profit_margin')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${monthlyStats.map(stat => `
                            <tr>
                                <td><strong>${stat.month_name}</strong></td>
                                <td class="text-center">${stat.order_count}</td>
                                <td class="text-center">${stat.total_quantity}${t('common', 'pieces')}</td>
                                <td class="text-right">${fmtCN(stat.total_revenue)} ${currency}</td>
                                <td class="text-right">${fmtCN(stat.total_cost)} ${currency}</td>
                                <td class="text-right" style="color:${stat.profit > 0 ? '#28a745' : '#dc3545'};">
                                    ${fmtCN(stat.profit)} ${currency}
                                </td>
                                <td class="text-right" style="color:#c2185b;">${fmtCN(stat.total_expense)} ${currency}</td>
                                <td class="text-right">
                                    <strong style="color:${stat.net_profit >= 0 ? '#28a745' : '#dc3545'};">
                                        ${fmtCN(stat.net_profit)} ${currency}
                                    </strong>
                                </td>
                                <td class="text-right">${fmtPct(stat.cost_ratio)}%</td>
                                <td class="text-right" style="color:${stat.net_profit_margin > 0 ? '#28a745' : '#dc3545'};">
                                    ${fmtPct(stat.net_profit_margin)}%
                                </td>
                            </tr>
                            `).join('')}
                        </tbody>
                        <tfoot style="background:#f8f9fa; font-weight:bold;">
                            <tr>
                                <td>${t('common', 'all')}</td>
                                <td class="text-center">${annualStats.order_count}${t('common', 'count_suffix')}</td>
                                <td class="text-center">${annualStats.total_quantity}${t('common', 'pieces')}</td>
                                <td class="text-right">${fmtCN(annualStats.total_revenue)} ${currency}</td>
                                <td class="text-right">${fmtCN(annualStats.total_cost)} ${currency}</td>
                                <td class="text-right" style="color:#28a745;">${fmtCN(annualStats.profit)} ${currency}</td>
                                <td class="text-right" style="color:#c2185b;">${fmtCN(annualStats.total_expense)} ${currency}</td>
                                <td class="text-right">
                                    <strong style="color:${annualStats.net_profit >= 0 ? '#28a745' : '#dc3545'};">
                                        ${fmtCN(annualStats.net_profit)} ${currency}
                                    </strong>
                                </td>
                                <td class="text-right">${fmtPct(annualStats.cost_ratio)}%</td>
                                <td class="text-right" style="color:#28a745;">${fmtPct(annualStats.net_profit_margin)}%</td>
                            </tr>
                        </tfoot>
                    </table>
                    </div>
                </div>

                <!-- 브랜드/상품/고객 순위 -->
                <div class="form-row" style="gap:1rem; flex-wrap:wrap; margin-top:1.5rem;">
                    <div class="form-group" style="flex:1; min-width:300px;">
                        <div class="card" style="box-shadow:none; border:1px solid #e9ecef;">
                            <h3 class="mb-3"><i class="fas fa-tags"></i> ${t('analytics', 'brand_ranking')}</h3>
                            ${brandRanking.length === 0 ? `<p class="text-muted">${t('common', 'no_data')}</p>` : `
                            <table class="table">
                                <thead>
                                    <tr>
                                        <th>${t('common', 'rank')}</th>
                                        <th>${t('products', 'brand')}</th>
                                        <th class="text-right">${t('orders', 'quantity')}</th>
                                        <th class="text-right">${t('analytics', 'revenue')}</th>
                                        <th class="text-right">${t('analytics', 'profit')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                ${brandRanking.slice(0, 5).map((b, i) => `
                                    <tr>
                                        <td>
                                            ${i === 0 ? '<span class="badge badge-completed">1위</span>' :
                                              i === 1 ? '<span class="badge badge-shipped">2위</span>' :
                                              i === 2 ? '<span class="badge badge-pending">3위</span>' :
                                              (i + 1) + '위'}
                                        </td>
                                        <td><strong>${b.brand}</strong></td>
                                        <td class="text-right">${b.quantity}</td>
                                        <td class="text-right">${fmtCN(b.revenue)}</td>
                                        <td class="text-right" style="color:#28a745;">${fmtCN(b.profit)}</td>
                                    </tr>
                                `).join('')}
                                </tbody>
                            </table>
                            `}
                        </div>
                    </div>

                    <div class="form-group" style="flex:1; min-width:300px;">
                        <div class="card" style="box-shadow:none; border:1px solid #e9ecef;">
                            <h3 class="mb-3"><i class="fas fa-box"></i> 종류별 판매 순위</h3>
                            ${productRanking.length === 0 ? `<p class="text-muted">${t('common', 'no_data')}</p>` : `
                            <table class="table">
                                <thead>
                                    <tr>
                                        <th>${t('common', 'rank')}</th>
                                        <th>종류</th>
                                        <th class="text-right">${t('orders', 'quantity')}</th>
                                        <th class="text-right">${t('analytics', 'revenue')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                ${productRanking.slice(0, 5).map((p, i) => `
                                    <tr>
                                        <td>
                                            ${i === 0 ? '<span class="badge badge-completed">1위</span>' :
                                              i === 1 ? '<span class="badge badge-shipped">2위</span>' :
                                              i === 2 ? '<span class="badge badge-pending">3위</span>' :
                                              (i + 1) + '위'}
                                        </td>
                                        <td>${(p.title || '').slice(0, 20)}${(p.title || '').length > 20 ? '...' : ''}</td>
                                        <td class="text-right"><strong>${p.quantity}</strong></td>
                                        <td class="text-right">${fmtCN(p.revenue)}</td>
                                    </tr>
                                `).join('')}
                                </tbody>
                            </table>
                            `}
                        </div>
                    </div>

                    <div class="form-group" style="flex:1; min-width:300px;">
                        <div class="card" style="box-shadow:none; border:1px solid #e9ecef;">
                            <h3 class="mb-3"><i class="fas fa-users"></i> 연간 최다 구매 고객</h3>
                            ${customerRanking.length === 0 ? `<p class="text-muted">${t('common', 'no_data')}</p>` : `
                            <table class="table">
                                <thead>
                                    <tr>
                                        <th>${t('common', 'rank')}</th>
                                        <th>${t('customers', 'name')}</th>
                                        <th class="text-right">${t('orders', 'quantity')}</th>
                                        <th class="text-right">${t('analytics', 'revenue')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                ${customerRanking.slice(0, 5).map((c, i) => `
                                    <tr>
                                        <td>
                                            ${i === 0 ? '<span class="badge badge-completed">1위</span>' :
                                              i === 1 ? '<span class="badge badge-shipped">2위</span>' :
                                              i === 2 ? '<span class="badge badge-pending">3위</span>' :
                                              (i + 1) + '위'}
                                        </td>
                                        <td><strong>${c.name}</strong></td>
                                        <td class="text-right">${c.quantity}${t('common', 'pieces')}</td>
                                        <td class="text-right"><strong>${fmtCN(c.amount)}</strong></td>
                                    </tr>
                                `).join('')}
                                </tbody>
                            </table>
                            `}
                        </div>
                    </div>
                </div>
            </div>
        `;
        setTimeout(() => this.renderCharts(monthlyStats), 100);
        return html;
    },

    yearOptions() {
        let html = '';
        for (let y = 2025; y <= 2030; y++) {
            html += `<option value="${y}" ${this.state.year === y ? 'selected' : ''}>${y}${t('common', 'year_suffix')}</option>`;
        }
        return html;
    },

    setYear(val) {
        this.state.year = parseInt(val);
        App.render();
    },

    renderCharts(monthlyStats) {
        if (typeof Chart === 'undefined') return;

        const months = monthlyStats.map(m => m.month_name);
        const revenues = monthlyStats.map(m => Math.round(m.total_revenue));
        const profits = monthlyStats.map(m => Math.round(m.profit));
        const profitMargins = monthlyStats.map(m => parseFloat(m.net_profit_margin.toFixed(1)));

        // 두 축의 max를 동일하게 설정 (매출이익이 매출액 위로 그려지지 않도록)
        const maxValue = Math.max(...revenues, ...profits, 0);
        const suggestedMax = Math.ceil(maxValue * 1.1);

        // 기존 차트 제거
        if (window._revChart) window._revChart.destroy();
        if (window._pmChart) window._pmChart.destroy();

        // 매출/이익 막대+선 차트
        const ctx1 = document.getElementById('revenueChart');
        if (ctx1) {
            window._revChart = new Chart(ctx1, {
                type: 'bar',
                data: {
                    labels: months,
                    datasets: [
                        {
                            label: t('analytics', 'revenue') + ' (' + t('common', 'currency') + ')',
                            data: revenues,
                            backgroundColor: 'rgba(21, 101, 192, 0.7)',
                            borderColor: 'rgba(21, 101, 192, 1)',
                            borderWidth: 1,
                            order: 2,
                            yAxisID: 'y'
                        },
                        {
                            label: t('analytics', 'profit') + ' (' + t('common', 'currency') + ')',
                            data: profits,
                            backgroundColor: 'rgba(46, 125, 50, 0.7)',
                            borderColor: 'rgba(46, 125, 50, 1)',
                            borderWidth: 2,
                            type: 'line',
                            tension: 0.3,
                            yAxisID: 'y1',
                            order: 1
                        }
                    ]
                },
                options: {
                    responsive: true,
                    interaction: { mode: 'index', intersect: false },
                    scales: {
                        y: {
                            type: 'linear',
                            display: true,
                            position: 'left',
                            beginAtZero: true,
                            suggestedMax: suggestedMax,
                            title: { display: true, text: t('analytics', 'revenue') + ' (' + t('common', 'currency') + ')' },
                            ticks: { callback: v => (v / 10000).toFixed(0) + '만' }
                        },
                        y1: {
                            type: 'linear',
                            display: true,
                            position: 'right',
                            beginAtZero: true,
                            suggestedMax: suggestedMax,
                            title: { display: true, text: t('analytics', 'profit') + ' (' + t('common', 'currency') + ')' },
                            ticks: { callback: v => (v / 10000).toFixed(0) + '만' },
                            grid: { drawOnChartArea: false }
                        }
                    }
                }
            });
        }

        // 이익률 라인 차트
        const ctx2 = document.getElementById('profitMarginChart');
        if (ctx2) {
            window._pmChart = new Chart(ctx2, {
                type: 'line',
                data: {
                    labels: months,
                    datasets: [{
                        label: t('analytics', 'net_profit_margin') + ' (%)',
                        data: profitMargins,
                        borderColor: 'rgba(156, 39, 176, 1)',
                        backgroundColor: 'rgba(156, 39, 176, 0.2)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.3
                    }]
                },
                options: {
                    responsive: true,
                    scales: {
                        y: { beginAtZero: true, max: 100, ticks: { callback: v => v + '%' } }
                    }
                }
            });
        }
    }
};
