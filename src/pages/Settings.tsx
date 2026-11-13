import { useEffect, useState } from 'react';
import { ArrowUpCircle, ExternalLink, Loader2, LogOut, RefreshCw } from 'lucide-react';
import { appVersion, engineInfo, EngineInfo, hz, openLink, uaError, updateCheck } from '../api';
import { Avatar, SteamLogo } from '../components';
import { t } from '../i18n';
import { Ctx } from '../screens/Main';

const MEMORY = [2048, 4096, 6144, 8192, 12288];

export default function Settings({ ctx, onLogout }: { ctx: Ctx; onLogout: () => void }) {
  const [s, setS] = useState<any>(null);
  const [engine, setEngine] = useState<EngineInfo | null>(null);
  const inst = ctx.selected;
  const lang = ctx.state.lang ?? 'ru';

  const load = () => hz<any>(['settings']).then(setS).catch((e) => setS({ error: uaError(e) }));
  useEffect(() => { load(); engineInfo().then(setEngine); }, []);

  const set = (key: string, value: string) =>
    hz(['settings', key, value]).then(() => { ctx.toast(t('Сохранено')); load(); }).catch((e) => ctx.toast(uaError(e)));
  const memory = (mb: number) =>
    inst && hz(['instance', 'java', inst.id, '--memory', String(mb)]).then(() => { ctx.toast(t('Сохранено')); ctx.refresh(); }).catch((e) => ctx.toast(uaError(e)));
  const steam = ctx.state.guest?.steam;
  const [version, setVersion] = useState('');
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState('');
  useEffect(() => { appVersion().then(setVersion); }, []);
  const checkNow = async () => {
    setChecking(true);
    setChecked('');
    try {
      const u = await updateCheck();
      ctx.onFoundUpdate(u);
      setChecked(u ? t('Есть версия {v}', { v: u.version }) : t('У вас последняя версия'));
    } catch (e) {
      setChecked(uaError(e));
    }
    setChecking(false);
  };
  const auto = ctx.state.autoUpdate !== false;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="kicker">{t('НАСТРОЙКИ')}</div>
          <h1>Flash Launcher</h1>
        </div>
      </div>
      <div className="scroll">
        <div className="two">
          <div className="panel-card">
            <h3>{t('Игра')}</h3>
            <div className="kv">
              <span className="k">{t('Память для «{n}»', { n: inst?.name ?? '—' })}</span>
              <div className="seg" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
                {MEMORY.map((mb) => (
                  <button key={mb} disabled={!inst} className={(inst?.java?.memory_mb ?? 4096) === mb ? 'on' : ''} onClick={() => memory(mb)}>{t('{g} ГБ', { g: mb / 1024 })}</button>
                ))}
              </div>
              <span className="k">{t('Во время игры')}</span>
              <div className="seg" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                {[['stay', 'Оставить'], ['minimize', 'Свернуть'], ['hide', 'Скрыть']].map(([k, n]) => (
                  <button key={k} className={s?.while_playing === k ? 'on' : ''} onClick={() => set('while-playing', k)}>{t(n)}</button>
                ))}
              </div>
              <span className="k">{t('Язык')}</span>
              <div className="seg">
                <button className={lang === 'ru' ? 'on' : ''} onClick={() => ctx.update({ lang: 'ru' })}>Русский</button>
                <button className={lang === 'uk' ? 'on' : ''} onClick={() => ctx.update({ lang: 'uk' })}>Українська</button>
              </div>
              <span className="k">{t('Движок')}</span><span style={{ fontSize: 12 }}>{engine?.found ? t('Готов к работе') : t('не найден')}</span>
              <span className="k">{t('Путь движка')}</span><span style={{ fontSize: 11, color: 'var(--muted)', wordBreak: 'break-all' }}>{engine?.path}</span>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button className="btn-soft" onClick={onLogout}>{t('Сменить ник или аккаунт')}</button>
              <button className="btn-soft" onClick={() => ctx.update({ setupDone: false })}>{t('Пройти установку заново')}</button>
            </div>
          </div>
          <div className="panel-card">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><SteamLogo size={13} /> {t('Аккаунт Steam')}</h3>
            {steam ? (
              <div className="row" style={{ cursor: 'default' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Avatar steam={steam} size={44} />
                  <div><div>{steam.name}</div><div className="sub">SteamID {steam.steamid}</div></div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn-soft" title={t('Профиль Steam')} onClick={() => openLink(`https://steamcommunity.com/profiles/${steam.steamid}`)}><ExternalLink size={13} /></button>
                  <button className="btn-soft" title={t('Отключить Steam')} onClick={() => { ctx.update({ guest: { ...ctx.state.guest!, steam: undefined } }); ctx.toast(t('Steam отключён')); }}><LogOut size={13} /></button>
                </div>
              </div>
            ) : (
              <>
                <div className="sub" style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 10 }}>{t('Steam не подключён. Подключите его, чтобы в лаунчере были ваше имя и аватар из Steam.')}</div>
                <button className="btn-ghost" style={{ width: '100%' }} onClick={ctx.signIn}><SteamLogo /> {t('Войти через Steam')}</button>
              </>
            )}
            <div className="kv" style={{ marginTop: 16 }}>
              <span className="k">{t('Ник в игре')}</span><span>{ctx.state.guest?.name}</span>
              <span className="k">{t('Режим')}</span><span>{t('Офлайн: одиночная игра, LAN, серверы с online-mode=false')}</span>
            </div>
          </div>
        </div>
        <div className="panel-card" style={{ marginTop: 14 }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><ArrowUpCircle size={13} /> {t('Обновления лаунчера')}</h3>
          <div className="kv">
            <span className="k">{t('Версия')}</span>
            <span>Flash Launcher {version} {ctx.available && <span className="badge green">{t('ДОСТУПНА {v}', { v: ctx.available.version })}</span>}</span>
            <span className="k">{t('Обновлять при запуске')}</span>
            <div className="seg" style={{ maxWidth: 260 }}>
              <button className={auto ? 'on' : ''} onClick={() => ctx.update({ autoUpdate: true })}>{t('Автоматически')}</button>
              <button className={!auto ? 'on' : ''} onClick={() => ctx.update({ autoUpdate: false })}>{t('Спрашивать')}</button>
            </div>
          </div>
          <div className="sub" style={{ color: 'var(--muted)', fontSize: 12, margin: '10px 0 12px' }}>
            {auto ? t('Если вышла новая версия, лаунчер поставит её сам при следующем запуске.') : t('Лаунчер только покажет кнопку «Вышло обновление» — ставите, когда удобно.')}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn-soft" disabled={checking} onClick={checkNow}>{checking ? <Loader2 size={13} className="spin" /> : <RefreshCw size={13} />} {t('Проверить обновления')}</button>
            {ctx.available && <button className="btn-soft active" onClick={ctx.onUpdate}><ArrowUpCircle size={13} /> {t('Обновить до {v}', { v: ctx.available.version })}</button>}
            {checked && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{checked}</span>}
          </div>
        </div>
        {s?.error && <div className="badge red" style={{ marginTop: 14, display: 'inline-block' }}>{s.error}</div>}
      </div>
    </div>
  );
}
