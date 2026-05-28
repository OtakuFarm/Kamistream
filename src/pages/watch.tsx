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

// ── AniList ID resolver ───────────────────────────────────────────────
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

// ── Supabase embed sources ────────────────────────────────────────────
async function fetchAdminSources(malId: string, epNum: string) {
  try {
    const { data: anime } = await supabase.from('anime').select('id').eq('mal_id', malId).maybeSingle();
    if (!anime?.id) return [];
    const { data: episode } = await supabase.from('episodes')
      .select('id, intro_start, intro_end')
      .eq('anime_id', anime.id).eq('episode_number', parseInt(epNum)).maybeSingle();
    if (!episode?.id) return [];
    const { data: sources } = await supabase.from('embed_sources')
      .select('source_name, embed_url, language, quality, download_url')
      .eq('episode_id', episode.id).eq('is_active', true);
    return { sources: sources || [], intro_start: episode.intro_start, intro_end: episode.intro_end };
  } catch { return { sources: [], intro_start: null, intro_end: null }; }
}

function fireEpAd(type: string) {
  try { (window as any).KamiAds?.onEpisodeClick(type); } catch {}
}

type Ids = { mal: string; al: string | null };
const FALLBACK_SOURCES = [
  { id: 'onichan', name: 'OniChan', build: ({ al, mal }: Ids, ep: string, dub: boolean) => `https://vidnest.fun/anime/${al || mal}/${ep}/${dub ? 'dub' : 'sub'}` },
  { id: 'otaku',   name: 'Otaku',   build: ({ al, mal }: Ids, ep: string, dub: boolean) => `https://vidnest.fun/animepahe/${al || mal}/${ep}/${dub ? 'dub' : 'sub'}` },
];

const AUTOPLAY_COUNTDOWN = 10;

