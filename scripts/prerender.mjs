/* ═══════════════════════════════════════════════════════════════════
 * Build-time prerenderer —  node scripts/prerender.mjs
 * Runs automatically as part of `npm run build`.
 *
 * ── WHY ────────────────────────────────────────────────────────────
 * KamiStream is a client-rendered SPA, so every URL served the same
 * empty shell. Measured on the live site before this script existed:
 *     content inside <div id="root"> : 0 bytes
 *     crawlable <a href> in the HTML : 0
 *     <title> / <link rel=canonical> : the HOMEPAGE's, on every route
 * Google renders JS, so it eventually saw the real page — but Bing,
 * Yandex, DuckDuckGo and every link-preview bot (Discord, WhatsApp, X,
 * Facebook, Reddit, Telegram) do NOT run JS. They saw 10,000 identical
 * copies of the homepage, and every shared link previewed as the
 * homepage instead of "Watch <anime> Online".
 *
 * ── WHAT ───────────────────────────────────────────────────────────
 * After `vite build`, generate a real HTML document per high-value route
 * with the correct <title>, description, canonical, Open Graph, Twitter
 * card and JSON-LD, plus a visible content block (#seo-shell) containing
 * headings, synopsis and genuine <a href> links. main.tsx fades the shell
 * out once React has painted, so humans get instant content instead of a
 * blank white screen (this also fixes LCP / Core Web Vitals).
 *
 * It also emits /sitemap-anime.xml from the very same pool of titles (see
 * writeSitemapAnime), replacing a runtime API function that listed only 50 of
 * the 199 pages and could fail mid-crawl.
 *
 * ── ROUTES WRITTEN ─────────────────────────────────────────────────
 *   9   hub / static pages      (/browse, /schedule, /az-list, /mood,
 *                                /hidden-gems, /about, /dmca, /terms, /contact)
 *   8   category listings       (/category/:slug)
 *   58  genre hubs              (/genre/:id)
 *   199 anime detail pages      (/anime/:id/:slug)
 *   199 "anime like X" pages    (/anime-like/:id/:slug)
 *   1   year hub                (/best-anime)
 *   N   "best of year" pages    (/best-anime/:year) — one per year in
 *                                [YEAR_START … build year] that returned
 *                                at least MIN_TITLES_FOR_YEAR titles
 *   ---
 *   473 + (1 + N) documents (each written in both file shapes)
 *
 * ── "ANIME LIKE X" PAGES ───────────────────────────────────────────
 * "anime like <title>" is a high-intent query nothing on the site used to
 * answer, and these pages are deliberately built from facts rather than
 * filler: src/lib/animeLike.js scores every candidate on the genres, studio,
 * format, era and score band it genuinely shares with the source, and
 * whySimilar() then states those facts in words. That is what makes each
 * page's text unique instead of another copy of the same MAL synopsis.
 *
 * The engine is imported straight out of src/ (it is plain .js for exactly
 * this reason) and is the same code src/pages/anime-like.tsx runs, so the
 * crawlable HTML and the React page cannot drift apart. Titles with fewer
 * than MIN_MATCHES_FOR_PAGE real matches get no page at all — a thin page
 * published only to add a URL is worse than no page.
 *
 * IMPORTANT — no cloaking: every fact in the shell (title, synopsis,
 * score, episodes, status, studios, genres, related-anime links) is also
 * rendered by the React page itself. We deliberately do NOT invent copy
 * (FAQs, reviews, intros) that only crawlers would ever see.
 *
 * ── HOW IT'S SERVED ────────────────────────────────────────────────
 * Vercel's CDN evaluates routing in this order: … → Headers+Redirects →
 * Middleware → File System Routes → Rewrites. The filesystem is checked
 * BEFORE rewrites, so dist/<route>.html (and dist/<route>/index.html) wins
 * and the existing `"/(.*)" → "/index.html"` SPA fallback keeps handling
 * every other path (client-only routes, anime outside the prerendered set,
 * /watch/... pages). Both file shapes are written because that resolution
 * order is the one thing we cannot test locally — whichever shape Vercel
 * prefers, it finds a file, and both carry the same canonical.
 *
 * ⚠ DO NOT add `"cleanUrls": true` to vercel.json. This was tried and it
 * BREAKS the site: with clean URLs on, the SPA fallback destination
 * `/index.html` stops resolving, so the catch-all rewrite dies and every
 * non-prerendered route (/profile, /anime/<id-not-in-pool>, /watch/...) 
 * returns 404 instead of 200. Verified live before being reverted.
 * cleanUrls also buys nothing here: /browse already resolves to the static
 * file dist/browse.html during the filesystem step.
 *
 * ── DATA SOURCE ────────────────────────────────────────────────────
 * Jikan v4 — the same API the app and the sitemaps already use. Jikan
 * allows ~3 req/sec, so every call goes through a paced gate with retry
 * (a partially prerendered site beats a failed build).
 * ═══════════════════════════════════════════════════════════════════ */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';

// ── "Anime like X" similarity engine ─────────────────────────────────
// Imported from src/ rather than reimplemented here: src/pages/anime-like.tsx
// imports the very same file, so the crawlable shell and the React page can
// never disagree about which titles are similar or why. That is the whole
// reason the engine is plain .js instead of .ts.
import {
  similarAnime, likeIntro, likeTitle, likeDescription, likeHeading,
  comparisonRows, topSharedGenres, titleOf, scoreOf, MIN_MATCHES_FOR_PAGE,
} from '../src/lib/animeLike.js';

// ── "Best Anime of {year}" engine ────────────────────────────────────
// Same arrangement as above: imported from src/ so the crawlable year pages
// and src/pages/best-anime.tsx cannot disagree about which titles a year
// ranks, how they are worded, or which genre chips they carry.
import {
  yearList, yearTitle, yearDescription, yearIntro, yearGenres,
  yearNeighbors, rankedRows, yearRange, hubHeading, hubTitle,
  hubDescription, MIN_TITLES_FOR_YEAR, YEAR_PAGE_SIZE, YEAR_START,
} from '../src/lib/bestOfYear.js';

const BASE      = 'https://www.kamistream.fun';
const JIKAN     = 'https://api.jikan.moe/v4';
const DIST      = path.join(process.cwd(), 'dist');
const SHELL_SRC = path.join(DIST, 'index.html');

/** How many /top/anime pages to pull (25 each). 8 pages = the top 200. */
const TOP_PAGES = 8;

/** id → genre name. Must mirror GENRES in src/pages/genre.tsx */
const GENRES = {
  '1': 'Action', '2': 'Adventure', '4': 'Comedy', '7': 'Mystery', '8': 'Drama',
  '9': 'Ecchi', '10': 'Fantasy', '13': 'Historical', '14': 'Horror', '17': 'Martial Arts',
  '18': 'Mecha', '19': 'Music', '22': 'Romance', '23': 'School', '24': 'Sci-Fi',
  '25': 'Shoujo', '27': 'Shounen', '29': 'Space', '30': 'Sports', '36': 'Slice of Life',
  '37': 'Supernatural', '38': 'Military', '40': 'Psychological', '41': 'Thriller', '42': 'Seinen',
  '43': 'Josei', '46': 'Award Winning', '47': 'Gourmet', '50': 'Adult Cast', '55': 'Delinquents',
  '56': 'Detective', '57': 'Educational', '60': 'Gore', '61': 'Harem', '62': 'High Stakes Game',
  '65': 'Idols (Male)', '66': 'Isekai', '67': 'Iyashikei', '70': 'Mahou Shoujo', '71': 'Medical',
  '72': 'Mythology', '74': 'Otaku Culture', '75': 'Parody', '77': 'Pets', '78': 'Racing',
  '79': 'Reincarnation', '82': 'Samurai', '83': 'Showbiz', '84': 'Strategy Game', '85': 'Super Power',
  '86': 'Survival', '87': 'Team Sports', '88': 'Time Travel', '89': 'Vampire', '91': 'Villainess',
  '93': 'Witchcraft', '94': 'Yaoi', '95': 'Yuri',
};

/** Must mirror CATEGORIES + CATEGORY_ORDER in src/pages/category.tsx */
const CATEGORIES = [
  { slug: 'trending',       label: 'Trending Now',   desc: "What's hot right now — the top airing anime this week" },
  { slug: 'new-release',    label: 'New Release',    desc: 'Currently airing anime sorted by popularity' },
  { slug: 'new-added',      label: 'New Added',      desc: 'Recently started anime — fresh new seasons and debuts' },
  { slug: 'just-completed', label: 'Just Completed', desc: 'Anime that recently finished airing' },
  { slug: 'top-rated',      label: 'Top Rated',      desc: 'Highest rated anime of all time' },
  { slug: 'this-season',    label: 'This Season',    desc: 'Anime airing in the current season' },
  { slug: 'top-anime',      label: 'Top Anime',      desc: 'All-time top anime ranked by score' },
  { slug: 'upcoming',       label: 'Upcoming Anime', desc: "Anime that haven't started airing yet" },
];

