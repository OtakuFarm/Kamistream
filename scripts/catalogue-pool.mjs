/* ============================================================================
 * CATALOGUE POOL — the prerenderer's data source, when the catalogue is filled.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────
 * The build currently fetches its anime from Jikan at 3 req/sec, which caps
 * the site at ~200 titles (8 pages x 25). That ceiling is not a design
 * choice, it is a rate limit — and it is also why builds are slow and
 * fragile. While writing this, Jikan returned 504 on every endpoint for
 * stretches of several minutes, and the build has a fallback chain three
 * layers deep because of it.
 *
 * Once titles are imported into anime_catalogue, the pool is one indexed
 * SELECT. No rate limit, no third-party dependency, no fallback chain, and
 * the ceiling becomes "however many you imported".
 *
 * ── WHY IT RETURNS JIKAN-SHAPED OBJECTS ───────────────────────────────────
 * collectPool() already returns raw /top/anime objects, and the AniList
 * fallback normalises to exactly that shape. So every downstream builder —
 * genre derivation, category lists, animeDoc, the "anime like" pages, the
 * year pages, the sitemap sidecar — is already source-agnostic.
 *
 * This module therefore returns the same shape rather than introducing a
 * new one. That is what makes the switch a single function call instead of a
 * rewrite of ~1,400 lines of document builders, and it is why the change
 * is reversible: point collectPool() back at Jikan and nothing else moves.
 *
 * It is the Node-side twin of rowToJikan() in src/lib/catalogue.ts. That
 * one is TypeScript and the runtime cannot import a build script, so the
 * mapping is duplicated deliberately rather than extracted. The two must
 * agree; the comment below is the contract.
 * ========================================================================= */

import { createClient } from '@supabase/supabase-js';

/* ─── env ─────────────────────────────────────────────────────────────── */

function env(...names) {
  for (const n of names) if (process.env[n]) return process.env[n];
  return null;
}

/** The anon key is enough: RLS only permits reading published rows, which
 *  is exactly what a build should be allowed to do. The service key is
 *  accepted as a fallback for local runs. */
const URL_ = env('SUPABASE_URL', 'VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL');
const KEY_ = env('SUPABASE_SERVICE_KEY', 'VITE_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY');

export function catalogueConfigured() {
  return Boolean(URL_ && KEY_);
}

/* ─── shaping (must match rowToJikan in src/lib/catalogue.ts) ─────────── */

function img(url) {
  const u = url || '';
  return { image_url: u, small_image_url: u, large_image_url: u };
}

/**
 * One anime_catalogue row -> a Jikan /top/anime shaped object.
 *
 * score prefers OUR rating and falls back to MAL's, never the reverse:
 * presenting a third party's number as our own is both misleading and a
 * structured-data violation. Both are still stored, so the detail page can
 * attribute MAL's score honestly if it wants to.
 */
function rowToJikanAnime(row, genres) {
  return {
    mal_id: row.mal_id,
    title: row.title,
    title_english: row.title,
    title_japanese: row.title_japanese,
    title_romaji: row.title_romaji,
    images: {
      jpg: img(row.poster_url),
      webp: img(row.poster_url),
    },
    trailer: {
      youtube_id: row.trailer_id,
      url: row.trailer_id ? `https://www.youtube.com/watch?v=${row.trailer_id}` : null,
    },
    synopsis: row.synopsis,
    type: row.type || 'TV',
    status: row.air_status || 'Finished Airing',
    episodes: row.episodes_total,
    score: row.rating ?? row.mal_score ?? null,
    scored_by: row.popularity,
    rank: row.mal_rank,
    popularity: row.popularity,
    members: row.popularity,
    year: row.year,
    season: row.season ? String(row.season).toUpperCase() : null,
    rating: row.age_rating,
    genres: genres ?? [],
    themes: [],
    demographics: [],
    duration: row.duration_min ? `${row.duration_min} min per ep` : null,
    source: row.source,
    studios: [],
    // Carried through so the builders can reach catalogue-only fields.
    _slug: row.slug,
  };
}
/* ─── the query ───────────────────────────────────────────────────────── */