export default function Watch() {
  const [, params]   = useRoute('/watch/:id/:ep');
  const [, navigate] = useLocation();
  const malId = params?.id || '';
  const epId  = params?.ep || '1';

  const [alId,           setAlId]           = useState<string | null>(null);
  const [dub,            setDub]            = useState(false);
  const [selectedServerId, setSelectedServerId] = useState<string>('onichan');
  const [autoPlay,   setAutoPlay]   = useState(() => localStorage.getItem('ks_autoplay')  !== 'false');
  const [autoNext,   setAutoNext]   = useState(() => localStorage.getItem('ks_autonext')  !== 'false');
  const [autoSkip,   setAutoSkip]   = useState(() => localStorage.getItem('ks_autoskip')  === 'true');

  function toggleAutoPlay()  { const v = !autoPlay;  setAutoPlay(v);  localStorage.setItem('ks_autoplay',  v ? 'true' : 'false'); }
  function toggleAutoNext()  { const v = !autoNext;  setAutoNext(v);  localStorage.setItem('ks_autonext',  v ? 'true' : 'false'); }
  function toggleAutoSkip()  { const v = !autoSkip;  setAutoSkip(v);  localStorage.setItem('ks_autoskip',  v ? 'true' : 'false'); }
  const [adminSources,   setAdminSources]   = useState<any[]>([]);
  const [activeSource,   setActiveSource]   = useState('');
  const [showEpList,     setShowEpList]     = useState(false);
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

  function toggleTheater() {
    const v = !theaterMode;
    setTheaterMode(v);
    localStorage.setItem('ks_theater', v ? 'true' : 'false');
  }

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

  // ── Landscape detection ───────────────────────────────────────────
  useEffect(() => {
    const check = () => setIsLandscape(window.innerWidth > window.innerHeight && window.innerHeight < 500);
    check();
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
    return () => { window.removeEventListener('resize', check); window.removeEventListener('orientationchange', check); };
  }, []);

  // ── Load player ───────────────────────────────────────────────────
  useEffect(() => {
    if (!malId || !epId) return;
    setLoadingPlayer(true);
    setPlayerError(false);
    setAdminSources([]);
    setActiveSource('');
    setSelectedServerId('onichan');
    setAutoplaySecs(null);
    setElapsedSecs(0);
    setShowSkipIntro(false);
    playerClickRef.current = false;
    clearAutoplay();
    if (errorTimer) clearTimeout(errorTimer);

    // Start elapsed timer for skip intro
    if (elapsedTimer.current) clearInterval(elapsedTimer.current);
    elapsedTimer.current = setInterval(() => setElapsedSecs(s => s + 1), 1000);

    Promise.all([resolveAnilistId(malId), fetchAdminSources(malId, epId)]).then(([al, result]: any) => {
      setAlId(al);
      const sources = result?.sources || [];
      setAdminSources(sources);
      setIntroStart(result?.intro_start ?? null);
      setIntroEnd(result?.intro_end ?? null);

      if (sources.length > 0) {
        const preferred = sources.find((s: any) => s.language === (dub ? 'dub' : 'sub')) || sources[0];
        setActiveSource(preferred.embed_url);
      } else {
        setActiveSource(`https://vidnest.fun/anime/${al || malId}/${epId}/${dub ? 'dub' : 'sub'}`);
      }
      setLoadingPlayer(false);

      // Error detection: if player still blank after 12s show error
      const t = setTimeout(() => setPlayerError(true), 12000);
      setErrorTimer(t);
    });
    return () => { if (elapsedTimer.current) clearInterval(elapsedTimer.current); };
  }, [malId, epId]);

  // Cancel error timer on iframe load
  const onIframeLoad = useCallback(() => {
    if (errorTimer) clearTimeout(errorTimer);
    setPlayerError(false);
  }, [errorTimer]);

  // ── Skip Intro show/hide + auto-skip ────────────────────────────
  useEffect(() => {
    const start = introStart ?? 20;
    const end   = introEnd   ?? 90;
    const shouldShow = elapsedSecs >= start && elapsedSecs < end;
    setShowSkipIntro(shouldShow);
    if (shouldShow && autoSkip) { skipIntro(); }
  }, [elapsedSecs, introStart, introEnd, autoSkip]);

  // ── Auto-play: start countdown automatically after 30s ───────────
  useEffect(() => {
    if (!autoPlay || !autoNext || !nextEp) return;
    const t = setTimeout(() => { if (autoPlay && autoNext) startAutoplay(); }, 30_000);
    return () => clearTimeout(t);
  }, [malId, epId, autoPlay, autoNext]);

  // ── Log history ───────────────────────────────────────────────────
  useEffect(() => {
    if (!detail?.data) return;
    const anime = detail.data;
    logEpisode({ mal_id: anime.mal_id, title: anime.title, image_url: anime.images?.webp?.large_image_url || '', ep_id: parseInt(epId), ep_title: currentEp?.title || `Episode ${epId}` });
  }, [malId, epId, detail?.data?.mal_id]);

  // ── Dub toggle — rebuild URL for the currently selected server ───
  useEffect(() => {
    if (adminSources.length > 0) {
      const match = adminSources.find((s: any) => s.language === (dub ? 'dub' : 'sub')) || adminSources[0];
      setActiveSource(match.embed_url);
    } else if (alId !== null && alId !== undefined) {
      const srv = FALLBACK_SOURCES.find(s => s.id === selectedServerId) || FALLBACK_SOURCES[0];
      setActiveSource(srv.build({ mal: malId, al: alId }, epId, dub));
    }
  }, [dub]);

  // ── Auto mark watched ─────────────────────────────────────────────
  useEffect(() => {
    if (!malId || !epId) return;
    const t = setTimeout(() => markWatched(malId, epId), 30_000);
    return () => clearTimeout(t);
  }, [malId, epId]);

  // ── Autoplay countdown ────────────────────────────────────────────
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

  // ── AniList effects ───────────────────────────────────────────────
  useEffect(() => { try { (window as any).KamiAds?.onEpisodeChange?.(); } catch {} }, [malId, epId]);

  useSEO(detail?.data ? {
    title: `${detail.data.title} Episode ${epId}`,
    description: detail.data.synopsis?.slice(0, 160),
    image: detail.data.images?.webp?.large_image_url,
    type: 'video.other',
  } : {});

  if (detailLoading) return <WatchSkeleton />;
  if (!detail?.data) return <div className="p-8 text-center">Anime not found.</div>;

  const anime = detail.data;
  // Always expose exactly two servers: OniChan and Otaku
  const serverList = adminSources.length > 0
    ? [
        { id: 'onichan', name: 'OniChan', url: adminSources.find((s: any) => s.language === (dub ? 'dub' : 'sub'))?.embed_url || adminSources[0].embed_url },
        { id: 'otaku',   name: 'Otaku',   url: FALLBACK_SOURCES[1].build({ mal: malId, al: alId }, epId, dub) },
      ]
    : FALLBACK_SOURCES.map(s => ({ id: s.id, name: s.name, url: s.build({ mal: malId, al: alId }, epId, dub) }));

  const downloadSources = adminSources.filter((s: any) => s.download_url);

  function handlePlayerClick() {
    if (playerClickRef.current) return;
    playerClickRef.current = true;
    fireEpAd('player');
  }

  function skipIntro() {
    const end = introEnd ?? 90;
    // Reload iframe with timestamp param (works if embed supports ?t=)
    const url = new URL(activeSource);
    url.searchParams.set('t', String(end));
    setActiveSource(url.toString());
    setShowSkipIntro(false);
  }

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-60px)]">
      <div className="flex-1 flex flex-col bg-black overflow-hidden">

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
                  sandbox="allow-scripts allow-same-origin allow-forms allow-presentation"
                  scrolling="no"
                />

                {/* Video error fallback */}
                {playerError && (
                  <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center gap-4 z-10">
                    <AlertTriangle className="w-10 h-10 text-[var(--pink)]" />
                    <p className="text-white font-bold text-[15px]">Player failed to load</p>
                    <p className="text-[var(--text3)] text-[12px] text-center px-4">Try switching to another server or refreshing</p>
                    <div className="flex gap-2 mt-2">
                      {serverList.filter(s => s.id !== selectedServerId).map(s => (
                        <button key={s.id} onClick={() => { setActiveSource(s.url); setSelectedServerId(s.id); setPlayerError(false); }}
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

                {/* Skip Intro button */}
                {showSkipIntro && (
                  <button onClick={skipIntro}
                    className="absolute bottom-12 right-4 z-20 px-5 py-2.5 bg-black/70 border-2 border-white/80 text-white text-[13px] font-bold rounded-xl backdrop-blur-sm hover:bg-white hover:text-black transition-all flex items-center gap-2">
                    <SkipForward className="w-4 h-4" /> Skip Intro
                  </button>
                )}

                {/* Landscape exit hint */}
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
        <div className="p-4 md:p-6 bg-[var(--bg2)] flex-1 overflow-y-auto">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div>
              <Link href={`/anime/${malId}`} className="text-[var(--pink)] font-bold text-[12px] hover:underline mb-1 inline-block">
                {anime.title}
              </Link>
              <h1 className="text-xl font-heading font-black text-white">
                EP {epId}: {currentEp.title}
              </h1>
              <div className="text-[10px] text-[var(--text3)] mt-1 font-mono flex gap-3">
                {adminSources.length > 0
                  ? <span className="text-[var(--green)]">✓ {adminSources.length} admin source{adminSources.length > 1 ? 's' : ''}</span>
                  : <span>⚡ Auto source</span>}
                {alId && <span>AniList #{alId}</span>}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Theater mode */}
              <button onClick={toggleTheater} title="Theater mode (T)"
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold border transition-all ${theaterMode ? 'bg-[var(--blue)]/15 border-[var(--blue)]/50 text-[var(--blue)]' : 'bg-[var(--card)] border-[var(--border)] text-[var(--text3)] hover:text-white'}`}>
                {theaterMode ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                Theater
              </button>

              {/* Auto Play / Next / Skip toggles */}
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
                <button onClick={() => setDub(true)}  className={`px-4 py-2 transition-colors ${dub  ? 'bg-[var(--purple)] text-white' : 'text-[var(--text3)] hover:text-white'}`}>DUB</button>
              </div>

              {/* Server picker */}
              <div className="flex bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden text-[12px] font-bold">
                {serverList.map((s, idx) => (
                  <button
                    key={s.id}
                    onClick={() => { setActiveSource(s.url); setSelectedServerId(s.id); setPlayerError(false); }}
                    className={`px-4 py-2 transition-colors flex items-center gap-1.5 ${
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

          {/* Download buttons */}
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
            <button onClick={() => setShowEpList(!showEpList)}
              className="lg:hidden px-4 h-12 bg-[var(--card)] border border-[var(--border)] rounded-xl flex items-center justify-center text-[12px] font-bold text-[var(--text3)]">
              Episodes
            </button>
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

      {/* Mobile overlay */}
      {showEpList && <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={() => setShowEpList(false)} />}

      {/* ── Episode Sidebar — compact number grid ── */}
      <div className={`w-[220px] bg-[var(--bg2)] border-l border-[var(--border)] flex flex-col shrink-0 fixed lg:relative top-0 bottom-0 right-0 z-50 transform transition-transform duration-300 ${showEpList ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}`}>
        <div className="p-3 border-b border-[var(--border)] flex justify-between items-center gap-2">
          <h3 className="font-heading font-black text-[13px]">Episodes <span className="text-[var(--text3)] font-normal text-[11px]">({eps.length})</span></h3>
          <button className="lg:hidden p-1 text-[var(--text3)]" onClick={() => setShowEpList(false)}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search episodes */}
        {eps.length > 24 && (
          <div className="px-3 py-2 border-b border-[var(--border)]">
            <input
              type="number" placeholder="Go to ep…" value={epSearch}
              onChange={e => setEpSearch(e.target.value)}
              className="w-full bg-[var(--bg3)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-[12px] text-white placeholder:text-[var(--text3)] outline-none focus:border-[var(--pink)] transition-colors"
            />
          </div>
        )}

        <div id="sidebar-ad" className="min-h-[1px] px-2 pt-2"
          ref={el => { if (el && (window as any).KamiAds) (window as any).KamiAds.loadSidebarAd(); }} />

        {/* ── Compact episode number grid ── */}
        <div className="flex-1 overflow-y-auto p-2">
          <div className="grid grid-cols-5 gap-1">
            {filteredEps.map((ep: any) => {
              const isCurrent = ep.mal_id.toString() === epId;
              const watched   = isWatched(malId, ep.mal_id);
              return (
                <Link key={ep.mal_id} href={`/watch/${malId}/${ep.mal_id}`}
                  onClick={() => { if (!isCurrent) fireEpAd('list'); setShowEpList(false); }}>
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

      {/* ── Autoplay countdown overlay ── */}
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
