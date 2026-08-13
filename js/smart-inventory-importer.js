/**
 * SmartInventoryWorkbookImporter
 * 
 * 기존 고정 템플릿 기반 상품 엑셀 업로드를 대체하는 스마트 엑셀 가져오기.
 * 시트명, 컬럼명, 순서, 표기가 달라도 자동 분석하여 상품/입고/출고/고객/재고를 분류한다.
 * 
 * 핵심 정책:
 * - preview-first: 저장 전 반드시 미리보기
 * - 사용자 확인 없이 실제 저장 금지
 * - hard-coded 숫자 금지
 * - UUID/민감정보 출력 금지
 */
const SmartInventoryWorkbookImporter = {
    // ==================== Sheet Detection ====================

    SHEET_ROLE_PATTERNS: {
        product: [
            '제품목록', '상품목록', '제품', '상품', 'product list', 'products', 'item list', 'items'
        ],
        inbound: [
            '입고', '추가입고', '재입고', 'stock in', 'inbound', 'incoming'
        ],
        sales: [
            '출고', '판매', '판매목록', '주문', 'sales', 'orders', 'outbound', 'outgoing'
        ],
        inventory: [
            '현재재고', '재고', 'inventory', 'stock', 'current stock'
        ],
        salesSummary: [
            '출고액', '매출요약', 'sales summary', 'revenue summary', '판매합계'
        ],
        customerSummary: [
            '고객이름', '고객', 'customers', 'customer summary', 'buyer'
        ],
        brand: [
            '브랜드목록', '브랜드', 'brands', 'brand list'
        ]
    },

    /**
     * 시트명을 보고 역할을 분류한다.
     */
    _classifySheetByName(sheetName) {
        const name = String(sheetName || '').trim().toLowerCase();
        let bestMatch = null;
        for (const [role, patterns] of Object.entries(this.SHEET_ROLE_PATTERNS)) {
            for (const pattern of patterns) {
                const normalizedPattern = pattern.toLowerCase();
                if (name === normalizedPattern) return role;
                if (normalizedPattern.length >= 3 && name.includes(normalizedPattern)) {
                    if (!bestMatch || normalizedPattern.length > bestMatch.length) {
                        bestMatch = { role, length: normalizedPattern.length };
                    }
                }
            }
        }
        return bestMatch ? bestMatch.role : null;
    },

    _classifySheetByExactName(sheetName) {
        const name = String(sheetName || '').trim().toLowerCase();
        for (const [role, patterns] of Object.entries(this.SHEET_ROLE_PATTERNS)) {
            if (patterns.some(pattern => name === String(pattern).trim().toLowerCase())) return role;
        }
        return null;
    },

    /**
     * 헤더 기반 fallback 분류
     */
    _classifySheetByHeaders(headers) {
        const h = headers.map(x => String(x || '').trim().toLowerCase());

        const hasBrand = h.some(hh => this._fuzzyMatchHeader(hh, ['brand', '브랜드']));
        const hasTitle = h.some(hh => this._fuzzyMatchHeader(hh, ['title', '상품명', '제품명', 'product_name']));
        const hasCost = h.some(hh => this._fuzzyMatchHeader(hh, ['cost', '원가', '매입원가', 'korea_cost']));
        const hasSaleDate = h.some(hh => this._fuzzyMatchHeader(hh, ['order_date', 'sale_date', '판매일', '출고일', '날짜', '일자']));
        const hasCustomer = h.some(hh => this._fuzzyMatchHeader(hh, ['customer', '고객이름', '고객명', '고객', 'customer_name']));
        const hasStock = h.some(hh => this._fuzzyMatchHeader(hh, ['stock', '재고', 'current_stock', '수량']));
        const hasReceived = h.some(hh => this._fuzzyMatchHeader(hh, ['received_date', '입고일', '받은날짜', '일자']));
        const hasSellingPrice = h.some(hh => this._fuzzyMatchHeader(hh, ['실제판매가', '판매금액', 'selling_price']));

        if (hasCustomer && hasTitle && (hasSaleDate || hasSellingPrice)) return 'sales';
        if (hasStock && hasTitle && hasReceived && !hasCustomer) return 'inbound';
        if (hasBrand && hasTitle && (hasCost || hasStock)) return 'product';

        if (hasStock && hasTitle && !hasCustomer) return 'inventory';

        return null;
    },

    // ==================== Column Fuzzy Resolver ====================

    _fuzzyMatchHeader(headerName, aliases) {
        if (headerName && typeof headerName === 'object') return false;
        const h = String(headerName || '').trim().toLowerCase()
            .replace(/\s+/g, '')
            .replace(/[\(\)（）]/g, '');
        if (!h || h.startsWith('=')) return false;
        return aliases.some(a => {
            const alias = a.toLowerCase().replace(/\s+/g, '').replace(/[\(\)（）]/g, '');
            if (!alias) return false;
            return h === alias || (alias.length >= 2 && h.includes(alias)) || (h.length >= 2 && alias.includes(h));
        });
    },

    /** 제목/설명 행이 위에 있어도 실제 컬럼 헤더를 찾는다. */
    _findHeaderRow(rows) {
        let best = { index: 0, headers: (rows[0] || []).map(v => String(v || '').trim()), score: -1 };
        const limit = Math.min(rows.length, 20);
        for (let i = 0; i < limit; i++) {
            const headers = (rows[i] || []).map(v => String(v || '').trim());
            const nonEmpty = headers.filter(h => h && !h.startsWith('=')).length;
            if (nonEmpty < 2) continue;
            const fieldMap = this._buildFieldMap(headers);
            const matchedFields = Object.keys(fieldMap);
            const role = this._classifySheetByHeaders(headers);
            const score = matchedFields.length * 10 + (role ? 20 : 0) + Math.min(nonEmpty, 10);
            if (score > best.score) best = { index: i, headers, score };
        }
        return best;
    },

    FIELD_ALIASES: {
        brand: ['브랜드', 'brand'],
        title: ['제품명', '상품명', '품명', '아이템명', 'original_title', 'product_name', 'title'],
        cost: ['원가', '매입원가', '한국원가', '한국매입원가', '원가(krw)', '원가(₩)', 'cost', 'korea_cost'],
        sellingBasePrice: ['판매가', '판매가(rmb 자동)', '중국판매가', '기준판매가', 'china_base_price', 'base_price'],
        stock: ['초기재고', '현재재고', '재고', '상품수량', '수량', 'stock', 'quantity', 'current_stock'],
        stockYear: ['입고년도', '입고연도', '년도', '연도', 'stock_year', 'year'],
        stockMonth: ['입고월', '월', 'stock_month', 'month'],
        category: ['카테고리', '종류', 'category'],
        color: ['색상', '컬러', 'color'],
        size: ['사이즈', '칫수', 'size'],
        material: ['소재', '재질', 'material'],
        notes: ['비고', '메모', 'notes'],
        location: ['위치', '보관위치', 'location'],
        image: ['이미지', '사진', '아이폰사진', 'image', 'photo'],
        purchaseDate: ['구입일', '구매일', 'purchase_date'],
        receivedDate: ['받은날짜', '입고일', '일자', 'received_date'],
        productCode: ['상품코드', 'product_code'],
        orderDate: ['판매일', '출고일', '주문일', '결제일', '날짜', '일자', 'order_date', 'sale_date', 'date'],
        customerName: ['고객이름', '고객명', '고객', '구매자', '수령인', 'customer', 'customer_name', 'buyer'],
        source: ['판매출처', '판매처', '출처', '채널', '플랫폼', 'source', 'channel', 'platform'],
        saleQuantity: ['수량', '판매수량', '출고수량', 'quantity', 'qty'],
        actualSellingPrice: ['실제판매가', '최종판매가', '최종총평가', '결제금액', '금액', '판매금액', 'actual_selling_price', 'selling_price', 'price'],
        profit: ['이익금', '실제이익', 'profit', 'actual_profit'],
        profitMargin: ['이익률', '마진율', 'profit_margin', 'margin']
    },

    _findHeaderColumn(headers, fieldName) {
        const aliases = this.FIELD_ALIASES[fieldName] || [];
        const normalize = value => String(value || '').trim().toLowerCase()
            .replace(/\s+/g, '')
            .replace(/[\(\)（）]/g, '');
        const normalizedAliases = aliases.map(normalize);
        // Exact labels must win over a fuzzy substring match. For example,
        // "원가" must not be shadowed by an earlier "중국원가" column.
        for (const header of headers) {
            if (normalizedAliases.includes(normalize(header))) return header;
        }
        for (const header of headers) {
            if (this._fuzzyMatchHeader(header, aliases)) return header;
        }
        return null;
    },

    _buildFieldMap(headers) {
        const map = {};
        for (const field of Object.keys(this.FIELD_ALIASES)) {
            const found = this._findHeaderColumn(headers, field);
            if (found) map[field] = found;
        }
        return map;
    },

    /**
     * row 객체에서 fieldMap을 이용해 logical field 값을 추출한다.
     */
    _getFieldValue(row, fieldMap, fieldName) {
        const header = fieldMap[fieldName];
        if (!header) return null;
        const val = row[header];
        return val !== undefined ? val : null;
    },

    // ==================== Date Parsing ====================

    _parseDate(val) {
        if (val === null || val === undefined || val === '') return null;
        if (val instanceof Date) return val;
        if (typeof val === 'number') {
            const utcDays = Math.floor(val - 25569);
            const d = new Date(utcDays * 86400 * 1000);
            if (!isNaN(d.getTime())) return d;
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

    _applyFilenameYear(date, filenameYear) {
        if (!date || !filenameYear) return date;
        const source = date instanceof Date ? date : new Date(date);
        if (isNaN(source.getTime())) return date;
        const adjusted = new Date(source.getTime());
        adjusted.setFullYear(filenameYear);
        return adjusted;
    },

    _inferYearMonthFromFilename(filename) {
        if (!filename) return { year: null, month: null };
        const name = String(filename).replace(/\.xlsx?$/i, '');
        const patterns = [
            /(\d{4})[\.\-\/_](\d{1,2})/,
            /(\d{4})[^\d]*(\d{1,2})[월]?/
        ];
        for (const p of patterns) {
            const m = name.match(p);
            if (m) {
                const y = parseInt(m[1], 10);
                const mo = parseInt(m[2], 10);
                if (y >= 2020 && y <= 2100 && mo >= 1 && mo <= 12) {
                    return { year: y, month: mo };
                }
            }
        }
        return { year: null, month: null };
    },

    // ==================== Formula / Cached Value Handling ====================

    FORMULA_ERROR_PATTERNS: ['#NAME?', '#VALUE!', '#REF!', '#DIV/0!', '#N/A', '#NULL!', '#NUM!'],

    _isFormulaError(val) {
        const s = String(val || '').trim();
        return this.FORMULA_ERROR_PATTERNS.some(e => s.startsWith(e) || s === e);
    },

    _isFormulaString(val) {
        return typeof val === 'string' && val.trim().startsWith('=');
    },

    _isTrustedValue(val) {
        if (val === null || val === undefined || val === '') return false;
        if (this._isFormulaError(val)) return false;
        if (this._isFormulaString(val)) return false;
        return true;
    },

    // ==================== Source Detection ====================

    SOURCE_LIKE_PATTERNS: {
        wechat: ['微信', '위챗', 'wechat', 'weixin'],
        taobao: ['淘宝', 'taobao'],
        xiaohongshu: ['小红书', 'xiaohongshu', 'redbook'],
        phone: ['手机', 'phone', 'direct'],
        self_use: ['自留', 'self_use', 'self-use'],
        delivery_note: ['发货', 'delivery', 'delivery_note']
    },

    _classifySource(value) {
        if (!value) return null;
        const v = String(value).trim().toLowerCase();
        for (const [source, patterns] of Object.entries(this.SOURCE_LIKE_PATTERNS)) {
            for (const p of patterns) {
                if (v === p.toLowerCase() || v.includes(p.toLowerCase())) return source;
            }
        }
        return null;
    },

    _isSourceLikeCustomerName(value) {
        if (!value) return false;
        const v = String(value).trim().toLowerCase();
        const allPatterns = Object.values(this.SOURCE_LIKE_PATTERNS).flat();
        // exact match only — substring match would filter valid customer names
        // that happen to contain source-like words (e.g. "김phone", "delivery김")
        return allPatterns.some(p => v === p.toLowerCase());
    },

    // ==================== Product Identity ====================

    _getProductIdentityKey(product) {
        const normalize = (v) => String(v || '').trim().toLowerCase();
        const normalizeNumber = (v) => {
            const n = Number(v);
            return Number.isFinite(n) ? String(Math.round(n)) : '0';
        };
        return [
            normalize(product.brand),
            normalize(product.original_title || product.title),
            normalize(product.color),
            normalize(product.size),
            normalizeNumber(product.korea_cost),
            normalizeNumber(product.stock_year),
            normalizeNumber(product.stock_month)
        ].join('|');
    },

    // ==================== Main Import Flow ====================

    /**
     * workbook을 읽고 분석한다. 저장은 실행하지 않는다.
     * @param {ArrayBuffer} data - 엑셀 파일 바이너리
     * @param {string} filename - 파일명
     * @returns {Object} preview result
     */
    analyze(data, filename) {
        const wb = XLSX.read(data, { type: 'array' });
        const inferredDate = this._inferYearMonthFromFilename(filename);
        const sheetNames = wb.SheetNames;
        const detectedSheets = [];
        const sheetRoles = {};

        // Raw data extraction
        const extractedData = {
            productRows: [],
            inboundRows: [],
            salesRows: [],
            inventoryRows: [],
            salesSummaryRows: [],
            customerSummaryRows: [],
            brandRows: []
        };

        for (const sheetName of sheetNames) {
            const ws = wb.Sheets[sheetName];
            const json = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
            if (json.length < 2) {
                detectedSheets.push({ name: sheetName, role: null, reason: 'empty_or_header_only', rowCount: json.length });
                continue;
            }

            const headerInfo = this._findHeaderRow(json);
            const headers = headerInfo.headers;
            const rowCount = Math.max(0, json.length - headerInfo.index - 1);

            const nameRole = this._classifySheetByName(sheetName);
            const exactNameRole = this._classifySheetByExactName(sheetName);
            const headerRole = this._classifySheetByHeaders(headers);
            // 부분 일치로 추정한 모호한 이름에서는 헤더를 우선한다.
            const role = headerRole || nameRole;
            // 제품목록/현재재고처럼 명시적인 표준 시트명은 헤더보다 우선한다.
            const resolvedRole = exactNameRole || role;

            const fieldMap = this._buildFieldMap(headers);
            const analysis = this._analyzeSheetRows(json.slice(headerInfo.index + 1), fieldMap, resolvedRole, headers);
            sheetRoles[sheetName] = resolvedRole;

            detectedSheets.push({
                name: sheetName,
                role: resolvedRole,
                headers,
                fieldMap,
                headerRowNumber: headerInfo.index + 1,
                rowCount,
                validRowCount: analysis.validRows,
                formulaErrorCount: analysis.formulaErrorCount,
                summary: analysis.summary
            });

            // Store extracted data for preview
            switch (resolvedRole) {
                case 'product':
                    extractedData.productRows.push(...analysis.extractedRows);
                    break;
                case 'inbound':
                    extractedData.inboundRows.push(...analysis.extractedRows);
                    break;
                case 'sales':
                    extractedData.salesRows.push(...analysis.extractedRows);
                    break;
                case 'inventory':
                    extractedData.inventoryRows.push(...analysis.extractedRows);
                    break;
                case 'salesSummary':
                    extractedData.salesSummaryRows.push(...analysis.extractedRows);
                    break;
                case 'customerSummary':
                    extractedData.customerSummaryRows.push(...analysis.extractedRows);
                    break;
                case 'brand':
                    extractedData.brandRows.push(...analysis.extractedRows);
                    break;
            }
        }

        // Filename is authoritative. Keep cell month/day, override cell year.
        if (inferredDate.year) {
            extractedData.productRows.forEach(row => { row.stockYear = inferredDate.year; });
            extractedData.salesRows.forEach(row => {
                row.orderDate = this._applyFilenameYear(row.orderDate, inferredDate.year);
            });
            extractedData.inboundRows.forEach(row => {
                row.receivedDate = this._applyFilenameYear(row.receivedDate, inferredDate.year);
            });
        }

        // Build preview
        const preview = this._buildPreview(detectedSheets, sheetRoles, extractedData, inferredDate, filename);
        window.__LAST_SMART_EXCEL_IMPORT_PREVIEW = preview;
        return preview;
    },

    _analyzeSheetRows(rows, fieldMap, role, headers) {
        let validRows = 0;
        let formulaErrorCount = 0;
        const extractedRows = [];

        for (let sourceIndex = 0; sourceIndex < rows.length; sourceIndex++) {
            const row = rows[sourceIndex];
            // Convert array row to object using headers
            const rowObj = {};
            headers.forEach((h, i) => { rowObj[h] = row[i]; });

            const values = Object.values(row).filter(v => v !== '' && v !== null && v !== undefined);
            if (values.length === 0) continue;

            for (const v of values) {
                if (this._isFormulaError(v)) formulaErrorCount++;
            }

            if (role === 'product') {
                const brand = this._getFieldValue(rowObj, fieldMap, 'brand');
                const title = this._getFieldValue(rowObj, fieldMap, 'title');
                // 제품목록 D열은 사용자가 지정한 한국매입원가의 권위 원본이다.
                // D열이 숫자가 아닐 때만 헤더 기반 원가 열로 fallback한다.
                const dColumnCost = this._safeParseInt(row[3]);
                const mappedCost = this._safeParseInt(this._getFieldValue(rowObj, fieldMap, 'cost'));
                const cost = dColumnCost > 0 ? dColumnCost : mappedCost;
                if (brand || title || cost) {
                    validRows++;
                    extractedRows.push({
                        brand: String(brand || '').trim(),
                        title: String(title || '').trim(),
                        cost: cost,
                        stock: this._safeParseInt(this._getFieldValue(rowObj, fieldMap, 'stock')),
                        stockYear: this._safeParseInt(this._getFieldValue(rowObj, fieldMap, 'stockYear')),
                        stockMonth: this._safeParseInt(this._getFieldValue(rowObj, fieldMap, 'stockMonth')),
                        color: String(this._getFieldValue(rowObj, fieldMap, 'color') || '').trim(),
                        size: String(this._getFieldValue(rowObj, fieldMap, 'size') || '').trim(),
                        category: String(this._getFieldValue(rowObj, fieldMap, 'category') || '').trim(),
                        material: String(this._getFieldValue(rowObj, fieldMap, 'material') || '').trim(),
                        notes: String(this._getFieldValue(rowObj, fieldMap, 'notes') || '').trim(),
                        sellingBasePrice: this._safeParseInt(this._getFieldValue(rowObj, fieldMap, 'sellingBasePrice')),
                        sourceIndex,
                        rawRow: rowObj
                    });
                }
            } else if (role === 'sales') {
                const customer = this._getFieldValue(rowObj, fieldMap, 'customerName');
                const date = this._getFieldValue(rowObj, fieldMap, 'orderDate');
                if (customer || date) {
                    validRows++;
                    extractedRows.push({
                        customerName: String(customer || '').trim(),
                        brand: String(this._getFieldValue(rowObj, fieldMap, 'brand') || '').trim(),
                        title: String(this._getFieldValue(rowObj, fieldMap, 'title') || '').trim(),
                        orderDate: this._parseDate(date),
                        source: String(this._getFieldValue(rowObj, fieldMap, 'source') || '').trim(),
                        quantity: this._safeParseInt(this._getFieldValue(rowObj, fieldMap, 'saleQuantity')) || 1,
                        sellingPrice: this._safeParseInt(this._getFieldValue(rowObj, fieldMap, 'actualSellingPrice')),
                        profit: this._safeParseInt(this._getFieldValue(rowObj, fieldMap, 'profit')),
                        rawRow: rowObj
                    });
                }
            } else if (role === 'inbound') {
                const stock = this._getFieldValue(rowObj, fieldMap, 'stock');
                if (stock) {
                    validRows++;
                    extractedRows.push({
                        brand: String(this._getFieldValue(rowObj, fieldMap, 'brand') || '').trim(),
                        title: String(this._getFieldValue(rowObj, fieldMap, 'title') || '').trim(),
                        stock: this._safeParseInt(stock),
                        receivedDate: this._parseDate(this._getFieldValue(rowObj, fieldMap, 'receivedDate')),
                        rawRow: rowObj
                    });
                }
            } else if (role === 'inventory') {
                const brand = this._getFieldValue(rowObj, fieldMap, 'brand');
                const title = this._getFieldValue(rowObj, fieldMap, 'title');
                const stock = this._getFieldValue(rowObj, fieldMap, 'stock');
                if (stock !== null && stock !== undefined && stock !== '') {
                    validRows++;
                    extractedRows.push({
                        brand: this._isFormulaError(brand) ? '' : String(brand || '').trim(),
                        title: this._isFormulaError(title) ? '' : String(title || '').trim(),
                        stock: this._safeParseInt(stock),
                        sourceIndex,
                        rawRow: rowObj
                    });
                }
            } else {
                validRows++;
                extractedRows.push({ rawRow: rowObj });
            }
        }

        return {
            validRows,
            formulaErrorCount,
            extractedRows,
            summary: {}
        };
    },

    _safeParseInt(val) {
        if (val === null || val === undefined || val === '') return 0;
        if (typeof val === 'number') return Math.round(val);
        const s = String(val).replace(/,/g, '').trim();
        const n = parseInt(s, 10);
        return Number.isFinite(n) ? n : 0;
    },

    _buildPreview(detectedSheets, sheetRoles, extractedData, inferredDate, filename) {
        const productSheets = detectedSheets.filter(s => s.role === 'product');
        const salesSheets = detectedSheets.filter(s => s.role === 'sales');
        const inboundSheets = detectedSheets.filter(s => s.role === 'inbound');
        const inventorySheets = detectedSheets.filter(s => s.role === 'inventory');
        const salesSummarySheets = detectedSheets.filter(s => s.role === 'salesSummary');
        const customerSummarySheets = detectedSheets.filter(s => s.role === 'customerSummary');
        const brandSheets = detectedSheets.filter(s => s.role === 'brand');

        const formulaErrorCount = detectedSheets.reduce((s, sh) => s + (sh.formulaErrorCount || 0), 0);

        // Product analysis
        const productRows = extractedData.productRows;
        const validProductRows = productRows.length;
        const newProductCandidates = [];
        const existingProductMatches = [];
        const duplicateProductIdentities = [];
        const seenIdentities = new Set();

        // Build existing identity map
        let existingIdentityMap = new Map();
        try {
            if (typeof DB !== 'undefined' && typeof DB.getProducts === 'function') {
                const existingProducts = DB.getProducts();
                for (const p of existingProducts) {
                    const key = (typeof ExcelManager !== 'undefined' && ExcelManager.getProductIdentityKey)
                        ? ExcelManager.getProductIdentityKey(p)
                        : this._getProductIdentityKey(p);
                    existingIdentityMap.set(key, p);
                }
            }
        } catch (e) { /* ignore */ }

        for (const row of productRows) {
            const tempProduct = {
                brand: row.brand,
                original_title: row.title,
                color: row.color,
                size: row.size,
                korea_cost: row.cost,
                stock_year: inferredDate.year || row.stockYear || new Date().getFullYear(),
                stock_month: row.stockMonth || inferredDate.month || (new Date().getMonth() + 1)
            };
            const key = this._getProductIdentityKey(tempProduct);

            if (seenIdentities.has(key)) {
                duplicateProductIdentities.push(key);
            } else {
                seenIdentities.add(key);
                if (existingIdentityMap.has(key)) {
                    existingProductMatches.push(key);
                } else {
                    newProductCandidates.push(row);
                }
            }
        }

        // Sales analysis
        const salesRows = extractedData.salesRows;
        const validSalesRows = salesRows.length;
        const detectedCustomers = new Set();
        const detectedSources = new Set();
        const salesCreateCandidates = [];
        const unmatchedSalesProducts = [];
        const newCustomerCandidates = [];
        const existingCustomerMatches = [];

        // Build existing customer map
        let existingCustomerNames = new Set();
        try {
            if (typeof DB !== 'undefined' && typeof DB.getCustomers === 'function') {
                const customers = DB.getCustomers();
                for (const c of customers) {
                    existingCustomerNames.add((c.name || '').toLowerCase().trim());
                }
            }
        } catch (e) { /* ignore */ }

        for (const row of salesRows) {
            const custName = row.customerName;
            if (custName) {
                detectedCustomers.add(custName);
                // Check if source-like
                if (this._isSourceLikeCustomerName(custName)) {
                    const src = this._classifySource(custName);
                    if (src) detectedSources.add(src);
                    continue;
                }
                const nameLower = custName.toLowerCase().trim();
                if (existingCustomerNames.has(nameLower)) {
                    existingCustomerMatches.push(custName);
                } else {
                    newCustomerCandidates.push(custName);
                }
            }

            // Source detection
            const sourceVal = row.source;
            if (sourceVal) {
                const src = this._classifySource(sourceVal);
                if (src) {
                    detectedSources.add(src);
                } else {
                    detectedSources.add(sourceVal);
                }
            }

            if (row.title && row.brand) {
                // Check if product exists
                let found = false;
                for (const [key, prod] of existingIdentityMap) {
                    if (prod.original_title === row.title && prod.brand === row.brand) {
                        found = true;
                        break;
                    }
                }
                if (found) {
                    salesCreateCandidates.push(row);
                } else {
                    unmatchedSalesProducts.push(row);
                }
            }
        }

        // Inbound analysis
        const inboundRows = extractedData.inboundRows;
        const validInboundRows = inboundRows.length;
        const unmatchedInboundProducts = [];

        for (const row of inboundRows) {
            if (row.title && row.brand) {
                let found = false;
                for (const [key, prod] of existingIdentityMap) {
                    if (prod.original_title === row.title && prod.brand === row.brand) {
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    unmatchedInboundProducts.push(row);
                }
            }
        }

        const reviewNeededCount = unmatchedSalesProducts.length + unmatchedInboundProducts.length;

        const warnings = [];
        if (formulaErrorCount > 0) {
            warnings.push(`계산식 오류 ${formulaErrorCount}건이 발견되었습니다. 해당 값은 무시됩니다.`);
        }
        if (unmatchedSalesProducts.length > 0) {
            warnings.push(`판매 ${unmatchedSalesProducts.length}건의 상품이 기존 목록에서 발견되지 않았습니다. 검토가 필요합니다.`);
        }
        if (unmatchedInboundProducts.length > 0) {
            warnings.push(`입고 ${unmatchedInboundProducts.length}건의 상품이 기존 목록에서 발견되지 않았습니다. 검토가 필요합니다.`);
        }
        if (duplicateProductIdentities.length > 0) {
            warnings.push(`파일 내 중복 상품 ${duplicateProductIdentities.length}건은 병합됩니다.`);
        }

        // Store actual customer candidates array in _extractedData for save
        extractedData._newCustomerCandidates = newCustomerCandidates;

        return {
            workbookName: filename,
            detectedSheets: sheetRoles,
            sheetDetails: detectedSheets.map(s => ({
                name: s.name,
                role: s.role,
                rowCount: s.rowCount,
                validRowCount: s.validRowCount,
                formulaErrorCount: s.formulaErrorCount || 0,
                headers: (s.headers || []).slice(0, 30)
            })),
            inferredYear: inferredDate.year,
            inferredMonth: inferredDate.month,
            productRows: productRows.length,
            validProductRows,
            inboundRows: inboundRows.length,
            validInboundRows,
            salesRows: salesRows.length,
            validSalesRows,
            detectedCustomers: [...detectedCustomers],
            detectedSources: [...detectedSources],
            newProductCandidates: newProductCandidates.length,
            existingProductMatches: existingProductMatches.length,
            duplicateProductIdentities: duplicateProductIdentities.length,
            newCustomerCandidates: newCustomerCandidates.length,
            existingCustomerMatches: existingCustomerMatches.length,
            salesCreateCandidates: salesCreateCandidates.length,
            unmatchedSalesProducts: unmatchedSalesProducts.length,
            unmatchedInboundProducts: unmatchedInboundProducts.length,
            formulaErrorCount,
            inventoryVerificationCount: inventorySheets.length,
            salesSummaryVerificationCount: salesSummarySheets.length,
            customerSummaryCount: customerSummarySheets.length,
            brandSheetCount: brandSheets.length,
            reviewNeededCount,
            warnings,
            errors: [],
            _extractedData: extractedData,
            _existingIdentityMap: existingIdentityMap
        };
    },

    // ==================== Preview UI ====================

    render(target) {
        const targetLabel = target === 'products' ? '상품목록' :
            target === 'sales' ? '판매목록' :
            target === 'customers' ? '고객목록' : '';

        return `
            <div class="card">
                <h2><i class="fas fa-file-excel"></i> ${t('excel', 'smart_import_title') || '스마트 엑셀 가져오기'}</h2>
                ${targetLabel ? `<p class="text-muted">연결 대상: ${targetLabel}</p>` : ''}
                <p class="text-muted" style="font-size:0.85rem;">
                    ${t('excel', 'smart_import_desc') || '엑셀 구조가 달라도 프로그램이 시트와 컬럼을 자동 분석합니다. 저장 전 미리보기에서 확인하세요.'}
                </p>

                <div class="card" style="border: 2px dashed #667eea; background: #f8f9ff;">
                    <h3><i class="fas fa-upload"></i> ${t('excel', 'select_file') || '파일 선택'}</h3>
                    <div class="form-group">
                        <label>${t('excel', 'import_file') || 'Excel 파일'}</label>
                        <input type="file" id="smartExcelFile" accept=".xlsx,.xls" class="form-control">
                    </div>
                    <button class="btn btn-primary" onclick="SmartInventoryWorkbookImporter.startAnalysis('${target || ''}')">
                        <i class="fas fa-search"></i> ${t('excel', 'start_analysis') || '분석 시작'}
                    </button>
                </div>

                <div id="smartImportPreview" style="display:none; margin-top:1.5rem;">
                </div>

                <div class="info-box mt-4">
                    <h4><i class="fas fa-info-circle"></i> ${t('excel', 'guide') || '안내'}</h4>
                    <ul>
                        <li>${t('excel', 'smart_guide_1') || '시트명과 컬럼명이 조금 달라도 자동으로 인식합니다.'}</li>
                        <li>${t('excel', 'smart_guide_2') || '상품목록, 입고, 출고, 고객, 재고 정보를 자동으로 분류합니다.'}</li>
                        <li>${t('excel', 'smart_guide_3') || '계산식 결과는 무시하고 앱에서 다시 계산합니다.'}</li>
                        <li>${t('excel', 'smart_guide_4') || '저장은 미리보기 확인 후에만 실행됩니다.'}</li>
                        <li>${t('excel', 'smart_guide_5') || '검토가 필요한 항목은 자동 저장되지 않습니다.'}</li>
                    </ul>
                </div>
            </div>
        `;
    },

    startAnalysis(target) {
        const fileInput = document.getElementById('smartExcelFile');
        if (!fileInput || !fileInput.files || !fileInput.files[0]) {
            App.flash(t('common', 'select_file') || '파일을 선택해주세요.', 'warning');
            return;
        }
        const file = fileInput.files[0];
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const preview = this.analyze(data, file.name);
                this._renderPreview(preview, target);
            } catch (err) {
                console.error('Smart import analysis failed:', (err.message || '').slice(0, 100));
                App.flash(t('common', 'error') + ': ' + (err.message || ''), 'error');
            }
        };
        reader.readAsArrayBuffer(file);
    },

    _renderPreview(preview, target) {
        const container = document.getElementById('smartImportPreview');
        if (!container) return;
        container.style.display = 'block';

        const sheets = preview.sheetDetails || [];
        const sheetRows = sheets.map(s => `
            <tr>
                <td>${s.name}</td>
                <td><span class="badge ${s.role ? 'badge-primary' : 'badge-secondary'}">${s.role || '미분류'}</span></td>
                <td>${s.rowCount}</td>
                <td>${s.validRowCount}</td>
                <td>${s.formulaErrorCount > 0 ? `<span class="text-warning">${s.formulaErrorCount}</span>` : '0'}</td>
            </tr>
        `).join('');

        const dateInfo = preview.inferredYear
            ? `${preview.inferredYear}년 ${preview.inferredMonth ? preview.inferredMonth + '월' : ''} (파일명 추정)`
            : '추정 불가';

        let html = `
            <div class="card">
                <h3><i class="fas fa-search"></i> ${t('excel', 'analysis_result') || '분석 결과'}</h3>
                <p class="text-muted">파일: ${preview.workbookName} · 추정 날짜: ${dateInfo}</p>

                <h4>${t('excel', 'detected_sheets') || '감지된 시트'}</h4>
                <div style="overflow-x:auto;">
                    <table class="table">
                        <thead>
                            <tr>
                                <th>${t('excel', 'sheet_name') || '시트명'}</th>
                                <th>${t('excel', 'role') || '분류'}</th>
                                <th>${t('excel', 'total_rows') || '전체 행'}</th>
                                <th>${t('excel', 'valid_rows') || '유효 행'}</th>
                                <th>${t('excel', 'formula_errors') || '계산식 오류'}</th>
                            </tr>
                        </thead>
                        <tbody>${sheetRows}</tbody>
                    </table>
                </div>

                <h4>${t('excel', 'preview_summary') || '미리보기 요약'}</h4>
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-label">${t('excel', 'product_candidates') || '상품 후보'}</div>
                        <div class="stat-value">${preview.validProductRows}</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">${t('excel', 'sales_candidates') || '판매 후보'}</div>
                        <div class="stat-value">${preview.validSalesRows}</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">${t('excel', 'inbound_candidates') || '입고 후보'}</div>
                        <div class="stat-value">${preview.validInboundRows}</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">${t('excel', 'formula_errors') || '계산식 오류'}</div>
                        <div class="stat-value ${preview.formulaErrorCount > 0 ? 'text-warning' : ''}">${preview.formulaErrorCount}</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">${t('excel', 'new_product') || '신규 상품 후보'}</div>
                        <div class="stat-value">${preview.newProductCandidates}</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">${t('excel', 'existing_product') || '기존 상품 매칭'}</div>
                        <div class="stat-value">${preview.existingProductMatches}</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">${t('excel', 'new_customer') || '신규 고객 후보'}</div>
                        <div class="stat-value">${preview.newCustomerCandidates}</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">${t('excel', 'existing_customer') || '기존 고객 매칭'}</div>
                        <div class="stat-value">${preview.existingCustomerMatches}</div>
                    </div>
                    ${preview.reviewNeededCount > 0 ? `
                    <div class="stat-card">
                        <div class="stat-label">${t('excel', 'review_needed') || '검토 필요'}</div>
                        <div class="stat-value text-warning">${preview.reviewNeededCount}</div>
                    </div>` : ''}
                    ${preview.detectedSources.length > 0 ? `
                    <div class="stat-card">
                        <div class="stat-label">${t('excel', 'detected_sources') || '판매출처'}</div>
                        <div class="stat-value" style="font-size:0.9rem;">${preview.detectedSources.join(', ')}</div>
                    </div>` : ''}
                </div>
        `;

        // Warnings
        if (preview.warnings && preview.warnings.length > 0) {
            html += `
                <div class="info-box mt-4" style="background:#fff8e1; border:1px solid #f0ad4e;">
                    <h4><i class="fas fa-exclamation-triangle"></i> ${t('excel', 'warnings') || '경고'}</h4>
                    <ul>${preview.warnings.map(w => `<li>${w}</li>`).join('')}</ul>
                </div>
            `;
        }

        // Verification-only sheets
        const verificationSheets = sheets.filter(s => s.role === 'inventory' || s.role === 'salesSummary' || s.role === 'customerSummary' || s.role === 'brand');
        if (verificationSheets.length > 0) {
            html += `
                <div class="info-box mt-4" style="background:#e8f4fd; border:1px solid #5bc0de;">
                    <h4><i class="fas fa-check-circle"></i> ${t('excel', 'verification_sheets') || '검증용 시트 (저장 안 함)'}</h4>
                    <ul>${verificationSheets.map(s => `<li>${s.name} (${s.role}) - ${s.rowCount}행</li>`).join('')}</ul>
                </div>
            `;
        }

        // Save gate
        html += `
            <div class="card mt-4" style="background:#f0fff0; border:1px solid #27ae60;">
                <h4><i class="fas fa-save"></i> ${t('excel', 'save_options') || '저장 옵션'}</h4>
                <p class="text-muted" style="font-size:0.8rem;">${t('excel', 'save_warning') || '저장 전 미리보기를 확인하세요. 검토 필요 항목은 자동 저장되지 않습니다.'}</p>
                <div class="d-flex flex-wrap gap-2">
                    <button class="btn btn-primary" onclick="SmartInventoryWorkbookImporter.savePreview('products')">
                        <i class="fas fa-tshirt"></i> ${t('excel', 'save_products') || '상품만 저장'}
                    </button>
                    <button class="btn btn-primary" onclick="SmartInventoryWorkbookImporter.savePreview('sales')">
                        <i class="fas fa-shopping-cart"></i> ${t('excel', 'save_sales') || '판매만 저장'}
                    </button>
                    <button class="btn btn-primary" onclick="SmartInventoryWorkbookImporter.savePreview('customers')">
                        <i class="fas fa-users"></i> ${t('excel', 'save_customers') || '고객만 저장'}
                    </button>
                    <button class="btn btn-success" onclick="SmartInventoryWorkbookImporter.savePreview('all')">
                        <i class="fas fa-check-double"></i> ${t('excel', 'save_all') || '전체 저장'}
                    </button>
                </div>
            </div>
        `;

        html += '</div>';
        container.innerHTML = html;
    },

    // ==================== Save Gate ====================

    savePreview(target) {
        const preview = window.__LAST_SMART_EXCEL_IMPORT_PREVIEW;
        if (!preview) {
            App.flash(t('excel', 'no_preview') || '미리보기가 없습니다. 먼저 분석을 실행하세요.', 'warning');
            return;
        }

        const targetLabel = target === 'all' ? '전체' :
            target === 'products' ? '상품' :
            target === 'sales' ? '판매' :
            target === 'customers' ? '고객' : target;

        if (!confirm(`"${targetLabel}" 데이터를 실제로 저장하시겠습니까?\n\n저장 전 미리보기를 확인하셨는지 확인해주세요.\n검토 필요 항목은 자동 저장되지 않습니다.`)) {
            return;
        }

        if (target === 'all') {
            if (!confirm('전체 저장은 상품/판매/고객 데이터를 모두 생성합니다. 계속하시겠습니까?')) return;
        }

        this._executeSave(preview, target);
    },

    async _executeSave(preview, target) {
        App.flash(t('common', 'saving') || '저장 중...', 'info');

        const isRemote = typeof ExcelManager !== 'undefined' && ExcelManager._isRemoteProductsMode
            ? ExcelManager._isRemoteProductsMode()
            : false;

        if (!isRemote) {
            throw new Error('스마트 엑셀 가져오기는 Supabase 원격 모드에서만 저장할 수 있습니다. 로그인과 매장 연결을 확인하세요.');
        }

        const extractedData = preview._extractedData || {};
        const summary = {
            mode: isRemote ? 'remote' : 'local',
            selectedTargets: [target],
            productsInserted: 0,
            productsMatched: 0,
            productsSkipped: 0,
            productCostsRepaired: 0,
            productCostRepairFailed: 0,
            customersInserted: 0,
            customersMatched: 0,
            ordersInserted: 0,
            ordersSkipped: 0,
            inboundApplied: 0,
            inboundSkipped: 0,
            reviewNeededSkipped: preview.reviewNeededCount || 0,
            failed: 0,
            beforeCounts: {},
            afterCounts: {},
            countDeltaChecks: {},
            stockDeltaChecks: {},
            warnings: [],
            errors: []
        };

        try {
            // Save products
            // Sales-only imports must still repair the cost of an existing product.
            // Creating brand-new products remains limited to products/all.
            if ((target === 'products' || target === 'all' || target === 'sales') && extractedData.productRows && extractedData.productRows.length > 0) {
                const productRows = extractedData.productRows;
                const existingIdentityMap = preview._existingIdentityMap || new Map();
                const seenIdentities = new Set();

                // Smart preview rows bypass ExcelManager's normal row normalizer,
                // so allocate the required product_code explicitly here.
                let existingProducts = [];
                try {
                    existingProducts = isRemote && typeof DB.getProductsAsync === 'function'
                        ? await DB.getProductsAsync()
                        : DB.getProducts();
                } catch (e) { /* allocator can still start from an empty set */ }
                const codeAllocator = typeof ExcelManager !== 'undefined' && ExcelManager._buildProductCodeAllocator
                    ? ExcelManager._buildProductCodeAllocator(isRemote, existingProducts)
                    : null;

                // Build normalized rows for ExcelManager.importProducts
                const normalizedRows = [];
                const normalizeLoose = (value) => String(value || '')
                    .normalize('NFKC')
                    .toLowerCase()
                    .replace(/[\s\p{P}\p{S}]+/gu, '');
                for (const row of productRows) {
                    const tempProduct = {
                        brand: row.brand,
                        original_title: row.title,
                        color: row.color,
                        size: row.size,
                        korea_cost: row.cost,
                        stock_year: preview.inferredYear || row.stockYear || new Date().getFullYear(),
                        stock_month: row.stockMonth || preview.inferredMonth || (new Date().getMonth() + 1)
                    };
                    const key = this._getProductIdentityKey(tempProduct);

                    const rowBrandKey = normalizeLoose(row.brand);
                    const rowTitleKey = normalizeLoose(row.title);
                    const zeroCostMatches = existingProducts.filter(p =>
                        normalizeLoose(p.brand) === rowBrandKey &&
                        normalizeLoose(p.original_title) === rowTitleKey &&
                        Number(p.korea_cost || 0) <= 0 && Number(row.cost || 0) > 0
                    );
                    if (zeroCostMatches.length > 0) {
                        const repairedPrice = PriceCalculator.calculate(row.cost);
                        const client = window.LESOULSupabase && window.LESOULSupabase.getClient();
                        const storeId = window.LESOULAppBootstrap?.getContext?.()?.activeMembership?.storeId;
                        for (const zeroCostMatch of zeroCostMatches) {
                            const productId = zeroCostMatch.remote_id ||
                                (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(zeroCostMatch.id || ''))
                                    ? zeroCostMatch.id : null);
                            if (!client || !storeId || !productId) {
                                summary.productCostRepairFailed++;
                                continue;
                            }
                            const repairResult = await client.rpc('repair_product_cost', {
                                p_store_id: storeId,
                                p_product_id: productId,
                                p_korea_cost: row.cost,
                                p_actual_converted_cost: repairedPrice.actual_converted_cost,
                                p_china_base_price: repairedPrice.china_base_price
                            });
                            if (repairResult.error || repairResult.data !== true) {
                                summary.productCostRepairFailed++;
                                continue;
                            }
                            zeroCostMatch.korea_cost = row.cost;
                            summary.productCostsRepaired++;
                            summary.productsMatched++;
                        }
                        continue;
                    }

                    if (target === 'sales') continue;

                    if (seenIdentities.has(key)) continue;
                    seenIdentities.add(key);

                    if (existingIdentityMap.has(key)) {
                        summary.productsMatched++;
                        continue;
                    }

                    const priceResult = PriceCalculator.calculate(row.cost || 0);
                    const productCode = codeAllocator
                        ? codeAllocator.allocate(row.brand)
                        : DB.generateProductCode(row.brand, tempProduct.stock_year, tempProduct.stock_month);

                    normalizedRows.push({
                        valid: true,
                        product: {
                            brand: row.brand,
                            product_code: productCode,
                            original_title: row.title,
                            color: row.color,
                            size: row.size,
                            korea_cost: row.cost,
                            actual_converted_cost: priceResult.actual_converted_cost,
                            china_base_price: priceResult.china_base_price,
                            current_stock: row.stock,
                            stock_year: tempProduct.stock_year,
                            stock_month: tempProduct.stock_month,
                            category: row.category,
                            material: row.material,
                            notes: row.notes,
                            normalized_title: row.title
                        }
                    });
                }

                if (normalizedRows.length > 0 && typeof ExcelManager !== 'undefined') {
                    // Delegate to ExcelManager's existing import logic
                    let result;
                    if (isRemote && ExcelManager._importProductsRemote) {
                        result = await ExcelManager._importProductsRemote(normalizedRows);
                    } else if (ExcelManager._importProductsLocal) {
                        result = await ExcelManager._importProductsLocal(normalizedRows);
                    }
                    if (result) {
                        summary.productsInserted = result.inserted || 0;
                        summary.productsSkipped = result.skipped || 0;
                    }
                }
            }

            // 현재재고 시트는 최종 재고의 권위 있는 원본이다.
            if ((target === 'products' || target === 'all') && extractedData.inventoryRows?.length) {
                const products = await DB.getProductsAsync();
                for (const row of extractedData.inventoryRows) {
                    const alignedProduct = extractedData.productRows.find(p => p.sourceIndex === row.sourceIndex);
                    const lookupTitle = row.title || alignedProduct?.title || '';
                    const lookupBrand = row.brand || alignedProduct?.brand || '';
                    const product = products.find(p =>
                        String(p.original_title || '').trim() === lookupTitle &&
                        (!lookupBrand || String(p.brand || '').trim() === lookupBrand)
                    );
                    const legacyId = Number(product?.legacy_id || product?.id);
                    if (!product || !Number.isFinite(legacyId) || legacyId <= 0) {
                        summary.inboundSkipped++;
                        continue;
                    }
                    await DB.updateProductAsync(legacyId, {
                        legacy_id: legacyId,
                        current_stock: Math.max(0, row.stock)
                    });
                    summary.inboundApplied++;
                }
            }

            // Save customers — use _extractedData._newCustomerCandidates (actual array)
            const newCustomerNames = (extractedData._newCustomerCandidates || []);
            if ((target === 'customers' || target === 'all') && newCustomerNames.length > 0) {
                const existingNames = new Set();
                try {
                    const customers = DB.getCustomers();
                    customers.forEach(c => existingNames.add((c.name || '').toLowerCase().trim()));
                } catch (e) { /* ignore */ }

                const newCustomers = [...new Set(newCustomerNames)]
                    .filter(name => !this._isSourceLikeCustomerName(name))
                    .filter(name => !existingNames.has(name.toLowerCase().trim()));

                if (newCustomers.length > 0 && typeof ExcelManager !== 'undefined') {
                    const customerRows = newCustomers.map(name => ({ '이름': name }));
                    if (isRemote && ExcelManager._importCustomersRemote) {
                        await ExcelManager._importCustomersRemote(customerRows);
                    } else if (ExcelManager._importCustomersLocal) {
                        ExcelManager._importCustomersLocal(customerRows);
                    }
                    summary.customersInserted = newCustomers.length;
                }
            }

            // Save sales
            if ((target === 'sales' || target === 'all') && extractedData.salesRows && extractedData.salesRows.length > 0) {
                const salesRows = extractedData.salesRows.filter(r => {
                    // Filter out source-like customer names
                    if (r.customerName && this._isSourceLikeCustomerName(r.customerName)) return false;
                    return r.title && r.brand && r.customerName;
                });

                if (salesRows.length > 0 && typeof ExcelManager !== 'undefined') {
                    const orderRows = salesRows.map(r => ({
                        '고객명': r.customerName,
                        '브랜드': r.brand,
                        '상품명': r.title,
                        '수량': r.quantity || 1,
                        '판매금액': r.sellingPrice || 0,
                        '판매일': r.orderDate ? this._formatDate(r.orderDate) : ''
                    }));

                    if (isRemote && ExcelManager._importOrdersRemote) {
                        const importResult = await ExcelManager._importOrdersRemote(orderRows);
                        summary.ordersInserted = Number(importResult?.added) || 0;
                        summary.ordersSkipped = Number(importResult?.skipped) || 0;
                        if (summary.ordersSkipped > 0) {
                            summary.warnings.push(`${summary.ordersSkipped}건의 판매가 상품 연결 또는 저장 오류로 건너뛰어졌습니다.`);
                        }
                    } else if (ExcelManager._importOrdersLocal) {
                        ExcelManager._importOrdersLocal(orderRows);
                        summary.ordersInserted = salesRows.length;
                    }
                }
            }

            window.__LAST_SMART_EXCEL_IMPORT_EXECUTION_SUMMARY = summary;
            const repairMessage = summary.productCostsRepaired > 0
                ? ` 한국원가 ${summary.productCostsRepaired}건 복구.`
                : '';
            const repairFailureMessage = summary.productCostRepairFailed > 0
                ? ` 한국원가 ${summary.productCostRepairFailed}건 실패.`
                : '';
            App.flash(t('common', 'save') + ' ' + t('common', 'complete') + '!' + repairMessage + repairFailureMessage,
                summary.productCostRepairFailed > 0 ? 'warning' : 'success');

            // Reload relevant lists
            if (target === 'products' || target === 'all' || target === 'sales') {
                if (typeof Products !== 'undefined') {
                    Products.state.loaded = false;
                    await Products.load();
                }
            }
            if (target === 'sales' || target === 'all') {
                if (typeof Orders !== 'undefined') {
                    await Orders._loadRemoteDataForRender ? Orders._loadRemoteDataForRender() : Orders.load();
                }
            }
            if (target === 'customers' || target === 'all') {
                if (typeof Customers !== 'undefined') {
                    Customers.state.loaded = false;
                    Customers.load();
                }
            }

            App.render();
        } catch (e) {
            console.error('Smart import save failed:', (e.message || '').slice(0, 100));
            summary.errors.push('SAVE_FAILED: ' + (e.message || '').slice(0, 50));
            window.__LAST_SMART_EXCEL_IMPORT_EXECUTION_SUMMARY = summary;
            App.flash(t('common', 'error') + ': ' + (e.message || ''), 'error');
        }
    },

    _isRemoteMode() {
        try {
            if (typeof ExcelManager !== 'undefined' && ExcelManager._isRemoteProductsMode) {
                return ExcelManager._isRemoteProductsMode();
            }
            const ds = DB.getProductsDataSource ? DB.getProductsDataSource() : null;
            return ds && ds.name === 'SupabaseProductsDataSource';
        } catch (e) {
            return false;
        }
    }
};
