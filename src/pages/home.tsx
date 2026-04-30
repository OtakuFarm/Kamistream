import React, { useEffect, useState } from 'react';
import { useTrendingAnime, useTopRatedAnime, useSeasonalAnime } from '@/lib/jikan';
import { AnimeCard } from '@/components/AnimeCard';
import { GridSkeleton } from '@/components/LoadingSkeleton';
import { ChevronRight, Star, Flame, Sparkles } from 'lucide-react';
import { Link } from 'wouter';

export default function Home() {
  const { data: trending,  isLoading: trendingLoading  } = useTrendingAnime();
  const { data: topRated,  isLoading: topRatedLoading  } = useTopRatedAnime();
  const { data: seasonal,  isLoading: seasonalLoading  } = useSeasonalAnime();

  const [heroIndex, setHeroIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  // Up to 10 hero slides from trending
  const heroAnimes = trending?.data?.slice(0, 10) || [];
  const activeHero = heroAnimes[heroIndex];

  useEffect(() => {
    if (heroAnimes.length === 0 || isHovered) return;
    const interval = setInterval(() => {
      setHeroIndex(prev => (prev + 1) % heroAnimes.length);
    }, 8000);
    return () => clearInterval(interval);
  }, [heroAnimes.length, isHovered]);

  return (
    <div className="p-4 md:p-6 space-y-10 pb-20">

      {/* ── Hero carousel ── */}
      {activeHero ? (
        <div
          className="relative w-full h-[320px] md:h-[420px] rounded-2xl overflow-hidden group"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <img
            src={activeHero.trailer?.images?.maximum_image_url || activeHero.images.webp.large_image_url}
            alt={activeHero.title}
            className="absolute inset-0 w-full h-full object-cover transition-all duration-700"
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
            <div className="flex gap-3 flex-wrap">
              <Link href={`/anime/${activeHero.mal_id}`}>
                <button className="bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white px-6 py-2.5 rounded-xl text-[13px] font-bold transition-all hover:opacity-90 flex items-center gap-2">
                  <ChevronRight className="w-4 h-4" /> Watch Now
                </button>
              </Link>
              {activeHero.score && (
                <div className="bg-white/10 backdrop-blur-md border border-white/20 text-white px-4 py-2.5 rounded-xl text-[13px] font-bold flex items-center gap-1.5">
                  <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" /> {activeHero.score}
                </div>
              )}
            </div>
          </div>

          {/* Dot indicators */}
          <div className="absolute bottom-4 right-6 flex gap-2">
            {heroAnimes.map((_: any, i: number) => (
              <button
                key={i}
                onClick={() => setHeroIndex(i)}
                className={`h-1.5 rounded-full transition-all ${i === heroIndex ? 'w-6 bg-[var(--pink)]' : 'w-1.5 bg-white/30 hover:bg-white/60'}`}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="w-full h-[320px] md:h-[420px] rounded-2xl bg-[var(--card)] animate-pulse" />
      )}

      {/* ── Trending Now ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[16px] font-heading font-black text-white flex items-center gap-2">
            <Flame className="w-4 h-4 text-[var(--pink)]" /> Trending Now
          </h2>
          <Link href="/browse" className="text-[12px] font-bold text-[var(--pink)] hover:text-[var(--purple)] transition-colors">
            View All
          </Link>
        </div>
        {trendingLoading ? (
          <GridSkeleton />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {trending?.data?.map((anime: any) => (
              <AnimeCard key={anime.mal_id} anime={anime} />
            ))}
          </div>
        )}
      </section>

      {/* ── Top Rated ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[16px] font-heading font-black text-white flex items-center gap-2">
            <Star className="w-4 h-4 text-yellow-400" /> Top Rated
          </h2>
          <Link href="/browse" className="text-[12px] font-bold text-[var(--pink)] hover:text-[var(--purple)] transition-colors">
            View All
          </Link>
        </div>
        {topRatedLoading ? (
          <GridSkeleton />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {topRated?.data?.map((anime: any) => (
              <AnimeCard key={anime.mal_id} anime={anime} />
            ))}
          </div>
        )}
      </section>

      {/* ── This Season ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[16px] font-heading font-black text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[var(--purple)]" /> This Season
          </h2>
          <Link href="/browse" className="text-[12px] font-bold text-[var(--pink)] hover:text-[var(--purple)] transition-colors">
            View All
          </Link>
        </div>
        {seasonalLoading ? (
          <GridSkeleton />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {seasonal?.data?.map((anime: any) => (
              <AnimeCard key={anime.mal_id} anime={anime} />
            ))}
          </div>
        )}
      </section>

      <div
        id="home-ad"
        className="min-h-[1px]"
        ref={el => { if (el && (window as any).KamiAds) (window as any).KamiAds.loadInPagePush('home-ad'); }}
      />
    </div>
  );
}
