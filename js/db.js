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
     * 현재는 LocalProductsDataSource의 listProducts()를 호출한다.
     * 기존 sync DB.getProducts()는 유지된다.
     */
    getProductsAsync() {
        return this.getProductsDataSource().listProducts();
    },

    /**
     * Products write async helpers (3-5C).
     * 현재는 LocalProductsDataSource의 메서드를 호출한다.
     * 기존 sync DB.setProducts/addProduct/updateProduct/deleteProduct는 유지된다.
     */
    setProductsAsync(products) {
        return this.getProductsDataSource().setProducts(products);
    },

    addProductAsync(product) {
        return this.getProductsDataSource().createProduct(product);
    },

    updateProductAsync(id, updates) {
        return this.getProductsDataSource().updateProduct(id, updates);
    },

    deleteProductAsync(id) {
        return this.getProductsDataSource().deleteProduct(id);
    },

    // ==================== Products DataSource (3-5D) ====================

    /**
     * 3-5D: Products DataSource Interface Extraction
     *
     * Products 전용 data source 계층을 얇게 분리한다.
     * 현재 활성 DataSource는 LocalProductsDataSource이며,
     * 내부 저장 방식은 기존 localStorage 그대로 유지한다.
     *
     * 원격 ProductsDataSource는 다음 단계에서 구현 예정.
     * 실제 원격 products 테이블 호출은 이번 단계에서 금지.
     */

    _productsDataSource: null,

    /**
     * 현재 활성 Products DataSource를 반환한다.
     * 기본값은 LocalProductsDataSource.
     */
    getProductsDataSource() {
        if (!this._productsDataSource) {
            this._productsDataSource = this._createLocalProductsDataSource();
        }
        return this._productsDataSource;
    },

    /**
     * 테스트 전용: DataSource를 교체한다.
     * 운영 코드에서 직접 호출하지 말 것.
     */
    setProductsDataSourceForTesting(source) {
        this._productsDataSource = source;
    },

    /**
     * 테스트 전용: DataSource를 기본값으로 리셋한다.
     */
    resetProductsDataSourceForTesting() {
        this._productsDataSource = null;
    },

    /**
     * LocalProductsDataSource 팩토리.
     * 내부적으로 기존 DB sync 메서드를 감싼다.
     */
    _createLocalProductsDataSource() {
        const db = this;
        return {
            /**
             * DataSource 이름 식별자.
             */
            name: 'LocalProductsDataSource',

            /**
             * 상품 목록 조회 (read).
             * @returns {Promise<Array>} 상품 배열
             */
            listProducts() {
                return Promise.resolve(db.getProducts());
            },

            /**
             * 상품 전체 교체 (write).
             * @param {Array} products - 상품 배열
             * @returns {Promise<void>}
             */
            setProducts(products) {
                db.setProducts(products);
                return Promise.resolve();
            },

            /**
             * 상품 생성 (write).
             * @param {Object} product - 상품 데이터
             * @returns {Promise<Object>} 생성된 상품 (id 포함)
             */
            createProduct(product) {
                const result = db.addProduct(product);
                return Promise.resolve(result);
            },

            /**
             * 상품 부분 업데이트 (write).
             * @param {number|string} id - 상품 ID
             * @param {Object} updates - 업데이트할 필드
             * @returns {Promise<Object>} 업데이트된 상품
             */
            updateProduct(id, updates) {
                const result = db.updateProduct(id, updates);
                return Promise.resolve(result);
            },

            /**
             * 상품 삭제 (write).
             * @param {number|string} id - 상품 ID
             * @returns {Promise<boolean>} 삭제 성공 여부
             */
            deleteProduct(id) {
                const result = db.deleteProduct(id);
                return Promise.resolve(result);
            }
        };
    },

    /**
     * 3-5G: SupabaseProductsDataSource Read-Only Controlled Skeleton
     *
     * listProducts read path만 로컬 테스트 전용으로 제한 구현한다.
     * 3-5G는 local-only controlled read test only, no write conversion.
     *
     * - listProducts만 구현 (read-only, local-only controlled)
     * - setProducts/createProduct/updateProduct/deleteProduct는 disabled error 유지
     * - 실제 브라우저 runtime에서 자동 생성하지 않음
     * - getProductsDataSource() 기본값은 LocalProductsDataSource 유지
     * - setProductsDataSourceForTesting으로만 주입 가능
     * - 원격 Supabase 연결 금지
     * - service_role 브라우저 사용 금지
     *
     * listProducts local-only 조건:
     *   1. client가 명시적으로 주입되어야 함
     *   2. context가 { localOnly: true, storeId: ... } 형태여야 함
     *   3. localOnly !== true면 throw
     *   4. storeId가 없으면 throw
     *   5. URL이 localhost / 127.0.0.1이 아니면 throw
     *   6. products table select read-only만 수행
     *   7. 결과 row는 mapSupabaseRowToLegacyProduct로 변환
     *   8. token/session/key를 console.log 하지 않음
     *   9. 오류 메시지에 key/JWT/token/body 전체를 포함하지 않음
     *
     * @param {Object} client - Supabase client (명시적 주입)
     * @param {Object} context - { localOnly: true, storeId: string, url?: string }
     * @returns {Object} SupabaseProductsDataSource (read-only controlled)
     */
    _createControlledSupabaseProductsDataSource(client, context) {
        const db = this;
        const writeDisabledMsg = 'SupabaseProductsDataSource write methods are not enabled yet';

        return {
            name: 'SupabaseProductsDataSource',

            /**
             * Local-only controlled read.
             * products table에서 store_id 기반 read-only select 수행.
             */
            listProducts() {
                // 1. client 명시적 주입 확인
                if (!client) {
                    throw new Error('SupabaseProductsDataSource.listProducts requires explicit client');
                }
                // 2. context 확인
                if (!context || context.localOnly !== true) {
                    throw new Error('SupabaseProductsDataSource.listProducts requires localOnly context');
                }
                // 3. storeId 확인
                if (!context.storeId) {
                    throw new Error('SupabaseProductsDataSource.listProducts requires storeId');
                }
                // 4. URL localhost 확인 (client.supabaseUrl 또는 context.url)
                const url = (client.supabaseUrl || context.url || '').toLowerCase();
                if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(url)) {
                    throw new Error('SupabaseProductsDataSource.listProducts requires localhost URL');
                }
                // 5. products table select read-only
                return client.from('products')
                    .select('*')
                    .eq('store_id', context.storeId)
                    .then(response => {
                        if (response.error) {
                            // 9. 오류 메시지에 key/JWT/token/body 포함 금지
                            throw new Error('SupabaseProductsDataSource.listProducts query failed');
                        }
                        // 6. 결과를 legacy product object로 변환
                        const rows = response.data || [];
                        return rows.map(row => db.mapSupabaseRowToLegacyProduct(row));
                    })
                    .catch(err => {
                        // 8. token/session/key console.log 금지
                        // 9. 오류 메시지에 민감 정보 포함 금지
                        if (err && err.message && err.message.indexOf('requires ') === 0) {
                            throw err; // validation error는 그대로 전달
                        }
                        throw new Error('SupabaseProductsDataSource.listProducts query failed');
                    });
            },

            setProducts(products) {
                throw new Error(writeDisabledMsg);
            },

            createProduct(product) {
                throw new Error(writeDisabledMsg);
            },

            updateProduct(id, updates) {
                throw new Error(writeDisabledMsg);
            },

            deleteProduct(id) {
                throw new Error(writeDisabledMsg);
            }
        };
    },

    // ==================== Products Supabase Mapping (3-5E) ====================

    /**
     * 3-5E: Products Supabase Mapping Contract
     *
     * 순수 매핑 helper들.
     * 3-5E는 Products Supabase mapping contract only, no Supabase CRUD conversion.
     *
     * - legacy product object ↔ Supabase products row 필드 매핑
     * - 네트워크 호출 금지, localStorage 읽기/쓰기 금지
     * - 실제 table CRUD 구현 금지
     * - 현재 runtime에서 자동 사용하지 않음 (다음 단계에서 사용 예정)
     * - 활성 DataSource는 계속 LocalProductsDataSource
     *
     * 필드 매핑 규칙:
     *   legacy.id (numeric) → supabase.legacy_id (bigint)
     *   supabase.id (uuid)  → 신규 필드, legacy numeric id와 다름 (혼동 주의)
     *   store_id            → 현재 브라우저 business CRUD에서 미사용 (매핑 시 null 허용)
     *   original_title, brand, category, color, size, material → 동일 이름 direct copy
     *   korea_cost, actual_converted_cost, china_base_price → numeric 그대로
     *   current_stock, reserved_stock → integer 그대로
     *   stock_year, stock_month → integer 그대로
     *   product_code, title_language, normalized_title → text 그대로
     *   image (base64) → text 보존 (이번 단계에서 blob 변환하지 않음)
     *   notes → text 그대로
     *   created_at, updated_at → ISO string 그대로
     *   season, fit, style, classification_status → Supabase 전용 확장 필드 (legacy에 없으면 null)
     *   created_by, updated_by → 인증 연동 후 채움 (현재 null)
     *   deleted_at, version → Supabase 전용 필드 (매핑 시 기본값)
     *   누락/unknown 필드는 안전 기본값 처리 (앱 호환성 보존)
     *   profit/price calculation은 이번 단계에서 변경하지 않음
     */

    /**
     * Supabase products row의 확장 필드 기본값.
     * legacy product object에 없는 필드들의 안전 기본값.
     */
    _SUPABASE_PRODUCT_EXTENDED_FIELDS: Object.freeze({
        season: null,
        fit: null,
        style: null,
        classification_status: null,
        created_by: null,
        updated_by: null,
        deleted_at: null,
        version: 1
    }),

    /**
     * legacy product object를 Supabase products row로 변환한다.
     * 순수 함수: 네트워크/localStorage 접근 없음.
     *
     * @param {Object} product - legacy product object
     * @returns {Object} Supabase products row (id는 uuid, legacy_id는 numeric id)
     */
    mapLegacyProductToSupabaseRow(product) {
        this._validateProductMappingInputForTesting(product, 'legacy');
        const safeValue = (v, fallback) => (v === undefined ? fallback : v);
        return {
            // id는 uuid이며, legacy numeric id와 다름.
            // 신규 생성 시에는 id를 null로 두고 DB가 gen_random_uuid()로 채운다.
            // legacy numeric id는 legacy_id 컬럼으로 보존한다.
            id: null,
            legacy_id: product.id != null ? Number(product.id) : null,
            store_id: null, // 현재 브라우저 business CRUD에서 미사용. 다음 단계에서 인증 게이트와 연동.

            // direct copy fields
            product_code: safeValue(product.product_code, null),
            original_title: safeValue(product.original_title, ''),
            normalized_title: safeValue(product.normalized_title, null),
            title_language: safeValue(product.title_language, null),
            brand: safeValue(product.brand, ''),
            category: safeValue(product.category, null),
            color: safeValue(product.color, null),
            size: safeValue(product.size, null),
            material: safeValue(product.material, null),

            // numeric fields
            korea_cost: safeValue(product.korea_cost, null),
            actual_converted_cost: safeValue(product.actual_converted_cost, null),
            china_base_price: safeValue(product.china_base_price, null),

            // integer fields
            current_stock: safeValue(product.current_stock, 0),
            reserved_stock: safeValue(product.reserved_stock, 0),
            stock_year: safeValue(product.stock_year, null),
            stock_month: safeValue(product.stock_month, null),

            // image: base64 text 보존 (이번 단계에서 blob 변환하지 않음)
            image: safeValue(product.image, null),
            notes: safeValue(product.notes, null),

            // timestamps
            created_at: safeValue(product.created_at, null),
            updated_at: safeValue(product.updated_at, null),

            // Supabase 확장 필드 (legacy에 없으므로 기본값)
            ...this._SUPABASE_PRODUCT_EXTENDED_FIELDS
        };
    },

    /**
     * Supabase products row를 legacy product object로 변환한다.
     * 순수 함수: 네트워크/localStorage 접근 없음.
     *
     * @param {Object} row - Supabase products row
     * @returns {Object} legacy product object (id는 legacy_id 기반, 없으면 null)
     */
    mapSupabaseRowToLegacyProduct(row) {
        this._validateProductMappingInputForTesting(row, 'supabase');
        const safeValue = (v, fallback) => (v === undefined ? fallback : v);
        return {
            // legacy numeric id 우선. 없으면 null (신규 row의 경우).
            // Supabase uuid id는 legacy object에 노출하지 않는다 (혼동 방지).
            id: row.legacy_id != null ? Number(row.legacy_id) : null,

            // direct copy fields
            product_code: safeValue(row.product_code, null),
            original_title: safeValue(row.original_title, ''),
            normalized_title: safeValue(row.normalized_title, null),
            title_language: safeValue(row.title_language, null),
            brand: safeValue(row.brand, ''),
            category: safeValue(row.category, null),
            color: safeValue(row.color, null),
            size: safeValue(row.size, null),
            material: safeValue(row.material, null),

            // numeric fields
            korea_cost: safeValue(row.korea_cost, null),
            actual_converted_cost: safeValue(row.actual_converted_cost, null),
            china_base_price: safeValue(row.china_base_price, null),

            // integer fields
            current_stock: safeValue(row.current_stock, 0),
            reserved_stock: safeValue(row.reserved_stock, 0),
            stock_year: safeValue(row.stock_year, null),
            stock_month: safeValue(row.stock_month, null),

            // image: base64 text 보존
            image: safeValue(row.image, null),
            notes: safeValue(row.notes, null),

            // timestamps
            created_at: safeValue(row.created_at, null),
            updated_at: safeValue(row.updated_at, null)
        };
    },

    /**
     * 매핑 입력값 정적 검증 (테스트/디버그용).
     * 순수 함수: 부작용 없음.
     *
     * @param {Object} productOrRow - 매핑 대상 객체
     * @param {string} kind - 'legacy' 또는 'supabase'
     * @throws {Error} 입력이 객체가 아니거나 kind가 잘못된 경우
     */
    validateProductMappingInputForTesting(productOrRow, kind) {
        if (productOrRow === null || typeof productOrRow !== 'object' || Array.isArray(productOrRow)) {
            throw new Error('Product mapping input must be a non-null object');
        }
        if (kind !== 'legacy' && kind !== 'supabase') {
            throw new Error('Product mapping kind must be "legacy" or "supabase"');
        }
        return true;
    },

    // internal alias (mapLegacy/mapSupabase 호출 시 사용)
    _validateProductMappingInputForTesting(productOrRow, kind) {
        return this.validateProductMappingInputForTesting(productOrRow, kind);
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
