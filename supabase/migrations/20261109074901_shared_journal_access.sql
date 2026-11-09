-- Share existing archives in place: authorship and media paths never change.
-- Apply with the corresponding shared-journal client; old clients hard-delete.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table public.journals (
  id uuid primary key default gen_random_uuid(),
  name text not null default '우리의 식탁' check (char_length(trim(name)) between 1 and 60),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create table public.journal_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  journal_id uuid not null references public.journals(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 1 and 40),
  joined_at timestamptz not null default now()
);
create index journal_members_journal_idx on public.journal_members(journal_id);
alter table public.journals enable row level security;
alter table public.journal_members enable row level security;

-- Definer is necessary only for this non-exposed membership lookup, avoiding
-- recursive RLS. The caller identity is always auth.uid(), never a supplied actor.
create function private.can_access_archive(author_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    author_id = auth.uid() or exists (
      select 1 from public.journal_members me
      join public.journal_members other on other.journal_id = me.journal_id
      where me.user_id = auth.uid() and other.user_id = author_id
    )
  );
$$;
revoke all on function private.can_access_archive(uuid) from public, anon;
grant execute on function private.can_access_archive(uuid) to authenticated;

create function private.limit_journal_members() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  perform 1 from public.journals where id = new.journal_id for update;
  if (select count(*) from public.journal_members where journal_id = new.journal_id and user_id <> new.user_id) >= 2 then
    raise exception '기록장은 두 사람까지 함께 사용할 수 있어요.';
  end if;
  return new;
end;
$$;
revoke all on function private.limit_journal_members() from public, anon, authenticated;
create trigger limit_journal_members before insert or update on public.journal_members
for each row execute function private.limit_journal_members();

create policy "Members see their journal" on public.journals for select to authenticated
using (exists(select 1 from public.journal_members m where m.journal_id = id and m.user_id = (select auth.uid())));
create policy "Members see coauthors" on public.journal_members for select to authenticated
using (private.can_access_archive(user_id));
grant select on public.journals, public.journal_members to authenticated;
-- Membership writes are intentionally not exposed. TVL-53 adds authenticated,
-- single-use invite RPCs; merely knowing an account ID cannot grant access.

alter table public.meal_records add column deleted_at timestamptz;
alter table public.recipe_scraps add column deleted_at timestamptz;
alter table public.media add column deleted_at timestamptz;
alter table public.media add constraint media_storage_owner_path_check check (
  split_part(storage_path, '/', 1) = user_id::text
  and split_part(storage_path, '/', 2) = meal_record_id::text
);

create function private.preserve_archive_author() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.user_id is distinct from old.user_id or new.id is distinct from old.id then
    raise exception '기록의 작성자와 식별자는 변경할 수 없습니다.';
  end if;
  return new;
end;
$$;
revoke all on function private.preserve_archive_author() from public, anon, authenticated;

do $$
declare table_name text; old_policy record;
begin
  foreach table_name in array array['meals','meal_records','tags','meal_tags','recipe_scraps','media'] loop
    for old_policy in select policyname from pg_policies where schemaname='public' and tablename=table_name loop
      execute format('drop policy %I on public.%I', old_policy.policyname, table_name);
    end loop;
    execute format('create policy "Read shared archive" on public.%I for select to authenticated using (private.can_access_archive(user_id))', table_name);
    execute format('create policy "Edit shared archive" on public.%I for update to authenticated using (private.can_access_archive(user_id)) with check (private.can_access_archive(user_id))', table_name);
    -- Child metadata keeps the record owner's identity for existing composite FKs.
    -- Meals, dated records and scraps always retain the actual creator as author.
    if table_name in ('tags','meal_tags','media') then
      execute format('create policy "Add shared metadata" on public.%I for insert to authenticated with check (private.can_access_archive(user_id))', table_name);
    else
      execute format('create policy "Create own records" on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', table_name);
    end if;
    if table_name <> 'meal_tags' then
      execute format('create trigger preserve_archive_author before update on public.%I for each row execute function private.preserve_archive_author()', table_name);
    end if;
    execute format('revoke delete on public.%I from authenticated', table_name);
  end loop;
end;
$$;
-- Removing a tag association is an edit, not destruction of a cooking record.
grant delete on public.meal_tags to authenticated;
create policy "Edit shared tag associations" on public.meal_tags for delete to authenticated
using (private.can_access_archive(user_id));

-- Photo removal must remain reversible. Existing files cannot be overwritten or
-- deleted by clients; replacements upload a new path and trash the old metadata.
drop policy "Users read own meal media files" on storage.objects;
drop policy "Users upload own meal media files" on storage.objects;
drop policy "Users update own meal media files" on storage.objects;
drop policy "Users delete own meal media files" on storage.objects;
create policy "Read shared archive photos" on storage.objects for select to authenticated
using (bucket_id = 'meal-media' and exists (
  select 1 from public.media m where m.storage_path = name
    and (storage.foldername(name))[1] = m.user_id::text
    and (storage.foldername(name))[2] = m.meal_record_id::text
    and private.can_access_archive(m.user_id)
));
create policy "Upload shared record photos" on storage.objects for insert to authenticated
with check (bucket_id = 'meal-media' and exists (
  select 1 from public.meal_records r
  where r.id::text = (storage.foldername(name))[2]
    and r.user_id::text = (storage.foldername(name))[1]
    and r.deleted_at is null and private.can_access_archive(r.user_id)
) and not exists(select 1 from public.media m where m.storage_path = name));
