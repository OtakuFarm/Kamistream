/* ═══════════════════════════════════════════════════════════════════════
 * Vercel serverless function: /api/latest  —  served at /latest-episodes
 * The crawlable "Latest Anime Episodes" hub (SEO blueprint §8).
 *
 * Why a function and not a prerendered page:
 *   Episodes air DAILY. A prerendered snapshot would only be as fresh as the
 *   last deploy; this function cross-references the live AniList schedule
 *   (last 72h) with Supabase embed_sources on every (CDN-throttled) request,
 *   so the page is never older than s-maxage — without a rebuild.
 *
 * Why a full HTML document:
 *   Crawlers that don't run JS previously got NOTHING for "recently
 *   updated" — home's row is client-rendered. This returns complete HTML:
 *   title/canonical/OG/JSON-LD + real <a href> links into the indexable
 *   /anime/:id/:slug detail pages, styled with the same #seo-shell / ks-*
 *   markup scripts/prerender.mjs emits.
 *
 * SPA boot: hashed /assets/*.js|css URLs change every build, so they are
 * discovered from our own homepage (prerender never overwrites
 * dist/index.html). Any failure → shell-only page; main.tsx's
 * dismissSeoShell handles that gracefully.
 *
 * Data twin: useRecentlyUpdated hook + home.tsx — keep the join in sync.
 * ═══════════════════════════════════════════════════════════════════════ */
import { createClient } from '@supabase/supabase-js';

const BASE = 'https://www.kamistream.fun';

// Freshness matters more than cache length here: new episodes drop daily, so
// keep the CDN window short (30 min + SWR) — the page regenerates itself
// several times a day at zero cost, which is the whole point of serving this
// dynamically instead of prerendering a snapshot.
const CACHE_CONTROL = 'public, max-age=0, s-maxage=1800, stale-while-revalidate=3600';

// MUST MATCH src/pages/latest-episodes.tsx (useSEO) — server HTML and the
// client-rendered view must serve identical title/description/canonical.
const TITLE     = 'Latest Anime Episodes — Aired in the Last 72 Hours | KamiStream';
const DESC      = 'The newest anime episodes on KamiStream — everything that aired in the last 72 hours, updated daily. Watch sub & dub free in HD.';
const KEYWORDS  = 'latest anime episodes, newly released anime, anime episodes this week, newest anime sub dub, recently aired anime';
const CANONICAL = `${BASE}/latest-episodes`;
const ROBOTS    = 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';

// ── helpers (mirrored from scripts/prerender.mjs + src/lib/seo.ts) ─────
/** HTML-escape for text nodes and attribute values. */
const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Stringify for embedding inside a <script> tag (no raw `<`). */
const toJson = obj => JSON.stringify(obj).replace(/</g, '\\u003c');

