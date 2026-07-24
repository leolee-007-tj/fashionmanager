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

const MIGRATION_FILE = 'supabase/migrations/20260711001400_generate_store_invite_code_rpc.sql';

describe('Generate Store Invite Code RPC Contract (3-6E.3)', function () {

    it('A: migration file exists', function () {
        const content = readFile(MIGRATION_FILE);
        assert.ok(content.length > 0, 'migration file should not be empty');
    });

    it('B: defines generate_store_invite_code function', function () {
        const content = readFile(MIGRATION_FILE);
        assert.match(content, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.generate_store_invite_code\s*\(/i,
            'must define public.generate_store_invite_code function');
    });

    it('C: returns text', function () {
        const content = readFile(MIGRATION_FILE);
        assert.match(content, /RETURNS\s+text/i,
            'function must return text');
    });

    it('D: uses SECURITY DEFINER', function () {
        const content = readFile(MIGRATION_FILE);
        assert.match(content, /SECURITY\s+DEFINER/i,
            'function must use SECURITY DEFINER');
    });

    it('E: sets search_path to empty string', function () {
        const content = readFile(MIGRATION_FILE);
        assert.match(content, /SET\s+search_path\s*=\s*''/i,
            'function must set search_path = empty string');
    });

    it('F: uses auth.uid() for caller identity', function () {
        const content = readFile(MIGRATION_FILE);
        assert.match(content, /auth\.uid\s*\(\s*\)/i,
            'function must use auth.uid()');
    });

    it('G: enforces owner-only access via store_members', function () {
        const content = readFile(MIGRATION_FILE);
        assert.match(content, /store_members/i,
            'must reference store_members for ownership check');
        assert.match(content, /role\s*=\s*'owner'/i,
            'must check for owner role');
        assert.match(content, /is_active\s*=\s*true/i,
            'must check active membership');
        assert.match(content, /Only store owners can generate invite codes/i,
            'must have owner-only error message');
    });

    it('H: blocks owner role invitations', function () {
        const content = readFile(MIGRATION_FILE);
        assert.match(content, /Owner role invitations are not allowed/i,
            'must explicitly block owner role invitations');
    });

    it('I: allows manager and staff roles', function () {
        const content = readFile(MIGRATION_FILE);
        assert.match(content, /'manager'/,
            'must reference manager role');
        assert.match(content, /'staff'/,
            'must reference staff role');
        assert.match(content, /IN\s*\(\s*'manager'\s*,\s*'staff'\s*\)/i,
            'must check role IN (manager, staff)');
    });

    it('J: validates expires_in_days between 1 and 30', function () {
        const content = readFile(MIGRATION_FILE);
        assert.match(content, /expires_in_days.*<\s*1.*> 30|1\s*.*expires_in_days.*30/i,
            'must validate expires_in_days range');
        assert.match(content, /must be between 1 and 30/i,
            'must have range error message');
    });

    it('K: inserts into public.store_invitations', function () {
        const content = readFile(MIGRATION_FILE);
        assert.match(content, /INSERT\s+INTO\s+public\.store_invitations/i,
            'must insert into public.store_invitations');
    });

    it('L: does NOT insert into public.stores', function () {
        const content = readFile(MIGRATION_FILE);
        assert.doesNotMatch(content, /INSERT\s+INTO\s+public\.stores/i,
            'must NOT insert into public.stores');
    });

    it('M: does NOT insert into public.store_members', function () {
        const content = readFile(MIGRATION_FILE);
        assert.doesNotMatch(content, /INSERT\s+INTO\s+public\.store_members/i,
            'must NOT insert into public.store_members');
    });

    it('N: REVOKE ALL ON FUNCTION FROM PUBLIC', function () {
        const content = readFile(MIGRATION_FILE);
        assert.match(content, /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.generate_store_invite_code\s*\(.*\)\s+FROM\s+PUBLIC/i,
            'must revoke all from PUBLIC');
    });

    it('O: REVOKE ALL ON FUNCTION FROM anon', function () {
        const content = readFile(MIGRATION_FILE);
        assert.match(content, /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.generate_store_invite_code\s*\(.*\)\s+FROM\s+anon/i,
            'must revoke all from anon');
    });

    it('P: GRANT EXECUTE TO authenticated', function () {
        const content = readFile(MIGRATION_FILE);
        assert.match(content, /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.generate_store_invite_code\s*\(.*\)\s+TO\s+authenticated/i,
            'must grant execute to authenticated');
    });

    it('Q: does NOT grant to anon', function () {
        const content = readFile(MIGRATION_FILE);
        assert.doesNotMatch(content, /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.generate_store_invite_code\s*\(.*\)\s+TO\s+anon/i,
            'must NOT grant execute to anon');
    });

    it('R: no service_role string in file', function () {
        const content = readFile(MIGRATION_FILE);
        assert.doesNotMatch(content, /service_role/i,
            'must not contain service_role');
    });

    it('S: checks stores.deleted_at IS NULL (deleted store protection)', function () {
        const content = readFile(MIGRATION_FILE);
        assert.match(content, /s\.deleted_at\s+IS\s+NULL/i,
            'must check stores.deleted_at IS NULL to exclude deleted stores');
    });

    it('T: handles invited_email with lower(trim())', function () {
        const content = readFile(MIGRATION_FILE);
        assert.match(content, /lower\s*\(\s*trim\s*\(/i,
            'must use lower(trim()) for invited_email normalization');
    });

    it('U: empty invited_email becomes NULL', function () {
        const content = readFile(MIGRATION_FILE);
        assert.match(content, /v_invited_email\s*:=\s*NULL/i,
            'must set invited_email to NULL when empty');
    });

    it('V: unique_violation retry logic exists', function () {
        const content = readFile(MIGRATION_FILE);
        assert.match(content, /unique_violation/i,
            'must handle unique_violation for invite code collision retry');
    });

    it('W: function signature has 3 parameters with defaults', function () {
        const content = readFile(MIGRATION_FILE);
        assert.match(content, /p_role\s+public\.member_role\s+DEFAULT/i,
            'must have p_role parameter with DEFAULT');
        assert.match(content, /p_invited_email\s+text\s+DEFAULT/i,
            'must have p_invited_email parameter with DEFAULT');
        assert.match(content, /p_expires_in_days\s+integer\s+DEFAULT/i,
            'must have p_expires_in_days parameter with DEFAULT');
    });

    it('X: does not modify create_initial_store', function () {
        const content = readFile(MIGRATION_FILE);
        assert.doesNotMatch(content, /create_initial_store/i,
            'must NOT mention create_initial_store');
    });

});

// ============================================================
// Migration 016: Fix gen_random_bytes search_path
// ============================================================

const FIX_MIGRATION_FILE = 'supabase/migrations/20260711001600_fix_gen_random_bytes_search_path.sql';

describe('Fix gen_random_bytes search_path Contract (016)', function () {

    it('A: fix migration file exists', function () {
        const content = readFile(FIX_MIGRATION_FILE);
        assert.ok(content.length > 0, 'fix migration file should not be empty');
    });

    it('B: uses extensions.gen_random_bytes (schema-qualified)', function () {
        const content = readFile(FIX_MIGRATION_FILE);
        assert.match(content, /extensions\.gen_random_bytes/i,
            'must use extensions.gen_random_bytes for SET search_path = "" compatibility');
    });

    it('C: does NOT use unqualified gen_random_bytes', function () {
        const content = readFile(FIX_MIGRATION_FILE);
        const nonCommentLines = content.split('\n').filter(l => !l.trim().startsWith('--'));
        const code = nonCommentLines.join('\n');
        // Should NOT have gen_random_bytes without extensions. prefix
        assert.doesNotMatch(code, /(?<!extensions\.)gen_random_bytes/i,
            'must not use unqualified gen_random_bytes');
    });

    it('D: still uses SECURITY DEFINER', function () {
        const content = readFile(FIX_MIGRATION_FILE);
        assert.match(content, /SECURITY\s+DEFINER/i,
            'fix must still use SECURITY DEFINER');
    });

    it('E: still uses SET search_path = empty string', function () {
        const content = readFile(FIX_MIGRATION_FILE);
        assert.match(content, /SET\s+search_path\s*=\s*''/i,
            'fix must still set search_path = empty string');
    });

    it('F: re-applies REVOKE ALL FROM PUBLIC', function () {
        const content = readFile(FIX_MIGRATION_FILE);
        assert.match(content, /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.generate_store_invite_code\s*\(.*\)\s+FROM\s+PUBLIC/i,
            'fix must re-apply REVOKE ALL FROM PUBLIC');
    });

    it('G: re-applies GRANT EXECUTE TO authenticated', function () {
        const content = readFile(FIX_MIGRATION_FILE);
        assert.match(content, /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.generate_store_invite_code\s*\(.*\)\s+TO\s+authenticated/i,
            'fix must re-apply GRANT EXECUTE TO authenticated');
    });

    it('H: no service_role string', function () {
        const content = readFile(FIX_MIGRATION_FILE);
        assert.doesNotMatch(content, /service_role/i,
            'must not contain service_role');
    });

});
