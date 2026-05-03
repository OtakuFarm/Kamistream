import React, { useState, useEffect, useRef } from 'react';
import { useRoute, Link, useLocation } from 'wouter';
import { useAnimeDetail, useAnimeEpisodes } from '@/lib/jikan';
import { supabase } from '@/lib/supabase';
import { useWatchHistory } from '@/hooks/useWatchHistory';
import { ChevronLeft, ChevronRight, Settings, SkipForward, X } from 'lucide-react';
import { LoadingSkeleton } from '@/components/LoadingSkeleton';
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
    const { data: episode } = await supabase.from('episodes').select('id').eq('anime_id', anime.id).eq('episode_number', parseInt(epNum)).maybeSingle();
    if (!episode?.id) return [];
    const { data: sources } = await supabase.from('embed_sources').select('source_name, embed_url, language, quality').eq('episode_id', episode.id).eq('is_active', true);
    return sources || [];
  } catch { return []; }
}

function fireEpAd(type: string) {
  try { (window as any).KamiAds?.onEpisodeClick(type); } catch {}
}

type Ids = { mal: string; al: string | null };
const FALLBACK_SOURCES = [
  { id: 'vidnest',  name: 'VidNest',  build: ({ al, mal }: Ids, ep: string, dub: boolean) => `https://vidnest.fun/animepahe/${al || mal}/${ep}/${dub ? 'dub' : 'sub'}` },
  { id: 'cinetaro', name: 'Cinetaro', build: ({ al, mal }: Ids, ep: string, dub: boolean) => `https://api.cinetaro.buzz/anime/${al || mal}/${ep}/${dub ? 'dub' : 'sub'}` },
];

const AUTOPLAY_COUNTDOWN = 10; // seconds

