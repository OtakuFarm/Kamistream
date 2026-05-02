import React, { useState, useEffect } from 'react';
import { AnimeCard } from '@/components/AnimeCard';
import { GridSkeleton } from '@/components/LoadingSkeleton';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { Database, SlidersHorizontal, X } from 'lucide-react';

// ── Jikan fetch with filters ──────────────────────────────────────────
interface Filters {
  q: string;
  genre: string;
  type: string;
  status: string;
  minScore: string;
  year: string;
  orderBy: string;
}

const fetchJikanFiltered = async (f: Filters) => {
  const params = new URLSearchParams();
  if (f.q)        params.set('q',        f.q);
  if (f.genre)    params.set('genres',   f.genre);
  if (f.type)     params.set('type',     f.type);
  if (f.status)   params.set('status',   f.status);
  if (f.minScore) params.set('min_score',f.minScore);
  if (f.year)     params.set('start_date', `${f.year}-01-01`);
  params.set('order_by', f.orderBy || 'popularity');
  params.set('limit',    '24');
  params.set('sfw',      'true');

  const res = await fetch(`https://api.jikan.moe/v4/anime?${params.toString()}`);
  if (!res.ok) throw new Error('Jikan error');
  return res.json();
};

function useFilteredAnime(f: Filters, enabled: boolean) {
  return useQuery({
    queryKey: ['anime', 'filtered', JSON.stringify(f)],
    queryFn:  () => fetchJikanFiltered(f),
    enabled,
    staleTime: 3 * 60 * 1000,
  });
}

// ── Supabase library ──────────────────────────────────────────────────
const fetchAllSupabaseAnime = async () => {
  let allRows: any[] = [];
  let from = 0;
  const batch = 1000;
  let hasMore = true;
  while (hasMore) {
    const { data, error } = await supabase.from('anime').select('*')
      .order('created_at', { ascending: false }).range(from, from + batch - 1);
    if (error) throw error;
    allRows = [...allRows, ...(data || [])];
    hasMore = (data || []).length === batch;
    from += batch;
  }
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
    queryFn:  fetchAllSupabaseAnime,
    staleTime: 2 * 60 * 1000,
    retry: 1,
  });
}

