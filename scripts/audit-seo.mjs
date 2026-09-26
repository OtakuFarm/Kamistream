// Read-only live SEO audit. Run: node scripts/audit-seo.mjs
import { writeFileSync } from 'node:fs';

const BASE = 'https://www.kamistream.fun';
// The anime pages moved from /sitemap-anime.xml to /sitemap-media.xml when
// the sitemap architecture was consolidated onto the manifest in
// src/lib/routes.js. Pointing at the old name would 404 the whole audit.
const SITEMAP = `${BASE}/sitemap-media.xml`;
const SAMPLE_SIZE = Number(process.env.SEO_SAMPLE_SIZE || 12);
const results = [];

function decode(s) { return s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>'); }
function slugify(s) { return s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-'); }
function titleFromHtml(html) {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m ? decode(m[1].trim()) : '';
}
function canonicalFromHtml(html) {
  const m = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
  return m ? decode(m[1]) : '';
}
function h1FromHtml(html) {
  const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  return m ? decode(m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()) : '';
}

const sitemapResponse = await fetch(SITEMAP, { signal: AbortSignal.timeout(30000) });
if (!sitemapResponse.ok) throw new Error(`Sitemap failed: ${sitemapResponse.status}`);
const xml = await sitemapResponse.text();
const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => decode(m[1].trim()));
const detail = urls.filter(u => /\/anime\/[^/]+(?:\/[^/]+)?$/.test(u));
const sample = detail.slice(0, SAMPLE_SIZE);

for (const url of sample) {
  try {
    const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(30000) });
    const html = await response.text();
    const title = titleFromHtml(html);
    const h1 = h1FromHtml(html);
    const canonical = canonicalFromHtml(html);
    const notFound = /anime not found/i.test(html);
    const slug = url.split('/anime/')[1]?.split('/')[0] || '';
    const compact = value => value.toLowerCase().replace(/[^a-z0-9]/g, '');
    const compactSlug = compact(slug);
    const compactTitle = compact(`${title} ${h1}`);
    const likelyWrong = !notFound && /\/anime\/[^/]+$/.test(url) && compactSlug.length > 3 && !compactTitle.includes(compactSlug);
    results.push({ url, status: response.status, title, h1, canonical, notFound, likelyWrong });
  } catch (error) {
    results.push({ url, error: String(error), notFound: false, likelyWrong: false });
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  sitemap: { url: SITEMAP, total: urls.length, detailPages: detail.length, sampled: sample.length },
  failures: results.filter(r => r.error || r.status !== 200 || r.notFound || r.likelyWrong),
  results,
};
writeFileSync(new URL('../seo-audit-report.json', import.meta.url), JSON.stringify(report, null, 2));
console.log(`Audited ${sample.length} detail URLs from ${detail.length} sitemap detail URLs.`);
console.log(`Failures: ${report.failures.length}`);
for (const row of report.failures) console.log(`- ${row.url}: ${row.error || `status=${row.status} notFound=${row.notFound} likelyWrong=${row.likelyWrong} title=${row.title || 'n/a'}`}`);
if (report.failures.length) process.exitCode = 1;
