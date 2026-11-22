-- TVL-75: edit servings, cooking time, recipe link and uncertainties after commit,
-- and trash or move photos on committed records without hard deletion.

alter table public.meal_records add column uncertainties jsonb not null default '[]'::jsonb;
alter table public.meal_records add constraint meal_records_uncertainties_type check (
  jsonb_typeof(uncertainties)='array' and jsonb_array_length(uncertainties)<=30
  and not jsonb_path_exists(uncertainties,'strict $[*] ? (@.type() != "string")')
);

-- Split notes that earlier commits merged into the memo.
update public.meal_records
set uncertainties=coalesce((select jsonb_agg(line) from unnest(string_to_array(split_part(memo,E'\n\n[확인 필요 / 추정]\n',2),E'\n')) line where trim(line)<>''),'[]'::jsonb),
    memo=split_part(memo,E'\n\n[확인 필요 / 추정]\n',1)
where memo like E'%\n\n[확인 필요 / 추정]\n%';

-- The commit RPC still merges uncertainties into the memo; this trigger runs in the
-- same transaction and stores them separately instead.
create or replace function private.copy_draft_cooking_fields() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.record_id is not null and old.record_id is null then
    update public.meal_records
      set metadata = coalesce(new.payload->'metadata','{}'::jsonb), servings = (new.payload->>'servings')::smallint,
          total_minutes = (new.payload->>'totalMinutes')::smallint,
          memo = coalesce(new.payload->>'memo',''),
          uncertainties = coalesce(new.payload->'uncertainties','[]'::jsonb)
      where id = new.record_id and user_id = new.user_id;
  end if;
  return new;
end $$;

