/* ═══════════════════════════════════════════════════════════════════
 * ROUTE MANIFEST — the single source of truth for every indexable URL.
 *
 * ── WHY THIS FILE EXISTS ───────────────────────────────────────────
 * Titles and descriptions used to be written out four times:
 *     the useSEO() call inside each page
 *     scripts/prerender.mjs         (STATIC_PAGES + the doc builders)
 *     api/sitemap-pages.js          (its own page list)
 *     public/sitemap.xml            (hand-maintained URL list)
 * They had already drifted — which is how Search Console ends up
 * reporting "Submitted URL marked noindex" and "Googlebot found a
 * different canonical". This file is the only place that is decided
 * now. Four consumers read it:
 *     src/hooks/useSEO.ts        runtime title/meta/canonical
 *     src/components/Layout.tsx  the crawlable footer nav
 *     scripts/sitemaps.mjs       the XML sitemaps
 *     scripts/prerender.mjs      the crawlable HTML
 * Change a title here and all four change together, or none do.
 *
 * ── WHY PLAIN .js AND NOT .ts ──────────────────────────────────────
 * Two different consumers import it: the Vite/React bundle and the Node
 * build scripts. A plain ESM module is the only shape both can load
 * without an extra build step — same reasoning as src/lib/genres.js.
 * Types live in src/lib/routes.d.ts.
 *
 * ── lastmod IS DELIBERATE ──────────────────────────────────────────
 * `lastmod: 'build'` means "this page's content genuinely changes with
 * the catalogue, so the build date is honest." An explicit date is a
 * real editorial date for a page that only changes when we edit it.
 * The old api/sitemap-pages.js stamped *today* on every page including
 * the DMCA policy, which is a lie Google can detect.
 * ═══════════════════════════════════════════════════════════════════ */

/** Trim to `max` chars on a word boundary — shared meta-description clamp. */
export function clampText(text, max = 158) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const sp  = cut.lastIndexOf(' ');
  return (sp > 60 ? cut.slice(0, sp) : cut).trimEnd() + '…';
}

export const SITE_NAME = 'KamiStream';
export const SITE_URL  = 'https://www.kamistream.fun';

/* ── Category listings ────────────────────────────────────────────────
 * slug/label/desc MUST stay identical to CATEGORIES in
 * src/pages/category.tsx — the slug IS the URL, so a mismatch would
 * advertise a page that does not exist. scripts/verify-sitemap.mjs
 * asserts the two agree, so drift fails the build.                     */
export const CATEGORIES = Object.freeze([
  { slug: 'trending',       label: 'Trending Now',   desc: "What's hot right now — the top airing anime this week" },
  { slug: 'new-release',    label: 'New Release',    desc: 'Currently airing anime sorted by popularity' },
  { slug: 'new-added',      label: 'New Added',      desc: 'Recently started anime — fresh new seasons and debuts' },
  { slug: 'just-completed', label: 'Just Completed', desc: 'Anime that recently finished airing' },
  { slug: 'top-rated',      label: 'Top Rated',      desc: 'Highest rated anime of all time' },
  { slug: 'this-season',    label: 'This Season',    desc: 'Anime airing in the current season' },
  { slug: 'top-anime',      label: 'Top Anime',      desc: 'All-time top anime ranked by score' },
  { slug: 'upcoming',       label: 'Upcoming Anime', desc: "Anime that haven't started airing yet" },
]);

export const CATEGORY_SLUGS = Object.freeze(CATEGORIES.map(c => c.slug));

/* ── Page kinds ────────────────────────────────────────────────────────
 * 'static'   one fixed page
 * 'category' /category/:slug   — generated from CATEGORIES
 * 'genre'    /genre/:id        — generated from the published genre ids
 * 'year'     /best-anime/:year — generated at build from years that
 *                                 actually have enough ranked titles
 * 'noindex'  a real route Google must NOT index. Listed so the nav, the
 *            manifest and robots.txt cannot disagree about what is a
 *            utility page.                                             */
