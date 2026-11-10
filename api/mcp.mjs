import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { authenticate, challenge } from '../server/mcpAuth.mjs';
import { createArchiveServer } from '../server/archiveMcp.mjs';

export async function POST(request) {
  const origin = request.headers.get('origin');
  if (origin && !['https://chatgpt.com','https://tavolo-kr.vercel.app'].includes(origin)) return new Response('Forbidden origin',{status:403});
  let server;
  try {
    const auth = await authenticate(request);
    if (!auth) return challenge();
    server = createArchiveServer(auth);
    const transport = new WebStandardStreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
    await server.connect(transport);
    const response = await transport.handleRequest(request);
    response.headers.set('Cache-Control','no-store');
    return response;
  } catch {
    return Response.json({error:'Tavolo 요청을 처리하지 못했어요.'},{status:503,headers:{'Cache-Control':'no-store'}});
  } finally { if (server) await server.close(); }
}
export function GET() { return challenge(); }
export const DELETE = GET;
