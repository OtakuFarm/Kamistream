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

// Fetch all anime from Supabase and normalise to the shape AnimeCard expects
const fetchSupabaseAnime = async () => {
  const { data, error } = await supabase
    .from('anime')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;

  // Map whatever columns Supabase returns → AnimeCard-compatible shape
  return (data || []).map((row: any) => ({
    mal_id:   row.mal_id   ?? row.id,
    title:    row.title,
    score:    row.score    ?? null,
    episodes: row.episodes ?? null,
    type:     row.type     ?? 'TV',
    images: {
      webp: { large_image_url: row.image_url ?? row.cover_url ?? row.thumbnail ?? '' },
      jpg:  { large_image_url: row.image_url ?? row.cover_url ?? row.thumbnail ?? '' },
    },
  }));
};

function useSupabaseAnime() {
  return useQuery({
    queryKey: ['supabase', 'anime'],
    queryFn: fetchSupabaseAnime,
    staleTime: 2 * 60 * 1000,
    retry: 1,
  });
}

type Tab = 'library' | 'discover';

export default function Browse() {
  const q = new URLSearchParams(window.location.search).get('q') || '';

  const [tab, setTab]             = useState<Tab>('library');
  const [activeGenre, setActiveGenre] = useState('');

  const { data: supabaseAnime, isLoading: supabaseLoading, isError: supabaseError } =
    useSupabaseAnime();
  const { data: searchResults,  isLoading: searchLoading  } = useAnimeSearch(q);
  const { data: genreResults,   isLoading: genreLoading   } = useAnimeByGenre(activeGenre);

  // Switch to discover automatically when the user types a search
  useEffect(() => { if (q) setTab('discover'); }, [q]);

  const discoverData    = q ? searchResults?.data : genreResults?.data;
  const discoverLoading = q ? searchLoading       : genreLoading;

  const libraryEmpty = !supabaseLoading && (!supabaseAnime || supabaseAnime.length === 0);

  return (
    <div className="p-4 md:p-6 pb-20">
      <div className="mb-8">
        <h1 className="text-2xl font-heading font-black text-white mb-4">
          {q ? `Results for "${q}"` : 'Browse Anime'}
        </h1>

        {/* Tab switcher */}
        {!q && (
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setTab('library')}
              className={`px-5 py-2 rounded-xl text-[13px] font-bold transition-all flex items-center gap-2 ${tab === 'library' ? 'bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white' : 'bg-[var(--card)] text-[var(--text2)] border border-[var(--border)] hover:text-white'}`}
            >
              <Database className="w-3.5 h-3.5" /> Our Library
            </button>
            <button
              onClick={() => setTab('discover')}
              className={`px-5 py-2 rounded-xl text-[13px] font-bold transition-all ${tab === 'discover' ? 'bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white' : 'bg-[var(--card)] text-[var(--text2)] border border-[var(--border)] hover:text-white'}`}
            >
              Discover
            </button>
          </div>
        )}

        {/* Genre filters — only on Discover tab */}
        {(tab === 'discover' || q) && !q && (
          <div className="flex flex-wrap gap-2">
            {GENRES.map(g => (
              <button
                key={g.id}
                onClick={() => setActiveGenre(g.id)}
                className={`px-4 py-1.5 rounded-full text-[12px] font-bold transition-all ${activeGenre === g.id ? 'bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white' : 'bg-[var(--card)] text-[var(--text2)] border border-[var(--border)] hover:border-[var(--purple)] hover:text-white'}`}
              >
                {g.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Library tab (Supabase) ── */}
      {(tab === 'library' && !q) && (
        <>
          {supabaseLoading && <GridSkeleton />}

          {supabaseError && (
            <div className="text-center py-20">
              <p className="text-[var(--text3)] text-[14px]">Couldn't load the library right now.</p>
            </div>
          )}

          {libraryEmpty && !supabaseError && (
            <div className="text-center py-20">
              <Database className="w-12 h-12 text-[var(--text3)] mx-auto mb-4 opacity-40" />
              <p className="text-[var(--text3)] text-[14px] font-bold">No anime in the library yet.</p>
              <p className="text-[var(--text3)] text-[12px] mt-1 opacity-60">
                Add titles via the Admin panel and they'll appear here.
              </p>
            </div>
          )}

          {!supabaseLoading && supabaseAnime && supabaseAnime.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {supabaseAnime.map((anime: any) => (
                <AnimeCard key={anime.mal_id} anime={anime} />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Discover tab (Jikan) or search results ── */}
      {(tab === 'discover' || q) && (
        <>
          {discoverLoading ? (
            <GridSkeleton />
          ) : discoverData?.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {discoverData.map((anime: any) => (
                <AnimeCard key={anime.mal_id} anime={anime} />
              ))}
            </div>
          ) : (
            <div className="text-center py-20 text-[var(--text3)]">No anime found.</div>
          )}
        </>
      )}
    </div>
  );
}
