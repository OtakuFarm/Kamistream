import { useState, useEffect, useCallback } from 'react';

const KEY = 'kami_manga_bookmarks';

export interface MangaBookmark {
  mangaId:    string;
  title:      string;
  coverUrl:   string | null;
  status:     'reading' | 'completed' | 'plan_to_read' | 'on_hold' | 'dropped';
  addedAt:    number;
}

type BookmarkMap = Record<string, MangaBookmark>;

function read(): BookmarkMap {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}
function write(map: BookmarkMap) {
  try { localStorage.setItem(KEY, JSON.stringify(map)); } catch {}
}

const _listeners = new Set<() => void>();
function notify() { _listeners.forEach(fn => fn()); }

export const MANGA_STATUS_LABELS: Record<MangaBookmark['status'], string> = {
  reading:      '▶ Reading',
  completed:    '✓ Completed',
  plan_to_read: '📌 Plan to Read',
  on_hold:      '⏸ On Hold',
  dropped:      '✕ Dropped',
};

export function useMangaBookmarks() {
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    const refresh = () => forceUpdate(n => n + 1);
    _listeners.add(refresh);
    return () => { _listeners.delete(refresh); };
  }, []);

  const bookmarks = Object.values(read()).sort((a, b) => b.addedAt - a.addedAt);

  const toggleBookmark = useCallback((manga: Omit<MangaBookmark, 'addedAt' | 'status'>) => {
    const map = read();
    if (map[manga.mangaId]) {
      delete map[manga.mangaId];
    } else {
      map[manga.mangaId] = { ...manga, status: 'plan_to_read', addedAt: Date.now() };
    }
    write(map);
    notify();
  }, []);

  const setStatus = useCallback((mangaId: string, status: MangaBookmark['status']) => {
    const map = read();
    if (map[mangaId]) { map[mangaId].status = status; write(map); notify(); }
  }, []);

  const isBookmarked = useCallback((mangaId: string) => !!read()[mangaId], []);
  const getStatus    = useCallback((mangaId: string) => read()[mangaId]?.status || null, []);

  return { bookmarks, toggleBookmark, setStatus, isBookmarked, getStatus };
}
