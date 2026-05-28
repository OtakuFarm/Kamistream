import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AnimeCard } from '@/components/AnimeCard';
import { GridSkeleton } from '@/components/LoadingSkeleton';
import { useSEO } from '@/hooks/useSEO';
import { Gem, RefreshCw } from 'lucide-react';

const FILTERS = [
  { id: 'underrated', label: '💎 Underrated',   desc: 'High score, low members',    url: 'https://api.jikan.moe/v4/anime?min_score=8&order_by=members&sort=asc&limit=25&sfw=true&type=tv' },
  { id: 'old-gems',   label: '📼 Old Gems',      desc: 'Classics from the past',     url: 'https://api.jikan.moe/v4/anime?min_score=8&end_date=2005&order_by=score&sort=desc&limit=25&sfw=true&type=tv' },
  { id: 'short',      label: '⚡ Quick Watch',   desc: 'Under 13 episodes',          url: 'https://api.jikan.moe/v4/anime?min_score=8&max_episodes=12&order_by=score&sort=desc&limit=25&sfw=true&type=tv' },
  { id: 'movies',     label: '🎬 Hidden Movies', desc: 'Overlooked anime films',     url: 'https://api.jikan.moe/v4/anime?min_score=8&order_by=members&sort=asc&limit=25&sfw=true&type=movie' },
  { id: 'ova',        label: '📀 OVA Treasures', desc: 'Rare original video anime',  url: 'https://api.jikan.moe/v4/anime?min_score=8&order_by=score&sort=desc&limit=25&sfw=true&type=ova' },
];

export default function HiddenGems() {
  useSEO({ title: 'Hidden Gems' });
  const [filter, setFilter] = useState('underrated');
  const active = FILTERS.find(f => f.id === filter) || FILTERS[0];

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['hidden-gems', filter],
    queryFn: async () => {
      const res = await fetch(active.url);
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    staleTime: 15 * 60 * 1000,
  });

  return (
    <div className="p-4 md:p-6 pb-20">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-[var(--blue)] flex items-center justify-center">
          <Gem className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-heading font-black text-white">Hidden Gems</h1>
          <p className="text-[13px] text-[var(--text3)]">Discover overlooked masterpieces</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        {FILTERS.map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className={`px-4 py-2 rounded-xl text-[12px] font-bold border transition-all ${filter === f.id
              ? 'bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white border-transparent'
              : 'bg-[var(--card)] border-[var(--border)] text-[var(--text3)] hover:text-white hover:border-[var(--purple)]'}`}>
            {f.label}
          </button>
        ))}
        <button onClick={() => refetch()}
          className="px-3 py-2 rounded-xl text-[12px] font-bold border bg-[var(--card)] border-[var(--border)] text-[var(--text3)] hover:text-white transition-all ml-auto flex items-center gap-1">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      <div className="text-[12px] text-[var(--text3)] mb-4 font-bold">{active.desc}</div>

      {isLoading ? <GridSkeleton /> : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-9 gap-2">
          {data?.data?.map((anime: any) => (
            <div key={anime.mal_id} className="relative">
              <AnimeCard anime={anime} />
              {anime.members && (
                <div className="absolute top-8 left-1 bg-cyan-600/90 text-[8px] font-black text-white px-1.5 py-0.5 rounded backdrop-blur-sm">
                  💎 {(anime.members / 1000).toFixed(0)}k
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
