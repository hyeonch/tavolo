create table public.mcp_draft_photos (
  draft_id uuid not null references public.mcp_record_drafts(id) on delete cascade,
  slot text not null,
  id uuid not null default gen_random_uuid(),
  storage_path text not null,
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp')),
  byte_size integer not null check (byte_size between 1 and 10485760),
  primary key(draft_id,slot), unique(id)
);
alter table public.mcp_draft_photos enable row level security;
revoke all on public.mcp_draft_photos from public,anon,authenticated;
grant select on public.mcp_draft_photos to authenticated;
create policy draft_photos_read on public.mcp_draft_photos for select to authenticated using (
  exists(select 1 from public.mcp_record_drafts d where d.id=draft_id and d.user_id=(select auth.uid()))
);
create or replace function public.validate_mcp_draft_revision() returns trigger language plpgsql set search_path='' as $$
begin
  if new.revision <> old.revision+1 then raise exception 'stale draft revision'; end if;
  if new.payload->'steps' is distinct from old.payload->'steps' and exists(
    select 1 from public.mcp_draft_photos where draft_id=old.id and slot like 'step:%'
  ) then raise exception 'finish editing steps before attaching step photos'; end if;
  new.updated_at=now();
  return new;
end $$;
create policy "Upload own draft photos" on storage.objects for insert to authenticated with check (
  bucket_id='meal-media' and (storage.foldername(name))[1]=(select auth.uid())::text
  and exists(select 1 from public.mcp_record_drafts d where d.id::text=(storage.foldername(name))[2] and d.user_id=(select auth.uid()) and d.record_id is null)
);
create policy "Read own draft photos" on storage.objects for select to authenticated using (
  bucket_id='meal-media' and (storage.foldername(name))[1]=(select auth.uid())::text
  and exists(select 1 from public.mcp_record_drafts d where d.id::text=(storage.foldername(name))[2] and d.user_id=(select auth.uid()))
);

