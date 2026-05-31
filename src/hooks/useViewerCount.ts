import { useState, useEffect, useRef } from 'react';

// Simulates a live viewer count using localStorage + a deterministic seed
// Based on mal_id + ep_id + time bucket (changes every 3 mins for freshness)
// In production, replace with Supabase Realtime presence

function seededRand(seed: number, min: number, max: number): number {
  const x = Math.sin(seed) * 10000;
  return Math.floor((x - Math.floor(x)) * (max - min + 1)) + min;
}

export function useViewerCount(malId: string, epId: string) {
  const [count, setCount] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function compute() {
    if (!malId || !epId) return 0;
    const timeBucket = Math.floor(Date.now() / (3 * 60 * 1000)); // changes every 3 min
    const seed = parseInt(malId) * 1000 + parseInt(epId) + timeBucket;
    // Realistic range: 12–340, weighted toward lower end
    const base = seededRand(seed, 12, 180);
    const spike = seededRand(seed + 1, 0, 160);
    // Only spike if trending (mal_id < 1000 = popular old anime, or add random spike)
    const isTrending = parseInt(malId) < 5000 || seededRand(seed + 2, 0, 3) === 0;
    return isTrending ? base + spike : base;
  }

  useEffect(() => {
    if (!malId || !epId) return;
    setCount(compute());

    // Fluctuate slightly every 30s for realism
    intervalRef.current = setInterval(() => {
      const base = compute();
      const jitter = seededRand(Date.now(), -8, 8);
      setCount(Math.max(1, base + jitter));
    }, 30_000);

    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [malId, epId]);

  return count;
}
