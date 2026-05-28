import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useRoute, Link, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { useAnimeDetail, useAnimeEpisodes, useAnimeRecommendations } from '@/lib/jikan';
import { useWatchlist } from '@/hooks/useWatchlist';
import { useWatchHistory } from '@/hooks/useWatchHistory';
import { useEpisodeProgress } from '@/hooks/useEpisodeProgress';
import { useSEO } from '@/hooks/useSEO';
import { getNextAiring, getAnimeRelations } from '@/lib/anilist';
import {
  Play, Plus, Check, Star, Timer, CheckCircle2, Circle, Share2,
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

interface ServerEntry { id: string; name: string; url: string; badge?: string; }

// ── Component ─────────────────────────────────────────────────────────
export default function AnimeDetail() {
  const [, params]   = useRoute('/anime/:id');
  const [, navigate] = useLocation();
  const id = params?.id || '';

  // ── Data ──────────────────────────────────────────────────────────
  const { data: detail,   isLoading: detailLoading } = useAnimeDetail(id);
  const { data: episodes, isLoading: episodesLoading } = useAnimeEpisodes(id);
  const { data: recs }                                  = useAnimeRecommendations(id);
  const { toggleWatchlist, isInWatchlist }              = useWatchlist();
  const { getRecentAnime }                              = useWatchHistory();
  const { toggleWatched, isWatched, getWatchedCount }  = useEpisodeProgress();

  const { data: charsData } = useQuery({
    queryKey: ['anime', id, 'characters'],
    queryFn: async () => { const r = await fetch(`https://api.jikan.moe/v4/anime/${id}/characters`); return r.ok ? r.json() : { data: [] }; },
    enabled: !!id, staleTime: 30 * 60 * 1000,
  });
  const { data: relations } = useQuery({
    queryKey: ['anime', id, 'relations'],
    queryFn: () => getAnimeRelations(id),
    enabled: !!id, staleTime: 60 * 60 * 1000,
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
    title: anime.title, description: anime.synopsis?.slice(0, 160),
    image: anime.images?.webp?.large_image_url, type: 'video.other',
  } : {});

  useEffect(() => { setEpPage(1); setActiveEp(null); }, [id]);

  // ── Airing countdown ─────────────────────────────────────────────
  useEffect(() => {
    if (!anime || anime.status !== 'Currently Airing') return;
    getNextAiring(id).then(setNextAiring).catch(() => {});
  }, [id, anime?.status]);

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
    const lang = dub ? 'dub' : 'sub';

    // Start with MAL immediately
    setActiveSource(mpMal(id, epNum, lang));
    setLoadingPlayer(false);

    // Resolve AniList in background for Alt server
    if (!alId) {
      resolveAnilistId(id).then(al => { if (al) setAlId(al); });
    }

    // Scroll player into view
    setTimeout(() => { playerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 100);

    // Error timer
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setPlayerError(true), 12000);
  }, [id, dub, alId]);

  const onIframeLoad = useCallback(() => {
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    setPlayerError(false);
  }, []);

  const switchServer = (srv: ServerEntry) => {
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
    const servers: ServerEntry[] = [
      { id: 'mp-mal', name: 'MegaPlay', url: mpMal(id, activeEp, lang) },
    ];
    if (alId) servers.push({ id: 'mp-ani', name: 'MegaPlay Alt', url: mpAni(alId, activeEp, lang) });
    return servers;
  }, [activeEp, dub, id, alId]);

  const serverList = buildServers();

  // Dub toggle rebuilds active source
  useEffect(() => {
    if (!activeEp) return;
    const lang = dub ? 'dub' : 'sub';
    if (selectedSrv === 'mp-ani' && alId) setActiveSource(mpAni(alId, activeEp, lang));
    else setActiveSource(mpMal(id, activeEp, lang));
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

      {/* ══ HERO BANNER ══════════════════════════════════════════════ */}
      <div className="relative h-[260px] md:h-[340px] w-full overflow-hidden">
        <img
          src={anime.trailer?.images?.maximum_image_url || anime.images?.webp?.large_image_url}
          alt="" className="absolute inset-0 w-full h-full object-cover blur-sm opacity-30"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg)] via-[var(--bg)]/70 to-transparent" />
        {/* Subtle grain overlay */}
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")' }} />

        <div className="absolute bottom-0 left-0 right-0 px-4 md:px-8 pb-4 flex gap-5 md:gap-7 items-end max-w-7xl mx-auto">
          {/* Cover art */}
          <img
            src={anime.images?.webp?.large_image_url}
            alt={anime.title}
            className="w-28 md:w-40 rounded-xl shadow-2xl shrink-0 -mb-8 md:-mb-12 z-10 border border-white/10"
          />
          <div className="flex-1 z-10 pb-3 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              {anime.type && <span className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-md bg-white/10 text-white/60">{anime.type}</span>}
              {anime.status === 'Currently Airing' && (
                <span className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-md bg-[var(--pink)]/20 text-[var(--pink)] flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--pink)] animate-pulse inline-block" /> Live
                </span>
              )}
              {anime.score && (
                <span className="text-[9px] font-black px-2 py-1 rounded-md bg-[var(--gold)]/15 text-[var(--gold)] flex items-center gap-1">
                  <Star className="w-2.5 h-2.5 fill-current" /> {anime.score}
                </span>
              )}
            </div>
            <h1 className="text-xl md:text-3xl font-heading font-black text-white leading-tight mb-1 truncate">{anime.title}</h1>
            {anime.title_english && anime.title_english !== anime.title && (
              <p className="text-[11px] text-[var(--text3)] font-mono mb-2 truncate">{anime.title_english}</p>
            )}
            <div className="flex flex-wrap gap-1.5 mb-3">
              {anime.genres?.slice(0, 4).map((g: any) => (
                <Link key={g.mal_id} href={`/genre/${g.mal_id}`}>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border border-white/15 text-[var(--text2)] hover:border-[var(--pink)]/50 hover:text-[var(--pink)] transition-colors cursor-pointer">
                    {g.name}
                  </span>
                </Link>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => loadEpisode(String(resumeEp || 1))}
                className="bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white px-5 py-2 rounded-xl text-[12px] font-black hover:brightness-110 transition-all flex items-center gap-2 shadow-lg shadow-[var(--pink)]/20"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                {resumeEp ? `Resume EP ${resumeEp}` : 'Watch Now'}
              </button>
              <button
                onClick={() => toggleWatchlist({ mal_id: anime.mal_id, title: anime.title, image_url: anime.images?.webp?.large_image_url || '', episodes: anime.episodes, score: anime.score })}
                className={`px-4 py-2 rounded-xl text-[12px] font-bold border transition-all flex items-center gap-2 ${isSaved ? 'bg-[var(--green)]/15 border-[var(--green)]/40 text-[var(--green)]' : 'bg-white/5 border-white/15 text-white hover:bg-white/10'}`}
              >
                {isSaved ? <><Check className="w-3.5 h-3.5" /> Saved</> : <><Plus className="w-3.5 h-3.5" /> Watchlist</>}
              </button>
              {anime.trailer?.youtube_id && (
                <button onClick={() => setShowTrailer(true)}
                  className="px-4 py-2 rounded-xl text-[12px] font-bold border border-white/15 text-white bg-white/5 hover:bg-white/10 transition-all">
                  ▶ Trailer
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ══ MAIN BODY ════════════════════════════════════════════════ */}
      <div className="max-w-7xl mx-auto px-4 md:px-8 mt-12 md:mt-16">

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

        {/* ── Two-column layout ─────────────────────────────────────── */}
        <div className="flex flex-col lg:flex-row gap-6">

          {/* LEFT — Player + Info ────────────────────────────────────── */}
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
                    {/* Sub/Dub */}
                    <div className="flex bg-[var(--bg3)] border border-[var(--border)] rounded-lg overflow-hidden text-[11px] font-black">
                      <button onClick={() => setDub(false)} className={`px-3 py-1.5 transition-colors ${!dub ? 'bg-[var(--pink)] text-white' : 'text-[var(--text3)] hover:text-white'}`}>SUB</button>
                      <button onClick={() => setDub(true)}  className={`px-3 py-1.5 transition-colors ${ dub ? 'bg-[var(--purple)] text-white' : 'text-[var(--text3)] hover:text-white'}`}>DUB</button>
                    </div>

                    {/* Server picker */}
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

                    {/* Theater toggle */}
                    <button onClick={() => setTheaterMode(v => !v)}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border flex items-center gap-1 transition-all ${theaterMode ? 'bg-[var(--blue)]/15 border-[var(--blue)]/40 text-[var(--blue)]' : 'bg-[var(--bg3)] border-[var(--border)] text-[var(--text3)] hover:text-white'}`}>
                      {theaterMode ? <Minimize2 className="w-2.5 h-2.5" /> : <Maximize2 className="w-2.5 h-2.5" />}
                      Theater
                    </button>

                    {/* Open full page link */}
                    <Link href={`/watch/${id}/${activeEp}`} className="ml-auto">
                      <button className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-[var(--card)] border border-[var(--border)] text-[var(--text2)] hover:text-white transition-colors flex items-center gap-1">
                        <Maximize2 className="w-2.5 h-2.5" /> Full Page
                      </button>
                    </Link>
                  </div>
                </div>
              ) : (
                /* Placeholder when no episode playing */
                <div
                  className="relative rounded-2xl overflow-hidden border border-[var(--border)] cursor-pointer group"
                  style={{ paddingTop: '42%' }}
                  onClick={() => loadEpisode(String(resumeEp || 1))}
                >
                  <img
                    src={anime.trailer?.images?.maximum_image_url || anime.images?.webp?.large_image_url}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 opacity-60"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                    <div className="w-14 h-14 bg-[var(--pink)] rounded-full flex items-center justify-center shadow-2xl shadow-[var(--pink)]/40 group-hover:scale-110 transition-transform">
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

            {/* ── Synopsis ───────────────────────────────────────────── */}
            <section>
              <h2 className="text-[13px] font-black text-[var(--text3)] uppercase tracking-widest mb-2">Synopsis</h2>
              <p className="text-[13px] text-[var(--text2)] leading-relaxed">{anime.synopsis}</p>
            </section>

            {/* ── Relations ─────────────────────────────────────────── */}
            {relationsFiltered.length > 0 && (
              <section>
                <h2 className="text-[13px] font-black text-[var(--text3)] uppercase tracking-widest mb-3">Related Anime</h2>
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
                    return malId ? <Link key={node?.id} href={`/anime/${malId}`}>{card}</Link> : <div key={node?.id}>{card}</div>;
                  })}
                </div>
              </section>
            )}

            {/* ── Characters ────────────────────────────────────────── */}
            {characters.length > 0 && (
              <section>
                <h2 className="text-[13px] font-black text-[var(--text3)] uppercase tracking-widest mb-3">Characters</h2>
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
                <h2 className="text-[13px] font-black text-[var(--text3)] uppercase tracking-widest mb-3">You Might Also Like</h2>
                <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-3">
                  {recommendations.map((rec: any) => {
                    const a = rec.entry;
                    return (
                      <Link key={a.mal_id} href={`/anime/${a.mal_id}`}>
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

          {/* RIGHT — Details + Episodes ──────────────────────────────── */}
          <div className="w-full lg:w-[300px] xl:w-[320px] shrink-0 space-y-4">

            {/* Details card */}
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4">
              <h3 className="font-heading font-black text-[13px] text-white mb-3 uppercase tracking-wide">Details</h3>
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
                    <span className="text-[var(--text3)] shrink-0">{label}</span>
                    <span className="font-bold text-white text-right truncate">{val}</span>
                  </div>
                ))}
              </div>

              {/* Progress bar */}
              {watchedCount > 0 && (
                <div className="mt-4 pt-3 border-t border-[var(--border)]">
                  <div className="flex justify-between text-[10px] mb-1.5">
                    <span className="text-[var(--text3)] font-bold">Your Progress</span>
                    <span className="text-[#06d6a0] font-black">{watchedPct}%</span>
                  </div>
                  <div className="h-1.5 bg-[var(--bg3)] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[#06d6a0] to-[var(--blue)] rounded-full transition-all duration-500"
                      style={{ width: `${watchedPct}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-[var(--text3)] mt-1">{watchedCount} / {totalEps} episodes watched</p>
                </div>
              )}

              {/* Genres */}
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

              {/* Share */}
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

            {/* Ad slot */}
            <div id="detail-ad" className="min-h-[1px]"
              ref={el => { if (el && (window as any).KamiAds) (window as any).KamiAds.loadInPagePush('detail-ad'); }} />

            {/* ── Episode list ───────────────────────────────────────── */}
            <div ref={epListRef} className="bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
                <h3 className="font-heading font-black text-[13px] text-white">
                  Episodes
                  {totalEps > 0 && <span className="ml-1.5 text-[11px] font-normal text-[var(--text3)]">({totalEps})</span>}
                </h3>
                <div className="flex items-center gap-2">
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
                  <div className="max-h-[460px] overflow-y-auto">
                    {visibleEps.map((ep: any) => {
                      const isPlaying = activeEp === String(ep.mal_id);
                      const isLast    = resumeEp === ep.mal_id;
                      const watched   = isWatched(anime.mal_id, ep.mal_id);
                      return (
                        <div
                          key={ep.mal_id}
                          className={`flex items-center gap-2.5 px-3 py-2.5 border-b border-[var(--border)] last:border-b-0 transition-all group ${
                            isPlaying
                              ? 'bg-[var(--pink)]/10'
                              : isLast
                                ? 'bg-[var(--purple)]/5'
                                : 'hover:bg-[var(--bg3)]'
                          }`}
                        >
                          {/* Ep number / play indicator */}
                          <button
                            onClick={() => loadEpisode(String(ep.mal_id))}
                            className={`w-8 h-8 rounded-lg flex items-center justify-center font-mono font-black text-[10px] shrink-0 transition-all ${
                              isPlaying
                                ? 'bg-[var(--pink)] text-white'
                                : watched
                                  ? 'bg-[#06d6a0]/20 text-[#06d6a0] group-hover:bg-[var(--pink)]/20 group-hover:text-[var(--pink)]'
                                  : 'bg-[var(--bg3)] text-[var(--text3)] group-hover:bg-[var(--pink)]/20 group-hover:text-[var(--pink)]'
                            }`}
                          >
                            {isPlaying ? <Play className="w-3 h-3 fill-current" /> : ep.mal_id}
                          </button>

                          {/* Title */}
                          <button onClick={() => loadEpisode(String(ep.mal_id))} className="flex-1 text-left min-w-0">
                            <div className={`text-[11px] font-bold truncate ${isPlaying ? 'text-[var(--pink)]' : watched ? 'text-[#06d6a0]' : 'text-white'}`}>
                              {ep.title || `Episode ${ep.mal_id}`}
                            </div>
                            {isPlaying && <div className="text-[9px] text-[var(--pink)]/70 font-bold">Now Playing</div>}
                            {isLast && !isPlaying && <div className="text-[9px] text-[var(--text3)]">Last watched</div>}
                          </button>

                          {/* Watched toggle */}
                          <button
                            onClick={e => { e.stopPropagation(); toggleWatched(anime.mal_id, ep.mal_id); }}
                            title={watched ? 'Mark unwatched' : 'Mark watched'}
                            className={`shrink-0 p-1 rounded transition-all ${watched ? 'text-[#06d6a0] hover:text-[var(--text3)]' : 'text-[var(--text3)] hover:text-[#06d6a0] opacity-0 group-hover:opacity-100'}`}
                          >
                            {watched ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-1.5 p-3 border-t border-[var(--border)] flex-wrap">
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                        <button key={p} onClick={() => setEpPage(p)}
                          className={`w-8 h-8 rounded-lg text-[11px] font-bold transition-all ${p === epPage ? 'bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white' : 'bg-[var(--bg3)] text-[var(--text2)] hover:text-white'}`}>
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
