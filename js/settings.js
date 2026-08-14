const Settings = {
    render() {
        const s = DB.getSettings();
        const keywords = DB.getKeywords();
        const keywordTypes = { brand: t('classification', 'type_brand'), category: t('classification', 'type_category'), color: t('classification', 'type_color'), size: t('classification', 'type_size'), material: t('classification', 'type_material') };
        const storeName = s.store_name || 'LESOUL';
        const storeSubtitle = s.store_subtitle || {
            ko: '매장 관리', zh: '店铺管理', en: 'Store Management', ja: '店舗管理'
        };
        const subtitleVal = typeof storeSubtitle === 'object' ? (storeSubtitle[currentLang] || storeSubtitle.ko || 'Store Management') : storeSubtitle;
        let html = `
            <div class="card">
                <div class="action-bar">
                    <div class="action-bar-left">
                        <h2><i class="fas fa-cog"></i> ${t('settings', 'title')}</h2>
                    </div>
                </div>
                <h3 class="mb-3"><i class="fas fa-globe"></i> ${t('settings', 'language')}</h3>
                <p class="text-muted">${t('settings', 'language_desc')}</p>
                <div class="d-flex flex-wrap gap-2 mb-4">
                    <button class="lang-btn btn ${currentLang === 'ko' ? 'btn-primary' : 'btn-secondary'}" data-lang="ko" onclick="setLanguage('ko'); App.render();" title="한국어" style="font-size:20px;">🇰🇷</button>
                    <button class="lang-btn btn ${currentLang === 'zh' ? 'btn-primary' : 'btn-secondary'}" data-lang="zh" onclick="setLanguage('zh'); App.render();" title="中文" style="font-size:20px;">🇨🇳</button>
                    <button class="lang-btn btn ${currentLang === 'en' ? 'btn-primary' : 'btn-secondary'}" data-lang="en" onclick="setLanguage('en'); App.render();" title="English" style="font-size:20px;">🇺🇸</button>
                    <button class="lang-btn btn ${currentLang === 'ja' ? 'btn-primary' : 'btn-secondary'}" data-lang="ja" onclick="setLanguage('ja'); App.render();" title="日本語" style="font-size:20px;">🇯🇵</button>
                </div>
                <hr>
                <h3 class="mb-3"><i class="fas fa-store"></i> ${t('settings', 'store_settings')}</h3>
                <div class="form-row">
                    <div class="form-group">
                        <label>${t('settings', 'store_name')}</label>
                        <input type="text" id="storeName" class="form-control" value="${storeName}">
                    </div>
                    <div class="form-group">
                        <label>${t('settings', 'app_brand_name')}</label>
                        <input type="text" id="appBrandName" class="form-control" value="${DB.getBrandName()}">
                    </div>
                    <div class="form-group">
                        <label>${t('settings', 'store_subtitle')}</label>
                        <input type="text" id="storeSubtitle" class="form-control" value="${subtitleVal}">
                    </div>
                </div>
                <hr>
                <h3 class="mb-3"><i class="fas fa-coins"></i> ${t('settings', 'price_calculation')}</h3>
                <form id="settingsForm" onsubmit="return Settings.save()">
                    <div class="form-row">
                        <div class="form-group">
                            <label>${t('settings', 'exchange_rate')}</label>
                            <input type="number" name="exchange_divisor" class="form-control" value="${s.exchange_divisor}" step="0.01">
                        </div>
                        <div class="form-group">
                            <label>${t('settings', 'price_multiplier')}</label>
                            <input type="number" name="price_multiplier" class="form-control" value="${s.price_multiplier}" step="0.1">
                        </div>
                        <div class="form-group">
                            <label>${t('settings', 'fixed_addition')} (${t('common', 'currency')})</label>
                            <input type="number" name="fixed_addition" class="form-control" value="${s.fixed_addition}" step="1">
                        </div>
                    </div>
                    <div class="info-box mt-4" style="background: #f0f7ff; border: 1px solid #b3d9ff; padding: 1rem; border-radius: 8px;">
                        <h4 style="color: #0066cc;"><i class="fas fa-calculator"></i> ${t('settings', 'formula_1')}</h4>
                        <p class="text-muted">${t('settings', 'formula_2')}</p>
                        <div id="calcPreview">
                            ${this.renderCalcPreview(s)}
                        </div>
                    </div>
                    <button type="button" class="btn btn-secondary mt-4" onclick="Settings.recalculateAll()">
                        <i class="fas fa-sync"></i> ${t('settings', 'recalculate_all')}
                    </button>
                    <p class="text-muted">${t('settings', 'recalculate_desc')}</p>
                    <button type="submit" class="btn btn-primary mt-3">
                        <i class="fas fa-save"></i> ${t('settings', 'save')}
                    </button>
                </form>
            </div>
            <div class="card mt-4">
                <div class="action-bar">
                    <div class="action-bar-left">
                        <h3><i class="fas fa-database"></i> ${t('settings', 'data_management')}</h3>
                    </div>
                </div>
                <p class="text-muted">${t('settings', 'backup_desc')}</p>
                <div class="d-flex flex-wrap gap-2">
                    <button class="btn btn-success" onclick="Settings.exportData()">
                        <i class="fas fa-download"></i> ${t('settings', 'backup_download')}
                    </button>
                    <label class="btn btn-primary" style="cursor:pointer; margin:0;">
                        <i class="fas fa-upload"></i> ${t('settings', 'restore_select')}
                        <input type="file" accept=".json" style="display:none;" onchange="Settings.importData(this)">
                    </label>
                </div>
                <p class="text-warning mt-2">${t('settings', 'restore_warning')}</p>
                <hr>
                <h4><i class="fas fa-broom"></i> 중복 데이터 관리</h4>
                <p class="text-muted">엄격한 기준으로 같은 고객·상품·판매만 찾습니다. 목록을 검토해 선택 삭제하거나, 대표 기록 하나만 남기고 바로 정리할 수 있습니다.</p>
                <div class="d-flex flex-wrap gap-2">
                    <button class="btn btn-primary" id="viewDuplicatesButton" onclick="Settings.loadDuplicateReview()">
                        <i class="fas fa-search"></i> 중복자료 보기
                    </button>
                    <button class="btn btn-warning" id="cleanupDuplicatesButton" onclick="Settings.cleanupAllDuplicates()">
                        <i class="fas fa-broom"></i> 보지 않고 바로 정리
                    </button>
                </div>
                <div id="duplicateCleanupResult" class="mt-2"></div>
                <div id="duplicateReviewPanel" class="mt-3"></div>
            </div>
            <div class="card mt-4">
                <h3><i class="fas fa-info-circle"></i> ${t('settings', 'current_settings')}</h3>
                <table class="table">
                    <tr><th>${t('settings', 'store_name')}</th><td>${storeName}</td></tr>
                    <tr><th>${t('settings', 'store_subtitle')}</th><td>${subtitleVal}</td></tr>
                    <tr><th>${t('settings', 'language')}</th><td>${t('settings', 'language_' + currentLang)}</td></tr>
                    <tr><th>${t('settings', 'exchange_rate')}</th><td>${s.exchange_divisor}</td></tr>
                    <tr><th>${t('settings', 'price_multiplier')}</th><td>${s.price_multiplier}</td></tr>
                    <tr><th>${t('settings', 'fixed_addition')}</th><td>${s.fixed_addition} ${t('common', 'currency')}</td></tr>
                </table>
            </div>
        `;
        setTimeout(() => this.bindCalcPreview(), 100);
        return html;
    },

    renderCalcPreview(s) {
        const exampleCost = 100000;
        const result = PriceCalculator.calculate(exampleCost, s);
        return `
            <p><strong>${exampleCost.toLocaleString()} ${t('common', 'currency_kr')}</strong> →
            <strong style="color:#8b5cf6;">${result.actual_converted_cost.toLocaleString()} ${t('common', 'currency')}</strong> →
            <strong style="color:#10b981;">${result.china_base_price.toLocaleString()} ${t('common', 'currency')}</strong></p>
        `;
    },

    bindCalcPreview() {
        const inputs = document.querySelectorAll('#settingsForm input');
        inputs.forEach(i => {
            i.addEventListener('input', () => {
                const fd = new FormData(document.getElementById('settingsForm'));
                const s = {
                    exchange_divisor: parseFloat(fd.get('exchange_divisor')) || 10,
                    price_multiplier: parseFloat(fd.get('price_multiplier')) || 3,
                    fixed_addition: parseFloat(fd.get('fixed_addition')) || 40
                };
                const preview = document.getElementById('calcPreview');
                if (preview) preview.innerHTML = this.renderCalcPreview(s);
            });
        });
    },

    async save() {
        const fd = new FormData(document.getElementById('settingsForm'));
        const settings = DB.getSettings();
        settings.exchange_divisor = parseFloat(fd.get('exchange_divisor')) || 10;
        settings.price_multiplier = parseFloat(fd.get('price_multiplier')) || 3;
        settings.fixed_addition = parseFloat(fd.get('fixed_addition')) || 40;
        const storeName = document.getElementById('storeName').value.trim() || 'LESOUL';
        const storeSubtitle = document.getElementById('storeSubtitle').value.trim() || '매장 관리';
        const brandName = document.getElementById('appBrandName').value.trim();
        settings.store_name = storeName;
        settings.store_subtitle = storeSubtitle;
        DB.setSettings(settings);
        DB.setBrandName(brandName);
        try {
            const ds = DB.getOrdersDataSource();
            const isRemote = ds && ds.name === 'SupabaseOrdersDataSource';
            if (isRemote) {
                const client = window.LESOULSupabase && window.LESOULSupabase.getClient();
                const storeId = window.LESOULAppBootstrap?.getContext?.()?.activeMembership?.storeId;
                if (!client || !storeId) throw new Error('설정 원격 연결 정보가 없습니다.');
                const result = await client.from('store_settings').upsert({
                    store_id: storeId,
                    store_name: storeName,
                    store_subtitle: { ko: storeSubtitle },
                    exchange_divisor: settings.exchange_divisor,
                    price_multiplier: settings.price_multiplier,
                    fixed_addition: settings.fixed_addition,
                    base_discount_rate: settings.base_discount_rate || 20
                }, { onConflict: 'store_id' });
                if (result.error) throw new Error(result.error.message || '설정 저장 실패');
            }
        } catch (e) {
            App.flash(e.message || '설정 저장 실패', 'error');
            return false;
        }
        App.updateHeader();
        App.flash(t('settings', 'save_success'), 'success');
        setTimeout(() => location.reload(), 500);
        return false;
    },

    recalculateAll() {
        if (!confirm(t('settings', 'recalculate_desc'))) return;
        const settings = DB.getSettings();
        const products = DB.getProducts();
        products.forEach(p => {
            const result = PriceCalculator.calculate(p.korea_cost || 0, settings);
            p.actual_converted_cost = result.actual_converted_cost;
            p.china_base_price = result.china_base_price;
        });
        DB.setProducts(products);
        App.flash(t('settings', 'save_success'), 'success');
        App.render();
    },

    _escapeDuplicateText(value) {
        return String(value ?? '').replace(/[&<>"']/g, ch => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[ch]);
    },

    async _getDuplicateContext() {
        const client = window.LESOULSupabase && window.LESOULSupabase.getClient();
        const storeId = window.LESOULAppBootstrap?.getContext?.()?.activeMembership?.storeId;
        if (!client || !storeId) throw new Error('Supabase 로그인과 매장 연결이 필요합니다.');
        return { client, storeId };
    },

    async loadDuplicateReview() {
        const button = document.getElementById('viewDuplicatesButton');
        if (button) button.disabled = true;
        try {
            const { client, storeId } = await this._getDuplicateContext();
            const result = await client.rpc('list_strict_duplicates', { p_store_id: storeId });
            if (result.error) throw new Error(result.error.message || '중복 조회 실패');
            this._duplicateRows = result.data || [];
            this.renderDuplicateReview();
        } catch (e) {
            App.flash(e.message || '중복 조회 실패', 'error');
        } finally {
            if (button) button.disabled = false;
        }
    },

    renderDuplicateReview() {
        const panel = document.getElementById('duplicateReviewPanel');
        if (!panel) return;
        const rows = this._duplicateRows || [];
        if (rows.length === 0) {
            panel.innerHTML = '<div class="info-box">현재 엄격한 기준의 중복자료가 없습니다.</div>';
            return;
        }
        const labels = { customer: '고객', product: '상품', sale: '판매' };
        const htmlRows = rows.map(row => {
            const details = row.details || {};
            const detailText = row.entity_type === 'product'
                ? `원가 ${Number(details.korea_cost || 0).toLocaleString()}원 · ${details.stock_year || '-'}년 ${details.stock_month || '-'}월`
                : row.entity_type === 'sale'
                    ? `${details.date || '-'} · ${details.quantity || 0}개 · ${Number(details.selling_price || 0).toLocaleString()}위안`
                    : `등록 ${details.created_at ? String(details.created_at).slice(0, 10) : '-'}`;
            const checked = row.is_keeper ? '' : ' checked';
            const disabled = row.is_keeper ? ' disabled' : '';
            return `<tr>
                <td><input type="checkbox" class="strict-duplicate-checkbox" data-entity="${this._escapeDuplicateText(row.entity_type)}" data-id="${this._escapeDuplicateText(row.record_id)}"${checked}${disabled}></td>
                <td>${labels[row.entity_type] || row.entity_type}</td>
                <td>${this._escapeDuplicateText(row.label)}</td>
                <td>${this._escapeDuplicateText(detailText)}</td>
                <td>${row.is_keeper ? '<span class="badge badge-success">남길 대표</span>' : '<span class="badge badge-warning">삭제 후보</span>'}</td>
            </tr>`;
        }).join('');
        panel.innerHTML = `
            <div class="d-flex flex-wrap gap-2 mb-2">
                <button class="btn btn-secondary" onclick="Settings.selectAllDuplicateCandidates(true)"><i class="fas fa-check-square"></i> 중복 전체 선택</button>
                <button class="btn btn-secondary" onclick="Settings.selectAllDuplicateCandidates(false)"><i class="fas fa-square"></i> 선택 해제</button>
                <button class="btn btn-danger" id="deleteSelectedDuplicatesButton" onclick="Settings.deleteSelectedDuplicates()"><i class="fas fa-trash"></i> 선택 삭제</button>
            </div>
            <p class="text-muted">각 중복 묶음에서 가장 먼저 등록된 대표 1개는 보호되며 선택할 수 없습니다.</p>
            <div style="overflow-x:auto;"><table class="table"><thead><tr><th>선택</th><th>종류</th><th>자료</th><th>엄격 비교 기준</th><th>처리</th></tr></thead><tbody>${htmlRows}</tbody></table></div>`;
    },

    selectAllDuplicateCandidates(checked) {
        document.querySelectorAll('.strict-duplicate-checkbox:not(:disabled)').forEach(box => {
            box.checked = Boolean(checked);
        });
    },

    async deleteSelectedDuplicates() {
        const selected = [...document.querySelectorAll('.strict-duplicate-checkbox:checked:not(:disabled)')];
        if (selected.length === 0) {
            App.flash('삭제할 중복자료를 선택하세요.', 'warning');
            return;
        }
        if (!confirm(`선택한 중복자료 ${selected.length}건을 삭제하고 대표 기록에 연결하시겠습니까?`)) return;
        const ids = { customer: [], product: [], sale: [] };
        selected.forEach(box => ids[box.dataset.entity]?.push(box.dataset.id));
        const button = document.getElementById('deleteSelectedDuplicatesButton');
        if (button) button.disabled = true;
        try {
            const { client, storeId } = await this._getDuplicateContext();
            const result = await client.rpc('delete_strict_duplicates', {
                p_store_id: storeId,
                p_customer_ids: ids.customer,
                p_product_ids: ids.product,
                p_order_ids: ids.sale
            });
            if (result.error) throw new Error(result.error.message || '선택 삭제 실패');
            this._showDuplicateResult(result.data || {});
            await this.loadDuplicateReview();
        } catch (e) {
            App.flash(e.message || '선택 삭제 실패', 'error');
        } finally {
            if (button) button.disabled = false;
        }
    },

    _showDuplicateResult(data) {
        const message = `정리 완료: 고객 ${data.customers_deleted || 0}명, 상품 ${data.products_deleted || 0}개, 판매 ${data.sales_deleted || 0}건 삭제`;
        const output = document.getElementById('duplicateCleanupResult');
        if (output) output.textContent = message;
        App.flash(message, 'success');
    },

    async cleanupAllDuplicates() {
        if (!confirm('엄격한 중복 기준으로 각 묶음의 대표 1개만 남기고 나머지를 모두 삭제합니다. 계속하시겠습니까?')) return;
        const button = document.getElementById('cleanupDuplicatesButton');
        if (button) button.disabled = true;
        try {
            const { client, storeId } = await this._getDuplicateContext();
            const result = await client.rpc('cleanup_strict_duplicates', { p_store_id: storeId });
            if (result.error) throw new Error(result.error.message || '중복 정리 실패');
            this._showDuplicateResult(result.data || {});
            this._duplicateRows = [];
            this.renderDuplicateReview();
        } catch (e) {
            App.flash(e.message || '중복 정리 실패', 'error');
        } finally {
            if (button) button.disabled = false;
        }
    },

    exportData() {
        const data = DB.exportAllData();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `LESSOUL_backup_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        App.flash(t('excel', 'export_success'), 'success');
    },

    importData(input) {
        if (!input.files || !input.files[0]) return;
        if (!confirm(t('settings', 'restore_warning'))) {
            input.value = '';
            return;
        }
        const file = input.files[0];
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = JSON.parse(e.target.result);
                DB.importAllData(data);
                App.flash(t('excel', 'import_success'), 'success');
                setTimeout(() => location.reload(), 800);
            } catch (err) {
                App.flash(err.message, 'error');
            }
        };
        reader.readAsText(file);
    }
};