export const KINDS = Object.freeze({
  STATIC: 'static',
  CATEGORY: 'category',
  GENRE: 'genre',
  YEAR: 'year',
  NOINDEX: 'noindex',
});

/* ── Editorial lastmod ─────────────────────────────────────────────────
 * These pages change when a human edits them, not when the catalogue
 * changes. Saying so is the difference between an honest sitemap and
 * one claiming the DMCA policy was rewritten daily.                    */
const EDITORIAL_LASTMOD = '2026-01-15';
/* ── The static page table ────────────────────────────────────────────
 * title:  the full title, brand suffix already applied — the runtime
 *         useSEO() must NOT append anything to it.
 * desc:   clamped to 158 chars or fewer.
 * prerender: true  → scripts/prerender.mjs writes crawlable HTML.
 *           false → client-rendered only; still belongs in the sitemap
 *           because it is a real, reachable, linkable page.            */
const STATIC_PAGES = [
  {
    path: '/',
    title: 'KamiStream — Watch Anime Free in HD',
    desc: 'Stream thousands of anime episodes free on KamiStream. Sub & dub, trending, seasonal and classic anime all in one place. No account needed.',
    priority: '1.0', changefreq: 'daily', lastmod: 'build', prerender: false,
    navLabel: 'Home', h1: 'Watch Anime Free on KamiStream',
  },
  {
    path: '/browse',
    title: 'Browse All Anime — Search by Genre, Year & Type | KamiStream',
    desc: 'Browse thousands of anime on KamiStream. Search by genre, type, year and score. Sub & dub in HD, free, no sign-up needed.',
    priority: '0.9', changefreq: 'daily', lastmod: 'build', prerender: true,
    navLabel: 'Browse',
    // The visible H1 differs from the <title> on purpose: the title is
    // written for the SERP, the H1 for the person who landed. They used
    // to be two hand-maintained strings that drifted apart.
    h1: 'Browse Anime',
  },
  {
    path: '/schedule',
    title: 'Estimated Schedule | KamiStream',
    desc: 'Weekly anime airing schedule on KamiStream.',
    priority: '0.8', changefreq: 'daily', lastmod: 'build', prerender: true,
    navLabel: 'Schedule', h1: 'Anime Release Schedule',
  },
  {
    // Served by api/latest.js via the /latest-episodes rewrite — NOT
    // prerendered, because a static file there would shadow the rewrite
    // (Vercel checks the filesystem before applying rewrites).
    path: '/latest-episodes',
    title: 'Latest Anime Episodes — Aired in the Last 72 Hours | KamiStream',
    desc: 'The newest anime episodes on KamiStream — everything that aired in the last 72 hours, updated daily. Watch sub & dub free in HD.',
    priority: '0.8', changefreq: 'daily', lastmod: 'build', prerender: false,
    navLabel: 'Latest Episodes', h1: 'Latest Anime Episodes',
  },
  {
    path: '/az-list',
    title: 'A-Z Anime List — Every Title Alphabetically | KamiStream',
    desc: 'Browse all anime alphabetically on KamiStream — from #1 hits to hidden classics, sub & dub.',
    priority: '0.7', changefreq: 'weekly', lastmod: 'build', prerender: true,
    navLabel: 'A-Z List', h1: 'A-Z Anime List',
  },
  {
    path: '/best-anime',
    title: 'Best Anime by Year | KamiStream',
    desc: 'Every year of anime, ranked by score. Find the best anime of any year on KamiStream — sub & dub, free in HD.',
    priority: '0.7', changefreq: 'weekly', lastmod: 'build', prerender: true,
    navLabel: 'Best by Year', h1: 'Best Anime by Year',
  },
  {
    path: '/mood',
    title: 'Anime by Mood — Find What to Watch | KamiStream',
    desc: "Not sure what to watch? Pick your mood and we'll find the perfect anime for you. Free sub & dub in HD on KamiStream.",
    priority: '0.6', changefreq: 'weekly', lastmod: 'build', prerender: true,
    navLabel: 'Mood Picker', h1: 'Anime by Mood',
  },
  {
    path: '/hidden-gems',
    title: 'Hidden Gem Anime — Underrated Shows Worth Watching | KamiStream',
    desc: 'Discover underrated, overlooked and criminally under-watched anime — hidden gems streaming free on KamiStream.',
    priority: '0.6', changefreq: 'weekly', lastmod: 'build', prerender: true,
    navLabel: 'Hidden Gems', h1: 'Hidden Gem Anime',
  },
  /* Legal / trust pages. Low priority, NOT zero: Google explicitly looks
   * for a reachable Home / About / Contact / Terms set and a DMCA policy
   * when judging whether a site is trustworthy — which matters most for
   * streaming sites. */
  {
    path: '/about',
    title: 'About KamiStream — Anime Information & Streaming Guide',
    desc: 'Learn how KamiStream works, how anime pages and the inline player are organized, and how to contact us or report a broken link or copyright concern.',
    priority: '0.4', changefreq: 'monthly', lastmod: EDITORIAL_LASTMOD, prerender: true,
    navLabel: 'About', h1: 'About KamiStream',
  },
  {
    path: '/dmca',
    title: 'DMCA | KamiStream',
    desc: 'DMCA takedown policy for KamiStream.',
    priority: '0.3', changefreq: 'yearly', lastmod: EDITORIAL_LASTMOD, prerender: true,
    navLabel: 'DMCA', h1: 'DMCA Policy',
  },
  {
    path: '/terms',
    title: 'Terms of Service | KamiStream',
    desc: 'Terms of service for KamiStream.',
    priority: '0.3', changefreq: 'yearly', lastmod: EDITORIAL_LASTMOD, prerender: true,
    navLabel: 'Terms', h1: 'Terms of Service',
  },
  {
    path: '/contact',
    title: 'Contact | KamiStream',
    desc: 'Get in touch with KamiStream — report a broken link, a copyright concern or a content error.',
    priority: '0.3', changefreq: 'yearly', lastmod: EDITORIAL_LASTMOD, prerender: true,
    navLabel: 'Contact', h1: 'Contact KamiStream',
  },
];
/* ── Noindex routes ────────────────────────────────────────────────────
 * Real pages that must stay out of the index. Each already calls
 * useSEO({ noindex: true }); listing them makes the intent auditable
 * and lets verify-sitemap.mjs assert that none of them appears in a
 * sitemap. `reason` answers "why is this not indexed?"                  */
