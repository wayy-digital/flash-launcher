import { useEffect, useRef, useState } from 'react';
import { Clock3, Layers, Play, Square } from 'lucide-react';
import { Avatar } from '../components';
import { hzStream, modrinthSearch, MrHit, uaError } from '../api';
import { t } from '../i18n';
import { Ctx, instLabel } from '../screens/Main';

const DAYS = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'];

export default function Home({ ctx }: { ctx: Ctx }) {
  const { instances, state } = ctx;
  const [chosen, setChosen] = useState<string | undefined>();
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null);
  const [top, setTop] = useState<MrHit[]>([]);
  const started = useRef(0);
  const inst = instances.find((i) => i.id === chosen) ?? ctx.selected;

  useEffect(() => {
    modrinthSearch({ query: '', type: 'modpack', sort: 'downloads' }).then((r) => setTop(r.hits.slice(0, 3))).catch(() => {});
  }, []);

  const play = async () => {
    if (!inst) return ctx.go('loaders', 'new');
    setRunning(true);
    setMsg({ t: t('Запускаю…') });
    started.current = Date.now();
    let lastErr = '';
    const code = await hzStream(['play', '--instance', inst.id], (line, err) => {
      if (err && /^error/i.test(line)) lastErr = line;
      setMsg({ t: line });
    }).catch((e) => { lastErr = String(e); return 1; });
    const secs = Math.round((Date.now() - started.current) / 1000);
    setRunning(false);
    if (code === 0) {
      setMsg({ t: t('Игра закрыта · {m} мин', { m: Math.max(1, Math.round(secs / 60)) }) });
      ctx.update({ sessions: [...state.sessions, { start: started.current, secs, instance: inst.id }].slice(-500) });
      ctx.refresh();
    } else {
      const text = lastErr ? uaError(lastErr) : t('Игра не запустилась (код {c})', { c: String(code) });
      setMsg({ t: text, err: true });
    }
  };

  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7)).getTime();
  const perDay = Array.from({ length: 7 }, (_, d) =>
    state.sessions.filter((s) => s.start >= monday + d * 864e5 && s.start < monday + (d + 1) * 864e5).reduce((a, s) => a + s.secs, 0));
  const maxDay = Math.max(3600, ...perDay);
  const hours = instances.reduce((a, i) => a + i.played_secs, 0) / 3600;

  const title = inst ? inst.name : 'Flash';
  const words = title.split(/\s+/);

  return (
    <div className="home">
      <div className="kicker">{inst?.last_played_ms ? t('ПОСЛЕДНЯЯ ИГРА') : inst ? t('ВЫБРАННАЯ СБОРКА') : t('ДОБРО ПОЖАЛОВАТЬ')}</div>
      <h1 className="title">
        {words.length > 1 ? (<>{words[0]}<br /><span className="small">{words.slice(1).join(' ')}</span></>) : title}
      </h1>
      <div className="meta">
        {inst && <span className="pill">{instLabel(inst)}</span>}
        {inst && <span><Clock3 size={12} style={{ verticalAlign: -2 }} /> {t('{h} ч', { h: (inst.played_secs / 3600).toFixed(1) })}</span>}
        <span>{state.guest?.steam ? 'Steam' : t('Гость')}: {state.guest?.name}</span>
      </div>
      <div className="play-row">
        <button className="play" onClick={play} disabled={running}>
          <span className="pi">{running ? <Square size={11} fill="currentColor" /> : <Play size={12} fill="currentColor" />}</span>
          {running ? t('В ИГРЕ') : inst ? t('ИГРАТЬ') : t('СОЗДАТЬ СБОРКУ')}
        </button>
        {instances.length > 1 && (
          <select className="inst" value={inst?.id} onChange={(e) => setChosen(e.target.value)}>
            {instances.map((i) => <option key={i.id} value={i.id}>{i.name} — {instLabel(i)}</option>)}
          </select>
        )}
        {msg && (
          <div className={`msg ${msg.err ? 'err' : ''}`}>
            {msg.t}
          </div>
        )}
      </div>

      <div className="cards">
        <div>
          <div className="card-h">{t('Активность за неделю')}</div>
          <div className="gcard">
            <div className="week">
              <div className="av"><Avatar steam={state.guest?.steam} skin={ctx.skinUrl} model={state.guest?.model} size={34} /></div>
              <div className="bars">
                {perDay.map((s, d) => (
                  <div className="bar" key={d}>
                    <i><b style={{ height: `${Math.round((s / maxDay) * 100)}%` }} /></i>
                    <span>{t(DAYS[d])}</span>
                  </div>
                ))}
              </div>
            </div>
            <button className="view" onClick={() => ctx.go('activity')}>{t('ВСЯ АКТИВНОСТЬ')}</button>
          </div>
        </div>
        <div>
          <div className="card-h">{t('Ваша статистика')}</div>
          <div className="gcard">
            <div className="stats">
              <div className="stat"><b>{hours.toFixed(1)} <Clock3 size={13} /></b><span>{t('ЧАСОВ В ИГРЕ')}</span></div>
              <div className="stat"><b>{instances.length} <Layers size={13} /></b><span>{t('СБОРОК')}</span></div>
            </div>
            <button className="view" onClick={() => ctx.go('loaders')}>{t('МОИ СБОРКИ')}</button>
          </div>
        </div>
        <div>
          <div className="card-h">{t('Топ сборок модов')}</div>
          <div className="gcard">
            <div className="tops">
              {(top.length ? top : [null, null, null]).map((h, i) => (
                <div className="t" key={h?.project_id ?? i}>
                  <div className="img" style={{ backgroundImage: h ? `url(${h.featured_gallery || h.gallery?.[0] || h.icon_url})` : undefined }} />
                  <span>{h?.title ?? '—'}</span>
                </div>
              ))}
            </div>
            <button className="view" onClick={() => ctx.go('packs')}>{t('ВСЕ СБОРКИ')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
