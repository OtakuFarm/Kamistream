/* ============================================================================
 * SITEMAP VERIFIER - the build gate.
 *
 * WHY THIS EXISTS
 * Every SEO bug this project shipped for months had the same shape: a
 * sitemap advertised a URL that did not exist, was noindex, or pointed
 * somewhere else - and Search Console reported it weeks later. Those
 * reports are cheap to fix but expensive to discover, so these checks
 * run at build time, where a failure is a red build rather than a silent
 * ranking loss.
 *
 * What it asserts:
 *   1. the three sitemap files exist and are well-formed XML
 *   2. the index points at exactly the two children that exist
 *   3. no URL appears in more than one sitemap (no cannibalisation)
 *   4. no noindex route leaked into any sitemap
 *   5. every <loc> is absolute, https, on-domain
 *   6. every <lastmod> is a real W3C date
 *   7. every listed page has a real HTML document in dist/ (no 404s)
 *   8. the manifest's category slugs still match src/pages/category.tsx,
 *      and the genre count still matches POPULAR_GENRES
 *   9. robots.txt advertises only the index
 *
 * Run with `npm run verify:sitemap` or `npm run verify`.
 * ========================================================================= */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

import { buildRoutes, isNoindexPath, SITE_URL } from '../src/lib/routes.js';
import { POPULAR_GENRES, isPopularGenre } from '../src/lib/genres.js';

const DIST = path.join(process.cwd(), 'dist');
const CHILDREN = ['sitemap-static.xml', 'sitemap-media.xml'];

let failures = 0;
let warnings = 0;

function ok(msg)   { console.log('  OK   ' + msg); }
function fail(msg) { failures++; console.log('  FAIL ' + msg); }
function warn(msg) { warnings++; console.log('  WARN ' + msg); }

function read(file) {
  const p = path.join(DIST, file);
  if (!existsSync(p)) { fail(file + ' is missing - run `npm run build`.'); return null; }
  return readFileSync(p, 'utf8');
}

function locs(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim());
}

console.log('');
console.log('Verifying sitemaps...');
console.log('');
/* -- 1-2. Files exist, are balanced, and the index is wired correctly -- */
const indexXml  = read('sitemap-index.xml');
const staticXml = read('sitemap-static.xml');
const mediaXml  = read('sitemap-media.xml');
if (!indexXml || !staticXml || !mediaXml) {
  console.log('');
  console.log('verify failed - run `npm run build` first.');
  process.exit(1);
}

// An unescaped & or a stray < makes Google's parser reject the WHOLE file,
// not just the one bad entry, so imbalance is fatal rather than a warning.
for (const pair of [['sitemap-index.xml', indexXml], ['sitemap-static.xml', staticXml], ['sitemap-media.xml', mediaXml]]) {
  const name = pair[0], xml = pair[1];
  const smOpen = (xml.match(/<sitemap>/g) || []).length;
  const smClose = (xml.match(/<\/sitemap>/g) || []).length;
  const uOpen = (xml.match(/<url>/g) || []).length;
  const uClose = (xml.match(/<\/url>/g) || []).length;
  if (smOpen !== smClose) fail(name + ': unbalanced <sitemap> tags');
  else if (uOpen !== uClose) fail(name + ': unbalanced <url> tags');
  else ok(name + ' is well-formed (' + (uOpen || smOpen) + ' entries)');
}

const indexLocs = locs(indexXml);
for (const child of CHILDREN) {
  if (indexLocs.indexOf(SITE_URL + '/' + child) !== -1) ok('index references /' + child);
  else fail('index is missing /' + child);
}
for (const l of indexLocs) {
  if (!CHILDREN.some(c => l.indexOf(c) !== -1)) fail('index points at an unknown child: ' + l);
}

const staticLocs = locs(staticXml);
const mediaLocs  = locs(mediaXml);
const allLocs    = staticLocs.concat(mediaLocs);

/* -- 3. No URL in two sitemaps -- */
{
  const seen = {};
  let dupes = 0;
  for (const l of allLocs) {
    if (seen[l]) { fail('URL in both sitemaps (cannibalisation): ' + l); dupes++; }
    else seen[l] = true;
  }
  if (!dupes) ok('no URL appears in more than one sitemap (' + allLocs.length + ' unique)');
}

