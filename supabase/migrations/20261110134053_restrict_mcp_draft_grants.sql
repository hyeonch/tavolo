-- Supabase hosted default privileges may grant ALL on newly created tables.
revoke all on public.mcp_record_drafts from public, anon, authenticated;
grant select, insert on public.mcp_record_drafts to authenticated;
grant update (payload,revision,updated_at) on public.mcp_record_drafts to authenticated;
