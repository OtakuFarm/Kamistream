import { useState, useCallback } from 'react';

const WATCHED_KEY  = 'kami_watched_eps';   // Set of "malId_epId" strings
const PROGRESS_KEY = 'kami_ep_progress';   // Map of "malId_epId" → seconds

// ── Watched episodes ──────────────────────────────────────────────────
function readWatched(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(WATCHED_KEY) || '[]')); }
  catch { return new Set(); }
}
function writeWatched(s: Set<string>) {
  localStorage.setItem(WATCHED_KEY, JSON.stringify([...s]));
}

// ── Progress (seconds) ────────────────────────────────────────────────
function readProgress(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}'); }
  catch { return {}; }
}

function epKey(malId: string | number, epId: string | number) {
  return `${malId}_${epId}`;
}

// Global listeners so any component refreshes when watched state changes
const _listeners = new Set<() => void>();
function _notifyAll() { _listeners.forEach(fn => fn()); }

export function useEpisodeProgress() {
  const [, forceUpdate] = useState(0);

  // Subscribe to cross-component updates
  useState(() => {
    const refresh = () => forceUpdate(n => n + 1);
    _listeners.add(refresh);
    return () => { _listeners.delete(refresh); };
  });

  const markWatched = useCallback((malId: string | number, epId: string | number) => {
    const s = readWatched();
    s.add(epKey(malId, epId));
    writeWatched(s);
    _notifyAll();
  }, []);

  const unmarkWatched = useCallback((malId: string | number, epId: string | number) => {
    const s = readWatched();
    s.delete(epKey(malId, epId));
    writeWatched(s);
    _notifyAll();
  }, []);

  const toggleWatched = useCallback((malId: string | number, epId: string | number) => {
    const s = readWatched();
    const key = epKey(malId, epId);
    s.has(key) ? s.delete(key) : s.add(key);
    writeWatched(s);
    _notifyAll();
  }, []);

  const isWatched = useCallback((malId: string | number, epId: string | number) => {
    return readWatched().has(epKey(malId, epId));
  }, []);

  const getWatchedCount = useCallback((malId: string | number) => {
    const prefix = `${malId}_`;
    return [...readWatched()].filter(k => k.startsWith(prefix)).length;
  }, []);

  const saveProgress = useCallback((malId: string | number, epId: string | number, seconds: number) => {
    const map = readProgress();
    map[epKey(malId, epId)] = seconds;
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(map));
  }, []);

  const getProgress = useCallback((malId: string | number, epId: string | number): number => {
    return readProgress()[epKey(malId, epId)] || 0;
  }, []);

  return { markWatched, unmarkWatched, toggleWatched, isWatched, getWatchedCount, saveProgress, getProgress };
}

// Legacy exports for backward compatibility
export function saveProgress(malId: string | number, epId: string | number, seconds: number) {
  const map = readProgress();
  map[epKey(malId, epId)] = seconds;
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(map));
}
export function getProgress(malId: string | number, epId: string | number): number {
  return readProgress()[epKey(malId, epId)] || 0;
}
export function clearProgress(malId: string | number, epId: string | number) {
  const map = readProgress();
  delete map[epKey(malId, epId)];
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(map));
}
