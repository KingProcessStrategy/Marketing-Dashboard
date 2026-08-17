# King Lead Lab — Opportunity Desk

A shared internal workspace for turning King Lead Lab's daily Houston-metro
construction lead feed into reviewed, personalized outreach. Prospects get
matched against live leads, drafts are generated for review, and teammates
approve or pass on each one before anything goes out.

## Stack

- React 19 + Vite (client-only SPA)
- Supabase (Postgres, auth, row-level security) for data and sign-in
- Deployed on Vercel as a static build

## Prerequisites

- Node.js `>=20.19.0`
- A Supabase project with the `workspace_members`, `prospects`, `leads`,
  `drafts`, `follow_ups`, `workspace_activity`, and `invitations` tables,
  plus the `bootstrap_owner`, `accept_invitation`, and `create_invitation`
  RPC functions and matching row-level security policies. (These currently
  live only in the Supabase project itself — see the note below.)

## Quick start

```bash
npm install
npm run dev
```

```bash
npm run build    # production build to /dist
npm run preview  # preview the production build locally
npm run lint      # eslint
```

## Configuration

The Supabase project URL and publishable (anon) key are set directly in
`src/supabase.ts`. The publishable key is safe to ship to the browser —
actual data access is enforced by Supabase row-level security policies, not
by keeping that key secret.

## Known gaps (as of the last review)

- The Supabase schema, RPC functions, and RLS policies are not yet captured
  as migrations in this repo — they exist only in the live Supabase project.
  Pull them down and commit them under a `supabase/` directory before relying
  on this as the source of truth.
- The `leads` table is populated by hand (the "Add lead" form) or the seed
  data — it is not yet connected to King Lead Lab's actual daily scrape.
  Wiring that up is the main remaining integration.
- Outbound email is deliberately manual: approving a draft moves it to a
  queue, and a teammate copies it into their own inbox to send. There is no
  automated sending yet.
- Verify the `bootstrap_owner` and `create_invitation` RPC functions
  re-check the caller's identity/role server-side (not just in the client
  UI) before granting admin access or creating invitations.

## Deployment

This deploys to Vercel as a static Vite build. Point a single Vercel project
at this repository's git remote (Project → Settings → Git) rather than
deploying via the CLI from a local folder, so every push produces one
tracked deployment instead of a new disconnected project.
