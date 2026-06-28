import React, { useState, useEffect } from 'react';
import { AnimeCard } from '@/components/AnimeCard';
import { GridSkeleton } from '@/components/LoadingSkeleton';
import { useInfiniteQuery } from '@tanstack/react-query';
import { SlidersHorizontal, X, Search, Loader2 } from 'lucide-react';
import { useSEO } from '@/hooks/useSEO';
import { useSearch } from 'wouter';

// ── AniList fallback for browse ───────────────────────────────────────
import {
  useALTopBrowseInfinite,
  useALBrowseInfinite,
  JIKAN_GENRE_TO_ANILIST,
  JIKAN_TYPE_TO_ANILIST,
  JIKAN_STATUS_TO_ANILIST,
} from '@/lib/anilist';
// Jikan allows ~3 req/sec. This queue spaces calls 350ms apart so the
// auto-fetch burst on the Top 1000 tab never triggers 429s.
const JIKAN_BASE = 'https://api.jikan.moe/v4';
const MIN_GAP_MS = 350;
let lastReqTime = 0;
let browseQueue: Array<() => void> = [];
let browseQueueRunning = false;

function runBrowseQueue() {
  if (browseQueueRunning || browseQueue.length === 0) return;
  browseQueueRunning = true;
  const next = browseQueue.shift()!;
  const wait = Math.max(0, lastReqTime + MIN_GAP_MS - Date.now());
  setTimeout(() => {
    lastReqTime = Date.now();
    next();
    browseQueueRunning = false;
    runBrowseQueue();
  }, wait);
}

function jikanFetch(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    browseQueue.push(async () => {
      try {
        const res = await fetch(url);
        if (res.status === 429) {
          // One automatic retry after back-off
          await new Promise(r => setTimeout(r, 1500));
          const retry = await fetch(url);
          if (!retry.ok) return reject(new Error(`Jikan 429 retry failed: ${retry.status}`));
          return resolve(retry.json());
        }
        if (!res.ok) return reject(new Error(`Jikan error: ${res.status}`));
        resolve(res.json());
      } catch (e) { reject(e); }
    });
    runBrowseQueue();
  });
}

