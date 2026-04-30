import React from 'react';
import { Link } from 'wouter';

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`flex items-center gap-2 cursor-pointer ${className}`}>
      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--pink)] to-[var(--purple)] flex items-center justify-center text-white font-heading font-black text-[15px] shrink-0">
        K
      </div>
      <div className="font-heading text-lg font-extrabold text-white tracking-tight">
        Kami<span className="text-[var(--pink)]">Stream</span>
      </div>
    </Link>
  );
}
