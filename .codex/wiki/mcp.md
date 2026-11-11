# ChatGPT MCP validation — TVL-54

The user confirmed the web ChatGPT custom MCP menu is available (2026-11-10).

## Connection probe

- URL: https://tavolo-kr.vercel.app/api/mcp-probe
- Transport: stateless Streamable HTTP, JSON responses, official MCP SDK.
- Authentication: No authentication for this diagnostic endpoint only.
- Tools: `tavolo_connection_test`, `tavolo_photo_transfer_test`.
- The endpoint has no database/storage client and cannot read or write the archive. Photo bytes are streamed only to calculate byte count and SHA-256, then discarded; no URL, photo content or arguments are logged by application code.
- Photo fetches accept HTTPS OpenAI delivery domains only, forbid redirects and credentials, limit content to 10 MB and time out after 8 seconds. Delivery hosts outside the allowlist must be verified before adding them.
- This does NOT establish Tavolo OAuth, persistent writes, or mobile support. TVL-54 connection/photo probe is complete; authenticated flow verification is tracked in TVL-55/56.

## Manual connection experiment

Add a custom MCP server in web ChatGPT, use the URL above and No authentication. Install it, attach it to a conversation and ask for a connection test. Then attach a disposable test photo and ask for a photo transfer test. Success must include nonzero bytes and SHA-256. Repeat on iOS; do not infer iOS support from web success.

## Next stage contract

Use authorization-code OAuth with S256 PKCE. Identify the Tavolo account from a verified access token, never an input user ID. Preserve shared-journal RLS. Validate issuer/audience/expiry/scopes on every call. Investigate Supabase's OAuth-provider support before choosing an auth implementation. Persistent writes are TVL-55/56, with idempotency and recoverable deletion.

## Official references

- https://developers.openai.com/api/docs/guides/custom-mcp-server
- https://developers.openai.com/plugins/build/auth
- https://developers.openai.com/plugins/reference (openai/fileParams)
- https://developers.openai.com/plugins/build/app-quickstart

## TVL-55 authenticated tools

- Real ChatGPT connection and file transfer were verified on 2026-11-10. A 130866-byte attachment arrived with the same SHA-256 as the original. The diagnostic did not persist it.
- Production endpoint: `https://tavolo-kr.vercel.app/api/mcp`. Probe remains separate and unauthenticated.
- Native Supabase OAuth authorization-code/PKCE; consent UI `/oauth/consent`, protected resource discovery `/.well-known/oauth-protected-resource`. Existing Google login and journal RLS are retained. No service-role credentials.
- Verify signature, expiry, issuer, authenticated audience, OAuth client_id and current user. Standard Supabase email scope identifies the account; it is NOT a granular archive permission. Consent explicitly describes full existing archive permissions.
- Tools: journal lookup, idempotent URL save, paginated link list and record-name search, private structured draft create/read/revision-guarded update. Drafts are private until committed, separate from dated cooking records.
- Deployment prerequisite: apply mcp_record_drafts migration. OAuth setup: enable Supabase OAuth Server, set authorization path `/oauth/consent`, Site URL `https://tavolo-kr.vercel.app`, allow `https://tavolo-kr.vercel.app/oauth/consent**` Google return URL, enable dynamic client registration. Connect the real MCP endpoint with OAuth in ChatGPT.
- OAuth server was observed disabled. Dashboard requires user sign-in in this workspace; actual OAuth and authenticated ChatGPT writes remain unverified until enabled and connected. Do not mark TVL-55 Done before that test.

## TVL-56 photos and commit

- `tavolo_attach_draft_photo` accepts a ChatGPT file object, validates JPEG/PNG/WebP signatures, limits downloads to 10 MB/8 seconds and forbids redirects/arbitrary hosts. Files are staged privately in meal-media under the author's draft ID; deterministic content+slot paths allow retries without overwrites.
- Draft photos stay private until `tavolo_commit_draft` atomically creates the meal, dated record, ingredients, steps, tags and photo metadata. Repeated commit returns the same record ID; it never restores trash. Uncertainties become explicitly labelled notes.
- The checked private transaction locks the author's draft, rejects stale revisions/foreign authors/missing uploads, and rolls back all relational writes on failure. Step order must be finalized before step photos are attached; post-commit edits use the existing app.
- Interrupted uploads and replaced draft photos can leave private unused objects. There is no automatic permanent deletion. They cannot appear as broken records.
- Production migration: commit_mcp_drafts_with_photos. Real authenticated ChatGPT upload/commit and two-account UI verification remain pending OAuth setup; tests are not a substitute for those checks.
