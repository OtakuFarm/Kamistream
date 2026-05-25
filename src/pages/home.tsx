import React, { useEffect, useState, useMemo } from 'react';
import { useTrendingAnime, useTopRatedAnime, useSeasonalAnime } from '@/lib/jikan';
import { AnimeCard } from '@/components/AnimeCard';
import { AnimeListCard } from '@/components/AnimeListCard';
import { GridSkeleton } from '@/components/LoadingSkeleton';
import { useWatchlist } from '@/hooks/useWatchlist';
import { useWatchHistory } from '@/hooks/useWatchHistory';
import { ChevronRight, Star, Flame, Sparkles, BookMarked, Clock, Radio, Shuffle, Calendar, Trophy } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getAiringSchedule } from '@/lib/anilist';
import { Link, useLocation } from 'wouter';
import { useSEO } from '@/hooks/useSEO';
import { supabase } from '@/lib/supabase';

export default function Home() {
  const { data: trending,  isLoading: trendingLoading  } = useTrendingAnime();
  const { data: topRated,  isLoading: topRatedLoading  } = useTopRatedAnime();
  const { data: seasonal,  isLoading: seasonalLoading  } = useSeasonalAnime();
  const { watchlist } = useWatchlist();
  const { getRecentAnime } = useWatchHistory();
  const [, setLocation] = useLocation();

  const [heroIndex, setHeroIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [topPeriod, setTopPeriod] = useState<'day' | 'week' | 'month'>('day');

  const topPeriodFilter: Record<string, string> = {
    day:   'filter=airing',
    week:  'filter=bypopularity',
    month: 'filter=favorite',
  };
  const { data: topAnimeData, isLoading: topAnimeLoading } = useQuery({
    queryKey: ['home', 'top-anime', topPeriod],
    queryFn: async () => {
      const res = await fetch(`https://api.jikan.moe/v4/top/anime?${topPeriodFilter[topPeriod]}&limit=10&sfw=true`);
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    staleTime: 15 * 60 * 1000,
  });

  // Recently Updated — anime with most recently added embed sources
  const { data: recentlyUpdated } = useQuery({
    queryKey: ['home', 'recently-updated'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('embed_sources')
        .select('created_at, episodes(episode_number, anime(mal_id, title_english, title_romaji, cover_image, score, episodes_total))')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(60);
      if (error || !data) return [];
      const seen = new Set<number>();
      return data.filter((row: any) => {
        const mal = row.episodes?.anime?.mal_id;
        if (!mal || seen.has(mal)) return false;
        seen.add(mal);
        return true;
      }).slice(0, 12).map((row: any) => {
        const a = row.episodes?.anime;
        return {
          mal_id: a.mal_id, title: a.title_english || a.title_romaji || 'Unknown',
          score: a.score, episodes: a.episodes_total, type: 'TV',
          latestEp: row.episodes?.episode_number,
          images: { webp: { large_image_url: a.cover_image || '' }, jpg: { large_image_url: a.cover_image || '' } },
        };
      });
    },
    staleTime: 5 * 60 * 1000,
  });

  // Random anime from trending
  function goToRandom() {
    const pool = trending?.data;
    if (!pool?.length) return;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    setLocation(`/anime/${pick.mal_id}`);
  }

  // New Release (currently airing, sorted by members/popularity)
  const { data: newRelease } = useQuery({
    queryKey: ['home', 'new-release'],
    queryFn: async () => {
      const res = await fetch('https://api.jikan.moe/v4/anime?status=airing&order_by=members&sort=desc&limit=5&sfw=true');
      const j = await res.json(); return j.data || [];
    },
    staleTime: 15 * 60 * 1000,
  });

  // Just Completed (recently finished airing)
  const { data: justCompleted } = useQuery({
    queryKey: ['home', 'just-completed'],
    queryFn: async () => {
      const res = await fetch('https://api.jikan.moe/v4/anime?status=complete&order_by=end_date&sort=desc&limit=5&sfw=true');
      const j = await res.json(); return j.data || [];
    },
    staleTime: 15 * 60 * 1000,
  });

  const heroAnimes = useMemo(() => trending?.data?.slice(0, 10) || [], [trending?.data]);
  const activeHero = heroAnimes[heroIndex];

  const recentHistory = useMemo(() => getRecentAnime().slice(0, 12), [getRecentAnime]);

  useSEO({ title: 'Home', description: 'Stream anime free on KamiStream — trending, seasonal and top rated all in one place.' });

  const { data: airingSchedule } = useQuery({
    queryKey: ['anilist', 'airing-schedule'],
    queryFn: getAiringSchedule,
    staleTime: 15 * 60 * 1000,
  });

  const { airingByDay, airingDays } = useMemo(() => {
    const byDay = (airingSchedule || []).reduce((acc: any, item: any) => {
      const d = new Date(item.airingAt * 1000);
      const key = d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});
    return { airingByDay: byDay, airingDays: Object.keys(byDay).slice(0, 3) };
  }, [airingSchedule]);

  // Normalise a watchlist item to what AnimeCard expects — guard against missing mal_id
  const wlToCard = useMemo(() => (item: any) => ({
    mal_id: item.mal_id,
    title: item.title,
    score: item.score,
    episodes: item.episodes,
    type: 'TV',
    images: { webp: { large_image_url: item.image_url || '' }, jpg: { large_image_url: item.image_url || '' } },
  }), []);

  // Normalise watch history entry — guard against missing mal_id
  const histToCard = useMemo(() => (item: any) => ({
    mal_id: item.mal_id,
    title: item.title,
    score: null,
    episodes: null,
    type: 'TV',
    images: { webp: { large_image_url: item.image_url || '' }, jpg: { large_image_url: item.image_url || '' } },
  }), []);

  // Auto-advance hero carousel
  useEffect(() => {
    if (heroAnimes.length === 0 || isHovered) return;
    const interval = setInterval(() => {
      setHeroIndex(prev => (prev + 1) % heroAnimes.length);
    }, 8000);
    return () => clearInterval(interval);
  }, [heroAnimes.length, isHovered]);

  return (
    <div className="p-4 md:p-6 space-y-10 pb-20">

      {/* ── Hero ── */}
      {activeHero ? (
        <div
          className="relative w-full h-[320px] md:h-[420px] rounded-2xl overflow-hidden"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <img
            src={activeHero.trailer?.images?.maximum_image_url || activeHero.images?.webp?.large_image_url || activeHero.images?.jpg?.large_image_url || ''}
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
                <button className="bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white px-6 py-2.5 rounded-xl text-[13px] font-bold hover:opacity-90 flex items-center gap-2">
                  <ChevronRight className="w-4 h-4" /> Watch Now
                </button>
              </Link>
              <button onClick={goToRandom} className="bg-white/10 backdrop-blur-md border border-white/20 text-white px-4 py-2.5 rounded-xl text-[13px] font-bold flex items-center gap-2 hover:bg-white/20 transition-all">
                <Shuffle className="w-4 h-4" /> Random
              </button>
              {activeHero.score && (
                <div className="bg-white/10 backdrop-blur-md border border-white/20 text-white px-4 py-2.5 rounded-xl text-[13px] font-bold flex items-center gap-1.5">
                  <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" /> {activeHero.score}
                </div>
              )}
            </div>
          </div>

          <div className="absolute bottom-4 right-6 flex gap-2">
            {heroAnimes.map((_: any, i: number) => (
              <button key={i} onClick={() => setHeroIndex(i)}
                className={`h-1.5 rounded-full transition-all ${i === heroIndex ? 'w-6 bg-[var(--pink)]' : 'w-1.5 bg-white/30 hover:bg-white/60'}`}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="w-full h-[320px] md:h-[420px] rounded-2xl bg-[var(--card)] animate-pulse" />
      )}

      {/* ── Recently Updated ── */}
      {recentlyUpdated && recentlyUpdated.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[18px] font-heading font-black flex items-center gap-2">
              <Radio className="w-4 h-4 text-[var(--green)]" /> Recently Updated
            </h2>
            <Link href="/browse" className="text-[12px] font-bold text-[var(--text3)] hover:text-[var(--pink)] transition-colors flex items-center gap-1">
              View All <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
            {recentlyUpdated.map((anime: any) => (
              <div key={anime.mal_id} className="relative">
                <AnimeCard anime={anime} />
                {anime.latestEp && (
                  <div className="absolute top-2 left-2 bg-[var(--green)] text-black text-[9px] font-black px-1.5 py-0.5 rounded-md z-10">
                    EP {anime.latestEp}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Schedule shortcut ── */}
      <Link href="/schedule">
        <div className="bg-gradient-to-r from-[var(--purple)]/20 to-[var(--pink)]/20 border border-[var(--purple)]/30 rounded-2xl p-5 flex items-center justify-between hover:border-[var(--pink)]/50 transition-all group cursor-pointer">
          <div className="flex items-center gap-3">
            <Calendar className="w-8 h-8 text-[var(--purple)]" />
            <div>
              <p className="font-heading font-black text-white text-[15px]">Airing This Week</p>
              <p className="text-[12px] text-[var(--text3)]">See what's airing today and this week</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-[var(--text3)] group-hover:text-[var(--pink)] transition-colors" />
        </div>
      </Link>

      {/* ── Continue Watching ── */}
      {recentHistory.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[15px] font-heading font-black text-white flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-[var(--purple)]" /> Continue Watching
            </h2>
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-2">
            {recentHistory.map((item: any) => (
              <AnimeCard key={item.mal_id} anime={histToCard(item)} />
            ))}
          </div>
        </section>
      )}

      {/* ── My Watchlist ── */}
      {watchlist.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[15px] font-heading font-black text-white flex items-center gap-2">
              <BookMarked className="w-3.5 h-3.5 text-[var(--pink)]" /> My Watchlist
            </h2>
            <Link href="/watchlist" className="text-[11px] font-bold text-[var(--text3)] hover:text-[var(--pink)] transition-colors flex items-center gap-1">
              View All ({watchlist.length}) <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-2">
            {watchlist.slice(0, 12).map((item: any) => (
              <AnimeCard key={item.mal_id} anime={wlToCard(item)} />
            ))}
          </div>
        </section>
      )}

      {/* ── New Release / New Added / Just Completed ── */}
      <section>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)]">
              <h3 className="text-[12px] font-heading font-black uppercase tracking-wide">🔥 New Release</h3>
              <Link href="/browse" className="text-[10px] text-[var(--text3)] hover:text-[var(--pink)]">See All →</Link>
            </div>
            <div className="p-1">
              {(newRelease || []).map((a: any) => <AnimeListCard key={a.mal_id} anime={a} badge="AIRING" />)}
            </div>
          </div>
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)]">
              <h3 className="text-[12px] font-heading font-black uppercase tracking-wide">⚡ New Added</h3>
              <Link href="/browse" className="text-[10px] text-[var(--text3)] hover:text-[var(--pink)]">See All →</Link>
            </div>
            <div className="p-1">
              {(recentlyUpdated || []).slice(0, 5).map((a: any) => (
                <AnimeListCard key={a.mal_id} anime={a} badge={a.latestEp ? `EP ${a.latestEp}` : undefined} badgeColor="var(--green)" />
              ))}
            </div>
          </div>
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)]">
              <h3 className="text-[12px] font-heading font-black uppercase tracking-wide">✅ Just Completed</h3>
              <Link href="/browse" className="text-[10px] text-[var(--text3)] hover:text-[var(--pink)]">See All →</Link>
            </div>
            <div className="p-1">
              {(justCompleted || []).map((a: any) => <AnimeListCard key={a.mal_id} anime={a} />)}
            </div>
          </div>
        </div>
      </section>

      {/* ── Trending Now ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[15px] font-heading font-black text-white flex items-center gap-2">
            <Flame className="w-3.5 h-3.5 text-[var(--pink)]" /> Trending Now
          </h2>
          <Link href="/browse" className="text-[11px] font-bold text-[var(--text3)] hover:text-[var(--pink)] transition-colors">View All</Link>
        </div>
        {trendingLoading ? <GridSkeleton /> : (
          <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-2">
            {trending?.data?.map((anime: any) => <AnimeCard key={anime.mal_id} anime={anime} />)}
          </div>
        )}
      </section>

      {/* ── Top Rated ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[15px] font-heading font-black text-white flex items-center gap-2">
            <Star className="w-3.5 h-3.5 text-yellow-400" /> Top Rated
          </h2>
          <Link href="/browse" className="text-[11px] font-bold text-[var(--text3)] hover:text-[var(--pink)] transition-colors">View All</Link>
        </div>
        {topRatedLoading ? <GridSkeleton /> : (
          <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-2">
            {topRated?.data?.map((anime: any) => <AnimeCard key={anime.mal_id} anime={anime} />)}
          </div>
        )}
      </section>

      {/* ── This Season ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[15px] font-heading font-black text-white flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-[var(--purple)]" /> This Season
          </h2>
          <Link href="/browse" className="text-[11px] font-bold text-[var(--text3)] hover:text-[var(--pink)] transition-colors">View All</Link>
        </div>
        {seasonalLoading ? <GridSkeleton /> : (
          <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-2">
            {seasonal?.data?.map((anime: any) => <AnimeCard key={anime.mal_id} anime={anime} />)}
          </div>
        )}
      </section>

      {/* ── Top Anime (Day / Week / Month) ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[15px] font-heading font-black text-white flex items-center gap-2">
            <Trophy className="w-4 h-4 text-[var(--gold)]" /> Top Anime
          </h2>
          <div className="flex bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden text-[11px] font-black">
            {(['day', 'week', 'month'] as const).map(p => (
              <button key={p} onClick={() => setTopPeriod(p)}
                className={`px-3 py-1.5 uppercase tracking-wide transition-colors ${topPeriod === p ? 'bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white' : 'text-[var(--text3)] hover:text-white'}`}>
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-2">
          {topAnimeLoading
            ? Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-2 animate-pulse">
                  <div className="w-7 text-center shrink-0"><div className="h-4 w-5 bg-[var(--card)] rounded mx-auto" /></div>
                  <div className="w-11 h-14 bg-[var(--card)] rounded-lg shrink-0" />
                  <div className="flex-1 space-y-1.5"><div className="h-3 bg-[var(--card)] rounded w-3/4" /><div className="h-2.5 bg-[var(--card)] rounded w-1/2" /></div>
                </div>
              ))
            : (topAnimeData?.data || []).map((anime: any, i: number) => (
                <Link key={anime.mal_id} href={`/anime/${anime.mal_id}`}>
                  <div className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-[var(--bg3)] transition-colors group cursor-pointer">
                    <div className={`w-7 shrink-0 text-center font-black text-[14px] leading-none ${i === 0 ? 'text-[var(--gold)]' : i === 1 ? 'text-[#C0C0C0]' : i === 2 ? 'text-[#cd7f32]' : 'text-[var(--text3)]'}`}>
                      {i + 1}
                    </div>
                    <img
                      src={anime.images?.webp?.small_image_url || anime.images?.jpg?.small_image_url}
                      alt={anime.title}
                      className="w-11 h-14 object-cover rounded-lg shrink-0 group-hover:scale-105 transition-transform duration-200"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-bold text-white line-clamp-2 leading-snug group-hover:text-[var(--pink)] transition-colors">{anime.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {anime.score && <span className="text-[10px] font-bold text-[var(--gold)] flex items-center gap-0.5"><Star className="w-2.5 h-2.5 fill-current" />{anime.score}</span>}
                        {anime.type && <span className="text-[9px] text-[var(--text3)] font-bold">{anime.type}</span>}
                        {anime.episodes && <span className="text-[9px] text-[var(--text3)]">{anime.episodes} ep</span>}
                      </div>
                    </div>
                  </div>
                </Link>
              ))
          }
        </div>
      </section>

      {/* ── Airing This Week ── */}
      {airingDays.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[16px] font-heading font-black text-white flex items-center gap-2">
              <Radio className="w-4 h-4 text-[var(--pink)] animate-pulse" /> Airing This Week
            </h2>
          </div>
          <div className="space-y-6">
            {airingDays.map((day: string) => (
              <div key={day}>
                <div className="text-[11px] font-black text-[var(--text3)] uppercase tracking-widest mb-3">{day}</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                  {airingByDay[day].map((item: any) => {
                    const m = item.media;
                    const title = m?.title?.english || m?.title?.romaji || 'Unknown';
                    const malId = m?.idMal;
                    const now = Math.floor(Date.now() / 1000);
                    const secs = item.airingAt - now;
                    const h = Math.floor(secs / 3600);
                    const min = Math.floor((secs % 3600) / 60);
                    const timeStr = secs <= 0 ? 'Out now!' : h > 0 ? `in ${h}h ${min}m` : `in ${min}m`;
                    return (
                      <Link key={`${m?.id}-${item.episode}`} href={malId ? `/anime/${malId}` : '#'}>
                        <div className="group bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden hover:border-[var(--pink)] transition-all cursor-pointer">
                          <div className="aspect-[3/4] relative overflow-hidden">
                            {m?.coverImage?.large
                              ? <img src={m.coverImage.large} alt={title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                              : <div className="w-full h-full bg-[var(--bg3)] flex items-center justify-center text-2xl">📺</div>
                            }
                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-2">
                              <div className="text-[10px] font-black text-[var(--pink)]">EP {item.episode}</div>
                              <div className="text-[10px] font-bold text-white">{timeStr}</div>
                            </div>
                          </div>
                          <div className="p-2">
                            <div className="text-[11px] font-bold text-white line-clamp-2 leading-tight">{title}</div>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div id="home-ad" className="min-h-[1px]"
        ref={el => { if (el && (window as any).KamiAds) (window as any).KamiAds.loadInPagePush('home-ad'); }}
      />
    </div>
  );
}
