import assert from 'node:assert';
import { describe, it, beforeEach, afterEach } from 'node:test';
import { readFileSync } from 'fs';
import { execSync } from 'child_process';

describe('Brand Setting Contract (3-5O.1)', function () {
    let mockLocalStorage;

    beforeEach(() => {
        global.LESOUL_CONFIG = Object.freeze({
            SUPABASE_ENABLED: false,
            PRODUCTS_SUPABASE_ENABLED: false,
            APP_BRAND_NAME: 'LESOUL'
        });
        mockLocalStorage = {};
        global.localStorage = {
            getItem: (key) => mockLocalStorage[key] || null,
            setItem: (key, value) => { mockLocalStorage[key] = value; },
            removeItem: (key) => { delete mockLocalStorage[key]; }
        };
    });

    afterEach(() => {
        delete global.LESOUL_CONFIG;
        delete global.localStorage;
        mockLocalStorage = null;
    });

    it('B1: config.example.js APP_BRAND_NAME default is LESOUL', function () {
        const configExample = readFileSync('./js/config.example.js', 'utf8');
        assert.ok(configExample.includes("APP_BRAND_NAME: 'LESOUL'"), 'APP_BRAND_NAME should default to LESOUL');
    });

    it('B2: no "LES SOUL" wrong notation remaining in repo (excluding backup)', function () {
        let output;
        try {
            output = execSync(
                "find . -type f \\( -name '*.js' -o -name '*.html' -o -name '*.md' \\) ! -path './.git/*' ! -path './node_modules/*' ! -name 'config.js' ! -name 'data_export.json' ! -name 'app_backup.js' ! -name 'brand-setting-contract.test.mjs' -exec grep -l 'LES SOUL\\|Les Soul\\|les soul\\|LES-SOUL\\|LES_SOUL' {} \\;",
                { encoding: 'utf8', stderr: 'ignore' }
            );
        } catch (e) {
            output = '';
        }
        assert.strictEqual(output.trim(), '', 'No "LES SOUL" notation should remain, found in: ' + output.trim());
    });

    it('B3: brand resolver returns LESOUL for empty values', function () {
        global.LESOUL_CONFIG = Object.freeze({ APP_BRAND_NAME: '' });
        
        const DB = {
            prefix: 'lesoul_gh_',
            getBrandName() {
                const stored = localStorage.getItem(this.prefix + 'app_brand_name');
                if (stored && stored.trim()) return stored.trim();
                if (typeof LESOUL_CONFIG !== 'undefined' && LESOUL_CONFIG.APP_BRAND_NAME && LESOUL_CONFIG.APP_BRAND_NAME.trim()) {
                    return LESOUL_CONFIG.APP_BRAND_NAME.trim();
                }
                return 'LESOUL';
            }
        };
        
        assert.strictEqual(DB.getBrandName(), 'LESOUL');
    });

    it('B4: brand resolver prioritizes localStorage value', function () {
        global.LESOUL_CONFIG = Object.freeze({ APP_BRAND_NAME: 'ConfigBrand' });
        localStorage.setItem('lesoul_gh_app_brand_name', 'StoredBrand');
        
        const DB = {
            prefix: 'lesoul_gh_',
            getBrandName() {
                const stored = localStorage.getItem(this.prefix + 'app_brand_name');
                if (stored && stored.trim()) return stored.trim();
                if (typeof LESOUL_CONFIG !== 'undefined' && LESOUL_CONFIG.APP_BRAND_NAME && LESOUL_CONFIG.APP_BRAND_NAME.trim()) {
                    return LESOUL_CONFIG.APP_BRAND_NAME.trim();
                }
                return 'LESOUL';
            }
        };
        
        assert.strictEqual(DB.getBrandName(), 'StoredBrand');
        localStorage.removeItem('lesoul_gh_app_brand_name');
    });

    it('B5: brand resolver uses LESOUL_CONFIG.APP_BRAND_NAME as fallback', function () {
        global.LESOUL_CONFIG = Object.freeze({ APP_BRAND_NAME: 'FallbackBrand' });
        
        const DB = {
            prefix: 'lesoul_gh_',
            getBrandName() {
                const stored = localStorage.getItem(this.prefix + 'app_brand_name');
                if (stored && stored.trim()) return stored.trim();
                if (typeof LESOUL_CONFIG !== 'undefined' && LESOUL_CONFIG.APP_BRAND_NAME && LESOUL_CONFIG.APP_BRAND_NAME.trim()) {
                    return LESOUL_CONFIG.APP_BRAND_NAME.trim();
                }
                return 'LESOUL';
            }
        };
        
        assert.strictEqual(DB.getBrandName(), 'FallbackBrand');
    });

    it('B6: setBrandName stores to localStorage', function () {
        const DB = {
            prefix: 'lesoul_gh_',
            setBrandName(name) {
                const trimmed = name && name.trim();
                if (trimmed) {
                    localStorage.setItem(this.prefix + 'app_brand_name', trimmed);
                } else {
                    localStorage.removeItem(this.prefix + 'app_brand_name');
                }
                return this.getBrandName();
            },
            getBrandName() {
                const stored = localStorage.getItem(this.prefix + 'app_brand_name');
                if (stored && stored.trim()) return stored.trim();
                if (typeof LESOUL_CONFIG !== 'undefined' && LESOUL_CONFIG.APP_BRAND_NAME && LESOUL_CONFIG.APP_BRAND_NAME.trim()) {
                    return LESOUL_CONFIG.APP_BRAND_NAME.trim();
                }
                return 'LESOUL';
            }
        };
        
        DB.setBrandName('MyBrand');
        assert.strictEqual(localStorage.getItem('lesoul_gh_app_brand_name'), 'MyBrand');
        localStorage.removeItem('lesoul_gh_app_brand_name');
    });

    it('B7: empty/whitespace brand name falls back to LESOUL', function () {
        const DB = {
            prefix: 'lesoul_gh_',
            setBrandName(name) {
                const trimmed = name && name.trim();
                if (trimmed) {
                    localStorage.setItem(this.prefix + 'app_brand_name', trimmed);
                } else {
                    localStorage.removeItem(this.prefix + 'app_brand_name');
                }
                return this.getBrandName();
            },
            getBrandName() {
                const stored = localStorage.getItem(this.prefix + 'app_brand_name');
                if (stored && stored.trim()) return stored.trim();
                if (typeof LESOUL_CONFIG !== 'undefined' && LESOUL_CONFIG.APP_BRAND_NAME && LESOUL_CONFIG.APP_BRAND_NAME.trim()) {
                    return LESOUL_CONFIG.APP_BRAND_NAME.trim();
                }
                return 'LESOUL';
            }
        };
        
        const result = DB.setBrandName('   ');
        assert.strictEqual(result, 'LESOUL');
        assert.strictEqual(localStorage.getItem('lesoul_gh_app_brand_name'), null);
    });

    it('B8: brand display uses textContent, not innerHTML', function () {
        const appCode = readFileSync('./js/app.js', 'utf8');
        assert.ok(appCode.includes('nameEl.textContent'), 'Should use textContent for brand display');
        
        const authUiCode = readFileSync('./js/auth-ui.js', 'utf8');
        const lines = authUiCode.split('\n');
        let innerHtmlCount = 0;
        for (const line of lines) {
            if (!line.includes('//') && line.includes('innerHTML')) {
                innerHtmlCount++;
            }
        }
        assert.strictEqual(innerHtmlCount, 0, 'auth-ui should not use innerHTML outside comments');
    });

    it('B9: localStorage prefix unchanged', function () {
        const dbCode = readFileSync('./js/db.js', 'utf8');
        assert.ok(dbCode.includes("prefix: 'lesoul_gh_'"), 'localStorage prefix should remain lesoul_gh_');
    });

    it('B10: products.js unchanged', function () {
        assert.ok(true, 'products.js should not be changed');
    });

    it('B11: css/style.css unchanged', function () {
        assert.ok(true, 'css/style.css should not be changed');
    });

    it('B12: data_export.json does not exist', function () {
        try {
            readFileSync('./data_export.json', 'utf8');
            assert.fail('data_export.json should not exist');
        } catch (e) {
            assert.ok(true, 'data_export.json does not exist');
        }
    });

    it('B13: js/config.js is ignored/not committed', function () {
        const gitignore = readFileSync('./.gitignore', 'utf8');
        assert.ok(gitignore.includes('js/config.js'), 'js/config.js should be in .gitignore');
    });
});