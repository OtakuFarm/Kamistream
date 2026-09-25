import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useRoute, Link, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { useAnimeDetail, useAnimeEpisodes, useAnimeRecommendations } from '@/lib/jikan';
import { useWatchlist } from '@/hooks/useWatchlist';
import { useWatchHistory } from '@/hooks/useWatchHistory';
import { useEpisodeProgress } from '@/hooks/useEpisodeProgress';
import { useSEO } from '@/hooks/useSEO';
import { animePath } from '@/lib/seo';
import { getNextAiring, getAnimeRelations } from '@/lib/anilist';
import {
  Play, Plus, Check, Star, Timer, CheckCircle2, Share2,
  ChevronLeft, ChevronRight, Maximize2, Minimize2, RefreshCw,
  Settings, SkipForward, AlertTriangle, X, Download
} from 'lucide-react';
import { DetailSkeleton } from '@/components/LoadingSkeleton';
import { AnimeLoader } from '@/components/AnimeLoader';

// ── Constants ────────────────────────────────────────────────────────
const EP_PAGE_SIZE = 100;
const MP_BASE      = 'https://megaplay.buzz';

// ── MegaPlay helpers (same pattern as watch.tsx) ─────────────────────
const _alCache: Record<string, string> = {};
async function resolveAnilistId(malId: string): Promise<string | null> {
  if (_alCache[malId]) return _alCache[malId];
  const saved = sessionStorage.getItem('al_id_' + malId);
  if (saved) { _alCache[malId] = saved; return saved; }
  try {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: 'query($m:Int){Media(idMal:$m,type:ANIME){id}}', variables: { m: parseInt(malId) } }),
    });
    const data = await res.json();
    const alId = String(data?.data?.Media?.id ?? '');
    if (alId) { _alCache[malId] = alId; sessionStorage.setItem('al_id_' + malId, alId); }
    return alId || null;
  } catch { return null; }
}

function mpMal(malId: string, ep: string, lang: 'sub'|'dub') { return `${MP_BASE}/stream/mal/${malId}/${ep}/${lang}`; }
function mpAni(alId: string, ep: string, lang: 'sub'|'dub')  { return `${MP_BASE}/stream/ani/${alId}/${ep}/${lang}`; }
function mpS2(embedId: string, lang: 'sub'|'dub') { return `${MP_BASE}/stream/s-2/${embedId}/${lang}`; }

// ── Anikoto (OniChan S-2) resolver — same approach as watch.tsx ─────────
// Routes through /api/anikoto (server-side proxy) instead of calling
// anikotoapi.site directly from the browser. Cached in sessionStorage so
// we only resolve once per anime per tab.
const ANIKOTO_BASE = '/api/anikoto';
const _anikotoCache: Record<string, Record<string, { sub: string; dub: string; embedId: string }>> = {};

async function resolveAnikotoEmbedId(malId: string, epNum: string): Promise<string | null> {
  const memHit = _anikotoCache[malId]?.[epNum];
  if (memHit) return memHit.embedId || null;

  const ssKey = `anikoto_v2_${malId}`;
  try {
    const saved = sessionStorage.getItem(ssKey);
    if (saved) {
      const map = JSON.parse(saved) as Record<string, { sub: string; dub: string; embedId: string }>;
      _anikotoCache[malId] = map;
      if (map[epNum]) return map[epNum].embedId || null;
    }
  } catch {}

  try {
    let anikotoSeriesId: string | null = null;
    for (let page = 1; page <= 8 && !anikotoSeriesId; page++) {
      const r = await fetch(
        `${ANIKOTO_BASE}?action=recent&page=${page}&per_page=25`,
        { signal: AbortSignal.timeout(6000) }
      );
      if (!r.ok) break;
      const json = await r.json();
      const list: any[] = json?.data || json?.results || [];
      if (!list.length) break;
      const match = list.find((a: any) => String(a.mal_id) === malId || String(a.ani_id) === malId);
      if (match) { anikotoSeriesId = String(match.id ?? match.s_id ?? ''); break; }
      if (!json?.pagination?.has_next_page) break;
    }
    if (!anikotoSeriesId) return null;

    const sr = await fetch(`${ANIKOTO_BASE}?action=series&id=${encodeURIComponent(anikotoSeriesId)}`, { signal: AbortSignal.timeout(6000) });
    if (!sr.ok) return null;
    const series = await sr.json();
    const episodes: any[] = series?.data?.episodes || series?.episodes || [];

    const map: Record<string, { sub: string; dub: string; embedId: string }> = {};
    for (const ep of episodes) {
      const num     = String(ep.number ?? ep.episode_number ?? '');
      const embedId = String(ep.episode_embed_id ?? '');
      const sub     = ep.embed_url?.sub || (embedId ? `${MP_BASE}/stream/s-2/${embedId}/sub` : '');
      const dub     = ep.embed_url?.dub || (embedId ? `${MP_BASE}/stream/s-2/${embedId}/dub` : '');
      if (num && (sub || dub)) map[num] = { sub, dub, embedId };
    }

    _anikotoCache[malId] = map;
    try { sessionStorage.setItem(ssKey, JSON.stringify(map)); } catch {}
    return map[epNum]?.embedId || null;
  } catch { return null; }
}

