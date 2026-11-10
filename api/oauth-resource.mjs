import { configuration, resource } from '../server/mcpAuth.mjs';
export function GET() {
  return Response.json({ resource, authorization_servers: [`${configuration().url}/auth/v1`],
    scopes_supported: ['email'], bearer_methods_supported: ['header'], resource_name: 'Tavolo 요리 기록장' },
  { headers: { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } });
}
