import React from 'react';
import { Link, useLocation } from 'wouter';
import { Home, Compass, Bookmark, Trophy, BarChart3, Users, User, Settings } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin';

export function Sidebar({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const isAdmin = isAdminEmail(user?.email);
  const [location] = useLocation();

  const NavItem = ({ href, icon: Icon, label, badge, isLive }: any) => {
    const isActive = location === href || location.startsWith(`${href}/`);
    
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
      <div className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] md:hidden transition-opacity ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={onClose} />
      
      <div className={`w-[220px] bg-[var(--bg2)] border-r border-[var(--border)] flex flex-col fixed md:sticky top-[60px] h-[calc(100vh-60px)] z-[250] transition-transform duration-300 ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="flex-1 overflow-y-auto py-4">
          <SectionLabel>Discover</SectionLabel>
          <NavItem href="/" icon={Home} label="Home" />
          <NavItem href="/browse" icon={Compass} label="Browse" />
          <NavItem href="/watchlist" icon={Bookmark} label="Watchlist" />

          <div className="h-[1px] bg-[var(--border)] mx-4 my-3" />

          <SectionLabel>Creator Hub</SectionLabel>
          <NavItem href="/challenges" icon={Trophy} label="Challenge" badge="LIVE" isLive />
          <NavItem href="/leaderboard" icon={BarChart3} label="Leaderboard" />
          <NavItem href="/community" icon={Users} label="Community" />

          <div className="h-[1px] bg-[var(--border)] mx-4 my-3" />

          <SectionLabel>Account</SectionLabel>
          <NavItem href="/profile" icon={User} label="Profile" />
          {isAdmin && <NavItem href="/admin" icon={Settings} label="Admin" />}
        </div>
        
        <div className="p-4 mt-auto">
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
