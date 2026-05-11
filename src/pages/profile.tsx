import React, { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useLocation, Link } from 'wouter';
import { useWatchHistory } from '@/hooks/useWatchHistory';
import { useWatchlist } from '@/hooks/useWatchlist';
import { useEpisodeProgress } from '@/hooks/useEpisodeProgress';
import { useSEO } from '@/hooks/useSEO';
import { supabase } from '@/lib/supabase';
import { Play, Film, Heart, Trophy, Trash2, BookMarked, CheckCircle2, Star } from 'lucide-react';

interface Submission {
  id: string; caption: string | null; video_url: string;
  created_at: string; week_theme: string | null; likes: number;
}

export default function Profile() {
  const { user, signOut, loading } = useAuth();
  const [, setLocation]   = useLocation();
  const { getHistory, getRecentAnime, clearHistory } = useWatchHistory();
  const { watchlist }     = useWatchlist();
  const { getWatchedCount } = useEpisodeProgress();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [totalLikes,  setTotalLikes]  = useState(0);

  useSEO({ title: 'My Profile' });

  // Redirect unauthenticated users — must be in useEffect, not render
  useEffect(() => {
    if (!loading && !user) setLocation('/login');
  }, [user, loading]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('submissions')
      .select('id, caption, video_url, created_at, weeks(theme), submission_likes(user_id)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (!data) return;
        const mapped = (data as any[]).map(r => ({
          id: r.id, caption: r.caption, video_url: r.video_url,
          created_at: r.created_at, week_theme: r.weeks?.theme || null,
          likes: r.submission_likes?.length || 0,
        }));
        setSubmissions(mapped);
        setTotalLikes(mapped.reduce((acc, s) => acc + s.likes, 0));
      });
  }, [user]);

  if (loading || !user) return null;

  const history     = getHistory();
  const recentAnime = getRecentAnime();
  const initial     = user.email?.[0].toUpperCase() || 'U';
  const username    = user.email?.split('@')[0] || 'User';

  // Total episodes marked as watched across all anime
  const totalWatched = recentAnime.reduce((acc, a) => acc + getWatchedCount(a.mal_id), 0);

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto pb-20">

      {/* Profile header */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-hidden relative mb-8">
        <div className="h-32 bg-gradient-to-r from-[var(--pink)]/20 via-[var(--purple)]/20 to-[var(--blue)]/20" />
        <div className="px-6 pb-6 relative">
          <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-[var(--pink)] to-[var(--purple)] p-1 absolute -top-12 border-4 border-[var(--card)]">
            <div className="w-full h-full rounded-xl bg-[var(--bg2)] flex items-center justify-center font-heading text-3xl font-black text-white">
              {initial}
            </div>
          </div>
          <div className="ml-32 pt-3 flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-heading font-black text-white">@{username}</h1>
              <p className="text-[13px] text-[var(--text3)]">{user.email}</p>
            </div>
            <button onClick={async () => { await signOut(); setLocation('/'); }}
              className="bg-[var(--bg3)] border border-[var(--border)] hover:border-red-500/50 hover:text-red-400 text-[var(--text2)] px-4 py-2 rounded-xl text-[12px] font-bold transition-colors">
              Sign Out
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard icon={<Film className="w-5 h-5" />}       label="Episodes Visited"  value={history.length}        accent="pink" />
        <StatCard icon={<CheckCircle2 className="w-5 h-5" />} label="Episodes Watched" value={totalWatched}          accent="green" />
        <StatCard icon={<Play className="w-5 h-5" />}       label="Unique Anime"       value={recentAnime.length}    accent="purple" />
        <StatCard icon={<BookMarked className="w-5 h-5" />} label="In Watchlist"       value={watchlist.length}      accent="gold" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* Watch History */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[16px] font-heading font-black text-white">Continue Watching</h2>
            {recentAnime.length > 0 && (
              <button onClick={() => { clearHistory(); }}
                className="text-[11px] font-bold text-[var(--text3)] hover:text-red-400 flex items-center gap-1 transition-colors">
                <Trash2 className="w-3 h-3" /> Clear
              </button>
            )}
          </div>
          {recentAnime.length === 0 ? (
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6 text-center text-[13px] text-[var(--text3)]">
              No watch history yet. Start watching!
            </div>
          ) : (
            <div className="space-y-2">
              {recentAnime.slice(0, 8).map(entry => (
                <Link key={entry.mal_id} href={`/watch/${entry.mal_id}/${entry.ep_id}`}>
                  <div className="flex items-center gap-3 p-3 bg-[var(--card)] border border-[var(--border)] rounded-xl hover:border-[var(--purple)] transition-colors group cursor-pointer">
                    <img src={entry.image_url} alt={entry.title} className="w-10 h-14 object-cover rounded-lg shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-bold text-white truncate">{entry.title}</p>
                      <p className="text-[11px] text-[var(--text3)]">EP {entry.ep_id} — {entry.ep_title}</p>
                      {entry.mal_id && getWatchedCount(entry.mal_id) > 0 && (
                        <p className="text-[10px] text-[#06d6a0] mt-0.5">{getWatchedCount(entry.mal_id)} episodes marked watched</p>
                      )}
                    </div>
                    <Play className="w-4 h-4 text-[var(--text3)] group-hover:text-[var(--pink)] shrink-0" />
                  </div>
                </Link>
              ))}
              {recentAnime.length > 8 && (
                <p className="text-center text-[12px] text-[var(--text3)] pt-1">+{recentAnime.length - 8} more</p>
              )}
            </div>
          )}
        </section>

        {/* Watchlist */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[16px] font-heading font-black text-white">My Watchlist</h2>
            <Link href="/watchlist" className="text-[12px] font-bold text-[var(--pink)] hover:underline">
              View All ({watchlist.length})
            </Link>
          </div>
          {watchlist.length === 0 ? (
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6 text-center text-[13px] text-[var(--text3)]">
              Nothing saved yet. Hit + Watchlist on any anime.
            </div>
          ) : (
            <div className="space-y-2">
              {watchlist.slice(0, 8).map((item: any) => (
                <Link key={item.mal_id} href={`/anime/${item.mal_id}`}>
                  <div className="flex items-center gap-3 p-3 bg-[var(--card)] border border-[var(--border)] rounded-xl hover:border-[var(--pink)] transition-colors group cursor-pointer">
                    <img src={item.image_url} alt={item.title} className="w-10 h-14 object-cover rounded-lg shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-bold text-white truncate">{item.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {item.score && <span className="text-[10px] text-[var(--gold)] flex items-center gap-0.5"><Star className="w-2.5 h-2.5 fill-current" />{item.score}</span>}
                        {item.episodes && <span className="text-[10px] text-[var(--text3)]">{item.episodes} eps</span>}
                      </div>
                    </div>
                    <BookMarked className="w-4 h-4 text-[var(--pink)] shrink-0" />
                  </div>
                </Link>
              ))}
              {watchlist.length > 8 && (
                <Link href="/watchlist">
                  <p className="text-center text-[12px] text-[var(--pink)] font-bold pt-1 hover:underline">+{watchlist.length - 8} more in watchlist</p>
                </Link>
              )}
            </div>
          )}
        </section>

        {/* Submissions */}
        <section className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[16px] font-heading font-black text-white">My Challenge Submissions</h2>
            <Link href="/challenges" className="text-[12px] font-bold text-[var(--pink)] hover:underline">+ Submit</Link>
          </div>
          {submissions.length === 0 ? (
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6 text-center">
              <p className="text-[13px] text-[var(--text3)] mb-3">No challenge submissions yet.</p>
              <Link href="/challenges">
                <button className="bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white px-4 py-2 rounded-xl text-[12px] font-bold">
                  Join This Week's Challenge
                </button>
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {submissions.map(s => (
                <div key={s.id} className="flex items-start gap-3 p-3 bg-[var(--card)] border border-[var(--border)] rounded-xl">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[var(--pink)] to-[var(--purple)] flex items-center justify-center shrink-0">
                    <Trophy className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold text-[var(--pink)] uppercase tracking-wide">{s.week_theme || 'Challenge'}</p>
                    {s.caption && <p className="text-[12px] text-white line-clamp-1 mt-0.5">{s.caption}</p>}
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[10px] text-[var(--text3)]">{new Date(s.created_at).toLocaleDateString()}</span>
                      <span className="text-[10px] text-[var(--text3)] flex items-center gap-1"><Heart className="w-3 h-3 text-[var(--pink)]" />{s.likes}</span>
                    </div>
                  </div>
                  <a href={s.video_url} target="_blank" rel="noopener noreferrer" className="text-[11px] font-bold text-[var(--text3)] hover:text-white">View</a>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: number; accent: 'pink' | 'purple' | 'gold' | 'green' }) {
  const color = {
    pink:   'text-[var(--pink)]   bg-[var(--pink)]/10',
    purple: 'text-[#a78bfa]       bg-[#7c3aed]/10',
    gold:   'text-[var(--gold)]   bg-[var(--gold)]/10',
    green:  'text-[#06d6a0]       bg-[#06d6a0]/10',
  }[accent];
  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${color}`}>{icon}</div>
      <div className="font-heading font-black text-2xl text-white">{value}</div>
      <div className="text-[11px] font-bold text-[var(--text3)] mt-0.5">{label}</div>
    </div>
  );
}
