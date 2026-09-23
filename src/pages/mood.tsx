import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Smile, RefreshCw, Shuffle, Check } from 'lucide-react';
import { AnimeCard } from '@/components/AnimeCard';
import { GridSkeleton } from '@/components/LoadingSkeleton';
import { useSEO } from '@/hooks/useSEO';
import { Link } from 'wouter';
import { jikanFetch } from '@/lib/jikanFetch';

const MOODS = [
  { id: 'hype',      label: 'Hype',      emoji: '🔥', desc: 'Heart-pounding action',   genres: [1, 2],   color: 'from-red-500 to-orange-500'    },
  { id: 'romance',   label: 'Romance',   emoji: '💕', desc: 'Love stories & feelings', genres: [22],     color: 'from-pink-400 to-rose-500'     },
  { id: 'comedy',    label: 'Comedy',    emoji: '😂', desc: 'Laughs guaranteed',       genres: [4],      color: 'from-yellow-400 to-amber-500'  },
  { id: 'dark',      label: 'Dark',      emoji: '👻', desc: 'Eerie & unsettling',      genres: [14, 41], color: 'from-slate-700 to-gray-900'    },
  { id: 'emotional', label: 'Emotional', emoji: '😢', desc: 'Tears included',          genres: [8],      color: 'from-blue-400 to-indigo-500'   },
  { id: 'fantasy',   label: 'Fantasy',   emoji: '🧙', desc: 'Magical worlds',          genres: [10],     color: 'from-purple-500 to-violet-600' },
  { id: 'scifi',     label: 'Sci-Fi',    emoji: '🚀', desc: 'Future & technology',     genres: [24],     color: 'from-cyan-500 to-blue-500'     },
  { id: 'chill',     label: 'Chill',     emoji: '🍵', desc: 'Peaceful slice of life',  genres: [36],     color: 'from-green-400 to-teal-500'    },
  { id: 'mystery',   label: 'Mystery',   emoji: '🔍', desc: 'Puzzles & suspense',      genres: [7],      color: 'from-amber-600 to-yellow-700'  },
  { id: 'sports',    label: 'Sports',    emoji: '🏆', desc: 'Competition & teamwork',  genres: [30],     color: 'from-orange-400 to-red-400'    },
  { id: 'isekai',    label: 'Isekai',    emoji: '🌀', desc: 'Transported to new worlds', genres: [66, 10], color: 'from-violet-500 to-fuchsia-600' },
  { id: 'mecha',     label: 'Mecha',     emoji: '🤖', desc: 'Giant robots & war machines', genres: [18],  color: 'from-zinc-500 to-slate-700'    },
  { id: 'supernat',  label: 'Supernatural', emoji: '🦊', desc: 'Spirits, demons & yokai', genres: [37],   color: 'from-fuchsia-500 to-purple-700' },
  { id: 'music',     label: 'Music',     emoji: '🎵', desc: 'Idols, bands & rhythm',   genres: [19],     color: 'from-pink-500 to-rose-400'     },
  { id: 'history',   label: 'Historical', emoji: '⛩️', desc: 'Samurai, empires & the past', genres: [13],  color: 'from-stone-500 to-amber-800'   },
  { id: 'vampire',   label: 'Vampire',   emoji: '🧛', desc: 'Blood & the eternal night', genres: [89],    color: 'from-red-700 to-purple-900'    },
];