/** Page through published rows. PostgREST caps a response at 1000 rows, so
 *  anything past that has to be paged or it will silently truncate — and a
 *  silently truncated pool is exactly the class of bug that shrinks a
 *  sitemap without anyone noticing. */
async function fetchRows(db, limit) {
  const PAGE = 1000;
  const out = [];
  for (let from = 0; from < limit; from += PAGE) {
    const want = Math.min(PAGE, limit - from);
    const { data, error } = await db
      .from('anime_catalogue')
      .select('*')
      .eq('status', 'published')
      .order('mal_id', { ascending: true })
      .range(from, from + want - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < want) break;
  }
  return out;
}

/**
 * Genres for a set of rows, keyed by the anime_catalogue id.
 *
 * The join returns a nested object rather than a flat row, so the read is
 * one query for the whole page instead of N. mal_id is carried through
 * because that is what the genre hubs filter on, not the catalogue id.
 */
async function fetchGenres(db, ids) {
  const byRowId = new Map();
  if (!ids.length) return byRowId;
  for (let i = 0; i < ids.length; i += 500) {
    const { data } = await db
      .from('anime_genres')
      .select('anime_id, genres(mal_id, name)')
      .in('anime_id', ids.slice(i, i + 500));
    for (const link of data ?? []) {
      const g = link.genres;
      if (!g) continue;
      const list = byRowId.get(link.anime_id) ?? [];
      list.push({ mal_id: g.mal_id, type: 'anime', name: g.name });
      byRowId.set(link.anime_id, list);
    }
  }
  return byRowId;
}

/**
 * The catalogue pool, in the shape collectPool() already returns.
 *
 * Returns null (not []) when the catalogue is not configured or the query
 * fails, so the caller can fall back to Jikan. An empty array is a real
 * answer — "you have published nothing yet" — and must not be confused with
 * "the database is unreachable".
 */
export async function collectCataloguePool({ limit = 100000, onProgress } = {}) {
  if (!catalogueConfigured()) return null;

  const db = createClient(URL_, KEY_, { auth: { persistSession: false } });

  const rows = await fetchRows(db, limit);
  if (!rows.length) return [];

  const byRowId = await fetchGenres(db, rows.map(r => r.id));
  const pool = rows.map(r => rowToJikanAnime(r, byRowId.get(r.id) ?? []));

  if (onProgress) onProgress(pool);
  return pool;
}

/**
 * Episodes for a set of mal_ids, keyed by mal_id.
 *
 * The episode list is what gives a detail page its internal links, so it is
 * worth having even when the rows carry no per-episode title. Batched to
 * respect PostgREST's URL length limits.
 */
export async function fetchEpisodes(db0, malIds) {
  const out = new Map();
  if (!catalogueConfigured() || !malIds.length) return out;
  const db = db0 ?? createClient(URL_, KEY_, { auth: { persistSession: false } });

  // catalogue_episodes joins to anime_catalogue via anime_id, so resolve the
  // mapping first rather than assuming mal_id is on the episode row.
  const { data: rows } = await db
    .from('catalogue_episodes')
    .select('episode_number, title, air_date, is_filler, anime_catalogue!inner(mal_id)')
    .in('anime_catalogue(mal_id)', malIds);

  for (const r of rows ?? []) {
    const linked = r.anime_catalogue;
    const malId = Array.isArray(linked) ? linked[0]?.mal_id : linked?.mal_id;
    if (!malId) continue;
    const list = out.get(malId) ?? [];
    list.push({
      mal_id: r.episode_number,
      title: r.title || null,
      aired: r.air_date || null,
      filler: !!r.is_filler,
      recap: false,
    });
    out.set(malId, list);
  }
  for (const list of out.values()) list.sort((a, b) => a.mal_id - b.mal_id);
  return out;
}

export const catalogueEnv = { url: URL_, key: KEY_ };