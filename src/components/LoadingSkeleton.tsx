import React from 'react';

// ── Shimmer base ──────────────────────────────────────────────────────
function Shimmer({ className = '' }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden bg-[var(--card)] rounded-xl ${className}`}>
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/5 to-transparent" />
    </div>
  );
}

// ── Grid of anime cards ───────────────────────────────────────────────
export function GridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Shimmer className="aspect-[3/4]" />
          <Shimmer className="h-3.5 w-3/4" />
          <Shimmer className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

// ── Full page skeleton (home / browse) ───────────────────────────────
export function LoadingSkeleton() {
  return (
    <div className="p-4 md:p-6 space-y-8">
      <Shimmer className="w-full h-[280px] md:h-[400px]" />
      <div className="space-y-3">
        <Shimmer className="h-5 w-40" />
        <GridSkeleton count={6} />
      </div>
    </div>
  );
}

// ── Anime detail skeleton ─────────────────────────────────────────────
export function DetailSkeleton() {
  return (
    <div className="pb-20">
      <Shimmer className="w-full h-[300px] md:h-[400px] rounded-none" />
      <div className="max-w-7xl mx-auto px-4 md:px-8 mt-28 grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <Shimmer className="h-6 w-64" />
          <div className="space-y-2">
            <Shimmer className="h-4 w-full" />
            <Shimmer className="h-4 w-full" />
            <Shimmer className="h-4 w-3/4" />
          </div>
          <Shimmer className="h-5 w-32" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {Array.from({ length: 6 }).map((_, i) => <Shimmer key={i} className="h-14" />)}
          </div>
        </div>
        <div className="space-y-4">
          <Shimmer className="h-64" />
        </div>
      </div>
    </div>
  );
}

// ── Watch page skeleton ───────────────────────────────────────────────
export function WatchSkeleton() {
  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-60px)]">
      <div className="flex-1 flex flex-col bg-black">
        <div className="w-full bg-black flex justify-center">
          <div className="w-[85%] pt-[47.8%] relative">
            <div className="absolute inset-0 bg-[#0a0a0a] flex items-center justify-center">
              <div className="w-12 h-12 rounded-full border-2 border-[var(--pink)] border-t-transparent animate-spin" />
            </div>
          </div>
        </div>
        <div className="p-4 md:p-6 space-y-4 bg-[var(--bg2)] flex-1">
          <Shimmer className="h-6 w-48" />
          <Shimmer className="h-4 w-64" />
          <Shimmer className="h-12 mt-6" />
        </div>
      </div>
      <div className="hidden lg:flex w-[320px] bg-[var(--bg2)] border-l border-[var(--border)] flex-col p-4 gap-2">
        {Array.from({ length: 8 }).map((_, i) => <Shimmer key={i} className="h-12" />)}
      </div>
    </div>
  );
}

// ── Profile skeleton ──────────────────────────────────────────────────
export function ProfileSkeleton() {
  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      <Shimmer className="h-52 rounded-2xl" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <Shimmer key={i} className="h-28" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Shimmer className="h-5 w-36" />
          {Array.from({ length: 4 }).map((_, i) => <Shimmer key={i} className="h-16" />)}
        </div>
        <div className="space-y-2">
          <Shimmer className="h-5 w-36" />
          {Array.from({ length: 4 }).map((_, i) => <Shimmer key={i} className="h-16" />)}
        </div>
      </div>
    </div>
  );
}

// ── Chat skeleton ─────────────────────────────────────────────────────
export function ChatSkeleton() {
  return (
    <div className="flex flex-col h-full p-4 gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className={`flex gap-3 ${i % 3 === 2 ? 'flex-row-reverse' : ''}`}>
          <Shimmer className="w-8 h-8 rounded-full shrink-0" />
          <Shimmer className={`h-12 rounded-2xl ${i % 3 === 2 ? 'w-48' : 'w-64'}`} />
        </div>
      ))}
    </div>
  );
}

// ── Leaderboard skeleton ──────────────────────────────────────────────
export function LeaderboardSkeleton() {
  return (
    <div className="max-w-3xl mx-auto p-4 space-y-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Shimmer className="w-10 h-10 rounded-full" />
          <Shimmer className="w-10 h-10 rounded-full" />
          <Shimmer className="flex-1 h-14 rounded-xl" />
          <Shimmer className="w-16 h-8 rounded-lg" />
        </div>
      ))}
    </div>
  );
}
