import { useState, useEffect, useCallback } from 'react';

// ── Manga reading progress ────────────────────────────────────────
// Stores: which chapter you're on, which page, and when you last read
// Saved to localStorage — no Supabase needed for this version

const KEY = 'kami_manga_progress';

interface MangaProgressEntry {
  mangaId:    string;
  mangaTitle: string;
  coverUrl:   string | null;
  chapterId:  string;
  chapter:    string;   // chapter number as string e.g. "42"
  page:       number;
  totalPages: number;
  readAt:     number;   // timestamp
}

type ProgressMap = Record<string, MangaProgressEntry>;

function read(): ProgressMap {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}
function write(map: ProgressMap) {
  try { localStorage.setItem(KEY, JSON.stringify(map)); } catch {}
}

const _listeners = new Set<() => void>();
function notify() { _listeners.forEach(fn => fn()); }

export function useMangaProgress() {
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    const refresh = () => forceUpdate(n => n + 1);
    _listeners.add(refresh);
    return () => { _listeners.delete(refresh); };
  }, []);

  const saveProgress = useCallback((entry: Omit<MangaProgressEntry, 'readAt'>) => {
    const map = read();
    map[entry.mangaId] = { ...entry, readAt: Date.now() };
    write(map);
    notify();
  }, []);

  const getProgress = useCallback((mangaId: string): MangaProgressEntry | null => {
    return read()[mangaId] || null;
  }, []);

  const getAllProgress = useCallback((): MangaProgressEntry[] => {
    return Object.values(read()).sort((a, b) => b.readAt - a.readAt);
  }, []);

  const clearProgress = useCallback((mangaId?: string) => {
    if (mangaId) {
      const map = read();
      delete map[mangaId];
      write(map);
    } else {
      write({});
    }
    notify();
  }, []);

  const isRead = useCallback((mangaId: string, chapterId: string): boolean => {
    const p = read()[mangaId];
    return p?.chapterId === chapterId && p?.page >= (p?.totalPages - 1);
  }, []);

  return { saveProgress, getProgress, getAllProgress, clearProgress, isRead };
}