// ── helpers ──────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** HTML-escape for both text nodes and attribute values. */
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

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

/** Same URL shape as animePath() in src/lib/seo.ts. */
function animePath(malId, title) {
  const s = slugifyTitle(title);
  return s ? `/anime/${malId}/${s}` : `/anime/${malId}`;
}

/** Same URL shape as animeLikePath() in src/lib/seo.ts. */
function animeLikePath(malId, title) {
  const s = slugifyTitle(title);
  return s ? `/anime-like/${malId}/${s}` : `/anime-like/${malId}`;
}

/** Same URL shape as bestOfYearPath() in src/lib/seo.ts. */
function bestOfYearPath(year) {
  const y = Number(year);
  if (!Number.isInteger(y) || y < 1900 || y > 2999) return '/best-anime';
  return `/best-anime/${y}`;
}

/** Trim to `max` chars on a word boundary (for meta descriptions). */
function clamp(text, max = 158) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const sp  = cut.lastIndexOf(' ');
  return (sp > 60 ? cut.slice(0, sp) : cut).replace(/[,;:.\-]$/, '') + '…';
}

/** Best landscape image for OG/Twitter cards (16:9), poster as fallback. */
function heroImage(anime) {
  return anime?.trailer?.images?.maximum_image_url
      || anime?.images?.webp?.large_image_url
      || anime?.images?.jpg?.large_image_url
      || `${BASE}/opengraph.jpg`;
}

let warnCount = 0;
function warn(msg) { warnCount++; console.warn(msg); }

// ── Jikan client: paced, timed out, circuit-broken ───────────────────
// Jikan allows ~3 requests/sec and its SEARCH endpoints are routinely
// 504-ing under load (verified during this build: /anime?genres=1 returned
// 504 while /top/anime responded fine). A deploy must never hang or fail
// because of that, so every request is paced, hard-timed-out, retried
// twice, and once CONSECUTIVE_FAIL_LIMIT failures pile up the circuit
// opens and all remaining fetches are skipped.
const REQUEST_TIMEOUT_MS    = 12000;
const CONSECUTIVE_FAIL_LIMIT = 3;
/** Hard ceiling for the whole data-gathering phase. */
const FETCH_DEADLINE_MS     = 120000;

const BUILD_START = Date.now();

/** Thrown when we stop trusting the API — callers treat it as "skip". */
class CircuitOpen extends Error {}

let lastCallAt = 0;
let consecutiveFails = 0;

