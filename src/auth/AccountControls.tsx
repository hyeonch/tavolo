import type { Provider } from '@supabase/supabase-js';

import { getUserLabel, type AuthState } from './useAuth';

type AccountControlsProps = {
  auth: AuthState;
  message: string | null;
  compact?: boolean;
  onSignIn: (provider: Extract<Provider, 'google' | 'kakao'>) => void;
  onSignOut: () => void;
};

export function AccountControls({ auth, message, compact = false, onSignIn, onSignOut }: AccountControlsProps) {
  if (auth.status === 'loading') {
    return <span className={compact ? 'account-loading compact' : 'account-loading'}>계정 확인 중</span>;
  }

  if (compact) {
    return (
      <details className="mobile-account-menu">
        <summary>{auth.status === 'signed-in' ? '내 계정' : '로그인'}</summary>
        <div>
          {auth.status === 'signed-in' ? (
            <>
              <span title={getUserLabel(auth.user)}>{getUserLabel(auth.user)}</span>
              <button type="button" onClick={onSignOut}>로그아웃</button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => onSignIn('google')}>Google로 계속하기</button>
            </>
          )}
          {message ? <p className="account-message" role="status">{message}</p> : null}
        </div>
      </details>
    );
  }

  if (auth.status === 'signed-in') {
    return (
      <div className="account-signed-in">
        <span title={getUserLabel(auth.user)}>{getUserLabel(auth.user)}</span>
        <button type="button" onClick={onSignOut}>로그아웃</button>
      </div>
    );
  }

  return (
    <section className="account-panel" aria-label="계정">
      <p className="eyebrow">내 계정</p>
      {auth.status === 'unconfigured' ? (
        <p className="account-copy">계정 연결을 준비하고 있어요.</p>
      ) : (
        <p className="account-copy">로그인하면 다른 기기에서도 기록을 이어볼 수 있어요.</p>
      )}
      <div className="account-actions">
        <button type="button" onClick={() => onSignIn('google')}>Google로 계속하기</button>
      </div>
      {message ? <p className="account-message" role="status">{message}</p> : null}
    </section>
  );
}
