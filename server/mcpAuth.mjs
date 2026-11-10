import { createClient } from '@supabase/supabase-js';

export const resource = 'https://tavolo-kr.vercel.app/api/mcp';
export function configuration(env = process.env) {
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('MCP configuration missing');
  return { url: url.replace(/\/$/, ''), key };
}
export function challenge() {
  return Response.json({ error: 'Tavolo 계정 연결이 필요합니다.' }, { status: 401, headers: {
    'WWW-Authenticate': `Bearer resource_metadata="https://tavolo-kr.vercel.app/.well-known/oauth-protected-resource", scope="email"`,
    'Cache-Control': 'no-store',
  } });
}
export async function authenticate(request, config = configuration(), factory = createClient) {
  const match = /^Bearer ([^\s]+)$/.exec(request.headers.get('authorization') ?? '');
  if (!match) return null;
  const token = match[1];
  const db = factory(config.url, config.key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await db.auth.getClaims(token);
  if (error || !data?.claims) return null;
  const claims = data.claims;
  if (claims.iss !== `${config.url}/auth/v1` || claims.aud !== 'authenticated'
      || claims.role !== 'authenticated' || !claims.sub || !claims.client_id
      || !Number.isFinite(claims.exp) || claims.exp <= Date.now() / 1000) return null;
  // Check the live user as well as the cryptographically verified token.
  const user = await db.auth.getUser(token);
  if (user.error || user.data.user?.id !== claims.sub) return null;
  return { db, userId: claims.sub, clientId: claims.client_id };
}
