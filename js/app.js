const App = {
    currentPage: 'dashboard',
    currentParams: {},
    pageArgs: [],
    sidebarCollapsed: false,
    classificationSelected: new Set(),
    editingKeywordId: null,

    init() {
        DB.init();
        this.setupLangButtons();
        this.setupRouter();
        this.setupSidebar();
        this.setupCheckboxHandlers();
        this.updateHeader();
        this.render();
    },

    updateHeader() {
        const s = DB.getSettings();
        const storeName = s.store_name || 'LES SOUL';
        let storeSubtitle = s.store_subtitle || 'Store Management';
        if (typeof storeSubtitle === 'object') {
            storeSubtitle = storeSubtitle[currentLang] || storeSubtitle.ko || storeSubtitle.en || 'Store Management';
        }
        document.title = storeName + (storeSubtitle ? ' - ' + storeSubtitle : '');
        const nameEl = document.querySelector('.store-name');
        const subEl = document.querySelector('.store-subtitle');
        if (nameEl) nameEl.textContent = storeName;
        if (subEl) subEl.textContent = storeSubtitle;
    },

    setupLangButtons() {
        document.querySelectorAll('.lang-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.lang === currentLang);
        });
        const headerSelect = document.getElementById('header-lang-select');
        if (headerSelect) {
            headerSelect.value = currentLang;
            headerSelect.addEventListener('change', (e) => {
                setLanguage(e.target.value);
                App.render();
            });
        }
    },

    setupSidebar() {
        const toggle = document.getElementById('sidebarToggle');
        if (toggle) {
            toggle.addEventListener('click', () => {
                this.sidebarCollapsed = !this.sidebarCollapsed;
                document.getElementById('sidebar').classList.toggle('collapsed');
                document.getElementById('main-content').classList.toggle('sidebar-collapsed');
            });
        }
    },

    setupRouter() {
        window.addEventListener('hashchange', () => this.handleRoute());
        this.handleRoute();
    },

    setupCheckboxHandlers() {
        document.addEventListener('click', (e) => {
            const target = e.target;
            if (target.tagName === 'INPUT' && target.type === 'checkbox') {
                const dataTarget = target.dataset.target;
                if (target.classList.contains('select-all-cb')) {
                    if (dataTarget === 'orders') Orders.toggleSelectAll();
                    else if (dataTarget === 'products') Products.toggleSelectAll();
                    else if (dataTarget === 'customers') Customers.toggleSelectAll();
                    else if (dataTarget === 'expenses') Expenses.toggleSelectAll();
                    else if (dataTarget === 'keywords') App.toggleKeywordSelectAll();
                } else if (target.classList.contains('row-checkbox')) {
                    const id = Number(target.dataset.id);
                    if (dataTarget === 'orders') Orders.toggleSelect(id);
                    else if (dataTarget === 'products') Products.toggleSelect(id);
                    else if (dataTarget === 'customers') Customers.toggleSelect(id);
                    else if (dataTarget === 'expenses') Expenses.toggleSelect(id);
                    else if (dataTarget === 'keywords') App.toggleKeywordSelect(id);
                }
            }
        });
    },

    handleRoute() {
        const hash = location.hash.slice(1) || '/dashboard';
        const parts = hash.split('?')[0].split('/').filter(Boolean);
        const query = {};
        if (hash.includes('?')) {
            const qs = hash.split('?')[1];
            qs.split('&').forEach(p => {
                const [k, v] = p.split('=');
                if (k) query[k] = decodeURIComponent(v || '');
            });
        }
        this.currentParams = query;
        this.currentPage = parts.length === 0 ? 'dashboard' : parts[0];
        this.pageArgs = parts.slice(1);
        this.updateActiveNav();
        this.renderPage();
    },

    updateActiveNav() {
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
            const href = link.getAttribute('href') || '';
            const page = href.replace('#/', '').split('/')[0];
            if (page === this.currentPage) {
                link.classList.add('active');
            }
        });
    },

    render() {
        updateAllTranslations();
        this.updateActiveNav();
        this.renderPage();
    },

    renderPage() {
        const main = document.getElementById('main-content');
        if (!main) return;
        let content = '';
        const page = this.currentPage;
        const args = this.pageArgs;
        try {
            switch (page) {
                case 'dashboard':
                    content = this.renderDashboard();
                    break;
                case 'products':
                    if (args[0] === 'add') content = Products.renderAdd();
                    else if (args[1] === 'edit') content = Products.renderEdit(args[0]);
                    else content = Products.renderList();
                    break;
                case 'orders':
                    if (args[0] === 'add') content = Orders.renderAdd();
                    else if (args[1] === 'ship') content = Orders.renderShip(args[0]);
                    else content = Orders.renderList();
                    break;
                case 'customers':
                    if (args[0] === 'add') content = Customers.renderAdd();
                    else if (args[1] === 'edit') content = Customers.renderEdit(args[0]);
                    else if (args[0]) content = Customers.renderDetail(args[0]);
                    else content = Customers.renderList();
                    break;
                case 'analytics':
                    content = Analytics.render();
                    break;
                case 'expenses':
                    if (args[0] === 'add') content = Expenses.renderAdd();
                    else if (args[1] === 'edit') content = Expenses.renderEdit(args[0]);
                    else content = Expenses.renderList();
                    break;
                case 'classification':
                    content = this.renderClassification();
                    break;
                case 'excel':
                    content = ExcelManager.render();
                    break;
                case 'settings':
                    content = Settings.render();
                    break;
                default:
                    content = this.renderDashboard();
            }
        } catch (e) {
            console.error(e);
            content = `<div class="card"><h2>Error</h2><p>${e.message}</p></div>`;
        }
        main.innerHTML = content;
        setTimeout(() => updateAllTranslations(), 50);
        this.bindPageForms();
    },

    bindPageForms() {
        const productForm = document.getElementById('productForm');
        if (productForm) {
            const args = this.pageArgs;
            const editId = args[1] === 'edit' ? args[0] : null;
            productForm.onsubmit = (e) => {
                e.preventDefault();
                Products.submitForm(editId);
            };
        }
        const customerForm = document.getElementById('customerForm');
        if (customerForm) {
            const args = this.pageArgs;
            const editId = args[1] === 'edit' ? args[0] : null;
            customerForm.onsubmit = (e) => {
                e.preventDefault();
                Customers.submitForm(editId);
            };
        }
        const expenseForm = document.getElementById('expenseForm');
        if (expenseForm) {
            const args = this.pageArgs;
            const editId = args[1] === 'edit' ? args[0] : null;
            expenseForm.onsubmit = (e) => {
                e.preventDefault();
                Expenses.submitForm(editId);
            };
        }
        const orderForm = document.getElementById('orderForm');
        if (orderForm) {
            orderForm.onsubmit = (e) => {
                e.preventDefault();
                Orders.submitForm();
            };
        }
    },

    // ==================== 대시보드 ====================
    renderDashboard() {
        const products = DB.getProducts();
        const orders = DB.getOrders();
        const customers = DB.getCustomers();
        const now = new Date();
        const thisMonthOrders = orders.filter(o => {
            const d = new Date(o.order_date || o.created_at);
            return d.getFullYear() === now.getFullYear() && (d.getMonth() + 1) === (now.getMonth() + 1);
        });
        const completedOrders = orders.filter(o => o.status === 'SHIPPED' || o.status === 'COMPLETED');
        const thisMonthCompleted = completedOrders.filter(o => {
            const d = new Date(o.order_date || o.created_at);
            return d.getFullYear() === now.getFullYear() && (d.getMonth() + 1) === (now.getMonth() + 1);
        });
        const totalSales = thisMonthCompleted.reduce((s, o) => s + (o.selling_price || 0) * (o.quantity || 0), 0);
        const totalProfit = thisMonthCompleted.reduce((s, o) => s + (o.actual_profit || 0), 0);
        const totalStock = products.reduce((s, p) => s + (p.current_stock || 0), 0);
        const lowStock = products.filter(p => {
            const avail = (p.current_stock || 0) - (p.reserved_stock || 0);
            return avail <= 5 && avail > 0;
        });
        const outOfStock = products.filter(p => {
            const avail = (p.current_stock || 0) - (p.reserved_stock || 0);
            return avail <= 0;
        });
        const pendingOrders = orders.filter(o => o.status === 'PENDING');
        const recentOrders = [...orders].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5);

        let html = `
            <div class="card mb-4">
                <h2><i class="fas fa-tachometer-alt"></i> <span data-i18n="dashboard.title">${t('dashboard', 'title')}</span></h2>
                <p class="text-muted" data-i18n="dashboard.welcome">${t('dashboard', 'welcome')}</p>
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-label" data-i18n="dashboard.monthly_sales">${t('dashboard', 'monthly_sales')}</div>
                        <div class="stat-value">${totalSales.toLocaleString()} <span data-i18n="common.currency">${t('common', 'currency')}</span></div>
                        <i class="fas fa-won-sign stat-icon"></i>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label" data-i18n="dashboard.monthly_profit">${t('dashboard', 'monthly_profit')}</div>
                        <div class="stat-value" style="color: #28a745;">${totalProfit.toLocaleString()} <span data-i18n="common.currency">${t('common', 'currency')}</span></div>
                        <i class="fas fa-chart-line stat-icon"></i>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label" data-i18n="dashboard.total_products">${t('dashboard', 'total_products')}</div>
                        <div class="stat-value">${products.length}<span data-i18n="dashboard.items"> ${t('dashboard', 'items')}</span></div>
                        <i class="fas fa-tshirt stat-icon"></i>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label" data-i18n="dashboard.total_orders">${t('dashboard', 'total_orders')}</div>
                        <div class="stat-value">${orders.length}<span data-i18n="dashboard.items"> ${t('dashboard', 'items')}</span></div>
                        <i class="fas fa-shopping-cart stat-icon"></i>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label" data-i18n="dashboard.total_customers">${t('dashboard', 'total_customers')}</div>
                        <div class="stat-value">${customers.length}<span data-i18n="dashboard.items"> ${t('dashboard', 'items')}</span></div>
                        <i class="fas fa-users stat-icon"></i>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label" data-i18n="dashboard.total_products">${t('inventory', 'stock')}</div>
                        <div class="stat-value">${totalStock.toLocaleString()}</div>
                        <i class="fas fa-boxes stat-icon"></i>
                    </div>
                </div>
            </div>
            <div class="form-row" style="gap:1rem; flex-wrap:wrap;">
                <div class="card" style="flex:1; min-width:300px;">
                    <div class="action-bar">
                        <div class="action-bar-left">
                            <h3><i class="fas fa-clock"></i> <span data-i18n="orders.pending">${t('orders', 'pending')}</span> (${pendingOrders.length})</h3>
                        </div>
                        <div class="action-bar-right">
                            <a href="#/orders" class="btn btn-sm btn-secondary"><span data-i18n="dashboard.view_all">${t('dashboard', 'view_all')}</span> <i class="fas fa-arrow-right"></i></a>
                        </div>
                    </div>
        `;
        if (pendingOrders.length === 0) {
            html += `<p class="text-muted" data-i18n="common.no_data">${t('common', 'no_data')}</p>`;
        } else {
            const productNames = {};
            products.forEach(p => productNames[p.id] = p.original_title);
            html += `<div style="overflow-x:auto;"><table class="table"><thead><tr><th data-i18n="orders.order_number">${t('orders', 'order_number')}</th><th data-i18n="orders.product">${t('orders', 'product')}</th><th data-i18n="orders.quantity">${t('orders', 'quantity')}</th><th data-i18n="common.action">${t('common', 'action')}</th></tr></thead><tbody>`;
            pendingOrders.slice(0, 5).forEach(o => {
                html += `
                    <tr>
                        <td><strong>#${o.order_number || o.id}</strong></td>
                        <td>${productNames[o.product_id] || '-'}</td>
                        <td>${o.quantity}</td>
                        <td><a href="#/orders/${o.id}/ship" class="btn btn-sm btn-success"><i class="fas fa-truck"></i> <span data-i18n="orders.ship">${t('orders', 'ship')}</span></a></td>
                    </tr>
                `;
            });
            html += '</tbody></table></div>';
        }
        html += `
                </div>
                <div class="card" style="flex:1; min-width:300px;">
                    <div class="action-bar">
                        <div class="action-bar-left">
                            <h3><i class="fas fa-exclamation-triangle text-warning"></i> <span data-i18n="dashboard.low_stock">${t('dashboard', 'low_stock')}</span></h3>
                        </div>
                        <div class="action-bar-right">
                            <a href="#/products" class="btn btn-sm btn-secondary"><span data-i18n="dashboard.view_all">${t('dashboard', 'view_all')}</span> <i class="fas fa-arrow-right"></i></a>
                        </div>
                    </div>
                    <p class="text-warning"><span data-i18n="dashboard.low_stock">${t('dashboard', 'low_stock')}</span>: <strong>${lowStock.length}</strong></p>
        `;
        const alerts = [...lowStock, ...outOfStock].slice(0, 5);
        if (alerts.length === 0) {
            html += `<p class="text-muted" data-i18n="dashboard.no_low_stock">${t('dashboard', 'no_low_stock')}</p>`;
        } else {
            html += `<table class="table"><thead><tr><th data-i18n="products.title">${t('products', 'title')}</th><th data-i18n="inventory.stock">${t('inventory', 'stock')}</th><th data-i18n="common.status">${t('common', 'status')}</th></tr></thead><tbody>`;
            alerts.forEach(p => {
                const avail = (p.current_stock || 0) - (p.reserved_stock || 0);
                const statusText = avail <= 0 ? t('common', 'out_of_stock') : t('dashboard', 'low_stock');
                html += `
                    <tr>
                        <td>${p.original_title || '-'}</td>
                        <td>${avail} / ${p.current_stock || 0}</td>
                        <td><span class="badge ${avail <= 0 ? 'badge-cancelled' : 'badge-pending'}">${statusText}</span></td>
                    </tr>
                `;
            });
            html += '</tbody></table>';
        }
        html += `
                </div>
            </div>
            <div class="card mt-4">
                <div class="action-bar">
                    <div class="action-bar-left">
                        <h3><i class="fas fa-history"></i> <span data-i18n="dashboard.recent_orders">${t('dashboard', 'recent_orders')}</span></h3>
                    </div>
                    <div class="action-bar-right">
                        <a href="#/orders" class="btn btn-sm btn-secondary"><span data-i18n="dashboard.view_all">${t('dashboard', 'view_all')}</span> <i class="fas fa-arrow-right"></i></a>
                    </div>
                </div>
        `;
        if (recentOrders.length === 0) {
            html += `<p class="text-muted" data-i18n="common.no_data">${t('common', 'no_data')}</p>`;
        } else {
            const productNames = {};
            const customerNames = {};
            products.forEach(p => productNames[p.id] = p.original_title);
            customers.forEach(c => customerNames[c.id] = c.name);
            const statusLabels = { PENDING: 'badge-pending', SHIPPED: 'badge-shipped', COMPLETED: 'badge-completed', CANCELLED: 'badge-cancelled' };
            html += `<div style="overflow-x:auto;"><table class="table"><thead><tr><th data-i18n="orders.order_number">${t('orders', 'order_number')}</th><th data-i18n="orders.customer">${t('orders', 'customer')}</th><th data-i18n="orders.product">${t('orders', 'product')}</th><th data-i18n="orders.selling_price">${t('orders', 'selling_price')}</th><th data-i18n="orders.status">${t('orders', 'status')}</th></tr></thead><tbody>`;
            recentOrders.forEach(o => {
                const statusKey = (o.status || 'PENDING').toLowerCase();
                html += `
                    <tr>
                        <td><strong>#${o.order_number || o.id}</strong></td>
                        <td>${customerNames[o.customer_id] || '-'}</td>
                        <td>${productNames[o.product_id] || '-'}</td>
                        <td class="font-bold">${((o.selling_price || 0) * (o.quantity || 0)).toLocaleString()} <span data-i18n="common.currency">${t('common', 'currency')}</span></td>
                        <td><span class="badge ${statusLabels[o.status] || 'badge-pending'}">${t('orders', statusKey)}</span></td>
                    </tr>
                `;
            });
            html += '</tbody></table></div>';
        }
        html += '</div>';
        return html;
    },

    // ==================== 분류키워드 ====================
    renderClassification() {
        const keywords = DB.getKeywords();
        const testTitles = ClassificationService.getTestTitles();
        const groups = {
            category: { label: t('classification', 'type_category'), icon: 'fas fa-tags', color: '#8b5cf6', keywords: [] },
            color: { label: t('classification', 'type_color'), icon: 'fas fa-palette', color: '#ec4899', keywords: [] },
            brand: { label: t('classification', 'type_brand'), icon: 'fas fa-building', color: '#3b82f6', keywords: [] },
            size: { label: t('classification', 'type_size'), icon: 'fas fa-ruler', color: '#10b981', keywords: [] },
            material: { label: t('classification', 'type_material'), icon: 'fas fa-layer-group', color: '#f59e0b', keywords: [] },
            style: { label: t('classification', 'type_style') || 'Style', icon: 'fas fa-tshirt', color: '#06b6d4', keywords: [] },
            pattern: { label: t('classification', 'type_pattern') || 'Pattern', icon: 'fas fa-th', color: '#84cc16', keywords: [] },
            fit: { label: t('classification', 'type_fit') || 'Fit', icon: 'fas fa-user', color: '#f97316', keywords: [] },
            other: { label: t('classification', 'type_other'), icon: 'fas fa-cubes', color: '#6b7280', keywords: [] }
        };
        keywords.forEach(k => {
            const kType = k.type || k.classification_type || '';
            if (groups[kType]) {
                groups[kType].keywords.push(k);
            } else {
                groups.other.keywords.push(k);
            }
        });

        const renderGroup = (groupKey, group) => {
            if (group.keywords.length === 0) return '';
            const showAllKey = 'showAll_' + groupKey;
            const isExpanded = this[showAllKey] === true;
            const displayCount = isExpanded ? group.keywords.length : Math.min(3, group.keywords.length);
            const displayedKeywords = group.keywords.slice(0, displayCount);
            let groupHtml = '<div style="margin-top: 24px; border-left: 4px solid ' + group.color + '; padding-left: 12px; border-radius: 4px;">';
            groupHtml += '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">';
            groupHtml += '<div style="display: flex; align-items: center; gap: 10px;">';
            groupHtml += '<i class="' + group.icon + '" style="color: ' + group.color + '; font-size: 18px;"></i>';
            groupHtml += '<h3 style="margin: 0; font-size: 16px;">' + group.label + ' <span class="badge badge-secondary">' + group.keywords.length + '</span></h3>';
            groupHtml += '</div>';
            if (group.keywords.length > 3) {
                const btnText = isExpanded ? t('classification', 'show_less') : t('classification', 'show_all');
                groupHtml += '<button class="btn btn-sm btn-outline-primary" onclick="App.toggleKeywordGroup(\'' + groupKey + '\')">' + btnText + '</button>';
            }
            groupHtml += '</div>';
            groupHtml += '<div style="overflow-x:auto;"><table class="table table-sm">';
            groupHtml += '<thead><tr>';
            groupHtml += '<th style="width:40px;"><input type="checkbox" class="select-all-cb" data-target="keywords"></th>';
            groupHtml += '<th>' + t('classification', 'standard') + '</th>';
            groupHtml += '<th>' + t('classification', 'ko_keywords') + '</th>';
            groupHtml += '<th>' + t('classification', 'zh_keywords') + '</th>';
            groupHtml += '<th>' + t('classification', 'en_keywords') + '</th>';
            groupHtml += '<th>' + t('classification', 'ja_keywords') + '</th>';
            groupHtml += '<th>' + t('classification', 'priority') + '</th>';
            groupHtml += '<th>' + t('common', 'status') + '</th>';
            groupHtml += '<th>' + t('common', 'action') + '</th>';
            groupHtml += '</tr></thead><tbody>';
            const self = this;
            displayedKeywords.forEach(function(k) {
                const kType = k.type || k.classification_type || '';
                const kStandard = k.standard || k.standard_value || '';
                const isEditing = String(self.editingKeywordId) === String(k.id);
                const isActive = k.is_active !== false;
                groupHtml += '<tr' + (isEditing ? ' style="background:#eef3ff;"' : '') + '>';
                groupHtml += '<td><input type="checkbox" class="row-checkbox" data-id="' + k.id + '" data-target="keywords"' + (self.classificationSelected.has(String(k.id)) ? ' checked' : '') + '></td>';
                groupHtml += '<td><strong style="color: ' + group.color + ';">' + kStandard + '</strong></td>';
                groupHtml += '<td>' + (k.ko || []).join(', ') + '</td>';
                groupHtml += '<td>' + (k.zh || []).join(', ') + '</td>';
                groupHtml += '<td>' + (k.en || []).join(', ') + '</td>';
                groupHtml += '<td>' + (k.ja || []).join(', ') + '</td>';
                groupHtml += '<td>' + (k.priority || 5) + '</td>';
                groupHtml += '<td><span class="badge ' + (isActive ? 'badge-completed' : 'badge-cancelled') + '">' + (isActive ? t('classification', 'active') : t('classification', 'inactive')) + '</span></td>';
                groupHtml += '<td>';
                groupHtml += '<button class="btn btn-sm ' + (isEditing ? 'btn-warning' : 'btn-secondary') + '" onclick="App.toggleEditKeyword(\'' + k.id + '\')"><i class="fas fa-edit"></i></button> ';
                groupHtml += '<button class="btn btn-sm btn-danger" onclick="App.deleteKeyword(\'' + k.id + '\')"><i class="fas fa-trash"></i></button>';
                groupHtml += '</td></tr>';
                if (isEditing) {
                    groupHtml += '<tr style="background:#f8f9fa;"><td colspan="9">';
                    groupHtml += '<form id="keywordEditForm_' + k.id + '" onsubmit="App.submitKeywordForm(event, \'' + k.id + '\')" style="padding:12px 8px;">';
                    groupHtml += '<div class="form-row">';
                    groupHtml += '<div class="form-group"><label>' + t('classification', 'type') + '</label><select class="form-control" name="type" required>';
                    ['brand','category','color','size','material','style','pattern','fit'].forEach(function(tp){
                        groupHtml += '<option value="' + tp + '"' + (kType === tp ? ' selected' : '') + '>' + tp.charAt(0).toUpperCase() + tp.slice(1) + '</option>';
                    });
                    groupHtml += '</select></div>';
                    groupHtml += '<div class="form-group"><label>' + t('classification', 'standard') + '</label><input type="text" class="form-control" name="standard" value="' + kStandard + '" required></div>';
                    groupHtml += '<div class="form-group"><label>' + t('classification', 'priority') + '</label><input type="number" class="form-control" name="priority" value="' + (k.priority || 5) + '" min="1" max="10"></div>';
                    groupHtml += '</div>';
                    groupHtml += '<div class="form-row">';
                    groupHtml += '<div class="form-group"><label>' + t('classification', 'ko_keywords') + '</label><input type="text" class="form-control" name="ko" value="' + (k.ko || []).join(', ') + '"></div>';
                    groupHtml += '<div class="form-group"><label>' + t('classification', 'zh_keywords') + '</label><input type="text" class="form-control" name="zh" value="' + (k.zh || []).join(', ') + '"></div>';
                    groupHtml += '</div>';
                    groupHtml += '<div class="form-row">';
                    groupHtml += '<div class="form-group"><label>' + t('classification', 'en_keywords') + '</label><input type="text" class="form-control" name="en" value="' + (k.en || []).join(', ') + '"></div>';
                    groupHtml += '<div class="form-group"><label>' + t('classification', 'ja_keywords') + '</label><input type="text" class="form-control" name="ja" value="' + (k.ja || []).join(', ') + '"></div>';
                    groupHtml += '</div>';
                    groupHtml += '<div class="d-flex align-items-center gap-2">';
                    groupHtml += '<label class="checkbox-wrapper" style="margin:0;"><input type="checkbox" name="active"' + (isActive ? ' checked' : '') + '><span>' + t('classification', 'active') + '</span></label>';
                    groupHtml += '<div class="d-flex gap-2 ml-auto">';
                    groupHtml += '<button type="submit" class="btn btn-primary btn-sm"><i class="fas fa-save"></i> ' + t('classification', 'save_keyword') + '</button> ';
                    groupHtml += '<button type="button" class="btn btn-secondary btn-sm" onclick="App.cancelEditKeyword()">' + t('common', 'cancel') + '</button>';
                    groupHtml += '</div></div></form></td></tr>';
                }
            });
            groupHtml += '</tbody></table></div></div>';
            return groupHtml;
        };

        let html = `
            <div class="card">
                <div class="action-bar">
                    <div class="action-bar-left">
                        <h2><i class="fas fa-magic"></i> <span data-i18n="classification.title">${t('classification', 'title')}</span></h2>
                    </div>
                    <div class="action-bar-right">
                        <button class="btn btn-secondary" onclick="App.cleanupDuplicateKeywords()">
                            <i class="fas fa-broom"></i> <span data-i18n="classification.cleanup_duplicates">${t('classification', 'cleanup_duplicates')}</span>
                        </button>
                        <button class="btn btn-secondary" onclick="App.initDefaultKeywords()">
                            <i class="fas fa-cogs"></i> <span data-i18n="classification.init_default">${t('classification', 'init_default')}</span>
                        </button>
                        <button class="btn btn-primary" onclick="App.showKeywordForm()">
                            <i class="fas fa-plus"></i> <span data-i18n="classification.add_keyword">${t('classification', 'add_keyword')}</span>
                        </button>
                    </div>
                </div>
                <p class="text-muted" data-i18n="classification.keyword_help">${t('classification', 'keyword_help')}</p>
                <div id="keywordFormArea"></div>
                <div class="action-bar">
                    <div class="action-bar-left">
                        <label class="checkbox-wrapper">
                            <input type="checkbox" class="select-all-cb" data-target="keywords">
                            ${t('products', 'select_all')}
                        </label>
                        <button class="btn btn-sm btn-danger" onclick="App.batchDeleteKeywords()">
                            <i class="fas fa-trash"></i> ${t('products', 'delete')}
                        </button>
                    </div>
                </div>
                <h3 class="mt-4"><i class="fas fa-list"></i> <span data-i18n="classification.keyword_manage">${t('classification', 'keyword_manage')}</span> (${keywords.length})</h3>
        `;
        if (keywords.length === 0) {
            html += `<p class="text-muted" data-i18n="classification.no_keywords">${t('classification', 'no_keywords')}</p>`;
        } else {
            for (const [groupKey, group] of Object.entries(groups)) {
                html += renderGroup(groupKey, group);
            }
        }
        html += `</div>
            <div class="card mt-4">
                <h2><i class="fas fa-flask"></i> <span data-i18n="classification.test_title">${t('classification', 'test_title')}</span></h2>
                <p class="text-muted" data-i18n="classification.test_explanation">${t('classification', 'test_explanation')}</p>
                <div class="form-group">
                    <label data-i18n="classification.product_title_input">${t('classification', 'product_title_input')}</label>
                    <div class="d-flex gap-2">
                        <input type="text" class="form-control" id="classifyInput" placeholder="SYSTEM 羊毛 니트 cream FREE">
                        <button class="btn btn-primary" onclick="App.runClassifyTest()">
                            <i class="fas fa-play"></i> <span data-i18n="classification.run_test">${t('classification', 'run_test')}</span>
                        </button>
                    </div>
                </div>
                <div class="mt-3">
                    <h4 data-i18n="classification.direct_test">${t('classification', 'direct_test')}</h4>
                    <div class="d-flex flex-wrap gap-2">
                        ${testTitles.map(title => `
                            <button class="btn btn-sm btn-secondary" onclick="document.getElementById('classifyInput').value='${title.replace(/'/g, "\\'")}'; App.runClassifyTest();">
                                ${title}
                            </button>
                        `).join('')}
                    </div>
                </div>
                <div id="classifyResult"></div>
            </div>
        `;
        return html;
    },

    showKeywordForm(keyword = null) {
        const isEdit = !!keyword;
        const k = keyword || { type: 'brand', classification_type: 'brand', standard: '', standard_value: '', ko: [], zh: [], en: [], ja: [], priority: 5, is_active: true };
        const kType = k.type || k.classification_type || 'brand';
        const kStandard = k.standard || k.standard_value || '';
        const html = `
            <div class="card mt-3" style="background: #f8f9fa;">
                <h4>${isEdit ? t('classification', 'edit') : t('classification', 'add_keyword')}</h4>
                <form id="keywordForm" onsubmit="App.submitKeywordForm(event, ${isEdit ? `'${k.id}'` : 'null'})">
                    <div class="form-row">
                        <div class="form-group">
                            <label data-i18n="classification.type">${t('classification', 'type')}</label>
                            <select class="form-control" name="type" required>
                                <option value="brand" ${kType === 'brand' ? 'selected' : ''}>Brand</option>
                                <option value="category" ${kType === 'category' ? 'selected' : ''}>Category</option>
                                <option value="color" ${kType === 'color' ? 'selected' : ''}>Color</option>
                                <option value="size" ${kType === 'size' ? 'selected' : ''}>Size</option>
                                <option value="material" ${kType === 'material' ? 'selected' : ''}>Material</option>
                                <option value="style" ${kType === 'style' ? 'selected' : ''}>Style</option>
                                <option value="pattern" ${kType === 'pattern' ? 'selected' : ''}>Pattern</option>
                                <option value="fit" ${kType === 'fit' ? 'selected' : ''}>Fit</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label data-i18n="classification.standard">${t('classification', 'standard')}</label>
                            <input type="text" class="form-control" name="standard" value="${kStandard}" required placeholder="${t('classification', 'enter_standard')}">
                        </div>
                        <div class="form-group">
                            <label data-i18n="classification.priority">${t('classification', 'priority')}</label>
                            <input type="number" class="form-control" name="priority" value="${k.priority || 5}" min="1" max="10">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label data-i18n="classification.ko_keywords">${t('classification', 'ko_keywords')}</label>
                            <input type="text" class="form-control" name="ko" value="${(k.ko || []).join(', ')}" placeholder="${t('classification', 'enter_ko')}">
                        </div>
                        <div class="form-group">
                            <label data-i18n="classification.zh_keywords">${t('classification', 'zh_keywords')}</label>
                            <input type="text" class="form-control" name="zh" value="${(k.zh || []).join(', ')}" placeholder="${t('classification', 'enter_zh')}">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label data-i18n="classification.en_keywords">${t('classification', 'en_keywords')}</label>
                            <input type="text" class="form-control" name="en" value="${(k.en || []).join(', ')}" placeholder="${t('classification', 'enter_en')}">
                        </div>
                        <div class="form-group">
                            <label data-i18n="classification.ja_keywords">${t('classification', 'ja_keywords')}</label>
                            <input type="text" class="form-control" name="ja" value="${(k.ja || []).join(', ')}" placeholder="${t('classification', 'enter_ja')}">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>
                            <input type="checkbox" name="active" ${k.is_active !== false ? 'checked' : ''}>
                            <span data-i18n="classification.active">${t('classification', 'active')}</span>
                        </label>
                    </div>
                    <p class="text-muted"><small data-i18n="classification.keyword_hint">${t('classification', 'keyword_hint')}</small></p>
                    <div class="d-flex gap-2">
                        <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> <span data-i18n="classification.save_keyword">${t('classification', 'save_keyword')}</span></button>
                        <button type="button" class="btn btn-secondary" onclick="App.render()"><span data-i18n="common.cancel">${t('common', 'cancel')}</span></button>
                    </div>
                </form>
            </div>
        `;
        document.getElementById('keywordFormArea').innerHTML = html;
        updateAllTranslations();
    },

    submitKeywordForm(e, editId) {
        e.preventDefault();
        const form = e.target;
        const formData = new FormData(form);
        const data = {
            type: formData.get('type'),
            classification_type: formData.get('type'),
            standard: formData.get('standard'),
            standard_value: formData.get('standard'),
            priority: parseInt(formData.get('priority')) || 5,
            is_active: form.querySelector('[name="active"]').checked,
            ko: (formData.get('ko') || '').split(',').map(s => s.trim()).filter(Boolean),
            zh: (formData.get('zh') || '').split(',').map(s => s.trim()).filter(Boolean),
            en: (formData.get('en') || '').split(',').map(s => s.trim()).filter(Boolean),
            ja: (formData.get('ja') || '').split(',').map(s => s.trim()).filter(Boolean),
        };
        if (editId) {
            DB.updateKeyword(Number(editId), data);
            this.editingKeywordId = null;
        } else {
            DB.addKeyword(data);
        }
        this.flash(t('settings', 'save_success'), 'success');
        this.render();
    },

    toggleKeywordGroup(groupKey) {
        const showAllKey = 'showAll_' + groupKey;
        this[showAllKey] = !this[showAllKey];
        App.renderPage();
    },

    toggleEditKeyword(id) {
        if (String(this.editingKeywordId) === String(id)) {
            this.editingKeywordId = null;
        } else {
            this.editingKeywordId = Number(id);
        }
        App.renderPage();
    },

    cancelEditKeyword() {
        this.editingKeywordId = null;
        App.renderPage();
    },

    deleteKeyword(id) {
        if (confirm(t('products', 'confirm_delete'))) {
            DB.deleteKeyword(id);
            this.flash(t('settings', 'save_success'), 'success');
            this.render();
        }
    },

    toggleKeywordSelect(id) {
        const strId = String(id);
        if (this.classificationSelected.has(strId)) {
            this.classificationSelected.delete(strId);
        } else {
            this.classificationSelected.add(strId);
        }
        App.renderPage();
    },

    toggleKeywordSelectAll() {
        const keywords = DB.getKeywords();
        const total = keywords.length;
        const selectedCount = keywords.filter(k => this.classificationSelected.has(String(k.id))).length;
        if (selectedCount === total) {
            this.classificationSelected.clear();
        } else {
            this.classificationSelected.clear();
            keywords.forEach(k => this.classificationSelected.add(String(k.id)));
        }
        App.renderPage();
    },

    batchDeleteKeywords() {
        if (this.classificationSelected.size === 0) {
            this.flash(t('common', 'please_select'), 'warning');
            return;
        }
        if (!confirm(this.classificationSelected.size + t('common', 'confirm_delete_items'))) return;
        const selectedIds = Array.from(this.classificationSelected);
        selectedIds.forEach(id => DB.deleteKeyword(id));
        this.classificationSelected.clear();
        this.flash(t('common', 'delete') + '!', 'success');
        this.render();
    },

    initDefaultKeywords() {
        if (!confirm(t('classification', 'init_help'))) return;
        const added = ClassificationService.initDefaultKeywords();
        this.flash(t('settings', 'save_success') + ' (' + added + ' ' + t('classification', 'keywords_added') + ')', 'success');
        this.render();
    },

    cleanupDuplicateKeywords() {
        if (!confirm(t('classification', 'cleanup_confirm'))) return;
        const keywords = DB.getKeywords();
        const seen = new Map();
        const toDelete = [];
        keywords.forEach(k => {
            const kType = k.type || k.classification_type || '';
            const kStandard = (k.standard || k.standard_value || '').toLowerCase().trim();
            const key = kType + '|' + kStandard;
            if (seen.has(key)) {
                toDelete.push(k.id);
            } else {
                seen.set(key, k.id);
            }
        });
        toDelete.forEach(id => DB.deleteKeyword(id));
        this.flash(t('classification', 'cleanup_done') + ' (' + toDelete.length + ' ' + t('classification', 'items_deleted') + ')', 'success');
        this.render();
    },

    runClassifyTest() {
        const title = document.getElementById('classifyInput').value;
        if (!title) {
            this.flash(t('common', 'enter_product_name'), 'warning');
            return;
        }
        const result = ClassificationService.classify(title);
        const statusLabels = {
            auto_complete: t('status', 'auto_complete'),
            needs_review: t('status', 'needs_review'),
            failed: t('status', 'failed')
        };
        const confidenceKey = 'confidence_' + (result.confidence || 'low');
        const html = `
            <div class="info-box mt-4" style="background: #f0f7ff; border: 1px solid #b3d9ff; padding: 1rem; border-radius: 8px;">
                <h4 style="color: #0066cc;"><i class="fas fa-magic"></i> <span data-i18n="products.classification_result">${t('products', 'classification_result')}</span></h4>
                <div class="form-row mb-3">
                    <div class="form-group" style="flex: 1; margin-bottom: 0.5rem;">
                        <strong><span data-i18n="common.reliability">${t('common', 'reliability')}</span>:</strong> ${t('common', confidenceKey)}
                    </div>
                    <div class="form-group" style="flex: 1; margin-bottom: 0.5rem;">
                        <strong><span data-i18n="common.status">${t('common', 'status')}</span>:</strong> ${statusLabels[result.classification_status] || '-'}
                    </div>
                    <div class="form-group" style="flex: 1; margin-bottom: 0.5rem;">
                        <strong><span data-i18n="classification.detected_lang">${t('classification', 'detected_lang')}</span>:</strong> ${result.detected_language || '-'}
                    </div>
                </div>
                <table class="table">
                    <tr><th data-i18n="products.brand">${t('products', 'brand')}</th><td>${result.brand || '-'}</td></tr>
                    <tr><th data-i18n="products.category">${t('products', 'category')}</th><td>${result.category || '-'}</td></tr>
                    <tr><th data-i18n="products.color">${t('products', 'color')}</th><td>${result.color || '-'}</td></tr>
                    <tr><th data-i18n="products.size">${t('products', 'size')}</th><td>${result.size || '-'}</td></tr>
                    <tr><th data-i18n="products.material">${t('products', 'material')}</th><td>${result.material || '-'}</td></tr>
                </table>
            </div>
        `;
        document.getElementById('classifyResult').innerHTML = html;
        updateAllTranslations();
    },

    flash(message, type = 'info') {
        const colors = { success: '#10b981', error: '#ef4444', warning: '#f59e0b', info: '#3b82f6' };
        const flash = document.createElement('div');
        flash.style.cssText = `position: fixed; top: 20px; right: 20px; padding: 1rem 1.5rem; background: ${colors[type] || colors.info}; color: white; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 9999; font-weight: 500; animation: slideIn 0.3s ease;`;
        flash.textContent = message;
        document.body.appendChild(flash);
        setTimeout(() => {
            flash.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => flash.remove(), 300);
        }, 2500);
    }
};

const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
    .d-flex { display: flex; }
    .gap-2 { gap: 0.5rem; }
    .gap-1 { gap: 0.25rem; }
    .flex-wrap { flex-wrap: wrap; }
    .mt-3 { margin-top: 1rem; }
    .mt-4 { margin-top: 1.5rem; }
    .mb-3 { margin-bottom: 1rem; }
    .mb-4 { margin-bottom: 1.5rem; }
    .text-muted { color: #6c757d; }
    .text-warning { color: #f59e0b; }
    .font-bold { font-weight: 700; }
`;
document.head.appendChild(style);

// Expose App globally so app-bootstrap.js can control initialization.
// The auto DOMContentLoaded bootstrap was removed; app-bootstrap.js now drives App.init().
if (typeof window !== 'undefined') {
    window.App = App;
} else if (typeof globalThis !== 'undefined') {
    globalThis.App = App;
}
