/* ═══════════════════════════════════════════════════
 * Vercel serverless function: /api/sitemap-anime
 * Generates a sitemap of top anime pages from Jikan
 * Cached by Cloudflare for 24h — zero cost to run
 * ═══════════════════════════════════════════════════ */
const JIKAN = 'https://api.jikan.moe/v4';
const BASE  = 'https://kamistream.fun';

async function fetchPage(page) {
  const r = await fetch(`${JIKAN}/top/anime?limit=25&page=${page}`);
  if (!r.ok) return [];
  const json = await r.json();
  return json?.data || [];
}

export default async function handler(req, res) {
  try {
    // Fetch top 4 pages = 100 anime (enough for a strong sitemap start)
    const pages = await Promise.all([1, 2, 3, 4].map(fetchPage));
    const anime = pages.flat();

    const urls = anime
      .filter(a => a?.mal_id)
      .map(a => {
        const lastmod = a.aired?.to
          ? new Date(a.aired.to).toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0];
        return `  <url>
    <loc>${BASE}/anime/${a.mal_id}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
      }).join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400'); // 24h
    res.status(200).send(xml);
  } catch (err) {
    res.status(500).send('<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>');
  }
}