const NOINDEX_ROUTES = [
  { path: '/search',       reason: 'parameterised results' },
  { path: '/login',        reason: 'auth' },
  { path: '/signup',       reason: 'auth' },
  { path: '/watchlist',    reason: 'per-user' },
  { path: '/profile',      reason: 'per-user' },
  { path: '/stats',        reason: 'per-user' },
  { path: '/achievements', reason: 'per-user' },
  { path: '/quiz',         reason: 'per-user gamification' },
  { path: '/challenges',   reason: 'per-user gamification' },
  { path: '/leaderboard',  reason: 'per-user gamification' },
  { path: '/community',    reason: 'UGC, no editorial review' },
  { path: '/creator',      reason: 'UGC, no editorial review' },
  { path: '/watch',        reason: 'player wrapper, no content' },
  { path: '/admin',        reason: 'admin only' },
];

export const NOINDEX_PATHS = Object.freeze(NOINDEX_ROUTES.map(r => r.path));
export const NOINDEX_REASONS = Object.freeze(
  NOINDEX_ROUTES.reduce((acc, r) => { acc[r.path] = r.reason; return acc; }, {})
);

/* ── Genre page title/description ───────────────────────────────────────
 * Generated, not hand-listed: genres.js holds the 16 ids we actually
 * publish. The old hand-maintained list in api/sitemap-pages.js is what
 * used to advertise /genre/:id URLs rendering the noindexed "Genre Not
 * Found" shell.                                                          */
export function genreTitle(name) {
  return name + ' Anime — Watch Free Online | ' + SITE_NAME;
}

