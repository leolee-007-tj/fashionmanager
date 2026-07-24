import { describe, it } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import { join } from 'node:path';

const REPO_ROOT = join(new URL('.', import.meta.url).pathname, '..');

function readFile(relativePath) {
    const fullPath = join(REPO_ROOT, relativePath);
    assert.ok(existsSync(fullPath), `File should exist: ${relativePath}`);
    return readFileSync(fullPath, 'utf-8');
}

describe('Invite code UI contract tests', function () {

    it('1: auth-service.js has joinStoreWithInviteCode function', function () {
        const content = readFile('js/auth-service.js');
        assert.match(content, /async function joinStoreWithInviteCode\s*\(/, 'should have async joinStoreWithInviteCode function');
        assert.match(content, /joinStoreWithInviteCode:\s*joinStoreWithInviteCode/, 'should export joinStoreWithInviteCode in LESOULAuth');
    });

    it('2: joinStoreWithInviteCode validates empty invite code', function () {
        const content = readFile('js/auth-service.js');
        assert.match(content, /var code = \(inviteCode \|\| ''\)\.trim\(\)\.toUpperCase\(\)/, 'should trim and uppercase invite code');
        assert.match(content, /if \(!code\)/, 'should check for empty code');
        assert.match(content, /Invite code is required/, 'should throw error for empty code');
    });

    it('3: joinStoreWithInviteCode validates LS- prefix', function () {
        const content = readFile('js/auth-service.js');
        assert.match(content, /code\.indexOf\('LS-'\)/, 'should check LS- prefix');
        assert.match(content, /Invalid invite code format/, 'should throw error for invalid format');
    });

    it('4: joinStoreWithInviteCode calls create_initial_store RPC with 4 arguments', function () {
        const content = readFile('js/auth-service.js');
        assert.match(content, /client\.rpc\('create_initial_store',/, 'should call create_initial_store RPC');
        assert.match(content, /p_name:/, 'should include p_name');
        assert.match(content, /p_subtitle:/, 'should include p_subtitle');
        assert.match(content, /p_default_language:/, 'should include p_default_language');
        assert.match(content, /p_invite_code:\s*code/, 'should include p_invite_code');
    });

    it('5: joinStoreWithInviteCode has user-friendly error messages', function () {
        const content = readFile('js/auth-service.js');
        assert.match(content, /유효하지 않은 초대 코드입니다\./, 'should have Korean message for invalid code');
        assert.match(content, /만료된 초대 코드입니다\./, 'should have Korean message for expired code');
        assert.match(content, /이미 사용되었거나 철회된 초대 코드입니다\./, 'should have Korean message for used/revoked code');
    });

    it('6: auth-ui.js has invite code input UI', function () {
        const content = readFile('js/auth-ui.js');
        assert.match(content, /function _showInviteCodeForm\s*\(/, 'should have _showInviteCodeForm function');
        assert.match(content, /초대 코드로 매장 참여/, 'should have invite code join title');
    });

    it('7: invite code input has LS-XXXXXXXX placeholder', function () {
        const content = readFile('js/auth-ui.js');
        assert.match(content, /placeholder\s*=\s*'LS-XXXXXXXX'/, 'should have LS-XXXXXXXX placeholder');
        assert.match(content, /auth-invite-code/, 'should have auth-invite-code input id');
    });

    it('8: showStoreOnboarding has onJoinWithInviteCode handler', function () {
        const content = readFile('js/auth-ui.js');
        assert.match(content, /onJoinWithInviteCode/, 'should handle onJoinWithInviteCode');
        assert.match(content, /초대 코드로 매장 참여/, 'should have invite code button text');
    });

    it('9: showStoreOnboarding has guest mode button when handler provided', function () {
        const content = readFile('js/auth-ui.js');
        assert.match(content, /onContinueGuest/, 'should handle onContinueGuest');
        assert.match(content, /게스트\/연습 모드로 계속하기/, 'should have guest mode button text');
    });

    it('10: app-bootstrap.js exports joinStoreWithInviteCode', function () {
        const content = readFile('js/app-bootstrap.js');
        assert.match(content, /function joinStoreWithInviteCode\s*\(/, 'should have joinStoreWithInviteCode function');
        assert.match(content, /joinStoreWithInviteCode:\s*joinStoreWithInviteCode/, 'should export joinStoreWithInviteCode in LESOULAppBootstrap');
    });

    it('11: app-bootstrap connects onJoinWithInviteCode to auth service', function () {
        const content = readFile('js/app-bootstrap.js');
        assert.match(content, /onJoinWithInviteCode:\s*function/, 'should have onJoinWithInviteCode handler');
        assert.match(content, /auth\.joinStoreWithInviteCode/, 'should call auth.joinStoreWithInviteCode');
    });

    it('12: app-bootstrap has continueAsGuest function', function () {
        const content = readFile('js/app-bootstrap.js');
        assert.match(content, /function continueAsGuest\s*\(/, 'should have continueAsGuest function');
    });

    it('13: existing owner flow is protected (no forced invite UI)', function () {
        const content = readFile('js/app-bootstrap.js');
        const onboardingMatch = content.match(/if \(status === 'needs_store_onboarding'\)/);
        assert.ok(onboardingMatch, 'should have needs_store_onboarding branch');
        const guestMatch = content.match(/if \(status === 'guest'\)/);
        assert.ok(guestMatch, 'should have guest branch');
        const readyMatch = content.match(/if \(status === 'ready'\)/);
        assert.ok(readyMatch, 'should have ready branch');
        const readyMembershipCheck = content.match(/if \(_context\.memberships\.length === 0\)/);
        assert.ok(readyMembershipCheck, 'should have membership check in ready branch');
    });

    it('14: auth-service does not use service_role key', function () {
        const content = readFile('js/auth-service.js');
        assert.doesNotMatch(content, /service_role/i, 'should not contain service_role');
        assert.doesNotMatch(content, /SUPABASE_SERVICE_KEY/i, 'should not contain SUPABASE_SERVICE_KEY');
    });

    it('15: auth-ui does not log tokens or passwords', function () {
        const content = readFile('js/auth-ui.js');
        assert.doesNotMatch(content, /console\.(log|error|warn).*password/i, 'should not log passwords');
        assert.doesNotMatch(content, /console\.(log|error|warn).*token/i, 'should not log tokens');
    });

    it('16: joinStoreWithInviteCode does not log invite_code to console', function () {
        const content = readFile('js/auth-service.js');
        assert.doesNotMatch(content, /console\.(log|error|warn).*invite_code/i, 'should not log invite_code');
        assert.doesNotMatch(content, /console\.(log|error|warn).*code/i, 'should not log code variable');
    });

    it('17: CSS has auth-button-full class for invite UI buttons', function () {
        const content = readFile('css/style.css');
        assert.match(content, /\.auth-button-full/, 'should have auth-button-full class');
    });

    it('18: js/config.js is not referenced for commit', function () {
        const authContent = readFile('js/auth-service.js');
        assert.doesNotMatch(authContent, /js\/config\.js/, 'should not reference js/config.js');
        const bootstrapContent = readFile('js/app-bootstrap.js');
        assert.doesNotMatch(bootstrapContent, /js\/config\.js/, 'should not reference js/config.js');
    });

    it('19: bootstrap calls _runBootstrap after successful join', function () {
        const content = readFile('js/app-bootstrap.js');
        assert.match(content, /return _runBootstrap\(\)/, 'should call _runBootstrap after successful join');
    });

    it('20: guest status does not auto-enter app (no direct _enterApp)', function () {
        const content = readFile('js/app-bootstrap.js');
        const guestBlock = content.substring(
            content.indexOf("if (status === 'guest')"),
            content.indexOf("if (status === 'ready')")
        );
        assert.doesNotMatch(guestBlock, /_enterApp\(\)/, 'guest branch should not call _enterApp directly');
        assert.match(guestBlock, /showStoreOnboarding/, 'guest branch should show store onboarding');
    });

    it('21: no-membership user cannot reach LESOUL dashboard without explicit action', function () {
        const content = readFile('js/app-bootstrap.js');
        assert.match(content, /membership 없는 authenticated user는/, 'should document the no-auto-enter policy');
        assert.match(content, /초기화\/invite-code 화면을 표시/, 'should document onboarding screen requirement');
    });

    it('22: guest mode requires explicit onContinueGuest handler', function () {
        const content = readFile('js/app-bootstrap.js');
        assert.match(content, /onContinueGuest.*function.*continueAsGuest/, 'should map onContinueGuest to continueAsGuest');
        assert.match(content, /if \(allowGuestMode\)/, 'should conditionally show guest mode option');
    });

    it('23: auth-service joinStoreWithInviteCode uses neutral brandName fallback', function () {
        const content = readFile('js/auth-service.js');
        assert.match(content, /var brandName = 'My Store'/, 'should use neutral My Store fallback');
        assert.doesNotMatch(content, /var brandName = 'LESOUL'/, 'should not hardcode LESOUL as brandName');
    });

    it('24: ready with memberships does not show invite UI', function () {
        const content = readFile('js/app-bootstrap.js');
        const readyBlock = content.substring(
            content.indexOf("if (status === 'ready')"),
            content.indexOf("// Unknown status")
        );
        const membershipOneBlock = readyBlock.substring(
            readyBlock.indexOf("if (_context.memberships.length === 1)")
        );
        assert.doesNotMatch(membershipOneBlock, /showStoreOnboarding/, 'ready with 1 membership should not show onboarding');
        assert.match(membershipOneBlock, /_enterApp\(\)/, 'ready with 1 membership should enter app');
    });

    it('25: showStoreOnboarding description is neutral (no LESOUL store implication)', function () {
        const content = readFile('js/auth-ui.js');
        assert.match(content, /새 매장을 만들거나 초대 코드로 기존 매장에 참여/, 'should have neutral onboarding description');
        assert.doesNotMatch(content, /LESOUL.*매장/, 'should not imply LESOUL store ownership');
    });
});