import React, { useState } from 'react';
import { useWatchlist, WatchStatus, WATCH_STATUS_LABELS } from '@/hooks/useWatchlist';
import { Link } from 'wouter';
import { useSEO } from '@/hooks/useSEO';
import { Download, ChevronDown } from 'lucide-react';

const TABS: { id: 'all' | WatchStatus; label: string; emoji: string }[] = [
  { id: 'all',           label: 'All',          emoji: '📋' },
  { id: 'watching',      label: 'Watching',     emoji: '▶' },
  { id: 'plan_to_watch', label: 'Plan to Watch', emoji: '📌' },
  { id: 'on_hold',       label: 'On Hold',      emoji: '⏸' },
  { id: 'dropped',       label: 'Dropped',      emoji: '✕' },
  { id: 'completed',     label: 'Completed',    emoji: '✓' },
];

export default function Watchlist() {
  useSEO({ title: 'My Watchlist' });
  const { watchlist, loading, toggleWatchlist, setWatchStatus, getWatchStatus, exportCSV, statuses } = useWatchlist();
  const [tab, setTab] = useState<'all' | WatchStatus>('all');
  const [openMenu, setOpenMenu] = useState<number | null>(null);

  const displayed = tab === 'all' ? watchlist : watchlist.filter(w => statuses[w.mal_id] === tab);
  const countFor = (id: 'all' | WatchStatus) => id === 'all' ? watchlist.length : watchlist.filter(w => statuses[w.mal_id] === id).length;

  return (
    <div className="p-4 md:p-6 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-heading font-black text-white">My Watchlist</h1>
        {watchlist.length > 0 && (
          <button onClick={exportCSV}
            className="flex items-center gap-1.5 text-[12px] font-bold text-[var(--text3)] hover:text-white bg-[var(--card)] border border-[var(--border)] px-3 py-2 rounded-xl transition-colors">
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-2 mb-5 scrollbar-none">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-bold whitespace-nowrap border transition-all shrink-0 ${tab === t.id
              ? 'bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white border-transparent'
              : 'bg-[var(--card)] border-[var(--border)] text-[var(--text3)] hover:text-white'}`}>
            <span>{t.emoji}</span>
            <span>{t.label}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${tab === t.id ? 'bg-white/20' : 'bg-[var(--bg3)]'}`}>
              {countFor(t.id)}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="aspect-[2/3] bg-[var(--card)] rounded-lg animate-pulse" />
          ))}
        </div>
      ) : displayed.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {displayed.map((anime) => {
            const status = getWatchStatus(anime.mal_id);
            return (
              <div key={anime.mal_id} className="kami-card group relative bg-[var(--card)] rounded-lg overflow-hidden">
                {/* Cover */}
                <Link href={`/anime/${anime.mal_id}`}>
                  <div className="relative aspect-[2/3] overflow-hidden cursor-pointer">
                    <img src={anime.image_url} alt={anime.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    {anime.score && (
                      <div className="absolute top-1 left-1 bg-black/70 text-[9px] font-black px-1.5 py-0.5 rounded text-[var(--gold)]">
                        ★ {anime.score}
                      </div>
                    )}
                  </div>
                </Link>

                {/* Status badge */}
                {status && (
                  <div className={`absolute top-1 right-1 text-[8px] font-black px-1.5 py-0.5 rounded backdrop-blur-sm
                    ${status === 'watching'      ? 'bg-[var(--green)]/80 text-white'
                    : status === 'completed'     ? 'bg-[var(--blue)]/80 text-white'
                    : status === 'plan_to_watch' ? 'bg-[var(--purple)]/80 text-white'
                    : status === 'on_hold'       ? 'bg-yellow-500/80 text-white'
                    :                              'bg-red-500/80 text-white'}`}>
                    {WATCH_STATUS_LABELS[status].split(' ')[0]}
                  </div>
                )}

                {/* Info */}
                <div className="p-1.5 relative">
                  <h3 className="text-[11px] font-bold text-[var(--text2)] line-clamp-1 leading-tight">{anime.title}</h3>

                  {/* Status dropdown */}
                  <div className="relative mt-1">
                    <button onClick={(e) => { e.stopPropagation(); setOpenMenu(openMenu === anime.mal_id ? null : anime.mal_id); }}
                      className="w-full flex items-center justify-between gap-1 text-[9px] font-bold text-[var(--text3)] hover:text-white bg-[var(--bg3)] rounded px-1.5 py-1 transition-colors">
                      <span>{status ? WATCH_STATUS_LABELS[status] : 'Set status...'}</span>
                      <ChevronDown className="w-2.5 h-2.5 shrink-0" />
                    </button>

                    {openMenu === anime.mal_id && (
                      <div className="absolute bottom-full left-0 right-0 mb-1 bg-[var(--card)] border border-[var(--border)] rounded-lg overflow-hidden z-50 shadow-2xl">
                        {(Object.entries(WATCH_STATUS_LABELS) as [WatchStatus, string][]).map(([s, label]) => (
                          <button key={s} onClick={(e) => { e.stopPropagation(); setWatchStatus(anime.mal_id, s); setOpenMenu(null); }}
                            className={`w-full text-left px-2.5 py-1.5 text-[10px] font-bold hover:bg-[var(--bg3)] transition-colors
                              ${status === s ? 'text-[var(--pink)]' : 'text-[var(--text2)]'}`}>
                            {label}
                          </button>
                        ))}
                        <button onClick={(e) => { e.stopPropagation(); toggleWatchlist(anime); setOpenMenu(null); }}
                          className="w-full text-left px-2.5 py-1.5 text-[10px] font-bold text-red-400 hover:bg-red-500/10 border-t border-[var(--border)] transition-colors">
                          ✕ Remove from Watchlist
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-12 text-center max-w-xl mx-auto mt-10">
          <div className="text-4xl mb-4">{tab === 'all' ? '📺' : TABS.find(t => t.id === tab)?.emoji}</div>
          <h2 className="text-xl font-heading font-black text-white mb-2">
            {tab === 'all' ? 'Your shelf is empty' : `No anime in "${TABS.find(t => t.id === tab)?.label}"`}
          </h2>
          <p className="text-[14px] text-[var(--text3)] mb-6">
            {tab === 'all' ? 'Go discover something obsession-worthy and add it here.' : 'Set status from any anime in your watchlist.'}
          </p>
          {tab === 'all' && (
            <Link href="/browse">
              <button className="bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white px-5 py-2.5 rounded-xl text-[13px] font-bold">
                Browse Anime
              </button>
            </Link>
          )}
        </div>
      )}

      {/* Click outside to close dropdown */}
      {openMenu !== null && (
        <div className="fixed inset-0 z-40" onClick={() => setOpenMenu(null)} />
      )}
    </div>
  );
}
