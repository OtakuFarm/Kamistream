import React, { useState } from 'react';
import { Topbar } from './Topbar';
import { Sidebar } from './Sidebar';
import { Link } from 'wouter';

function Footer() {
  return (
    <footer className="border-t border-[var(--border)] bg-[var(--bg2)] px-6 py-5 shrink-0">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="text-[11px] text-[var(--text3)] text-center sm:text-left space-y-0.5">
          <p className="font-bold text-[var(--text2)]">© {new Date().getFullYear()} KamiStream. All Rights Reserved.</p>
          <p>This site does not store any files on its server. All contents are provided by non-affiliated third parties.</p>
        </div>
        <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] font-bold text-[var(--text3)]">
          {[
            { label: 'Home',    href: '/' },
            { label: 'Browse',  href: '/browse' },
            { label: 'A-Z',     href: '/az-list' },
            { label: 'DMCA',    href: '/dmca' },
            { label: 'Terms',   href: '/terms' },
            { label: 'Contact', href: '/contact' },
          ].map(({ label, href }) => (
            <Link key={label} href={href}>
              <span className="hover:text-[var(--pink)] transition-colors cursor-pointer">{label}</span>
            </Link>
          ))}
        </nav>
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
          <div className="flex-1">
            {children}
          </div>
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
        <div className="flex-1">
          {children}
        </div>
        <Footer />
      </main>
    </div>
  );
}
