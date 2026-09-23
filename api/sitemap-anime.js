/* ═══════════════════════════════════════════════════
 * Vercel serverless function: /api/sitemap-anime
 * FALLBACK sitemap of top anime pages from Jikan.
 *
 * The build now emits a static /sitemap-anime.xml (scripts/prerender.mjs,
 * writeSitemapAnime) covering every prerendered anime page, and Vercel serves
 * the filesystem before rewrites — so the static file is what crawlers get.
 * This handler only runs if a build produced no anime pages at all.
 * Cached by CDN for 24h — zero cost to run.
 * ═══════════════════════════════════════════════════ */
const JIKAN = 'https://api.jikan.moe/v4';
const BASE  = 'https://www.kamistream.fun';

async function fetchPage(page) {
  const r = await fetch(`${JIKAN}/top/anime?limit=25&page=${page}`);
  if (!r.ok) throw new Error(`Jikan ${r.status}`);
  const json = await r.json();
  return json?.data || [];
}

// Top 8 pages = 200 titles, matching TOP_PAGES in scripts/prerender.mjs and
// therefore the set of anime detail pages that actually ship prerendered HTML.
// This used to be 4 pages / 100 titles, and each failed page silently dropped
// 25 more — which is how the live sitemap ended up listing only 50 URLs.
//
// NOTE: as of the prerender change this handler is a FALLBACK. The build now
// writes a static /sitemap-anime.xml, and Vercel serves the filesystem before
// rewrites, so the static file wins. This only answers if a build produced no
// anime pages at all (total API outage).
//
// Jikan allows ~3 req/sec — parallel requests trip 429s, so fetch sequentially
// with a small gap and tolerate partial failures (a partial sitemap beats an
// empty one).
const TOP_PAGES = 8;

async function fetchAllPages() {
  const out = [];
  for (let page = 1; page <= TOP_PAGES; page++) {
    try {
      out.push(...await fetchPage(page));
    } catch { /* skip failed page, keep what we already have */ }
    if (page < TOP_PAGES) await new Promise(r => setTimeout(r, 400));
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
    // Same top-8 pages the prerenderer uses; de-duplicated because Jikan can
    // repeat titles across page boundaries.
    const anime = await fetchAllPages();

    const seen = new Set();
    const urls = anime
      .filter(a => {
        if (!a?.mal_id || seen.has(a.mal_id)) return false;
        seen.add(a.mal_id);
        return true;
      })
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
