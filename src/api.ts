// The bridge to the Rust side: the Flash engine (its CLI), HTTP for browsing data,
// and the UI's own saved state.
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { t } from './i18n';

export const inTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export async function hz<T = any>(args: string[]): Promise<T> {
  if (!inTauri) throw new Error(t('Движок доступен только в приложении'));
  return invoke<T>('engine', { args });
}

/** Runs a long engine command and streams its output; resolves with the exit code. */
export async function hzStream(args: string[], onLine: (line: string, err: boolean) => void): Promise<number | null> {
  if (!inTauri) throw new Error(t('Движок доступен только в приложении'));
  const id = Math.random().toString(36).slice(2);
  let resolve!: (c: number | null) => void;
  const done = new Promise<number | null>((r) => (resolve = r));
  const un1 = await listen<{ id: string; line: string; err: boolean }>('hz-log', (e) => {
    if (e.payload.id === id) onLine(e.payload.line, e.payload.err);
  });
  const un2 = await listen<{ id: string; code: number | null }>('hz-done', (e) => {
    if (e.payload.id === id) resolve(e.payload.code);
  });
  try {
    await invoke('engine_stream', { id, args });
    return await done;
  } finally {
    un1();
    un2();
  }
}

export async function http<T = any>(url: string): Promise<T> {
  if (inTauri) return invoke<T>('http_json', { url });
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

export type EngineInfo = { path: string; found: boolean; version: string | null };
export const engineInfo = (): Promise<EngineInfo> =>
  inTauri ? invoke('engine_info') : Promise.resolve({ path: '—', found: false, version: null });

export type Session = { start: number; secs: number; instance: string };
export type UiState = {
  setupDone: boolean;
  lang?: 'ru' | 'uk';
  /** Install launcher updates by itself when it starts (default on). */
  autoUpdate?: boolean;
  guest?: { name: string; model: 'classic' | 'slim'; skin?: string; steam?: SteamProfile };
  sessions: Session[];
  recentPacks: { id: string; title: string; icon?: string }[];
};
export const defaultState: UiState = { setupDone: false, sessions: [], recentPacks: [] };

export async function loadState(): Promise<UiState> {
  try {
    const s = inTauri ? await invoke<UiState | null>('state_load') : JSON.parse(localStorage.getItem('flash-ui') || 'null');
    return { ...defaultState, ...(s || {}) };
  } catch {
    return { ...defaultState };
  }
}

export async function saveState(s: UiState) {
  if (inTauri) await invoke('state_save', { state: s });
  else {
    try { localStorage.setItem('flash-ui', JSON.stringify(s)); } catch { /* preview only */ }
  }
}

export const saveSkin = (name: string, pngBase64: string) => invoke<string>('save_skin', { name, pngBase64 });
export const readPng = (path: string) => invoke<string>('read_png', { path });

export async function pickFile(filters: { name: string; extensions: string[] }[]): Promise<string | null> {
  if (!inTauri) return null;
  const { open } = await import('@tauri-apps/plugin-dialog');
  const r = await open({ multiple: false, filters });
  return typeof r === 'string' ? r : null;
}

export async function pickFolder(): Promise<string | null> {
  if (!inTauri) return null;
  const { open } = await import('@tauri-apps/plugin-dialog');
  const r = await open({ directory: true, multiple: false });
  return typeof r === 'string' ? r : null;
}

export async function windowAction(a: 'close' | 'minimize' | 'maximize') {
  if (!inTauri) return;
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const w = getCurrentWindow();
  if (a === 'close') await w.close();
  else if (a === 'minimize') await w.minimize();
  else await w.toggleMaximize();
}

// Modrinth (the only mod source, as chosen).
export type MrHit = {
  project_id: string; slug: string; title: string; description: string; icon_url?: string;
  downloads: number; follows: number; categories: string[]; versions: string[]; author: string;
  project_type: string; gallery?: string[]; featured_gallery?: string | null; date_modified: string;
};
export async function modrinthSearch(opts: { query: string; type: 'modpack' | 'mod' | 'resourcepack' | 'shader'; loader?: string; version?: string; offset?: number; sort?: string }) {
  const facets: string[][] = [[`project_type:${opts.type}`]];
  if (opts.loader) facets.push([`categories:${opts.loader}`]);
  if (opts.version) facets.push([`versions:${opts.version}`]);
  const u = new URL('https://api.modrinth.com/v2/search');
  u.searchParams.set('query', opts.query);
  u.searchParams.set('limit', '20');
  u.searchParams.set('offset', String(opts.offset ?? 0));
  u.searchParams.set('index', opts.sort ?? 'relevance');
  u.searchParams.set('facets', JSON.stringify(facets));
  return http<{ hits: MrHit[]; total_hits: number }>(u.toString());
}

export const fmtNum = (n: number) =>
  n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n);

