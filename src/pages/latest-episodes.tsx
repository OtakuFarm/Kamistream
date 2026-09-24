import React from 'react';
import { Link } from 'wouter';
import { useSEO } from '@/hooks/useSEO';
import { useRecentlyUpdated } from '@/hooks/useRecentlyUpdated';
import { AnimeCard } from '@/components/AnimeCard';
import { GridSkeleton } from '@/components/LoadingSkeleton';

// MUST MATCH api/latest.js — that function serves the server HTML crawlers
// see on a direct hit; useSEO keeps the client-rendered view identical after
// a client-side navigation (Google compares the two).
const SEO_TITLE = 'Latest Anime Episodes — Aired in the Last 72 Hours';
const SEO_DESC  = 'The newest anime episodes on KamiStream — everything that aired in the last 72 hours, updated daily. Watch sub & dub free in HD.';

export default function LatestEpisodes() {
  useSEO({ title: SEO_TITLE, description: SEO_DESC, url: '/latest-episodes' });

  const { data: items, isLoading } = useRecentlyUpdated(24);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="mb-5">
        <h1 className="text-[20px] font-heading font-black text-white">Latest Anime Episodes</h1>
        {/* Intro MUST MATCH the server copy in api/latest.js renderDoc(). */}
        <p className="text-[13px] text-[var(--text2)] mt-1.5 max-w-[78ch] leading-relaxed">
          Every anime episode released in the last 72 hours, newest first — updated automatically
          throughout the day. Sub &amp; dub, free in HD.
        </p>
        <p className="text-[13px] text-[var(--text3)] mt-2 max-w-[78ch] leading-relaxed">
          Looking for what's on today? See the <Link href="/schedule" className="text-[var(--pink)] hover:underline font-bold">weekly schedule</Link>,
          browse <Link href="/category/this-season" className="text-[var(--pink)] hover:underline font-bold">this season's anime</Link>,
          or explore everything on the <Link href="/browse" className="text-[var(--pink)] hover:underline font-bold">browse</Link> page.
        </p>
      </div>

      {/* Heading MUST MATCH api/latest.js renderDoc() grid heading. */}
      {items?.length ? (
        <h2 className="text-[15px] font-heading font-black text-white mt-6 mb-3">Newly released episodes</h2>
      ) : null}

      {isLoading ? (
        <GridSkeleton />
      ) : items?.length ? (
        <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-9 xl:grid-cols-11 gap-2">
          {items.map((anime: any, i: number) => (
            <div key={anime.mal_id} className="relative kami-rise" style={{ animationDelay: `${Math.min(i * 40, 500)}ms` }}>
              <AnimeCard anime={anime} index={i} />
              {anime.latestEp && (
                <div className="absolute top-2 left-2 bg-[var(--green)] text-black text-[9px] font-black px-1.5 py-0.5 rounded-md z-10">
                  EP {anime.latestEp}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[13px] text-[var(--text3)]">
          No episodes found in the last 72 hours — check the{' '}
          <Link href="/schedule" className="text-[var(--pink)] hover:underline font-bold">weekly schedule</Link> or browse{' '}
          <Link href="/browse" className="text-[var(--pink)] hover:underline font-bold">all anime</Link>.
        </p>
      )}
    </div>
  );
}
