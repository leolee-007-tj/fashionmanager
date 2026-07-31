const Orders = {
    state: {
        orders: [],
        filtered: [],
        year: 0,
        month: 0,
        sortBy: 'order_date',
        sortOrder: 'desc',
        selected: new Set(),
        editingOrderId: null,
        cancelledExcluded: true
    },

    /**
     * 주문 action key를 반환한다. remote_id 우선 → legacy_id → id.
     * UUID를 Number로 변환하지 않는다.
     * @param {Object} order
     * @returns {string}
     */
    _getOrderActionKey(order) {
        if (!order) return '';
        return String(order.remote_id || order.legacy_id || order.id || '');
    },

    /**
     * 3-8A.9-A: remote read-only mode 판별.
     * SupabaseOrdersDataSource가 활성화된 경우 true.
     */
    isRemoteOrdersMode() {
        try {
            const ds = DB.getOrdersDataSource();
            return ds && ds.name === 'SupabaseOrdersDataSource';
        } catch (e) {
            return false;
        }
    },

    /**
     * 3-8A.9-A: remote read-only 데이터 로드.
     * orders, products, customers를 async로 가져와 state에 저장한다.
     * mutation 없음.
     */
    async _loadRemoteDataForRender() {
        try {
            const client = LESOULSupabase.getClient();
            const ctx = LESOULAppBootstrap.getContext();
            const storeId = ctx.activeMembership && (ctx.activeMembership.storeId || ctx.activeMembership.store_id);

            const [orders, products, custResult] = await Promise.all([
                DB.getOrdersAsync(),
                DB.getProductsAsync(),
                client.from('customers').select('*').eq('store_id', storeId).is('deleted_at', null)
            ]);

            this.state.orders = orders || [];
            this.state._remoteProducts = products || [];
            this.state._remoteCustomers = (custResult && custResult.data) || [];
            this.applyFilters();
        } catch (e) {
            console.error('Orders remote load failed:', e);
            this.state.orders = [];
            this.state._remoteProducts = [];
            this.state._remoteCustomers = [];
            this.state.filtered = [];
            App.flash('주문 데이터를 불러오지 못했습니다.', 'error');
        }
    },

    load() {
        this.state.orders = DB.getOrders();
        this.applyFilters();
    },

    _parseOrderDate(val) {
        if (!val) return null;
        const s = String(val).trim();
        if (/^\d{4,5}$/.test(s) && Number(s) > 30000 && Number(s) < 70000) {
            const serial = Number(s);
            const utcDays = Math.floor(serial - 25569);
            const d = new Date(utcDays * 86400 * 1000);
            if (!isNaN(d.getTime())) return d;
        }
        const m = s.match(/(\d{4})[\.\-\/年](\d{1,2})[\.\-\/月](\d{1,2})/);
        if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        const d = new Date(s);
        if (!isNaN(d.getTime())) return d;
        return null;
    },

    _extractYearMonth(dateStr) {
        if (!dateStr) return null;
        const s = String(dateStr).trim();
        // 엑셀 일련번호 처리 (예: 45682)
        if (/^\d{4,5}$/.test(s) && Number(s) > 30000 && Number(s) < 70000) {
            const serial = Number(s);
            const utcDays = Math.floor(serial - 25569);
            const d = new Date(utcDays * 86400 * 1000);
            if (!isNaN(d.getTime())) return { year: d.getFullYear(), month: d.getMonth() + 1 };
        }
        const m = s.match(/(\d{4})[\.\-\/年](\d{1,2})/);
        if (m) return { year: Number(m[1]), month: Number(m[2]) };
        const d = new Date(s);
        if (!isNaN(d.getTime())) return { year: d.getFullYear(), month: d.getMonth() + 1 };
        return null;
    },

    _formatOrderDate(val) {
        if (!val) return '';
        const s = String(val).trim();
        // 엑셀 일련번호 처리
        if (/^\d{4,5}$/.test(s) && Number(s) > 30000 && Number(s) < 70000) {
            const serial = Number(s);
            const utcDays = Math.floor(serial - 25569);
            const d = new Date(utcDays * 86400 * 1000);
            if (!isNaN(d.getTime())) return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        }
        const d = new Date(val);
        if (!isNaN(d.getTime())) return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        const m = s.match(/(\d{4})[\.\-\/年](\d{1,2})[\.\-\/月](\d{1,2})/);
        if (m) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
        return s;
    },

    applyFilters() {
        let list = [...this.state.orders];
        // CANCELLED 제외 (기본 정책)
        if (this.state.cancelledExcluded) {
            list = list.filter(o => o.status !== 'CANCELLED');
        }
        if (this.state.year) {
            list = list.filter(o => {
                const ym = this._extractYearMonth(o.order_date || o.created_at);
                if (!ym) return false;
                if (this.state.month > 0) {
                    return ym.year === this.state.year && ym.month === this.state.month;
                }
                return ym.year === this.state.year;
            });
        }
        list.sort((a, b) => {
            let av = a[this.state.sortBy];
            let bv = b[this.state.sortBy];
            if (this.state.sortBy === 'order_date') {
                const dateA = this._parseOrderDate(a.order_date || a.created_at);
                const dateB = this._parseOrderDate(b.order_date || b.created_at);
                av = dateA ? dateA.getTime() : 0;
                bv = dateB ? dateB.getTime() : 0;
            }
            if (this.state.sortOrder === 'asc') {
                return av > bv ? 1 : -1;
            }
            return av < bv ? 1 : -1;
        });
        this.state.filtered = list;
    },

    /**
     * 3-8A.9-A: read-only list rendering. remote mode에서는 async로 데이터를 로드한 후
     * _renderListBody를 호출한다. local mode는 기존 sync 흐름 유지.
     */
    async renderList() {
        if (this.isRemoteOrdersMode()) {
            await this._loadRemoteDataForRender();
            return this._renderListBody(this.state._remoteProducts || [], this.state._remoteCustomers || []);
        }
        // local mode — 기존 sync 흐름
        this.load();
        return this._renderListBody(DB.getProducts(), DB.getCustomers());
    },

    /**
     * 3-8A.9-A: renderList의 HTML 생성 로직을 products/customers를 인자로 받도록 분리.
     * mutation 없음. DB.write API 호출 금지.
     */
    _renderListBody(products, customers) {
        const list = this.state.filtered;
        const totalQty = list.reduce((s, o) => s + (o.quantity || 0), 0);
        const totalAmt = list.reduce((s, o) => s + ((o.selling_price || 0) * (o.quantity || 0)), 0);
        const statusLabels = {
            PENDING: ['pending', 'badge-pending'],
            SHIPPED: ['shipped', 'badge-shipped'],
            COMPLETED: ['completed', 'badge-completed'],
            CANCELLED: ['cancelled', 'badge-cancelled']
        };

        const filterText = this.state.year > 0 && this.state.month > 0 ? `${this.state.year}년 ${this.state.month}월`
            : this.state.year > 0 ? `${this.state.year}년` : '전체';

        let html = `
            <div class="card">
                <div class="action-bar">
                    <div class="action-bar-left">
                        <h2><i class="fas fa-shopping-cart"></i> ${t('orders', 'title')}</h2>
                    </div>
                    <div class="action-bar-right">
                        <a href="#/smart-import?target=sales" class="btn btn-outline-primary">
                            <i class="fas fa-upload"></i> ${t('excel', 'smart_import_short') || '가져오기'}
                        </a>
                        <button class="btn btn-secondary" onclick="Orders.selectDuplicates()">
                            <i class="fas fa-copy"></i> ${t('orders', 'select_duplicates')}
                        </button>
                        <a href="#/orders/add" class="btn btn-primary"><i class="fas fa-plus"></i> ${t('orders', 'add')}</a>
                    </div>
                </div>
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-label">${t('orders', 'total_quantity')}</div>
                        <div class="stat-value">${totalQty.toLocaleString()}</div>
                        <i class="fas fa-shopping-bag stat-icon"></i>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">${t('orders', 'total_amount')}</div>
                        <div class="stat-value">${totalAmt.toLocaleString()}</div>
                        <i class="fas fa-won-sign stat-icon"></i>
                    </div>
                </div>
                <div class="text-muted" style="font-size:0.7rem; margin-bottom:0.5rem;">
                    표시 ${list.length}건 / 전체 ${this.state.orders.length}건 · 현재 필터: ${filterText}${this.state.cancelledExcluded ? ' · 취소 제외' : ''}
                </div>
                <div class="filter-row">
                    <div class="form-group">
                        <label>${t('common', 'year') || '년도'}</label>
                        <select class="form-control" onchange="Orders.setYear(this.value)">
                            ${this.yearOptions()}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>${t('common', 'month') || '월'}</label>
                        <select class="form-control" onchange="Orders.setMonth(this.value)">
                            ${this.monthOptions()}
                        </select>
                    </div>
                </div>
                <div class="action-bar">
                    <div class="action-bar-left">
                        <button class="btn btn-sm btn-danger" onclick="Orders.batchDelete()">
                            <i class="fas fa-trash"></i> ${t('products', 'delete')}
                        </button>
                    </div>
                </div>
        `;
        if (list.length === 0) {
            html += `<div class="empty-state"><i class="fas fa-shopping-cart"></i><p>${t('common', 'no_data')}</p></div>`;
        } else {
            html += `
                <div style="overflow-x:auto;">
                <table class="table">
                    <thead>
                        <tr>
                            <th style="width:40px;"><input type="checkbox" class="select-all-cb" data-target="orders" ${list.length > 0 && list.every(o => this.state.selected.has(this._getOrderActionKey(o))) ? 'checked' : ''}></th>
                            <th onclick="Orders.sort('order_date')" class="${this.state.sortBy === 'order_date' ? 'sort-active' : ''}">
                                ${t('orders', 'sale_date')}
                                <i class="fas fa-sort-${this.state.sortOrder === 'asc' ? 'up' : 'down'}"></i>
                            </th>
                            <th>${t('orders', 'customer')}</th>
                            <th>${t('products', 'brand')}</th>
                            <th>${t('orders', 'product')}</th>
                            <th onclick="Orders.sort('selling_price')" class="${this.state.sortBy === 'selling_price' ? 'sort-active' : ''}">
                                ${t('orders', 'selling_price')}
                                <i class="fas fa-sort-${this.state.sortOrder === 'asc' ? 'up' : 'down'}"></i>
                            </th>
                            <th>${t('common', 'status')}</th>
                            <th>${t('common', 'action')}</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            list.forEach(o => {
                const product = products.find(p => p.id === o.product_id || p.remote_id === o.product_uuid);
                const customer = customers.find(c => c.id === o.customer_id || c.remote_id === o.customer_uuid);
                const actionKey = this._getOrderActionKey(o);
                const statusLabel = statusLabels[o.status] || ['', ''];
                const isPending = o.status === 'PENDING';
                // PENDING이 아닌 주문은 삭제 버튼 disabled
                const deleteDisabled = !isPending ? 'disabled title="PENDING 상태만 취소 가능"' : '';
                html += `
                    <tr>
                        <td><input type="checkbox" class="row-checkbox" data-id="${actionKey}" data-target="orders" ${this.state.selected.has(actionKey) ? 'checked' : ''}></td>
                        <td>${this._formatOrderDate(o.order_date) || this._formatOrderDate(o.created_at) || '-'}</td>
                        <td>${customer ? customer.name : (o.customer_name || '-')}</td>
                        <td>${product ? product.brand : (o.brand || '-')}</td>
                        <td>${product ? product.original_title : (o.product_name || o.product_title || '-')}</td>
                        <td class="font-bold">${(o.selling_price || 0).toLocaleString()} ${t('common', 'currency')}</td>
                        <td><span class="badge ${statusLabel[1]}">${statusLabel[0]}</span></td>
                        <td>
                            <button class="btn btn-sm btn-secondary" onclick="Orders.editOrder('${actionKey}')"><i class="fas fa-edit"></i></button>
                            <button class="btn btn-sm btn-danger" onclick="Orders.delete('${actionKey}')" ${deleteDisabled}><i class="fas fa-trash"></i></button>
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
        let html = '<option value="0">전체</option>';
        // 데이터 기반 year 옵션
        const dataYears = new Set();
        this.state.orders.forEach(o => {
            const ym = this._extractYearMonth(o.order_date || o.created_at);
            if (ym && ym.year) dataYears.add(ym.year);
        });
        const years = new Set([2025, 2026, 2027, ...dataYears]);
        const sorted = [...years].filter(y => y >= 2025).sort((a, b) => b - a);
        sorted.forEach(y => {
            html += `<option value="${y}" ${this.state.year === y ? 'selected' : ''}>${y}${t('common', 'year_suffix')}</option>`;
        });
        return html;
    },

    monthOptions() {
        let html = `<option value="0" ${this.state.month === 0 ? 'selected' : ''}>${t('common', 'all') || '전체'}</option>`;
        for (let m = 1; m <= 12; m++) {
            html += `<option value="${m}" ${this.state.month === m ? 'selected' : ''}>${m}${t('common', 'month_suffix')}</option>`;
        }
        return html;
    },

    setYear(val) {
        this.state.year = parseInt(val) || 0;
        this.applyFilters();
        App.renderPage();
    },

    setMonth(val) {
        this.state.month = parseInt(val) || 0;
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
        const key = String(id);
        if (this.state.selected.has(key)) {
            this.state.selected.delete(key);
        } else {
            this.state.selected.add(key);
        }
        App.renderPage();
    },

    toggleSelectAll() {
        const visibleKeys = this.state.filtered.map(o => this._getOrderActionKey(o));
        const selectedCount = visibleKeys.filter(k => this.state.selected.has(k)).length;
        if (selectedCount === visibleKeys.length && visibleKeys.length > 0) {
            visibleKeys.forEach(k => this.state.selected.delete(k));
        } else {
            this.state.selected.clear();
            visibleKeys.forEach(k => this.state.selected.add(k));
        }
        App.renderPage();
    },

    batchDelete() {
        if (this.state.selected.size === 0) {
            App.flash(t('common', 'please_select'), 'warning');
            return;
        }
        if (!confirm(this.state.selected.size + t('common', 'confirm_delete_items'))) return;
        // remote mode batch cancel → 각 주문 cancelOrder (hard delete 금지)
        if (this.isRemoteOrdersMode()) {
            return this._batchCancelRemote();
        }
        // local mode — 기존 sync 흐름
        const products = DB.getProducts();
        const orders = DB.getOrders();
        const selectedKeys = [...this.state.selected];
        orders.forEach(o => {
            const key = this._getOrderActionKey(o);
            if (selectedKeys.includes(key) && o.status === 'PENDING') {
                const product = products.find(p => p.id === o.product_id);
                if (product) {
                    product.reserved_stock = Math.max(0, (product.reserved_stock || 0) - (o.quantity || 0));
                }
            }
        });
        DB.setProducts(products);
        const remaining = orders.filter(o => !selectedKeys.includes(this._getOrderActionKey(o)));
        DB.setOrders(remaining);
        this.state.selected.clear();
        App.flash(t('common', 'delete') + '!', 'success');
        App.render();
    },

    /**
     * Remote mode 일괄 취소.
     * 선택된 각 PENDING 주문에 대해 ds.cancelOrder 호출.
     * 실패 시 성공 flash 금지, count 감소는 실제 성공한 건만 반영.
     */
    async _batchCancelRemote() {
        const ds = DB.getOrdersDataSource();
        const orders = this.state.orders || [];
        const selectedKeys = [...this.state.selected];
        const beforeActiveCount = orders.filter(o => o.status !== 'CANCELLED').length;

        let successCount = 0;
        let failCount = 0;
        let skippedAlreadyCancelled = 0;
        let skippedNotPending = 0;
        let invalidIdCount = 0;
        const failReasons = [];
        let fnError = null;

        try {
            for (const key of selectedKeys) {
                const order = orders.find(o =>
                    String(o.remote_id) === key ||
                    String(o.legacy_id) === key ||
                    String(o.id) === key
                );
                if (!order) {
                    invalidIdCount++;
                    failReasons.push('ORDER_NOT_FOUND');
                    continue;
                }

                if (order.status === 'CANCELLED') {
                    skippedAlreadyCancelled++;
                    this.state.selected.delete(key);
                    continue;
                }

                if (order.status !== 'PENDING') {
                    skippedNotPending++;
                    failReasons.push('ORDER_NOT_PENDING');
                    continue;
                }

                const remoteId = order.remote_id;
                if (!remoteId || typeof remoteId !== 'string' || !/^[0-9a-f]{8}-/i.test(remoteId)) {
                    invalidIdCount++;
                    failReasons.push('INVALID_ORDER_REMOTE_ID');
                    continue;
                }

                try {
                    await ds.cancelOrder(remoteId, { notes: 'cancelled from sales list' });
                    successCount++;
                    this.state.selected.delete(key);
                } catch (e) {
                    failCount++;
                    const classifier = ds && typeof ds.classifyCancelOrderError === 'function'
                        ? ds.classifyCancelOrderError(e)
                        : 'UNKNOWN_CANCEL_ORDER_ERROR';
                    failReasons.push(classifier);
                    console.error('Batch cancel order failed:', classifier, {
                        code: e.code || null,
                        status: e.status || null,
                        details: e.details ? String(e.details).slice(0, 120) : null,
                        hint: e.hint ? String(e.hint).slice(0, 120) : null
                    });
                }
            }

            // Reload data
            await this._refreshOrdersAfterRemoteMutation();
        } catch (e) {
            fnError = e;
            console.error('_batchCancelRemote unexpected error:', (e.message || '').slice(0, 100));
        }

        const afterActiveCount = (this.state.orders || []).filter(o => o.status !== 'CANCELLED').length;
        const countDelta = afterActiveCount - beforeActiveCount;
        const countDeltaMatchesSuccess = (beforeActiveCount - afterActiveCount) === successCount;

        // Summary 저장 — 실패 상황에서도 항상 남긴다
        window.__LAST_ORDER_DELETE_SUMMARY = {
            mode: 'remote',
            requestedCount: selectedKeys.length,
            successCount,
            failCount,
            skippedAlreadyCancelled,
            skippedNotPending,
            invalidIdCount,
            beforeActiveCount,
            afterActiveCount,
            countDelta,
            countDeltaMatchesSuccess,
            selectedCountAfter: this.state.selected.size,
            failReasons: failReasons.slice(0, 20),
            fnError: fnError ? (fnError.message || '').slice(0, 100) : null
        };

        if (fnError) {
            App.flash('판매 삭제/취소 중 오류가 발생했습니다.', 'error');
        } else if (successCount > 0 && failCount === 0) {
            App.flash(`${successCount}건 취소 완료!`, 'success');
        } else if (successCount > 0) {
            App.flash(`${successCount}건 취소, ${failCount}건 실패 — 콘솔에서 사유 확인`, 'warning');
        } else if (failCount > 0) {
            App.flash('판매 삭제/취소 실패: 주문 상태 또는 권한/RPC를 확인해야 합니다.', 'error');
        } else {
            App.flash('취소할 주문이 없습니다.', 'info');
        }

        App.renderPage();
    },

    selectDuplicates() {
        const list = this.state.filtered;
        const seen = new Map();
        const dupKeys = [];
        list.forEach(o => {
            const dupKey = String(o.customer_id || '') + '|' + String(o.product_id || '') + '|' + this._formatOrderDate(o.order_date || o.created_at);
            if (seen.has(dupKey)) {
                dupKeys.push(this._getOrderActionKey(o));
            } else {
                seen.set(dupKey, this._getOrderActionKey(o));
            }
        });
        this.state.selected.clear();
        dupKeys.forEach(k => this.state.selected.add(k));
        App.flash(t('orders', 'duplicates_found') + ': ' + dupKeys.length + t('orders', 'items_selected'), dupKeys.length > 0 ? 'info' : 'warning');
        App.renderPage();
    },

    editOrder(actionKey) {
        location.hash = '#/orders/' + encodeURIComponent(actionKey) + '/edit';
    },

    /**
     * 주문 수정 폼 렌더링 (route: #/orders/:id/edit).
     * remote/local 모두 단일 폼으로 처리.
     */
    async renderEdit(id) {
        let order, product, customer;
        if (this.isRemoteOrdersMode()) {
            if (!this.state.orders || this.state.orders.length === 0) {
                await this._loadRemoteDataForRender();
            }
            order = (this.state.orders || []).find(o =>
                String(o.remote_id) === String(id) ||
                String(o.legacy_id) === String(id) ||
                String(o.id) === String(id)
            );
            product = (this.state._remoteProducts || []).find(p =>
                String(p.id) === String(order?.product_id) || p.remote_id === order?.product_uuid
            );
            customer = (this.state._remoteCustomers || []).find(c =>
                String(c.id) === String(order?.customer_id) || c.remote_id === order?.customer_uuid
            );
        } else {
            this.load();
            order = this.state.orders.find(o =>
                String(o.legacy_id) === String(id) ||
                String(o.id) === String(id)
            );
            const products = DB.getProducts();
            const customers = DB.getCustomers();
            product = products.find(p => p.id === order?.product_id);
            customer = customers.find(c => c.id === order?.customer_id);
        }

        if (!order) {
            App.flash(t('orders', 'order_not_found'), 'error');
            location.hash = '#/orders';
            return '';
        }

        const orderDate = this._formatOrderDate(order.order_date) || this._formatOrderDate(order.created_at) || '';
        const isRemote = this.isRemoteOrdersMode();
        const canEdit = !isRemote || order.status === 'PENDING';

        return `
            <div class="card">
                <h2><i class="fas fa-edit"></i> ${t('common', 'edit')}</h2>
                ${!canEdit ? `<div class="info-box" style="background:#fff8e1; border:1px solid #f0ad4e;">
                    <i class="fas fa-exclamation-triangle"></i> PENDING 상태의 주문만 수정할 수 있습니다.
                </div>` : ''}
                <div class="info-box mb-4">
                    <p><strong>${t('orders', 'order_number')}:</strong> #${order.order_number || '-'}</p>
                    <p><strong>${t('orders', 'customer')}:</strong> ${customer?.name || order.customer_name || '-'}</p>
                    <p><strong>${t('orders', 'product')}:</strong> ${product?.original_title || order.product_name || order.product_title || '-'}</p>
                    <p><strong>${t('products', 'brand')}:</strong> ${product?.brand || order.brand || '-'}</p>
                </div>
                <form id="orderEditForm" onsubmit="return Orders.submitEdit(event, '${String(id).replace(/'/g, "\\'")}')">
                    <div class="form-row">
                        <div class="form-group">
                            <label>${t('orders', 'sale_date')}</label>
                            <input type="date" class="form-control" name="order_date" value="${orderDate}" ${canEdit ? '' : 'disabled'}>
                        </div>
                        <div class="form-group">
                            <label>${t('orders', 'selling_price')} (${t('common', 'currency')})</label>
                            <input type="number" class="form-control" name="selling_price" value="${order.selling_price || 0}" min="0" ${canEdit ? '' : 'disabled'}>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>${t('products', 'color')}</label>
                            <input type="text" class="form-control" name="color" value="${order.color || ''}" ${canEdit ? '' : 'disabled'}>
                        </div>
                        <div class="form-group">
                            <label>${t('products', 'size')}</label>
                            <input type="text" class="form-control" name="size" value="${order.size || ''}" ${canEdit ? '' : 'disabled'}>
                        </div>
                    </div>
                    <div class="d-flex gap-2 mt-4">
                        ${canEdit ? `<button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> ${t('common', 'save')}</button>` : ''}
                        <a href="#/orders" class="btn btn-secondary"><i class="fas fa-arrow-left"></i> ${t('common', 'cancel')}</a>
                    </div>
                </form>
            </div>
        `;
    },

    submitEdit(e, orderId) {
        e.preventDefault();
        if (this.isRemoteOrdersMode()) {
            return this._submitEditRemote(e, orderId);
        }
        // local mode
        const form = e.target;
        const orders = DB.getOrders();
        const idx = orders.findIndex(o => String(o.id) === String(orderId) || String(o.legacy_id) === String(orderId));
        if (idx === -1) return;
        const order = orders[idx];
        order.order_date = form.order_date.value;
        order.selling_price = Number(form.selling_price.value) || 0;
        order.color = form.color?.value || order.color || '';
        order.size = form.size?.value || order.size || '';
        orders[idx] = order;
        DB.setOrders(orders);
        App.flash(t('common', 'save') + '!', 'success');
        location.hash = '#/orders';
        return false;
    },

    /**
     * 3-8A.9-C: remote mode PENDING 주문 수정.
     * SupabaseOrdersDataSource.updatePendingOrder(remoteId, payload)만 사용한다.
     * DB.setOrders, DB.updateOrder, DB.updateProduct 금지.
     * 안전 필드(date/price/color/size/quantity)만 수정, customer/product 변경은 보류.
     */
    async _submitEditRemote(e, orderId) {
        const form = e.target;
        const order = (this.state.orders || []).find(o =>
            String(o.remote_id) === String(orderId) ||
            String(o.legacy_id) === String(orderId) ||
            String(o.id) === String(orderId)
        );
        if (!order) {
            App.flash(t('orders', 'order_not_found'), 'error');
            return false;
        }
        if (order.status !== 'PENDING') {
            App.flash(t('orders', 'only_pending_edit'), 'error');
            return false;
        }
        const remoteId = order.remote_id;
        if (!remoteId || typeof remoteId !== 'string') {
            App.flash(t('orders', 'order_not_found'), 'error');
            return false;
        }

        const customerUuid = order.customer_uuid;
        const productUuid = order.product_uuid;
        if (!customerUuid || !productUuid) {
            App.flash('customer_uuid 또는 product_uuid가 없습니다.', 'error');
            return false;
        }

        const sellingPrice = parseFloat(form.selling_price?.value) || order.selling_price || 0;
        if (sellingPrice <= 0) {
            App.flash(t('orders', 'enter_qty_price'), 'error');
            return false;
        }

        try {
            const ds = DB.getOrdersDataSource();
            await ds.updatePendingOrder(remoteId, {
                customer_uuid: customerUuid,
                product_uuid: productUuid,
                quantity: order.quantity || 1,
                selling_price: sellingPrice,
                order_date: form.order_date?.value || order.order_date || '',
                color: form.color?.value || order.color || undefined,
                size: form.size?.value || order.size || undefined,
                notes: undefined
            });
            App.flash(t('common', 'save') + '!', 'success');
            location.hash = '#/orders';
        } catch (e) {
            console.error('Remote update order failed:', (e.message || '').slice(0, 100));
            App.flash(t('common', 'save') + ' ' + t('common', 'fail'), 'error');
        }
        return false;
    },

    delete(orderId) {
        if (!confirm(t('common', 'confirm_delete'))) return;
        // remote mode delete → cancelOrder (hard delete 금지)
        if (this.isRemoteOrdersMode()) {
            return this._cancelRemote(orderId);
        }
        // local mode — 기존 sync 흐름, PENDING만 삭제 가능
        const key = String(orderId);
        const orders = DB.getOrders();
        const order = orders.find(o => String(o.id) === key || String(o.legacy_id) === key);
        if (!order) {
            App.flash(t('orders', 'order_not_found'), 'error');
            return;
        }
        if (order.status !== 'PENDING') {
            App.flash('PENDING 상태의 주문만 삭제할 수 있습니다.', 'error');
            return;
        }
        if (order.status === 'PENDING') {
            const products = DB.getProducts();
            const product = products.find(p => p.id === order.product_id);
            if (product) {
                product.reserved_stock = Math.max(0, (product.reserved_stock || 0) - (order.quantity || 0));
            }
            DB.setProducts(products);
        }
        const remaining = orders.filter(o => String(o.id) !== key && String(o.legacy_id) !== key);
        DB.setOrders(remaining);
        this.state.selected.delete(key);
        App.flash(t('common', 'delete') + '!', 'success');
        App.render();
    },

    renderAdd() {
        const today = new Date().toISOString().slice(0, 10);
        const customers = this.isRemoteOrdersMode()
            ? (this.state._remoteCustomers || [])
            : DB.getCustomers();
        const products = this.isRemoteOrdersMode()
            ? (this.state._remoteProducts || [])
            : DB.getProducts();
        const customerNames = [...new Set(customers.map(c => c.name || c.customer_name_snapshot || '').filter(Boolean))].sort();
        const productNames = [...new Set(products.map(p => p.original_title || p.product_name || '').filter(Boolean))].sort();
        const brandNames = [...new Set(products.map(p => p.brand).filter(Boolean))].sort();
        return `
            <div class="card">
                <h2><i class="fas fa-plus"></i> ${t('orders', 'add')}</h2>
                <form id="orderForm" onsubmit="return Orders.submitAdd()">
                    <div class="form-row">
                        <div class="form-group">
                            <label>${t('orders', 'customer')} *</label>
                            <input type="text" name="customer_name" id="customerName" required class="form-control"
                                list="customerList" placeholder="${t('common', 'enter_name')}">
                            <datalist id="customerList">
                                ${customerNames.map(n => `<option value="${n}">`).join('')}
                            </datalist>
                        </div>
                        <div class="form-group">
                            <label>${t('orders', 'sale_date')} *</label>
                            <input type="date" name="sale_date" required class="form-control" value="${today}">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>${t('products', 'brand')}</label>
                            <input type="text" name="brand" class="form-control"
                                list="brandList" placeholder="${t('products', 'brand')}">
                            <datalist id="brandList">
                                ${brandNames.map(b => `<option value="${b}">`).join('')}
                            </datalist>
                        </div>
                        <div class="form-group">
                            <label>${t('orders', 'product')} *</label>
                            <input type="text" name="product_name" id="productName" required class="form-control"
                                list="productList" placeholder="${t('orders', 'product')}">
                            <datalist id="productList">
                                ${productNames.map(n => `<option value="${n}">`).join('')}
                            </datalist>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>${t('orders', 'quantity')} *</label>
                            <input type="number" name="quantity" id="quantity" required min="1" class="form-control" value="1">
                        </div>
                        <div class="form-group">
                            <label>${t('orders', 'selling_price')} (${t('common', 'currency')}) *</label>
                            <input type="number" name="selling_price" id="selling_price" required step="1" min="0" class="form-control">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>${t('products', 'color')}</label>
                            <input type="text" name="color" class="form-control">
                        </div>
                        <div class="form-group">
                            <label>${t('products', 'size')}</label>
                            <input type="text" name="size" class="form-control">
                        </div>
                    </div>
                    <div class="d-flex gap-2 mt-4">
                        <button type="submit" class="btn btn-primary"><i class="fas fa-check"></i> ${t('common', 'save')}</button>
                        <a href="#/orders" class="btn btn-secondary"><i class="fas fa-arrow-left"></i> ${t('common', 'cancel')}</a>
                    </div>
                </form>
            </div>
        `;
    },

    /**
     * 3-8A.9-B: remote mode에서는 SupabaseOrdersDataSource.createOrder를 사용한다.
     * local mode는 기존 submitAdd 흐름 유지.
     * text input 기반으로 단순화: customer_name, product_name, brand로 조회.
     */
    async submitAdd() {
        if (this.isRemoteOrdersMode()) {
            return this._submitAddRemote();
        }
        // local mode — text input 기반
        const fd = new FormData(document.getElementById('orderForm'));
        const customerName = (fd.get('customer_name') || '').trim();
        const productName = (fd.get('product_name') || '').trim();
        const brand = (fd.get('brand') || '').trim();

        if (!customerName) {
            App.flash(t('orders', 'select_customer_or_input'), 'error');
            return false;
        }
        if (!productName) {
            App.flash(t('orders', 'select_product_required'), 'error');
            return false;
        }

        // 고객 찾기 또는 생성
        let customer = DB.findCustomerByName(customerName);
        if (!customer) {
            customer = DB.addCustomer({ name: customerName, wechat_nickname: '', phone: '' });
        }

        // 상품 찾기 (브랜드 + 상품명)
        const products = DB.getProducts();
        let product = products.find(p => p.original_title === productName && (brand === '' || p.brand === brand));
        if (!product) {
            product = products.find(p => p.original_title === productName);
        }
        if (!product) {
            App.flash(t('orders', 'select_product_required'), 'error');
            return false;
        }

        const quantity = parseInt(fd.get('quantity')) || 0;
        const sellingPrice = parseFloat(fd.get('selling_price')) || 0;
        if (quantity <= 0 || sellingPrice <= 0) {
            App.flash(t('orders', 'enter_qty_price'), 'error');
            return false;
        }

        const lastOrder = DB.getOrders().slice(-1)[0];
        const orderNumber = 'ORD-' + String((parseInt((lastOrder?.order_number || 'ORD-0').replace('ORD-', '')) || 0) + 1).padStart(4, '0');
        DB.addOrder({
            order_number: orderNumber,
            customer_id: customer.id,
            product_id: product.id,
            brand: brand || product.brand || '',
            color: fd.get('color') || '',
            size: fd.get('size') || '',
            quantity: quantity,
            selling_price: sellingPrice,
            order_date: fd.get('sale_date'),
            ship_date: null,
            shipping_company: '',
            tracking_number: '',
            status: 'PENDING',
            actual_profit: 0,
            actual_profit_margin: 0,
            actual_cost_ratio: 0
        });
        App.flash(t('common', 'register') + '!', 'success');
        location.hash = '#/orders';
        return false;
    },

    /**
     * 3-8A.9-B: remote mode 주문 생성.
     * text input 기반: customer_name, product_name으로 UUID 조회.
     */
    async _submitAddRemote() {
        const fd = new FormData(document.getElementById('orderForm'));
        const customerName = (fd.get('customer_name') || '').trim();
        const productName = (fd.get('product_name') || '').trim();
        const brand = (fd.get('brand') || '').trim();

        if (!customerName) {
            App.flash(t('orders', 'select_customer_or_input'), 'error');
            return false;
        }
        if (!productName) {
            App.flash(t('orders', 'select_product_required'), 'error');
            return false;
        }

        const quantity = parseInt(fd.get('quantity')) || 0;
        const sellingPrice = parseFloat(fd.get('selling_price')) || 0;
        if (quantity <= 0 || sellingPrice <= 0) {
            App.flash(t('orders', 'enter_qty_price'), 'error');
            return false;
        }

        // cached 데이터에서 고객/상품 UUID 조회
        const customers = this.state._remoteCustomers || [];
        const products = this.state._remoteProducts || [];

        let customer = customers.find(c =>
            (c.name || c.customer_name_snapshot || '').toLowerCase() === customerName.toLowerCase()
        );
        let customerUuid = customer ? (customer.remote_id || customer.id) : null;

        let product = products.find(p =>
            p.original_title === productName && (brand === '' || p.brand === brand)
        );
        if (!product) {
            product = products.find(p => p.original_title === productName);
        }
        let productUuid = product ? (product.remote_id || product.id) : null;

        if (!customerUuid) {
            App.flash(`'${customerName}' ${t('common', 'not_found')}`, 'error');
            return false;
        }
        if (!productUuid) {
            App.flash(`'${productName}' ${t('common', 'not_found')}`, 'error');
            return false;
        }

        try {
            const ds = DB.getOrdersDataSource();
            await ds.createOrder({
                customer_uuid: customerUuid,
                product_uuid: productUuid,
                quantity: quantity,
                selling_price: sellingPrice,
                order_date: fd.get('sale_date'),
                color: fd.get('color') || undefined,
                size: fd.get('size') || undefined,
                notes: undefined
            });
            App.flash(t('common', 'register') + '!', 'success');
            location.hash = '#/orders';
        } catch (e) {
            console.error('Remote create order failed:', e);
            App.flash(t('common', 'register') + ' ' + t('common', 'fail') + ': ' + (e.message || ''), 'error');
        }
        return false;
    },

    cancel(id) {
        if (!confirm(t('common', 'confirm_delete') + '?')) return;
        if (this.isRemoteOrdersMode()) {
            return this._cancelRemote(id);
        }
        // local mode — 기존 sync 흐름
        const key = String(id);
        const order = DB.getOrders().find(o => String(o.id) === key || String(o.legacy_id) === key);
        if (!order) return;
        const product = DB.getProducts().find(p => p.id === order.product_id);
        if (product) {
            DB.updateProduct(product.id, { reserved_stock: Math.max(0, (product.reserved_stock || 0) - (order.quantity || 0)) });
        }
        DB.updateOrder(order.id, { status: 'CANCELLED' });
        App.flash(t('orders', 'cancelled') + '!', 'success');
        App.render();
    },

    /**
     * Remote mode 주문 취소.
     * cancelOrder RPC 사용. 실패 시 성공 flash 금지.
     */
    async _cancelRemote(id) {
        const ds = DB.getOrdersDataSource();
        const key = String(id);
        const order = (this.state.orders || []).find(o =>
            String(o.remote_id) === key ||
            String(o.legacy_id) === key ||
            String(o.id) === key
        );
        if (!order) {
            App.flash(t('orders', 'order_not_found'), 'error');
            return;
        }
        if (order.status !== 'PENDING') {
            App.flash('PENDING 상태의 주문만 취소할 수 있습니다.', 'error');
            return;
        }
        const remoteId = order.remote_id;
        if (!remoteId || typeof remoteId !== 'string' || !/^[0-9a-f]{8}-/i.test(remoteId)) {
            App.flash(t('orders', 'order_not_found'), 'error');
            return;
        }
        try {
            await ds.cancelOrder(remoteId, { notes: 'cancelled from sales list' });
            this.state.selected.delete(key);
            App.flash('취소 완료!', 'success');
            await this._refreshOrdersAfterRemoteMutation();
        } catch (e) {
            const classifier = ds && typeof ds.classifyCancelOrderError === 'function'
                ? ds.classifyCancelOrderError(e)
                : 'UNKNOWN_CANCEL_ORDER_ERROR';
            console.error('Remote cancel order failed:', classifier, {
                code: e.code || null,
                status: e.status || null,
                details: e.details ? String(e.details).slice(0, 120) : null,
                hint: e.hint ? String(e.hint).slice(0, 120) : null
            });

            let userMsg = '판매 삭제/취소 실패: 주문 상태 또는 권한/RPC를 확인해야 합니다.';
            if (classifier === 'ORDER_NOT_PENDING') {
                userMsg = '대기(PENDING) 상태 주문만 삭제/취소할 수 있습니다.';
            } else if (classifier === 'PERMISSION_DENIED' || classifier === 'RLS_DENIED') {
                userMsg = '권한 문제로 판매 삭제/취소가 실패했습니다.';
            } else if (classifier === 'RPC_MISSING_OR_SIGNATURE_MISMATCH') {
                userMsg = 'cancel_order RPC 구성이 현재 코드와 맞지 않습니다.';
            }
            App.flash(userMsg, 'error');
        }
    },

    /**
     * 3-8A.9-C: remote mutation 후 orders 목록을 다시 불러와 렌더링한다.
     */
    async _refreshOrdersAfterRemoteMutation() {
        try {
            await this._loadRemoteDataForRender();
            App.render();
        } catch (e) {
            console.error('Orders refresh after mutation failed:', e);
            App.render();
        }
    },

    complete(id) {
        if (this.isRemoteOrdersMode()) {
            this._completeRemote(id);
            return;
        }
        // local mode — 기존 sync 흐름
        const key = String(id);
        DB.updateOrder(parseInt(key) || key, { status: 'COMPLETED' });
        Customers.recalculateAll();
        App.flash(t('orders', 'completed') + '!', 'success');
        App.render();
    },

    /**
     * 3-8A.9-D: remote mode 주문 완료.
     * SupabaseOrdersDataSource.completeOrder(remoteId)만 사용한다.
     */
    async _completeRemote(id) {
        const key = String(id);
        const order = (this.state.orders || []).find(o =>
            String(o.remote_id) === key ||
            String(o.legacy_id) === key ||
            String(o.id) === key
        );
        if (!order) {
            App.flash(t('orders', 'order_not_found'), 'error');
            return;
        }
        if (order.status !== 'SHIPPED') {
            App.flash('SHIPPED 상태의 주문만 완료할 수 있습니다.', 'error');
            return;
        }
        const remoteId = order.remote_id;
        if (!remoteId || typeof remoteId !== 'string') {
            App.flash(t('orders', 'order_not_found'), 'error');
            return;
        }
        try {
            const ds = DB.getOrdersDataSource();
            await ds.completeOrder(remoteId);
            App.flash(t('orders', 'completed') + '!', 'success');
            await this._refreshOrdersAfterRemoteMutation();
        } catch (e) {
            console.error('Remote complete order failed:', (e.message || '').slice(0, 100));
            App.flash(t('common', 'fail'), 'error');
        }
    },

    async renderShip(id) {
        let order, product, customer;
        if (this.isRemoteOrdersMode()) {
            // remote mode: load data first if not already loaded
            if (!this.state.orders || this.state.orders.length === 0) {
                await this._loadRemoteDataForRender();
            }
            order = (this.state.orders || []).find(o => String(o.id) === String(id) || o.remote_id === String(id) || String(o.legacy_id) === String(id));
            product = (this.state._remoteProducts || []).find(p => String(p.id) === String(order?.product_id) || p.remote_id === order?.product_uuid);
            customer = (this.state._remoteCustomers || []).find(c => String(c.id) === String(order?.customer_id) || c.remote_id === order?.customer_uuid);
        } else {
            order = DB.getOrders().find(o => o.id === parseInt(id));
            product = DB.getProducts().find(p => p.id === order?.product_id);
            customer = DB.getCustomers().find(c => c.id === order?.customer_id);
        }
        if (!order) {
            App.flash(t('orders', 'order_not_found'), 'error');
            location.hash = '#/orders';
            return '';
        }
        const profit = PriceCalculator.calculateProfit(order.selling_price, product?.actual_converted_cost || 0, order.quantity);
        const submitId = JSON.stringify(String(id));
        return `
            <div class="card">
                <h2><i class="fas fa-truck"></i> ${t('orders', 'ship')}</h2>
                <div class="info-box mb-4">
                    <p><strong>${t('orders', 'order_number')}:</strong> #${order.order_number}</p>
                    <p><strong>${t('orders', 'customer')}:</strong> ${customer?.name || '-'}</p>
                    <p><strong>${t('orders', 'product')}:</strong> ${product?.original_title || '-'}</p>
                    <p><strong>${t('orders', 'quantity')}:</strong> ${order.quantity}</p>
                    <p><strong>${t('orders', 'selling_price')}:</strong> ${order.selling_price?.toLocaleString()} ${t('common', 'currency')}</p>
                    <p class="text-success"><strong>${t('common', 'expected_profit')}:</strong> ${profit.profit?.toLocaleString()} ${t('common', 'currency')} (${profit.profit_margin}%)</p>
                </div>
                <form id="shipForm" onsubmit="return Orders.submitShip(${submitId})">
                    <div class="form-row">
                        <div class="form-group">
                            <label>${t('orders', 'shipping_company')}</label>
                            <input type="text" name="shipping_company" class="form-control" placeholder="${t('orders', 'shipping_placeholder')}">
                        </div>
                        <div class="form-group">
                            <label>${t('orders', 'tracking_number')}</label>
                            <input type="text" name="tracking_number" class="form-control" placeholder="${t('orders', 'tracking_placeholder')}">
                        </div>
                    </div>
                    <div class="d-flex gap-2 mt-4">
                        <button type="submit" class="btn btn-success"><i class="fas fa-check"></i> ${t('orders', 'ship')}</button>
                        <a href="#/orders" class="btn btn-secondary"><i class="fas fa-arrow-left"></i> ${t('common', 'cancel')}</a>
                    </div>
                </form>
            </div>
        `;
    },

    submitShip(id) {
        if (this.isRemoteOrdersMode()) {
            this._submitShipRemote(id);
            return false;
        }
        // local mode — 기존 sync 흐름
        const fd = new FormData(document.getElementById('shipForm'));
        const order = DB.getOrders().find(o => o.id === id);
        const product = DB.getProducts().find(p => p.id === order.product_id);
        if (!order || !product) return false;
        const profit = PriceCalculator.calculateProfit(order.selling_price, product.actual_converted_cost, order.quantity);
        DB.updateProduct(product.id, {
            current_stock: Math.max(0, (product.current_stock || 0) - order.quantity),
            reserved_stock: Math.max(0, (product.reserved_stock || 0) - order.quantity)
        });
        DB.updateOrder(id, {
            status: 'SHIPPED',
            ship_date: new Date().toISOString().slice(0, 10),
            shipping_company: fd.get('shipping_company') || '',
            tracking_number: fd.get('tracking_number') || '',
            actual_profit: profit.profit,
            actual_profit_margin: profit.profit_margin,
            actual_cost_ratio: profit.cost_ratio
        });
        DB.addInventoryLog({
            product_id: product.id,
            type: 'OUT',
            quantity: -order.quantity,
            reason: t('common', 'ship_out_log'),
            order_id: id
        });
        Customers.recalculateAll();
        App.flash(t('orders', 'shipped') + '!', 'success');
        location.hash = '#/orders';
        return false;
    },

    /**
     * 3-8A.9-D: remote mode 주문 출고.
     * SupabaseOrdersDataSource.shipOrder(remoteId, payload)만 사용한다.
     * DB.updateProduct, DB.updateOrder, DB.addInventoryLog, DB.setOrders 금지.
     * product stock / inventory_logs side effect는 ship_order RPC에 맡긴다.
     * PENDING 상태 주문만 출고 허용.
     */
    async _submitShipRemote(id) {
        const order = (this.state.orders || []).find(o => String(o.id) === String(id) || o.remote_id === String(id) || String(o.legacy_id) === String(id));
        if (!order) {
            App.flash(t('orders', 'order_not_found'), 'error');
            return false;
        }
        if (order.status !== 'PENDING') {
            App.flash('PENDING 상태의 주문만 출고할 수 있습니다.', 'error');
            return false;
        }
        const remoteId = order.remote_id;
        if (!remoteId || typeof remoteId !== 'string') {
            App.flash(t('orders', 'order_not_found'), 'error');
            return false;
        }
        const fd = new FormData(document.getElementById('shipForm'));
        try {
            const ds = DB.getOrdersDataSource();
            await ds.shipOrder(remoteId, {
                ship_date: new Date().toISOString().slice(0, 10),
                shipping_company: fd.get('shipping_company') || undefined,
                tracking_number: fd.get('tracking_number') || undefined
            });
            App.flash(t('orders', 'shipped') + '!', 'success');
            location.hash = '#/orders';
            await this._refreshOrdersAfterRemoteMutation();
        } catch (e) {
            console.error('Remote ship order failed:', e);
            App.flash(t('common', 'fail') + ': ' + (e.message || ''), 'error');
        }
        return false;
    }
};
