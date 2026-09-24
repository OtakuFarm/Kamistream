import React from 'react';
import { Link } from 'wouter';

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`flex items-center gap-2 cursor-pointer ${className}`}>
      <img
        src="/logo.svg"
        alt="KamiStream logo"
        className="w-8 h-8 rounded-lg shrink-0"
      />
      <div className="font-heading text-lg font-extrabold text-white tracking-tight">
        Kami<span className="text-[var(--pink)]">Stream</span>
      </div>
    </Link>
  );
}