/** Same slug rules as src/lib/seo.ts + api/sitemap-anime.js. */
function slugifyTitle(title) {
  return (title || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

/** Same URL shape as animePath() in src/lib/seo.ts — links MUST be the
 *  indexable detail pages, never the noindex /watch pages. */
function animePath(_malId, title) {
  const s = slugifyTitle(title);
  return s ? `/anime/${s}` : '/browse';
}

/** "3h ago" / "2d ago" — relative air time for the tile meta line. */
function ago(ts) {
  if (!ts) return '';
  const s = Math.max(0, Math.floor(Date.now() / 1000) - ts);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ── shell (MIRROR scripts/prerender.mjs: SHELL_CSS / NAV_LINKS / …) ────
// Self-contained styles so the page paints with zero external CSS. Same
// classes as the prerendered #seo-shell keep the whole site consistent.
// Prerender uses position:fixed (overlay that fades when React mounts);
// here the shell IS the page, so we override it back to static flow below.
const SHELL_CSS = [
  '#seo-shell{position:fixed;inset:0;z-index:9999;overflow-y:auto;background:#0a0a0a;color:#fff;',
  "font-family:Nunito,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;line-height:1.55;",
  'opacity:1;transition:opacity .22s ease}',
  '#seo-shell.ks-out{opacity:0;pointer-events:none}',
  '.ks-wrap{max-width:1120px;margin:0 auto;padding:14px 16px 56px}',
  '.ks-top{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;',
  'padding:10px 0 14px;border-bottom:1px solid rgba(255,255,255,.08);margin-bottom:20px}',
  '.ks-brand{font-family:Poppins,system-ui,sans-serif;font-weight:900;font-size:20px;text-decoration:none;',
  'background:linear-gradient(90deg,#a742ff,#22d3ee);-webkit-background-clip:text;background-clip:text;',
  '-webkit-text-fill-color:transparent;color:#22d3ee}',
  '.ks-top nav a{color:#c8c8d8;text-decoration:none;font-size:13px;font-weight:700;margin-left:14px;white-space:nowrap}',
  '.ks-top nav a:hover{color:#fff}',
  '.ks-crumbs{font-size:12px;color:#7a7a8c;margin-bottom:10px}',
  '.ks-crumbs a{color:#7a7a8c;text-decoration:none}.ks-crumbs a:hover{color:#c8c8d8}',
  'h1.ks-h1{font-family:Poppins,system-ui,sans-serif;font-size:26px;font-weight:900;margin:0 0 14px;line-height:1.25}',
  'h2.ks-h2{font-family:Poppins,system-ui,sans-serif;font-size:17px;font-weight:800;margin:28px 0 12px}',
  'p.ks-p{color:#c8c8d8;font-size:14px;margin:0 0 12px;max-width:78ch}',
  '.ks-hero{display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap;margin-bottom:8px}',
  '.ks-poster{width:210px;max-width:38vw;border-radius:14px;display:block;background:#17171b}',
  '.ks-hero>div{flex:1;min-width:250px}',
  '.ks-meta{display:flex;flex-wrap:wrap;gap:8px;list-style:none;padding:0;margin:0 0 12px;font-size:12px;color:#c8c8d8}',
  '.ks-meta li{background:#131316;border:1px solid rgba(255,255,255,.08);border-radius:999px;padding:4px 11px;font-weight:700}',
  '.ks-chips{display:flex;flex-wrap:wrap;gap:6px;list-style:none;padding:0;margin:12px 0 0}',
  '.ks-chips a,.ks-chips span{display:inline-block;background:#131316;border:1px solid rgba(255,255,255,.08);border-radius:999px;',
  'padding:4px 11px;font-size:11.5px;font-weight:800;color:#c8c8d8;text-decoration:none}',
  '.ks-chips a:hover{border-color:#a742ff;color:#fff}',
  '.ks-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:12px;list-style:none;padding:0;margin:0}',
  '.ks-grid a{display:block;text-decoration:none;color:#fff}',
  '.ks-grid img{width:100%;aspect-ratio:2/3;object-fit:cover;border-radius:10px;background:#17171b;display:block}',
  '.ks-grid b{display:-webkit-box;font-size:12px;font-weight:700;margin-top:6px;line-height:1.35;',
  'overflow:hidden;-webkit-line-clamp:2;-webkit-box-orient:vertical}',
  '.ks-grid i{display:block;font-size:10.5px;color:#7a7a8c;font-style:normal;margin-top:2px}',
  '.ks-foot{margin-top:36px;padding-top:18px;border-top:1px solid rgba(255,255,255,.08);font-size:12.5px;color:#7a7a8c}',
  '.ks-foot a{color:#c8c8d8;text-decoration:none;margin-right:14px;display:inline-block;margin-bottom:6px}',
  '.ks-foot a:hover{color:#fff}',
  '@media(max-width:640px){h1.ks-h1{font-size:21px}.ks-poster{width:130px}',
  '.ks-grid{grid-template-columns:repeat(auto-fill,minmax(98px,1fr));gap:9px}}',
  // Override: on prerendered pages #seo-shell is a fixed overlay that React
  // fades out; here it IS the document (React may boot on top of it — same
  // dismissSeoShell flow — but until/unless it does, this must read as a
  // normal page). Same specificity, later rule wins.
  '#seo-shell{position:static;inset:auto;min-height:100vh;z-index:auto}',
].join('');

// MIRROR NAV_LINKS in scripts/prerender.mjs (and TOP_NAV in Topbar.tsx).
// Every /genre/... href below must be an id from POPULAR_GENRES in
// src/lib/genres.js — any other id renders the noindexed "Genre Not Found"
// page, and these links are crawlable sitewide nav.
const NAV_LINKS = [
  ['/browse', 'Browse'], ['/category/top-rated', 'Top Rated'], ['/category/trending', 'Trending'],
  ['/schedule', 'Schedule'], ['/latest-episodes', 'Latest Episodes'], ['/az-list', 'A–Z List'], ['/hidden-gems', 'Hidden Gems'],
  ['/genre/1', 'Action Anime'], ['/genre/22', 'Romance Anime'],
  ['/genre/66', 'Isekai Anime'], ['/best-anime', 'Best by Year'],
];

// MIRROR FOOTER_LINKS in scripts/prerender.mjs (and Footer in Layout.tsx).
const FOOTER_LINKS = [
  ['/browse', 'All Anime'], ['/latest-episodes', 'Latest Episodes'], ['/category/top-anime', 'Top Anime'], ['/category/this-season', 'This Season'],
  ['/category/upcoming', 'Upcoming'], ['/genre/1', 'Action Anime'], ['/genre/22', 'Romance Anime'],
  ['/genre/4', 'Comedy Anime'], ['/genre/10', 'Fantasy Anime'], ['/genre/37', 'Supernatural Anime'],
  ['/genre/66', 'Isekai Anime'], ['/best-anime', 'Best Anime by Year'], ['/mood', 'Anime by Mood'],
  ['/about', 'About KamiStream'], ['/dmca', 'DMCA'], ['/contact', 'Contact'],
];

const shellOpen = () => '<div id="seo-shell"><style>' + SHELL_CSS + '</style><div class="ks-wrap">'
  + '<header class="ks-top"><a class="ks-brand" href="/">KamiStream</a><nav>'
  + NAV_LINKS.map(([h, l]) => `<a href="${h}">${l}</a>`).join('') + '</nav></header>';

const shellClose = () => '<footer class="ks-foot">'
  + FOOTER_LINKS.map(([h, l]) => `<a href="${h}">${l}</a>`).join('')
  + '</footer></div></div>';

function renderCrumbs(items) {
  return '<nav class="ks-crumbs">' + items.map(([label, href], i) =>
    (i ? ' › ' : '') + (href
      ? `<a href="${esc(href)}">${esc(label)}</a>`
      : `<span>${esc(label)}</span>`)
  ).join('') + '</nav>';
}

// ── data ───────────────────────────────────────────────────────────────
// Same query as getRecentlyAired() in src/lib/anilist.ts.
async function getRecentlyAired(hoursBack = 72) {
  const now   = Math.floor(Date.now() / 1000);
  const start = now - hoursBack * 3600;
  const query = `query($s:Int,$e:Int){
    Page(perPage:50){
      airingSchedules(airingAt_greater:$s, airingAt_lesser:$e, sort:TIME_DESC){
        airingAt episode
        media{ id idMal title{ romaji english } coverImage{ large extraLarge } format episodes averageScore status }
      }
    }
  }`;
  const r = await fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables: { s: start, e: now } }),
    signal: AbortSignal.timeout(5000),
  });
  if (!r.ok) throw new Error(`AniList ${r.status}`);
  const json = await r.json();
  return json?.data?.Page?.airingSchedules || [];
}

