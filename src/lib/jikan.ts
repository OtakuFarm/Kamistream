import { useQuery } from '@tanstack/react-query';

const BASE_URL = 'https://api.jikan.moe/v4';

const fetchJikan = async (endpoint: string) => {
  const res = await fetch(`${BASE_URL}${endpoint}`);
  if (!res.ok) throw new Error('Failed to fetch from Jikan');
  const data = await res.json();
  return data;
};

export const useTrendingAnime = () => {
  return useQuery({
    queryKey: ['anime', 'trending'],
    queryFn: () => fetchJikan('/top/anime?filter=airing&limit=20&sfw=true'),
    staleTime: 5 * 60 * 1000,
  });
};

export const useAnimeSearch = (query: string) => {
  return useQuery({
    queryKey: ['anime', 'search', query],
    queryFn: () => fetchJikan(`/anime?q=${encodeURIComponent(query)}&limit=20&sfw=true`),
    enabled: !!query,
    staleTime: 5 * 60 * 1000,
  });
};

export const useAnimeDetail = (malId: number | string) => {
  return useQuery({
    queryKey: ['anime', malId],
    queryFn: () => fetchJikan(`/anime/${malId}/full`),
    enabled: !!malId,
    staleTime: 5 * 60 * 1000,
  });
};

export const useAnimeEpisodes = (malId: number | string) => {
  return useQuery({
    queryKey: ['anime', malId, 'episodes'],
    queryFn: () => fetchJikan(`/anime/${malId}/episodes`),
    enabled: !!malId,
    staleTime: 5 * 60 * 1000,
  });
};

export const useAnimeRecommendations = (malId: number | string) => {
  return useQuery({
    queryKey: ['anime', malId, 'recommendations'],
    queryFn: () => fetchJikan(`/anime/${malId}/recommendations`),
    enabled: !!malId,
    staleTime: 10 * 60 * 1000,
  });
};

export const useAnimeByGenre = (genreId: string) => {
  return useQuery({
    queryKey: ['anime', 'genre', genreId || 'all'],
    queryFn: () =>
      fetchJikan(
        genreId
          ? `/anime?genres=${genreId}&order_by=popularity&limit=24&sfw=true`
          : `/top/anime?limit=24&sfw=true`
      ),
    staleTime: 5 * 60 * 1000,
  });
};
