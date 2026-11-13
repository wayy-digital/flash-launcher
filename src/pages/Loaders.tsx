import { useEffect, useState } from 'react';
import { Check, Layers, Loader2, Play, Plus, Trash2, X } from 'lucide-react';
import { http, hz, uaError } from '../api';
import { t } from '../i18n';
import { Ctx, instLabel } from '../screens/Main';

const LOADERS = [
  { id: '', name: 'Без загрузчика' },
  { id: 'fabric', name: 'Fabric' },
  { id: 'forge', name: 'Forge' },
  { id: 'neoforge', name: 'NeoForge' },
  { id: 'quilt', name: 'Quilt' },
];

export default function Loaders({ ctx, openNew }: { ctx: Ctx; openNew?: boolean }) {
  const [modal, setModal] = useState(!!openNew);
  const [releases, setReleases] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [mc, setMc] = useState('');
  const [loader, setLoader] = useState('fabric');
  const [lv, setLv] = useState<{ version: string; stable: boolean }[]>([]);
  const [loaderVersion, setLoaderVersion] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => setModal(!!openNew), [openNew]);
  useEffect(() => {
    http<{ versions: { id: string; type: string }[] }>('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json')
      .then((r) => {
        const rel = r.versions.filter((v) => v.type === 'release').map((v) => v.id);
        setReleases(rel);
        setMc((m) => m || rel[0]);
      }).catch(() => {});
  }, []);
  useEffect(() => {
    setLv([]);
    setLoaderVersion('');
    if (!mc || loader !== 'fabric') return;
    http<{ loader: { version: string; stable: boolean } }[]>(`https://meta.fabricmc.net/v2/versions/loader/${mc}`)
      .then((r) => setLv(r.map((x) => x.loader).slice(0, 30))).catch(() => {});
  }, [mc, loader]);

  const create = async () => {
    setErr('');
    setBusy(true);
    const n = name.trim() || `${loader ? LOADERS.find((l) => l.id === loader)!.name : 'Minecraft'} ${mc}`;
    const args = ['instance', 'create', n, '--minecraft', mc];
    if (loader) args.push('--loader', loader);
    if (loader && loaderVersion) args.push('--loader-version', loaderVersion);
    try {
      const made = await hz<{ id: string }>(args);
      await hz(['instance', 'select', made.id]);
      ctx.toast(t('Сборка «{n}» создана', { n }));
      setModal(false);
      setName('');
      ctx.refresh();
    } catch (e) {
      setErr(uaError(e));
    } finally {
      setBusy(false);
    }
  };

  const act = (args: string[], ok: string) => hz(args).then(() => { ctx.toast(ok); ctx.refresh(); }).catch((e) => ctx.toast(uaError(e)));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="kicker">FABRIC · FORGE · NEOFORGE · QUILT</div>
          <h1>{t('Мои сборки')}</h1>
        </div>
        <button className="btn-red" onClick={() => setModal(true)}><Plus size={14} style={{ verticalAlign: -2 }} /> {t('Новая сборка')}</button>
      </div>
      <div className="scroll">
        <div className="list">
          {ctx.instances.length === 0 && <div className="empty">{t('Сборок пока нет. Создайте первую — ванильную или с Fabric.')}</div>}
          {ctx.instances.map((i) => (
            <div className="lrow" key={i.id} style={{ gridTemplateColumns: '38px 1fr auto auto auto' }}>
              <div className="ic"><Layers size={17} /></div>
              <div>
                <div className="t">{i.name} {i.selected && <span className="badge green">{t('ВЫБРАНА')}</span>}</div>
                <div className="s">{instLabel(i)}{i.java?.loader ? ` ${i.java.loader.version}` : ''} · {t('{h} ч', { h: (i.played_secs / 3600).toFixed(1) })}</div>
              </div>
              {!i.selected ? <button className="btn-soft" onClick={() => act(['instance', 'select', i.id], t('Выбрана «{n}»', { n: i.name }))}><Check size={13} /> {t('Выбрать')}</button> : <span />}
              <button className="btn-soft" onClick={() => act(['instance', 'select', i.id], t('Выбрана «{n}»', { n: i.name })).then(() => ctx.go('home'))}><Play size={13} /> {t('Играть')}</button>
              <button className="btn-soft" title={t('Удалить')} onClick={() => act(['instance', 'delete', i.id], t('«{n}» в корзине', { n: i.name }))}><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      </div>
      {modal && (
        <div className="modal-bg" onClick={() => setModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="mh"><b>{t('Новая сборка')}</b><button className="close-btn" onClick={() => setModal(false)}><X size={14} strokeWidth={3} /></button></div>
            <div className="mb">
              <label className="field"><input placeholder={t('Название (необязательно)')} value={name} onChange={(e) => setName(e.target.value)} /></label>
              <label className="field">
                <span style={{ fontSize: 12, width: 90 }}>Minecraft</span>
                <select value={mc} onChange={(e) => setMc(e.target.value)}>{releases.map((r) => <option key={r}>{r}</option>)}</select>
              </label>
              <div className="toolbar" style={{ margin: 0 }}>
                {LOADERS.map((l) => <button key={l.id} className={`btn-soft ${loader === l.id ? 'active' : ''}`} onClick={() => setLoader(l.id)}>{t(l.name)}</button>)}
              </div>
              {loader === 'fabric' && (
                <label className="field">
                  <span style={{ fontSize: 12, width: 90 }}>Fabric Loader</span>
                  <select value={loaderVersion} onChange={(e) => setLoaderVersion(e.target.value)}>
                    <option value="">{t('Новейший стабильный')}</option>
                    {lv.map((v) => <option key={v.version} value={v.version}>{v.version}{v.stable ? '' : ' (beta)'}</option>)}
                  </select>
                </label>
              )}
              {loader && loader !== 'fabric' && <div className="sub" style={{ color: 'var(--muted)', fontSize: 12 }}>{t('Версию {l} лаунчер выберет сам — новейшую стабильную для {v}.', { l: LOADERS.find((l) => l.id === loader)!.name, v: mc })}</div>}
              {err && <div className="badge red">{err}</div>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
                <button className="btn-ghost" onClick={() => setModal(false)}>{t('Отмена')}</button>
                <button className="btn-red" disabled={busy || !mc} onClick={create}>{busy ? <Loader2 size={14} className="spin" /> : t('Создать')}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
