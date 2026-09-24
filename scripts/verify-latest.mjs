// Ad-hoc verification harness — NOT shipped to production logic; safe to
// delete after use. Run: node scripts/verify-latest.mjs
import { readFileSync, existsSync } from 'node:fs';

const ok = [];
const fail = [];
const check = (name, cond, extra = '') => (cond ? ok : fail).push(`${name}${extra ? ' — ' + extra : ''}`);

// 1. No leftover chunk markers in api/latest.js
const latestSrc = readFileSync(new URL('../api/latest.js', import.meta.url), 'utf8');
check('api/latest.js: no chunk markers', !/\[\[C\d+\]\]/.test(latestSrc));

// 2. sitemap-pages contains /latest-episodes
const sp = await import(new URL('../api/sitemap-pages.js', import.meta.url));
let spXml = '';
await sp.default({}, {
  setHeader() {}, status() { return this; },
  send(b) { spXml = String(b); },
});
check('sitemap-pages: lists /latest-episodes', spXml.includes('<loc>https://www.kamistream.fun/latest-episodes</loc>'));

// 3. static sitemap contains it too
const staticSm = readFileSync(new URL('../public/sitemap.xml', import.meta.url), 'utf8');
check('public/sitemap.xml: lists /latest-episodes', staticSm.includes('/latest-episodes'));

// 4. vercel.json: rewrites ordered before catch-all + header rule present
const vc = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const rw = vc.rewrites;
const iLatest = rw.findIndex(r => r.source === '/latest-episodes');
const iAssets = rw.findIndex(r => r.source === '/assets/(.*)');
const iCatch  = rw.findIndex(r => r.source === '/(.*)');
check('vercel.json: /latest-episodes rewrite before catch-all', iLatest > -1 && iCatch > -1 && iLatest < iCatch, `iLatest=${iLatest} iCatch=${iCatch}`);
check('vercel.json: /assets 404 rewrite before catch-all', iAssets > -1 && iAssets < iCatch, `iAssets=${iAssets}`);
check('vercel.json: /latest-episodes cache header rule', vc.headers.some(h => h.source === '/latest-episodes'));

