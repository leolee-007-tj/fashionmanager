// 3-7C: Dashboard Premium Cards Polish Contract
// Verifies dashboard KPI cards, chart containers, and typography
// remain on premium boutique tone. CSS-only change scope.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

const CSS_PATH = join(rootDir, 'css', 'style.css');

function readFile(p) {
    return readFileSync(p, 'utf-8');
}

describe('3-7C Dashboard Premium Cards Contract', function () {
    const css = readFile(CSS_PATH);

    describe('KPI stat-card premium tone', function () {
        it('DC1: .stat-card selector exists', function () {
            assert.match(css, /\.stat-card\s*\{/, '.stat-card selector must exist');
        });

        it('DC2: .stat-card uses var(--white) background', function () {
            const block = css.match(/\.stat-card\s*\{([^}]*)\}/);
            assert.ok(block, '.stat-card block must exist');
            assert.match(block[1], /var\(--white\)/, '.stat-card must use var(--white)');
        });

        it('DC3: .stat-card has border or shadow', function () {
            const block = css.match(/\.stat-card\s*\{([^}]*)\}/);
            assert.ok(block, '.stat-card block must exist');
            const hasBorder = /border:\s*1px solid/.test(block[1]);
            const hasShadow = /box-shadow:/.test(block[1]);
            assert.ok(hasBorder || hasShadow, '.stat-card must have border or shadow');
        });

        it('DC4: .stat-card::before uses muted brown accent', function () {
            const block = css.match(/\.stat-card::before\s*\{([^}]*)\}/);
            assert.ok(block, '.stat-card::before block must exist');
            assert.match(block[1], /var\(--primary\)/, '.stat-card::before must use var(--primary)');
        });

        it('DC5: .stat-card .stat-value uses soft charcoal', function () {
            const block = css.match(/\.stat-card\s+\.stat-value\s*\{([^}]*)\}/);
            assert.ok(block, '.stat-card .stat-value block must exist');
            assert.match(block[1], /var\(--gray-800\)/, '.stat-value must use var(--gray-800)');
        });

        it('DC6: .stat-card .stat-icon uses muted brown tint', function () {
            const block = css.match(/\.stat-card\s+\.stat-icon\s*\{([^}]*)\}/);
            assert.ok(block, '.stat-card .stat-icon block must exist');
            assert.match(block[1], /var\(--primary\)/, '.stat-icon must use var(--primary)');
        });

        it('DC7: .stat-card .stat-label uses warm gray', function () {
            const block = css.match(/\.stat-card\s+\.stat-label\s*\{([^}]*)\}/);
            assert.ok(block, '.stat-card .stat-label block must exist');
            assert.match(block[1], /var\(--gray-500\)/, '.stat-label must use var(--gray-500)');
        });
    });

    describe('chart-container premium tone', function () {
        it('DC8: .chart-container selector exists', function () {
            assert.match(css, /\.chart-container\s*\{/, '.chart-container selector must exist');
        });

        it('DC9: .chart-container uses var(--white)', function () {
            const block = css.match(/\.chart-container\s*\{([^}]*)\}/);
            assert.ok(block, '.chart-container block must exist');
            assert.match(block[1], /var\(--white\)/, '.chart-container must use var(--white)');
        });

        it('DC10: .chart-container has border', function () {
            const block = css.match(/\.chart-container\s*\{([^}]*)\}/);
            assert.ok(block, '.chart-container block must exist');
            assert.match(block[1], /border:\s*1px solid/, '.chart-container must have border');
        });

        it('DC11: .chart-container h3 uses warm gray', function () {
            const block = css.match(/\.chart-container\s+h3\s*\{([^}]*)\}/);
            assert.ok(block, '.chart-container h3 block must exist');
            assert.match(block[1], /var\(--gray-700\)/, '.chart-container h3 must use var(--gray-700)');
        });
    });

    describe('card typography hierarchy', function () {
        it('DC12: .card h2 uses var(--gray-800)', function () {
            const block = css.match(/\.card\s+h2\s*\{([^}]*)\}/);
            assert.ok(block, '.card h2 block must exist');
            assert.match(block[1], /var\(--gray-800\)/, '.card h2 must use var(--gray-800)');
        });

        it('DC13: .card h3 uses var(--gray-700)', function () {
            const block = css.match(/\.card\s+h3\s*\{([^}]*)\}/);
            assert.ok(block, '.card h3 block must exist');
            assert.match(block[1], /var\(--gray-700\)/, '.card h3 must use var(--gray-700)');
        });

        it('DC14: .card h2 i uses var(--primary)', function () {
            const block = css.match(/\.card\s+h2\s+i\s*\{([^}]*)\}/);
            assert.ok(block, '.card h2 i block must exist');
            assert.match(block[1], /var\(--primary\)/, '.card h2 i must use var(--primary)');
        });
    });

    describe('legacy blue/purple purged from core theme', function () {
        it('DC15: css/style.css does not contain #667eea', function () {
            assert.doesNotMatch(css, /#667eea/i, 'css must not contain legacy #667eea');
        });

        it('DC16: css/style.css does not contain #764ba2', function () {
            assert.doesNotMatch(css, /#764ba2/i, 'css must not contain legacy #764ba2');
        });

        it('DC17: css/style.css does not contain rgba(102,126,234', function () {
            assert.doesNotMatch(css, /rgba\(102,\s*126,\s*234/, 'css must not contain legacy blue rgba');
        });

        it('DC18: css/style.css does not contain rgba(118,75,162', function () {
            assert.doesNotMatch(css, /rgba\(118,\s*75,\s*162/, 'css must not contain legacy purple rgba');
        });
    });

    describe('badge / flash premium tone', function () {
        it('DC19: .badge-pending uses rgba (not raw hex)', function () {
            const line = css.match(/\.badge-pending\s*\{([^}]*)\}/);
            assert.ok(line, '.badge-pending must exist');
            assert.match(line[1], /rgba\(/, '.badge-pending must use rgba tone');
        });

        it('DC20: .badge-completed uses rgba (not raw hex)', function () {
            const line = css.match(/\.badge-completed\s*\{([^}]*)\}/);
            assert.ok(line, '.badge-completed must exist');
            assert.match(line[1], /rgba\(/, '.badge-completed must use rgba tone');
        });

        it('DC21: .flash-success uses rgba', function () {
            const line = css.match(/\.flash-success\s*\{([^}]*)\}/);
            assert.ok(line, '.flash-success must exist');
            assert.match(line[1], /rgba\(/, '.flash-success must use rgba tone');
        });

        it('DC22: .flash-error uses rgba', function () {
            const line = css.match(/\.flash-error\s*\{([^}]*)\}/);
            assert.ok(line, '.flash-error must exist');
            assert.match(line[1], /rgba\(/, '.flash-error must use rgba tone');
        });
    });

    describe('dashboard responsive contract preserved', function () {
        it('DC23: .stats-grid responsive rule at 768px preserved', function () {
            assert.match(css, /@media\s*\(max-width:\s*768px\)[^@]*\.stats-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*1fr\)/, 'stats-grid 768px 2-col rule must be preserved');
        });

        it('DC24: .stats-grid responsive rule at 480px preserved', function () {
            assert.match(css, /@media\s*\(max-width:\s*480px\)[^@]*\.stats-grid\s*\{[^}]*grid-template-columns:\s*1fr/, 'stats-grid 480px 1-col rule must be preserved');
        });
    });

    describe('sensitive data safety', function () {
        it('DC25: css/style.css must not contain JWT-like tokens', function () {
            assert.doesNotMatch(css, /eyJ[A-Za-z0-9_-]{20,}/, 'css must not contain JWT-like tokens');
        });

        it('DC26: css/style.css must not contain service_role key patterns', function () {
            assert.doesNotMatch(css, /service_role/i, 'css must not contain service_role keyword');
        });
    });
});
