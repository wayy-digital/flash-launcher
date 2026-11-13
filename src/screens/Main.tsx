import { useCallback, useEffect, useState } from 'react';
import { ArrowUpCircle, Box, Boxes, Clock, Gamepad2, Layers, LogOut, Plus, Puzzle, Settings as SettingsIco, Shirt, Users, Wifi } from 'lucide-react';
import { Avatar, Scene, SteamLogo, WindowControls } from '../components';
import { Accounts, UpdateInfo, hz, inTauri, mcName, readPng, steamFriends, steamLogin, steamProfile, uaError, UiState } from '../api';
import { t } from '../i18n';
import Home from '../pages/Home';
import Releases from '../pages/Releases';
import Loaders from '../pages/Loaders';
import Browse from '../pages/Browse';
import SkinEditor from '../pages/SkinEditor';
import Settings from '../pages/Settings';
import Activity from '../pages/Activity';
import Friends from '../pages/Friends';

export type Instance = {
  id: string; name: string; kind: string; home: string; selected: boolean; version?: string | null;
  java?: { minecraft: string; loader?: { kind: string; version: string }; memory_mb?: number } | null;
  played_secs: number; last_played_ms?: number | null;
};
export type PageId = 'home' | 'activity' | 'versions' | 'loaders' | 'mods' | 'packs' | 'skins' | 'friends' | 'settings';
export type Ctx = {
  state: UiState;
  skinUrl?: string;
  update: (s: Partial<UiState>) => void;
  /** Minecraft: Java Edition instances only. */
  instances: Instance[];
  selected?: Instance;
  accounts: Accounts | null;
  refresh: () => void;
  go: (p: PageId, arg?: string) => void;
  toast: (t: string) => void;
  signIn: () => void;
  available: UpdateInfo | null;
  onUpdate: () => void;
  onFoundUpdate: (u: UpdateInfo | null) => void;
};

const LOADER_NAMES: Record<string, string> = { fabric: 'Fabric', quilt: 'Quilt', forge: 'Forge', neoforge: 'NeoForge' };
export const instLabel = (i: Instance) =>
  i.java ? `Minecraft ${i.java.minecraft}${i.java.loader ? ` · ${LOADER_NAMES[i.java.loader.kind] ?? i.java.loader.kind}` : ''}` : i.name;

