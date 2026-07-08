const DB = {
    prefix: 'lesoul_gh_',

    init() {
        const keywords = this.getKeywords();
        if (!keywords || keywords.length === 0) {
            this.initDefaultKeywords();
        }
        const settings = this.get('settings', null);
        if (!settings) {
            this.getSettings();
        }
    },

    get(key, defaultValue = null) {
        try {
            const data = localStorage.getItem(this.prefix + key);
            return data ? JSON.parse(data) : defaultValue;
        } catch (e) {
            return defaultValue;
        }
    },

    set(key, value) {
        localStorage.setItem(this.prefix + key, JSON.stringify(value));
    },

    getNextId(collection) {
        const items = this.get(collection, []);
        if (items.length === 0) return 1;
        return Math.max(...items.map(i => i.id)) + 1;
    },

    getProducts() { return this.get('products', []); },
    setProducts(products) { this.set('products', products); },

    getOrders() { return this.get('orders', []); },
    setOrders(orders) { this.set('orders', orders); },

    getCustomers() { return this.get('customers', []); },
    setCustomers(customers) { this.set('customers', customers); },

    getInventoryLogs() { return this.get('inventory_logs', []); },
    setInventoryLogs(logs) { this.set('inventory_logs', logs); },

    getExpenses() { return this.get('expenses', []); },
    setExpenses(expenses) { this.set('expenses', expenses); },

    getKeywords() { return this.get('keywords', []); },
    setKeywords(keywords) { this.set('keywords', keywords); },

    addKeyword(keyword) {
        const keywords = this.getKeywords();
        keyword.id = this.getNextId('keywords');
        keyword.created_at = new Date().toISOString();
        if (keyword.is_active === undefined) keyword.is_active = true;
        keywords.push(keyword);
        this.setKeywords(keywords);
        return keyword;
    },

    updateKeyword(id, updates) {
        const keywords = this.getKeywords();
        const idx = keywords.findIndex(k => k.id === id);
        if (idx >= 0) {
            keywords[idx] = { ...keywords[idx], ...updates, updated_at: new Date().toISOString() };
            this.setKeywords(keywords);
            return keywords[idx];
        }
        return null;
    },

    deleteKeyword(id) {
        const strId = String(id);
        const keywords = this.getKeywords().filter(k => String(k.id) !== strId);
        this.setKeywords(keywords);
    },

    getSettings() {
        return this.get('settings', {
            store_name: 'LES SOUL',
            store_subtitle: 'Store Management',
            exchange_divisor: 165,
            price_multiplier: 3,
            fixed_addition: 40,
            base_discount_rate: 20
        });
    },

    getSetting(key) {
        const settings = this.getSettings();
        return settings[key];
    },

    setSettings(settings) { this.set('settings', settings); },

    addProduct(product) {
        const products = this.getProducts();
        product.id = this.getNextId('products');
        product.created_at = new Date().toISOString();
        product.updated_at = new Date().toISOString();
        products.push(product);
        this.setProducts(products);
        return product;
    },

    updateProduct(id, updates) {
        const products = this.getProducts();
        const idx = products.findIndex(p => p.id === id);
        if (idx >= 0) {
            products[idx] = { ...products[idx], ...updates, updated_at: new Date().toISOString() };
            this.setProducts(products);
            return products[idx];
        }
        return null;
    },

    deleteProduct(id) {
        const products = this.getProducts().filter(p => p.id !== id);
        this.setProducts(products);
    },

    addOrder(order) {
        const orders = this.getOrders();
        order.id = this.getNextId('orders');
        order.created_at = new Date().toISOString();
        orders.push(order);
        this.setOrders(orders);
        return order;
    },

    updateOrder(id, updates) {
        const orders = this.getOrders();
        const idx = orders.findIndex(o => o.id === id);
        if (idx >= 0) {
            orders[idx] = { ...orders[idx], ...updates };
            this.setOrders(orders);
            return orders[idx];
        }
        return null;
    },

    deleteOrder(id) {
        const orders = this.getOrders().filter(o => o.id !== id);
        this.setOrders(orders);
    },

    addCustomer(customer) {
        const customers = this.getCustomers();
        customer.id = this.getNextId('customers');
        customer.created_at = new Date().toISOString();
        customers.push(customer);
        this.setCustomers(customers);
        return customer;
    },

    updateCustomer(id, updates) {
        const customers = this.getCustomers();
        const idx = customers.findIndex(c => c.id === id);
        if (idx >= 0) {
            customers[idx] = { ...customers[idx], ...updates };
            this.setCustomers(customers);
            return customers[idx];
        }
        return null;
    },

    deleteCustomer(id) {
        const customers = this.getCustomers().filter(c => c.id !== id);
        this.setCustomers(customers);
    },

    addInventoryLog(log) {
        const logs = this.getInventoryLogs();
        log.id = this.getNextId('inventory_logs');
        log.created_at = new Date().toISOString();
        logs.push(log);
        this.setInventoryLogs(logs);
        return log;
    },

    addExpense(expense) {
        const expenses = this.getExpenses();
        expense.id = this.getNextId('expenses');
        expense.created_at = new Date().toISOString();
        expenses.push(expense);
        this.setExpenses(expenses);
        return expense;
    },

    updateExpense(id, updates) {
        const expenses = this.getExpenses();
        const idx = expenses.findIndex(e => e.id === id);
        if (idx >= 0) {
            expenses[idx] = { ...expenses[idx], ...updates };
            this.setExpenses(expenses);
            return expenses[idx];
        }
        return null;
    },

    deleteExpense(id) {
        const expenses = this.getExpenses().filter(e => e.id !== id);
        this.setExpenses(expenses);
    },

    generateProductCode(brand, stockYear, stockMonth) {
        const products = this.getProducts();
        const brandPrefix = (brand || 'BRD').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3).padEnd(3, 'X');
        let maxNum = 0;
        products.forEach(p => {
            if (p.product_code && p.product_code.startsWith(brandPrefix)) {
                const num = parseInt(p.product_code.slice(brandPrefix.length));
                if (num > maxNum) maxNum = num;
            }
        });
        return brandPrefix + String(maxNum + 1).padStart(3, '0');
    },

    findProductByBrandTitleCost(brand, title, koreaCost, stockMonth, stockYear) {
        const products = this.getProducts();
        return products.find(p =>
            p.brand === brand &&
            p.original_title === title &&
            Math.abs(p.korea_cost - koreaCost) < 0.01 &&
            (stockMonth ? p.stock_month === stockMonth : true) &&
            (stockYear ? p.stock_year === stockYear : true)
        );
    },

    findCustomerByName(name) {
        const customers = this.getCustomers();
        return customers.find(c => c.name && c.name.toLowerCase() === name.toLowerCase());
    },

    findDuplicateOrder(customerId, productId, color, size) {
        const orders = this.getOrders();
        return orders.find(o =>
            o.customer_id === customerId &&
            o.product_id === productId &&
            (o.color || '') === (color || '') &&
            (o.size || '') === (size || '') &&
            o.status !== 'CANCELLED'
        );
    },

    recalculateAllPrices() {
        const settings = this.getSettings();
        const products = this.getProducts();
        products.forEach(p => {
            const result = PriceCalculator.calculate(p.korea_cost, settings);
            p.actual_converted_cost = result.actual_converted_cost;
            p.china_base_price = result.china_base_price;
            p.updated_at = new Date().toISOString();
        });
        this.setProducts(products);
    },

    exportAllData() {
        return {
            products: this.getProducts(),
            orders: this.getOrders(),
            customers: this.getCustomers(),
            inventory_logs: this.getInventoryLogs(),
            expenses: this.getExpenses(),
            keywords: this.getKeywords(),
            settings: this.getSettings(),
            exported_at: new Date().toISOString()
        };
    },

    importAllData(data) {
        if (data.products) this.setProducts(data.products);
        if (data.orders) this.setOrders(data.orders);
        if (data.customers) this.setCustomers(data.customers);
        if (data.inventory_logs) this.setInventoryLogs(data.inventory_logs);
        if (data.expenses) {
            const converted = this._convertExpenses(data.expenses);
            this.setExpenses(converted);
        }
        if (data.keywords) this.setKeywords(data.keywords);
        if (data.settings) this.setSettings(data.settings);
    },

    _convertExpenses(expenses) {
        return expenses.map(e => {
            if (typeof e.amount === 'number' && e.expense_date) {
                return e;
            }
            if (e.year !== undefined && e.month !== undefined) {
                const total = (e.logistics_cost || 0) + (e.flight_cost || 0) + (e.hotel_cost || 0) + 
                             (e.stay_cost || 0) + (e.electricity_cost || 0) + (e.rent_cost || 0) + (e.other_cost || 0);
                if (total > 0) {
                    return {
                        id: e.id || Date.now() + Math.random(),
                        expense_date: `${e.year}-${String(e.month).padStart(2, '0')}-01`,
                        category: '기타',
                        amount: total,
                        description: e.notes || '',
                        created_at: e.created_at || new Date().toISOString(),
                        logistics_cost: e.logistics_cost || 0,
                        flight_cost: e.flight_cost || 0,
                        hotel_cost: e.hotel_cost || 0,
                        stay_cost: e.stay_cost || 0,
                        electricity_cost: e.electricity_cost || 0,
                        rent_cost: e.rent_cost || 0,
                        other_cost: e.other_cost || 0
                    };
                }
            }
            return e;
        }).filter(e => typeof e.amount === 'number' && e.amount > 0);
    },

    clearAllData() {
        this.setProducts([]);
        this.setOrders([]);
        this.setCustomers([]);
        this.setInventoryLogs([]);
        this.setExpenses([]);
        this.setKeywords([]);
    },

    initDefaultKeywords() {
        const defaults = [
            { type: 'brand', standard: 'SYSTEM', ko: 'system,SYSTEM', zh: '', en: 'system', priority: 1 },
            { type: 'brand', standard: 'TIME', ko: 'time,TIME', zh: '', en: 'time', priority: 1 },
            { type: 'brand', standard: 'MARRON', ko: 'marron,MARRON', zh: '', en: 'marron', priority: 1 },
            { type: 'category', standard: '니트', ko: '니트,가디건,스웨터', zh: '针织衫,毛衣,开衫', en: 'knit,sweater,cardigan', priority: 1 },
            { type: 'category', standard: '원피스', ko: '원피스,드레스', zh: '连衣裙', en: 'dress,onepiece', priority: 1 },
            { type: 'category', standard: '블라우스', ko: '블라우스,셔츠', zh: '衬衫,衬衣', en: 'blouse,shirt', priority: 1 },
            { type: 'category', standard: '티셔츠', ko: '티셔츠,티', zh: 'T恤', en: 't-shirt,tee', priority: 1 },
            { type: 'category', standard: '스커트', ko: '스커트,치마', zh: '裙子,半裙', en: 'skirt', priority: 1 },
            { type: 'category', standard: '바지', ko: '바지,팬츠', zh: '裤子', en: 'pants,trousers', priority: 1 },
            { type: 'category', standard: '코트', ko: '코트', zh: '大衣,外套', en: 'coat', priority: 1 },
            { type: 'category', standard: '재킷', ko: '재킷,자켓', zh: '外套,夹克', en: 'jacket', priority: 1 },
            { type: 'color', standard: '블랙', ko: '블랙,검정,검은색,black', zh: '黑色,黑', en: 'black,bk', priority: 1 },
            { type: 'color', standard: '화이트', ko: '화이트,하얀색,흰색,white', zh: '白色,白', en: 'white,wh', priority: 1 },
            { type: 'color', standard: '크림', ko: '크림,cream', zh: '奶油色', en: 'cream', priority: 1 },
            { type: 'color', standard: '베이지', ko: '베이지,beige', zh: '米色,卡其', en: 'beige', priority: 1 },
            { type: 'color', standard: '블루', ko: '블루,파랑,파란색,blue', zh: '蓝色,蓝', en: 'blue,bl', priority: 1 },
            { type: 'color', standard: '그레이', ko: '그레이,회색,gray,grey', zh: '灰色,灰', en: 'gray,grey', priority: 1 },
            { type: 'color', standard: '핑크', ko: '핑크,분홍,pink', zh: '粉色,粉红', en: 'pink,pk', priority: 1 },
            { type: 'color', standard: '레드', ko: '레드,빨강,빨간색,red', zh: '红色,红', en: 'red,rd', priority: 1 },
            { type: 'size', standard: 'FREE', ko: 'FREE,free,프리', zh: '均码,自由码', en: 'FREE,one size', priority: 1 },
            { type: 'size', standard: 'S', ko: 'S,에스', zh: '小码,S', en: 'S,small', priority: 1 },
            { type: 'size', standard: 'M', ko: 'M,엠', zh: '中码,M', en: 'M,medium', priority: 1 },
            { type: 'size', standard: 'L', ko: 'L,엘', zh: '大码,L', en: 'L,large', priority: 1 },
            { type: 'size', standard: 'XL', ko: 'XL,엑셀', zh: '加大码,XL', en: 'XL,extra large', priority: 1 },
            { type: 'material', standard: '면', ko: '면,코튼,cotton', zh: '棉,纯棉', en: 'cotton', priority: 1 },
            { type: 'material', standard: '울', ko: '울,양모,wool', zh: '羊毛', en: 'wool', priority: 1 },
            { type: 'material', standard: '캐시미어', ko: '캐시미어,cashmere', zh: '羊绒,开司米', en: 'cashmere', priority: 1 },
            { type: 'material', standard: '실크', ko: '실크,비단,silk', zh: '丝绸,真丝', en: 'silk', priority: 1 },
            { type: 'material', standard: '린넨', ko: '린넨,마,linen', zh: '亚麻', en: 'linen', priority: 1 },
        ];
        const keywords = defaults.map((d, i) => ({
            id: i + 1,
            classification_type: d.type,
            standard_value: d.standard,
            ko_keywords: d.ko,
            zh_keywords: d.zh,
            en_keywords: d.en,
            other_aliases: '',
            priority: d.priority,
            is_active: true,
            created_at: new Date().toISOString()
        }));
        this.setKeywords(keywords);
        return keywords;
    }
};
