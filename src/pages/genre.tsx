import React, { useState } from 'react';
import { useRoute, Link } from 'wouter';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { AnimeCard } from '@/components/AnimeCard';
import { GridSkeleton } from '@/components/LoadingSkeleton';
import { useSEO } from '@/hooks/useSEO';
import { ChevronLeft, Loader2 } from 'lucide-react';

const GENRES: Record<string, string> = {
  '1': 'Action', '2': 'Adventure', '4': 'Comedy', '5': 'Avant Garde',
  '7': 'Mystery', '8': 'Drama', '9': 'Ecchi', '10': 'Fantasy',
  '13': 'Historical', '14': 'Horror', '17': 'Martial Arts', '18': 'Mecha',
  '19': 'Music', '22': 'Romance', '23': 'School', '24': 'Sci-Fi',
  '25': 'Shoujo', '27': 'Shounen', '29': 'Space', '30': 'Sports',
  '36': 'Slice of Life', '37': 'Supernatural', '38': 'Military',
  '40': 'Psychological', '41': 'Thriller', '42': 'Seinen', '43': 'Josei',
};

const SORT_OPTIONS = [
  { v: 'popularity', l: 'Most Popular' },
  { v: 'score',      l: 'Highest Rated' },
  { v: 'start_date', l: 'Newest First' },
];

async function fetchGenrePage(genreId: string, sort: string, page: number) {
  const params = new URLSearchParams({
    genres: genreId, order_by: sort,
    limit: '24', page: String(page), sfw: 'true',
  });
  const res = await fetch(`https://api.jikan.moe/v4/anime?${params}`);
  if (!res.ok) throw new Error('Failed to fetch');
  return res.json();
}

export default function Genre() {
  const [, params] = useRoute('/genre/:id');
  const genreId   = params?.id || '';
  const genreName = GENRES[genreId] || 'Genre';
  const [sort, setSort] = useState('popularity');

  useSEO({ title: `${genreName} Anime`, description: `Browse the best ${genreName} anime on KamiStream.` });

  const {
    data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading,
  } = useInfiniteQuery({
    queryKey: ['genre', genreId, sort],
    queryFn: ({ pageParam = 1 }) => fetchGenrePage(genreId, sort, pageParam as number),
    getNextPageParam: (last: any) => {
      const cur = last?.pagination?.current_page ?? 1;
      const max = last?.pagination?.last_visible_page ?? 1;
      return cur >= max ? undefined : cur + 1;
    },
    initialPageParam: 1,
    enabled: !!genreId,
    staleTime: 5 * 60 * 1000,
  });

  const anime = data?.pages.flatMap((p: any) => p.data ?? []) ?? [];

  return (
    <div className="p-4 md:p-6 pb-20">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link href="/browse">
          <button className="w-10 h-10 bg-[var(--card)] border border-[var(--border)] rounded-xl flex items-center justify-center hover:border-[var(--purple)] transition-colors">
            <ChevronLeft className="w-5 h-5 text-[var(--text2)]" />
          </button>
        </Link>
        <div>
          <h1 className="text-2xl font-heading font-black text-white">{genreName}</h1>
          <p className="text-[12px] text-[var(--text3)]">{anime.length > 0 ? `${anime.length}+ anime` : ''}</p>
        </div>
        <div className="ml-auto">
          <select value={sort} onChange={e => setSort(e.target.value)}
            className="bg-[var(--card)] border border-[var(--border)] text-white text-[12px] px-3 py-2 rounded-xl outline-none focus:border-[var(--purple)]">
            {SORT_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
        </div>
      </div>

      {/* All genre tags for quick switching */}
      <div className="flex flex-wrap gap-2 mb-6">
        {Object.entries(GENRES).map(([id, name]) => (
          <Link key={id} href={`/genre/${id}`}>
            <span className={`px-3 py-1 rounded-full text-[11px] font-bold cursor-pointer transition-all ${id === genreId ? 'bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white' : 'bg-[var(--card)] text-[var(--text2)] border border-[var(--border)] hover:border-[var(--purple)] hover:text-white'}`}>
              {name}
            </span>
          </Link>
        ))}
      </div>

      {/* Grid */}
      {isLoading ? <GridSkeleton /> : (
        <>
          {anime.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {anime.map((a: any) => <AnimeCard key={a.mal_id} anime={a} />)}
            </div>
          ) : (
            <div className="text-center py-20 text-[var(--text3)]">No anime found for this genre.</div>
          )}

          {hasNextPage && (
            <div className="flex justify-center mt-10">
              <button onClick={() => fetchNextPage()} disabled={isFetchingNextPage}
                className="flex items-center gap-2 bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white px-8 py-3 rounded-xl text-[13px] font-bold hover:brightness-110 transition-all disabled:opacity-60">
                {isFetchingNextPage ? <><Loader2 className="w-4 h-4 animate-spin" /> Loading…</> : `Load More (${anime.length} shown)`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
