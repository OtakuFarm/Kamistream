import React, { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Flame, Zap, CheckCircle2, TrendingUp, Star,
  Sparkles, Trophy, ChevronLeft, ChevronRight,
  Home, Rocket,
} from "lucide-react";
import { AnimeCard } from "@/components/AnimeCard";
import { useSEO } from "@/hooks/useSEO";
import { jikanFetch } from "@/lib/jikanFetch";

// ── Helpers ─────────────────────────────────────────────────────────────────
function getCurrentSeason(): { season: string; year: number } {
  const m    = new Date().getMonth();
  const year = new Date().getFullYear();
  const season =
    m < 3 ? "winter" : m < 6 ? "spring" : m < 9 ? "summer" : "fall";
  return { season, year };
}

async function catFetch(endpoint: string, page: number) {
  const sep = endpoint.includes("?") ? "&" : "?";
  const j   = await jikanFetch(`${endpoint}${sep}page=${page}&sfw=true`);
  return {
    data:    j.data    || [],
    hasNext: j.pagination?.has_next_page ?? false,
  };
}

// ── Category config ─────────────────────────────────────────────────────────
const CATEGORIES: Record<string, {
  label:       string;
  icon:        React.ReactNode;
  description: string;
  color:       string;
  fetchPage:   (page: number) => Promise<{ data: any[]; hasNext: boolean }>;
}> = {
  "new-release": {
    label:       "New Release",
    icon:        <Flame className="w-5 h-5" />,
    description: "Currently airing anime sorted by popularity",
    color:       "var(--pink)",
    fetchPage:   (p) => catFetch("/anime?status=airing&order_by=members&sort=desc&limit=24", p),
  },
  "new-added": {
    label:       "New Added",
    icon:        <Zap className="w-5 h-5" />,
    description: "Recently started anime — fresh new seasons and debuts",
    color:       "var(--green)",
    fetchPage:   (p) => catFetch("/anime?status=airing&order_by=start_date&sort=desc&limit=24", p),
  },
  "just-completed": {
    label:       "Just Completed",
    icon:        <CheckCircle2 className="w-5 h-5" />,
    description: "Anime that recently finished airing",
    color:       "var(--blue)",
    fetchPage:   (p) => catFetch("/anime?status=complete&order_by=end_date&sort=desc&limit=24", p),
  },
  "trending": {
    label:       "Trending Now",
    icon:        <TrendingUp className="w-5 h-5" />,
    description: "Most popular anime right now",
    color:       "#f97316",
    fetchPage:   (p) => catFetch("/top/anime?filter=bypopularity&limit=24", p),
  },
  "top-rated": {
    label:       "Top Rated",
    icon:        <Star className="w-5 h-5" />,
    description: "Highest rated anime of all time",
    color:       "var(--gold)",
    fetchPage:   (p) => catFetch("/top/anime?limit=24", p),
  },
  // FIX: was using /seasons/now (returns all airing sorted by members).
  // Now uses /seasons/{year}/{season} — only anime from the current season.
  "this-season": {
    label:       "This Season",
    icon:        <Sparkles className="w-5 h-5" />,
    description: "Anime airing in the current season",
    color:       "var(--purple)",
    fetchPage:   (p) => {
      const { season, year } = getCurrentSeason();
      return catFetch(`/seasons/${year}/${season}?limit=24`, p);
    },
  },
  "top-anime": {
    label:       "Top Anime",
    icon:        <Trophy className="w-5 h-5" />,
    description: "All-time top anime ranked by score",
    color:       "var(--gold)",
    fetchPage:   (p) => catFetch("/top/anime?type=tv&limit=24", p),
  },
  // FIX: "upcoming" was completely missing — home page links to /category/upcoming
  "upcoming": {
    label:       "Upcoming Anime",
    icon:        <Rocket className="w-5 h-5" />,
    description: "Anime that haven't started airing yet",
    color:       "var(--pink)",
    fetchPage:   (p) => catFetch("/anime?status=upcoming&order_by=members&sort=desc&limit=24", p),
  },
};

