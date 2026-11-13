import { useEffect, useRef, useState } from 'react';
import { Loader2, Shirt, User } from 'lucide-react';
import { Logo, Scene, SteamLogo, tagline, WindowControls } from '../components';
import { hz, inTauri, mcName, pickFile, readPng, SteamProfile, steamLogin, steamProfile, uaError, UiState } from '../api';
import { defaultSkin, drawFront, loadImage, Model } from '../skin';
import { t } from '../i18n';

const valid = (n: string) => /^[A-Za-z0-9_]{3,16}$/.test(n);

export default function Login({ state, onDone }: { state: UiState; onDone: (s: Partial<UiState>) => void }) {
  const [name, setName] = useState(state.guest?.name ?? '');
  const [model, setModel] = useState<Model>(state.guest?.model ?? 'classic');
  const [skinPath, setSkinPath] = useState<string | undefined>(state.guest?.skin);
  const [skinUrl, setSkinUrl] = useState<string | undefined>();
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState(false);
  const [steamBusy, setSteamBusy] = useState(false);
  const preview = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (skinPath && inTauri) readPng(skinPath).then(setSkinUrl).catch(() => setSkinUrl(undefined));
  }, [skinPath]);
  useEffect(() => {
    const c = preview.current;
    if (!c) return;
    if (skinUrl) loadImage(skinUrl).then((i) => drawFront(c, i, model));
    else drawFront(c, defaultSkin(model), model);
  }, [skinUrl, model]);

  const chooseSkin = async () => {
    const p = await pickFile([{ name: t('Скин (PNG 64×64)'), extensions: ['png'] }]);
    if (p) setSkinPath(p);
  };

  /** Registers the offline name (and skin) the game will be played under. */
  const enter = async (nick: string, steam?: SteamProfile) => {
    setErr('');
    if (!valid(nick)) return setErr(t('Ник: 3–16 символов — латиница, цифры или _'));
    setBusy(true);
    try {
      await hz(['account', 'offline', nick]);
      if (skinPath) await hz(['account', 'skin', nick, skinPath, '--model', model]);
      else await hz(['account', 'skin', nick, '--model', model]).catch(() => {});
      onDone({ guest: { name: nick, model, skin: skinPath, steam } });
    } catch (e) {
      setErr(uaError(e));
    } finally {
      setBusy(false);
    }
  };

  const steam = async () => {
    setErr('');
    setSteamBusy(true);
    try {
      let p = await steamLogin();
      // name and avatar from the Steam Web API (via our server), else what the public profile gave
      p = await steamProfile(p.steamid).then((x) => ({ ...p, name: x.name, avatar: x.avatar ?? p.avatar })).catch(() => p);
      // the name typed in the field wins; else one made from the Steam name
      await enter(valid(name) ? name : mcName(p), p);
    } catch (e) {
      setErr(uaError(e));
    } finally {
      setSteamBusy(false);
    }
  };

  return (
    <div className="login drag">
      <WindowControls />
      <div className="card">
        <Scene preset="night" />
        <div className="brand">
          <Logo />
          <div className="tagline">{tagline()}</div>
        </div>
      </div>
      <div className="form">
        <div className="nodrag">
          <h2>{t('С возвращением')}</h2>
          <div className="stack">
            <label className="field">
              <User size={15} />
              <input placeholder={t('Никнейм')} value={name} maxLength={16} autoFocus onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && enter(name)} />
            </label>
            <div className="field" style={{ paddingRight: 4 }}>
              <Shirt size={15} />
              <button onClick={chooseSkin} style={{ flex: 1, textAlign: 'left', fontSize: 13, color: skinPath ? 'var(--text)' : '#6b6b74', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {skinPath ? skinPath.split(/[\\/]/).pop() : t('Стандартный скин')}
              </button>
              <div className="seg" style={{ width: 158 }}>
                <button className={model === 'classic' ? 'on' : ''} onClick={() => setModel('classic')} style={{ height: 30 }}>{t('Классический')}</button>
                <button className={model === 'slim' ? 'on' : ''} onClick={() => setModel('slim')} style={{ height: 30 }}>{t('Тонкий')}</button>
              </div>
            </div>
          </div>
          <div className="actions">
            <button className="btn-red" disabled={busy || steamBusy} onClick={() => enter(name)}>{busy && !steamBusy ? t('Вхожу…') : t('Войти как гость')}</button>
            <button className="btn-ghost" disabled={steamBusy} onClick={steam}>
              {steamBusy ? <><Loader2 size={14} className="spin" /> {t('Подтвердите вход в браузере…')}</> : <><SteamLogo /> {t('Войти через Steam')}</>}
            </button>
          </div>
          <div className="skin-mini">
            <canvas ref={preview} width={64} height={128} style={{ width: 32, height: 64 }} />
            {t('Так вас увидят в игре')}
          </div>
          <div className="err">{err}</div>
          <div className="foot">
            {info ? (
              <span>{t('Steam даёт профиль и аватар, гость — только ник. Играете вы в обоих случаях офлайн: одиночная игра, LAN и серверы с online-mode=false.')}</span>
            ) : (
              <span>{t('Нет Steam? Играйте гостем.')} <a onClick={() => setInfo(true)}>{t('Как это работает')}</a></span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
