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