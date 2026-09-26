import React, { useEffect, useRef, useState } from "react";
import { useRoute, Link } from "wouter";
import { useInfiniteQuery } from "@tanstack/react-query";
import { AnimeCard } from "@/components/AnimeCard";
import { GridSkeleton } from "@/components/LoadingSkeleton";
import { useSEO } from "@/hooks/useSEO";
import { ChevronLeft, Loader2 } from "lucide-react";
import { jikanFetch } from "@/lib/jikanFetch";
import { getAnimeList, withCatalogueFallback } from "@/lib/catalogue";
import { dedupeByMalId } from "@/lib/dedupeAnime";
import {
  POPULAR_GENRES_BY_NAME,
  isPopularGenre,
  popularGenreName,
  isAdultGenre,
} from "@/lib/genres";

// Which /genre/:id pages exist is decided in exactly ONE place —
// src/lib/genres.js (POPULAR_GENRES). Before this, this file held all 58 MAL
// ids while the sidebar offered 14, the browse filter 12 and the sitemaps 58:
// three answers to the same question. Anything not in POPULAR_GENRES is now
// unambiguously not a page — the not-found branch below renders it, the
// sitemaps don't list it and no chip links to it.
const ALL_GENRES = POPULAR_GENRES_BY_NAME;

const SORT_OPTIONS = [
  { v: "popularity", l: "Most Popular" },
  { v: "score",      l: "Highest Rated" },
  { v: "start_date", l: "Newest First" },
];

async function fetchGenrePage(genreId: string, sort: string, page: number) {
  // Catalogue first, Jikan second.
  //
  // getAnimeList returns the Jikan response shape, so this function's
  // contract is unchanged and nothing downstream knows the difference.
  // withCatalogueFallback handles the three cases that matter while the
  // catalogue is being filled in: the flag being off, the genre not being
  // imported yet (empty result -> Jikan), and Supabase being unreachable
  // (throws -> Jikan). A partially-populated catalogue therefore degrades
  // to today's behaviour rather than showing an empty grid.
  return withCatalogueFallback(
    () => getAnimeList({
      genreId,
      page,
      limit: 24,
      sort: sort === 'score' ? 'score' : sort === 'start_date' ? 'recent' : 'popular',
    }),
    () => fetchGenrePageFromJikan(genreId, sort, page),
    (res) => !res?.data?.length,
  );
}

async function fetchGenrePageFromJikan(genreId: string, sort: string, page: number) {
  const params = new URLSearchParams({
    genres:   genreId,
    order_by: sort,
    limit:    "24",
    page:     String(page),
  });
  // Jikan's sfw flag filters an explicit genre OUT of its own genre listing,
  // so /genre/9 (Ecchi) and /genre/12 (Hentai) came back empty with it set.
  // Adult genres are requested unfiltered; every other genre keeps the flag.
  // See ADULT_GENRE_IDS in src/lib/genres.js.
  if (!isAdultGenre(genreId)) params.set("sfw", "true");
  return jikanFetch(`/anime?${params}`);
}

