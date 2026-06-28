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
// Hooks
// ─────────────────────────────────────────────────────────────────────────────

export const useTrendingAnime = () =>
  useQuery<JikanPaginatedResponse<JikanAnime>>({
    queryKey: ['anime', 'trending'],
    queryFn: () => fetchJikan('/top/anime?filter=airing&limit=20&sfw=true'),
    staleTime: 5 * 60 * 1000,
  });

export const useTopRatedAnime = () =>
  useQuery<JikanPaginatedResponse<JikanAnime>>({
    queryKey: ['anime', 'top-rated'],
    queryFn: () => fetchJikan('/top/anime?filter=bypopularity&limit=20&sfw=true'),
    staleTime: 5 * 60 * 1000,
  });

export const useSeasonalAnime = () =>
  useQuery<JikanPaginatedResponse<JikanAnime>>({
    queryKey: ['anime', 'seasonal'],
    queryFn: () => fetchJikan('/seasons/now?limit=20&sfw=true'),
    staleTime: 5 * 60 * 1000,
  });

export const useAnimeSearch = (query: string) =>
  useQuery<JikanPaginatedResponse<JikanAnime>>({
    queryKey: ['anime', 'search', query],
    queryFn: () => fetchJikan(`/anime?q=${encodeURIComponent(query)}&limit=20&sfw=true`),
    enabled: !!query,
    staleTime: 5 * 60 * 1000,
  });

export const useAnimeDetail = (malId: number | string) =>
  useQuery<JikanSingleResponse<JikanAnime>>({
    queryKey: ['anime', malId],
    queryFn: () => fetchJikan(`/anime/${malId}/full`),
    enabled: !!malId,
    staleTime: 5 * 60 * 1000,
  });

export const useAnimeEpisodes = (malId: number | string) =>
  useQuery<{ data: JikanEpisode[] }>({
    queryKey: ['anime', malId, 'episodes', 'all'],
    queryFn: () => fetchAllEpisodes(malId),
    enabled: !!malId,
    staleTime: 10 * 60 * 1000,
    retry: 2,
  });

export const useAnimeRecommendations = (malId: number | string) =>
  useQuery<{ data: JikanRecommendation[] }>({
    queryKey: ['anime', malId, 'recommendations'],
    queryFn: () => fetchJikan(`/anime/${malId}/recommendations`),
    enabled: !!malId,
    staleTime: 10 * 60 * 1000,
  });

export const useAnimeByGenre = (genreId: string) =>
  useQuery<JikanPaginatedResponse<JikanAnime>>({
    queryKey: ['anime', 'genre', genreId || 'all'],
    queryFn: () =>
      fetchJikan(
        genreId
          ? `/anime?genres=${genreId}&order_by=popularity&limit=24&sfw=true`
          : `/top/anime?limit=24&sfw=true`
      ),
    staleTime: 5 * 60 * 1000,
  });
