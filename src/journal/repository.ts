import { getSupabaseClient } from '../lib/supabase';

async function client() {
  const db = await getSupabaseClient();
  if (!db) throw new Error('로그인이 필요합니다.');
  return db;
}
function check(error: { message: string } | null) { if (error) throw new Error(error.message); }
export type Journal = { name: string; members: { user_id: string; display_name: string }[] };
export async function loadJournal(): Promise<Journal | null> {
  const db = await client();
  const [journals, members] = await Promise.all([db.from('journals').select('name').maybeSingle(), db.from('journal_members').select('user_id,display_name')]);
  check(journals.error); check(members.error);
  return journals.data ? { name: journals.data.name, members: members.data ?? [] } : null;
}
export async function journalAction(action: 'invite' | 'accept' | 'revoke', displayName: string, email = '', token = '') {
  const db = await client();
  const { data, error } = await db.rpc('journal_action', { action, display_name: displayName, recipient_email: email, invite_token: token.trim() });
  check(error);
  return data as { token?: string; expiresAt?: string };
}
export type TrashItem = { id: string; type: 'record' | 'scrap' | 'media'; title: string; deletedAt: string; uri?: string };
export async function loadTrash(): Promise<TrashItem[]> {
  const db = await client();
  const [records, meals, scraps, media] = await Promise.all([
    db.from('meal_records').select('id,meal_id,deleted_at'),
    db.from('meals').select('id,name'),
    db.from('recipe_scraps').select('id,title,url,deleted_at').not('deleted_at','is',null),
    db.from('media').select('id,meal_record_id,storage_path,deleted_at').not('deleted_at','is',null),
  ]);
  [records, meals, scraps, media].forEach(r => check(r.error));
  const mealName = (id: string) => meals.data?.find(m => m.id === id)?.name ?? '요리 기록';
  const items: TrashItem[] = (records.data ?? []).filter(r => r.deleted_at).map(r => ({ id: r.id, type: 'record', title: mealName(r.meal_id), deletedAt: r.deleted_at }));
  (scraps.data ?? []).forEach(s => items.push({ id: s.id, type: 'scrap', title: s.title || s.url, deletedAt: s.deleted_at }));
  for (const photo of media.data ?? []) {
    const record = records.data?.find(r => r.id === photo.meal_record_id);
    if (!record || record.deleted_at) continue;
    const { data } = await db.storage.from('meal-media').createSignedUrl(photo.storage_path, 3600);
    items.push({ id: photo.id, type: 'media', title: `${mealName(record.meal_id)} 사진`, deletedAt: photo.deleted_at, uri: data?.signedUrl });
  }
  return items.sort((a,b) => b.deletedAt.localeCompare(a.deletedAt));
}
export async function restoreItem(item: TrashItem) {
  const db = await client();
  const { error } = await db.rpc('restore_archive_item', { item_type: item.type, item_id: item.id });
  check(error);
}
