import React, { useState, useRef, useEffect } from 'react';
import { AnimeCard } from '@/components/AnimeCard';
import { GridSkeleton } from '@/components/LoadingSkeleton';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { SlidersHorizontal, X, Search, Database, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useSEO } from '@/hooks/useSEO';

// ── Supabase library with Jikan fallback ─────────────────────────────
async function fetchSupabaseLibrary() {
  try {
    let all: any[] = [];
    let from = 0;
    const batch = 1000;
    let hasMore = true;
    while (hasMore) {
      const { data, error } = await supabase
        .from('anime').select('*')
        .order('created_at', { ascending: false })
        .range(from, from + batch - 1);
      if (error) throw error;
      const rows = data || [];
      all = [...all, ...rows];
      hasMore = rows.length === batch;
      from += batch;
    }
    if (all.length === 0) throw new Error('empty');
    return { source: 'supabase', data: all.map((row: any) => ({
      mal_id:   row.mal_id   ?? row.id,
      title:    row.title    ?? row.title_english ?? row.title_romaji ?? row.name,
      score:    row.score    ?? row.rating ?? null,
      episodes: row.episodes ?? row.episodes_total ?? row.episode_count ?? null,
      type:     row.type     ?? row.format ?? 'TV',
      images: {
        webp: { large_image_url: row.image_url ?? row.cover_url ?? row.cover_image ?? row.thumbnail ?? row.poster ?? '' },
        jpg:  { large_image_url: row.image_url ?? row.cover_url ?? row.cover_image ?? row.thumbnail ?? row.poster ?? '' },
      },
    })) };
  } catch {
    // Supabase blocked — fall back to Jikan top anime as the library
    const res = await fetch('https://api.jikan.moe/v4/top/anime?limit=24&sfw=true');
    if (!res.ok) throw new Error('Both sources failed');
    const json = await res.json();
    return { source: 'jikan', data: json.data || [] };
  }
}

function useSupabaseLibrary() {
  return useQuery({
    queryKey: ['browse', 'supabase'],
    queryFn: fetchSupabaseLibrary,
    staleTime: 2 * 60 * 1000,
    retry: 1,
  });
}

// ── Jikan top anime (infinite) ────────────────────────────────────────
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

// ── Types & constants ─────────────────────────────────────────────────
interface Filters {
  q: string; genre: string; type: string;
  status: string; minScore: string; year: string; orderBy: string;
}
const DEFAULT_FILTERS: Filters = { q: '', genre: '', type: '', status: '', minScore: '', year: '', orderBy: 'popularity' };

const GENRES = [
  { id: '', name: 'All Genres' }, { id: '1', name: 'Action' },
  { id: '2', name: 'Adventure' }, { id: '4', name: 'Comedy' },
  { id: '8', name: 'Drama' }, { id: '10', name: 'Fantasy' },
  { id: '22', name: 'Romance' }, { id: '24', name: 'Sci-Fi' },
  { id: '36', name: 'Slice of Life' }, { id: '30', name: 'Sports' },
  { id: '37', name: 'Supernatural' }, { id: '41', name: 'Thriller' },
];
const TYPES = ['', 'TV', 'Movie', 'OVA', 'Special', 'ONA'];
const ORDER_BY = [
  { v: 'popularity', l: 'Most Popular' }, { v: 'score', l: 'Highest Rated' },
  { v: 'start_date', l: 'Newest First' }, { v: 'title', l: 'A–Z' },
];
const THIS_YEAR = new Date().getFullYear();
const YEARS = ['', ...Array.from({ length: 35 }, (_, i) => String(THIS_YEAR - i))];

type Tab = 'library' | 'top' | 'search';

