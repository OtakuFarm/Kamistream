import React from 'react';
import { useLocation } from 'wouter';
import { useWatchlist } from '@/hooks/useWatchlist';

interface AnimeListCardProps {
  anime: any;
  badge?: string;
  badgeColor?: string;
}

export function AnimeListCard({ anime, badge, badgeColor = 'var(--pink)' }: AnimeListCardProps) {
  const { toggleWatchlist, isInWatchlist } = useWatchlist();
  const [, setLocation] = useLocation();
  const isSaved = isInWatchlist(anime.mal_id);

  return (
    <div
      className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-[var(--bg3)] cursor-pointer transition-colors group"
      onClick={() => setLocation(`/anime/${anime.mal_id}`)}
    >
      {/* Poster thumbnail */}
      <div className="relative w-10 h-14 rounded shrink-0 overflow-hidden bg-[var(--bg3)]">
        <img
          src={anime.images?.webp?.large_image_url || anime.images?.jpg?.large_image_url || anime.image_url}
          alt={anime.title}
          loading="lazy"
          onError={(e) => { e.currentTarget.style.opacity = '0'; }}
          className="w-full h-full object-cover"
        />
        {badge && (
          <div className="absolute bottom-0 left-0 right-0 text-center text-[7px] font-black py-0.5"
            style={{ background: badgeColor, color: 'white' }}>
            {badge}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-bold text-white line-clamp-2 leading-tight group-hover:text-[var(--pink)] transition-colors">
          {anime.title}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          {anime.score && (
            <span className="text-[9px] text-[var(--gold)] font-bold">★ {anime.score}</span>
          )}
          {anime.type && (
            <span className="text-[9px] text-[var(--text3)]">· {anime.type}</span>
          )}
          {anime.episodes && (
            <span className="text-[9px] text-[var(--text3)]">· {anime.episodes} eps</span>
          )}
          {anime.year && (
            <span className="text-[9px] text-[var(--text3)]">· {anime.year}</span>
          )}
        </div>
      </div>

      {/* Watchlist */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          toggleWatchlist({ mal_id: anime.mal_id, title: anime.title, image_url: anime.images?.webp?.large_image_url || '', episodes: anime.episodes, score: anime.score });
        }}
        className={`shrink-0 w-6 h-6 rounded flex items-center justify-center text-[10px] transition-all ${isSaved ? 'bg-[var(--pink)] text-white' : 'bg-[var(--bg3)] text-[var(--text3)] hover:text-[var(--pink)]'}`}
      >
        {isSaved ? '✓' : '+'}
      </button>
    </div>
  );
}
