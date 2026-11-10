import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createProbeServer } from '../server/mcpProbe.mjs';

export async function POST(request) {
  const origin = request.headers.get('origin');
  if (origin && !['https://chatgpt.com', 'https://tavolo-two.vercel.app'].includes(origin)) return new Response('Forbidden origin', { status: 403 });
  const server = createProbeServer();
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  try {
    await server.connect(transport);
    const response = await transport.handleRequest(request);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch {
    console.error('tavolo_mcp_probe_request_failed');
    return Response.json({ error: 'MCP request failed' }, { status: 500 });
  } finally { await server.close(); }
}
export function GET() { return new Response('Use MCP Streamable HTTP POST.', { status: 405, headers: { Allow: 'POST', 'Cache-Control': 'no-store' } }); }
export const DELETE = GET;