create or replace function public.edit_archive_record(target_id uuid, expected_update timestamptz, patch jsonb, photo jsonb default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  r public.meal_records; new_steps jsonb; media_id uuid; step_id text; photo_path text;
begin
  select * into strict r from public.meal_records where id=target_id and deleted_at is null for update;
  if photo is not null then
    photo_path=photo->>'path';
    if split_part(photo_path,'/',1)<>r.user_id::text or split_part(photo_path,'/',2)<>r.id::text
      or split_part(photo_path,'/',3)<>'mcp-'||auth.uid()::text then raise exception 'invalid path'; end if;
    select id into media_id from public.media where storage_path=photo_path and deleted_at is null;
    if found then return jsonb_build_object('recordId',r.id,'updatedAt',r.updated_at,'photoId',media_id); end if;
  end if;
  if r.updated_at is distinct from expected_update then raise exception 'record changed'; end if;
  if patch ? 'steps' then
    if exists(select 1 from jsonb_array_elements(patch->'steps') s group by s->>'id' having count(*)>1)
      or exists(select 1 from public.media m where m.meal_record_id=r.id and m.kind='step' and m.deleted_at is null
        and not exists(select 1 from jsonb_array_elements(patch->'steps') s where s->>'id'=m.recipe_step_id))
      then raise exception 'preserve photographed steps and unique ids'; end if;
    select coalesce(jsonb_agg(jsonb_build_object('id',s->>'id','body',s->>'body','order',n,'mediaIds',
      coalesce((select old->'mediaIds' from jsonb_array_elements(r.recipe_steps) old where old->>'id'=s->>'id'),'[]')) order by n),'[]')
      into new_steps from jsonb_array_elements(patch->'steps') with ordinality as entries(s,n);
  end if;
  if patch ? 'name' then update public.meals set name=patch->>'name',updated_at=now() where id=r.meal_id; end if;
  -- The recipe link belongs to the dish, so every record of this meal shows the change.
  if patch ? 'recipeUrl' then update public.meals set recipe_url=nullif(patch->>'recipeUrl',''),updated_at=now() where id=r.meal_id; end if;
  if patch ? 'tags' then perform public.set_meal_tags(r.meal_id,array(select jsonb_array_elements_text(patch->'tags'))); end if;
  if photo is not null then
    if not exists(select 1 from storage.objects where bucket_id='meal-media' and name=photo_path) then raise exception 'missing photo'; end if;
    step_id=photo->>'stepId';
    if step_id is not null and not exists(select 1 from jsonb_array_elements(r.recipe_steps) s where s->>'id'=step_id) then raise exception 'missing step'; end if;
    -- A record keeps one finished photo; the previous one moves to the recoverable trash.
    if step_id is null then
      update public.media set deleted_at=now() where meal_record_id=r.id and kind='finished' and deleted_at is null;
    end if;
    insert into public.media(user_id,meal_record_id,storage_path,mime_type,byte_size,kind,recipe_step_id)
      values(r.user_id,r.id,photo_path,photo->>'mimeType',(photo->>'bytes')::int,case when step_id is null then 'finished' else 'step' end,step_id) returning id into media_id;
    if step_id is not null then
      select jsonb_agg(case when s->>'id'=step_id then jsonb_set(s,'{mediaIds}',coalesce(s->'mediaIds','[]')||to_jsonb(media_id)) else s end order by n)
        into new_steps from jsonb_array_elements(r.recipe_steps) with ordinality as entries(s,n);
    end if;
  end if;
  update public.meal_records set metadata=metadata || coalesce(patch->'metadata','{}'::jsonb), cooked_at=coalesce((patch->>'cookedAt')::date,cooked_at),
    memo=coalesce(patch->>'memo',memo),
    servings=case when patch ? 'servings' then (patch->>'servings')::smallint else servings end,
    total_minutes=case when patch ? 'totalMinutes' then (patch->>'totalMinutes')::smallint else total_minutes end,
    uncertainties=case when patch ? 'uncertainties' then coalesce(nullif(patch->'uncertainties','null'::jsonb),'[]'::jsonb) else uncertainties end,
    ingredient_groups=coalesce(patch->'ingredientGroups',ingredient_groups),recipe_steps=coalesce(new_steps,recipe_steps),
    updated_at=clock_timestamp() where id=r.id returning updated_at into r.updated_at;
  return jsonb_build_object('recordId',r.id,'updatedAt',r.updated_at,'photoId',media_id);
end $$;

-- Trash a photo, or move it to the finished slot or a recipe step. Files are never deleted.
create function public.edit_record_photo(target_id uuid, expected_update timestamptz, photo_id uuid, action text, step_id text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.meal_records; m public.media; steps jsonb;
begin
  select * into strict r from public.meal_records where id=target_id and deleted_at is null for update;
  select * into m from public.media where id=photo_id and meal_record_id=r.id for update;
  if not found then raise exception 'photo not found'; end if;
  -- Retries of an already applied request return the current state.
  if (action='trash' and m.deleted_at is not null)
    or (action='move' and m.deleted_at is null and m.recipe_step_id is not distinct from step_id)
    then return jsonb_build_object('recordId',r.id,'updatedAt',r.updated_at,'photoId',m.id); end if;
  if r.updated_at is distinct from expected_update then raise exception 'record changed'; end if;
  if m.deleted_at is not null then raise exception 'photo is in trash'; end if;
  select coalesce(jsonb_agg(jsonb_set(s,'{mediaIds}',coalesce((select jsonb_agg(x) from jsonb_array_elements(coalesce(s->'mediaIds','[]')) x
      where x<>to_jsonb(m.id)),'[]')) order by n),'[]')
    into steps from jsonb_array_elements(r.recipe_steps) with ordinality as entries(s,n);
  if action='trash' then
    update public.media set deleted_at=now() where id=m.id;
  elsif action='move' and step_id is null then
    update public.media set deleted_at=now() where meal_record_id=r.id and kind='finished' and deleted_at is null and id<>m.id;
    update public.media set kind='finished',recipe_step_id=null where id=m.id;
  elsif action='move' then
    if not exists(select 1 from jsonb_array_elements(r.recipe_steps) s where s->>'id'=step_id) then raise exception 'missing step'; end if;
    update public.media set kind='step',recipe_step_id=step_id where id=m.id;
    select jsonb_agg(case when s->>'id'=step_id then jsonb_set(s,'{mediaIds}',coalesce(s->'mediaIds','[]')||to_jsonb(m.id)) else s end order by n)
      into steps from jsonb_array_elements(steps) with ordinality as entries(s,n);
  else raise exception 'invalid action';
  end if;
  update public.meal_records set recipe_steps=steps,updated_at=clock_timestamp() where id=r.id returning updated_at into r.updated_at;
  return jsonb_build_object('recordId',r.id,'updatedAt',r.updated_at,'photoId',m.id);
end $$;
revoke all on function public.edit_record_photo(uuid,timestamptz,uuid,text,text) from public, anon;
grant execute on function public.edit_record_photo(uuid,timestamptz,uuid,text,text) to authenticated;
