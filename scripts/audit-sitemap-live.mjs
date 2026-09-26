/* ============================================================================
 * LIVE SITEMAP AUDIT - checks the deployed site, not the build output.
 *
 * WHY THIS IS SEPARATE FROM verify-sitemap.mjs
 *   verify-sitemap.mjs  proves the files we GENERATED are internally
 *                       consistent. It cannot see deployment problems.
 *   This script         proves the files the CDN SERVES are correct, which
 *                       is a different question with different failure modes.
 *
 * THE BUG IT EXISTS TO CATCH
 *   Every path that is not a real file in dist/ falls through vercel.json's
 *   catch-all rewrite to /index.html, which returns 200 text/html. So a
 *   sitemap URL that was renamed or deleted answers "200 OK" while being
 *   HTML, not XML. A crawler parsing that gets a parse error, and a human
 *   checking "does this URL work" sees a green tick and a broken sitemap.
 *   That is a soft-404, and it is invisible without an explicit check.
 *
 * Usage:  node scripts/audit-sitemap-live.mjs
 *         SITE=https://example.com node scripts/audit-sitemap-live.mjs
 *         CONCURRENCY=8 node scripts/audit-sitemap-live.mjs
 * ========================================================================= */

const SITE = (process.env.SITE || 'https://www.kamistream.fun').replace(/\/$/, '');
const CONCURRENCY = Number(process.env.CONCURRENCY || 6);
const UA = 'Mozilla/5.0 (compatible; KamiStreamSitemapAudit/1.0)';
// Anime detail pages are ~180KB of prerendered HTML and a cold CDN miss can
// take a while. 20s was tight enough to produce false failures on a
// perfectly healthy page, which is worse than no check at all.
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || 45000);

let failures = 0;
let warnings = 0;
const ok = m => console.log('  OK   ' + m);
const bad = m => { failures++; console.log('  FAIL ' + m); };
const warn = m => { warnings++; console.log('  WARN ' + m); };
const info = m => console.log('       ' + m);

