// AniList GraphQL helpers for the main site
// ─────────────────────────────────────────────────────────────────────────────
// This file has two roles:
//  1. Original helpers (getNextAiring, getAnimeRelations, getAiringSchedule)
//  2. NEW: AniList-native data fetchers that return Jikan-shaped objects so
//     every component (AnimeCard, home, browse) works without any changes.
//     These are used as automatic fallbacks when Jikan is down.
// ─────────────────────────────────────────────────────────────────────────────
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import type { AniListNextAiring, AiringScheduleItem } from '@/types';

const ANILIST_API = 'https://graphql.anilist.co';

async function queryAniList(query: string, variables: Record<string, any> = {}) {
  const res = await fetch(ANILIST_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error('AniList error');
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0]?.message || 'AniList GraphQL error');
  return json;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shape converter — AniList media → Jikan-shaped object
// AnimeCard and all list components read: mal_id, title, images, score,
// episodes, type. This normalises AniList data to that shape.
// ─────────────────────────────────────────────────────────────────────────────
function toJikanShape(m: any) {
  return {
    mal_id:   m.idMal ?? m.id,   // fall back to AniList id if no MAL id
    title:    m.title?.english || m.title?.romaji || 'Unknown',
    score:    m.averageScore ? +(m.averageScore / 10).toFixed(1) : null,
    episodes: m.episodes ?? null,
    type:     fmtFormat(m.format),
    status:   fmtStatus(m.status),
    year:     m.seasonYear ?? null,
    synopsis: m.description?.replace(/<[^>]+>/g, '') ?? null,
    genres:   (m.genres || []).map((g: string) => ({ name: g })),
    studios:  (m.studios?.nodes || []).map((s: any) => ({ name: s.name })),
    images: {
      webp: {
        large_image_url: m.coverImage?.extraLarge || m.coverImage?.large || '',
        image_url:       m.coverImage?.medium || '',
        small_image_url: m.coverImage?.medium || '',
      },
      jpg: {
        large_image_url: m.coverImage?.extraLarge || m.coverImage?.large || '',
        image_url:       m.coverImage?.medium || '',
        small_image_url: m.coverImage?.medium || '',
      },
    },
    // AniList banner for hero sections
    _bannerImage: m.bannerImage ?? null,
    _alId: m.id,
  };
}

function fmtFormat(f: string): string {
  const map: Record<string, string> = {
    TV: 'TV', TV_SHORT: 'TV', MOVIE: 'Movie',
    OVA: 'OVA', ONA: 'ONA', SPECIAL: 'Special', MUSIC: 'Music',
  };
  return map[f] || f || 'TV';
}

function fmtStatus(s: string): string {
  const map: Record<string, string> = {
    RELEASING:        'Currently Airing',
    FINISHED:         'Finished Airing',
    NOT_YET_RELEASED: 'Not yet aired',
    CANCELLED:        'Cancelled',
    HIATUS:           'On Hiatus',
  };
  return map[s] || s || '';
}

// ─────────────────────────────────────────────────────────────────────────────
// Core AniList page queries (used by hooks below)
// ─────────────────────────────────────────────────────────────────────────────
const MEDIA_FIELDS = `
  id idMal
  title { romaji english }
  coverImage { large extraLarge medium }
  bannerImage
  format episodes averageScore status seasonYear
  genres
  studios(isMain:true) { nodes { name } }
  description(asHtml:false)
`;

async function fetchALTrending(page = 1) {
  const data = await queryAniList(
    `query($p:Int){Page(page:$p,perPage:25){
      pageInfo{currentPage lastPage hasNextPage}
      media(type:ANIME,sort:TRENDING_DESC,status:RELEASING,isAdult:false){${MEDIA_FIELDS}}
    }}`,
    { p: page }
  );
  const pg = data.data.Page;
  return {
    data: pg.media.map(toJikanShape),
    pagination: {
      current_page:      pg.pageInfo.currentPage,
      last_visible_page: pg.pageInfo.lastPage,
      has_next_page:     pg.pageInfo.hasNextPage,
    },
  };
}

async function fetchALTopRated(page = 1) {
  const data = await queryAniList(
    `query($p:Int){Page(page:$p,perPage:25){
      pageInfo{currentPage lastPage hasNextPage}
      media(type:ANIME,sort:SCORE_DESC,isAdult:false){${MEDIA_FIELDS}}
    }}`,
    { p: page }
  );
  const pg = data.data.Page;
  return {
    data: pg.media.map(toJikanShape),
    pagination: {
      current_page:      pg.pageInfo.currentPage,
      last_visible_page: pg.pageInfo.lastPage,
      has_next_page:     pg.pageInfo.hasNextPage,
    },
  };
}

