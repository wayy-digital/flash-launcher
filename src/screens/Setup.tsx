import { useEffect, useState } from 'react';
import { Check, ChevronRight, Coffee, Loader2 } from 'lucide-react';
import { Logo, Scene, tagline, WindowControls } from '../components';
import { engineInfo, EngineInfo, http, hz, uaError, UiState } from '../api';
import { t } from '../i18n';

const LOADERS = [
  { id: '', name: 'Ваниль' },
  { id: 'fabric', name: 'Fabric' },
  { id: 'forge', name: 'Forge' },
  { id: 'neoforge', name: 'NeoForge' },
  { id: 'quilt', name: 'Quilt' },
];

export default function Setup({ onDone }: { state: UiState; onDone: (s: Partial<UiState>) => void }) {
  const [engine, setEngine] = useState<EngineInfo | null>(null);
  const [releases, setReleases] = useState<string[]>([]);
  const [version, setVersion] = useState('');
  const [loader, setLoader] = useState('fabric');
  const [shortcut, setShortcut] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [line, setLine] = useState('');

  useEffect(() => {
    engineInfo().then(setEngine);
    http<{ versions: { id: string; type: string }[] }>('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json')
      .then((r) => {
        const rel = r.versions.filter((v) => v.type === 'release').map((v) => v.id);
        setReleases(rel);
        setVersion(rel[0]);
      })
      .catch((e) => setLine(uaError(e)));
  }, []);

  const install = async () => {
    setBusy(true);
    setPct(15);
    const name = `${loader ? LOADERS.find((l) => l.id === loader)!.name : 'Minecraft'} ${version}`;
    try {
      setLine(t('Создаю сборку «{n}»…', { n: name }));
      const args = ['instance', 'create', name, '--minecraft', version];
      if (loader) args.push('--loader', loader);
      const made = await hz<{ id: string }>(args);
      setPct(65);
      await hz(['instance', 'select', made.id]);
      setPct(85);
      if (shortcut) await hz(['instance', 'shortcut']).catch(() => {});
      setPct(100);
      setLine(t('Готово'));
      setTimeout(() => onDone({ setupDone: true }), 500);
    } catch (e) {
      setLine(uaError(e));
      setPct(0);
      setBusy(false);
    }
  };

  return (
    <div className="setup">
      <div className="art drag">
        <Scene preset="canyon" />
        <div className="brand">
          <Logo />
          <div className="tagline">{tagline()}</div>
        </div>
      </div>
      <div className="panel">
        <div className="head drag">
          <h1>{t('Установка Flash Launcher')}</h1>
          <WindowControls />
        </div>
        <div className="body">
          <div className="hint">{t('Что подготовить для игры?')}</div>
          <button className={`row ${engine?.found ? 'done' : ''}`} onClick={() => engineInfo().then(setEngine)}>
            <div>
              <div>{t('Движок Flash')}</div>
              <div className="sub">{engine ? (engine.found ? t('Готов к работе') : t('Не найден: {p}', { p: engine.path })) : t('Проверяю…')}</div>
            </div>
            {engine?.found ? <Check size={16} className="chev" /> : <ChevronRight size={16} className="chev" />}
          </button>
          <label className="row">
            <div>
              <div>{t('Версия Minecraft')}</div>
              <div className="sub">{t('Все релизы Mojang — от новых до самых старых')}</div>
            </div>
            <select value={version} onChange={(e) => setVersion(e.target.value)} style={{ border: 0, outline: 0, fontSize: 13, fontWeight: 600 }}>
              {releases.map((r) => <option key={r}>{r}</option>)}
            </select>
          </label>
          <div className="row" style={{ cursor: 'default', flexDirection: 'column', alignItems: 'stretch' }}>
            <div>
              <div>{t('Загрузчик модов')}</div>
              <div className="sub">{t('Для модов и сборок нужен Fabric, Forge, NeoForge или Quilt')}</div>
            </div>
            <div className="seg" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
              {LOADERS.map((l) => <button key={l.id} className={loader === l.id ? 'on' : ''} onClick={() => setLoader(l.id)}>{t(l.name)}</button>)}
            </div>
          </div>
          <div className="row done" style={{ cursor: 'default' }}>
            <div>
              <div>Java</div>
              <div className="sub">{t('Нужную версию Java лаунчер скачает сам')}</div>
            </div>
            <Coffee size={16} className="chev" />
          </div>
          <button className="opt" onClick={() => setShortcut(!shortcut)} style={{ marginTop: 2 }}>
            <span className={`check ${shortcut ? 'on' : ''}`}>{shortcut && <Check size={11} strokeWidth={3} />}</span>
            {t('Ярлык «Играть» на рабочем столе')}
          </button>
          <div className="foot">
            <div style={{ flex: 1 }}>
              <div className="progress"><i style={{ width: `${pct}%` }} /></div>
              <div className="sub" style={{ fontSize: 11, color: 'var(--muted)', marginTop: 7, maxWidth: 330 }}>
                {line || t('Моды и сборки ставятся сразу. Файлы самого Minecraft Mojang выдаёт только владельцам лицензии.')}
              </div>
            </div>
            <button className="btn-ghost" disabled={busy} onClick={() => onDone({ setupDone: true })}>{t('Позже')}</button>
            <button className="btn-red" disabled={busy || !version} onClick={install}>
              {busy ? <Loader2 size={14} className="spin" /> : t('Установить')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
