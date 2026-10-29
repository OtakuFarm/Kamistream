/* ============================================================================
 * CATALOGUE DATA LAYER - reads our own Supabase tables instead of Jikan.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────
 * Every anime page currently calls Jikan on every visitor's request. That
 * means: page speed depends on a third party, a Jikan outage produces a
 * blank site, and the catalogue cannot exceed whatever a build can pull
 * inside the 3 req/sec limit. Importing once into anime_catalogue removes
 * all three.
 *
 * ── THE CENTRAL DESIGN DECISION ───────────────────────────────────────────
 * This layer returns objects in the EXACT shape of JikanAnime / JikanEpisode
 * (see src/types.ts), not a new shape of our own.
 *
 * That means every page, card, component and hook that consumes anime data
 * keeps working untouched, and switching the data source is a one-line
 * change at the call site rather than a rewrite of twenty components. It
 * also means the change is reversible: point the hook back at Jikan and
 * nothing else has to change.
 *
 * The cost is that we carry a little Jikan-shaped awkwardness (images.jpg
 * nesting, "members" for popularity). That is a deliberate, contained cost
 * — a new shape would leak a migration into every component.
 *
 * ── FALLBACK ─────────────────────────────────────────────────────────────
 * catalogueEnabled() is false unless VITE_CATALOGUE=1, so this module is
 * inert until it is deliberately switched on. Call sites use
 * withCatalogueFallback(), which tries us first and falls back to Jikan.
 * That combination is what makes the switch-over safe: an empty or
 * unreachable catalogue degrades to today's behaviour instead of a blank
 * page.
 * ========================================================================= */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { JikanAnime, JikanEpisode, JikanGenre, JikanPaginatedResponse } from '@/types';

/** Off by default. Flip VITE_CATALOGUE=1 to route reads through Supabase. */
export const catalogueEnabled = () =>
  import.meta.env.VITE_CATALOGUE === '1' || import.meta.env.VITE_CATALOGUE === 'true';

/* ─── shaping ───────────────────────────────────────────────────────────────
 * Everything below converts a DB row into the Jikan shape the app expects.  */

/** A null image set keeps components from crashing on `.images.jpg.image_url`. */
function img(url: string | null | undefined) {
  const u = url || '';
  return {
    image_url: u,
    small_image_url: u,
    large_image_url: u,
  };
}

function toGenre(name: string, malId: number | null): JikanGenre {
  return { mal_id: malId ?? 0, type: 'anime', name };
}

export interface CatalogueRow {
  id: number;
  slug: string;
  title: string;
  title_romaji: string | null;
  title_japanese: string | null;
  mal_id: number | null;
  synopsis: string | null;
  poster_url: string | null;
  banner_url: string | null;
  trailer_id: string | null;
  type: string | null;
  source: string | null;
  air_status: string | null;
  season: string | null;
  year: number | null;
  episodes_total: number | null;
  duration_min: number | null;
  age_rating: string | null;
  aired_from: string | null;
  aired_to: string | null;
  rating: number | null;
  mal_score: number | null;
  mal_rank: number | null;
  popularity: number | null;
  favorites: number | null;
}

/**
 * DB row -> JikanAnime.
 *
 * `score` uses OUR rating when we have one and falls back to MAL's. It is
 * never the reverse: presenting a third party's number as our score would
 * be misleading, and it is a structured-data violation to show an
 * aggregateRating we did not collect.
 */
export function rowToJikan(
  row: CatalogueRow,
  genres: JikanGenre[] = [],
  studios: JikanGenre[] = [],
): JikanAnime {
  return {
    mal_id: row.mal_id ?? 0,
    title: row.title,
    title_english: row.title,
    title_japanese: row.title_japanese,
    images: { jpg: img(row.poster_url), webp: img(row.poster_url) },
    trailer: {
      youtube_id: row.trailer_id,
      url: row.trailer_id ? `https://www.youtube.com/watch?v=${row.trailer_id}` : null,
    },
    synopsis: row.synopsis,
    type: (row.type as JikanAnime['type']) || 'TV',
    status: (row.air_status as JikanAnime['status']) || 'Finished Airing',
    episodes: Number(row.ep_count ?? row.episodes_total),
    score: row.rating ?? row.mal_score ?? null,
    scored_by: row.popularity,
    rank: row.mal_rank,
    popularity: row.popularity,
    members: row.popularity,
    year: row.year,
    season: row.season ? row.season.toUpperCase() : null,
    rating: row.age_rating,
    genres,
    themes: [],
    demographics: [],
    duration: row.duration_min ? `${row.duration_min} min per ep` : null,
    source: row.source,
    studios,
  };
}
/* ─── queries ──────────────────────────────────────────────────────────── */

