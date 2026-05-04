import React, { useEffect, useState } from 'react';
import { Trophy, Crown, Medal, Flame, Star, TrendingUp } from 'lucide-react';
import { Link } from 'wouter';
import { supabase } from '@/lib/supabase';
import { useActiveWeek } from '@/hooks/useChallenge';
import { useSEO } from '@/hooks/useSEO';
import { LeaderboardSkeleton } from '@/components/LoadingSkeleton';
import { useAuth } from '@/lib/auth';

interface Entry {
  user_id: string; username: string | null;
  likes: number; entries: number;
  avatar_color: string;
}

function aggregate(rows: any[]): Entry[] {
  const byUser = new Map<string, Entry>();
  const colors = ['#ff4f7e','#a78bfa','#60a5fa','#34d399','#fb923c'];
  for (const r of rows) {
    const key      = r.user_id;
    const existing = byUser.get(key) || {
      user_id: key, username: r.username, likes: 0, entries: 0,
      avatar_color: colors[Math.abs(key.charCodeAt(0)) % colors.length],
    };
    existing.likes  += (r.submission_likes || []).length;
    existing.entries += 1;
    if (r.username) existing.username = r.username;
    byUser.set(key, existing);
  }
  return Array.from(byUser.values()).sort((a, b) => b.likes - a.likes);
}

const MEDALS = [
  { icon: <Crown className="w-5 h-5" />,  color: '#FFD700', label: '1st' },
  { icon: <Medal className="w-5 h-5" />,  color: '#C0C0C0', label: '2nd' },
  { icon: <Medal className="w-5 h-5" />,  color: '#CD7F32', label: '3rd' },
];

