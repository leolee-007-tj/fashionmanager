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
                            <label>입고년도</label>
                            <select id="importYear" class="form-control">${yearOpts}</select>
                        </div>
                        <div class="form-group col-md-6">
                            <label>입고월</label>
                            <select id="importMonth" class="form-control">${monthOpts}</select>
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

    // BLOCKER-FIX-4: row 값 > UI 선택값 fallback 정책
    _resolveProductImportYearMonth(row, selected) {
        const rowYear = parseInt(row['입고년도'] || row['년도'] || row['stock_year'] || '', 10);
        const rowMonth = parseInt(row['입고월'] || row['월'] || row['stock_month'] || '', 10);

        const rowYearValid = Number.isFinite(rowYear) && rowYear >= 2025;
        const rowMonthValid = Number.isFinite(rowMonth) && rowMonth >= 1 && rowMonth <= 12;

        return {
            stockYear: rowYearValid ? rowYear : (selected.year || null),
            stockMonth: rowMonthValid ? rowMonth : (selected.month || null),
            source: (rowYearValid && rowMonthValid) ? 'row' : 'ui'
        };
    },

    _normalizeProductImportRow(row, idx, nextProductId, selYear, selMonth) {
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
        const productCode = row['product_code'] || DB.generateProductCode(brand, stockYear, stockMonth);
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
        const skippedDetails = [];
        let nextProductId = DB.getNextId('products');

        normalizedRows.forEach((nr) => {
            if (!nr.valid) {
                skipped++;
                skippedDetails.push(nr);
                return;
            }
            const existing = products.some(p => p.brand === nr.product.brand && p.original_title === nr.product.original_title);
            if (existing) {
                skipped++;
                skippedDetails.push({ ...nr, reason: 'DUPLICATE' });
                return;
            }
            nr.product.id = nextProductId++;
            products.push(nr.product);
            added++;
        });

        DB.setProducts(products);
        return { added, skipped, skippedDetails, failed: 0 };
    },

    async _importProductsRemote(normalizedRows) {
        const dataSource = DB.getProductsDataSource();
        let added = 0;
        let skipped = 0;
        let failed = 0;
        const skippedDetails = [];
        let nextProductId = DB.getNextId('products');

        for (const nr of normalizedRows) {
            if (!nr.valid) {
                skipped++;
                skippedDetails.push(nr);
                continue;
            }
            nr.product.id = nextProductId++;
            try {
                const result = await dataSource.createProduct(nr.product);
                if (result) {
                    added++;
                } else {
                    failed++;
                    skippedDetails.push({ ...nr, reason: 'REMOTE_CREATE_FAILED' });
                }
            } catch (e) {
                failed++;
                skippedDetails.push({ ...nr, reason: 'REMOTE_CREATE_ERROR', error: e.message });
            }
        }
        return { added, skipped, failed, skippedDetails };
    },

    async importProducts(data) {
        if (data.length === 0) {
            App.flash('업로드할 데이터가 없습니다.', 'warning');
            return;
        }
        if (!confirm(data.length + ' ' + t('excel', 'confirm_import_count') + '?')) return;

        // BLOCKER-FIX-4: UI 선택값 읽기
        const selectedYM = this._getSelectedImportYearMonth();
        const selYear = selectedYM.year;
        const selMonth = selectedYM.month;

        // UI 선택값이 없으면 전체 import 중단
        if (!selYear || !selMonth) {
            App.flash('입고년도/입고월을 선택하세요.', 'warning');
            return;
        }

        let nextProductId = DB.getNextId('products');

        // 모든 행을 정규화 (resolver가 row > UI fallback 처리)
        const normalizedRows = data.map((row, idx) => {
            return this._normalizeProductImportRow(row, idx, nextProductId + idx, selYear, selMonth);
        });

        // remote mode 감지
        const isRemote = this._isRemoteProductsMode();

        let result;
        if (isRemote) {
            result = await this._importProductsRemote(normalizedRows);
        } else {
            result = await this._importProductsLocal(normalizedRows);
        }

        // 업로드 후 read-only count (local/remote 공통)
        const beforeCount = isRemote ? 0 : DB.getProducts().length;
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

        // window.__LAST_PRODUCT_IMPORT_SUMMARY 저장
        window.__LAST_PRODUCT_IMPORT_SUMMARY = {
            mode: isRemote ? 'remote' : 'local',
            selectedYear: selYear,
            selectedMonth: selMonth,
            added: result.added,
            skipped: result.skipped,
            failed: result.failed || 0,
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
            const convertedCost = product ? (product.actual_converted_cost || product.china_base_price || 0) : 0;
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
        App.flash(`${added}건 등록 완료!`, 'success');
    },

    importKeywords(data) {
        if (data.length === 0) {
            App.flash('업로드할 데이터가 없습니다.', 'warning');
            return;
        }
        if (!confirm(data.length + ' ' + t('excel', 'confirm_import_count') + '?')) return;

        const keywords = DB.getKeywords();
        let added = 0;

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
                id: Date.now() + Math.random(),
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
        App.flash(`${added}건 등록 완료!`, 'success');
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
