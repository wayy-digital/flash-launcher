import { useEffect, useMemo, useState } from 'react';
import { Box, Loader2, Search } from 'lucide-react';
import { http, hz, uaError } from '../api';
import { locale, t } from '../i18n';
import { Ctx } from '../screens/Main';

type MVer = { id: string; type: string; releaseTime: string };

export default function Releases({ ctx }: { ctx: Ctx }) {
  const [mc, setMc] = useState<MVer[] | null>(null);
  const [kind, setKind] = useState<'release' | 'snapshot' | 'old'>('release');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    http<{ versions: MVer[] }>('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json')
      .then((r) => setMc(r.versions)).catch((e) => { setErr(uaError(e)); setMc([]); });
  }, []);

  const shown = useMemo(() => (mc ?? []).filter((v) =>
    (kind === 'old' ? v.type.startsWith('old_') : v.type === kind) && v.id.toLowerCase().includes(q.toLowerCase())).slice(0, 150), [mc, kind, q]);

  const create = async (v: string, loader?: string) => {
    setBusy(v + (loader ?? ''));
    const name = loader ? `${loader[0].toUpperCase()}${loader.slice(1)} ${v}` : `Minecraft ${v}`;
    const args = ['instance', 'create', name, '--minecraft', v];
    if (loader) args.push('--loader', loader);
    try {
      const made = await hz<{ id: string }>(args);
      await hz(['instance', 'select', made.id]);
      ctx.toast(t('Сборка «{n}» создана', { n: name }));
    } catch (e) { ctx.toast(uaError(e)); }
    setBusy(null);
    ctx.refresh();
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="kicker">MOJANG</div>
          <h1>{t('Версии Minecraft')}</h1>
        </div>
        <div style={{ color: 'var(--muted)', fontSize: 12 }}>{mc ? t('{n} версий', { n: mc.length }) : ''}</div>
      </div>
      <div className="toolbar">
        <label className="field"><Search size={14} /><input placeholder={t('Поиск версии, например 1.21')} value={q} onChange={(e) => setQ(e.target.value)} /></label>
        {(['release', 'snapshot', 'old'] as const).map((k) => (
          <button key={k} className={`btn-soft ${kind === k ? 'active' : ''}`} onClick={() => setKind(k)}>
            {k === 'release' ? t('Релизы') : k === 'snapshot' ? t('Снапшоты') : 'Beta / Alpha'}
          </button>
        ))}
      </div>
      {err && <div className="badge red" style={{ alignSelf: 'flex-start', marginBottom: 10 }}>{err}</div>}
      <div className="scroll">
        <div className="list">
          {mc === null ? <div className="empty"><Loader2 className="spin" /></div> : shown.map((v) => (
            <div className="lrow" key={v.id}>
              <div className="ic"><Box size={17} /></div>
              <div>
                <div className="t">{v.id}</div>
                <div className="s">{new Date(v.releaseTime).toLocaleDateString(locale())} · {v.type === 'release' ? t('релиз') : v.type === 'snapshot' ? t('снапшот') : v.type.replace('old_', '')}</div>
              </div>
              <button className="btn-soft" disabled={!!busy} onClick={() => create(v.id)}>{busy === v.id && <Loader2 size={13} className="spin" />} {t('Ванильная сборка')}</button>
              <button className="btn-soft" disabled={!!busy} onClick={() => create(v.id, 'fabric')}>{busy === v.id + 'fabric' && <Loader2 size={13} className="spin" />} + Fabric</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
