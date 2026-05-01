import React, { useEffect, useState } from 'react';
import { useTrendingAnime } from '@/lib/jikan';
import { AnimeCard } from '@/components/AnimeCard';
import { GridSkeleton } from '@/components/LoadingSkeleton';
import { ChevronRight, Play, Clock } from 'lucide-react';
import { Link } from 'wouter';
import { useWatchHistory } from '@/hooks/useWatchHistory';

export default function Home() {
  const { data: trending, isLoading: trendingLoading } = useTrendingAnime();
  const [heroIndex, setHeroIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const { getRecentAnime } = useWatchHistory();
  const [continueWatching, setContinueWatching] = useState(getRecentAnime());

  useEffect(() => {
    document.title = 'KamiStream — Watch Anime Free';
    return () => { document.title = 'KamiStream'; };
  }, []);

  useEffect(() => {
    setContinueWatching(getRecentAnime());
  }, [getRecentAnime]);

  const heroAnimes = trending?.data?.slice(0, 5) || [];

  useEffect(() => {
    if (heroAnimes.length === 0 || isHovered) return;
    const interval = setInterval(() => {
      setHeroIndex((prev) => (prev + 1) % heroAnimes.length);
    }, 8000);
    return () => clearInterval(interval);
  }, [heroAnimes.length, isHovered]);

  const activeHero = heroAnimes[heroIndex];

  return (
    <div className="p-4 md:p-6 space-y-8 pb-20">
      {/* Hero */}
      {activeHero ? (
        <div
          className="relative w-full h-[320px] md:h-[400px] rounded-2xl overflow-hidden group"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <img
            src={activeHero.trailer?.images?.maximum_image_url || activeHero.images.webp.large_image_url}
            alt={activeHero.title}
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/60 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

          <div className="absolute bottom-0 left-0 p-6 md:p-10 max-w-2xl">
            <div className="text-[10px] font-black text-[var(--pink)] tracking-[2px] uppercase mb-2">
              #{heroIndex + 1} Trending This Week
            </div>
            <h1 className="text-3xl md:text-5xl font-heading font-black text-white leading-tight mb-3 line-clamp-2">
              {activeHero.title}
            </h1>
            <p className="text-[13px] md:text-[14px] text-[var(--text2)] line-clamp-2 md:line-clamp-3 mb-6 max-w-xl">
              {activeHero.synopsis}
            </p>
            <div className="flex gap-3">
              <Link href={`/anime/${activeHero.mal_id}`}>
                <button className="bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white px-6 py-2.5 rounded-xl text-[13px] font-bold hover:brightness-110 transition-all flex items-center gap-2">
                  <Play className="w-4 h-4 fill-current" /> Watch Now
                </button>
              </Link>
            </div>
          </div>

          <div className="absolute bottom-4 right-6 flex gap-2">
            {heroAnimes.map((_: any, i: number) => (
              <button
                key={i}
                onClick={() => setHeroIndex(i)}
                className={`h-1.5 rounded-full transition-all ${i === heroIndex ? 'w-6 bg-[var(--pink)]' : 'w-1.5 bg-white/30'}`}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="w-full h-[320px] md:h-[400px] rounded-2xl bg-[var(--card)] animate-pulse" />
      )}

      {/* Continue Watching */}
      {continueWatching.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-4 h-4 text-[var(--pink)]" />
            <h2 className="text-[16px] font-heading font-black text-white">Continue Watching</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {continueWatching.slice(0, 6).map((entry) => (
              <Link key={`${entry.mal_id}-${entry.ep_id}`} href={`/watch/${entry.mal_id}/${entry.ep_id}`}>
                <div className="group relative cursor-pointer">
                  <div className="aspect-[2/3] rounded-xl overflow-hidden bg-[var(--card)] relative">
                    <img
                      src={entry.image_url}
                      alt={entry.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Play className="w-10 h-10 text-white fill-current" />
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-2">
                      <span className="text-[10px] font-bold text-[var(--pink)]">EP {entry.ep_id}</span>
                    </div>
                  </div>
                  <p className="text-[12px] font-bold text-white mt-2 line-clamp-2 leading-snug">{entry.title}</p>
                  <p className="text-[10px] text-[var(--text3)] mt-0.5">{entry.ep_title}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Trending */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[16px] font-heading font-black text-white">Trending Anime</h2>
          <Link href="/browse" className="text-[12px] font-bold text-[var(--pink)] hover:text-[var(--purple)] transition-colors flex items-center gap-1">
            View All <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
        {trendingLoading ? (
          <GridSkeleton />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {trending?.data?.slice(0, 12).map((anime: any) => (
              <AnimeCard key={anime.mal_id} anime={anime} />
            ))}
          </div>
        )}
      </section>

      <div
        id="home-ad"
        className="min-h-[1px]"
        ref={(el) => { if (el && (window as any).KamiAds) (window as any).KamiAds.loadInPagePush('home-ad'); }}
      />
    </div>
  );
}
