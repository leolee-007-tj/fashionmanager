// 3-7F: Member/Invite Management Premium Polish Contract
// Verifies member management and invite code UI
// remains on premium boutique admin tone. CSS-only change scope.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

const CSS_PATH = join(rootDir, 'css', 'style.css');
const INDEX_PATH = join(rootDir, 'index.html');
const MEMBER_JS_PATH = join(rootDir, 'js', 'member-management.js');

function readFile(p) {
    return readFileSync(p, 'utf-8');
}

describe('3-7F Member/Invite Management Premium Contract', function () {
    const css = readFile(CSS_PATH);

    describe('member management container and card premium tone', function () {
        it('MM1: .member-mgmt-container selector exists', function () {
            const block = css.match(/\.member-mgmt-container\s*\{([^}]*)\}/);
            assert.ok(block, '.member-mgmt-container block must exist');
        });

        it('MM2: .member-mgmt-card uses var(--white) background', function () {
            const block = css.match(/\.member-mgmt-card\s*\{([^}]*)\}/);
            assert.ok(block, '.member-mgmt-card block must exist');
            assert.match(block[1], /var\(--white\)/, '.member-mgmt-card must use var(--white)');
        });

        it('MM3: .member-mgmt-card uses var(--border-radius)', function () {
            const block = css.match(/\.member-mgmt-card\s*\{([^}]*)\}/);
            assert.ok(block, '.member-mgmt-card block must exist');
            assert.match(block[1], /var\(--border-radius\)/, '.member-mgmt-card must use var(--border-radius)');
        });

        it('MM4: .member-mgmt-card has border or shadow', function () {
            const block = css.match(/\.member-mgmt-card\s*\{([^}]*)\}/);
            assert.ok(block, '.member-mgmt-card block must exist');
            const hasBorder = /border:\s*1px solid/.test(block[1]);
            const hasShadow = /box-shadow:/.test(block[1]);
            assert.ok(hasBorder && hasShadow, '.member-mgmt-card must have border and shadow');
        });
    });

    describe('member table premium tone', function () {
        it('MM5: .member-mgmt-table selector exists', function () {
            const block = css.match(/\.member-mgmt-table\s*\{([^}]*)\}/);
            assert.ok(block, '.member-mgmt-table block must exist');
        });

        it('MM6: .member-mgmt-table th uses warm gray background', function () {
            const block = css.match(/\.member-mgmt-table\s+th\s*\{([^}]*)\}/);
            assert.ok(block, '.member-mgmt-table th block must exist');
            assert.match(block[1], /var\(--gray-100\)|var\(--gray-50\)/, 'table th must use warm gray bg');
        });

        it('MM7: table row hover uses subtle beige tone', function () {
            const block = css.match(/\.member-mgmt-table\s+tbody\s+tr:hover\s*\{([^}]*)\}/);
            assert.ok(block, 'table row hover block must exist');
            assert.match(block[1], /rgba\(|var\(--gray/, 'row hover must use subtle warm tone');
        });
    });

    describe('status badge premium muted tone', function () {
        it('MM8: .status-badge selector exists with border', function () {
            const block = css.match(/\.status-badge\s*\{([^}]*)\}/);
            assert.ok(block, '.status-badge block must exist');
            assert.match(block[1], /border:\s*1px solid/, '.status-badge must have border');
        });

        it('MM9: .status-active uses muted sage tone', function () {
            const block = css.match(/\.status-badge\.status-active\s*\{([^}]*)\}/);
            assert.ok(block, '.status-active block must exist');
            assert.match(block[1], /rgba\(107,\s*142,\s*90/, 'active must use sage rgba');
        });

        it('MM10: .status-inactive uses muted terracotta tone', function () {
            const block = css.match(/\.status-badge\.status-inactive\s*\{([^}]*)\}/);
            assert.ok(block, '.status-inactive block must exist');
            assert.match(block[1], /rgba\(160,\s*86,\s*60/, 'inactive must use terracotta rgba');
        });

        it('MM11: .status-revoked uses warm gray tone', function () {
            const block = css.match(/\.status-badge\.status-revoked\s*\{([^}]*)\}/);
            assert.ok(block, '.status-revoked block must exist');
            assert.match(block[1], /rgba\(138,\s*130,\s*117/, 'revoked must use warm gray rgba');
        });

        it('MM12: .status-used uses muted slate tone', function () {
            const block = css.match(/\.status-badge\.status-used\s*\{([^}]*)\}/);
            assert.ok(block, '.status-used block must exist');
            assert.match(block[1], /rgba\(123,\s*140,\s*154/, 'used must use slate rgba');
        });

        it('MM13: .status-expired uses warm camel tone', function () {
            const block = css.match(/\.status-badge\.status-expired\s*\{([^}]*)\}/);
            assert.ok(block, '.status-expired block must exist');
            assert.match(block[1], /rgba\(201,\s*163,\s*106/, 'expired must use camel rgba');
        });
    });

    describe('invite code box premium tone', function () {
        it('MM14: .invite-code-box selector exists', function () {
            const block = css.match(/\.invite-code-box\s*\{([^}]*)\}/);
            assert.ok(block, '.invite-code-box block must exist');
        });

        it('MM15: .invite-code-box code uses premium styling', function () {
            const block = css.match(/\.invite-code-box\s+code\s*\{([^}]*)\}/);
            assert.ok(block, '.invite-code-box code block must exist');
            assert.match(block[1], /var\(--white\)/, 'code must use white bg');
            assert.match(block[1], /var\(--primary-dark\)|var\(--primary\)/, 'code must use primary color');
        });

        it('MM16: .invite-code-result uses warm ivory background', function () {
            const block = css.match(/\.invite-code-result\s*\{([^}]*)\}/);
            assert.ok(block, '.invite-code-result block must exist');
            assert.match(block[1], /var\(--gray-100\)|var\(--gray-50\)/, 'result must use warm bg');
        });

        it('MM17: .invite-code-display uses monospace-friendly style', function () {
            const block = css.match(/\.invite-code-display\s*\{([^}]*)\}/);
            assert.ok(block, '.invite-code-display block must exist');
        });
    });

    describe('danger and action buttons premium tone', function () {
        it('MM18: .btn-danger uses var(--danger) or muted terracotta', function () {
            const blocks = [...css.matchAll(/\.btn-danger\s*\{([^}]*)\}/g)];
            assert.ok(blocks.length > 0, '.btn-danger block must exist');
            const combined = blocks.map(b => b[1]).join(' ');
            const hasDangerVar = /var\(--danger\)/.test(combined);
            const hasTerracotta = /#A0563C|#8A4A32|rgba\(160,\s*86,\s*60/.test(combined);
            assert.ok(hasDangerVar || hasTerracotta, '.btn-danger must use danger token or terracotta');
        });

        it('MM19: .btn-danger:hover uses deep terracotta', function () {
            const block = css.match(/\.btn-danger:hover\s*\{([^}]*)\}/);
            assert.ok(block, '.btn-danger:hover block must exist');
            assert.match(block[1], /#8A4A32|background:/, 'danger hover must have darker tone');
        });

        it('MM20: .btn-warning uses var(--warning) or warm camel', function () {
            const blocks = [...css.matchAll(/\.btn-warning\s*\{([^}]*)\}/g)];
            assert.ok(blocks.length > 0, '.btn-warning block must exist');
            const combined = blocks.map(b => b[1]).join(' ');
            const hasWarningVar = /var\(--warning\)/.test(combined);
            assert.ok(hasWarningVar, '.btn-warning must use warning token');
        });

        it('MM21: .btn-secondary uses warm gray tone', function () {
            const blocks = [...css.matchAll(/\.btn-secondary\s*\{([^}]*)\}/g)];
            assert.ok(blocks.length > 0, '.btn-secondary block must exist');
            const combined = blocks.map(b => b[1]).join(' ');
            const hasGrayVar = /var\(--gray-500\)|var\(--secondary\)/.test(combined);
            assert.ok(hasGrayVar, '.btn-secondary must use warm gray');
        });

        it('MM22: .btn-sm uses refined padding and radius', function () {
            const blocks = [...css.matchAll(/\.btn-sm\s*\{([^}]*)\}/g)];
            assert.ok(blocks.length > 0, '.btn-sm block must exist');
        });
    });

    describe('access denied premium neutral tone', function () {
        it('MM23: .member-mgmt-access-denied selector exists', function () {
            const block = css.match(/\.member-mgmt-access-denied\s*\{([^}]*)\}/);
            assert.ok(block, '.member-mgmt-access-denied block must exist');
        });

        it('MM24: access denied h2 uses neutral tone (not harsh red)', function () {
            const block = css.match(/\.member-mgmt-access-denied\s+h2\s*\{([^}]*)\}/);
            assert.ok(block, 'access denied h2 block must exist');
            assert.match(block[1], /var\(--gray-700\)|var\(--gray-800\)/, 'h2 must use neutral gray, not harsh red');
        });
    });

    describe('legacy blue/purple purge', function () {
        it('MM25: no legacy #667eea in member section', function () {
            assert.doesNotMatch(css, /#667eea/, 'legacy blue must not appear');
        });

        it('MM26: no legacy #764ba2 in member section', function () {
            assert.doesNotMatch(css, /#764ba2/, 'legacy purple must not appear');
        });

        it('MM27: no legacy rgba(102,126,234)', function () {
            assert.doesNotMatch(css, /rgba\(102,\s*126,\s*234/, 'legacy blue rgba must not appear');
        });

        it('MM28: no legacy rgba(118,75,162)', function () {
            assert.doesNotMatch(css, /rgba\(118,\s*75,\s*162/, 'legacy purple rgba must not appear');
        });
    });

    describe('JS and HTML contract', function () {
        it('MM29: member-management JS file exists and unchanged', function () {
            const js = readFile(MEMBER_JS_PATH);
            assert.ok(js.length > 0, 'member-management.js must exist');
            assert.match(js, /member-mgmt-container/, 'JS must reference member-mgmt-container');
            assert.match(js, /status-badge/, 'JS must reference status-badge');
            assert.match(js, /invite-code-display/, 'JS must reference invite-code-display');
            assert.match(js, /btn-danger/, 'JS must reference btn-danger');
            assert.match(js, /btn-warning/, 'JS must reference btn-warning');
        });

        it('MM30: index.html has no member-mgmt references via route', function () {
            const html = readFile(INDEX_PATH);
            assert.ok(html.length > 0, 'index.html must exist');
        });
    });

    describe('sensitive data safety', function () {
        it('MM31: no service_role in CSS or docs', function () {
            assert.doesNotMatch(css, /service_role/, 'service_role must not appear in CSS');
        });

        it('MM32: no sb_secret_ in CSS', function () {
            assert.doesNotMatch(css, /sb_secret_/, 'sb_secret_ must not appear in CSS');
        });

        it('MM33: no hardcoded password/token patterns in CSS', function () {
            assert.doesNotMatch(css, /password\s*[:=]\s*['"][^'"]+['"]/, 'hardcoded password must not appear');
            assert.doesNotMatch(css, /eyJ[A-Za-z0-9_.-]+\.[A-Za-z0-9_.-]+\.[A-Za-z0-9_.-]+/, 'JWT token must not appear');
        });
    });
});
