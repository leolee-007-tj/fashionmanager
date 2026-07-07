const ExcelManager = {
    render() {
        return `
            <div class="card">
                <h2><i class="fas fa-file-excel"></i> ${t('excel', 'title')}</h2>
                <div class="form-row mb-4">
                    <div class="card" style="flex:1;">
                        <h3><i class="fas fa-download"></i> ${t('excel', 'export')}</h3>
                        <p class="text-muted mb-4">${t('excel', 'export_desc')}</p>
                        <div class="d-flex flex-column gap-2">
                            <button class="btn btn-success" onclick="ExcelManager.exportAll()">
                                <i class="fas fa-file-excel"></i> ${t('excel', 'export_all')}
                            </button>
                            <button class="btn btn-secondary" onclick="ExcelManager.exportProducts()">
                                <i class="fas fa-tshirt"></i> ${t('excel', 'export_products')}
                            </button>
                            <button class="btn btn-secondary" onclick="ExcelManager.exportOrders()">
                                <i class="fas fa-shopping-cart"></i> ${t('excel', 'export_orders')}
                            </button>
                            <button class="btn btn-secondary" onclick="ExcelManager.exportCustomers()">
                                <i class="fas fa-users"></i> ${t('excel', 'export_customers')}
                            </button>
                        </div>
                    </div>
                    <div class="card" style="flex:1;">
                        <h3><i class="fas fa-upload"></i> ${t('excel', 'import')}</h3>
                        <p class="text-muted mb-4">${t('excel', 'import_desc')}</p>
                        <div class="form-group">
                            <label>${t('excel', 'import_file')}</label>
                            <input type="file" id="excelFile" accept=".xlsx,.xls" class="form-control">
                        </div>
                        <div class="form-group">
                            <label>${t('excel', 'import_mode')}</label>
                            <select id="importMode" class="form-control">
                                <option value="products">${t('excel', 'import_products')}</option>
                                <option value="orders">${t('excel', 'import_orders')}</option>
                                <option value="customers">${t('excel', 'import_customers')}</option>
                                <option value="keywords">${t('excel', 'import_keywords')}</option>
                            </select>
                        </div>
                        <button class="btn btn-primary" onclick="ExcelManager.importData()">
                            <i class="fas fa-upload"></i> ${t('excel', 'start_import')}
                        </button>
                    </div>
                </div>
                <div class="info-box">
                    <h4><i class="fas fa-info-circle"></i> ${t('excel', 'guide')}</h4>
                    <p>${t('excel', 'guide_text')}</p>
                    <ul>
                        <li>${t('excel', 'guide_products')}</li>
                        <li>${t('excel', 'guide_orders')}</li>
                        <li>${t('excel', 'guide_customers')}</li>
                        <li>${t('excel', 'guide_backup')}</li>
                    </ul>
                </div>
            </div>
        `;
    },

    exportAll() {
        const data = DB.exportAllData();
        const wb = XLSX.utils.book_new();
        const wsProducts = XLSX.utils.json_to_sheet(data.products || []);
        XLSX.utils.book_append_sheet(wb, wsProducts, t('products', 'title'));
        const wsOrders = XLSX.utils.json_to_sheet(data.orders || []);
        XLSX.utils.book_append_sheet(wb, wsOrders, t('orders', 'title'));
        const wsCustomers = XLSX.utils.json_to_sheet(data.customers || []);
        XLSX.utils.book_append_sheet(wb, wsCustomers, t('customers', 'title'));
        const wsExpenses = XLSX.utils.json_to_sheet(data.expenses || []);
        XLSX.utils.book_append_sheet(wb, wsExpenses, t('expenses', 'title'));
        const wsKeywords = XLSX.utils.json_to_sheet(data.keywords || []);
        XLSX.utils.book_append_sheet(wb, wsKeywords, t('classification', 'keywords'));
        const wsSettings = XLSX.utils.json_to_sheet([data.settings || {}]);
        XLSX.utils.book_append_sheet(wb, wsSettings, t('settings', 'title'));
        const filename = `LES_OULET_backup_${new Date().toISOString().slice(0, 10)}.xlsx`;
        XLSX.writeFile(wb, filename);
        App.flash(t('common', 'download') + '!', 'success');
    },

    exportProducts() {
        const products = DB.getProducts();
        const ws = XLSX.utils.json_to_sheet(products);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, t('products', 'title'));
        XLSX.writeFile(wb, `products_${new Date().toISOString().slice(0, 10)}.xlsx`);
        App.flash(t('common', 'download') + '!', 'success');
    },

    exportOrders() {
        const orders = DB.getOrders();
        const ws = XLSX.utils.json_to_sheet(orders);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, t('orders', 'title'));
        XLSX.writeFile(wb, `orders_${new Date().toISOString().slice(0, 10)}.xlsx`);
        App.flash(t('common', 'download') + '!', 'success');
    },

    exportCustomers() {
        const customers = DB.getCustomers();
        const ws = XLSX.utils.json_to_sheet(customers);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, t('customers', 'title'));
        XLSX.writeFile(wb, `customers_${new Date().toISOString().slice(0, 10)}.xlsx`);
        App.flash(t('common', 'download') + '!', 'success');
    },

    importData() {
        const fileInput = document.getElementById('excelFile');
        const mode = document.getElementById('importMode').value;
        if (!fileInput.files || !fileInput.files[0]) {
            App.flash(t('common', 'select_file'), 'warning');
            return;
        }
        const file = fileInput.files[0];
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const wb = XLSX.read(data, { type: 'array' });
                const sheetName = wb.SheetNames[0];
                const ws = wb.Sheets[sheetName];
                const json = XLSX.utils.sheet_to_json(ws);
                if (mode === 'products') {
                    ExcelManager.importProducts(json);
                } else if (mode === 'orders') {
                    ExcelManager.importOrders(json);
                } else if (mode === 'customers') {
                    ExcelManager.importCustomers(json);
                } else if (mode === 'keywords') {
                    ExcelManager.importKeywords(json);
                }
            } catch (err) {
                App.flash(t('common', 'error') + ': ' + err.message, 'error');
            }
        };
        reader.readAsArrayBuffer(file);
    },

    importProducts(data) {
        if (!confirm(data.length + ' ' + t('excel', 'confirm_import_count') + '?')) return;
        const products = DB.getProducts();
        let added = 0;
        data.forEach(row => {
            let koreaCost = row.korea_cost || row['한국원가'] || 0;
            if (typeof koreaCost === 'string') koreaCost = parseInt(koreaCost.replace(/,/g, '')) || 0;
            if (!koreaCost) return;
            const priceResult = PriceCalculator.calculate(koreaCost);
            const brand = row.brand || row['브랜드'] || '';
            const title = row.original_title || row['원래이름'] || row.title || '';
            const stockYear = row.stock_year || row['재고년'] || new Date().getFullYear();
            const stockMonth = row.stock_month || row['재고월'] || new Date().getMonth() + 1;
            const productCode = row.product_code || DB.generateProductCode(brand, stockYear, stockMonth);
            products.push({
                id: Date.now() + Math.random(),
                product_code: productCode,
                original_title: title,
                brand: brand,
                category: row.category || row['종류'] || '',
                color: row.color || row['색상'] || '',
                size: row.size || row['사이즈'] || '',
                material: row.material || '',
                korea_cost: koreaCost,
                actual_converted_cost: priceResult.actual_converted_cost,
                china_base_price: priceResult.china_base_price,
                current_stock: parseInt(row.current_stock || row['현재재고'] || 0),
                reserved_stock: 0,
                stock_year: parseInt(stockYear),
                stock_month: parseInt(stockMonth),
                image: null,
                notes: row.notes || '',
                title_language: ClassificationService.detectLanguage(title),
                normalized_title: title,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });
            added++;
        });
        DB.setProducts(products);
        App.flash(added + ' ' + t('common', 'register') + '!', 'success');
    },

    importOrders(data) {
        if (!confirm(data.length + ' ' + t('excel', 'confirm_import_count') + '?')) return;
        const orders = DB.getOrders();
        let added = 0;
        data.forEach(row => {
            orders.push({
                id: Date.now() + Math.random(),
                order_number: row.order_number || 'ORD-' + String(added + 1).padStart(4, '0'),
                customer_id: row.customer_id || 0,
                product_id: row.product_id || 0,
                color: row.color || '',
                size: row.size || '',
                quantity: parseInt(row.quantity || 0),
                selling_price: parseFloat(row.selling_price || 0),
                order_date: row.order_date || new Date().toISOString().slice(0, 10),
                ship_date: row.ship_date || null,
                shipping_company: row.shipping_company || '',
                tracking_number: row.tracking_number || '',
                status: row.status || 'COMPLETED',
                actual_profit: parseFloat(row.actual_profit || 0),
                actual_profit_margin: parseFloat(row.actual_profit_margin || 0),
                actual_cost_ratio: parseFloat(row.actual_cost_ratio || 0),
                created_at: row.created_at || new Date().toISOString(),
                updated_at: new Date().toISOString()
            });
            added++;
        });
        DB.setOrders(orders);
        App.flash(added + ' ' + t('common', 'register') + '!', 'success');
    },

    importCustomers(data) {
        if (!confirm(data.length + ' ' + t('excel', 'confirm_import_count') + '?')) return;
        const customers = DB.getCustomers();
        let added = 0;
        data.forEach(row => {
            const name = row.name || row['이름'] || '';
            if (!name) return;
            customers.push({
                id: Date.now() + Math.random(),
                name: name,
                wechat_nickname: row.wechat_nickname || row['위챗닉네임'] || '',
                phone: row.phone || row['전화번호'] || '',
                address: row.address || row['주소'] || '',
                notes: row.notes || row['메모'] || '',
                total_amount: 0,
                total_profit: 0,
                order_count: 0,
                level: 'normal',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });
            added++;
        });
        DB.setCustomers(customers);
        App.flash(added + ' ' + t('common', 'register') + '!', 'success');
    },

    importKeywords(data) {
        if (!confirm(data.length + ' ' + t('excel', 'confirm_import_count') + '?')) return;
        const keywords = DB.getKeywords();
        let added = 0;
        data.forEach(row => {
            const word = row.keyword || row.keyword || row['키워드'] || '';
            const type = row.type || row['타입'] || 'brand';
            if (!word) return;
            keywords.push({
                id: Date.now() + Math.random(),
                keyword: word,
                type: type,
                replacement: row.replacement || '',
                created_at: new Date().toISOString()
            });
            added++;
        });
        DB.setKeywords(keywords);
        App.flash(added + ' ' + t('common', 'register') + '!', 'success');
    }
};
