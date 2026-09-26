/* ═══════════════════════════════════════════════════════════════════
 * SITEMAP BUILDER — writes every sitemap as a static file at build time.
 *
 * ── WHAT REPLACED WHAT ────────────────────────────────────────────
 * There used to be three competing sources of truth for "which URLs
 * exist", and they had drifted:
 *     public/sitemap.xml     hand-maintained, ~20 URLs, no <lastmod>,
 *                            duplicated the job of sitemap-pages.xml
 *     api/sitemap-pages.js   serverless, its own hardcoded page list
 *     api/sitemap-anime.js   serverless, Jikan top-200 fallback
 * plus api/sitemap-index.js pointing at all three. Search Console was
 * then fed one of those files and reported URLs that were noindex or
 * 404.
 *
 * Now there is exactly ONE list — buildRoutes() in src/lib/routes.js —
 * and this script serialises it to XML. Two files:
 *     dist/sitemap-static.xml   pages, categories, genres, year pages
 *     dist/sitemap-media.xml    anime + "anime like" pages (+ images)
 * and dist/sitemap-index.xml points at those two. Google is told about
 * the index only; it discovers the children from there.
 *
 * ── WHY STATIC FILES, NOT SERVERLESS ───────────────────────────────
 * Vercel's free tier allows 12 serverless invocations per day. A
 * sitemap is exactly the wrong thing to spend an invocation on: it gets
 * crawled constantly, it can 500, and a stale list is worse than none.
 * Writing at build time costs zero invocations and cannot fail at
 * request time. It also wins over the rewrite, because Vercel checks the
 * filesystem before applying rewrites.
 *
 * ── lastmod HONESTY ───────────────────────────────────────────────
 * Every <lastmod> comes from the route's own lastmod field, which is
 * either the build date (for pages that genuinely change with the
 * catalogue) or a real editorial date (for the legal pages). The old
 * api/sitemap-pages.js stamped today on everything, including a DMCA
 * policy that has not changed in months.
 * ═══════════════════════════════════════════════════════════════════ */

import {
  writeFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync,
} from 'node:fs';
import path from 'node:path';

import {
  buildRoutes, isNoindexPath, SITE_URL, NOINDEX_PATHS,
} from '../src/lib/routes.js';
import {
  POPULAR_GENRES, POPULAR_GENRE_IDS,
} from '../src/lib/genres.js';
import { yearRange } from '../src/lib/bestOfYear.js';

const DIST  = path.join(process.cwd(), 'dist');
const BASE  = SITE_URL;

/** XML text escape. Also strips control chars, which are illegal in XML. */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

/**
 * A sitemap <lastmod> must be a valid W3C date, not just "recent".
 * Anything unparseable is dropped rather than emitted, because a bad
 * date is a parse error that makes Google reject the WHOLE file.
 */
function safeDate(value) {
  const v = String(value == null ? '' : value).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const d = new Date(v + 'T00:00:00Z');
    if (!Number.isNaN(d.getTime())) return v;
  }
  return null;
}

function urlEntry({ url, lastmod, changefreq, priority, images }) {
  const date = safeDate(lastmod);
  let out = '  <url>\n    <loc>' + esc(url) + '</loc>\n';
  if (date) out += '    <lastmod>' + date + '</lastmod>\n';
  if (changefreq) out += '    <changefreq>' + esc(changefreq) + '</changefreq>\n';
  if (priority)  out += '    <priority>' + esc(priority) + '</priority>\n';

  // Image entries are the lever for image search. A poster with no
  // caption is weaker than one carrying the title, so each gets the
  // title as its caption when we have it.
  if (images && images.length) {
    out += '    <image:image>\n';
    for (const img of images) {
      out += '      <image:loc>' + esc(img.loc) + '</image:loc>\n';
      if (img.title)  out += '      <image:title>' + esc(img.title) + '</image:title>\n';
      if (img.caption) out += '      <image:caption>' + esc(img.caption) + '</image:caption>\n';
    }
    out += '    </image:image>\n';
  }

  return out + '  </url>';
}

function urlset(entries) {
  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n'
    + '        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n'
    + entries.join('\n') + '\n</urlset>\n';
}

function sitemapIndex(children) {
  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + children.map(c => '  <sitemap><loc>' + esc(c.loc) + '</loc>'
        + (safeDate(c.lastmod) ? '<lastmod>' + safeDate(c.lastmod) + '</lastmod>' : '')
        + '</sitemap>').join('\n')
    + '\n</sitemapindex>\n';
}
/* ── Anime entries ───────────────────────────────────────────────────
 * Sourced from what prerender.mjs ALREADY wrote, not from a second
 * Jikan crawl. That is the whole reason this does not cost any build
 * time or rate limit: the two scripts share one fetch, and the anime
 * page + its sitemap entry are guaranteed to be the same set of titles.
 *
 * If prerender has not run yet (e.g. `npm run build:spa` then
 * `npm run sitemaps`) we fall back to reading the prerendered dist
 * filenames, which is still authoritative — those files ARE the pages.  */