// ── Skeleton grid ────────────────────────────────────────────────────────────
function SkeletonGrid() {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2.5">
      {Array.from({ length: 24 }).map((_, i) => (
        <div key={i} className="animate-pulse">
          <div className="aspect-[2/3] bg-[var(--card)] rounded-xl" />
          <div className="mt-2 h-2.5 bg-[var(--card)] rounded w-4/5" />
          <div className="mt-1.5 h-2 bg-[var(--card)] rounded w-3/5" />
        </div>
      ))}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function Category() {
  const { slug }  = useParams<{ slug: string }>();
  const [page, setPage] = useState(1);
  const cat = CATEGORIES[slug ?? ""];

  useSEO({
    title:       cat ? cat.label : "Category",
    description: cat?.description ?? "Browse anime by category on KamiStream.",
  });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["category", slug, page],
    queryFn:  () => cat!.fetchPage(page),
    enabled:  !!cat,
    staleTime: 10 * 60 * 1000,
    placeholderData: (prev: any) => prev,
  });

  if (!cat) {
    return (
      <div className="p-8 text-center">
        <p className="text-[var(--text3)] mb-4">Category not found.</p>
        <Link href="/" className="text-[var(--pink)] font-bold hover:underline">← Back to Home</Link>
      </div>
    );
  }

  const items: any[] = data?.data || [];

  function goPage(p: number) {
    setPage(p);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Build a small window of page buttons around current page
  const pageButtons: number[] = [];
  for (let i = Math.max(1, page - 2); i <= page + 2; i++) {
    pageButtons.push(i);
  }

  return (
    <div className="p-4 md:p-6 pb-20 space-y-6">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-[12px] text-[var(--text3)]">
        <Link href="/" className="hover:text-[var(--pink)] flex items-center gap-1 transition-colors">
          <Home className="w-3 h-3" /> Home
        </Link>
        <span>/</span>
        <span className="text-white font-bold">{cat.label}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: `color-mix(in srgb, ${cat.color} 20%, transparent)`, color: cat.color }}
          >
            {cat.icon}
          </div>
          <div>
            <h1 className="text-2xl font-heading font-black text-white leading-none">{cat.label}</h1>
            <p className="text-[13px] text-[var(--text3)] mt-0.5">{cat.description}</p>
          </div>
        </div>
        <div className="shrink-0 text-[12px] text-[var(--text3)] font-mono bg-[var(--card)] border border-[var(--border)] px-3 py-1.5 rounded-lg">
          Page {page}
        </div>
      </div>

      {/* Divider */}
      <div className="h-px" style={{ background: `linear-gradient(to right, ${cat.color}, transparent)` }} />

      {/* Grid */}
      <div className={`transition-opacity duration-200 ${isFetching ? "opacity-60" : "opacity-100"}`}>
        {isLoading ? (
          <SkeletonGrid />
        ) : items.length === 0 ? (
          <div className="py-20 text-center text-[var(--text3)]">No anime found for this category.</div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2.5">
            {items.map((anime: any) => (
              <AnimeCard key={anime.mal_id} anime={anime} />
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {!isLoading && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <button
            onClick={() => goPage(Math.max(1, page - 1))}
            disabled={page === 1 || isFetching}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--card)] border border-[var(--border)] text-[13px] font-bold text-[var(--text3)] hover:text-white hover:border-[var(--pink)] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" /> Prev
          </button>

          {pageButtons.map(p => (
            <button
              key={p}
              onClick={() => goPage(p)}
              disabled={isFetching}
              className={`w-9 h-9 rounded-xl text-[13px] font-bold border transition-all disabled:cursor-not-allowed ${
                p === page
                  ? "border-transparent text-white"
                  : "bg-[var(--card)] border-[var(--border)] text-[var(--text3)] hover:text-white hover:border-[var(--pink)]"
              }`}
              style={p === page ? { background: "linear-gradient(135deg, var(--pink), var(--purple))" } : {}}
            >
              {p}
            </button>
          ))}

          <button
            onClick={() => goPage(page + 1)}
            disabled={!data?.hasNext || isFetching}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--card)] border border-[var(--border)] text-[13px] font-bold text-[var(--text3)] hover:text-white hover:border-[var(--pink)] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