export default function Watch() {
  const [, params]    = useRoute('/watch/:id/:ep');
  const [, navigate]  = useLocation();
  const malId = params?.id || '';
  const epId  = params?.ep || '1';

  const [alId,           setAlId]           = useState<string | null>(null);
  const [dub,            setDub]            = useState(false);
  const [adminSources,   setAdminSources]   = useState<any[]>([]);
  const [activeSource,   setActiveSource]   = useState<string>('');
  const [showEpList,     setShowEpList]     = useState(false);
  const [loadingPlayer,  setLoadingPlayer]  = useState(true);
  const [autoplaySecs,   setAutoplaySecs]   = useState<number | null>(null);
  const autoplayTimer    = useRef<ReturnType<typeof setInterval> | null>(null);
  const playerClickedRef = useRef(false);

  const { data: detail,   isLoading: detailLoading } = useAnimeDetail(malId);
  const { data: episodes }                            = useAnimeEpisodes(malId);
  const { logEpisode }                                = useWatchHistory();
  const { markWatched, isWatched }                    = useEpisodeProgress();

  const eps            = episodes?.data || [];
  const currentEpIndex = eps.findIndex((e: any) => e.mal_id.toString() === epId);
  const currentEp      = eps[currentEpIndex] || { title: `Episode ${epId}`, mal_id: epId };
  const prevEp         = currentEpIndex > 0              ? eps[currentEpIndex - 1] : null;
  const nextEp         = currentEpIndex < eps.length - 1 ? eps[currentEpIndex + 1] : null;

  // ── Load player + log history ─────────────────────────────────────
  useEffect(() => {
    if (!malId || !epId) return;
    setLoadingPlayer(true);
    setAdminSources([]);
    setActiveSource('');
    setAutoplaySecs(null);
    playerClickedRef.current = false;
    clearAutoplay();

    Promise.all([resolveAnilistId(malId), fetchAdminSources(malId, epId)]).then(([al, sources]) => {
      setAlId(al);
      setAdminSources(sources);
      if (sources.length > 0) {
        const preferred = sources.find((s: any) => s.language === (dub ? 'dub' : 'sub')) || sources[0];
        setActiveSource(preferred.embed_url);
      } else {
        setActiveSource(`https://vidnest.fun/animepahe/${al || malId}/${epId}/${dub ? 'dub' : 'sub'}`);
      }
      setLoadingPlayer(false);
    });
  }, [malId, epId]);

  // Log episode to watch history once anime data is available
  useEffect(() => {
    if (!detail?.data) return;
    const anime = detail.data;
    logEpisode({
      mal_id:   anime.mal_id,
      title:    anime.title,
      image_url: anime.images?.webp?.large_image_url || '',
      ep_id:    parseInt(epId),
      ep_title: currentEp?.title || `Episode ${epId}`,
    });
  }, [malId, epId, detail?.data?.mal_id]);

  useEffect(() => {
    if (adminSources.length > 0) {
      const match = adminSources.find((s: any) => s.language === (dub ? 'dub' : 'sub')) || adminSources[0];
      setActiveSource(match.embed_url);
    } else if (alId !== null) {
      setActiveSource(`https://vidnest.fun/animepahe/${alId || malId}/${epId}/${dub ? 'dub' : 'sub'}`);
    }
  }, [dub]);

  useEffect(() => {
    try { (window as any).KamiAds?.onEpisodeChange?.(); } catch {}
  }, [malId, epId]);

  // Auto-mark as watched after 30 seconds on the episode
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
        if (prev <= 1) {
          clearAutoplay();
          fireEpAd('autoplay');
          navigate(`/watch/${malId}/${nextEp.mal_id}`);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  }

  function cancelAutoplay() {
    clearAutoplay();
    setAutoplaySecs(null);
  }

  // Cleanup on unmount
  useEffect(() => () => clearAutoplay(), []);

  // SEO
  useSEO(detail?.data ? {
    title:       `${detail.data.title} Episode ${epId}`,
    description: detail.data.synopsis?.slice(0, 160),
    image:       detail.data.images?.webp?.large_image_url,
    type:        'video.other',
  } : {});

  if (detailLoading) return <LoadingSkeleton />;
  if (!detail?.data) return <div className="p-8 text-center">Anime not found.</div>;

  const anime = detail.data;

  const serverList = adminSources.length > 0
    ? adminSources.map((s: any) => ({ id: s.source_name, name: `${s.source_name} ${s.language === 'dub' ? '(DUB)' : '(SUB)'}`, url: s.embed_url }))
    : FALLBACK_SOURCES.map(s => ({ id: s.id, name: s.name, url: s.build({ mal: malId, al: alId }, epId, dub) }));

  function handlePlayerClick() {
    if (playerClickedRef.current) return;
    playerClickedRef.current = true;
    fireEpAd('player');
  }

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-60px)]">
      <div className="flex-1 flex flex-col bg-black overflow-hidden">

        {/* Player */}
        <div className="w-full bg-black flex justify-center items-start">
          <div className="w-[85%] relative pt-[47.8%]" onClick={handlePlayerClick}>
            {loadingPlayer ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black text-[var(--text3)] text-[13px]">
                ⏳ Loading player…
              </div>
            ) : (
              <iframe
                key={activeSource}
                src={activeSource}
                className="absolute top-0 left-0 w-full h-full border-0"
                allowFullScreen
                allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
                scrolling="no"
              />
            )}
          </div>
        </div>

        {/* Info + controls */}
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
              {/* Sub / Dub */}
              <div className="flex bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden text-[12px] font-bold">
                <button onClick={() => setDub(false)} className={`px-4 py-2 transition-colors ${!dub ? 'bg-[var(--pink)] text-white' : 'text-[var(--text3)] hover:text-white'}`}>SUB</button>
                <button onClick={() => setDub(true)}  className={`px-4 py-2 transition-colors ${dub  ? 'bg-[var(--purple)] text-white' : 'text-[var(--text3)] hover:text-white'}`}>DUB</button>
              </div>

              {/* Server picker */}
              {serverList.length > 1 && (
                <div className="relative group">
                  <button className="bg-[var(--card)] border border-[var(--border)] px-4 py-2 rounded-xl text-[12px] font-bold flex items-center gap-2 hover:bg-[var(--bg3)] transition-colors">
                    <Settings className="w-4 h-4" />
                    {serverList.find(s => s.url === activeSource)?.name || serverList[0].name}
                  </button>
                  <div className="absolute right-0 top-full mt-2 w-48 bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-xl overflow-hidden opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                    {serverList.map(s => (
                      <button key={s.id} onClick={() => setActiveSource(s.url)}
                        className={`w-full text-left px-4 py-3 text-[12px] font-bold hover:bg-[var(--bg3)] transition-colors ${s.url === activeSource ? 'text-[var(--pink)]' : 'text-white'}`}>
                        {s.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div id="player-ad" className="mt-6 min-h-[1px]" />
          <EpisodeSocial malId={malId} epId={epId} />

          {/* Prev / Next */}
          <div className="flex items-center gap-2 mt-6 border-b border-[var(--border)] pb-6">
            <Link href={prevEp ? `/watch/${malId}/${prevEp.mal_id}` : '#'}
              onClick={() => prevEp && fireEpAd('prev')}
              data-ep-nav="prev"
              className={`flex-1 bg-[var(--card)] border border-[var(--border)] py-3 rounded-xl flex items-center justify-center gap-2 text-[12px] font-bold transition-all ${prevEp ? 'hover:bg-[var(--bg3)] hover:border-[var(--purple)] text-white' : 'opacity-50 cursor-not-allowed text-[var(--text3)]'}`}>
              <ChevronLeft className="w-4 h-4" /> Prev Episode
            </Link>
            <button onClick={() => setShowEpList(!showEpList)}
              className="lg:hidden w-12 h-12 bg-[var(--card)] border border-[var(--border)] rounded-xl flex items-center justify-center text-[var(--text3)]">
              EP
            </button>
            {nextEp ? (
              <Link href={`/watch/${malId}/${nextEp.mal_id}`}
                onClick={() => fireEpAd('next')}
                data-ep-nav="next"
                className="flex-1 bg-[var(--card)] border border-[var(--border)] py-3 rounded-xl flex items-center justify-center gap-2 text-[12px] font-bold hover:bg-[var(--bg3)] hover:border-[var(--pink)] text-white transition-all">
                Next Episode <ChevronRight className="w-4 h-4" />
              </Link>
            ) : (
              <div className="flex-1 bg-[var(--card)] border border-[var(--border)] py-3 rounded-xl flex items-center justify-center gap-2 text-[12px] font-bold opacity-50 text-[var(--text3)]">
                No More Episodes
              </div>
            )}
          </div>

          {/* Autoplay next episode trigger */}
          {nextEp && (
            <div className="mt-4 flex items-center justify-between gap-4">
              <button
                onClick={startAutoplay}
                className="flex items-center gap-2 text-[12px] font-bold text-[var(--text3)] hover:text-[var(--pink)] transition-colors"
              >
                <SkipForward className="w-4 h-4" /> Autoplay Next Episode
              </button>
              <span className="text-[11px] text-[var(--text3)]">EP {nextEp.mal_id}: {nextEp.title}</span>
            </div>
          )}
        </div>
      </div>

      {/* Mobile overlay when sidebar open */}
      {showEpList && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={() => setShowEpList(false)}
        />
      )}

      {/* Episode List Sidebar */}
      <div className={`w-[300px] bg-[var(--bg2)] border-l border-[var(--border)] flex flex-col shrink-0 fixed lg:relative top-0 bottom-0 right-0 z-50 transform transition-transform duration-300 ${showEpList ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}`}>
        <div className="p-4 border-b border-[var(--border)] flex justify-between items-center">
          <h3 className="font-heading font-black text-[14px]">Episodes</h3>
          <button className="lg:hidden p-1 text-[var(--text3)]" onClick={() => setShowEpList(false)}>
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {eps.map((ep: any) => {
            const isCurrent = ep.mal_id.toString() === epId;
            const watched = isWatched(malId, ep.mal_id);
            return (
              <Link key={ep.mal_id} href={`/watch/${malId}/${ep.mal_id}`}
                onClick={() => !isCurrent && fireEpAd('list')} data-ep-item="true">
                <div className={`p-3 rounded-xl cursor-pointer transition-colors flex items-center gap-3 ${isCurrent ? 'bg-[var(--pink)]/10 border border-[var(--pink)]' : 'hover:bg-[var(--card)] border border-transparent'}`}>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-mono text-[11px] font-bold ${isCurrent ? 'bg-[var(--pink)] text-white' : 'bg-[var(--bg3)] text-[var(--text3)]'}`}>
                    {ep.mal_id}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-[12px] font-bold truncate ${isCurrent ? 'text-[var(--pink)]' : 'text-white'}`}>{ep.title}</div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* ── Autoplay countdown overlay ── */}
      {autoplaySecs !== null && nextEp && (
        <div className="fixed bottom-6 right-6 z-50 bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 shadow-2xl w-72 animate-in slide-in-from-bottom-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-[11px] font-black text-[var(--pink)] uppercase tracking-wider mb-0.5">Up Next</p>
              <p className="text-[13px] font-bold text-white line-clamp-1">EP {nextEp.mal_id}: {nextEp.title}</p>
            </div>
            <button onClick={cancelAutoplay} className="text-[var(--text3)] hover:text-white transition-colors shrink-0 mt-0.5">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Countdown ring progress */}
          <div className="flex items-center gap-3">
            <div className="relative w-12 h-12 shrink-0">
              <svg className="w-12 h-12 -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15" fill="none" stroke="var(--border)" strokeWidth="3" />
                <circle cx="18" cy="18" r="15" fill="none"
                  stroke="url(#pinkGrad)" strokeWidth="3"
                  strokeDasharray={`${(autoplaySecs / AUTOPLAY_COUNTDOWN) * 94} 94`}
                  strokeLinecap="round" />
                <defs>
                  <linearGradient id="pinkGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="var(--pink)" />
                    <stop offset="100%" stopColor="var(--purple)" />
                  </linearGradient>
                </defs>
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-[13px] font-black text-white">{autoplaySecs}</span>
            </div>
            <div className="flex-1 flex flex-col gap-2">
              <Link href={`/watch/${malId}/${nextEp.mal_id}`}
                onClick={() => { cancelAutoplay(); fireEpAd('autoplay'); }}
                className="bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white text-[12px] font-bold py-2 rounded-xl text-center hover:brightness-110 transition-all">
                Play Now
              </Link>
              <button onClick={cancelAutoplay}
                className="bg-[var(--bg3)] text-[var(--text2)] text-[12px] font-bold py-2 rounded-xl hover:text-white transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
