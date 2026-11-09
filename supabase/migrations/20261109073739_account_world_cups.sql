-- A tournament is a small aggregate (at most eight candidates / seven matches).
-- Persist its session and matches together so a partially saved round is impossible.
create table public.world_cups (
  id text primary key check (char_length(id) between 1 and 128),
  user_id uuid not null references auth.users(id) on delete cascade,
  session jsonb not null,
  matches jsonb not null,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(session) = 'object'),
  check (jsonb_typeof(matches) = 'array'),
  check (jsonb_array_length(matches) between 1 and 7)
);
create index world_cups_user_updated_idx on public.world_cups (user_id, updated_at desc);
alter table public.world_cups enable row level security;
grant select, insert, update, delete on public.world_cups to authenticated;
create policy "Users manage own world cups" on public.world_cups
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create function public.validate_world_cup() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  candidate_ids text[];
  match_row jsonb;
begin
  if auth.uid() is null or new.user_id <> auth.uid() then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    if new.id <> old.id or new.user_id <> old.user_id or new.revision <> old.revision + 1 then
      raise exception '월드컵을 다시 불러온 뒤 선택해주세요.' using errcode = '40001';
    end if;
    new.created_at := old.created_at;
  elsif new.revision <> 1 then
    raise exception '새 대회의 버전이 올바르지 않습니다.';
  end if;
  if (new.session->>'id') is distinct from new.id
    or jsonb_typeof(new.session->'candidateRecordIds') is distinct from 'array'
    or (new.session->>'status') is null
    or (new.session->>'status') not in ('in-progress', 'completed') then
    raise exception '월드컵 데이터가 올바르지 않습니다.';
  end if;
  select array_agg(value) into candidate_ids from jsonb_array_elements_text(new.session->'candidateRecordIds');
  if coalesce(cardinality(candidate_ids), 0) not in (2,4,8)
    or (select count(distinct id) from unnest(candidate_ids) as id) <> cardinality(candidate_ids) then
    raise exception '월드컵 후보가 올바르지 않습니다.';
  end if;
  if exists (
    select 1 from unnest(candidate_ids) as candidate_id
    where not exists (select 1 from public.meal_records r where r.id::text = candidate_id and r.user_id = new.user_id)
  ) then
    raise exception '더 이상 볼 수 없는 후보가 있어요. 새 대회를 시작해주세요.' using errcode = '42501';
  end if;
  if new.session ? 'winnerRecordId' and not coalesce((new.session->>'winnerRecordId') = any(candidate_ids), false) then
    raise exception '우승 기록이 후보에 없습니다.';
  end if;
  for match_row in select value from jsonb_array_elements(new.matches) loop
    if (match_row->>'sessionId') is distinct from new.id
      or not coalesce((match_row->>'leftRecordId') = any(candidate_ids), false)
      or not coalesce((match_row->>'rightRecordId') = any(candidate_ids), false)
      or (match_row->>'leftRecordId') = (match_row->>'rightRecordId')
      or ((match_row ? 'winnerRecordId') and not coalesce((match_row->>'winnerRecordId') in (match_row->>'leftRecordId', match_row->>'rightRecordId'), false)) then
      raise exception '대결 후보가 올바르지 않습니다.';
    end if;
  end loop;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function public.validate_world_cup() from public, anon, authenticated;
create trigger validate_world_cup_before_write before insert or update on public.world_cups
for each row execute function public.validate_world_cup();
