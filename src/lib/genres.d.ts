/* Type surface for genres.js.
 *
 * The catalogue is plain .js because three different consumers import the very
 * same file: the Vite/React bundle, `scripts/prerender.mjs` (Node, at build
 * time) and `api/sitemap-pages.js` (Vercel serverless). One implementation
 * means the UI, the crawlable HTML and the sitemaps can never disagree about
 * which /genre/:id pages exist. This declaration gives TypeScript the same
 * confidence it would have had if the catalogue were written in TypeScript.
 *
 * Keep in sync with src/lib/genres.js.
 */

/** One publishable genre hub: the MAL id its URL is routed on, and its name. */
export interface PopularGenre { readonly id: number; readonly name: string }

/** Every MAL anime genre id → name (59 entries). For normalization only. */
export const GENRE_NAMES_BY_ID: Readonly<Record<string, string>>;

/** Lowercased genre name → MAL id, from the full table. */
export const GENRE_ID_BY_NAME: Readonly<Record<string, number>>;

/** The genres that get a hub page, a chip, a sitemap entry and a prerender. */
export const POPULAR_GENRES: ReadonlyArray<PopularGenre>;

/** POPULAR_GENRES sorted by name — the chip order shared by React + prerender. */
export const POPULAR_GENRES_BY_NAME: ReadonlyArray<PopularGenre>;

/** Public id → name (string keys, so POPULAR_GENRE_NAMES_BY_ID['7'] works). */
export const POPULAR_GENRE_NAMES_BY_ID: Readonly<Record<string, string>>;

/** The public ids as strings, in POPULAR_GENRES order. */
export const POPULAR_GENRE_IDS: ReadonlyArray<string>;

/** Jikan's explicit genres (9 Ecchi, 12 Hentai) — fetched without `sfw`. */
export const ADULT_GENRE_IDS: ReadonlyArray<number>;

/** Adult ids whose AniList catalogue needs `isAdult:true` (12 Hentai only). */
export const ANILIST_ADULT_GENRE_IDS: ReadonlyArray<number>;

/**
 * True for the adult genres (id '9'/'12' or the names 'Ecchi'/'Hentai'):
 * their listings must be requested without Jikan's sfw flag.
 */
export function isAdultGenre(idOrName: string | number | null | undefined): boolean;

/** True for Hentai only: that AniList query must run with isAdult:true. */
export function requiresAniListAdultFilter(idOrName: string | number | null | undefined): boolean;

/** True when /genre/:id is a page we publish — gate every genre link on it. */
export function isPopularGenre(id: string | number | null | undefined): boolean;

/** Display name for a public genre id, or '' when the id is not one of ours. */
export function popularGenreName(id: string | number | null | undefined): string;

/** Public id for a genre name (case-insensitive), or null when unsupported. */
export function popularGenreIdByName(name: string | null | undefined): string | null;
