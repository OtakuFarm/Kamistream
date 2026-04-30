import React from 'react';
import { useWatchlist } from '@/hooks/useWatchlist';
import { AnimeCard } from '@/components/AnimeCard';
import { GridSkeleton } from '@/components/LoadingSkeleton';

export default function Watchlist() {
  const { watchlist, loading } = useWatchlist();

  return (
    <div className="p-4 md:p-6 pb-20">
      <h1 className="text-2xl font-heading font-black text-white mb-6">My Watchlist</h1>
      
      {loading ? (
        <GridSkeleton />
      ) : watchlist.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {watchlist.map((anime) => (
            <AnimeCard key={anime.mal_id} anime={{...anime, images: { webp: { large_image_url: anime.image_url }}}} />
          ))}
        </div>
      ) : (
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-12 text-center max-w-xl mx-auto mt-10">
          <div className="w-20 h-20 bg-[var(--bg3)] rounded-2xl flex items-center justify-center text-4xl mx-auto mb-4 border border-[var(--border)] opacity-50">
            📺
          </div>
          <h2 className="text-xl font-heading font-black text-white mb-2">Your shelf is empty</h2>
          <p className="text-[14px] text-[var(--text3)] mb-6">Go discover something obsession-worthy and add it here.</p>
        </div>
      )}
    </div>
  );
}