async function jikan(pathname, attempt = 1) {
  if (consecutiveFails >= CONSECUTIVE_FAIL_LIMIT) throw new CircuitOpen('circuit open — Jikan unavailable');
  if (Date.now() - BUILD_START > FETCH_DEADLINE_MS) throw new CircuitOpen('data fetch deadline exceeded');

  const gap = 360 - (Date.now() - lastCallAt);
  if (gap > 0) await sleep(gap);
  lastCallAt = Date.now();

  try {
    const res = await fetch(`${JIKAN}${pathname}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'KamiStreamPrerender/1.0' },
      // Without this a single stalled socket would hang the whole deploy.
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (res.status === 429 || res.status === 503 || res.status === 504) {
      if (attempt <= 2) { await sleep(900 * attempt); return jikan(pathname, attempt + 1); }
      throw new Error(`Jikan unavailable (${res.status})`);
    }
    if (!res.ok) throw new Error(`Jikan HTTP ${res.status}`);
    const json = await res.json();
    // Jikan can also answer 200 with an error envelope, e.g.
    // {"status":504,"type":"BadResponseException",...} — never treat that
    // as a success or the circuit breaker would never trip.
    if (json?.status && json.status >= 400) throw new Error(`Jikan ${json.status} (${json.type || 'error'})`);
    consecutiveFails = 0;
    return json;
  } catch (err) {
    if (err instanceof CircuitOpen) throw err;
    if (attempt <= 2) { await sleep(700 * attempt); return jikan(pathname, attempt + 1); }
    consecutiveFails++;
    throw err;
  }
}

/** Top anime — the single data source for every prerendered page. */
async function collectTopAnime() {
  const out  = [];
  const seen = new Set();
  for (let page = 1; page <= TOP_PAGES; page++) {
    try {
      const json = await jikan(`/top/anime?limit=25&page=${page}`);
      for (const a of json?.data ?? []) {
        if (!a?.mal_id || seen.has(a.mal_id)) continue;
        seen.add(a.mal_id);
        out.push(a);
      }
    } catch (err) {
      if (err instanceof CircuitOpen) {
        warn(`  ! stopping early (${err.message}) with ${out.length} anime collected`);
        break;
      }
      warn(`  ! top/anime page ${page} failed (${err.message}) — continuing`);
    }
  }
  return out;
}

// ── AniList fallback ─────────────────────────────────────────────────
// Jikan is not dependable enough to be a build dependency: while developing
// this, /top/anime began returning 504 on EVERY page for minutes at a time.
// src/lib/jikanFetch.ts already falls back to AniList at runtime, so the
// prerenderer does the same and emits the SAME normalized (Jikan-shaped)
// objects, meaning every downstream builder is source-agnostic.

const ANILIST = 'https://graphql.anilist.co';

/** AniList's fixed genre list maps 1:1 onto our MAL genre names. */
const GENRE_ID_BY_NAME = (() => {
  const map = new Map();
  for (const [id, name] of Object.entries(GENRES)) map.set(name.toLowerCase(), id);
  return map;
})();

const STATUS_BY_ANILIST = {
  RELEASING: 'Currently Airing',
  FINISHED:  'Finished Airing',
  NOT_YET_RELEASED: 'Not yet aired',
};

const FORMAT_BY_ANILIST = {
  TV: 'TV', TV_SHORT: 'TV Short', MOVIE: 'Movie', SPECIAL: 'Special',
  OVA: 'OVA', ONA: 'ONA', MUSIC: 'Music',
};

function decodeEntities(s) {
  return s
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–').replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

/** AniList descriptions are HTML; the site shows plain text. */
const stripHtml = s => decodeEntities(
  String(s || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '')
).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDate = d => (d?.year ? `${MONTHS[(d.month ?? 1) - 1]} ${d.day ?? 1}, ${d.year}` : null);

/** AniList media node → the Jikan shape every builder already expects. */
function fromAniList(m) {
  if (!m?.idMal) return null;                       // URLs are MAL-id based
  const title   = m.title?.english || m.title?.romaji || m.title?.native;
  if (!title) return null;
  const cover   = m.coverImage?.extraLarge || m.coverImage?.large;
  const start   = fmtDate(m.startDate);
  const end     = fmtDate(m.endDate);

  return {
    mal_id:  m.idMal,
    title,
    title_english: m.title?.english || null,
    synopsis: m.description ? stripHtml(m.description) : null,
    images: {
      webp: { large_image_url: cover, image_url: m.coverImage?.large },
      jpg:  { large_image_url: cover, image_url: m.coverImage?.large },
    },
    trailer: { images: { maximum_image_url: m.trailer?.thumbnail || null } },
    genres: (m.genres ?? [])
      .map(name => ({ mal_id: GENRE_ID_BY_NAME.get(name.toLowerCase()), name }))
      .filter(g => g.mal_id),
    studios: (m.studios?.nodes ?? []).map(s => ({ name: s.name })),
    score:       m.averageScore ? Math.round(m.averageScore) / 10 : null,
    episodes:    m.episodes ?? null,
    status:      STATUS_BY_ANILIST[m.status] ?? null,
    type:        FORMAT_BY_ANILIST[m.format] ?? null,
    season:      m.season ? m.season.toLowerCase() : null,
    year:        m.seasonYear ?? null,
    rank:        null,
    aired:       start ? { from: null, string: end ? `${start} to ${end}` : `${start} to ?` } : null,
  };
}

/** Fetch up to `want` top anime from AniList (50 per request, 4 for 200). */
async function collectAniListPool(want) {
  const out = [];
  const perPage = 50;
  const pages = Math.ceil(want / perPage);
  const query = `query($page:Int,$perPage:Int){
    Page(page:$page,perPage:$perPage){
      media(type:ANIME,sort:SCORE_DESC,isAdult:false){
        idMal format episodes status season seasonYear averageScore genres
        title{ romaji english native }
        description(asHtml:false)
        coverImage{ extraLarge large }
        trailer{ id site thumbnail }
        studios(isMain:true){ nodes{ name } }
        startDate{ year month day } endDate{ year month day }
      }
    }
  }`;

  for (let page = 1; page <= pages; page++) {
    try {
      const res = await fetch(ANILIST, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query, variables: { page, perPage } }),
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.errors?.length) throw new Error(json.errors[0].message);
      for (const m of json?.data?.Page?.media ?? []) {
        const norm = fromAniList(m);
        if (norm) out.push(norm);
      }
    } catch (err) {
      warn(`  ! AniList page ${page} failed (${err.message}) — continuing`);
    }
    if (page < pages) await sleep(700);            // AniList allows ~90 req/min
  }
  return out;
}
/**
 * The pool every prerendered page is built from. Jikan goes first because
 * its synopses are the exact text the app renders; AniList tops the pool up
 * whenever Jikan comes up short, which today is the norm rather than the
 * exception. Either source alone is enough to produce a full site.
 */
const POOL_TARGET = TOP_PAGES * 25;   // 200

async function collectPool() {
  let pool = [];
  try {
    pool = await collectTopAnime();
  } catch (err) {
    warn(`  ! Jikan pool unavailable (${err.message})`);
  }
  console.log(`  · Jikan: ${pool.length} titles`);

  if (pool.length < POOL_TARGET) {
    const seen  = new Set(pool.map(a => a.mal_id));
    const extra = await collectAniListPool(POOL_TARGET - pool.length);
    let added = 0;
    for (const a of extra) {
      if (pool.length >= POOL_TARGET) break;
      if (seen.has(a.mal_id)) continue;
      seen.add(a.mal_id);
      pool.push(a);
      added++;
    }
    console.log(`  · AniList: +${added} titles (pool now ${pool.length})`);
  }
  return pool.slice(0, POOL_TARGET);
}


// ── Derived listings ─────────────────────────────────────────────────
// We deliberately make NO per-genre / per-category API calls. Jikan's
// search endpoints are the unreliable ones, and 65 calls per deploy would
// make every build slow and failure-prone. Instead each listing is derived
// from the top-anime pool we already hold: every title genuinely belongs to
// the listing, so the grid is an honest preview of the topic's own page.
const LIST_LIMIT = 24;

function deriveGenreLists(pool) {
  const map = new Map();
  for (const id of Object.keys(GENRES)) {
    map.set(id, pool
      .filter(a => (a.genres ?? []).some(g => String(g.mal_id) === id))
      .slice(0, LIST_LIMIT));
  }
  return map;
}

function deriveCategoryLists(pool) {
  const { season, year } = currentSeason();
  const cap = list => list.slice(0, LIST_LIMIT);

  const airing     = pool.filter(a => a.status === 'Currently Airing');
  const finished   = pool.filter(a => a.status === 'Finished Airing');
  const upcoming   = pool.filter(a => a.status === 'Not yet aired');
  const byScore    = [...pool].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const thisSeason = pool.filter(a =>
    a.year === year && String(a.season || '').toLowerCase() === season);

  return new Map([
    ['trending',       cap(airing)],
    ['new-release',    cap(airing)],
    ['new-added',      cap(airing)],
    ['just-completed', cap(finished)],
    ['top-rated',      cap(byScore)],
    ['this-season',    cap(thisSeason)],
    ['top-anime',      cap(byScore.filter(a => a.type === 'TV'))],
    ['upcoming',       cap(upcoming)],
  ]);
}

/** Currently airing titles — used by the schedule page shell. */
const deriveAiring = pool =>
  pool.filter(a => a.status === 'Currently Airing').slice(0, LIST_LIMIT);



// ── Shell markup ─────────────────────────────────────────────────────
// Self-contained styles so the shell paints instantly without waiting for
// the Tailwind bundle. position:fixed keeps it OUT of normal flow, so
// removing it once React mounts causes no layout shift (CLS stays ~0).
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
  '.ks-chips a{display:inline-block;background:#131316;border:1px solid rgba(255,255,255,.08);border-radius:999px;',
  'padding:4px 11px;font-size:11.5px;font-weight:800;color:#c8c8d8;text-decoration:none}',
  '.ks-chips a:hover{border-color:#a742ff;color:#fff}',
  '.ks-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:12px;list-style:none;padding:0;margin:0}',
  '.ks-grid a{display:block;text-decoration:none;color:#fff}',
  '.ks-grid img{width:100%;aspect-ratio:2/3;object-fit:cover;border-radius:10px;background:#17171b;display:block}',
  '.ks-grid b{display:-webkit-box;font-size:12px;font-weight:700;margin-top:6px;line-height:1.35;',
  'overflow:hidden;-webkit-line-clamp:2;-webkit-box-orient:vertical}',
  '.ks-grid i{display:block;font-size:10.5px;color:#7a7a8c;font-style:normal;margin-top:2px}',
  // "Anime like X" additions: a reasons line under each tile, the reasons
  // list, and the side-by-side comparison table.
  '.ks-grid em{display:block;font-size:10.5px;color:#9d8fb8;font-style:normal;margin-top:3px;line-height:1.35}',
  '.ks-why{list-style:none;padding:0;margin:10px 0 0;font-size:13.5px;color:#c8c8d8}',
  '.ks-why li{margin-bottom:5px;padding-left:16px;position:relative}',
  '.ks-why li:before{content:"\\2022";color:#a742ff;font-weight:900;position:absolute;left:0}',
  '.ks-table{width:100%;border-collapse:collapse;font-size:13px;margin:8px 0 6px;background:#0f0f12;',
  'border:1px solid rgba(255,255,255,.08);border-radius:10px;overflow:hidden}',
  '.ks-table th,.ks-table td{text-align:left;padding:8px 11px;border-top:1px solid rgba(255,255,255,.07)}',
  '.ks-table thead th{border-top:0;color:#7a7a8c;font-size:10.5px;text-transform:uppercase;letter-spacing:.05em}',
  '.ks-table tbody th{color:#7a7a8c;font-weight:700;white-space:nowrap}',
  '.ks-table td{color:#c8c8d8}',
  '.ks-foot{margin-top:36px;padding-top:18px;border-top:1px solid rgba(255,255,255,.08);font-size:12.5px;color:#7a7a8c}',
  '.ks-foot a{color:#c8c8d8;text-decoration:none;margin-right:14px;display:inline-block;margin-bottom:6px}',
  '.ks-foot a:hover{color:#fff}',
  '@media(max-width:640px){h1.ks-h1{font-size:21px}.ks-poster{width:130px}',
  '.ks-grid{grid-template-columns:repeat(auto-fill,minmax(98px,1fr));gap:9px}}',
].join('');

const NAV_LINKS = [
  ['/browse', 'Browse'], ['/category/top-rated', 'Top Rated'], ['/category/trending', 'Trending'],
  ['/schedule', 'Schedule'], ['/latest-episodes', 'Latest Episodes'], ['/az-list', 'A–Z List'], ['/hidden-gems', 'Hidden Gems'],
  // Keyword links, mirrored from the React topbar — see TOP_NAV in
  // src/components/Topbar.tsx. Crawlable sitewide header nav.
  ['/genre/1', 'Action Anime'], ['/genre/22', 'Romance Anime'],
  ['/genre/66', 'Isekai Anime'], ['/best-anime', 'Best by Year'],
];

const FOOTER_LINKS = [
  ['/browse', 'All Anime'], ['/latest-episodes', 'Latest Episodes'], ['/category/top-anime', 'Top Anime'], ['/category/this-season', 'This Season'],
  ['/category/upcoming', 'Upcoming'], ['/genre/1', 'Action Anime'], ['/genre/22', 'Romance Anime'],
  ['/genre/4', 'Comedy Anime'], ['/genre/10', 'Fantasy Anime'], ['/genre/37', 'Supernatural Anime'],
  ['/genre/66', 'Isekai Anime'], ['/best-anime', 'Best Anime by Year'], ['/mood', 'Anime by Mood'],
  ['/about', 'About KamiStream'], ['/dmca', 'DMCA'], ['/contact', 'Contact'],
];

function renderCrumbs(items) {
  return '<nav class="ks-crumbs">' + items.map(([label, href], i) =>
    (i ? ' › ' : '') + (href
      ? `<a href="${esc(href)}">${esc(label)}</a>`
      : `<span>${esc(label)}</span>`)
  ).join('') + '</nav>';
}

function renderTile(a) {
  const img  = a.images?.jpg?.image_url || a.images?.webp?.image_url || '';
  const bits = [a.type, a.episodes ? `${a.episodes} ep` : null, a.score ? `★ ${a.score}` : null]
    .filter(Boolean).join(' · ');
  return `<li><a href="${esc(animePath(a.mal_id, a.title))}">`
    + (img ? `<img src="${esc(img)}" alt="${esc(a.title)} poster" loading="lazy" width="225" height="318">` : '')
    + `<b>${esc(a.title)}</b><i>${esc(bits)}</i></a></li>`;
}

function renderGrid(list, heading) {
  const items = (list ?? []).filter(a => a?.mal_id);
  if (!items.length) return '';
  return `<h2 class="ks-h2">${esc(heading)}</h2><ul class="ks-grid">${items.map(renderTile).join('')}</ul>`;
}

const shellOpen = () => '<div id="seo-shell"><style>' + SHELL_CSS + '</style><div class="ks-wrap">'
  + '<header class="ks-top"><a class="ks-brand" href="/">KamiStream</a><nav>'
  + NAV_LINKS.map(([h, l]) => `<a href="${h}">${l}</a>`).join('') + '</nav></header>';

const shellClose = () => '<footer class="ks-foot">'
  + FOOTER_LINKS.map(([h, l]) => `<a href="${h}">${l}</a>`).join('')
  + '</footer></div></div>';


// ── Document assembly ────────────────────────────────────────────────
// We patch the REAL dist/index.html that vite just emitted rather than
// rebuilding the head from scratch, so the hashed asset URLs, PWA tags,
// preconnects and site-identity JSON-LD stay in sync automatically.
// Every patch asserts that its target was found: a future index.html edit
// fails the build loudly instead of silently shipping homepage canonicals.
const ROBOTS_INDEX = 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';

function patch(html, re, replacement, label) {
  if (!re.test(html)) {
    throw new Error(
      `prerender: could not find "${label}" in dist/index.html.\n` +
      `The HTML template changed — update the matching rule in scripts/prerender.mjs.`
    );
  }
  return html.replace(re, () => replacement);
}

const metaNameRe = key => new RegExp(`<meta name="${key}" content="[^"]*"\\s*/?>`);
const metaPropRe = key => new RegExp(`<meta property="${key}" content="[^"]*"\\s*/?>`);

function buildDocument(shellHtml, meta) {
  let html = SHELL_TEMPLATE;

  html = patch(html, /<title>[\s\S]*?<\/title>/, `<title>${esc(meta.title)}</title>`, '<title>');
  html = patch(html, metaNameRe('description'),
    `<meta name="description" content="${esc(meta.description)}" />`, 'meta description');
  html = patch(html, metaNameRe('keywords'),
    `<meta name="keywords" content="${esc(meta.keywords)}" />`, 'meta keywords');
  html = patch(html, metaNameRe('robots'),
    `<meta name="robots" content="${ROBOTS_INDEX}" />`, 'meta robots');
  html = patch(html, /<link rel="canonical" href="[^"]*"\s*\/?>/,
    `<link rel="canonical" href="${esc(meta.canonical)}" />`, 'canonical');

  html = patch(html, metaPropRe('og:type'),
    `<meta property="og:type" content="${meta.ogType}" />`, 'og:type');
  html = patch(html, metaPropRe('og:title'),
    `<meta property="og:title" content="${esc(meta.title)}" />`, 'og:title');
  html = patch(html, metaPropRe('og:description'),
    `<meta property="og:description" content="${esc(meta.description)}" />`, 'og:description');
  html = patch(html, metaPropRe('og:image'),
    `<meta property="og:image" content="${esc(meta.image)}" />`, 'og:image');
  html = patch(html, metaPropRe('og:url'),
    `<meta property="og:url" content="${esc(meta.canonical)}" />`, 'og:url');

  // The default OG image is 1200x630; anime pages may use a 1280x720
  // YouTube trailer frame or a portrait poster — drop the stale dimensions
  // unless we know the real ones, otherwise scrapers crop badly.
  if (meta.imageWidth) {
    html = patch(html, metaPropRe('og:image:width'),
      `<meta property="og:image:width" content="${meta.imageWidth}" />`, 'og:image:width');
    html = patch(html, metaPropRe('og:image:height'),
      `<meta property="og:image:height" content="${meta.imageHeight}" />`, 'og:image:height');
  } else {
    // Leave no blank lines behind when we drop the structural 1200x630 box.
    html = html.replace(
      /[ \t]*<meta property="og:image:(?:width|height)" content="[^"]*"\s*\/?>[ \t]*\r?\n?/g, '');
  }

  html = patch(html, metaNameRe('twitter:title'),
    `<meta name="twitter:title" content="${esc(meta.title)}" />`, 'twitter:title');
  html = patch(html, metaNameRe('twitter:description'),
    `<meta name="twitter:description" content="${esc(meta.description)}" />`, 'twitter:description');
  html = patch(html, metaNameRe('twitter:image'),
    `<meta name="twitter:image" content="${esc(meta.image)}" />`, 'twitter:image');

  const blocks = (meta.jsonLd ?? []).map(o => `<script type="application/ld+json">${toJson(o)}</script>`);
  if (blocks.length) html = patch(html, /<\/head>/, `    ${blocks.join('\n    ')}\n  </head>`, '</head>');

  // #seo-shell sits BEFORE #root so it is the first thing painted.
  html = patch(html, /<body>/, `<body>\n    ${shellHtml}`, '<body>');
  return html;
}

// ── Writers ──────────────────────────────────────────────────────────
let written = 0;
function writeRoute(routePath, doc) {
  if (routePath === '/') {
    throw new Error('prerender: refusing to write "/" — dist/index.html doubles as the SPA fallback.');
  }
  const rel = routePath.replace(/^\//, '');

  // Write BOTH shapes so resolution is unambiguous no matter how the
  // deployment maps clean URLs to files:
  //   dist/browse/index.html  → directory index
  //   dist/browse.html        → extension-stripped file
  // Both hold the identical document with an identical canonical, so even if
  // both are reachable there is no duplicate-content risk.
  // Vercel checks the filesystem BEFORE applying vercel.json rewrites, so
  // these win over the `"/(.*)" → "/index.html"` SPA fallback.
  mkdirSync(path.join(DIST, rel), { recursive: true });
  writeFileSync(path.join(DIST, rel, 'index.html'), doc, 'utf8');
  writeFileSync(path.join(DIST, `${rel}.html`), doc, 'utf8');
  written++;
}

// ── Sitemap ──────────────────────────────────────────────────────────
// /sitemap-anime.xml is written HERE, at build time, from the same pool and
// the same animePath() that just wrote the detail pages — so the sitemap can
// never list a URL that was not prerendered, nor omit one that was.
//
// Previously this file came from api/sitemap-anime.js, which had two real
// problems:
//   • It listed only 50 URLs. It walked Jikan pages 1-4 and let a single
//     failed page drop 25 titles, so a partial Jikan outage silently shrank
//     the sitemap that Search Console was reading.
//   • It was a runtime function, so every single fetch could 500 or serve a
//     stale-to-24h list, and it burned a serverless invocation per crawl.
// A static file is also served INSTEAD of the rewrite, because Vercel checks
// the filesystem before applying rewrites (same reason the prerendered HTML
// wins over the SPA fallback). The `/api/sitemap-anime` rewrite is left in
// place as a fallback for the "no anime written" case below.
function writeSitemapAnime(anime, likeAnime = [], yearPages = []) {
  const today = new Date().toISOString().slice(0, 10);

  // aired.to is the last air date we hold, which is the honest lastmod for a
  // finished show. Jikan can also return null or a malformed value.
  const lastmodOf = a => {
    const airedTo = a?.aired?.to ? String(a.aired.to).slice(0, 10) : '';
    return /^\d{4}-\d{2}-\d{2}$/.test(airedTo) ? airedTo : today;
  };

  const entry = (loc, lastmod, priority) =>
    `  <url>\n    <loc>${esc(loc)}</loc>\n    <lastmod>${lastmod}</lastmod>\n` +
    `    <changefreq>weekly</changefreq>\n    <priority>${priority}</priority>\n  </url>`;

  const detail = anime
    .filter(a => a?.mal_id)
    .map(a => entry(BASE + animePath(a.mal_id, a.title), lastmodOf(a), '0.8'));

  // "Anime like X" pages rank below the title's own page (0.6): they are
  // supporting pages that answer a follow-up question, not the destination.
  const like = likeAnime
    .filter(a => a?.mal_id)
    .map(a => entry(BASE + animeLikePath(a.mal_id, a.title), lastmodOf(a), '0.6'));

  // Year pages are supporting index pages: above the "anime like" pages
  // (they are an index of many titles) but below the titles themselves.
  const years = (yearPages ?? [])
    .filter(y => Number.isInteger(y))
    .map(y => entry(BASE + bestOfYearPath(y), today, '0.7'));

  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    `${[...detail, ...like, ...years].join('\n')}\n</urlset>\n`;

  writeFileSync(path.join(DIST, 'sitemap-anime.xml'), xml, 'utf8');
  console.log(`  ✓ sitemap-anime.xml: ${detail.length} anime + ${like.length} "anime like" + `
    + `${years.length} year = ${detail.length + like.length + years.length} URLs`);
}


// ── Route tables ─────────────────────────────────────────────────────
// Titles/descriptions below are copied EXACTLY from each page's useSEO()
// call so the prerendered raw HTML and the runtime React state agree. If
// you change a page's SEO props, change it here too (and vice versa).

function currentSeason() {
  const m = new Date().getMonth();
  const year = new Date().getFullYear();
  return { season: m < 3 ? 'winter' : m < 6 ? 'spring' : m < 9 ? 'summer' : 'fall', year };
}

// Category listings used to be fetched 1:1 from the same Jikan endpoints
// that src/pages/category.tsx calls at runtime. That meant 8 extra network
// calls on every deploy against exactly the endpoints that are least
// reliable — so they are now derived from the top-anime pool instead (see
// deriveCategoryLists below). The runtime page still fetches live data;
// the shell just previews the same category from data we already hold.

// NOTE: `/` is deliberately NOT prerendered. It is served by dist/index.html,
// which is ALSO the SPA fallback for every client-only route — writing a shell
// there would make /watch/:id and similar pages flash homepage content while
// the bundle boots. The homepage's <title>/canonical are already correct in
// index.html, and the pages below supply the crawlable links into the anime
// detail pages. (Bonus: no fixed overlay ever covers the video player.)
const STATIC_PAGES = [
  {
    path: '/browse',
    title: 'Browse Anime | KamiStream',
    h1: 'Browse Anime',
    desc: 'Browse thousands of anime — search by genre, type, year and score on KamiStream.',
    keywords: 'browse anime, anime list, find anime, anime by genre, KamiStream',
    gridHeading: 'Popular anime to start with',
    genres: true,
  },
  {
    path: '/schedule',
    title: 'Estimated Schedule | KamiStream',
    h1: 'Anime Release Schedule',
    desc: 'Weekly anime airing schedule on KamiStream.',
    keywords: 'anime schedule, anime release dates, weekly anime, airing anime',
    schedule: true,
  },
  {
    path: '/az-list',
    title: 'A-Z List | KamiStream',
    h1: 'A–Z Anime List',
    desc: 'Browse all anime alphabetically on KamiStream — from #1 hits to hidden classics, sub & dub.',
    keywords: 'anime list a-z, alphabetical anime, all anime, KamiStream',
    genres: true,
  },
  {
    path: '/mood',
    title: 'Mood Picker | KamiStream',
    h1: 'Anime by Mood',
    desc: "Not sure what to watch? Pick your mood and we'll find the perfect anime for you.",
    keywords: 'anime by mood, what anime to watch, anime picker, KamiStream',
    genres: true,
  },
  {
    path: '/hidden-gems',
    title: 'Hidden Gems | KamiStream',
    h1: 'Hidden Gem Anime',
    desc: 'Discover underrated, overlooked and criminally under-watched anime — hidden gems streaming free on KamiStream.',
    keywords: 'hidden gem anime, underrated anime, overlooked anime, KamiStream',
    genres: true,
  },
  {
    path: '/about',
    title: 'About Us | KamiStream',                        // about.tsx updated to match
    h1: 'About KamiStream',
    desc: 'KamiStream is a free anime streaming site built by fans, for fans. Sub & dub, HD quality, no sign-up needed. The next generation anime experience.',
    keywords: 'about kamistream, anime streaming site, free anime',
  },
  {
    path: '/dmca',
    title: 'DMCA | KamiStream',
    h1: 'DMCA Policy',
    desc: 'DMCA takedown policy for KamiStream.',
    keywords: 'dmca, takedown policy, kamistream',
  },
  {
    path: '/terms',
    title: 'Terms of Service | KamiStream',
    h1: 'Terms of Service',
    desc: 'Terms of service for KamiStream.',
    keywords: 'terms of service, kamistream',
  },
  {
    path: '/contact',
    title: 'Contact | KamiStream',
    h1: 'Contact KamiStream',
    desc: 'Get in touch with KamiStream.',
    keywords: 'contact kamistream, anime site support',
  },
];


// ── Shared blocks ────────────────────────────────────────────────────
function genreChips(limit = 24) {
  const ids = Object.keys(GENRES).sort((a, b) => GENRES[a].localeCompare(GENRES[b])).slice(0, limit);
  return '<h2 class="ks-h2">Browse anime by genre</h2><ul class="ks-chips">'
    + ids.map(id => `<li><a href="/genre/${id}">${esc(GENRES[id])}</a></li>`).join('')
    + '</ul>';
}

/** Breadcrumb + TVSeries JSON-LD — mirrors useSEO() on anime-detail.tsx. */
function animeSchemas(a, canonical) {
  const tv = {
    '@context': 'https://schema.org', '@type': 'TVSeries',
    name: a.title, url: canonical, image: heroImage(a),
    description: clamp(a.synopsis || `${a.title} anime`, 300),
    sameAs: a.mal_id ? [`https://myanimelist.net/anime/${a.mal_id}`] : [],
  };
  if (a.episodes) tv.numberOfEpisodes = a.episodes;
  const g = (a.genres ?? []).map(x => x.name).filter(Boolean);
  if (g.length) tv.genre = g;
  const st = (a.studios ?? []).map(x => x.name).filter(Boolean);
  if (st.length) tv.productionCompany = st.map(n => ({ '@type': 'Organization', name: n }));
  if (a.aired?.from) tv.startDate = a.aired.from.split('T')[0];
  if (a.status === 'Currently Airing') tv.contentRating = 'TV-14';

  const crumbs = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home',   item: `${BASE}/` },
      { '@type': 'ListItem', position: 2, name: 'Browse', item: `${BASE}/browse` },
      { '@type': 'ListItem', position: 3, name: a.title,  item: canonical },
    ],
  };
  return [tv, crumbs];
}