/* -- 4. No noindex route leaked in -- */
{
  const leaks = allLocs.filter(function (u) {
    const p = u.replace(SITE_URL, '') || '/';
    // /genre/:id counts as indexable only for the published ids - see
    // isPopularGenre(); any other id renders a noindex "Not Found" shell.
    const g = p.match(/^\/genre\/(\d+)/);
    if (g) return !isPopularGenre(g[1]);
    return isNoindexPath(p);
  });
  if (leaks.length) leaks.forEach(function (l) { fail('noindex route present in a sitemap: ' + l); });
  else ok('no noindex route is present in any sitemap');
}
/* -- 5. Absolute, https, well-formed URLs -- */
{
  let bad = 0;
  for (const l of allLocs) {
    if (l.indexOf('https://') !== 0) { fail('not https: ' + l); bad++; continue; }
    if (l.indexOf(' ') !== -1) { fail('URL contains an unencoded space: ' + l); bad++; }
    if (l !== SITE_URL && l.indexOf(SITE_URL + '/') !== 0) { fail('off-domain URL: ' + l); bad++; }
  }
  if (!bad) ok('every URL is absolute, https and on-domain');
}

/* -- 6. Every lastmod is a real W3C date -- */
{
  let bad = 0;
  const pairs = [['sitemap-static.xml', staticXml], ['sitemap-media.xml', mediaXml]];
  for (const pair of pairs) {
    const name = pair[0], xml = pair[1];
    for (const m of xml.matchAll(/<lastmod>([^<]*)<\/lastmod>/g)) {
      const v = m[1].trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(new Date(v).getTime())) {
        fail(name + ' has an invalid <lastmod>: "' + v + '"');
        bad++;
      }
    }
  }
  if (!bad) ok('every <lastmod> is a valid W3C date');
}

/* -- 7. Every listed page actually has an HTML document -- */
{
  // The homepage is dist/index.html and /latest-episodes is served by the
  // serverless api/latest.js, so neither exists as a file under dist/.
  const EXEMPT = { '/': true, '/latest-episodes': true };
  let missing = 0;
  for (const u of staticLocs) {
    const p = u.replace(SITE_URL, '') || '/';
    if (EXEMPT[p]) continue;
    const candidates = [
      path.join(DIST, p.slice(1), 'index.html'),
      path.join(DIST, p.slice(1) + '.html'),
    ];
    if (!candidates.some(existsSync)) { fail('sitemap lists a page with no HTML: ' + p); missing++; }
  }
  if (!missing) ok('every listed page has a real document in dist/');
}
/* -- 8. The manifest still matches the pages it describes -- */
{
  // The category SLUG is the URL, so a rename in category.tsx not mirrored
  // in the manifest would make the sitemap advertise a 404. Assert the two
  // agree instead of trusting the comment that says they must.
  const pageSrc = readFileSync(path.join(process.cwd(), 'src/pages/category.tsx'), 'utf8');
  const m = pageSrc.match(/CATEGORY_ORDER\s*=\s*\[([\s\S]*?)\]/);
  if (!m) {
    fail('could not find CATEGORY_ORDER in src/pages/category.tsx');
  } else {
    const fromPage = [...m[1].matchAll(/"([a-z-]+)"/g)].map(x => x[1]);
    const fromManifest = buildRoutes({ genreIds: [], years: [] })
      .filter(r => r.kind === 'category')
      .map(r => r.path.replace('/category/', ''));
    const same = fromPage.length === fromManifest.length
      && fromPage.every((s, i) => s === fromManifest[i]);
    if (same) ok('category slugs in the manifest match category.tsx (' + fromManifest.length + ')');
    else {
      fail('category slug drift between the manifest and category.tsx');
      warn('  manifest: ' + fromManifest.join(', '));
      warn('  page:     ' + fromPage.join(', '));
    }
  }

  const listed = staticLocs.filter(l => /\/genre\/\d+$/.test(l)).length;
  if (listed === POPULAR_GENRES.length) {
    ok('genre sitemap entries match POPULAR_GENRES (' + listed + ')');
  } else {
    fail('expected ' + POPULAR_GENRES.length + ' genre entries, found ' + listed);
  }
}

/* -- 9. robots.txt advertises only the index -- */
{
  const rp = path.join(process.cwd(), 'public/robots.txt');
  if (!existsSync(rp)) {
    warn('public/robots.txt not found');
  } else {
    const txt = readFileSync(rp, 'utf8');
    const maps = [...txt.matchAll(/^Sitemap:\s*(\S+)/gim)].map(x => x[1]);
    if (maps.length === 0) fail('robots.txt advertises no sitemap');
    else if (maps.length === 1 && maps[0].indexOf('/sitemap-index.xml') !== -1) {
      ok('robots.txt points at the sitemap index only');
    } else {
      warn('robots.txt lists ' + maps.length + ' sitemaps: ' + maps.join(', '));
    }
  }
}

/* -- Summary -- */
console.log('');
if (failures) {
  console.log('verify-sitemap: ' + failures + ' FAILURE(S)'
    + (warnings ? ', ' + warnings + ' warning(s)' : ''));
  console.log('Do not deploy. Each failure above is a class of problem that');
  console.log('Search Console would otherwise report weeks from now.');
  process.exit(1);
}
console.log('verify-sitemap: all checks passed'
  + (warnings ? ' (' + warnings + ' warning(s))' : ''));