async function fetchALSeasonal(page = 1) {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  const season = month < 3 ? 'WINTER' : month < 6 ? 'SPRING' : month < 9 ? 'SUMMER' : 'FALL';
  const data = await queryAniList(
    `query($p:Int,$s:MediaSeason,$y:Int){Page(page:$p,perPage:25){
      pageInfo{currentPage lastPage hasNextPage}
      media(type:ANIME,season:$s,seasonYear:$y,sort:POPULARITY_DESC,isAdult:false){${MEDIA_FIELDS}}
    }}`,
    { p: page, s: season, y: year }
  );
  const pg = data.data.Page;
  return {
    data: pg.media.map(toJikanShape),
    pagination: {
      current_page:      pg.pageInfo.currentPage,
      last_visible_page: pg.pageInfo.lastPage,
      has_next_page:     pg.pageInfo.hasNextPage,
    },
  };
}

async function fetchALSearch(q: string, page = 1, filters: Record<string, any> = {}) {
  const vars: Record<string, any> = { p: page, q: q || undefined };
  const filterClauses: string[] = ['type:ANIME', 'isAdult:false', 'sort:POPULARITY_DESC'];

  if (q) filterClauses.push('search:$q');
  if (filters.genre) { filterClauses.push('genre:$genre'); vars.genre = filters.genre; }
  if (filters.format) { filterClauses.push('format:$format'); vars.format = filters.format; }
  if (filters.status) { filterClauses.push('status:$status'); vars.status = filters.status; }
  if (filters.year)   { filterClauses.push('seasonYear:$year'); vars.year = parseInt(filters.year); }
  if (filters.minScore) { filterClauses.push('averageScore_greater:$minScore'); vars.minScore = parseInt(filters.minScore) * 10; }

  const sortMap: Record<string, string> = {
    popularity: 'POPULARITY_DESC',
    score:      'SCORE_DESC',
    start_date: 'START_DATE_DESC',
    title:      'TITLE_ROMAJI',
  };
  if (filters.orderBy && sortMap[filters.orderBy]) {
    filterClauses[filterClauses.length - 1] = `sort:${sortMap[filters.orderBy]}`;
  }

  const varDefs = Object.keys(vars).map(k => {
    if (k === 'p') return '$p:Int';
    if (k === 'q') return '$q:String';
    if (k === 'genre') return '$genre:String';
    if (k === 'format') return '$format:MediaFormat';
    if (k === 'status') return '$status:MediaStatus';
    if (k === 'year') return '$year:Int';
    if (k === 'minScore') return '$minScore:Int';
    return '';
  }).filter(Boolean).join(',');

  const data = await queryAniList(
    `query(${varDefs}){Page(page:$p,perPage:25){
      pageInfo{currentPage lastPage hasNextPage}
      media(${filterClauses.join(',')}){${MEDIA_FIELDS}}
    }}`,
    vars
  );
  const pg = data.data.Page;
  return {
    data: pg.media.map(toJikanShape),
    pagination: {
      current_page:      pg.pageInfo.currentPage,
      last_visible_page: pg.pageInfo.lastPage,
      has_next_page:     pg.pageInfo.hasNextPage,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// AniList genre → AniList genre string mapping
// (Jikan uses numeric IDs, AniList uses string names)
// ─────────────────────────────────────────────────────────────────────────────
export const JIKAN_GENRE_TO_ANILIST: Record<string, string> = {
  '1':  'Action',
  '2':  'Adventure',
  '4':  'Comedy',
  '8':  'Drama',
  '10': 'Fantasy',
  '22': 'Romance',
  '24': 'Sci-Fi',
  '36': 'Slice of Life',
  '30': 'Sports',
  '37': 'Supernatural',
  '41': 'Thriller',
};

export const JIKAN_TYPE_TO_ANILIST: Record<string, string> = {
  'TV':      'TV',
  'Movie':   'MOVIE',
  'OVA':     'OVA',
  'Special': 'SPECIAL',
  'ONA':     'ONA',
};

export const JIKAN_STATUS_TO_ANILIST: Record<string, string> = {
  'airing':    'RELEASING',
  'complete':  'FINISHED',
  'upcoming':  'NOT_YET_RELEASED',
};

// ─────────────────────────────────────────────────────────────────────────────
// Hooks — AniList fallback versions of the Jikan hooks
// ─────────────────────────────────────────────────────────────────────────────
export function useALTrendingAnime() {
  return useQuery({
    queryKey: ['al', 'anime', 'trending'],
    queryFn: () => fetchALTrending(1),
    staleTime: 5 * 60 * 1000,
  });
}

export function useALTopRatedAnime() {
  return useQuery({
    queryKey: ['al', 'anime', 'top-rated'],
    queryFn: () => fetchALTopRated(1),
    staleTime: 5 * 60 * 1000,
  });
}

export function useALSeasonalAnime() {
  return useQuery({
    queryKey: ['al', 'anime', 'seasonal'],
    queryFn: () => fetchALSeasonal(1),
    staleTime: 5 * 60 * 1000,
  });
}

export function useALAnimeSearch(query: string) {
  return useQuery({
    queryKey: ['al', 'anime', 'search', query],
    queryFn: () => fetchALSearch(query),
    enabled: !!query,
    staleTime: 5 * 60 * 1000,
  });
}

// Infinite version for browse page
export function useALBrowseInfinite(filters: Record<string, any>, enabled = true) {
  return useInfiniteQuery({
    queryKey: ['al', 'browse', filters],
    queryFn: ({ pageParam = 1 }) => {
      const alFilters: Record<string, any> = {};
      if (filters.genre)    alFilters.genre    = JIKAN_GENRE_TO_ANILIST[filters.genre] || filters.genre;
      if (filters.type)     alFilters.format   = JIKAN_TYPE_TO_ANILIST[filters.type]   || filters.type;
      if (filters.status)   alFilters.status   = JIKAN_STATUS_TO_ANILIST[filters.status] || filters.status;
      if (filters.year)     alFilters.year     = filters.year;
      if (filters.minScore) alFilters.minScore = filters.minScore;
      if (filters.orderBy)  alFilters.orderBy  = filters.orderBy;
      return fetchALSearch(filters.q || '', pageParam as number, alFilters);
    },
    getNextPageParam: (last: any) => {
      const cur = last?.pagination?.current_page ?? 1;
      const max = last?.pagination?.last_visible_page ?? 1;
      return cur >= max ? undefined : cur + 1;
    },
    initialPageParam: 1,
    enabled,
    staleTime: 3 * 60 * 1000,
  });
}

export function useALTopBrowseInfinite(enabled = true) {
  return useInfiniteQuery({
    queryKey: ['al', 'browse', 'top'],
    queryFn: ({ pageParam = 1 }) => fetchALTopRated(pageParam as number),
    getNextPageParam: (last: any) => {
      const cur = last?.pagination?.current_page ?? 1;
      const max = last?.pagination?.last_visible_page ?? 1;
      if (cur * 25 >= 1000 || cur >= max) return undefined;
      return cur + 1;
    },
    initialPageParam: 1,
    enabled,
    staleTime: 10 * 60 * 1000,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Original helpers (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

export async function getNextAiring(malId: number | string): Promise<AniListNextAiring | null> {
  const data = await queryAniList(
    `query($m:Int){Media(idMal:$m,type:ANIME){id nextAiringEpisode{episode airingAt timeUntilAiring}}}`,
    { m: Number(malId) }
  );
  return data?.data?.Media?.nextAiringEpisode || null;
}

export async function getAnimeRelations(malId: number | string): Promise<any[]> {
  try {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        query: `query($m:Int){Media(idMal:$m,type:ANIME){relations{edges{relationType(version:2) node{id idMal title{english romaji} coverImage{large} format episodes status}}}}}`,
        variables: { m: parseInt(String(malId)) },
      }),
    });
    const data = await res.json();
    return data?.data?.Media?.relations?.edges || [];
  } catch { return []; }
}

export async function getAiringSchedule(): Promise<AiringScheduleItem[]> {
  const now = Math.floor(Date.now() / 1000);
  const weekEnd = now + 7 * 24 * 60 * 60;
  const data = await queryAniList(
    `query($s:Int,$e:Int){
      Page(perPage:50){
        airingSchedules(airingAt_greater:$s, airingAt_lesser:$e, sort:TIME){
          airingAt episode timeUntilAiring
          media{
            id idMal title{romaji english} coverImage{large}
            format episodes averageScore status
          }
        }
      }
    }`,
    { s: now, e: weekEnd }
  );
  return data?.data?.Page?.airingSchedules || [];
}