// ── Anime detail ─────────────────────────────────────────────────────
function animeDoc(a, pool, likeMatches, yearPages) {
  const route     = animePath(a.mal_id, a.title);
  const canonical = `${BASE}${route}`;
  const year      = a.year || (a.aired?.from ? Number(a.aired.from.slice(0, 4)) : null);

  // NOTE: keep in sync with the useSEO() title in src/pages/anime-detail.tsx
  const title = `${a.title} — Watch Online Free (Sub & Dub) | KamiStream`;
  const desc  = clamp(a.synopsis
    || `Watch ${a.title} online free in HD with English subtitles and dub on KamiStream — episodes, ratings and details.`);

  const metaBits = [
    a.type, a.episodes ? `${a.episodes} episodes` : null, a.status,
    a.score ? `★ ${a.score}` : null, year ? String(year) : null,
    a.rank ? `#${a.rank} ranked` : null,
  ].filter(Boolean);

  const genres  = (a.genres ?? []).filter(g => GENRES[g.mal_id]);
  const studios = (a.studios ?? []).map(s => s.name).filter(Boolean);
  const poster  = a.images?.webp?.large_image_url || a.images?.jpg?.large_image_url || '';

  // "More like this" — shared-genre siblings from the pool the app also
  // exposes as related titles. Real, relevant, crawlable internal links.
  const genreIds = new Set((a.genres ?? []).map(g => g.mal_id));
  const related = pool
    .filter(x => x.mal_id !== a.mal_id && (x.genres ?? []).some(g => genreIds.has(g.mal_id)))
    .slice(0, 12);

  const shell = [
    shellOpen(),
    renderCrumbs([['Home', '/'], ['Browse', '/browse'], [a.title, null]]),
    `<h1 class="ks-h1">Watch ${esc(a.title)} Online — English Sub &amp; Dub</h1>`,
    '<div class="ks-hero">',
      poster
        ? `<img class="ks-poster" src="${esc(poster)}" alt="${esc(a.title)} poster" width="225" height="318" fetchpriority="high">`
        : '',
      '<div>',
        `<ul class="ks-meta">${metaBits.map(m => `<li>${esc(m)}</li>`).join('')}</ul>`,
        a.synopsis ? `<p class="ks-p">${esc(a.synopsis)}</p>` : '',
        studios.length ? `<p class="ks-p"><strong>Studio:</strong> ${esc(studios.join(', '))}</p>` : '',
        a.aired?.string ? `<p class="ks-p"><strong>Aired:</strong> ${esc(a.aired.string)}</p>` : '',
        genres.length
          ? `<ul class="ks-chips">${genres.map(g => `<li><a href="/genre/${g.mal_id}">${esc(g.name)}</a></li>`).join('')}</ul>`
          : '',
      '</div>',
    '</div>',
    renderGrid(related, `More anime like ${a.title}`),
    // Link to the dedicated "anime like X" page. This is the primary
    // discovery path for those pages: without an inbound link from a page
    // that already ranks they would be orphans, and orphaned pages get
    // crawled slowly or not at all.
    likeMatches?.length
      ? `<p class="ks-p"><a href="${esc(animeLikePath(a.mal_id, a.title))}">`
        + `See all ${likeMatches.length} anime like ${esc(a.title)} &rsaquo;</a></p>`
      : '',
    // Discovery path for this title's own /best-anime/:year page. Without an
    // inbound link from a page that already ranks, the year page would only
    // be reachable from the hub, and orphaned pages get crawled slowly.
    year && yearPages?.has(year)
      ? `<p class="ks-p"><a href="/best-anime/${year}">Best anime of ${year} ranked &rsaquo;</a></p>`
      : '',
    shellClose(),
  ].join('');

  const image = heroImage(a);
  return buildDocument(shell, {
    title, description: desc, canonical,
    keywords: [a.title, `watch ${a.title} online`, `${a.title} english sub`, 'anime streaming', 'KamiStream'].join(', '),
    ogType: 'video.other', image,
    // Trailer frames are 1280x720; a portrait poster has no useful 16:9 box.
    imageWidth:  a.trailer?.images?.maximum_image_url ? 1280 : undefined,
    imageHeight: a.trailer?.images?.maximum_image_url ? 720  : undefined,
    jsonLd: animeSchemas(a, canonical),
  });
}

