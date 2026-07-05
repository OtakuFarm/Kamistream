/* ═══════════════════════════════════════════════════════════════════════
 * Vercel serverless function: /api/anikoto
 * Server-side proxy for anikotoapi.site.
 *
 * Why this exists:
 *   anikotoapi.site's own docs ask that it not be hit directly from
 *   browser JS on every page load (shared free API, IP rate-limited).
 *   Routing through this function means:
 *     - only our server IP calls anikotoapi.site, not every visitor's browser
 *     - Vercel's CDN caches responses (s-maxage below), so repeat requests
 *       for the same page/series within the cache window never leave Vercel
 *     - we control retries/timeouts/error shape in one place
 *
 * Usage from the client:
 *   GET /api/anikoto?action=recent&page=1&per_page=25
 *   GET /api/anikoto?action=series&id=<anikoto-series-id>
 * ═══════════════════════════════════════════════════════════════════════ */

const ANIKOTO_BASE = 'https://anikotoapi.site';

// Cache windows (seconds). Recent-anime list changes as new eps drop, so
// keep it short. Series/episode data for a given id is far more stable.
const RECENT_TTL = 60 * 5;      // 5 min
const SERIES_TTL = 60 * 30;     // 30 min

async function fetchJson(url, timeoutMs = 6000) {
  const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) {
    const err = new Error(`Upstream ${r.status}`);
    err.status = r.status;
    throw err;
  }
  return r.json();
}

export default async function handler(req, res) {
  const { action, page, per_page, id } = req.query;

  try {
    if (action === 'recent') {
      const p = Number.parseInt(page, 10) || 1;
      const pp = Number.parseInt(per_page, 10) || 25;
      const json = await fetchJson(`${ANIKOTO_BASE}/recent-anime?page=${p}&per_page=${pp}`);

      res.setHeader('Cache-Control', `public, max-age=0, s-maxage=${RECENT_TTL}, stale-while-revalidate=${RECENT_TTL * 2}`);
      return res.status(200).json(json);
    }

    if (action === 'series') {
      if (!id) {
        return res.status(400).json({ ok: false, error: 'missing id' });
      }
      const json = await fetchJson(`${ANIKOTO_BASE}/series/${encodeURIComponent(id)}`);

      res.setHeader('Cache-Control', `public, max-age=0, s-maxage=${SERIES_TTL}, stale-while-revalidate=${SERIES_TTL * 2}`);
      return res.status(200).json(json);
    }

    return res.status(400).json({ ok: false, error: 'unknown action, expected "recent" or "series"' });
  } catch (err) {
    const status = err?.status && err.status >= 400 && err.status < 600 ? err.status : 502;
    return res.status(status).json({ ok: false, error: 'anikoto upstream failed' });
  }
}
