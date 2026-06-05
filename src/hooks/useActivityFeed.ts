import { useMemo } from 'react';
import { useWatchHistory } from '@/hooks/useWatchHistory';
import { useWatchlist } from '@/hooks/useWatchlist';
import { useEpisodeRating } from '@/hooks/useEpisodeRating';

export type ActivityType = 'watched' | 'added_watchlist' | 'rated' | 'completed';

export interface ActivityItem {
  id:        string;
  type:      ActivityType;
  mal_id:    number;
  title:     string;
  image_url: string;
  detail:    string;   // "Episode 5", "Added to watchlist", "Rated 4/5 🔥" etc.
  timestamp: number;
}

export function useActivityFeed(): ActivityItem[] {
  const { getHistory }  = useWatchHistory();
  const { watchlist }   = useWatchlist();

  return useMemo(() => {
    const items: ActivityItem[] = [];

    // Watch history events
    const history = getHistory();
    history.slice(0, 30).forEach(h => {
      items.push({
        id:        `watched-${h.mal_id}-${h.ep_id}-${h.watched_at}`,
        type:      'watched',
        mal_id:    h.mal_id,
        title:     h.title,
        image_url: h.image_url,
        detail:    `Watched Episode ${h.ep_id}${h.ep_title ? ` — ${h.ep_title}` : ''}`,
        timestamp: h.watched_at,
      });
    });

    // Watchlist add events — we don't store timestamps so use now as approx
    // In the future this can be synced from Supabase with created_at
    watchlist.slice(0, 10).forEach((w: any, i: number) => {
      items.push({
        id:        `watchlist-${w.mal_id}`,
        type:      'added_watchlist',
        mal_id:    w.mal_id,
        title:     w.title,
        image_url: w.image_url,
        detail:    'Added to watchlist',
        // Stagger slightly so they sort distinctly
        timestamp: Date.now() - (i * 60_000),
      });
    });

    // Sort all events newest first
    return items
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 40);
  }, [getHistory, watchlist]);
}
