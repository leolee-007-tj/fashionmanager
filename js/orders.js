const Orders = {
    state: {
        orders: [],
        filtered: [],
        year: 0,
        month: 0,
        sortBy: 'order_date',
        sortOrder: 'desc',
        selected: new Set(),
        editingOrderId: null
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
        let html = `
            <div class="card">
                <div class="action-bar">
                    <div class="action-bar-left">
                        <h2><i class="fas fa-shopping-cart"></i> ${t('orders', 'title')}</h2>
                    </div>
                    <div class="action-bar-right">
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
                            <th style="width:40px;"><input type="checkbox" class="select-all-cb" data-target="orders"></th>
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
                            <th>${t('common', 'action')}</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            list.forEach(o => {
                const product = products.find(p => p.id === o.product_id);
                const customer = customers.find(c => c.id === o.customer_id);
                const isEditing = String(this.state.editingOrderId) === String(o.id);
                html += `
                    <tr${isEditing ? ' style="background:#eef3ff;"' : ''}>
                        <td><input type="checkbox" class="row-checkbox" data-id="${o.id}" data-target="orders" ${this.state.selected.has(Number(o.id)) ? 'checked' : ''}></td>
                        <td>${this._formatOrderDate(o.order_date) || this._formatOrderDate(o.created_at) || '-'}</td>
                        <td>${customer ? customer.name : '-'}</td>
                        <td>${product ? product.brand : '-'}</td>
                        <td>${product ? product.original_title : '-'}</td>
                        <td class="font-bold">${(o.selling_price || 0).toLocaleString()} ${t('common', 'currency')}</td>
                        <td>
                            <button class="btn btn-sm ${isEditing ? 'btn-warning' : 'btn-secondary'}" onclick="Orders.toggleEdit(${o.id})"><i class="fas fa-edit"></i></button>
                            <button class="btn btn-sm btn-danger" onclick="Orders.delete(${o.id})"><i class="fas fa-trash"></i></button>
                        </td>
                    </tr>
                `;
                if (isEditing) {
                    html += `
                        <tr style="background:#f8f9fa;">
                            <td colspan="7">
                                <form id="orderEditForm_${o.id}" onsubmit="Orders.submitEdit(event, ${o.id})" style="padding:12px 8px;">
                                    <div class="form-row">
                                        <div class="form-group">
                                            <label>${t('orders', 'sale_date')}</label>
                                            <input type="date" class="form-control" name="order_date" value="${this._formatOrderDate(o.order_date) || this._formatOrderDate(o.created_at) || ''}">
                                        </div>
                                        <div class="form-group">
                                            <label>${t('orders', 'customer')}</label>
                                            <input type="text" class="form-control" name="customer_name" value="${customer?.name || o.customer_name || ''}">
                                        </div>
                                        <div class="form-group">
                                            <label>${t('orders', 'selling_price')} (${t('common', 'currency')})</label>
                                            <input type="number" class="form-control" name="selling_price" value="${o.selling_price || 0}" min="0">
                                        </div>
                                        <div class="form-group">
                                            <label>${t('common', 'status')}</label>
                                            <select class="form-control" name="status">
                                                <option value="COMPLETED"${o.status === 'COMPLETED' ? ' selected' : ''}>${t('orders', 'status_completed') || '완료'}</option>
                                                <option value="SHIPPED"${o.status === 'SHIPPED' ? ' selected' : ''}>${t('orders', 'status_shipped') || '출고'}</option>
                                                <option value="PENDING"${o.status === 'PENDING' ? ' selected' : ''}>${t('orders', 'status_pending') || '대기'}</option>
                                                <option value="CANCELLED"${o.status === 'CANCELLED' ? ' selected' : ''}>${t('orders', 'status_cancelled') || '취소'}</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div class="d-flex gap-2 ml-auto">
                                        <button type="submit" class="btn btn-primary btn-sm"><i class="fas fa-save"></i> ${t('common', 'save')}</button>
                                        <button type="button" class="btn btn-secondary btn-sm" onclick="Orders.cancelEdit()">${t('common', 'cancel')}</button>
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
        const selectedCount = this.state.filtered.filter(o => this.state.selected.has(Number(o.id))).length;
        if (selectedCount === total) {
            this.state.selected.clear();
        } else {
            this.state.selected.clear();
            this.state.filtered.forEach(o => this.state.selected.add(Number(o.id)));
        }
        App.renderPage();
    },

    batchDelete() {
        if (this.state.selected.size === 0) {
            App.flash(t('common', 'please_select'), 'warning');
            return;
        }
        if (!confirm(this.state.selected.size + t('common', 'confirm_delete_items'))) return;
        // 3-8A.9-C: remote mode batch delete → 각 주문 cancelOrder (hard delete 금지)
        if (this.isRemoteOrdersMode()) {
            return this._batchCancelRemote();
        }
        // local mode — 기존 sync 흐름
        const products = DB.getProducts();
        const orders = DB.getOrders();
        orders.forEach(o => {
            if (this.state.selected.has(o.id) && o.status === 'PENDING') {
                const product = products.find(p => p.id === o.product_id);
                if (product) {
                    product.reserved_stock = Math.max(0, (product.reserved_stock || 0) - (o.quantity || 0));
                }
            }
        });
        DB.setProducts(products);
        const remaining = orders.filter(o => !this.state.selected.has(o.id));
        DB.setOrders(remaining);
        this.state.selected.clear();
        App.flash(t('common', 'delete') + '!', 'success');
        App.render();
    },

    /**
     * 3-8A.9-C: remote mode 일괄 취소.
     * 선택된 각 PENDING 주문에 대해 ds.cancelOrder 호출.
     * hard delete, DB.setOrders, DB.setProducts 금지.
     */
    async _batchCancelRemote() {
        const orders = this.state.orders || [];
        const selectedIds = [...this.state.selected];
        let successCount = 0;
        let failCount = 0;

        for (const id of selectedIds) {
            const order = orders.find(o => o.id === id || o.remote_id === id);
            if (!order || order.status !== 'PENDING') continue;
            const remoteId = order.remote_id;
            if (!remoteId || typeof remoteId !== 'string') continue;
            try {
                const ds = DB.getOrdersDataSource();
                await ds.cancelOrder(remoteId, { notes: '' });
                successCount++;
            } catch (e) {
                console.error('Batch cancel order failed:', e);
                failCount++;
            }
        }
        this.state.selected.clear();
        if (failCount > 0) {
            App.flash(successCount + t('orders', 'cancelled') + ', ' + failCount + ' ' + t('common', 'fail'), successCount > 0 ? 'warning' : 'error');
        } else {
            App.flash(successCount + t('common', 'delete') + '!', 'success');
        }
        await this._refreshOrdersAfterRemoteMutation();
    },

    selectDuplicates() {
        const list = this.state.filtered;
        const seen = new Map();
        const dupIds = [];
        list.forEach(o => {
            const key = String(o.customer_id) + '|' + String(o.product_id) + '|' + this._formatOrderDate(o.order_date || o.created_at);
            if (seen.has(key)) {
                dupIds.push(o.id);
            } else {
                seen.set(key, o.id);
            }
        });
        this.state.selected.clear();
        dupIds.forEach(id => this.state.selected.add(Number(id)));
        App.flash(t('orders', 'duplicates_found') + ': ' + dupIds.length + t('orders', 'items_selected'), dupIds.length > 0 ? 'info' : 'warning');
        App.renderPage();
    },

    toggleEdit(orderId) {
        if (String(this.state.editingOrderId) === String(orderId)) {
            this.state.editingOrderId = null;
        } else {
            this.state.editingOrderId = Number(orderId);
        }
        App.renderPage();
    },

    cancelEdit() {
        this.state.editingOrderId = null;
        App.renderPage();
    },

    submitEdit(e, orderId) {
        e.preventDefault();
        // 3-8A.9-C: remote mode edit → ds.updatePendingOrder
        if (this.isRemoteOrdersMode()) {
            return this._submitEditRemote(e, orderId);
        }
        // local mode — text input 기반
        const form = e.target;
        const orders = DB.getOrders();
        const idx = orders.findIndex(o => String(o.id) === String(orderId));
        if (idx === -1) return;
        const order = orders[idx];
        order.order_date = form.order_date.value;
        const customerName = (form.customer_name?.value || '').trim();
        if (customerName) {
            let customer = DB.findCustomerByName(customerName);
            if (!customer) {
                customer = DB.addCustomer({ name: customerName, wechat_nickname: '', phone: '' });
            }
            order.customer_id = customer.id;
            order.customer_name = customer.name;
        }
        order.selling_price = Number(form.selling_price.value) || 0;
        order.status = form.status.value || order.status;
        orders[idx] = order;
        DB.setOrders(orders);
        this.state.editingOrderId = null;
        App.flash(t('common', 'save') + '!', 'success');
        App.render();
    },

    /**
     * 3-8A.9-C: remote mode PENDING 주문 수정.
     * SupabaseOrdersDataSource.updatePendingOrder(remoteId, payload)만 사용한다.
     * DB.setOrders, DB.updateOrder, DB.updateProduct 금지.
     * 안전 필드(date/price/color/size/quantity)만 수정, customer/product 변경은 보류.
     */
    async _submitEditRemote(e, orderId) {
        const form = e.target;
        const order = (this.state.orders || []).find(o => o.id === orderId || o.remote_id === orderId);
        if (!order) {
            App.flash(t('orders', 'order_not_found'), 'error');
            return;
        }
        if (order.status !== 'PENDING') {
            App.flash(t('orders', 'only_pending_edit'), 'error');
            return;
        }
        const remoteId = order.remote_id;
        if (!remoteId || typeof remoteId !== 'string') {
            App.flash(t('orders', 'order_not_found'), 'error');
            return;
        }

        const customerUuid = order.customer_uuid;
        const productUuid = order.product_uuid;
        if (!customerUuid || !productUuid) {
            App.flash('customer_uuid 또는 product_uuid가 없습니다.', 'error');
            return;
        }

        const quantity = parseInt(form.quantity?.value) || order.quantity || 1;
        const sellingPrice = parseFloat(form.selling_price?.value) || order.selling_price || 0;
        if (quantity <= 0 || sellingPrice <= 0) {
            App.flash(t('orders', 'enter_qty_price'), 'error');
            return;
        }

        try {
            const ds = DB.getOrdersDataSource();
            await ds.updatePendingOrder(remoteId, {
                customer_uuid: customerUuid,
                product_uuid: productUuid,
                quantity: quantity,
                selling_price: sellingPrice,
                order_date: form.order_date?.value || order.order_date || '',
                color: form.color?.value || order.color || undefined,
                size: form.size?.value || order.size || undefined,
                notes: undefined
            });
            this.state.editingOrderId = null;
            App.flash(t('common', 'save') + '!', 'success');
            await this._refreshOrdersAfterRemoteMutation();
        } catch (e) {
            console.error('Remote update order failed:', e);
            App.flash(t('common', 'save') + ' ' + t('common', 'fail') + ': ' + (e.message || ''), 'error');
        }
    },

    delete(orderId) {
        if (!confirm(t('common', 'confirm_delete'))) return;
        // 3-8A.9-C: remote mode delete → cancelOrder (hard delete 금지)
        if (this.isRemoteOrdersMode()) {
            return this._cancelRemote(orderId);
        }
        // local mode — 기존 sync 흐름
        const orders = DB.getOrders();
        const order = orders.find(o => String(o.id) === String(orderId));
        if (order && order.status === 'PENDING') {
            const products = DB.getProducts();
            const product = products.find(p => p.id === order.product_id);
            if (product) {
                product.reserved_stock = Math.max(0, (product.reserved_stock || 0) - (order.quantity || 0));
            }
            DB.setProducts(products);
        }
        const remaining = orders.filter(o => String(o.id) !== String(orderId));
        DB.setOrders(remaining);
        this.state.selected.delete(Number(orderId));
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
        // 3-8A.9-C: remote mode cancel → ds.cancelOrder
        if (this.isRemoteOrdersMode()) {
            return this._cancelRemote(id);
        }
        // local mode — 기존 sync 흐름
        const order = DB.getOrders().find(o => o.id === id);
        if (!order) return;
        const product = DB.getProducts().find(p => p.id === order.product_id);
        if (product) {
            DB.updateProduct(product.id, { reserved_stock: Math.max(0, (product.reserved_stock || 0) - (order.quantity || 0)) });
        }
        DB.updateOrder(id, { status: 'CANCELLED' });
        App.flash(t('orders', 'cancelled') + '!', 'success');
        App.render();
    },

    /**
     * 3-8A.9-C: remote mode 주문 취소.
     * SupabaseOrdersDataSource.cancelOrder(remoteId)만 사용한다.
     * DB.updateProduct, DB.updateOrder, DB.setOrders 금지.
     * product stock side effect는 cancel_order RPC에 맡긴다.
     */
    async _cancelRemote(id) {
        const order = (this.state.orders || []).find(o => o.id === id || o.remote_id === id);
        if (!order) {
            App.flash(t('orders', 'order_not_found'), 'error');
            return;
        }
        const remoteId = order.remote_id;
        if (!remoteId || typeof remoteId !== 'string') {
            App.flash(t('orders', 'order_not_found'), 'error');
            return;
        }
        try {
            const ds = DB.getOrdersDataSource();
            await ds.cancelOrder(remoteId, { notes: '' });
            App.flash(t('orders', 'cancelled') + '!', 'success');
            await this._refreshOrdersAfterRemoteMutation();
        } catch (e) {
            console.error('Remote cancel order failed:', e);
            App.flash(t('common', 'fail') + ': ' + (e.message || ''), 'error');
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
        DB.updateOrder(id, { status: 'COMPLETED' });
        Customers.recalculateAll();
        App.flash(t('orders', 'completed') + '!', 'success');
        App.render();
    },

    /**
     * 3-8A.9-D: remote mode 주문 완료.
     * SupabaseOrdersDataSource.completeOrder(remoteId)만 사용한다.
     * DB.updateOrder, DB.setOrders 금지.
     * SHIPPED 상태 주문만 완료 허용.
     */
    async _completeRemote(id) {
        const order = (this.state.orders || []).find(o => o.id === id || o.remote_id === id);
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
            console.error('Remote complete order failed:', e);
            App.flash(t('common', 'fail') + ': ' + (e.message || ''), 'error');
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
