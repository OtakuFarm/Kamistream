/* ═══════════════════════════════════════════════════
 * Vercel serverless function: /api/sitemap-anime
 * Generates a sitemap of top anime pages from Jikan
 * Cached by Cloudflare for 24h — zero cost to run
 * ═══════════════════════════════════════════════════ */
const JIKAN = 'https://api.jikan.moe/v4';
const BASE  = 'https://www.kamistream.fun';

async function fetchPage(page) {
  const r = await fetch(`${JIKAN}/top/anime?limit=25&page=${page}`);
  if (!r.ok) throw new Error(`Jikan ${r.status}`);
  const json = await r.json();
  return json?.data || [];
}

// Jikan allows ~3 req/sec — 4 parallel requests intermittently trip 429s,
// so fetch sequentially with a small gap and tolerate partial failures
// (a 3-page sitemap beats an empty one).
async function fetchAllPages() {
  const out = [];
  for (const page of [1, 2, 3, 4]) {
    try {
      out.push(...await fetchPage(page));
    } catch { /* skip failed page */ }
    if (page < 4) await new Promise(r => setTimeout(r, 400));
  }
  return out;
}

// Same slug rules as src/lib/seo.ts — keeps sitemap URLs consistent
// with the descriptive URLs used across the site.
function slugifyTitle(title) {
  return (title || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export default async function handler(req, res) {
  try {
    // Fetch top 4 pages = 100 anime (enough for a strong sitemap start)
    const anime = await fetchAllPages();

    const urls = anime
      .filter(a => a?.mal_id)
      .map(a => {
        const lastmod = a.aired?.to
          ? new Date(a.aired.to).toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0];
        const slug = slugifyTitle(a.title);
        const loc  = slug ? `${BASE}/anime/${a.mal_id}/${slug}` : `${BASE}/anime/${a.mal_id}`;
        return `  <url>
    <loc>${loc}</loc>
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
