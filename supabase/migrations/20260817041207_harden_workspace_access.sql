revoke execute on function public.bootstrap_owner(text) from anon;
revoke execute on function public.create_invitation(text) from anon;
revoke execute on function public.accept_invitation(uuid, text) from anon;

create index if not exists idx_drafts_prospect_id on public.drafts (prospect_id);
create index if not exists idx_drafts_created_by on public.drafts (created_by);
create index if not exists idx_follow_ups_prospect_id on public.follow_ups (prospect_id);
create index if not exists idx_invitations_created_by on public.invitations (created_by);
