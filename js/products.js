const Products = {
    state: {
        products: [],
        filtered: [],
        search: '',
        sortBy: 'brand',
        sortOrder: 'asc',
        stockYear: new Date().getFullYear(),
        stockMonth: new Date().getMonth() + 1,
        selected: new Set(),
        editingId: null
    },

    load() {
        this.state.products = DB.getProducts();
        this.applyFilters();
    },

    applyFilters() {
        let list = [...this.state.products];
        if (this.state.stockYear) {
            list = list.filter(p => p.stock_year === this.state.stockYear);
        }
        if (this.state.stockMonth) {
            list = list.filter(p => p.stock_month === this.state.stockMonth);
        }
        if (this.state.search) {
            const s = this.state.search.toLowerCase();
            list = list.filter(p =>
                (p.original_title || '').toLowerCase().includes(s) ||
                (p.brand || '').toLowerCase().includes(s) ||
                (p.category || '').toLowerCase().includes(s) ||
                (p.color || '').toLowerCase().includes(s) ||
                (p.size || '').toLowerCase().includes(s) ||
                (p.brand || '').toLowerCase().includes(s)
            );
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

    renderList() {
        this.load();
        const list = this.state.filtered;
        const totalStock = list.reduce((sum, p) => sum + (p.current_stock || 0), 0);
        let html = `
            <div class="card">
                <div class="action-bar">
                    <div class="action-bar-left">
                        <h2><i class="fas fa-tshirt"></i> ${t('products', 'title')}</h2>
                    </div>
                    <div class="action-bar-right">
                        <a href="#/products/add" class="btn btn-primary">
                            <i class="fas fa-plus"></i> ${t('products', 'add')}
                        </a>
                    </div>
                </div>
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-label">${t('products', 'total_count')}</div>
                        <div class="stat-value">${list.length}</div>
                        <i class="fas fa-tshirt stat-icon"></i>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">${t('products', 'total_stock')}</div>
                        <div class="stat-value">${totalStock.toLocaleString()}</div>
                        <i class="fas fa-boxes stat-icon"></i>
                    </div>
                </div>
                <div class="filter-row">
                    <div class="form-group">
                        <label>${t('common', 'stock_year')}</label>
                        <select class="form-control" onchange="Products.setYear(this.value)">
                            ${this.yearOptions()}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>${t('common', 'stock_month')}</label>
                        <select class="form-control" onchange="Products.setMonth(this.value)">
                            ${this.monthOptions()}
                        </select>
                    </div>
                    <div class="form-group search-box">
                        <label>${t('products', 'search')}</label>
                        <input type="text" class="form-control" placeholder="${t('products', 'search')}..."
                            value="${this.state.search}" oninput="Products.setSearch(this.value)">
                    </div>
                </div>
                <div class="action-bar">
                    <div class="action-bar-left">
                        <label class="checkbox-wrapper">
                            <input type="checkbox" class="select-all-cb" data-target="products">
                            ${t('products', 'select_all')}
                        </label>
                        <button class="btn btn-sm btn-secondary" onclick="Products.batchMonthChange()">
                            <i class="fas fa-calendar"></i> ${t('products', 'change_month')}
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="Products.batchDelete()">
                            <i class="fas fa-trash"></i> ${t('products', 'delete')}
                        </button>
                    </div>
                </div>
        `;
        if (list.length === 0) {
            html += `
                <div class="empty-state">
                    <i class="fas fa-tshirt"></i>
                    <p>${t('common', 'no_data')}</p>
                </div>
            `;
        } else {
            html += `
                <div style="overflow-x:auto;">
                <table class="table">
                    <thead>
                        <tr>
                            <th style="width:40px;"><input type="checkbox" class="select-all-cb" data-target="products"></th>
                            <th>${t('common', 'image')}</th>
                            <th onclick="Products.sort('brand')" class="${this.state.sortBy === 'brand' ? 'sort-active' : ''}">
                                ${t('products', 'brand')}
                                <i class="fas fa-sort-${this.state.sortOrder === 'asc' ? 'up' : 'down'}"></i>
                            </th>
                            <th>${t('common', 'original_title')}</th>
                            <th>${t('products', 'category')}</th>
                            <th>${t('products', 'color')}</th>
                            <th>${t('products', 'size')}</th>
                            <th onclick="Products.sort('korea_cost')" class="${this.state.sortBy === 'korea_cost' ? 'sort-active' : ''}">
                                ${t('products', 'korea_cost')}
                                <i class="fas fa-sort-${this.state.sortOrder === 'asc' ? 'up' : 'down'}"></i>
                            </th>
                            <th>${t('products', 'base_price')}</th>
                            <th onclick="Products.sort('current_stock')" class="${this.state.sortBy === 'current_stock' ? 'sort-active' : ''}">
                                ${t('inventory', 'stock')}
                                <i class="fas fa-sort-${this.state.sortOrder === 'asc' ? 'up' : 'down'}"></i>
                            </th>
                            <th>${t('common', 'action')}</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            list.forEach(p => {
                const available = (p.current_stock || 0) - (p.reserved_stock || 0);
                const stockStatus = available <= 0 ? 'text-danger' : available <= 5 ? 'text-warning' : '';
                html += `
                    <tr>
                        <td><input type="checkbox" class="row-checkbox" data-id="${p.id}" data-target="products" ${this.state.selected.has(Number(p.id)) ? 'checked' : ''}></td>
                        <td>${p.image ? `<img src="${p.image}" class="product-thumb">` : '-'}</td>
                        <td><strong>${p.brand || '-'}</strong></td>
                        <td>${p.original_title || '-'}</td>
                        <td>${p.category || '-'}</td>
                        <td>${p.color || '-'}</td>
                        <td>${p.size || '-'}</td>
                        <td>${(p.korea_cost || 0).toLocaleString()} ${t('common', 'currency_kr')}</td>
                        <td class="font-bold">${(p.china_base_price || 0).toLocaleString()} ${t('common', 'currency')}</td>
                        <td class="${stockStatus}">${available} / ${p.current_stock || 0}</td>
                        <td>
                            <a href="#/products/${p.id}/edit" class="btn btn-sm btn-secondary">
                                <i class="fas fa-edit"></i>
                            </a>
                            <button class="btn btn-sm btn-danger" onclick="Products.delete(${p.id})">
                                <i class="fas fa-trash"></i>
                            </button>
                        </td>
                    </tr>
                `;
            });
            html += '</tbody></table></div>';
        }
        html += '</div>';
        setTimeout(() => this.updateSelectAllCheckbox(), 0);
        return html;
    },

    yearOptions() {
        let html = '';
        for (let y = 2025; y <= 2030; y++) {
            html += `<option value="${y}" ${this.state.stockYear === y ? 'selected' : ''}>${y}${t('common', 'year_suffix')}</option>`;
        }
        return html;
    },

    monthOptions() {
        let html = '';
        for (let m = 1; m <= 12; m++) {
            html += `<option value="${m}" ${this.state.stockMonth === m ? 'selected' : ''}>${m}${t('common', 'month_suffix')}</option>`;
        }
        return html;
    },

    setYear(val) {
        this.state.stockYear = parseInt(val);
        App.render();
    },

    setMonth(val) {
        this.state.stockMonth = parseInt(val);
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
        const selectedCount = this.state.filtered.filter(p => this.state.selected.has(Number(p.id))).length;
        if (selectedCount === total) {
            this.state.selected.clear();
        } else {
            this.state.selected.clear();
            this.state.filtered.forEach(p => this.state.selected.add(Number(p.id)));
        }
        App.renderPage();
    },

    batchMonthChange() {
        if (this.state.selected.size === 0) {
            App.flash(t('common', 'please_select'), 'warning');
            return;
        }
        const year = prompt(t('common', 'stock_year') + ' (2025~):');
        if (!year) return;
        const month = prompt(t('common', 'stock_month') + ' (1~12):');
        if (!month) return;
        const y = parseInt(year);
        const m = parseInt(month);
        if (isNaN(y) || isNaN(m) || y < 2025 || m < 1 || m > 12) {
            App.flash(t('common', 'invalid_input'), 'error');
            return;
        }
        const products = DB.getProducts();
        products.forEach(p => {
            if (this.state.selected.has(p.id)) {
                p.stock_year = y;
                p.stock_month = m;
                p.updated_at = new Date().toISOString();
            }
        });
        DB.setProducts(products);
        this.state.selected.clear();
        this.state.stockYear = y;
        this.state.stockMonth = m;
        App.flash(t('common', 'save') + '!', 'success');
        App.render();
    },

    batchDelete() {
        if (this.state.selected.size === 0) {
            App.flash(t('common', 'please_select'), 'warning');
            return;
        }
        if (!confirm(this.state.selected.size + t('common', 'confirm_delete_items'))) return;
        const products = DB.getProducts().filter(p => !this.state.selected.has(p.id));
        DB.setProducts(products);
        this.state.selected.clear();
        App.flash(t('common', 'delete') + '!', 'success');
        App.render();
    },

    delete(id) {
        if (!confirm(t('common', 'confirm_delete') + '?')) return;
        DB.deleteProduct(id);
        App.flash(t('common', 'delete') + '!', 'success');
        App.render();
    },

    renderAdd() {
        return this.renderForm(null);
    },

    renderEdit(id) {
        const product = DB.getProducts().find(p => p.id === parseInt(id));
        if (!product) {
            App.flash(t('common', 'product_not_found'), 'error');
            location.hash = '#/products';
            return '';
        }
        return this.renderForm(product);
    },

    renderForm(product) {
        const isEdit = !!product;
        const p = product || {
            original_title: '', brand: '', category: '', color: '', size: '', material: '',
            korea_cost: 0, current_stock: 0, stock_year: this.state.stockYear,
            stock_month: this.state.stockMonth, image: '', notes: ''
        };
        const priceResult = PriceCalculator.calculate(p.korea_cost || 0);
        return `
            <div class="card">
                <h2><i class="fas fa-plus text-primary"></i> ${isEdit ? t('products', 'edit') : t('products', 'add')}</h2>
                <div id="classificationResult" class="info-box mb-4" style="display: none; background: #f0f7ff; border: 1px solid #b3d9ff;">
                    <h4 style="color: #0066cc;"><i class="fas fa-magic"></i> ${t('products', 'classification_result')}</h4>
                    <div class="form-row mb-3">
                        <div class="form-group" style="flex: 1;">
                            <strong>${t('common', 'reliability')}:</strong> <span id="confidence">-</span>
                        </div>
                        <div class="form-group" style="flex: 1;">
                            <strong>${t('common', 'status')}:</strong> <span id="classificationStatus">-</span>
                        </div>
                    </div>
                    <div class="form-row mb-3">
                        <div class="form-group" style="flex: 1;">
                            <strong>${t('products', 'brand')}:</strong> <span id="resultBrand">-</span>
                        </div>
                        <div class="form-group" style="flex: 1;">
                            <strong>${t('products', 'category')}:</strong> <span id="resultCategory">-</span>
                        </div>
                        <div class="form-group" style="flex: 1;">
                            <strong>${t('products', 'color')}:</strong> <span id="resultColor">-</span>
                        </div>
                        <div class="form-group" style="flex: 1;">
                            <strong>${t('products', 'size')}:</strong> <span id="resultSize">-</span>
                        </div>
                    </div>
                </div>
                <form id="productForm">
                    <div class="form-group">
                        <label>${t('common', 'original_title')} *</label>
                        <input type="text" name="original_title" id="original_title" required class="form-control"
                            value="${p.original_title}" placeholder="${t('common', 'example')}: SYSTEM 羊毛 니트 cream FREE">
                    </div>
                    <div class="form-group">
                        <label>${t('products', 'brand')} *</label>
                        <input type="text" name="brand" id="brand" required class="form-control" value="${p.brand}">
                    </div>
                    <button type="button" class="btn btn-info mb-4" onclick="Products.runClassification()">
                        <i class="fas fa-magic"></i> ${t('products', 'run_auto_classify')}
                    </button>
                    <h3 class="mb-3"><i class="fas fa-tags"></i> ${t('products', 'classification_info')} (${t('common', 'optional_input')})</h3>
                    <div class="form-row">
                        <div class="form-group">
                            <label>${t('products', 'category')}</label>
                            <input type="text" name="category" id="category" class="form-control" value="${p.category}">
                        </div>
                        <div class="form-group">
                            <label>${t('products', 'color')}</label>
                            <input type="text" name="color" id="color" class="form-control" value="${p.color}">
                        </div>
                        <div class="form-group">
                            <label>${t('products', 'size')}</label>
                            <input type="text" name="size" id="size" class="form-control" value="${p.size}">
                        </div>
                        <div class="form-group">
                            <label>${t('products', 'material')}</label>
                            <input type="text" name="material" id="material" class="form-control" value="${p.material}">
                        </div>
                    </div>
                    <h3 class="mb-3"><i class="fas fa-coins"></i> ${t('products', 'price_info')}</h3>
                    <div class="form-row">
                        <div class="form-group">
                            <label>${t('products', 'korea_cost')} *</label>
                            <input type="number" name="korea_cost" id="korea_cost" required class="form-control"
                                value="${p.korea_cost}" oninput="Products.calcPrice()" step="100">
                        </div>
                        <div class="form-group">
                            <label>${t('products', 'converted_cost')} (${t('common', 'currency')})</label>
                            <input type="text" id="actual_converted_cost" class="form-control"
                                value="${priceResult.actual_converted_cost.toLocaleString()}" readonly>
                        </div>
                        <div class="form-group">
                            <label>${t('products', 'base_price')} (${t('common', 'currency')})</label>
                            <input type="text" id="china_base_price" class="form-control"
                                value="${priceResult.china_base_price.toLocaleString()}" readonly>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group" style="flex: 1;">
                            <label>${t('common', 'initial_stock')} *</label>
                            <input type="number" name="current_stock" required class="form-control"
                                value="${p.current_stock}" min="0">
                        </div>
                        <div class="form-group" style="flex: 1;">
                            <label>${t('common', 'stock_year')}</label>
                            <select name="stock_year" class="form-control">
                                ${this.yearOptions()}
                            </select>
                        </div>
                        <div class="form-group" style="flex: 1;">
                            <label>${t('common', 'stock_month')}</label>
                            <select name="stock_month" class="form-control">
                                ${this.monthOptions()}
                            </select>
                        </div>
                    </div>
                    <div class="form-group">
                        <label>${t('common', 'image')}</label>
                        <input type="file" id="product_image" accept="image/*" onchange="Products.handleImage(this)">
                        ${p.image ? `<img src="${p.image}" class="product-thumb mt-2">` : ''}
                    </div>
                    <div class="d-flex gap-2 mt-4">
                        <button type="submit" class="btn btn-primary">
                            <i class="fas fa-save"></i> ${t('common', 'save')}
                        </button>
                        <a href="#/products" class="btn btn-secondary">
                            <i class="fas fa-arrow-left"></i> ${t('common', 'cancel')}
                        </a>
                    </div>
                </form>
            </div>
        `;
    },

    calcPrice() {
        const cost = parseFloat(document.getElementById('korea_cost').value) || 0;
        const result = PriceCalculator.calculate(cost);
        document.getElementById('actual_converted_cost').value = result.actual_converted_cost.toLocaleString();
        document.getElementById('china_base_price').value = result.china_base_price.toLocaleString();
    },

    runClassification() {
        const title = document.getElementById('original_title').value;
        if (!title) {
            App.flash(t('common', 'enter_product_name'), 'warning');
            return;
        }
        const result = ClassificationService.classify(title);
        document.getElementById('classificationResult').style.display = 'block';
        document.getElementById('confidence').textContent = t('common', 'confidence_' + result.confidence);
        document.getElementById('classificationStatus').textContent = t('status', result.classification_status === 'auto_complete' ? 'auto_complete' : result.classification_status === 'needs_review' ? 'needs_review' : 'failed');
        document.getElementById('resultBrand').textContent = result.brand || '-';
        document.getElementById('resultCategory').textContent = result.category || '-';
        document.getElementById('resultColor').textContent = result.color || '-';
        document.getElementById('resultSize').textContent = result.size || '-';
        if (!document.getElementById('brand').value && result.brand) {
            document.getElementById('brand').value = result.brand;
        }
        if (result.category) document.getElementById('category').value = result.category;
        if (result.color) document.getElementById('color').value = result.color;
        if (result.size) document.getElementById('size').value = result.size;
        if (result.material) document.getElementById('material').value = result.material;
    },

    handleImage(input) {
        if (input.files && input.files[0]) {
            const reader = new FileReader();
            reader.onload = e => {
                Products.tempImage = e.target.result;
            };
            reader.readAsDataURL(input.files[0]);
        }
    },

    tempImage: null,

    submitForm(editId = null) {
        const form = document.getElementById('productForm');
        const fd = new FormData(form);
        const title = fd.get('original_title').trim();
        const brand = fd.get('brand').trim();
        const koreaCost = parseFloat(fd.get('korea_cost')) || 0;
        if (!title || !brand || koreaCost <= 0) {
            App.flash(t('common', 'add_required_fields'), 'error');
            return false;
        }
        const priceResult = PriceCalculator.calculate(koreaCost);
        const productData = {
            original_title: title,
            brand: brand,
            category: fd.get('category') || '',
            color: fd.get('color') || '',
            size: fd.get('size') || '',
            material: fd.get('material') || '',
            korea_cost: koreaCost,
            actual_converted_cost: priceResult.actual_converted_cost,
            china_base_price: priceResult.china_base_price,
            current_stock: parseInt(fd.get('current_stock')) || 0,
            reserved_stock: 0,
            stock_year: parseInt(fd.get('stock_year')) || new Date().getFullYear(),
            stock_month: parseInt(fd.get('stock_month')) || new Date().getMonth() + 1,
            image: this.tempImage || (editId ? (DB.getProducts().find(p => p.id === parseInt(editId)) || {}).image : null) || null,
            notes: '',
            title_language: ClassificationService.detectLanguage(title),
            normalized_title: title
        };
        if (editId) {
            DB.updateProduct(parseInt(editId), productData);
            App.flash(t('common', 'save') + '!', 'success');
        } else {
            productData.product_code = DB.generateProductCode(brand, productData.stock_year, productData.stock_month);
            DB.addProduct(productData);
            App.flash(t('common', 'register') + '!', 'success');
        }
        this.tempImage = null;
        location.hash = '#/products';
        return false;
    }
};
