import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin';
import { supabase } from '@/lib/supabase';
import {
  LayoutDashboard, Film, Play, MessageSquare, Users, Trophy,
  Calendar, Settings, Plus, Trash2, Edit3, Save, X, Search,
  RefreshCw, ChevronDown, ChevronUp, Shield, Eye, EyeOff,
  CheckCircle2, AlertTriangle, BarChart2, Globe, Loader2
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────
interface AnimeRow       { id: number; mal_id: number; title: string; created_at: string; }
interface EpisodeRow     { id: number; anime_id: number; episode_number: number; intro_start: number | null; intro_end: number | null; }
interface EmbedSourceRow { id: number; episode_id: number; source_name: string; embed_url: string; language: string; quality: string; is_active: boolean; download_url: string | null; }
interface CommentRow     { id: number; mal_id: number; ep_id: number; user_id: string; username: string; content: string; created_at: string; }
interface ChatRow        { id: number; user_id: string; username: string; message: string; created_at: string; }
interface SubmissionRow  { id: number; user_id: string; username: string; caption: string; video_url: string; created_at: string; }
interface WeekRow        { id: number; theme: string; start_date: string; end_date: string; is_active: boolean; }

type Tab = 'dashboard' | 'anime' | 'episodes' | 'embeds' | 'comments' | 'community' | 'submissions' | 'weeks' | 'settings';

// ── Helpers ───────────────────────────────────────────────────────
function timeAgo(ts: string) {
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60)  return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  if (s < 86400) return `${Math.floor(s/3600)}h ago`;
  return `${Math.floor(s/86400)}d ago`;
}

function Badge({ label, color }: { label: string; color: string }) {
  return <span className="text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider" style={{ background: color + '22', color }}>{label}</span>;
}

function StatCard({ icon: Icon, label, value, color, sub }: { icon: any; label: string; value: string | number; color: string; sub?: string }) {
  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 flex items-center gap-4">
      <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: color + '20' }}>
        <Icon className="w-5 h-5" style={{ color }} />
      </div>
      <div>
        <p className="text-[22px] font-black text-white leading-none">{value}</p>
        <p className="text-[11px] text-[var(--text3)] mt-0.5">{label}</p>
        {sub && <p className="text-[10px] font-bold mt-0.5" style={{ color }}>{sub}</p>}
      </div>
    </div>
  );
}

// ── Input / Textarea helpers ──────────────────────────────────────
const inputCls = "w-full bg-[var(--bg3)] border border-[var(--border)] rounded-xl px-3 py-2 text-[13px] text-white placeholder:text-[var(--text3)] focus:outline-none focus:border-[var(--purple)] transition-colors";

