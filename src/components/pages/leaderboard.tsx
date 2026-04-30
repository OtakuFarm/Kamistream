import React, { useEffect, useState } from 'react';
import { Trophy, Crown, Medal } from 'lucide-react';
import { Link } from 'wouter';
import { supabase } from '@/lib/supabase';
import { useActiveWeek } from '@/hooks/useChallenge';

interface Entry {
  user_id: string;
  username: string | null;
  likes: number;
  entries: number;
}

function aggregate(rows: any[]): Entry[] {
  const byUser = new Map<string, Entry>();
  for (const r of rows) {
    const key = r.user_id;
    const existing =
      byUser.get(key) || { user_id: key, username: r.username, likes: 0, entries: 0 };
    existing.likes += (r.submission_likes || []).length;
    existing.entries += 1;
    if (r.username) existing.username = r.username;
    byUser.set(key, existing);
  }
  return Array.from(byUser.values()).sort((a, b) => b.likes - a.likes);
}

export default function Leaderboard() {
  const [tab, setTab] = useState<'weekly' | 'alltime'>('weekly');
  const { week } = useActiveWeek();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        let q = supabase
          .from('submissions')
          .select('user_id, username, submission_likes(user_id)');
        if (tab === 'weekly' && week?.id) q = q.eq('week_id', week.id);
        const { data, error } = await q;
        if (error) throw error;
        if (!cancelled) setEntries(aggregate(data || []));
      } catch (err: any) {
        console.warn('[leaderboard] load failed', err?.message);
        if (!cancelled) setEntries([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, week?.id]);

  const rankIcon = (i: number) => {
    if (i === 0) return <Crown className="w-5 h-5 text-[var(--gold)]" />;
    if (i === 1) return <Medal className="w-5 h-5 text-gray-300" />;
    if (i === 2) return <Medal className="w-5 h-5 text-orange-400" />;
    return null;
  };

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto pb-20">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-heading font-black text-white mb-2">Leaderboard</h1>
        <p className="text-[var(--text3)] text-[14px]">The top creators on KamiStream.</p>
      </div>

      <div className="flex justify-center mb-6">
        <div className="bg-[var(--card)] p-1 rounded-xl flex border border-[var(--border)]">
          <button
            onClick={() => setTab('weekly')}
            className={`px-6 py-2 rounded-lg text-[13px] font-bold transition-all ${
              tab === 'weekly'
                ? 'bg-[var(--bg3)] text-[var(--pink)] shadow-sm'
                : 'text-[var(--text2)] hover:text-white'
            }`}
          >
            This Week
          </button>
          <button
            onClick={() => setTab('alltime')}
            className={`px-6 py-2 rounded-lg text-[13px] font-bold transition-all ${
              tab === 'alltime'
                ? 'bg-[var(--bg3)] text-[var(--gold)] shadow-sm'
                : 'text-[var(--text2)] hover:text-white'
            }`}
          >
            All Time
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-[var(--text3)] text-[13px]">Loading…</div>
      ) : entries.length === 0 ? (
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-12 text-center">
          <Trophy className="w-12 h-12 text-[var(--text3)] mx-auto mb-3 opacity-60" />
          <h2 className="text-lg font-heading font-black text-white mb-1">
            No winners yet
          </h2>
          <p className="text-[13px] text-[var(--text3)]">
            The leaderboard will fill up as creators submit videos.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((e, i) => (
            <Link key={e.user_id} href={`/creator/${e.username || e.user_id}`}>
              <div
                className={`flex items-center gap-4 p-4 rounded-xl border transition-colors ${
                  i < 3
                    ? 'bg-gradient-to-r from-[var(--card)] to-[var(--bg2)] border-[var(--purple)]/40'
                    : 'bg-[var(--card)] border-[var(--border)] hover:border-[var(--purple)]'
                }`}
              >
                <div className="w-10 text-center font-mono text-lg font-black text-white flex items-center justify-center gap-1">
                  {rankIcon(i) || <span className="text-[var(--text3)]">#{i + 1}</span>}
                </div>
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--pink)] to-[var(--purple)] flex items-center justify-center text-white font-black">
                  {(e.username || 'U').slice(0, 1).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-white truncate">
                    @{e.username || 'creator'}
                  </div>
                  <div className="text-[11px] text-[var(--text3)]">
                    {e.entries} {e.entries === 1 ? 'entry' : 'entries'}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-heading font-black text-lg text-[var(--pink)]">
                    {e.likes.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-[var(--text3)] uppercase tracking-widest">
                    Likes
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
