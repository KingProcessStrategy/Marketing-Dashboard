create schema if not exists app_private;
revoke all on schema app_private from public;

create table if not exists public.workspace_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text not null,
  role text not null default 'member' check (role in ('admin', 'member')),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.prospects (
  id uuid primary key default gen_random_uuid(),
  company text not null,
  trade text not null,
  contact_name text not null,
  email text not null,
  counties text not null default 'Houston metro',
  keywords text not null,
  status text not null default 'active',
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  project text not null,
  stage text not null,
  source text not null,
  location text not null,
  trades text not null,
  score integer not null check (score between 1 and 100),
  record_date date not null,
  insight text not null,
  saved boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.drafts (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  lead_ids uuid[] not null default '{}',
  subject text not null,
  body text not null,
  status text not null default 'ready' check (status in ('ready', 'approved', 'passed')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  due_date date not null,
  note text not null,
  status text not null default 'due' check (status in ('due', 'complete')),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.workspace_activity (
  id uuid primary key default gen_random_uuid(),
  actor text not null,
  action text not null,
  detail text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  token uuid not null unique default gen_random_uuid(),
  role text not null default 'member' check (role in ('member')),
  created_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  accepted_at timestamptz
);

create index if not exists idx_drafts_status_updated_at on public.drafts (status, updated_at desc);
create index if not exists idx_follow_ups_status_due_date on public.follow_ups (status, due_date);
create index if not exists idx_invitations_email on public.invitations (email) where accepted_at is null;
create index if not exists idx_leads_score_record_date on public.leads (score desc, record_date desc);

insert into public.prospects (id, company, trade, contact_name, email, counties, keywords, status)
values
  ('00000000-0000-4000-8000-000000000001', 'ABC Electrical', 'Electrical', 'Jordan Ramirez', 'jordan@abcelectrical.com', 'Harris, Fort Bend, Waller', 'K-12, medical office, multifamily', 'active'),
  ('00000000-0000-4000-8000-000000000002', 'Horizon Mechanical', 'HVAC / Mechanical', 'Maya Singh', 'maya@horizonmechanical.com', 'Harris, Montgomery, Fort Bend', 'healthcare, municipal, tenant improvement', 'active'),
  ('00000000-0000-4000-8000-000000000003', 'Metro Concrete', 'Concrete', 'Luis Martinez', 'luis@metroconcrete.com', 'Harris, Brazoria, Galveston', 'warehouse, civil, public works', 'active')
on conflict (id) do nothing;

insert into public.leads (id, project, stage, source, location, trades, score, record_date, insight, saved)
values
  ('00000000-0000-4000-8000-000000000101', 'Katy ISD CTE Expansion', 'Procurement', 'Katy ISD bid board', 'Katy, Fort Bend County', 'Electrical, Low voltage, Concrete', 94, '2026-08-17', 'Bid-planning signal with a likely electrical package and early estimator outreach window.', false),
  ('00000000-0000-4000-8000-000000000102', 'Fulshear Medical Office Campus', 'Planning', 'City planning agenda', 'Fulshear, Fort Bend County', 'HVAC / Mechanical, Plumbing, Electrical', 91, '2026-08-16', 'Planning-stage medical office activity; likely opportunity before permit traffic accelerates.', true),
  ('00000000-0000-4000-8000-000000000103', 'Northside Fleet Facility', 'Permit activity', 'City of Houston permits', 'Houston, Harris County', 'Concrete, Paving, Fire protection', 88, '2026-08-16', 'Public fleet facility package with civil and specialty trade relevance.', false),
  ('00000000-0000-4000-8000-000000000104', 'Lake Houston Distribution Center', 'Economic development', 'Chapter 380 agreement', 'Humble, Harris County', 'Concrete, Roofing, Electrical, Paving', 86, '2026-08-15', 'Incentive agreement offers an early read on a large industrial development.', false)
on conflict (id) do nothing;

insert into public.drafts (id, prospect_id, lead_ids, subject, body, status, created_by)
values
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000001', array['00000000-0000-4000-8000-000000000101'::uuid, '00000000-0000-4000-8000-000000000102'::uuid], 'A few Houston electrical projects for ABC', 'Jordan — I pulled three current Houston-area opportunities that look relevant to ABC Electrical, including a Katy ISD CTE expansion and an early-stage Fort Bend medical office campus.\n\nThey came from local planning and procurement sources, not just the standard permit feed.\n\nWant the full details?', 'ready', null),
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000002', array['00000000-0000-4000-8000-000000000102'::uuid], 'An early mechanical signal in Fort Bend', 'Maya — a Fort Bend medical office campus just surfaced in local planning activity. It looks like a fit for mechanical work and may be worth getting in front of before the permit cycle.\n\nWant me to send the project detail and two more current matches?', 'ready', null),
  ('00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000003', array['00000000-0000-4000-8000-000000000103'::uuid, '00000000-0000-4000-8000-000000000104'::uuid], 'Two concrete opportunities to watch', 'Luis — I flagged a Northside fleet facility and a Lake Houston distribution project that both appear relevant to Metro Concrete.\n\nThe signals are early enough to start identifying the owner, GC, and expected bid path. Want the source details?', 'ready', null)
on conflict (id) do nothing;

insert into public.follow_ups (id, prospect_id, due_date, note, status)
values
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000001', '2026-08-18', 'Follow up with project detail if no reply.', 'due'),
  ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000002', '2026-08-20', 'Offer a tailored mechanical opportunity brief.', 'due')
on conflict (id) do nothing;

alter table public.workspace_members enable row level security;
alter table public.prospects enable row level security;
alter table public.leads enable row level security;
alter table public.drafts enable row level security;
alter table public.follow_ups enable row level security;
alter table public.workspace_activity enable row level security;
alter table public.invitations enable row level security;

create or replace function app_private.is_workspace_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members as m
    where m.user_id = (select auth.uid())
  );
$$;

create or replace function app_private.is_workspace_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members as m
    where m.user_id = (select auth.uid()) and m.role = 'admin'
  );
$$;

create or replace function public.bootstrap_owner(p_display_name text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_name text := coalesce(nullif(trim(p_display_name), ''), split_part(v_email, '@', 1));
begin
  if v_user_id is null or v_email = '' then
    raise exception 'Sign in is required.';
  end if;
  if v_email <> 'chrisking0990@gmail.com' then
    raise exception 'Only the King Lead Lab owner can initialize this workspace.';
  end if;

  insert into public.workspace_members (user_id, email, display_name, role)
  values (v_user_id, v_email, v_name, 'admin')
  on conflict (user_id) do update
    set display_name = excluded.display_name;

  return true;
end;
$$;

create or replace function public.create_invitation(p_email text)
returns table(id uuid, token uuid, email text, role text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(p_email));
begin
  if not app_private.is_workspace_admin() then
    raise exception 'Only workspace administrators can invite teammates.';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Enter a valid email address.';
  end if;

  return query
  insert into public.invitations (email, token, role, created_by, expires_at)
  values (v_email, gen_random_uuid(), 'member', auth.uid(), timezone('utc', now()) + interval '14 days')
  returning invitations.id, invitations.token, invitations.email, invitations.role, invitations.expires_at;
end;
$$;

create or replace function public.accept_invitation(p_token uuid, p_display_name text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation public.invitations%rowtype;
  v_user_id uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_name text := coalesce(nullif(trim(p_display_name), ''), split_part(v_email, '@', 1));
begin
  if v_user_id is null or v_email = '' then
    raise exception 'Sign in is required.';
  end if;

  select * into v_invitation
  from public.invitations
  where token = p_token and accepted_at is null and expires_at > timezone('utc', now())
  for update;

  if not found then
    raise exception 'This invite link is invalid or expired.';
  end if;
  if lower(v_invitation.email) <> v_email then
    raise exception 'Use the same email address that received this invitation.';
  end if;

  insert into public.workspace_members (user_id, email, display_name, role)
  values (v_user_id, v_email, v_name, v_invitation.role)
  on conflict (user_id) do update
    set display_name = excluded.display_name;

  update public.invitations
  set accepted_at = timezone('utc', now())
  where id = v_invitation.id;

  insert into public.workspace_activity (actor, action, detail)
  values (v_name, 'joined the workspace', v_email);

  return true;
end;
$$;

revoke all on function app_private.is_workspace_member() from public;
revoke all on function app_private.is_workspace_admin() from public;
grant usage on schema app_private to authenticated;
grant execute on function app_private.is_workspace_member() to authenticated;
grant execute on function app_private.is_workspace_admin() to authenticated;

revoke all on function public.bootstrap_owner(text) from public;
revoke all on function public.create_invitation(text) from public;
revoke all on function public.accept_invitation(uuid, text) from public;
grant execute on function public.bootstrap_owner(text) to authenticated;
grant execute on function public.create_invitation(text) to authenticated;
grant execute on function public.accept_invitation(uuid, text) to authenticated;

grant usage on schema public to authenticated;
grant select on public.workspace_members to authenticated;
grant select, insert, update on public.prospects to authenticated;
grant select, insert, update on public.leads to authenticated;
grant select, insert, update on public.drafts to authenticated;
grant select, insert, update on public.follow_ups to authenticated;
grant select, insert on public.workspace_activity to authenticated;
grant select on public.invitations to authenticated;

create policy "members can read team" on public.workspace_members
for select to authenticated using ((select app_private.is_workspace_member()));

create policy "members can read prospects" on public.prospects
for select to authenticated using ((select app_private.is_workspace_member()));
create policy "members can add prospects" on public.prospects
for insert to authenticated with check ((select app_private.is_workspace_member()));
create policy "members can update prospects" on public.prospects
for update to authenticated using ((select app_private.is_workspace_member()))
with check ((select app_private.is_workspace_member()));

create policy "members can read leads" on public.leads
for select to authenticated using ((select app_private.is_workspace_member()));
create policy "members can add leads" on public.leads
for insert to authenticated with check ((select app_private.is_workspace_member()));
create policy "members can update leads" on public.leads
for update to authenticated using ((select app_private.is_workspace_member()))
with check ((select app_private.is_workspace_member()));

create policy "members can read drafts" on public.drafts
for select to authenticated using ((select app_private.is_workspace_member()));
create policy "members can add drafts" on public.drafts
for insert to authenticated with check ((select app_private.is_workspace_member()));
create policy "members can update drafts" on public.drafts
for update to authenticated using ((select app_private.is_workspace_member()))
with check ((select app_private.is_workspace_member()));

create policy "members can read follow ups" on public.follow_ups
for select to authenticated using ((select app_private.is_workspace_member()));
create policy "members can add follow ups" on public.follow_ups
for insert to authenticated with check ((select app_private.is_workspace_member()));
create policy "members can update follow ups" on public.follow_ups
for update to authenticated using ((select app_private.is_workspace_member()))
with check ((select app_private.is_workspace_member()));

create policy "members can read activity" on public.workspace_activity
for select to authenticated using ((select app_private.is_workspace_member()));
create policy "members can add activity" on public.workspace_activity
for insert to authenticated with check ((select app_private.is_workspace_member()));

create policy "admins can read invitations" on public.invitations
for select to authenticated using ((select app_private.is_workspace_admin()));
