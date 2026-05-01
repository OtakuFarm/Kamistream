import { useCallback } from 'react';

export interface WatchHistoryEntry {
  mal_id: number;
  title: string;
  image_url: string;
  ep_id: number;
  ep_title: string;
  watched_at: number;
}

const KEY = 'kami_watch_history';
const MAX = 50;

function readHistory(): WatchHistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
}

export function useWatchHistory() {
  const logEpisode = useCallback((entry: Omit<WatchHistoryEntry, 'watched_at'>) => {
    const existing = readHistory().filter(
      (e) => !(e.mal_id === entry.mal_id && e.ep_id === entry.ep_id)
    );
    const updated = [{ ...entry, watched_at: Date.now() }, ...existing].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(updated));
  }, []);

  const getHistory = useCallback((): WatchHistoryEntry[] => readHistory(), []);

  const getRecentAnime = useCallback((): WatchHistoryEntry[] => {
    const seen = new Set<number>();
    return readHistory().filter((e) => {
      if (seen.has(e.mal_id)) return false;
      seen.add(e.mal_id);
      return true;
    });
  }, []);

  const clearHistory = useCallback(() => {
    localStorage.removeItem(KEY);
  }, []);

  return { logEpisode, getHistory, getRecentAnime, clearHistory };
}