// mal_id → { latestEp, row } for every ACTIVE embed source.
// Returns null when Supabase is unconfigured/unreachable → caller falls back
// to an unfiltered AniList list (still real content; better than an empty hub).
async function getWatchableByMal() {
  const url = process.env.SUPABASE_URL      || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  const supabase = createClient(url, key);
  const { data, error } = await supabase
    .from('embed_sources')
    .select('episodes(episode_number, anime(mal_id, title_english, title_romaji, cover_image, score, episodes_total))')
    .eq('is_active', true)
    .limit(200)
    .abortSignal(AbortSignal.timeout(5000));
  if (error || !data) return null;

  const map = new Map();
  for (const s of data) {
    const a  = s.episodes?.anime;
    const ep = s.episodes?.episode_number;
    if (!a?.mal_id || !ep) continue;
    const existing = map.get(a.mal_id);
    if (!existing || ep > existing.latestEp) map.set(a.mal_id, { latestEp: ep, row: a });
  }
  return map;
}

// Build the tile list: AniList 72h schedule ⨯ Supabase watchable sources,
// deduped by mal_id, newest first. Mirrors home.tsx's queryFn.
async function buildItems(limit = 30) {
  // AniList + Supabase are independent — fetch them together so worst-case
  // latency is the slower of the two, not their sum (function time limits).
  const [airedRes, watchableRes] = await Promise.allSettled([
    getRecentlyAired(72),
    getWatchableByMal(),
  ]);
  const aired = airedRes.status === 'fulfilled' ? airedRes.value : [];
  if (airedRes.status === 'rejected') {
    console.warn('[latest] AniList failed:', airedRes.reason?.message);
  }
  const watchable = watchableRes.status === 'fulfilled' ? watchableRes.value : null;
  if (watchableRes.status === 'rejected') {
    console.warn('[latest] Supabase failed:', watchableRes.reason?.message);
  }

  if (aired.length) {
    const seen  = new Set();
    const items = [];
    for (const item of aired) {
      const malId = item.media?.idMal;
      if (!malId || seen.has(malId)) continue;
      const entry = watchable ? watchable.get(malId) : { latestEp: item.episode, row: null };
      if (!entry) continue; // Supabase says we have no source — skip (same as home)
      seen.add(malId);

      const m = item.media;
      const a = entry.row;
      items.push({
        mal_id:   malId,
        title:    a?.title_english || a?.title_romaji || m.title?.english || m.title?.romaji || 'Unknown',
        score:    a?.score ?? (m.averageScore ? +(m.averageScore / 10).toFixed(1) : null),
        latestEp: entry.latestEp ?? item.episode,
        cover:    a?.cover_image || m.coverImage?.extraLarge || m.coverImage?.large || '',
        airingAt: item.airingAt,
      });
      if (items.length >= limit) break;
    }
    if (items.length) return items.sort((x, y) => (y.airingAt ?? 0) - (x.airingAt ?? 0));
  }

  // Fallback: AniList outage — same treatment as home.tsx. Recently-started
  // airing anime from Jikan so the hub is never a blank box. No episode
  // numbers here (tiles just omit that bit of meta).
  try {
    const r = await fetch('https://api.jikan.moe/v4/anime?status=airing&order_by=start_date&sort=desc&limit=15&sfw=true', {
      signal: AbortSignal.timeout(4000),
    });
    if (r.ok) {
      const json = await r.json();
      return (json.data || []).slice(0, limit).map(a => ({
        mal_id:   a.mal_id,
        title:    a.title_english || a.title,
        score:    a.score ?? null,
        latestEp: null,
        cover:    a.images?.webp?.large_image_url || a.images?.jpg?.large_image_url || '',
        airingAt: null,
      }));
    }
  } catch (err) {
    console.warn('[latest] Jikan fallback failed:', err.message);
  }
  return [];
}

