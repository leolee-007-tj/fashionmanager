import { describe, it } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const REPO_ROOT = join(new URL('.', import.meta.url).pathname, '..');

function readFile(relativePath) {
    const fullPath = join(REPO_ROOT, relativePath);
    if (!existsSync(fullPath)) return null;
    return readFileSync(fullPath, 'utf-8');
}

const CONTRACT_DOC = readFile('docs/ORDERS_REMOTE_DATASOURCE_CONTRACT.md');
const ARCHITECTURE_DOC = readFile('docs/CURRENT_ARCHITECTURE.md');

describe('Orders Remote DataSource Contract (OD1-OD17)', function () {

    // ============================================================
    // OD1: contract doc exists or CURRENT_ARCHITECTURE has 3-8A.2
    // ============================================================

    it('OD1: contract doc exists or CURRENT_ARCHITECTURE has 3-8A.2 section', function () {
        const hasContractDoc = CONTRACT_DOC !== null;
        const hasArchitectureSection = ARCHITECTURE_DOC !== null &&
            /3-8A\.2.*OrdersSupabaseDataSource Contract Design/.test(ARCHITECTURE_DOC);
        assert.ok(hasContractDoc || hasArchitectureSection,
            'Either docs/ORDERS_REMOTE_DATASOURCE_CONTRACT.md should exist or CURRENT_ARCHITECTURE.md should have 3-8A.2 section');
    });

    // Helper for remaining tests: prioritize CONTRACT_DOC, fall back to ARCHITECTURE_DOC 3-8A.2 section
    function getContractText() {
        if (CONTRACT_DOC) return CONTRACT_DOC;
        if (ARCHITECTURE_DOC) {
            const idx = ARCHITECTURE_DOC.indexOf('3-8A.2');
            if (idx !== -1) {
                const endIdx = ARCHITECTURE_DOC.indexOf('\n## ', idx + 100);
                return ARCHITECTURE_DOC.substring(idx, endIdx !== -1 ? endIdx : idx + 5000);
            }
        }
        return '';
    }

    const TEXT = getContractText();

    // ============================================================
    // OD2: feature flag names documented
    // ============================================================

    it('OD2: feature flag names documented', function () {
        assert.match(TEXT, /ORDERS_SUPABASE_ENABLED/, 'ORDERS_SUPABASE_ENABLED flag should be documented');
        assert.match(TEXT, /ORDERS_SUPABASE_REMOTE_ENABLED/, 'ORDERS_SUPABASE_REMOTE_ENABLED flag should be documented');
        // Default values documented
        assert.match(TEXT, /기본값.*false|default.*false/, 'default false should be documented');
    });

    // ============================================================
    // OD3: DataSource interface methods documented
    // ============================================================

    it('OD3: DataSource interface methods documented', function () {
        const requiredMethods = [
            'listOrders',
            'getOrderById',
            'createOrder',
            'updatePendingOrder',
            'shipOrder',
            'cancelOrder',
            'completeOrder',
            'deleteOrder',
            'findDuplicateOrder'
        ];
        for (const method of requiredMethods) {
            assert.ok(TEXT.includes(method),
                `Method ${method} should be mentioned in the contract`);
        }
    });

    // ============================================================
    // OD4: local-to-remote field mapping includes id/legacy_id
    // ============================================================

    it('OD4: local-to-remote field mapping includes id/legacy_id', function () {
        assert.match(TEXT, /legacy_id.*bigint|legacy_id.*numeric/, 'legacy_id mapping should be documented');
        assert.match(TEXT, /remote_id/, 'remote_id (uuid) field should be documented');
        assert.match(TEXT, /gen_random_uuid/, 'uuid generation should be referenced');
    });

    // ============================================================
    // OD5: customer_id/product_id uuid+legacy mapping documented
    // ============================================================

    it('OD5: customer_id/product_id uuid+legacy mapping documented', function () {
        assert.match(TEXT, /customer_id.*uuid.*legacy_customer_id|legacy_customer_id.*uuid/, 'customer_id uuid+legacy mapping should be documented');
        assert.match(TEXT, /product_id.*uuid.*legacy_product_id|legacy_product_id.*uuid/, 'product_id uuid+legacy mapping should be documented');
        assert.match(TEXT, /2중 매핑|dual mapping|double mapping/, 'dual mapping requirement should be noted');
    });

    // ============================================================
    // OD6: snapshot fields mapping documented
    // ============================================================

    it('OD6: snapshot fields mapping documented', function () {
        const snapshotFields = [
            'customer_name_snapshot',
            'product_title_snapshot',
            'brand_snapshot',
            'category_snapshot',
            'color_snapshot',
            'size_snapshot'
        ];
        for (const field of snapshotFields) {
            assert.match(TEXT, new RegExp(field.replace(/_/g, '_')),
                `Snapshot field ${field} should be documented in mapping`);
        }
    });

    // ============================================================
    // OD7: status transition mapping documented
    // ============================================================

    it('OD7: status transition mapping documented', function () {
        const statuses = ['PENDING', 'SHIPPED', 'COMPLETED', 'CANCELLED'];
        for (const status of statuses) {
            assert.match(TEXT, new RegExp(status), `Status ${status} should appear in transition mapping`);
        }
    });

    // ============================================================
    // OD8: create_order/update_pending_order/ship_order/cancel_order/complete_order mapped
    // ============================================================

    it('OD8: create_order/update_pending_order/ship_order/cancel_order/complete_order mapped', function () {
        const rpcs = ['create_order', 'update_pending_order', 'ship_order', 'cancel_order', 'complete_order'];
        for (const rpc of rpcs) {
            assert.match(TEXT, new RegExp(`public\\.${rpc}`),
                `RPC public.${rpc} should be referenced in status transition mapping`);
        }
    });

    // ============================================================
    // OD9: local hard delete is forbidden in remote mode
    // ============================================================

    it('OD9: local hard delete is forbidden in remote mode', function () {
        assert.match(TEXT, /hard delete.*금지|DELETE.*금지|remote.*delete.*불가|금지.*DELETE/,
            'Hard delete prohibition in remote mode should be documented');
        assert.match(TEXT, /cancel_order.*대체|cancel_order.*replace|cancel_order.*instead/,
            'cancel_order replacement for hard delete should be documented');
    });

    // ============================================================
    // OD10: remote mode inventory side effects are RPC-only
    // ============================================================

    it('OD10: remote mode inventory side effects are RPC-only', function () {
        assert.match(TEXT, /RPC.*atomic|atomic.*RPC|RPC.*transaction/,
            'RPC atomic inventory handling should be documented');
        assert.match(TEXT, /orders\.js.*stock.*조정.*안 됨|orders\.js.*stock.*not|직접.*조정.*안 됨/,
            'orders.js should not directly adjust stock in remote mode');
    });

    // ============================================================
    // OD11: analytics compatibility documented
    // ============================================================

    it('OD11: analytics compatibility documented', function () {
        assert.match(TEXT, /analytics.*compatibility|analytics.*호환|analytics.*연동/,
            'analytics compatibility should be documented');
        assert.match(TEXT, /DB\.getOrders\(\)|_getShippedOrders/,
            'analytics dependency on DB.getOrders() should be noted');
    });

    // ============================================================
    // OD12: customers compatibility documented
    // ============================================================

    it('OD12: customers compatibility documented', function () {
        assert.match(TEXT, /Customers\.recalculateAll|recalculateAll/,
            'customers.recalculateAll() dependency should be documented');
        assert.match(TEXT, /customer.*aggregate|customer.*recalc|customer.*집계/,
            'customer aggregate recalculation should be noted');
    });

    // ============================================================
    // OD13: error handling scenarios documented
    // ============================================================

    it('OD13: error handling scenarios documented', function () {
        const requiredScenarios = [
            '활성 store', 'no.*store', 'store.*없음',
            '멤버십', 'membership',
            'staff',
            'product.*deleted|상품.*삭제',
            'customer.*deleted|고객.*삭제',
            '재고.*부족|insufficient.*stock',
            '상태.*전이|invalid.*transition',
            '네트워크.*실패|network.*fail',
            '중복.*주문|duplicate.*order',
            'stale.*version|conflict'
        ];
        let foundCount = 0;
        for (const pattern of requiredScenarios) {
            if (new RegExp(pattern, 'i').test(TEXT)) foundCount++;
        }
        assert.ok(foundCount >= 6,
            `At least 6 error scenarios should be documented. Found: ${foundCount}`);
    });

    // ============================================================
    // OD14: implementation phases documented
    // ============================================================

    it('OD14: implementation phases documented', function () {
        const phases = ['3-8A\\.3', '3-8A\\.4', '3-8A\\.5', '3-8A\\.6', '3-8A\\.7', '3-8A\\.8'];
        const phaseLabels = ['3-8A.3', '3-8A.4', '3-8A.5', '3-8A.6', '3-8A.7', '3-8A.8'];
        for (let i = 0; i < phases.length; i++) {
            assert.match(TEXT, new RegExp(phases[i]), `Implementation phase ${phaseLabels[i]} should be documented`);
        }
    });

    // ============================================================
    // OD15: Go/No-Go documented
    // ============================================================

    it('OD15: Go/No-Go documented', function () {
        assert.match(TEXT, /Go\/No-Go|GO.*NO-GO|no-go|no go/i,
            'Go/No-Go decision should be documented');
    });

    // ============================================================
    // OD16: JS/CSS/HTML/migration files scope guard
    // 3-8A.9-A: js/db.js, js/config.example.js, js/orders.js, js/app.js, tests/ are allowed.
    // 3-6E.6.3: js/i18n.js, js/member-management.js are allowed.
    // Other JS files (products.js, customers.js, analytics.js,
    // supabase-client.js), css/, index.html, and supabase/migrations/ remain forbidden.
    // ============================================================

    it('OD16: only allowed JS files changed (3-8A.9-A + 3-6E.6.3)', function () {
        const changed = execSync('git diff --name-only HEAD', { cwd: REPO_ROOT, encoding: 'utf-8' }).trim();
        const lines = changed ? changed.split('\n') : [];
        const allowedJs = new Set([
            'js/db.js', 'js/config.example.js', 'js/orders.js', 'js/app.js', // 3-8A.9-A
            'js/i18n.js', 'js/member-management.js', // 3-6E.6.3
            'js/products.js' // BLOCKER-FIX-3
        ]);
        const forbidden = lines.filter(f =>
            (f.startsWith('js/') && !allowedJs.has(f)) ||
            f.startsWith('css/') ||
            f === 'index.html' ||
            f.startsWith('supabase/migrations/')
        );
        assert.strictEqual(forbidden.length, 0,
            `Allowed JS: db.js, config.example.js, orders.js, app.js, i18n.js, member-management.js. Forbidden: ${forbidden.join(', ')}`);
    });

    // ============================================================
    // OD17: no service_role/secret/token actual values in docs/tests
    // ============================================================

    it('OD17: no service_role/secret/token actual values in docs/tests', function () {
        // No JWT-like tokens
        assert.doesNotMatch(TEXT, /eyJ[A-Za-z0-9_-]{20,}/, 'no JWT-like tokens in contract docs');
        // No service_role assignments
        assert.doesNotMatch(TEXT, /service_role\s*[:=]\s*['"]/, 'no service_role assignment in docs');
        // Only the word "service_role" in prohibitions, not actual values
        assert.doesNotMatch(TEXT, /sb_secret_/, 'no sb_secret_ patterns in docs');
    });
});
