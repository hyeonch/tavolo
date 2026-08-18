import { useCallback, useEffect, useState } from 'react';
import type { Provider, User } from '@supabase/supabase-js';

import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase';

export type AuthState =
  | { status: 'loading'; user: null }
  | { status: 'unconfigured'; user: null }
  | { status: 'signed-out'; user: null }
  | { status: 'signed-in'; user: User };

function getProviderErrorMessage(error: Error) {
  const message = error.message.toLowerCase();

  if (message.includes('provider') || message.includes('unsupported')) {
    return '아직 이 로그인 방법의 연결 설정이 끝나지 않았어요.';
  }

  return '로그인을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.';
}

export function getUserLabel(user: User) {
  const metadataName = user.user_metadata.full_name ?? user.user_metadata.name ?? user.user_metadata.nickname;

  return typeof metadataName === 'string' && metadataName.trim()
    ? metadataName
    : user.email ?? '내 계정';
}

export function useAuth() {
  const [auth, setAuth] = useState<AuthState>(() =>
    isSupabaseConfigured ? { status: 'loading', user: null } : { status: 'unconfigured', user: null }
  );
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;
    let unsubscribe: (() => void) | undefined;

    void getSupabaseClient().then((supabase) => {
      if (!supabase || !isCurrent) return;

      void supabase.auth.getSession().then(({ data, error }) => {
        if (!isCurrent) return;

        if (error) {
          setMessage('계정 정보를 불러오지 못했어요. 새로고침 후 다시 시도해 주세요.');
        }

        setAuth(data.session?.user ? { status: 'signed-in', user: data.session.user } : { status: 'signed-out', user: null });
      });

      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!isCurrent) return;

        setAuth(session?.user ? { status: 'signed-in', user: session.user } : { status: 'signed-out', user: null });
      });

      unsubscribe = () => data.subscription.unsubscribe();
    });

    return () => {
      isCurrent = false;
      unsubscribe?.();
    };
  }, []);

  const signIn = useCallback(async (provider: Extract<Provider, 'google' | 'kakao'>) => {
    const supabase = await getSupabaseClient();

    if (!supabase) {
      setMessage('계정 연결을 준비하고 있어요. 잠시 후 다시 시도해 주세요.');
      return;
    }

    setMessage(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin },
    });

    if (error) {
      setMessage(getProviderErrorMessage(error));
    }
  }, []);

  const signOut = useCallback(async () => {
    const supabase = await getSupabaseClient();

    if (!supabase) return;

    setMessage(null);
    const { error } = await supabase.auth.signOut({ scope: 'local' });

    if (error) {
      setMessage('로그아웃하지 못했어요. 잠시 후 다시 시도해 주세요.');
    }
  }, []);

  return { auth, message, signIn, signOut };
}
