# Supabase schema

Source of truth for the King Lead Lab Supabase project (`onvqdrahkwleaecxzhst`,
"King Lead Lab" in the chrisking0990 org). These migrations were pulled
directly from `supabase_migrations.schema_migrations` on 2026-08-17 so the
already-applied schema is captured here instead of living only in the
Supabase dashboard.

To work with this locally: `supabase link --project-ref onvqdrahkwleaecxzhst`,
then `supabase db pull` / `supabase migration new ...` for future changes
instead of editing the schema by hand in the dashboard.

## Reviewed and confirmed safe (2026-08-17)

- `bootstrap_owner`, `create_invitation`, and `accept_invitation` are
  `SECURITY DEFINER` functions callable by any authenticated user (Supabase's
  security advisor flags this by default), but each one re-checks
  authorization server-side before doing anything privileged:
  `bootstrap_owner` requires the caller's JWT email to match the owner
  address, `create_invitation` requires `app_private.is_workspace_admin()`,
  and `accept_invitation` requires the invite token to be valid, unexpired,
  and addressed to the caller's own email. The client-side checks in
  `src/workspace-app.tsx` are UX only, not the actual enforcement.
- Every table has row-level security enabled, gated through
  `app_private.is_workspace_member()` / `is_workspace_admin()`, both of which
  live in a private schema not exposed to PostgREST.

## Still open

- "Leaked password protection" is disabled in Supabase Auth settings
  (flagged by the security advisor). Turn it on in the dashboard under
  Authentication → Policies — one click, not scriptable via migration.
