// 3-7D: Products List/Table Premium Polish Contract
// Verifies products screen table, thumb, badges, and form controls
// remain on premium boutique tone. CSS-only change scope.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

const CSS_PATH = join(rootDir, 'css', 'style.css');
const INDEX_PATH = join(rootDir, 'index.html');

function readFile(p) {
    return readFileSync(p, 'utf-8');
}

describe('3-7D Products List/Table Premium Contract', function () {
    const css = readFile(CSS_PATH);

    describe('product thumb premium tone', function () {
        it('PC1: .product-thumb selector exists', function () {
            assert.match(css, /\.product-thumb\s*\{/, '.product-thumb selector must exist');
        });

        it('PC2: .product-thumb uses var(--border-color) or premium border', function () {
            const block = css.match(/\.product-thumb\s*\{([^}]*)\}/);
            assert.ok(block, '.product-thumb block must exist');
            const hasBorder = /var\(--border-color\)|var\(--gray-200\)/.test(block[1]);
            assert.ok(hasBorder, '.product-thumb must use premium border token');
        });

        it('PC3: .product-thumb has border-radius', function () {
            const block = css.match(/\.product-thumb\s*\{([^}]*)\}/);
            assert.ok(block, '.product-thumb block must exist');
            assert.match(block[1], /border-radius:\s*\d+px/, '.product-thumb must have border-radius');
        });

        it('PC4: .product-thumb has background token', function () {
            const block = css.match(/\.product-thumb\s*\{([^}]*)\}/);
            assert.ok(block, '.product-thumb block must exist');
            assert.match(block[1], /var\(--gray-100\)|var\(--gray-50\)/, '.product-thumb must have warm background');
        });
    });

    describe('table premium tone', function () {
        it('PC5: .table thead uses var(--gray-100)', function () {
            const block = css.match(/\.table\s+thead\s*\{([^}]*)\}/);
            assert.ok(block, '.table thead block must exist');
            assert.match(block[1], /var\(--gray-100\)/, '.table thead must use var(--gray-100)');
        });

        it('PC6: .table th uses var(--gray-700)', function () {
            const block = css.match(/\.table\s+th\s*\{([^}]*)\}/);
            assert.ok(block, '.table th block must exist');
            assert.match(block[1], /var\(--gray-700\)/, '.table th must use var(--gray-700)');
        });

        it('PC7: .table td uses var(--gray-700) or var(--gray-800)', function () {
            const block = css.match(/\.table\s+td\s*\{([^}]*)\}/);
            assert.ok(block, '.table td block must exist');
            assert.match(block[1], /var\(--gray-700\)|var\(--gray-800\)/, '.table td must use warm gray token');
        });

        it('PC8: .table tbody tr:hover uses rgba (not raw gray-50 hex)', function () {
            const block = css.match(/\.table\s+tbody\s+tr:hover\s*\{([^}]*)\}/);
            assert.ok(block, '.table tbody tr:hover block must exist');
            // 3-7D: subtle beige hover (rgba brown) OR warm var(--gray-50) acceptable
            assert.match(block[1], /rgba\(|var\(--gray-50\)/, '.table hover must use rgba or warm token');
        });

        it('PC9: .table th:hover uses var(--primary)', function () {
            const block = css.match(/\.table\s+th:hover\s*\{([^}]*)\}/);
            assert.ok(block, '.table th:hover block must exist');
            assert.match(block[1], /var\(--primary\)/, '.table th:hover must use var(--primary)');
        });
    });

    describe('classification badge premium tone', function () {
        it('PC10: .classification-badge selector exists', function () {
            assert.match(css, /\.classification-badge\s*\{/, '.classification-badge selector must exist');
        });

        it('PC11: .classification-badge.category uses rgba brown', function () {
            const block = css.match(/\.classification-badge\.category\s*\{([^}]*)\}/);
            assert.ok(block, '.classification-badge.category block must exist');
            assert.match(block[1], /rgba\(139,\s*115,\s*85/, 'category badge must use muted brown rgba');
        });

        it('PC12: .classification-badge.color uses rgba terracotta', function () {
            const block = css.match(/\.classification-badge\.color\s*\{([^}]*)\}/);
            assert.ok(block, '.classification-badge.color block must exist');
            assert.match(block[1], /rgba\(160,\s*86,\s*60/, 'color badge must use muted terracotta rgba');
        });

        it('PC13: .classification-badge.size uses rgba sage', function () {
            const block = css.match(/\.classification-badge\.size\s*\{([^}]*)\}/);
            assert.ok(block, '.classification-badge.size block must exist');
            assert.match(block[1], /rgba\(107,\s*142,\s*90/, 'size badge must use muted sage rgba');
        });

        it('PC14: .classification-badge.unclassified uses warm gray tokens', function () {
            const block = css.match(/\.classification-badge\.unclassified\s*\{([^}]*)\}/);
            assert.ok(block, '.classification-badge.unclassified block must exist');
            assert.match(block[1], /var\(--gray-100\)/, 'unclassified badge must use warm gray token');
        });
    });

    describe('badge status premium tone', function () {
        it('PC15: .badge-pending uses rgba (not raw hex)', function () {
            const block = css.match(/\.badge-pending\s*\{([^}]*)\}/);
            assert.ok(block, '.badge-pending block must exist');
            assert.match(block[1], /rgba\(/, '.badge-pending must use rgba');
        });

        it('PC16: .badge-completed uses rgba', function () {
            const block = css.match(/\.badge-completed\s*\{([^}]*)\}/);
            assert.ok(block, '.badge-completed block must exist');
            assert.match(block[1], /rgba\(/, '.badge-completed must use rgba');
        });

        it('PC17: .badge-low uses terracotta rgba', function () {
            const block = css.match(/\.badge-low\s*\{([^}]*)\}/);
            assert.ok(block, '.badge-low block must exist');
            assert.match(block[1], /rgba\(160,\s*86,\s*60/, '.badge-low must use terracotta rgba');
        });
    });

    describe('checkbox premium accent', function () {
        it('PC18: .row-checkbox / .select-all-cb have accent-color', function () {
            const block = css.match(/\.row-checkbox,\s*\.select-all-cb\s*\{([^}]*)\}/);
            assert.ok(block, 'row-checkbox/select-all-cb block must exist');
            assert.match(block[1], /accent-color:\s*var\(--primary\)/, 'checkboxes must use var(--primary) accent');
        });

        it('PC19: .checkbox-wrapper input has accent-color', function () {
            const block = css.match(/\.checkbox-wrapper\s+input\[type="checkbox"\]\s*\{([^}]*)\}/);
            assert.ok(block, '.checkbox-wrapper input block must exist');
            assert.match(block[1], /accent-color:\s*var\(--primary\)/, 'checkbox-wrapper input must use var(--primary) accent');
        });
    });

    describe('empty-state premium tone', function () {
        it('PC20: .empty-state i uses var(--primary)', function () {
            const block = css.match(/\.empty-state\s+i\s*\{([^}]*)\}/);
            assert.ok(block, '.empty-state i block must exist');
            assert.match(block[1], /var\(--primary\)/, '.empty-state i must use var(--primary)');
        });
    });

    describe('tab-btn premium tone', function () {
        it('PC21: .tab-btn.active uses var(--primary) border', function () {
            const block = css.match(/\.tab-btn\.active\s*\{([^}]*)\}/);
            assert.ok(block, '.tab-btn.active block must exist');
            assert.match(block[1], /var\(--primary\)/, '.tab-btn.active must use var(--primary)');
        });

        it('PC22: .tab-btn:hover uses var(--primary-dark)', function () {
            const block = css.match(/\.tab-btn:hover\s*\{([^}]*)\}/);
            assert.ok(block, '.tab-btn:hover block must exist');
            assert.match(block[1], /var\(--primary-dark\)/, '.tab-btn:hover must use var(--primary-dark)');
        });
    });

    describe('legacy blue/purple purge (products scope)', function () {
        it('PC23: css/style.css does not contain #667eea', function () {
            assert.doesNotMatch(css, /#667eea/i, 'css must not contain legacy #667eea');
        });

        it('PC24: css/style.css does not contain #764ba2', function () {
            assert.doesNotMatch(css, /#764ba2/i, 'css must not contain legacy #764ba2');
        });

        it('PC25: css/style.css does not contain rgba(102,126,234', function () {
            assert.doesNotMatch(css, /rgba\(102,\s*126,\s*234/, 'css must not contain legacy blue rgba');
        });

        it('PC26: css/style.css does not contain rgba(118,75,162', function () {
            assert.doesNotMatch(css, /rgba\(118,\s*75,\s*162/, 'css must not contain legacy purple rgba');
        });
    });

    describe('products HTML contract (index.html untouched)', function () {
        const html = readFile(INDEX_PATH);

        it('PC27: index.html still loads css/style.css', function () {
            assert.match(html, /href="css\/style\.css/, 'css/style.css link must exist');
        });

        it('PC28: index.html still loads js/products.js', function () {
            assert.match(html, /src="js\/products\.js/, 'js/products.js script tag must exist');
        });

        it('PC29: index.html still loads js/app.js', function () {
            assert.match(html, /src="js\/app\.js/, 'js/app.js script tag must exist');
        });
    });

    describe('sensitive data safety', function () {
        it('PC30: css/style.css must not contain JWT-like tokens', function () {
            assert.doesNotMatch(css, /eyJ[A-Za-z0-9_-]{20,}/, 'css must not contain JWT-like tokens');
        });

        it('PC31: css/style.css must not contain service_role key patterns', function () {
            assert.doesNotMatch(css, /service_role/i, 'css must not contain service_role keyword');
        });
    });
});
