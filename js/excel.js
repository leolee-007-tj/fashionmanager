const ExcelManager = {
    /**
     * DEPRECATED: 기존 Excel 관리 화면은 스마트 엑셀 가져오기로 대체되었습니다.
     * 이 render()는 SmartInventoryWorkbookImporter.render()로 연결됩니다.
     * 기존 템플릿 다운로드와 고정 컬럼 업로드 방식은 더 이상 기본 경로가 아닙니다.
     */
    render() {
        if (typeof SmartInventoryWorkbookImporter !== 'undefined') {
            return SmartInventoryWorkbookImporter.render();
        }
        // Fallback: 스마트 임포터가 로드되지 않은 경우
        return `
            <div class="card">
                <h2><i class="fas fa-file-excel"></i> ${t('excel', 'smart_import_title') || '스마트 엑셀 가져오기'}</h2>
                <p class="text-muted">스마트 엑셀 가져오기 모듈을 불러올 수 없습니다. 페이지를 새로고침해주세요.</p>
            </div>
        `;
    },

    // ========== 템플릿 다운로드 ==========

    _downloadSheet(data, sheetName, fileName) {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(data);
        // 헤더 행 스타일 (굵게)
        if (!ws['!cols']) ws['!cols'] = [];
        for (let i = 0; i < data[0].length; i++) {
            ws['!cols'][i] = { wch: 18 };
        }
        // 숫자 타입 강제: 문자열로 저장된 숫자값을 숫자 타입(n)으로 변환
        const range = XLSX.utils.decode_range(ws['!ref']);
        for (let r = range.s.r; r <= range.e.r; r++) {
            for (let c = range.s.c; c <= range.e.c; c++) {
                const addr = XLSX.utils.encode_cell({ r, c });
                const cell = ws[addr];
                if (cell && cell.t === 's') {
                    const num = Number(cell.v);
                    if (!isNaN(num) && String(num) === String(cell.v)) {
                        cell.t = 'n';
                        cell.v = num;
                    }
                }
            }
        }
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
        XLSX.writeFile(wb, fileName);
    },

    downloadProductTemplate() {
        const data = [
            ['브랜드', '상품명', '매입원가', '초기재고', '입고년도', '입고월', '카테고리', '색상', '사이즈', '소재', '메모'],
            ['SYSTEM', '울 니트', '15000', '5', '2025', '6', '니트', 'CREAM', 'FREE', 'WOOL', ''],
            ['MIXXO', '자켓', '25000', '3', '2025', '6', '자켓', 'BLACK', 'M', 'COTTON', ''],
            ['ZARA', '코튼 셔츠', '18000', '10', '2025', '7', '셔츠', 'WHITE', 'L', 'COTTON', ''],
        ];
        this._downloadSheet(data, '상품목록', 'template_products.xlsx');
    },

    downloadOrderTemplate() {
        const data = [
            ['고객명', '브랜드', '상품명', '최종흥정가(위안)', '판매일'],
            ['김미영', 'SYSTEM', '울 니트', '35000', '2025-07-01'],
            ['이수진', 'MIXXO', '자켓', '45000', '2025-07-02'],
        ];
        this._downloadSheet(data, '판매목록', 'template_sales.xlsx');
    },

    downloadCustomerTemplate() {
        const data = [
            ['이름', '전화번호', '주소', '메모'],
            ['김미영', '010-1234-5678', '서울시 강남구', 'VIP 고객'],
            ['이수진', '010-8765-4321', '부산시 해운대구', ''],
        ];
        this._downloadSheet(data, '고객목록', 'template_customers.xlsx');
    },

    downloadKeywordTemplate() {
        const data = [
            ['타입', '표준명', '한국어키워드', '중국어키워드', '영어키워드', '일본어키워드', '대체어', '우선순위'],
            ['brand', 'SYSTEM', 'SYSTEM,시스템', 'SYSTEM,系统', 'SYSTEM,SYS', 'SYSTEM,システム', '', '5'],
            ['category', '니트', '니트,스웨터', '针织衫,毛衣', 'KNIT,SWEATER', 'ニット,セーター', '', '5'],
            ['color', 'BLACK', 'BLACK,블랙,검정', 'BLACK,黑色,黑', 'BLACK,BLK', 'BLACK,ブラック,黒', '', '5'],
            ['size', 'FREE', 'FREE,프리', 'FREE,均码', 'FREE,ONE SIZE', 'FREE,フリー', '', '5'],
            ['material', 'WOOL', 'WOOL,울', 'WOOL,羊毛', 'WOOL', 'WOOL,ウール', '', '5'],
        ];
        this._downloadSheet(data, '키워드목록', 'template_keywords.xlsx');
    },

    // ========== 업로드 ==========

    _parseExcelDate(val) {
        if (val === null || val === undefined || val === '') return null;
        if (val instanceof Date) return val;
        if (typeof val === 'number') {
            const utcDays = Math.floor(val - 25569);
            const utcValue = utcDays * 86400;
            const d = new Date(utcValue * 1000);
            const fractional = val - Math.floor(val) + 0.0000001;
            let totalSeconds = Math.floor(86400 * fractional);
            const seconds = totalSeconds % 60;
            totalSeconds -= seconds;
            const hours = Math.floor(totalSeconds / 3600);
            const minutes = Math.floor(totalSeconds / 60) % 60;
            return new Date(d.getFullYear(), d.getMonth(), d.getDate(), hours, minutes, seconds);
        }
        const str = String(val).trim();
        const d = new Date(str);
        if (!isNaN(d.getTime())) return d;
        const m = str.match(/(\d{4})[\.\-\/年](\d{1,2})[\.\-\/月](\d{1,2})/);
        if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        return null;
    },

    _formatDate(date) {
        if (!date) return '';
        const d = date instanceof Date ? date : new Date(date);
        if (isNaN(d.getTime())) return '';
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
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
        reader.onload = async function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const wb = XLSX.read(data, { type: 'array' });
                const sheetName = wb.SheetNames[0];
                const ws = wb.Sheets[sheetName];
                const json = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
                if (json.length < 2) {
                    App.flash('데이터가 없습니다. (헤더 행 + 데이터 행 필요)', 'warning');
                    return;
                }
                // 첫 행을 키로 사용하여 객체 배열 변환
                const headers = json[0].map(h => String(h).trim());
                const rows = json.slice(1).map(row => {
                    const obj = {};
                    headers.forEach((h, i) => {
                        obj[h] = row[i] !== undefined ? row[i] : '';
                    });
                    return obj;
                }).filter(row => Object.values(row).some(v => v !== '' && v !== null && v !== undefined));

                if (mode === 'products') {
                    await ExcelManager.importProducts(rows);
                } else if (mode === 'orders') {
                    await ExcelManager.importOrders(rows);
                } else if (mode === 'customers') {
                    await ExcelManager.importCustomers(rows);
                } else if (mode === 'keywords') {
                    ExcelManager.importKeywords(rows);
                }
            } catch (err) {
                App.flash(t('common', 'error') + ': ' + err.message, 'error');
            }
        };
        reader.readAsArrayBuffer(file);
    },

    _isRemoteProductsMode() {
        try {
            const ds = DB.getProductsDataSource();
            return ds && ds.name === 'SupabaseProductsDataSource';
        } catch (e) {
            return false;
        }
    },

    _isRemoteOrdersMode() {
        try {
            const ds = DB.getOrdersDataSource();
            return ds && ds.name === 'SupabaseOrdersDataSource';
        } catch (e) {
            return false;
        }
    },

    _isRemoteCustomersMode() {
        try {
            const client = window.LESOULSupabase && window.LESOULSupabase.getClient();
            const storeId = window.LESOULAppBootstrap?.getContext?.()?.activeMembership?.storeId;
            return !!(client && storeId);
        } catch (e) {
            return false;
        }
    },

    // 입고년도/월은 엑셀 셀 값에서 자동 감지 (UI 선택 없음)
    _getSelectedImportYearMonth() {
        return { year: null, month: null };
    },

    // ========== Product Import Field Aliases ==========

    // Logical field -> array of allowed header names (order-independent)
    PRODUCT_IMPORT_FIELD_ALIASES: {
        brand: ['브랜드', 'brand'],
        title: ['상품명', 'original_title', 'title', 'product_name'],
        cost: ['매입원가', '한국매입원가(KRW)', '한국매입원가', '한국원가', '원가', 'cost', 'korea_cost'],
        stock: ['초기재고', '현재재고', '재고', '상품수량', '수량', 'stock', 'quantity', 'current_stock'],
        stockYear: ['입고년도', '입고연도', '년도', '연도', 'stock_year', 'year'],
        stockMonth: ['입고월', '월', 'stock_month', 'month'],
        category: ['카테고리', '종류', 'category'],
        color: ['색상', '컬러', 'color'],
        size: ['사이즈', '칫수', 'size'],
        material: ['소재', '재질', 'material'],
        notes: ['메모', '비고', 'notes'],
        productCode: ['상품코드', 'product_code']
    },

    /**
     * row 객체에서 alias 배열로 값을 찾는다.
     * 첫 번째로 매칭되는 alias의 값을 반환.
     * @param {Object} row - 엑셀 row 객체
     * @param {Array<string>} aliases - 허용되는 컬럼명 배열
     * @returns {*} 매칭된 값 또는 null
     */
    _getByAliases(row, aliases) {
        for (const alias of aliases) {
            if (row.hasOwnProperty(alias) && row[alias] !== '' && row[alias] !== null && row[alias] !== undefined) {
                return row[alias];
            }
        }
        return null;
    },

    /**
     * 헤더 이름을 정규화한다 (trim + lowercase).
     * @param {string} value
     * @returns {string}
     */
    _normalizeHeaderName(value) {
        return String(value || '').trim();
    },

    /**
     * 업로드된 rows의 헤더를 감사한다.
     * @param {Array<Object>} rows - 엑셀 row 객체 배열
     * @param {Object} selectedYM - { year, month }
     * @returns {Object} 감사 결과
     */
    _auditProductImportHeaders(rows, selectedYM) {
        const firstRow = rows.length > 0 ? rows[0] : {};
        const headers = Object.keys(firstRow);
        const matched = {};
        const missingRequiredLogicalFields = [];
        const warnings = [];

        const requiredFields = ['brand', 'title', 'cost', 'stock', 'stockYear', 'stockMonth'];
        const aliases = this.PRODUCT_IMPORT_FIELD_ALIASES;

        for (const field of requiredFields) {
            const found = aliases[field].some(a => headers.includes(a));
            matched[field] = found;
            if (!found) {
                missingRequiredLogicalFields.push(field);
            }
        }

        // Optional fields check
        for (const field of ['category', 'color', 'size', 'material', 'notes', 'productCode']) {
            matched[field] = aliases[field].some(a => headers.includes(a));
        }

        if (missingRequiredLogicalFields.length > 0) {
            warnings.push('필수 컬럼 누락: ' + missingRequiredLogicalFields.join(', ') + '. 템플릿을 확인해주세요.');
        }

        return {
            headers,
            matched,
            missingRequiredLogicalFields,
            warnings,
            selectedYM
        };
    },

    /**
     * 상품 identity key를 생성한다.
     * brand + original_title + color + size + korea_cost + stock_year + stock_month
     * @param {Object} product - 상품 객체
     * @returns {string} identity key
     */
    getProductIdentityKey(product) {
        const normalize = (v) => String(v || '').trim().toLowerCase();
        const normalizeNumber = (v) => {
            const n = Number(v);
            return Number.isFinite(n) ? String(Math.round(n)) : '0';
        };
        return [
            normalize(product.brand),
            normalize(product.original_title),
            normalize(product.color),
            normalize(product.size),
            normalizeNumber(product.korea_cost),
            normalizeNumber(product.stock_year),
            normalizeNumber(product.stock_month)
        ].join('|');
    },

    // year/month resolver: Excel 셀 값 우선 → UI 선택값 fallback → 현재 날짜 최종 fallback
    _resolveProductImportYearMonth(row, selected) {
        let rowYear = null;
        let rowMonth = null;

        // 1) 입고년도 + 입고월 각각 컬럼
        const rawYear = parseInt(row['입고년도'] || row['년도'] || row['stock_year'] || '', 10);
        const rawMonth = parseInt(row['입고월'] || row['월'] || row['stock_month'] || '', 10);

        if (Number.isFinite(rawYear) && rawYear >= 2025 && Number.isFinite(rawMonth) && rawMonth >= 1 && rawMonth <= 12) {
            rowYear = rawYear;
            rowMonth = rawMonth;
        }

        // 2) 입고월 컬럼이 "YYYY-MM" 형식인 경우 (예: "2025-06", "2025.06", "2025/06")
        if (!rowYear || !rowMonth) {
            const stockMonthStr = String(row['입고월'] || row['월'] || row['stock_month'] || '');
            const ymMatch = stockMonthStr.match(/(\d{4})\s*[\.\-\/년]\s*(\d{1,2})/);
            if (ymMatch) {
                const y = parseInt(ymMatch[1], 10);
                const m = parseInt(ymMatch[2], 10);
                if (y >= 2025 && m >= 1 && m <= 12) {
                    rowYear = y;
                    rowMonth = m;
                }
            }
        }

        // 3) 입고일/입고날짜 컬럼에서 year/month 추출
        if (!rowYear || !rowMonth) {
            const dateVal = row['입고일'] || row['입고날짜'] || row['stock_date'] || row['date'] || '';
            if (dateVal) {
                const d = this._parseExcelDate(dateVal);
                if (d && !isNaN(d.getTime())) {
                    const y = d.getFullYear();
                    const m = d.getMonth() + 1;
                    if (y >= 2025) {
                        rowYear = y;
                        rowMonth = m;
                    }
                }
            }
        }

        // 4) UI 선택값 fallback
        if (!rowYear || !rowMonth) {
            if (selected.year && selected.month) {
                rowYear = selected.year;
                rowMonth = selected.month;
            }
        }

        // 5) 최종 fallback: 현재 날짜
        if (!rowYear || !rowMonth) {
            const now = new Date();
            rowYear = now.getFullYear();
            rowMonth = now.getMonth() + 1;
        }

        const fromExcel = (rawYear && rawMonth) || (rowYear && rowMonth && !(selected.year && selected.month && rowYear === selected.year && rowMonth === selected.month));
        return {
            stockYear: rowYear,
            stockMonth: rowMonth,
            source: fromExcel ? 'row' : 'ui'
        };
    },

    // BLOCKER-FIX-6: batch-aware product_code allocator builder
    // 한 번의 업로드 batch 안에서 product_code가 절대 중복되지 않게 한다.
    _buildProductCodeAllocator(isRemote, existingProducts) {
        // 기존 모든 product_code 수집
        const existingCodes = [];
        if (isRemote && Array.isArray(existingProducts)) {
            // BLOCKER-FIX-8: remote 모드에서는 listProducts() 결과만 사용.
            // DB.getProducts()는 로컬 캐시로 stale 상태일 수 있어 사용하지 않는다.
            for (const p of existingProducts) {
                if (p.product_code) existingCodes.push(p.product_code);
            }
        } else {
            // local 모드에서만 DB.getProducts() 사용
            try {
                const localProducts = DB.getProducts();
                for (const p of localProducts) {
                    if (p.product_code) existingCodes.push(p.product_code);
                }
            } catch (e) { /* ignore */ }
        }

        const usedCodes = new Set(existingCodes);
        const prefixMax = new Map();

        // 기존 코드를 prefix별 최대 번호로 분석
        for (const code of existingCodes) {
            const match = code.match(/^([A-Z]{3,4}?)(\d+)$/);
            if (match) {
                const prefix = match[1];
                const num = parseInt(match[2], 10);
                if (Number.isFinite(num)) {
                    const current = prefixMax.get(prefix) || 0;
                    if (num > current) prefixMax.set(prefix, num);
                }
            }
        }

        function allocate(brand) {
            const prefix = (brand || 'BRD').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3).padEnd(3, 'X');
            let next = (prefixMax.get(prefix) || 0) + 1;
            let code;
            // 선형 증가로 unique code 보장 (batch 내 collision 방지)
            do {
                code = prefix + String(next).padStart(3, '0');
                next++;
            } while (usedCodes.has(code));
            usedCodes.add(code);
            prefixMax.set(prefix, next - 1);
            return code;
        }

        return { allocate, usedCodes };
    },

    _normalizeProductImportRow(row, idx, nextProductId, selYear, selMonth, codeAllocator) {
        const aliases = this.PRODUCT_IMPORT_FIELD_ALIASES;

        // _getByAliases로 모든 필드 추출
        let koreaCost = this._getByAliases(row, aliases.cost) || 0;
        if (typeof koreaCost === 'string') koreaCost = parseInt(String(koreaCost).replace(/,/g, '')) || 0;

        const brand = String(this._getByAliases(row, aliases.brand) || '').trim();
        const title = String(this._getByAliases(row, aliases.title) || '').trim();

        const skipReasons = [];
        if (!koreaCost) skipReasons.push('MISSING_KOREA_COST');
        if (!title) skipReasons.push('MISSING_TITLE');

        // year/month resolution (row 값 우선)
        const resolved = this._resolveProductImportYearMonth(row, { year: selYear, month: selMonth });
        if (!resolved.stockYear || !resolved.stockMonth) {
            skipReasons.push('MISSING_STOCK_YEAR_MONTH');
        }
        if (resolved.stockMonth === 0) {
            skipReasons.push('STOCK_MONTH_ZERO');
        }

        if (skipReasons.length > 0) {
            return { valid: false, reason: skipReasons.join('+'), rowIndex: idx, hasTitle: !!title, hasKoreaCost: !!koreaCost, parsedKoreaCost: koreaCost };
        }

        const priceResult = PriceCalculator.calculate(koreaCost);
        const stockYear = resolved.stockYear;
        const stockMonth = resolved.stockMonth;

        // product_code 할당 (batch-aware allocator 사용)
        const rawProductCode = this._getByAliases(row, aliases.productCode);
        const rowHasCode = !!rawProductCode;
        let productCode, productCodeReplaced = false;
        if (rowHasCode) {
            if (codeAllocator && codeAllocator.usedCodes && codeAllocator.usedCodes.has(rawProductCode)) {
                productCode = codeAllocator.allocate(brand);
                productCodeReplaced = true;
            } else {
                productCode = rawProductCode;
                if (codeAllocator && codeAllocator.usedCodes) {
                    codeAllocator.usedCodes.add(rawProductCode);
                }
            }
        } else if (codeAllocator && typeof codeAllocator.allocate === 'function') {
            productCode = codeAllocator.allocate(brand);
        } else {
            productCode = DB.generateProductCode(brand, stockYear, stockMonth);
        }

        const currentStock = parseInt(this._getByAliases(row, aliases.stock) || 0) || 0;

        let category = String(this._getByAliases(row, aliases.category) || '').trim();
        let color = String(this._getByAliases(row, aliases.color) || '').trim();
        let size = String(this._getByAliases(row, aliases.size) || '').trim();
        let material = String(this._getByAliases(row, aliases.material) || '').trim();

        if (!category || !color || !size) {
            const autoClassified = ClassificationService.classify(title);
            if (!category && autoClassified.category) category = autoClassified.category;
            if (!color && autoClassified.color) color = autoClassified.color;
            if (!size && autoClassified.size) size = autoClassified.size;
            if (!material && autoClassified.material) material = autoClassified.material;
        }

        const notes = String(this._getByAliases(row, aliases.notes) || '').trim();

        const product = {
            id: nextProductId,
            product_code: productCode,
            productCodeReplaced: productCodeReplaced,
            original_title: title,
            brand: brand,
            category: category,
            color: color,
            size: size,
            material: material,
            korea_cost: koreaCost,
            actual_converted_cost: priceResult.actual_converted_cost,
            china_base_price: priceResult.china_base_price,
            current_stock: currentStock,
            reserved_stock: 0,
            stock_year: stockYear,
            stock_month: stockMonth,
            image: null,
            notes: notes,
            title_language: ClassificationService.detectLanguage(title),
            normalized_title: title,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        return { valid: true, product };
    },

    async _importProductsLocal(normalizedRows) {
        const products = DB.getProducts();
        let inserted = 0;
        let skipped = 0;
        let skippedExisting = 0;
        let mergedInBatchCount = 0;
        let mergedRowCount = 0;
        let productCodeReplacedCount = 0;
        const skippedDetails = [];
        let nextProductId = DB.getNextId('products');

        // Build existing identity map
        const existingIdentityMap = new Map();
        for (const p of products) {
            const key = this.getProductIdentityKey(p);
            existingIdentityMap.set(key, p);
        }

        // Normalize valid rows
        const validRows = normalizedRows.filter(nr => nr.valid);
        const invalidRows = normalizedRows.filter(nr => !nr.valid);
        invalidRows.forEach(nr => { skipped++; skippedDetails.push(nr); });

        // Batch merge: 같은 identity는 하나로 병합, current_stock 합산
        const batchMergedMap = new Map();
        for (const nr of validRows) {
            const key = this.getProductIdentityKey(nr.product);
            if (batchMergedMap.has(key)) {
                const existing = batchMergedMap.get(key);
                existing.product.current_stock += nr.product.current_stock;
                existing.product.notes = existing.product.notes || nr.product.notes;
                mergedRowCount++;
            } else {
                batchMergedMap.set(key, nr);
            }
        }
        mergedInBatchCount = validRows.length - batchMergedMap.size;

        // Process merged products against existing DB
        for (const [key, nr] of batchMergedMap) {
            if (nr.product.productCodeReplaced) productCodeReplacedCount++;

            if (existingIdentityMap.has(key)) {
                // Default mode: skip existing identity
                skippedExisting++;
                skippedDetails.push({ ...nr, reason: 'EXISTING_IDENTITY_SKIP' });
                continue;
            }

            nr.product.id = nextProductId++;
            products.push(nr.product);
            inserted++;
        }

        DB.setProducts(products);
        return {
            inserted, skipped, skippedExisting, failed: 0,
            mergedInBatchCount, mergedRowCount, productCodeReplacedCount,
            skippedDetails
        };
    },

    async _importProductsRemote(normalizedRows) {
        const dataSource = DB.getProductsDataSource();
        let inserted = 0;
        let skipped = 0;
        let skippedExisting = 0;
        let failed = 0;
        let mergedInBatchCount = 0;
        let mergedRowCount = 0;
        let productCodeReplacedCount = 0;
        let productCodeDuplicateCount = 0;
        const skippedDetails = [];

        // 기존 상품 한 번만 조회
        let existingProducts = [];
        let nextProductId = DB.getNextId('products');
        try {
            existingProducts = await dataSource.listProducts();
            let maxRemoteLegacyId = existingProducts.reduce((max, p) => {
                const lid = Number(p.legacy_id);
                return Number.isFinite(lid) && lid > max ? lid : max;
            }, 0);

            try {
                const supabaseClient = window.LESOULSupabase && window.LESOULSupabase.getClient();
                if (supabaseClient) {
                    const storeId = window.LESOULAppBootstrap?.getContext?.()?.activeMembership?.storeId;
                    if (storeId) {
                        const { data: maxLegacyRows } = await supabaseClient
                            .from('products')
                            .select('legacy_id')
                            .eq('store_id', storeId)
                            .not('legacy_id', 'is', null)
                            .order('legacy_id', { ascending: false })
                            .limit(1);
                        if (maxLegacyRows && maxLegacyRows.length > 0) {
                            const maxLegacyFromAll = Number(maxLegacyRows[0].legacy_id);
                            if (Number.isFinite(maxLegacyFromAll) && maxLegacyFromAll > maxRemoteLegacyId) {
                                maxRemoteLegacyId = maxLegacyFromAll;
                            }
                        }
                    }
                }
            } catch (e) { /* fallback */ }

            const localNextId = DB.getNextId('products');
            nextProductId = Math.max(maxRemoteLegacyId + 1, localNextId);
        } catch (e) {
            nextProductId = DB.getNextId('products');
        }

        // Build existing identity map
        const existingIdentityMap = new Map();
        for (const p of existingProducts) {
            const key = this.getProductIdentityKey(p);
            existingIdentityMap.set(key, p);
        }

        // Normalize valid rows
        const validRows = normalizedRows.filter(nr => nr.valid);
        const invalidRows = normalizedRows.filter(nr => !nr.valid);
        invalidRows.forEach(nr => { skipped++; skippedDetails.push(nr); });

        // Batch merge: 같은 identity는 하나로 병합, current_stock 합산
        const batchMergedMap = new Map();
        for (const nr of validRows) {
            const key = this.getProductIdentityKey(nr.product);
            if (batchMergedMap.has(key)) {
                const existing = batchMergedMap.get(key);
                existing.product.current_stock += nr.product.current_stock;
                existing.product.notes = existing.product.notes || nr.product.notes;
                mergedRowCount++;
            } else {
                batchMergedMap.set(key, nr);
            }
        }
        mergedInBatchCount = validRows.length - batchMergedMap.size;

        // Process merged products against existing DB
        for (const [key, nr] of batchMergedMap) {
            if (nr.product.productCodeReplaced) productCodeReplacedCount++;

            if (existingIdentityMap.has(key)) {
                // Default mode: skip existing identity
                skippedExisting++;
                skippedDetails.push({ ...nr, reason: 'EXISTING_IDENTITY_SKIP' });
                continue;
            }

            nr.product.id = nextProductId;
            nr.product.legacy_id = nextProductId;
            nextProductId++;

            try {
                const result = await dataSource.createProduct(nr.product);
                if (result) {
                    inserted++;
                } else {
                    failed++;
                    skippedDetails.push({ ...nr, reason: 'REMOTE_CREATE_FAILED' });
                }
            } catch (e) {
                const is409 = e && (e.code === '409' || e.code === '23505' || String(e.message || e.details || '').includes('409') || String(e.message || e.details || '').includes('Conflict') || String(e.message || e.details || '').includes('duplicate'));
                if (is409 && nr.product.product_code) {
                    productCodeDuplicateCount++;
                    skipped++;
                    skippedDetails.push({ ...nr, reason: 'PRODUCT_CODE_DUPLICATE' });
                } else if (is409) {
                    skipped++;
                    skippedDetails.push({ ...nr, reason: 'REMOTE_CONFLICT_409' });
                } else {
                    failed++;
                    skippedDetails.push({ ...nr, reason: 'REMOTE_CREATE_ERROR', error: (e.message || '').slice(0, 200) });
                }
            }
        }
        return {
            inserted, skipped, skippedExisting, failed,
            mergedInBatchCount, mergedRowCount, productCodeReplacedCount, productCodeDuplicateCount,
            skippedDetails
        };
    },

    async importProducts(data) {
        if (data.length === 0) {
            App.flash('업로드할 데이터가 없습니다.', 'warning');
            return;
        }
        if (!confirm(data.length + ' ' + t('excel', 'confirm_import_count') + '?')) return;

        const selectedYM = this._getSelectedImportYearMonth();
        const selYear = selectedYM.year;
        const selMonth = selectedYM.month;

        const isRemote = this._isRemoteProductsMode();

        // Header audit
        const headerAudit = this._auditProductImportHeaders(data, selectedYM);
        window.__LAST_PRODUCT_IMPORT_HEADER_AUDIT = headerAudit;

        // Before count
        let beforeDatasourceCount = 0;
        if (isRemote) {
            try {
                const ds = DB.getProductsDataSource();
                const existingProducts = await ds.listProducts();
                beforeDatasourceCount = existingProducts.length;
            } catch (e) { /* ignore */ }
        } else {
            beforeDatasourceCount = DB.getProducts().length;
        }

        // Build code allocator
        let nextProductId = DB.getNextId('products');
        let codeAllocator = null;
        if (isRemote) {
            try {
                const ds = DB.getProductsDataSource();
                const existingProducts = await ds.listProducts();
                codeAllocator = this._buildProductCodeAllocator(true, existingProducts);
            } catch (e) {
                codeAllocator = this._buildProductCodeAllocator(false);
            }
        } else {
            codeAllocator = this._buildProductCodeAllocator(false);
        }

        // Normalize all rows
        const normalizedRows = data.map((row, idx) => {
            return this._normalizeProductImportRow(row, idx, nextProductId + idx, selYear, selMonth, codeAllocator);
        });

        // Import
        let result;
        if (isRemote) {
            result = await this._importProductsRemote(normalizedRows);
        } else {
            result = await this._importProductsLocal(normalizedRows);
        }

        const inserted = result.inserted || 0;
        const skippedExisting = result.skippedExisting || 0;
        const totalSkipped = (result.skipped || 0) + skippedExisting;
        const failed = result.failed || 0;
        const mergedInBatchCount = result.mergedInBatchCount || 0;
        const mergedRowCount = result.mergedRowCount || 0;

        // Input stats
        const inputRows = data.length;
        const validRows = normalizedRows.filter(nr => nr.valid).length;
        const invalidRows = inputRows - validRows;
        const normalizedProductCount = validRows - mergedRowCount;

        // Total stock in file (raw data)
        const totalStockInFile = data.reduce((sum, row) => {
            const stock = parseInt(this._getByAliases(row, this.PRODUCT_IMPORT_FIELD_ALIASES.stock) || 0) || 0;
            return sum + stock;
        }, 0);

        // Post-import count
        let datasourceCount = 0;
        if (typeof DB.getProductsAsync === 'function') {
            try {
                const allProducts = await DB.getProductsAsync();
                datasourceCount = allProducts.length;
            } catch (e) { /* fallback */ }
        } else {
            datasourceCount = DB.getProducts().length;
        }

        const expectedDatasourceCountAfter = beforeDatasourceCount + inserted;
        const countDeltaMatchesExpected = datasourceCount === expectedDatasourceCountAfter;

        // Success year/month tracking
        const successYearMonths = new Set();
        let firstSuccessYear = null;
        let firstSuccessMonth = null;
        if (inserted > 0) {
            normalizedRows.forEach((nr) => {
                if (nr.valid && nr.product && nr.product.stock_year && nr.product.stock_month) {
                    const p = nr.product;
                    successYearMonths.add(String(p.stock_year) + '-' + String(p.stock_month).padStart(2, '0'));
                    if (!firstSuccessYear) { firstSuccessYear = p.stock_year; firstSuccessMonth = p.stock_month; }
                }
            });
        }

        // Inserted stock total
        let insertedStockTotal = 0;
        normalizedRows.forEach((nr) => {
            if (nr.valid && nr.product) {
                insertedStockTotal += (nr.product.current_stock || 0);
            }
        });

        // Enhanced import summary
        window.__LAST_PRODUCT_IMPORT_SUMMARY = {
            mode: isRemote ? 'remote' : 'local',
            importMode: 'default',
            inputRows,
            validRows,
            invalidRows,
            normalizedProductCount,
            mergedInBatchCount,
            mergedRowCount,
            existingExactMatches: skippedExisting,
            skippedExisting,
            inserted,
            updated: 0,
            restocked: 0,
            replaced: 0,
            added: inserted,
            skipped: totalSkipped,
            failed,
            beforeDatasourceCount,
            expectedDatasourceCountAfter,
            postImportDatasourceCount: datasourceCount,
            countDeltaMatchesExpected,
            totalStockInFile,
            insertedStockTotal,
            updatedStockDelta: 0,
            postImportTotalStock: 0,
            productsFilterYear: null,
            productsFilterMonth: null,
            postImportVisibleCount: 0,
            headerAudit,
            productCodeGeneratedCount: validRows - (result.productCodeReplacedCount || 0),
            productCodeReplacedCount: result.productCodeReplacedCount || 0,
            productCodeDuplicateCount: result.productCodeDuplicateCount || 0,
            successYearMonths: Array.from(successYearMonths).sort(),
            skippedDetails: result.skippedDetails ? result.skippedDetails.map(d => ({
                rowIndex: d.rowIndex,
                reason: d.reason,
                hasTitle: d.hasTitle,
                hasKoreaCost: d.hasKoreaCost
            })) : [],
            navigatedToProducts: false
        };

        if (!countDeltaMatchesExpected) {
            console.error('Product import count mismatch: expected', expectedDatasourceCountAfter, 'got', datasourceCount);
        }

        if (result.skippedDetails && result.skippedDetails.length > 0) {
            console.warn('Product import skipped details:', window.__LAST_PRODUCT_IMPORT_SUMMARY);
        }

        // UI 메시지
        if (inserted === 0 && totalSkipped === 0 && failed === 0) {
            App.flash('0건 등록 (컬럼명 확인 필요)', 'warning');
        } else {
            const parts = [];
            if (inserted > 0) parts.push(`신규 ${inserted}개`);
            if (skippedExisting > 0) parts.push(`기존 중복 ${skippedExisting}개`);
            if (mergedInBatchCount > 0) parts.push(`파일 내 병합 ${mergedInBatchCount}건`);
            if ((result.skipped || 0) > 0) parts.push(`스킵 ${result.skipped}건`);
            if (failed > 0) parts.push(`실패 ${failed}건`);

            let msg = parts.join(', ');
            if (inserted === 0 && skippedExisting > 0) {
                msg = `신규 0개, 기존 중복 ${skippedExisting}개 — 같은 상품은 목록에 중복 추가하지 않았습니다.`;
            }
            App.flash(`상품 업로드 완료: ${msg}`, failed > 0 ? 'warning' : 'success');
        }

        // Navigate to products
        if (typeof Products !== 'undefined') {
            Products.state.loaded = false;
            Products.state.search = '';

            if (inserted > 0) {
                if (successYearMonths.size === 1 && firstSuccessYear && firstSuccessMonth) {
                    Products.state.stockYear = firstSuccessYear;
                    Products.state.stockMonth = firstSuccessMonth;
                    window.__LAST_PRODUCT_IMPORT_SUMMARY.productsFilterYear = firstSuccessYear;
                    window.__LAST_PRODUCT_IMPORT_SUMMARY.productsFilterMonth = firstSuccessMonth;
                } else {
                    Products.state.stockYear = 0;
                    Products.state.stockMonth = 0;
                    window.__LAST_PRODUCT_IMPORT_SUMMARY.productsFilterYear = 0;
                    window.__LAST_PRODUCT_IMPORT_SUMMARY.productsFilterMonth = 0;
                    if (successYearMonths.size > 1) {
                        App.flash('여러 입고월 상품이 업로드되어 전체 보기로 이동했습니다.', 'info');
                    }
                }
            } else {
                Products.state.stockYear = 0;
                Products.state.stockMonth = 0;
            }

            await Products.load();
            window.__LAST_PRODUCT_IMPORT_SUMMARY.navigatedToProducts = true;
            const visibleCount = Products.state.filtered.length;
            window.__LAST_PRODUCT_IMPORT_SUMMARY.postImportVisibleCount = visibleCount;
        }

        // 상품목록으로 이동
        location.hash = '#/products';
        App.render();
    },

    async importOrders(data) {
        if (data.length === 0) {
            App.flash('업로드할 데이터가 없습니다.', 'warning');
            return;
        }
        if (!confirm(data.length + ' ' + t('excel', 'confirm_import_count') + '?')) return;

        if (data.length > 0) {
            const orderHeaders = Object.keys(data[0]).join(', ');
            console.log('[importOrders] 엑셀 컬럼명:', orderHeaders);
        }

        if (this._isRemoteOrdersMode()) {
            return this._importOrdersRemote(data);
        }
        return this._importOrdersLocal(data);
    },

    _importOrdersLocal(data) {
        const orders = DB.getOrders();
        const customers = DB.getCustomers();
        const products = DB.getProducts();
        let added = 0;
        let skipped = 0;
        let replaced = 0;
        let nextCustomerId = DB.getNextId('customers');
        let nextOrderId = DB.getNextId('orders');

        const uploadedKeys = new Set();
        const uploadMonths = new Set();
        const normalizedRows = [];
        data.forEach((row, idx) => {
            const customerName = String(row['고객명'] || row['customer_name'] || row['name'] || row['고객이름'] || row['고객'] || row['customer'] || '').trim();
            const productName = String(row['상품명'] || row['product_name'] || row['original_title'] || row['상품이름'] || row['제품명'] || row['품명'] || '').trim();
            const brand = String(row['브랜드'] || row['brand'] || '').trim();
            const rawDate = row['판매일'] || row['order_date'] || row['date'] || '';
            const dateObj = this._parseExcelDate(rawDate) || new Date();
            if (!isNaN(dateObj.getTime())) {
                uploadMonths.add(dateObj.getFullYear() + '-' + (dateObj.getMonth() + 1));
            }
            const orderDateStr = this._formatDate(dateObj);
            if (!customerName || !productName) {
                skipped++;
                console.log(`[importOrders] 행 ${idx + 2}: 스킵 - 고객명="${customerName || '(없음)'}", 상품명="${productName || '(없음)'}", 데이터:`, JSON.stringify(row));
                return;
            }
            const key = (customerName.toLowerCase()) + '|' + (brand.toLowerCase()) + '|' + (productName.toLowerCase());
            uploadedKeys.add(key);
            normalizedRows.push({ idx, row, customerName, productName, brand, key, orderDateStr });
        });

        if (uploadMonths.size > 0 && uploadedKeys.size > 0) {
            const beforeCount = orders.length;
            const remaining = orders.filter(o => {
                if (!o.order_date) return true;
                const d = new Date(o.order_date);
                if (isNaN(d.getTime())) return true;
                const oMonth = d.getFullYear() + '-' + (d.getMonth() + 1);
                if (!uploadMonths.has(oMonth)) return true;
                const cust = customers.find(c => c.id === o.customer_id);
                const prod = products.find(p => p.id === o.product_id);
                const oKey = ((cust?.name || '').toLowerCase()) + '|' + ((prod?.brand || o.brand || '').toLowerCase()) + '|' + ((prod?.original_title || '').toLowerCase());
                return !uploadedKeys.has(oKey);
            });
            replaced = beforeCount - remaining.length;
            orders.length = 0;
            orders.push(...remaining);
        }

        normalizedRows.forEach(({ idx, row, customerName, productName, brand, orderDateStr }) => {
            const isZiLiu = /自留|자留|지留|자류|지류|自留款/i.test(customerName);
            let sellingPrice = parseFloat(row['최종흥정가(위안)'] || row['최종흥정가'] || row['판매가'] || row['selling_price'] || row['price'] || row['가격'] || row['판매금액'] || 0) || 0;
            if (isZiLiu) {
                sellingPrice = sellingPrice || 0;
            }

            let customer = customers.find(c => c.name && c.name.toLowerCase() === customerName.toLowerCase());
            if (!customer) {
                customer = {
                    id: nextCustomerId++,
                    name: customerName,
                    wechat_nickname: '',
                    phone: row['전화번호'] || row['phone'] || '',
                    address: row['주소'] || row['address'] || '',
                    notes: '',
                    total_amount: 0,
                    total_profit: 0,
                    order_count: 0,
                    level: 'normal',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                };
                customers.push(customer);
            }

            let product = products.find(p => p.original_title === productName && (brand === '' || p.brand === brand));
            if (!product) {
                product = products.find(p => p.original_title === productName);
            }
            const productId = product ? product.id : 0;
            const convertedCost = product ? (product.actual_converted_cost || 0) : 0;
            const profit = sellingPrice - convertedCost;

            orders.push({
                id: nextOrderId++,
                order_number: row['주문번호'] || row['order_number'] || 'SAL-' + String(orders.length + 1).padStart(4, '0'),
                customer_id: customer.id,
                customer_name: customer.name,
                product_id: productId,
                brand: brand,
                color: '',
                size: '',
                quantity: 1,
                selling_price: sellingPrice,
                order_date: orderDateStr || new Date().toISOString().slice(0, 10),
                ship_date: row['출고일'] || row['ship_date'] || null,
                shipping_company: row['택배사'] || row['shipping_company'] || '',
                tracking_number: row['운송장번호'] || row['tracking_number'] || '',
                status: 'COMPLETED',
                actual_profit: profit,
                actual_profit_margin: sellingPrice > 0 ? Math.round((profit / sellingPrice) * 100) : 0,
                actual_cost_ratio: sellingPrice > 0 ? Math.round((convertedCost / sellingPrice) * 100) : 0,
                is_zi_liu: isZiLiu,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });
            added++;
        });
        DB.setCustomers(customers);
        DB.setOrders(orders);
        console.log(`[importOrders] 결과: ${added}건 등록, ${skipped}건 스킵, ${replaced}건 덮어쓰기 (총 ${data.length}행)`);
        let msg = `${added}건 등록 완료!`;
        if (replaced > 0) msg += ` (기존 ${replaced}건 덮어쓰기)`;
        if (skipped > 0) msg += ` (${skipped}건 스킵 - 콘솔에서 사유 확인)`;
        App.flash(msg, 'success');
    },

    async _importOrdersRemote(data) {
        const client = window.LESOULSupabase && window.LESOULSupabase.getClient();
        const storeId = window.LESOULAppBootstrap?.getContext?.()?.activeMembership?.storeId;
        if (!client || !storeId) {
            App.flash('Supabase 연결이 필요합니다.', 'error');
            return;
        }

        // 기존 고객/상품 로드
        let existingCustomers = [];
        let existingProducts = [];
        try {
            const [custResult, prodResult] = await Promise.all([
                client.from('customers').select('*').eq('store_id', storeId).is('deleted_at', null),
                DB.getProductsAsync()
            ]);
            existingCustomers = (custResult && custResult.data) || [];
            existingProducts = prodResult || [];
        } catch (e) {
            console.error('[importOrders] remote load failed:', e);
            App.flash('데이터 로드에 실패했습니다.', 'error');
            return;
        }

        let added = 0;
        let skipped = 0;
        const skippedDetails = [];
        const ds = DB.getOrdersDataSource();

        for (let idx = 0; idx < data.length; idx++) {
            const row = data[idx];
            const customerName = String(row['고객명'] || row['customer_name'] || row['name'] || row['고객이름'] || row['고객'] || row['customer'] || '').trim();
            const productName = String(row['상품명'] || row['product_name'] || row['original_title'] || row['상품이름'] || row['제품명'] || row['품명'] || '').trim();
            const brand = String(row['브랜드'] || row['brand'] || '').trim();

            if (!customerName || !productName) {
                skipped++;
                skippedDetails.push({ row: idx + 2, reason: 'MISSING_CUSTOMER_OR_PRODUCT' });
                continue;
            }

            // 고객 찾기 또는 생성
            let customer = existingCustomers.find(c =>
                (c.name || '').toLowerCase() === customerName.toLowerCase()
            );
            if (!customer) {
                try {
                    const insertResult = await client.from('customers').insert({
                        store_id: storeId,
                        name: customerName,
                        phone: row['전화번호'] || row['phone'] || '',
                        address: row['주소'] || row['address'] || '',
                        wechat_nickname: '',
                        notes: '',
                        total_amount: 0,
                        total_profit: 0,
                        order_count: 0,
                        level: 'normal'
                    }).select().single();
                    if (insertResult.error) {
                        skipped++;
                        skippedDetails.push({ row: idx + 2, reason: 'CUSTOMER_CREATE_FAILED', error: insertResult.error.message });
                        continue;
                    }
                    customer = insertResult.data;
                    existingCustomers.push(customer);
                } catch (e) {
                    skipped++;
                    skippedDetails.push({ row: idx + 2, reason: 'CUSTOMER_CREATE_ERROR', error: (e.message || '').slice(0, 200) });
                    continue;
                }
            }

            // 상품 찾기
            let product = existingProducts.find(p =>
                p.original_title === productName && (brand === '' || p.brand === brand)
            );
            if (!product) {
                product = existingProducts.find(p => p.original_title === productName);
            }
            if (!product) {
                skipped++;
                skippedDetails.push({ row: idx + 2, reason: 'PRODUCT_NOT_FOUND', productName, brand });
                continue;
            }

            const rawDate = row['판매일'] || row['order_date'] || row['date'] || '';
            const dateObj = this._parseExcelDate(rawDate) || new Date();
            const orderDateStr = this._formatDate(dateObj);

            const isZiLiu = /自留|자留|지留|자류|지류|自留款/i.test(customerName);
            let sellingPrice = parseFloat(row['최종흥정가(위안)'] || row['최종흥정가'] || row['판매가'] || row['selling_price'] || row['price'] || row['가격'] || row['판매금액'] || 0) || 0;
            if (isZiLiu) sellingPrice = sellingPrice || 0;

            try {
                const quantity = Math.max(1, parseInt(row['수량'] || row['판매수량'] || row['quantity'] || 1, 10) || 1);
                const importResult = await client.rpc('import_historical_sale', {
                    p_store_id: storeId,
                    p_customer_id: customer.remote_id || customer.id,
                    p_product_id: product.remote_id || product.id,
                    p_quantity: quantity,
                    p_selling_price: sellingPrice,
                    p_order_date: orderDateStr || new Date().toISOString().slice(0, 10)
                });
                if (importResult.error) throw new Error(importResult.error.message || 'HISTORICAL_SALE_IMPORT_FAILED');
                added++;
            } catch (e) {
                skipped++;
                skippedDetails.push({ row: idx + 2, reason: 'ORDER_CREATE_FAILED', error: (e.message || '').slice(0, 200) });
            }
        }

        console.log(`[importOrders] 결과: ${added}건 등록, ${skipped}건 스킵 (총 ${data.length}행)`);
        if (skippedDetails.length > 0) {
            console.log('[importOrders] 스킵 상세:', skippedDetails);
        }
        let msg = `${added}건 등록 완료!`;
        if (skipped > 0) msg += ` (${skipped}건 스킵 - 콘솔에서 사유 확인)`;
        App.flash(msg, 'success');
    },

    async importCustomers(data) {
        if (data.length === 0) {
            App.flash('업로드할 데이터가 없습니다.', 'warning');
            return;
        }
        if (!confirm(data.length + ' ' + t('excel', 'confirm_import_count') + '?')) return;

        if (data.length > 0) {
            const custHeaders = Object.keys(data[0]).join(', ');
            console.log('[importCustomers] 엑셀 컬럼명:', custHeaders);
        }

        if (this._isRemoteCustomersMode()) {
            return this._importCustomersRemote(data);
        }
        return this._importCustomersLocal(data);
    },

    _importCustomersLocal(data) {
        const customers = DB.getCustomers();
        let added = 0;
        let skippedNoName = 0;
        let skippedDuplicate = 0;
        const duplicateNames = [];
        let nextCustomerId = DB.getNextId('customers');

        const existingNames = new Set(customers.map(c => (c.name || '').toLowerCase().trim()));
        const batchNames = new Set();

        data.forEach((row, idx) => {
            const name = (row['이름'] || row['name'] || row['고객명'] || row['customer_name']
                || row['고객이름'] || row['성함'] || row['고객'] || row['customer']
                || row['fullname'] || row['full_name'] || '').toString().trim();
            if (!name) {
                skippedNoName++;
                console.log(`[importCustomers] 행 ${idx + 2}: 이름 없음 (컬럼 확인 필요), 행 데이터:`, JSON.stringify(row));
                return;
            }
            const nameLower = name.toLowerCase();
            if (existingNames.has(nameLower) || batchNames.has(nameLower)) {
                skippedDuplicate++;
                duplicateNames.push(name);
                console.log(`[importCustomers] 행 ${idx + 2}: 중복 스킵 - "${name}"`);
                return;
            }
            batchNames.add(nameLower);
            customers.push({
                id: nextCustomerId++,
                name: name,
                wechat_nickname: (row['위챗닉네임'] || row['wechat_nickname'] || row['wechat'] || '').toString().trim(),
                phone: (row['전화번호'] || row['phone'] || row['연락처'] || '').toString().trim(),
                address: (row['주소'] || row['address'] || '').toString().trim(),
                notes: (row['메모'] || row['notes'] || row['비고'] || '').toString().trim(),
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
        console.log(`[importCustomers] 결과: ${added}건 등록, ${skippedNoName}건 이름없음, ${skippedDuplicate}건 중복스킵 (총 ${data.length}행)`);
        if (duplicateNames.length > 0) {
            console.log(`[importCustomers] 중복된 이름 목록 (${duplicateNames.length}건):`, duplicateNames);
        }
        if (added === 0) {
            const msg = skippedNoName > 0
                ? `등록할 고객이 없습니다. (이름 컬럼 확인 필요, 엑셀 컬럼: ${Object.keys(data[0]).join(', ')})`
                : '등록할 고객이 없습니다. (모든 이름이 이미 존재하거나 중복입니다)';
            App.flash(msg, 'warning');
        } else {
            let msg = `${added}건 등록 완료!`;
            if (skippedNoName > 0) msg += ` (${skippedNoName}건 이름없음)`;
            if (skippedDuplicate > 0) {
                const preview = duplicateNames.slice(0, 5).join(', ');
                const more = duplicateNames.length > 5 ? ` 외 ${duplicateNames.length - 5}건` : '';
                msg += ` (${skippedDuplicate}건 중복: ${preview}${more})`;
                msg += ` - 콘솔(F12)에서 전체 목록 확인`;
            }
            App.flash(msg, 'success');
        }
    },

    async _importCustomersRemote(data) {
        const client = window.LESOULSupabase && window.LESOULSupabase.getClient();
        const storeId = window.LESOULAppBootstrap?.getContext?.()?.activeMembership?.storeId;
        if (!client || !storeId) {
            App.flash('Supabase 연결이 필요합니다.', 'error');
            return;
        }

        // 기존 고객 로드
        let existingCustomers = [];
        try {
            const custResult = await client.from('customers').select('*').eq('store_id', storeId).is('deleted_at', null);
            existingCustomers = (custResult && custResult.data) || [];
        } catch (e) {
            console.error('[importCustomers] remote load failed:', e);
            App.flash('데이터 로드에 실패했습니다.', 'error');
            return;
        }

        let added = 0;
        let skippedNoName = 0;
        let skippedDuplicate = 0;
        const duplicateNames = [];
        const existingNames = new Set(existingCustomers.map(c => (c.name || '').toLowerCase().trim()));
        const batchNames = new Set();

        for (let idx = 0; idx < data.length; idx++) {
            const row = data[idx];
            const name = (row['이름'] || row['name'] || row['고객명'] || row['customer_name']
                || row['고객이름'] || row['성함'] || row['고객'] || row['customer']
                || row['fullname'] || row['full_name'] || '').toString().trim();
            if (!name) {
                skippedNoName++;
                console.log(`[importCustomers] 행 ${idx + 2}: 이름 없음 (컬럼 확인 필요), 행 데이터:`, JSON.stringify(row));
                continue;
            }
            const nameLower = name.toLowerCase();
            if (existingNames.has(nameLower) || batchNames.has(nameLower)) {
                skippedDuplicate++;
                duplicateNames.push(name);
                console.log(`[importCustomers] 행 ${idx + 2}: 중복 스킵 - "${name}"`);
                continue;
            }
            batchNames.add(nameLower);

            try {
                const insertResult = await client.from('customers').insert({
                    store_id: storeId,
                    name: name,
                    wechat_nickname: (row['위챗닉네임'] || row['wechat_nickname'] || row['wechat'] || '').toString().trim(),
                    phone: (row['전화번호'] || row['phone'] || row['연락처'] || '').toString().trim(),
                    address: (row['주소'] || row['address'] || '').toString().trim(),
                    notes: (row['메모'] || row['notes'] || row['비고'] || '').toString().trim(),
                    total_amount: 0,
                    total_profit: 0,
                    order_count: 0,
                    level: 'normal'
                }).select().single();
                if (insertResult.error) {
                    skippedDuplicate++;
                    duplicateNames.push(name);
                    console.log(`[importCustomers] 행 ${idx + 2}: 생성 실패 - "${name}", error:`, insertResult.error.message);
                    continue;
                }
                existingNames.add(nameLower);
                added++;
            } catch (e) {
                skippedDuplicate++;
                duplicateNames.push(name);
                console.log(`[importCustomers] 행 ${idx + 2}: 생성 오류 - "${name}", error:`, (e.message || '').slice(0, 200));
            }
        }

        console.log(`[importCustomers] 결과: ${added}건 등록, ${skippedNoName}건 이름없음, ${skippedDuplicate}건 중복스킵 (총 ${data.length}행)`);
        if (duplicateNames.length > 0) {
            console.log(`[importCustomers] 중복/실패 목록 (${duplicateNames.length}건):`, duplicateNames);
        }
        if (added === 0) {
            const msg = skippedNoName > 0
                ? `등록할 고객이 없습니다. (이름 컬럼 확인 필요, 엑셀 컬럼: ${Object.keys(data[0]).join(', ')})`
                : '등록할 고객이 없습니다. (모든 이름이 이미 존재하거나 중복입니다)';
            App.flash(msg, 'warning');
        } else {
            let msg = `${added}건 등록 완료!`;
            if (skippedNoName > 0) msg += ` (${skippedNoName}건 이름없음)`;
            if (skippedDuplicate > 0) {
                const preview = duplicateNames.slice(0, 5).join(', ');
                const more = duplicateNames.length > 5 ? ` 외 ${duplicateNames.length - 5}건` : '';
                msg += ` (${skippedDuplicate}건 중복/실패: ${preview}${more})`;
                msg += ` - 콘솔(F12)에서 전체 목록 확인`;
            }
            App.flash(msg, 'success');
        }
    },

    importKeywords(data) {
        if (data.length === 0) {
            App.flash('업로드할 데이터가 없습니다.', 'warning');
            return;
        }
        if (!confirm(data.length + ' ' + t('excel', 'confirm_import_count') + '?')) return;

        const keywords = DB.getKeywords();
        let added = 0;
        let nextKeywordId = DB.getNextId('keywords');

        data.forEach(row => {
            const type = row['타입'] || row['type'] || 'brand';
            const standard = row['표준명'] || row['standard'] || row['키워드'] || row['keyword'] || '';
            if (!standard) return;

            // 중복 검증: 같은 타입 + 같은 표준명이 이미 존재하면 스킵
            if (keywords.some(k => k.type === type && k.standard === standard)) { return; }

            // 언어별 키워드 읽기 (여러 컬럼명 지원)
            const koStr = row['한국어키워드'] || row['한국어'] || row['ko'] || row['ko_keywords'] || '';
            const zhStr = row['중국어키워드'] || row['중국어'] || row['zh'] || row['zh_keywords'] || '';
            const enStr = row['영어키워드'] || row['영어'] || row['en'] || row['en_keywords'] || '';
            const jaStr = row['일본어키워드'] || row['일본어'] || row['ja'] || row['ja_keywords'] || '';

            // 구버전 호환: '키워드' 단일 컬럼만 있으면 모든 언어에 적용
            const legacyStr = row['키워드'] || row['keyword'] || '';
            const koList = koStr ? koStr.split(/[,，]/).map(s => s.trim()).filter(Boolean)
                        : (legacyStr ? legacyStr.split(/[,，]/).map(s => s.trim()).filter(Boolean) : []);
            const zhList = zhStr ? zhStr.split(/[,，]/).map(s => s.trim()).filter(Boolean) : [...koList];
            const enList = enStr ? enStr.split(/[,，]/).map(s => s.trim()).filter(Boolean) : [...koList];
            const jaList = jaStr ? jaStr.split(/[,，]/).map(s => s.trim()).filter(Boolean) : [...koList];

            keywords.push({
                id: nextKeywordId++,
                type: type,
                standard: standard,
                keyword: standard,
                ko: koList.length > 0 ? koList : [standard],
                zh: zhList.length > 0 ? zhList : [standard],
                en: enList.length > 0 ? enList : [standard],
                ja: jaList.length > 0 ? jaList : [standard],
                replacement: row['대체어'] || row['replacement'] || '',
                priority: parseInt(row['우선순위'] || row['priority'] || 5) || 5,
                active: true,
                created_at: new Date().toISOString()
            });
            added++;
        });
        DB.setKeywords(keywords);
        if (added === 0) {
            App.flash('등록할 키워드가 없습니다. (타입/표준명 컬럼 확인 필요)', 'warning');
        } else {
            App.flash(`${added}건 등록 완료!`, 'success');
        }
    },

    resetAll() {
        if (!confirm('정말 모든 데이터를 초기화하시겠습니까?\n\n상품, 주문, 고객, 재고내역, 지출, 키워드가 모두 삭제됩니다.\n되돌릴 수 없습니다.')) return;
        DB.clearAllData();
        App.flash('전체 데이터가 초기화되었습니다.', 'success');
        App.render();
    },

    resetByYearMonth() {
        const year = parseInt(document.getElementById('resetYear')?.value);
        const month = parseInt(document.getElementById('resetMonth')?.value);
        if (!year || !month) {
            App.flash('년도와 월을 선택해주세요.', 'warning');
            return;
        }
        if (!confirm(`${year}년 ${month}월에 등록된 상품을 모두 삭제하시겠습니까?\n\n되돌릴 수 없습니다.`)) return;

        const products = DB.getProducts();
        const idsToDelete = new Set();
        products.forEach(p => {
            if (String(p.stock_year) === String(year) && String(p.stock_month) === String(month)) {
                idsToDelete.add(p.id);
            }
        });
        if (idsToDelete.size === 0) {
            App.flash(`${year}년 ${month}월에 해당하는 상품이 없습니다.`, 'info');
            return;
        }
        const filtered = products.filter(p => !idsToDelete.has(p.id));
        DB.setProducts(filtered);
        App.flash(`${year}년 ${month}월 상품 ${idsToDelete.size}건 삭제 완료!`, 'success');
        App.render();
    }
};
