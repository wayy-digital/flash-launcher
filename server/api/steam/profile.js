import { guard, summaries } from '../_steam.js';

// GET /api/steam/profile?steamid=7656… → name, avatar, online state, current game.
export default async function handler(req, res) {
  const steamid = guard(req, res);
  if (!steamid) return;
  try {
    const [p] = await summaries([steamid]);
    if (!p) return res.status(404).json({ error: 'not found' });
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120');
    res.status(200).json(p);
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
}
