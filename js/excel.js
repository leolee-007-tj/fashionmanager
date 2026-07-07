const ExcelManager = {
    render() {
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
                    <button class="btn btn-primary" onclick="ExcelManager.importData()">
                        <i class="fas fa-upload"></i> ${t('excel', 'start_import')}
                    </button>
                </div>

                <!-- 안내 -->
                <div class="info-box mt-4">
                    <h4><i class="fas fa-info-circle"></i> ${t('excel', 'guide')}</h4>
                    <p>${t('excel', 'guide_text')}</p>
                    <ul>
                        <li><strong>${t('excel', 'import_products')}</strong>: 브랜드, 상품명, 한국원가(또는 한국매입원가/원가), 입고월(선택), 현재재고(선택), 색상(선택), 사이즈(선택)</li>
                        <li><strong>${t('excel', 'import_orders')}</strong>: 고객명, 상품명, 브랜드, 수량, 판매가, 판매일(선택), 택배사(선택), 운송장번호(선택)</li>
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
            ['고객명', '브랜드', '상품명', '색상', '사이즈', '수량', '최종흥정가(위안)', '판매일'],
            ['김미영', 'SYSTEM', '울 니트', 'CREAM', 'FREE', '2', '35000', '2025-07-01'],
            ['이수진', 'MIXXO', '자켓', 'BLACK', 'M', '1', '45000', '2025-07-02'],
        ];
        this._downloadSheet(data, '주문목록', 'template_orders.xlsx');
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
                    ExcelManager.importProducts(rows);
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

    importProducts(data) {
        if (data.length === 0) {
            App.flash('업로드할 데이터가 없습니다.', 'warning');
            return;
        }
        if (!confirm(data.length + ' ' + t('excel', 'confirm_import_count') + '?')) return;

        const products = DB.getProducts();
        let added = 0;
        let skipped = 0;

        data.forEach((row, idx) => {
            // 한국매입원가(KRW) 찾기
            let koreaCost = row['한국매입원가(KRW)'] || row['한국매입원가'] || row['한국원가'] || row['원가'] || row['cost'] || row['매입가'] || row['korea_cost'] || 0;
            if (typeof koreaCost === 'string') koreaCost = parseInt(String(koreaCost).replace(/,/g, '')) || 0;
            if (!koreaCost) { skipped++; return; }

            const priceResult = PriceCalculator.calculate(koreaCost);
            const brand = row['브랜드'] || row['brand'] || '';
            const title = row['상품명'] || row['original_title'] || row['title'] || row['product_name'] || '';
            if (!title) { skipped++; return; }

            const stockYear = row['입고년도'] || row['년도'] || row['stock_year'] || new Date().getFullYear();
            const stockMonth = row['입고월'] || row['월'] || row['stock_month'] || new Date().getMonth() + 1;
            const productCode = row['product_code'] || DB.generateProductCode(brand, stockYear, stockMonth);
            const currentStock = parseInt(row['초기재고'] || row['현재재고'] || row['재고'] || row['수량'] || row['stock'] || row['quantity'] || 0) || 0;

            products.push({
                id: Date.now() + Math.random(),
                product_code: productCode,
                original_title: title,
                brand: brand,
                category: row['종류'] || row['카테고리'] || row['category'] || '',
                color: row['색상'] || row['컬러'] || row['color'] || '',
                size: row['사이즈'] || row['칫수'] || row['size'] || '',
                material: row['소재'] || row['재질'] || row['material'] || '',
                korea_cost: koreaCost,
                actual_converted_cost: priceResult.actual_converted_cost,
                china_base_price: priceResult.china_base_price,
                current_stock: currentStock,
                reserved_stock: 0,
                stock_year: parseInt(stockYear) || new Date().getFullYear(),
                stock_month: parseInt(stockMonth) || new Date().getMonth() + 1,
                image: null,
                notes: row['메모'] || row['비고'] || row['notes'] || '',
                title_language: ClassificationService.detectLanguage(title),
                normalized_title: title,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });
            added++;
        });
        DB.setProducts(products);
        if (added === 0) {
            App.flash('0건 등록 (한국매입원가(KRW) 컬럼 확인 필요)', 'warning');
        } else {
            let msg = `${added}건 등록 완료!`;
            if (skipped > 0) msg += ` (${skipped}건 스킵)`;
            App.flash(msg, 'success');
        }
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

        data.forEach((row, idx) => {
            const customerName = row['고객명'] || row['customer_name'] || row['name'] || '';
            const productName = row['상품명'] || row['product_name'] || row['original_title'] || '';
            const brand = row['브랜드'] || row['brand'] || '';
            const qty = parseInt(row['수량'] || row['quantity'] || 1) || 1;
            const sellingPrice = parseFloat(row['최종흥정가(위안)'] || row['최종흥정가'] || row['판매가'] || row['selling_price'] || row['price'] || 0) || 0;

            if (!customerName || !productName || !sellingPrice) {
                skipped++;
                return;
            }

            // 고객 찾기 또는 생성
            let customer = customers.find(c => c.name === customerName);
            if (!customer) {
                customer = {
                    id: Date.now() + Math.random(),
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
            const cost = product ? product.korea_cost : 0;
            const profit = sellingPrice - cost;

            orders.push({
                id: Date.now() + Math.random(),
                order_number: row['주문번호'] || row['order_number'] || 'ORD-' + String(added + 1).padStart(4, '0'),
                customer_id: customer.id,
                product_id: productId,
                color: row['색상'] || row['color'] || '',
                size: row['사이즈'] || row['size'] || '',
                quantity: qty,
                selling_price: sellingPrice,
                order_date: row['판매일'] || row['order_date'] || row['date'] || new Date().toISOString().slice(0, 10),
                ship_date: row['출고일'] || row['ship_date'] || null,
                shipping_company: row['택배사'] || row['shipping_company'] || '',
                tracking_number: row['운송장번호'] || row['tracking_number'] || '',
                status: 'COMPLETED',
                actual_profit: profit * qty,
                actual_profit_margin: sellingPrice > 0 ? Math.round((profit / sellingPrice) * 100) : 0,
                actual_cost_ratio: sellingPrice > 0 ? Math.round((cost / sellingPrice) * 100) : 0,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });
            added++;
        });
        DB.setCustomers(customers);
        DB.setOrders(orders);
        let msg = `${added}건 등록 완료!`;
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

        data.forEach(row => {
            const name = row['이름'] || row['name'] || row['고객명'] || row['customer_name'] || '';
            if (!name) return;
            customers.push({
                id: Date.now() + Math.random(),
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
    }
};
