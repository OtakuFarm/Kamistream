import { useState, useEffect, useCallback } from 'react';

export type WatchStatus = 'watching' | 'plan_to_watch' | 'on_hold' | 'dropped' | 'completed';

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  xpReward: number;
  condition: (stats: GamificationStats) => boolean;
}

export interface GamificationStats {
  episodesVisited: number;
  animeExplored: number;
  watchlistCount: number;
  streak: number;
  totalXP: number;
  level: number;
  achievements: string[];
}

const LS_KEY    = 'kami_gamification';
const LS_STREAK = 'kami_streak';

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_watch',          title: 'First Steps',       description: 'Visit your first episode',    icon: '🎬', xpReward: 50,   condition: s => s.episodesVisited >= 1   },
  { id: 'ten_episodes',         title: 'Getting Hooked',    description: 'Visit 10 episodes',           icon: '📺', xpReward: 100,  condition: s => s.episodesVisited >= 10  },
  { id: 'fifty_episodes',       title: 'Binge Mode',        description: 'Visit 50 episodes',           icon: '🔥', xpReward: 250,  condition: s => s.episodesVisited >= 50  },
  { id: 'hundred_episodes',     title: 'Anime Addict',      description: 'Visit 100 episodes',          icon: '⚡', xpReward: 500,  condition: s => s.episodesVisited >= 100 },
  { id: 'five_hundred',         title: 'Legend',            description: 'Visit 500 episodes',          icon: '👑', xpReward: 1000, condition: s => s.episodesVisited >= 500 },
  { id: 'first_watchlist',      title: 'Collector',         description: 'Add anime to watchlist',      icon: '📌', xpReward: 30,   condition: s => s.watchlistCount >= 1    },
  { id: 'ten_watchlist',        title: 'Curator',           description: '10 anime in watchlist',       icon: '🗂️', xpReward: 100,  condition: s => s.watchlistCount >= 10  },
  { id: 'fifty_watchlist',      title: 'Archivist',         description: '50 anime in watchlist',       icon: '📚', xpReward: 300,  condition: s => s.watchlistCount >= 50  },
  { id: 'explorer_5',          title: 'Explorer',           description: 'Explore 5 different anime',   icon: '🧭', xpReward: 75,   condition: s => s.animeExplored >= 5     },
  { id: 'explorer_25',         title: 'Wanderer',           description: 'Explore 25 anime',            icon: '🗺️', xpReward: 200,  condition: s => s.animeExplored >= 25   },
  { id: 'explorer_100',        title: 'Connoisseur',        description: 'Explore 100 anime',           icon: '🎭', xpReward: 500,  condition: s => s.animeExplored >= 100  },
  { id: 'streak_3',            title: 'Regular Viewer',     description: '3-day watch streak',          icon: '📅', xpReward: 75,   condition: s => s.streak >= 3            },
  { id: 'streak_7',            title: 'Weekly Warrior',     description: '7-day watch streak',          icon: '🗓️', xpReward: 200,  condition: s => s.streak >= 7           },
  { id: 'streak_30',           title: 'Monthly Devotee',    description: '30-day streak',               icon: '🌟', xpReward: 500,  condition: s => s.streak >= 30           },
  { id: 'streak_100',          title: 'Eternal Otaku',      description: '100-day streak',              icon: '🏅', xpReward: 2000, condition: s => s.streak >= 100          },
];

export function calculateLevel(xp: number): number {
  return Math.max(1, Math.floor(1 + Math.sqrt(xp / 80)));
}
export function xpForLevel(level: number): number { return Math.pow(level - 1, 2) * 80; }
export function xpForNextLevel(level: number): number { return Math.pow(level, 2) * 80; }

function readData()   { try { return JSON.parse(localStorage.getItem(LS_KEY)    || '{}'); } catch { return {}; } }
function readStreak() { try { return JSON.parse(localStorage.getItem(LS_STREAK) || '{"streak":0,"lastDate":""}'); } catch { return { streak: 0, lastDate: '' }; } }
function writeData(d: any) { try { localStorage.setItem(LS_KEY, JSON.stringify(d)); } catch {} }

const listeners = new Set<() => void>();
function notifyGamification() { listeners.forEach(fn => fn()); }

export function useGamification() {
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const refresh = () => forceUpdate(n => n + 1);
    listeners.add(refresh);
    return () => { listeners.delete(refresh); };
  }, []);

  // Update streak once per session
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    const s = readStreak();
    if (s.lastDate === today) return;
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const newStreak = s.lastDate === yesterday ? s.streak + 1 : 1;
    localStorage.setItem(LS_STREAK, JSON.stringify({ streak: newStreak, lastDate: today }));
  }, []);

  const getStats = useCallback((): GamificationStats => {
    const d = readData();
    const s = readStreak();
    const xp = d.xp || 0;
    return {
      episodesVisited: d.episodesVisited || 0,
      animeExplored:   d.animeExplored   || 0,
      watchlistCount:  d.watchlistCount  || 0,
      streak:          s.streak          || 0,
      totalXP:         xp,
      level:           calculateLevel(xp),
      achievements:    d.achievements    || [],
    };
  }, []);

  const addXP = useCallback((amount: number) => {
    const d = readData();
    writeData({ ...d, xp: (d.xp || 0) + amount });
    notifyGamification();
  }, []);

  const incrementStat = useCallback((key: 'episodesVisited' | 'animeExplored' | 'watchlistCount', value?: number) => {
    const d = readData();
    writeData({ ...d, [key]: (d[key] || 0) + (value ?? 1) });
    notifyGamification();
  }, []);

  const setStat = useCallback((key: string, value: number) => {
    const d = readData();
    writeData({ ...d, [key]: value });
    notifyGamification();
  }, []);

  const checkAndUnlockAchievements = useCallback((stats?: GamificationStats) => {
    const s = stats || (() => {
      const d = readData(); const str = readStreak(); const xp = d.xp || 0;
      return { episodesVisited: d.episodesVisited||0, animeExplored: d.animeExplored||0, watchlistCount: d.watchlistCount||0, streak: str.streak||0, totalXP: xp, level: calculateLevel(xp), achievements: d.achievements||[] };
    })();
    const d = readData();
    const earned: string[] = d.achievements || [];
    const newlyUnlocked: Achievement[] = [];
    for (const ach of ACHIEVEMENTS) {
      if (!earned.includes(ach.id) && ach.condition(s)) {
        earned.push(ach.id);
        newlyUnlocked.push(ach);
      }
    }
    if (newlyUnlocked.length > 0) {
      const bonus = newlyUnlocked.reduce((sum, a) => sum + a.xpReward, 0);
      writeData({ ...d, achievements: earned, xp: (d.xp || 0) + bonus });
      notifyGamification();
    }
    return newlyUnlocked;
  }, []);

  return { getStats, addXP, incrementStat, setStat, checkAndUnlockAchievements };
}
