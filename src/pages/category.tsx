import React, { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Flame, Zap, CheckCircle2, TrendingUp, Star,
  Sparkles, Trophy, ChevronLeft, ChevronRight,
  Home, Rocket, RefreshCw, LayoutGrid,
} from "lucide-react";
import { AnimeCard } from "@/components/AnimeCard";
import { useSEO } from "@/hooks/useSEO";
import { jikanFetch } from "@/lib/jikanFetch";
import { dedupeByMalId } from "@/lib/dedupeAnime";

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
    data:     j.data    || [],
    hasNext:  j.pagination?.has_next_page ?? false,
    lastPage: j.pagination?.last_visible_page ?? null,
  };
}

// ── Category config ─────────────────────────────────────────────────────────
const CATEGORIES: Record<string, {
  label:       string;
  icon:        React.ReactNode;
  description: string;
  color:       string;
  ranked?:     boolean;
  fetchPage:   (page: number) => Promise<{ data: any[]; hasNext: boolean; lastPage: number | null }>;
}> = {
  "trending": {
    label:       "Trending Now",
    icon:        <TrendingUp className="w-5 h-5" />,
    // FIX: was /top/anime?filter=bypopularity (all-time popularity, barely
    // changes). /top/anime?filter=airing tracks what's hot right now — and the
    // AniList fallback maps it to TRENDING_DESC, matching the intent.
    description: "What's hot right now — the top airing anime this week",
    color:       "#f97316",
    ranked:      true,
    fetchPage:   (p) => catFetch("/top/anime?filter=airing&limit=24", p),
  },
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
  "top-rated": {
    label:       "Top Rated",
    icon:        <Star className="w-5 h-5" />,
    description: "Highest rated anime of all time",
    color:       "var(--gold)",
    ranked:      true,
    fetchPage:   (p) => catFetch("/top/anime?limit=24", p),
  },
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
    ranked:      true,
    fetchPage:   (p) => catFetch("/top/anime?type=tv&limit=24", p),
  },
  "upcoming": {
    label:       "Upcoming Anime",
    icon:        <Rocket className="w-5 h-5" />,
    description: "Anime that haven't started airing yet",
    color:       "var(--pink)",
    fetchPage:   (p) => catFetch("/anime?status=upcoming&order_by=members&sort=desc&limit=24", p),
  },
};

const CATEGORY_ORDER = ["trending", "new-release", "new-added", "just-completed", "top-rated", "this-season", "top-anime", "upcoming"];

const PAGE_SIZE = 24;

// Rank medal colors — gold / silver / bronze for the podium, muted for the rest
function rankColor(rank: number): string {
  if (rank === 1) return "#ffd60a";
  if (rank === 2) return "#d1d5db";
  if (rank === 3) return "#cd7f32";
  return "rgba(255,255,255,0.75)";
}

// Build page buttons with ellipsis: 1 … 4 5 6 … 24
function buildPageButtons(page: number, last: number | null): (number | "…")[] {
  if (!last || last <= 7) {
    return Array.from({ length: Math.max(1, last || 1) }, (_, i) => i + 1);
  }
  const out: (number | "…")[] = [1];
  if (page > 3) out.push("…");
  for (let i = Math.max(2, page - 1); i <= Math.min(last - 1, page + 1); i++) out.push(i);
  if (page < last - 2) out.push("…");
  if (last > 1) out.push(last);
  return out;
}

