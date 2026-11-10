import { useEffect, useState } from 'react';
import type { OAuthAuthorizationDetails } from '@supabase/supabase-js';
import { getSupabaseClient } from '../lib/supabase';
import { useAuth } from './useAuth';

export function OAuthConsent() {
  const { auth } = useAuth();
  const id = new URLSearchParams(window.location.search).get('authorization_id');
  const [details, setDetails] = useState<OAuthAuthorizationDetails | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (auth.status !== 'signed-in' || !id) return;
    let active = true;
    void (async () => {
      const db = await getSupabaseClient();
      if (!db) return;
      const {data,error} = await db.auth.oauth.getAuthorizationDetails(id);
      if (!active) return;
      if (error || !data) { setMessage('연결 요청이 만료됐거나 유효하지 않아요. ChatGPT에서 다시 연결해주세요.'); return; }
      if ('redirect_url' in data) { window.location.assign(data.redirect_url); return; }
      setDetails(data);
    })();
    return () => { active = false; };
  }, [auth.status,id]);
  async function login() {
    setBusy(true);
    const db = await getSupabaseClient();
    const {error} = await db!.auth.signInWithOAuth({provider:'google',options:{redirectTo:window.location.href}});
    if (error) { setMessage('로그인을 시작하지 못했어요. 다시 시도해주세요.'); setBusy(false); }
  }
  async function decide(approve: boolean) {
    if (!id || busy) return;
    setBusy(true); setMessage('');
    try {
      const db = await getSupabaseClient();
      const result = approve ? await db!.auth.oauth.approveAuthorization(id) : await db!.auth.oauth.denyAuthorization(id);
      if (result.error) throw result.error;
    } catch { setMessage('연결을 처리하지 못했어요. 다시 시도해주세요.'); setBusy(false); }
  }
  return <main className="oauth-consent"><p className="eyebrow">Tavolo · 계정 연결</p>
    <h1>대화에서 요리를 기록하세요.</h1>
    {!id ? <p>ChatGPT의 Tavolo 연결 화면에서 시작해주세요.</p> : <>
      <p>연결을 허용하면 이 앱이 내 계정으로 개인 기록과 공유 기록장의 레시피·요리 기록·사진을 읽고 작성할 수 있어요.</p>
      <p>상대방이 공유한 기록에도 현재 앱과 같은 권한이 적용됩니다. 연결 요청을 시작한 앱인지 확인해주세요.</p>
      {auth.status === 'loading' && <p>계정 확인 중…</p>}
      {auth.status === 'unconfigured' && <p>계정 연결 설정을 준비하고 있어요.</p>}
      {auth.status === 'signed-out' && <button disabled={busy} onClick={() => void login()}>Google 계정으로 로그인</button>}
      {details && <section><h2>{details.client.name || '연결 요청 앱'}</h2>
        <p>계정: {details.user.email}</p><p>돌아갈 주소: {new URL(details.redirect_uri).origin}</p>
        <p>계정 정보 범위: {details.scope}</p>
        <div className="oauth-actions"><button disabled={busy} onClick={() => void decide(true)}>연결 허용</button>
          <button disabled={busy} onClick={() => void decide(false)}>거절</button></div>
      </section>}
    </>}
    {message && <p role="alert">{message}</p>}
    <a href="/">Tavolo로 돌아가기</a>
  </main>;
}
