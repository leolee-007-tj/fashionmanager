// 3-7E: Auth/Onboarding Premium Polish Contract
// Verifies auth screen and onboarding/invite flow UI
// remains on premium boutique tone. CSS-only change scope.

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

describe('3-7E Auth/Onboarding Premium Contract', function () {
    const css = readFile(CSS_PATH);

    describe('auth root and panel premium tone', function () {
        it('AO1: .auth-root selector exists with brown gradient', function () {
            const block = css.match(/\.auth-root\s*\{([^}]*)\}/);
            assert.ok(block, '.auth-root block must exist');
            assert.match(block[1], /linear-gradient/, '.auth-root must use gradient');
            assert.match(block[1], /#8B7355|#6A5641/, '.auth-root must use muted brown gradient');
        });

        it('AO2: .auth-panel uses var(--white) background', function () {
            const block = css.match(/\.auth-panel\s*\{([^}]*)\}/);
            assert.ok(block, '.auth-panel block must exist');
            assert.match(block[1], /var\(--white\)/, '.auth-panel must use var(--white)');
        });

        it('AO3: .auth-panel has border or refined shadow', function () {
            const block = css.match(/\.auth-panel\s*\{([^}]*)\}/);
            assert.ok(block, '.auth-panel block must exist');
            const hasBorder = /border:\s*1px solid/.test(block[1]);
            const hasShadow = /box-shadow:/.test(block[1]);
            assert.ok(hasBorder || hasShadow, '.auth-panel must have border or shadow');
        });

        it('AO4: .auth-logo uses brown gradient text', function () {
            const block = css.match(/\.auth-logo\s*\{([^}]*)\}/);
            assert.ok(block, '.auth-logo block must exist');
            assert.match(block[1], /#8B7355|#6A5641/, '.auth-logo must use brown gradient');
        });
    });

    describe('auth input premium tone', function () {
        it('AO5: .auth-input uses var(--white) background', function () {
            const block = css.match(/\.auth-input\s*\{([^}]*)\}/);
            assert.ok(block, '.auth-input block must exist');
            assert.match(block[1], /var\(--white\)/, '.auth-input must use var(--white)');
        });

        it('AO6: .auth-input has border with warm gray token', function () {
            const block = css.match(/\.auth-input\s*\{([^}]*)\}/);
            assert.ok(block, '.auth-input block must exist');
            assert.match(block[1], /var\(--gray-300\)/, '.auth-input must use warm gray border');
        });

        it('AO7: .auth-input:focus uses muted brown rgba', function () {
            const block = css.match(/\.auth-input:focus(?:,\s*\.auth-input:focus-visible)?\s*\{([^}]*)\}/);
            assert.ok(block, '.auth-input:focus block must exist');
            assert.match(block[1], /rgba\(139,\s*115,\s*85/, '.auth-input:focus must use brown rgba');
        });
    });

    describe('auth button premium tone', function () {
        it('AO8: .auth-button uses var(--primary) background', function () {
            const block = css.match(/\.auth-button\s*\{([^}]*)\}/);
            assert.ok(block, '.auth-button block must exist');
            assert.match(block[1], /var\(--primary\)/, '.auth-button must use var(--primary)');
        });

        it('AO9: .auth-button:hover uses var(--primary-dark)', function () {
            const block = css.match(/\.auth-button:hover:not\(:disabled\)\s*\{([^}]*)\}/);
            assert.ok(block, '.auth-button:hover block must exist');
            assert.match(block[1], /var\(--primary-dark\)/, '.auth-button:hover must use var(--primary-dark)');
        });

        it('AO10: .auth-button has var(--white) text color', function () {
            const block = css.match(/\.auth-button\s*\{([^}]*)\}/);
            assert.ok(block, '.auth-button block must exist');
            assert.match(block[1], /var\(--white\)/, '.auth-button must use var(--white) text');
        });

        it('AO11: .auth-button-secondary uses var(--gray-100)', function () {
            const block = css.match(/\.auth-button-secondary\s*\{([^}]*)\}/);
            assert.ok(block, '.auth-button-secondary block must exist');
            assert.match(block[1], /var\(--gray-100\)/, '.auth-button-secondary must use var(--gray-100)');
        });
    });

    describe('auth error and store option premium tone', function () {
        it('AO12: .auth-error uses terracotta rgba', function () {
            const block = css.match(/\.auth-error\s*\{([^}]*)\}/);
            assert.ok(block, '.auth-error block must exist');
            assert.match(block[1], /rgba\(160,\s*86,\s*60/, '.auth-error must use terracotta rgba');
        });

        it('AO13: .auth-store-option uses var(--gray-100) background', function () {
            const block = css.match(/\.auth-store-option\s*\{([^}]*)\}/);
            assert.ok(block, '.auth-store-option block must exist');
            assert.match(block[1], /var\(--gray-100\)/, '.auth-store-option must use var(--gray-100)');
        });

        it('AO14: .auth-store-option:hover uses brown rgba', function () {
            const block = css.match(/\.auth-store-option:hover(?:,\s*\.auth-store-option:focus-visible)?\s*\{([^}]*)\}/);
            assert.ok(block, '.auth-store-option:hover block must exist');
            assert.match(block[1], /rgba\(139,\s*115,\s*85/, '.auth-store-option:hover must use brown rgba');
        });
    });

    describe('auth context badge and logout premium tone', function () {
        it('AO15: .auth-context-badge uses warm brown tint', function () {
            const block = css.match(/\.auth-context-badge\s*\{([^}]*)\}/);
            assert.ok(block, '.auth-context-badge block must exist');
            assert.match(block[1], /rgba\(139,\s*115,\s*85/, '.auth-context-badge must use brown tint');
        });

        it('AO16: .auth-logout-button uses warm gray outline', function () {
            const block = css.match(/\.auth-logout-button\s*\{([^}]*)\}/);
            assert.ok(block, '.auth-logout-button block must exist');
            const hasBorder = /border:\s*1px solid/.test(block[1]);
            const hasGray = /var\(--gray-/.test(block[1]);
            assert.ok(hasBorder && hasGray, '.auth-logout-button must use warm gray outline');
        });
    });

    describe('legacy blue/purple purge (auth scope)', function () {
        it('AO17: css/style.css does not contain #667eea', function () {
            assert.doesNotMatch(css, /#667eea/i, 'css must not contain legacy #667eea');
        });

        it('AO18: css/style.css does not contain #764ba2', function () {
            assert.doesNotMatch(css, /#764ba2/i, 'css must not contain legacy #764ba2');
        });

        it('AO19: css/style.css does not contain rgba(102,126,234', function () {
            assert.doesNotMatch(css, /rgba\(102,\s*126,\s*234/, 'css must not contain legacy blue rgba');
        });

        it('AO20: css/style.css does not contain rgba(118,75,162', function () {
            assert.doesNotMatch(css, /rgba\(118,\s*75,\s*162/, 'css must not contain legacy purple rgba');
        });
    });

    describe('auth HTML contract (index.html untouched)', function () {
        const html = readFile(INDEX_PATH);

        it('AO21: #auth-root id preserved', function () {
            assert.match(html, /id="auth-root"/, '#auth-root id must exist');
        });

        it('AO22: #auth-context-badge id preserved', function () {
            assert.match(html, /id="auth-context-badge"/, '#auth-context-badge id must exist');
        });

        it('AO23: #auth-logout-button id preserved', function () {
            assert.match(html, /id="auth-logout-button"/, '#auth-logout-button id must exist');
        });

        it('AO24: auth-ui.js still loads', function () {
            assert.match(html, /src="js\/auth-ui\.js/, 'js/auth-ui.js script tag must exist');
        });

        it('AO25: auth-service.js still loads', function () {
            assert.match(html, /src="js\/auth-service\.js/, 'js/auth-service.js script tag must exist');
        });

        it('AO26: app-bootstrap.js still loads', function () {
            assert.match(html, /src="js\/app-bootstrap\.js/, 'js/app-bootstrap.js script tag must exist');
        });
    });

    describe('sensitive data safety', function () {
        it('AO27: css/style.css must not contain JWT-like tokens', function () {
            assert.doesNotMatch(css, /eyJ[A-Za-z0-9_-]{20,}/, 'css must not contain JWT-like tokens');
        });

        it('AO28: css/style.css must not contain service_role keyword', function () {
            assert.doesNotMatch(css, /service_role/i, 'css must not contain service_role keyword');
        });
    });
});
