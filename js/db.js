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

    async batchDeleteProductsAsync(ids) {
        const results = { success: [], failed: [], errors: [] };
        for (const id of ids) {
            try {
                await this.deleteProductAsync(id);
                results.success.push(id);
            } catch (e) {
                results.failed.push(id);
                results.errors.push({ id, error: e.message || 'delete failed' });
            }
        }
        return results;
    },

    async batchUpdateProductsAsync(ids, updates) {
        const results = { success: [], failed: [], errors: [] };
        for (const id of ids) {
            try {
                await this.updateProductAsync(id, updates);
                results.success.push(id);
            } catch (e) {
                results.failed.push(id);
                results.errors.push({ id, error: e.message || 'update failed' });
            }
        }
        return results;
    },

    // ==================== Products DataSource (3-5D) ====================

    /**
     * 3-5D: Products DataSource Interface Extraction
     * 3-5M: Products Runtime DataSource Feature Flag Gate
     *
     * Products 전용 data source 계층을 얇게 분리한다.
     * 현재 활성 DataSource는 LocalProductsDataSource이며,
     * 내부 저장 방식은 기존 localStorage 그대로 유지한다.
     *
     * 3-5M에서 runtime feature flag gate를 추가했다.
     * 기본값(LocalProductsDataSource) 동작은 절대 바뀌지 않는다.
     *
     * SupabaseProductsDataSource 후보가 되기 위한 필수 조건 (모두 true):
     *   1. global LESOUL_CONFIG 존재
     *   2. LESOUL_CONFIG.SUPABASE_ENABLED === true
     *   3. LESOUL_CONFIG.PRODUCTS_SUPABASE_ENABLED === true
     *   4. LESOULSupabase 초기화 정상
     *   5. activeMembership.storeId 확인 가능
     *   6. context.localOnly === true
     *   7. Supabase URL이 localhost / 127.0.0.1
     *   8. service_role key 아님
     *   9. client 명시적 존재
     *
     * 조건 중 하나라도 실패하면:
     *   - PRODUCTS_SUPABASE_ENABLED !== true → 조용히 LocalProductsDataSource 유지
     *   - PRODUCTS_SUPABASE_ENABLED === true + 다른 필수 조건 실패 → 명확한 error throw
     *     (조용히 데이터 저장 위치를 바꾸지 않는다)
     *
     * 원격 ProductsDataSource는 다음 단계에서 구현 예정.
     * 실제 원격 products 테이블 호출은 이번 단계에서 금지.
     */

    _productsDataSource: null,

    /**
     * 현재 활성 Products DataSource를 반환한다.
     * 기본값은 LocalProductsDataSource.
     *
     * 3-5M: PRODUCTS_SUPABASE_ENABLED === true이고 모든 필수 조건이 충족되면
     * SupabaseProductsDataSource를 생성한다.
     */
    getProductsDataSource() {
        if (!this._productsDataSource) {
            const resolved = this._resolveRuntimeProductsDataSource();
            this._productsDataSource = resolved === null
                ? this._createLocalProductsDataSource()
                : resolved;
        }
        return this._productsDataSource;
    },

    /**
     * 3-5M: Runtime feature flag gate로 SupabaseProductsDataSource 후보를 판별한다.
     *
     * @returns {Object|null} SupabaseProductsDataSource 인스턴스.
     *   null을 반환하면 LocalProductsDataSource를 사용한다.
     *   필수 조건이 실패하면 error를 throw한다 (조용히 fallback하지 않음).
     */
    _resolveRuntimeProductsDataSource() {
        const globalObj = (typeof window !== 'undefined') ? window : globalThis;
        const config = globalObj.LESOUL_CONFIG || {};

        // 기본값 false — 조용히 LocalProductsDataSource 유지.
        if (config.PRODUCTS_SUPABASE_ENABLED !== true) {
            return null;
        }

        // PRODUCTS_SUPABASE_ENABLED === true from here.
        // 필수 조건을 모두 검사한다. 실패 시 명확한 error.

        if (config.SUPABASE_ENABLED !== true) {
            throw new Error('Products Supabase runtime requires SUPABASE_ENABLED=true');
        }

        const supabaseClient = globalObj.LESOULSupabase;
        if (!supabaseClient || typeof supabaseClient.isInitialized !== 'function' || !supabaseClient.isInitialized()) {
            throw new Error('Products Supabase runtime requires initialized Supabase client');
        }

        let client;
        try {
            client = supabaseClient.getClient();
        } catch (e) {
            throw new Error('Products Supabase runtime requires accessible Supabase client');
        }
        if (!client) {
            throw new Error('Products Supabase runtime requires non-null Supabase client');
        }

        const url = String(client.supabaseUrl || config.SUPABASE_URL || '').toLowerCase();
        if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(url)) {
            throw new Error('Products Supabase runtime requires localhost URL');
        }

        // service_role key 차단
        const clientKey = config.SUPABASE_CLIENT_KEY || '';
        if (typeof clientKey === 'string' && clientKey.indexOf('service_role') > -1) {
            throw new Error('Products Supabase runtime forbids service_role key');
        }
        // JWT role 확인
        if (typeof clientKey === 'string' && clientKey.split('.').length === 3) {
            try {
                const payload = JSON.parse(atob(clientKey.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
                if (payload && payload.role === 'service_role') {
                    throw new Error('Products Supabase runtime forbids service_role key');
                }
            } catch (e) {
                if (e && e.message && e.message.indexOf('service_role') > -1) throw e;
                // decode 실패는 무시 (다른 검증에서 처리됨)
            }
        }

        // active storeId 확인 (app.js/products.js 수정 없이 기존 구조 사용)
        const storeId = this._resolveActiveStoreId();
        if (!storeId) {
            throw new Error('Products Supabase runtime requires active storeId');
        }

        return this._createControlledSupabaseProductsDataSource(client, {
            localOnly: true,
            storeId: storeId,
            url: url
        });
    },

    /**
     * 3-5M: 현재 선택된 storeId를 안전하게 가져온다.
     * 새 전역변수를 만들지 않고 기존 LESOULAppBootstrap 구조를 사용한다.
     *
     * @returns {string|null} storeId (UUID) 또는 null
     */
    _resolveActiveStoreId() {
        const globalObj = (typeof window !== 'undefined') ? window : globalThis;
        const bootstrap = globalObj.LESOULAppBootstrap;
        if (!bootstrap || typeof bootstrap.getContext !== 'function') {
            return null;
        }
        try {
            const ctx = bootstrap.getContext();
            if (ctx && ctx.activeMembership && ctx.activeMembership.storeId) {
                return ctx.activeMembership.storeId;
            }
        } catch (e) {
            // context 접근 실패 — 안전하게 null 반환
        }
        return null;
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
     * 3-5L: SupabaseProductsDataSource Connected to Write RPCs
     *
     * listProducts read + create/update/delete write를 local-only controlled 방식으로 구현한다.
     * write methods는 3-5K에서 추가한 SECURITY DEFINER RPC를 사용한다.
     *
     * - listProducts: 구현됨 (local-only controlled, direct table select)
     * - createProduct: RPC 기반 (client.rpc('create_product'))
     * - updateProduct: RPC 기반 (client.rpc('update_product'))
     * - deleteProduct: RPC 기반 (client.rpc('soft_delete_product'))
     * - setProducts: disabled (대량 overwrite 금지)
     * - 실제 브라우저 runtime에서 자동 생성하지 않음
     * - getProductsDataSource() 기본값은 LocalProductsDataSource 유지
     * - setProductsDataSourceForTesting으로만 주입 가능
     * - 원격 Supabase 연결 금지
     * - service_role 브라우저 사용 금지
     *
     * write methods 공통 local-only 조건:
     *   1. client가 명시적으로 주입되어야 함
     *   2. context가 { localOnly: true, storeId: ... } 형태여야 함
     *   3. localOnly !== true면 throw
     *   4. storeId가 없으면 throw
     *   5. URL이 localhost / 127.0.0.1이 아니면 throw
     *   6. 결과 row는 mapSupabaseRowToLegacyProduct로 변환
     *   7. token/session/key를 console.log 하지 않음
     *   8. 오류 메시지에 key/JWT/token/body 전체를 포함하지 않음
     *
     * @param {Object} client - Supabase client (명시적 주입)
     * @param {Object} context - { localOnly: true, storeId: string, url?: string }
     * @returns {Object} SupabaseProductsDataSource (local-only controlled read + write via RPC)
     */
    _createControlledSupabaseProductsDataSource(client, context) {
        const db = this;

        function _validateWriteContext(methodName) {
            if (!client) {
                throw new Error(`SupabaseProductsDataSource.${methodName} requires explicit client`);
            }
            if (!context || context.localOnly !== true) {
                throw new Error(`SupabaseProductsDataSource.${methodName} requires localOnly context`);
            }
            if (!context.storeId) {
                throw new Error(`SupabaseProductsDataSource.${methodName} requires storeId`);
            }
            const url = (client.supabaseUrl || context.url || '').toLowerCase();
            if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(url)) {
                throw new Error(`SupabaseProductsDataSource.${methodName} requires localhost URL`);
            }
        }

        function _wrapWriteError(methodName, err) {
            if (err && err.message && err.message.indexOf('requires ') === 0) {
                throw err;
            }
            throw new Error(`SupabaseProductsDataSource.${methodName} query failed`);
        }

        const _setProductsDisabledMsg = 'setProducts is not enabled for SupabaseProductsDataSource';

        return {
            name: 'SupabaseProductsDataSource',

            /**
             * Local-only controlled read.
             * products table에서 store_id 기반 read-only select 수행.
             */
            listProducts() {
                _validateWriteContext('listProducts');
                return client.from('products')
                    .select('*')
                    .eq('store_id', context.storeId)
                    .is('deleted_at', null)
                    .then(response => {
                        if (response.error) {
                            throw new Error('SupabaseProductsDataSource.listProducts query failed');
                        }
                        const rows = response.data || [];
                        return rows.map(row => db.mapSupabaseRowToLegacyProduct(row));
                    })
                    .catch(err => _wrapWriteError('listProducts', err));
            },

            setProducts(products) {
                throw new Error(_setProductsDisabledMsg);
            },

            /**
             * Local-only controlled create via RPC (3-5L).
             * legacy product → supabase row 변환 후 create_product RPC 호출.
             * store_id는 context.storeId로 강제.
             */
            createProduct(product) {
                _validateWriteContext('createProduct');
                const row = db.mapLegacyProductToSupabaseRow(product || {});

                // RPC payload 구성 (p_ 접두사 파라미터)
                const payload = {
                    p_store_id: context.storeId,
                    p_product_code: row.product_code || null,
                    p_original_title: row.original_title || '',
                    p_brand: row.brand || '',
                    p_normalized_title: row.normalized_title || null,
                    p_title_language: row.title_language || null,
                    p_category: row.category || null,
                    p_color: row.color || null,
                    p_size: row.size || null,
                    p_material: row.material || null,
                    p_season: row.season || null,
                    p_fit: row.fit || null,
                    p_style: row.style || null,
                    p_classification_status: row.classification_status || null,
                    p_korea_cost: row.korea_cost || null,
                    p_actual_converted_cost: row.actual_converted_cost || null,
                    p_china_base_price: row.china_base_price || null,
                    p_current_stock: row.current_stock || 0,
                    p_reserved_stock: row.reserved_stock || 0,
                    p_stock_year: row.stock_year || null,
                    p_stock_month: row.stock_month || null,
                    p_image: row.image || null,
                    p_notes: row.notes || null,
                    p_legacy_id: row.legacy_id || Date.now()
                };

                return client.rpc('create_product', payload)
                    .then(response => {
                        if (response.error) {
                            throw new Error('SupabaseProductsDataSource.createProduct RPC failed');
                        }
                        // RPC는 SETOF/RETURNS TABLE → 배열로 반환될 수 있음. 단일 row 추출.
                        const raw = response.data;
                        const returnedRow = Array.isArray(raw) ? raw[0] : raw;
                        if (!returnedRow) {
                            throw new Error('SupabaseProductsDataSource.createProduct returned no row');
                        }
                        return db.mapSupabaseRowToLegacyProduct(returnedRow);
                    })
                    .catch(err => _wrapWriteError('createProduct', err));
            },

            /**
             * Local-only controlled update via RPC (3-5L).
             * legacy_id + store_id 조건으로 제한.
             * id/legacy_id/store_id 등 위험 필드는 RPC 내부에서 차단.
             */
            updateProduct(id, updates) {
                _validateWriteContext('updateProduct');
                const upd = updates || {};

                // RPC payload 구성 (p_ 접두사 파라미터)
                const payload = {
                    p_store_id: context.storeId,
                    p_legacy_id: Number(id),
                    p_product_code: upd.product_code || null,
                    p_original_title: upd.original_title || null,
                    p_normalized_title: upd.normalized_title || null,
                    p_title_language: upd.title_language || null,
                    p_brand: upd.brand || null,
                    p_category: upd.category || null,
                    p_color: upd.color || null,
                    p_size: upd.size || null,
                    p_material: upd.material || null,
                    p_season: upd.season || null,
                    p_fit: upd.fit || null,
                    p_style: upd.style || null,
                    p_classification_status: upd.classification_status || null,
                    p_korea_cost: upd.korea_cost || null,
                    p_actual_converted_cost: upd.actual_converted_cost || null,
                    p_china_base_price: upd.china_base_price || null,
                    p_current_stock: upd.current_stock || null,
                    p_reserved_stock: upd.reserved_stock || null,
                    p_stock_year: upd.stock_year || null,
                    p_stock_month: upd.stock_month || null,
                    p_image: upd.image || null,
                    p_notes: upd.notes || null
                };

                return client.rpc('update_product', payload)
                    .then(response => {
                        if (response.error) {
                            throw new Error('SupabaseProductsDataSource.updateProduct RPC failed');
                        }
                        // RPC는 SETOF/RETURNS TABLE → 배열로 반환될 수 있음. 단일 row 추출.
                        const raw = response.data;
                        const returnedRow = Array.isArray(raw) ? raw[0] : raw;
                        if (!returnedRow) {
                            throw new Error('SupabaseProductsDataSource.updateProduct returned no row');
                        }
                        return db.mapSupabaseRowToLegacyProduct(returnedRow);
                    })
                    .catch(err => _wrapWriteError('updateProduct', err));
            },

            /**
             * Local-only controlled soft delete via RPC (3-5L).
             * 실제 DELETE 대신 soft_delete_product RPC 호출.
             * legacy_id + store_id 조건으로 제한.
             */
            deleteProduct(id) {
                _validateWriteContext('deleteProduct');
                const payload = {
                    p_store_id: context.storeId,
                    p_legacy_id: Number(id)
                };

                return client.rpc('soft_delete_product', payload)
                    .then(response => {
                        if (response.error) {
                            throw new Error('SupabaseProductsDataSource.deleteProduct RPC failed');
                        }
                        // RPC는 SETOF/RETURNS TABLE → 배열로 반환될 수 있음. 단일 row 추출.
                        const raw = response.data;
                        const returnedRow = Array.isArray(raw) ? raw[0] : raw;
                        if (returnedRow) {
                            return db.mapSupabaseRowToLegacyProduct(returnedRow);
                        }
                        // 반환값이 없으면 true 반환 (기존 deleteProduct 호환)
                        return true;
                    })
                    .catch(err => _wrapWriteError('deleteProduct', err));
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
            store_name: 'LESOUL',
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

    getBrandName() {
        const stored = localStorage.getItem(this.prefix + 'app_brand_name');
        if (stored && stored.trim()) {
            return stored.trim();
        }
        if (typeof LESOUL_CONFIG !== 'undefined' && LESOUL_CONFIG.APP_BRAND_NAME && LESOUL_CONFIG.APP_BRAND_NAME.trim()) {
            return LESOUL_CONFIG.APP_BRAND_NAME.trim();
        }
        return 'LESOUL';
    },

    setBrandName(name) {
        const trimmed = name && name.trim();
        if (trimmed) {
            localStorage.setItem(this.prefix + 'app_brand_name', trimmed);
        } else {
            localStorage.removeItem(this.prefix + 'app_brand_name');
        }
        return this.getBrandName();
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
