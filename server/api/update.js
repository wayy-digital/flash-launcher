// GET /api/update?target=windows&arch=x86_64&bundle=nsis&current=0.3.1
// The Tauri updater asks this on every launch and every 30 minutes. It answers 204 when the
// player is up to date (or there is no build for their system), else the newest release in
// Tauri's static format. The release is releases.json from the repository's latest GitHub
// Release, which the Release workflow publishes; the CDN keeps the answer for a minute.
const MANIFEST = process.env.RELEASES_URL || 'https://github.com/wayy-digital/flash-launcher/releases/latest/download/releases.json';
const parse = (v) => String(v || '0').replace(/^v/, '').split(/[.+-]/).slice(0, 3).map((n) => parseInt(n, 10) || 0);
const newer = (a, b) => {
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
  const { target = '', arch = '', bundle = '', current = '0.0.0' } = req.query;
  let release;
  try {
    const r = await fetch(MANIFEST, { headers: { 'User-Agent': 'flash-launcher-api (wayy.digital)' } });
    if (!r.ok) return res.status(204).end();
    release = await r.json();
  } catch {
    return res.status(204).end();
  }
  const keys = [`${target}-${arch}-${bundle}`, `${target}-${arch}`];
  const platform = keys.find((k) => release.platforms?.[k]);
  if (!platform || !newer(release.version, current)) return res.status(204).end();
  res.status(200).json({
    version: release.version,
    notes: release.notes || '',
    pub_date: release.pub_date,
    platforms: { [platform]: release.platforms[platform] },
  });
}
