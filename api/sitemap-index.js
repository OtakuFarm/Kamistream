/* ═══════════════════════════════════════════════════════════════════
 * Vercel serverless function: /api/sitemap-index
 * Sitemap index — Google should only be told about THIS one URL in
 * Search Console; it discovers the three child sitemaps from here.
 * Cached by CDN for 24h — zero cost to run.
 * ═══════════════════════════════════════════════════════════════════ */
const BASE = 'https://kamistream.fun';

export default async function handler(req, res) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>${BASE}/sitemap.xml</loc></sitemap>
  <sitemap><loc>${BASE}/sitemap-pages.xml</loc></sitemap>
  <sitemap><loc>${BASE}/sitemap-anime.xml</loc></sitemap>
</sitemapindex>`;

  res.setHeader('Content-Type', 'application/xml');
  res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400'); // 24h
  res.status(200).send(xml);
}