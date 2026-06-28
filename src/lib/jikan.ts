import { useQuery } from '@tanstack/react-query';
import type {
  JikanAnime,
  JikanEpisode,
  JikanPaginatedResponse,
  JikanSingleResponse,
  JikanCharacter,
  JikanRecommendation,
} from '@/types';

const BASE_URL = 'https://api.jikan.moe/v4';

// ─────────────────────────────────────────────────────────────────────────────
// Rate-limit queue
// Jikan allows ~3 req/sec. This queue serialises every fetch through a
// token-bucket so multiple hooks mounting simultaneously don't blast 7+
// requests at once and trigger 429s.
// ─────────────────────────────────────────────────────────────────────────────
const MIN_GAP_MS = 350; // ~2.8 req/sec — safely under the 3 req/sec limit
let lastRequestTime = 0;
let pendingQueue: Array<() => void> = [];
let queueRunning = false;

function runQueue() {
  if (queueRunning || pendingQueue.length === 0) return;
  queueRunning = true;
  const next = pendingQueue.shift()!;
  const now = Date.now();
  const wait = Math.max(0, lastRequestTime + MIN_GAP_MS - now);
  setTimeout(() => {
    lastRequestTime = Date.now();
    next();
    queueRunning = false;
    runQueue();
  }, wait);
}

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    pendingQueue.push(() => fn().then(resolve).catch(reject));
    runQueue();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Core fetch helper — retries once on 429 with back-off
// ─────────────────────────────────────────────────────────────────────────────
const fetchJikan = async <T>(endpoint: string): Promise<T> => {
  return enqueue(async () => {
    const res = await fetch(`${BASE_URL}${endpoint}`);

    if (res.status === 429) {
      // Back off and try once more through the queue
      await new Promise(r => setTimeout(r, 1500));
      const retry = await fetch(`${BASE_URL}${endpoint}`);
      if (!retry.ok) throw new Error(`Jikan error (retry): ${retry.status}`);
      return retry.json() as Promise<T>;
    }

    if (!res.ok) throw new Error(`Jikan error: ${res.status}`);
    return res.json() as Promise<T>;
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// Fetch ALL episode pages with retry on rate-limit (429)
// ─────────────────────────────────────────────────────────────────────────────
const fetchAllEpisodes = async (malId: number | string): Promise<{ data: JikanEpisode[] }> => {
  let page = 1;
  let allEpisodes: JikanEpisode[] = [];
  let hasNextPage = true;
  let retries = 0;

  while (hasNextPage) {
    const res = await enqueue(() =>
      fetch(`${BASE_URL}/anime/${malId}/episodes?page=${page}`)
    );

    if (res.status === 429) {
      if (retries >= 3) break;
      retries++;
      await new Promise(r => setTimeout(r, 1500 * retries));
      continue;
    }

    if (!res.ok) break;
    retries = 0;

    const data = await res.json() as JikanPaginatedResponse<JikanEpisode>;
    const eps = data?.data || [];

    if (eps.length === 0) break;

    allEpisodes = [...allEpisodes, ...eps];
    hasNextPage = data?.pagination?.has_next_page === true;
    page++;

    if (hasNextPage) await new Promise(r => setTimeout(r, 400));
  }

  // If Jikan has no episode list, generate numbered episodes from anime details
  if (allEpisodes.length === 0) {
    const detail = await fetchJikan<JikanSingleResponse<JikanAnime>>(`/anime/${malId}`);
    const count = detail?.data?.episodes;
    if (count && count > 0) {
      allEpisodes = Array.from({ length: count }, (_, i): JikanEpisode => ({
        mal_id: i + 1,
        title: `Episode ${i + 1}`,
        title_japanese: null,
        title_romanji: null,
        aired: null,
        score: null,
        filler: false,
        recap: false,
      }));
    }
  }

  return { data: allEpisodes };
};

// ─────────────────────────────────────────────────────────────────────────────
// AniList fallback helpers (inline — avoids circular imports)
// When Jikan throws, we automatically retry against AniList and normalise
// the response into the same Jikan shape so every component works unchanged.
// ─────────────────────────────────────────────────────────────────────────────
async function queryAL(query: string, vars: Record<string, any> = {}) {
  const res = await fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables: vars }),
  });
  if (!res.ok) throw new Error('AniList error');
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0]?.message);
  return json;
}