// ── "Anime like X" ───────────────────────────────────────────────────
// Mirrors src/pages/anime-like.tsx section for section, using the SAME
// engine the React page imports. Titles with too few genuine matches are
// skipped entirely (MIN_MATCHES_FOR_PAGE) rather than published as a thin
// page that exists only to add a URL.

/** Grid tile that also carries the reason this title was picked. */
function renderMatchGrid(matches) {
  const items = matches.map(({ anime: x, reasons }) => {
    const img  = x.images?.jpg?.image_url || x.images?.webp?.image_url || '';
    const bits = [x.type, x.episodes ? `${x.episodes} ep` : null, scoreOf(x) ? `★ ${scoreOf(x)}` : null]
      .filter(Boolean).join(' · ');
    return `<li><a href="${esc(animePath(x.mal_id, x.title))}">`
      + (img ? `<img src="${esc(img)}" alt="${esc(x.title)} poster" loading="lazy" width="225" height="318">` : '')
      + `<b>${esc(x.title)}</b><i>${esc(bits)}</i>`
      + (reasons[0] ? `<em>${esc(reasons[0])}</em>` : '')
      + '</a></li>';
  }).join('');
  return `<ul class="ks-grid">${items}</ul>`;
}

function animeLikeDoc(a, matches) {
  const route     = animeLikePath(a.mal_id, a.title);
  const canonical = `${BASE}${route}`;
  const animeUrl  = animePath(a.mal_id, a.title);
  const name      = a.title;
  const best      = matches[0];

  // NOTE: keep in sync with the useSEO() call in src/pages/anime-like.tsx
  const title = `${likeTitle(a)} | KamiStream`;
  const desc  = likeDescription(a, matches);

  const table = best ? [
    '<table class="ks-table"><thead><tr><th>&nbsp;</th>',
    `<th>${esc(name)}</th><th>${esc(titleOf(best.anime))}</th>`,
    '</tr></thead><tbody>',
    comparisonRows(a, best.anime)
      .map(r => `<tr><th>${esc(r.label)}</th><td>${esc(r.source)}</td><td>${esc(r.candidate)}</td></tr>`)
      .join(''),
    '</tbody></table>',
  ].join('') : '';

  const bestReasons = best?.reasons?.length
    ? `<ul class="ks-why">${best.reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ul>`
    : '';

  // Chips link into the genre hubs — another crawlable path inward.
  const genreChips = (() => {
    const top = topSharedGenres(a, matches, 4);
    if (!top.length) return '';
    const items = top.map(g => {
      const gid = (a.genres ?? []).find(x => x.name === g.name)?.mal_id;
      return gid ? `<li><a href="/genre/${gid}">${esc(g.name)} · ${g.count}</a></li>` : '';
    }).filter(Boolean).join('');
    return items ? `<ul class="ks-chips">${items}</ul>` : '';
  })();

  const hero    = best ? heroImage(best.anime) : heroImage(a);
  const is16x9  = Boolean(best?.anime?.trailer?.images?.maximum_image_url
                       || a.trailer?.images?.maximum_image_url);

  const shell = [
    shellOpen(),
    renderCrumbs([['Home', '/'], ['Browse', '/browse'], [name, animeUrl], [`Anime like ${name}`, null]]),
    `<h1 class="ks-h1">${esc(likeHeading(a))}</h1>`,
    `<p class="ks-p">${esc(likeIntro(a, matches))}</p>`,
    best ? `<h2 class="ks-h2">${esc(titleOf(best.anime))} vs ${esc(name)}</h2>` : '',
    table,
    bestReasons,
    genreChips,
    `<h2 class="ks-h2">${matches.length} anime like ${esc(name)}</h2>`,
    renderMatchGrid(matches),
    `<p class="ks-p"><a href="${esc(animeUrl)}">Watch ${esc(name)} online free</a> on KamiStream.</p>`,
    shellClose(),
  ].join('');

  return buildDocument(shell, {
    title, description: desc, canonical,
    keywords: [
      `anime like ${name}`, `anime similar to ${name}`,
      `what to watch after ${name}`, `${name} recommendations`, 'KamiStream',
    ].join(', '),
    ogType: 'website', image: hero,
    imageWidth:  is16x9 ? 1280 : undefined,
    imageHeight: is16x9 ? 720  : undefined,
    jsonLd: [
      {
        '@context': 'https://schema.org', '@type': 'CollectionPage',
        name: likeHeading(a), url: canonical, description: desc,
        isPartOf: { '@type': 'WebSite', name: 'KamiStream', url: `${BASE}/` },
      },
      {
        // An ordered list of the recommendations, so the set is machine-readable.
        '@context': 'https://schema.org', '@type': 'ItemList',
        name: `Anime like ${name}`,
        itemListElement: matches.slice(0, 12).map((m, i) => ({
          '@type': 'ListItem', position: i + 1,
          name: titleOf(m.anime),
          url: `${BASE}${animePath(m.anime.mal_id, m.anime.title)}`,
        })),
      },
      {
        '@context': 'https://schema.org', '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home',   item: `${BASE}/` },
          { '@type': 'ListItem', position: 2, name: 'Browse', item: `${BASE}/browse` },
          { '@type': 'ListItem', position: 3, name, item: `${BASE}${animeUrl}` },
          { '@type': 'ListItem', position: 4, name: `Anime like ${name}`, item: canonical },
        ],
      },
    ],
  });
}

