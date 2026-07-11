# Secure Auth Bootstrap and Initial Store Owner Onboarding

## 1. Bootstrap Deadlock

New authenticated users face a chicken-and-egg problem when they first sign up:

1. **profiles** has SELECT/UPDATE RLS policies but no INSERT policy for regular users
2. **stores** has SELECT/UPDATE RLS policies but no INSERT policy for regular users
3. **store_members** INSERT requires `has_store_role(store_id, ARRAY['owner'])` — the user must already be an owner of the store to insert members
4. **store_settings** INSERT requires `has_store_role(store_id, ARRAY['owner'])` — same chicken-and-egg problem

This creates a deadlock where no authenticated user can bootstrap their initial data through normal RLS-gated operations.

## 2. Why RPC Instead of Generic INSERT Policies

Adding generic INSERT policies would compromise security:

- An INSERT policy on `stores` that allows any authenticated user to insert would let users create stores without proper ownership tracking
- An INSERT policy on `store_members` that bypasses the owner check would let users assign themselves any role in any store
- An INSERT policy on `store_settings` would similarly allow unauthorized access to store configuration

Instead, we use SECURITY DEFINER RPC functions that:

- Bypass RLS to perform the necessary INSERTs as a privileged operation
- Use `auth.uid()` as the sole user identifier (no user_id parameter accepted)
- Enforce business rules (single owner store per call, idempotent creation)
- Run with `search_path = ''` to prevent search path injection attacks
- Are granted only to the `authenticated` role

## 3. ensure_user_profile

```sql
public.ensure_user_profile(
    p_display_name text DEFAULT NULL,
    p_preferred_language text DEFAULT 'ko'
) RETURNS public.profiles
```

Behavior:

1. Validates `auth.uid()` is not NULL (raises exception if unauthenticated)
2. **Explicit NULL check** for `p_preferred_language` — fails with SQLSTATE 22023 if NULL
3. Validates `p_preferred_language` is one of: ko, zh, en, ja (fails with SQLSTATE 22023 if invalid)
4. Sanitizes `p_display_name`: trims whitespace, converts empty string to NULL
5. `display_name` NULL or whitespace **preserves existing display_name** — never overwrites with NULL
6. Creates a new profile for `auth.uid()` if none exists
7. If profile already exists:
   - Updates `display_name` only if a non-NULL value is provided
   - Always updates `preferred_language`
   - Always updates `updated_at`
8. Returns the user's complete profile row

This function is idempotent — calling it multiple times is safe and will not destroy existing data.

> **Hardening (migration 00850):** The original migration 008 had a NULL bypass vulnerability where `lower(trim(NULL))` returns NULL, and `NULL NOT IN (...)` evaluates to NULL (not FALSE), skipping the IF guard. Migration 00850 adds an explicit `IS NULL` check before any trim/lower operation. All input validation errors now use SQLSTATE 22023.

## 4. create_initial_store

```sql
public.create_initial_store(
    p_name text,
    p_subtitle text DEFAULT NULL,
    p_default_language text DEFAULT 'ko'
) RETURNS uuid
```

Behavior:

1. Validates `auth.uid()` is not NULL (raises exception if unauthenticated)
2. **Explicit NULL check** for `p_name` — fails with SQLSTATE 22023 if NULL
3. Validates `p_name`: trimmed length must be 1–100 characters (fails with SQLSTATE 22023)
4. Sanitizes `p_subtitle`: trims whitespace, converts empty string to NULL (NULL allowed)
5. **Explicit NULL check** for `p_default_language` — fails with SQLSTATE 22023 if NULL
6. Validates `p_default_language` is one of: ko, zh, en, ja (fails with SQLSTATE 22023)
7. Acquires advisory transaction lock per user (64-bit deterministic key via `hashtextextended(auth.uid()::text, 0)`)
8. Calls `ensure_user_profile()` to ensure profile exists
9. Checks if user already has an **active, non-deleted** owner membership:
   - If yes: returns the existing store_id (**idempotent onboarding**)
   - If no: creates new store, membership, and settings atomically
10. Returns the store_id (uuid)

