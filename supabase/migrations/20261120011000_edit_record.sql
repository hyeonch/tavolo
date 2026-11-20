-- The actor-specific staging prefix lets the uploader validate bytes before publication.
create policy read_staged_record_upload on storage.objects for select to authenticated using (
  bucket_id='meal-media' and split_part(name,'/',3)='mcp-'||(select auth.uid())::text
  and exists(select 1 from public.meal_records r where r.id::text=split_part(name,'/',2)
    and r.user_id::text=split_part(name,'/',1) and r.deleted_at is null)
);

create function public.edit_archive_record(target_id uuid, expected_update timestamptz, patch jsonb, photo jsonb default null)
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
  if patch ? 'tags' then perform public.set_meal_tags(r.meal_id,array(select jsonb_array_elements_text(patch->'tags'))); end if;
  if photo is not null then
    if not exists(select 1 from storage.objects where bucket_id='meal-media' and name=photo_path) then raise exception 'missing photo'; end if;
    step_id=photo->>'stepId';
    if step_id is not null and not exists(select 1 from jsonb_array_elements(r.recipe_steps) s where s->>'id'=step_id) then raise exception 'missing step'; end if;
    insert into public.media(user_id,meal_record_id,storage_path,mime_type,byte_size,kind,recipe_step_id)
      values(r.user_id,r.id,photo_path,photo->>'mimeType',(photo->>'bytes')::int,case when step_id is null then 'finished' else 'step' end,step_id) returning id into media_id;
    if step_id is not null then
      select jsonb_agg(case when s->>'id'=step_id then jsonb_set(s,'{mediaIds}',coalesce(s->'mediaIds','[]')||to_jsonb(media_id)) else s end order by n)
        into new_steps from jsonb_array_elements(r.recipe_steps) with ordinality as entries(s,n);
    end if;
  end if;
  update public.meal_records set cooked_at=coalesce((patch->>'cookedAt')::date,cooked_at),
    memo=coalesce(patch->>'memo',memo), rating=case when patch ? 'rating' then (patch->>'rating')::smallint else rating end,
    ingredient_groups=coalesce(patch->'ingredientGroups',ingredient_groups),recipe_steps=coalesce(new_steps,recipe_steps),
    updated_at=clock_timestamp() where id=r.id returning updated_at into r.updated_at;
  return jsonb_build_object('recordId',r.id,'updatedAt',r.updated_at,'photoId',media_id);
end $$;
revoke all on function public.edit_archive_record(uuid,timestamptz,jsonb,jsonb) from public, anon;
grant execute on function public.edit_archive_record(uuid,timestamptz,jsonb,jsonb) to authenticated;
