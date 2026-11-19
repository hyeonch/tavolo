alter table public.meal_records
  add column servings smallint check (servings > 0),
  add column total_minutes smallint check (total_minutes > 0);

-- The commit RPC links the inserted record to its draft in the same transaction.
create function private.copy_draft_cooking_fields() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.record_id is not null and old.record_id is null then
    update public.meal_records
      set servings = (new.payload->>'servings')::smallint,
          total_minutes = (new.payload->>'totalMinutes')::smallint
      where id = new.record_id and user_id = new.user_id;
  end if;
  return new;
end $$;
create trigger copy_draft_cooking_fields after update of record_id on public.mcp_record_drafts
for each row execute function private.copy_draft_cooking_fields();
