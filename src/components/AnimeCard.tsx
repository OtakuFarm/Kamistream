import React from 'react';
import { Link } from 'wouter';
import { Play, Plus, Check } from 'lucide-react';
import { useWatchlist } from '@/hooks/useWatchlist';
import { useWatchHistory } from '@/hooks/useWatchHistory';

interface AnimeCardProps {
  anime: any;
}

export function AnimeCard({ anime }: AnimeCardProps) {
  const { toggleWatchlist, isInWatchlist } = useWatchlist();
  const { getRecentAnime } = useWatchHistory();
  const isSaved = isInWatchlist(anime.mal_id);

  // Progress bar — last watched ep / total eps
  const history = getRecentAnime();
  const lastWatched = history.find(h => h.mal_id === anime.mal_id);
  const totalEps = anime.episodes;
  const progressPct = lastWatched && totalEps
    ? Math.min(100, Math.round((lastWatched.ep_id / totalEps) * 100))
    : lastWatched && !totalEps
      ? null   // ongoing — show indicator but no %
      : null;

  return (
    <div className="tr-card group relative bg-[var(--card)] rounded-xl overflow-hidden cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-[var(--purple)]/20">
      <Link href={`/anime/${anime.mal_id}`} className="block aspect-[3/4] relative overflow-hidden">
        <img
          src={anime.images?.webp?.large_image_url || anime.images?.jpg?.large_image_url}
          alt={anime.title}
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#000000e6] via-transparent opacity-60 group-hover:opacity-80 transition-opacity" />

        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-black/40">
          <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center text-black pl-1 backdrop-blur-sm shadow-lg transform scale-90 group-hover:scale-100 transition-transform">
            <Play className="w-6 h-6 fill-current" />
          </div>
        </div>

        {anime.score && (
          <div className="absolute top-2 left-2 bg-gradient-to-br from-[var(--pink)] to-[var(--purple)] text-white font-heading text-[10px] font-extrabold px-2 py-1 rounded-md shadow-lg backdrop-blur-sm flex items-center gap-1">
            <span className="text-[var(--gold)]">★</span> {anime.score}
          </div>
        )}

        {/* Continue watching badge */}
        {lastWatched && (
          <div className="absolute bottom-0 left-0 right-0">
            {/* Progress bar */}
            {progressPct !== null ? (
              <div className="h-1 bg-white/20">
                <div
                  className="h-full bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            ) : (
              <div className="h-1 bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] opacity-60" />
            )}
            <div className="bg-black/70 backdrop-blur-sm px-2 py-1 text-[9px] font-bold text-[var(--pink)]">
              EP {lastWatched.ep_id} {progressPct !== null ? `· ${progressPct}%` : '· Watching'}
            </div>
          </div>
        )}
      </Link>

      <div className="p-3">
        <h3 className="font-heading text-[13px] font-bold text-white line-clamp-1 mb-1 group-hover:text-[var(--pink)] transition-colors">
          {anime.title}
        </h3>
        <div className="flex items-center justify-between text-[11px] text-[var(--text3)]">
          <span>{anime.episodes ? `${anime.episodes} EPS` : 'Ongoing'}</span>
          <span>{anime.type || 'TV'}</span>
        </div>
      </div>

      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          toggleWatchlist({
            mal_id: anime.mal_id,
            title: anime.title,
            image_url: anime.images?.webp?.large_image_url || '',
            episodes: anime.episodes,
            score: anime.score,
          });
        }}
        className={`absolute top-2 right-2 w-8 h-8 rounded-lg flex items-center justify-center backdrop-blur-md shadow-lg transition-all z-10 ${isSaved ? 'bg-[var(--green)]/90 text-white' : 'bg-black/60 text-white hover:bg-[var(--pink)]/90'}`}
      >
        {isSaved ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
      </button>
    </div>
  );
}
