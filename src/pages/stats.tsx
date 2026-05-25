import React, { useMemo } from 'react';
import { useWatchHistory } from '@/hooks/useWatchHistory';
import { useWatchlist } from '@/hooks/useWatchlist';
import { useEpisodeProgress } from '@/hooks/useEpisodeProgress';
import { useGamification, calculateLevel, xpForLevel, xpForNextLevel, ACHIEVEMENTS } from '@/hooks/useGamification';
import { Link } from 'wouter';
import { useSEO } from '@/hooks/useSEO';
import { BarChart3, Clock, Tv2, BookMarked, Flame, Zap, Trophy, TrendingUp, Star } from 'lucide-react';

export default function Stats() {
  useSEO({ title: 'My Stats' });
  const { getHistory, getRecentAnime } = useWatchHistory();
  const { watchlist } = useWatchlist();
  const { getStats, checkAndUnlockAchievements } = useGamification();

  const history      = getHistory();
  const recentAnime  = getRecentAnime();
  const stats        = getStats();

  React.useEffect(() => { checkAndUnlockAchievements(stats); }, []);

  const level     = calculateLevel(stats.totalXP);
  const xpStart   = xpForLevel(level);
  const xpEnd     = xpForNextLevel(level);
  const xpPct     = xpEnd > xpStart ? Math.round(((stats.totalXP - xpStart) / (xpEnd - xpStart)) * 100) : 100;

  const estHours  = useMemo(() => ((history.length * 24) / 60).toFixed(1), [history.length]);

  const achEarned = ACHIEVEMENTS.filter(a => stats.achievements.includes(a.id));
  const achTotal  = ACHIEVEMENTS.length;

  return (
    <div className="p-4 md:p-6 pb-20 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--pink)] to-[var(--purple)] flex items-center justify-center">
          <BarChart3 className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-heading font-black text-white">My Stats</h1>
          <p className="text-[13px] text-[var(--text3)]">Your anime journey at a glance</p>
        </div>
      </div>

      {/* ── Level & XP Card ── */}
      <div className="bg-gradient-to-br from-[var(--pink)]/10 via-[var(--purple)]/10 to-[var(--blue)]/10 border border-[var(--pink)]/20 rounded-2xl p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-[11px] font-black text-[var(--text3)] uppercase tracking-widest mb-1">Current Level</div>
            <div className="text-5xl font-heading font-black text-white leading-none">{level}</div>
          </div>
          <div className="text-right">
            <div className="text-[11px] font-black text-[var(--text3)] uppercase tracking-widest mb-1">Total XP</div>
            <div className="text-3xl font-heading font-black text-[var(--gold)]">{stats.totalXP.toLocaleString()}</div>
          </div>
        </div>
        <div className="mb-2">
          <div className="flex justify-between text-[11px] text-[var(--text3)] font-bold mb-1">
            <span>Level {level}</span>
            <span>{stats.totalXP - xpStart} / {xpEnd - xpStart} XP to Level {level + 1}</span>
          </div>
          <div className="h-3 bg-[var(--bg3)] rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] rounded-full transition-all duration-500"
              style={{ width: `${xpPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* ── Stats Grid ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard icon={<Tv2 />}        label="Episodes Visited"  value={history.length}     suffix=""    accent="pink" />
        <StatCard icon={<Clock />}       label="Est. Hours"        value={estHours}           suffix="h"   accent="purple" />
        <StatCard icon={<TrendingUp />}  label="Anime Explored"    value={recentAnime.length} suffix=""    accent="blue" />
        <StatCard icon={<BookMarked />}  label="In Watchlist"      value={watchlist.length}   suffix=""    accent="gold" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Streak card */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Flame className="w-4 h-4 text-orange-400" />
            <h3 className="text-[14px] font-heading font-black text-white">Daily Streak</h3>
          </div>
          <div className="text-5xl font-heading font-black text-white mb-1">{stats.streak}</div>
          <div className="text-[13px] text-[var(--text3)]">{stats.streak === 1 ? 'day' : 'days'} in a row</div>
          <div className="mt-3 text-[11px] font-bold text-orange-400">
            {stats.streak >= 30 ? '🌟 Monthly Devotee!' : stats.streak >= 7 ? '🗓️ Weekly Warrior!' : stats.streak >= 3 ? '📅 Keep it up!' : 'Visit daily to build your streak'}
          </div>
        </div>

        {/* Achievements summary */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-[var(--gold)]" />
              <h3 className="text-[14px] font-heading font-black text-white">Achievements</h3>
            </div>
            <Link href="/achievements" className="text-[11px] font-bold text-[var(--pink)] hover:underline">View All</Link>
          </div>
          <div className="text-5xl font-heading font-black text-white mb-1">{achEarned.length}</div>
          <div className="text-[13px] text-[var(--text3)] mb-3">of {achTotal} unlocked</div>
          <div className="h-2 bg-[var(--bg3)] rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-[var(--gold)] to-orange-400 rounded-full"
              style={{ width: `${(achEarned.length / achTotal) * 100}%` }} />
          </div>
          <div className="mt-3 flex flex-wrap gap-1">
            {achEarned.slice(0, 6).map(a => (
              <span key={a.id} title={a.title} className="text-lg cursor-default">{a.icon}</span>
            ))}
            {achEarned.length > 6 && <span className="text-[11px] text-[var(--text3)] self-center">+{achEarned.length - 6} more</span>}
          </div>
        </div>
      </div>

      {/* ── Recently Explored ── */}
      {recentAnime.length > 0 && (
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Star className="w-4 h-4 text-[var(--purple)]" />
              <h3 className="text-[14px] font-heading font-black text-white">Recently Explored</h3>
            </div>
            <Link href="/profile" className="text-[11px] font-bold text-[var(--pink)] hover:underline">Full History</Link>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-3">
            {recentAnime.slice(0, 12).map((anime: any) => (
              <Link key={anime.mal_id} href={`/anime/${anime.mal_id}`}>
                <div className="group cursor-pointer">
                  <img src={anime.image_url} alt={anime.title}
                    className="w-full aspect-[2/3] object-cover rounded-lg group-hover:scale-105 transition-transform duration-200" />
                  <p className="text-[10px] text-[var(--text3)] truncate mt-1">{anime.title}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {recentAnime.length === 0 && (
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-12 text-center">
          <div className="text-4xl mb-3">📊</div>
          <h3 className="text-[16px] font-heading font-black text-white mb-2">Nothing to show yet</h3>
          <p className="text-[13px] text-[var(--text3)] mb-4">Start watching anime and your stats will appear here.</p>
          <Link href="/browse">
            <button className="bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white px-5 py-2.5 rounded-xl text-[13px] font-bold">
              Browse Anime
            </button>
          </Link>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, suffix, accent }: { icon: React.ReactNode; label: string; value: number | string; suffix: string; accent: 'pink' | 'purple' | 'blue' | 'gold' }) {
  const colors = {
    pink:   'text-[var(--pink)]   bg-[var(--pink)]/10',
    purple: 'text-[#a78bfa]       bg-[#7c3aed]/10',
    blue:   'text-[var(--blue)]   bg-[var(--blue)]/10',
    gold:   'text-[var(--gold)]   bg-[var(--gold)]/10',
  }[accent];
  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 [&>svg]:w-5 [&>svg]:h-5 ${colors}`}>{icon}</div>
      <div className="font-heading font-black text-2xl text-white">{value}{suffix}</div>
      <div className="text-[11px] font-bold text-[var(--text3)] mt-0.5">{label}</div>
    </div>
  );
}
