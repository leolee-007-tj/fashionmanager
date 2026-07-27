/**
 * 3-6E.6.3: Member Management 4-language i18n cleanup
 * Contract tests for i18n integration in member-management.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const MEMBER_MANAGEMENT_PATH = resolve(process.cwd(), 'js/member-management.js');
const I18N_PATH = resolve(process.cwd(), 'js/i18n.js');

const MEMBER_MANAGEMENT_JS = existsSync(MEMBER_MANAGEMENT_PATH) ? readFileSync(MEMBER_MANAGEMENT_PATH, 'utf8') : '';
const I18N_JS = existsSync(I18N_PATH) ? readFileSync(I18N_PATH, 'utf8') : '';

describe('3-6E.6.3 Member Management i18n Contract', function () {

    // ============================================================
    // MI1-MI5: i18n file structure
    // ============================================================
    it('MI1: js/i18n.js exists', function () {
        assert.ok(I18N_JS, 'i18n.js should exist');
    });

    it('MI2: js/i18n.js contains members namespace', function () {
        assert.match(I18N_JS, /members\s*:\s*\{/, 'i18n.js should have members namespace');
    });

    it('MI3: members namespace has ko translations', function () {
        const membersStart = I18N_JS.indexOf('members:');
        const membersEnd = I18N_JS.indexOf('\n    };', membersStart);
        const membersSection = membersEnd > membersStart ? I18N_JS.slice(membersStart, membersEnd) : I18N_JS.slice(membersStart);
        // Check for Korean text patterns in members namespace
        assert.match(membersSection, /ko\s*:\s*['"][^'"]+['"]/, 'members namespace should have ko translations');
    });

    it('MI4: members namespace has zh translations', function () {
        const membersStart = I18N_JS.indexOf('members:');
        const membersEnd = I18N_JS.indexOf('\n    };', membersStart);
        const membersSection = membersEnd > membersStart ? I18N_JS.slice(membersStart, membersEnd) : I18N_JS.slice(membersStart);
        // Check for Chinese text patterns in members namespace
        assert.match(membersSection, /zh\s*:\s*['"][^'"]+['"]/, 'members namespace should have zh translations');
    });

    it('MI5: members namespace has en translations', function () {
        const membersStart = I18N_JS.indexOf('members:');
        const membersEnd = I18N_JS.indexOf('\n    };', membersStart);
        const membersSection = membersEnd > membersStart ? I18N_JS.slice(membersStart, membersEnd) : I18N_JS.slice(membersStart);
        // Check for English text patterns in members namespace
        assert.match(membersSection, /en\s*:\s*['"][^'"]+['"]/, 'members namespace should have en translations');
    });

    it('MI6: members namespace has ja translations', function () {
        const membersStart = I18N_JS.indexOf('members:');
        const membersEnd = I18N_JS.indexOf('\n    };', membersStart);
        const membersSection = membersEnd > membersStart ? I18N_JS.slice(membersStart, membersEnd) : I18N_JS.slice(membersStart);
        // Check for Japanese text patterns in members namespace
        assert.match(membersSection, /ja\s*:\s*['"][^'"]+['"]/, 'members namespace should have ja translations');
    });

    // ============================================================
    // MI7-MI15: key presence in members namespace
    // ============================================================
    it('MI7: members namespace has access_denied key', function () {
        assert.match(I18N_JS, /access_denied\s*:\s*\{/, 'members namespace should have access_denied key');
    });

    it('MI8: members namespace has owner_only_page key', function () {
        assert.match(I18N_JS, /owner_only_page\s*:\s*\{/, 'members namespace should have owner_only_page key');
    });

    it('MI9: members namespace has member_invite_management key', function () {
        assert.match(I18N_JS, /member_invite_management\s*:\s*\{/, 'members namespace should have member_invite_management key');
    });

    it('MI10: members namespace has member_list key', function () {
        assert.match(I18N_JS, /member_list\s*:\s*\{/, 'members namespace should have member_list key');
    });

    it('MI11: members namespace has invite_code_generate key', function () {
        assert.match(I18N_JS, /invite_code_generate\s*:\s*\{/, 'members namespace should have invite_code_generate key');
    });

    it('MI12: members namespace has invite_code_list key', function () {
        assert.match(I18N_JS, /invite_code_list\s*:\s*\{/, 'members namespace should have invite_code_list key');
    });

    it('MI13: members namespace has active key', function () {
        assert.match(I18N_JS, /active\s*:\s*\{/, 'members namespace should have active key');
    });

    it('MI14: members namespace has inactive key', function () {
        assert.match(I18N_JS, /inactive\s*:\s*\{/, 'members namespace should have inactive key');
    });

    it('MI15: members namespace has deactivate key', function () {
        assert.match(I18N_JS, /deactivate\s*:\s*\{/, 'members namespace should have deactivate key');
    });

    // ============================================================
    // MC1-MC10: hardcoded Korean removal in member-management.js
    // ============================================================
    it('MC1: member-management.js does not contain hardcoded "접근 권한 없음"', function () {
        assert.ok(!MEMBER_MANAGEMENT_JS.includes("'접근 권한 없음'"), 'member-management.js should not have hardcoded Korean');
        assert.ok(!MEMBER_MANAGEMENT_JS.includes('"접근 권한 없음"'), 'member-management.js should not have hardcoded Korean');
    });

    it('MC2: member-management.js does not contain hardcoded "직원/초대 관리"', function () {
        assert.ok(!MEMBER_MANAGEMENT_JS.includes("'직원/초대 관리'"), 'member-management.js should not have hardcoded Korean');
        assert.ok(!MEMBER_MANAGEMENT_JS.includes('"직원/초대 관리"'), 'member-management.js should not have hardcoded Korean');
    });

    it('MC3: member-management.js does not contain hardcoded "직원 목록"', function () {
        assert.ok(!MEMBER_MANAGEMENT_JS.includes("'직원 목록'"), 'member-management.js should not have hardcoded Korean');
        assert.ok(!MEMBER_MANAGEMENT_JS.includes('"직원 목록"'), 'member-management.js should not have hardcoded Korean');
    });

    it('MC4: member-management.js does not contain hardcoded "초대 코드 생성"', function () {
        assert.ok(!MEMBER_MANAGEMENT_JS.includes("'초대 코드 생성'"), 'member-management.js should not have hardcoded Korean');
        assert.ok(!MEMBER_MANAGEMENT_JS.includes('"초대 코드 생성"'), 'member-management.js should not have hardcoded Korean');
    });

    it('MC5: member-management.js does not contain hardcoded "초대 코드 목록"', function () {
        assert.ok(!MEMBER_MANAGEMENT_JS.includes("'초대 코드 목록'"), 'member-management.js should not have hardcoded Korean');
        assert.ok(!MEMBER_MANAGEMENT_JS.includes('"초대 코드 목록"'), 'member-management.js should not have hardcoded Korean');
    });

    it('MC6: member-management.js does not contain hardcoded "활성" (in status badge)', function () {
        // Check for status badge with hardcoded Korean
        assert.ok(!MEMBER_MANAGEMENT_JS.includes("'활성'"), 'member-management.js should not have hardcoded Korean in status badge');
    });

    it('MC7: member-management.js does not contain hardcoded "비활성" (in status badge)', function () {
        // Check for status badge with hardcoded Korean
        assert.ok(!MEMBER_MANAGEMENT_JS.includes("'비활성'"), 'member-management.js should not have hardcoded Korean in status badge');
    });

    it('MC8: member-management.js does not contain hardcoded "비활성화" (button)', function () {
        // Check for deactivate button with hardcoded Korean
        assert.ok(!MEMBER_MANAGEMENT_JS.includes("'비활성화'"), 'member-management.js should not have hardcoded Korean in button');
    });

    it('MC9: member-management.js does not contain hardcoded "새로고침"', function () {
        assert.ok(!MEMBER_MANAGEMENT_JS.includes("'새로고침'"), 'member-management.js should not have hardcoded Korean');
        assert.ok(!MEMBER_MANAGEMENT_JS.includes('"새로고침"'), 'member-management.js should not have hardcoded Korean');
    });

    it('MC10: member-management.js does not contain hardcoded "로딩 중..."', function () {
        assert.ok(!MEMBER_MANAGEMENT_JS.includes("'로딩 중...'"), 'member-management.js should not have hardcoded Korean');
        assert.ok(!MEMBER_MANAGEMENT_JS.includes('"로딩 중..."'), 'member-management.js should not have hardcoded Korean');
    });

    // ============================================================
    // MT1-MT10: t() function usage in member-management.js
    // ============================================================
    it('MT1: member-management.js uses t("members", "access_denied")', function () {
        assert.match(MEMBER_MANAGEMENT_JS, /t\s*\(\s*['"]members['"]\s*,\s*['"]access_denied['"]\s*\)/, 'member-management.js should use t("members", "access_denied")');
    });

    it('MT2: member-management.js uses t("members", "owner_only_page")', function () {
        assert.match(MEMBER_MANAGEMENT_JS, /t\s*\(\s*['"]members['"]\s*,\s*['"]owner_only_page['"]\s*\)/, 'member-management.js should use t("members", "owner_only_page")');
    });

    it('MT3: member-management.js uses t("members", "member_invite_management")', function () {
        assert.match(MEMBER_MANAGEMENT_JS, /t\s*\(\s*['"]members['"]\s*,\s*['"]member_invite_management['"]\s*\)/, 'member-management.js should use t("members", "member_invite_management")');
    });

    it('MT4: member-management.js uses t("members", "member_list")', function () {
        assert.match(MEMBER_MANAGEMENT_JS, /t\s*\(\s*['"]members['"]\s*,\s*['"]member_list['"]\s*\)/, 'member-management.js should use t("members", "member_list")');
    });

    it('MT5: member-management.js uses t("members", "invite_code_generate")', function () {
        assert.match(MEMBER_MANAGEMENT_JS, /t\s*\(\s*['"]members['"]\s*,\s*['"]invite_code_generate['"]\s*\)/, 'member-management.js should use t("members", "invite_code_generate")');
    });

    it('MT6: member-management.js uses t("members", "invite_code_list")', function () {
        assert.match(MEMBER_MANAGEMENT_JS, /t\s*\(\s*['"]members['"]\s*,\s*['"]invite_code_list['"]\s*\)/, 'member-management.js should use t("members", "invite_code_list")');
    });

    it('MT7: member-management.js uses t("members", "active")', function () {
        assert.match(MEMBER_MANAGEMENT_JS, /t\s*\(\s*['"]members['"]\s*,\s*['"]active['"]\s*\)/, 'member-management.js should use t("members", "active")');
    });

    it('MT8: member-management.js uses t("members", "inactive")', function () {
        assert.match(MEMBER_MANAGEMENT_JS, /t\s*\(\s*['"]members['"]\s*,\s*['"]inactive['"]\s*\)/, 'member-management.js should use t("members", "inactive")');
    });

    it('MT9: member-management.js uses t("members", "deactivate")', function () {
        assert.match(MEMBER_MANAGEMENT_JS, /t\s*\(\s*['"]members['"]\s*,\s*['"]deactivate['"]\s*\)/, 'member-management.js should use t("members", "deactivate")');
    });

    it('MT10: member-management.js uses t("members", "loading")', function () {
        assert.match(MEMBER_MANAGEMENT_JS, /t\s*\(\s*['"]members['"]\s*,\s*['"]loading['"]\s*\)/, 'member-management.js should use t("members", "loading")');
    });

    // ============================================================
    // MR1-MR5: RPC names preserved
    // ============================================================
    it('MR1: list_store_members RPC name preserved', function () {
        assert.match(MEMBER_MANAGEMENT_JS, /client\.rpc\s*\(\s*['"]list_store_members['"]\s*\)/, 'list_store_members RPC should be preserved');
    });

    it('MR2: deactivate_store_member RPC name preserved', function () {
        assert.match(MEMBER_MANAGEMENT_JS, /client\.rpc\s*\(\s*['"]deactivate_store_member['"]\s*,/, 'deactivate_store_member RPC should be preserved');
    });

    it('MR3: generate_store_invite_code RPC name preserved', function () {
        assert.match(MEMBER_MANAGEMENT_JS, /client\.rpc\s*\(\s*['"]generate_store_invite_code['"]\s*,/, 'generate_store_invite_code RPC should be preserved');
    });

    it('MR4: list_store_invite_codes RPC name preserved', function () {
        assert.match(MEMBER_MANAGEMENT_JS, /client\.rpc\s*\(\s*['"]list_store_invite_codes['"]\s*\)/, 'list_store_invite_codes RPC should be preserved');
    });

    it('MR5: revoke_store_invite_code RPC name preserved', function () {
        assert.match(MEMBER_MANAGEMENT_JS, /client\.rpc\s*\(\s*['"]revoke_store_invite_code['"]\s*,/, 'revoke_store_invite_code RPC should be preserved');
    });

    // ============================================================
    // MS1-MS5: Security - no sensitive data in logs
    // ============================================================
    it('MS1: member-management.js does not log invite code', function () {
        // Check that there's no console.log of invite code
        assert.ok(!MEMBER_MANAGEMENT_JS.includes('console.log(code)'), 'member-management.js should not log invite code');
        assert.ok(!MEMBER_MANAGEMENT_JS.includes('console.log(invite_code)'), 'member-management.js should not log invite code');
    });

    it('MS2: member-management.js does not contain service_role', function () {
        assert.ok(!MEMBER_MANAGEMENT_JS.includes('service_role'), 'member-management.js should not contain service_role');
    });

    it('MS3: member-management.js does not log token/key/password', function () {
        // Check that there's no console.log of sensitive data
        assert.ok(!MEMBER_MANAGEMENT_JS.includes('console.log(token)'), 'member-management.js should not log token');
        assert.ok(!MEMBER_MANAGEMENT_JS.includes('console.log(key)'), 'member-management.js should not log key');
        assert.ok(!MEMBER_MANAGEMENT_JS.includes('console.log(password)'), 'member-management.js should not log password');
    });

    it('MS4: member-management.js has comment about invite code not being logged', function () {
        // Check for comment indicating invite code should not be logged
        assert.match(MEMBER_MANAGEMENT_JS, /invite code|Full value must not be written to logs/i, 'member-management.js should have comment about not logging invite code');
    });

    it('MS5: invite code is only in code element for display', function () {
        // Check that invite code is displayed in <code> element
        assert.match(MEMBER_MANAGEMENT_JS, /<code[^>]*>.*escapeHtml\(code\)/, 'invite code should be in code element for display');
    });

    // ============================================================
    // MX1-MX5: Additional hardcoded Korean checks
    // ============================================================
    it('MX1: member-management.js does not contain hardcoded "등록된 직원이 없습니다."', function () {
        assert.ok(!MEMBER_MANAGEMENT_JS.includes("'등록된 직원이 없습니다.'"), 'member-management.js should not have hardcoded Korean');
        assert.ok(!MEMBER_MANAGEMENT_JS.includes('"등록된 직원이 없습니다."'), 'member-management.js should not have hardcoded Korean');
    });

    it('MX2: member-management.js does not contain hardcoded "생성된 초대 코드가 없습니다."', function () {
        assert.ok(!MEMBER_MANAGEMENT_JS.includes("'생성된 초대 코드가 없습니다.'"), 'member-management.js should not have hardcoded Korean');
        assert.ok(!MEMBER_MANAGEMENT_JS.includes('"생성된 초대 코드가 없습니다."'), 'member-management.js should not have hardcoded Korean');
    });

    it('MX3: member-management.js does not contain hardcoded "이 직원을 비활성화하시겠습니까?"', function () {
        assert.ok(!MEMBER_MANAGEMENT_JS.includes("'이 직원을 비활성화하시겠습니까?'"), 'member-management.js should not have hardcoded Korean');
        assert.ok(!MEMBER_MANAGEMENT_JS.includes('"이 직원을 비활성화하시겠습니까?"'), 'member-management.js should not have hardcoded Korean');
    });

    it('MX4: member-management.js does not contain hardcoded "이 초대 코드를 취소하시겠습니까?"', function () {
        assert.ok(!MEMBER_MANAGEMENT_JS.includes("'이 초대 코드를 취소하시겠습니까?'"), 'member-management.js should not have hardcoded Korean');
        assert.ok(!MEMBER_MANAGEMENT_JS.includes('"이 초대 코드를 취소하시겠습니까?"'), 'member-management.js should not have hardcoded Korean');
    });

    it('MX5: member-management.js does not contain hardcoded table headers', function () {
        // Check for hardcoded table headers with Korean
        assert.ok(!MEMBER_MANAGEMENT_JS.includes('<th>이름</th>'), 'member-management.js should not have hardcoded Korean table headers');
        assert.ok(!MEMBER_MANAGEMENT_JS.includes('<th>이메일</th>'), 'member-management.js should not have hardcoded Korean table headers');
        assert.ok(!MEMBER_MANAGEMENT_JS.includes('<th>역할</th>'), 'member-management.js should not have hardcoded Korean table headers');
        assert.ok(!MEMBER_MANAGEMENT_JS.includes('<th>상태</th>'), 'member-management.js should not have hardcoded Korean table headers');
        assert.ok(!MEMBER_MANAGEMENT_JS.includes('<th>가입일</th>'), 'member-management.js should not have hardcoded Korean table headers');
        assert.ok(!MEMBER_MANAGEMENT_JS.includes('<th>관리</th>'), 'member-management.js should not have hardcoded Korean table headers');
    });

});