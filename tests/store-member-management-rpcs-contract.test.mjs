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

const MIGRATION_PATH = 'supabase/migrations/20260711001700_store_member_management_rpcs.sql';

// Extract the function body using CREATE OR REPLACE FUNCTION as delimiter
function getFuncBlock(content, funcName) {
    var marker = 'CREATE OR REPLACE FUNCTION public.' + funcName;
    var start = content.indexOf(marker);
    assert.ok(start >= 0, 'Function ' + funcName + ' not found in migration');
    // Find the next CREATE OR REPLACE FUNCTION or end of file
    var nextFunc = content.indexOf('CREATE OR REPLACE FUNCTION', start + marker.length);
    if (nextFunc > start) {
        return content.substring(start, nextFunc);
    }
    return content.substring(start);
}

describe('Store Member Management RPCs Contract (3-6E.5)', function () {

    // ============================================================
    // Migration file existence
    // ============================================================

    it('A: migration file 20260711001700 exists', function () {
        const content = readFile(MIGRATION_PATH);
        assert.ok(content.length > 0, 'Migration file must not be empty');
    });

    // ============================================================
    // list_store_members function
    // ============================================================

    it('B: list_store_members function exists', function () {
        const content = readFile(MIGRATION_PATH);
        assert.match(content, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.list_store_members\s*\(\s*\)/i,
            'list_store_members function must exist');
    });

    it('C: list_store_members has SECURITY DEFINER', function () {
        const content = readFile(MIGRATION_PATH);
        const funcBlock = getFuncBlock(content, 'list_store_members');
        assert.match(funcBlock, /SECURITY\s+DEFINER/i,
            'list_store_members must have SECURITY DEFINER');
    });

    it('D: list_store_members has SET search_path = \'\'', function () {
        const content = readFile(MIGRATION_PATH);
        const funcBlock = getFuncBlock(content, 'list_store_members');
        assert.match(funcBlock, /SET\s+search_path\s*=\s*''/i,
            'list_store_members must have SET search_path = \'\'');
    });

    it('E: list_store_members uses auth.uid()', function () {
        const content = readFile(MIGRATION_PATH);
        const funcBlock = getFuncBlock(content, 'list_store_members');
        assert.match(funcBlock, /auth\.uid\(\)/,
            'list_store_members must use auth.uid()');
    });

    it('F: list_store_members enforces owner-only via role = \'owner\'', function () {
        const content = readFile(MIGRATION_PATH);
        const funcBlock = getFuncBlock(content, 'list_store_members');
        assert.match(funcBlock, /sm\.role\s*=\s*'owner'/,
            'list_store_members must check role = owner');
        assert.match(funcBlock, /sm\.is_active\s*=\s*true/,
            'list_store_members must check is_active = true');
    });

    it('G: list_store_members checks stores.deleted_at IS NULL', function () {
        const content = readFile(MIGRATION_PATH);
        const funcBlock = getFuncBlock(content, 'list_store_members');
        assert.match(funcBlock, /s\.deleted_at\s+IS\s+NULL/i,
            'list_store_members must exclude deleted stores');
    });

    it('H: list_store_members queries public.store_members', function () {
        const content = readFile(MIGRATION_PATH);
        const funcBlock = getFuncBlock(content, 'list_store_members');
        assert.match(funcBlock, /public\.store_members/,
            'list_store_members must query public.store_members');
    });

    it('I: list_store_members returns masked_email', function () {
        const content = readFile(MIGRATION_PATH);
        const funcBlock = getFuncBlock(content, 'list_store_members');
        assert.match(funcBlock, /masked_email/i,
            'list_store_members must return masked_email column');
        assert.match(funcBlock, /position\('@'/i,
            'masked_email must use position-based masking logic');
    });

    it('J: list_store_members does NOT return user_id', function () {
        const content = readFile(MIGRATION_PATH);
        const funcBlock = getFuncBlock(content, 'list_store_members');
        const returnsBlock = funcBlock.substring(
            funcBlock.indexOf('RETURNS'),
            funcBlock.indexOf('LANGUAGE')
        );
        assert.doesNotMatch(returnsBlock, /user_id/i,
            'list_store_members must NOT return user_id');
    });

    it('K: list_store_members does NOT return store_id', function () {
        const content = readFile(MIGRATION_PATH);
        const funcBlock = getFuncBlock(content, 'list_store_members');
        const returnsBlock = funcBlock.substring(
            funcBlock.indexOf('RETURNS'),
            funcBlock.indexOf('LANGUAGE')
        );
        assert.doesNotMatch(returnsBlock, /store_id/i,
            'list_store_members must NOT return store_id');
    });

    // ============================================================
    // deactivate_store_member function
    // ============================================================

    it('L: deactivate_store_member function exists', function () {
        const content = readFile(MIGRATION_PATH);
        assert.match(content, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.deactivate_store_member\s*\(\s*p_member_id\s+uuid\s*\)/i,
            'deactivate_store_member function must exist with p_member_id uuid parameter');
    });

    it('M: deactivate_store_member has SECURITY DEFINER', function () {
        const content = readFile(MIGRATION_PATH);
        const funcBlock = getFuncBlock(content, 'deactivate_store_member');
        assert.match(funcBlock, /SECURITY\s+DEFINER/i,
            'deactivate_store_member must have SECURITY DEFINER');
    });

    it('N: deactivate_store_member has SET search_path = \'\'', function () {
        const content = readFile(MIGRATION_PATH);
        const funcBlock = getFuncBlock(content, 'deactivate_store_member');
        assert.match(funcBlock, /SET\s+search_path\s*=\s*''/i,
            'deactivate_store_member must have SET search_path = \'\'');
    });

    it('O: deactivate_store_member uses auth.uid()', function () {
        const content = readFile(MIGRATION_PATH);
        const funcBlock = getFuncBlock(content, 'deactivate_store_member');
        assert.match(funcBlock, /auth\.uid\(\)/,
            'deactivate_store_member must use auth.uid()');
    });

    it('P: deactivate_store_member blocks p_member_id NULL', function () {
        const content = readFile(MIGRATION_PATH);
        const funcBlock = getFuncBlock(content, 'deactivate_store_member');
        assert.match(funcBlock, /p_member_id\s+IS\s+NULL/i,
            'deactivate_store_member must block null p_member_id');
    });

    it('Q: deactivate_store_member enforces owner-only', function () {
        const content = readFile(MIGRATION_PATH);
        const funcBlock = getFuncBlock(content, 'deactivate_store_member');
        assert.match(funcBlock, /sm\.role\s*=\s*'owner'/,
            'deactivate_store_member must check role = owner');
        assert.match(funcBlock, /sm\.is_active\s*=\s*true/,
            'deactivate_store_member must check is_active = true');
    });

    it('R: deactivate_store_member checks stores.deleted_at IS NULL', function () {
        const content = readFile(MIGRATION_PATH);
        const funcBlock = getFuncBlock(content, 'deactivate_store_member');
        assert.match(funcBlock, /s\.deleted_at\s+IS\s+NULL/i,
            'deactivate_store_member must exclude deleted stores');
    });

    it('S: deactivate_store_member enforces same-store scope', function () {
        const content = readFile(MIGRATION_PATH);
        const funcBlock = getFuncBlock(content, 'deactivate_store_member');
        assert.match(funcBlock, /store_id\s*=\s*v_store_id/i,
            'deactivate_store_member must check same store_id');
    });

    it('T: deactivate_store_member blocks owner role deactivation', function () {
        const content = readFile(MIGRATION_PATH);
        const funcBlock = getFuncBlock(content, 'deactivate_store_member');
        assert.match(funcBlock, /v_member\.role\s*=\s*'owner'/i,
            'deactivate_store_member must block deactivation of owner role members');
    });

    it('U: deactivate_store_member blocks self-deactivation', function () {
        const content = readFile(MIGRATION_PATH);
        const funcBlock = getFuncBlock(content, 'deactivate_store_member');
        assert.match(funcBlock, /v_member\.user_id\s*=\s*v_uid/i,
            'deactivate_store_member must block self-deactivation');
    });

    it('V: deactivate_store_member does NOT use DELETE', function () {
        const content = readFile(MIGRATION_PATH);
        const funcBlock = getFuncBlock(content, 'deactivate_store_member');
        assert.doesNotMatch(funcBlock, /DELETE\s+FROM/i,
            'deactivate_store_member must NOT use DELETE FROM');
    });

    it('W: deactivate_store_member uses is_active=false update', function () {
        const content = readFile(MIGRATION_PATH);
        const funcBlock = getFuncBlock(content, 'deactivate_store_member');
        assert.match(funcBlock, /is_active\s*=\s*false/i,
            'deactivate_store_member must set is_active=false');
        assert.match(funcBlock, /UPDATE\s+public\.store_members/i,
            'deactivate_store_member must UPDATE public.store_members');
    });

    it('X: deactivate_store_member has idempotent return for already-inactive', function () {
        const content = readFile(MIGRATION_PATH);
        const funcBlock = getFuncBlock(content, 'deactivate_store_member');
        assert.match(funcBlock, /is_active\s*=\s*false/i,
            'deactivate_store_member must check is_active = false');
        assert.match(funcBlock, /RETURN\s+true/i,
            'deactivate_store_member must return true for already-inactive');
    });

    // ============================================================
    // Permissions
    // ============================================================

    it('Y: REVOKE ALL FROM PUBLIC for both functions', function () {
        const content = readFile(MIGRATION_PATH);
        assert.match(content, /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.list_store_members\s*\(\s*\)\s+FROM\s+PUBLIC/i,
            'list_store_members must REVOKE ALL FROM PUBLIC');
        assert.match(content, /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.deactivate_store_member\s*\(\s*uuid\s*\)\s+FROM\s+PUBLIC/i,
            'deactivate_store_member must REVOKE ALL FROM PUBLIC');
    });

    it('Z: REVOKE ALL FROM anon for both functions', function () {
        const content = readFile(MIGRATION_PATH);
        assert.match(content, /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.list_store_members\s*\(\s*\)\s+FROM\s+anon/i,
            'list_store_members must REVOKE ALL FROM anon');
        assert.match(content, /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.deactivate_store_member\s*\(\s*uuid\s*\)\s+FROM\s+anon/i,
            'deactivate_store_member must REVOKE ALL FROM anon');
    });

    it('AA: GRANT EXECUTE TO authenticated for both functions', function () {
        const content = readFile(MIGRATION_PATH);
        assert.match(content, /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.list_store_members\s*\(\s*\)\s+TO\s+authenticated/i,
            'list_store_members must GRANT EXECUTE TO authenticated');
        assert.match(content, /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.deactivate_store_member\s*\(\s*uuid\s*\)\s+TO\s+authenticated/i,
            'deactivate_store_member must GRANT EXECUTE TO authenticated');
    });

    // ============================================================
    // Security: no dangerous patterns
    // ============================================================

    it('AB: no service_role string in migration', function () {
        const content = readFile(MIGRATION_PATH);
        assert.doesNotMatch(content, /service_role/i,
            'Migration must not contain service_role');
    });

    it('AC: no dynamic SQL (EXECUTE or format with SQL)', function () {
        const content = readFile(MIGRATION_PATH);
        // GRANT EXECUTE is allowed — only dynamic SQL EXECUTE is blocked
        var lines = content.split('\n');
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            if (/\bEXECUTE\b/i.test(line) && !/GRANT\s+EXECUTE/i.test(line)) {
                assert.fail('Migration must not use dynamic SQL EXECUTE (found in line: ' + line.trim() + ')');
            }
        }
        assert.doesNotMatch(content, /format\s*\(/i,
            'Migration must not use format() for dynamic SQL');
    });

    it('AD: no DELETE FROM public.store_members', function () {
        const content = readFile(MIGRATION_PATH);
        assert.doesNotMatch(content, /DELETE\s+FROM\s+public\.store_members/i,
            'Migration must not DELETE FROM public.store_members');
    });

    it('AE: no token/key/password in migration', function () {
        const content = readFile(MIGRATION_PATH);
        assert.doesNotMatch(content, /\b(token|password|secret|api_key)\b/i,
            'Migration must not contain token/password/secret/api_key');
    });

    // ============================================================
    // No modification of existing functions
    // ============================================================

    it('AF: does not modify create_initial_store', function () {
        const content = readFile(MIGRATION_PATH);
        assert.doesNotMatch(content, /create_initial_store/i,
            'Migration must not modify create_initial_store');
    });

    it('AG: does not modify generate_store_invite_code', function () {
        const content = readFile(MIGRATION_PATH);
        assert.doesNotMatch(content, /generate_store_invite_code/i,
            'Migration must not modify generate_store_invite_code');
    });

    it('AH: does not modify list_store_invite_codes', function () {
        const content = readFile(MIGRATION_PATH);
        assert.doesNotMatch(content, /list_store_invite_codes/i,
            'Migration must not modify list_store_invite_codes');
    });

    it('AI: does not modify revoke_store_invite_code', function () {
        const content = readFile(MIGRATION_PATH);
        assert.doesNotMatch(content, /revoke_store_invite_code/i,
            'Migration must not modify revoke_store_invite_code');
    });
});
