/* ═══════════════════════════════════════════════════════════════════
 * Shared SEO constants + URL helpers.
 * Single source of truth so index.html, useSEO, the sitemaps and the
 * internal links never drift apart.
 * ═══════════════════════════════════════════════════════════════════ */

export const SITE_URL = 'https://www.kamistream.fun';

/**
 * Turn an anime title into a short, URL-safe slug.
 * "Demon Slayer: Kimetsu no Yaiba" → "demon-slayer-kimetsu-no-yaiba"
 * Same rules as the admin page generator (jaiSlug) so URLs stay consistent.
 */
export function slugifyTitle(title: string): string {
  return (title || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

/**
 * Anime detail URL. `/anime/:id` is the canonical working route — a slug
 * suffix is appended for descriptive, keyword-rich URLs. The wouter route
 * accepts both shapes, so old links never break.
 */
export function animePath(malId: number | string, title?: string): string {
  if (!malId) return '/browse';
  const s = title ? slugifyTitle(title) : '';
  return s ? `/anime/${malId}/${s}` : `/anime/${malId}`;
}

/**
 * "Anime like X" URL — answers the "anime like <title>" / "anime similar to
 * <title>" queries, which nothing on the site used to target.
 *
 * Same slug rules as animePath(), and the wouter route accepts the slug-less
 * shape too, so /anime-like/:id keeps working if a title ever changes.
 * Mirrored by animeLikeDoc() in scripts/prerender.mjs.
 */
export function animeLikePath(malId: number | string, title?: string): string {
  if (!malId) return '/browse';
  const s = title ? slugifyTitle(title) : '';
  return s ? `/anime-like/${malId}/${s}` : `/anime-like/${malId}`;
}

/**
 * "Best anime of <year>" URL — answers the perennial "best anime of 2024"
 * / "top anime 2019" query class, which nothing on the site used to target.
 *
 * Mirrored by the /best-anime docs built in scripts/prerender.mjs.
 */
export function bestOfYearPath(year: number | string): string {
  const y = Number(year);
  if (!Number.isInteger(y) || y < 1900 || y > 2999) return '/best-anime';
  return `/best-anime/${y}`;
}

/** Index of every published year — the hub that keeps year pages linked. */
export const bestOfYearHubPath = '/best-anime';