-- Only this checked transaction can move private drafts into the shared archive.
create function private.mcp_draft_action(action text, target_id uuid, expected_revision integer, photo jsonb default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid(); d public.mcp_record_drafts; p public.mcp_draft_photos;
  meal uuid; groups jsonb := '[]'; steps jsonb := '[]'; g jsonb; item jsonb; items jsonb; s text; n integer:=0;
  slot_name text; note text;
begin
  if actor is null then raise exception 'authentication required'; end if;
  select * into d from public.mcp_record_drafts where id=target_id and user_id=actor for update;
  if not found then raise exception 'draft not found'; end if;
  if action='commit' and d.record_id is not null then return jsonb_build_object('recordId',d.record_id,'created',false); end if;
  if d.record_id is not null then raise exception 'draft already committed'; end if;
  if action='attach' then
    slot_name=photo->>'slot';
    if slot_name <> 'finished' and slot_name !~ '^step:[0-9]{1,2}$' then raise exception 'invalid photo slot'; end if;
    select * into p from public.mcp_draft_photos where draft_id=d.id and slot=slot_name;
    if found and p.storage_path=photo->>'path' then return jsonb_build_object('photoId',p.id,'revision',d.revision); end if;
  end if;
  if d.revision<>expected_revision then raise exception 'stale draft revision'; end if;
  if action='attach' then
    if photo->>'path' !~ ('^'||actor::text||'/'||d.id::text||'/[a-f0-9]{64}\.(png|jpg|webp)$') then raise exception 'invalid photo path'; end if;
    if slot_name like 'step:%' and split_part(slot_name,':',2)::integer >= jsonb_array_length(d.payload->'steps') then raise exception 'step not found'; end if;
    if not exists(select 1 from storage.objects where bucket_id='meal-media' and name=photo->>'path') then raise exception 'photo not uploaded'; end if;
    insert into public.mcp_draft_photos(draft_id,slot,storage_path,mime_type,byte_size)
      values(d.id,slot_name,photo->>'path',photo->>'mimeType',(photo->>'bytes')::integer)
      on conflict(draft_id,slot) do update set storage_path=excluded.storage_path,mime_type=excluded.mime_type,byte_size=excluded.byte_size returning * into p;
    update public.mcp_record_drafts set revision=revision+1 where id=d.id;
    return jsonb_build_object('photoId',p.id,'revision',d.revision+1);
  elsif action <> 'commit' then raise exception 'invalid action'; end if;
  if coalesce(length(trim(d.payload->>'name')),0) not between 1 and 120
    or jsonb_typeof(d.payload->'steps') is distinct from 'array'
    or jsonb_typeof(d.payload->'ingredientGroups') is distinct from 'array'
    or jsonb_typeof(d.payload->'tags') is distinct from 'array'
    or jsonb_typeof(d.payload->'uncertainties') is distinct from 'array'
    then raise exception 'invalid draft'; end if;
  if exists(select 1 from public.mcp_draft_photos dp where dp.draft_id=d.id and
    (not exists(select 1 from storage.objects o where o.bucket_id='meal-media' and o.name=dp.storage_path)
    or (dp.slot like 'step:%' and split_part(dp.slot,':',2)::integer>=jsonb_array_length(d.payload->'steps'))))
    then raise exception 'missing photo or recipe step'; end if;
  for g in select value from jsonb_array_elements(d.payload->'ingredientGroups') loop
    items='[]';
    for item in select value from jsonb_array_elements(g->'items') loop
      items=items||jsonb_build_array(item||jsonb_build_object('id',gen_random_uuid()));
    end loop;
    groups=groups||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'name',g->>'name','items',items));
  end loop;
  for s in select value from jsonb_array_elements_text(d.payload->'steps') loop
    steps=steps||jsonb_build_array(jsonb_build_object('id','mcp-step-'||n,'order',n+1,'body',s,'mediaIds',coalesce(
      (select jsonb_agg(dp.id) from public.mcp_draft_photos dp where dp.draft_id=d.id and dp.slot='step:'||n),'[]'::jsonb)));
    n=n+1;
  end loop;
  note=coalesce(d.payload->>'memo','');
  if jsonb_array_length(d.payload->'uncertainties')>0 then
    note=note||E'\n\n[확인 필요 / 추정]\n'||(select string_agg(value,E'\n') from jsonb_array_elements_text(d.payload->'uncertainties'));
  end if;
  insert into public.meals(user_id,name,recipe_url) values(actor,d.payload->>'name',d.payload->>'recipeUrl') returning id into meal;
  insert into public.meal_records(id,user_id,meal_id,cooked_at,rating,memo,ingredient_groups,recipe_steps)
    values(d.id,actor,meal,(d.payload->>'cookedAt')::date,(d.payload->>'rating')::smallint,note,groups,steps);
  perform public.set_meal_tags(meal,array(select jsonb_array_elements_text(d.payload->'tags')));
  insert into public.media(id,user_id,meal_record_id,storage_path,mime_type,byte_size,kind,recipe_step_id)
    select dp.id,actor,d.id,dp.storage_path,dp.mime_type,dp.byte_size,
      case when dp.slot='finished' then 'finished' else 'step' end,
      case when dp.slot='finished' then null else 'mcp-step-'||split_part(dp.slot,':',2) end
    from public.mcp_draft_photos dp where dp.draft_id=d.id;
  update public.mcp_record_drafts set record_id=d.id,revision=revision+1 where id=d.id;
  return jsonb_build_object('recordId',d.id,'created',true);
end $$;
revoke all on function private.mcp_draft_action(text,uuid,integer,jsonb) from public,anon;
grant execute on function private.mcp_draft_action(text,uuid,integer,jsonb) to authenticated;
create function public.mcp_draft_action(action text,target_id uuid,expected_revision integer,photo jsonb default null) returns jsonb
language sql security invoker set search_path='' as $$select private.mcp_draft_action(action,target_id,expected_revision,photo)$$;
revoke all on function public.mcp_draft_action(text,uuid,integer,jsonb) from public,anon;
grant execute on function public.mcp_draft_action(text,uuid,integer,jsonb) to authenticated;
