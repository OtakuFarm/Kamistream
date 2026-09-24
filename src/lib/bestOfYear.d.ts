/* Type surface for bestOfYear.js.
 *
 * The engine is plain .js so that `scripts/prerender.mjs` (Node, at build
 * time) and `src/pages/best-anime.tsx` (Vite, in the browser) import the very
 * same code — one implementation, so the crawlable HTML and the React page can
 * never disagree. This declaration gives TypeScript the same confidence it
 * would have had if the engine were written in TypeScript.
 *
 * Keep in sync with src/lib/bestOfYear.js.
 */

import type { KamiAnime } from './animeLike';

/** Below this many titles a year page is too thin to be worth publishing. */
export const MIN_TITLES_FOR_YEAR: number;

/** Titles per year page. MUST equal `perPage` in both fetchers. */
export const YEAR_PAGE_SIZE: number;

/** Oldest year a page is built for. */
export const YEAR_START: number;

/** AniList genre name → the MAL id its /genre/:id hub is routed on. */
export const GENRE_IDS: Readonly<Record<string, number>>;

export interface YearGenre { name: string; id: number; count: number }
export interface YearStudio { name: string; count: number }
export interface YearNeighbor { prev: number | null; next: number | null }

/** One ranked row; the caller turns malId into a URL. */
export interface YearRow {
  rank: number;
  name: string;
  raw: string;
  malId: number;
  score: number | null;
  type: string | null;
  episodes: number | null;
  studio: string | null;
  year: number | null;
}

export function yearRange(currentYear?: unknown, start?: number): number[];

export function yearList(
  candidates?: KamiAnime[] | null,
  year?: number | string,
  limit?: number
): KamiAnime[];

/** Same string is used for the H1 and (plus " | KamiStream") the <title>. */
export function yearTitle(year?: number | string): string;

export function yearDescription(
  year?: number | string,
  list?: KamiAnime[] | null
): string;

export function yearGenres(list?: KamiAnime[] | null, k?: number): YearGenre[];

export function topStudios(list?: KamiAnime[] | null, k?: number): YearStudio[];

export function yearIntro(
  year?: number | string,
  list?: KamiAnime[] | null
): string;

export function yearNeighbors(
  year?: number | string,
  years?: (number | null)[] | null
): YearNeighbor;

export function rankedRows(list?: KamiAnime[] | null): YearRow[];

export function hubHeading(): string;
export function hubTitle(): string;
export function hubDescription(years?: (number | null)[] | null): string;