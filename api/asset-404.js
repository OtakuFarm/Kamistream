/* ═══════════════════════════════════════════════════════════════════════
 * Vercel serverless function: /api/asset-404
 * Target of the "/assets/(.*) → /api/asset-404" rewrite in vercel.json.
 *
 * ── WHY THIS EXISTS (cache-poisoning fix) ─────────────────────────────
 * vercel.json gives /assets/* an IMMUTABLE one-year Cache-Control (hashed
 * filenames — safe for real files) and also carries a catch-all
 * "/(.*) → /index.html" SPA fallback. Vercel checks the filesystem before
 * applying rewrites, so EXISTING assets are served normally — but a MISSING
 * one (stale hash from a previous deploy, held by a browser or Cloudflare
 * cache) used to fall through to the catch-all and receive:
 *
 *     status 200 + Cache-Control: immutable (1 year) + index.html body
 *
 * Cloudflare would then cache homepage HTML under an /assets/*.js URL and
 * serve it as JavaScript to every visitor until manually purged — site-
 * breaking, and exactly the deploy-skew poison this function removes.
 * Missing assets must be a real 404, never 200 HTML.
 *
 * Cache note: we ask for no-store here; if the vercel.json header rule
 * outranks the function's header for /assets/*, the status code is still 404
 * — the HTML-poison vector stays closed either way. (Hashed name + 404 =
 * content genuinely absent; only a rollback-to-that-deploy could resurrect
 * it, and deploys/rollbacks should purge Cloudflare anyway.)
 * ═══════════════════════════════════════════════════════════════════════ */

export default function handler(req, res) {
  const path = req.query?.path || req.url || '';
  // Cheap signal in the Vercel logs when deploys leave stale asset refs behind.
  console.warn(`[asset-404] missing asset requested: ${path}`);

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(404).send('Not found');
}