function readAnimeEntries() {
  const out = [];

  // Preferred: the JSON sidecar prerender.mjs writes next to the pages.
  const sidecar = path.join(DIST, '.anime-sitemap-data.json');
  if (existsSync(sidecar)) {
    try {
      const rows = JSON.parse(readFileSync(sidecar, 'utf8'));
      for (const r of rows) {
        if (!r || !r.url) continue;
        const images = [];
        if (r.image) images.push({ loc: r.image, title: r.title, caption: r.title });
        out.push({
          url: r.url, lastmod: r.lastmod, changefreq: 'weekly',
          priority: r.priority || '0.8', images,
        });
      }
      return out;
    } catch (err) {
      // Falling back silently here would hide a real bug behind a
      // plausible-looking sitemap — the fallback drops every <image:image>
      // and quietly shrinks the list. Make the failure loud instead.
      console.warn('  ! could not read ' + path.basename(sidecar)
        + ' (' + err.message + ') — falling back to scanning dist/, which '
        + 'means no poster images in the sitemap. Re-run `npm run prerender`.');
    }
  }

  // Fallback: the prerendered HTML files themselves. /anime/<slug>.html
  // is written for exactly the titles that ship, so this cannot overstate.
  const animeDir = path.join(DIST, 'anime');
  if (existsSync(animeDir)) {
    for (const f of readdirSafe(animeDir)) {
      if (!f.endsWith('.html')) continue;
      const slug = f.slice(0, -5);
      out.push({
        url: BASE + '/anime/' + slug,
        lastmod: statDate(path.join(animeDir, f)),
        changefreq: 'weekly',
        priority: '0.8',
        images: [],   // title is not recoverable from the filename alone
      });
    }
  }

  const likeDir = path.join(DIST, 'anime-like');
  if (existsSync(likeDir)) {
    for (const f of readdirSafe(likeDir)) {
      if (!f.endsWith('.html')) continue;
      const slug = f.slice(0, -5);
      out.push({
        url: BASE + '/anime-like/' + slug,
        lastmod: statDate(path.join(likeDir, f)),
        changefreq: 'weekly',
        priority: '0.6',
        images: [],
      });
    }
  }

  return out;
}

function readdirSafe(dir) {
  try { return readdirSync(dir); } catch { return []; }
}

function statDate(file) {
  try { return statSync(file).mtime.toISOString().slice(0, 10); } catch { return null; }
}
/* ── Years actually published ─────────────────────────────────────────
 * yearRange() gives the full span, but a year with too few rated
 * titles renders the noindexed "not enough titles yet" page (see
 * best-anime.tsx). Emitting those would be a straight repeat of the
 * "Submitted URL marked noindex" bug, so we only list a year the build
 * actually prerendered a document for.                              */
function readPublishedYears() {
  const dir = path.join(DIST, 'best-anime');
  if (!existsSync(dir)) return [];
  const years = [];
  for (const f of readdirSafe(dir)) {
    const m = f.match(/^(\d{4})\.html$/);
    if (m) years.push(Number(m[1]));
  }
  return years;
}

/* ── Main ────────────────────────────────────────────────────────────
 * Runs AFTER prerender.mjs, so dist/ is fully populated. Writing the
 * files here rather than into public/ matters: public/ is the build
 * INPUT, and a sitemap generated from the previous run would ship stale
 * alongside the new pages.                                           */
function main() {
  if (!existsSync(DIST)) {
    console.error('  ! dist/ not found — run `vite build` first.');
    process.exitCode = 1;
    return;
  }

  const years    = readPublishedYears();
  const genreIds = POPULAR_GENRE_IDS.map(function (id) {
    const g = POPULAR_GENRES.find(function (x) { return String(x.id) === String(id); });
    return { id: String(id), name: g ? g.name : '' };
  });

  const routes = buildRoutes({ genreIds: genreIds, years: years, base: BASE });

  // A noindex path must never reach a sitemap. This is a build-time
  // assertion, not a comment — the failure mode this prevents is
  // invisible until Search Console reports it weeks later.
  const leaks = routes.filter(function (r) { return isNoindexPath(r.path); });
  if (leaks.length) {
    console.error('  ! noindex routes leaked into the manifest: '
      + leaks.map(function (l) { return l.path; }).join(', '));
    process.exitCode = 1;
    return;
  }

  const staticEntries = routes.map(function (r) {
    return urlEntry({
      url: r.url, lastmod: r.lastmod,
      changefreq: r.changefreq, priority: r.priority,
    });
  });

  const animeEntries = readAnimeEntries().map(urlEntry);

  const today = new Date().toISOString().slice(0, 10);
  writeFileSync(path.join(DIST, 'sitemap-static.xml'), urlset(staticEntries), 'utf8');
  writeFileSync(path.join(DIST, 'sitemap-media.xml'),  urlset(animeEntries),  'utf8');
  writeFileSync(path.join(DIST, 'sitemap-index.xml'), sitemapIndex([
    { loc: BASE + '/sitemap-static.xml', lastmod: today },
    { loc: BASE + '/sitemap-media.xml',  lastmod: today },
  ]), 'utf8');

  console.log('  ✓ sitemap-static.xml: ' + staticEntries.length + ' URLs ('
    + routes.filter(function (r) { return r.kind === 'static'; }).length + ' static, '
    + routes.filter(function (r) { return r.kind === 'category'; }).length + ' category, '
    + routes.filter(function (r) { return r.kind === 'genre'; }).length + ' genre, '
    + routes.filter(function (r) { return r.kind === 'year'; }).length + ' year)');
  console.log('  ✓ sitemap-media.xml:  ' + animeEntries.length + ' URLs (anime + anime-like)');
  console.log('  ✓ sitemap-index.xml:  2 child sitemaps');
}

main();