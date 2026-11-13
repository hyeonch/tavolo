/** A content-derived identity keeps upload retries from creating extra photos. */
export async function mediaIdentity(recordId: string, stepId: string | undefined, blob: Blob): Promise<string> {
  const prefix = new TextEncoder().encode(`${recordId}:${stepId ?? 'finished'}:${blob.type}:`);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const data = new Uint8Array(prefix.length + bytes.length);
  data.set(prefix); data.set(bytes, prefix.length);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  hash[6] = (hash[6] & 15) | 80;
  hash[8] = (hash[8] & 63) | 128;
  const hex = [...hash.slice(0, 16)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