// ── Jikan top anime (infinite) ────────────────────────────────────────
async function fetchTopPage(page: number) {
  return jikanFetch(`${JIKAN_BASE}/top/anime?limit=25&page=${page}&sfw=true`);
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
  return jikanFetch(`${JIKAN_BASE}/anime?${params}`);
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

type Tab = 'top' | 'search';

export default function Browse() {
  useSEO({ title: 'Browse Anime', description: 'Browse thousands of anime — search by genre, type, year and score on KamiStream.' });

  const searchString = useSearch();
  const urlParams    = new URLSearchParams(searchString);
  const urlQ         = urlParams.get('q') || '';

  const [tab,         setTab]         = useState<Tab>(urlQ ? 'search' : 'top');
  const [inputVal,    setInputVal]    = useState(urlQ);
  const [filters,     setFilters]     = useState<Filters>(urlQ ? { ...DEFAULT_FILTERS, q: urlQ } : DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);

  // When the URL ?q= changes (e.g. topbar search from another page), sync state
  useEffect(() => {
    if (!urlQ) return;
    setInputVal(urlQ);
    setFilters(f => ({ ...f, q: urlQ }));
    setTab('search');
  }, [urlQ]);

  // Top anime infinite — Jikan first, AniList fallback on error
  const {
    data: topPages, fetchNextPage: fetchNextTop,
    hasNextPage: hasMoreTop, isFetchingNextPage: loadingMoreTop,
    isLoading: topLoading, isError: topError,
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
    retry: 1,
  });

  // AniList fallback for Top tab (activates automatically when Jikan errors)
  const {
    data: alTopPages, fetchNextPage: fetchNextALTop,
    hasNextPage: hasMoreALTop, isFetchingNextPage: loadingMoreALTop,
    isLoading: alTopLoading,
  } = useALTopBrowseInfinite(tab === 'top' && topError);

  // Search infinite — Jikan first, AniList fallback on error
  const {
    data: searchPages, fetchNextPage: fetchNextSearch,
    hasNextPage: hasMoreSearch, isFetchingNextPage: loadingMoreSearch,
    isLoading: searchLoading, isFetching: searchFetching, isError: searchError,
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
    retry: 1,
  });

  // AniList fallback for Search tab
  const alSearchFilters = {
    q:        filters.q,
    genre:    JIKAN_GENRE_TO_ANILIST[filters.genre]  || '',
    format:   JIKAN_TYPE_TO_ANILIST[filters.type]    || '',
    status:   JIKAN_STATUS_TO_ANILIST[filters.status] || '',
    year:     filters.year,
    minScore: filters.minScore,
    orderBy:  filters.orderBy,
  };
  const {
    data: alSearchPages, fetchNextPage: fetchNextALSearch,
    hasNextPage: hasMoreALSearch, isFetchingNextPage: loadingMoreALSearch,
    isLoading: alSearchLoading,
  } = useALBrowseInfinite(alSearchFilters, tab === 'search' && searchError);

  // Auto-fetch a second page on Top tab open (only when Jikan is working)
  useEffect(() => {
    if (tab !== 'top' || topLoading || loadingMoreTop || topError) return;
    const loaded = topPages?.pages.length ?? 0;
    if (loaded === 1 && hasMoreTop) {
      const t = setTimeout(() => fetchNextTop(), 600);
      return () => clearTimeout(t);
    }
  }, [tab, topPages?.pages.length, topLoading, loadingMoreTop, hasMoreTop, topError]);

  // Merge Jikan + AniList data — AniList takes over when Jikan errors
  const usingALTop    = topError;
  const usingALSearch = searchError;

  const topAnime    = usingALTop
    ? (alTopPages?.pages.flatMap((p: any) => p.data ?? []) ?? [])
    : (topPages?.pages.flatMap((p: any) => p.data ?? []) ?? []);

  const searchAnime = usingALSearch
    ? (alSearchPages?.pages.flatMap((p: any) => p.data ?? []) ?? [])
    : (searchPages?.pages.flatMap((p: any) => p.data ?? []) ?? []);

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

  const isLoading   = tab === 'top'
    ? (usingALTop ? alTopLoading : topLoading)
    : (usingALSearch ? alSearchLoading : (searchLoading || searchFetching));

  const hasMore     = tab === 'top'
    ? (usingALTop ? hasMoreALTop    : hasMoreTop)
    : (usingALSearch ? hasMoreALSearch : hasMoreSearch);

  const loadingMore = tab === 'top'
    ? (usingALTop ? loadingMoreALTop    : loadingMoreTop)
    : (usingALSearch ? loadingMoreALSearch : loadingMoreSearch);

  const loadMore    = tab === 'top'
    ? (usingALTop ? fetchNextALTop    : fetchNextTop)
    : (usingALSearch ? fetchNextALSearch : fetchNextSearch);

  // Show AniList badge when falling back so users know the source
  const usingAniList = (tab === 'top' && usingALTop) || (tab === 'search' && usingALSearch);

  const animeList = tab === 'top' ? topAnime : searchAnime;
  const heading = tab === 'search' && filters.q
    ? `Results for "${filters.q}"`
    : usingAniList ? 'Browse Anime · via AniList' : 'Browse Anime';

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
            <button onClick={() => { setTab('top'); setInputVal(''); setFilters(DEFAULT_FILTERS); }}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-[12px] font-bold text-[var(--text3)] border border-[var(--border)] hover:text-white transition-all">
              <X className="w-3.5 h-3.5" /> Clear
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 flex-wrap">
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
      ) : animeList.length > 0 ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {animeList.map((anime: any) => <AnimeCard key={`${anime.mal_id}-${anime.title}`} anime={anime} />)}
          </div>
          {hasMore && (
            <div className="flex justify-center mt-10">
              <button
                onClick={async () => {
                  // Queue handles spacing — just call loadMore once per click
                  loadMore();
                }}
                disabled={loadingMore}
                className="flex items-center gap-2 bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white px-8 py-3 rounded-xl text-[13px] font-bold hover:brightness-110 transition-all disabled:opacity-60">
                {loadingMore ? <><Loader2 className="w-4 h-4 animate-spin" /> Loading…</> : `Load More — ${animeList.length} shown`}
              </button>
            </div>
          )}
          {!hasMore && (
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
