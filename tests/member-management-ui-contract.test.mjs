import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

function readFile(relativePath) {
    const fullPath = join(__dirname, '..', relativePath);
    assert.ok(existsSync(fullPath), `File should exist: ${relativePath}`);
    return readFileSync(fullPath, 'utf-8');
}

describe('Member Management UI Contract (3-6E.6)', function () {

    // ============================================================
    // File existence
    // ============================================================

    it('A: js/member-management.js exists', function () {
        const content = readFile('js/member-management.js');
        assert.ok(content.length > 0, 'member-management.js must not be empty');
    });

    // ============================================================
    // Owner-only gate
    // ============================================================

    it('B: isOwner() checks activeMembership.role === "owner"', function () {
        const content = readFile('js/member-management.js');
        assert.match(content, /isOwner/, 'isOwner function must exist');
        assert.match(content, /activeMembership\.role\s*===\s*'owner'/,
            'isOwner must check role === owner');
    });

    it('C: renderPage() calls isOwner() and returns access denied if not owner', function () {
        const content = readFile('js/member-management.js');
        assert.match(content, /renderAccessDenied/,
            'renderPage must have access denied path');
        // 3-6E.6.3: i18n - uses t('members', 'owner_only_page') instead of hardcoded Korean
        assert.match(content, /t\s*\(\s*['"]members['"]\s*,\s*['"]owner_only_page['"]\s*\)/,
            'access denied message must use i18n');
    });

    it('D: staff/manager/guest/no-membership access blocked by isOwner()', function () {
        const content = readFile('js/member-management.js');
        // isOwner returns false for non-owner roles
        assert.match(content, /if \(!ctx \|\| !ctx\.activeMembership\) return false/,
            'isOwner must return false when no activeMembership');
        assert.match(content, /return ctx\.activeMembership\.role === 'owner'/,
            'isOwner must return true only for owner role');
    });

    // ============================================================
    // RPC service function existence
    // ============================================================

    it('E: listStoreMembers calls list_store_members RPC', function () {
        const content = readFile('js/member-management.js');
        assert.match(content, /client\.rpc\('list_store_members'\)/,
            'must call list_store_members RPC');
    });

    it('F: deactivateStoreMember calls deactivate_store_member RPC', function () {
        const content = readFile('js/member-management.js');
        assert.match(content, /client\.rpc\('deactivate_store_member'/,
            'must call deactivate_store_member RPC');
    });

    it('G: generateStoreInviteCode calls generate_store_invite_code RPC', function () {
        const content = readFile('js/member-management.js');
        assert.match(content, /client\.rpc\('generate_store_invite_code'/,
            'must call generate_store_invite_code RPC');
    });

    it('H: listStoreInviteCodes calls list_store_invite_codes RPC', function () {
        const content = readFile('js/member-management.js');
        assert.match(content, /client\.rpc\('list_store_invite_codes'\)/,
            'must call list_store_invite_codes RPC');
    });

    it('I: revokeStoreInviteCode calls revoke_store_invite_code RPC', function () {
        const content = readFile('js/member-management.js');
        assert.match(content, /client\.rpc\('revoke_store_invite_code'/,
            'must call revoke_store_invite_code RPC');
    });

    // ============================================================
    // Deactivate UI conditions
    // ============================================================

    it('J: owner role deactivate button blocked', function () {
        const content = readFile('js/member-management.js');
        assert.match(content, /isOwnerRow\s*=\s*member\.role\s*===\s*'owner'/,
            'must check if member is owner row');
        assert.match(content, /canDeactivate.*!isOwnerRow/,
            'canDeactivate must be false for owner rows');
    });

    it('K: self-deactivate blocked', function () {
        const content = readFile('js/member-management.js');
        assert.match(content, /isSelf/,
            'must have self-deactivate check');
        assert.match(content, /canDeactivate.*!isSelf/,
            'canDeactivate must be false for self');
    });

    it('L: inactive member deactivate button hidden', function () {
        const content = readFile('js/member-management.js');
        assert.match(content, /member\.is_active\s*===\s*true/,
            'canDeactivate must check is_active === true');
    });

    // ============================================================
    // Invite role validation
    // ============================================================

    it('M: staff/manager invite roles only allowed', function () {
        const content = readFile('js/member-management.js');
        assert.match(content, /role !== 'staff' && role !== 'manager'/,
            'must reject non-staff/manager roles');
    });

    it('N: owner invite role blocked', function () {
        const content = readFile('js/member-management.js');
        assert.match(content, /role === 'owner'.*throw/,
            'must throw for owner invite role');
    });

    it('O: expires_in_days 1-30 validation', function () {
        const content = readFile('js/member-management.js');
        assert.match(content, /days < 1 \|\| days > 30/,
            'must validate expires_in_days 1-30');
    });

    // ============================================================
    // Security: no console.log of sensitive data
    // ============================================================

    it('P: no console.log of invite_code', function () {
        const content = readFile('js/member-management.js');
        // Check no console.log that could output invite_code
        assert.doesNotMatch(content, /console\.log.*invite_code/i,
            'must not console.log invite_code');
        assert.doesNotMatch(content, /console\.log.*code/i,
            'must not console.log code variable');
    });

    it('Q: no console.log of member_id', function () {
        const content = readFile('js/member-management.js');
        assert.doesNotMatch(content, /console\.log.*member_id/i,
            'must not console.log member_id');
    });

    it('R: no service_role/token/key/password strings', function () {
        const content = readFile('js/member-management.js');
        assert.doesNotMatch(content, /service_role/i,
            'must not contain service_role');
        assert.doesNotMatch(content, /\b(token|password|secret|api_key)\b/i,
            'must not contain token/password/secret/api_key');
    });

    // ============================================================
    // index.html: nav item and script load
    // ============================================================

    it('S: index.html has members nav item with display:none default', function () {
        const content = readFile('index.html');
        assert.match(content, /nav-item-members/,
            'index.html must have nav-item-members');
        assert.match(content, /href="#\/members"/,
            'index.html must have #/members route');
        assert.match(content, /display:none/,
            'nav-item-members must be hidden by default');
    });

    it('T: index.html loads member-management.js before app.js', function () {
        const content = readFile('index.html');
        var mmPos = content.indexOf('member-management.js');
        var appPos = content.indexOf('js/app.js');
        assert.ok(mmPos > 0 && appPos > 0, 'both scripts must exist');
        assert.ok(mmPos < appPos, 'member-management.js must load before app.js');
    });

    // ============================================================
    // app.js: route registration
    // ============================================================

    it('U: app.js has members route in switch', function () {
        const content = readFile('js/app.js');
        assert.match(content, /case 'members'/,
            'app.js must have members route case');
        assert.match(content, /MemberManagement\.renderPage/,
            'app.js must call MemberManagement.renderPage');
    });

    it('V: app.js members route calls MemberManagement.init()', function () {
        const content = readFile('js/app.js');
        assert.match(content, /MemberManagement\.init/,
            'app.js must call MemberManagement.init for members route');
    });

    // ============================================================
    // app-bootstrap.js: owner nav visibility
    // ============================================================

    it('W: app-bootstrap.js has _updateOwnerNavVisibility function', function () {
        const content = readFile('js/app-bootstrap.js');
        assert.match(content, /_updateOwnerNavVisibility/,
            'app-bootstrap must have _updateOwnerNavVisibility');
        assert.match(content, /nav-item-members/,
            'app-bootstrap must reference nav-item-members');
        assert.match(content, /role === 'owner'/,
            'app-bootstrap must check owner role for nav visibility');
    });

    // ============================================================
    // CSS: member management styles exist
    // ============================================================

    it('X: style.css has member-mgmt-container class', function () {
        const content = readFile('css/style.css');
        assert.match(content, /\.member-mgmt-container/,
            'style.css must have .member-mgmt-container');
        assert.match(content, /\.member-mgmt-table/,
            'style.css must have .member-mgmt-table');
        assert.match(content, /\.member-mgmt-card/,
            'style.css must have .member-mgmt-card');
        assert.match(content, /\.status-badge/,
            'style.css must have .status-badge');
    });

    // ============================================================
    // Existing routes not broken
    // ============================================================

    it('Y: existing dashboard route still exists', function () {
        const content = readFile('js/app.js');
        assert.match(content, /case 'dashboard'/,
            'dashboard route must still exist');
    });

    it('Z: existing products route still exists', function () {
        const content = readFile('js/app.js');
        assert.match(content, /case 'products'/,
            'products route must still exist');
    });

    it('AA: existing settings route still exists', function () {
        const content = readFile('js/app.js');
        assert.match(content, /case 'settings'/,
            'settings route must still exist');
    });

    // ============================================================
    // No migration files modified
    // ============================================================

    it('AB: no migration files referenced in member-management.js', function () {
        const content = readFile('js/member-management.js');
        assert.doesNotMatch(content, /supabase\/migrations/i,
            'member-management.js must not reference migration files');
    });

    it('AC: no js/config.js reference in member-management.js', function () {
        const content = readFile('js/member-management.js');
        assert.doesNotMatch(content, /config\.js/i,
            'member-management.js must not reference config.js');
    });
});