// ── Skeleton grid ────────────────────────────────────────────────────────────
function SkeletonGrid() {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2.5">
      {Array.from({ length: PAGE_SIZE }).map((_, i) => (
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

  const { data, isLoading, isFetching, error, refetch } = useQuery({
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

  const items: any[] = dedupeByMalId(data?.data || []);
  const lastPage: number | null = data?.lastPage ?? null;

  function goPage(p: number) {
    setPage(p);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const pageButtons = buildPageButtons(page, lastPage);

  return (
    <div className="p-4 md:p-6 pb-20 max-w-[1600px] mx-auto space-y-5">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-[12px] text-[var(--text3)]">
        <Link href="/" className="hover:text-[var(--pink)] flex items-center gap-1 transition-colors">
          <Home className="w-3 h-3" /> Home
        </Link>
        <span>/</span>
        <span className="text-white font-bold">{cat.label}</span>
      </div>

      {/* Hero header — tinted with the category color */}
      <div className="relative rounded-3xl overflow-hidden border border-[var(--border)]">
        <div
          className="absolute inset-0"
          style={{
            background:
              `radial-gradient(120% 140% at 0% 0%, color-mix(in srgb, ${cat.color} 16%, transparent), transparent 60%),` +
              `radial-gradient(90% 120% at 100% 100%, color-mix(in srgb, ${cat.color} 10%, transparent), transparent 55%),` +
              "var(--card)",
          }}
        />
        <div className="relative p-5 md:p-7">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                style={{
                  background: `color-mix(in srgb, ${cat.color} 18%, transparent)`,
                  color:      cat.color,
                  boxShadow:  `0 0 32px color-mix(in srgb, ${cat.color} 30%, transparent)`,
                }}
              >
                {cat.icon}
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-heading font-black text-white leading-tight">
                  {cat.label}
                </h1>
                <p className="text-[13px] text-[var(--text2)] mt-1">{cat.description}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {!isLoading && items.length > 0 && (
                <div className="text-[12px] text-[var(--text3)] font-mono bg-black/30 border border-[var(--border)] px-3 py-1.5 rounded-lg">
                  {items.length} anime · Page {page}
                </div>
              )}
              <button
                onClick={() => refetch()}
                disabled={isFetching}
                className="w-9 h-9 rounded-lg bg-black/30 border border-[var(--border)] text-[var(--text3)] hover:text-white hover:border-[var(--pink)] transition-all flex items-center justify-center disabled:opacity-40"
                title="Refresh"
              >
                <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>

          {/* Category quick-nav pills */}
          <div className="flex gap-1.5 overflow-x-auto mt-5 -mb-1 pb-1 scrollbar-none">
            <Link href="/browse" className="shrink-0">
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold bg-black/30 border border-[var(--border)] text-[var(--text3)] hover:text-white transition-colors">
                <LayoutGrid className="w-3 h-3" /> All Anime
              </span>
            </Link>
            {CATEGORY_ORDER.map(key => {
              const c = CATEGORIES[key];
              const active = key === slug;
              return (
                <Link key={key} href={`/category/${key}`} className="shrink-0">
                  <span
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-colors"
                    style={active
                      ? { background: `color-mix(in srgb, ${c.color} 22%, transparent)`, color: c.color, border: `1px solid color-mix(in srgb, ${c.color} 45%, transparent)` }
                      : { background: "rgba(0,0,0,0.3)", color: "var(--text3)", border: "1px solid var(--border)" }}
                  >
                    {c.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className={`transition-opacity duration-200 ${isFetching ? "opacity-60" : "opacity-100"}`}>
        {isLoading ? (
          <SkeletonGrid />
        ) : error ? (
          <div className="py-20 text-center">
            <p className="text-4xl mb-3">😵</p>
            <p className="text-[15px] font-bold text-white mb-1">Couldn't load this category</p>
            <p className="text-[12px] text-[var(--text3)] mb-5">
              The anime database may be rate-limiting us. Try again in a moment.
            </p>
            <button
              onClick={() => refetch()}
              className="px-5 py-2.5 rounded-xl font-bold text-[13px] text-white transition-all hover:brightness-110"
              style={{ background: "linear-gradient(135deg, var(--pink), var(--purple))" }}
            >
              Retry
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-4xl mb-3">🫥</p>
            <p className="text-[15px] font-bold text-white mb-1">No anime found for this category</p>
            <p className="text-[12px] text-[var(--text3)] mb-5">Check back soon — lists update as shows air.</p>
            <Link href="/browse">
              <button
                className="px-5 py-2.5 rounded-xl font-bold text-[13px] text-white transition-all hover:brightness-110"
                style={{ background: "linear-gradient(135deg, var(--pink), var(--purple))" }}
              >
                Browse All Anime
              </button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2.5">
            {items.map((anime: any, i: number) => {
              const rank = cat.ranked ? (page - 1) * PAGE_SIZE + i + 1 : null;
              return (
                <div key={anime.mal_id} className="relative">
                  <AnimeCard anime={anime} />
                  {rank !== null && (
                    <div
                      className="absolute top-1.5 left-1.5 z-20 min-w-7 h-7 px-1 rounded-lg bg-black/75 backdrop-blur-sm border border-white/10 flex items-center justify-center text-[11px] font-black pointer-events-none"
                      style={{ color: rankColor(rank) }}
                    >
                      #{rank}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {!isLoading && !error && items.length > 0 && (
        <div className="flex items-center justify-center gap-1.5 pt-4 flex-wrap">
          <button
            onClick={() => goPage(Math.max(1, page - 1))}
            disabled={page === 1 || isFetching}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--card)] border border-[var(--border)] text-[13px] font-bold text-[var(--text3)] hover:text-white hover:border-[var(--pink)] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" /> Prev
          </button>

          {pageButtons.map((p, idx) =>
            p === "…" ? (
              <span key={`e-${idx}`} className="w-6 text-center text-[13px] text-[var(--text3)] select-none">…</span>
            ) : (
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
            )
          )}

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