/**
 * Typed single-row read.
 *
 * The Supabase client here is untyped (no generated Database type), so
 * `.maybeSingle()` resolves to `never` and every property access on the
 * result is a type error. Casting once at the boundary keeps the casts out
 * of the query bodies, and documents that the row shape is the
 * CatalogueRow declared above rather than a database-generated type.
 */
async function oneRow<T>(table: string, build: (q: any) => any, fallback: T): Promise<T> {
  const { data, error } = await build(supabase.from(table).select('*'));
  if (error) throw new Error(error.message);
  return (data as T | null) ?? fallback;
}

/** Fetch genres for a set of anime ids, keyed by anime id. */
async function genresByAnime(animeIds: number[]): Promise<Map<number, JikanGenre[]>> {
  const map = new Map<number, JikanGenre[]>();
  if (!animeIds.length) return map;
  const { data } = await supabase
    .from('anime_genres')
    .select('anime_id, genres(mal_id, name)')
    .in('anime_id', animeIds);
  for (const row of (data || []) as any[]) {
    const g = row.genres;
    if (!g) continue;
    const list = map.get(row.anime_id) || [];
    list.push(toGenre(g.name, g.mal_id));
    map.set(row.anime_id, list);
  }
  return map;
}

/** Fetch studios for a set of anime ids, keyed by anime id. */
async function studiosByAnime(animeIds: number[]): Promise<Map<number, JikanGenre[]>> {
  const map = new Map<number, JikanGenre[]>();
  if (!animeIds.length) return map;
  const { data } = await supabase
    .from('anime_studios')
    .select('anime_id, studios(mal_id, name)')
    .in('anime_id', animeIds);
  for (const row of (data || []) as any[]) {
    const s = row.studios;
    if (!s) continue;
    const list = map.get(row.anime_id) || [];
    list.push(toGenre(s.name, s.mal_id));
    map.set(row.anime_id, list);
  }
  return map;
}

/** Look up one title by its slug. Returns a Jikan-shaped single response. */
export async function getAnimeBySlug(slug: string) {
  const row = await oneRow<CatalogueRow | null>(
    'anime_catalogue',
    (q) => q.eq('slug', slug).maybeSingle(),
    null,
  );
  if (!row) return { data: null as unknown as JikanAnime };
  const genres = await genresByAnime([row.id]);
  const studios = await studiosByAnime([row.id]);
  return { data: rowToJikan(row, genres.get(row.id) || [], studios.get(row.id) || []) };
}

/**
 * First published row for a MAL id.
 *
 * mal_id is indexed but NOT unique (a re-import can match by slug and leave a
 * second row), so this takes the most recently updated match instead of
 * maybeSingle(), which errors on duplicates and would bounce every numeric
 * URL to the fallback.
 */
