import React, { useMemo } from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { useWatchHistory } from '@/hooks/useWatchHistory';
import { Sparkles } from 'lucide-react';
import { AnimeCard } from '@/components/AnimeCard';
import { GridSkeleton } from '@/components/LoadingSkeleton';

// Fetches anime recommendations from Jikan based on a MAL ID
async function fetchRecs(malId: number): Promise<any[]> {
  const res = await fetch(
    `https://api.jikan.moe/v4/anime/${malId}/recommendations`
  );
  if (!res.ok) return [];
  const json = await res.json();
  // Each entry has an .entry object with mal_id, title, images
  return (json?.data || []).slice(0, 12).map((r: any) => r.entry);
}

export function BecauseYouWatched() {
  const { getRecentAnime } = useWatchHistory();

  // Pick the most recently watched anime as the seed
  const recent = useMemo(() => getRecentAnime(), [getRecentAnime]);
  const seed   = recent[0] ?? null; // most recent watch

  const { data: recs, isLoading } = useQuery({
    queryKey: ['recs', seed?.mal_id],
    queryFn:  () => fetchRecs(seed!.mal_id),
    enabled:  !!seed?.mal_id,
    staleTime: 30 * 60 * 1000, // 30 min — recs don't change often
  });

  // Filter out anime already in watch history
  const watchedIds = useMemo(
    () => new Set(recent.map(h => h.mal_id)),
    [recent]
  );

  const filtered = useMemo(
    () => (recs || []).filter((a: any) => !watchedIds.has(a.mal_id)),
    [recs, watchedIds]
  );

  // Don't render if no history or no recs
  if (!seed) return null;
  if (!isLoading && filtered.length === 0) return null;

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[15px] font-heading font-black text-white flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-[var(--purple)]" />
          Because you watched
          <span className="text-[var(--pink)] truncate max-w-[180px] md:max-w-none">
            {seed.title}
          </span>
        </h2>
        <Link href={`/anime/${seed.mal_id}`}>
          <span className="text-[11px] font-bold text-[var(--text3)] hover:text-[var(--pink)] transition-colors cursor-pointer">
            View Anime →
          </span>
        </Link>
      </div>

      {isLoading ? (
        <GridSkeleton />
      ) : (
        <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-7 lg:grid-cols-9 xl:grid-cols-11 gap-2">
          {filtered.map((anime: any) => (
            <AnimeCard key={anime.mal_id} anime={anime} />
          ))}
        </div>
      )}
    </section>
  );
}
