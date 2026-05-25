import React, { useState } from 'react';
import { Topbar } from './Topbar';
import { Sidebar } from './Sidebar';

export function Layout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[var(--bg)] text-white font-sans">
      <Topbar onMenuClick={() => setSidebarOpen(s => !s)} />
      <div className="flex flex-1 overflow-hidden relative">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        {/* Main content — always full width since sidebar is fixed overlay */}
        <main className="flex-1 overflow-y-auto relative">
          {children}
        </main>
      </div>
    </div>
  );
}

export function MinimalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[var(--bg)] text-white font-sans">
      <Topbar onMenuClick={() => {}} />
      <main className="flex-1 overflow-y-auto relative">
        {children}
      </main>
    </div>
  );
}
