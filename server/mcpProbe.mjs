import { createHash } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

const maxBytes = 10 * 1024 * 1024;
export function allowedFileUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) throw new Error('허용되지 않는 파일 주소입니다.');
  // Only OpenAI delivery hosts; arbitrary URL fetching is not a probe feature.
  if (!/^(?:[a-z0-9-]+\.)*oaiusercontent\.com$/.test(url.hostname)
      && !/^oai[a-z0-9-]*\.blob\.core\.windows\.net$/.test(url.hostname)) throw new Error('ChatGPT 파일 전달 주소만 사용할 수 있어요.');
  return url;
}
export async function inspectFile(file, fetcher = fetch) {
  const url = allowedFileUrl(file.download_url);
  const response = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(8000) });
  if (!response.ok || !response.body) throw new Error('파일을 받지 못했어요. 사진을 다시 첨부해주세요.');
  if (Number(response.headers.get('content-length')) > maxBytes) { await response.body.cancel(); throw new Error('테스트 사진은 10MB 이하로 보내주세요.'); }
  const reader = response.body.getReader();
  let bytes = 0;
  const hash = createHash('sha256');
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) throw new Error('테스트 사진은 10MB 이하로 보내주세요.');
      hash.update(value);
    }
  } finally { await reader.cancel(); }
  return { received: true, bytes, sha256: hash.digest('hex'), persisted: false, authenticated: false };
}
function result(data) { return { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data }; }
export function createProbeServer() {
  const server = new McpServer({ name: 'tavolo-connection-test', version: '0.1.0' });
  server.registerTool('tavolo_connection_test', {
    title: 'Tavolo 연결 확인',
    description: 'ChatGPT와 Tavolo MCP 연결을 확인합니다. 로그인·기록 조회·저장 기능은 없는 진단 도구입니다.',
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    _meta: { securitySchemes: [{ type: 'noauth' }] },
  }, async () => result({ connected: true, authenticated: false, archiveAccess: false, persistence: false, message: 'Tavolo 연결 테스트 성공. 기록 저장은 아직 연결하지 않았어요.' }));
  server.registerTool('tavolo_photo_transfer_test', {
    title: 'Tavolo 사진 전달 확인',
    description: '사용자가 테스트용으로 첨부한 사진 원본이 Tavolo 서버에 전달되는지 확인합니다. 바이트 수와 해시만 반환하며 사진·기록을 저장하거나 내용을 분석하지 않습니다.',
    inputSchema: { photo: z.object({ download_url: z.string().url(), file_id: z.string().min(1), mime_type: z.string().optional(), file_name: z.string().optional() }) },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    _meta: { securitySchemes: [{ type: 'noauth' }], 'openai/fileParams': ['photo'] },
  }, async ({ photo }) => {
    try { return result(await inspectFile(photo)); }
    catch (error) { return { isError: true, content: [{ type: 'text', text: error.message.includes('테스트') || error.message.includes('ChatGPT') || error.message.includes('파일') ? error.message : '사진 전달에 실패했어요. 새 사진으로 다시 시도해주세요.' }] }; }
  });
  return server;
}
