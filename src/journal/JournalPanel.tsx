import { useEffect, useRef, useState } from 'react';
import { journalAction, loadJournal, loadTrash, restoreItem } from './repository';
import type { Journal, TrashItem } from './repository';

type Props = { defaultName: string; onChanged: () => void };
export function JournalPanel({ defaultName, onChanged }: Props) {
  const [journal, setJournal] = useState<Journal | null>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<'sharing' | 'trash'>('sharing');
  const [name, setName] = useState(defaultName.slice(0,40));
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [invite, setInvite] = useState<{ token?: string; expiresAt?: string }>({});
  const [trash, setTrash] = useState<TrashItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const locked = useRef(false);

  useEffect(() => {
    let active = true;
    const refresh = () => { void loadJournal().then(value => { if (active) { setJournal(value); setReady(true); } }).catch(() => { if (active) setMessage('기록장 정보를 불러오지 못했어요. 새로고침 후 다시 시도해주세요.'); }); };
    refresh();
    window.addEventListener('focus', refresh);
    return () => { active = false; window.removeEventListener('focus', refresh); };
  }, []);

  async function run(action: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setMessage('');
    try { await action(); }
    catch (error) { setMessage(error instanceof Error ? error.message : '처리하지 못했어요. 다시 시도해주세요.'); }
    finally { locked.current = false; setBusy(false); }
  }
  async function refresh() { setJournal(await loadJournal()); setTrash(await loadTrash()); onChanged(); }
  const sharing = (journal?.members.length ?? 0) === 2;
  return <section className="journal-panel" aria-label="기록장 설정">
    <div className="journal-heading">
      <div><strong>{!ready ? '기록장 확인 중' : sharing ? journal?.name : '나의 기록장'}</strong><p>{!ready ? '저장 범위를 확인하고 있어요.' : sharing ? journal?.members.map(m => m.display_name).join(' · ') + '의 기존 기록까지 함께 보고 수정해요.' : '지금은 내 계정에만 저장돼요.'}</p></div>
      <div className="settings-destinations"><button type="button" aria-expanded={open && section === 'sharing'} onClick={() => { setSection('sharing'); setOpen(section !== 'sharing' || !open); }}>기록장 공유</button><button type="button" aria-expanded={open && section === 'trash'} onClick={() => { setSection('trash'); setOpen(section !== 'trash' || !open); void run(async () => { setTrash(await loadTrash()); }); }}>휴지통</button></div>
    </div>
    {message && <p role="status">{message}</p>}
    {open && ready && <div className="journal-settings">
      {section === 'sharing' && !sharing && <>
        <p>두 사람의 기존 요리·사진·레시피 링크가 모두 공유돼요. 서로 수정하고 휴지통으로 옮길 수 있고, 작성자는 유지돼요. 월드컵 진행과 결과는 각자 저장해요.</p>
        <label>내 표시 이름<input maxLength={40} value={name} onChange={e => setName(e.target.value)} /></label>
        <form onSubmit={e => { e.preventDefault(); void run(async () => { setInvite(await journalAction('invite',name,email)); await refresh(); }); }}>
          <label>상대방의 로그인 이메일<input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="상대방이 Tavolo에 로그인할 이메일" /></label>
          <button disabled={busy || !name.trim()} type="submit">동의하고 초대 코드 만들기</button>
        </form>
        {invite.token && <div className="journal-invite"><label>상대방에게 전달할 초대 코드<textarea readOnly value={invite.token} rows={3} /></label><p>24시간 동안 유효해요. 상대방은 로그인 후 ‘설정 → 기록장 공유’에서 코드를 입력하면 돼요.</p><button type="button" onClick={() => void run(async () => { await navigator.clipboard.writeText(invite.token!); setMessage('초대 코드를 복사했어요.'); })}>코드 복사</button></div>}
        {journal && <button disabled={busy} type="button" onClick={() => void run(async () => { await journalAction('revoke',name); setInvite({}); setMessage('이전에 만든 초대를 모두 취소했어요.'); })}>이전 초대 취소</button>}
        {<form onSubmit={e => { e.preventDefault(); void run(async () => { await journalAction('accept',name,'',code); setCode(''); await refresh(); setMessage('이제 두 사람의 기록을 함께 볼 수 있어요.'); }); }}>
          <label>받은 초대 코드<textarea required value={code} onChange={e => setCode(e.target.value)} rows={3} /></label>
          <button disabled={busy || !name.trim()} type="submit">기존 기록 공유에 동의하고 참여</button>
        </form>}
      </>}
      {section === 'trash' && <><div className="panel-header"><h2>휴지통</h2><button disabled={busy} type="button" onClick={() => void run(async () => { await refresh(); })}>새로고침</button></div>
      <p>자동으로 영구 삭제하지 않아요. 요리 기록을 복구하면 사진도 함께 돌아와요. 완성사진을 복구하면 현재 완성사진은 휴지통으로 옮겨요.</p>
      {!trash.length && <p>휴지통이 비어 있어요.</p>}
      <ul className="journal-trash">{trash.map(item => <li key={`${item.type}-${item.id}`}>
        {item.uri && <img src={item.uri} alt={item.title} />}
        <div><strong>{item.title}</strong><small>{item.type === 'record' ? '요리 기록' : item.type === 'scrap' ? '레시피 링크' : '사진'} · {new Date(item.deletedAt).toLocaleDateString('ko-KR')}</small></div>
        <button disabled={busy} type="button" onClick={() => void run(async () => { await restoreItem(item); await refresh(); setMessage('복구했어요.'); })}>복구</button>
      </li>)}</ul></>}
    </div>}
  </section>;
}
