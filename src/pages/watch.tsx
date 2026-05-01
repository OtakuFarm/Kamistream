import React, { useState, useEffect } from 'react';
import { useRoute, Link } from 'wouter';
import { useAnimeDetail, useAnimeEpisodes } from '@/lib/jikan';
import { ChevronLeft, ChevronRight, Settings } from 'lucide-react';
import { LoadingSkeleton } from '@/components/LoadingSkeleton';
import { EpisodeSocial } from '@/components/EpisodeSocial';
import { useWatchHistory } from '@/hooks/useWatchHistory';

const SOURCES = [
  { id: 'vidnest',   name: 'VidNest Server', build: (mal: string, ep: string) => `https://vidnest.fun/anime/${mal}/${ep}/sub` },
  { id: 'animeplay', name: 'AnimePlay HD',    build: (mal: string, ep: string) => `https://animeplay.cfd/anime/${mal}/${ep}/sub` },
  { id: 'cinetaro',  name: 'Cinetaro Fast',   build: (mal: string, ep: string) => `https://api.cinetaro.buzz/anime/${mal}/${ep}/sub` },
];

export default function Watch() {
  const [, params] = useRoute('/watch/:id/:ep');
  const malId = params?.id || '';
  const epId = params?.ep || '1';

  const [server, setServer] = useState(SOURCES[0]);
  const [showEpList, setShowEpList] = useState(false);
  const { logEpisode } = useWatchHistory();

  const { data: detail, isLoading: detailLoading } = useAnimeDetail(malId);
  const { data: episodes } = useAnimeEpisodes(malId);

  useEffect(() => {
    const ads = (window as any).KamiAds;
    if (ads?.onEpisodeChange) ads.onEpisodeChange();
  }, [malId, epId]);

  const anime = detail?.data;

  useEffect(() => {
    if (!anime) return;
    const eps = episodes?.data || [];
    const currentEp = eps.find((e: any) => e.mal_id.toString() === epId);
    const epTitle = currentEp?.title || `Episode ${epId}`;

    document.title = `${anime.title} EP ${epId} — KamiStream`;

    logEpisode({
      mal_id: anime.mal_id,
      title: anime.title,
      image_url: anime.images?.webp?.large_image_url || '',
      ep_id: parseInt(epId, 10),
      ep_title: epTitle,
    });

    return () => { document.title = 'KamiStream'; };
  }, [anime, epId, episodes, logEpisode]);

  if (detailLoading) return <LoadingSkeleton />;
  if (!anime) return <div className="p-8 text-center">Anime not found.</div>;

  const eps = episodes?.data || [];
  const currentEpIndex = eps.findIndex((e: any) => e.mal_id.toString() === epId);
  const currentEp = eps[currentEpIndex] || { title: `Episode ${epId}` };

  const prevEp = currentEpIndex > 0 ? eps[currentEpIndex - 1] : null;
  const nextEp = currentEpIndex < eps.length - 1 ? eps[currentEpIndex + 1] : null;

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-60px)]">
      <div className="flex-1 flex flex-col bg-black overflow-hidden relative">
        <div className="w-full bg-black relative pt-[56.25%]">
          <iframe
            src={server.build(malId, epId)}
            className="absolute top-0 left-0 w-full h-full border-0"
            allowFullScreen
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        </div>

        <div className="p-4 md:p-6 bg-[var(--bg2)] flex-1 overflow-y-auto">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div>
              <Link href={`/anime/${malId}`} className="text-[var(--pink)] font-bold text-[12px] hover:underline mb-1 inline-block">
                {anime.title}
              </Link>
              <h1 className="text-xl font-heading font-black text-white">
                EP {epId}: {currentEp.title}
              </h1>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative group">
                <button className="bg-[var(--card)] border border-[var(--border)] px-4 py-2 rounded-xl text-[12px] font-bold flex items-center gap-2 hover:bg-[var(--bg3)] transition-colors">
                  <Settings className="w-4 h-4" /> {server.name}
                </button>
                <div className="absolute right-0 top-full mt-2 w-48 bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-xl overflow-hidden opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                  {SOURCES.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setServer(s)}
                      className={`w-full text-left px-4 py-3 text-[12px] font-bold hover:bg-[var(--bg3)] transition-colors ${s.id === server.id ? 'text-[var(--pink)]' : 'text-white'}`}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div id="player-ad" className="mt-6 min-h-[1px]" />

          <EpisodeSocial malId={malId} epId={epId} />

          <div className="flex items-center gap-2 mt-6 pb-6 border-b border-[var(--border)]">
            <Link
              href={prevEp ? `/watch/${malId}/${prevEp.mal_id}` : '#'}
              className={`flex-1 bg-[var(--card)] border border-[var(--border)] py-3 rounded-xl flex items-center justify-center gap-2 text-[12px] font-bold transition-all ${prevEp ? 'hover:bg-[var(--bg3)] hover:border-[var(--purple)] text-white' : 'opacity-50 cursor-not-allowed text-[var(--text3)]'}`}
            >
              <ChevronLeft className="w-4 h-4" /> Prev Episode
            </Link>
            <button
              onClick={() => setShowEpList(!showEpList)}
              className="lg:hidden w-12 h-12 bg-[var(--card)] border border-[var(--border)] rounded-xl flex items-center justify-center text-[var(--text3)]"
            >
              EP
            </button>
            <Link
              href={nextEp ? `/watch/${malId}/${nextEp.mal_id}` : '#'}
              className={`flex-1 bg-[var(--card)] border border-[var(--border)] py-3 rounded-xl flex items-center justify-center gap-2 text-[12px] font-bold transition-all ${nextEp ? 'hover:bg-[var(--bg3)] hover:border-[var(--pink)] text-white' : 'opacity-50 cursor-not-allowed text-[var(--text3)]'}`}
            >
              Next Episode <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>

      {/* Episode List Sidebar */}
      <div className={`w-[320px] bg-[var(--bg2)] border-l border-[var(--border)] flex flex-col shrink-0 absolute lg:relative inset-y-0 right-0 z-40 transform transition-transform duration-300 ${showEpList ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}`}>
        <div className="p-4 border-b border-[var(--border)] flex justify-between items-center bg-[var(--bg2)]">
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
