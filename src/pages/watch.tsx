import React, { useState, useEffect } from 'react';
import { useRoute, Link } from 'wouter';
import { useAnimeDetail, useAnimeEpisodes } from '@/lib/jikan';
import { supabase } from '@/lib/supabase';
import { ChevronLeft, ChevronRight, Settings } from 'lucide-react';
import { LoadingSkeleton } from '@/components/LoadingSkeleton';
import { EpisodeSocial } from '@/components/EpisodeSocial';

// ── Resolve AniList ID from MAL ID (cached in sessionStorage) ──
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

// ── Fallback URL builders when no Supabase source exists ──
type Ids = { mal: string; al: string | null };
const FALLBACK_SOURCES = [
  {
    id: 'vidnest', name: 'VidNest',
    build: ({ al, mal }: Ids, ep: string, dub: boolean) =>
      `https://vidnest.fun/animepahe/${al || mal}/${ep}/${dub ? 'dub' : 'sub'}`,
  },
  {
    id: 'cinetaro', name: 'Cinetaro',
    build: ({ al, mal }: Ids, ep: string, dub: boolean) =>
      `https://api.cinetaro.buzz/anime/${al || mal}/${ep}/${dub ? 'dub' : 'sub'}`,
  },
];

// ── Fetch embed sources saved by admin in Supabase ──
async function fetchAdminSources(malId: string, epNum: string) {
  try {
    // 1. Get the anime row
    const { data: anime } = await supabase
      .from('anime')
      .select('id')
      .eq('mal_id', malId)
      .maybeSingle();
    if (!anime?.id) return [];

    // 2. Get the episode row
    const { data: episode } = await supabase
      .from('episodes')
      .select('id')
      .eq('anime_id', anime.id)
      .eq('episode_number', parseInt(epNum))
      .maybeSingle();
    if (!episode?.id) return [];

    // 3. Get embed sources for this episode
    const { data: sources } = await supabase
      .from('embed_sources')
      .select('source_name, embed_url, language, quality')
      .eq('episode_id', episode.id)
      .eq('is_active', true);

    return sources || [];
  } catch { return []; }
}

