-- Invitations are recipient-bound, single-use and expire after 24 hours.
create table private.journal_invites (
  token_hash text primary key,
  journal_id uuid not null references public.journals(id) on delete cascade,
  recipient_email text not null,
  expires_at timestamptz not null default now() + interval '24 hours'
);
alter table private.journal_invites enable row level security;
revoke all on private.journal_invites from public, anon, authenticated;

create function private.journal_action(action text, display_name text default '', recipient_email text default '', invite_token text default '') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  journal uuid;
  target_journal uuid;
  actor_email text;
  invitation private.journal_invites%rowtype;
  token text;
begin
  if actor is null then raise exception '로그인이 필요합니다.'; end if;
  -- Serialize operations for this account, then for the journal.
  select lower(u.email) into actor_email from auth.users u where u.id = actor and u.email_confirmed_at is not null for update;
  if actor_email is null then raise exception '이메일이 확인된 계정으로 로그인해주세요.'; end if;
  select m.journal_id into journal from public.journal_members m where m.user_id = actor;
  if action = 'accept' then
    if journal is not null and (select count(*) from public.journal_members where journal_id=journal) > 1 then raise exception '이미 두 사람의 기록장에 참여하고 있어요.'; end if;
    select i.journal_id into target_journal from private.journal_invites i where i.token_hash = encode(sha256(convert_to(invite_token,'UTF8')),'hex');
    perform 1 from public.journals where id = target_journal for update;
    select * into invitation from private.journal_invites i where i.token_hash = encode(sha256(convert_to(invite_token,'UTF8')),'hex') for update;
    if invitation.token_hash is null or invitation.expires_at <= now() or invitation.recipient_email <> actor_email then
      raise exception '사용할 수 없는 초대예요. 초대받은 이메일, 만료 또는 취소 여부를 확인해주세요.';
    end if;
    if journal = invitation.journal_id then raise exception '내가 만든 초대에는 참여할 수 없어요.'; end if;
    -- A lone member can accept another invitation; no archive records are moved.
    if journal is not null then
      delete from public.journal_members where user_id=actor;
      delete from public.journals where id=journal;
    end if;
    insert into public.journal_members(user_id,journal_id,display_name) values(actor,invitation.journal_id,trim(display_name));
    delete from private.journal_invites where journal_id = invitation.journal_id;
    return jsonb_build_object('journalId',invitation.journal_id);
  end if;
  if action not in ('invite','revoke') then raise exception '지원하지 않는 요청입니다.'; end if;
  if action = 'invite' and (length(trim(recipient_email)) > 254 or trim(recipient_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or lower(trim(recipient_email)) = actor_email) then
    raise exception '함께 사용할 상대방의 로그인 이메일을 입력해주세요.';
  end if;
  if journal is null then
    if action = 'revoke' then return '{}'::jsonb; end if;
    insert into public.journals(created_by) values(actor) returning id into journal;
    insert into public.journal_members(user_id,journal_id,display_name) values(actor,journal,trim(display_name));
  end if;
  perform 1 from public.journals where id = journal for update;
  delete from private.journal_invites where journal_id = journal;
  if action = 'revoke' then return '{}'::jsonb; end if;
  if (select count(*) from public.journal_members where journal_id = journal) >= 2 then raise exception '이미 두 사람이 함께하고 있어요.'; end if;
  token := gen_random_uuid()::text || gen_random_uuid()::text;
  insert into private.journal_invites(token_hash,journal_id,recipient_email)
  values(encode(sha256(convert_to(token,'UTF8')),'hex'),journal,lower(trim(recipient_email)));
  return jsonb_build_object('token',token,'expiresAt',now()+interval '24 hours');
end;
$$;
revoke all on function private.journal_action(text,text,text,text) from public, anon;
grant execute on function private.journal_action(text,text,text,text) to authenticated;
create function public.journal_action(action text, display_name text default '', recipient_email text default '', invite_token text default '') returns jsonb
language sql security invoker set search_path = '' as $$ select private.journal_action(action,display_name,recipient_email,invite_token); $$;
revoke all on function public.journal_action(text,text,text,text) from public, anon;
grant execute on function public.journal_action(text,text,text,text) to authenticated;

-- Map tags by name into the meal author's namespace and replace atomically.
create function public.set_meal_tags(target_id uuid, names text[]) returns void
language plpgsql security invoker set search_path = '' as $$
declare owner_id uuid; tag_name text; tag_id uuid;
begin
  select user_id into owner_id from public.meals where id=target_id for update;
  if owner_id is null then raise exception '수정할 요리를 찾을 수 없습니다.'; end if;
  delete from public.meal_tags where meal_id=target_id;
  foreach tag_name in array names loop
    if trim(tag_name) = '' then continue; end if;
    insert into public.tags(id,user_id,name) values(gen_random_uuid(),owner_id,trim(tag_name))
      on conflict(user_id,name) do update set name=excluded.name returning id into tag_id;
    insert into public.meal_tags(user_id,meal_id,tag_id) values(owner_id,target_id,tag_id) on conflict do nothing;
  end loop;
end;
$$;
revoke all on function public.set_meal_tags(uuid,text[]) from public, anon;
grant execute on function public.set_meal_tags(uuid,text[]) to authenticated;

create function public.restore_archive_item(item_type text, item_id uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare photo public.media%rowtype; record public.meal_records%rowtype; steps jsonb; step jsonb; found_step boolean := false;
begin
  if item_type='record' then
    update public.meal_records set deleted_at=null,updated_at=now() where id=item_id;
    if not found then raise exception '복구할 기록을 찾을 수 없습니다.'; end if;
  elsif item_type='scrap' then
    update public.recipe_scraps set deleted_at=null,updated_at=now() where id=item_id;
    if not found then raise exception '복구할 링크를 찾을 수 없습니다.'; end if;
  elsif item_type='media' then
    select * into photo from public.media where id=item_id;
    if not found then raise exception '복구할 사진을 찾을 수 없습니다.'; end if;
    select * into record from public.meal_records where id=photo.meal_record_id for update;
    if not found or record.deleted_at is not null then raise exception '먼저 요리 기록을 복구해주세요.'; end if;
    if photo.deleted_at is null then return; end if;
    if photo.kind='finished' then
      update public.media set deleted_at=now() where meal_record_id=photo.meal_record_id and kind='finished' and deleted_at is null;
    else
      steps := '[]'::jsonb;
      for step in select value from jsonb_array_elements(coalesce(record.recipe_steps,'[]')) loop
        if step->>'id'=photo.recipe_step_id then
          found_step := true;
          if not (coalesce(step->'mediaIds','[]') @> jsonb_build_array(photo.id)) then
            step := jsonb_set(step,'{mediaIds}',coalesce(step->'mediaIds','[]') || jsonb_build_array(photo.id));
          end if;
        end if;
        steps := steps || jsonb_build_array(step);
      end loop;
      if not found_step then
        steps := steps || jsonb_build_array(jsonb_build_object('id',photo.recipe_step_id,'order',jsonb_array_length(steps)+1,'body','복구한 과정 사진','mediaIds',jsonb_build_array(photo.id)));
      end if;
      update public.meal_records set recipe_steps=steps,updated_at=now() where id=record.id;
    end if;
    update public.media set deleted_at=null where id=item_id;
  else raise exception '지원하지 않는 항목입니다.';
  end if;
end;
$$;
revoke all on function public.restore_archive_item(text,uuid) from public, anon;
grant execute on function public.restore_archive_item(text,uuid) to authenticated;

-- Candidates are shared; tournament ownership and progress remain personal.
create or replace function public.validate_world_cup() returns trigger
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
    where not exists (select 1 from public.meal_records r where r.id::text = candidate_id and private.can_access_archive(r.user_id) and r.deleted_at is null)
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
