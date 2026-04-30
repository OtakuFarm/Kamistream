import React, { useEffect, useState } from 'react';
import { useLocation, Link } from 'wouter';
import {
  Shield,
  Users,
  Video,
  Trophy,
  MessageSquare,
  Trash2,
  Plus,
  Heart,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin';
import { supabase } from '@/lib/supabase';

interface Stats {
  weeks: number;
  activeWeek: string | null;
  submissions: number;
  creators: number;
  likes: number;
  comments: number;
}

interface SubRow {
  id: string;
  username: string | null;
  user_id: string;
  caption: string | null;
  video_url: string;
  created_at: string;
  week_theme: string | null;
}

interface CommentRow {
  id: string;
  username: string | null;
  body: string;
  created_at: string;
  mal_id: number;
  ep_id: number;
}

interface WeekRow {
  id: string;
  theme: string;
  prize_cents: number;
  ends_at: string;
  is_active: boolean;
}

type Tab = 'dashboard' | 'weeks' | 'submissions' | 'comments';

export default function Admin() {
  const { user, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<Tab>('dashboard');

  useEffect(() => {
    if (!authLoading && !isAdminEmail(user?.email)) {
      setLocation('/');
    }
  }, [user, authLoading, setLocation]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#080810] text-white/60">
        Checking permissions…
      </div>
    );
  }
  if (!isAdminEmail(user?.email)) return null;

  return (
    <div className="min-h-screen bg-[#080810] text-white">
      <div className="h-[60px] bg-[#0f0f1a] border-b border-white/10 flex items-center px-6 gap-4 sticky top-0 z-50">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--pink)] to-[#7c3aed] flex items-center justify-center font-heading font-black text-sm">
            K
          </div>
          <span className="font-heading font-black text-[16px]">
            Admin<span className="text-[#7c3aed]">Panel</span>
          </span>
        </Link>
        <div className="ml-auto flex items-center gap-2 text-[11px] font-mono text-[#7c3aed] bg-[#7c3aed]/10 px-3 py-1 rounded-md border border-[#7c3aed]/30">
          <Shield className="w-3 h-3" /> {user?.email}
        </div>
      </div>

      <div className="flex">
        <aside className="w-[200px] bg-[#0f0f1a] border-r border-white/10 min-h-[calc(100vh-60px)] p-4 flex-col gap-2 shrink-0 hidden md:flex">
          <div className="text-[9px] font-bold text-white/40 tracking-[2px] uppercase px-4 py-2">
            Menu
          </div>
          {([
            ['dashboard', 'Dashboard'],
            ['weeks', 'Weeks'],
            ['submissions', 'Submissions'],
            ['comments', 'Comments'],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`w-full text-left px-4 py-2 rounded-lg text-[13px] font-bold transition-colors ${
                tab === id
                  ? 'bg-[#7c3aed]/20 text-[#a78bfa] border-l-2 border-[#7c3aed]'
                  : 'text-white/60 hover:bg-white/5 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </aside>

        <main className="flex-1 p-6 md:p-8 overflow-x-auto">
          <div className="md:hidden flex gap-2 mb-6 overflow-x-auto">
            {(['dashboard', 'weeks', 'submissions', 'comments'] as Tab[]).map((id) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`px-4 py-2 rounded-lg text-[12px] font-bold whitespace-nowrap ${
                  tab === id ? 'bg-[#7c3aed]/20 text-[#a78bfa]' : 'text-white/60'
                }`}
              >
                {id}
              </button>
            ))}
          </div>
          {tab === 'dashboard' && <DashboardTab />}
          {tab === 'weeks' && <WeeksTab />}
          {tab === 'submissions' && <SubmissionsTab />}
          {tab === 'comments' && <CommentsTab />}
        </main>
      </div>
    </div>
  );
}

function DashboardTab() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [weeksRes, activeRes, subsRes, likesRes, commentsRes] = await Promise.all([
        supabase.from('weeks').select('id', { count: 'exact', head: true }),
        supabase
          .from('weeks')
          .select('theme')
          .eq('is_active', true)
          .order('starts_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase.from('submissions').select('user_id'),
        supabase.from('submission_likes').select('user_id', { count: 'exact', head: true }),
        supabase.from('episode_comments').select('id', { count: 'exact', head: true }),
      ]);
      const subs = (subsRes.data as Array<{ user_id: string }>) || [];
      setStats({
        weeks: weeksRes.count || 0,
        activeWeek: (activeRes.data as any)?.theme || null,
        submissions: subs.length,
        creators: new Set(subs.map((s) => s.user_id)).size,
        likes: likesRes.count || 0,
        comments: commentsRes.count || 0,
      });
    } catch (err: any) {
      toast.error(err?.message || 'Stats load failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-black mb-1">Dashboard</h1>
          <p className="text-[13px] text-white/60">Live platform metrics.</p>
        </div>
        <button
          onClick={load}
          className="text-[12px] font-bold text-white/60 hover:text-white flex items-center gap-1"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Active Challenge" value={stats?.activeWeek || 'None'} accent="gold" />
        <StatCard label="Total Weeks" value={stats?.weeks ?? 0} accent="purple" />
        <StatCard label="Submissions" value={stats?.submissions ?? 0} accent="green" />
        <StatCard label="Unique Creators" value={stats?.creators ?? 0} accent="pink" />
        <StatCard label="Submission Likes" value={stats?.likes ?? 0} accent="pink" />
        <StatCard label="Episode Comments" value={stats?.comments ?? 0} accent="purple" />
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent: 'gold' | 'purple' | 'green' | 'pink';
}) {
  const bar = {
    gold: 'from-[var(--gold)] to-[var(--orange)]',
    purple: 'from-[#7c3aed] to-[var(--pink)]',
    green: 'from-[var(--green)] to-[var(--blue)]',
    pink: 'from-[var(--pink)] to-[var(--purple)]',
  }[accent];
  return (
    <div className="bg-[#12121e] border border-white/10 rounded-xl p-5 relative overflow-hidden">
      <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${bar}`} />
      <div className="text-[11px] font-bold text-white/50 mb-2">{label}</div>
      <div className="font-heading font-black text-2xl truncate">{value}</div>
    </div>
  );
}

function WeeksTab() {
  const [weeks, setWeeks] = useState<WeekRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState('');
  const [prize, setPrize] = useState(500);
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('weeks')
      .select('*')
      .order('starts_at', { ascending: false });
    if (!error) setWeeks((data as WeekRow[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!theme.trim()) return;
    setBusy(true);
    try {
      await supabase.from('weeks').update({ is_active: false }).eq('is_active', true);
      const ends = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
      const { error } = await supabase.from('weeks').insert({
        theme: theme.trim(),
        prize_cents: prize * 100,
        ends_at: ends,
        is_active: true,
      });
      if (error) throw error;
      toast.success('Week created and activated');
      setTheme('');
      load();
    } catch (err: any) {
      toast.error(err?.message || 'Could not create week');
    } finally {
      setBusy(false);
    }
  };

  const setActive = async (id: string, value: boolean) => {
    if (value) {
      await supabase.from('weeks').update({ is_active: false }).eq('is_active', true);
    }
    const { error } = await supabase.from('weeks').update({ is_active: value }).eq('id', id);
    if (error) toast.error(error.message);
    else load();
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this week and all its submissions?')) return;
    const { error } = await supabase.from('weeks').delete().eq('id', id);
    if (error) toast.error(error.message);
    else load();
  };

  return (
    <div>
      <h1 className="text-2xl font-heading font-black mb-1">Weeks</h1>
      <p className="text-[13px] text-white/60 mb-6">Create and manage challenge cycles.</p>

      <form onSubmit={create} className="bg-[#12121e] border border-white/10 rounded-xl p-5 mb-8 grid grid-cols-1 md:grid-cols-[1fr,120px,120px,auto] gap-3 items-end">
        <div>
          <label className="text-[11px] font-bold text-white/50 mb-1 block">Theme</label>
          <input
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            placeholder="Best Fight Scene Reaction"
            className="w-full bg-[#080810] border border-white/10 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-[#7c3aed]"
          />
        </div>
        <div>
          <label className="text-[11px] font-bold text-white/50 mb-1 block">Prize ($)</label>
          <input
            type="number"
            min={0}
            value={prize}
            onChange={(e) => setPrize(parseInt(e.target.value || '0', 10))}
            className="w-full bg-[#080810] border border-white/10 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-[#7c3aed]"
          />
        </div>
        <div>
          <label className="text-[11px] font-bold text-white/50 mb-1 block">Days</label>
          <input
            type="number"
            min={1}
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value || '1', 10))}
            className="w-full bg-[#080810] border border-white/10 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-[#7c3aed]"
          />
        </div>
        <button
          type="submit"
          disabled={busy || !theme.trim()}
          className="bg-gradient-to-r from-[var(--pink)] to-[#7c3aed] px-5 py-2 rounded-lg text-[13px] font-bold flex items-center gap-2 disabled:opacity-50"
        >
          <Plus className="w-4 h-4" /> Create
        </button>
      </form>

      {loading ? (
        <div className="text-white/50 text-[13px]">Loading…</div>
      ) : weeks.length === 0 ? (
        <div className="text-white/50 text-[13px]">No weeks yet.</div>
      ) : (
        <div className="space-y-2">
          {weeks.map((w) => (
            <div
              key={w.id}
              className="bg-[#12121e] border border-white/10 rounded-xl p-4 flex items-center gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="font-heading font-black text-[15px] truncate">{w.theme}</div>
                <div className="text-[11px] text-white/50 mt-1">
                  ${(w.prize_cents / 100).toLocaleString()} · ends {new Date(w.ends_at).toLocaleDateString()}
                </div>
              </div>
              {w.is_active ? (
                <span className="text-[10px] font-black uppercase tracking-widest text-[var(--pink)] bg-[var(--pink)]/10 px-2 py-1 rounded">
                  Active
                </span>
              ) : (
                <button
                  onClick={() => setActive(w.id, true)}
                  className="text-[11px] font-bold text-white/60 hover:text-white"
                >
                  Set Active
                </button>
              )}
              <button
                onClick={() => remove(w.id)}
                className="text-white/40 hover:text-red-400 p-1"
                title="Delete"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SubmissionsTab() {
  const [rows, setRows] = useState<SubRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('submissions')
      .select('id, username, user_id, caption, video_url, created_at, weeks(theme)')
      .order('created_at', { ascending: false })
      .limit(100);
    setRows(
      ((data || []) as any[]).map((r) => ({
        id: r.id,
        username: r.username,
        user_id: r.user_id,
        caption: r.caption,
        video_url: r.video_url,
        created_at: r.created_at,
        week_theme: r.weeks?.theme || null,
      }))
    );
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, []);

  const remove = async (id: string) => {
    if (!confirm('Delete this submission?')) return;
    const { error } = await supabase.from('submissions').delete().eq('id', id);
    if (error) toast.error(error.message);
    else setRows((prev) => prev.filter((r) => r.id !== id));
  };

  return (
    <div>
      <h1 className="text-2xl font-heading font-black mb-1">Submissions</h1>
      <p className="text-[13px] text-white/60 mb-6">Most recent 100. Delete is permanent.</p>

      {loading ? (
        <div className="text-white/50 text-[13px]">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-white/50 text-[13px]">No submissions yet.</div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div
              key={r.id}
              className="bg-[#12121e] border border-white/10 rounded-xl p-4 flex items-center gap-4"
            >
              <Video className="w-8 h-8 text-[#7c3aed] shrink-0" />
              <div className="flex-1 min-w-0">
                <Link
                  href={`/creator/${r.username || r.user_id}`}
                  className="text-[13px] font-bold text-white hover:text-[var(--pink)]"
                >
                  @{r.username || 'creator'}
                </Link>
                <div className="text-[11px] text-white/50 mt-0.5">
                  {r.week_theme || 'Unknown week'} · {new Date(r.created_at).toLocaleString()}
                </div>
                {r.caption && (
                  <div className="text-[12px] text-white/70 mt-1 line-clamp-1">{r.caption}</div>
                )}
              </div>
              <a
                href={r.video_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] font-bold text-white/60 hover:text-white"
              >
                View
              </a>
              <button
                onClick={() => remove(r.id)}
                className="text-white/40 hover:text-red-400 p-1"
                title="Delete"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CommentsTab() {
  const [rows, setRows] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('episode_comments')
      .select('id, username, body, created_at, mal_id, ep_id')
      .order('created_at', { ascending: false })
      .limit(100);
    setRows((data as CommentRow[]) || []);
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, []);

  const remove = async (id: string) => {
    if (!confirm('Delete this comment?')) return;
    const { error } = await supabase.from('episode_comments').delete().eq('id', id);
    if (error) toast.error(error.message);
    else setRows((prev) => prev.filter((r) => r.id !== id));
  };

  return (
    <div>
      <h1 className="text-2xl font-heading font-black mb-1">Comments</h1>
      <p className="text-[13px] text-white/60 mb-6">Moderate episode comments.</p>

      {loading ? (
        <div className="text-white/50 text-[13px]">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-white/50 text-[13px]">No comments yet.</div>
      ) : (
        <div className="space-y-2">
          {rows.map((c) => (
            <div
              key={c.id}
              className="bg-[#12121e] border border-white/10 rounded-xl p-4 flex items-start gap-3"
            >
              <MessageSquare className="w-5 h-5 text-[#7c3aed] mt-1 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-bold text-white">
                  @{c.username || 'anon'}
                  <span className="text-white/40 font-normal ml-2">
                    on{' '}
                    <Link
                      href={`/watch/${c.mal_id}/${c.ep_id}`}
                      className="hover:text-[var(--pink)]"
                    >
                      ep {c.ep_id} of #{c.mal_id}
                    </Link>{' '}
                    · {new Date(c.created_at).toLocaleString()}
                  </span>
                </div>
                <div className="text-[13px] text-white/80 mt-1 whitespace-pre-wrap break-words">
                  {c.body}
                </div>
              </div>
              <button
                onClick={() => remove(c.id)}
                className="text-white/40 hover:text-red-400 p-1"
                title="Delete"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
