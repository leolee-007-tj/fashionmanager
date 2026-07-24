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

const MIGRATION_FILE = 'supabase/migrations/20260711001500_store_invitation_management_rpcs.sql';

describe('Store Invitation Management RPCs Contract (3-6E.3.2)', function () {

    it('A: migration file exists', function () {
        const content = readFile(MIGRATION_FILE);
        assert.ok(content.length > 0, 'migration file should not be empty');
    });

    it('B: defines list_store_invite_codes function', function () {
        const content = readFile(MIGRATION_FILE);
        assert.match(content, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.list_store_invite_codes\s*\(\s*\)/i,
            'must define public.list_store_invite_codes()');
    });

    it('C: defines revoke_store_invite_code function', function () {
        const content = readFile(MIGRATION_FILE);
        assert.match(content, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.revoke_store_invite_code\s*\(/i,
            'must define public.revoke_store_invite_code()');
    });

    it('D: both functions use SECURITY DEFINER', function () {
        const content = readFile(MIGRATION_FILE);
        const nonCommentLines = content.split('\n').filter(l => !l.trim().startsWith('--'));
        const securityDefinerMatches = nonCommentLines.join('\n').match(/SECURITY\s+DEFINER/gi) || [];
        assert.strictEqual(securityDefinerMatches.length, 2,
            'both functions must use SECURITY DEFINER (count: 2)');
    });

    it('E: both functions SET search_path = empty string', function () {
        const content = readFile(MIGRATION_FILE);
        const nonCommentLines = content.split('\n').filter(l => !l.trim().startsWith('--'));
        const searchPathMatches = nonCommentLines.join('\n').match(/SET\s+search_path\s*=\s*''/gi) || [];
        assert.strictEqual(searchPathMatches.length, 2,
            'both functions must set search_path = empty string (count: 2)');
    });

    it('F: both functions use auth.uid()', function () {
        const content = readFile(MIGRATION_FILE);
        const authUidMatches = content.match(/auth\.uid\s*\(\s*\)/gi) || [];
        assert.ok(authUidMatches.length >= 2,
            'both functions must use auth.uid() (count >= 2)');
    });

    it('G: both functions enforce owner-only via store_members', function () {
        const content = readFile(MIGRATION_FILE);
        assert.match(content, /store_members/i,
            'must reference store_members for ownership check');
        const ownerRoleMatches = content.match(/role\s*=\s*'owner'/gi) || [];
        assert.ok(ownerRoleMatches.length >= 2,
            'must check for owner role in both functions (count >= 2)');
        const isActiveMatches = content.match(/is_active\s*=\s*true/gi) || [];
        assert.ok(isActiveMatches.length >= 2,
            'must check active membership in both functions (count >= 2)');
    });

    it('H: both functions check stores.deleted_at IS NULL', function () {
        const content = readFile(MIGRATION_FILE);
        const deletedCheckMatches = content.match(/s\.deleted_at\s+IS\s+NULL/gi) || [];
        assert.ok(deletedCheckMatches.length >= 2,
            'both functions must check stores.deleted_at IS NULL (count >= 2)');
    });

    it('I: list function returns store_invitations with status calculation', function () {
        const content = readFile(MIGRATION_FILE);
        assert.match(content, /FROM\s+public\.store_invitations\s+si/i,
            'list function must query from public.store_invitations');
        assert.match(content, /ELSE\s+'active'/i,
            'list function must include status calculation with active default');
        assert.match(content, /'revoked'/,
            'list function must include revoked status');
        assert.match(content, /'used'/,
            'list function must include used status');
        assert.match(content, /'expired'/,
            'list function must include expired status');
    });

    it('J: list function orders by created_at DESC', function () {
        const content = readFile(MIGRATION_FILE);
        assert.match(content, /ORDER\s+BY\s+.*created_at\s+DESC/i,
            'list function must order by created_at DESC');
    });

    it('K: list function only shows invites for caller store', function () {
        const content = readFile(MIGRATION_FILE);
        assert.match(content, /WHERE\s+si\.store_id\s*=\s*v_store_id/i,
            'list function must filter by store_id from owner membership');
    });

    it('L: revoke function blocks NULL p_invitation_id', function () {
        const content = readFile(MIGRATION_FILE);
        assert.match(content, /p_invitation_id\s+IS\s+NULL/i,
            'revoke function must block NULL p_invitation_id');
        assert.match(content, /Invitation ID is required/i,
            'must have error message for NULL invitation ID');
    });

    it('M: revoke function blocks already-used invites', function () {
        const content = readFile(MIGRATION_FILE);
        assert.match(content, /used_at\s+IS\s+NOT\s+NULL/i,
            'revoke function must check used_at IS NOT NULL');
        assert.match(content, /Cannot revoke an invite code that has already been used/i,
            'must have error message for used invite revocation');
    });

    it('N: revoke function updates revoked_at and revoked_by', function () {
        const content = readFile(MIGRATION_FILE);
        assert.match(content, /SET\s+revoked_at\s*=\s*now\s*\(\s*\)/i,
            'revoke function must set revoked_at = now()');
        assert.match(content, /revoked_by\s*=\s*v_uid/i,
            'revoke function must set revoked_by = v_uid');
    });

    it('O: revoke function filters by caller store_id', function () {
        const content = readFile(MIGRATION_FILE);
        assert.match(content, /AND\s+store_id\s*=\s*v_store_id/i,
            'revoke function must filter by store_id');
    });

    it('P: revoke function handles already-revoked idempotently', function () {
        const content = readFile(MIGRATION_FILE);
        assert.match(content, /revoked_at\s+IS\s+NOT\s+NULL.*RETURN\s+true/si,
            'revoke function must return true idempotently for already-revoked invites');
    });

    it('Q: does NOT insert/update/delete into public.stores', function () {
        const content = readFile(MIGRATION_FILE);
        assert.doesNotMatch(content, /INSERT\s+INTO\s+public\.stores/i,
            'must NOT insert into public.stores');
        assert.doesNotMatch(content, /UPDATE\s+public\.stores/i,
            'must NOT update public.stores');
        assert.doesNotMatch(content, /DELETE.*FROM\s+public\.stores/i,
            'must NOT delete from public.stores');
    });

    it('R: does NOT insert/update/delete into public.store_members', function () {
        const content = readFile(MIGRATION_FILE);
        assert.doesNotMatch(content, /INSERT\s+INTO\s+public\.store_members/i,
            'must NOT insert into public.store_members');
        assert.doesNotMatch(content, /UPDATE\s+public\.store_members/i,
            'must NOT update public.store_members');
        assert.doesNotMatch(content, /DELETE.*FROM\s+public\.store_members/i,
            'must NOT delete from public.store_members');
    });

    it('S: REVOKE ALL ON FUNCTION FROM PUBLIC for both functions', function () {
        const content = readFile(MIGRATION_FILE);
        const revokePublicMatches = content.match(/REVOKE\s+ALL\s+ON\s+FUNCTION.*FROM\s+PUBLIC/gi) || [];
        assert.ok(revokePublicMatches.length >= 2,
            'must revoke all from PUBLIC for both functions (count >= 2)');
    });

    it('T: REVOKE ALL ON FUNCTION FROM anon for both functions', function () {
        const content = readFile(MIGRATION_FILE);
        const revokeAnonMatches = content.match(/REVOKE\s+ALL\s+ON\s+FUNCTION.*FROM\s+anon/gi) || [];
        assert.ok(revokeAnonMatches.length >= 2,
            'must revoke all from anon for both functions (count >= 2)');
    });

    it('U: GRANT EXECUTE ON FUNCTION TO authenticated for both functions', function () {
        const content = readFile(MIGRATION_FILE);
        const grantMatches = content.match(/GRANT\s+EXECUTE\s+ON\s+FUNCTION.*TO\s+authenticated/gi) || [];
        assert.ok(grantMatches.length >= 2,
            'must grant execute to authenticated for both functions (count >= 2)');
    });

    it('V: no service_role string in file', function () {
        const content = readFile(MIGRATION_FILE);
        assert.doesNotMatch(content, /service_role/i,
            'must not contain service_role');
    });

    it('W: does NOT mention create_initial_store', function () {
        const content = readFile(MIGRATION_FILE);
        assert.doesNotMatch(content, /create_initial_store/i,
            'must NOT mention create_initial_store');
    });

    it('X: does NOT mention generate_store_invite_code', function () {
        const content = readFile(MIGRATION_FILE);
        assert.doesNotMatch(content, /generate_store_invite_code/i,
            'must NOT mention generate_store_invite_code');
    });

    it('Y: revoke function uses GET DIAGNOSTICS for row count', function () {
        const content = readFile(MIGRATION_FILE);
        assert.match(content, /GET\s+DIAGNOSTICS/i,
            'revoke function must use GET DIAGNOSTICS for row count');
    });

    it('Z: revoke returns boolean', function () {
        const content = readFile(MIGRATION_FILE);
        assert.match(content, /RETURNS\s+boolean/i,
            'revoke function must return boolean');
    });

});
