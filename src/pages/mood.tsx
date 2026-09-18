import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AnimeCard } from '@/components/AnimeCard';
import { GridSkeleton } from '@/components/LoadingSkeleton';
import { useSEO } from '@/hooks/useSEO';
import { Link } from 'wouter';
import { jikanFetch } from '@/lib/jikanFetch';


const MOODS = [
  { id: 'hype',      label: '🔥 Hype',        desc: 'Heart-pounding action',        genres: [1, 2],       color: 'from-red-500 to-orange-500'    },
  { id: 'romance',   label: '💕 Romance',      desc: 'Love stories & feelings',      genres: [22],         color: 'from-pink-400 to-rose-500'     },
  { id: 'comedy',    label: '😂 Comedy',       desc: 'Laughs guaranteed',            genres: [4],          color: 'from-yellow-400 to-amber-500'  },
  { id: 'dark',      label: '👻 Dark',         desc: 'Eerie & unsettling',           genres: [14, 41],     color: 'from-slate-700 to-gray-900'    },
  { id: 'emotional', label: '😢 Emotional',    desc: 'Tears included',               genres: [8],          color: 'from-blue-400 to-indigo-500'   },
  { id: 'fantasy',   label: '🧙 Fantasy',      desc: 'Magical worlds',               genres: [10],         color: 'from-purple-500 to-violet-600' },
  { id: 'scifi',     label: '🚀 Sci-Fi',       desc: 'Future & technology',          genres: [24],         color: 'from-cyan-500 to-blue-500'     },
  { id: 'chill',     label: '🍵 Chill',        desc: 'Peaceful slice of life',       genres: [36],         color: 'from-green-400 to-teal-500'    },
  { id: 'mystery',   label: '🔍 Mystery',      desc: 'Puzzles & suspense',           genres: [7],          color: 'from-amber-600 to-yellow-700'  },
  { id: 'sports',    label: '🏆 Sports',       desc: 'Competition & teamwork',       genres: [30],         color: 'from-orange-400 to-red-400'    },
];

export default function Mood() {
  useSEO({ title: 'Mood Picker' });
  const [selected, setSelected] = useState<string | null>(null);

  const mood = MOODS.find(m => m.id === selected);

  const { data, isLoading } = useQuery({
    queryKey: ['mood', selected],
    enabled: !!mood,
    queryFn: () => jikanFetch(`/anime?genres=${mood!.genres.join(',')}&order_by=score&sort=desc&limit=20&sfw=true&min_score=7`),
    staleTime: 10 * 60 * 1000,
  });

  return (
    <div className="p-4 md:p-6 pb-20">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--purple)] to-[var(--pink)] flex items-center justify-center">
          <Smile className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-heading font-black text-white">Mood Picker</h1>
          <p className="text-[13px] text-[var(--text3)]">What are you in the mood for?</p>
        </div>
      </div>

      {/* Mood Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 mb-8">
        {MOODS.map(m => (
          <button key={m.id} onClick={() => setSelected(m.id === selected ? null : m.id)}
            className={`relative p-4 rounded-2xl border-2 text-left transition-all group overflow-hidden
              ${selected === m.id
                ? 'border-white/40 scale-[1.02] shadow-lg shadow-black/40'
                : 'border-[var(--border)] hover:border-white/20 hover:scale-[1.01]'}`}>
            <div className={`absolute inset-0 bg-gradient-to-br ${m.color} opacity-${selected === m.id ? '20' : '10'} group-hover:opacity-15 transition-opacity`} />
            <div className="relative">
              <div className="text-2xl mb-2">{m.label.split(' ')[0]}</div>
              <div className="text-[13px] font-bold text-white">{m.label.split(' ').slice(1).join(' ')}</div>
              <div className="text-[11px] text-[var(--text3)] mt-0.5">{m.desc}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Results */}
      {selected && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[16px] font-heading font-black text-white">
              {mood?.label} Picks
            </h2>
            <Link href={`/browse?genre=${mood?.genres[0]}`} className="text-[11px] font-bold text-[var(--pink)] hover:underline">
              View All →
            </Link>
          </div>
          {isLoading ? <GridSkeleton /> : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-9 gap-2">
              {data?.data?.map((anime: any) => <AnimeCard key={anime.mal_id} anime={anime} />)}
            </div>
          )}
        </section>
      )}

      {!selected && (
        <div className="text-center py-12 text-[var(--text3)]">
          <div className="text-5xl mb-3">👆</div>
          <p className="text-[14px] font-bold">Pick a mood above to get recommendations</p>
        </div>
      )}
    </div>
  );
}