export default function Watch() {
  const [, params] = useRoute('/watch/:id/:ep');
  const malId = params?.id || '';
  const epId  = params?.ep || '1';

  const [alId,          setAlId]          = useState<string | null>(null);
  const [dub,           setDub]           = useState(false);
  const [adminSources,  setAdminSources]  = useState<any[]>([]);
  const [activeSource,  setActiveSource]  = useState<string>(''); // embed_url of selected source
  const [showEpList,    setShowEpList]    = useState(false);
  const [loadingPlayer, setLoadingPlayer] = useState(true);

  const { data: detail,   isLoading: detailLoading } = useAnimeDetail(malId);
  const { data: episodes }                            = useAnimeEpisodes(malId);

  // On anime/episode change: resolve AniList ID + fetch admin sources
  useEffect(() => {
    if (!malId || !epId) return;
    setLoadingPlayer(true);
    setAdminSources([]);
    setActiveSource('');

    Promise.all([
      resolveAnilistId(malId),
      fetchAdminSources(malId, epId),
    ]).then(([al, sources]) => {
      setAlId(al);
      setAdminSources(sources);

      if (sources.length > 0) {
        // Pick sub or dub preference, default to first available
        const preferred = sources.find((s: any) =>
          s.language === (dub ? 'dub' : 'sub')
        ) || sources[0];
        setActiveSource(preferred.embed_url);
      } else {
        // Fallback: generate URL from AniList ID
        setActiveSource(
          `https://vidnest.fun/animepahe/${al || malId}/${epId}/${dub ? 'dub' : 'sub'}`
        );
      }
      setLoadingPlayer(false);
    });
  }, [malId, epId]);

  // When sub/dub toggles, switch to matching source if available
  useEffect(() => {
    if (adminSources.length > 0) {
      const match = adminSources.find((s: any) => s.language === (dub ? 'dub' : 'sub'))
        || adminSources[0];
      setActiveSource(match.embed_url);
    } else if (alId !== null) {
      setActiveSource(
        `https://vidnest.fun/animepahe/${alId || malId}/${epId}/${dub ? 'dub' : 'sub'}`
      );
    }
  }, [dub]);

  useEffect(() => {
    const ads = (window as any).KamiAds;
    if (ads?.onEpisodeChange) ads.onEpisodeChange();
  }, [malId, epId]);

  if (detailLoading) return <LoadingSkeleton />;
  if (!detail?.data)  return <div className="p-8 text-center">Anime not found.</div>;

  const anime          = detail.data;
  const eps            = episodes?.data || [];
  const currentEpIndex = eps.findIndex((e: any) => e.mal_id.toString() === epId);
  const currentEp      = eps[currentEpIndex] || { title: `Episode ${epId}` };
  const prevEp         = currentEpIndex > 0              ? eps[currentEpIndex - 1] : null;
  const nextEp         = currentEpIndex < eps.length - 1 ? eps[currentEpIndex + 1] : null;

  // Build server list: admin sources first, then fallbacks
  const serverList = adminSources.length > 0
    ? adminSources.map((s: any) => ({
        id: s.source_name,
        name: `${s.source_name} ${s.language === 'dub' ? '(DUB)' : '(SUB)'}`,
        url: s.embed_url,
      }))
    : FALLBACK_SOURCES.map(s => ({
        id: s.id,
        name: s.name,
        url: s.build({ mal: malId, al: alId }, epId, dub),
      }));

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-60px)]">

      {/* ── Main column ── */}
      <div className="flex-1 flex flex-col bg-black overflow-hidden">

        {/* Player */}
        <div className="w-full bg-black flex justify-center items-start">
          <div className="w-[85%] relative pt-[47.8%]">
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

            {/* Controls */}
            <div className="flex items-center gap-2 flex-wrap">

              {/* Sub / Dub toggle */}
              <div className="flex bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden text-[12px] font-bold">
                <button onClick={() => setDub(false)} className={`px-4 py-2 transition-colors ${!dub ? 'bg-[var(--pink)] text-white' : 'text-[var(--text3)] hover:text-white'}`}>
                  SUB
                </button>
                <button onClick={() => setDub(true)} className={`px-4 py-2 transition-colors ${dub ? 'bg-[var(--purple)] text-white' : 'text-[var(--text3)] hover:text-white'}`}>
                  DUB
                </button>
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
                      <button
                        key={s.id}
                        onClick={() => setActiveSource(s.url)}
                        className={`w-full text-left px-4 py-3 text-[12px] font-bold hover:bg-[var(--bg3)] transition-colors ${s.url === activeSource ? 'text-[var(--pink)]' : 'text-white'}`}
                      >
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
          <div className="flex items-center gap-2 mt-6 pb-6 border-b border-[var(--border)]">
            <Link href={prevEp ? `/watch/${malId}/${prevEp.mal_id}` : '#'}
              className={`flex-1 bg-[var(--card)] border border-[var(--border)] py-3 rounded-xl flex items-center justify-center gap-2 text-[12px] font-bold transition-all ${prevEp ? 'hover:bg-[var(--bg3)] hover:border-[var(--purple)] text-white' : 'opacity-50 cursor-not-allowed text-[var(--text3)]'}`}>
              <ChevronLeft className="w-4 h-4" /> Prev Episode
            </Link>
            <button onClick={() => setShowEpList(!showEpList)}
              className="lg:hidden w-12 h-12 bg-[var(--card)] border border-[var(--border)] rounded-xl flex items-center justify-center text-[var(--text3)]">
              EP
            </button>
            <Link href={nextEp ? `/watch/${malId}/${nextEp.mal_id}` : '#'}
              className={`flex-1 bg-[var(--card)] border border-[var(--border)] py-3 rounded-xl flex items-center justify-center gap-2 text-[12px] font-bold transition-all ${nextEp ? 'hover:bg-[var(--bg3)] hover:border-[var(--pink)] text-white' : 'opacity-50 cursor-not-allowed text-[var(--text3)]'}`}>
              Next Episode <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>

      {/* ── Episode List Sidebar ── */}
      <div className={`w-[320px] bg-[var(--bg2)] border-l border-[var(--border)] flex flex-col shrink-0 absolute lg:relative inset-y-0 right-0 z-40 transform transition-transform duration-300 ${showEpList ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}`}>
        <div className="p-4 border-b border-[var(--border)] flex justify-between items-center">
          <h3 className="font-heading font-black text-[14px]">Episodes</h3>
          <button className="lg:hidden p-1 text-[var(--text3)]" onClick={() => setShowEpList(false)}>
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {eps.map((ep: any) => {
            const isCurrent = ep.mal_id.toString() === epId;
            return (
              <Link key={ep.mal_id} href={`/watch/${malId}/${ep.mal_id}`}>
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
    </div>
  );
}