// ── Genre hub ────────────────────────────────────────────────────────
function genreDoc(genreId, list) {
  const name      = GENRES[genreId];
  const route     = `/genre/${genreId}`;
  const canonical = `${BASE}${route}`;
  const n         = list.length;

  // Keep in sync with useSEO() in src/pages/genre.tsx
  const title = `${name} Anime — Watch Free Online | KamiStream`;
  const desc  = clamp(`Watch the best ${name.toLowerCase()} anime online free in HD with English subtitles and dub. `
    + `Top-rated ${name.toLowerCase()} series and movies, updated as new episodes air on KamiStream.`);

  const shell = [
    shellOpen(),
    renderCrumbs([['Home', '/'], ['Browse', '/browse'], [`${name} Anime`, null]]),
    `<h1 class="ks-h1">${esc(name)} Anime</h1>`,
    `<p class="ks-p">${esc(`Watch the best ${name.toLowerCase()} anime online free in HD, sub and dub. `
      + `Browse ${n > 0 ? n + ' popular ' : ''}${name.toLowerCase()} series and movies below.`)}</p>`,
    renderGrid(list, `Popular ${name} anime`),
    genreChips(),
    shellClose(),
  ].join('');

  return buildDocument(shell, {
    title, description: desc, canonical,
    keywords: `${name} anime, best ${name} anime, watch ${name} anime, ${name} anime list, KamiStream`,
    ogType: 'website', image: list.length ? heroImage(list[0]) : `${BASE}/opengraph.jpg`,
    imageWidth:  list[0]?.trailer?.images?.maximum_image_url ? 1280 : undefined,
    imageHeight: list[0]?.trailer?.images?.maximum_image_url ? 720  : undefined,
    jsonLd: [{
      '@context': 'https://schema.org', '@type': 'CollectionPage',
      name: `${name} Anime`, url: canonical,
      description: desc,
      isPartOf: { '@type': 'WebSite', name: 'KamiStream', url: `${BASE}/` },
    }, {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home',   item: `${BASE}/` },
        { '@type': 'ListItem', position: 2, name: 'Browse', item: `${BASE}/browse` },
        { '@type': 'ListItem', position: 3, name: `${name} Anime`, item: canonical },
      ],
    }],
  });
}