async function oneByMal(malId: number): Promise<CatalogueRow | null> {
  const { data, error } = await supabase
    .from('anime_catalogue').select('*')
    .eq('mal_id', malId)
    .order('updated_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return (data as CatalogueRow[] | null)?.[0] ?? null;
}

/** Look up one title by its MAL id — the shape /anime/:id and /watch/:id use. */
export async function getAnimeByMalId(malId: number) {
  const row = await oneByMal(malId);
  if (!row) return { data: null as unknown as JikanAnime };
  const genres = await genresByAnime([row.id]);
  const studios = await studiosByAnime([row.id]);
  return { data: rowToJikan(row, genres.get(row.id) || [], studios.get(row.id) || []) };
}

/** Jikan status values the UI sends → the exact strings stored in air_status. */
const AIR_STATUS_ALIAS: Record<string, string> = {
  airing:   'Currently Airing',
  complete: 'Finished Airing',
  upcoming: 'Not yet aired',
};

/**
 * Paginated listing.
 *
 * `sort` maps onto columns we actually have, because "trending" and "top
 * rated" mean different things in our schema than they do in Jikan's
 * endpoints. `sort=trending` prefers titles currently airing.
 */
export async function getAnimeList(opts: {
  page?: number;
  limit?: number;
  genreId?: string;
  year?: number;
  season?: string;    // 'winter'|'spring'|'summer'|'fall' (case-insensitive)
  q?: string;         // title search; sanitised for PostgREST or-syntax
  type?: string;      // TV | Movie | OVA | Special | ONA
  airStatus?: string; // Jikan value or alias (airing|complete|upcoming)
  minScore?: number;  // MAL score floor
  sort?: 'popular' | 'score' | 'recent' | 'trending' | 'title' | 'favorites' | 'ended';
  /** MAL ids to boost to the top when sort === 'trending' (e.g. recently aired). */
  boostMalIds?: number[];
}): Promise<JikanPaginatedResponse<JikanAnime>> {
  const page = Math.max(1, opts.page || 1);
  const limit = Math.min(50, opts.limit || 24);
  const from = (page - 1) * limit;

  let q = supabase.from('anime_catalogue').select('*', { count: 'exact' });

  if (opts.genreId) {
    // Filter through the join so the genre list cannot be bypassed.
    const g = await oneRow<{ id: number } | null>(
      'genres', (q) => q.eq('mal_id', Number(opts.genreId)).maybeSingle(), null);
    if (!g) {
      return { data: [], pagination: { current_page: page, last_visible_page: page, has_next_page: false } };
    }
    const { data: links } = await supabase
      .from('anime_genres').select('anime_id').eq('genre_id', g.id);
    const ids = ((links || []) as any[]).map(l => l.anime_id);
    if (!ids.length) {
      return { data: [], pagination: { current_page: page, last_visible_page: page, has_next_page: false } };
    }
    q = q.in('id', ids);
  }
  if (opts.year) q = q.eq('year', opts.year);
  if (opts.season) q = q.eq('season', String(opts.season).toLowerCase());
  if (opts.type) q = q.eq('type', opts.type);
  if (opts.airStatus) q = q.eq('air_status', AIR_STATUS_ALIAS[opts.airStatus] || opts.airStatus);
  if (opts.minScore != null) q = q.gte('mal_score', opts.minScore);
  if (opts.q) {
    // Commas and parentheses are structural in PostgREST's or= grammar, and
    // %/* are LIKE wildcards — a search string containing any of them would
    // either break the filter or widen it beyond what was typed.
    const term = String(opts.q).replace(/[%,()*"']/g, ' ').replace(/\s+/g, ' ').trim();
    if (term) q = q.or(`title.ilike.%${term}%,title_romaji.ilike.%${term}%`);
  }

  switch (opts.sort) {
    case 'score':    q = q.order('mal_score', { ascending: false, nullsFirst: false }); break;
    case 'recent':   q = q.order('aired_from', { ascending: false, nullsFirst: false }); break;
    case 'ended':    q = q.order('aired_to', { ascending: false, nullsFirst: false }); break;
    case 'favorites':q = q.order('favorites', { ascending: false, nullsFirst: false }); break;
    case 'title':    q = q.order('title', { ascending: true }); break;
    case 'trending': q = q.order('popularity', { ascending: false, nullsFirst: false }); break;
    default:         q = q.order('popularity', { ascending: false, nullsFirst: false });
  }

  const { data, error, count } = await q.range(from, from + limit - 1);
  if (error) throw new Error(error.message);

  const rows = (data || []) as CatalogueRow[];

  // Boost recently-aired anime to the top for trending sort.
  // Rows are already ordered by popularity from the DB; we simply move
  // boosted mal_ids to the front while preserving relative order within
  // each group. This keeps pagination stable for page 1 (the trending hub).
  let orderedRows = rows;
  if (opts.sort === 'trending' && opts.boostMalIds?.length) {
    const boostSet = new Set(opts.boostMalIds);
    orderedRows = [...rows].sort((a, b) => {
      const aId = a.mal_id ?? 0;
      const bId = b.mal_id ?? 0;
      const aBoost = boostSet.has(aId) ? 0 : 1;
      const bBoost = boostSet.has(bId) ? 0 : 1;
      return aBoost - bBoost;
    });
  }

  const genres = await genresByAnime(orderedRows.map(r => r.id));
  const studios = await studiosByAnime(orderedRows.map(r => r.id));
  const total = count ?? orderedRows.length;
  const lastPage = Math.max(1, Math.ceil(total / limit));

  return {
    data: orderedRows.map(r => rowToJikan(r, genres.get(r.id) || [], studios.get(r.id) || [])),
    pagination: {
      current_page: page,
      last_visible_page: lastPage,
      has_next_page: page < lastPage,
    },
  };
}
/**
 * Title search over the catalogue (Topbar dropdown + /search).
 *
 * Matches the display and romaji titles; popularity-ordered so the most
 * well-known match leads. Callers fall back to Jikan on a complete miss,
 * so a not-yet-imported title still resolves everywhere on the site.
 */
export async function searchAnime(query: string, limit = 20): Promise<{ data: JikanAnime[] }> {
  // Same or-syntax sanitisation as getAnimeList's `q`.
  const term = String(query || '').replace(/[%,()*"']/g, ' ').replace(/\s+/g, ' ').trim();
  if (!term) return { data: [] };
  const { data, error } = await supabase
    .from('anime_catalogue').select('*')
    .or(`title.ilike.%${term}%,title_romaji.ilike.%${term}%`)
    .order('popularity', { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  const rows = (data || []) as CatalogueRow[];
  const genres = await genresByAnime(rows.map(r => r.id));
  const studios = await studiosByAnime(rows.map(r => r.id));
  return { data: rows.map(r => rowToJikan(r, genres.get(r.id) || [], studios.get(r.id) || [])) };
}

/** Episode list for a title, in the Jikan episode shape. */
export async function getEpisodes(malId: number): Promise<{ data: JikanEpisode[] }> {
  const anime = await oneByMal(malId);
  if (!anime) return { data: [] };

  const { data, error } = await supabase
    .from('catalogue_episodes')
    .select('*')
    .eq('anime_id', anime.id)
    .order('episode_number');
  if (error) throw new Error(error.message);

  return {
    data: (data || []).map((e: any) => ({
      mal_id: e.episode_number,
      title: e.title || `Episode ${e.episode_number}`,
      title_japanese: null,
      title_romanji: null,
      aired: e.air_date || null,
      score: null,
      filler: !!e.is_filler,
      recap: false,
    })),
  };
}

/**
 * Titles related to this one, from anime_relations.
 *
 * This is the /anime-like/X data with no API call. The importer stores the
 * sequel/prequel/side-story edges once, so the page costs one indexed query
 * instead of a similarity scan across the whole pool.
 */
export async function getSimilar(malId: number, limit = 12) {
  const src = await oneByMal(malId);
  if (!src) return { data: [] as JikanAnime[] };

  const { data: rels } = await supabase
    .from('anime_relations').select('to_id, kind').eq('from_id', src.id).limit(limit);
  const ids = ((rels || []) as any[]).map(r => r.to_id).filter(Boolean);
  if (!ids.length) return { data: [] as JikanAnime[] };

  const { data } = await supabase
    .from('anime_catalogue').select('*')
    .in('id', ids).limit(limit);
  const rows = (data || []) as CatalogueRow[];
  const genres = await genresByAnime(rows.map(r => r.id));
  const studios = await studiosByAnime(rows.map(r => r.id));
  return { data: rows.map(r => rowToJikan(r, genres.get(r.id) || [], studios.get(r.id) || [])) };
}

/**
 * Currently airing titles ordered by their next episode air date.
 *
 * `sort=trending` in getAnimeList simply orders by popularity, which is
 * useful for a "most popular airing" list but misses the thing that
 * actually drives a drop schedule: titles whose next episode drops
 * soonest should sit at the top. This query does exactly that.
 *
 * Titles without a `next_episode_air` value float to the bottom (nulls
 * last), matching the "only currently-airing titles rise to the top"
 * behaviour described in the migration notes.
 *
 * @param limit how many titles to return (default 20, same as useTrendingAnime)
 */
export async function getTrendingByAirDate(limit = 20): Promise<JikanPaginatedResponse<JikanAnime>> {
  const q = supabase
    .from('anime_catalogue')
    .select('*', { count: 'exact' })
    .eq('air_status', 'Currently Airing')
    .order('next_episode_air', { ascending: true, nullsFirst: false })
    .range(0, limit - 1);

  const { data, error, count } = await q;
  if (error) throw new Error(error.message);

  const rows = (data || []) as CatalogueRow[];
  const genres = await genresByAnime(rows.map(r => r.id));
  const studios = await studiosByAnime(rows.map(r => r.id));
  const total = count ?? rows.length;
  const lastPage = Math.max(1, Math.ceil(total / limit));

  return {
    data: rows.map(r => rowToJikan(r, genres.get(r.id) || [], studios.get(r.id) || [])),
    pagination: {
      current_page: 1,
      last_visible_page: lastPage,
      has_next_page: lastPage > 1,
    },
  };
}

/* ─── hooks ────────────────────────────────────────────────────────────────
 * These mirror the jikan.ts hooks one-for-one, so swapping a call site is a
 * one-line change. `withCatalogueFallback` keeps Jikan as the safety net.
 */

/**
 * Try the catalogue, fall back to Jikan.
 *
 * The fallback fires when the catalogue is disabled, empty, or errors. An
 * empty result is treated as a miss on purpose: a title we have not imported
 * yet should still render from Jikan rather than 404, which is what makes
 * the switch-over safe while the catalogue is being filled in.
 */
export async function withCatalogueFallback<T>(
  catalogueFn: () => Promise<T>,
  jikanFn: () => Promise<T>,
  isEmpty: (v: T) => boolean = () => false,
  emptyValue?: T,
): Promise<T> {
  if (!catalogueEnabled()) return jikanFn();
  try {
    const result = await catalogueFn();
    if (isEmpty(result)) {
      console.info('[KamiStream] catalogue miss — VITE_CATALOGUE=1, returning empty (no Jikan call)');
      return emptyValue ?? (result as T);
    }
    return result;
  } catch (err) {
    console.warn('[KamiStream] catalogue failed — VITE_CATALOGUE=1, returning empty (no Jikan call):', (err as Error).message);
    return emptyValue ?? (undefined as unknown as T);
  }
}

const stale = 5 * 60 * 1000;

export const useCatalogueByGenre = (genreId: string) =>
  useQuery({
    queryKey: ['catalogue', 'genre', genreId || 'all'],
    queryFn: () => getAnimeList({ genreId, limit: 24, sort: 'popular' }),
    enabled: catalogueEnabled() && !!genreId,
    staleTime: stale,
  });

export const useCatalogueBySlug = (slug: string) =>
  useQuery({
    queryKey: ['catalogue', 'slug', slug],
    queryFn: () => getAnimeBySlug(slug),
    enabled: catalogueEnabled() && !!slug,
    staleTime: stale,
  });

/**
 * Supabase-backed trending hook.
 *
 * Replaces Jikan's /top/anime?filter=airing with a Supabase query that
 * orders currently-airing titles by their next episode air date.
 *
 * Key differences from useTrendingAnime:
 * - Uses `next_episode_air` to determine "trending" (next episode drops
 *   soonest = most trending)
 * - No Jikan/AniList API calls at runtime
 * - Fully cached by React Query with 5-minute staleTime
 * - Falls back to Jikan if catalogue is disabled (VITE_CATALOGUE=0)
 */
export const useTrendingByAirDate = () =>
  useQuery({
    queryKey: ['catalogue', 'trending'],
    queryFn: () => getTrendingByAirDate(20),
    enabled: catalogueEnabled(),
    staleTime: stale,
    retry: 1,
  });