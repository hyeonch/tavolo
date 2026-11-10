-- Drafts are private to their author until explicitly committed to the journal.
create table public.mcp_record_drafts (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 100000),
  revision integer not null default 1 check (revision > 0),
  record_id uuid references public.meal_records(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index mcp_record_drafts_user_idx on public.mcp_record_drafts(user_id);
alter table public.mcp_record_drafts enable row level security;
grant select, insert on public.mcp_record_drafts to authenticated;
grant update (payload,revision,updated_at) on public.mcp_record_drafts to authenticated;
create policy drafts_select on public.mcp_record_drafts for select to authenticated using (user_id=(select auth.uid()));
create policy drafts_insert on public.mcp_record_drafts for insert to authenticated with check (user_id=(select auth.uid()) and revision=1 and record_id is null);
create policy drafts_update on public.mcp_record_drafts for update to authenticated using (user_id=(select auth.uid()) and record_id is null) with check (user_id=(select auth.uid()));
create function public.validate_mcp_draft_revision() returns trigger language plpgsql set search_path='' as $$
begin
  if new.revision <> old.revision + 1 then raise exception 'stale draft revision'; end if;
  new.updated_at=now();
  return new;
end $$;
revoke all on function public.validate_mcp_draft_revision() from public,anon,authenticated;
create trigger validate_mcp_draft_revision before update on public.mcp_record_drafts for each row execute function public.validate_mcp_draft_revision();
