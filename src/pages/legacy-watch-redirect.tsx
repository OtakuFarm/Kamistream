import React from 'react';
import { useLocation } from 'wouter';
import { useAnimeDetail } from '@/lib/jikan';
import { animePath } from '@/lib/seo';

/** Preserve old /watch links while keeping the player on anime detail pages. */
export default function LegacyWatchRedirect() {
  const [location, navigate] = useLocation();
  const match = location.match(/^\/watch\/([^/]+)\/([^/?#]+)/);
  const id = match?.[1] || '';
  const episode = match?.[2] || '1';
  const { data, isLoading } = useAnimeDetail(id);

  React.useEffect(() => {
    if (isLoading || !data?.data) return;
    const anime = data.data;
    navigate(`${animePath(anime.mal_id, anime.title)}?episode=${encodeURIComponent(episode)}`, { replace: true });
  }, [data?.data?.mal_id, isLoading, episode]);

  return <div className="min-h-screen flex items-center justify-center text-[var(--text3)]">Opening episode…</div>;
}