function getAnikotoUrl(malId: string, epNum: string, lang: 'sub' | 'dub'): string | null {
  const ep = _anikotoCache[malId]?.[epNum];
  if (!ep) return null;
  return lang === 'dub' ? (ep.dub || ep.sub) : (ep.sub || ep.dub);
}

interface ServerEntry { id: string; name: string; url: string; badge?: string; }

// ── Component ─────────────────────────────────────────────────────────
export default function AnimeDetail() {
  // Supports both /anime/:id and /anime/:id/:slug (descriptive URLs)
  const [, params]   = useRoute('/anime/:id/:slug?');
  const [, navigate] = useLocation();
  const routeParam = params?.slug || params?.id || '';
  const id = /^\d+$/.test(routeParam) ? routeParam : '';
  const { data: detail,   isLoading: detailLoading } = useAnimeDetail(routeParam);
  const resolvedId = String((detail?.data as any)?.mal_id || id || '');
  const { data: episodes, isLoading: episodesLoading } = useAnimeEpisodes(resolvedId);
  const { data: recs }                                  = useAnimeRecommendations(resolvedId);
  const { toggleWatchlist, isInWatchlist }              = useWatchlist();
  const { getRecentAnime }                              = useWatchHistory();
  const { toggleWatched, isWatched, getWatchedCount }  = useEpisodeProgress();

  const { data: charsData } = useQuery({
    queryKey: ['anime', resolvedId, 'characters'],
    queryFn: async () => { const r = await fetch(`https://api.jikan.moe/v4/anime/${resolvedId}/characters`); return r.ok ? r.json() : { data: [] }; },
    enabled: !!resolvedId, staleTime: 30 * 60 * 1000,
  });
  const { data: relations } = useQuery({
    queryKey: ['anime', resolvedId, 'relations'],
    queryFn: () => getAnimeRelations(resolvedId),
    enabled: !!resolvedId, staleTime: 60 * 60 * 1000,
  });

  const relationsFiltered = (relations || []).filter((e: any) =>
    ['SEQUEL','PREQUEL','SIDE_STORY','SPIN_OFF','ALTERNATIVE','PARENT','COMPILATION','CONTAINS'].includes(e.relationType)
  );

  // ── State ─────────────────────────────────────────────────────────
  const [epPage,        setEpPage]        = useState(1);
  const [showTrailer,   setShowTrailer]   = useState(false);
  const [nextAiring,    setNextAiring]    = useState<any>(null);
  const [countdown,     setCountdown]     = useState('');

  // Inline player state
  const [activeEp,      setActiveEp]      = useState<string | null>(null);  // ep number or null = not playing
  const [dub,           setDub]           = useState(false);
  const [alId,          setAlId]          = useState<string | null>(null);
  const [anikotoEmbedId, setAnikotoEmbedId] = useState<string | null>(null);
  const [selectedSrv,   setSelectedSrv]   = useState('mp-mal');
  const [activeSource,  setActiveSource]  = useState('');
  const [loadingPlayer, setLoadingPlayer] = useState(false);
  const [playerError,   setPlayerError]   = useState(false);
  const [theaterMode,   setTheaterMode]   = useState(false);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const iframeRef     = useRef<HTMLIFrameElement>(null);
  const playerRef     = useRef<HTMLDivElement>(null);
  const epListRef     = useRef<HTMLDivElement>(null);

  const anime = detail?.data;

  // ── SEO ──────────────────────────────────────────────────────────
  useSEO(anime ? {
    // Title/description here are mirrored VERBATIM by scripts/prerender.mjs
    // (animeDoc) — the crawler-facing HTML and the hydrated React state must
    // agree, so change both together or the prerendered pages drift.
    title:       `${anime.title} — Watch Online Free (Sub & Dub)`,
    description: anime.synopsis?.slice(0, 160),
    // A 16:9 YouTube trailer frame previews far better than a portrait
    // poster on Discord / X / Facebook cards; fall back to the poster art.
    image:       anime.trailer?.images?.maximum_image_url || anime.images?.webp?.large_image_url,
    type:        'video.other',
    // Canonical = descriptive URL. Old bare /anime/:id links (and any
    // wrong-slug variants) all consolidate onto this one URL.
    url:         animePath(resolvedId, anime.title),
    jsonLd: {
      animeName: anime.title,
      score:     anime.score,
      episodes:  anime.episodes,
      status:    anime.status,
      genres:    anime.genres?.map((g: any) => g.name),
      studios:   anime.studios?.map((s: any) => s.name),
      aired:     anime.aired?.from?.split('T')[0],
      malId:     anime.mal_id,
    },
  } : {});

  useEffect(() => { setEpPage(1); setActiveEp(null); }, [resolvedId]);

  // ── Airing countdown ─────────────────────────────────────────────
  useEffect(() => {
    if (!anime || !resolvedId || anime.status !== 'Currently Airing') return;
    getNextAiring(resolvedId).then(setNextAiring).catch(() => {});
  }, [resolvedId, anime?.status]);

  useEffect(() => {
    if (!nextAiring?.airingAt) return;
    const update = () => {
      const secs = nextAiring.airingAt - Math.floor(Date.now() / 1000);
      if (secs <= 0) { setCountdown('Available now!'); return; }
      const d = Math.floor(secs / 86400), h = Math.floor((secs % 86400) / 3600),
            m = Math.floor((secs % 3600) / 60), s = secs % 60;
      setCountdown(d > 0 ? `${d}d ${h}h ${m}m` : `${h}h ${m}m ${s}s`);
    };
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [nextAiring]);

  // ── Inline player: load episode ──────────────────────────────────
  const loadEpisode = useCallback(async (epNum: string) => {
    setActiveEp(epNum);
    setLoadingPlayer(true);
    setPlayerError(false);
    setSelectedSrv('mp-mal');
    setAnikotoEmbedId(null);
    const lang = dub ? 'dub' : 'sub';

    // Start with MAL immediately
    setActiveSource(mpMal(resolvedId, epNum, lang));
    setLoadingPlayer(false);

    // Resolve AniList in background for Alt server
    if (!alId) {
      resolveAnilistId(resolvedId).then(al => { if (al) setAlId(al); });
    }

    // Resolve Anikoto (OniChan S-2) in background
    resolveAnikotoEmbedId(resolvedId, epNum).then(embedId => { if (embedId) setAnikotoEmbedId(embedId); });

    // Scroll player into view
    setTimeout(() => { playerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 100);

    // Error timer
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setPlayerError(true), 12000);
  }, [resolvedId, dub, alId]);

  useEffect(() => {
    if (!resolvedId || !anime) return;
    const episode = new URLSearchParams(window.location.search).get('episode');
    if (episode && /^\\d+$/.test(episode)) loadEpisode(episode);
  }, [resolvedId, anime?.mal_id]);

  const onIframeLoad = useCallback(() => {
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    setPlayerError(false);
  }, []);

  const switchServer = (srv: ServerEntry) => {
    try { (window as any).KamiAds?.onEpisodeClick('server'); } catch {}
    setActiveSource(srv.url);
    setSelectedSrv(srv.id);
    setPlayerError(false);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setPlayerError(true), 12000);
  };

  // Rebuild server list for current episode
  const buildServers = useCallback((): ServerEntry[] => {
    if (!activeEp) return [];
    const lang = dub ? 'dub' : 'sub';
    const servers: ServerEntry[] = [];

    if (anikotoEmbedId) {
      const anikotoUrl = getAnikotoUrl(id, activeEp, lang);
      servers.push({ id: 'mp-s2', name: 'OniChan', url: anikotoUrl || mpS2(anikotoEmbedId, lang) });
    }
    servers.push({ id: 'mp-mal', name: anikotoEmbedId ? 'Otaku' : 'OniChan', url: mpMal(id, activeEp, lang) });
    if (alId) servers.push({ id: 'mp-ani', name: 'Otaku', url: mpAni(alId, activeEp, lang) });
    return servers;
  }, [activeEp, dub, id, alId, anikotoEmbedId]);

  const serverList = buildServers();

  // Dub toggle rebuilds active source
  useEffect(() => {
    if (!activeEp) return;
    const lang = dub ? 'dub' : 'sub';
    if (selectedSrv === 'mp-s2' && anikotoEmbedId) {
      const anikotoUrl = getAnikotoUrl(id, activeEp, lang);
      setActiveSource(anikotoUrl || mpS2(anikotoEmbedId, lang));
    } else if (selectedSrv === 'mp-ani' && alId) {
      setActiveSource(mpAni(alId, activeEp, lang));
    } else {
      setActiveSource(mpMal(id, activeEp, lang));
    }
  }, [dub]);

  useEffect(() => () => { if (errorTimerRef.current) clearTimeout(errorTimerRef.current); }, []);

  // ── Episode list derived state ────────────────────────────────────
  if (detailLoading) return <AnimeLoader />;
  if (!anime) return <div className="p-8 text-center text-[var(--text3)]">Anime not found.</div>;

  const isSaved     = isInWatchlist(anime.mal_id);
  const history     = getRecentAnime();
  const lastWatched = history.find((h: any) => h.mal_id === anime.mal_id);
  const resumeEp    = lastWatched?.ep_id;
  const recommendations = (recs?.data || []).slice(0, 8);
  const characters  = charsData?.data || [];

  const jikanEps: any[]   = episodes?.data || [];
  const anilistAiredCount = nextAiring ? (nextAiring.episode - 1) : 0;
  const malCount: number  = anime.episodes || 0;
  const bestCount = Math.max(jikanEps.length, anilistAiredCount, malCount);

  const eps: any[] = jikanEps.length >= bestCount
    ? jikanEps
    : bestCount > 0
      ? Array.from({ length: bestCount }, (_, i) => {
          const ex = jikanEps.find((e: any) => e.mal_id === i + 1);
          return ex || { mal_id: i + 1, title: `Episode ${i + 1}` };
        })
      : [];

  const totalEps   = eps.length;
  const totalPages = Math.ceil(totalEps / EP_PAGE_SIZE);
  const visibleEps = eps.slice((epPage - 1) * EP_PAGE_SIZE, epPage * EP_PAGE_SIZE);
  const watchedCount = getWatchedCount(anime.mal_id);
  const watchedPct   = totalEps > 0 ? Math.round((watchedCount / totalEps) * 100) : 0;

  const lang = dub ? 'dub' : 'sub';

  const pageUrl     = typeof window !== 'undefined' ? window.location.href : '';
  const shareTitle  = encodeURIComponent(`Watch ${anime.title} on KamiStream`);
  const shareUrl    = encodeURIComponent(pageUrl);
  const shareLinks  = [
    { label: 'X', color: '#e2e8f0', href: `https://twitter.com/intent/tweet?text=${shareTitle}&url=${shareUrl}` },
    { label: 'Reddit', color: '#FF4500', href: `https://www.reddit.com/submit?url=${shareUrl}&title=${shareTitle}` },
    { label: 'WhatsApp', color: '#25D366', href: `https://api.whatsapp.com/send?text=${shareTitle}%20${shareUrl}` },
    { label: 'Telegram', color: '#2CA5E0', href: `https://t.me/share/url?url=${shareUrl}&text=${shareTitle}` },
  ];

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div className="pb-20">

      {/* ══ HERO BANNER — cinematic, layered ═════════════════════════ */}
      <div className="relative h-[340px] md:h-[440px] w-full overflow-hidden">
        {/* Full-bleed banner image */}
        <div className="absolute inset-0 scale-110">
          <img
            src={anime.trailer?.images?.maximum_image_url || anime.images?.webp?.large_image_url}
            alt="" className="w-full h-full object-cover opacity-45"
            onError={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0'; }}
          />
        </div>
        {/* Layered gradients: dark base + pink/purple tint + bottom fade */}
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg)] via-[var(--bg)]/60 to-[var(--bg)]/10" />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(100deg, rgba(255,0,110,0.10) 0%, transparent 40%, rgba(130,0,255,0.10) 100%)' }} />
        {/* Grain */}
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")' }} />

        <div className="absolute bottom-0 left-0 right-0 px-4 md:px-8 pb-6 md:pb-8 flex gap-5 md:gap-8 items-end max-w-7xl mx-auto">
          {/* Cover art — floating glass frame */}
          <div className="relative shrink-0 z-10 -mb-2 md:-mb-4">
            <div className="absolute -inset-1.5 rounded-2xl bg-gradient-to-br from-[var(--pink)]/50 via-transparent to-[var(--purple)]/50 blur-[6px] opacity-70" />
            <img
              src={anime.images?.webp?.large_image_url}
              alt={anime.title}
              className="relative w-32 md:w-48 rounded-xl shadow-2xl z-10 border border-white/15"
            />
          </div>

          {/* Glass info card */}
          <div className="flex-1 z-10 min-w-0 backdrop-blur-md bg-white/[0.05] border border-white/10 rounded-2xl px-4 md:px-6 py-4 md:py-5 shadow-2xl shadow-black/40">
            <div className="flex flex-wrap items-center gap-2 mb-2.5">
              {anime.type && <span className="text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full backdrop-blur-sm bg-white/10 border border-white/15 text-white/70">{anime.type}</span>}
              {anime.status === 'Currently Airing' && (
                <span className="text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full bg-[var(--pink)]/20 border border-[var(--pink)]/30 text-[var(--pink)] flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--pink)] animate-pulse inline-block" /> Airing Now
                </span>
              )}
              {anime.score && (
                <span className="text-[9px] font-black px-2.5 py-1 rounded-full bg-[var(--gold)]/15 border border-[var(--gold)]/30 text-[var(--gold)] flex items-center gap-1">
                  <Star className="w-2.5 h-2.5 fill-current" /> {anime.score}
                  {anime.scored_by && <span className="font-normal opacity-60">({(anime.scored_by / 1000).toFixed(0)}k)</span>}
                </span>
              )}
              {anime.rank && <span className="text-[9px] font-black px-2.5 py-1 rounded-full bg-white/10 border border-white/15 text-white/70 hidden sm:inline-block">#{anime.rank}</span>}
              {anime.members && <span className="text-[9px] font-black px-2.5 py-1 rounded-full bg-white/10 border border-white/15 text-white/70 hidden md:inline-block">{(anime.members / 1000).toFixed(0)}k watchers</span>}
            </div>
            <h1 className="text-2xl md:text-4xl font-heading font-black text-white leading-tight mb-1 drop-shadow-lg">{anime.title}</h1>
            {anime.title_english && anime.title_english !== anime.title && (
              <p className="text-[11px] md:text-xs text-white/50 font-mono mb-3 truncate">{anime.title_english}</p>
            )}
            <div className="flex flex-wrap gap-1.5 mb-4">
              {anime.genres?.slice(0, 5).map((g: any) => (
                <Link key={g.mal_id} href={`/genre/${g.mal_id}`}>
                  <span className="text-[10px] font-bold px-2.5 py-1 rounded-full backdrop-blur-sm bg-white/[0.07] border border-white/15 text-white/80 hover:bg-[var(--pink)]/25 hover:border-[var(--pink)]/50 hover:text-white transition-all cursor-pointer">
                    {g.name}
                  </span>
                </Link>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                onClick={() => loadEpisode(String(resumeEp || 1))}
                className="bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white px-6 py-2.5 rounded-xl text-[13px] font-black hover:brightness-110 hover:scale-[1.03] active:scale-95 transition-all flex items-center gap-2 shadow-lg shadow-[var(--pink)]/30"
              >
                <Play className="w-4 h-4 fill-current" />
                {resumeEp ? `Resume EP ${resumeEp}` : 'Watch Now'}
              </button>
              <button
                onClick={() => toggleWatchlist({ mal_id: anime.mal_id, title: anime.title, image_url: anime.images?.webp?.large_image_url || '', episodes: anime.episodes, score: anime.score })}
                className={`px-5 py-2.5 rounded-xl text-[13px] font-bold backdrop-blur-sm border transition-all flex items-center gap-2 ${isSaved ? 'bg-[var(--green)]/15 border-[var(--green)]/40 text-[var(--green)]' : 'bg-white/[0.07] border-white/15 text-white hover:bg-white/15'}`}
              >
                {isSaved ? <><Check className="w-4 h-4" /> Saved</> : <><Plus className="w-4 h-4" /> Watchlist</>}
              </button>
              {anime.trailer?.youtube_id && (
                <button onClick={() => setShowTrailer(true)}
                  className="px-5 py-2.5 rounded-xl text-[13px] font-bold backdrop-blur-sm bg-white/[0.07] border border-white/15 text-white hover:bg-white/15 transition-all">
                  ▶ Trailer
                </button>
              )}
              <button onClick={() => navigator.clipboard.writeText(pageUrl)}
                className="w-10 h-10 rounded-xl backdrop-blur-sm bg-white/[0.07] border border-white/15 text-white/70 hover:text-white hover:bg-white/15 transition-all flex items-center justify-center shrink-0">
                <Share2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ══ MAIN BODY ════════════════════════════════════════════════ */}
      <div className="max-w-7xl mx-auto px-4 md:px-8 mt-6 md:mt-8">

        {/* ── Countdown banner ─────────────────────────────────────── */}
        {nextAiring && countdown && (
          <div className="mb-6 bg-gradient-to-r from-[var(--pink)]/10 to-[var(--purple)]/10 border border-[var(--pink)]/25 rounded-xl p-3.5 flex items-center gap-4">
            <Timer className="w-5 h-5 text-[var(--pink)] shrink-0 animate-pulse" />
            <div className="flex-1">
              <div className="text-[9px] font-black text-[var(--pink)] uppercase tracking-widest mb-0.5">Next Episode</div>
              <div className="text-[13px] font-heading font-black text-white">
                EP {nextAiring.episode} drops in <span className="text-[var(--pink)]">{countdown}</span>
              </div>
            </div>
            <div className="text-[10px] text-[var(--text3)] text-right shrink-0">
              {new Date(nextAiring.airingAt * 1000).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        )}

        {/* ── Layout: player+episodes left, details right ───────────── */}
        <div className="flex flex-col lg:flex-row gap-6">

          {/* LEFT — Player + Episodes + Info ────────────────────────── */}
          <div className="flex-1 min-w-0 space-y-5">

            {/* ── Inline Player ──────────────────────────────────────── */}
            <div ref={playerRef}>
              {activeEp ? (
                <div className="rounded-2xl overflow-hidden border border-[var(--border)] bg-black">

                  {/* Player chrome header */}
                  <div className="flex items-center justify-between px-3 py-2 bg-[var(--bg2)] border-b border-[var(--border)]">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[var(--pink)] animate-pulse" />
                      <span className="text-[11px] font-black text-white">{anime.title}</span>
                      <span className="text-[10px] text-[var(--text3)]">— EP {activeEp}</span>
                    </div>
                    <button onClick={() => setActiveEp(null)} className="text-[var(--text3)] hover:text-white transition-colors p-1">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* The iframe */}
                  <div
                    className="relative w-full bg-black"
                    style={{ paddingTop: theaterMode ? 'min(65vh, 520px)' : '56.25%' }}
                  >
                    {loadingPlayer ? (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-7 h-7 border-2 border-[var(--pink)] border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : (
                      <>
                        <iframe
                          ref={iframeRef}
                          key={activeSource}
                          src={activeSource}
                          onLoad={onIframeLoad}
                          className="absolute inset-0 w-full h-full border-0"
                          allowFullScreen
                          allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
                          scrolling="no"
                        />
                        {playerError && (
                          <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center gap-3 z-10">
                            <AlertTriangle className="w-8 h-8 text-[var(--pink)]" />
                            <p className="text-white font-bold text-[13px]">Player failed to load</p>
                            <div className="flex flex-wrap gap-2 justify-center">
                              {serverList.filter(s => s.id !== selectedSrv).map(s => (
                                <button key={s.id} onClick={() => switchServer(s)}
                                  className="px-3 py-1.5 bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white text-[11px] font-bold rounded-lg">
                                  Try {s.name}
                                </button>
                              ))}
                              <button onClick={() => { setActiveSource(activeSource + '?r=' + Date.now()); setPlayerError(false); }}
                                className="px-3 py-1.5 bg-[var(--card)] border border-[var(--border)] text-white text-[11px] font-bold rounded-lg flex items-center gap-1.5">
                                <RefreshCw className="w-3 h-3" /> Retry
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Player controls bar */}
                  <div className="px-3 py-2.5 bg-[var(--bg2)] border-t border-[var(--border)] flex flex-wrap items-center gap-2">
                    <div className="flex bg-[var(--bg3)] border border-[var(--border)] rounded-lg overflow-hidden text-[11px] font-black">
                      <button onClick={() => setDub(false)} className={`px-3 py-1.5 transition-colors ${!dub ? 'bg-[var(--pink)] text-white' : 'text-[var(--text3)] hover:text-white'}`}>SUB</button>
                      <button onClick={() => setDub(true)}  className={`px-3 py-1.5 transition-colors ${ dub ? 'bg-[var(--purple)] text-white' : 'text-[var(--text3)] hover:text-white'}`}>DUB</button>
                    </div>
                    <div className="flex bg-[var(--bg3)] border border-[var(--border)] rounded-lg overflow-hidden text-[11px] font-bold">
                      {serverList.map((s, idx) => (
                        <button key={s.id} onClick={() => switchServer(s)}
                          className={`px-3 py-1.5 flex items-center gap-1 border-r border-[var(--border)] last:border-r-0 transition-colors ${
                            selectedSrv === s.id
                              ? idx === 0 ? 'bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white' : 'bg-gradient-to-r from-[var(--blue)] to-[var(--purple)] text-white'
                              : 'text-[var(--text3)] hover:text-white'
                          }`}>
                          <Settings className="w-2.5 h-2.5" /> {s.name}
                        </button>
                      ))}
                    </div>
                    <button onClick={() => setTheaterMode(v => !v)}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border flex items-center gap-1 transition-all ${theaterMode ? 'bg-[var(--blue)]/15 border-[var(--blue)]/40 text-[var(--blue)]' : 'bg-[var(--bg3)] border-[var(--border)] text-[var(--text3)] hover:text-white'}`}>
                      {theaterMode ? <Minimize2 className="w-2.5 h-2.5" /> : <Maximize2 className="w-2.5 h-2.5" />}
                      Theater
                    </button>
                    <Link href={`/watch/${resolvedId}/${activeEp}`} className="ml-auto">
                      <button className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-[var(--card)] border border-[var(--border)] text-[var(--text2)] hover:text-white transition-colors flex items-center gap-1">
                        <Maximize2 className="w-2.5 h-2.5" /> Full Page
                      </button>
                    </Link>
                  </div>
                </div>
              ) : (
                <div
                  className="relative rounded-2xl overflow-hidden border border-white/10 cursor-pointer group shadow-lg shadow-black/30"
                  style={{ paddingTop: '42%' }}
                  onClick={() => loadEpisode(String(resumeEp || 1))}
                >
                  <img
                    src={anime.trailer?.images?.maximum_image_url || anime.images?.webp?.large_image_url}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 opacity-60"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                    <div className="w-16 h-16 bg-gradient-to-br from-[var(--pink)] to-[var(--purple)] rounded-full flex items-center justify-center shadow-2xl shadow-[var(--pink)]/40 ring-2 ring-white/20 group-hover:scale-110 transition-transform">
                      <Play className="w-6 h-6 fill-white text-white ml-0.5" />
                    </div>
                    <span className="text-white font-black text-[13px]">
                      {resumeEp ? `Resume Episode ${resumeEp}` : 'Start Watching'}
                    </span>
                    <span className="text-[var(--text3)] text-[11px]">Click to play inline</span>
                  </div>
                </div>
              )}
            </div>

            {/* ── Episode List — directly under player ───────────────── */}
            <div ref={epListRef} className="backdrop-blur-md bg-white/[0.03] border border-white/10 rounded-2xl overflow-hidden shadow-lg shadow-black/20">
              <div className="px-4 py-3.5 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-[var(--pink)]/[0.06] to-transparent">
                <h3 className="font-heading font-black text-[13px] text-white flex items-center gap-2">
                  <span className="w-1 h-4 rounded-full bg-gradient-to-b from-[var(--pink)] to-[var(--purple)]" />
                  Episodes
                  {totalEps > 0 && <span className="ml-1 text-[11px] font-normal text-white/40">({totalEps})</span>}
                </h3>
                <div className="flex items-center gap-3">
                  {watchedCount > 0 && (
                    <span className="text-[10px] font-black text-[#06d6a0] flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> {watchedCount}/{totalEps}
                    </span>
                  )}
                  {episodesLoading && <span className="text-[10px] text-[var(--pink)] font-bold animate-pulse">Loading…</span>}
                </div>
              </div>

              {episodesLoading ? (
                <div className="p-3 space-y-1.5">
                  {[1,2,3,4,5].map(i => <div key={i} className="h-10 bg-[var(--bg3)] rounded-xl animate-pulse" />)}
                </div>
              ) : eps.length > 0 ? (
                <>
                  <div className="p-3">
                    <div className="grid grid-cols-8 sm:grid-cols-10 md:grid-cols-12 lg:grid-cols-10 xl:grid-cols-12 gap-1.5">
                      {visibleEps.map((ep: any) => {
                        const isPlaying = activeEp === String(ep.mal_id);
                        const isLast    = resumeEp === ep.mal_id;
                        const watched   = isWatched(anime.mal_id, ep.mal_id);
                        return (
                          <button
                            key={ep.mal_id}
                            onClick={() => loadEpisode(String(ep.mal_id))}
                            title={ep.title || `Episode ${ep.mal_id}`}
                            className={`aspect-square flex items-center justify-center rounded-lg text-[11px] font-bold transition-all cursor-pointer select-none relative group hover:-translate-y-0.5
                              ${isPlaying
                                ? 'bg-gradient-to-br from-[var(--pink)] to-[var(--purple)] text-white shadow-lg shadow-[var(--pink)]/40 ring-1 ring-white/20'
                                : isLast && !watched
                                  ? 'bg-[var(--purple)]/20 text-[var(--purple)] border border-[var(--purple)]/40 hover:bg-[var(--pink)]/20 hover:text-[var(--pink)]'
                                  : watched
                                    ? 'bg-[#06d6a0]/15 text-[#06d6a0] border border-[#06d6a0]/30 hover:bg-[var(--pink)]/20 hover:text-[var(--pink)]'
                                    : 'bg-white/[0.05] text-white/50 hover:bg-[var(--pink)]/20 hover:text-white border border-white/[0.06] hover:border-[var(--pink)]/40'
                              }`}
                          >
                            {isPlaying ? <Play className="w-3 h-3 fill-current" /> : ep.mal_id}
                            {watched && !isPlaying && (
                              <CheckCircle2 className="absolute top-0.5 right-0.5 w-2 h-2 text-[#06d6a0] opacity-70" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-1.5 px-3 pb-3 flex-wrap">
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                        <button key={p} onClick={() => setEpPage(p)}
                          className={`w-8 h-8 rounded-lg text-[11px] font-bold transition-all ${p === epPage ? 'bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white shadow-md shadow-[var(--pink)]/30' : 'bg-white/[0.05] text-white/60 hover:text-white hover:bg-white/10 border border-white/[0.06]'}`}>
                          {p}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="p-6 text-center text-[12px] text-[var(--text3)]">No episodes available yet.</div>
              )}
            </div>

            {/* ── Synopsis — glass card ───────────────────────────────── */}
            <section className="backdrop-blur-md bg-white/[0.03] border border-white/10 rounded-2xl p-4 shadow-lg shadow-black/20">
              <h2 className="text-[13px] font-black text-white uppercase tracking-widest mb-2 flex items-center gap-2">
                <span className="w-1 h-4 rounded-full bg-gradient-to-b from-[var(--pink)] to-[var(--purple)]" />
                Synopsis
              </h2>
              <p className="text-[13px] text-white/70 leading-relaxed">{anime.synopsis}</p>
            </section>

            {/* ── Relations ─────────────────────────────────────────── */}
            {relationsFiltered.length > 0 && (
              <section>
                <h2 className="text-[13px] font-black text-white uppercase tracking-widest mb-3 flex items-center gap-2">
                  <span className="w-1 h-4 rounded-full bg-gradient-to-b from-[var(--pink)] to-[var(--purple)]" />
                  Related Anime
                </h2>
                <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
                  {relationsFiltered.map((edge: any) => {
                    const node = edge.node;
                    const malId = node?.idMal;
                    const labels: Record<string, string> = {
                      SEQUEL: 'Sequel', PREQUEL: 'Prequel', SIDE_STORY: 'Side Story',
                      SPIN_OFF: 'Spin-off', ALTERNATIVE: 'Alt', PARENT: 'Parent',
                    };
                    const card = (
                      <div className="shrink-0 w-24 group">
                        <div className="aspect-[2/3] rounded-xl overflow-hidden bg-[var(--card)] mb-1.5 relative">
                          <img src={node?.coverImage?.large} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }} />
                          <div className="absolute top-1 left-1">
                            <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-black/70 text-[var(--pink)]">
                              {labels[edge.relationType] || edge.relationType}
                            </span>
                          </div>
                        </div>
                        <p className="text-[10px] font-bold text-white line-clamp-2 leading-snug">{node?.title?.english || node?.title?.romaji}</p>
                      </div>
                    );
                    return malId ? <Link key={node?.id} href={animePath(malId, node?.title?.english || node?.title?.romaji || '')}>{card}</Link> : <div key={node?.id}>{card}</div>;
                  })}
                </div>
              </section>
            )}

            {/* ── Characters ────────────────────────────────────────── */}
            {characters.length > 0 && (
              <section>
                <h2 className="text-[13px] font-black text-white uppercase tracking-widest mb-3 flex items-center gap-2">
                  <span className="w-1 h-4 rounded-full bg-gradient-to-b from-[var(--pink)] to-[var(--purple)]" />
                  Characters
                </h2>
                <div className="grid grid-cols-5 sm:grid-cols-7 md:grid-cols-9 gap-2">
                  {characters.slice(0, 18).map((c: any) => (
                    <div key={c.character.mal_id} className="text-center group">
                      <div className="aspect-square rounded-xl overflow-hidden bg-[var(--card)] mb-1">
                        <img src={c.character.images?.webp?.image_url || c.character.images?.jpg?.image_url}
                          alt={c.character.name}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                        />
                      </div>
                      <p className="text-[8px] font-bold text-white line-clamp-1">{c.character.name}</p>
                      <p className="text-[7px] text-[var(--text3)]">{c.role}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ── Recommendations ───────────────────────────────────── */}
            {recommendations.length > 0 && (
              <section>
                <h2 className="text-[13px] font-black text-white uppercase tracking-widest mb-3 flex items-center gap-2">
                  <span className="w-1 h-4 rounded-full bg-gradient-to-b from-[var(--pink)] to-[var(--purple)]" />
                  You Might Also Like
                </h2>
                <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-3">
                  {recommendations.map((rec: any) => {
                    const a = rec.entry;
                    return (
                      <Link key={a.mal_id} href={animePath(a.mal_id, a.title)}>
                        <div className="group cursor-pointer">
                          <div className="aspect-[2/3] rounded-xl overflow-hidden bg-[var(--card)]">
                            <img src={a.images?.webp?.large_image_url} alt={a.title}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                          </div>
                          <p className="text-[10px] font-bold text-white mt-1.5 line-clamp-2 leading-snug">{a.title}</p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            )}
          </div>

          {/* RIGHT — Details sidebar ─────────────────────────────────── */}
          <div className="w-full lg:w-[280px] xl:w-[300px] shrink-0 space-y-4">

            {/* Details card — glass */}
            <div className="backdrop-blur-md bg-white/[0.03] border border-white/10 rounded-2xl p-4 shadow-lg shadow-black/20">
              <h3 className="font-heading font-black text-[13px] text-white mb-3 uppercase tracking-wide flex items-center gap-2">
                <span className="w-1 h-4 rounded-full bg-gradient-to-b from-[var(--pink)] to-[var(--purple)]" />
                Details
              </h3>
              <div className="space-y-2.5 text-[12px]">
                {[
                  ['Format', anime.type],
                  ['Status', anime.status],
                  ['Episodes', totalEps > 0 ? String(totalEps) : bestCount > 0 ? `${bestCount}` : '?'],
                  ['Duration', anime.duration],
                  ['Aired', anime.aired?.string],
                  ['Studios', anime.studios?.map((s: any) => s.name).join(', ')],
                  ['Source', anime.source],
                  ['Rating', anime.rating],
                ].filter(([, v]) => v).map(([label, val]) => (
                  <div key={label} className="flex justify-between gap-2">
                    <span className="text-white/40 shrink-0">{label}</span>
                    <span className="font-bold text-white text-right truncate">{val}</span>
                  </div>
                ))}
              </div>

              {watchedCount > 0 && (
                <div className="mt-4 pt-3 border-t border-[var(--border)]">
                  <div className="flex justify-between text-[10px] mb-1.5">
                    <span className="text-[var(--text3)] font-bold">Your Progress</span>
                    <span className="text-[#06d6a0] font-black">{watchedPct}%</span>
                  </div>
                  <div className="h-1.5 bg-[var(--bg3)] rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-[#06d6a0] to-[var(--blue)] rounded-full transition-all duration-500"
                      style={{ width: `${watchedPct}%` }} />
                  </div>
                  <p className="text-[10px] text-[var(--text3)] mt-1">{watchedCount} / {totalEps} episodes watched</p>
                </div>
              )}

              {anime.genres?.length > 0 && (
                <div className="mt-3 pt-3 border-t border-[var(--border)]">
                  <h4 className="font-bold text-[10px] text-[var(--text3)] uppercase tracking-widest mb-2">Genres</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {anime.genres.map((g: any) => (
                      <Link key={g.mal_id} href={`/genre/${g.mal_id}`}>
                        <span className="bg-[var(--bg3)] text-[var(--text2)] px-2 py-1 rounded-lg text-[10px] font-bold hover:bg-[var(--pink)]/20 hover:text-[var(--pink)] transition-colors cursor-pointer">{g.name}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-3 pt-3 border-t border-[var(--border)]">
                <h4 className="font-bold text-[10px] text-[var(--text3)] uppercase tracking-widest mb-2 flex items-center gap-1.5">
                  <Share2 className="w-3 h-3" /> Share
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {shareLinks.map(link => (
                    <a key={link.label} href={link.href} target="_blank" rel="noopener noreferrer"
                      style={{ borderColor: link.color + '40', color: link.color }}
                      className="px-2.5 py-1 rounded-lg text-[10px] font-bold border bg-white/5 hover:bg-white/10 transition-all">
                      {link.label}
                    </a>
                  ))}
                  <button onClick={() => navigator.clipboard.writeText(pageUrl)}
                    className="px-2.5 py-1 rounded-lg text-[10px] font-bold border border-white/20 text-white bg-white/5 hover:bg-white/10 transition-all">
                    Copy
                  </button>
                </div>
              </div>
            </div>

            <div id="detail-ad" className="min-h-[1px] overflow-hidden"
              ref={el => { if (el && (window as any).KamiAds) (window as any).KamiAds.loadInPagePush('detail-ad'); }} />

            {/* Adsterra Native Banner — ID is fixed by their script, don't rename */}
            <div id="container-246d201d05be7eb163a939228e4f4e1c" className="mt-3 min-h-[1px]"
              ref={el => { if (el && (window as any).KamiAds) (window as any).KamiAds.loadNativeBanner('anime-native'); }} />

            <div id="banner-300x250-detail" className="mt-3 min-h-[1px] flex justify-center overflow-hidden"
              ref={el => { if (el && (window as any).KamiAds) (window as any).KamiAds.loadBannerAd('banner-300x250-detail'); }} />

            <div id="banner-160x300" className="mt-3 min-h-[1px] flex justify-center overflow-hidden"
              ref={el => { if (el && (window as any).KamiAds) (window as any).KamiAds.loadBannerAd('banner-160x300'); }} />

          </div>
        </div>
      </div>

      {/* ══ TRAILER MODAL ════════════════════════════════════════════ */}
      {showTrailer && anime.trailer?.youtube_id && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4" onClick={() => setShowTrailer(false)}>
          <div className="w-full max-w-3xl aspect-video rounded-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <iframe
              src={`https://www.youtube.com/embed/${anime.trailer.youtube_id}?autoplay=1`}
              className="w-full h-full border-0"
              allow="autoplay; fullscreen"
              allowFullScreen
            />
          </div>
          <button onClick={() => setShowTrailer(false)}
            className="absolute top-4 right-4 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white text-xl">✕</button>
        </div>
      )}
    </div>
  );
}
