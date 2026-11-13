// Shared helpers for the Steam Web API proxy. The key lives only in the STEAM_API_KEY env var.
const API = 'https://api.steampowered.com';
const STATES = ['offline', 'online', 'busy', 'away', 'snooze', 'trade', 'play'];

export function guard(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Vary', 'X-Flash-Launcher');
  if (req.headers['x-flash-launcher'] !== '1') {
    res.status(403).json({ error: 'forbidden' });
    return null;
  }
  const steamid = String(req.query.steamid || '');
  if (!/^\d{17}$/.test(steamid)) {
    res.status(400).json({ error: 'bad steamid' });
    return null;
  }
  if (!process.env.STEAM_API_KEY) {
    res.status(500).json({ error: 'no key' });
    return null;
  }
  return steamid;
}

export async function steam(path, params) {
  const u = new URL(API + path);
  u.searchParams.set('key', process.env.STEAM_API_KEY);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const r = await fetch(u, { headers: { 'User-Agent': 'flash-launcher-api (wayy.digital)' } });
  if (r.status === 401) return { private: true };
  if (!r.ok) throw new Error(`steam ${r.status}`);
  return r.json();
}

/** Player summaries for up to any number of SteamIDs, 100 per request. */
export async function summaries(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 100) {
    const r = await steam('/ISteamUser/GetPlayerSummaries/v2/', { steamids: ids.slice(i, i + 100).join(',') });
    out.push(...(r.response?.players ?? []));
  }
  return out.map((p) => ({
    steamid: p.steamid,
    name: p.personaname,
    avatar: p.avatarfull || p.avatarmedium || p.avatar || null,
    avatarSmall: p.avatarmedium || p.avatar || null,
    profileUrl: p.profileurl,
    state: p.gameextrainfo ? 'ingame' : STATES[p.personastate ?? 0] ?? 'offline',
    game: p.gameextrainfo || null,
    lastLogoff: p.lastlogoff ?? null,
    public: p.communityvisibilitystate === 3,
  }));
}
