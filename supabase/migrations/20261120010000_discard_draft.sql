grant delete on public.mcp_record_drafts to authenticated;
create policy discard_own_uncommitted_draft on public.mcp_record_drafts
for delete to authenticated using (user_id = (select auth.uid()) and record_id is null);
