const Inventory = {
    state: {
        type: 'in',
        productId: null
    },

    renderList() {
        const products = DB.getProducts();
        const totalStock = products.reduce((s, p) => s + (p.current_stock || 0), 0);
        const totalReserved = products.reduce((s, p) => s + (p.reserved_stock || 0), 0);
        let html = `
            <div class="card">
                <div class="action-bar">
                    <div class="action-bar-left">
                        <h2><i class="fas fa-boxes"></i> ${t('inventory', 'title')}</h2>
                    </div>
                    <div class="action-bar-right">
                        <a href="#/inventory/in" class="btn btn-success"><i class="fas fa-plus"></i> ${t('inventory', 'stock_in')}</a>
                        <a href="#/inventory/out" class="btn btn-danger"><i class="fas fa-minus"></i> ${t('inventory', 'stock_out')}</a>
                        <a href="#/inventory/return" class="btn btn-info"><i class="fas fa-undo"></i> ${t('inventory', 'return')}</a>
                        <a href="#/inventory/discard" class="btn btn-warning"><i class="fas fa-trash"></i> ${t('inventory', 'discard')}</a>
                        <a href="#/inventory/history" class="btn btn-secondary"><i class="fas fa-history"></i> ${t('inventory', 'history')}</a>
                    </div>
                </div>
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-label">${t('inventory', 'current')}</div>
                        <div class="stat-value">${totalStock.toLocaleString()}</div>
                        <i class="fas fa-box stat-icon"></i>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">${t('inventory', 'reserved')}</div>
                        <div class="stat-value">${totalReserved.toLocaleString()}</div>
                        <i class="fas fa-clock stat-icon"></i>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">${t('inventory', 'available')}</div>
                        <div class="stat-value">${(totalStock - totalReserved).toLocaleString()}</div>
                        <i class="fas fa-check-circle stat-icon"></i>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">${t('products', 'total_count')}</div>
                        <div class="stat-value">${products.length}</div>
                        <i class="fas fa-tshirt stat-icon"></i>
                    </div>
                </div>
        `;
        if (products.length === 0) {
            html += `<div class="empty-state"><i class="fas fa-boxes"></i><p>${t('common', 'no_data')}</p></div>`;
        } else {
            html += `
                <div style="overflow-x:auto;">
                <table class="table">
                    <thead>
                        <tr>
                            <th>${t('products', 'product_code')}</th>
                            <th>${t('products', 'brand')}</th>
                            <th>${t('common', 'original_title')}</th>
                            <th>${t('inventory', 'current')}</th>
                            <th>${t('inventory', 'reserved')}</th>
                            <th>${t('inventory', 'available')}</th>
                            <th>${t('common', 'action')}</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            products.forEach(p => {
                const available = (p.current_stock || 0) - (p.reserved_stock || 0);
                const statusClass = available <= 0 ? 'text-danger' : available <= 5 ? 'text-warning' : 'text-success';
                html += `
                    <tr>
                        <td><strong>${p.product_code || '-'}</strong></td>
                        <td>${p.brand || '-'}</td>
                        <td>${p.original_title || '-'}</td>
                        <td>${p.current_stock || 0}</td>
                        <td class="text-warning">${p.reserved_stock || 0}</td>
                        <td class="${statusClass} font-bold">${available}</td>
                        <td>
                            <a href="#/inventory/in?product=${p.id}" class="btn btn-sm btn-success"><i class="fas fa-plus"></i></a>
                            <a href="#/inventory/out?product=${p.id}" class="btn btn-sm btn-danger"><i class="fas fa-minus"></i></a>
                        </td>
                    </tr>
                `;
            });
            html += '</tbody></table></div>';
        }
        html += '</div>';
        return html;
    },

    renderForm(type) {
        const products = DB.getProducts();
        const labels = {
            in: { title: t('inventory', 'stock_in'), icon: 'plus', color: 'success', delta: 1 },
            out: { title: t('inventory', 'stock_out'), icon: 'minus', color: 'danger', delta: -1 },
            return: { title: t('inventory', 'return'), icon: 'undo', color: 'info', delta: 1 },
            discard: { title: t('inventory', 'discard'), icon: 'trash', color: 'warning', delta: -1 }
        };
        const cfg = labels[type] || labels.in;
        return `
            <div class="card">
                <h2><i class="fas fa-${cfg.icon}"></i> ${cfg.title}</h2>
                <form id="inventoryForm" onsubmit="return Inventory.submitForm('${type}', ${cfg.delta})">
                    <div class="form-group">
                        <label>${t('products', 'title')} *</label>
                        <select name="product_id" class="form-control" required id="productSelect">
                            <option value="">${t('common', 'select')}</option>
                            ${products.map(p => `<option value="${p.id}">${p.product_code} - ${p.original_title} (${t('inventory', 'stock')}: ${p.current_stock || 0})</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>${t('inventory', 'quantity')} *</label>
                        <input type="number" name="quantity" class="form-control" required min="1" value="1">
                    </div>
                    <div class="form-group">
                        <label>${t('inventory', 'reason')}</label>
                        <textarea name="reason" class="form-control" rows="3" placeholder="${t('common', 'optional_input')}..."></textarea>
                    </div>
                    <div class="d-flex gap-2 mt-4">
                        <button type="submit" class="btn btn-${cfg.color}"><i class="fas fa-${cfg.icon}"></i> ${cfg.title}</button>
                        <a href="#/inventory" class="btn btn-secondary"><i class="fas fa-arrow-left"></i> ${t('common', 'cancel')}</a>
                    </div>
                </form>
            </div>
        `;
    },

    renderHistory() {
        const logs = DB.getInventoryLogs().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        const products = DB.getProducts();
        const typeColors = {
            IN: 'text-success',
            OUT: 'text-danger',
            RETURN: 'text-info',
            DISCARD: 'text-warning',
            CANCEL: 'text-muted',
            ORDER: 'text-warning'
        };
        let html = `
            <div class="card">
                <h2><i class="fas fa-history"></i> ${t('inventory', 'history')}</h2>
        `;
        if (logs.length === 0) {
            html += `<div class="empty-state"><i class="fas fa-history"></i><p>${t('common', 'no_data')}</p></div>`;
        } else {
            html += `
                <div style="overflow-x:auto;">
                <table class="table">
                    <thead>
                        <tr>
                            <th>${t('inventory', 'datetime')}</th>
                            <th>${t('inventory', 'type')}</th>
                            <th>${t('products', 'title')}</th>
                            <th>${t('inventory', 'quantity')}</th>
                            <th>${t('inventory', 'reason')}</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            logs.forEach(log => {
                const product = products.find(p => p.id === log.product_id);
                html += `
                    <tr>
                        <td>${log.created_at ? new Date(log.created_at).toLocaleString() : '-'}</td>
                        <td class="${typeColors[log.type] || ''} font-bold">${log.type}</td>
                        <td>${product ? product.original_title : '-'}</td>
                        <td class="${log.quantity >= 0 ? 'text-success' : 'text-danger'} font-bold">
                            ${log.quantity > 0 ? '+' : ''}${log.quantity}
                        </td>
                        <td>${log.reason || '-'}</td>
                    </tr>
                `;
            });
            html += '</tbody></table></div>';
        }
        html += '</div>';
        return html;
    },

    submitForm(type, delta) {
        const form = document.getElementById('inventoryForm');
        const fd = new FormData(form);
        const productId = parseInt(fd.get('product_id'));
        const quantity = parseInt(fd.get('quantity')) || 0;
        const reason = fd.get('reason') || '';
        if (!productId || quantity <= 0) {
            App.flash(t('common', 'enter_product_qty'), 'error');
            return false;
        }
        const product = DB.getProducts().find(p => p.id === productId);
        if (!product) {
            App.flash(t('common', 'product_not_found'), 'error');
            return false;
        }
        if (delta < 0 && (product.current_stock || 0) < quantity) {
            App.flash(t('common', 'low_stock_alert'), 'error');
            return false;
        }
        const newStock = (product.current_stock || 0) + (quantity * delta);
        DB.updateProduct(productId, { current_stock: newStock });
        DB.addInventoryLog({
            product_id: productId,
            type: type.toUpperCase(),
            quantity: quantity * delta,
            reason: reason,
            order_id: null
        });
        App.flash(t('common', 'save') + '!', 'success');
        location.hash = '#/inventory';
        return false;
    }
};
