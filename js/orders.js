const Orders = {
    state: {
        orders: [],
        filtered: [],
        year: 2025,
        month: new Date().getMonth() + 1,
        sortBy: 'id',
        sortOrder: 'desc',
        selected: new Set()
    },

    load() {
        this.state.orders = DB.getOrders();
        this.applyFilters();
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
                av = this._extractYearMonth(a.order_date || a.created_at);
                bv = this._extractYearMonth(b.order_date || b.created_at);
                if (av && bv) { av = av.year * 100 + av.month; bv = bv.year * 100 + bv.month; }
                else { av = 0; bv = 0; }
            }
            if (this.state.sortOrder === 'asc') {
                return av > bv ? 1 : -1;
            }
            return av < bv ? 1 : -1;
        });
        this.state.filtered = list;
    },

    renderList() {
        this.load();
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
                        </tr>
                    </thead>
                    <tbody>
            `;
            const products = DB.getProducts();
            const customers = DB.getCustomers();
            list.forEach(o => {
                const product = products.find(p => p.id === o.product_id);
                const customer = customers.find(c => c.id === o.customer_id);
                html += `
                    <tr>
                        <td><input type="checkbox" class="row-checkbox" data-id="${o.id}" data-target="orders" ${this.state.selected.has(Number(o.id)) ? 'checked' : ''}></td>
                        <td>${this._formatOrderDate(o.order_date) || this._formatOrderDate(o.created_at) || '-'}</td>
                        <td>${customer ? customer.name : '-'}</td>
                        <td>${product ? product.brand : '-'}</td>
                        <td>${product ? product.original_title : '-'}</td>
                        <td class="font-bold">${(o.selling_price || 0).toLocaleString()} ${t('common', 'currency')}</td>
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

    renderAdd() {
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
        const products = DB.getProducts().filter(p => p.brand === brand);
        products.forEach(p => {
            const available = (p.current_stock || 0) - (p.reserved_stock || 0);
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = `${p.original_title} (${t('inventory', 'stock')}: ${available})`;
            opt.dataset.stock = p.current_stock || 0;
            opt.dataset.reserved = p.reserved_stock || 0;
            opt.dataset.baseprice = p.china_base_price || 0;
            opt.dataset.productcode = p.product_code || '';
            opt.dataset.convertedcost = p.actual_converted_cost || 0;
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

    submitAdd() {
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

    cancel(id) {
        if (!confirm(t('common', 'confirm_delete') + '?')) return;
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