// ── Category listing ─────────────────────────────────────────────────
function categoryDoc(cat, list) {
  const route     = `/category/${cat.slug}`;
  const canonical = `${BASE}${route}`;

  // Keep in sync with useSEO() in src/pages/category.tsx
  const title = `${cat.label} Anime | KamiStream`;
  const desc  = clamp(`${cat.desc} — streaming free in HD on KamiStream.`);

  const shell = [
    shellOpen(),
    renderCrumbs([['Home', '/'], ['Browse', '/browse'], [cat.label, null]]),
    `<h1 class="ks-h1">${esc(cat.label)} Anime</h1>`,
    `<p class="ks-p">${esc(desc)}</p>`,
    renderGrid(list, cat.label),
    genreChips(),
    shellClose(),
  ].join('');

  return buildDocument(shell, {
    title, description: desc, canonical,
    keywords: `${cat.label} anime, ${cat.slug} anime, watch anime free, KamiStream`,
    ogType: 'website', image: list.length ? heroImage(list[0]) : `${BASE}/opengraph.jpg`,
    imageWidth:  list[0]?.trailer?.images?.maximum_image_url ? 1280 : undefined,
    imageHeight: list[0]?.trailer?.images?.maximum_image_url ? 720  : undefined,
    jsonLd: [{
      '@context': 'https://schema.org', '@type': 'CollectionPage',
      name: `${cat.label} Anime`, url: canonical, description: desc,
      isPartOf: { '@type': 'WebSite', name: 'KamiStream', url: `${BASE}/` },
    }, {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home',    item: `${BASE}/` },
        { '@type': 'ListItem', position: 2, name: cat.label, item: canonical },
      ],
    }],
  });
}

// ── Static / hub pages ───────────────────────────────────────────────
function staticDoc(page, pool, scheduleList) {
  const canonical = `${BASE}${page.path}`;

  const shell = [
    shellOpen(),
    renderCrumbs([['Home', '/'], [page.h1, null]]),
    `<h1 class="ks-h1">${esc(page.h1)}</h1>`,
    `<p class="ks-p">${esc(page.desc)}</p>`,
    page.gridHeading ? renderGrid(pool.slice(0, 18), page.gridHeading) : '',
    page.schedule   ? renderGrid(scheduleList.slice(0, 24), 'Currently airing anime') : '',
    page.genres     ? genreChips() : '',
    shellClose(),
  ].join('');

  return buildDocument(shell, {
    title: page.title, description: page.desc, canonical, keywords: page.keywords,
    ogType: 'website',
    image: pool.length ? heroImage(pool[0]) : `${BASE}/opengraph.jpg`,
    // index.html structurally describes the homepage — reference it so
    // crawlers understand how this hub page sits in the site.
    jsonLd: [{
      '@context': 'https://schema.org', '@type': 'WebPage',
      name: page.h1, url: canonical, description: page.desc,
      isPartOf: { '@type': 'WebSite', name: 'KamiStream', url: `${BASE}/` },
    }, {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home',    item: `${BASE}/` },
        { '@type': 'ListItem', position: 2, name: page.h1,   item: canonical },
      ],
    }],
  });
}


// ── Pipeline ─────────────────────────────────────────────────────────
/** Set from dist/index.html at the start of main(). */
let SHELL_TEMPLATE = '';

// ── "Best Anime of {year}" ───────────────────────────────────────────
// Jikan's per-year search endpoint is permanently 504 (verified live), so
// every year comes from AniList. The query, sort and perPage below are
// deliberately identical to getAnimeOfYear() in src/lib/anilist.ts — that is
// what lets src/lib/bestOfYear.js render the same strings in both places.
async function collectYearAnime(year, attempt = 1) {
  const query = `query($year:Int){
    Page(page:1,perPage:${YEAR_PAGE_SIZE}){
      media(type:ANIME,seasonYear:$year,sort:SCORE_DESC,isAdult:false){
        idMal format episodes season seasonYear averageScore genres
        title{ romaji english native }
        coverImage{ extraLarge large }
        studios(isMain:true){ nodes{ name } }
      }
    }
  }`;

  try {
    const res = await fetch(ANILIST, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables: { year } }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.errors?.length) throw new Error(json.errors[0].message);

    const out = [];
    for (const m of json?.data?.Page?.media ?? []) {
      const norm = fromAniList(m);        // same idMal/title rules as React's fetcher
      if (norm) out.push(norm);
    }
    return out;
  } catch (err) {
    // AniList 429s and times out sporadically (observed: one build got 17/17
    // years, the next got 15/17 from the same code). Losing a year means
    // losing a page AND flapping the sitemap between deploys, so retry with
    // backoff before conceding the year.
    if (attempt < 3) {
      await sleep(1200 * attempt);
      return collectYearAnime(year, attempt + 1);
    }
    throw err;
  }
}