export default function Mood() {
  useSEO({ title: 'Mood Picker', description: 'Not sure what to watch? Pick your mood and we\'ll find the perfect anime for you.', url: '/mood' });
  const [selected, setSelected] = useState<string[]>([]);
  const [retry, setRetry] = useState(0);
  const [shuffleSeed, setShuffleSeed] = useState(0);

  const toggle = (id: string) =>
    setSelected(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));

  const active = MOODS.filter(m => selected.includes(m.id));

  // Union of every genre across all picked moods — combining 2+ moods widens
  // the pool while still respecting every vibe you chose.
  const genreIds = [...new Set(active.flatMap(m => m.genres))];

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['mood', [...selected].sort().join(','), retry],
    queryFn: () =>
      jikanFetch(
        `/anime?genres=${genreIds.join(',')}&order_by=score&sort=desc&limit=20&sfw=true&min_score=7`
      ),
    enabled: genreIds.length > 0,
    staleTime: 10 * 60 * 1000,
    placeholderData: (prev: any) => prev,
  });

  const surprise = () => {
    const pick = MOODS[Math.floor(Math.random() * MOODS.length)];
    setSelected([pick.id]);
  };

  const shuffled = useMemo(() => {
    // shuffleSeed intentionally included so Shuffle re-runs the shuffle
    void shuffleSeed;
    const list = [...(data?.data ?? [])];
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }, [data, shuffleSeed]);

  return (
    <div className="p-4 md:p-6 pb-20">
      <div className="flex items-center gap-3 mb-6">
        <motion.div
          initial={{ scale: 0.8, rotate: -8, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 18 }}
          className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--purple)] to-[var(--pink)] flex items-center justify-center shadow-lg shadow-[var(--purple)]/30"
        >
          <Smile className="w-5 h-5 text-white" />
        </motion.div>
        <div>
          <h1 className="text-2xl font-heading font-black text-white">Mood Picker</h1>
          <p className="text-[13px] text-[var(--text3)]">What are you in the mood for?</p>
        </div>
      </div>

      {/* Mood Grid — multi-select, springy tap */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 mb-8">
        {MOODS.map((m, i) => {
          const isSel = selected.includes(m.id);
          return (
            <motion.button
              key={m.id}
              onClick={() => toggle(m.id)}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, type: 'spring', stiffness: 240, damping: 20 }}
              whileHover={{ y: -3 }}
              whileTap={{ scale: 0.95 }}
              className={`relative p-4 rounded-2xl border-2 text-left transition-colors overflow-hidden group
                ${
                  isSel
                    ? 'border-[var(--pink)] ring-2 ring-[var(--pink)]/40 shadow-lg shadow-black/40'
                    : 'border-[var(--border)] hover:border-white/25'
                }`}
            >
              <div
                className={`absolute inset-0 bg-gradient-to-br ${m.color} transition-opacity duration-300
                  ${isSel ? 'opacity-30' : 'opacity-10'} group-hover:opacity-20`}
              />
              <div className="relative">
                <div className="text-2xl mb-2">{m.emoji}</div>
                <div className="text-[13px] font-bold text-white">{m.label}</div>
                <div className="text-[11px] text-[var(--text3)] mt-0.5">{m.desc}</div>
              </div>
              {isSel && (
                <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[var(--pink)] flex items-center justify-center">
                  <Check className="w-3 h-3 text-white" strokeWidth={3} />
                </div>
              )}
            </motion.button>
          );
        })}
      </div>

      {/* Results */}
      {genreIds.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[16px] font-heading font-black text-white">
              {active.length > 1
                ? `${active.map(m => m.emoji).join(' ')} Mix Picks`
                : `${active[0]?.emoji} ${active[0]?.label} Picks`}
            </h2>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShuffleSeed(s => s + 1)}
                className="text-[11px] font-bold text-[var(--text3)] hover:text-[var(--pink)] transition-colors flex items-center gap-1"
              >
                <Shuffle className="w-3 h-3" /> Shuffle
              </button>
              <button
                onClick={() => { setRetry(r => r + 1); refetch(); }}
                className="text-[11px] font-bold text-[var(--text3)] hover:text-[var(--pink)] transition-colors flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" /> Refresh
              </button>
              <Link
                href={`/browse?genre=${genreIds[0]}`}
                className="text-[11px] font-bold text-[var(--pink)] hover:underline"
              >
                View All →
              </Link>
            </div>
          </div>

          {isError ? (
            <div className="text-center py-12 text-[var(--text3)]">
              <div className="text-5xl mb-3">😵</div>
              <p className="text-[14px] font-bold mb-3">Couldn't load picks right now</p>
              <button
                onClick={() => refetch()}
                className="px-4 py-2 rounded-xl bg-[var(--pink)] text-white text-[12px] font-bold"
              >
                Try Again
              </button>
            </div>
          ) : isLoading ? (
            <GridSkeleton />
          ) : shuffled.length === 0 ? (
            <div className="text-center py-12 text-[var(--text3)]">
              <div className="text-5xl mb-3">🫥</div>
              <p className="text-[14px] font-bold">No anime matched those moods — try different ones</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-9 gap-2">
              {shuffled.map((anime: any) => (
                <AnimeCard key={anime.mal_id} anime={anime} />
              ))}
            </div>
          )}
        </section>
      )}

      {genreIds.length === 0 && (
        <div className="text-center py-12 text-[var(--text3)]">
          <motion.div
            animate={{ y: [0, -8, 0] }}
            transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
            className="text-5xl mb-3"
          >
            👆
          </motion.div>
          <p className="text-[14px] font-bold">Pick one — or combine several — moods above</p>
          <button
            onClick={surprise}
            className="mt-4 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[var(--purple)] to-[var(--pink)] text-white text-[13px] font-bold shadow-lg shadow-[var(--purple)]/30 hover:scale-105 transition-transform"
          >
            🎲 Surprise me
          </button>
        </div>
      )}
    </div>
  );
}