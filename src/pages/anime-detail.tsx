import React, { useEffect, useState } from 'react';
import { useRoute, Link } from 'wouter';
import { useAnimeDetail, useAnimeEpisodes, useAnimeRecommendations } from '@/lib/jikan';
import { useWatchlist } from '@/hooks/useWatchlist';
import { useWatchHistory } from '@/hooks/useWatchHistory';
import { Play, Plus, Check, Star, ChevronDown, ChevronUp } from 'lucide-react';
import { LoadingSkeleton } from '@/components/LoadingSkeleton';

const EP_PAGE_SIZE = 50;

export default function AnimeDetail() {
  const [, params] = useRoute('/anime/:id');
  const id = params?.id || '';

  const { data: detail, isLoading: detailLoading } = useAnimeDetail(id);
  const { data: episodes, isLoading: episodesLoading } = useAnimeEpisodes(id);
  const { data: recs } = useAnimeRecommendations(id);
  const { toggleWatchlist, isInWatchlist } = useWatchlist();
  const { getHistory } = useWatchHistory();

  const [epPage, setEpPage] = useState(1);

  const anime = detail?.data;

  useEffect(() => {
    if (!anime) return;
    document.title = `${anime.title} — KamiStream`;
    return () => { document.title = 'KamiStream'; };
  }, [anime]);

  // Reset episode page when anime changes
  useEffect(() => { setEpPage(1); }, [id]);

  if (detailLoading) return <LoadingSkeleton />;
  if (!anime) return <div className="p-8 text-center">Anime not found.</div>;

  const isSaved = isInWatchlist(anime.mal_id);
  const eps = episodes?.data || [];
  const totalEps = eps.length;
  const totalPages = Math.ceil(totalEps / EP_PAGE_SIZE);
  const visibleEps = eps.slice((epPage - 1) * EP_PAGE_SIZE, epPage * EP_PAGE_SIZE);
  const recommendations = (recs?.data || []).slice(0, 8);
  const lastWatched = getHistory().find((h) => h.mal_id === anime.mal_id);
  const resumeEp = lastWatched?.ep_id;

  return (
    <div className="pb-20">
      {/* Hero banner */}
      <div className="relative h-[300px] md:h-[400px] w-full">
        <img
          src={anime.trailer?.images?.maximum_image_url || anime.images?.webp?.large_image_url}
          alt=""
          className="absolute inset-0 w-full h-full object-cover blur-sm opacity-50"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg)] via-[var(--bg)]/80 to-transparent" />

        <div className="absolute bottom-0 left-0 right-0 p-4 md:p-8 flex flex-col md:flex-row gap-6 md:gap-8 items-end md:items-start max-w-7xl mx-auto">
          <img
            src={anime.images?.webp?.large_image_url}
            alt={anime.title}
            className="w-32 md:w-48 lg:w-56 rounded-xl shadow-2xl shrink-0 -mb-10 md:-mb-20 z-10 border-2 border-[var(--border)]"
          />
          <div className="flex-1 z-10 pb-4">
            <h1 className="text-2xl md:text-4xl font-heading font-black text-white mb-2">{anime.title}</h1>
            <div className="flex flex-wrap items-center gap-3 text-[12px] font-bold text-[var(--text2)] mb-4">
              {anime.score && <span className="flex items-center gap-1 text-[var(--gold)]"><Star className="w-3 h-3 fill-current" /> {anime.score}</span>}
              <span>•</span>
              <span>{anime.year || anime.status}</span>
              <span>•</span>
              <span>
                {episodesLoading
                  ? `Loading episodes…`
                  : totalEps > 0
                    ? `${totalEps} Episodes`
                    : anime.episodes
                      ? `${anime.episodes} Episodes`
                      : 'Ongoing'}
              </span>
              <span>•</span>
              <span>{anime.rating}</span>
            </div>
            <div className="flex flex-wrap gap-3">
              {resumeEp ? (
                <Link href={`/watch/${anime.mal_id}/${resumeEp}`}>
                  <button className="bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white px-6 py-2.5 rounded-xl text-[13px] font-bold hover:brightness-110 transition-all flex items-center gap-2">
                    <Play className="w-4 h-4 fill-current" /> Resume EP {resumeEp}
                  </button>
                </Link>
              ) : (
                <Link href={`/watch/${anime.mal_id}/1`}>
                  <button className="bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white px-6 py-2.5 rounded-xl text-[13px] font-bold hover:brightness-110 transition-all flex items-center gap-2">
                    <Play className="w-4 h-4 fill-current" /> Start Watching
                  </button>
                </Link>
              )}
              <button
                onClick={() => toggleWatchlist({
                  mal_id: anime.mal_id,
                  title: anime.title,
                  image_url: anime.images?.webp?.large_image_url || '',
                  episodes: anime.episodes,
                  score: anime.score,
                })}
                className="bg-[var(--card)] border border-[var(--border)] text-white px-4 py-2.5 rounded-xl text-[13px] font-bold hover:bg-white/10 transition-all flex items-center gap-2"
              >
                {isSaved ? <><Check className="w-4 h-4" /> Saved</> : <><Plus className="w-4 h-4" /> Watchlist</>}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-8 mt-16 md:mt-28 grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {/* Synopsis */}
          <section>
            <h2 className="text-[16px] font-heading font-black text-white mb-3">Synopsis</h2>
            <p className="text-[13px] text-[var(--text2)] leading-relaxed whitespace-pre-wrap">{anime.synopsis}</p>
          </section>

          {/* Episodes */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[16px] font-heading font-black text-white">
                Episodes
                {totalEps > 0 && (
                  <span className="ml-2 text-[12px] font-normal text-[var(--text3)]">
                    ({totalEps} total)
                  </span>
                )}
              </h2>
              {episodesLoading && (
                <span className="text-[11px] text-[var(--pink)] font-bold animate-pulse">
                  Loading all episodes…
                </span>
              )}
            </div>

            {episodesLoading ? (
              <div className="animate-pulse space-y-2">
                {[1,2,3,4].map(i => <div key={i} className="h-12 bg-[var(--card)] rounded-xl" />)}
              </div>
            ) : eps.length > 0 ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {visibleEps.map((ep: any) => {
                    const isLast = resumeEp === ep.mal_id;
                    return (
                      <Link key={ep.mal_id} href={`/watch/${anime.mal_id}/${ep.mal_id}`}>
                        <div className={`flex items-center gap-3 p-3 border rounded-xl transition-all group cursor-pointer ${isLast ? 'bg-[var(--pink)]/10 border-[var(--pink)]' : 'bg-[var(--card)] border-[var(--border)] hover:border-[var(--purple)]'}`}>
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-mono font-bold text-[12px] shrink-0 ${isLast ? 'bg-[var(--pink)] text-white' : 'bg-[var(--bg3)] text-[var(--text3)] group-hover:text-[var(--pink)] group-hover:bg-[var(--pink)]/10'}`}>
                            {ep.mal_id}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className={`text-[13px] font-bold truncate ${isLast ? 'text-[var(--pink)]' : 'text-white'}`}>{ep.title}</div>
                            <div className="text-[11px] text-[var(--text3)]">{isLast ? 'Last watched' : `Episode ${ep.mal_id}`}</div>
                          </div>
                          <Play className={`w-4 h-4 shrink-0 ${isLast ? 'text-[var(--pink)]' : 'text-[var(--text3)] group-hover:text-[var(--pink)]'}`} />
                        </div>
                      </Link>
                    );
                  })}
                </div>

                {/* Pagination for 100+ episode anime */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 mt-6 flex-wrap">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                      <button
                        key={p}
                        onClick={() => { setEpPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                        className={`w-10 h-10 rounded-xl text-[12px] font-bold transition-all ${p === epPage ? 'bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white' : 'bg-[var(--card)] border border-[var(--border)] text-[var(--text2)] hover:text-white hover:border-[var(--purple)]'}`}
                      >
                        {p}
                      </button>
                    ))}
                    <span className="text-[11px] text-[var(--text3)] ml-2">
                      EP {(epPage - 1) * EP_PAGE_SIZE + 1}–{Math.min(epPage * EP_PAGE_SIZE, totalEps)} of {totalEps}
                    </span>
                  </div>
                )}
              </>
            ) : (
              <div className="text-[13px] text-[var(--text3)] p-4 bg-[var(--card)] rounded-xl border border-[var(--border)] text-center">
                Episodes list not available for this anime yet.
              </div>
            )}
          </section>
        </div>

        {/* Sidebar details */}
        <div className="space-y-6">
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
            <h3 className="font-heading font-black text-[14px] text-white mb-4">Details</h3>
            <div className="space-y-3 text-[12px]">
              <div className="flex justify-between"><span className="text-[var(--text3)]">Format</span><span className="font-bold text-white">{anime.type}</span></div>
              <div className="flex justify-between"><span className="text-[var(--text3)]">Status</span><span className="font-bold text-white">{anime.status}</span></div>
              <div className="flex justify-between"><span className="text-[var(--text3)]">Aired</span><span className="font-bold text-white text-right max-w-[150px]">{anime.aired?.string}</span></div>
              <div className="flex justify-between"><span className="text-[var(--text3)]">Studios</span><span className="font-bold text-[var(--pink)]">{anime.studios?.map((s: any) => s.name).join(', ') || 'N/A'}</span></div>
              <div className="flex justify-between"><span className="text-[var(--text3)]">Episodes</span><span className="font-bold text-white">{totalEps > 0 ? totalEps : anime.episodes || '?'}</span></div>
            </div>
            <div className="mt-4 pt-4 border-t border-[var(--border)]">
              <h4 className="font-bold text-[11px] text-[var(--text3)] uppercase tracking-wider mb-2">Genres</h4>
              <div className="flex flex-wrap gap-2">
                {anime.genres?.map((g: any) => (
                  <span key={g.mal_id} className="bg-[var(--bg3)] text-[var(--text2)] px-2 py-1 rounded-md text-[10px] font-bold">{g.name}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

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
                    <div className="aspect-[2/3] rounded-xl overflow-hidden bg-[var(--card)] relative">
                      <img
                        src={a.images?.webp?.large_image_url || a.images?.jpg?.large_image_url}
                        alt={a.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
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
