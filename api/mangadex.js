/* ═══════════════════════════════════════════════════════════════
 * Vercel Serverless Proxy: /api/mangadex
 *
 * Why this exists:
 *   MangaDex sets CORS headers that block direct browser requests
 *   to certain endpoints (especially /at-home/server/:id which
 *   returns chapter page URLs). This proxy runs server-side, so
 *   CORS is never an issue.
 *
 * Usage from the frontend:
 *   Replace:  fetch(`https://api.mangadex.org/some/path?foo=bar`)
 *   With:     fetch(`/api/mangadex?path=/some/path&foo=bar`)
 *
 * All query params except "path" are forwarded as-is to MangaDex.
 * ═══════════════════════════════════════════════════════════════ */

const MANGADEX_BASE = 'https://api.mangadex.org';

// Endpoints we allow to be proxied (whitelist for safety)
const ALLOWED_PREFIXES = [
  '/manga',
  '/chapter',
  '/at-home/server',
  '/author',
  '/cover',
];

export default async function handler(req, res) {
  // ── CORS headers so the browser is happy ──────────────────────
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Extract the target path ────────────────────────────────────
  const { path, ...rest } = req.query;

  if (!path) {
    return res.status(400).json({ error: 'Missing required "path" query param' });
  }

  // Normalise — ensure it starts with /
  const normalised = path.startsWith('/') ? path : `/${path}`;

  // Security: only allow whitelisted MangaDex paths
  const allowed = ALLOWED_PREFIXES.some(prefix => normalised.startsWith(prefix));
  if (!allowed) {
    return res.status(403).json({ error: `Path "${normalised}" is not proxied` });
  }

  // ── Build the upstream URL ─────────────────────────────────────
  // Forward all remaining query params (e.g. title, limit, includes[], etc.)
  const upstreamParams = new URLSearchParams();
  for (const [key, value] of Object.entries(rest)) {
    if (Array.isArray(value)) {
      value.forEach(v => upstreamParams.append(key, v));
    } else {
      upstreamParams.append(key, value);
    }
  }

  const paramString = upstreamParams.toString();
  const upstreamUrl = `${MANGADEX_BASE}${normalised}${paramString ? `?${paramString}` : ''}`;

  // ── Proxy the request ──────────────────────────────────────────
  try {
    const upstream = await fetch(upstreamUrl, {
      headers: {
        // Identify ourselves to MangaDex — good API citizenship
        'User-Agent': 'KamiStream/1.0 (https://kamistream.fun)',
        'Accept': 'application/json',
      },
    });

    // Forward MangaDex's status code
    const json = await upstream.json();

    // Cache successful responses at the CDN level
    // /at-home/server URLs expire after 15 min per MangaDex spec
    if (upstream.ok) {
      const isAtHome = normalised.startsWith('/at-home/server');
      const maxAge   = isAtHome ? 600 : 300; // 10 min for pages, 5 min for meta
      res.setHeader('Cache-Control', `s-maxage=${maxAge}, stale-while-revalidate=60`);
    }

    return res.status(upstream.status).json(json);

  } catch (err) {
    console.error('[mangadex proxy] upstream fetch failed:', err);
    return res.status(502).json({ error: 'Failed to reach MangaDex API', detail: err.message });
  }
}
