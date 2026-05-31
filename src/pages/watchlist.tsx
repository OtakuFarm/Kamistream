import React, { useState } from 'react';
import { useWatchlist, WatchStatus, WATCH_STATUS_LABELS } from '@/hooks/useWatchlist';
import { useEpisodeProgress } from '@/hooks/useEpisodeProgress';
import { Link } from 'wouter';
import { useSEO } from '@/hooks/useSEO';
import { Download, ChevronDown, BarChart2, Star, CheckCircle2, Clock, Trash2 } from 'lucide-react';

const TABS: { id: 'all' | WatchStatus; label: string; color: string }[] = [
  { id: 'all',           label: 'All',           color: 'var(--text2)' },
  { id: 'watching',      label: '▶ Watching',    color: 'var(--blue)'  },
  { id: 'plan_to_watch', label: '📌 Plan to Watch', color: 'var(--purple)' },
  { id: 'completed',     label: '✓ Completed',   color: 'var(--green)' },
  { id: 'on_hold',       label: '⏸ On Hold',     color: 'var(--gold)'  },
  { id: 'dropped',       label: '✕ Dropped',     color: '#ef4444'      },
];

const STATUS_OPTIONS: WatchStatus[] = ['watching', 'plan_to_watch', 'completed', 'on_hold', 'dropped'];

