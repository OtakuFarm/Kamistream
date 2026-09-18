import React from "react";
import { Link } from "wouter";
import {
  LayoutGrid, TrendingUp, Flame, Zap, CheckCircle2,
  Star, Sparkles, Trophy, Rocket,
} from "lucide-react";

// Mirrors the category config in pages/category.tsx — kept in sync manually.
const PILLS = [
  { key: "trending",       label: "Trending",      color: "#f97316",     icon: <TrendingUp className="w-3 h-3" /> },
  { key: "new-release",    label: "New Release",   color: "var(--pink)", icon: <Flame className="w-3 h-3" /> },
  { key: "new-added",      label: "New Added",     color: "var(--green)",icon: <Zap className="w-3 h-3" /> },
  { key: "just-completed", label: "Just Completed",color: "var(--blue)", icon: <CheckCircle2 className="w-3 h-3" /> },
  { key: "top-rated",      label: "Top Rated",     color: "var(--gold)", icon: <Star className="w-3 h-3" /> },
  { key: "this-season",    label: "This Season",   color: "var(--purple)",icon: <Sparkles className="w-3 h-3" /> },
  { key: "top-anime",      label: "Top Anime",     color: "var(--gold)", icon: <Trophy className="w-3 h-3" /> },
  { key: "upcoming",       label: "Upcoming",      color: "var(--pink)", icon: <Rocket className="w-3 h-3" /> },
];

export function CategoryPills({ active }: { active?: string }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
      <Link href="/browse" className="shrink-0">
        <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold bg-black/30 border border-[var(--border)] text-[var(--text3)] hover:text-white transition-colors">
          <LayoutGrid className="w-3 h-3" /> All Anime
        </span>
      </Link>
      {PILLS.map(p => {
        const isActive = p.key === active;
        return (
          <Link key={p.key} href={`/category/${p.key}`} className="shrink-0">
            <span
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-colors"
              style={isActive
                ? { background: `color-mix(in srgb, ${p.color} 22%, transparent)`, color: p.color, border: `1px solid color-mix(in srgb, ${p.color} 45%, transparent)` }
                : { background: "rgba(0,0,0,0.3)", color: "var(--text3)", border: "1px solid var(--border)" }}
            >
              {p.icon} {p.label}
            </span>
          </Link>
        );
      })}
    </div>
  );
}