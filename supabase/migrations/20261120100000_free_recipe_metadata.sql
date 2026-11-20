alter table public.meal_records add column metadata jsonb not null default '{}';
alter table public.meal_records add constraint recipe_metadata_type check (
  jsonb_typeof(metadata)='object' and metadata - array['country','mainIngredient','dishType'] = '{}'::jsonb
  and coalesce(jsonb_typeof(metadata->'country')='array',true)
  and coalesce(jsonb_typeof(metadata->'mainIngredient')='array',true)
  and coalesce(jsonb_typeof(metadata->'dishType')='array',true)
  and not jsonb_path_exists(metadata,'strict $.*[*] ? (@.type() != "string")')
);
with legacy(name,field) as (values ('한식','country'), ('이탈리안','country'), ('일식','country'), ('중식','country'), ('프랑스','country'), ('스페인','country'), ('그리스','country'), ('미국','country'), ('멕시코','country'), ('태국','country'), ('베트남','country'), ('인도','country'), ('기타 국가','country'), ('닭고기','mainIngredient'), ('닭가슴살','mainIngredient'), ('돼지고기','mainIngredient'), ('소고기','mainIngredient'), ('생선','mainIngredient'), ('해산물','mainIngredient'), ('달걀','mainIngredient'), ('두부','mainIngredient'), ('콩','mainIngredient'), ('버섯','mainIngredient'), ('채소','mainIngredient'), ('감자','mainIngredient'), ('치즈','mainIngredient'), ('쌀','mainIngredient'), ('면','mainIngredient'), ('빵','mainIngredient'), ('밥요리','dishType'), ('면요리','dishType'), ('파스타','dishType'), ('리소토','dishType'), ('국·탕','dishType'), ('찌개','dishType'), ('조림','dishType'), ('찜','dishType'), ('구이','dishType'), ('볶음','dishType'), ('튀김','dishType'), ('전','dishType'), ('샐러드','dishType'), ('샌드위치','dishType'), ('반찬','dishType'), ('디저트','dishType')), grouped as (
select mt.meal_id,l.field,jsonb_agg(t.name order by t.name) names from public.meal_tags mt join public.tags t on t.id=mt.tag_id join legacy l on l.name=t.name group by mt.meal_id,l.field
), classified as (select meal_id,jsonb_object_agg(field,names) metadata from grouped group by meal_id)
update public.meal_records r set metadata=c.metadata from classified c where r.meal_id=c.meal_id;
create or replace function private.copy_draft_cooking_fields() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.record_id is not null and old.record_id is null then
    update public.meal_records
      set metadata = coalesce(new.payload->'metadata','{}'::jsonb), servings = (new.payload->>'servings')::smallint,
          total_minutes = (new.payload->>'totalMinutes')::smallint
      where id = new.record_id and user_id = new.user_id;
  end if;
  return new;
end $$;
create or replace function public.repeat_cooking(source_record uuid, new_record uuid, cooking_date date, cooking_note text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare target uuid; source public.meal_records;
begin
  target=public.repeat_meal_id(source_record);
  select * into strict source from public.meal_records where id=source_record and deleted_at is null;
  insert into public.meal_records(id,user_id,meal_id,cooked_at,memo,metadata,ingredient_groups,recipe_steps)
  values(new_record,auth.uid(),target,cooking_date,cooking_note,source.metadata,source.ingredient_groups,
    coalesce((select jsonb_agg(step || '{"mediaIds":[]}'::jsonb order by n)
      from jsonb_array_elements(source.recipe_steps) with ordinality as s(step,n)), '[]'::jsonb))
  on conflict(id) do nothing;
  if not exists(select 1 from public.meal_records where id=new_record and user_id=auth.uid() and meal_id=target and deleted_at is null)
    then raise exception 'record unavailable'; end if;
  return new_record;
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
  update public.meal_records set metadata=metadata || coalesce(patch->'metadata','{}'::jsonb), cooked_at=coalesce((patch->>'cookedAt')::date,cooked_at),
    memo=coalesce(patch->>'memo',memo), rating=case when patch ? 'rating' then (patch->>'rating')::smallint else rating end,
    ingredient_groups=coalesce(patch->'ingredientGroups',ingredient_groups),recipe_steps=coalesce(new_steps,recipe_steps),
    updated_at=clock_timestamp() where id=r.id returning updated_at into r.updated_at;
  return jsonb_build_object('recordId',r.id,'updatedAt',r.updated_at,'photoId',media_id);
end $$;