> **Hardening (migration 00850):** The original migration 008 did not explicitly check for NULL `p_name` or `p_default_language`, and the idempotent owner-store query did not exclude soft-deleted stores. Migration 00850 adds explicit NULL checks (SQLSTATE 22023), JOINs `stores` with `deleted_at IS NULL` in the idempotent query, and changes the advisory lock seed from 54321 to 0 for a standard 64-bit deterministic key.

## 5. Atomic Transaction Flow

When creating a new store (no existing owner membership), the following operations occur in sequence within a single PostgreSQL transaction:

```
1. ensure_user_profile()
   └── INSERT INTO public.profiles (id, display_name, preferred_language)

2. INSERT INTO public.stores (name, subtitle, created_by)
   └── created_by = auth.uid()

3. INSERT INTO public.store_members (store_id, user_id, role, is_active, invited_by)
   └── user_id = auth.uid(), role = 'owner', invited_by = auth.uid()

4. INSERT INTO public.store_settings (store_id, store_name, default_language)
   └── created_by/updated_by auto-set by handle_audit_metadata trigger
```

All operations occur within a single transaction. If any step fails, the entire transaction rolls back, ensuring no partial data is left behind.

## 6. Idempotent Onboarding

If the user already has an active owner membership for a **non-deleted** store, `create_initial_store` returns the existing store_id without creating duplicates. This means:

- Calling the function multiple times is safe
- No duplicate stores, memberships, or settings are created
- The earliest created active owner store is returned (ordered by `created_at ASC`)
- **Deleted stores are excluded** — if the user's only store was soft-deleted, the function creates a new store instead of returning the deleted store_id
- The advisory lock key is deterministic based on `auth.uid()` using a 64-bit hash (`hashtextextended` with seed 0), ensuring consistent lock acquisition

This design supports scenarios where the client might retry onboarding due to network errors or page refreshes.

## 7. RLS and Function Permissions

| Object | SELECT | INSERT | UPDATE | EXECUTE |
|--------|--------|--------|--------|---------|
| `ensure_user_profile` | — | — | — | authenticated only |
| `create_initial_store` | — | — | — | authenticated only |
| `profiles` | own row only | no policy | own row only | — |
| `stores` | member + active | no policy | owner only | — |
| `store_members` | member of same store | owner of store | owner of store | — |
| `store_settings` | owner of store | owner of store | owner of store | — |

Both functions:

- `SECURITY DEFINER` with `SET search_path = ''`
- All relations schema-qualified (`public.`, `auth.`)
- No dynamic SQL — all queries are static
- `auth.uid()` is the only user identifier (no user_id parameter)
- `REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon`
- `GRANT EXECUTE ON FUNCTION ... TO authenticated`
- Advisory transaction lock prevents concurrent duplicate store creation
- All input validation errors use SQLSTATE 22023
- Explicit NULL checks prevent bypass of trim/lower/whitelist guards

### Migrations

| Migration | Lines | Content |
|---|---|---|
| `20260711000800_auth_onboarding.sql` | 199 | Initial onboarding RPC functions |
| `20260711000850_auth_onboarding_hardening.sql` | 201 | NULL input checks, SQLSTATE 22023, deleted store exclusion, 64-bit advisory lock |

## 8. Client Usage Example

```javascript
// After successful sign-up/sign-in, call onboarding RPC
const { data, error } = await supabase.rpc('create_initial_store', {
  p_name: 'My Store',
  p_subtitle: 'Fashion Manager',
  p_default_language: 'ko'
})

if (error) {
  console.error('Onboarding failed:', error.message)
} else {
  console.log('Store ID:', data)
  // data is the store_id (uuid)
}
```

```javascript
// Ensure profile exists (optional — create_initial_store calls this internally)
const { data, error } = await supabase.rpc('ensure_user_profile', {
  p_display_name: 'John Doe',
  p_preferred_language: 'ko'
})
```

## 9. Not Yet Implemented

The following features are not part of this migration and will be addressed in future steps:

- Login UI
- Email/OAuth login integration
- Store selection UI (multi-store support)
- Staff invitation UI
- Order/inventory protection RPC
- Staff-limited views
- Remote Supabase deployment
- Real user integration testing
