const Orders = {
    state: {
        orders: [],
        filtered: [],
        year: 2026,
        month: new Date().getMonth() + 1,
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
        if (this.state.year && this.state.month) {
            list = list.filter(o => {
                const ym = this._extractYearMonth(o.order_date || o.created_at);
                if (!ym) return false;
                return ym.year === this.state.year && ym.month === this.state.month;
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
                        <label class="checkbox-wrapper">
                            <input type="checkbox" class="select-all-cb" data-target="orders">
                            ${t('products', 'select_all')}
                        </label>
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
                                            <select class="form-control" name="customer_id">
                                                ${customers.map(c => `<option value="${c.id}"${String(c.id) === String(o.customer_id) ? ' selected' : ''}>${c.name}</option>`).join('')}
                                            </select>
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
        let html = '';
        for (let y = 2026; y <= 2030; y++) {
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
        // local mode — 기존 sync 흐름
        const form = e.target;
        const orders = DB.getOrders();
        const idx = orders.findIndex(o => String(o.id) === String(orderId));
        if (idx === -1) return;
        const order = orders[idx];
        order.order_date = form.order_date.value;
        order.customer_id = Number(form.customer_id.value);
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
        if (this.isRemoteOrdersMode()) {
            return this._renderAddRemote();
        }
        // local mode — 기존 sync 흐름
        const customers = DB.getCustomers();
        const products = DB.getProducts();
        const brands = [...new Set(products.map(p => p.brand).filter(Boolean))];
        const today = new Date().toISOString().slice(0, 10);
        return `
            <div class="card">
                <h2><i class="fas fa-plus"></i> ${t('orders', 'add')}</h2>
                <form id="orderForm" onsubmit="return Orders.submitAdd()">
                    <div class="form-group">
                        <label>${t('orders', 'customer')} *</label>
                        <select name="customer_id" id="customerSelect" required class="form-control" onchange="Orders.toggleNewCustomer()">
                            <option value="">+ ${t('common', 'new_customer')}</option>
                            ${customers.map(c => `<option value="${c.id}">${c.name} (${c.wechat_nickname || t('common', 'no_wechat')})</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group" id="newCustomerGroup" style="display: none;">
                        <label>${t('common', 'new_customer')} ${t('customers', 'name')} *</label>
                        <input type="text" name="new_customer_name" id="newCustomerName" class="form-control" placeholder="${t('common', 'enter_name')}">
                        <p class="text-muted mt-2"><i class="fas fa-info-circle"></i> ${t('common', 'auto_register')}</p>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>${t('products', 'brand')} *</label>
                            <select name="brand" id="brandSelect" required class="form-control" onchange="Orders.updateProductList()">
                                <option value="">${t('products', 'brand')} ${t('common', 'select')}</option>
                                ${brands.map(b => `<option value="${b}">${b}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>${t('orders', 'product')} *</label>
                            <select name="product_id" id="productSelect" required class="form-control" onchange="Orders.updateStockAndPrice()">
                                <option value="">${t('common', 'please_select')}</option>
                            </select>
                        </div>
                    </div>
                    <div class="info-box" id="productInfo" style="display: none;">
                        <div class="form-row">
                            <div class="form-group" style="flex:1; margin-bottom:0.5rem;">
                                <strong>${t('products', 'product_code')}:</strong> <span id="productCode" style="font-weight:bold;color:#007bff;">-</span>
                            </div>
                            <div class="form-group" style="flex:1; margin-bottom:0.5rem;">
                                <strong>${t('common', 'stock_available')}:</strong> <span id="availableStock">0</span>
                            </div>
                            <div class="form-group" style="flex:1; margin-bottom:0.5rem;">
                                <strong>${t('common', 'base_price_ref')}:</strong> ${t('common', 'currency')} <span id="basePrice">0</span>
                            </div>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>${t('orders', 'quantity')} *</label>
                            <input type="number" name="quantity" id="quantity" required min="1" class="form-control" value="1" onchange="Orders.checkStock();Orders.calcProfit();" oninput="Orders.calcProfit()">
                        </div>
                        <div class="form-group">
                            <label>${t('orders', 'selling_price')} (${t('common', 'currency')}) *</label>
                            <input type="number" name="selling_price" id="selling_price" required step="1" min="0" class="form-control" oninput="Orders.calcProfit()">
                        </div>
                        <div class="form-group">
                            <label>${t('orders', 'sale_date')} *</label>
                            <input type="date" name="sale_date" required class="form-control" value="${today}">
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
                    <div class="info-box" id="profitInfo" style="display: none;">
                        <div class="form-row">
                            <div class="form-group" style="flex:1;">
                                <label style="color:#28a745;font-weight:bold;"><i class="fas fa-chart-line"></i> ${t('common', 'expected_profit')}</label>
                                <input type="text" id="profitAmount" readonly style="color:#28a745;font-weight:bold;" class="form-control">
                            </div>
                            <div class="form-group" style="flex:1;">
                                <label style="color:#28a745;font-weight:bold;"><i class="fas fa-percent"></i> ${t('common', 'expected_margin')}</label>
                                <input type="text" id="profitRate" readonly style="color:#28a745;font-weight:bold;" class="form-control">
                            </div>
                            <div class="form-group" style="flex:1;">
                                <label><i class="fas fa-yen-sign"></i> ${t('common', 'cost_ratio')}</label>
                                <input type="text" id="costRatio" readonly class="form-control">
                            </div>
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
     * 3-8A.9-B: remote mode add form.
     * customer_uuid / product_uuid를 사용한다. 신규 고객 생성 옵션 없음.
     * cached _remoteProducts / _remoteCustomers 사용.
     */
    _renderAddRemote() {
        const customers = this.state._remoteCustomers || [];
        const products = this.state._remoteProducts || [];
        const brands = [...new Set(products.map(p => p.brand).filter(Boolean))];
        const today = new Date().toISOString().slice(0, 10);
        return `
            <div class="card">
                <h2><i class="fas fa-plus"></i> ${t('orders', 'add')}</h2>
                <form id="orderForm" onsubmit="return Orders.submitAdd()">
                    <div class="form-group">
                        <label>${t('orders', 'customer')} *</label>
                        <select name="customer_uuid" id="customerSelect" required class="form-control">
                            <option value="">${t('common', 'please_select')}</option>
                            ${customers.map(c => `<option value="${c.remote_id || c.id}">${c.name || c.customer_name_snapshot || ''}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>${t('products', 'brand')} *</label>
                            <select name="brand" id="brandSelect" required class="form-control" onchange="Orders.updateProductList()">
                                <option value="">${t('products', 'brand')} ${t('common', 'select')}</option>
                                ${brands.map(b => `<option value="${b}">${b}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>${t('orders', 'product')} *</label>
                            <select name="product_uuid" id="productSelect" required class="form-control" onchange="Orders.updateStockAndPrice()">
                                <option value="">${t('common', 'please_select')}</option>
                            </select>
                        </div>
                    </div>
                    <div class="info-box" id="productInfo" style="display: none;">
                        <div class="form-row">
                            <div class="form-group" style="flex:1; margin-bottom:0.5rem;">
                                <strong>${t('products', 'product_code')}:</strong> <span id="productCode" style="font-weight:bold;color:#007bff;">-</span>
                            </div>
                            <div class="form-group" style="flex:1; margin-bottom:0.5rem;">
                                <strong>${t('common', 'stock_available')}:</strong> <span id="availableStock">0</span>
                            </div>
                            <div class="form-group" style="flex:1; margin-bottom:0.5rem;">
                                <strong>${t('common', 'base_price_ref')}:</strong> ${t('common', 'currency')} <span id="basePrice">0</span>
                            </div>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>${t('orders', 'quantity')} *</label>
                            <input type="number" name="quantity" id="quantity" required min="1" class="form-control" value="1" onchange="Orders.checkStock();Orders.calcProfit();" oninput="Orders.calcProfit()">
                        </div>
                        <div class="form-group">
                            <label>${t('orders', 'selling_price')} (${t('common', 'currency')}) *</label>
                            <input type="number" name="selling_price" id="selling_price" required step="1" min="0" class="form-control" oninput="Orders.calcProfit()">
                        </div>
                        <div class="form-group">
                            <label>${t('orders', 'sale_date')} *</label>
                            <input type="date" name="sale_date" required class="form-control" value="${today}">
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
                    <div class="info-box" id="profitInfo" style="display: none;">
                        <div class="form-row">
                            <div class="form-group" style="flex:1;">
                                <label style="color:#28a745;font-weight:bold;"><i class="fas fa-chart-line"></i> ${t('common', 'expected_profit')}</label>
                                <input type="text" id="profitAmount" readonly style="color:#28a745;font-weight:bold;" class="form-control">
                            </div>
                            <div class="form-group" style="flex:1;">
                                <label style="color:#28a745;font-weight:bold;"><i class="fas fa-percent"></i> ${t('common', 'expected_margin')}</label>
                                <input type="text" id="profitRate" readonly style="color:#28a745;font-weight:bold;" class="form-control">
                            </div>
                            <div class="form-group" style="flex:1;">
                                <label><i class="fas fa-yen-sign"></i> ${t('common', 'cost_ratio')}</label>
                                <input type="text" id="costRatio" readonly class="form-control">
                            </div>
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

    toggleNewCustomer() {
        const sel = document.getElementById('customerSelect').value;
        const group = document.getElementById('newCustomerGroup');
        if (sel === '') {
            group.style.display = 'block';
            document.getElementById('newCustomerName').required = true;
        } else {
            group.style.display = 'none';
            document.getElementById('newCustomerName').required = false;
        }
    },

    updateProductList() {
        const brand = document.getElementById('brandSelect').value;
        const productSelect = document.getElementById('productSelect');
        productSelect.innerHTML = `<option value="">${t('common', 'please_select')}</option>`;
        document.getElementById('productInfo').style.display = 'none';
        document.getElementById('profitInfo').style.display = 'none';
        if (!brand) return;
        // 3-8A.9-B: remote mode uses cached _remoteProducts
        const products = this.isRemoteOrdersMode()
            ? (this.state._remoteProducts || [])
            : DB.getProducts();
        const filtered = products.filter(p => p.brand === brand);
        filtered.forEach(p => {
            const available = (p.current_stock || 0) - (p.reserved_stock || 0);
            const opt = document.createElement('option');
            // 3-8A.9-B: remote mode uses remote_id (uuid) as value
            opt.value = this.isRemoteOrdersMode() ? (p.remote_id || p.id) : p.id;
            opt.textContent = `${p.original_title || p.product_name || ''} (${t('inventory', 'stock')}: ${available})`;
            opt.dataset.stock = p.current_stock || 0;
            opt.dataset.reserved = p.reserved_stock || 0;
            opt.dataset.baseprice = p.china_base_price || p.china_cost || 0;
            opt.dataset.productcode = p.product_code || '';
            opt.dataset.convertedcost = p.actual_converted_cost || p.actual_cost || 0;
            productSelect.appendChild(opt);
        });
    },

    updateStockAndPrice() {
        const sel = document.getElementById('productSelect');
        const opt = sel.options[sel.selectedIndex];
        if (opt && opt.value) {
            const stock = parseInt(opt.dataset.stock) || 0;
            const reserved = parseInt(opt.dataset.reserved) || 0;
            const basePrice = parseFloat(opt.dataset.baseprice) || 0;
            const code = opt.dataset.productcode || '-';
            document.getElementById('productCode').textContent = code;
            document.getElementById('availableStock').textContent = stock - reserved;
            document.getElementById('basePrice').textContent = basePrice.toLocaleString();
            document.getElementById('productInfo').style.display = 'block';
            if (!document.getElementById('selling_price').value) {
                document.getElementById('selling_price').value = basePrice;
            }
            this.calcProfit();
        } else {
            document.getElementById('productInfo').style.display = 'none';
            document.getElementById('profitInfo').style.display = 'none';
        }
    },

    checkStock() {
        const sel = document.getElementById('productSelect');
        const opt = sel.options[sel.selectedIndex];
        const qty = parseInt(document.getElementById('quantity').value) || 0;
        if (opt && opt.value && qty > 0) {
            const stock = parseInt(opt.dataset.stock) || 0;
            const reserved = parseInt(opt.dataset.reserved) || 0;
            const available = stock - reserved;
            if (qty > available) {
                App.flash(t('common', 'low_stock_alert') + ' (' + available + ')', 'warning');
                document.getElementById('quantity').value = available;
            }
        }
    },

    calcProfit() {
        const sel = document.getElementById('productSelect');
        const opt = sel.options[sel.selectedIndex];
        const sellingPrice = parseFloat(document.getElementById('selling_price').value) || 0;
        if (opt && opt.value && sellingPrice > 0) {
            const basePrice = parseFloat(opt.dataset.baseprice) || 0;
            const convertedCost = parseFloat(opt.dataset.convertedcost) || ((basePrice - 40) / 3);
            const quantity = parseInt(document.getElementById('quantity').value) || 1;
            const result = PriceCalculator.calculateProfit(sellingPrice, convertedCost, quantity);
            document.getElementById('profitAmount').value = result.profit.toLocaleString() + ' ' + t('common', 'currency');
            document.getElementById('profitRate').value = result.profit_margin + ' %';
            document.getElementById('costRatio').value = result.cost_ratio + ' %';
            document.getElementById('profitInfo').style.display = 'block';
        } else {
            document.getElementById('profitInfo').style.display = 'none';
        }
    },

    /**
     * 3-8A.9-B: remote mode에서는 SupabaseOrdersDataSource.createOrder를 사용한다.
     * local mode는 기존 submitAdd 흐름 유지.
     * remote mode: DB.addOrder, DB.updateProduct, DB.addCustomer, DB.findCustomerByName 금지.
     */
    async submitAdd() {
        if (this.isRemoteOrdersMode()) {
            return this._submitAddRemote();
        }
        // local mode — 기존 sync 흐름
        const fd = new FormData(document.getElementById('orderForm'));
        let customerId = parseInt(fd.get('customer_id'));
        const newName = (fd.get('new_customer_name') || '').trim();
        if (!customerId && newName) {
            const existing = DB.findCustomerByName(newName);
            if (existing) {
                customerId = existing.id;
            } else {
                const newCust = DB.addCustomer({ name: newName, wechat_nickname: '', phone: '' });
                customerId = newCust.id;
            }
        }
        if (!customerId) {
            App.flash(t('orders', 'select_customer_or_input'), 'error');
            return false;
        }
        const productId = parseInt(fd.get('product_id'));
        const product = DB.getProducts().find(p => p.id === productId);
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
        const available = (product.current_stock || 0) - (product.reserved_stock || 0);
        if (quantity > available) {
            App.flash(t('common', 'low_stock_alert'), 'error');
            return false;
        }
        DB.updateProduct(productId, { reserved_stock: (product.reserved_stock || 0) + quantity });
        const profitResult = PriceCalculator.calculateProfit(sellingPrice, product.actual_converted_cost, quantity);
        const lastOrder = DB.getOrders().slice(-1)[0];
        const orderNumber = 'ORD-' + String((parseInt((lastOrder?.order_number || 'ORD-0').replace('ORD-', '')) || 0) + 1).padStart(4, '0');
        DB.addOrder({
            order_number: orderNumber,
            customer_id: customerId,
            product_id: productId,
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
     * SupabaseOrdersDataSource.createOrder(payload)만 사용한다.
     * DB.addOrder, DB.updateProduct, DB.addInventoryLog, DB.addCustomer, DB.findCustomerByName 금지.
     * product stock side effect는 create_order RPC에 맡긴다.
     */
    async _submitAddRemote() {
        const fd = new FormData(document.getElementById('orderForm'));
        const customerUuid = (fd.get('customer_uuid') || '').trim();
        const productUuid = (fd.get('product_uuid') || '').trim();

        if (!customerUuid) {
            App.flash(t('orders', 'select_customer_or_input'), 'error');
            return false;
        }
        if (!productUuid) {
            App.flash(t('orders', 'select_product_required'), 'error');
            return false;
        }

        const quantity = parseInt(fd.get('quantity')) || 0;
        const sellingPrice = parseFloat(fd.get('selling_price')) || 0;
        if (quantity <= 0 || sellingPrice <= 0) {
            App.flash(t('orders', 'enter_qty_price'), 'error');
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
        DB.updateOrder(id, { status: 'COMPLETED' });
        Customers.recalculateAll();
        App.flash(t('orders', 'completed') + '!', 'success');
        App.render();
    },

    renderShip(id) {
        const order = DB.getOrders().find(o => o.id === parseInt(id));
        if (!order) {
            App.flash(t('orders', 'order_not_found'), 'error');
            location.hash = '#/orders';
            return '';
        }
        const product = DB.getProducts().find(p => p.id === order.product_id);
        const customer = DB.getCustomers().find(c => c.id === order.customer_id);
        const profit = PriceCalculator.calculateProfit(order.selling_price, product?.actual_converted_cost || 0, order.quantity);
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
                <form id="shipForm" onsubmit="return Orders.submitShip(${id})">
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
    }
};
