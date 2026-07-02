import React, { useState } from "react";
import { useRoute, Link } from "wouter";
import { useInfiniteQuery } from "@tanstack/react-query";
import { AnimeCard } from "@/components/AnimeCard";
import { GridSkeleton } from "@/components/LoadingSkeleton";
import { useSEO } from "@/hooks/useSEO";
import { ChevronLeft, Loader2 } from "lucide-react";
import { jikanFetch } from "@/lib/jikanFetch";

// ── Verified Jikan MAL genre IDs ─────────────────────────────────────────────
// FIX: Previous IDs were wrong (e.g. 5 was labelled Comedy but is Avant Garde).
// These match https://api.jikan.moe/v4/genres/anime exactly.
const GENRES: Record<string, string> = {
  "1":  "Action",
  "2":  "Adventure",
  "4":  "Comedy",
  "7":  "Mystery",
  "8":  "Drama",
  "9":  "Ecchi",
  "10": "Fantasy",
  "13": "Historical",
  "14": "Horror",
  "17": "Martial Arts",
  "18": "Mecha",
  "19": "Music",
  "22": "Romance",
  "23": "School",
  "24": "Sci-Fi",
  "25": "Shoujo",
  "27": "Shounen",
  "29": "Space",
  "30": "Sports",
  "36": "Slice of Life",
  "37": "Supernatural",
  "38": "Military",
  "40": "Psychological",
  "41": "Thriller",
  "42": "Seinen",
  "43": "Josei",
  "46": "Award Winning",
  "47": "Gourmet",
  "50": "Adult Cast",
  "55": "Delinquents",
  "56": "Detective",
  "57": "Educational",
  "60": "Gore",
  "61": "Harem",
  "62": "High Stakes Game",
  "65": "Idols (Male)",
  "66": "Isekai",
  "67": "Iyashikei",
  "70": "Mahou Shoujo",
  "71": "Medical",
  "72": "Mythology",
  "74": "Otaku Culture",
  "75": "Parody",
  "77": "Pets",
  "78": "Racing",
  "79": "Reincarnation",
  "82": "Samurai",
  "83": "Showbiz",
  "84": "Strategy Game",
  "85": "Super Power",
  "86": "Survival",
  "87": "Team Sports",
  "88": "Time Travel",
  "89": "Vampire",
  "91": "Villainess",
  "93": "Witchcraft",
  "94": "Yaoi",
  "95": "Yuri",
};

// Only show popular ones in the quick-switch bar
const POPULAR_IDS = [
  "1","2","4","7","8","10","13","14","18","19","22","23","24",
  "25","27","30","36","37","40","41","42","43","66","79","85","86",
];

const SORT_OPTIONS = [
  { v: "popularity", l: "Most Popular" },
  { v: "score",      l: "Highest Rated" },
  { v: "start_date", l: "Newest First" },
];

async function fetchGenrePage(genreId: string, sort: string, page: number) {
  const params = new URLSearchParams({
    genres:   genreId,
    order_by: sort,
    limit:    "24",
    page:     String(page),
    sfw:      "true",
  });
  return jikanFetch(`/anime?${params}`);
}

export default function Genre() {
  const [, params] = useRoute("/genre/:id");
  const genreId   = params?.id || "";
  const genreName = GENRES[genreId] || "Genre";
  const [sort, setSort] = useState("popularity");

  useSEO({
    title:       `${genreName} Anime`,
    description: `Browse the best ${genreName} anime on KamiStream.`,
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
    enabled:          !!genreId,
    staleTime:        5 * 60 * 1000,
  });

  const anime = data?.pages.flatMap((p: any) => p.data ?? []) ?? [];

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

      {/* Popular genre quick-switch */}
      <div className="flex flex-wrap gap-1.5 mb-6">
        {POPULAR_IDS.map(id => (
          <Link key={id} href={`/genre/${id}`}>
            <span className={`px-3 py-1 rounded-full text-[11px] font-bold cursor-pointer transition-all ${
              id === genreId
                ? "bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white"
                : "bg-[var(--card)] text-[var(--text2)] border border-[var(--border)] hover:border-[var(--purple)] hover:text-white"
            }`}>
              {GENRES[id]}
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
