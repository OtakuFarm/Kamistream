/* Type surface for animeLike.js.
 *
 * The engine is plain .js so that `scripts/prerender.mjs` (Node, at build
 * time) and `src/pages/anime-like.tsx` (Vite, in the browser) import the very
 * same code — one implementation, so the crawlable HTML and the React page can
 * never disagree. This declaration gives TypeScript the same confidence it
 * would have had if the engine were written in TypeScript.
 *
 * Keep in sync with src/lib/animeLike.js.
 */

export interface KamiGenre {
  mal_id: number;
  name: string;
}

/** The Jikan-shaped anime object the whole app already passes around. */
export interface KamiAnime {
  mal_id: number;
  title?: string | null;
  title_english?: string | null;
  synopsis?: string | null;
  images?: {
    jpg?: { image_url?: string | null; large_image_url?: string | null };
    webp?: { image_url?: string | null; large_image_url?: string | null };
  };
  trailer?: { images?: { maximum_image_url?: string | null } } | null;
  genres?: KamiGenre[];
  themes?: KamiGenre[];
  demographics?: KamiGenre[];
  explicit_genres?: KamiGenre[];
  studios?: { name?: string }[];
  score?: number | null;
  episodes?: number | null;
  status?: string | null;
  type?: string | null;
  season?: string | null;
  year?: number | null;
  rank?: number | null;
  aired?: { from?: string | null; to?: string | null; string?: string | null } | null;
}

export interface AnimeLikeMatch {
  anime: KamiAnime;
  /** 0..~19 — see the weights in animeLike.js. */
  score: number;
  sharedGenres: string[];
  /** Human-readable, fact-derived reasons (never invented copy). */
  reasons: string[];
}

export interface SharedGenreCount { name: string; count: number }
export interface ComparisonRow { label: string; source: string; candidate: string }
export interface SimilarOptions { limit?: number; minScore?: number }

/** Below this many matches a page is too thin to be worth publishing. */
export const MIN_MATCHES_FOR_PAGE: number;

export function titleOf(a?: KamiAnime | null): string;
export function genreIds(a?: KamiAnime | null): Set<number>;
export function genreNames(a?: KamiAnime | null): Map<number, string>;
export function mainStudio(a?: KamiAnime | null): string | null;
export function yearOf(a?: KamiAnime | null): number | null;
export function decadeOf(y?: number | null): string | null;
export function episodesOf(a?: KamiAnime | null): number | null;
export function scoreOf(a?: KamiAnime | null): number | null;
export function listWords(items?: (string | null | undefined)[]): string;
export function sharedGenreNames(source?: KamiAnime | null, candidate?: KamiAnime | null): string[];
export function similarityScore(source?: KamiAnime | null, candidate?: KamiAnime | null): number;
export function franchiseKey(title?: string | null): string | null;
export function whySimilar(source?: KamiAnime | null, candidate?: KamiAnime | null): string[];
export function similarAnime(
  source?: KamiAnime | null,
  candidates?: KamiAnime[] | null,
  opts?: SimilarOptions
): AnimeLikeMatch[];
export function topSharedGenres(
  source?: KamiAnime | null,
  matches?: AnimeLikeMatch[] | null,
  k?: number
): SharedGenreCount[];
export function clampText(text?: string | null, max?: number): string;
export function likeHeading(source?: KamiAnime | null): string;
export function likeTitle(source?: KamiAnime | null): string;
export function likeDescription(source?: KamiAnime | null, matches?: AnimeLikeMatch[] | null): string;
export function likeIntro(source?: KamiAnime | null, matches?: AnimeLikeMatch[] | null): string;
export function comparisonRows(
  source?: KamiAnime | null,
  candidate?: KamiAnime | null
): ComparisonRow[];
