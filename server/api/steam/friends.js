import { guard, steam, summaries } from '../_steam.js';

const ORDER = { ingame: 0, online: 1, busy: 1, away: 2, snooze: 2, trade: 1, play: 1, offline: 3 };

// GET /api/steam/friends?steamid=7656… → the player's Steam friends, playing and online first.
// A private friends list answers { private: true, friends: [] }.
export default async function handler(req, res) {
  const steamid = guard(req, res);
  if (!steamid) return;
  try {
    const list = await steam('/ISteamUser/GetFriendList/v1/', { steamid, relationship: 'friend' });
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120');
    if (list.private) return res.status(200).json({ private: true, friends: [] });
    const ids = (list.friendslist?.friends ?? []).map((f) => f.steamid).slice(0, 500);
    const friends = (await summaries(ids)).sort(
      (a, b) => (ORDER[a.state] ?? 3) - (ORDER[b.state] ?? 3) || a.name.localeCompare(b.name),
    );
    res.status(200).json({ private: false, friends });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
}