/** /best-anime — the index that keeps every year page one hop from Home. */
function yearsHubDoc(years) {
  const route     = '/best-anime';
  const canonical = `${BASE}${route}`;
  const ys        = [...years].sort((a, b) => b - a);

  // NOTE: keep in sync with the useSEO() call in src/pages/best-anime.tsx
  const title = `${hubTitle()} | KamiStream`;
  const desc  = hubDescription(ys);

  const chips = ys.map(y => `<li><a href="/best-anime/${y}">${y}</a></li>`).join('');

  const shell = [
    shellOpen(),
    renderCrumbs([['Home', '/'], ['Best Anime by Year', null]]),
    `<h1 class="ks-h1">${esc(hubHeading())}</h1>`,
    `<p class="ks-p">${esc(desc)}</p>`,
    chips ? `<ul class="ks-chips">${chips}</ul>` : '',
    '<p class="ks-p">Every year above lists that year’s highest-scoring titles with their '
      + 'score, studio and genres. Looking for something newer? '
      + '<a href="/category/top-rated">Browse the top rated anime of all time</a>.</p>',
    shellClose(),
  ].join('');

  return buildDocument(shell, {
    title, description: desc, canonical,
    keywords: 'best anime by year, top anime of the year, anime ranked by year, '
      + 'best anime 2024, classic anime by year, KamiStream',
    ogType: 'website', image: `${BASE}/opengraph.jpg`,
    jsonLd: [{
      '@context': 'https://schema.org', '@type': 'CollectionPage',
      name: hubHeading(), url: canonical, description: desc,
      isPartOf: { '@type': 'WebSite', name: 'KamiStream', url: `${BASE}/` },
    }, {
      '@context': 'https://schema.org', '@type': 'ItemList',
      name: hubHeading(),
      itemListElement: ys.map((y, i) => ({
        '@type': 'ListItem', position: i + 1,
        name: yearTitle(y), url: `${BASE}${bestOfYearPath(y)}`,
      })),
    }, {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE}/` },
        { '@type': 'ListItem', position: 2, name: hubHeading(), item: canonical },
      ],
    }],
  });
}

/** /best-anime/:year — mirrors src/pages/best-anime.tsx section for section. */
function yearDoc(year, list, years) {
  const route     = bestOfYearPath(year);
  const canonical = `${BASE}${route}`;
  const n         = list.length;
  const { prev, next } = yearNeighbors(year, years);

  // NOTE: keep in sync with the useSEO() call in src/pages/best-anime.tsx
  const title = `${yearTitle(year)} | KamiStream`;
  const desc  = yearDescription(year, list);

  // Same three links the React page renders, in the same order.
  const nav = [
    prev ? `<a href="/best-anime/${prev}">‹ ${prev}</a>` : '',
    '<a href="/best-anime">All years</a>',
    next ? `<a href="/best-anime/${next}">${next} ›</a>` : '',
  ].filter(Boolean).join(' · ');

  const rows = rankedRows(list).map(r =>
    `<tr><th>${r.rank}</th>`
      + `<td><a href="${esc(animePath(r.malId, r.name))}">${esc(r.name)}</a></td>`
      + `<td>${r.score ? `★ ${r.score}` : '—'}</td>`
      + `<td>${esc(r.type ?? '—')}</td>`
      + `<td>${r.episodes ?? '—'}</td>`
      + `<td>${esc(r.studio ?? '—')}</td></tr>`
  ).join('');

  const chips = yearGenres(list, 6)
    .map(g => `<li><a href="/genre/${g.id}">${esc(g.name)} · ${g.count}</a></li>`)
    .join('');

  const shell = [
    shellOpen(),
    renderCrumbs([['Home', '/'], ['Best Anime', '/best-anime'], [String(year), null]]),
    `<h1 class="ks-h1">${esc(yearTitle(year))}</h1>`,
    `<p class="ks-p">${esc(yearIntro(year, list))}</p>`,
    `<p class="ks-p">${nav}</p>`,
    `<h2 class="ks-h2">Top ${n} anime of ${year}, ranked</h2>`,
    '<table class="ks-table"><thead><tr><th>#</th><th>Title</th><th>Score</th>'
      + '<th>Type</th><th>Episodes</th><th>Studio</th></tr></thead><tbody>'
      + rows + '</tbody></table>',
    chips ? `<ul class="ks-chips">${chips}</ul>` : '',
    renderGrid(list, `All ${n} titles from ${year}`),
    '<p class="ks-p">Pick any title above to watch it free on KamiStream, or '
      + '<a href="/category/top-rated">browse the top rated anime of all time</a>.</p>',
    shellClose(),
  ].join('');

  const hero = list.length ? heroImage(list[0]) : `${BASE}/opengraph.jpg`;

  return buildDocument(shell, {
    title, description: desc, canonical,
    keywords: [
      `best anime ${year}`, `top anime ${year}`, `anime ${year} ranked`,
      `highest rated anime ${year}`, 'KamiStream',
    ].join(', '),
    ogType: 'website', image: hero,
    imageWidth:  list[0]?.trailer?.images?.maximum_image_url ? 1280 : undefined,
    imageHeight: list[0]?.trailer?.images?.maximum_image_url ? 720  : undefined,
    jsonLd: [
      {
        '@context': 'https://schema.org', '@type': 'CollectionPage',
        name: yearTitle(year), url: canonical, description: desc,
        isPartOf: { '@type': 'WebSite', name: 'KamiStream', url: `${BASE}/` },
      },
      {
        // Ordered so the ranked list is machine-readable.
        '@context': 'https://schema.org', '@type': 'ItemList',
        name: yearTitle(year),
        itemListElement: list.map((a, i) => ({
          '@type': 'ListItem', position: i + 1,
          name: titleOf(a), url: `${BASE}${animePath(a.mal_id, a.title)}`,
        })),
      },
      {
        '@context': 'https://schema.org', '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home',      item: `${BASE}/` },
          { '@type': 'ListItem', position: 2, name: 'Best Anime', item: `${BASE}/best-anime` },
          { '@type': 'ListItem', position: 3, name: yearTitle(year), item: canonical },
        ],
      },
    ],
  });
}

async function main() {
  if (!existsSync(SHELL_SRC)) {
    throw new Error('prerender: dist/index.html not found — `vite build` must run first.');
  }
  SHELL_TEMPLATE = readFileSync(SHELL_SRC, 'utf8');
  if (SHELL_TEMPLATE.includes('id="seo-shell"')) {
    throw new Error('prerender: dist/index.html already contains a shell — did the build run twice?');
  }

  console.log('▶ prerender: building the anime pool (Jikan → AniList fallback)…');

  const pool = await collectPool();
  console.log(`  · pool ready: ${pool.length} titles`);

  if (!pool.length) {
    console.warn('⚠ prerender: Jikan returned no data. Hub-page shells will be written without');
    console.warn('  listing grids (titles/canonicals/OG are still fixed) and anime detail pages');
    console.warn('  will fall through to the SPA exactly as before.');
  }

  const genreLists    = deriveGenreLists(pool);
  const categoryLists = deriveCategoryLists(pool);
  const airing        = deriveAiring(pool);

  // 0. "Best anime of {year}" — one AniList call per year in range, written
  //    FIRST so `yearPages` only ever contains years that really exist.
  //    Neither an anime page's cross-link nor the sitemap may point at a page
  //    that failed to write; those would silently become SPA-fallback URLs.
  //    (new Date() here only picks the range — the same input currentSeason()
  //    already depends on; nothing else in the docs is time-derived.)
  const wantedYears = yearRange(new Date().getFullYear(), YEAR_START);
  const yearLists   = new Map();
  for (let i = 0; i < wantedYears.length; i++) {
    const y = wantedYears[i];
    try {
      const list = yearList(await collectYearAnime(y), y);
      if (list.length >= MIN_TITLES_FOR_YEAR) yearLists.set(y, list);
      else warn(`  ! ${y}: only ${list.length} titles — page skipped`);
    } catch (err) {
      warn(`  ! year ${y} failed (${err.message}) — page skipped`);
    }
    if (i < wantedYears.length - 1) await sleep(1000);       // AniList ~90 req/min
  }

  const intendedYears = [...yearLists.keys()].sort((a, b) => a - b);
  const yearPages     = new Set();
  for (const y of intendedYears) {
    try {
      writeRoute(bestOfYearPath(y), yearDoc(y, yearLists.get(y), intendedYears));
      yearPages.add(y);
    } catch (err) {
      warn(`  ! year ${y}: ${err.message}`);
    }
  }
  writeRoute('/best-anime', yearsHubDoc([...yearPages].sort((a, b) => a - b)));
  console.log(`  ✓ year pages: ${yearPages.size} of ${wantedYears.length} years (+1 hub)`);

  // 1. Static + hub pages
  for (const page of STATIC_PAGES) writeRoute(page.path, staticDoc(page, pool, airing));
  console.log(`  ✓ static pages: ${STATIC_PAGES.length}`);

  // 2. Category listings — derived from the pool, zero extra API calls
  for (const cat of CATEGORIES) {
    writeRoute(`/category/${cat.slug}`, categoryDoc(cat, categoryLists.get(cat.slug) ?? []));
  }
  const catsWithGrid = [...categoryLists.values()].filter(l => l.length).length;
  console.log(`  ✓ category pages: ${CATEGORIES.length} (${catsWithGrid} with a listing grid)`);

  // 3. Genre hubs
  for (const [id, list] of genreLists) writeRoute(`/genre/${id}`, genreDoc(id, list));
  const genresWithGrid = [...genreLists.values()].filter(l => l.length).length;
  console.log(`  ✓ genre pages: ${genreLists.size} (${genresWithGrid} with a listing grid)`);

  // 4. Similarity for every title. Computed ONCE and reused by the anime
  //    detail pages (which link to their "anime like" page) and by the
  //    "anime like" pages themselves, so the two can never disagree.
  const likeMatches = new Map();
  for (const a of pool) likeMatches.set(a.mal_id, similarAnime(a, pool));

  // 5. Anime detail pages — the pages that actually need ranking
  const animeWritten = [];
  for (const a of pool) {
    try {
      writeRoute(animePath(a.mal_id, a.title), animeDoc(a, pool, likeMatches.get(a.mal_id), yearPages));
      animeWritten.push(a);
    } catch (err) {
      warn(`  ! anime ${a.mal_id} (${a.title}): ${err.message}`);
    }
  }
  console.log(`  ✓ anime pages: ${animeWritten.length}`);

  // 6. "Anime like X" pages — the follow-up query nothing used to answer.
  //    Only titles with enough genuine matches get a page: publishing a page
  //    with two thin suggestions would be worse than not publishing it.
  const likeWritten = [];
  for (const a of pool) {
    const matches = likeMatches.get(a.mal_id) ?? [];
    if (matches.length < MIN_MATCHES_FOR_PAGE) continue;
    try {
      writeRoute(animeLikePath(a.mal_id, a.title), animeLikeDoc(a, matches));
      likeWritten.push(a);
    } catch (err) {
      warn(`  ! anime-like ${a.mal_id} (${a.title}): ${err.message}`);
    }
  }
  const skipped = pool.length - likeWritten.length;
  console.log(`  ✓ "anime like" pages: ${likeWritten.length}`
    + (skipped ? ` (${skipped} skipped — under ${MIN_MATCHES_FOR_PAGE} matches)` : ''));

  // 7. Sitemap — covers exactly what was written above. Skipped when the pool
  //    came back empty so a dead API cannot replace a working sitemap with an
  //    empty one; the /api/sitemap-anime rewrite still answers then.
  if (animeWritten.length) {
    writeSitemapAnime(animeWritten, likeWritten, [...yearPages].sort((a, b) => a - b));
  } else {
    warn('  ! no anime pages written — /sitemap-anime.xml left to the /api/sitemap-anime fallback');
  }

  const secs = ((Date.now() - BUILD_START) / 1000).toFixed(1);
  console.log(`✔ prerender: ${written} HTML documents written in ${secs}s` +
    (warnCount ? ` (${warnCount} warning${warnCount === 1 ? '' : 's'})` : ''));
  console.log('  Every route now ships real <title>/<link rel=canonical>/OG tags and crawlable <a> links.');
}

main().catch(err => {
  console.error('\n✖ prerender failed:');
  console.error(err?.stack || err?.message || err);
  process.exit(1);
});