export default function Genre() {
  const [, params] = useRoute("/genre/:id");
  const genreId   = params?.id || "";
  const [sort, setSort] = useState("popularity");
  const activeChip = useRef<HTMLSpanElement | null>(null);

  const isKnownGenre = isPopularGenre(genreId);
  const genreName    = popularGenreName(genreId);

  // Keep the selected genre chip in view when switching genres
  useEffect(() => {
    activeChip.current?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [genreId]);

  useSEO(isKnownGenre ? {
    title:       `${genreName} Anime — Watch Free Online`,
    description: `Browse the best ${genreName} anime on KamiStream — top-rated series streaming free in HD, sub & dub.`,
    url:         `/genre/${genreId}`,
  } : {
    title:   'Genre Not Found',
    noindex: true,
  });

  const {
    data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading,
  } = useInfiniteQuery({
    queryKey:        ["genre", genreId, sort],
    queryFn:         ({ pageParam = 1 }) =>
      fetchGenrePage(genreId, sort, pageParam as number),
    getNextPageParam: (last: any) => {
      const cur = last?.pagination?.current_page ?? 1;
      const max = last?.pagination?.last_visible_page ?? 1;
      return cur >= max ? undefined : cur + 1;
    },
    initialPageParam: 1,
    // A genre we don't publish has no listing to fetch — the not-found branch
    // below renders instead, so these URLs cost no API calls either.
    enabled:          isKnownGenre,
    staleTime:        5 * 60 * 1000,
  });

  const anime = dedupeByMalId(data?.pages.flatMap((p: any) => p.data ?? []) ?? []);

  // ── Not a page we publish ──────────────────────────────────────────────
  // noindex is already set above. This used to render a complete listing for
  // e.g. /genre/18 (Mecha) — a live page the sitemap described as "Genre Not
  // Found", which is the exact soft-404 pattern Search Console flags. Now the
  // URL is short, honest, non-indexable, and its only outbound links are to
  // genre hubs that really exist.
  if (!isKnownGenre) {
    return (
      <div className="p-4 md:p-6 pb-20 max-w-3xl">
        <nav className="text-[12px] text-[var(--text3)] mb-4 flex flex-wrap items-center gap-1.5">
          <Link href="/home"><span className="hover:text-white cursor-pointer">Home</span></Link>
          <span>/</span>
          <Link href="/browse"><span className="hover:text-white cursor-pointer">Browse</span></Link>
          <span>/</span>
          <span>Genre not found</span>
        </nav>

        <h1 className="text-2xl font-heading font-black text-white mb-3">Genre Not Found</h1>
        <p className="text-[13px] text-[var(--text2)] leading-relaxed mb-6">
          We don't publish a page for this genre. Pick one of the genres below,
          or browse the full catalogue instead.
        </p>

        <div className="flex flex-wrap gap-1.5 mb-6">
          {ALL_GENRES.map(g => (
            <Link key={g.id} href={`/genre/${g.id}`}>
              <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-[var(--card)] text-[var(--text2)] border border-[var(--border)] hover:border-[var(--purple)] hover:text-white transition-colors cursor-pointer">
                {g.name}
              </span>
            </Link>
          ))}
        </div>

        <Link href="/browse">
          <button className="bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white px-6 py-2.5 rounded-xl text-[13px] font-bold hover:brightness-110 transition-all">
            Browse all anime
          </button>
        </Link>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 pb-20">

      {/* Header */}
      <div className="flex items-center gap-4 mb-5">
        <Link href="/browse">
          <button className="w-10 h-10 bg-[var(--card)] border border-[var(--border)] rounded-xl flex items-center justify-center hover:border-[var(--purple)] transition-colors">
            <ChevronLeft className="w-5 h-5 text-[var(--text2)]" />
          </button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-heading font-black text-white truncate">{genreName}</h1>
          {anime.length > 0 && (
            <p className="text-[12px] text-[var(--text3)]">{anime.length}+ anime</p>
          )}
        </div>
        <select
          value={sort}
          onChange={e => setSort(e.target.value)}
          className="bg-[var(--card)] border border-[var(--border)] text-white text-[12px] px-3 py-2 rounded-xl outline-none focus:border-[var(--purple)] shrink-0"
        >
          {SORT_OPTIONS.map(o => (
            <option key={o.v} value={o.v}>{o.l}</option>
          ))}
        </select>
      </div>

      {/* Genre quick-switch — every genre we publish, current one highlighted */}
      <div className="flex flex-wrap gap-1.5 mb-6">
        {ALL_GENRES.map(g => (
          <Link key={g.id} href={`/genre/${g.id}`}>
            <span
              ref={String(g.id) === genreId ? activeChip : undefined}
              className={`px-3 py-1 rounded-full text-[11px] font-bold cursor-pointer transition-all ${
              String(g.id) === genreId
                ? "bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white"
                : "bg-[var(--card)] text-[var(--text2)] border border-[var(--border)] hover:border-[var(--purple)] hover:text-white"
            }`}
            >
              {g.name}
            </span>
          </Link>
        ))}
      </div>

      {/* Grid */}
      {isLoading ? (
        <GridSkeleton />
      ) : (
        <>
          {anime.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {anime.map((a: any) => (
                <AnimeCard key={a.mal_id} anime={a} />
              ))}
            </div>
          ) : (
            <div className="text-center py-20 text-[var(--text3)]">
              No anime found for this genre.
            </div>
          )}

          {hasNextPage && (
            <div className="flex justify-center mt-10">
              <button
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="flex items-center gap-2 bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white px-8 py-3 rounded-xl text-[13px] font-bold hover:brightness-110 transition-all disabled:opacity-60"
              >
                {isFetchingNextPage
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Loading…</>
                  : `Load More (${anime.length} shown)`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
