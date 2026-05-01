import React, { useState, useEffect } from 'react';
import { useAnimeSearch, useAnimeByGenre } from '@/lib/jikan';
import { AnimeCard } from '@/components/AnimeCard';
import { GridSkeleton } from '@/components/LoadingSkeleton';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { Database } from 'lucide-react';

const GENRES = [
  { id: '', name: 'All' },
  { id: '1',  name: 'Action' },
  { id: '2',  name: 'Adventure' },
  { id: '4',  name: 'Comedy' },
  { id: '8',  name: 'Drama' },
  { id: '10', name: 'Fantasy' },
  { id: '22', name: 'Romance' },
  { id: '24', name: 'Sci-Fi' },
  { id: '36', name: 'Slice of Life' },
  { id: '30', name: 'Sports' },
  { id: '37', name: 'Supernatural' },
  { id: '41', name: 'Thriller' },
];

// Fetch ALL anime from Supabase in batches (handles 1000+ rows)
const fetchAllSupabaseAnime = async () => {
  let allRows: any[] = [];
  let from = 0;
  const batchSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('anime')
      .select('*')
      .order('created_at', { ascending: false })
      .range(from, from + batchSize - 1);

    if (error) throw error;
    const rows = data || [];
    allRows = [...allRows, ...rows];
    hasMore = rows.length === batchSize;
    from += batchSize;
  }

  // Normalise to AnimeCard-compatible shape — try common column name patterns
  return allRows.map((row: any) => ({
    mal_id:   row.mal_id   ?? row.id,
    title:    row.title    ?? row.name,
    score:    row.score    ?? row.rating ?? null,
    episodes: row.episodes ?? row.episode_count ?? null,
    type:     row.type     ?? row.format ?? 'TV',
    status:   row.status   ?? null,
    images: {
      webp: { large_image_url: row.image_url ?? row.cover_url ?? row.thumbnail ?? row.poster ?? '' },
      jpg:  { large_image_url: row.image_url ?? row.cover_url ?? row.thumbnail ?? row.poster ?? '' },
    },
  }));
};

function useSupabaseAnime() {
  return useQuery({
    queryKey: ['supabase', 'anime', 'all'],
    queryFn: fetchAllSupabaseAnime,
    staleTime: 2 * 60 * 1000,
    retry: 1,
  });
}

type Tab = 'library' | 'discover';

export default function Browse() {
  const q = new URLSearchParams(window.location.search).get('q') || '';

  const [tab,         setTab]         = useState<Tab>('library');
  const [activeGenre, setActiveGenre] = useState('');
  const [search,      setSearch]      = useState('');

  const { data: supabaseAnime, isLoading: supabaseLoading, isError: supabaseError } = useSupabaseAnime();
  const { data: searchResults, isLoading: searchLoading } = useAnimeSearch(q || search);
  const { data: genreResults,  isLoading: genreLoading  } = useAnimeByGenre(activeGenre);

  useEffect(() => { if (q) setTab('discover'); }, [q]);

  const discoverData    = (q || search) ? searchResults?.data : genreResults?.data;
  const discoverLoading = (q || search) ? searchLoading       : genreLoading;
  const libraryEmpty    = !supabaseLoading && (!supabaseAnime || supabaseAnime.length === 0);

  return (
    <div className="p-4 md:p-6 pb-20">
      <div className="mb-8">
        <h1 className="text-2xl font-heading font-black text-white mb-4">
          {q ? `Results for "${q}"` : 'Browse Anime'}
        </h1>

        {/* Tab switcher */}
        {!q && (
          <div className="flex gap-2 mb-5">
            <button
              onClick={() => setTab('library')}
              className={`px-5 py-2 rounded-xl text-[13px] font-bold transition-all flex items-center gap-2 ${tab === 'library' ? 'bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white' : 'bg-[var(--card)] text-[var(--text2)] border border-[var(--border)] hover:text-white'}`}
            >
              <Database className="w-3.5 h-3.5" />
              Our Library
              {supabaseAnime && supabaseAnime.length > 0 && (
                <span className="bg-white/20 px-1.5 py-0.5 rounded-md text-[10px]">{supabaseAnime.length}</span>
              )}
            </button>
            <button
              onClick={() => setTab('discover')}
              className={`px-5 py-2 rounded-xl text-[13px] font-bold transition-all ${tab === 'discover' ? 'bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white' : 'bg-[var(--card)] text-[var(--text2)] border border-[var(--border)] hover:text-white'}`}
            >
              Discover
            </button>
          </div>
        )}

        {/* Genre filters for discover */}
        {(tab === 'discover' || q) && !q && (
          <div className="flex flex-wrap gap-2">
            {GENRES.map(g => (
              <button key={g.id} onClick={() => setActiveGenre(g.id)}
                className={`px-4 py-1.5 rounded-full text-[12px] font-bold transition-all ${activeGenre === g.id ? 'bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white' : 'bg-[var(--card)] text-[var(--text2)] border border-[var(--border)] hover:border-[var(--purple)] hover:text-white'}`}>
                {g.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Library (Supabase) ── */}
      {(tab === 'library' && !q) && (
        <>
          {supabaseLoading && (
            <div>
              <p className="text-[12px] text-[var(--text3)] mb-4 animate-pulse">Loading library…</p>
              <GridSkeleton />
            </div>
          )}
          {supabaseError && (
            <div className="text-center py-20">
              <p className="text-[var(--text3)] text-[14px]">Couldn't load the library right now.</p>
            </div>
          )}
          {libraryEmpty && !supabaseError && (
            <div className="text-center py-20">
              <Database className="w-12 h-12 text-[var(--text3)] mx-auto mb-4 opacity-40" />
              <p className="text-[var(--text3)] text-[14px] font-bold">No anime in the library yet.</p>
              <p className="text-[var(--text3)] text-[12px] mt-1 opacity-60">Add titles via the Admin panel.</p>
            </div>
          )}
          {!supabaseLoading && supabaseAnime && supabaseAnime.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {supabaseAnime.map((anime: any) => (
                <AnimeCard key={anime.mal_id ?? anime.title} anime={anime} />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Discover (Jikan) or search ── */}
      {(tab === 'discover' || q) && (
        <>
          {discoverLoading ? <GridSkeleton /> : discoverData?.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {discoverData.map((anime: any) => <AnimeCard key={anime.mal_id} anime={anime} />)}
            </div>
          ) : (
            <div className="text-center py-20 text-[var(--text3)]">No anime found.</div>
          )}
        </>
      )}
    </div>
  );
}
