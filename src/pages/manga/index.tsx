import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { useSEO } from '@/hooks/useSEO';
import { useMangaProgress } from '@/hooks/useMangaProgress';
import { useMangaBookmarks } from '@/hooks/useMangaBookmarks';
import { MangaCard } from '@/components/MangaCard';
import { getPopularManga, getLatestManga, searchManga } from '@/lib/mangadex';
import { Search, Flame, Clock, BookOpen, BookMarked, TrendingUp } from 'lucide-react';

export default function MangaHome() {
  useSEO({ title: 'Manga — Read Free Online', description: 'Read manga free on KamiStream. Thousands of titles updated daily.' });

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab,   setActiveTab]   = useState<'popular' | 'latest' | 'reading'>('popular');
  const { getAllProgress }             = useMangaProgress();
  const { bookmarks }                 = useMangaBookmarks();

  const { data: popular, isLoading: popLoading } = useQuery({
    queryKey: ['manga', 'popular'],
    queryFn: () => getPopularManga(24),
    staleTime: 15 * 60 * 1000,
  });

  const { data: latest, isLoading: latestLoading } = useQuery({
    queryKey: ['manga', 'latest'],
    queryFn: () => getLatestManga(24),
    staleTime: 5 * 60 * 1000,
    enabled: activeTab === 'latest',
  });

  const { data: searchResults, isLoading: searchLoading } = useQuery({
    queryKey: ['manga', 'search', searchQuery],
    queryFn: () => searchManga(searchQuery, 24),
    staleTime: 5 * 60 * 1000,
    enabled: searchQuery.trim().length > 1,
  });

  const inProgress = getAllProgress();
  const isSearching = searchQuery.trim().length > 1;
  const isLoading = isSearching ? searchLoading : activeTab === 'latest' ? latestLoading : popLoading;
  const manga = isSearching ? searchResults : activeTab === 'latest' ? latest : popular;

  const TABS = [
    { id: 'popular' as const, icon: Flame,      label: 'Popular'  },
    { id: 'latest'  as const, icon: Clock,      label: 'Latest'   },
    { id: 'reading' as const, icon: BookMarked, label: `Reading (${inProgress.length})` },
  ];

  return (
    <div className="p-4 md:p-6 pb-20 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[24px] font-heading font-black text-white flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-[var(--pink)]" /> Manga
          </h1>
          <p className="text-[12px] text-[var(--text3)] mt-0.5">Read thousands of manga free</p>
        </div>
        <Link href="/manga/genres">
          <button className="flex items-center gap-2 px-4 py-2 bg-[var(--card)] border border-[var(--border)] rounded-xl text-[12px] font-bold text-[var(--text2)] hover:text-white hover:border-[var(--pink)]/40 transition-all">
            <TrendingUp className="w-3.5 h-3.5" /> Genres
          </button>
        </Link>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text3)]" />
        <input
          type="text"
          placeholder="Search manga by title..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full bg-[var(--card)] border border-[var(--border)] rounded-2xl pl-11 pr-4 py-3 text-[14px] text-white placeholder:text-[var(--text3)] focus:outline-none focus:border-[var(--pink)] transition-colors"
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--text3)] hover:text-white">✕</button>
        )}
      </div>

      {/* Tabs (hidden when searching) */}
      {!isSearching && (
        <div className="flex gap-1 mb-6 bg-[var(--card)] border border-[var(--border)] rounded-xl p-1">
          {TABS.map(({ id, icon: Icon, label }) => (
            <button key={id} onClick={() => setActiveTab(id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[12px] font-bold transition-all ${
                activeTab === id ? 'bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white shadow-lg' : 'text-[var(--text3)] hover:text-white'
              }`}>
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>
      )}

      {/* Continue Reading */}
      {!isSearching && activeTab === 'reading' && (
        <div>
          {inProgress.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-5xl mb-4">📚</p>
              <p className="text-[16px] font-black text-white mb-2">No manga in progress</p>
              <p className="text-[13px] text-[var(--text3)]">Start reading something from Popular or Latest!</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {inProgress.map(p => (
                <Link key={p.mangaId} href={`/manga/${p.mangaId}/chapter/${p.chapterId}`}>
                  <div className="group cursor-pointer">
                    <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-[var(--card)] mb-2">
                      {p.coverUrl
                        ? <img src={p.coverUrl} alt={p.mangaTitle} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                        : <div className="w-full h-full flex items-center justify-center"><BookOpen className="w-8 h-8 text-[var(--text3)]" /></div>
                      }
                      <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
                        <div className="h-full bg-[var(--pink)]" style={{ width: `${Math.round((p.page / Math.max(1, p.totalPages - 1)) * 100)}%` }} />
                      </div>
                      <div className="absolute top-2 left-2 bg-[var(--pink)] text-white text-[9px] font-black px-1.5 py-0.5 rounded-md">
                        Ch. {p.chapter}
                      </div>
                    </div>
                    <p className="text-[11px] font-bold text-white line-clamp-2 leading-snug">{p.mangaTitle}</p>
                    <p className="text-[9px] text-[var(--text3)] mt-0.5">Pg {p.page + 1}/{p.totalPages}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Grid */}
      {(!isSearching && activeTab !== 'reading') || isSearching ? (
        isLoading ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2">
            {Array.from({ length: 24 }).map((_, i) => (
              <div key={i} className="aspect-[2/3] rounded-xl bg-[var(--card)] animate-pulse" />
            ))}
          </div>
        ) : manga && manga.length > 0 ? (
          <>
            {isSearching && <p className="text-[12px] text-[var(--text3)] mb-4">{manga.length} results for "{searchQuery}"</p>}
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2">
              {manga.map(m => <MangaCard key={m.id} manga={m} showProgress />)}
            </div>
          </>
        ) : (
          <div className="text-center py-20 text-[var(--text3)]">
            {isSearching ? `No results for "${searchQuery}"` : 'No manga found'}
          </div>
        )
      ) : null}
    </div>
  );
}