export default function Watchlist() {
  useSEO({ title: 'My Watchlist', description: 'Your personal anime watchlist on KamiStream.' });
  const { watchlist, loading, toggleWatchlist, setWatchStatus, getWatchStatus, exportCSV, statuses } = useWatchlist();
  const { getWatchedCount } = useEpisodeProgress();
  const [tab,      setTab]      = useState<'all' | WatchStatus>('all');
  const [openMenu, setOpenMenu] = useState<number | null>(null);
  const [sortBy,   setSortBy]   = useState<'title' | 'score' | 'progress'>('title');

  const displayed = (tab === 'all' ? watchlist : watchlist.filter(w => statuses[w.mal_id] === tab))
    .slice()
    .sort((a, b) => {
      if (sortBy === 'score')    return (b.score || 0) - (a.score || 0);
      if (sortBy === 'progress') return getWatchedCount(b.mal_id) - getWatchedCount(a.mal_id);
      return a.title.localeCompare(b.title);
    });

  const countFor = (id: 'all' | WatchStatus) =>
    id === 'all' ? watchlist.length : watchlist.filter(w => statuses[w.mal_id] === id).length;

  // Stats
  const totalWatched  = watchlist.reduce((s, w) => s + getWatchedCount(w.mal_id), 0);
  const avgScore      = watchlist.filter(w => w.score).length > 0
    ? (watchlist.filter(w => w.score).reduce((s, w) => s + (w.score || 0), 0) / watchlist.filter(w => w.score).length).toFixed(1)
    : '—';
  const completedCount = watchlist.filter(w => statuses[w.mal_id] === 'completed').length;

  return (
    <div className="p-4 md:p-6 pb-20 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-heading font-black text-white">My Watchlist</h1>
        {watchlist.length > 0 && (
          <button onClick={exportCSV}
            className="flex items-center gap-1.5 text-[12px] font-bold text-[var(--text3)] hover:text-white bg-[var(--card)] border border-[var(--border)] px-3 py-2 rounded-xl transition-colors">
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
        )}
      </div>

      {/* Stats row */}
      {watchlist.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { icon: BarChart2,    label: 'Total Anime',    value: watchlist.length,  color: 'var(--pink)' },
            { icon: CheckCircle2, label: 'Completed',       value: completedCount,    color: 'var(--green)' },
            { icon: Clock,        label: 'Episodes Watched', value: totalWatched,     color: 'var(--blue)' },
            { icon: Star,         label: 'Avg Score',       value: avgScore,          color: 'var(--gold)' },
          ].map(({ icon: Icon, label, value, color }) => (
            <div key={label} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-white/10">
                <Icon className="w-4 h-4" style={{ color }} />
              </div>
              <div>
                <p className="text-[16px] font-black text-white leading-none">{value}</p>
                <p className="text-[10px] text-[var(--text3)] mt-0.5">{label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-2 mb-4 scrollbar-none">
        {TABS.map(t => {
          const count = countFor(t.id);
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-bold transition-all ${
                tab === t.id
                  ? 'bg-[var(--pink)] text-white shadow-lg'
                  : 'bg-[var(--card)] border border-[var(--border)] text-[var(--text3)] hover:text-white'
              }`}>
              {t.label}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ${tab === t.id ? 'bg-white/20 text-white' : 'bg-[var(--bg3)] text-[var(--text3)]'}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Sort */}
      {displayed.length > 1 && (
        <div className="flex items-center gap-2 mb-4">
          <span className="text-[11px] text-[var(--text3)] font-bold">Sort:</span>
          {(['title', 'score', 'progress'] as const).map(s => (
            <button key={s} onClick={() => setSortBy(s)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors capitalize ${
                sortBy === s ? 'bg-[var(--pink)] text-white' : 'bg-[var(--card)] border border-[var(--border)] text-[var(--text3)] hover:text-white'
              }`}>
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Empty state */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {[...Array(10)].map((_, i) => <div key={i} className="aspect-[2/3] rounded-xl bg-[var(--card)] animate-pulse" />)}
        </div>
      ) : displayed.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-5xl mb-4">📋</p>
          <p className="text-[16px] font-black text-white mb-2">
            {tab === 'all' ? 'Your watchlist is empty' : 'No anime in ' + (TABS.find(t => t.id === tab)?.label || 'this list')}
          </p>
          <p className="text-[13px] text-[var(--text3)] mb-6">
            Browse anime and hit + to add them here
          </p>
          <Link href="/browse">
            <button className="bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white px-6 py-2.5 rounded-xl font-bold text-[13px] hover:brightness-110 transition-all">
              Browse Anime
            </button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {displayed.map(anime => {
            const status   = getWatchStatus(anime.mal_id);
            const watched  = getWatchedCount(anime.mal_id);
            const progress = anime.episodes ? Math.min(100, Math.round((watched / anime.episodes) * 100)) : 0;
            return (
              <div key={anime.mal_id} className="group relative bg-[var(--card)] rounded-xl overflow-hidden border border-[var(--border)] hover:border-[var(--pink)]/40 transition-all">
                {/* Cover */}
                <Link href={`/anime/${anime.mal_id}`}>
                  <div className="relative aspect-[2/3] overflow-hidden cursor-pointer">
                    <img src={anime.image_url} alt={anime.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    {anime.score && (
                      <div className="absolute top-2 right-2 bg-black/70 backdrop-blur-sm text-[var(--gold)] text-[9px] font-black px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
                        <Star className="w-2.5 h-2.5 fill-current" />{anime.score}
                      </div>
                    )}
                    {/* Progress bar */}
                    {watched > 0 && (
                      <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
                        <div className="h-full bg-[var(--pink)] transition-all" style={{ width: `${progress}%` }} />
                      </div>
                    )}
                  </div>
                </Link>

                {/* Info */}
                <div className="p-2">
                  <p className="text-[11px] font-bold text-white line-clamp-2 leading-snug mb-1.5">{anime.title}</p>

                  {/* Status dropdown */}
                  <div className="relative">
                    <button
                      onClick={() => setOpenMenu(openMenu === anime.mal_id ? null : anime.mal_id)}
                      className="w-full flex items-center justify-between gap-1 px-2 py-1 bg-[var(--bg3)] border border-[var(--border)] rounded-lg text-[9px] font-bold text-[var(--text3)] hover:text-white transition-colors">
                      <span className="truncate">{status ? WATCH_STATUS_LABELS[status] : 'Set status'}</span>
                      <ChevronDown className="w-3 h-3 shrink-0" />
                    </button>
                    {openMenu === anime.mal_id && (
                      <div className="absolute bottom-full left-0 right-0 mb-1 bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden shadow-2xl z-20">
                        {STATUS_OPTIONS.map(s => (
                          <button key={s}
                            onClick={() => { setWatchStatus(anime.mal_id, s); setOpenMenu(null); }}
                            className={`w-full text-left px-3 py-2 text-[10px] font-bold transition-colors hover:bg-[var(--bg3)] ${status === s ? 'text-[var(--pink)]' : 'text-[var(--text2)]'}`}>
                            {WATCH_STATUS_LABELS[s]}
                          </button>
                        ))}
                        <div className="border-t border-[var(--border)]">
                          <button
                            onClick={() => { toggleWatchlist(anime); setOpenMenu(null); }}
                            className="w-full text-left px-3 py-2 text-[10px] font-bold text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-1.5">
                            <Trash2 className="w-3 h-3" /> Remove
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Episode progress */}
                  {watched > 0 && (
                    <p className="text-[9px] text-[var(--text3)] mt-1 font-mono">
                      {watched}{anime.episodes ? `/${anime.episodes}` : ''} eps
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Click outside to close menu */}
      {openMenu !== null && (
        <div className="fixed inset-0 z-10" onClick={() => setOpenMenu(null)} />
      )}
    </div>
  );
}
