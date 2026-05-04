import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { Search, Bell, Menu, X, User } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { useAuth } from '@/lib/auth';
import { useAnimeSearch } from '@/lib/jikan';
import { useDebounce } from '@/hooks/use-debounce';

export function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [location, setLocation] = useLocation();
  const { data: searchResults, isLoading } = useAnimeSearch(debouncedSearch);
  const [showDropdown, setShowDropdown] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    if (debouncedSearch.length > 2) {
      setShowDropdown(true);
    } else {
      setShowDropdown(false);
    }
  }, [debouncedSearch]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (search.trim()) {
      setLocation(`/browse?q=${encodeURIComponent(search.trim())}`);
      setShowDropdown(false);
    }
  };

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
                    onClick={() => setShowDropdown(false)}
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
                  onClick={() => { if (search.trim()) { setLocation(`/browse?q=${encodeURIComponent(search.trim())}`); setShowDropdown(false); } }}
                  className="p-3 text-center text-[12px] font-bold text-[var(--pink)] hover:bg-[var(--bg3)] transition-colors"
                >
                  View all results
                </button>
              </div>
            ) : (
              <div className="p-4 text-center text-[13px] text-[var(--text3)]">No results found</div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 md:gap-4 ml-auto">
        <button className="w-9 h-9 flex items-center justify-center rounded-xl bg-[var(--bg3)] border border-[var(--border)] text-[var(--text3)] hover:text-white transition-colors relative">
          <Bell className="w-4 h-4" />
        </button>

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