// ── Helpers ───────────────────────────────────────────────────────────
const GENRES = [
  { id: '',   name: 'All Genres' },
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

const TYPES    = ['', 'TV', 'Movie', 'OVA', 'Special', 'ONA'];
const STATUSES = ['', 'airing', 'complete', 'upcoming'];
const SCORES   = ['', '9', '8', '7', '6'];
const ORDER_BY = [
  { v: 'popularity', l: 'Most Popular' },
  { v: 'score',      l: 'Highest Rated' },
  { v: 'start_date', l: 'Newest First' },
  { v: 'title',      l: 'A–Z' },
];

const THIS_YEAR = new Date().getFullYear();
const YEARS = ['', ...Array.from({ length: 35 }, (_, i) => String(THIS_YEAR - i))];

const DEFAULT_FILTERS: Filters = { q: '', genre: '', type: '', status: '', minScore: '', year: '', orderBy: 'popularity' };

function hasActiveFilters(f: Filters) {
  return f.genre || f.type || f.status || f.minScore || f.year || f.orderBy !== 'popularity';
}

type Tab = 'library' | 'discover';

export default function Browse() {
  const urlQ = new URLSearchParams(window.location.search).get('q') || '';
  const [tab,         setTab]         = useState<Tab>(urlQ ? 'discover' : 'library');
  const [filters,     setFilters]     = useState<Filters>({ ...DEFAULT_FILTERS, q: urlQ });
  const [showFilters, setShowFilters] = useState(false);

  const { data: supabaseAnime, isLoading: supabaseLoading, isError: supabaseError } = useSupabaseAnime();
  const discoverEnabled = tab === 'discover';
  const { data: jikanData, isLoading: jikanLoading } = useFilteredAnime(filters, discoverEnabled);

  // Sync URL search param
  useEffect(() => {
    if (urlQ) { setTab('discover'); setFilters(f => ({ ...f, q: urlQ })); }
  }, [urlQ]);

  const setFilter = (key: keyof Filters, value: string) =>
    setFilters(f => ({ ...f, [key]: value }));

  const resetFilters = () => setFilters(f => ({ ...DEFAULT_FILTERS, q: f.q }));

  const activeFilterCount = [filters.genre, filters.type, filters.status, filters.minScore, filters.year]
    .filter(Boolean).length + (filters.orderBy !== 'popularity' ? 1 : 0);

  const libraryEmpty = !supabaseLoading && (!supabaseAnime || supabaseAnime.length === 0);

  return (
    <div className="p-4 md:p-6 pb-20">

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-heading font-black text-white mb-4">
          {filters.q ? `Results for "${filters.q}"` : 'Browse Anime'}
        </h1>

        {/* Tab switcher */}
        {!urlQ && (
          <div className="flex gap-2 mb-5">
            <button onClick={() => setTab('library')}
              className={`px-5 py-2 rounded-xl text-[13px] font-bold transition-all flex items-center gap-2 ${tab === 'library' ? 'bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white' : 'bg-[var(--card)] text-[var(--text2)] border border-[var(--border)] hover:text-white'}`}>
              <Database className="w-3.5 h-3.5" /> Our Library
              {supabaseAnime && supabaseAnime.length > 0 && (
                <span className="bg-white/20 px-1.5 py-0.5 rounded-md text-[10px]">{supabaseAnime.length}</span>
              )}
            </button>
            <button onClick={() => setTab('discover')}
              className={`px-5 py-2 rounded-xl text-[13px] font-bold transition-all ${tab === 'discover' ? 'bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white' : 'bg-[var(--card)] text-[var(--text2)] border border-[var(--border)] hover:text-white'}`}>
              Discover
            </button>
          </div>
        )}

        {/* Discover filters */}
        {(tab === 'discover' || urlQ) && (
          <div className="space-y-3">
            {/* Search + filter toggle row */}
            <div className="flex gap-2">
              <input
                value={filters.q}
                onChange={e => setFilter('q', e.target.value)}
                placeholder="Search anime…"
                className="flex-1 bg-[var(--card)] border border-[var(--border)] text-white text-[13px] px-4 py-2.5 rounded-xl outline-none focus:border-[var(--purple)] placeholder:text-[var(--text3)]"
              />
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`relative flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold border transition-all ${showFilters ? 'bg-[var(--purple)] border-[var(--purple)] text-white' : 'bg-[var(--card)] border-[var(--border)] text-[var(--text2)] hover:text-white'}`}
              >
                <SlidersHorizontal className="w-4 h-4" /> Filters
                {activeFilterCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-[var(--pink)] text-white text-[10px] font-black rounded-full flex items-center justify-center">
                    {activeFilterCount}
                  </span>
                )}
              </button>
              {activeFilterCount > 0 && (
                <button onClick={resetFilters}
                  className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-[12px] font-bold text-[var(--text3)] border border-[var(--border)] hover:text-[var(--pink)] hover:border-[var(--pink)] transition-all">
                  <X className="w-3.5 h-3.5" /> Reset
                </button>
              )}
            </div>

            {/* Expanded filter panel */}
            {showFilters && (
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">

                {/* Genre */}
                <div>
                  <label className="text-[10px] font-black text-[var(--text3)] uppercase tracking-wider block mb-1.5">Genre</label>
                  <select value={filters.genre} onChange={e => setFilter('genre', e.target.value)}
                    className="w-full bg-[var(--bg3)] border border-[var(--border)] text-white text-[12px] px-3 py-2 rounded-xl outline-none focus:border-[var(--purple)]">
                    {GENRES.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>

                {/* Type */}
                <div>
                  <label className="text-[10px] font-black text-[var(--text3)] uppercase tracking-wider block mb-1.5">Type</label>
                  <select value={filters.type} onChange={e => setFilter('type', e.target.value)}
                    className="w-full bg-[var(--bg3)] border border-[var(--border)] text-white text-[12px] px-3 py-2 rounded-xl outline-none focus:border-[var(--purple)]">
                    {TYPES.map(t => <option key={t} value={t}>{t || 'Any Type'}</option>)}
                  </select>
                </div>

                {/* Status */}
                <div>
                  <label className="text-[10px] font-black text-[var(--text3)] uppercase tracking-wider block mb-1.5">Status</label>
                  <select value={filters.status} onChange={e => setFilter('status', e.target.value)}
                    className="w-full bg-[var(--bg3)] border border-[var(--border)] text-white text-[12px] px-3 py-2 rounded-xl outline-none focus:border-[var(--purple)]">
                    <option value="">Any Status</option>
                    <option value="airing">Airing</option>
                    <option value="complete">Finished</option>
                    <option value="upcoming">Upcoming</option>
                  </select>
                </div>

                {/* Min score */}
                <div>
                  <label className="text-[10px] font-black text-[var(--text3)] uppercase tracking-wider block mb-1.5">Min Score</label>
                  <select value={filters.minScore} onChange={e => setFilter('minScore', e.target.value)}
                    className="w-full bg-[var(--bg3)] border border-[var(--border)] text-white text-[12px] px-3 py-2 rounded-xl outline-none focus:border-[var(--purple)]">
                    <option value="">Any Score</option>
                    <option value="9">9+ Masterpiece</option>
                    <option value="8">8+ Great</option>
                    <option value="7">7+ Good</option>
                    <option value="6">6+ Decent</option>
                  </select>
                </div>

                {/* Year */}
                <div>
                  <label className="text-[10px] font-black text-[var(--text3)] uppercase tracking-wider block mb-1.5">Year</label>
                  <select value={filters.year} onChange={e => setFilter('year', e.target.value)}
                    className="w-full bg-[var(--bg3)] border border-[var(--border)] text-white text-[12px] px-3 py-2 rounded-xl outline-none focus:border-[var(--purple)]">
                    {YEARS.map(y => <option key={y} value={y}>{y || 'Any Year'}</option>)}
                  </select>
                </div>

                {/* Sort */}
                <div>
                  <label className="text-[10px] font-black text-[var(--text3)] uppercase tracking-wider block mb-1.5">Sort By</label>
                  <select value={filters.orderBy} onChange={e => setFilter('orderBy', e.target.value)}
                    className="w-full bg-[var(--bg3)] border border-[var(--border)] text-white text-[12px] px-3 py-2 rounded-xl outline-none focus:border-[var(--purple)]">
                    {ORDER_BY.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Library ── */}
      {tab === 'library' && !urlQ && (
        <>
          {supabaseLoading && <><p className="text-[12px] text-[var(--text3)] mb-4 animate-pulse">Loading library…</p><GridSkeleton /></>}
          {supabaseError && <div className="text-center py-20"><p className="text-[var(--text3)]">Couldn't load the library right now.</p></div>}
          {libraryEmpty && !supabaseError && (
            <div className="text-center py-20">
              <Database className="w-12 h-12 text-[var(--text3)] mx-auto mb-4 opacity-40" />
              <p className="text-[var(--text3)] text-[14px] font-bold">No anime in the library yet.</p>
              <p className="text-[var(--text3)] text-[12px] mt-1 opacity-60">Add titles via the Admin panel.</p>
            </div>
          )}
          {!supabaseLoading && supabaseAnime && supabaseAnime.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {supabaseAnime.map((anime: any) => <AnimeCard key={anime.mal_id ?? anime.title} anime={anime} />)}
            </div>
          )}
        </>
      )}

      {/* ── Discover ── */}
      {(tab === 'discover' || urlQ) && (
        <>
          {jikanLoading ? <GridSkeleton /> : jikanData?.data?.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {jikanData.data.map((anime: any) => <AnimeCard key={anime.mal_id} anime={anime} />)}
            </div>
          ) : (
            <div className="text-center py-20">
              <p className="text-[var(--text3)] text-[14px]">No anime found. Try adjusting your filters.</p>
              {activeFilterCount > 0 && (
                <button onClick={resetFilters} className="mt-4 text-[var(--pink)] text-[13px] font-bold hover:underline">
                  Clear all filters
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
