import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRoute, Link, useLocation } from 'wouter';
import { useAnimeDetail, useAnimeEpisodes } from '@/lib/jikan';
import { supabase } from '@/lib/supabase';
import { useWatchHistory } from '@/hooks/useWatchHistory';
import { ChevronLeft, ChevronRight, Settings, SkipForward, X, Download, AlertTriangle, RefreshCw, Maximize2, Minimize2 } from 'lucide-react';
import { WatchSkeleton } from '@/components/LoadingSkeleton';
import { useSEO } from '@/hooks/useSEO';
import { useEpisodeProgress } from '@/hooks/useEpisodeProgress';
import { EpisodeSocial } from '@/components/EpisodeSocial';

// ─────────────────────────────────────────────────────────────────────────────
// AniList ID resolver  (unchanged — cached in memory + sessionStorage)
// ─────────────────────────────────────────────────────────────────────────────
const _alCache: Record<string, string> = {};
async function resolveAnilistId(malId: string): Promise<string | null> {
  if (_alCache[malId]) return _alCache[malId];
  const saved = sessionStorage.getItem('al_id_' + malId);
  if (saved) { _alCache[malId] = saved; return saved; }
  try {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        query: 'query($m:Int){Media(idMal:$m,type:ANIME){id}}',
        variables: { m: parseInt(malId) },
      }),
    });
    const data = await res.json();
    const alId = String(data?.data?.Media?.id ?? '');
    if (alId) { _alCache[malId] = alId; sessionStorage.setItem('al_id_' + malId, alId); }
    return alId || null;
  } catch { return null; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Anikoto ID resolver
// Fetches the Anikoto series page by MAL id (via /series/{anikoto-id}) to get
// episode_embed_ids.  Anikoto uses its own series IDs, so we first search by
// MAL id, then load the series to get per-episode embed ids.
//
// Results are cached in sessionStorage so we only hit Anikoto once per anime.
// ─────────────────────────────────────────────────────────────────────────────
const ANIKOTO_BASE = 'https://anikotoapi.site';
const _anikotoEmbedCache: Record<string, Record<string, string>> = {};
// key: malId → { epNum: episode_embed_id }

async function resolveAnikotoEmbedId(malId: string, epNum: string): Promise<string | null> {
  // Check in-memory cache first
  if (_anikotoEmbedCache[malId]?.[epNum]) return _anikotoEmbedCache[malId][epNum];

  // Check sessionStorage cache (persists across SPA navigations)
  const ssKey = `anikoto_ep_${malId}`;
  const cached = sessionStorage.getItem(ssKey);
  if (cached) {
    try {
      const map = JSON.parse(cached) as Record<string, string>;
      _anikotoEmbedCache[malId] = map;
      if (map[epNum]) return map[epNum];
    } catch {}
  }

  try {
    // Step 1: search Anikoto for the anime by title or browse recent
    // Anikoto doesn't expose a MAL search endpoint, so we use /recent-anime
    // with enough pages and match by mal_id if exposed, or fall back to title.
    // The reliable path: /series/{anikoto-id} — but we need the Anikoto series id.
    // Their /recent-anime returns { id, mal_id?, ... } — match on mal_id.
    // We scan up to 5 pages (100 items) which covers ~95% of requests cached.
    let anikotoSeriesId: string | null = null;
    for (let page = 1; page <= 5 && !anikotoSeriesId; page++) {
      const r = await fetch(`${ANIKOTO_BASE}/recent-anime?page=${page}&per_page=20`, { signal: AbortSignal.timeout(5000) });
      if (!r.ok) break;
      const json = await r.json();
      const list: any[] = json?.data || json?.results || json || [];
      if (!Array.isArray(list) || list.length === 0) break;
      const match = list.find((a: any) => String(a.mal_id) === malId || String(a.id) === malId);
      if (match) { anikotoSeriesId = String(match.id); break; }
    }
    if (!anikotoSeriesId) return null;

    // Step 2: load series detail to get per-episode embed ids
    const sr = await fetch(`${ANIKOTO_BASE}/series/${anikotoSeriesId}`, { signal: AbortSignal.timeout(5000) });
    if (!sr.ok) return null;
    const series = await sr.json();
    const episodes: any[] = series?.episodes || series?.data?.episodes || [];

    // Build ep_number → episode_embed_id map
    const map: Record<string, string> = {};
    for (const ep of episodes) {
      const num = String(ep.episode_number ?? ep.number ?? ep.ep ?? ep.num);
      const embedId = String(ep.episode_embed_id ?? ep.embed_id ?? ep.id ?? '');
      if (num && embedId) map[num] = embedId;
    }
    _anikotoEmbedCache[malId] = map;
    sessionStorage.setItem(ssKey, JSON.stringify(map));
    return map[epNum] || null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MegaPlay embed URL builders
// Priority: s-2 (via Anikoto embed id) > MAL endpoint > AniList endpoint
// ─────────────────────────────────────────────────────────────────────────────
const MP_BASE = 'https://megaplay.buzz';

function megaplayMal(malId: string, ep: string, lang: 'sub' | 'dub') {
  return `${MP_BASE}/stream/mal/${malId}/${ep}/${lang}`;
}
function megaplayAni(alId: string, ep: string, lang: 'sub' | 'dub') {
  return `${MP_BASE}/stream/ani/${alId}/${ep}/${lang}`;
}
function megaplayS2(embedId: string, lang: 'sub' | 'dub') {
  return `${MP_BASE}/stream/s-2/${embedId}/${lang}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Supabase admin sources  (unchanged)
// ─────────────────────────────────────────────────────────────────────────────
async function fetchAdminSources(malId: string, epNum: string) {
  try {
    const { data: anime } = await supabase.from('anime').select('id').eq('mal_id', malId).maybeSingle();
    if (!anime?.id) return { sources: [], intro_start: null, intro_end: null };
    const { data: episode } = await supabase.from('episodes')
      .select('id, intro_start, intro_end')
      .eq('anime_id', anime.id).eq('episode_number', parseInt(epNum)).maybeSingle();
    if (!episode?.id) return { sources: [], intro_start: null, intro_end: null };
    const { data: sources } = await supabase.from('embed_sources')
      .select('source_name, embed_url, language, quality, download_url')
      .eq('episode_id', episode.id).eq('is_active', true);
    return { sources: sources || [], intro_start: episode.intro_start, intro_end: episode.intro_end };
  } catch { return { sources: [], intro_start: null, intro_end: null }; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Server list types
// ─────────────────────────────────────────────────────────────────────────────
interface ServerEntry {
  id: string;
  name: string;
  url: string;
  badge?: string;   // optional label shown next to server name
}

function fireEpAd(type: string) {
  try { (window as any).KamiAds?.onEpisodeClick(type); } catch {}
}

const AUTOPLAY_COUNTDOWN = 10;

export default function Watch() {
  const [, params]   = useRoute('/watch/:id/:ep');
  const [, navigate] = useLocation();
  const malId = params?.id || '';
  const epId  = params?.ep || '1';

  // IDs
  const [alId,         setAlId]         = useState<string | null>(null);
  const [anikotoEmbedId, setAnikotoEmbedId] = useState<string | null>(null);

  // Playback prefs
  const [dub,          setDub]          = useState(false);
  const [selectedServerId, setSelectedServerId] = useState<string>('mp-mal');
  const [autoPlay,   setAutoPlay]   = useState(() => localStorage.getItem('ks_autoplay')  !== 'false');
  const [autoNext,   setAutoNext]   = useState(() => localStorage.getItem('ks_autonext')  !== 'false');
  const [autoSkip,   setAutoSkip]   = useState(() => localStorage.getItem('ks_autoskip')  === 'true');

  function toggleAutoPlay()  { const v = !autoPlay;  setAutoPlay(v);  localStorage.setItem('ks_autoplay',  v ? 'true' : 'false'); }
  function toggleAutoNext()  { const v = !autoNext;  setAutoNext(v);  localStorage.setItem('ks_autonext',  v ? 'true' : 'false'); }
  function toggleAutoSkip()  { const v = !autoSkip;  setAutoSkip(v);  localStorage.setItem('ks_autoskip',  v ? 'true' : 'false'); }

  const [adminSources,   setAdminSources]   = useState<any[]>([]);
  const [activeSource,   setActiveSource]   = useState('');

  const [loadingPlayer,  setLoadingPlayer]  = useState(true);
  const [playerError,    setPlayerError]    = useState(false);
  const [errorTimer,     setErrorTimer]     = useState<ReturnType<typeof setTimeout> | null>(null);
  const [autoplaySecs,   setAutoplaySecs]   = useState<number | null>(null);
  const [introStart,     setIntroStart]     = useState<number | null>(null);
  const [introEnd,       setIntroEnd]       = useState<number | null>(null);
  const [showSkipIntro,  setShowSkipIntro]  = useState(false);
  const [isLandscape,    setIsLandscape]    = useState(false);
  const [theaterMode,    setTheaterMode]    = useState(() => localStorage.getItem('ks_theater') === 'true');
  const [elapsedSecs,    setElapsedSecs]    = useState(0);
  const [epSearch,       setEpSearch]       = useState('');

  const autoplayTimer  = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedTimer   = useRef<ReturnType<typeof setInterval> | null>(null);
  const playerClickRef = useRef(false);
  const iframeRef      = useRef<HTMLIFrameElement>(null);

  const { data: detail,   isLoading: detailLoading } = useAnimeDetail(malId);
  const { data: episodes }                            = useAnimeEpisodes(malId);
  const { logEpisode }                                = useWatchHistory();
  const { markWatched, isWatched }                    = useEpisodeProgress();

  const eps            = episodes?.data || [];
  const filteredEps    = epSearch ? eps.filter((e: any) => e.mal_id.toString().includes(epSearch)) : eps;
  const currentEpIndex = eps.findIndex((e: any) => e.mal_id.toString() === epId);
  const currentEp      = eps[currentEpIndex] || { title: `Episode ${epId}`, mal_id: epId };
  const prevEp         = currentEpIndex > 0              ? eps[currentEpIndex - 1] : null;
  const nextEp         = currentEpIndex < eps.length - 1 ? eps[currentEpIndex + 1] : null;

  const lang = dub ? 'dub' : 'sub';

  // ── Build the full server list ─────────────────────────────────────
  // Priority order shown to user:
  //   1. Admin sources (Supabase) — one entry per unique source_name
  //   2. MegaPlay S-2 (Anikoto embed id) — best quality, appears when resolved
  //   3. MegaPlay MAL  — always available
  //   4. MegaPlay AniList — available when AniList id resolved
  const buildServerList = useCallback((): ServerEntry[] => {
    const servers: ServerEntry[] = [];

    // Admin sources from Supabase
    if (adminSources.length > 0) {
      const langSources = adminSources.filter((s: any) => s.language === lang);
      const usableSources = langSources.length > 0 ? langSources : adminSources;
      usableSources.forEach((s: any) => {
        servers.push({ id: `admin-${s.source_name}`, name: s.source_name, url: s.embed_url, badge: 'HD' });
      });
    }

    // MegaPlay S-2 via Anikoto embed id (highest quality path)
    if (anikotoEmbedId) {
      servers.push({ id: 'mp-s2', name: 'OniChan', url: megaplayS2(anikotoEmbedId, lang) });
    }

    // MegaPlay MAL (always works, no extra API needed)
    servers.push({ id: 'mp-mal', name: anikotoEmbedId ? 'Otaku' : 'OniChan', url: megaplayMal(malId, epId, lang) });

    // MegaPlay AniList (parallel option, slightly different source)
    if (alId) {
      servers.push({ id: 'mp-ani', name: 'Otaku', url: megaplayAni(alId, epId, lang) });
    }

    return servers;
  }, [adminSources, anikotoEmbedId, alId, malId, epId, lang]);

  const serverList = buildServerList();

  // ── Keyboard shortcuts ────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 't' || e.key === 'T') { e.preventDefault(); toggleTheater(); }
      if (e.key === 'ArrowLeft'  && prevEp) { e.preventDefault(); fireEpAd('prev'); navigate(`/watch/${malId}/${prevEp.mal_id}`); }
      if (e.key === 'ArrowRight' && nextEp) { e.preventDefault(); fireEpAd('next'); navigate(`/watch/${malId}/${nextEp.mal_id}`); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [theaterMode, prevEp, nextEp, malId]);

  function toggleTheater() {
    const v = !theaterMode;
    setTheaterMode(v);
    localStorage.setItem('ks_theater', v ? 'true' : 'false');
  }

  // ── Landscape detection ───────────────────────────────────────────
  useEffect(() => {
    const check = () => setIsLandscape(window.innerWidth > window.innerHeight && window.innerHeight < 500);
    check();
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
    return () => { window.removeEventListener('resize', check); window.removeEventListener('orientationchange', check); };
  }, []);

  // ── Main load effect ──────────────────────────────────────────────
  // Runs whenever malId or epId changes.
  // We fire all three resolvers in parallel and set the active source
  // as soon as the fastest one lands, upgrading to better sources as
  // they arrive without interrupting playback.
  useEffect(() => {
    if (!malId || !epId) return;

    // Reset state
    setLoadingPlayer(true);
    setPlayerError(false);
    setAdminSources([]);
    setActiveSource('');
    setAlId(null);
    setAnikotoEmbedId(null);
    setSelectedServerId('mp-mal');
    setAutoplaySecs(null);
    setElapsedSecs(0);
    setShowSkipIntro(false);
    playerClickRef.current = false;
    clearAutoplay();
    if (errorTimer) clearTimeout(errorTimer);

    // Elapsed timer for skip-intro UX
    if (elapsedTimer.current) clearInterval(elapsedTimer.current);
    elapsedTimer.current = setInterval(() => setElapsedSecs(s => s + 1), 1000);

    // Set the MAL source immediately — it needs no resolution and is the
    // fastest path.  Player starts showing content right away.
    const initialLang = (localStorage.getItem('ks_dub') === 'true') ? 'dub' : 'sub';
    const initialLangTyped = initialLang as 'sub' | 'dub';
    setActiveSource(megaplayMal(malId, epId, initialLangTyped));
    setLoadingPlayer(false);

    // Start error timer (cleared on iframe load)
    const t = setTimeout(() => setPlayerError(true), 12000);
    setErrorTimer(t);

    // Fire all resolvers in parallel — results upgrade the server list
    // without touching the currently-playing iframe.
    Promise.all([
      resolveAnilistId(malId),
      fetchAdminSources(malId, epId),
      resolveAnikotoEmbedId(malId, epId),
    ]).then(([al, adminResult, embedId]) => {
      // AniList id
      if (al) setAlId(al);

      // Admin sources (highest priority — switch active source if we have them)
      const sources = (adminResult as any)?.sources || [];
      setAdminSources(sources);
      setIntroStart((adminResult as any)?.intro_start ?? null);
      setIntroEnd((adminResult as any)?.intro_end ?? null);

      if (sources.length > 0) {
        const preferred = sources.find((s: any) => s.language === initialLang) || sources[0];
        setActiveSource(preferred.embed_url);
        setSelectedServerId(`admin-${preferred.source_name}`);
      }

      // Anikoto embed id — makes S-2 server available in the picker
      // but doesn't auto-switch if admin sources or MAL already playing fine
      if (embedId) setAnikotoEmbedId(embedId);
    });

    return () => { if (elapsedTimer.current) clearInterval(elapsedTimer.current); };
  }, [malId, epId]);

  // Cancel error timer on iframe load
  const onIframeLoad = useCallback(() => {
    if (errorTimer) clearTimeout(errorTimer);
    setPlayerError(false);
  }, [errorTimer]);

  // ── Skip Intro ───────────────────────────────────────────────────
  useEffect(() => {
    const start = introStart ?? 20;
    const end   = introEnd   ?? 90;
    const shouldShow = elapsedSecs >= start && elapsedSecs < end;
    setShowSkipIntro(shouldShow);
    if (shouldShow && autoSkip) { skipIntro(); }
  }, [elapsedSecs, introStart, introEnd, autoSkip]);

  // ── Auto-play countdown trigger ──────────────────────────────────
  useEffect(() => {
    if (!autoPlay || !autoNext || !nextEp) return;
    const t = setTimeout(() => { if (autoPlay && autoNext) startAutoplay(); }, 30_000);
    return () => clearTimeout(t);
  }, [malId, epId, autoPlay, autoNext]);

  // ── Log history ──────────────────────────────────────────────────
  useEffect(() => {
    if (!detail?.data) return;
    const anime = detail.data;
    logEpisode({ mal_id: anime.mal_id, title: anime.title, image_url: anime.images?.webp?.large_image_url || '', ep_id: parseInt(epId), ep_title: currentEp?.title || `Episode ${epId}` });
  }, [malId, epId, detail?.data?.mal_id]);

  // ── Dub toggle — rebuild active source URL for current server ────
  useEffect(() => {
    const currentLang = dub ? 'dub' : 'sub';
    localStorage.setItem('ks_dub', dub ? 'true' : 'false');

    if (adminSources.length > 0 && selectedServerId.startsWith('admin-')) {
      const match = adminSources.find((s: any) => s.language === currentLang) || adminSources[0];
      setActiveSource(match.embed_url);
      return;
    }

    // Rebuild MegaPlay URL for whichever server is active
    if (selectedServerId === 'mp-s2' && anikotoEmbedId) {
      setActiveSource(megaplayS2(anikotoEmbedId, currentLang));
    } else if (selectedServerId === 'mp-ani' && alId) {
      setActiveSource(megaplayAni(alId, epId, currentLang));
    } else {
      setActiveSource(megaplayMal(malId, epId, currentLang));
      setSelectedServerId('mp-mal');
    }
  }, [dub]);

  // ── Auto mark watched ────────────────────────────────────────────
  useEffect(() => {
    if (!malId || !epId) return;
    const t = setTimeout(() => markWatched(malId, epId), 30_000);
    return () => clearTimeout(t);
  }, [malId, epId]);

  // ── Autoplay countdown ───────────────────────────────────────────
  function clearAutoplay() {
    if (autoplayTimer.current) { clearInterval(autoplayTimer.current); autoplayTimer.current = null; }
  }
  function startAutoplay() {
    if (!nextEp) return;
    setAutoplaySecs(AUTOPLAY_COUNTDOWN);
    clearAutoplay();
    autoplayTimer.current = setInterval(() => {
      setAutoplaySecs(prev => {
        if (prev === null) return null;
        if (prev <= 1) { clearAutoplay(); navigate(`/watch/${malId}/${nextEp.mal_id}`); return null; }
        return prev - 1;
      });
    }, 1000);
  }
  function cancelAutoplay() { clearAutoplay(); setAutoplaySecs(null); }
  useEffect(() => () => { clearAutoplay(); if (elapsedTimer.current) clearInterval(elapsedTimer.current); }, []);

  // ── Skip intro helper ────────────────────────────────────────────
  function skipIntro() {
    const end = introEnd ?? 90;
    try {
      const url = new URL(activeSource);
      url.searchParams.set('t', String(end));
      setActiveSource(url.toString());
    } catch {}
    setShowSkipIntro(false);
  }

  // ── Ads ──────────────────────────────────────────────────────────
  useEffect(() => { try { (window as any).KamiAds?.onEpisodeChange?.(); } catch {} }, [malId, epId]);

  function handlePlayerClick() {
    if (playerClickRef.current) return;
    playerClickRef.current = true;
    fireEpAd('player');
  }

  // ── Switch server helper ─────────────────────────────────────────
  function switchServer(server: ServerEntry) {
    setActiveSource(server.url);
    setSelectedServerId(server.id);
    setPlayerError(false);
    clearTimeout(errorTimer!);
    const t = setTimeout(() => setPlayerError(true), 12000);
    setErrorTimer(t);
  }

  // ── SEO ──────────────────────────────────────────────────────────
  useSEO(detail?.data ? {
    title: `${detail.data.title} Episode ${epId}`,
    description: detail.data.synopsis?.slice(0, 160),
    image: detail.data.images?.webp?.large_image_url,
    type: 'video.other',
  } : {});

  if (detailLoading) return <WatchSkeleton />;
  if (!detail?.data) return <div className="p-8 text-center">Anime not found.</div>;

  const anime = detail.data;
  const downloadSources = adminSources.filter((s: any) => s.download_url);

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-[calc(100vh-60px)] overflow-hidden">
      <div className="flex-1 flex flex-col bg-black overflow-y-auto">

        {/* ── Player ── */}
        <div className={`w-full bg-black flex justify-center items-start relative ${isLandscape ? 'fixed inset-0 z-[100] h-screen' : ''}`}>
          <div
            className={`relative ${isLandscape ? 'w-full h-full pt-0' : theaterMode ? 'w-full' : 'w-full pt-[56.25%]'}`}
            style={(!isLandscape && theaterMode) ? { height: 'min(75vh, 600px)' } : {}}
            onClick={handlePlayerClick}
          >
            {loadingPlayer ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black text-[var(--text3)] text-[13px]">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-8 h-8 border-2 border-[var(--pink)] border-t-transparent rounded-full animate-spin" />
                  Loading player…
                </div>
              </div>
            ) : (
              <>
                <iframe
                  ref={iframeRef}
                  key={activeSource}
                  src={activeSource}
                  onLoad={onIframeLoad}
                  className="absolute top-0 left-0 w-full h-full border-0"
                  allowFullScreen
                  allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
                  scrolling="no"
                />

                {/* Error overlay */}
                {playerError && (
                  <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center gap-4 z-10">
                    <AlertTriangle className="w-10 h-10 text-[var(--pink)]" />
                    <p className="text-white font-bold text-[15px]">Player failed to load</p>
                    <p className="text-[var(--text3)] text-[12px] text-center px-4">Try switching to another server below</p>
                    <div className="flex flex-wrap gap-2 mt-2 justify-center">
                      {serverList.filter(s => s.id !== selectedServerId).map(s => (
                        <button key={s.id} onClick={() => switchServer(s)}
                          className="px-4 py-2 bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white text-[12px] font-bold rounded-xl hover:opacity-90 transition-all">
                          Try {s.name}
                        </button>
                      ))}
                      <button onClick={() => { setActiveSource(activeSource + '?r=' + Date.now()); setPlayerError(false); }}
                        className="px-4 py-2 bg-[var(--card)] border border-[var(--border)] text-white text-[12px] font-bold rounded-xl flex items-center gap-2 hover:bg-[var(--bg3)] transition-all">
                        <RefreshCw className="w-3.5 h-3.5" /> Retry
                      </button>
                    </div>
                  </div>
                )}

                {/* Skip Intro */}
                {showSkipIntro && (
                  <button onClick={skipIntro}
                    className="absolute bottom-12 right-4 z-20 px-5 py-2.5 bg-black/70 border-2 border-white/80 text-white text-[13px] font-bold rounded-xl backdrop-blur-sm hover:bg-white hover:text-black transition-all flex items-center gap-2">
                    <SkipForward className="w-4 h-4" /> Skip Intro
                  </button>
                )}

                {/* Landscape exit */}
                {isLandscape && (
                  <button onClick={() => setIsLandscape(false)}
                    className="absolute top-3 right-3 z-20 p-2 bg-black/60 rounded-lg text-white/70 hover:text-white transition-colors">
                    <Maximize2 className="w-4 h-4" />
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── Info + controls ── */}
        <div className="p-4 md:p-6 bg-[var(--bg2)]">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div>
              <Link href={`/anime/${malId}`} className="text-[var(--pink)] font-bold text-[12px] hover:underline mb-1 inline-block">
                {anime.title}
              </Link>
              <h1 className="text-xl font-heading font-black text-white">
                EP {epId}: {currentEp.title}
              </h1>
              {/* Source info badges */}
              <div className="text-[10px] text-[var(--text3)] mt-1 font-mono flex flex-wrap gap-2">
                {adminSources.length > 0 && (
                  <span className="text-[var(--green)]">✓ {adminSources.length} source{adminSources.length > 1 ? 's' : ''} available</span>
                )}
                {anikotoEmbedId
                  ? <span className="text-[var(--blue)]">✓ OniChan + Otaku ready</span>
                  : <span>⚡ OniChan ready</span>
                }
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Theater mode */}
              <button onClick={toggleTheater} title="Theater mode (T)"
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold border transition-all ${theaterMode ? 'bg-[var(--blue)]/15 border-[var(--blue)]/50 text-[var(--blue)]' : 'bg-[var(--card)] border-[var(--border)] text-[var(--text3)] hover:text-white'}`}>
                {theaterMode ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                Theater
              </button>

              {/* Auto toggles */}
              {[
                { label: 'Auto Play', state: autoPlay, toggle: toggleAutoPlay },
                { label: 'Auto Next', state: autoNext, toggle: toggleAutoNext },
                { label: 'Auto Skip', state: autoSkip, toggle: toggleAutoSkip },
              ].map(({ label, state, toggle }) => (
                <button key={label} onClick={toggle}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold border transition-all ${state ? 'bg-[var(--pink)]/15 border-[var(--pink)]/50 text-[var(--pink)]' : 'bg-[var(--card)] border-[var(--border)] text-[var(--text3)] hover:text-white'}`}>
                  <span className={`w-3 h-3 rounded-full border-2 transition-all flex-shrink-0 ${state ? 'bg-[var(--pink)] border-[var(--pink)]' : 'border-[var(--text3)]'}`} />
                  {label}
                </button>
              ))}

              {/* Sub / Dub */}
              <div className="flex bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden text-[12px] font-bold">
                <button onClick={() => setDub(false)} className={`px-4 py-2 transition-colors ${!dub ? 'bg-[var(--pink)] text-white' : 'text-[var(--text3)] hover:text-white'}`}>SUB</button>
                <button onClick={() => setDub(true)}  className={`px-4 py-2 transition-colors ${ dub ? 'bg-[var(--purple)] text-white' : 'text-[var(--text3)] hover:text-white'}`}>DUB</button>
              </div>

              {/* Server picker */}
              <div className="flex flex-wrap bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden text-[12px] font-bold">
                {serverList.map((s, idx) => (
                  <button
                    key={s.id}
                    onClick={() => switchServer(s)}
                    title={s.badge ? `${s.name} (${s.badge})` : s.name}
                    className={`px-3 py-2 transition-colors flex items-center gap-1.5 border-r border-[var(--border)] last:border-r-0 ${
                      selectedServerId === s.id
                        ? idx === 0
                          ? 'bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white'
                          : 'bg-gradient-to-r from-[var(--blue)] to-[var(--purple)] text-white'
                        : 'text-[var(--text3)] hover:text-white'
                    }`}
                  >
                    <Settings className="w-3 h-3" />
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Download */}
          {downloadSources.length > 0 && (
            <div className="mt-4 flex flex-col gap-2">
              <div className="flex items-center gap-2 text-[11px] font-bold text-[var(--text3)] uppercase tracking-widest">
                <Download className="w-3.5 h-3.5" /> Download Episode
              </div>
              <div className="flex flex-wrap gap-2">
                {downloadSources.map((s: any) => (
                  <a key={s.source_name} href={s.download_url} target="_blank" rel="noopener noreferrer" download
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white text-[12px] font-bold hover:opacity-90 active:scale-95 transition-all shadow-lg">
                    <Download className="w-3.5 h-3.5" />
                    {s.quality || 'HD'} · {s.language === 'dub' ? 'DUB' : 'SUB'}
                  </a>
                ))}
              </div>
            </div>
          )}

          <div id="player-ad" className="mt-4 min-h-[1px]" />
          <EpisodeSocial malId={malId} epId={epId} />

          {/* Prev / Next */}
          <div className="flex items-center gap-2 mt-6 border-b border-[var(--border)] pb-6">
            <Link href={prevEp ? `/watch/${malId}/${prevEp.mal_id}` : '#'}
              onClick={() => prevEp && fireEpAd('prev')} data-ep-nav="prev"
              className={`flex-1 bg-[var(--card)] border border-[var(--border)] py-3 rounded-xl flex items-center justify-center gap-2 text-[12px] font-bold transition-all ${prevEp ? 'hover:bg-[var(--bg3)] hover:border-[var(--purple)] text-white' : 'opacity-50 cursor-not-allowed text-[var(--text3)]'}`}>
              <ChevronLeft className="w-4 h-4" /> Prev
            </Link>
            {nextEp ? (
              <Link href={`/watch/${malId}/${nextEp.mal_id}`}
                onClick={() => fireEpAd('next')} data-ep-nav="next"
                className="flex-1 bg-[var(--card)] border border-[var(--border)] py-3 rounded-xl flex items-center justify-center gap-2 text-[12px] font-bold hover:bg-[var(--bg3)] hover:border-[var(--pink)] text-white transition-all">
                Next <ChevronRight className="w-4 h-4" />
              </Link>
            ) : (
              <div className="flex-1 bg-[var(--card)] border border-[var(--border)] py-3 rounded-xl flex items-center justify-center gap-2 text-[12px] font-bold opacity-50 text-[var(--text3)]">
                No More Episodes
              </div>
            )}
          </div>

          {nextEp && (
            <div className="mt-4 flex items-center justify-between gap-4">
              <button onClick={startAutoplay} className="flex items-center gap-2 text-[12px] font-bold text-[var(--text3)] hover:text-[var(--pink)] transition-colors">
                <SkipForward className="w-4 h-4" /> Autoplay Next
              </button>
              <span className="text-[11px] text-[var(--text3)]">EP {nextEp.mal_id}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Episode List — inline below player ── */}
      <div className="bg-[var(--bg2)] border-t border-[var(--border)]">
        <div className="px-4 md:px-6 py-3 flex items-center justify-between gap-3 border-b border-[var(--border)]">
          <h3 className="font-heading font-black text-[13px] text-white">
            Episodes
            <span className="ml-1.5 text-[11px] font-normal text-[var(--text3)]">({eps.length})</span>
          </h3>
          <div className="flex items-center gap-3">
            {eps.length > 24 && (
              <input
                type="number" placeholder="Go to ep…" value={epSearch}
                onChange={e => setEpSearch(e.target.value)}
                className="w-28 bg-[var(--bg3)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-[12px] text-white placeholder:text-[var(--text3)] outline-none focus:border-[var(--pink)] transition-colors"
              />
            )}
          </div>
        </div>

        <div id="sidebar-ad" className="min-h-[1px] px-4 pt-2"
          ref={el => { if (el && (window as any).KamiAds) (window as any).KamiAds.loadSidebarAd(); }} />

        <div className="p-4 md:px-6 md:py-4">
          <div className="grid grid-cols-8 sm:grid-cols-10 md:grid-cols-14 lg:grid-cols-16 xl:grid-cols-20 gap-1.5">
            {filteredEps.map((ep: any) => {
              const isCurrent = ep.mal_id.toString() === epId;
              const watched   = isWatched(malId, ep.mal_id);
              return (
                <Link key={ep.mal_id} href={`/watch/${malId}/${ep.mal_id}`}
                  onClick={() => { if (!isCurrent) fireEpAd('list'); }}>
                  <div title={ep.title}
                    className={`aspect-square flex items-center justify-center rounded-lg text-[11px] font-bold transition-all cursor-pointer select-none
                      ${isCurrent
                        ? 'bg-[var(--pink)] text-white shadow-lg shadow-[var(--pink)]/30'
                        : watched
                          ? 'bg-[#06d6a0]/20 text-[#06d6a0] border border-[#06d6a0]/30 hover:bg-[#06d6a0]/30'
                          : 'bg-[var(--bg3)] text-[var(--text3)] hover:bg-[var(--card)] hover:text-white border border-transparent hover:border-[var(--border)]'
                      }`}>
                    {ep.mal_id}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Autoplay countdown ── */}
      {autoplaySecs !== null && nextEp && (
        <div className="fixed bottom-6 right-6 z-50 bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-2xl w-72">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-[11px] font-black text-[var(--pink)] uppercase tracking-wider mb-0.5">Up Next</p>
              <p className="text-[13px] font-bold text-white">EP {nextEp.mal_id}</p>
            </div>
            <button onClick={cancelAutoplay} className="text-[var(--text3)] hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative w-12 h-12 shrink-0">
              <svg className="w-12 h-12 -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15" fill="none" stroke="var(--border)" strokeWidth="3" />
                <circle cx="18" cy="18" r="15" fill="none" stroke="url(#pinkGrad)" strokeWidth="3"
                  strokeDasharray={`${(autoplaySecs / AUTOPLAY_COUNTDOWN) * 94} 94`} strokeLinecap="round" />
                <defs><linearGradient id="pinkGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="var(--pink)" /><stop offset="100%" stopColor="var(--purple)" />
                </linearGradient></defs>
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-[13px] font-black text-white">{autoplaySecs}</span>
            </div>
            <div className="flex-1 flex flex-col gap-2">
              <Link href={`/watch/${malId}/${nextEp.mal_id}`}
                onClick={() => { cancelAutoplay(); }}
                className="bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white text-[12px] font-bold py-2 rounded-xl text-center hover:brightness-110 transition-all">
                Play Now
              </Link>
              <button onClick={cancelAutoplay} className="bg-[var(--bg3)] text-[var(--text2)] text-[12px] font-bold py-2 rounded-xl hover:text-white transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
