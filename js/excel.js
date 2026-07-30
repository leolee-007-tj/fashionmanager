const ExcelManager = {
    render() {
        const currentYear = new Date().getFullYear();
        const currentMonth = new Date().getMonth() + 1;
        let yearOpts = '';
        for (let y = 2025; y <= currentYear + 2; y++) {
            yearOpts += `<option value="${y}"${y === currentYear ? ' selected' : ''}>${y}년</option>`;
        }
        let monthOpts = '';
        for (let m = 1; m <= 12; m++) {
            monthOpts += `<option value="${m}"${m === currentMonth ? ' selected' : ''}>${m}월</option>`;
        }

        return `
            <div class="card">
                <h2><i class="fas fa-file-excel"></i> ${t('excel', 'title')}</h2>

                <!-- 템플릿 다운로드 -->
                <div class="card mb-4" style="background: #f8f9fa;">
                    <h3><i class="fas fa-download"></i> <span data-i18n="excel.template_download">${t('excel', 'template_download')}</span></h3>
                    <p class="text-muted mb-4" data-i18n="excel.template_desc">${t('excel', 'template_desc')}</p>
                    <div class="d-flex flex-wrap gap-2">
                        <button class="btn btn-success" onclick="ExcelManager.downloadProductTemplate()">
                            <i class="fas fa-tshirt"></i> <span data-i18n="excel.template_products">${t('excel', 'template_products')}</span>
                        </button>
                        <button class="btn btn-success" onclick="ExcelManager.downloadOrderTemplate()">
                            <i class="fas fa-shopping-cart"></i> <span data-i18n="excel.template_orders">${t('excel', 'template_orders')}</span>
                        </button>
                        <button class="btn btn-success" onclick="ExcelManager.downloadCustomerTemplate()">
                            <i class="fas fa-users"></i> <span data-i18n="excel.template_customers">${t('excel', 'template_customers')}</span>
                        </button>
                        <button class="btn btn-success" onclick="ExcelManager.downloadKeywordTemplate()">
                            <i class="fas fa-tags"></i> <span data-i18n="excel.template_keywords">${t('excel', 'template_keywords')}</span>
                        </button>
                    </div>
                </div>

                <!-- 업로드 -->
                <div class="card" style="border: 2px dashed #667eea;">
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
                    <div class="row">
                        <div class="form-group col-md-6">
                            <label>입고년도 <small class="text-muted">(선택 - 엑셀값 우선)</small></label>
                            <select id="importYear" class="form-control">
                                <option value="">엑셀값 사용</option>
                                ${yearOpts}
                            </select>
                        </div>
                        <div class="form-group col-md-6">
                            <label>입고월 <small class="text-muted">(선택 - 엑셀값 우선)</small></label>
                            <select id="importMonth" class="form-control">
                                <option value="">엑셀값 사용</option>
                                ${monthOpts}
                            </select>
                        </div>
                    </div>
                    <button class="btn btn-primary" onclick="ExcelManager.importData()">
                        <i class="fas fa-upload"></i> ${t('excel', 'start_import')}
                    </button>
                </div>

                <!-- 초기화 -->
                <div class="card mb-4" style="background: #fff3f3; border: 1px solid #e74c3c;">
                    <h3><i class="fas fa-trash-alt"></i> 데이터 초기화</h3>
                    <p class="text-muted mb-3">업로드한 데이터를 초기화합니다. 되돌릴 수 없으니 주의하세요.</p>
                    <div class="mb-3">
                        <button class="btn btn-danger" onclick="ExcelManager.resetAll()">
                            <i class="fas fa-trash"></i> 전체 초기화
                        </button>
                    </div>
                    <div class="row">
                        <div class="form-group col-md-3">
                            <label>년도</label>
                            <select id="resetYear" class="form-control">${yearOpts}</select>
                        </div>
                        <div class="form-group col-md-3">
                            <label>월</label>
                            <select id="resetMonth" class="form-control">${monthOpts}</select>
                        </div>
                        <div class="form-group col-md-3 d-flex align-items-end">
                            <button class="btn btn-warning" onclick="ExcelManager.resetByYearMonth()">
                                <i class="fas fa-calendar-times"></i> 해당 년월 초기화
                            </button>
                        </div>
                    </div>
                </div>

                <!-- 안내 -->
                <div class="info-box mt-4">
                    <h4><i class="fas fa-info-circle"></i> ${t('excel', 'guide')}</h4>
                    <p>${t('excel', 'guide_text')}</p>
                    <ul>
                        <li><strong>${t('excel', 'import_products')}</strong>: 브랜드, 상품명, 한국원가(또는 한국매입원가/원가), 입고월(선택), 현재재고(선택), 색상(선택), 사이즈(선택)</li>
                        <li><strong>${t('excel', 'import_orders')}</strong>: 고객명, 브랜드, 상품명, 최종흥정가(위안), 판매일</li>
                        <li><strong>${t('excel', 'import_customers')}</strong>: 이름, 전화번호(선택), 주소(선택), 메모(선택)</li>
                        <li><strong>${t('excel', 'import_keywords')}</strong>: 타입(brand/category/color/size/material), 키워드, 대체어(선택)</li>
                    </ul>
                </div>
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
            ['브랜드', '상품명', '한국매입원가(KRW)', '초기재고', '입고년도', '입고월'],
            ['SYSTEM', '울 니트', '15000', '5', '2025', '6'],
            ['MIXXO', '자켓', '25000', '3', '2025', '6'],
            ['ZARA', '코튼 셔츠', '18000', '10', '2025', '7'],
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
                const json = XLSX.utils.sheet_to_json(ws, { header: 1 });
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
                    ExcelManager.importOrders(rows);
                } else if (mode === 'customers') {
                    ExcelManager.importCustomers(rows);
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

    // BLOCKER-FIX-4: UI importYear/importMonth select 값을 읽어온다.
    _getSelectedImportYearMonth() {
        const yearEl = document.getElementById('importYear');
        const monthEl = document.getElementById('importMonth');
        const selectedYear = parseInt(yearEl && yearEl.value, 10);
        const selectedMonth = parseInt(monthEl && monthEl.value, 10);
        return {
            year: Number.isFinite(selectedYear) && selectedYear >= 2025 ? selectedYear : null,
            month: Number.isFinite(selectedMonth) && selectedMonth >= 1 && selectedMonth <= 12 ? selectedMonth : null
        };
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
        let koreaCost = row['한국매입원가(KRW)'] || row['한국매입원가'] || row['한국원가'] || row['원가'] || row['cost'] || row['매입가'] || row['korea_cost'] || 0;
        if (typeof koreaCost === 'string') koreaCost = parseInt(String(koreaCost).replace(/,/g, '')) || 0;

        const brand = row['브랜드'] || row['brand'] || '';
        const title = row['상품명'] || row['original_title'] || row['title'] || row['product_name'] || '';

        const skipReasons = [];
        if (!koreaCost) skipReasons.push('MISSING_KOREA_COST');
        if (!title) skipReasons.push('MISSING_TITLE');

        // BLOCKER-FIX-4: year/month resolution
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
        // BLOCKER-FIX-6: batch-aware code allocator 사용. row에 product_code가 있으면 우선 사용하되,
        // 중복이면 자동 새 코드 부여 (PRODUCT_CODE_REPLACED). allocator 없으면 기존 방식 fallback.
        const rowHasCode = !!(row['product_code']);
        let productCode, productCodeReplaced = false;
        if (rowHasCode) {
            const rawCode = row['product_code'];
            if (codeAllocator && codeAllocator.usedCodes && codeAllocator.usedCodes.has(rawCode)) {
                productCode = codeAllocator.allocate(row['브랜드'] || row['brand'] || '');
                productCodeReplaced = true;
            } else {
                productCode = rawCode;
                if (codeAllocator && codeAllocator.usedCodes) {
                    codeAllocator.usedCodes.add(rawCode);
                }
            }
        } else if (codeAllocator && typeof codeAllocator.allocate === 'function') {
            productCode = codeAllocator.allocate(brand);
        } else {
            productCode = DB.generateProductCode(brand, stockYear, stockMonth);
        }
        const currentStock = parseInt(row['초기재고'] || row['현재재고'] || row['재고'] || row['수량'] || row['stock'] || row['quantity'] || 0) || 0;

        let category = row['종류'] || row['카테고리'] || row['category'] || '';
        let color = row['색상'] || row['컬러'] || row['color'] || '';
        let size = row['사이즈'] || row['칫수'] || row['size'] || '';
        let material = row['소재'] || row['재질'] || row['material'] || '';
        if (!category || !color || !size) {
            const autoClassified = ClassificationService.classify(title);
            if (!category && autoClassified.category) category = autoClassified.category;
            if (!color && autoClassified.color) color = autoClassified.color;
            if (!size && autoClassified.size) size = autoClassified.size;
            if (!material && autoClassified.material) material = autoClassified.material;
        }

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
            notes: row['메모'] || row['비고'] || row['notes'] || '',
            title_language: ClassificationService.detectLanguage(title),
            normalized_title: title,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        return { valid: true, product };
    },

    async _importProductsLocal(normalizedRows) {
        const products = DB.getProducts();
        let added = 0;
        let skipped = 0;
        let duplicateCandidateCount = 0;
        let productCodeReplacedCount = 0;
        const skippedDetails = [];
        let nextProductId = DB.getNextId('products');

        // BLOCKER-FIX-6: title-only dedup 금지. 완전 동일 key만 duplicate_candidate로 기록.
        // duplicate 판단 key: brand + original_title + color + size + korea_cost + stock_year + stock_month
        normalizedRows.forEach((nr) => {
            if (!nr.valid) {
                skipped++;
                skippedDetails.push(nr);
                return;
            }
            const identityKey = (nr.product.brand || '') + '|||' + (nr.product.original_title || '') + '|||' + (nr.product.color || '') + '|||' + (nr.product.size || '') + '|||' + String(nr.product.korea_cost || 0) + '|||' + String(nr.product.stock_year || 0) + '|||' + String(nr.product.stock_month || 0);
            const exactDup = products.some(p => {
                const pk = (p.brand || '') + '|||' + (p.original_title || '') + '|||' + (p.color || '') + '|||' + (p.size || '') + '|||' + String(p.korea_cost || 0) + '|||' + String(p.stock_year || 0) + '|||' + String(p.stock_month || 0);
                return pk === identityKey;
            });
            if (exactDup) {
                duplicateCandidateCount++;
                skippedDetails.push({ ...nr, reason: 'DUPLICATE_CANDIDATE' });
                // exact duplicate는 자동 skip하지 않고 모두 import (중복 방지 우선)
                // 사용자가 나중에 정리 가능
            }
            if (nr.product.productCodeReplaced) productCodeReplacedCount++;
            nr.product.id = nextProductId++;
            products.push(nr.product);
            added++;
        });

        DB.setProducts(products);
        return { added, skipped, skippedDetails, failed: 0, duplicateCandidateCount, productCodeReplacedCount };
    },

    async _importProductsRemote(normalizedRows) {
        const dataSource = DB.getProductsDataSource();
        let added = 0;
        let skipped = 0;
        let failed = 0;
        let duplicateCandidateCount = 0;
        let productCodeReplacedCount = 0;
        let productCodeDuplicateCount = 0;
        const skippedDetails = [];

        // BLOCKER-FIX-5: Supabase 기존 상품을 한 번만 조회하여 legacy_id 중복 방지
        let existingProducts = [];
        let nextProductId = DB.getNextId('products');
        try {
            existingProducts = await dataSource.listProducts();
            let maxRemoteLegacyId = existingProducts.reduce((max, p) => {
                const lid = Number(p.legacy_id);
                return Number.isFinite(lid) && lid > max ? lid : max;
            }, 0);

            // BLOCKER-FIX-7: soft-delete된 상품도 legacy_id가 unique_products_legacy_id
            // 제약조건에 걸리므로, deleted_at 관계없이 전체 max legacy_id를 조회한다.
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
            } catch (e) {
                // fallback: active-only max 사용
            }

            const localNextId = DB.getNextId('products');
            nextProductId = Math.max(maxRemoteLegacyId + 1, localNextId);
        } catch (e) {
            nextProductId = DB.getNextId('products');
        }

        // BLOCKER-FIX-6: brand+title-only dedup 금지. product_code는 allocator가 이미 처리.
        // duplicate candidate만 추적 (exact match by full identity key)
        const existingIdentityKeys = new Set(
            existingProducts.map(p => {
                return (p.brand || '') + '|||' + (p.original_title || '') + '|||' + (p.color || '') + '|||' + (p.size || '') + '|||' + String(p.korea_cost || 0) + '|||' + String(p.stock_year || 0) + '|||' + String(p.stock_month || 0);
            })
        );

        for (const nr of normalizedRows) {
            if (!nr.valid) {
                skipped++;
                skippedDetails.push(nr);
                continue;
            }

            // BLOCKER-FIX-6: 완전 동일 키만 duplicate_candidate로 기록 (skip하지 않음)
            const identityKey = (nr.product.brand || '') + '|||' + (nr.product.original_title || '') + '|||' + (nr.product.color || '') + '|||' + (nr.product.size || '') + '|||' + String(nr.product.korea_cost || 0) + '|||' + String(nr.product.stock_year || 0) + '|||' + String(nr.product.stock_month || 0);
            if (existingIdentityKeys.has(identityKey)) {
                duplicateCandidateCount++;
                skippedDetails.push({ ...nr, reason: 'DUPLICATE_CANDIDATE' });
            }

            // BLOCKER-FIX-5: legacy_id 명시적 할당
            nr.product.id = nextProductId;
            nr.product.legacy_id = nextProductId;
            nextProductId++;

            if (nr.product.productCodeReplaced) productCodeReplacedCount++;

            try {
                const result = await dataSource.createProduct(nr.product);
                if (result) {
                    added++;
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
        return { added, skipped, failed, duplicateCandidateCount, productCodeReplacedCount, productCodeDuplicateCount, skippedDetails };
    },

    async importProducts(data) {
        if (data.length === 0) {
            App.flash('업로드할 데이터가 없습니다.', 'warning');
            return;
        }
        if (!confirm(data.length + ' ' + t('excel', 'confirm_import_count') + '?')) return;

        // UI 선택값 읽기 (선택사항: 엑셀 셀 값이 우선됨)
        const selectedYM = this._getSelectedImportYearMonth();
        const selYear = selectedYM.year;
        const selMonth = selectedYM.month;

        // UI 선택값이 없어도 엑셀 셀 값이나 현재 날짜로 fallback하므로 차단하지 않음
        let nextProductId = DB.getNextId('products');

        // BLOCKER-FIX-6: batch-aware product_code allocator (normalize 전에 build)
        const isRemote = this._isRemoteProductsMode();
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

        // 모든 행을 정규화 (resolver가 row > UI fallback 처리)
        const normalizedRows = data.map((row, idx) => {
            return this._normalizeProductImportRow(row, idx, nextProductId + idx, selYear, selMonth, codeAllocator);
        });

        let result;
        if (isRemote) {
            result = await this._importProductsRemote(normalizedRows);
        } else {
            result = await this._importProductsLocal(normalizedRows);
        }

        // BLOCKER-FIX-6: totalInitialStockInFile 계산 (raw data 기준)
        const totalInitialStockInFile = data.reduce((sum, row) => {
            const stock = parseInt(row['초기재고'] || row['현재재고'] || row['재고'] || row['수량'] || row['stock'] || row['quantity'] || 0) || 0;
            return sum + stock;
        }, 0);

        // BLOCKER-FIX-6: normalizedValidRows count
        const normalizedValidRows = normalizedRows.filter(nr => nr.valid).length;

        // 업로드 후 read-only count (local/remote 공통)
        const beforeDatasourceCount = isRemote ? 0 : DB.getProducts().length;
        let datasourceCount = 0;
        let visibleCount = 0;
        if (typeof DB.getProductsAsync === 'function') {
            try {
                const allProducts = await DB.getProductsAsync();
                datasourceCount = allProducts.length;
            } catch (e) {
                // fallback
            }
        } else {
            datasourceCount = DB.getProducts().length;
        }

        // BLOCKER-FIX-6: expectedDatasourceCountAfter = beforeDatasourceCount + added
        const expectedDatasourceCountAfter = beforeDatasourceCount + result.added;
        const countDeltaMatchesAdded = datasourceCount === expectedDatasourceCountAfter;

        // 성공한 상품들의 year/month 집계
        const successYearMonths = new Set();
        let firstSuccessYear = null;
        let firstSuccessMonth = null;
        if (result.added > 0) {
            // 성공한 normalizedRows에서 year/month 추출
            normalizedRows.forEach((nr, idx) => {
                if (nr.valid && idx < (result.added + (result.skipped || 0))) {
                    const p = nr.product;
                    if (p && p.stock_year && p.stock_month) {
                        successYearMonths.add(String(p.stock_year) + '-' + String(p.stock_month).padStart(2, '0'));
                        if (!firstSuccessYear) { firstSuccessYear = p.stock_year; firstSuccessMonth = p.stock_month; }
                    }
                }
            });
        }

        // BLOCKER-FIX-6: totalCurrentStockAdded 계산 (added된 상품의 재고 합)
        let totalCurrentStockAdded = 0;
        normalizedRows.forEach((nr) => {
            if (nr.valid && nr.product) {
                totalCurrentStockAdded += (nr.product.current_stock || 0);
            }
        });

        // window.__LAST_PRODUCT_IMPORT_SUMMARY 저장
        window.__LAST_PRODUCT_IMPORT_SUMMARY = {
            mode: isRemote ? 'remote' : 'local',
            inputRows: data.length,
            normalizedValidRows: normalizedValidRows,
            selectedYear: selYear,
            selectedMonth: selMonth,
            added: result.added,
            skipped: result.skipped,
            failed: result.failed || 0,
            duplicateCandidateCount: result.duplicateCandidateCount || 0,
            productCodeGeneratedCount: normalizedValidRows - (result.productCodeReplacedCount || 0),
            productCodeReplacedCount: result.productCodeReplacedCount || 0,
            productCodeDuplicateCount: result.productCodeDuplicateCount || 0,
            expectedDatasourceCountAfter: expectedDatasourceCountAfter,
            postImportDatasourceCount: datasourceCount,
            countDeltaMatchesAdded: countDeltaMatchesAdded,
            totalInitialStockInFile: totalInitialStockInFile,
            totalCurrentStockAdded: totalCurrentStockAdded,
            skippedDetails: result.skippedDetails ? result.skippedDetails.map(d => ({
                rowIndex: d.rowIndex,
                reason: d.reason,
                hasTitle: d.hasTitle,
                hasKoreaCost: d.hasKoreaCost
            })) : [],
            successYearMonths: Array.from(successYearMonths).sort(),
            postImportDatasourceCount: datasourceCount,
            postImportVisibleCount: visibleCount,
            productsFilterYear: null,
            productsFilterMonth: null,
            navigatedToProducts: false
        };

        if (!countDeltaMatchesAdded) {
            console.error('Product import count mismatch: expected', expectedDatasourceCountAfter, 'got', datasourceCount);
        }

        if (result.skippedDetails && result.skippedDetails.length > 0) {
            console.warn('Product import skipped details:', window.__LAST_PRODUCT_IMPORT_SUMMARY);
        }

        // UI 메시지
        if (result.added === 0 && result.skipped === 0 && (result.failed || 0) === 0) {
            App.flash('0건 등록 (한국매입원가(KRW) 컬럼 확인 필요)', 'warning');
        } else {
            let msg = `${result.added}건 등록 완료!`;
            const extra = [];
            if (result.skipped > 0) extra.push(`${result.skipped}건 스킵`);
            if (result.failed > 0) extra.push(`${result.failed}건 실패`);
            if (extra.length > 0) msg += ` (${extra.join(', ')})`;
            if (result.skipped > 0 || result.failed > 0) msg += ' 콘솔에서 스킵 사유 확인.';
            App.flash(msg, result.failed > 0 ? 'warning' : 'success');
        }

        // BLOCKER-FIX-4: 업로드 후 상품목록 자동 필터 이동
        if (typeof Products !== 'undefined') {
            Products.state.loaded = false;
            Products.state.search = '';

            if (result.added > 0) {
                if (successYearMonths.size === 1 && firstSuccessYear && firstSuccessMonth) {
                    // 단일 year/month → 해당 년월로 필터
                    Products.state.stockYear = firstSuccessYear;
                    Products.state.stockMonth = firstSuccessMonth;
                    window.__LAST_PRODUCT_IMPORT_SUMMARY.productsFilterYear = firstSuccessYear;
                    window.__LAST_PRODUCT_IMPORT_SUMMARY.productsFilterMonth = firstSuccessMonth;
                } else {
                    // 여러 year/month → 전체 보기
                    Products.state.stockYear = 0;
                    Products.state.stockMonth = 0;
                    window.__LAST_PRODUCT_IMPORT_SUMMARY.productsFilterYear = 0;
                    window.__LAST_PRODUCT_IMPORT_SUMMARY.productsFilterMonth = 0;
                    if (successYearMonths.size > 1) {
                        App.flash('여러 입고월 상품이 업로드되어 전체 보기로 이동했습니다.', 'info');
                    }
                }
            } else {
                // added === 0, filter unchanged
                Products.state.stockYear = 0;
                Products.state.stockMonth = 0;
            }

            await Products.load();
            window.__LAST_PRODUCT_IMPORT_SUMMARY.navigatedToProducts = true;
            visibleCount = Products.state.filtered.length;
            window.__LAST_PRODUCT_IMPORT_SUMMARY.postImportVisibleCount = visibleCount;
        }

        // 상품목록으로 이동
        location.hash = '#/products';
        App.render();
    },

    importOrders(data) {
        if (data.length === 0) {
            App.flash('업로드할 데이터가 없습니다.', 'warning');
            return;
        }
        if (!confirm(data.length + ' ' + t('excel', 'confirm_import_count') + '?')) return;

        const orders = DB.getOrders();
        const customers = DB.getCustomers();
        const products = DB.getProducts();
        let added = 0;
        let skipped = 0;
        let replaced = 0;
        let nextCustomerId = DB.getNextId('customers');
        let nextOrderId = DB.getNextId('orders');

        // 1단계: 업로드 데이터에서 (고객 + 브랜드 + 상품명) 키와 판매월 추출
        const uploadedKeys = new Set();
        const uploadMonths = new Set();
        const normalizedRows = [];
        data.forEach((row, idx) => {
            const customerName = String(row['고객명'] || row['customer_name'] || row['name'] || '').trim();
            const productName = String(row['상품명'] || row['product_name'] || row['original_title'] || '').trim();
            const brand = String(row['브랜드'] || row['brand'] || '').trim();
            const rawDate = row['판매일'] || row['order_date'] || row['date'] || '';
            const dateObj = this._parseExcelDate(rawDate) || new Date();
            if (!isNaN(dateObj.getTime())) {
                uploadMonths.add(dateObj.getFullYear() + '-' + (dateObj.getMonth() + 1));
            }
            const orderDateStr = this._formatDate(dateObj);
            if (!customerName || !productName) {
                skipped++;
                return;
            }
            const key = (customerName.toLowerCase()) + '|' + (brand.toLowerCase()) + '|' + (productName.toLowerCase());
            uploadedKeys.add(key);
            normalizedRows.push({ idx, row, customerName, productName, brand, key, orderDateStr });
        });

        // 2단계: 같은 월의 기존 주문 중 업로드된 (고객+브랜드+상품명)과 일치하는 것은 제거
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

        // 3단계: 새 주문 추가
        normalizedRows.forEach(({ idx, row, customerName, productName, brand, orderDateStr }) => {
            const isZiLiu = /自留|자留|지留|자류|지류|自留款/i.test(customerName);
            let sellingPrice = parseFloat(row['최종흥정가(위안)'] || row['최종흥정가'] || row['판매가'] || row['selling_price'] || row['price'] || 0) || 0;
            // 최종판매가가 0원이어도 스킵하지 않고 그대로 저장
            if (isZiLiu) {
                sellingPrice = sellingPrice || 0;
            }

            // 고객 찾기 또는 생성
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

            // 상품 찾기
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
        let msg = `${added}건 등록 완료!`;
        if (replaced > 0) msg += ` (기존 ${replaced}건 덮어쓰기)`;
        if (skipped > 0) msg += ` (${skipped}건 스킵)`;
        App.flash(msg, 'success');
    },

    importCustomers(data) {
        if (data.length === 0) {
            App.flash('업로드할 데이터가 없습니다.', 'warning');
            return;
        }
        if (!confirm(data.length + ' ' + t('excel', 'confirm_import_count') + '?')) return;

        const customers = DB.getCustomers();
        let added = 0;
        let nextCustomerId = DB.getNextId('customers');

        data.forEach(row => {
            const name = row['이름'] || row['name'] || row['고객명'] || row['customer_name'] || '';
            if (!name) return;
            // 중복 검증: 같은 이름의 고객이 이미 존재하면 스킵
            if (customers.some(c => c.name === name)) { return; }
            customers.push({
                id: nextCustomerId++,
                name: name,
                wechat_nickname: row['위챗닉네임'] || row['wechat_nickname'] || '',
                phone: row['전화번호'] || row['phone'] || row['연락처'] || '',
                address: row['주소'] || row['address'] || '',
                notes: row['메모'] || row['notes'] || row['비고'] || '',
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
        if (added === 0) {
            App.flash('등록할 고객이 없습니다. (이름 컬럼 확인 필요)', 'warning');
        } else {
            App.flash(`${added}건 등록 완료!`, 'success');
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
