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

const MIGRATION_FILE = 'supabase/migrations/20260711001300_create_initial_store_invite_code_hardening.sql';
const PREVIOUS_MIGRATION = 'supabase/migrations/20260711001200_store_invitations.sql';

describe('create_initial_store Invite-code Hardening Contract (3-6E.2)', function () {

    it('A: migration file 20260711001300_create_initial_store_invite_code_hardening.sql exists', function () {
        const content = readFile(MIGRATION_FILE);
        assert.ok(content.length > 0, 'migration file should not be empty');
    });

    it('B: old 3-arg create_initial_store is revoked and dropped', function () {
        const content = readFile(MIGRATION_FILE);
        assert.match(content, /DROP FUNCTION IF EXISTS\s+public\.create_initial_store\s*\(\s*text\s*,\s*text\s*,\s*text\s*\)/i,
            'must drop old 3-arg create_initial_store signature');
        assert.match(content, /REVOKE EXECUTE ON FUNCTION public\.create_initial_store\(text, text, text\) FROM authenticated/i,
            'must revoke authenticated execute on old 3-arg signature');
    });

    it('C: new 4-arg create_initial_store includes p_invite_code', function () {
        const content = readFile(MIGRATION_FILE);
        assert.match(content, /CREATE OR REPLACE FUNCTION\s+public\.create_initial_store\s*\([^)]*p_invite_code\s+text\s+DEFAULT\s+NULL/s,
            'must declare p_invite_code text DEFAULT NULL');
    });

    it('D: SECURITY DEFINER and SET search_path are present', function () {
        const content = readFile(MIGRATION_FILE);
        assert.match(content, /SECURITY DEFINER/i,
            'function must be SECURITY DEFINER');
        assert.match(content, /SET search_path = ''/i,
            'function must set search_path to empty');
    });

    it('E: idempotent owner lookup runs before invite-code required check', function () {
        const content = readFile(MIGRATION_FILE);
        const ownerLookupIdx = content.search(/sm\.role\s*=\s*'owner'/i);
        const inviteRequiredIdx = content.search(/Invite code is required/i);
        assert.ok(ownerLookupIdx > 0, 'must have owner role lookup');
        assert.ok(inviteRequiredIdx > 0, 'must have invite-code required check');
        assert.ok(ownerLookupIdx < inviteRequiredIdx,
            'owner lookup must appear before invite-code required check');
    });

    it('F: p_invite_code NULL or empty is rejected', function () {
        const content = readFile(MIGRATION_FILE);
        assert.match(content, /trim\s*\(\s*COALESCE\s*\(\s*p_invite_code\s*,\s*''\s*\)\s*\)/i,
            'must sanitize p_invite_code with COALESCE and trim');
        assert.match(content, /Invite code is required/i,
            'must reject missing invite code with "Invite code is required"');
    });

    it('G: invalid invite_code is rejected', function () {
        const content = readFile(MIGRATION_FILE);
        assert.match(content, /Invalid invite code/i,
            'must reject invalid invite code');
    });

    it('H: used invite_code is rejected', function () {
        const content = readFile(MIGRATION_FILE);
        assert.match(content, /used_at\s+IS\s+NOT\s+NULL\s+OR\s+v_invite\.used_by\s+IS\s+NOT\s+NULL/i,
            'must check used_at or used_by');
        assert.match(content, /Invite code already used/i,
            'must reject used invite code');
    });

    it('I: revoked invite_code is rejected', function () {
        const content = readFile(MIGRATION_FILE);
        assert.match(content, /revoked_at\s+IS\s+NOT\s+NULL/i,
            'must check revoked_at');
        assert.match(content, /Invite code has been revoked/i,
            'must reject revoked invite code');
    });

    it('J: expired invite_code is rejected', function () {
        const content = readFile(MIGRATION_FILE);
        assert.match(content, /expires_at\s+IS\s+NOT\s+NULL\s+AND\s+v_invite\.expires_at\s*<=\s*now\s*\(\s*\)/i,
            'must compare expires_at against now()');
        assert.match(content, /Invite code has expired/i,
            'must reject expired invite code');
    });

    it('K: invited_email matching check exists', function () {
        const content = readFile(MIGRATION_FILE);
        assert.match(content, /invited_email\s+IS\s+NOT\s+NULL/i,
            'must check invited_email');
        assert.match(content, /lower\s*\(\s*COALESCE\s*\(\s*v_user_email\s*,\s*''\s*\)\s*\)\s*(!=|<>\s*)\s*lower\s*\(\s*trim\s*\(\s*v_invite\.invited_email\s*\)\s*\)/i,
            'must compare lower-case trimmed emails');
        assert.match(content, /Invite code is not associated with your account/i,
            'must reject email-mismatched invite');
    });

    it('L: owner role invitations are rejected (only manager/staff allowed)', function () {
        const content = readFile(MIGRATION_FILE);
        assert.match(content, /v_invite\.role\s*=\s*'owner'/i,
            'must check invite role is owner');
        assert.match(content, /Owner role invitations are not allowed/i,
            'must reject owner role invitations');
    });

    it('M: SELECT ... FOR UPDATE is used on store_invitations lookup', function () {
        const content = readFile(MIGRATION_FILE);
        assert.match(content, /FROM\s+public\.store_invitations[\s\S]*FOR\s+UPDATE/i,
            'must lock invitation row with FOR UPDATE');
    });

    it('N: store_members INSERT is performed for valid invite', function () {
        const content = readFile(MIGRATION_FILE);
        assert.match(content, /INSERT INTO\s+public\.store_members\s*\(\s*store_id\s*,\s*user_id\s*,\s*role\s*,\s*is_active\s*,\s*invited_by\s*\)/i,
            'must insert membership for valid invite');
    });

    it('O: store_invitations used_at and used_by are updated', function () {
        const content = readFile(MIGRATION_FILE);
        assert.match(content, /UPDATE\s+public\.store_invitations[\s\S]*SET[\s\S]*used_at\s*=\s*now\s*\(\s*\)/i,
            'must update used_at to now()');
        assert.match(content, /used_by\s*=\s*v_uid/i,
            'must update used_by to auth uid');
    });

    it('P: new-user path does NOT insert into public.stores', function () {
        const content = readFile(MIGRATION_FILE);
        assert.doesNotMatch(content, /INSERT INTO\s+public\.stores\s*\(/i,
            'must NOT create a new public.stores row in invite-only onboarding');
    });

    it('Q: store_invitations direct DML is not newly granted', function () {
        const prevContent = readFile(PREVIOUS_MIGRATION);
        assert.doesNotMatch(prevContent, /GRANT\s+(INSERT|UPDATE|DELETE)\s+ON\s+public\.store_invitations\s+TO\s+authenticated/i,
            'previous migration must not grant direct DML on store_invitations');
    });

    it('R: remote db push commands are not embedded in the migration', function () {
        const content = readFile(MIGRATION_FILE);
        assert.doesNotMatch(content, /supabase\s+db\s+push/i,
            'migration must not contain supabase db push');
        assert.doesNotMatch(content, /supabase\s+db\s+reset/i,
            'migration must not contain supabase db reset');
        assert.doesNotMatch(content, /supabase\s+db\s+pull/i,
            'migration must not contain supabase db pull');
    });

    it('S: new 4-arg function is granted to authenticated only', function () {
        const content = readFile(MIGRATION_FILE);
        assert.match(content, /GRANT EXECUTE ON FUNCTION public\.create_initial_store\(text, text, text, text\) TO authenticated/i,
            'must grant new 4-arg function to authenticated');
        assert.match(content, /REVOKE ALL ON FUNCTION public\.create_initial_store\(text, text, text, text\) FROM PUBLIC/i,
            'must revoke new 4-arg function from PUBLIC');
        assert.match(content, /REVOKE ALL ON FUNCTION public\.create_initial_store\(text, text, text, text\) FROM anon/i,
            'must revoke new 4-arg function from anon');
    });

});