// ── SPA assets ─────────────────────────────────────────────────────────
// Hashed /assets/*.js|css URLs change every build. Discover them from our
// own homepage (prerender refuses to overwrite dist/index.html, so it always
// carries the current build's tags). Daily cache-buster defeats a long-lived
// HTML cache sitting in front of us; 5-min module cache keeps invocations
// cheap. Any failure → shell-only page (main.tsx's dismissSeoShell handles
// "shell stays visible" gracefully — see its comment).
let assetCache = { at: 0, js: null, css: null };

async function appAssets() {
  if (Date.now() - assetCache.at < 5 * 60_000) return assetCache;
  try {
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const r   = await fetch(`${BASE}/?_=${day}`, { signal: AbortSignal.timeout(4000) });
    if (r.ok) {
      const html = await r.text();
      assetCache = {
        at:  Date.now(),
        js:  html.match(/<script type="module"[^>]*src="([^"]+)"/)?.[1]  || null,
        css: html.match(/<link rel="stylesheet"[^>]*href="([^"]+)"/)?.[1] || null,
      };
    } else {
      assetCache = { at: Date.now(), js: null, css: null };
    }
  } catch {
    assetCache = { at: Date.now(), js: null, css: null };
  }
  return assetCache;
}

// ── tiles + JSON-LD ────────────────────────────────────────────────────
function tile(it) {
  const img = it.cover || '';
  const bits = [
    it.latestEp ? `EP ${it.latestEp}` : null,
    it.airingAt ? ago(it.airingAt) : null,
    it.score ? `★ ${it.score}` : null,
  ].filter(Boolean).join(' · ');
  return `<li><a href="${esc(animePath(it.mal_id, it.title))}">`
    + (img ? `<img src="${esc(img)}" alt="${esc(it.title)} poster" loading="lazy" width="225" height="318">` : '')
    + `<b>${esc(it.title)}</b>${bits ? `<i>${esc(bits)}</i>` : ''}</a></li>`;
}