export default function Leaderboard() {
  const { user }          = useAuth();
  const [tab, setTab]     = useState<'weekly' | 'alltime'>('weekly');
  const { week }          = useActiveWeek();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState('');

  useSEO({ title: 'Leaderboard', description: 'See who\'s on top of the KamiStream challenge leaderboard this week.' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        let q = supabase.from('submissions').select('user_id, username, submission_likes(user_id)');
        if (tab === 'weekly' && week?.id) q = q.eq('week_id', week.id);
        const { data, error } = await q;
        if (error) throw error;
        if (!cancelled) setEntries(aggregate(data || []));
      } catch (err: any) {
        console.warn('[leaderboard]', err?.message);
        if (!cancelled) setEntries([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tab, week?.id]);

  // Weekly countdown
  useEffect(() => {
    const update = () => {
      const now  = new Date();
      const next = new Date();
      next.setDate(now.getDate() + (7 - now.getDay()) % 7 || 7);
      next.setHours(0, 0, 0, 0);
      const diff = next.getTime() - now.getTime();
      const d    = Math.floor(diff / 86400000);
      const h    = Math.floor((diff % 86400000) / 3600000);
      const m    = Math.floor((diff % 3600000) / 60000);
      setCountdown(`${d}d ${h}h ${m}m`);
    };
    update();
    const t = setInterval(update, 60000);
    return () => clearInterval(t);
  }, []);

  // Find current user's rank
  const myRank = user ? entries.findIndex(e => e.user_id === user.id) + 1 : 0;

  const top3    = entries.slice(0, 3);
  const rest    = entries.slice(3);

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto pb-20">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[var(--gold)]/20 to-[var(--pink)]/20 border border-[var(--gold)]/30 flex items-center justify-center mx-auto mb-4">
          <Trophy className="w-8 h-8 text-[var(--gold)]" />
        </div>
        <h1 className="text-3xl font-heading font-black text-white mb-1">Leaderboard</h1>
        <p className="text-[var(--text3)] text-[13px]">Top creators ranked by challenge likes</p>

        {/* Week countdown */}
        {tab === 'weekly' && countdown && (
          <div className="inline-flex items-center gap-2 mt-3 bg-[var(--card)] border border-[var(--border)] px-4 py-2 rounded-full text-[12px] font-bold text-[var(--text2)]">
            <Flame className="w-3.5 h-3.5 text-[var(--pink)]" />
            Week resets in {countdown}
          </div>
        )}
      </div>

      {/* My rank banner */}
      {myRank > 0 && (
        <div className="bg-gradient-to-r from-[var(--pink)]/10 to-[var(--purple)]/10 border border-[var(--pink)]/30 rounded-xl p-3 mb-5 flex items-center gap-3">
          <Star className="w-4 h-4 text-[var(--pink)] shrink-0" />
          <span className="text-[13px] font-bold text-white">
            You're ranked <span className="text-[var(--pink)]">#{myRank}</span> this {tab === 'weekly' ? 'week' : 'time'}
          </span>
          <Link href="/challenges" className="ml-auto text-[11px] font-bold text-[var(--pink)] hover:underline">
            Submit →
          </Link>
        </div>
      )}

      {/* Tabs */}
      <div className="flex justify-center mb-6">
        <div className="bg-[var(--card)] p-1 rounded-xl flex border border-[var(--border)]">
          {(['weekly', 'alltime'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-6 py-2 rounded-lg text-[13px] font-bold transition-all ${tab === t ? 'bg-[var(--bg3)] text-[var(--pink)] shadow-sm' : 'text-[var(--text2)] hover:text-white'}`}>
              {t === 'weekly' ? 'This Week' : 'All Time'}
            </button>
          ))}
        </div>
      </div>

      {loading ? <LeaderboardSkeleton /> : entries.length === 0 ? (
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-12 text-center">
          <Trophy className="w-12 h-12 text-[var(--text3)] mx-auto mb-3 opacity-40" />
          <h2 className="text-lg font-heading font-black text-white mb-1">No entries yet</h2>
          <p className="text-[13px] text-[var(--text3)] mb-4">Be the first to climb the leaderboard!</p>
          <Link href="/challenges">
            <button className="bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white px-5 py-2.5 rounded-xl text-[13px] font-bold">
              Join Challenge
            </button>
          </Link>
        </div>
      ) : (
        <>
          {/* Top 3 podium */}
          {top3.length >= 3 && (
            <div className="grid grid-cols-3 gap-3 mb-6">
              {[top3[1], top3[0], top3[2]].map((e, i) => {
                const rank  = i === 1 ? 0 : i === 0 ? 1 : 2;
                const medal = MEDALS[rank];
                const sizes = ['h-28', 'h-36', 'h-28'];
                return (
                  <Link key={e.user_id} href={`/creator/${e.username || e.user_id}`}>
                    <div className={`${sizes[i]} flex flex-col items-center justify-end pb-4 rounded-2xl border transition-all cursor-pointer group ${rank === 0 ? 'bg-gradient-to-b from-[var(--gold)]/10 to-[var(--card)] border-[var(--gold)]/40' : 'bg-[var(--card)] border-[var(--border)] hover:border-[var(--purple)]'}`}>
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-black text-sm mb-2" style={{ background: e.avatar_color }}>
                        {(e.username || 'U')[0].toUpperCase()}
                      </div>
                      <div style={{ color: medal.color }}>{medal.icon}</div>
                      <p className="text-[10px] font-black text-white mt-1 truncate max-w-full px-2">@{e.username || 'creator'}</p>
                      <p className="text-[12px] font-black text-[var(--pink)]">{e.likes.toLocaleString()} ♥</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          {/* Full list */}
          <div className="space-y-2">
            {entries.map((e, i) => {
              const isMe   = e.user_id === user?.id;
              const medal  = MEDALS[i];
              return (
                <Link key={e.user_id} href={`/creator/${e.username || e.user_id}`}>
                  <div className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${isMe ? 'bg-[var(--pink)]/5 border-[var(--pink)]/30' : i < 3 ? 'bg-gradient-to-r from-[var(--card)] to-[var(--bg2)] border-[var(--purple)]/30' : 'bg-[var(--card)] border-[var(--border)] hover:border-[var(--purple)]'}`}>
                    <div className="w-9 text-center font-mono font-black">
                      {medal
                        ? <span style={{ color: medal.color }}>{medal.icon}</span>
                        : <span className="text-[13px] text-[var(--text3)]">#{i+1}</span>}
                    </div>
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-black text-sm shrink-0" style={{ background: e.avatar_color }}>
                      {(e.username || 'U')[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-white text-[13px] truncate flex items-center gap-1.5">
                        @{e.username || 'creator'}
                        {isMe && <span className="text-[9px] bg-[var(--pink)]/20 text-[var(--pink)] px-1.5 py-0.5 rounded-md font-black">YOU</span>}
                      </div>
                      <div className="text-[11px] text-[var(--text3)]">{e.entries} {e.entries === 1 ? 'entry' : 'entries'}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-heading font-black text-lg text-[var(--pink)]">{e.likes.toLocaleString()}</div>
                      <div className="text-[9px] text-[var(--text3)] uppercase tracking-widest">likes</div>
                    </div>
                    {i < 3 && <TrendingUp className="w-4 h-4 text-[var(--green)] shrink-0" />}
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
