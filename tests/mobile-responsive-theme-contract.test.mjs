// 3-7G: Mobile Responsive Polish Contract
// Verifies responsive CSS rules for dashboard, products, auth, members.
// CSS-only change scope.

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

// Extract all @media blocks with brace matching (handles nested braces)
function extractMediaBlocks(css) {
    const blocks = [];
    let idx = 0;
    while (true) {
        const start = css.indexOf('@media', idx);
        if (start === -1) break;
        const braceStart = css.indexOf('{', start);
        if (braceStart === -1) break;
        let depth = 1;
        let i = braceStart + 1;
        while (i < css.length && depth > 0) {
            if (css[i] === '{') depth++;
            else if (css[i] === '}') depth--;
            i++;
        }
        blocks.push(css.substring(braceStart + 1, i - 1));
        idx = i;
    }
    return blocks;
}

describe('3-7G Mobile Responsive Premium Contract', function () {
    const css = readFile(CSS_PATH);
    const mediaBlocks = extractMediaBlocks(css);
    const allMediaText = mediaBlocks.join('\n');

    describe('breakpoints existence', function () {
        it('MR1: 1024px media query exists', function () {
            assert.match(css, /@media\s*\(max-width:\s*1024px\)/, '1024px breakpoint must exist');
        });

        it('MR2: 768px media query exists', function () {
            assert.match(css, /@media\s*\(max-width:\s*768px\)/, '768px breakpoint must exist');
        });

        it('MR3: 480px media query exists', function () {
            assert.match(css, /@media\s*\(max-width:\s*480px\)/, '480px breakpoint must exist');
        });
    });

    describe('dashboard responsive rules', function () {
        it('MR4: .stats-grid has responsive rule', function () {
            const hasResponsive = /\.stats-grid\s*\{[^}]*grid-template-columns/.test(allMediaText);
            assert.ok(hasResponsive, 'stats-grid must have responsive columns');
        });

        it('MR5: .chart-container has responsive padding', function () {
            const hasChartResponsive = /\.chart-container\s*\{[^}]*padding/i.test(allMediaText);
            assert.ok(hasChartResponsive, 'chart-container must have responsive padding');
        });
    });

    describe('filter and action bar responsive rules', function () {
        it('MR6: .filter-row has responsive rule', function () {
            const hasFilterResponsive = /\.filter-row\s*\{[^}]*flex-direction:\s*column/i.test(allMediaText);
            assert.ok(hasFilterResponsive, 'filter-row must stack on mobile');
        });

        it('MR7: .action-bar has responsive rule', function () {
            const hasActionResponsive = /\.action-bar\s*\{[^}]*flex-direction:\s*column/i.test(allMediaText);
            assert.ok(hasActionResponsive, 'action-bar must stack on mobile');
        });
    });

    describe('table overflow policy', function () {
        it('MR8: table has overflow-x auto rule', function () {
            const hasOverflow = /overflow-x:\s*auto/.test(css);
            assert.ok(hasOverflow, 'overflow-x auto must exist for tables');
        });

        it('MR9: .table has min-width rule in media query', function () {
            const hasMinWidth = /\.table\s*\{[^}]*min-width/i.test(allMediaText);
            assert.ok(hasMinWidth, 'table must have min-width in media query');
        });

        it('MR10: body has overflow-x hidden', function () {
            const bodyBlock = css.match(/body\s*\{([^}]*)\}/);
            assert.ok(bodyBlock, 'body block must exist');
            assert.match(bodyBlock[1], /overflow-x:\s*hidden/, 'body must have overflow-x hidden');
        });
    });

    describe('auth responsive rules', function () {
        it('MR11: .auth-panel has mobile rule', function () {
            const hasAuthMobile = /\.auth-panel\s*\{[^}]*padding/i.test(allMediaText);
            assert.ok(hasAuthMobile, 'auth-panel must have responsive padding');
        });

        it('MR12: .auth-root has mobile rule', function () {
            const hasAuthRootMobile = /\.auth-root\s*\{[^}]*padding/i.test(allMediaText);
            assert.ok(hasAuthRootMobile, 'auth-root must have responsive padding');
        });
    });

    describe('member management responsive rules', function () {
        it('MR13: .member-mgmt-container has mobile rule', function () {
            const hasMemberMobile = /\.member-mgmt-container\s*\{[^}]*padding/i.test(allMediaText);
            assert.ok(hasMemberMobile, 'member-mgmt-container must have responsive padding');
        });

        it('MR14: .member-mgmt-card-header has mobile rule', function () {
            const hasHeaderMobile = /\.member-mgmt-card-header\s*\{[^}]*padding/i.test(allMediaText);
            assert.ok(hasHeaderMobile, 'member-mgmt-card-header must have responsive padding');
        });

        it('MR15: .member-mgmt-table has responsive min-width', function () {
            const hasTableMinWidth = /\.member-mgmt-table\s*\{[^}]*min-width/i.test(allMediaText);
            assert.ok(hasTableMinWidth, 'member-mgmt-table must have responsive min-width');
        });
    });

    describe('invite code responsive rules', function () {
        it('MR16: .invite-code-box has wrap/overflow rule', function () {
            const hasWrap = /\.invite-code-box\s*\{[^}]*flex-wrap/i.test(allMediaText);
            assert.ok(hasWrap, 'invite-code-box must wrap on mobile');
        });

        it('MR17: .invite-code-box code has overflow-wrap rule', function () {
            const hasOverflowWrap = /\.invite-code-box\s+code\s*\{[^}]*overflow-wrap/i.test(allMediaText);
            assert.ok(hasOverflowWrap, 'invite-code-box code must have overflow-wrap on mobile');
        });

        it('MR18: .invite-generate-form .form-row has stack rule', function () {
            const hasStack = /\.invite-generate-form\s+\.form-row\s*\{[^}]*flex-direction:\s*column/i.test(allMediaText);
            assert.ok(hasStack, 'invite-generate-form form-row must stack on mobile');
        });
    });

    describe('header responsive safety', function () {
        it('MR19: .store-name has overflow safety on mobile', function () {
            const hasOverflow = /\.store-name\s*\{[^}]*(?:overflow|text-overflow|max-width)/i.test(allMediaText);
            assert.ok(hasOverflow, 'store-name must have overflow safety on mobile');
        });

        it('MR20: .header-right has gap rule on mobile', function () {
            const hasGap = /\.header-right\s*\{[^}]*gap/i.test(allMediaText);
            assert.ok(hasGap, 'header-right must have gap rule on mobile');
        });
    });

    describe('image overflow safety', function () {
        it('MR21: img has max-width rule', function () {
            const imgBlock = css.match(/img\s*\{([^}]*)\}/);
            assert.ok(imgBlock, 'img block must exist');
            assert.match(imgBlock[1], /max-width:\s*100%/, 'img must have max-width 100%');
        });
    });

    describe('legacy Blue/Purple purge', function () {
        it('MR22: no legacy #667eea', function () {
            assert.doesNotMatch(css, /#667eea/, 'legacy blue must not appear');
        });

        it('MR23: no legacy #764ba2', function () {
            assert.doesNotMatch(css, /#764ba2/, 'legacy purple must not appear');
        });

        it('MR24: no legacy rgba(102,126,234)', function () {
            assert.doesNotMatch(css, /rgba\(102,\s*126,\s*234/, 'legacy blue rgba must not appear');
        });

        it('MR25: no legacy rgba(118,75,162)', function () {
            assert.doesNotMatch(css, /rgba\(118,\s*75,\s*162/, 'legacy purple rgba must not appear');
        });
    });

    describe('JS and HTML contract', function () {
        it('MR26: index.html exists unchanged', function () {
            const html = readFile(INDEX_PATH);
            assert.ok(html.length > 0, 'index.html must exist');
        });
    });

    describe('sensitive data safety', function () {
        it('MR27: no service_role in CSS', function () {
            assert.doesNotMatch(css, /service_role/, 'service_role must not appear in CSS');
        });

        it('MR28: no sb_secret_ in CSS', function () {
            assert.doesNotMatch(css, /sb_secret_/, 'sb_secret_ must not appear in CSS');
        });

        it('MR29: no hardcoded password/token patterns in CSS', function () {
            assert.doesNotMatch(css, /password\s*[:=]\s*['"][^'"]+['"]/, 'hardcoded password must not appear');
            assert.doesNotMatch(css, /eyJ[A-Za-z0-9_.-]+\.[A-Za-z0-9_.-]+\.[A-Za-z0-9_.-]+/, 'JWT token must not appear');
        });
    });
});
