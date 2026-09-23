/* ═══════════════════════════════════════════════════════════════════
 * Vercel serverless function: /api/sitemap-pages
 * Sitemap for all static + curated listing pages: home, browse, category
 * pages, A–Z list, schedule, mood, hidden gems, about, the legal pages
 * (DMCA / terms / contact) and EVERY genre page. Complements
 * /sitemap-anime.xml (top anime pages).
 * Cached by CDN for 24h — zero cost to run.
 * ═══════════════════════════════════════════════════════════════════ */
const BASE = 'https://www.kamistream.fun';

// Genre IDs + names — must mirror GENRES in src/pages/genre.tsx (Jikan MAL IDs)
const GENRES = {
  '1':  'Action',
  '2':  'Adventure',
  '4':  'Comedy',
  '7':  'Mystery',
  '8':  'Drama',
  '9':  'Ecchi',
  '10': 'Fantasy',
  '13': 'Historical',
  '14': 'Horror',
  '17': 'Martial Arts',
  '18': 'Mecha',
  '19': 'Music',
  '22': 'Romance',
  '23': 'School',
  '24': 'Sci-Fi',
  '25': 'Shoujo',
  '27': 'Shounen',
  '29': 'Space',
  '30': 'Sports',
  '36': 'Slice of Life',
  '37': 'Supernatural',
  '38': 'Military',
  '40': 'Psychological',
  '41': 'Thriller',
  '42': 'Seinen',
  '43': 'Josei',
  '46': 'Award Winning',
  '47': 'Gourmet',
  '50': 'Adult Cast',
  '55': 'Delinquents',
  '56': 'Detective',
  '57': 'Educational',
  '60': 'Gore',
  '61': 'Harem',
  '62': 'High Stakes Game',
  '65': 'Idols (Male)',
  '66': 'Isekai',
  '67': 'Iyashikei',
  '70': 'Mahou Shoujo',
  '71': 'Medical',
  '72': 'Mythology',
  '74': 'Otaku Culture',
  '75': 'Parody',
  '77': 'Pets',
  '78': 'Racing',
  '79': 'Reincarnation',
  '82': 'Samurai',
  '83': 'Showbiz',
  '84': 'Strategy Game',
  '85': 'Super Power',
  '86': 'Survival',
  '87': 'Team Sports',
  '88': 'Time Travel',
  '89': 'Vampire',
  '91': 'Villainess',
  '93': 'Witchcraft',
  '94': 'Yaoi',
  '95': 'Yuri',
};

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
    ...Object.keys(GENRES).map(id => ({ path: `/genre/${id}`, freq: 'weekly', pri: '0.6' })),
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