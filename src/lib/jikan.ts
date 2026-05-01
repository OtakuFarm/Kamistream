import { useQuery } from '@tanstack/react-query';

const BASE_URL = 'https://api.jikan.moe/v4';

const fetchJikan = async (endpoint: string) => {
  const res = await fetch(`${BASE_URL}${endpoint}`);
  if (!res.ok) throw new Error('Failed to fetch from Jikan');
  const data = await res.json();
  return data;
};

// Fetches ALL episode pages (handles 100+ episode anime)
const fetchAllEpisodes = async (malId: number | string) => {
  let page = 1;
  let allEpisodes: any[] = [];
  let hasNextPage = true;

  while (hasNextPage) {
    const res = await fetch(`${BASE_URL}/anime/${malId}/episodes?page=${page}`);
    if (!res.ok) break;
    const data = await res.json();
    const eps = data?.data || [];
    allEpisodes = [...allEpisodes, ...eps];
    hasNextPage = data?.pagination?.has_next_page === true;
    page++;
    // Small delay to respect Jikan rate limit (3 req/s)
    if (hasNextPage) await new Promise(r => setTimeout(r, 350));
  }

  return { data: allEpisodes };
};

export const useTrendingAnime = () =>
  useQuery({
    queryKey: ['anime', 'trending'],
    queryFn: () => fetchJikan('/top/anime?filter=airing&limit=20&sfw=true'),
    staleTime: 5 * 60 * 1000,
  });

export const useTopRatedAnime = () =>
  useQuery({
    queryKey: ['anime', 'top-rated'],
    queryFn: () => fetchJikan('/top/anime?filter=bypopularity&limit=20&sfw=true'),
    staleTime: 5 * 60 * 1000,
  });

export const useSeasonalAnime = () =>
  useQuery({
    queryKey: ['anime', 'seasonal'],
    queryFn: () => fetchJikan('/seasons/now?limit=20&sfw=true'),
    staleTime: 5 * 60 * 1000,
  });

export const useAnimeSearch = (query: string) =>
  useQuery({
    queryKey: ['anime', 'search', query],
    queryFn: () => fetchJikan(`/anime?q=${encodeURIComponent(query)}&limit=20&sfw=true`),
    enabled: !!query,
    staleTime: 5 * 60 * 1000,
  });

export const useAnimeDetail = (malId: number | string) =>
  useQuery({
    queryKey: ['anime', malId],
    queryFn: () => fetchJikan(`/anime/${malId}/full`),
    enabled: !!malId,
    staleTime: 5 * 60 * 1000,
  });

// Now fetches ALL episodes across all pages
export const useAnimeEpisodes = (malId: number | string) =>
  useQuery({
    queryKey: ['anime', malId, 'episodes', 'all'],
    queryFn: () => fetchAllEpisodes(malId),
    enabled: !!malId,
    staleTime: 10 * 60 * 1000,
  });

export const useAnimeRecommendations = (malId: number | string) =>
  useQuery({
    queryKey: ['anime', malId, 'recommendations'],
    queryFn: () => fetchJikan(`/anime/${malId}/recommendations`),
    enabled: !!malId,
    staleTime: 10 * 60 * 1000,
  });

export const useAnimeByGenre = (genreId: string) =>
  useQuery({
    queryKey: ['anime', 'genre', genreId || 'all'],
    queryFn: () =>
      fetchJikan(
        genreId
          ? `/anime?genres=${genreId}&order_by=popularity&limit=24&sfw=true`
          : `/top/anime?limit=24&sfw=true`
      ),
    staleTime: 5 * 60 * 1000,
  });
