import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'wouter';
import { Search, Bell, Menu, X } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { useAuth } from '@/lib/auth';
import { useAnimeSearch } from '@/lib/jikan';
import { useDebounce } from '@/hooks/use-debounce';
import { supabase } from '@/lib/supabase';

interface SubNotif {
  id: string;
  username: string | null;
  caption: string | null;
  created_at: string;
  week_theme: string | null;
}

export function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [, setLocation] = useLocation();
  const { data: searchResults, isLoading } = useAnimeSearch(debouncedSearch);
  const [showDropdown, setShowDropdown] = useState(false);
  const { user } = useAuth();

  const [showBell, setShowBell] = useState(false);
  const [notifs, setNotifs] = useState<SubNotif[]>([]);
  const [unread, setUnread] = useState(0);
  const bellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (debouncedSearch.length > 2) setShowDropdown(true);
    else setShowDropdown(false);
  }, [debouncedSearch]);

  useEffect(() => {
    supabase
      .from('submissions')
      .select('id, username, caption, created_at, weeks(theme)')
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => {
        if (!data) return;
        const mapped = (data as any[]).map((r) => ({
          id: r.id,
          username: r.username,
          caption: r.caption,
          created_at: r.created_at,
          week_theme: r.weeks?.theme || null,
        }));
        setNotifs(mapped);
        const lastSeen = parseInt(localStorage.getItem('kami_notif_seen') || '0', 10);
        setUnread(mapped.filter((n) => new Date(n.created_at).getTime() > lastSeen).length);
      });
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setShowBell(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const openBell = () => {
    setShowBell((v) => !v);
    if (!showBell) {
      localStorage.setItem('kami_notif_seen', Date.now().toString());
      setUnread(0);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (search.trim()) {
      setLocation(`/search?q=${encodeURIComponent(search.trim())}`);
      setShowDropdown(false);
      setSearch('');
    }
  };

  function timeAgo(iso: string) {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  return (
    <div className="h-[60px] bg-[var(--bg2)] border-b border-[var(--border)] flex items-center px-4 md:px-6 gap-3 md:gap-4 shrink-0 sticky top-0 z-50">
      <div className="absolute bottom-[-2px] left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[var(--pink)] via-[var(--purple)] via-[var(--blue)] to-transparent bg-[length:200%_auto] animate-[tbLine_3s_linear_infinite]" />

      <button className="md:hidden text-[var(--text3)] p-2 -ml-2" onClick={onMenuClick}>
        <Menu className="w-6 h-6" />
      </button>

      <div className="hidden md:flex">
        <Logo />
      </div>

      <div className="flex-1 max-w-[320px] relative ml-auto md:ml-0">
        <form onSubmit={handleSearchSubmit}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text3)]" />
            <input
              type="text"
              placeholder="Search anime..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onFocus={() => { if (search.length > 2) setShowDropdown(true); }}
              onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
              className="w-full bg-[var(--bg3)] border border-[var(--border)] rounded-xl py-2 pl-9 pr-4 text-[13px] text-white focus:outline-none focus:border-[var(--purple)] transition-colors"
            />
          </div>
        </form>

        {showDropdown && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-2xl overflow-hidden z-50 max-h-[400px] overflow-y-auto">
            {isLoading ? (
              <div className="p-4 text-center text-[13px] text-[var(--text3)]">Searching...</div>
            ) : searchResults?.data?.length > 0 ? (
              <div className="flex flex-col">
                {searchResults.data.slice(0, 5).map((anime: any) => (
                  <Link
                    key={anime.mal_id}
                    href={`/anime/${anime.mal_id}`}
                    onClick={() => { setShowDropdown(false); setSearch(''); }}
                    className="flex items-center gap-3 p-3 hover:bg-[var(--bg3)] transition-colors border-b border-[var(--border)] last:border-0"
                  >
                    <img src={anime.images.webp.small_image_url} alt="" className="w-10 h-14 object-cover rounded-md" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-bold text-white truncate">{anime.title}</div>
                      <div className="text-[11px] text-[var(--text3)] flex gap-2">
                        <span>{anime.type}</span>
                        {anime.score && <span className="text-[var(--gold)]">★ {anime.score}</span>}
                      </div>
                    </div>
                  </Link>
                ))}
                <button
                  onMouseDown={handleSearchSubmit}
                  className="p-3 text-center text-[12px] font-bold text-[var(--pink)] hover:bg-[var(--bg3)] transition-colors"
                >
                  View all results for "{search}"
                </button>
              </div>
            ) : (
              <div className="p-4 text-center text-[13px] text-[var(--text3)]">No results found</div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 md:gap-4 ml-auto">
        <div className="relative" ref={bellRef}>
          <button
            onClick={openBell}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-[var(--bg3)] border border-[var(--border)] text-[var(--text3)] hover:text-white transition-colors relative"
          >
            <Bell className="w-4 h-4" />
            {unread > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-[var(--pink)] text-white text-[9px] font-black rounded-full flex items-center justify-center">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </button>

          {showBell && (
            <div className="absolute right-0 top-full mt-2 w-[320px] bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-2xl z-50 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
                <span className="font-heading font-black text-[14px]">Recent Submissions</span>
                <button onClick={() => setShowBell(false)} className="text-[var(--text3)] hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="max-h-[360px] overflow-y-auto">
                {notifs.length === 0 ? (
                  <div className="p-6 text-center text-[13px] text-[var(--text3)]">No recent activity</div>
                ) : (
                  notifs.map((n) => (
                    <Link
                      key={n.id}
                      href="/challenges"
                      onClick={() => setShowBell(false)}
                      className="flex items-start gap-3 px-4 py-3 hover:bg-[var(--bg3)] border-b border-[var(--border)] last:border-0 transition-colors"
                    >
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--pink)] to-[var(--purple)] flex items-center justify-center text-white font-black text-[12px] shrink-0 mt-0.5">
                        {(n.username || '?')[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] text-white">
                          <span className="font-bold">@{n.username || 'creator'}</span>
                          {' submitted to '}
                          <span className="text-[var(--pink)]">{n.week_theme || 'the challenge'}</span>
                        </p>
                        {n.caption && (
                          <p className="text-[11px] text-[var(--text3)] mt-0.5 line-clamp-1">{n.caption}</p>
                        )}
                        <p className="text-[10px] text-[var(--text3)] mt-1">{timeAgo(n.created_at)}</p>
                      </div>
                    </Link>
                  ))
                )}
              </div>
              <div className="border-t border-[var(--border)]">
                <Link
                  href="/challenges"
                  onClick={() => setShowBell(false)}
                  className="block text-center py-3 text-[12px] font-bold text-[var(--pink)] hover:bg-[var(--bg3)] transition-colors"
                >
                  View all submissions
                </Link>
              </div>
            </div>
          )}
        </div>

        {user ? (
          <Link href="/profile" className="flex items-center gap-2 bg-[var(--bg3)] border border-[var(--border)] rounded-xl p-1 pr-3 hover:border-[var(--purple)] transition-colors cursor-pointer">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[var(--pink)] to-[var(--purple)] flex items-center justify-center text-white font-heading text-[12px] font-bold">
              {user.email?.[0].toUpperCase() || 'U'}
            </div>
            <div className="hidden md:flex flex-col">
              <span className="text-[12px] font-bold text-white leading-none mb-[2px]">{user.email?.split('@')[0]}</span>
            </div>
          </Link>
        ) : (
          <Link href="/login" className="bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white px-4 py-2 rounded-xl text-[13px] font-bold hover:brightness-110 transition-all">
            Log In
          </Link>
        )}
      </div>
    </div>
  );
}
