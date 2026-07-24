-- ============================================================
-- Migration 014: generate_store_invite_code RPC
-- ============================================================
--
-- PURPOSE:
--   Allow store owners to generate invite codes for manager
--   and staff roles. Owner role invitations are blocked.
--   Only authenticated users with active owner membership
--   may call this function.
--
--   Invite codes are short, human-readable strings (LS-XXXXXXXX)
--   with automatic retry on unique constraint conflicts.
--
-- SECURITY:
--   - SECURITY DEFINER with SET search_path = ''
--   - auth.uid() is the only user identifier
--   - Owner-only enforcement via store_members join
--   - Owner role invitations explicitly blocked
--   - Expiry range enforced (1-30 days)
--   - stores.deleted_at check prevents deleted store invites
--
-- ============================================================

CREATE OR REPLACE FUNCTION public.generate_store_invite_code(
    p_role public.member_role DEFAULT 'staff',
    p_invited_email text DEFAULT NULL,
    p_expires_in_days integer DEFAULT 7
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid uuid;
    v_store_id uuid;
    v_role public.member_role;
    v_invited_email text;
    v_expires_in_days integer;
    v_invite_code text;
    v_attempts integer := 0;
    v_max_attempts integer := 10;
    v_expires_at timestamptz;
BEGIN
    -- Resolve caller identity
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated: auth.uid() is null';
    END IF;

    -- Validate role: only manager and staff allowed, owner blocked
    v_role := p_role;
    IF v_role = 'owner' THEN
        RAISE EXCEPTION USING
            ERRCODE = '22023',
            MESSAGE = 'Owner role invitations are not allowed';
    END IF;

    IF v_role NOT IN ('manager', 'staff') THEN
        RAISE EXCEPTION USING
            ERRCODE = '22023',
            MESSAGE = 'Invalid role. Must be manager or staff';
    END IF;

    -- Validate and sanitize invited_email
    IF p_invited_email IS NOT NULL THEN
        v_invited_email := lower(trim(p_invited_email));
        IF v_invited_email = '' THEN
            v_invited_email := NULL;
        END IF;
    ELSE
        v_invited_email := NULL;
    END IF;

    -- Validate expires_in_days: 1 to 30 inclusive
    v_expires_in_days := p_expires_in_days;
    IF v_expires_in_days IS NULL OR v_expires_in_days < 1 OR v_expires_in_days > 30 THEN
        RAISE EXCEPTION USING
            ERRCODE = '22023',
            MESSAGE = 'Expires in days must be between 1 and 30';
    END IF;

    -- Look up active owner store membership for the caller
    -- Excludes soft-deleted stores
    SELECT sm.store_id INTO v_store_id
    FROM public.store_members sm
    INNER JOIN public.stores s ON s.id = sm.store_id
    WHERE sm.user_id = v_uid
      AND sm.role = 'owner'
      AND sm.is_active = true
      AND s.deleted_at IS NULL
    ORDER BY sm.created_at ASC
    LIMIT 1;

    IF v_store_id IS NULL THEN
        RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = 'Only store owners can generate invite codes';
    END IF;

    -- Calculate expiry timestamp
    v_expires_at := now() + (v_expires_in_days || ' days')::interval;

    -- Generate unique invite code with retry on conflict
    -- Format: LS-XXXXXXXX (8 uppercase alphanumeric chars)
    WHILE v_attempts < v_max_attempts LOOP
        v_attempts := v_attempts + 1;

        -- Generate 8 random uppercase alphanumeric characters
        v_invite_code := 'LS-' || upper(substr(
            encode(gen_random_bytes(6), 'hex'),
            1,
            8
        ));

        -- Attempt insert; if unique violation, retry
        BEGIN
            INSERT INTO public.store_invitations (
                store_id,
                invite_code,
                invited_email,
                role,
                created_by,
                expires_at
            ) VALUES (
                v_store_id,
                v_invite_code,
                v_invited_email,
                v_role,
                v_uid,
                v_expires_at
            );

            -- Insert succeeded — return the code
            RETURN v_invite_code;
        EXCEPTION WHEN unique_violation THEN
            -- Collision — retry with a new code
            IF v_attempts >= v_max_attempts THEN
                RAISE EXCEPTION USING
                    ERRCODE = '55000',
                    MESSAGE = 'Failed to generate unique invite code after multiple attempts';
            END IF;
        END;
    END LOOP;

    RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'Failed to generate unique invite code';
END;
$$;

-- ============================================================
-- Permissions
-- ============================================================

-- Revoke from PUBLIC (includes anon and default roles)
REVOKE ALL ON FUNCTION public.generate_store_invite_code(public.member_role, text, integer) FROM PUBLIC;

-- Revoke from anon explicitly
REVOKE ALL ON FUNCTION public.generate_store_invite_code(public.member_role, text, integer) FROM anon;

-- Grant to authenticated only (function itself enforces owner-only)
GRANT EXECUTE ON FUNCTION public.generate_store_invite_code(public.member_role, text, integer) TO authenticated;
