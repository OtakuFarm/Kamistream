import { useQuery } from '@tanstack/react-query';

const BASE_URL = 'https://api.jikan.moe/v4';

const fetchJikan = async (endpoint: string) => {
  const res = await fetch(`${BASE_URL}${endpoint}`);
  if (!res.ok) throw new Error(`Jikan error: ${res.status}`);
  return res.json();
};

// Fetches ALL episode pages with retry on rate-limit (429)
const fetchAllEpisodes = async (malId: number | string) => {
  let page = 1;
  let allEpisodes: any[] = [];
  let hasNextPage = true;
  let retries = 0;

  while (hasNextPage) {
    const res = await fetch(`${BASE_URL}/anime/${malId}/episodes?page=${page}`);

    // Rate limited — wait and retry
    if (res.status === 429) {
      if (retries >= 3) break;
      retries++;
      await new Promise(r => setTimeout(r, 1500 * retries));
      continue;
    }

    if (!res.ok) break;
    retries = 0;

    const data = await res.json();
    const eps = data?.data || [];

    // Some anime return empty episodes even with has_next_page = true
    if (eps.length === 0) break;

    allEpisodes = [...allEpisodes, ...eps];
    hasNextPage = data?.pagination?.has_next_page === true;
    page++;

    // Delay between pages to respect rate limit
    if (hasNextPage) await new Promise(r => setTimeout(r, 400));
  }

  // If Jikan has no episode list, generate numbered episodes from anime details
  if (allEpisodes.length === 0) {
    const detail = await fetchJikan(`/anime/${malId}`);
    const count = detail?.data?.episodes;
    if (count && count > 0) {
      allEpisodes = Array.from({ length: count }, (_, i) => ({
        mal_id: i + 1,
        title: `Episode ${i + 1}`,
        title_japanese: null,
        aired: null,
        score: null,
        filler: false,
        recap: false,
      }));
    }
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

export const useAnimeEpisodes = (malId: number | string) =>
  useQuery({
    queryKey: ['anime', malId, 'episodes', 'all'],
    queryFn: () => fetchAllEpisodes(malId),
    enabled: !!malId,
    staleTime: 10 * 60 * 1000,
    retry: 2,
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
