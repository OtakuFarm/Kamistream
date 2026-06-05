import React, { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useLocation, Link } from 'wouter';
import { useWatchHistory } from '@/hooks/useWatchHistory';
import { useWatchlist } from '@/hooks/useWatchlist';
import { useEpisodeProgress } from '@/hooks/useEpisodeProgress';
import { useActivityFeed } from '@/hooks/useActivityFeed';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useSEO } from '@/hooks/useSEO';
import { supabase } from '@/lib/supabase';
import {
  Play, Film, Heart, Trophy, Trash2, BookMarked, CheckCircle2,
  Star, Bell, BellOff, Activity, Settings, Clock, Plus,
  Loader2, Eye
} from 'lucide-react';

interface Submission {
  id: string; caption: string | null; video_url: string;
  created_at: string; week_theme: string | null; likes: number;
}

function timeAgo(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60)   return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function StatCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: number; accent: 'pink'|'purple'|'gold'|'green' }) {
  const colors = {
    pink:   'text-[var(--pink)]   bg-[var(--pink)]/10',
    purple: 'text-[#a78bfa]       bg-[#7c3aed]/10',
    gold:   'text-[var(--gold)]   bg-[var(--gold)]/10',
    green:  'text-[#06d6a0]       bg-[#06d6a0]/10',
  }[accent];
  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${colors}`}>{icon}</div>
      <div className="font-heading font-black text-2xl text-white">{value}</div>
      <div className="text-[11px] font-bold text-[var(--text3)] mt-0.5">{label}</div>
    </div>
  );
}

const ACTIVITY_ICONS: Record<string, { emoji: string; color: string }> = {
  watched:          { emoji: '▶', color: 'var(--blue)'   },
  added_watchlist:  { emoji: '+', color: 'var(--pink)'   },
  rated:            { emoji: '★', color: 'var(--gold)'   },
  completed:        { emoji: '✓', color: 'var(--green)'  },
};

export default function Profile() {
  const { user, signOut, loading } = useAuth();
  const [, setLocation]            = useLocation();
  const { getHistory, getRecentAnime, clearHistory } = useWatchHistory();
  const { watchlist }              = useWatchlist();
  const { getWatchedCount }        = useEpisodeProgress();
  const activity                   = useActivityFeed();
  const push                       = usePushNotifications();

  const [activeTab, setActiveTab]   = useState<'overview'|'activity'|'notifications'>('overview');
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [totalLikes,  setTotalLikes]  = useState(0);
  const [pushRequesting, setPushRequesting] = useState(false);

  useSEO({ title: 'My Profile' });

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

  if (loading || !user) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-6 h-6 text-[var(--purple)] animate-spin" />
    </div>
  );

  const history      = getHistory();
  const recentAnime  = getRecentAnime();
  const initial      = user.email?.[0].toUpperCase() || 'U';
  const username     = user.email?.split('@')[0] || 'User';
  const totalWatched = recentAnime.reduce((acc, a) => acc + getWatchedCount(a.mal_id), 0);

  const TABS = [
    { id: 'overview',      icon: Eye,      label: 'Overview'       },
    { id: 'activity',      icon: Activity, label: 'Activity'       },
    { id: 'notifications', icon: Bell,     label: 'Notifications'  },
  ] as const;

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto pb-20">

      {/* ── Profile header ── */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-hidden relative mb-6">
        {/* Banner */}
        <div className="h-32 bg-gradient-to-r from-[var(--pink)]/20 via-[var(--purple)]/20 to-[var(--blue)]/20 relative">
          <div className="absolute inset-0 opacity-30"
            style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)', backgroundSize: '30px 30px' }} />
        </div>
        <div className="px-6 pb-6 relative">
          {/* Avatar */}
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[var(--pink)] to-[var(--purple)] p-1 absolute -top-10 border-4 border-[var(--card)]">
            <div className="w-full h-full rounded-xl bg-[var(--bg2)] flex items-center justify-center font-heading text-2xl font-black text-white">
              {initial}
            </div>
          </div>
          <div className="ml-28 pt-3 flex justify-between items-start flex-wrap gap-3">
            <div>
              <h1 className="text-xl font-heading font-black text-white">@{username}</h1>
              <p className="text-[12px] text-[var(--text3)]">{user.email}</p>
              {/* Push status */}
              {push.supported && (
                <div className="flex items-center gap-1.5 mt-1">
                  {push.permission === 'granted'
                    ? <><Bell className="w-3 h-3 text-[var(--green)]" /><span className="text-[10px] font-bold text-[var(--green)]">Notifications on</span></>
                    : <><BellOff className="w-3 h-3 text-[var(--text3)]" /><span className="text-[10px] text-[var(--text3)]">Notifications off</span></>
                  }
                </div>
              )}
            </div>
            <button onClick={async () => { await signOut(); setLocation('/'); }}
              className="bg-[var(--bg3)] border border-[var(--border)] hover:border-red-500/50 hover:text-red-400 text-[var(--text2)] px-4 py-2 rounded-xl text-[12px] font-bold transition-colors">
              Sign Out
            </button>
          </div>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard icon={<Film className="w-5 h-5" />}         label="Episodes Visited"  value={history.length}      accent="pink"   />
        <StatCard icon={<CheckCircle2 className="w-5 h-5" />} label="Eps Marked Watched" value={totalWatched}        accent="green"  />
        <StatCard icon={<Play className="w-5 h-5" />}         label="Unique Anime"       value={recentAnime.length}  accent="purple" />
        <StatCard icon={<BookMarked className="w-5 h-5" />}   label="In Watchlist"       value={watchlist.length}    accent="gold"   />
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 mb-6 bg-[var(--card)] border border-[var(--border)] rounded-xl p-1">
        {TABS.map(({ id, icon: Icon, label }) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[12px] font-bold transition-all ${
              activeTab === id ? 'bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white shadow-lg' : 'text-[var(--text3)] hover:text-white'
            }`}>
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {/* ══ OVERVIEW TAB ══ */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Watch History */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[15px] font-heading font-black text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-[var(--pink)]" /> Continue Watching
              </h2>
              {recentAnime.length > 0 && (
                <button onClick={clearHistory} className="text-[11px] font-bold text-[var(--text3)] hover:text-red-400 flex items-center gap-1 transition-colors">
                  <Trash2 className="w-3 h-3" /> Clear
                </button>
              )}
            </div>
            {recentAnime.length === 0 ? (
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6 text-center text-[13px] text-[var(--text3)]">
                No watch history yet. <Link href="/home"><span className="text-[var(--pink)] cursor-pointer hover:underline">Start watching!</span></Link>
              </div>
            ) : (
              <div className="space-y-2">
                {recentAnime.slice(0, 8).map(entry => (
                  <Link key={entry.mal_id} href={`/watch/${entry.mal_id}/${entry.ep_id}`}>
                    <div className="flex items-center gap-3 p-3 bg-[var(--card)] border border-[var(--border)] rounded-xl hover:border-[var(--purple)] transition-colors group cursor-pointer">
                      <img src={entry.image_url} alt={entry.title} className="w-10 h-14 object-cover rounded-lg shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-bold text-white truncate">{entry.title}</p>
                        <p className="text-[11px] text-[var(--text3)]">EP {entry.ep_id}</p>
                      </div>
                      <Play className="w-4 h-4 text-[var(--text3)] group-hover:text-[var(--pink)] shrink-0" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Watchlist */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[15px] font-heading font-black text-white flex items-center gap-2">
                <BookMarked className="w-4 h-4 text-[var(--pink)]" /> My Watchlist
              </h2>
              <Link href="/watchlist" className="text-[11px] font-bold text-[var(--pink)] hover:underline">
                View All ({watchlist.length})
              </Link>
            </div>
            {watchlist.length === 0 ? (
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6 text-center text-[13px] text-[var(--text3)]">
                Nothing saved yet. Hit <Plus className="w-3 h-3 inline" /> Watchlist on any anime.
              </div>
            ) : (
              <div className="space-y-2">
                {watchlist.slice(0, 8).map((item: any) => (
                  <Link key={item.mal_id} href={`/anime/${item.mal_id}`}>
                    <div className="flex items-center gap-3 p-3 bg-[var(--card)] border border-[var(--border)] rounded-xl hover:border-[var(--pink)] transition-colors group cursor-pointer">
                      <img src={item.image_url} alt={item.title} className="w-10 h-14 object-cover rounded-lg shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-bold text-white truncate">{item.title}</p>
                        {item.score && <span className="text-[10px] text-[var(--gold)] flex items-center gap-0.5"><Star className="w-2.5 h-2.5 fill-current" />{item.score}</span>}
                      </div>
                      <BookMarked className="w-4 h-4 text-[var(--pink)] shrink-0" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Submissions */}
          {submissions.length > 0 && (
            <section className="lg:col-span-2">
              <h2 className="text-[15px] font-heading font-black text-white flex items-center gap-2 mb-3">
                <Trophy className="w-4 h-4 text-[var(--gold)]" /> My Submissions
              </h2>
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
            </section>
          )}
        </div>
      )}

      {/* ══ ACTIVITY TAB ══ */}
      {activeTab === 'activity' && (
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-[var(--border)]">
            <h2 className="text-[13px] font-black text-white">Recent Activity</h2>
          </div>
          {activity.length === 0 ? (
            <div className="p-8 text-center text-[13px] text-[var(--text3)]">
              No activity yet — start watching to see your feed here!
            </div>
          ) : (
            <div className="divide-y divide-[var(--border)] max-h-[600px] overflow-y-auto">
              {activity.map(item => {
                const { emoji, color } = ACTIVITY_ICONS[item.type] || { emoji: '·', color: 'var(--text3)' };
                return (
                  <Link key={item.id} href={`/anime/${item.mal_id}`}>
                    <div className="flex items-center gap-3 px-5 py-3 hover:bg-[var(--bg3)] transition-colors cursor-pointer group">
                      <img src={item.image_url} alt={item.title} className="w-10 h-14 object-cover rounded-lg shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-bold text-white truncate group-hover:text-[var(--pink)] transition-colors">{item.title}</p>
                        <p className="text-[11px] font-bold mt-0.5" style={{ color }}>{emoji} {item.detail}</p>
                      </div>
                      <span className="text-[10px] text-[var(--text3)] shrink-0">{timeAgo(item.timestamp)}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══ NOTIFICATIONS TAB ══ */}
      {activeTab === 'notifications' && (
        <div className="space-y-4">
          {/* Permission card */}
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-[14px] font-black text-white">Browser Notifications</h3>
                <p className="text-[12px] text-[var(--text3)] mt-0.5">
                  {push.permission === 'granted'
                    ? 'You will receive notifications for selected events.'
                    : push.permission === 'denied'
                      ? 'Notifications blocked. Enable in browser settings.'
                      : 'Allow KamiStream to send you notifications.'
                  }
                </p>
              </div>
              {push.permission !== 'granted' && push.permission !== 'denied' && (
                <button
                  onClick={async () => { setPushRequesting(true); await push.requestPermission(); setPushRequesting(false); }}
                  disabled={pushRequesting || !push.supported}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white text-[12px] font-black rounded-xl hover:brightness-110 transition-all disabled:opacity-50">
                  {pushRequesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bell className="w-3.5 h-3.5" />}
                  Enable
                </button>
              )}
              {push.permission === 'granted' && <Bell className="w-5 h-5 text-[var(--green)]" />}
              {push.permission === 'denied'  && <BellOff className="w-5 h-5 text-red-400" />}
            </div>

            {/* Preference toggles */}
            {push.supported && push.permission === 'granted' && (
              <div className="space-y-3 pt-3 border-t border-[var(--border)]">
                {[
                  { key: 'newEpisodes' as const, label: 'New episode releases',   desc: 'When an anime you watch gets a new episode' },
                  { key: 'schedule'   as const, label: 'Weekly schedule updates', desc: 'Upcoming episode reminders from your schedule' },
                  { key: 'community'  as const, label: 'Community activity',      desc: 'Replies to your comments and challenge likes' },
                ].map(({ key, label, desc }) => (
                  <div key={key} className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-[13px] font-bold text-white">{label}</p>
                      <p className="text-[11px] text-[var(--text3)]">{desc}</p>
                    </div>
                    <button
                      onClick={() => push.updatePref(key, !push.prefs[key])}
                      className={`w-11 h-6 rounded-full transition-all relative shrink-0 ${push.prefs[key] ? 'bg-[var(--pink)]' : 'bg-[var(--border)]'}`}>
                      <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${push.prefs[key] ? 'left-6' : 'left-1'}`} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Test notification */}
          {push.permission === 'granted' && (
            <button
              onClick={() => push.notify('KamiStream Test 🎌', 'Notifications are working perfectly!', '/icons/icon-192.png', '/home')}
              className="w-full py-2.5 bg-[var(--card)] border border-[var(--border)] hover:border-[var(--pink)]/40 rounded-xl text-[12px] font-bold text-[var(--text2)] hover:text-white transition-all">
              Send Test Notification
            </button>
          )}

          {!push.supported && (
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 text-center text-[13px] text-[var(--text3)]">
              Push notifications require a modern browser. Install KamiStream as an app for full support.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
