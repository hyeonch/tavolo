import { getSupabaseClient } from '../lib/supabase';
import type { WorldCupMatch, WorldCupSession } from '../types/meal';

async function context() {
  const client = await getSupabaseClient();
  if (!client) throw new Error('Supabase 연결 설정을 찾을 수 없습니다.');
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error('로그인이 필요합니다.');
  return { client, userId: data.user.id };
}

export async function getWorldCupStateAsync() {
  const { client, userId } = await context();
  const { data, error } = await client.from('world_cups').select('*')
    .eq('user_id', userId).order('updated_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data
    ? { session: { ...data.session, revision: data.revision } as WorldCupSession, matches: data.matches as WorldCupMatch[] }
    : { session: null, matches: [] as WorldCupMatch[] };
}

export async function createWorldCupSessionAsync(session: WorldCupSession, matches: WorldCupMatch[]) {
  const { client, userId } = await context();
  const { error } = await client.from('world_cups').insert({ id: session.id, user_id: userId, session, matches });
  if (error) throw error;
  return { ...session, revision: 1 };
}

export async function saveWorldCupProgressAsync(session: WorldCupSession, matches: WorldCupMatch[]) {
  const { client, userId } = await context();
  if (!session.revision) throw new Error('월드컵을 다시 불러온 뒤 선택해주세요.');
  const { data, error } = await client.from('world_cups')
    .update({ session, matches, revision: session.revision + 1 })
    .eq('id', session.id).eq('user_id', userId).eq('revision', session.revision).select('revision').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('다른 화면에서 진행한 결과가 있어요. 다시 불러온 뒤 선택해주세요.');
  return { ...session, revision: data.revision as number };
}
