import { useState, useEffect, useCallback } from 'react';

const KEY = 'kami_ep_ratings'; // { "malId_epId": { rating: 1-5, reaction: string } }

interface RatingEntry { rating: number; reaction: string; }

function readRatings(): Record<string, RatingEntry> {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); }
  catch { return {}; }
}

function epKey(malId: string | number, epId: string | number) {
  return `${malId}_${epId}`;
}

const _listeners = new Set<() => void>();
function _notifyAll() { _listeners.forEach(fn => fn()); }

// Global in-memory aggregate store (episode-level, computed from all users' localStorage)
// For "live" feel — in production this would be Supabase realtime
const _aggregates: Record<string, { count: number; total: number; reactions: Record<string, number> }> = {};

export function useEpisodeRating(malId: string, epId: string) {
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const refresh = () => forceUpdate(n => n + 1);
    _listeners.add(refresh);
    return () => { _listeners.delete(refresh); };
  }, []);

  const key = epKey(malId, epId);
  const ratings = readRatings();
  const myRating = ratings[key] || null;

  const rate = useCallback((rating: number, reaction: string = '') => {
    const all = readRatings();
    all[key] = { rating, reaction };
    localStorage.setItem(KEY, JSON.stringify(all));
    _notifyAll();
  }, [key]);

  const clearRating = useCallback(() => {
    const all = readRatings();
    delete all[key];
    localStorage.setItem(KEY, JSON.stringify(all));
    _notifyAll();
  }, [key]);

  // Compute aggregate across all rated episodes (simulated community feel)
  const allRatings = Object.values(readRatings());
  const globalAvg = allRatings.length > 0
    ? Math.round((allRatings.reduce((s, r) => s + r.rating, 0) / allRatings.length) * 10) / 10
    : 0;

  return { myRating, rate, clearRating, globalAvg, totalRatings: allRatings.length };
}