/** The engine speaks English on its command line: the messages a player meets most, translated. */
const MSGS: [RegExp, string][] = [
  [/to play|owns Minecraft|download.*owner|Download Minecraft from Mojang|Microsoft/i,
    'Файлов этой версии Minecraft нет. Mojang выдаёт игру только владельцам лицензии Microsoft, поэтому Flash Launcher её не скачивает.'],
  [/answered 403|No connection|Connection Failed/i, 'Нет соединения — проверьте интернет и попробуйте ещё раз.'],
  [/No such file|os error 2/i, 'Файла ещё нет — он появится после первого запуска игры.'],
];
export const uaError = (e: unknown) => {
  const s = String(e).replace(/^Error:\s*/i, '').replace(/^error:\s*/i, '');
  const hit = MSGS.find(([re]) => re.test(s));
  return hit ? t(hit[1]) : s;
};

export type SteamProfile = { steamid: string; name: string; avatar?: string | null };
export type SteamFriend = {
  steamid: string; name: string; avatar: string | null; avatarSmall: string | null; profileUrl: string;
  state: 'ingame' | 'online' | 'busy' | 'away' | 'snooze' | 'trade' | 'play' | 'offline'; game: string | null; lastLogoff: number | null;
};
/** Flash Launcher's own API on Vercel: it holds the Steam Web API key, the launcher never does. */
const FLASH_API = 'https://flash-launcher-api.vercel.app/api/steam';
export const steamProfile = (steamid: string) => http<SteamFriend>(`${FLASH_API}/profile?steamid=${steamid}`);
export const steamFriends = (steamid: string) => http<{ private: boolean; friends: SteamFriend[] }>(`${FLASH_API}/friends?steamid=${steamid}`);
/** Opens Steam in the browser and waits for the player to sign in (up to 5 minutes). */
export const steamLogin = () => invoke<SteamProfile>('steam_login');
/** A Minecraft name from a Steam name: Latin letters, digits and _, 3–16 long. */
export function mcName(s: SteamProfile): string {
  const clean = s.name.normalize('NFKD').replace(/[^A-Za-z0-9_]/g, '').slice(0, 16);
  return clean.length >= 3 ? clean : `Player${s.steamid.slice(-6)}`;
}
export const downloadMrpack = (url: string, name: string) => invoke<string>('download_mrpack', { url, name });
export async function openLink(url: string) {
  if (!inTauri) return void window.open(url, '_blank');
  const { openUrl } = await import('@tauri-apps/plugin-opener');
  await openUrl(url);
}
export const readGameLog = (home: string, crash: boolean) => invoke<{ path: string; text: string }>('read_game_log', { home, crash });

export type Accounts = {
  accounts: { name: string; uuid: string; selected: boolean }[];
  offline: { name: string; selected: boolean }[];
  owner: boolean;
  sign_in_configured: boolean;
};

// Launcher updates: checked against our update server, signed with the WAYY key.
export type UpdateInfo = { version: string; current: string; notes: string | null; date: string | null };
export const updateCheck = (): Promise<UpdateInfo | null> => (inTauri ? invoke('update_check') : Promise.resolve(null));
/** Downloads and installs the update found by the last check; the app restarts when done. */
export async function updateInstall(onProgress: (done: number, total: number | null) => void) {
  const un = await listen<{ downloaded: number; total: number | null }>('update-progress', (e) => onProgress(e.payload.downloaded, e.payload.total));
  try { await invoke('update_install'); } finally { un(); }
}
export async function appVersion(): Promise<string> {
  if (!inTauri) return 'dev';
  const { getVersion } = await import('@tauri-apps/api/app');
  return getVersion();
}
