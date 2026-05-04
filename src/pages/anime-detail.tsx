import React, { useEffect, useState } from 'react';
import { useRoute, Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { useAnimeDetail, useAnimeEpisodes, useAnimeRecommendations } from '@/lib/jikan';
import { useWatchlist } from '@/hooks/useWatchlist';
import { useWatchHistory } from '@/hooks/useWatchHistory';
import { useEpisodeProgress } from '@/hooks/useEpisodeProgress';
import { useSEO } from '@/hooks/useSEO';
import { getNextAiring } from '@/lib/anilist';
import { Play, Plus, Check, Star, Timer, CheckCircle2, Circle } from 'lucide-react';
import { DetailSkeleton } from '@/components/LoadingSkeleton';

const EP_PAGE_SIZE = 50;

export default function AnimeDetail() {
  const [, params] = useRoute('/anime/:id');
  const id = params?.id || '';

  const { data: detail,   isLoading: detailLoading } = useAnimeDetail(id);
  const { data: episodes, isLoading: episodesLoading } = useAnimeEpisodes(id);
  const { data: recs }                                  = useAnimeRecommendations(id);
  const { toggleWatchlist, isInWatchlist }              = useWatchlist();
  const { getRecentAnime }                              = useWatchHistory();
  const { toggleWatched, isWatched, getWatchedCount }  = useEpisodeProgress();

  const [epPage,     setEpPage]     = useState(1);
  const [showTrailer, setShowTrailer] = useState(false);

  // Fetch characters
  const { data: charsData } = useQuery({
    queryKey: ['anime', id, 'characters'],
    queryFn: async () => {
      const res = await fetch(\`https://api.jikan.moe/v4/anime/\${id}/characters\`);
      if (!res.ok) return { data: [] };
      return res.json();
    },
    enabled: !!id,
    staleTime: 30 * 60 * 1000,
  });
  const characters = (charsData?.data || []).slice(0, 12);
  const [nextAiring, setNextAiring] = useState<any>(null);
  const [countdown,  setCountdown]  = useState('');

  const anime = detail?.data;

  // SEO
  useSEO(anime ? {
    title:       anime.title,
    description: anime.synopsis?.slice(0, 160),
    image:       anime.images?.webp?.large_image_url,
    type:        'video.other',
  } : {});

  useEffect(() => { setEpPage(1); }, [id]);

  // Airing countdown
  useEffect(() => {
    if (!anime || anime.status !== 'Currently Airing') return;
    getNextAiring(id).then(setNextAiring).catch(() => {});
  }, [id, anime?.status]);

  useEffect(() => {
    if (!nextAiring?.airingAt) return;
    const update = () => {
      const secs = nextAiring.airingAt - Math.floor(Date.now() / 1000);
      if (secs <= 0) { setCountdown('Available now!'); return; }
      const d = Math.floor(secs / 86400);
      const h = Math.floor((secs % 86400) / 3600);
      const m = Math.floor((secs % 3600) / 60);
      const s = secs % 60;
      setCountdown(d > 0 ? `${d}d ${h}h ${m}m` : `${h}h ${m}m ${s}s`);
    };
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [nextAiring]);

  if (detailLoading) return <DetailSkeleton />;
  if (!anime) return <div className="p-8 text-center text-[var(--text3)]">Anime not found.</div>;

  const isSaved    = isInWatchlist(anime.mal_id);
  const history    = getRecentAnime();
  const lastWatched = history.find(h => h.mal_id === anime.mal_id);
  const resumeEp   = lastWatched?.ep_id;
  const recommendations = (recs?.data || []).slice(0, 8);

  // Build episode list — use highest known count across all sources
  const jikanEps: any[]   = episodes?.data || [];
  const jikanCount        = jikanEps.length;
  // AniList tells us the NEXT episode number, so current aired = nextEp - 1
  const anilistAiredCount = nextAiring ? (nextAiring.episode - 1) : 0;
  const malCount: number  = anime.episodes || 0;
  // Use the highest count we know about
  const bestCount = Math.max(jikanCount, anilistAiredCount, malCount);

  const eps: any[] = jikanEps.length >= bestCount
    ? jikanEps
    : bestCount > 0
      ? Array.from({ length: bestCount }, (_, i) => {
          const existing = jikanEps.find((e: any) => e.mal_id === i + 1);
          return existing || { mal_id: i + 1, title: `Episode ${i + 1}` };
        })
      : [];

  const totalEps    = eps.length;
  const totalPages  = Math.ceil(totalEps / EP_PAGE_SIZE);
  const visibleEps  = eps.slice((epPage - 1) * EP_PAGE_SIZE, epPage * EP_PAGE_SIZE);
  const watchedCount = getWatchedCount(anime.mal_id);

  return (
    <div className="pb-20">
      {/* Hero */}
      <div className="relative h-[300px] md:h-[400px] w-full">
        <img
          src={anime.trailer?.images?.maximum_image_url || anime.images?.webp?.large_image_url}
          alt="" className="absolute inset-0 w-full h-full object-cover blur-sm opacity-50"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg)] via-[var(--bg)]/80 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-4 md:p-8 flex flex-col md:flex-row gap-6 md:gap-8 items-end md:items-start max-w-7xl mx-auto">
          <img src={anime.images?.webp?.large_image_url} alt={anime.title}
            className="w-32 md:w-48 lg:w-56 rounded-xl shadow-2xl shrink-0 -mb-10 md:-mb-20 z-10 border-2 border-[var(--border)]" />
          <div className="flex-1 z-10 pb-4">
            <h1 className="text-2xl md:text-4xl font-heading font-black text-white mb-2">{anime.title}</h1>
            <div className="flex flex-wrap items-center gap-3 text-[12px] font-bold text-[var(--text2)] mb-4">
              {anime.score && <span className="flex items-center gap-1 text-[var(--gold)]"><Star className="w-3 h-3 fill-current" /> {anime.score}</span>}
              <span>•</span><span>{anime.year || anime.status}</span><span>•</span>
              <span>{episodesLoading ? 'Loading…' : totalEps > 0 ? `${totalEps} Episodes` : knownCount > 0 ? `${knownCount} Episodes` : 'Ongoing'}</span>
              {anime.rating && <><span>•</span><span>{anime.rating}</span></>}
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href={`/watch/${anime.mal_id}/${resumeEp || 1}`}>
                <button className="bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white px-6 py-2.5 rounded-xl text-[13px] font-bold hover:brightness-110 transition-all flex items-center gap-2">
                  <Play className="w-4 h-4 fill-current" /> {resumeEp ? `Resume EP ${resumeEp}` : 'Start Watching'}
                </button>
              </Link>
              <button onClick={() => toggleWatchlist({ mal_id: anime.mal_id, title: anime.title, image_url: anime.images?.webp?.large_image_url || '', episodes: anime.episodes, score: anime.score })}
                className="bg-[var(--card)] border border-[var(--border)] text-white px-4 py-2.5 rounded-xl text-[13px] font-bold hover:bg-white/10 transition-all flex items-center gap-2">
                {isSaved ? <><Check className="w-4 h-4" /> Saved</> : <><Plus className="w-4 h-4" /> Watchlist</>}
              </button>
              {anime.trailer?.youtube_id && (
                <button onClick={() => setShowTrailer(true)}
                  className="bg-[var(--card)] border border-[var(--border)] text-white px-4 py-2.5 rounded-xl text-[13px] font-bold hover:bg-white/10 transition-all flex items-center gap-2">
                  ▶ Trailer
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-8 mt-16 md:mt-28 grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">

          {/* Countdown */}
          {nextAiring && countdown && (
            <div className="bg-gradient-to-r from-[var(--pink)]/10 to-[var(--purple)]/10 border border-[var(--pink)]/30 rounded-xl p-4 flex items-center gap-4">
              <Timer className="w-6 h-6 text-[var(--pink)] shrink-0 animate-pulse" />
              <div>
                <div className="text-[10px] font-black text-[var(--pink)] uppercase tracking-wider">Next Episode</div>
                <div className="text-[15px] font-heading font-black text-white">
                  EP {nextAiring.episode} — <span className="text-[var(--pink)]">{countdown}</span>
                </div>
                <div className="text-[11px] text-[var(--text3)] mt-0.5">
                  {new Date(nextAiring.airingAt * 1000).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          )}

          {/* Synopsis */}
          <section>
            <h2 className="text-[16px] font-heading font-black text-white mb-3">Synopsis</h2>
            <p className="text-[13px] text-[var(--text2)] leading-relaxed">{anime.synopsis}</p>
          </section>

          {/* Episodes */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[16px] font-heading font-black text-white">
                Episodes
                {totalEps > 0 && <span className="ml-2 text-[12px] font-normal text-[var(--text3)]">({totalEps} total)</span>}
              </h2>
              <div className="flex items-center gap-3">
                {watchedCount > 0 && (
                  <span className="text-[11px] font-bold text-[#06d6a0] flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> {watchedCount}/{totalEps} watched
                  </span>
                )}
                {episodesLoading && <span className="text-[11px] text-[var(--pink)] font-bold animate-pulse">Loading…</span>}
              </div>
            </div>

            {episodesLoading ? (
              <div className="animate-pulse space-y-2">{[1,2,3,4].map(i => <div key={i} className="h-12 bg-[var(--card)] rounded-xl" />)}</div>
            ) : eps.length > 0 ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {visibleEps.map((ep: any) => {
                    const isLast    = resumeEp === ep.mal_id;
                    const watched   = isWatched(anime.mal_id, ep.mal_id);
                    return (
                      <div key={ep.mal_id} className={`flex items-center gap-2 p-2.5 border rounded-xl transition-all group ${isLast ? 'bg-[var(--pink)]/10 border-[var(--pink)]' : watched ? 'bg-[#06d6a0]/5 border-[#06d6a0]/30' : 'bg-[var(--card)] border-[var(--border)] hover:border-[var(--purple)]'}`}>
                        <Link href={`/watch/${anime.mal_id}/${ep.mal_id}`} className="flex items-center gap-2.5 flex-1 min-w-0">
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-mono font-bold text-[11px] shrink-0 ${isLast ? 'bg-[var(--pink)] text-white' : watched ? 'bg-[#06d6a0]/20 text-[#06d6a0]' : 'bg-[var(--bg3)] text-[var(--text3)] group-hover:text-[var(--pink)]'}`}>
                            {ep.mal_id}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className={`text-[12px] font-bold truncate ${isLast ? 'text-[var(--pink)]' : watched ? 'text-[#06d6a0]' : 'text-white'}`}>{ep.title}</div>
                            <div className="text-[10px] text-[var(--text3)]">{isLast ? 'Last watched' : watched ? 'Watched' : `Episode ${ep.mal_id}`}</div>
                          </div>
                        </Link>
                        {/* Mark as watched button */}
                        <button
                          onClick={e => { e.stopPropagation(); toggleWatched(anime.mal_id, ep.mal_id); }}
                          title={watched ? 'Mark unwatched' : 'Mark as watched'}
                          className={`shrink-0 p-1 rounded-lg transition-all ${watched ? 'text-[#06d6a0] hover:text-[var(--text3)]' : 'text-[var(--text3)] hover:text-[#06d6a0]'}`}
                        >
                          {watched ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                        </button>
                      </div>
                    );
                  })}
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 mt-6 flex-wrap">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                      <button key={p} onClick={() => { setEpPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                        className={`w-10 h-10 rounded-xl text-[12px] font-bold transition-all ${p === epPage ? 'bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white' : 'bg-[var(--card)] border border-[var(--border)] text-[var(--text2)] hover:text-white hover:border-[var(--purple)]'}`}>
                        {p}
                      </button>
                    ))}
                    <span className="text-[11px] text-[var(--text3)] ml-2">
                      EP {(epPage-1)*EP_PAGE_SIZE+1}–{Math.min(epPage*EP_PAGE_SIZE, totalEps)} of {totalEps}
                    </span>
                  </div>
                )}
              </>
            ) : (
              <div className="text-[13px] text-[var(--text3)] p-4 bg-[var(--card)] rounded-xl border border-[var(--border)] text-center">
                No episodes available yet for this anime.
              </div>
            )}
          </section>
        </div>

        {/* Details sidebar */}
        <div className="space-y-6">
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
            <h3 className="font-heading font-black text-[14px] text-white mb-4">Details</h3>
            <div className="space-y-3 text-[12px]">
              <div className="flex justify-between"><span className="text-[var(--text3)]">Format</span><span className="font-bold text-white">{anime.type}</span></div>
              <div className="flex justify-between"><span className="text-[var(--text3)]">Status</span><span className="font-bold text-white">{anime.status}</span></div>
              <div className="flex justify-between"><span className="text-[var(--text3)]">Aired</span><span className="font-bold text-white text-right max-w-[150px]">{anime.aired?.string}</span></div>
              <div className="flex justify-between"><span className="text-[var(--text3)]">Studios</span><span className="font-bold text-[var(--pink)]">{anime.studios?.map((s: any) => s.name).join(', ') || 'N/A'}</span></div>
              <div className="flex justify-between"><span className="text-[var(--text3)]">Episodes</span><span className="font-bold text-white">{totalEps > 0 ? totalEps : knownCount || '?'}</span></div>
            </div>
            {anime.genres?.length > 0 && (
              <div className="mt-4 pt-4 border-t border-[var(--border)]">
                <h4 className="font-bold text-[11px] text-[var(--text3)] uppercase tracking-wider mb-2">Genres</h4>
                <div className="flex flex-wrap gap-2">
                  {anime.genres.map((g: any) => (
                    <span key={g.mal_id} className="bg-[var(--bg3)] text-[var(--text2)] px-2 py-1 rounded-md text-[10px] font-bold">{g.name}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Trailer modal */}
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
          <button onClick={() => setShowTrailer(false)} className="absolute top-4 right-4 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white text-xl">✕</button>
        </div>
      )}

      {/* Characters */}
      {characters.length > 0 && (
        <div className="max-w-7xl mx-auto px-4 md:px-8 mt-8">
          <h2 className="text-[16px] font-heading font-black text-white mb-4">Characters</h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-12 gap-3">
            {characters.map((c: any) => (
              <div key={c.character.mal_id} className="text-center">
                <div className="aspect-square rounded-xl overflow-hidden bg-[var(--card)] mb-1.5">
                  <img src={c.character.images?.webp?.image_url || c.character.images?.jpg?.image_url}
                    alt={c.character.name}
                    className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                  />
                </div>
                <p className="text-[9px] font-bold text-white line-clamp-2 leading-tight">{c.character.name}</p>
                <p className="text-[8px] text-[var(--text3)] mt-0.5">{c.role}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div className="max-w-7xl mx-auto px-4 md:px-8 mt-12">
          <h2 className="text-[16px] font-heading font-black text-white mb-4">You Might Also Like</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-8 gap-4">
            {recommendations.map((rec: any) => {
              const a = rec.entry;
              return (
                <Link key={a.mal_id} href={`/anime/${a.mal_id}`}>
                  <div className="group cursor-pointer">
                    <div className="aspect-[2/3] rounded-xl overflow-hidden bg-[var(--card)]">
                      <img src={a.images?.webp?.large_image_url} alt={a.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    </div>
                    <p className="text-[11px] font-bold text-white mt-2 line-clamp-2 leading-snug">{a.title}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
