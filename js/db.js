/**
 * LESOUL Store App — Data Layer (localStorageDataSource)
 *
 * 3-5A: Data Gateway Async Boundary Preparation
 * ----------------------------------------------
 * 현재 이 객체는 localStorageDataSource 역할을 한다.
 * 모든 메서드는 sync API이며, 기존 업무 모듈은 DB를 직접 호출한다.
 *
 * 향후 단계에서 원격 DataSource가 동일한 메서드 시그니처를 async로 제공할 예정이다.
 * 그 때 업무 모듈은 DB 직접 접근 대신 data gateway를 통해 접근하도록 점진적 전환한다.
 *
 * 이번 단계(3-5A)에서는:
 *   - 기존 sync public API를 유지한다 (이름/시그니처 변경 없음)
 *   - Promise 호환 helper(DB.asyncReady)만 추가한다
 *   - 향후 async 전환 대상 메서드 목록을 상수로 정리한다
 *   - 실제 원격 DB CRUD 호출은 하지 않는다
 *   - localStorage key를 변경하지 않는다
 *
 * 상세 전환 계획은 docs/ASYNC_MIGRATION_MAP.md 참조.
 */
const DB = {
    prefix: 'lesoul_gh_',

    /**
     * 향후 async 전환 대상 메서드 목록 (내부 상수).
     * 이 목록은 data gateway가 원격 DataSource로 전환할 때
     * async 래퍼를 제공해야 하는 sync 메서드 이름을 나열한다.
     * 이번 단계에서는 참조용으로만 사용하며, 실제 전환은 수행하지 않는다.
     */
    ASYNC_MIGRATION_TARGETS: Object.freeze([
        'getProducts', 'setProducts', 'addProduct', 'updateProduct', 'deleteProduct',
        'generateProductCode', 'findProductByBrandTitleCost',
        'getOrders', 'setOrders', 'addOrder', 'updateOrder', 'deleteOrder',
        'findDuplicateOrder',
        'getCustomers', 'setCustomers', 'addCustomer', 'updateCustomer', 'deleteCustomer',
        'findCustomerByName',
        'getInventoryLogs', 'setInventoryLogs', 'addInventoryLog',
        'getExpenses', 'setExpenses', 'addExpense', 'updateExpense', 'deleteExpense',
        'getKeywords', 'setKeywords', 'addKeyword', 'updateKeyword', 'deleteKeyword',
        'initDefaultKeywords',
        'getSettings', 'getSetting', 'setSettings',
        'recalculateAllPrices',
        'exportAllData', 'importAllData', 'clearAllData'
    ]),

    /**
     * Promise 호환 helper.
     * sync 값을 Promise로 감싸서 반환한다.
     * 향후 async 전환 시 업무 모듈이 점진적으로 await 패턴을 사용할 수 있도록 돕는다.
     * 현재 단계에서는 sync 동작을 그대로 유지하며, 실제 I/O는 localStorage에서 수행한다.
     *
     * @param {string} methodName - DB 객체의 메서드 이름
     * @param {...*} args - 메서드에 전달할 인자
     * @returns {Promise<*>} sync 결과를 Promise로 감싼 값
     */
    asyncReady(methodName, ...args) {
        try {
            const fn = this[methodName];
            if (typeof fn !== 'function') {
                return Promise.reject(new Error('DB.asyncReady: unknown method ' + methodName));
            }
            const result = fn.apply(this, args);
            return Promise.resolve(result);
        } catch (e) {
            return Promise.reject(e);
        }
    },

    /**
     * 현재 data source 모드를 반환한다.
     * 3-5A/B 단계에서는 항상 'localStorage'다.
     * 향후 원격 DataSource 도입 시 'remote' 등으로 확장 예정.
     */
    getDataSourceMode() {
        return 'localStorage';
    },

    /**
     * async boundary 활성화 여부.
     * 3-5B에서 products read path, 3-5C에서 products write path를 true로 전환했다.
     * 다른 업무 모듈은 아직 false (기존 sync 경로 유지).
     */
    isAsyncBoundaryEnabled(scope) {
        if (scope === 'products-read') return true;
        if (scope === 'products-write') return true;
        return false;
    },

    /**
     * Products read async helper (3-5B).
     * 현재는 DB.getProducts() 결과를 Promise.resolve로 감싸 반환한다.
     * 원격 DataSource 도입 시 이 위치에서 fetch/select 호출로 교체한다.
     * 기존 sync DB.getProducts()는 유지된다.
     */
    getProductsAsync() {
        return Promise.resolve(this.getProducts());
    },

    /**
     * Products write async helpers (3-5C).
     * 현재는 기존 sync localStorage 메서드를 Promise.resolve로 감싸 반환한다.
     * 원격 DataSource 도입 시 이 위치에서 insert/update/delete/upsert 호출로 교체한다.
     * 기존 sync DB.setProducts/addProduct/updateProduct/deleteProduct는 유지된다.
     */
    setProductsAsync(products) {
        return Promise.resolve(this.setProducts(products));
    },

    addProductAsync(product) {
        return Promise.resolve(this.addProduct(product));
    },

    updateProductAsync(id, updates) {
        return Promise.resolve(this.updateProduct(id, updates));
    },

    deleteProductAsync(id) {
        return Promise.resolve(this.deleteProduct(id));
    },


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
