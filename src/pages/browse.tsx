import React, { useState, useRef, useCallback } from 'react';
import { AnimeCard } from '@/components/AnimeCard';
import { GridSkeleton } from '@/components/LoadingSkeleton';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { SlidersHorizontal, X, Search, Loader2 } from 'lucide-react';

// ── Jikan fetchers ────────────────────────────────────────────────────
interface Filters {
  q: string; genre: string; type: string;
  status: string; minScore: string; year: string; orderBy: string;
}
const DEFAULT_FILTERS: Filters = {
  q: '', genre: '', type: '', status: '', minScore: '', year: '', orderBy: 'popularity'
};

async function fetchTopPage(page: number) {
  const res = await fetch(`https://api.jikan.moe/v4/top/anime?limit=25&page=${page}&sfw=true`);
  if (!res.ok) throw new Error('Jikan error');
  return res.json();
}

async function fetchJikanFiltered(f: Filters, page = 1) {
  const params = new URLSearchParams();
  if (f.q)        params.set('q',          f.q);
  if (f.genre)    params.set('genres',     f.genre);
  if (f.type)     params.set('type',       f.type);
  if (f.status)   params.set('status',     f.status);
  if (f.minScore) params.set('min_score',  f.minScore);
  if (f.year)     params.set('start_date', `${f.year}-01-01`);
  params.set('order_by', f.orderBy || 'popularity');
  params.set('limit', '25');
  params.set('page',  String(page));
  params.set('sfw',   'true');
  const res = await fetch(`https://api.jikan.moe/v4/anime?${params}`);
  if (!res.ok) throw new Error('Jikan error');
  return res.json();
}

// ── Constants ─────────────────────────────────────────────────────────
const GENRES = [
  { id: '',   name: 'All Genres' }, { id: '1',  name: 'Action' },
  { id: '2',  name: 'Adventure' }, { id: '4',  name: 'Comedy' },
  { id: '8',  name: 'Drama' },     { id: '10', name: 'Fantasy' },
  { id: '22', name: 'Romance' },   { id: '24', name: 'Sci-Fi' },
  { id: '36', name: 'Slice of Life' }, { id: '30', name: 'Sports' },
  { id: '37', name: 'Supernatural' },  { id: '41', name: 'Thriller' },
];
const TYPES = ['', 'TV', 'Movie', 'OVA', 'Special', 'ONA'];
const ORDER_BY = [
  { v: 'popularity', l: 'Most Popular' }, { v: 'score',      l: 'Highest Rated' },
  { v: 'start_date', l: 'Newest First' }, { v: 'title',      l: 'A–Z' },
];
const THIS_YEAR = new Date().getFullYear();
const YEARS = ['', ...Array.from({ length: 35 }, (_, i) => String(THIS_YEAR - i))];

type Tab = 'library' | 'search';