async function get(url, method = 'GET') {
  const res = await fetch(url, {
    method,
    redirect: 'follow',
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return res;
}

/** Run `worker` over `items` with a fixed number of workers. */
async function pool(items, worker) {
  const out = [];
  let i = 0;
  const runners = Array.from({ length: Math.min(CONCURRURRENCY_SAFE(), items.length) },
    async () => {
      while (i < items.length) { out.push(await worker(items[i++])); }
    });
  await Promise.all(runners);
  return out;
}
function CONCURRURRENCY_SAFE() { return Math.max(1, Math.min(CONCURRENCY, 12)); }
/* -- helpers -- */
function locs(xml) { return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim()); }

async function fetchXml(path) {
  const url = SITE + path;
  const res = await get(url);
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  const body = await res.text();
  // The soft-404 signature: 200 OK, but the body is the SPA shell.
  const isHtml = body.trimStart().startsWith('<!DOCTYPE') || /<div id="root"/.test(body);
  if (!res.ok) { bad(path + ' -> HTTP ' + res.status); return null; }
  if (isHtml) { bad(path + ' returns 200 but serves HTML, not XML (soft-404 via the SPA catch-all rewrite)'); return null; }
  if (!ct.includes('xml')) warn(path + ' content-type is "' + ct + '", expected application/xml');
  const opens = (body.match(/<sitemap>/g) || []).length + (body.match(/<url>/g) || []).length;
  const closes = (body.match(/<\/sitemap>/g) || []).length + (body.match(/<\/url>/g) || []).length;
  if (opens !== closes) { bad(path + ' has unbalanced tags'); return null; }
  ok(path + ' is live XML (' + opens + ' entries, ' + ct.split(';')[0] + ')');
  return body;
}

console.log('');
console.log('Auditing deployed sitemaps at ' + SITE);
console.log('');

/* -- 1. the three current sitemaps -- */
const indexXml = await fetchXml('/sitemap-index.xml');
const staticXml = await fetchXml('/sitemap-static.xml');
const mediaXml = await fetchXml('/sitemap-media.xml');

const allUrls = [];
if (staticXml) allUrls.push(...locs(staticXml));
if (mediaXml) allUrls.push(...locs(mediaXml));

/* -- 2. the URLs we DELETED must not silently 200 as HTML -- */
const RETIRED = [
  { path: '/sitemap.xml',        to: '/sitemap-index.xml' },
  { path: '/sitemap-anime.xml',  to: '/sitemap-media.xml' },
  { path: '/sitemap-pages.xml',  to: '/sitemap-static.xml' },
];
console.log('');
for (const r of RETIRED) {
  const res = await get(SITE + r.path);
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (res.status === 404 || res.status === 410) {
    ok(r.path + ' is gone (' + res.status + ')');
  } else if (res.status >= 300 && res.status < 400) {
    ok(r.path + ' redirects to ' + (res.headers.get('location') || '?'));
  } else if (ct.includes('xml')) {
    warn(r.path + ' still serves XML (HTTP ' + res.status + ') - is this a leftover?');
  } else {
    bad(r.path + ' returns HTTP ' + res.status + ' as ' + (ct.split(';')[0] || 'unknown')
      + '. That is a SOFT 404: crawlers see a 200 and get HTML where they expect XML.'
      + ' Add a redirect to ' + r.to + ' in vercel.json.');
  }
}
/* -- 3. every listed URL must return 200 HTML with a self-canonical -- */
console.log('');
console.log('Checking ' + allUrls.length + ' listed URLs (this takes a minute)...');

const results = await pool(allUrls, async (u) => {
  try {
    const res = await get(u);
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    const body = res.ok ? await res.text() : '';
    const canonical = (body.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i) || [])[1] || '';
    const noindex = /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(body);
    return { u, status: res.status, ct, canonical, noindex, soft404: /<div id="root"\s*>\s*<\/div>/.test(body) && !canonical };
  } catch (err) {
    return { u, status: 0, err: err.message };
  }
});

const byStatus = {};
const noCanonical = [];
const noindexed = [];
const notHtml = [];
for (const r of results) {
  byStatus[r.status] = (byStatus[r.status] || 0) + 1;
  if (r.status !== 200) { bad(r.u.replace(SITE, '') + ' -> HTTP ' + r.status + (r.err ? ' (' + r.err + ')' : '')); continue; }
  if (!r.ct.includes('text/html')) notHtml.push(r.u);
  if (!r.canonical) noCanonical.push(r.u);
  else if (r.canonical.replace(/\/$/, '') !== r.u.replace(/\/$/, '')) noCanonical.push(r.u + ' (points to ' + r.canonical + ')');
  if (r.noindex) noindexed.push(r.u);
}
for (const [code, n] of Object.entries(byStatus)) info('HTTP ' + code + ': ' + n + ' URLs');

if (noCanonical.length) { bad(noCanonical.length + ' URL(s) missing a self-referencing canonical:'); noCanonical.slice(0, 8).forEach(u => info('  ' + u)); if (noCanonical.length > 8) info('  ...and ' + (noCanonical.length - 8) + ' more'); }
else ok('every URL returns 200 with a self-referencing canonical');

if (noindexed.length) { bad(noindexed.length + ' URL(s) in the sitemap are marked noindex:'); noindexed.slice(0, 8).forEach(u => info('  ' + u)); }
else ok('no URL in the sitemap is marked noindex');

if (notHtml.length) warn(notHtml.length + ' URL(s) did not return text/html: ' + notHtml.slice(0, 3).join(', '));
else ok('every URL returns text/html');

/* -- summary -- */
console.log('');
if (failures) {
  console.log('audit-sitemap-live: ' + failures + ' FAILURE(S)'
    + (warnings ? ', ' + warnings + ' warning(s)' : ''));
  process.exit(1);
}
console.log('audit-sitemap-live: all checks passed'
  + (warnings ? ' (' + warnings + ' warning(s))' : ''));