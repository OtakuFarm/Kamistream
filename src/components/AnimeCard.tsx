import React, { useState } from "react";
import { useLocation } from "wouter";
import { Plus, Check, Play } from "lucide-react";
import { useWatchlist } from "@/hooks/useWatchlist";
import { useWatchHistory } from "@/hooks/useWatchHistory";

interface AnimeCardProps {
  anime: any;
}

export function AnimeCard({ anime }: AnimeCardProps) {
  const { toggleWatchlist, isInWatchlist } = useWatchlist();
  const { getRecentAnime } = useWatchHistory();
  const [, setLocation]    = useLocation();
  const [imgError, setImgError] = useState(false);
  const isSaved = isInWatchlist(anime.mal_id);

  const history     = getRecentAnime();
  const lastWatched = history.find((h: any) => h.mal_id === anime.mal_id);
  const totalEps    = anime.episodes;
  const progressPct =
    lastWatched && totalEps
      ? Math.min(100, Math.round((lastWatched.ep_id / totalEps) * 100))
      : null;

  // Prefer WebP large, fallback to JPG large, then WebP small
  const imgSrc = !imgError
    ? (anime.images?.webp?.large_image_url ||
       anime.images?.jpg?.large_image_url  ||
       anime.images?.webp?.image_url       || "")
    : "";

  return (
    <div
      className="group relative bg-[var(--card)] rounded-xl overflow-hidden cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/50"
      onClick={() => setLocation(`/anime/${anime.mal_id}`)}
    >
      {/* Poster */}
      <div className="relative aspect-[2/3] overflow-hidden bg-[var(--bg3)]">
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={anime.title}
            loading="lazy"
            decoding="async"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          // Placeholder when image fails
          <div className="w-full h-full flex items-center justify-center text-[var(--text3)] text-[10px] font-bold px-2 text-center leading-snug">
            {anime.title}
          </div>
        )}

        {/* Gradient overlay on hover */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />

        {/* Play button on hover */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <div className="w-10 h-10 bg-[var(--pink)] rounded-full flex items-center justify-center shadow-xl shadow-[var(--pink)]/40">
            <Play className="w-4 h-4 fill-white text-white ml-0.5" />
          </div>
        </div>

        {/* Score badge */}
        {anime.score && (
          <div className="absolute top-1.5 left-1.5 bg-black/75 backdrop-blur-sm text-[9px] font-black px-1.5 py-0.5 rounded text-[var(--gold)] flex items-center gap-0.5">
            ★ {anime.score}
          </div>
        )}

        {/* Type badge */}
        {anime.type && (
          <div className="absolute top-1.5 right-7 bg-[var(--purple)]/80 backdrop-blur-sm text-[8px] font-black px-1.5 py-0.5 rounded text-white">
            {anime.type}
          </div>
        )}

        {/* Watchlist button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleWatchlist({
              mal_id:    anime.mal_id,
              title:     anime.title,
              image_url: anime.images?.webp?.large_image_url || anime.images?.jpg?.large_image_url || "",
              episodes:  anime.episodes,
              score:     anime.score,
            });
          }}
          className={`absolute top-1.5 right-1.5 w-6 h-6 rounded flex items-center justify-center transition-all z-10 ${
            isSaved
              ? "bg-[var(--pink)] text-white"
              : "bg-black/60 text-white/70 hover:bg-[var(--pink)] hover:text-white"
          }`}
        >
          {isSaved ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
        </button>

        {/* Progress bar */}
        {progressPct !== null && (
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/20">
            <div className="h-full bg-[var(--pink)]" style={{ width: `${progressPct}%` }} />
          </div>
        )}

        {/* Latest EP badge */}
        {anime.latestEp && (
          <div className="absolute bottom-1.5 left-1.5 bg-[var(--green)] text-black text-[8px] font-black px-1.5 py-0.5 rounded">
            EP {anime.latestEp}
          </div>
        )}
      </div>

      {/* Title */}
      <div className="p-1.5 pt-2">
        <h3 className="text-[11px] font-bold text-[var(--text2)] line-clamp-2 leading-tight group-hover:text-white transition-colors">
          {anime.title}
        </h3>
        {anime.episodes && (
          <p className="text-[9px] text-[var(--text3)] mt-0.5">{anime.episodes} eps</p>
        )}
      </div>
    </div>
  );
}