const AL_FIELDS = `id idMal title{romaji english} coverImage{large extraLarge medium}
  format episodes averageScore status seasonYear genres
  studios(isMain:true){nodes{name}} description(asHtml:false)`;

function alToJikan(m: any) {
  return {
    mal_id:   m.idMal ?? m.id,
    title:    m.title?.english || m.title?.romaji || 'Unknown',
    score:    m.averageScore ? +(m.averageScore / 10).toFixed(1) : null,
    episodes: m.episodes ?? null,
    type:     ({ TV:'TV',MOVIE:'Movie',OVA:'OVA',ONA:'ONA',SPECIAL:'Special' } as any)[m.format] || 'TV',
    status:   ({ RELEASING:'Currently Airing',FINISHED:'Finished Airing',NOT_YET_RELEASED:'Not yet aired' } as any)[m.status] || '',
    year:     m.seasonYear ?? null,
    synopsis: m.description?.replace(/<[^>]+>/g,'') ?? null,
    genres:   (m.genres||[]).map((g:string)=>({name:g})),
    studios:  (m.studios?.nodes||[]).map((s:any)=>({name:s.name})),
    images: {
      webp: { large_image_url: m.coverImage?.extraLarge||m.coverImage?.large||'', image_url: m.coverImage?.medium||'', small_image_url: m.coverImage?.medium||'' },
      jpg:  { large_image_url: m.coverImage?.extraLarge||m.coverImage?.large||'', image_url: m.coverImage?.medium||'', small_image_url: m.coverImage?.medium||'' },
    },
  };
}

async function alPage(query: string, vars: Record<string,any>) {
  const d = await queryAL(query, vars);
  const pg = d.data.Page;
  return {
    data: pg.media.map(alToJikan),
    pagination: { current_page: pg.pageInfo.currentPage, last_visible_page: pg.pageInfo.lastPage, has_next_page: pg.pageInfo.hasNextPage },
  };
}