// 5. live-run api/latest.js and assert SEO essentials
const latest = await import(new URL('../api/latest.js', import.meta.url));
let body = ''; let latestStatus = 0; const hdrs = {};
await latest.default({ query: {}, url: '/latest-episodes' }, {
  setHeader(k, v) { hdrs[k] = v; },
  status(c) { latestStatus = c; return this; },
  send(b) { body = String(b); },
});
check('api/latest.js: status 200', latestStatus === 200, `got ${latestStatus}`);
check('api/latest.js: content-type html', hdrs['Content-Type']?.includes('text/html'));
check('api/latest.js: cache 30min SWR', hdrs['Cache-Control']?.includes('s-maxage=1800'));
check('api/latest.js: canonical', body.includes('<link rel="canonical" href="https://www.kamistream.fun/latest-episodes" />'));
check('api/latest.js: index robots', body.includes('index, follow, max-image-preview:large'));
check('api/latest.js: h1', body.includes('<h1 class="ks-h1">Latest Anime Episodes</h1>'));
check('api/latest.js: title matches React SEO_TITLE', body.includes('<title>Latest Anime Episodes — Aired in the Last 72 Hours | KamiStream</title>'));
check('api/latest.js: og:url = canonical', body.includes('property="og:url" content="https://www.kamistream.fun/latest-episodes"'));
const jsonLdCount = (body.match(/application\/ld\+json/g) || []).length;
check('api/latest.js: JSON-LD blocks >= 5 (3 site + CollectionPage + ItemList + Breadcrumb)', jsonLdCount >= 5, `got ${jsonLdCount}`);
check('api/latest.js: ItemList present', body.includes('"@type":"ItemList"'));
check('api/latest.js: BreadcrumbList present', body.includes('"@type":"BreadcrumbList"'));
const tiles = body.match(/<li><a href="\/anime\/[^"]+"/g) || [];
check('api/latest.js: tiles rendered', tiles.length > 0, `${tiles.length} tiles`);
check('api/latest.js: no /watch links (noindex pages)', !/href="\/watch\//.test(body));
check('api/latest.js: nav has Latest Episodes', body.includes('href="/latest-episodes">Latest Episodes'));
check('api/latest.js: footer has Latest Episodes', body.split('<footer').pop().includes('/latest-episodes'));
check('api/latest.js: intro copy matches React page', body.includes('Every anime episode released in the last 72 hours, newest first'));
check('api/latest.js: grid heading matches React page', body.includes('Newly released episodes'));
check('api/latest.js: #root present for SPA boot', body.includes('<div id="root"></div>'));
check('api/latest.js: seo-shell present for crawlers', body.includes('id="seo-shell"'));

// 6. asset-404 handler
const a404 = await import(new URL('../api/asset-404.js', import.meta.url));
let b404 = ''; let s404 = 0; const h404 = {};
await a404.default({ query: { path: '/assets/x.js' }, url: '/assets/x.js' }, {
  setHeader(k, v) { h404[k] = v; },
  status(c) { s404 = c; return this; },
  send(b) { b404 = String(b); },
});
check('asset-404: status 404', s404 === 404, `got ${s404}`);
check('asset-404: no-store cache', h404['Cache-Control'] === 'no-store');
check('asset-404: plain body', b404 === 'Not found');

// 7. React pieces
const page = readFileSync(new URL('../src/pages/latest-episodes.tsx', import.meta.url), 'utf8');
check('page: title mirrors API', page.includes("SEO_TITLE = 'Latest Anime Episodes — Aired in the Last 72 Hours'"));
check('page: desc mirrors API', page.includes('SEO_DESC  = \'The newest anime episodes on KamiStream'));
check('page: canonical via useSEO url', page.includes("url: '/latest-episodes'"));
check('page: no nested <a> inside Link', !/<Link[^>]*><a /.test(page));

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
check('App: lazy import', app.includes('import("@/pages/latest-episodes")'));
check('App: route registered', app.includes('path="/latest-episodes"'));

const home = readFileSync(new URL('../src/pages/home.tsx', import.meta.url), 'utf8');
check('home: uses shared hook', home.includes('useRecentlyUpdated(12)'));
check('home: header links to hub', home.includes('title="Recently Updated" color="var(--green)" href="/latest-episodes"'));
check('home: old inline query removed', !home.includes("queryKey: ['home', 'recently-updated']"));
check('home: no stale supabase import', !home.includes("from '@/lib/supabase'"));

const pre = readFileSync(new URL('../scripts/prerender.mjs', import.meta.url), 'utf8');
check('prerender: NAV_LINKS has /latest-episodes', /NAV_LINKS = \[[\s\S]*?\/latest-episodes/.test(pre));
check('prerender: FOOTER_LINKS has /latest-episodes', /FOOTER_LINKS = \[[\s\S]*?\/latest-episodes/.test(pre));
check('prerender: NOT in STATIC_PAGES (would shadow rewrite)', !/path: '\/latest-episodes'/.test(pre));

const top = readFileSync(new URL('../src/components/Topbar.tsx', import.meta.url), 'utf8');
check('Topbar: TOP_NAV has it', top.includes("href: '/latest-episodes'"));
const side = readFileSync(new URL('../src/components/Sidebar.tsx', import.meta.url), 'utf8');
check('Sidebar: NavItem has it', side.includes('href="/latest-episodes"'));
const layout = readFileSync(new URL('../src/components/Layout.tsx', import.meta.url), 'utf8');
check('Layout footer: has it', layout.includes("href: '/latest-episodes'"));

// 8. dist must NOT contain a file that would shadow the rewrite
check('dist: no /latest-episodes static file',
  !existsSync(new URL('../dist/latest-episodes.html', import.meta.url)) &&
  !existsSync(new URL('../dist/latest-episodes/index.html', import.meta.url)));

console.log('\n=== PASS (' + ok.length + ') ===');
ok.forEach(o => console.log('  OK ' + o));
if (fail.length) {
  console.log('\n=== FAIL (' + fail.length + ') ===');
  fail.forEach(f => console.log('  XX ' + f));
  process.exit(1);
}
console.log('\nAll checks passed.');
