import { useState, useEffect, useCallback } from 'react';

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
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); }
  catch { return []; }
}

// Global listeners so any hook instance can notify all others
const listeners = new Set<() => void>();
function notifyAll() { listeners.forEach(fn => fn()); }

export function useWatchHistory() {
  const [history, setHistory] = useState<WatchHistoryEntry[]>(() => readHistory());

  // Subscribe to cross-component updates
  useEffect(() => {
    const refresh = () => setHistory(readHistory());
    listeners.add(refresh);
    // Also listen for changes from other tabs
    window.addEventListener('storage', refresh);
    return () => {
      listeners.delete(refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const logEpisode = useCallback((entry: Omit<WatchHistoryEntry, 'watched_at'>) => {
    const existing = readHistory().filter(
      e => !(e.mal_id === entry.mal_id && e.ep_id === entry.ep_id)
    );
    const updated = [{ ...entry, watched_at: Date.now() }, ...existing].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(updated));
    setHistory(updated);
    notifyAll(); // tell home page immediately
  }, []);

  const getHistory = useCallback(() => history, [history]);

  const getRecentAnime = useCallback((): WatchHistoryEntry[] => {
    const seen = new Set<number>();
    return history.filter(e => {
      if (seen.has(e.mal_id)) return false;
      seen.add(e.mal_id);
      return true;
    });
  }, [history]);

  const clearHistory = useCallback(() => {
    localStorage.removeItem(KEY);
    setHistory([]);
    notifyAll();
  }, []);

  return { logEpisode, getHistory, getRecentAnime, clearHistory };
}
