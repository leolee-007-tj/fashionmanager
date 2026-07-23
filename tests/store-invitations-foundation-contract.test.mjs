import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

function readFile(relativePath) {
    const fullPath = join(__dirname, '..', relativePath);
    assert.ok(existsSync(fullPath), `File should exist: ${relativePath}`);
    return readFileSync(fullPath, 'utf-8');
}

const MIGRATION_FILE = 'supabase/migrations/20260711001200_store_invitations.sql';

describe('Store Invitations Foundation Contract (3-6E.1)', function () {

    it('A: migration file 20260711001200_store_invitations.sql exists', function () {
        const content = readFile(MIGRATION_FILE);
        assert.ok(content.length > 0, 'migration file should not be empty');
    });

    it('B: creates table public.store_invitations', function () {
        const content = readFile(MIGRATION_FILE);
        assert.match(content, /CREATE TABLE\s+public\.store_invitations\s*\(/i,
            'must create public.store_invitations table');
    });

    it('C: invite_code has unique constraint', function () {
        const content = readFile(MIGRATION_FILE);
        assert.match(content, /UNIQUE\s*\(\s*invite_code\s*\)/i,
            'must have unique constraint on invite_code');
    });

    it('D: store_id references public.stores(id)', function () {
        const content = readFile(MIGRATION_FILE);
        assert.match(content, /store_id\s+uuid\s+not\s+null\s+references\s+public\.stores\s*\(\s*id\s*\)/i,
            'store_id must be NOT NULL and reference public.stores(id)');
    });

    it('E: auth.users FK is used only on created_by, used_by, revoked_by', function () {
        const content = readFile(MIGRATION_FILE);
        const fkMatches = content.match(/references\s+auth\.users\s*\(\s*id\s*\)/gi) || [];
        assert.strictEqual(fkMatches.length, 3,
            'must have exactly 3 auth.users(id) FK references (created_by, used_by, revoked_by)');
    });

    it('F: RLS is enabled on store_invitations', function () {
        const content = readFile(MIGRATION_FILE);
        assert.match(content, /ENABLE ROW LEVEL SECURITY/i,
            'must enable RLS on store_invitations');
    });

    it('G: anon/public is revoked from store_invitations', function () {
        const content = readFile(MIGRATION_FILE);
        assert.match(content, /REVOKE\s+ALL\s+ON\s+public\.store_invitations\s+FROM\s+anon/i,
            'must revoke all from anon');
    });

    it('H: direct INSERT/UPDATE/DELETE is NOT granted to authenticated', function () {
        const content = readFile(MIGRATION_FILE);
        // Must NOT grant INSERT
        assert.doesNotMatch(content, /GRANT\s+INSERT\s+ON\s+public\.store_invitations\s+TO\s+authenticated/i,
            'must NOT grant INSERT to authenticated');
        // Must NOT grant UPDATE
        assert.doesNotMatch(content, /GRANT\s+UPDATE\s+ON\s+public\.store_invitations\s+TO\s+authenticated/i,
            'must NOT grant UPDATE to authenticated');
        // Must NOT grant DELETE
        assert.doesNotMatch(content, /GRANT\s+DELETE\s+ON\s+public\.store_invitations\s+TO\s+authenticated/i,
            'must NOT grant DELETE to authenticated');
        // Must explicitly revoke INSERT/UPDATE/DELETE
        assert.match(content, /REVOKE\s+INSERT\s+ON\s+public\.store_invitations\s+FROM\s+authenticated/i,
            'must explicitly revoke INSERT from authenticated');
        assert.match(content, /REVOKE\s+UPDATE\s+ON\s+public\.store_invitations\s+FROM\s+authenticated/i,
            'must explicitly revoke UPDATE from authenticated');
        assert.match(content, /REVOKE\s+DELETE\s+ON\s+public\.store_invitations\s+FROM\s+authenticated/i,
            'must explicitly revoke DELETE from authenticated');
    });

    it('I: owner SELECT policy exists', function () {
        const content = readFile(MIGRATION_FILE);
        assert.match(content, /CREATE POLICY\s+"StoreInvitations:/i,
            'must have a SELECT policy for store_invitations');
        assert.match(content, /private\.has_store_role\s*\(\s*store_id,\s*ARRAY\['owner'::member_role\]\s*\)/i,
            'SELECT policy must use private.has_store_role with owner role');
    });

    it('J: create_initial_store RPC is NOT modified in this migration', function () {
        const content = readFile(MIGRATION_FILE);
        assert.doesNotMatch(content, /create_initial_store/i,
            'migration must NOT mention create_initial_store');
    });

    it('K: invite_code empty string check exists', function () {
        const content = readFile(MIGRATION_FILE);
        assert.match(content, /trim\s*\(\s*invite_code\s*\)\s*<>\s*''/i,
            'must have CHECK constraint preventing empty invite_code');
    });

    it('L: used/revoked mutual exclusion check exists', function () {
        const content = readFile(MIGRATION_FILE);
        assert.match(content, /NOT\s*\(\s*used_at\s+IS\s+NOT\s+NULL\s+AND\s+revoked_at\s+IS\s+NOT\s+NULL\s*\)/i,
            'must have CHECK preventing simultaneous used_at and revoked_at');
    });

    it('M: updated_at trigger exists for store_invitations', function () {
        const content = readFile(MIGRATION_FILE);
        assert.match(content, /CREATE TRIGGER\s+trg_store_invitations_updated_at/i,
            'must have updated_at trigger on store_invitations');
        assert.match(content, /handle_store_invitation_update\s*\(\s*\)/i,
            'trigger must call handle_store_invitation_update');
    });

    it('N: active invitation partial index exists', function () {
        const content = readFile(MIGRATION_FILE);
        assert.match(content, /CREATE INDEX\s+idx_store_invitations_active/i,
            'must have partial index for active invitations');
        assert.match(content, /WHERE\s+used_at\s+IS\s+NULL\s+AND\s+revoked_at\s+IS\s+NULL/i,
            'partial index must cover unused and unrevoked invitations');
    });

    it('O: store_id is NOT NULL (join-type only, no create-type)', function () {
        const content = readFile(MIGRATION_FILE);
        assert.match(content, /store_id\s+uuid\s+not\s+null/i,
            'store_id must be NOT NULL (join-type only in this step)');
    });

});
