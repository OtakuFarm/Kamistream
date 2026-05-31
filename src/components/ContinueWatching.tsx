import React from 'react';
import { Link } from 'wouter';
import { Play, X, Clock } from 'lucide-react';
import { useWatchHistory, WatchHistoryEntry } from '@/hooks/useWatchHistory';

function timeAgo(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60)  return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function ContinueWatching() {
  const { getRecentAnime, clearHistory } = useWatchHistory();
  const recent: WatchHistoryEntry[] = getRecentAnime().slice(0, 10);

  if (!recent.length) return null;

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[18px] font-heading font-black flex items-center gap-2">
          <Play className="w-4 h-4 text-[var(--pink)] fill-current" />
          Continue Watching
        </h2>
        <button
          onClick={clearHistory}
          className="text-[11px] font-bold text-[var(--text3)] hover:text-[var(--pink)] transition-colors flex items-center gap-1"
        >
          <X className="w-3 h-3" /> Clear
        </button>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
        {recent.map((item) => (
          <Link key={item.mal_id} href={`/watch/${item.mal_id}/${item.ep_id}`}>
            <div className="group shrink-0 w-36 cursor-pointer">
              {/* Thumbnail */}
              <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-[var(--card)] mb-2">
                <img
                  src={item.image_url}
                  alt={item.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                {/* Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                {/* Play button */}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="w-10 h-10 bg-[var(--pink)] rounded-full flex items-center justify-center shadow-lg shadow-[var(--pink)]/40">
                    <Play className="w-4 h-4 fill-white text-white ml-0.5" />
                  </div>
                </div>

                {/* EP badge */}
                <div className="absolute top-2 left-2 bg-black/70 backdrop-blur-sm text-white text-[9px] font-black px-1.5 py-0.5 rounded-md">
                  EP {item.ep_id}
                </div>

                {/* Progress bar — fake 60% to give visual feedback */}
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/20">
                  <div
                    className="h-full bg-[var(--pink)] rounded-full"
                    style={{ width: '60%' }}
                  />
                </div>
              </div>

              {/* Info */}
              <p className="text-[11px] font-bold text-white line-clamp-2 leading-snug mb-0.5">
                {item.title}
              </p>
              <p className="text-[10px] text-[var(--text3)] flex items-center gap-1">
                <Clock className="w-2.5 h-2.5" />
                {timeAgo(item.watched_at)}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
