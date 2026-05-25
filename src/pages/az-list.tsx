import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { List, Search } from 'lucide-react';
import { useSEO } from '@/hooks/useSEO';
import { AnimeCard } from '@/components/AnimeCard';

const LETTERS = ['#', ...Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i))];

const SORT_OPTIONS = [
  { label: 'Title A-Z', value: 'title_asc' },
  { label: 'Title Z-A', value: 'title_desc' },
  { label: 'Score', value: 'score' },
  { label: 'Members', value: 'members' },
];

const TYPE_OPTIONS = ['All', 'TV', 'Movie', 'OVA', 'ONA', 'Special'];

async function fetchByLetter(letter: string, sort: string, type: string, page: number) {
  let url = `https://api.jikan.moe/v4/anime?page=${page}&limit=24&sfw=true&order_by=title&sort=asc`;
  if (letter !== '#') {
    url += `&letter=${encodeURIComponent(letter)}`;
  }
  if (type !== 'All') url += `&type=${type.toLowerCase()}`;
  if (sort === 'score') url = url.replace('order_by=title&sort=asc', 'order_by=score&sort=desc');
  else if (sort === 'members') url = url.replace('order_by=title&sort=asc', 'order_by=members&sort=desc');
  else if (sort === 'title_desc') url = url.replace('sort=asc', 'sort=desc');
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch');
  return res.json();
}

export default function AZList() {
  useSEO({ title: 'A-Z List', description: 'Browse all anime alphabetically on KamiStream.' });

  const [activeLetter, setActiveLetter] = useState('A');
  const [sort, setSort] = useState('title_asc');
  const [typeFilter, setTypeFilter] = useState('All');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['az-list', activeLetter, sort, typeFilter, page],
    queryFn: () => fetchByLetter(activeLetter, sort, typeFilter, page),
    staleTime: 5 * 60 * 1000,
    placeholderData: (prev) => prev,
  });

  const { data: searchData, isLoading: searchLoading } = useQuery({
    queryKey: ['az-search', searchQuery],
    queryFn: async () => {
      if (!searchQuery) return null;
      const res = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(searchQuery)}&limit=24&sfw=true`);
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    enabled: searchQuery.length > 2,
    staleTime: 2 * 60 * 1000,
  });

  const showSearch = searchQuery.length > 2;
  const displayData = showSearch ? searchData : data;
  const displayLoading = showSearch ? searchLoading : isLoading;
  const animeList: any[] = displayData?.data || [];
  const totalPages: number = displayData?.pagination?.last_visible_page || 1;

  function handleLetterClick(letter: string) {
    setActiveLetter(letter);
    setPage(1);
    setSearchQuery('');
    setSearch('');
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearchQuery(search);
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 pb-20">
      <div className="flex items-center gap-3 mb-6">
        <List className="w-5 h-5 text-[var(--pink)]" />
        <h1 className="text-[20px] font-heading font-black text-white">A-Z Anime List</h1>
      </div>

      {/* Search bar */}
      <form onSubmit={handleSearch} className="relative mb-6 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text3)]" />
        <input
          type="text"
          placeholder="Search by title..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-[var(--card)] border border-[var(--border)] rounded-xl py-2.5 pl-9 pr-4 text-[13px] text-white focus:outline-none focus:border-[var(--purple)] transition-colors"
        />
        {search && (
          <button type="button" onClick={() => { setSearch(''); setSearchQuery(''); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text3)] hover:text-white text-[16px]">
            ✕
          </button>
        )}
      </form>

      {/* Letter tabs */}
      {!showSearch && (
        <div className="flex flex-wrap gap-1 mb-5">
          {LETTERS.map(letter => (
            <button
              key={letter}
              onClick={() => handleLetterClick(letter)}
              className={`w-9 h-9 rounded-lg text-[13px] font-black transition-all ${
                activeLetter === letter
                  ? 'bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white shadow-lg'
                  : 'bg-[var(--card)] border border-[var(--border)] text-[var(--text3)] hover:text-white hover:border-[var(--purple)]'
              }`}
            >
              {letter}
            </button>
          ))}
        </div>
      )}

      {/* Filters row */}
      {!showSearch && (
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="flex bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden text-[12px] font-bold">
            {SORT_OPTIONS.map(opt => (
              <button key={opt.value} onClick={() => { setSort(opt.value); setPage(1); }}
                className={`px-3 py-2 transition-colors ${sort === opt.value ? 'bg-[var(--pink)] text-white' : 'text-[var(--text3)] hover:text-white'}`}>
                {opt.label}
              </button>
            ))}
          </div>
          <div className="flex bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden text-[12px] font-bold">
            {TYPE_OPTIONS.map(type => (
              <button key={type} onClick={() => { setTypeFilter(type); setPage(1); }}
                className={`px-3 py-2 transition-colors ${typeFilter === type ? 'bg-[var(--purple)] text-white' : 'text-[var(--text3)] hover:text-white'}`}>
                {type}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Results heading */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-[12px] text-[var(--text3)]">
          {showSearch
            ? `Search results for "${searchQuery}"`
            : `Anime starting with "${activeLetter}"`}
          {!displayLoading && animeList.length > 0 && (
            <span className="ml-2 text-white font-bold">({animeList.length} results)</span>
          )}
        </p>
        {!showSearch && totalPages > 1 && (
          <span className="text-[11px] text-[var(--text3)]">Page {page} of {totalPages}</span>
        )}
      </div>

      {/* Grid */}
      {displayLoading ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3">
          {Array.from({ length: 24 }).map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="aspect-[2/3] bg-[var(--card)] rounded-xl" />
              <div className="h-3 bg-[var(--card)] rounded mt-2" />
            </div>
          ))}
        </div>
      ) : animeList.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-5xl mb-4">📭</div>
          <p className="font-bold text-white text-[15px]">No anime found</p>
          <p className="text-[12px] text-[var(--text3)] mt-1">
            {showSearch ? 'Try a different search term' : `No results for letter "${activeLetter}"`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3">
          {animeList.map((anime: any) => (
            <AnimeCard key={anime.mal_id} anime={anime} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {!showSearch && totalPages > 1 && !displayLoading && (
        <div className="flex items-center justify-center gap-2 mt-8 flex-wrap">
          <button
            onClick={() => { setPage(p => Math.max(1, p - 1)); window.scrollTo({ top: 0 }); }}
            disabled={page === 1}
            className="px-4 py-2 bg-[var(--card)] border border-[var(--border)] text-[12px] font-bold rounded-xl disabled:opacity-40 hover:border-[var(--pink)] transition-all"
          >
            ← Prev
          </button>

          {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
            let p = i + 1;
            if (totalPages > 7) {
              if (page <= 4) p = i + 1;
              else if (page >= totalPages - 3) p = totalPages - 6 + i;
              else p = page - 3 + i;
            }
            return (
              <button key={p} onClick={() => { setPage(p); window.scrollTo({ top: 0 }); }}
                className={`w-10 h-10 rounded-xl text-[12px] font-bold transition-all ${p === page ? 'bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white' : 'bg-[var(--card)] border border-[var(--border)] text-[var(--text2)] hover:text-white hover:border-[var(--purple)]'}`}>
                {p}
              </button>
            );
          })}

          <button
            onClick={() => { setPage(p => Math.min(totalPages, p + 1)); window.scrollTo({ top: 0 }); }}
            disabled={page === totalPages}
            className="px-4 py-2 bg-[var(--card)] border border-[var(--border)] text-[12px] font-bold rounded-xl disabled:opacity-40 hover:border-[var(--pink)] transition-all"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