function itemSchemas(items) {
  const list = {
    '@context': 'https://schema.org', '@type': 'ItemList',
    numberOfItems: items.length,
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem', position: i + 1,
      name: it.latestEp ? `${it.title} — Episode ${it.latestEp}` : it.title,
      url: `${BASE}${animePath(it.mal_id, it.title)}`,
    })),
  };
  const crumbs = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE}/` },
      { '@type': 'ListItem', position: 2, name: 'Latest Anime Episodes', item: CANONICAL },
    ],
  };
  const page = {
    '@context': 'https://schema.org', '@type': 'CollectionPage',
    name: 'Latest Anime Episodes',
    url: CANONICAL,
    description: DESC,
    isPartOf: { '@type': 'WebSite', name: 'KamiStream', url: `${BASE}/` },
  };
  return [page, list, crumbs];
}

// ── document ───────────────────────────────────────────────────────────
function renderDoc(items, assets) {
  // Site-identity blocks verbatim from index.html (prerender patches those
  // same blocks into every page — keep them byte-identical).
  const siteSchemas = [
    {
      '@context': 'https://schema.org', '@type': 'WebSite',
      name: 'KamiStream', url: `${BASE}`,
      description: 'Free anime streaming — sub & dub, HD quality',
      publisher: { '@id': `${BASE}/#organization` },
      potentialAction: {
        '@type': 'SearchAction',
        target: { '@type': 'EntryPoint', urlTemplate: `${BASE}/search?q={search_term_string}` },
        'query-input': 'required name=search_term_string',
      },
    },
    {
      '@context': 'https://schema.org', '@type': 'Organization',
      '@id': `${BASE}/#organization`,
      name: 'KamiStream', url: `${BASE}`,
      logo: { '@type': 'ImageObject', url: `${BASE}/icons/icon-512.png`, width: 512, height: 512, caption: 'KamiStream' },
    },
    {
      '@context': 'https://schema.org', '@type': 'ImageObject',
      url: `${BASE}/opengraph.jpg`, contentUrl: `${BASE}/opengraph.jpg`, width: 1200, height: 630,
    },
  ];
  const jsonLd = [...siteSchemas, ...itemSchemas(items)]
    .map(o => `<script type="application/ld+json">${toJson(o)}</script>`).join('\n    ');

  const grid = items.length
    ? `<h2 class="ks-h2">Newly released episodes</h2><ul class="ks-grid">${items.map(tile).join('')}</ul>`
    : `<p class="ks-p">No episodes found in the last 72 hours — check the `
      + `<a href="/schedule">weekly schedule</a> or browse <a href="/browse">all anime</a>.</p>`;

  const body = [
    shellOpen(),
    renderCrumbs([['Home', '/'], ['Latest Anime Episodes', null]]),
    `<h1 class="ks-h1">Latest Anime Episodes</h1>`,
    // Intro MUST MATCH src/pages/latest-episodes.tsx — Google compares the
    // server HTML with the JS-rendered result.
    `<p class="ks-p">Every anime episode released in the last 72 hours, newest first — `
      + `updated automatically throughout the day. Sub &amp; dub, free in HD.</p>`,
    `<p class="ks-p">Looking for what's on today? See the <a href="/schedule">weekly schedule</a>, `
      + `browse <a href="/category/this-season">this season's anime</a>, or explore everything `
      + `on the <a href="/browse">browse</a> page.</p>`,
    grid,
    shellClose(),
  ].join('\n    ');

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />

    <!-- Primary SEO -->
    <title>${esc(TITLE)}</title>
    <meta name="description" content="${esc(DESC)}" />
    <meta name="keywords" content="${esc(KEYWORDS)}" />
    <meta name="robots" content="${ROBOTS}" />
    <meta name="theme-color" content="#ff006e" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="KamiStream" />

    <!-- Canonical -->
    <link rel="canonical" href="${CANONICAL}" />

    <!-- Open Graph -->
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="KamiStream" />
    <meta property="og:title" content="${esc(TITLE)}" />
    <meta property="og:description" content="${esc(DESC)}" />
    <meta property="og:image" content="${BASE}/opengraph.jpg" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:url" content="${CANONICAL}" />
    <meta property="og:locale" content="en_US" />

    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(TITLE)}" />
    <meta name="twitter:description" content="${esc(DESC)}" />
    <meta name="twitter:image" content="${BASE}/opengraph.jpg" />

    <!-- PWA + icons (same set as index.html) -->
    <link rel="manifest" href="/manifest.json" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png" />
    <link rel="icon" type="image/png" sizes="512x512" href="/icons/icon-512.png" />
    <link rel="icon" href="/favicon.ico" sizes="32x32" />
    <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />

    <!-- Ad CDN preconnect — same as index.html -->
    <link rel="preconnect" href="https://quge5.com" crossorigin="anonymous" />
    <link rel="preconnect" href="https://al5sm.com" crossorigin="anonymous" />
    <link rel="preconnect" href="https://nap5k.com" crossorigin="anonymous" />
    <link rel="preconnect" href="https://n6wxm.com" crossorigin="anonymous" />
    <link rel="preconnect" href="https://www.highperformanceformat.com" crossorigin="anonymous" />
    <link rel="dns-prefetch" href="https://pl30707075.effectivecpumetwork.com" />
    <link rel="dns-prefetch" href="https://pl30707076.effectivecpumetwork.com" />

    <!-- Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />

    <!-- API preconnects -->
    <link rel="preconnect" href="https://api.jikan.moe" crossorigin="anonymous" />
    <link rel="dns-prefetch" href="https://graphql.anilist.co" />

    <!-- Sitemap hint -->
    <link rel="sitemap" type="application/xml" href="/sitemap-index.xml" />

    ${assets.css ? `<link rel="stylesheet" href="${esc(assets.css)}" />` : ''}
    ${jsonLd}
  </head>
  <body>
    ${body}
    <div id="root"></div>
    <script src="/ads.js"></script>
    ${assets.js ? `<script type="module" src="${esc(assets.js)}"></script>` : ''}
  </body>
</html>`;
}

// ── handler ────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // Never 500 an SEO landing page over a transient API hiccup: buildItems
  // degrades internally (AniList → Supabase → Jikan → empty-state copy) and
  // the shell/nav/footer render regardless. Data and asset discovery are
  // independent — run them in parallel so worst-case latency is their max,
  // not their sum.
  const [items, assets] = await Promise.all([
    buildItems(30).catch(err => {
      console.warn('[latest] buildItems failed:', err.message);
      return [];
    }),
    appAssets().catch(() => ({ js: null, css: null })),
  ]);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', CACHE_CONTROL);
  res.status(200).send(renderDoc(items, assets));
}