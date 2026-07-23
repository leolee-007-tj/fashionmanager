-- ============================================================
-- Migration 012: Store Invitations Foundation
-- ============================================================
--
-- PURPOSE:
--   Create the store_invitations table for invite-code based
--   onboarding. This is a join-type invitation table only:
--   store_id is NOT NULL (no create-type invitations in this step).
--
--   Direct INSERT/UPDATE/DELETE on this table is NOT granted to
--   authenticated users. All mutation operations will go through
--   RPC functions (implemented in later steps).
--
--   Only owner SELECT is permitted for now.
--
-- SECURITY:
--   - RLS enabled
--   - Anon/public revoked
--   - Authenticated gets SELECT only (direct DML blocked)
--   - Owner-only SELECT policy via private.has_store_role
--
-- ============================================================

-- ============================================================
-- Table: public.store_invitations
-- ============================================================

CREATE TABLE public.store_invitations (
    id              uuid primary key default gen_random_uuid(),
    store_id        uuid not null references public.stores(id),
    invite_code     text not null,
    invited_email   text null,
    role            public.member_role not null default 'staff',
    created_by      uuid not null references auth.users(id),
    expires_at      timestamptz null,
    used_at         timestamptz null,
    used_by         uuid null references auth.users(id),
    revoked_at      timestamptz null,
    revoked_by      uuid null references auth.users(id),
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),

    -- invite_code must not be empty after trimming
    CONSTRAINT chk_store_invitations_invite_code_not_empty
        CHECK (trim(invite_code) <> ''),

    -- expires_at, if set, must be after created_at
    CONSTRAINT chk_store_invitations_expires_after_created
        CHECK (expires_at IS NULL OR expires_at > created_at),

    -- if used_by is set, used_at must also be set
    CONSTRAINT chk_store_invitations_used_by_requires_used_at
        CHECK (used_by IS NULL OR used_at IS NOT NULL),

    -- if revoked_by is set, revoked_at must also be set
    CONSTRAINT chk_store_invitations_revoked_by_requires_revoked_at
        CHECK (revoked_by IS NULL OR revoked_at IS NOT NULL),

    -- an invitation cannot be both used and revoked
    CONSTRAINT chk_store_invitations_not_used_and_revoked
        CHECK (NOT (used_at IS NOT NULL AND revoked_at IS NOT NULL))
);

-- ============================================================
-- Indexes
-- ============================================================

-- Unique invite code (enforced via constraint)
ALTER TABLE public.store_invitations
    ADD CONSTRAINT uq_store_invitations_invite_code
    UNIQUE (invite_code);

-- Look up invitations by store
CREATE INDEX idx_store_invitations_store_id
    ON public.store_invitations(store_id);

-- Look up invitations by creator
CREATE INDEX idx_store_invitations_created_by
    ON public.store_invitations(created_by);

-- Look up used invitations
CREATE INDEX idx_store_invitations_used_by
    ON public.store_invitations(used_by)
    WHERE used_by IS NOT NULL;

-- Lower-case email search (partial index: only when email is present)
CREATE INDEX idx_store_invitations_invited_email_lower
    ON public.store_invitations(lower(invited_email))
    WHERE invited_email IS NOT NULL;

-- Active invitations (not used, not revoked) for a store
CREATE INDEX idx_store_invitations_active
    ON public.store_invitations(store_id)
    WHERE used_at IS NULL AND revoked_at IS NULL;

-- ============================================================
-- Trigger: updated_at + immutable field protection
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_store_invitation_update()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();

    IF NEW.id IS DISTINCT FROM OLD.id THEN
        RAISE EXCEPTION 'Changing id is not allowed';
    END IF;

    IF NEW.store_id IS DISTINCT FROM OLD.store_id THEN
        RAISE EXCEPTION 'Changing store_id is not allowed';
    END IF;

    IF NEW.invite_code IS DISTINCT FROM OLD.invite_code THEN
        RAISE EXCEPTION 'Changing invite_code is not allowed';
    END IF;

    IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION 'Changing created_by is not allowed';
    END IF;

    IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'Changing created_at is not allowed';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_store_invitations_updated_at
    BEFORE UPDATE ON public.store_invitations
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_store_invitation_update();

-- Revoke direct EXECUTE on trigger function from clients
REVOKE EXECUTE ON FUNCTION public.handle_store_invitation_update() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_store_invitation_update() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_store_invitation_update() FROM authenticated;

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE public.store_invitations ENABLE ROW LEVEL SECURITY;

-- Revoke all from PUBLIC (includes anon and all default roles)
REVOKE ALL ON public.store_invitations FROM PUBLIC;

-- Revoke all from anon explicitly
REVOKE ALL ON public.store_invitations FROM anon;

-- Authenticated gets SELECT only; direct INSERT/UPDATE/DELETE blocked
-- (mutations will go through RPC functions in later steps)
GRANT SELECT ON public.store_invitations TO authenticated;
REVOKE INSERT ON public.store_invitations FROM authenticated;
REVOKE UPDATE ON public.store_invitations FROM authenticated;
REVOKE DELETE ON public.store_invitations FROM authenticated;

-- Owner-only SELECT policy
CREATE POLICY "StoreInvitations: owners can view"
    ON public.store_invitations
    FOR SELECT TO authenticated
    USING (private.has_store_role(store_id, ARRAY['owner'::member_role]));

-- No INSERT/UPDATE/DELETE policies — mutations go through RPC only