export default function Browse() {
  const [tab,         setTab]         = useState<Tab>('library');
  const [inputVal,    setInputVal]    = useState('');
  const [filters,     setFilters]     = useState<Filters>(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);

  // ── Infinite library (top anime, up to 1000) ──
  const {
    data: libraryPages,
    fetchNextPage: fetchNextLib,
    hasNextPage: hasMoreLib,
    isFetchingNextPage: loadingMoreLib,
    isLoading: libraryLoading,
  } = useInfiniteQuery({
    queryKey: ['browse', 'library'],
    queryFn:  ({ pageParam = 1 }) => fetchTopPage(pageParam as number),
    getNextPageParam: (last: any) => {
      const current = last?.pagination?.current_page ?? 1;
      const last_pg = last?.pagination?.last_visible_page ?? 1;
      const total   = last?.pagination?.items?.total ?? 0;
      const loaded  = (last?.pagination?.current_page ?? 1) * 25;
      // Stop at 1000 or last page
      if (loaded >= 1000 || current >= last_pg) return undefined;
      return current + 1;
    },
    initialPageParam: 1,
    staleTime: 10 * 60 * 1000,
  });

  // ── Infinite search results ──
  const {
    data: searchPages,
    fetchNextPage: fetchNextSearch,
    hasNextPage: hasMoreSearch,
    isFetchingNextPage: loadingMoreSearch,
    isLoading: searchLoading,
    isFetching: searchFetching,
  } = useInfiniteQuery({
    queryKey: ['browse', 'search', JSON.stringify(filters)],
    queryFn:  ({ pageParam = 1 }) => fetchJikanFiltered(filters, pageParam as number),
    getNextPageParam: (last: any) => {
      const current = last?.pagination?.current_page ?? 1;
      const last_pg = last?.pagination?.last_visible_page ?? 1;
      if (current >= last_pg) return undefined;
      return current + 1;
    },
    initialPageParam: 1,
    enabled: tab === 'search',
    staleTime: 3 * 60 * 1000,
  });

  const libraryAnime = libraryPages?.pages.flatMap((p: any) => p.data ?? []) ?? [];
  const searchAnime  = searchPages?.pages.flatMap((p: any) => p.data ?? []) ?? [];

  const setFilter = (key: keyof Filters, val: string) =>
    setFilters(f => ({ ...f, [key]: val }));

  const resetFilters = () => setFilters(f => ({ ...DEFAULT_FILTERS, q: f.q }));

  function submitSearch() {
    const q = inputVal.trim();
    setFilters(f => ({ ...f, q }));
    setTab('search');
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') submitSearch();
  }

  const activeFilterCount = [filters.genre, filters.type, filters.status, filters.minScore, filters.year]
    .filter(Boolean).length + (filters.orderBy !== 'popularity' ? 1 : 0);

  const showingSearch = tab === 'search';
  const animeList     = showingSearch ? searchAnime : libraryAnime;
  const isLoading     = showingSearch ? (searchLoading || searchFetching) : libraryLoading;
  const hasMore       = showingSearch ? hasMoreSearch : hasMoreLib;
  const loadingMore   = showingSearch ? loadingMoreSearch : loadingMoreLib;
  const loadMore      = showingSearch ? fetchNextSearch : fetchNextLib;
  const heading       = showingSearch && filters.q ? `Results for "${filters.q}"` : showingSearch ? 'Search Results' : 'Browse Anime';

  return (
    <div className="p-4 md:p-6 pb-20">

      {/* ── Header + Search ── */}
      <div className="mb-6 space-y-3">
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-heading font-black text-white">{heading}</h1>
          {animeList.length > 0 && (
            <span className="text-[12px] text-[var(--text3)] font-bold">{animeList.length} anime</span>
          )}
        </div>

        {/* Search bar */}
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text3)]" />
            <input
              value={inputVal}
              onChange={e => setInputVal(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search anime… press Enter"
              className="w-full bg-[var(--card)] border border-[var(--border)] text-white text-[13px] pl-10 pr-4 py-2.5 rounded-xl outline-none focus:border-[var(--purple)] placeholder:text-[var(--text3)]"
            />
          </div>
          <button onClick={submitSearch}
            className="bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white px-5 py-2.5 rounded-xl text-[13px] font-bold hover:brightness-110 transition-all">
            Search
          </button>
          {showingSearch && (
            <button onClick={() => { setTab('library'); setInputVal(''); setFilters(DEFAULT_FILTERS); }}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-[12px] font-bold text-[var(--text3)] border border-[var(--border)] hover:text-white transition-all">
              <X className="w-3.5 h-3.5" /> Clear
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          <button onClick={() => setTab('library')}
            className={`px-5 py-2 rounded-xl text-[13px] font-bold transition-all ${tab === 'library' ? 'bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white' : 'bg-[var(--card)] text-[var(--text2)] border border-[var(--border)] hover:text-white'}`}>
            🔥 Top 1000 Anime
          </button>
          <button onClick={() => { setTab('search'); }}
            className={`px-5 py-2 rounded-xl text-[13px] font-bold transition-all ${tab === 'search' ? 'bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white' : 'bg-[var(--card)] text-[var(--text2)] border border-[var(--border)] hover:text-white'}`}>
            🔍 Search & Filter
          </button>
        </div>

        {/* Filter panel — search tab only */}
        {tab === 'search' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <button onClick={() => setShowFilters(!showFilters)}
                className={`relative flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-bold border transition-all ${showFilters ? 'bg-[var(--purple)] border-[var(--purple)] text-white' : 'bg-[var(--card)] border-[var(--border)] text-[var(--text2)] hover:text-white'}`}>
                <SlidersHorizontal className="w-4 h-4" /> Filters
                {activeFilterCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-[var(--pink)] text-white text-[10px] font-black rounded-full flex items-center justify-center">
                    {activeFilterCount}
                  </span>
                )}
              </button>
              {activeFilterCount > 0 && (
                <button onClick={resetFilters}
                  className="flex items-center gap-1 text-[12px] font-bold text-[var(--text3)] hover:text-[var(--pink)] transition-colors">
                  <X className="w-3 h-3" /> Reset
                </button>
              )}
            </div>
            {showFilters && (
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <div>
                  <label className="text-[10px] font-black text-[var(--text3)] uppercase tracking-wider block mb-1.5">Genre</label>
                  <select value={filters.genre} onChange={e => setFilter('genre', e.target.value)}
                    className="w-full bg-[var(--bg3)] border border-[var(--border)] text-white text-[12px] px-3 py-2 rounded-xl outline-none focus:border-[var(--purple)]">
                    {GENRES.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black text-[var(--text3)] uppercase tracking-wider block mb-1.5">Type</label>
                  <select value={filters.type} onChange={e => setFilter('type', e.target.value)}
                    className="w-full bg-[var(--bg3)] border border-[var(--border)] text-white text-[12px] px-3 py-2 rounded-xl outline-none focus:border-[var(--purple)]">
                    {TYPES.map(t => <option key={t} value={t}>{t || 'Any Type'}</option>)}
                  </select>
                </div>
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
                <div>
                  <label className="text-[10px] font-black text-[var(--text3)] uppercase tracking-wider block mb-1.5">Year</label>
                  <select value={filters.year} onChange={e => setFilter('year', e.target.value)}
                    className="w-full bg-[var(--bg3)] border border-[var(--border)] text-white text-[12px] px-3 py-2 rounded-xl outline-none focus:border-[var(--purple)]">
                    {YEARS.map(y => <option key={y} value={y}>{y || 'Any Year'}</option>)}
                  </select>
                </div>
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

      {/* ── Grid ── */}
      {isLoading && animeList.length === 0 ? (
        <GridSkeleton />
      ) : animeList.length > 0 ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {animeList.map((anime: any) => (
              <AnimeCard key={anime.mal_id} anime={anime} />
            ))}
          </div>

          {/* Load More */}
          {hasMore && (
            <div className="flex justify-center mt-10">
              <button
                onClick={() => loadMore()}
                disabled={loadingMore}
                className="flex items-center gap-2 bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white px-8 py-3 rounded-xl text-[13px] font-bold hover:brightness-110 transition-all disabled:opacity-60"
              >
                {loadingMore
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Loading…</>
                  : `Load More (${animeList.length} shown)`}
              </button>
            </div>
          )}
          {!hasMore && animeList.length > 0 && (
            <p className="text-center text-[12px] text-[var(--text3)] mt-8">
              All {animeList.length} anime loaded
            </p>
          )}
        </>
      ) : (
        <div className="text-center py-20">
          <p className="text-[var(--text3)] text-[14px]">
            {showingSearch ? 'No anime found. Try different keywords or filters.' : 'Nothing to show.'}
          </p>
          {showingSearch && activeFilterCount > 0 && (
            <button onClick={resetFilters} className="mt-4 text-[var(--pink)] text-[13px] font-bold hover:underline">
              Clear all filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