export default function Browse() {
  useSEO({ title: 'Browse Anime', description: 'Browse thousands of anime — search by genre, type, year and score on KamiStream.' });
  const [tab,         setTab]         = useState<Tab>('library');
  const [inputVal,    setInputVal]    = useState('');
  const [filters,     setFilters]     = useState<Filters>(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);

  // Supabase library
  const { data: supabaseResult, isLoading: supabaseLoading, isError: supabaseError } = useSupabaseLibrary();
  const supabaseData = supabaseResult?.data || [];
  const supabaseSource = supabaseResult?.source || 'supabase';

  // Top anime infinite
  const {
    data: topPages, fetchNextPage: fetchNextTop,
    hasNextPage: hasMoreTop, isFetchingNextPage: loadingMoreTop,
    isLoading: topLoading,
  } = useInfiniteQuery({
    queryKey: ['browse', 'top'],
    queryFn: ({ pageParam = 1 }) => fetchTopPage(pageParam as number),
    getNextPageParam: (last: any) => {
      const cur = last?.pagination?.current_page ?? 1;
      const max = last?.pagination?.last_visible_page ?? 1;
      if (cur * 25 >= 1000 || cur >= max) return undefined;
      return cur + 1;
    },
    initialPageParam: 1,
    staleTime: 10 * 60 * 1000,
    enabled: tab === 'top',
  });

  // Auto-fetch first 4 pages (100 anime) when Top 1000 tab opens
  useEffect(() => {
    if (tab !== 'top' || topLoading || loadingMoreTop) return;
    const loaded = topPages?.pages.length ?? 0;
    if (loaded > 0 && loaded < 4 && hasMoreTop) {
      // Small delay to avoid rate limiting
      const t = setTimeout(() => fetchNextTop(), 400);
      return () => clearTimeout(t);
    }
  }, [tab, topPages?.pages.length, topLoading, loadingMoreTop, hasMoreTop]);

  // Search infinite
  const {
    data: searchPages, fetchNextPage: fetchNextSearch,
    hasNextPage: hasMoreSearch, isFetchingNextPage: loadingMoreSearch,
    isLoading: searchLoading, isFetching: searchFetching,
  } = useInfiniteQuery({
    queryKey: ['browse', 'search', filters],
    queryFn: ({ pageParam = 1 }) => fetchJikanFiltered(filters, pageParam as number),
    getNextPageParam: (last: any) => {
      const cur = last?.pagination?.current_page ?? 1;
      const max = last?.pagination?.last_visible_page ?? 1;
      return cur >= max ? undefined : cur + 1;
    },
    initialPageParam: 1,
    enabled: tab === 'search',
    staleTime: 3 * 60 * 1000,
  });

  const topAnime    = topPages?.pages.flatMap((p: any) => p.data ?? []) ?? [];
  const searchAnime = searchPages?.pages.flatMap((p: any) => p.data ?? []) ?? [];

  const setFilter = (key: keyof Filters, val: string) => setFilters(f => ({ ...f, [key]: val }));
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

  // Current tab data
  const animeList   = tab === 'library' ? (supabaseData || []) : tab === 'top' ? topAnime : searchAnime;
  const isLoading   = tab === 'library' ? supabaseLoading : tab === 'top' ? topLoading : (searchLoading || searchFetching);
  const hasMore     = tab === 'top' ? hasMoreTop : tab === 'search' ? hasMoreSearch : false;
  const loadingMore = tab === 'top' ? loadingMoreTop : loadingMoreSearch;
  const loadMore    = tab === 'top' ? fetchNextTop : fetchNextSearch;

  const heading = tab === 'search' && filters.q ? `Results for "${filters.q}"` : 'Browse Anime';

  return (
    <div className="p-4 md:p-6 pb-20">
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
          {tab === 'search' && (
            <button onClick={() => { setTab('library'); setInputVal(''); setFilters(DEFAULT_FILTERS); }}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-[12px] font-bold text-[var(--text3)] border border-[var(--border)] hover:text-white transition-all">
              <X className="w-3.5 h-3.5" /> Clear
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setTab('library')}
            className={`px-5 py-2 rounded-xl text-[13px] font-bold transition-all flex items-center gap-2 ${tab === 'library' ? 'bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white' : 'bg-[var(--card)] text-[var(--text2)] border border-[var(--border)] hover:text-white'}`}>
            <Database className="w-3.5 h-3.5" /> Our Library
            {supabaseData && supabaseData.length > 0 && (
              <span className={`px-1.5 py-0.5 rounded-md text-[10px] ${tab === 'library' ? 'bg-white/20' : 'bg-[var(--pink)]/20 text-[var(--pink)]'}`}>
                {supabaseData.length}
              </span>
            )}
          </button>
          <button onClick={() => setTab('top')}
            className={`px-5 py-2 rounded-xl text-[13px] font-bold transition-all ${tab === 'top' ? 'bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white' : 'bg-[var(--card)] text-[var(--text2)] border border-[var(--border)] hover:text-white'}`}>
            🔥 Top 1000
          </button>
          <button onClick={() => setTab('search')}
            className={`px-5 py-2 rounded-xl text-[13px] font-bold transition-all ${tab === 'search' ? 'bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white' : 'bg-[var(--card)] text-[var(--text2)] border border-[var(--border)] hover:text-white'}`}>
            🔍 Search & Filter
          </button>
        </div>

        {/* Filters panel */}
        {tab === 'search' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <button onClick={() => setShowFilters(!showFilters)}
                className={`relative flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-bold border transition-all ${showFilters ? 'bg-[var(--purple)] border-[var(--purple)] text-white' : 'bg-[var(--card)] border-[var(--border)] text-[var(--text2)] hover:text-white'}`}>
                <SlidersHorizontal className="w-4 h-4" /> Filters
                {activeFilterCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-[var(--pink)] text-white text-[10px] font-black rounded-full flex items-center justify-center">{activeFilterCount}</span>
                )}
              </button>
              {activeFilterCount > 0 && (
                <button onClick={resetFilters} className="flex items-center gap-1 text-[12px] font-bold text-[var(--text3)] hover:text-[var(--pink)] transition-colors">
                  <X className="w-3 h-3" /> Reset
                </button>
              )}
            </div>
            {showFilters && (
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {[
                  { label: 'Genre', key: 'genre', opts: GENRES.map(g => ({ v: g.id, l: g.name })) },
                  { label: 'Type', key: 'type', opts: TYPES.map(t => ({ v: t, l: t || 'Any Type' })) },
                  { label: 'Status', key: 'status', opts: [{ v: '', l: 'Any Status' }, { v: 'airing', l: 'Airing' }, { v: 'complete', l: 'Finished' }, { v: 'upcoming', l: 'Upcoming' }] },
                  { label: 'Min Score', key: 'minScore', opts: [{ v: '', l: 'Any Score' }, { v: '9', l: '9+ Masterpiece' }, { v: '8', l: '8+ Great' }, { v: '7', l: '7+ Good' }, { v: '6', l: '6+ Decent' }] },
                  { label: 'Year', key: 'year', opts: YEARS.map(y => ({ v: y, l: y || 'Any Year' })) },
                  { label: 'Sort By', key: 'orderBy', opts: ORDER_BY.map(o => ({ v: o.v, l: o.l })) },
                ].map(({ label, key, opts }) => (
                  <div key={key}>
                    <label className="text-[10px] font-black text-[var(--text3)] uppercase tracking-wider block mb-1.5">{label}</label>
                    <select value={(filters as any)[key]} onChange={e => setFilter(key as keyof Filters, e.target.value)}
                      className="w-full bg-[var(--bg3)] border border-[var(--border)] text-white text-[12px] px-3 py-2 rounded-xl outline-none focus:border-[var(--purple)]">
                      {opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Grid */}
      {isLoading && animeList.length === 0 ? (
        <GridSkeleton />
      ) : tab === 'library' && supabaseError ? (
        <GridSkeleton />
      ) : tab === 'library' && animeList.length === 0 && !supabaseLoading ? (
        <div className="text-center py-20">
          <Database className="w-12 h-12 text-[var(--text3)] mx-auto mb-4 opacity-40" />
          <p className="text-[var(--text3)] text-[14px] font-bold">No anime in your library yet.</p>
          <p className="text-[var(--text3)] text-[12px] mt-1 opacity-60">Import anime via the Admin panel → Anime Manager.</p>
        </div>
      ) : animeList.length > 0 ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {animeList.map((anime: any) => <AnimeCard key={`${anime.mal_id}-${anime.title}`} anime={anime} />)}
          </div>
          {hasMore && (
            <div className="flex justify-center mt-10">
              <button
                onClick={async () => {
                  // Load 4 pages at once (100 anime) for top tab, 1 page for search
                  if (tab === 'top') {
                    for (let i = 0; i < 4; i++) {
                      await fetchNextTop();
                      await new Promise(r => setTimeout(r, 400));
                    }
                  } else {
                    loadMore();
                  }
                }}
                disabled={loadingMore}
                className="flex items-center gap-2 bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white px-8 py-3 rounded-xl text-[13px] font-bold hover:brightness-110 transition-all disabled:opacity-60">
                {loadingMore ? <><Loader2 className="w-4 h-4 animate-spin" /> Loading…</> : `Load More — ${animeList.length} shown`}
              </button>
            </div>
          )}
          {!hasMore && tab !== 'library' && (
            <p className="text-center text-[12px] text-[var(--text3)] mt-8">All {animeList.length} anime loaded</p>
          )}
        </>
      ) : (
        <div className="text-center py-20">
          <p className="text-[var(--text3)] text-[14px]">No anime found. Try different keywords or filters.</p>
          {activeFilterCount > 0 && (
            <button onClick={resetFilters} className="mt-4 text-[var(--pink)] text-[13px] font-bold hover:underline">Clear filters</button>
          )}
        </div>
      )}
    </div>
  );
}
