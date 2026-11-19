create function public.records_using_ingredient(needle text) returns setof public.meal_records
language sql stable security invoker set search_path = '' as $$
  select r.* from public.meal_records r
  where r.deleted_at is null and length(trim(needle)) between 1 and 120 and exists (
    select 1 from jsonb_array_elements(r.ingredient_groups) g,
      lateral jsonb_array_elements(g->'items') i
    where strpos(lower(i->>'name'), lower(trim(needle))) > 0
  );
$$;
revoke all on function public.records_using_ingredient(text) from public, anon;
grant execute on function public.records_using_ingredient(text) to authenticated;
