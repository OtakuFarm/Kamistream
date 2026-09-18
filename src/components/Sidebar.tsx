import React from 'react';
import { Link, useLocation } from 'wouter';
import { Home, Compass, Bookmark, Trophy, BarChart3, Users, User, Settings, Calendar, List, Gem, Smile, HelpCircle, Star, Flame, Tag, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin';
import { useGamification, calculateLevel } from '@/hooks/useGamification';

export function Sidebar({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const isAdmin = isAdminEmail(user?.email);
  const [location] = useLocation();
  const { getStats } = useGamification();
  const stats = getStats();
  const level = calculateLevel(stats.totalXP);
  const [genreOpen, setGenreOpen] = React.useState(false);

  const GENRES = [
    { id: 1,  name: 'Action' },
    { id: 2,  name: 'Adventure' },
    { id: 4,  name: 'Comedy' },
    { id: 8,  name: 'Drama' },
    { id: 10, name: 'Fantasy' },
    { id: 14, name: 'Horror' },
    { id: 7,  name: 'Mystery' },
    { id: 22, name: 'Romance' },
    { id: 24, name: 'Sci-Fi' },
    { id: 36, name: 'Slice of Life' },
    { id: 30, name: 'Sports' },
    { id: 37, name: 'Supernatural' },
    { id: 41, name: 'Thriller' },
    { id: 62, name: 'Isekai' },
  ];

  const NavItem = ({ href, icon: Icon, label, badge, isLive }: any) => {
    const isActive = location === href || (href !== '/' && location.startsWith(`${href}/`));
    return (
      <Link href={href} onClick={() => window.innerWidth < 768 && onClose()}>
        <div className={`flex items-center gap-3 px-4 py-[10px] cursor-pointer w-full text-left border-l-[3px] transition-all font-sans text-[13px] font-bold ${isActive ? 'text-white bg-[var(--pink)]/10 border-[var(--pink)]' : 'text-[var(--text3)] border-transparent hover:text-white hover:bg-white/5'}`}>
          <Icon className="w-[18px] h-[18px]" />
          <span className="flex-1">{label}</span>
          {badge && (
            <span className={`text-[9px] font-extrabold px-2 py-[2px] rounded-full ${isLive ? 'bg-gradient-to-br from-[var(--pink)] to-[var(--purple)] text-white shadow-[0_0_0_0_rgba(255,45,120,0.4)] animate-[lp_1.5s_infinite]' : 'bg-white/10 text-[var(--text3)]'}`}>
              {badge}
            </span>
          )}
        </div>
      </Link>
    );
  };

  const SectionLabel = ({ children }: { children: React.ReactNode }) => (
    <div className="text-[9px] font-extrabold text-[var(--text3)] tracking-[2px] uppercase px-5 py-2 mt-2">
      {children}
    </div>
  );

  return (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] transition-opacity ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      {/* Sidebar */}
      <div className={`w-[220px] bg-[var(--bg2)] border-r border-[var(--border)] flex flex-col fixed top-[60px] h-[calc(100vh-60px)] z-[250] transition-transform duration-300 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex-1 overflow-y-auto py-4">

          <SectionLabel>Discover</SectionLabel>
          <NavItem href="/home"         icon={Home}        label="Home" />
          <NavItem href="/browse"      icon={Compass}     label="Browse" />
          <NavItem href="/az-list"     icon={List}        label="A-Z List" />
          <NavItem href="/schedule"    icon={Calendar}    label="Schedule" />
          <NavItem href="/mood"        icon={Smile}       label="Mood Picker" />
          <NavItem href="/hidden-gems" icon={Gem}         label="Hidden Gems" />

          {/* Genre expandable */}
          <div className="h-[1px] bg-[var(--border)] mx-4 my-1" />
          <button
            onClick={() => setGenreOpen(v => !v)}
            className="flex items-center gap-3 px-4 py-[10px] w-full text-left border-l-[3px] border-transparent text-[var(--text3)] hover:text-white hover:bg-white/5 transition-all font-sans text-[13px] font-bold"
          >
            <Tag className="w-[18px] h-[18px]" />
            <span className="flex-1">Genres</span>
            {genreOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          {genreOpen && (
            <div className="px-4 pb-2">
              <div className="flex flex-wrap gap-1.5 pt-1">
                {GENRES.map(g => {
                  const isActive = location === `/genre/${g.id}`;
                  return (
                    <Link key={g.id} href={`/genre/${g.id}`} onClick={() => window.innerWidth < 768 && onClose()}>
                      <span className={`inline-block px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition-all ${
                        isActive
                          ? 'bg-[var(--pink)] text-white'
                          : 'bg-[var(--bg3)] text-[var(--text3)] hover:text-white hover:bg-[var(--card)]'
                      }`}>
                        {g.name}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          <div className="h-[1px] bg-[var(--border)] mx-4 my-3" />

          <SectionLabel>My Anime</SectionLabel>
          <NavItem href="/watchlist"    icon={Bookmark}   label="Watchlist" />
          <NavItem href="/stats"        icon={BarChart3}   label="My Stats" />
          <NavItem href="/achievements" icon={Star}        label="Achievements" badge={stats.achievements.length > 0 ? String(stats.achievements.length) : undefined} />
          <NavItem href="/profile"      icon={User}        label="Profile" />

          <div className="h-[1px] bg-[var(--border)] mx-4 my-3" />

          <SectionLabel>Games</SectionLabel>
          <NavItem href="/quiz"         icon={HelpCircle}  label="Anime Quiz" />
          <NavItem href="/challenges"   icon={Trophy}      label="Challenge" badge="LIVE" isLive />

          <div className="h-[1px] bg-[var(--border)] mx-4 my-3" />

          <SectionLabel>Community</SectionLabel>
          <NavItem href="/leaderboard"  icon={Flame}      label="Leaderboard" />
          <NavItem href="/community"    icon={Users}      label="Community" />
          <NavItem href="/about"        icon={Info}       label="About KamiStream" />

          {isAdmin && (
            <>
              <div className="h-[1px] bg-[var(--border)] mx-4 my-3" />
              <SectionLabel>Admin</SectionLabel>
              <NavItem href="/admin"    icon={Settings}   label="Admin Panel" />
            </>
          )}
        </div>

        <div className="p-4 mt-auto">
          {/* Level badge */}
          <Link href="/stats">
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-3 mb-3 flex items-center gap-3 hover:border-[var(--purple)] transition-colors cursor-pointer">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[var(--pink)] to-[var(--purple)] flex flex-col items-center justify-center shrink-0">
                <div className="text-[8px] font-black text-white/60">LVL</div>
                <div className="text-[14px] font-heading font-black text-white leading-none">{level}</div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-black text-white mb-0.5">{stats.totalXP} XP</div>
                <div className="h-1.5 bg-[var(--bg3)] rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] rounded-full"
                    style={{ width: `${Math.min(100, ((stats.totalXP % 80) / 80) * 100)}%` }} />
                </div>
              </div>
            </div>
          </Link>

          <div className="bg-gradient-to-br from-[var(--pink)]/10 to-[var(--purple)]/10 border border-[var(--pink)]/20 rounded-xl p-3 text-center">
            <div className="text-[10px] text-[var(--text3)] mb-1">Weekly Prize</div>
            <div className="font-heading text-xl font-black text-[var(--gold)] drop-shadow-[0_0_12px_rgba(255,214,10,0.4)] leading-none mb-2">
              $500
            </div>
            <Link href="/challenges">
              <button className="w-full bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white text-[11px] font-bold py-[6px] rounded-lg">
                Join Challenge
              </button>
            </Link>
          </div>
          <div className="text-[9px] text-[var(--text3)] text-center mt-3">
            © 2025 KamiStream
          </div>
        </div>
      </div>
    </>
  );
}
