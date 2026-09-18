import React from 'react';
import { Link } from 'wouter';

export default function NotFound() {
  return (
    <div className="min-h-[calc(100vh-60px)] flex flex-col items-center justify-center p-4 text-center">
      <div className="relative mb-8">
        <div className="text-[120px] font-heading font-black text-[var(--bg3)] leading-none select-none drop-shadow-[0_0_20px_rgba(255,45,120,0.2)]">
          404
        </div>
        <div className="absolute inset-0 flex items-center justify-center text-4xl">
          <span className="opacity-70">🎌</span>
        </div>
      </div>
      <h1 className="text-2xl font-heading font-black text-white mb-3">Lost in the void</h1>
      <p className="text-[14px] text-[var(--text3)] mb-8 max-w-md">
        Looks like this manga panel is missing. The page you're looking for doesn't exist or has been moved.
      </p>
      <Link href="/">
        <button className="bg-[var(--card)] border border-[var(--border)] hover:border-[var(--pink)] text-white px-6 py-3 rounded-xl font-bold transition-all hover:bg-white/5">
          Back to Home
        </button>
      </Link>
    </div>
  );
}