// ── Main Admin Component ──────────────────────────────────────────
export default function Admin() {
  const [, navigate] = useLocation();
  const { user, loading } = useAuth();
  const [tab, setTab]     = useState<Tab>('dashboard');
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // Redirect if not admin
  useEffect(() => {
    if (!loading && !isAdminEmail(user?.email)) navigate('/');
  }, [user, loading]);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <Loader2 className="w-8 h-8 text-[var(--purple)] animate-spin" />
    </div>
  );
  if (!isAdminEmail(user?.email)) return null;

  const NAV: { id: Tab; icon: any; label: string }[] = [
    { id: 'dashboard',   icon: LayoutDashboard, label: 'Dashboard'   },
    { id: 'anime',       icon: Film,            label: 'Anime'        },
    { id: 'episodes',    icon: Play,            label: 'Episodes'     },
    { id: 'embeds',      icon: Globe,           label: 'Embed Sources'},
    { id: 'comments',    icon: MessageSquare,   label: 'Comments'     },
    { id: 'community',   icon: Users,           label: 'Community'    },
    { id: 'submissions', icon: Trophy,          label: 'Submissions'  },
    { id: 'weeks',       icon: Calendar,        label: 'Weekly Picks' },
    { id: 'settings',    icon: Settings,        label: 'Settings'     },
  ];

  return (
    <div className="flex h-[calc(100vh-60px)] overflow-hidden bg-[var(--bg)]">

      {/* ── Sidebar ── */}
      <div className="w-52 bg-[var(--bg2)] border-r border-[var(--border)] flex flex-col shrink-0 overflow-y-auto">
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-[var(--purple)]" />
            <span className="text-[12px] font-black text-[var(--purple)] uppercase tracking-widest">Admin Panel</span>
          </div>
          <p className="text-[10px] text-[var(--text3)] mt-0.5 truncate">{user?.email}</p>
        </div>
        <nav className="flex-1 p-2 space-y-0.5">
          {NAV.map(({ id, icon: Icon, label }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12px] font-bold transition-all ${
                tab === id
                  ? 'bg-[var(--purple)]/15 text-[var(--purple)] border border-[var(--purple)]/30'
                  : 'text-[var(--text3)] hover:text-white hover:bg-white/5'
              }`}>
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* ── Main ── */}
      <div className="flex-1 overflow-y-auto">
        {/* Toast */}
        {toast && (
          <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-2xl text-[13px] font-bold text-white ${toast.ok ? 'bg-[var(--green)]' : 'bg-red-500'}`}>
            {toast.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            {toast.msg}
          </div>
        )}

        <div className="p-6 max-w-6xl mx-auto">
          {tab === 'dashboard'   && <Dashboard />}
          {tab === 'anime'       && <AnimeManager toast={showToast} />}
          {tab === 'episodes'    && <EpisodesManager toast={showToast} />}
          {tab === 'embeds'      && <EmbedsManager toast={showToast} />}
          {tab === 'comments'    && <CommentsManager toast={showToast} />}
          {tab === 'community'   && <CommunityManager toast={showToast} />}
          {tab === 'submissions' && <SubmissionsManager toast={showToast} />}
          {tab === 'weeks'       && <WeeksManager toast={showToast} />}
          {tab === 'settings'    && <SiteSettings toast={showToast} />}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════════════════
function Dashboard() {
  const [stats, setStats] = useState({ anime: 0, episodes: 0, embeds: 0, comments: 0, chat: 0, submissions: 0 });
  const [loading, setLoading] = useState(true);
  const [recentComments, setRecentComments] = useState<CommentRow[]>([]);

  useEffect(() => {
    async function load() {
      const [anime, episodes, embeds, comments, chat, submissions, recentC] = await Promise.all([
        supabase.from('anime').select('id', { count: 'exact', head: true }),
        supabase.from('episodes').select('id', { count: 'exact', head: true }),
        supabase.from('embed_sources').select('id', { count: 'exact', head: true }),
        supabase.from('episode_comments').select('id', { count: 'exact', head: true }),
        supabase.from('community_chat').select('id', { count: 'exact', head: true }),
        supabase.from('submissions').select('id', { count: 'exact', head: true }),
        supabase.from('episode_comments').select('*').order('created_at', { ascending: false }).limit(5),
      ]);
      setStats({
        anime:       anime.count || 0,
        episodes:    episodes.count || 0,
        embeds:      embeds.count || 0,
        comments:    comments.count || 0,
        chat:        chat.count || 0,
        submissions: submissions.count || 0,
      });
      setRecentComments(recentC.data || []);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <div className="flex justify-center pt-20"><Loader2 className="w-6 h-6 text-[var(--purple)] animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <h1 className="text-[22px] font-heading font-black text-white">Dashboard</h1>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard icon={Film}          label="Anime in DB"    value={stats.anime}       color="var(--pink)"   />
        <StatCard icon={Play}          label="Episodes"       value={stats.episodes}    color="var(--blue)"   />
        <StatCard icon={Globe}         label="Embed Sources"  value={stats.embeds}      color="var(--purple)" />
        <StatCard icon={MessageSquare} label="Comments"       value={stats.comments}    color="var(--gold)"   />
        <StatCard icon={Users}         label="Chat Messages"  value={stats.chat}        color="var(--green)"  />
        <StatCard icon={Trophy}        label="Submissions"    value={stats.submissions} color="var(--orange, #ff6b35)" />
      </div>

      {recentComments.length > 0 && (
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-[var(--border)]">
            <h2 className="text-[13px] font-black text-white">Recent Comments</h2>
          </div>
          <div className="divide-y divide-[var(--border)]">
            {recentComments.map(c => (
              <div key={c.id} className="px-5 py-3 flex items-start gap-3">
                <div className="w-7 h-7 bg-[var(--purple)]/20 rounded-full flex items-center justify-center shrink-0 text-[11px] font-black text-[var(--purple)]">
                  {(c.username || 'U')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[11px] font-black text-white">{c.username || 'Unknown'}</span>
                    <span className="text-[10px] text-[var(--text3)]">EP {c.ep_id}</span>
                    <span className="text-[10px] text-[var(--text3)] ml-auto">{timeAgo(c.created_at)}</span>
                  </div>
                  <p className="text-[12px] text-[var(--text2)] truncate">{c.content}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// ANIME MANAGER
// ══════════════════════════════════════════════════════════════════
function AnimeManager({ toast }: { toast: (m: string, ok?: boolean) => void }) {
  const [rows, setRows]       = useState<AnimeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [malId, setMalId]     = useState('');
  const [title, setTitle]     = useState('');
  const [saving, setSaving]   = useState(false);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('anime').select('*').order('created_at', { ascending: false }).limit(100);
    setRows(data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function addAnime() {
    if (!malId || !title) return;
    setSaving(true);
    const { error } = await supabase.from('anime').insert({ mal_id: parseInt(malId), title });
    if (error) toast(error.message, false);
    else { toast('Anime added!'); setMalId(''); setTitle(''); load(); }
    setSaving(false);
  }

  async function deleteAnime(id: number) {
    if (!confirm('Delete this anime and all its episodes/embeds?')) return;
    const { error } = await supabase.from('anime').delete().eq('id', id);
    if (error) toast(error.message, false);
    else { toast('Deleted'); load(); }
  }

  const filtered = rows.filter(r => r.title.toLowerCase().includes(search.toLowerCase()) || String(r.mal_id).includes(search));

  return (
    <div className="space-y-5">
      <h1 className="text-[22px] font-heading font-black text-white">Anime Manager</h1>

      {/* Add form */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5">
        <h2 className="text-[13px] font-black text-white mb-4 flex items-center gap-2"><Plus className="w-4 h-4 text-[var(--purple)]" /> Add Anime</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input className={inputCls} placeholder="MAL ID (e.g. 21)" value={malId} onChange={e => setMalId(e.target.value)} type="number" />
          <input className={`${inputCls} sm:col-span-2`} placeholder="Title (e.g. One Piece)" value={title} onChange={e => setTitle(e.target.value)} />
        </div>
        <button onClick={addAnime} disabled={saving || !malId || !title}
          className="mt-3 flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[var(--purple)] to-[var(--pink)] text-white text-[12px] font-black rounded-xl hover:brightness-110 transition-all disabled:opacity-50">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Add Anime
        </button>
      </div>

      {/* List */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--border)] flex items-center gap-3">
          <Search className="w-4 h-4 text-[var(--text3)]" />
          <input className="flex-1 bg-transparent text-[13px] text-white placeholder:text-[var(--text3)] outline-none" placeholder="Search anime…" value={search} onChange={e => setSearch(e.target.value)} />
          <button onClick={load}><RefreshCw className="w-4 h-4 text-[var(--text3)] hover:text-white transition-colors" /></button>
        </div>
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 text-[var(--purple)] animate-spin" /></div>
        ) : (
          <div className="divide-y divide-[var(--border)] max-h-[500px] overflow-y-auto">
            {filtered.map(r => (
              <div key={r.id} className="flex items-center gap-3 px-5 py-3 hover:bg-[var(--bg3)] transition-colors group">
                <Badge label={`MAL ${r.mal_id}`} color="var(--purple)" />
                <span className="flex-1 text-[13px] font-bold text-white truncate">{r.title}</span>
                <span className="text-[10px] text-[var(--text3)]">{timeAgo(r.created_at)}</span>
                <button onClick={() => deleteAnime(r.id)} className="opacity-0 group-hover:opacity-100 p-1 text-red-400 hover:text-red-300 transition-all">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            {!filtered.length && <div className="py-10 text-center text-[13px] text-[var(--text3)]">No anime found</div>}
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// EPISODES MANAGER
// ══════════════════════════════════════════════════════════════════
function EpisodesManager({ toast }: { toast: (m: string, ok?: boolean) => void }) {
  const [anime, setAnime]         = useState<AnimeRow[]>([]);
  const [selectedAnime, setSelectedAnime] = useState('');
  const [episodes, setEpisodes]   = useState<EpisodeRow[]>([]);
  const [loading, setLoading]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [form, setForm]           = useState({ episode_number: '', intro_start: '', intro_end: '' });

  useEffect(() => {
    supabase.from('anime').select('id, mal_id, title').order('title').then(({ data }) => setAnime(data || []));
  }, []);

  async function loadEpisodes(animeId: string) {
    setSelectedAnime(animeId);
    if (!animeId) return;
    setLoading(true);
    const { data } = await supabase.from('episodes').select('*').eq('anime_id', animeId).order('episode_number');
    setEpisodes(data || []);
    setLoading(false);
  }

  async function addEpisode() {
    if (!selectedAnime || !form.episode_number) return;
    setSaving(true);
    const payload = {
      anime_id:       parseInt(selectedAnime),
      episode_number: parseInt(form.episode_number),
      intro_start:    form.intro_start ? parseInt(form.intro_start) : null,
      intro_end:      form.intro_end   ? parseInt(form.intro_end)   : null,
    };
    const { error } = await supabase.from('episodes').upsert(payload, { onConflict: 'anime_id,episode_number' });
    if (error) toast(error.message, false);
    else { toast('Episode saved!'); setForm({ episode_number: '', intro_start: '', intro_end: '' }); loadEpisodes(selectedAnime); }
    setSaving(false);
  }

  async function deleteEpisode(id: number) {
    await supabase.from('episodes').delete().eq('id', id);
    toast('Deleted'); loadEpisodes(selectedAnime);
  }

  async function updateIntro(ep: EpisodeRow, field: 'intro_start' | 'intro_end', val: string) {
    await supabase.from('episodes').update({ [field]: val ? parseInt(val) : null }).eq('id', ep.id);
    toast('Updated!'); loadEpisodes(selectedAnime);
  }

  return (
    <div className="space-y-5">
      <h1 className="text-[22px] font-heading font-black text-white">Episodes Manager</h1>

      {/* Anime selector */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5">
        <label className="block text-[11px] font-black text-[var(--text3)] uppercase tracking-widest mb-2">Select Anime</label>
        <select className={inputCls} value={selectedAnime} onChange={e => loadEpisodes(e.target.value)}>
          <option value="">-- Choose anime --</option>
          {anime.map(a => <option key={a.id} value={a.id}>{a.title} (MAL {a.mal_id})</option>)}
        </select>
      </div>

      {selectedAnime && (
        <>
          {/* Add episode */}
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5">
            <h2 className="text-[13px] font-black text-white mb-4 flex items-center gap-2"><Plus className="w-4 h-4 text-[var(--purple)]" /> Add / Update Episode</h2>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] font-black text-[var(--text3)] uppercase tracking-widest mb-1.5">Episode #</label>
                <input className={inputCls} type="number" placeholder="1" value={form.episode_number} onChange={e => setForm(f => ({ ...f, episode_number: e.target.value }))} />
              </div>
              <div>
                <label className="block text-[10px] font-black text-[var(--text3)] uppercase tracking-widest mb-1.5">Intro Start (sec)</label>
                <input className={inputCls} type="number" placeholder="e.g. 20" value={form.intro_start} onChange={e => setForm(f => ({ ...f, intro_start: e.target.value }))} />
              </div>
              <div>
                <label className="block text-[10px] font-black text-[var(--text3)] uppercase tracking-widest mb-1.5">Intro End (sec)</label>
                <input className={inputCls} type="number" placeholder="e.g. 90" value={form.intro_end} onChange={e => setForm(f => ({ ...f, intro_end: e.target.value }))} />
              </div>
            </div>
            <button onClick={addEpisode} disabled={saving || !form.episode_number}
              className="mt-3 flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[var(--purple)] to-[var(--pink)] text-white text-[12px] font-black rounded-xl hover:brightness-110 transition-all disabled:opacity-50">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save Episode
            </button>
          </div>

          {/* Episode list */}
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-[var(--border)]">
              <h2 className="text-[13px] font-black text-white">{episodes.length} Episodes</h2>
            </div>
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 text-[var(--purple)] animate-spin" /></div>
            ) : (
              <div className="divide-y divide-[var(--border)] max-h-[400px] overflow-y-auto">
                {episodes.map(ep => (
                  <div key={ep.id} className="flex items-center gap-4 px-5 py-3 hover:bg-[var(--bg3)] group">
                    <Badge label={`EP ${ep.episode_number}`} color="var(--blue)" />
                    <div className="flex items-center gap-2 text-[11px] text-[var(--text3)]">
                      <span>Intro: {ep.intro_start ?? '—'}s → {ep.intro_end ?? '—'}s</span>
                    </div>
                    <div className="ml-auto flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                      <button onClick={() => deleteEpisode(ep.id)} className="p-1 text-red-400 hover:text-red-300">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
                {!episodes.length && <div className="py-8 text-center text-[13px] text-[var(--text3)]">No episodes yet</div>}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// EMBED SOURCES MANAGER
// ══════════════════════════════════════════════════════════════════
function EmbedsManager({ toast }: { toast: (m: string, ok?: boolean) => void }) {
  const [anime, setAnime]         = useState<AnimeRow[]>([]);
  const [selectedAnime, setSelectedAnime] = useState('');
  const [episodes, setEpisodes]   = useState<EpisodeRow[]>([]);
  const [embeds, setEmbeds]       = useState<EmbedSourceRow[]>([]);
  const [loading, setLoading]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [form, setForm]           = useState({ episode_id: '', source_name: '', embed_url: '', language: 'sub', quality: 'HD', download_url: '', is_active: true });

  useEffect(() => {
    supabase.from('anime').select('id, mal_id, title').order('title').then(({ data }) => setAnime(data || []));
  }, []);

  async function loadByAnime(animeId: string) {
    setSelectedAnime(animeId);
    if (!animeId) return;
    setLoading(true);
    const { data: eps } = await supabase.from('episodes').select('*').eq('anime_id', animeId).order('episode_number');
    setEpisodes(eps || []);
    if (eps?.length) {
      const epIds = eps.map(e => e.id);
      const { data: srcs } = await supabase.from('embed_sources').select('*').in('episode_id', epIds).order('episode_id');
      setEmbeds(srcs || []);
    } else setEmbeds([]);
    setLoading(false);
  }

  async function addEmbed() {
    if (!form.episode_id || !form.embed_url || !form.source_name) return;
    setSaving(true);
    const { error } = await supabase.from('embed_sources').insert({
      episode_id:   parseInt(form.episode_id),
      source_name:  form.source_name,
      embed_url:    form.embed_url,
      language:     form.language,
      quality:      form.quality,
      download_url: form.download_url || null,
      is_active:    form.is_active,
    });
    if (error) toast(error.message, false);
    else { toast('Embed source added!'); setForm(f => ({ ...f, embed_url: '', download_url: '', source_name: '' })); loadByAnime(selectedAnime); }
    setSaving(false);
  }

  async function toggleActive(id: number, current: boolean) {
    await supabase.from('embed_sources').update({ is_active: !current }).eq('id', id);
    toast(!current ? 'Activated' : 'Deactivated'); loadByAnime(selectedAnime);
  }

  async function deleteEmbed(id: number) {
    await supabase.from('embed_sources').delete().eq('id', id);
    toast('Deleted'); loadByAnime(selectedAnime);
  }

  const epName = (epId: number) => { const ep = episodes.find(e => e.id === epId); return ep ? `EP ${ep.episode_number}` : `#${epId}`; };

  return (
    <div className="space-y-5">
      <h1 className="text-[22px] font-heading font-black text-white">Embed Sources</h1>
      <p className="text-[12px] text-[var(--text3)]">These are Priority 1 sources — they load before OniChan/Otaku on the watch page.</p>

      {/* Anime selector */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5">
        <label className="block text-[11px] font-black text-[var(--text3)] uppercase tracking-widest mb-2">Select Anime</label>
        <select className={inputCls} value={selectedAnime} onChange={e => loadByAnime(e.target.value)}>
          <option value="">-- Choose anime --</option>
          {anime.map(a => <option key={a.id} value={a.id}>{a.title} (MAL {a.mal_id})</option>)}
        </select>
      </div>

      {selectedAnime && episodes.length > 0 && (
        <>
          {/* Add form */}
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5">
            <h2 className="text-[13px] font-black text-white mb-4 flex items-center gap-2"><Plus className="w-4 h-4 text-[var(--purple)]" /> Add Embed Source</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] font-black text-[var(--text3)] uppercase tracking-widest mb-1.5">Episode</label>
                <select className={inputCls} value={form.episode_id} onChange={e => setForm(f => ({ ...f, episode_id: e.target.value }))}>
                  <option value="">-- Episode --</option>
                  {episodes.map(e => <option key={e.id} value={e.id}>EP {e.episode_number}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black text-[var(--text3)] uppercase tracking-widest mb-1.5">Server Name</label>
                <input className={inputCls} placeholder="e.g. MyServer1" value={form.source_name} onChange={e => setForm(f => ({ ...f, source_name: e.target.value }))} />
              </div>
              <div>
                <label className="block text-[10px] font-black text-[var(--text3)] uppercase tracking-widest mb-1.5">Language</label>
                <select className={inputCls} value={form.language} onChange={e => setForm(f => ({ ...f, language: e.target.value }))}>
                  <option value="sub">SUB</option>
                  <option value="dub">DUB</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black text-[var(--text3)] uppercase tracking-widest mb-1.5">Quality</label>
                <select className={inputCls} value={form.quality} onChange={e => setForm(f => ({ ...f, quality: e.target.value }))}>
                  {['HD','FHD','4K','SD'].map(q => <option key={q}>{q}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[10px] font-black text-[var(--text3)] uppercase tracking-widest mb-1.5">Embed URL</label>
                <input className={inputCls} placeholder="https://..." value={form.embed_url} onChange={e => setForm(f => ({ ...f, embed_url: e.target.value }))} />
              </div>
              <div className="sm:col-span-3">
                <label className="block text-[10px] font-black text-[var(--text3)] uppercase tracking-widest mb-1.5">Download URL (optional)</label>
                <input className={inputCls} placeholder="https://..." value={form.download_url} onChange={e => setForm(f => ({ ...f, download_url: e.target.value }))} />
              </div>
            </div>
            <div className="flex items-center gap-3 mt-3">
              <button onClick={addEmbed} disabled={saving || !form.episode_id || !form.embed_url}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[var(--purple)] to-[var(--pink)] text-white text-[12px] font-black rounded-xl hover:brightness-110 transition-all disabled:opacity-50">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Add Source
              </button>
              <label className="flex items-center gap-2 text-[12px] font-bold text-[var(--text2)] cursor-pointer">
                <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} className="rounded" />
                Active immediately
              </label>
            </div>
          </div>

          {/* Embeds list */}
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-[var(--border)]">
              <h2 className="text-[13px] font-black text-white">{embeds.length} Embed Sources</h2>
            </div>
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 text-[var(--purple)] animate-spin" /></div>
            ) : (
              <div className="divide-y divide-[var(--border)] max-h-[500px] overflow-y-auto">
                {embeds.map(e => (
                  <div key={e.id} className="flex items-center gap-3 px-5 py-3 hover:bg-[var(--bg3)] group">
                    <Badge label={epName(e.episode_id)} color="var(--blue)" />
                    <Badge label={e.language.toUpperCase()} color={e.language === 'dub' ? 'var(--gold)' : 'var(--green)'} />
                    <Badge label={e.quality} color="var(--purple)" />
                    <span className="flex-1 text-[12px] font-bold text-white truncate">{e.source_name}</span>
                    <span className="text-[10px] text-[var(--text3)] max-w-[140px] truncate">{e.embed_url}</span>
                    <button onClick={() => toggleActive(e.id, e.is_active)} title={e.is_active ? 'Deactivate' : 'Activate'}
                      className={`p-1 transition-colors ${e.is_active ? 'text-[var(--green)]' : 'text-[var(--text3)]'}`}>
                      {e.is_active ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    </button>
                    <button onClick={() => deleteEmbed(e.id)} className="p-1 text-red-400 hover:text-red-300 opacity-0 group-hover:opacity-100 transition-all">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                {!embeds.length && <div className="py-8 text-center text-[13px] text-[var(--text3)]">No embed sources yet</div>}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// COMMENTS MANAGER
// ══════════════════════════════════════════════════════════════════
function CommentsManager({ toast }: { toast: (m: string, ok?: boolean) => void }) {
  const [rows, setRows]       = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('episode_comments').select('*').order('created_at', { ascending: false }).limit(200);
    setRows(data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function deleteComment(id: number) {
    await supabase.from('episode_comments').delete().eq('id', id);
    toast('Comment deleted'); setRows(r => r.filter(c => c.id !== id));
  }

  const filtered = rows.filter(r =>
    r.content?.toLowerCase().includes(search.toLowerCase()) ||
    r.username?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5">
      <h1 className="text-[22px] font-heading font-black text-white">Comments Moderation</h1>
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--border)] flex items-center gap-3">
          <Search className="w-4 h-4 text-[var(--text3)]" />
          <input className="flex-1 bg-transparent text-[13px] text-white placeholder:text-[var(--text3)] outline-none" placeholder="Search comments…" value={search} onChange={e => setSearch(e.target.value)} />
          <button onClick={load}><RefreshCw className="w-4 h-4 text-[var(--text3)] hover:text-white transition-colors" /></button>
        </div>
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 text-[var(--purple)] animate-spin" /></div>
        ) : (
          <div className="divide-y divide-[var(--border)] max-h-[600px] overflow-y-auto">
            {filtered.map(c => (
              <div key={c.id} className="flex items-start gap-3 px-5 py-3 hover:bg-[var(--bg3)] group">
                <div className="w-8 h-8 bg-[var(--purple)]/20 rounded-full flex items-center justify-center shrink-0 text-[11px] font-black text-[var(--purple)]">
                  {(c.username || 'U')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="text-[12px] font-black text-white">{c.username || 'Unknown'}</span>
                    <Badge label={`MAL ${c.mal_id}`} color="var(--blue)" />
                    <Badge label={`EP ${c.ep_id}`} color="var(--purple)" />
                    <span className="text-[10px] text-[var(--text3)] ml-auto">{timeAgo(c.created_at)}</span>
                  </div>
                  <p className="text-[12px] text-[var(--text2)]">{c.content}</p>
                </div>
                <button onClick={() => deleteComment(c.id)} className="p-1 text-red-400 hover:text-red-300 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            {!filtered.length && <div className="py-10 text-center text-[13px] text-[var(--text3)]">No comments found</div>}
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// COMMUNITY CHAT MANAGER
// ══════════════════════════════════════════════════════════════════
function CommunityManager({ toast }: { toast: (m: string, ok?: boolean) => void }) {
  const [rows, setRows]       = useState<ChatRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('community_chat').select('*').order('created_at', { ascending: false }).limit(200);
    setRows(data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function deleteMsg(id: number) {
    await supabase.from('community_chat').delete().eq('id', id);
    toast('Message deleted'); setRows(r => r.filter(m => m.id !== id));
  }

  const filtered = rows.filter(r =>
    r.message?.toLowerCase().includes(search.toLowerCase()) ||
    r.username?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5">
      <h1 className="text-[22px] font-heading font-black text-white">Community Chat Moderation</h1>
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--border)] flex items-center gap-3">
          <Search className="w-4 h-4 text-[var(--text3)]" />
          <input className="flex-1 bg-transparent text-[13px] text-white placeholder:text-[var(--text3)] outline-none" placeholder="Search messages…" value={search} onChange={e => setSearch(e.target.value)} />
          <button onClick={load}><RefreshCw className="w-4 h-4 text-[var(--text3)] hover:text-white transition-colors" /></button>
        </div>
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 text-[var(--purple)] animate-spin" /></div>
        ) : (
          <div className="divide-y divide-[var(--border)] max-h-[600px] overflow-y-auto">
            {filtered.map(m => (
              <div key={m.id} className="flex items-start gap-3 px-5 py-3 hover:bg-[var(--bg3)] group">
                <div className="w-8 h-8 bg-[var(--blue)]/20 rounded-full flex items-center justify-center shrink-0 text-[11px] font-black text-[var(--blue)]">
                  {(m.username || 'U')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[12px] font-black text-white">{m.username || 'Unknown'}</span>
                    <span className="text-[10px] text-[var(--text3)] ml-auto">{timeAgo(m.created_at)}</span>
                  </div>
                  <p className="text-[12px] text-[var(--text2)]">{m.message}</p>
                </div>
                <button onClick={() => deleteMsg(m.id)} className="p-1 text-red-400 hover:text-red-300 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            {!filtered.length && <div className="py-10 text-center text-[13px] text-[var(--text3)]">No messages found</div>}
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// SUBMISSIONS MANAGER
// ══════════════════════════════════════════════════════════════════
function SubmissionsManager({ toast }: { toast: (m: string, ok?: boolean) => void }) {
  const [rows, setRows]       = useState<SubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('submissions').select('*').order('created_at', { ascending: false }).limit(100);
    setRows(data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function deleteSubmission(id: number) {
    await supabase.from('submissions').delete().eq('id', id);
    toast('Submission deleted'); setRows(r => r.filter(s => s.id !== id));
  }

  return (
    <div className="space-y-5">
      <h1 className="text-[22px] font-heading font-black text-white">Submissions</h1>
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--border)] flex items-center justify-between">
          <h2 className="text-[13px] font-black text-white">{rows.length} Submissions</h2>
          <button onClick={load}><RefreshCw className="w-4 h-4 text-[var(--text3)] hover:text-white transition-colors" /></button>
        </div>
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 text-[var(--purple)] animate-spin" /></div>
        ) : (
          <div className="divide-y divide-[var(--border)] max-h-[600px] overflow-y-auto">
            {rows.map(s => (
              <div key={s.id} className="flex items-start gap-3 px-5 py-4 hover:bg-[var(--bg3)] group">
                <div className="w-8 h-8 bg-[var(--gold)]/20 rounded-full flex items-center justify-center shrink-0 text-[11px] font-black text-[var(--gold)]">
                  {(s.username || 'U')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[12px] font-black text-white">{s.username || 'Unknown'}</span>
                    <span className="text-[10px] text-[var(--text3)] ml-auto">{timeAgo(s.created_at)}</span>
                  </div>
                  <p className="text-[12px] text-[var(--text2)] mb-1">{s.caption}</p>
                  {s.video_url && (
                    <a href={s.video_url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-[var(--blue)] hover:underline truncate block">
                      {s.video_url}
                    </a>
                  )}
                </div>
                <button onClick={() => deleteSubmission(s.id)} className="p-1 text-red-400 hover:text-red-300 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            {!rows.length && <div className="py-10 text-center text-[13px] text-[var(--text3)]">No submissions yet</div>}
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// WEEKLY PICKS MANAGER
// ══════════════════════════════════════════════════════════════════
function WeeksManager({ toast }: { toast: (m: string, ok?: boolean) => void }) {
  const [rows, setRows]       = useState<WeekRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [form, setForm]       = useState({ theme: '', start_date: '', end_date: '' });

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('weeks').select('*').order('start_date', { ascending: false });
    setRows(data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function addWeek() {
    if (!form.theme || !form.start_date || !form.end_date) return;
    setSaving(true);
    const { error } = await supabase.from('weeks').insert({ ...form, is_active: true });
    if (error) toast(error.message, false);
    else { toast('Week added!'); setForm({ theme: '', start_date: '', end_date: '' }); load(); }
    setSaving(false);
  }

  async function toggleWeek(id: number, current: boolean) {
    await supabase.from('weeks').update({ is_active: !current }).eq('id', id);
    toast(!current ? 'Week activated' : 'Week deactivated'); load();
  }

  async function deleteWeek(id: number) {
    await supabase.from('weeks').delete().eq('id', id);
    toast('Deleted'); load();
  }

  return (
    <div className="space-y-5">
      <h1 className="text-[22px] font-heading font-black text-white">Weekly Picks</h1>

      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5">
        <h2 className="text-[13px] font-black text-white mb-4 flex items-center gap-2"><Plus className="w-4 h-4 text-[var(--purple)]" /> New Week</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-3">
            <label className="block text-[10px] font-black text-[var(--text3)] uppercase tracking-widest mb-1.5">Theme</label>
            <input className={inputCls} placeholder="e.g. Best Isekai of the Year" value={form.theme} onChange={e => setForm(f => ({ ...f, theme: e.target.value }))} />
          </div>
          <div>
            <label className="block text-[10px] font-black text-[var(--text3)] uppercase tracking-widest mb-1.5">Start Date</label>
            <input type="date" className={inputCls} value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
          </div>
          <div>
            <label className="block text-[10px] font-black text-[var(--text3)] uppercase tracking-widest mb-1.5">End Date</label>
            <input type="date" className={inputCls} value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
          </div>
        </div>
        <button onClick={addWeek} disabled={saving || !form.theme}
          className="mt-3 flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[var(--purple)] to-[var(--pink)] text-white text-[12px] font-black rounded-xl hover:brightness-110 transition-all disabled:opacity-50">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Create Week
        </button>
      </div>

      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--border)]">
          <h2 className="text-[13px] font-black text-white">{rows.length} Weeks</h2>
        </div>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 text-[var(--purple)] animate-spin" /></div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {rows.map(w => (
              <div key={w.id} className="flex items-center gap-3 px-5 py-3 hover:bg-[var(--bg3)] group">
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold text-white truncate">{w.theme}</p>
                  <p className="text-[10px] text-[var(--text3)]">{w.start_date} → {w.end_date}</p>
                </div>
                <Badge label={w.is_active ? 'Active' : 'Inactive'} color={w.is_active ? 'var(--green)' : 'var(--text3)'} />
                <button onClick={() => toggleWeek(w.id, w.is_active)} className={`p-1 transition-colors ${w.is_active ? 'text-[var(--green)]' : 'text-[var(--text3)]'}`}>
                  {w.is_active ? <CheckCircle2 className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                <button onClick={() => deleteWeek(w.id)} className="p-1 text-red-400 hover:text-red-300 opacity-0 group-hover:opacity-100 transition-all">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            {!rows.length && <div className="py-8 text-center text-[13px] text-[var(--text3)]">No weeks yet</div>}
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// SITE SETTINGS
// ══════════════════════════════════════════════════════════════════
function SiteSettings({ toast }: { toast: (m: string, ok?: boolean) => void }) {
  const [banner, setBanner]   = useState(localStorage.getItem('kami_admin_banner') || '');
  const [maintenance, setMaintenance] = useState(localStorage.getItem('kami_maintenance') === 'true');

  function saveBanner() {
    localStorage.setItem('kami_admin_banner', banner);
    toast('Banner saved (local — connect to Supabase KV for global)');
  }

  function toggleMaintenance() {
    const next = !maintenance;
    setMaintenance(next);
    localStorage.setItem('kami_maintenance', String(next));
    toast(next ? 'Maintenance mode ON' : 'Maintenance mode OFF');
  }

  return (
    <div className="space-y-5">
      <h1 className="text-[22px] font-heading font-black text-white">Site Settings</h1>

      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 space-y-5">
        {/* Announcement banner */}
        <div>
          <label className="block text-[11px] font-black text-[var(--text3)] uppercase tracking-widest mb-2">Announcement Banner</label>
          <input className={inputCls} placeholder="e.g. New episodes drop every Saturday!" value={banner} onChange={e => setBanner(e.target.value)} />
          <button onClick={saveBanner} className="mt-2 flex items-center gap-2 px-4 py-2 bg-[var(--card)] border border-[var(--border)] text-white text-[12px] font-bold rounded-xl hover:bg-[var(--bg3)] transition-all">
            <Save className="w-3.5 h-3.5" /> Save Banner
          </button>
        </div>

        <div className="border-t border-[var(--border)] pt-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[13px] font-black text-white">Maintenance Mode</p>
              <p className="text-[11px] text-[var(--text3)]">Shows a maintenance page to all non-admin visitors</p>
            </div>
            <button onClick={toggleMaintenance}
              className={`w-12 h-6 rounded-full transition-all relative ${maintenance ? 'bg-[var(--pink)]' : 'bg-[var(--border)]'}`}>
              <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-all ${maintenance ? 'left-6' : 'left-0.5'}`} />
            </button>
          </div>
        </div>

        <div className="border-t border-[var(--border)] pt-5">
          <p className="text-[11px] font-black text-[var(--text3)] uppercase tracking-widest mb-3">Quick Links</p>
          <div className="flex flex-wrap gap-2">
            {[
              { label: 'Supabase Dashboard', url: 'https://supabase.com/dashboard' },
              { label: 'Vercel Dashboard',   url: 'https://vercel.com/dashboard' },
              { label: 'Cloudflare',         url: 'https://dash.cloudflare.com' },
              { label: 'Monetag Stats',      url: 'https://monetag.com' },
              { label: 'Google Search Console', url: 'https://search.google.com/search-console' },
            ].map(({ label, url }) => (
              <a key={label} href={url} target="_blank" rel="noopener noreferrer"
                className="px-3 py-1.5 bg-[var(--bg3)] border border-[var(--border)] rounded-xl text-[11px] font-bold text-[var(--text2)] hover:text-white hover:border-[var(--purple)]/50 transition-all">
                {label} ↗
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