export function genreDescription(name) {
  const lower = String(name).toLowerCase();
  return clampText(
    'Watch the best ' + lower + ' anime online free in HD with English subtitles and dub. '
    + 'Top-rated ' + lower + ' series and movies, updated as new episodes air on ' + SITE_NAME + '.'
  );
}
/* ── Build the full indexable route list ────────────────────────────────
 * genreIds and years are passed in rather than imported so this file
 * stays free of a dependency on genres.js / bestOfYear.js — a cycle here
 * would be circular, since those modules are themselves consumed by the
 * pages that read this manifest back.                                    */
export function buildRoutes(opts) {
  const o = opts || {};
  const genreIds = o.genreIds || [];
  const years    = o.years || [];
  const base     = o.base || SITE_URL;
  const today    = new Date().toISOString().slice(0, 10);
  const routes   = [];

  for (const p of STATIC_PAGES) {
    routes.push({
      kind: KINDS.STATIC,
      path: p.path,
      url: base + p.path,
      title: p.title,
      description: p.desc,
      priority: p.priority,
      changefreq: p.changefreq,
      lastmod: p.lastmod === 'build' ? today : p.lastmod,
      prerender: p.prerender,
      navLabel: p.navLabel,
      // h1 is what the reader actually sees, which is not always the
      // <title> — the title is written for the SERP.
      h1: p.h1 || p.navLabel,
    });
  }

  for (const c of CATEGORIES) {
    routes.push({
      kind: KINDS.CATEGORY,
      path: '/category/' + c.slug,
      url: base + '/category/' + c.slug,
      title: c.label + ' Anime | ' + SITE_NAME,
      description: clampText(c.desc + ' — streaming free in HD on ' + SITE_NAME + '.'),
      priority: '0.7', changefreq: 'daily', lastmod: today, prerender: true,
      navLabel: c.label,
    });
  }

  for (const raw of genreIds) {
    // Accept either a bare id or an {id, name} pair.
    const g = (raw && typeof raw === 'object')
      ? { id: String(raw.id), name: String(raw.name || '') }
      : { id: String(raw), name: '' };
    routes.push({
      kind: KINDS.GENRE,
      path: '/genre/' + g.id,
      url: base + '/genre/' + g.id,
      title: genreTitle(g.name || 'Anime'),
      description: genreDescription(g.name || 'anime'),
      priority: '0.6', changefreq: 'weekly', lastmod: today, prerender: true,
      navLabel: g.name || ('Genre ' + g.id),
    });
  }

  for (const y of years.slice().sort(function (a, b) { return b - a; })) {
    routes.push({
      kind: KINDS.YEAR,
      path: '/best-anime/' + y,
      url: base + '/best-anime/' + y,
      // Sitemap metadata only. The real title/description for a year page
      // depend on the ranked list, known only at build time — both the
      // runtime and the prerenderer call yearTitle()/yearDescription() in
      // src/lib/bestOfYear.js so the two agree.
      title: 'Best Anime of ' + y + ' | ' + SITE_NAME,
      description: clampText('The best anime of ' + y + ', ranked by score. Sub & dub, free in HD on ' + SITE_NAME + '.'),
      priority: '0.7', changefreq: 'weekly', lastmod: today, prerender: true,
      navLabel: String(y),
    });
  }

  return routes;
}

/** Every indexable path, as a Set — O(1) membership for the footer/checks. */
export function indexablePaths(opts) {
  return new Set(buildRoutes(opts).map(function (r) { return r.path; }));
}

/**
 * True when `path` must never appear in a sitemap.
 * /genre/ is deliberately NOT handled here: only the 16 published genre
 * ids are indexable, so a blanket prefix rule would be wrong in the other
 * direction. Callers ask isPopularGenre() for that family.
 */
export function isNoindexPath(path) {
  const p = String(path == null ? '' : path);
  if (NOINDEX_PATHS.indexOf(p) !== -1) return true;
  return p.indexOf('/watch/') === 0
      || p.indexOf('/creator/') === 0
      || p.indexOf('/search') === 0;
}