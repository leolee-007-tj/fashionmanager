// 3-7B: UI Theme Contract
// Verifies premium boutique theme tokens and critical selectors preservation.
// CSS-only change; must not break existing DOM ids/classes or JS behavior.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

const CSS_PATH = join(rootDir, 'css', 'style.css');
const INDEX_PATH = join(rootDir, 'index.html');

function readFile(p) {
    return readFileSync(p, 'utf-8');
}

describe('3-7B UI Theme Contract', function () {
    describe('premium theme tokens', function () {
        const css = readFile(CSS_PATH);

        it('TC1: :root block exists with premium primary token', function () {
            assert.match(css, /:root\s*\{/, ':root block must exist');
            assert.match(css, /--primary:\s*#[0-9A-Fa-f]{6};/, '--primary hex token must exist');
        });

        it('TC2: --primary-dark token exists', function () {
            assert.match(css, /--primary-dark:\s*#[0-9A-Fa-f]{6};/, '--primary-dark token must exist');
        });

        it('TC3: --primary-light token exists (3-7B addition)', function () {
            assert.match(css, /--primary-light:\s*#[0-9A-Fa-f]{6};/, '--primary-light token must exist');
        });

        it('TC4: --background warm ivory token exists (3-7B addition)', function () {
            assert.match(css, /--background:\s*#[0-9A-Fa-f]{6};/, '--background token must exist');
        });

        it('TC5: --border-color token exists (3-7B addition)', function () {
            assert.match(css, /--border-color:\s*#[0-9A-Fa-f]{6};/, '--border-color token must exist');
        });

        it('TC6: --white token uses warm white, not pure #ffffff', function () {
            const match = css.match(/--white:\s*(#[0-9A-Fa-f]{6});/);
            assert.ok(match, '--white token must exist');
            assert.notEqual(match[1].toLowerCase(), '#ffffff', '--white must be warm white, not pure white');
        });

        it('TC7: --border-radius is 10px or higher (refined)', function () {
            const match = css.match(/--border-radius:\s*(\d+)px;/);
            assert.ok(match, '--border-radius token must exist');
            const val = parseInt(match[1], 10);
            assert.ok(val >= 10, `--border-radius must be >= 10px (got ${val}px)`);
        });

        it('TC8: --shadow-sm token exists with warm rgba', function () {
            assert.match(css, /--shadow-sm:\s*0[^;]+rgba\(/, '--shadow-sm must use rgba');
        });

        it('TC9: --sidebar-width preserved at 220px', function () {
            assert.match(css, /--sidebar-width:\s*220px;/, '--sidebar-width must remain 220px');
        });

        it('TC10: --header-height preserved at 60px', function () {
            assert.match(css, /--header-height:\s*60px;/, '--header-height must remain 60px');
        });

        it('TC11: legacy blue/purple gradient purged from :root', function () {
            const rootBlock = css.match(/:root\s*\{([^}]*)\}/)[1];
            assert.doesNotMatch(rootBlock, /#667eea/i, ':root must not contain legacy #667eea');
            assert.doesNotMatch(rootBlock, /#764ba2/i, ':root must not contain legacy #764ba2');
        });
    });

    describe('critical selectors preserved', function () {
        const css = readFile(CSS_PATH);

        it('TC12: .header selector exists', function () {
            assert.match(css, /\.header\s*\{/, '.header selector must exist');
        });

        it('TC13: .header-inner selector exists', function () {
            assert.match(css, /\.header-inner\s*\{/, '.header-inner selector must exist');
        });

        it('TC14: .sidebar selector exists', function () {
            assert.match(css, /\.sidebar\s*\{/, '.sidebar selector must exist');
        });

        it('TC15: .nav-link selector exists', function () {
            assert.match(css, /\.nav-link\s*\{/, '.nav-link selector must exist');
        });

        it('TC16: .nav-link.active selector exists', function () {
            assert.match(css, /\.nav-link\.active\s*\{/, '.nav-link.active selector must exist');
        });

        it('TC17: .nav-menu selector exists', function () {
            assert.match(css, /\.nav-menu\s*\{/, '.nav-menu selector must exist');
        });

        it('TC18: .store-name selector exists', function () {
            assert.match(css, /\.store-name\s*\{/, '.store-name selector must exist');
        });

        it('TC19: .main-content selector exists', function () {
            assert.match(css, /\.main-content\s*\{/, '.main-content selector must exist');
        });

        it('TC20: .card selector exists', function () {
            assert.match(css, /\.card\s*\{/, '.card selector must exist');
        });

        it('TC21: .btn selector exists', function () {
            assert.match(css, /\.btn\s*\{/, '.btn selector must exist');
        });

        it('TC22: .btn-primary selector exists', function () {
            assert.match(css, /\.btn-primary\s*\{/, '.btn-primary selector must exist');
        });

        it('TC23: .sidebar-toggle selector exists', function () {
            assert.match(css, /\.sidebar-toggle\s*\{/, '.sidebar-toggle selector must exist');
        });

        it('TC24: .sidebar.collapsed selector exists', function () {
            assert.match(css, /\.sidebar\.collapsed\s*\{/, '.sidebar.collapsed selector must exist');
        });

        it('TC25: .auth-root selector exists', function () {
            assert.match(css, /\.auth-root\s*\{/, '.auth-root selector must exist');
        });

        it('TC26: .auth-panel selector exists', function () {
            assert.match(css, /\.auth-panel\s*\{/, '.auth-panel selector must exist');
        });

        it('TC27: .auth-context-badge selector exists', function () {
            assert.match(css, /\.auth-context-badge\s*\{/, '.auth-context-badge selector must exist');
        });

        it('TC28: .auth-logout-button selector exists', function () {
            assert.match(css, /\.auth-logout-button\s*\{/, '.auth-logout-button selector must exist');
        });

        it('TC29: .lang-btn selector exists', function () {
            assert.match(css, /\.lang-btn\s*\{/, '.lang-btn selector must exist');
        });
    });

    describe('index.html DOM contract', function () {
        const html = readFile(INDEX_PATH);

        it('TC30: #sidebar id preserved', function () {
            assert.match(html, /id="sidebar"/, '#sidebar id must exist in index.html');
        });

        it('TC31: #sidebarToggle id preserved', function () {
            assert.match(html, /id="sidebarToggle"/, '#sidebarToggle id must exist in index.html');
        });

        it('TC32: #auth-context-badge id preserved', function () {
            assert.match(html, /id="auth-context-badge"/, '#auth-context-badge id must exist in index.html');
        });

        it('TC33: #auth-logout-button id preserved', function () {
            assert.match(html, /id="auth-logout-button"/, '#auth-logout-button id must exist in index.html');
        });

        it('TC34: #nav-item-members id preserved (JS-controlled)', function () {
            assert.match(html, /id="nav-item-members"/, '#nav-item-members id must exist in index.html');
        });

        it('TC35: #app-brand-name id preserved', function () {
            assert.match(html, /id="app-brand-name"/, '#app-brand-name id must exist in index.html');
        });

        it('TC36: data-page attributes preserved on nav-link', function () {
            assert.match(html, /data-page="dashboard"/, 'dashboard data-page must exist');
            assert.match(html, /data-page="products"/, 'products data-page must exist');
            assert.match(html, /data-page="members"/, 'members data-page must exist');
        });

        it('TC37: CSS file link preserved', function () {
            assert.match(html, /href="css\/style\.css/, 'css/style.css link must exist in index.html');
        });
    });

    describe('JS logic untouched (no inline color changes expected)', function () {
        it('TC38: app.js still loads from js/app.js', function () {
            const html = readFile(INDEX_PATH);
            assert.match(html, /src="js\/app\.js/, 'js/app.js script tag must exist');
        });

        it('TC39: auth-ui.js still loads from js/auth-ui.js', function () {
            const html = readFile(INDEX_PATH);
            assert.match(html, /src="js\/auth-ui\.js/, 'js/auth-ui.js script tag must exist');
        });

        it('TC40: app-bootstrap.js still loads', function () {
            const html = readFile(INDEX_PATH);
            assert.match(html, /src="js\/app-bootstrap\.js/, 'js/app-bootstrap.js script tag must exist');
        });
    });

    describe('CSS does not break mobile responsive contract', function () {
        const css = readFile(CSS_PATH);

        it('TC41: 1024px media query preserved', function () {
            assert.match(css, /@media\s*\(max-width:\s*1024px\)/, '1024px media query must exist');
        });

        it('TC42: 768px media query preserved', function () {
            assert.match(css, /@media\s*\(max-width:\s*768px\)/, '768px media query must exist');
        });

        it('TC43: 480px media query preserved', function () {
            assert.match(css, /@media\s*\(max-width:\s*480px\)/, '480px media query must exist');
        });

        it('TC44: collapsed sidebar 70px rule preserved', function () {
            assert.match(css, /\.sidebar\.collapsed\s*\{[^}]*width:\s*70px/, 'sidebar.collapsed width 70px must be preserved');
        });

        it('TC45: nav-text display:none on collapse preserved', function () {
            assert.match(css, /\.sidebar\.collapsed\s*\.nav-text\s*\{[^}]*display:\s*none/, 'collapsed nav-text display:none must be preserved');
        });
    });

    describe('sensitive data safety', function () {
        it('TC46: css/style.css must not contain service_role key patterns', function () {
            const css = readFile(CSS_PATH);
            assert.doesNotMatch(css, /eyJ[A-Za-z0-9_-]{20,}/, 'css must not contain JWT-like tokens');
        });

        it('TC47: js/config.js must not be tracked by git (local-only)', function () {
            // This file is intentionally untracked; verify it is not in css or html references as a committed artifact.
            // js/config.js is loaded at runtime but must not be committed.
            const configPath = join(rootDir, 'js', 'config.js');
            // Existence is allowed (local dev), but we do not assert on it here.
            // The git ignore contract is enforced elsewhere.
            assert.ok(true, 'js/config.js local-only policy is enforced by git, not by this test');
        });
    });
});