// withALFallback — runs jikanFn first; on failure runs anilistFn
async function withALFallback<T>(jikanFn: () => Promise<T>, anilistFn: () => Promise<T>): Promise<T> {
  try {
    return await jikanFn();
  } catch (err) {
    console.warn('[KamiStream] Jikan failed, switching to AniList fallback:', (err as Error).message);
    return anilistFn();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Hooks — each tries Jikan first, falls back to AniList automatically
// ─────────────────────────────────────────────────────────────────────────────

export const useTrendingAnime = () =>
  useQuery({
    queryKey: ['anime', 'trending'],
    queryFn: () => withALFallback(
      () => fetchJikan('/top/anime?filter=airing&limit=20&sfw=true'),
      () => alPage(
        `query($p:Int){Page(page:$p,perPage:20){pageInfo{currentPage lastPage hasNextPage}media(type:ANIME,sort:TRENDING_DESC,status:RELEASING,isAdult:false){${AL_FIELDS}}}}`,
        { p: 1 }
      )
    ),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

export const useTopRatedAnime = () =>
  useQuery({
    queryKey: ['anime', 'top-rated'],
    queryFn: () => withALFallback(
      () => fetchJikan('/top/anime?filter=bypopularity&limit=20&sfw=true'),
      () => alPage(
        `query($p:Int){Page(page:$p,perPage:20){pageInfo{currentPage lastPage hasNextPage}media(type:ANIME,sort:SCORE_DESC,isAdult:false){${AL_FIELDS}}}}`,
        { p: 1 }
      )
    ),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

export const useSeasonalAnime = () => {
  const now = new Date();
  const m = now.getMonth();
  const season = m < 3 ? 'WINTER' : m < 6 ? 'SPRING' : m < 9 ? 'SUMMER' : 'FALL';
  const year = now.getFullYear();
  return useQuery({
    queryKey: ['anime', 'seasonal'],
    queryFn: () => withALFallback(
      () => fetchJikan('/seasons/now?limit=20&sfw=true'),
      () => alPage(
        `query($p:Int,$s:MediaSeason,$y:Int){Page(page:$p,perPage:20){pageInfo{currentPage lastPage hasNextPage}media(type:ANIME,season:$s,seasonYear:$y,sort:POPULARITY_DESC,isAdult:false){${AL_FIELDS}}}}`,
        { p: 1, s: season, y: year }
      )
    ),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
};

export const useAnimeSearch = (query: string) =>
  useQuery({
    queryKey: ['anime', 'search', query],
    queryFn: () => withALFallback(
      () => fetchJikan(`/anime?q=${encodeURIComponent(query)}&limit=20&sfw=true`),
      () => alPage(
        `query($p:Int,$q:String){Page(page:$p,perPage:20){pageInfo{currentPage lastPage hasNextPage}media(type:ANIME,search:$q,sort:POPULARITY_DESC,isAdult:false){${AL_FIELDS}}}}`,
        { p: 1, q: query }
      )
    ),
    enabled: !!query,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

export const useAnimeDetail = (malId: number | string) =>
  useQuery({
    queryKey: ['anime', malId],
    queryFn: () => withALFallback(
      () => fetchJikan(`/anime/${malId}/full`),
      async () => {
        const d = await queryAL(
          `query($m:Int){Media(idMal:$m,type:ANIME){${AL_FIELDS} trailer{site id} bannerImage
            relations{edges{relationType(version:2) node{id idMal title{english romaji} coverImage{large} format episodes status}}}
          }}`,
          { m: Number(malId) }
        );
        return { data: alToJikan(d.data.Media) };
      }
    ),
    enabled: !!malId,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

export const useAnimeEpisodes = (malId: number | string) =>
  useQuery<{ data: JikanEpisode[] }>({
    queryKey: ['anime', malId, 'episodes', 'all'],
    queryFn: () => withALFallback(
      () => fetchAllEpisodes(malId),
      // AniList doesn't have episode lists — generate numbered stubs
      async () => {
        const d = await queryAL(
          `query($m:Int){Media(idMal:$m,type:ANIME){episodes nextAiringEpisode{episode}}}`,
          { m: Number(malId) }
        );
        const count = d.data?.Media?.episodes || d.data?.Media?.nextAiringEpisode?.episode || 0;
        return {
          data: Array.from({ length: count }, (_, i): JikanEpisode => ({
            mal_id: i + 1, title: `Episode ${i + 1}`,
            title_japanese: null, title_romanji: null,
            aired: null, score: null, filler: false, recap: false,
          })),
        };
      }
    ),
    enabled: !!malId,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

export const useAnimeRecommendations = (malId: number | string) =>
  useQuery({
    queryKey: ['anime', malId, 'recommendations'],
    queryFn: () => withALFallback(
      () => fetchJikan(`/anime/${malId}/recommendations`),
      async () => {
        const d = await queryAL(
          `query($m:Int){Media(idMal:$m,type:ANIME){recommendations(perPage:12){nodes{mediaRecommendation{${AL_FIELDS}}}}}}`,
          { m: Number(malId) }
        );
        const recs = d.data?.Media?.recommendations?.nodes || [];
        return {
          data: recs
            .filter((r: any) => r.mediaRecommendation)
            .map((r: any) => ({ entry: alToJikan(r.mediaRecommendation), votes: 0 })),
        };
      }
    ),
    enabled: !!malId,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

export const useAnimeByGenre = (genreId: string) => {
  const GENRE_MAP: Record<string, string> = {
    '1':'Action','2':'Adventure','4':'Comedy','8':'Drama','10':'Fantasy',
    '22':'Romance','24':'Sci-Fi','36':'Slice of Life','30':'Sports',
    '37':'Supernatural','41':'Thriller',
  };
  return useQuery({
    queryKey: ['anime', 'genre', genreId || 'all'],
    queryFn: () => withALFallback(
      () => fetchJikan(genreId
        ? `/anime?genres=${genreId}&order_by=popularity&limit=24&sfw=true`
        : `/top/anime?limit=24&sfw=true`
      ),
      () => alPage(
        genreId
          ? `query($p:Int,$g:String){Page(page:$p,perPage:24){pageInfo{currentPage lastPage hasNextPage}media(type:ANIME,genre:$g,sort:POPULARITY_DESC,isAdult:false){${AL_FIELDS}}}}`
          : `query($p:Int){Page(page:$p,perPage:24){pageInfo{currentPage lastPage hasNextPage}media(type:ANIME,sort:POPULARITY_DESC,isAdult:false){${AL_FIELDS}}}}`,
        genreId ? { p: 1, g: GENRE_MAP[genreId] || genreId } : { p: 1 }
      )
    ),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
};
