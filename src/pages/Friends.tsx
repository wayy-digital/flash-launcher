import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Loader2, Lock, RefreshCw, Search } from 'lucide-react';
import { openLink, SteamFriend, steamFriends, uaError } from '../api';
import { SteamLogo } from '../components';
import { locale, t } from '../i18n';
import { Ctx } from '../screens/Main';

const STATE: Record<string, { label: string; color: string }> = {
  ingame: { label: 'В игре', color: '#7fe3b2' },
  online: { label: 'В сети', color: '#6cb6ff' },
  busy: { label: 'Занят', color: '#e5a84d' },
  away: { label: 'Отошёл', color: '#e5a84d' },
  snooze: { label: 'Спит', color: '#8b8b94' },
  trade: { label: 'В сети', color: '#6cb6ff' },
  play: { label: 'В сети', color: '#6cb6ff' },
  offline: { label: 'Не в сети', color: '#5d5d66' },
};

export function lastSeen(ts: number | null) {
  if (!ts) return t('Не в сети');
  const mins = Math.round((Date.now() / 1000 - ts) / 60);
  if (mins < 60) return t('Был(а) {m} мин назад', { m: Math.max(1, mins) });
  if (mins < 60 * 24) return t('Был(а) {h} ч назад', { h: Math.round(mins / 60) });
  return t('Был(а) {d}', { d: new Date(ts * 1000).toLocaleDateString(locale()) });
}

export default function Friends({ ctx }: { ctx: Ctx }) {
  const steam = ctx.state.guest?.steam;
  const [data, setData] = useState<{ private: boolean; friends: SteamFriend[] } | null>(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => {
    if (!steam) return;
    setBusy(true);
    setErr('');
    steamFriends(steam.steamid).then(setData).catch((e) => setErr(uaError(e))).finally(() => setBusy(false));
  };
  useEffect(load, [steam?.steamid]);

  const shown = useMemo(() => (data?.friends ?? []).filter((f) => f.name.toLowerCase().includes(q.toLowerCase())), [data, q]);
  const online = (data?.friends ?? []).filter((f) => f.state !== 'offline').length;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="kicker">STEAM</div>
          <h1>{t('Друзья')}</h1>
        </div>
        {steam && data && !data.private && <div style={{ color: 'var(--muted)', fontSize: 12 }}>{t('{o} в сети из {n}', { o: online, n: data.friends.length })}</div>}
      </div>
      {!steam ? (
        <div className="panel-card" style={{ maxWidth: 520 }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><SteamLogo size={13} /> {t('Друзья из Steam')}</h3>
          <div className="sub" style={{ color: '#c9c9d1', fontSize: 13, lineHeight: 1.5, marginBottom: 14 }}>
            {t('Подключите Steam, чтобы видеть друзей прямо в лаунчере: кто в сети и во что играет.')}
          </div>
          <button className="btn-ghost" style={{ width: '100%' }} onClick={ctx.signIn}><SteamLogo /> {t('Войти через Steam')}</button>
        </div>
      ) : (
        <>
          <div className="toolbar">
            <label className="field"><Search size={14} /><input placeholder={t('Поиск друзей…')} value={q} onChange={(e) => setQ(e.target.value)} /></label>
            <button className="btn-soft" onClick={load} disabled={busy}>{busy ? <Loader2 size={13} className="spin" /> : <RefreshCw size={13} />} {t('Обновить')}</button>
          </div>
          {err && <div className="badge red" style={{ alignSelf: 'flex-start', marginBottom: 10 }}>{err}</div>}
          <div className="scroll">
            {data === null ? (
              !err && <div className="empty"><Loader2 className="spin" /></div>
            ) : data.private ? (
              <div className="panel-card" style={{ maxWidth: 560 }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Lock size={13} /> {t('Список друзей скрыт')}</h3>
                <div className="sub" style={{ color: '#c9c9d1', fontSize: 13, lineHeight: 1.5, marginBottom: 14 }}>
                  {t('Steam показывает друзей только если в настройках приватности «Список друзей» открыт для всех.')}
                </div>
                <button className="btn-soft" onClick={() => openLink('https://steamcommunity.com/my/edit/settings')}><ExternalLink size={13} /> {t('Открыть настройки приватности Steam')}</button>
              </div>
            ) : shown.length === 0 ? (
              <div className="empty">{q ? t('Ничего не найдено') : t('В Steam пока нет друзей')}</div>
            ) : (
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
                {shown.map((f) => {
                  const st = STATE[f.state] ?? STATE.offline;
                  return (
                    <div key={f.steamid} className="row" style={{ cursor: 'default', padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                        <div style={{ position: 'relative', flex: 'none' }}>
                          <img src={f.avatarSmall ?? f.avatar ?? ''} alt="" style={{ width: 40, height: 40, borderRadius: 9, display: 'block', opacity: f.state === 'offline' ? 0.55 : 1, outline: `2px solid ${st.color}`, outlineOffset: 1 }} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600 }}>{f.name}</div>
                          <div className="sub" style={{ color: st.color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {f.state === 'ingame' ? `${t('В игре')}: ${f.game}` : f.state === 'offline' ? lastSeen(f.lastLogoff) : t(st.label)}
                          </div>
                        </div>
                      </div>
                      <button className="btn-soft" title={t('Профиль Steam')} onClick={() => openLink(f.profileUrl)}><ExternalLink size={13} /></button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
