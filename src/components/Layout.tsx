import React, { useState } from 'react';
import { Topbar } from './Topbar';
import { Sidebar } from './Sidebar';
import { Link, useLocation } from 'wouter';
import { CursorSpotlight } from './CursorSpotlight';
import { ScrollProgress, AchievementToaster } from './motionBits';
import { AnimatePresence, motion } from 'framer-motion';
import { POPULAR_GENRES_BY_NAME } from '@/lib/genres';

/**
 * The crawlable site skeleton.
 *
 * ── WHY THIS IS BUILT, NOT HAND-WRITTEN ───────────────────────────
 * This used to be a hand-maintained array of 15 links. Two problems:
 * it was the FOURTH place the site's URL list lived (after each page's
 * useSEO, the prerenderer's STATIC_PAGES and the sitemaps), so it drifted
 * — it linked /home, which is not a canonical URL, and never linked most
 * of the genre pages. And as a single flat row it gave a crawler no
 * sense of structure: no indication that Browse is a hub, or that the
 * genres all sit under it.
 *
 * Now every link is generated from src/lib/routes.js, so:
 *   · a page that is in the sitemap is in this footer, and vice versa
 *   · nothing here can point at a noindex route
 *   · the genre list is the same POPULAR_GENRES the hubs are built from,
 *     so a genre chip here always resolves to a real page
 */
function Footer() {
  const year = new Date().getFullYear();

  // Grouped so the hierarchy is legible to a crawler and to a person.
  // Every entry is a real, indexable, prerendered page.
  const columns = [
    {
      heading: 'Browse',
      links: [
        { label: 'All Anime',      href: '/browse' },
        { label: 'Trending Now',   href: '/category/trending' },
        { label: 'Top Rated',      href: '/category/top-rated' },
        { label: 'This Season',    href: '/category/this-season' },
        { label: 'New Releases',   href: '/category/new-release' },
        { label: 'Just Completed', href: '/category/just-completed' },
        { label: 'Upcoming',       href: '/category/upcoming' },
        { label: 'A-Z List',       href: '/az-list' },
      ],
    },
    {
      heading: 'Genres',
      // Alphabetic, and the same 16 the /genre/:id hubs are built from.
      links: POPULAR_GENRES_BY_NAME.map(g => ({
        label: `${g.name} Anime`,
        href: `/genre/${g.id}`,
      })),
    },
    {
      heading: 'Discover',
      links: [
        { label: 'Latest Episodes', href: '/latest-episodes' },
        { label: 'Airing Schedule', href: '/schedule' },
        { label: 'Best by Year',    href: '/best-anime' },
        { label: 'Browse by Mood',  href: '/mood' },
        { label: 'Hidden Gems',     href: '/hidden-gems' },
      ],
    },
    {
      heading: 'KamiStream',
      links: [
        { label: 'About',   href: '/about' },
        { label: 'Contact', href: '/contact' },
        { label: 'DMCA',    href: '/dmca' },
        { label: 'Terms',   href: '/terms' },
      ],
    },
  ];

  return (
    <footer className="border-t border-[var(--border)] bg-[var(--bg2)] shrink-0">
      <div className="max-w-7xl mx-auto px-4 py-8 md:px-6 md:py-10">

        {/* Wordmark + one-line positioning. This text is the clearest
            statement of what the site IS, and it is in server-rendered
            HTML on every page. */}
        <div className="mb-7">
          <Link href="/">
            <span className="text-[20px] font-heading font-black cursor-pointer select-none">
              Kami<span className="text-[var(--pink)]">Stream</span>
            </span>
          </Link>
          <p className="text-[12px] text-[var(--text2)] mt-2 max-w-[70ch] leading-relaxed">
            Free anime streaming in HD — sub &amp; dub, no sign-up. Browse thousands of
            series and movies by genre, year, popularity and mood, with new episodes
            added as they air.
          </p>
        </div>

        {/* The skeleton: four labelled groups of real <a href> links. */}
        <nav aria-label="Footer" className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-8">
          {columns.map(col => (
            <div key={col.heading}>
              <h2 className="text-[11px] font-heading font-black uppercase tracking-widest text-white mb-3">
                {col.heading}
              </h2>
              <ul className="flex flex-col gap-y-1.5">
                {col.links.map(({ label, href }) => (
                  <li key={href}>
                    <Link href={href}>
                      <span className="text-[12px] text-[var(--text3)] hover:text-white transition-colors cursor-pointer">
                        {label}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-[var(--border)] mt-8 pt-5" />

        <div className="flex flex-col gap-1">
          <p className="text-[12px] font-bold text-[var(--text2)]">
            © {year} KamiStream. All Rights Reserved.
          </p>
          <p className="text-[11px] text-[var(--text3)] leading-relaxed max-w-[80ch]">
            This site does not store any files on its server. All contents are provided
            by non-affiliated third parties. Anime titles and artwork belong to their
            respective owners; see our DMCA policy for takedown requests.
          </p>
        </div>

      </div>
    </footer>
  );
}

function PageTransition({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex flex-col min-h-screen bg-[var(--bg)] text-white font-sans">
      <CursorSpotlight />
      <ScrollProgress />
      <AchievementToaster />
      <Topbar onMenuClick={() => setSidebarOpen(s => !s)} />
      <div className="flex flex-1 relative">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className="flex-1 relative flex flex-col">
          <div className="flex-1"><PageTransition>{children}</PageTransition></div>
          <Footer />
        </main>
      </div>
    </div>
  );
}

export function MinimalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen bg-[var(--bg)] text-white font-sans">
      <CursorSpotlight />
      <Topbar onMenuClick={() => {}} />
      <main className="flex-1 relative flex flex-col">
        <div className="flex-1">{children}</div>
        <Footer />
      </main>
    </div>
  );
}
