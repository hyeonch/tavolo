-- Each member retains their own authored records after leaving a journal.
alter table public.meals add column recipe_origin uuid;
create unique index meals_author_origin on public.meals(user_id,recipe_origin);

create function public.repeat_meal_id(source_record uuid) returns uuid
language plpgsql security invoker set search_path='' as $$
declare source public.meals; origin uuid; target uuid;
begin
  select m.* into strict source from public.meals m join public.meal_records r on r.meal_id=m.id
    where r.id=source_record and r.deleted_at is null;
  if source.user_id=auth.uid() then return source.id; end if;
  origin=coalesce(source.recipe_origin,source.id);
  select id into target from public.meals where user_id=auth.uid() and (id=origin or recipe_origin=origin);
  if found then return target; end if;
  insert into public.meals(user_id,name,recipe_url,recipe_origin)
    values(auth.uid(),source.name,source.recipe_url,origin)
    on conflict(user_id,recipe_origin) do nothing returning id into target;
  if target is null then
    select id into strict target from public.meals where user_id=auth.uid() and recipe_origin=origin;
  else
    perform public.set_meal_tags(target,array(select t.name from public.tags t join public.meal_tags mt on mt.tag_id=t.id where mt.meal_id=source.id));
  end if;
  return target;
end $$;

create function public.repeat_cooking(source_record uuid, new_record uuid, cooking_date date, cooking_note text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare target uuid; source public.meal_records;
begin
  target=public.repeat_meal_id(source_record);
  select * into strict source from public.meal_records where id=source_record and deleted_at is null;
  insert into public.meal_records(id,user_id,meal_id,cooked_at,memo,ingredient_groups,recipe_steps)
  values(new_record,auth.uid(),target,cooking_date,cooking_note,source.ingredient_groups,
    coalesce((select jsonb_agg(step || '{"mediaIds":[]}'::jsonb order by n)
      from jsonb_array_elements(source.recipe_steps) with ordinality as s(step,n)), '[]'::jsonb))
  on conflict(id) do nothing;
  if not exists(select 1 from public.meal_records where id=new_record and user_id=auth.uid() and meal_id=target and deleted_at is null)
    then raise exception 'record unavailable'; end if;
  return new_record;
end $$;
revoke all on function public.repeat_meal_id(uuid), public.repeat_cooking(uuid,uuid,date,text) from public,anon;
grant execute on function public.repeat_meal_id(uuid), public.repeat_cooking(uuid,uuid,date,text) to authenticated;
