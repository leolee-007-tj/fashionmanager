const Settings = {
    render() {
        const s = DB.getSettings();
        const keywords = DB.getKeywords();
        const keywordTypes = { brand: t('classification', 'type_brand'), category: t('classification', 'type_category'), color: t('classification', 'type_color'), size: t('classification', 'type_size'), material: t('classification', 'type_material') };
        const storeName = s.store_name || 'LES SOUL';
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

    save() {
        const fd = new FormData(document.getElementById('settingsForm'));
        const settings = DB.getSettings();
        settings.exchange_divisor = parseFloat(fd.get('exchange_divisor')) || 10;
        settings.price_multiplier = parseFloat(fd.get('price_multiplier')) || 3;
        settings.fixed_addition = parseFloat(fd.get('fixed_addition')) || 40;
        const storeName = document.getElementById('storeName').value.trim() || 'LES SOUL';
        const storeSubtitle = document.getElementById('storeSubtitle').value.trim() || '매장 관리';
        settings.store_name = storeName;
        settings.store_subtitle = storeSubtitle;
        DB.setSettings(settings);
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
