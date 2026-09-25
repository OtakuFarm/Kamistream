/* ═══════════════════════════════════════════════════════════════════
 * Vercel serverless function: /api/sitemap-pages
 * Sitemap for all static + curated listing pages: home, browse, category
 * pages, A–Z list, schedule, mood, hidden gems, about, the legal pages
 * (DMCA / terms / contact) and every genre page we publish (POPULAR_GENRES
 * in src/lib/genres.js). Complements /sitemap-anime.xml (top anime pages).
 * Cached by CDN for 24h — zero cost to run.
 * ═══════════════════════════════════════════════════════════════════ */

// Genre URLs come from the shared catalogue in src/lib/genres.js — the same
// module src/pages/genre.tsx and scripts/prerender.mjs read. Listing the full
// 58-id MAL table here is what made Search Console report "Submitted URL
// marked 'noindex'": the pages outside POPULAR_GENRES are deliberately
// noindexed "Genre Not Found" shells, so they must not be advertised.
import { POPULAR_GENRE_NAMES_BY_ID } from '../src/lib/genres.js';

const BASE = 'https://www.kamistream.fun';

// Must mirror CATEGORY_ORDER in src/pages/category.tsx
const CATEGORY_ORDER = [
  'trending', 'new-release', 'new-added', 'just-completed',
  'top-rated', 'this-season', 'top-anime', 'upcoming',
];

export default async function handler(req, res) {
  const today = new Date().toISOString().split('T')[0];

  const staticPages = [
    { path: '/',            freq: 'daily',   pri: '1.0' },
    { path: '/browse',      freq: 'daily',   pri: '0.9' },
    { path: '/schedule',    freq: 'daily',   pri: '0.8' },
    // Served by api/latest.js via the /latest-episodes rewrite — NOT
    // prerendered (a static file there would shadow the rewrite, since
    // Vercel checks the filesystem before applying rewrites).
    { path: '/latest-episodes', freq: 'daily', pri: '0.8' },
    { path: '/az-list',     freq: 'weekly',  pri: '0.7' },
    { path: '/mood',        freq: 'weekly',  pri: '0.6' },
    { path: '/hidden-gems', freq: 'weekly',  pri: '0.6' },
    { path: '/about',       freq: 'monthly', pri: '0.4' },
    // The legal / contact pages were missing from every sitemap even though
    // they are real, prerendered, indexable pages with unique titles. They are
    // low priority, not zero: Google explicitly looks for a reachable
    // Home / About / Contact / Terms set (and a DMCA policy) when judging
    // whether a site is trustworthy — which matters most for streaming sites.
    // These paths must stay identical to STATIC_PAGES in scripts/prerender.mjs.
    { path: '/dmca',        freq: 'yearly',  pri: '0.3' },
    { path: '/terms',       freq: 'yearly',  pri: '0.3' },
    { path: '/contact',     freq: 'yearly',  pri: '0.3' },
  ];

  const pages = [
    ...staticPages,
    ...CATEGORY_ORDER.map(c => ({ path: `/category/${c}`, freq: 'daily',  pri: '0.7' })),
    ...Object.keys(POPULAR_GENRE_NAMES_BY_ID).map(id => ({ path: `/genre/${id}`, freq: 'weekly', pri: '0.6' })),
  ];

  const urls = pages
    .map(({ path, freq, pri }) => `  <url>
    <loc>${BASE}${path}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${freq}</changefreq>
    <priority>${pri}</priority>
  </url>`)
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

  res.setHeader('Content-Type', 'application/xml');
  res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400'); // 24h
  res.status(200).send(xml);
}