export default function Main({ state, update, onLogout, available, onUpdate, onFoundUpdate }: {
  state: UiState; update: (s: Partial<UiState>) => void; onLogout: () => void;
  available: UpdateInfo | null; onUpdate: () => void; onFoundUpdate: (u: UpdateInfo | null) => void;
}) {
  const [page, setPage] = useState<PageId>('home');
  const [pageArg, setPageArg] = useState<string | undefined>();
  const [instances, setInstances] = useState<Instance[]>([]);
  const [accounts, setAccounts] = useState<Accounts | null>(null);
  const [toastText, setToast] = useState('');
  const [menu, setMenu] = useState(false);
  const [skinUrl, setSkinUrl] = useState<string | undefined>();

  useEffect(() => {
    if (state.guest?.skin && inTauri) readPng(state.guest.skin).then(setSkinUrl).catch(() => setSkinUrl(undefined));
    else setSkinUrl(undefined);
  }, [state.guest?.skin]);

  const refresh = useCallback(() => {
    hz<Instance[]>(['instance', 'list'])
      .then(async (r) => {
        const java = (Array.isArray(r) ? r : []).filter((i) => i.java);
        // the engine's own Horizon instance is not part of this launcher: Play starts a Java one
        if (java.length && !java.some((i) => i.selected)) {
          await hz(['instance', 'select', java[0].id]).catch(() => {});
          java[0].selected = true;
        }
        setInstances(java);
      })
      .catch(() => {});
    hz<Accounts>(['account', 'list']).then(setAccounts).catch(() => {});
  }, []);
  useEffect(refresh, [refresh]);

  const toast = (s: string) => {
    setToast(s);
    setTimeout(() => setToast(''), 3200);
  };
  const go = (p: PageId, arg?: string) => { setPage(p); setPageArg(arg); setMenu(false); };
  const selected = instances.find((i) => i.selected) ?? instances[0];
  const steamSignIn = async () => {
    toast(t('Подтвердите вход в браузере…'));
    try {
      let p = await steamLogin();
      p = await steamProfile(p.steamid).then((x) => ({ ...p, name: x.name, avatar: x.avatar ?? p.avatar })).catch(() => p);
      const name = state.guest?.name ?? mcName(p);
      update({ guest: { name, model: state.guest?.model ?? 'classic', skin: state.guest?.skin, steam: p } });
      toast(t('Steam подключён: {n}', { n: p.name }));
    } catch (e) {
      toast(uaError(e));
    }
  };
  const ctx: Ctx = { state, skinUrl, update, instances, selected, accounts, refresh, go, toast, signIn: steamSignIn, available, onUpdate, onFoundUpdate };
  const steam = state.guest?.steam;
  const [online, setOnline] = useState(0);
  // Steam friends online, for the rail badge; refreshed every two minutes.
  useEffect(() => {
    if (!steam) return setOnline(0);
    const tick = () => steamFriends(steam.steamid).then((r) => setOnline(r.friends.filter((f) => f.state !== 'offline').length)).catch(() => {});
    tick();
    const id = window.setInterval(tick, 120_000);
    return () => window.clearInterval(id);
  }, [steam?.steamid]);

  const nav: { id: PageId; icon: JSX.Element; tip: string }[] = [
    { id: 'versions', icon: <Box size={18} />, tip: t('Версии Minecraft') },
    { id: 'loaders', icon: <Layers size={18} />, tip: t('Сборки: Fabric, Forge, NeoForge, Quilt') },
    { id: 'mods', icon: <Puzzle size={18} />, tip: t('Моды (Modrinth)') },
    { id: 'packs', icon: <Boxes size={18} />, tip: t('Сборки модов (Modrinth)') },
    { id: 'skins', icon: <Shirt size={18} />, tip: t('Редактор скинов') },
  ];

  return (
    <div className="main">
      <div className={`hero-bg ${page === 'home' ? '' : 'page'}`}><Scene preset="hero" /></div>
      <nav className="rail">
        <button className={`ico ${page === 'activity' ? 'active' : ''}`} onClick={() => go('activity')}>
          <Clock size={18} /><span className="tip">{t('Активность и журнал')}</span>
        </button>
        <div style={{ height: 50 }} />
        <button className={`ico ${page === 'home' ? 'active' : ''}`} onClick={() => go('home')}>
          <Gamepad2 size={19} /><span className="tip">{t('Главная')}</span>
        </button>
        <div className="group">
          {nav.map((n) => (
            <button key={n.id} className={`ico ${page === n.id ? 'active' : ''}`} onClick={() => go(n.id)}>
              {n.icon}<span className="tip">{n.tip}</span>
            </button>
          ))}
          <button className={`ico ${page === 'friends' ? 'active' : ''}`} onClick={() => go('friends')}>
            <Users size={18} /><span className="tip">{t('Друзья Steam')}</span>
            {online > 0 && <span className="count">{online}</span>}
          </button>
          <button className="ico" onClick={() => go('loaders', 'new')}>
            <Plus size={18} /><span className="tip">{t('Новая сборка')}</span>
          </button>
        </div>
        <div className="spacer" />
        <button className={`ico ${page === 'settings' ? 'active' : ''}`} onClick={() => go('settings')}>
          <SettingsIco size={18} /><span className="tip">{t('Настройки')}</span>
        </button>
      </nav>
      <div className="content">
        <div className="topbar drag">
          {available && (
            <button className="update-btn nodrag" onClick={onUpdate}>
              <ArrowUpCircle size={14} /> {t('Вышло обновление {v}', { v: available.version })}
            </button>
          )}
          <div className="status">
            <div>
              <span className="dot" style={{ background: selected ? '#5bd69b' : '#e5a84d' }} />
              {selected ? instLabel(selected).toUpperCase() : t('НЕТ СБОРКИ')}
            </div>
            <div className="s2">{steam ? `STEAM · ${steam.name}` : t('ГОСТЬ')} · {state.guest?.name}</div>
          </div>
          <span className="status-ico"><Wifi size={16} /></span>
          <button className="avatar nodrag" onClick={() => setMenu(!menu)} aria-label={t('Профиль')}>
            <Avatar steam={steam} skin={skinUrl} model={state.guest?.model} />
          </button>
          <div style={{ width: 70 }} />
          <WindowControls />
          {menu && (
            <div className="gcard nodrag" style={{ position: 'absolute', right: 96, top: 66, zIndex: 60, width: 250, padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {!steam && (
                <button className="row" onClick={() => { setMenu(false); steamSignIn(); }}>
                  <span>{t('Войти через Steam')}</span><SteamLogo />
                </button>
              )}
              <button className="row" onClick={() => go('skins')}>
                <span>{t('Сменить скин')}</span><Shirt size={15} className="chev" />
              </button>
              <button className="row" onClick={() => { setMenu(false); onLogout(); }}>
                <span>{t('Сменить ник или аккаунт')}</span><LogOut size={15} className="chev" />
              </button>
            </div>
          )}
        </div>
        {page === 'home' && <Home ctx={ctx} />}
        {page === 'activity' && <Activity ctx={ctx} />}
        {page === 'versions' && <Releases ctx={ctx} />}
        {page === 'loaders' && <Loaders ctx={ctx} openNew={pageArg === 'new'} />}
        {page === 'mods' && <Browse ctx={ctx} type="mod" key="mods" />}
        {page === 'packs' && <Browse ctx={ctx} type="modpack" key="packs" />}
        {page === 'skins' && <SkinEditor ctx={ctx} />}
        {page === 'friends' && <Friends ctx={ctx} />}
        {page === 'settings' && <Settings ctx={ctx} onLogout={onLogout} />}
      </div>
      {toastText && <div className="toast">{toastText}</div>}
    </div>
  );
}
