import React, { useState } from 'react';
import { Topbar } from './Topbar';
import { Sidebar } from './Sidebar';
import { Link } from 'wouter';

function Footer() {
  const year = new Date().getFullYear();
  const navLinks = [
    { label: 'Home',     href: '/home' },
    { label: 'Browse',   href: '/browse' },
    { label: 'A-Z List', href: '/az-list' },
    { label: 'Schedule', href: '/schedule' },
    { label: 'About',    href: '/about' },
    { label: 'DMCA',     href: '/dmca' },
    { label: 'Terms',    href: '/terms' },
    { label: 'Contact',  href: '/contact' },
  ];

  return (
    <footer className="border-t border-[var(--border)] bg-[var(--bg2)] shrink-0">
      <div className="max-w-7xl mx-auto px-6 py-6 flex flex-col gap-4">

        {/* Logo + nav */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <Link href="/home">
            <span className="text-[20px] font-heading font-black cursor-pointer select-none">
              Kami<span className="text-[var(--pink)]">Stream</span>
            </span>
          </Link>
          <nav className="flex flex-wrap items-center gap-x-5 gap-y-1">
            {navLinks.map(({ label, href }) => (
              <Link key={label} href={href}>
                <span className="text-[12px] font-bold text-[var(--text3)] hover:text-white transition-colors cursor-pointer">
                  {label}
                </span>
              </Link>
            ))}
          </nav>
        </div>

        <div className="border-t border-[var(--border)]" />

        {/* Copyright */}
        <div className="flex flex-col gap-1">
          <p className="text-[12px] font-bold text-[var(--text2)]">
            © {year} KamiStream. All Rights Reserved.
          </p>
          <p className="text-[11px] text-[var(--text3)] leading-relaxed">
            This site does not store any files on its server. All contents are provided by non-affiliated third parties.
          </p>
        </div>

      </div>
    </footer>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[var(--bg)] text-white font-sans">
      <Topbar onMenuClick={() => setSidebarOpen(s => !s)} />
      <div className="flex flex-1 overflow-hidden relative">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className="flex-1 overflow-y-auto relative flex flex-col">
          <div className="flex-1">{children}</div>
          <Footer />
        </main>
      </div>
    </div>
  );
}

export function MinimalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[var(--bg)] text-white font-sans">
      <Topbar onMenuClick={() => {}} />
      <main className="flex-1 overflow-y-auto relative flex flex-col">
        <div className="flex-1">{children}</div>
        <Footer />
      </main>
    </div>
  );
}
