/* ═══════════════════════════════════════════════════════════════════
 * /best-anime  +  /best-anime/:year — "Best Anime of {year}"
 *
 * ── WHY THIS PAGE EXISTS ───────────────────────────────────────────
 * "best anime of 2024" / "top anime 2019" / "anime of the year" is a
 * query class nothing on the site used to answer. A dated, ranked list is
 * exactly what that searcher wants, and every year deserves its own URL.
 *
 * ── WHY IT IS NOT DUPLICATE CONTENT ────────────────────────────────
 * No MAL synopsis is reused. Every sentence here is measured from this
 * year's own list: title count, mean score, dominant genres, the studio
 * with the most titles, and the film/series split. Two years can never
 * produce the same paragraph. src/lib/bestOfYear.js is the same engine
 * scripts/prerender.mjs imports, so the crawlable HTML and this page
 * cannot disagree — and the fetcher below is the same AniList query the
 * build runs (seasonYear, SCORE_DESC, perPage 25).
 *
 * ── WHY NOT JIKAN ──────────────────────────────────────────────────
 * Jikan's per-year search is permanently 504 (verified against live
 * traffic), so AniList is the only reliable source for a dated list.
 * ═══════════════════════════════════════════════════════════════════ */

import { useMemo } from 'react';
import { useRoute, Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { getAnimeOfYear } from '@/lib/anilist';
import { useSEO } from '@/hooks/useSEO';
import { animePath, bestOfYearPath, bestOfYearHubPath } from '@/lib/seo';
import { GridSkeleton } from '@/components/LoadingSkeleton';
import { ChevronLeft, ChevronRight, Star } from 'lucide-react';
import {
  yearList, yearTitle, yearDescription, yearIntro, yearGenres,
  yearNeighbors, rankedRows, yearRange, hubHeading, hubTitle,
  hubDescription, MIN_TITLES_FOR_YEAR,
} from '@/lib/bestOfYear';

/** One route serves both shapes; a missing/invalid year means the hub. */
export default function BestOfYear() {
  const [, params] = useRoute('/best-anime/:year');
  const raw = params?.year ?? '';
  const year = /^\d{4}$/.test(raw) ? Number(raw) : null;
  return year ? <YearPage year={year} /> : <HubPage />;
}

// ── /best-anime ──────────────────────────────────────────────────────

function HubPage() {
  // The build passes the years it actually published; at runtime we show the
  // full range and any year whose live fetch comes back short degrades to a
  // message instead of a broken page.
  const years = useMemo(() => yearRange(new Date().getFullYear()), []);
  const desc  = hubDescription(years);

  useSEO({ title: hubTitle(), description: desc, url: bestOfYearHubPath });

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <nav className="text-[12px] font-bold text-[var(--text3)] mb-4">
        <Link href="/"><span className="cursor-pointer hover:text-white">Home</span></Link>
        <span> › </span><span>Best Anime by Year</span>
      </nav>

      <h1 className="text-[26px] font-black text-white mb-2">{hubHeading()}</h1>
      <p className="text-[13.5px] text-[var(--text2)] leading-relaxed mb-6">{desc}</p>

      <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {years.map(y => (
          <li key={y}>
            <Link href={bestOfYearPath(y)}>
              <span className="block bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 hover:border-[var(--purple)] transition-colors cursor-pointer">
                <span className="block text-[17px] font-black text-white">{y}</span>
                <span className="block text-[11.5px] font-bold text-[var(--text3)] mt-0.5">
                  Top-rated series &amp; films
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <p className="text-[13px] text-[var(--text2)] mt-6">
        Every year above lists that year's highest-scoring titles with their score,
        studio and genres. Looking for something newer?{' '}
        <Link href="/category/top-rated">
          <span className="text-[var(--purple)] font-bold cursor-pointer">Browse the top rated anime of all time</span>
        </Link>.
      </p>
    </div>
  );
}

// ── /best-anime/:year ────────────────────────────────────────────────

function YearPage({ year }: { year: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ['best-of-year', year],
    queryFn: () => getAnimeOfYear(year),
    staleTime: 60 * 60 * 1000,
  });

  const list  = useMemo(() => yearList(data ?? [], year), [data, year]);
  const years = useMemo(() => yearRange(new Date().getFullYear()), []);
  const { prev, next } = yearNeighbors(year, years);
  const chips = useMemo(() => yearGenres(list, 6), [list]);
  const rows  = useMemo(() => rankedRows(list), [list]);

  useSEO({
    title: yearTitle(year),
    description: yearDescription(year, list),
    url: bestOfYearPath(year),
  });

  if (isLoading) return <GridSkeleton />;

  if (list.length < MIN_TITLES_FOR_YEAR) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <h1 className="text-[24px] font-black text-white mb-3">{yearTitle(year)}</h1>
        <p className="text-[13.5px] text-[var(--text2)] mb-5">
          We don't have enough rated titles from {year} to rank yet.
        </p>
        <Link href={bestOfYearHubPath}>
          <span className="text-[var(--purple)] font-bold cursor-pointer">Browse every year we have →</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <nav className="text-[12px] font-bold text-[var(--text3)] mb-4">
        <Link href="/"><span className="cursor-pointer hover:text-white">Home</span></Link>
        <span> › </span>
        <Link href={bestOfYearHubPath}>
          <span className="cursor-pointer hover:text-white">Best Anime</span>
        </Link>
        <span> › </span><span>{year}</span>
      </nav>

      <h1 className="text-[26px] font-black text-white mb-2">{yearTitle(year)}</h1>
      <p className="text-[13.5px] text-[var(--text2)] leading-relaxed mb-4">{yearIntro(year, list)}</p>

      {/* Sibling years — the crawl path between every year page, plus the hub. */}
      <nav className="flex flex-wrap items-center gap-2 mb-6 text-[12px] font-bold">
        {prev ? (
          <Link href={bestOfYearPath(prev)}>
            <span className="inline-flex items-center gap-1 bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-[var(--text2)] hover:border-[var(--purple)] hover:text-white transition-colors cursor-pointer">
              <ChevronLeft className="w-3.5 h-3.5" />{prev}
            </span>
          </Link>
        ) : null}
        <Link href={bestOfYearHubPath}>
          <span className="bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-[var(--text2)] hover:border-[var(--purple)] hover:text-white transition-colors cursor-pointer">
            All years
          </span>
        </Link>
        {next ? (
          <Link href={bestOfYearPath(next)}>
            <span className="inline-flex items-center gap-1 bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-[var(--text2)] hover:border-[var(--purple)] hover:text-white transition-colors cursor-pointer">
              {next}<ChevronRight className="w-3.5 h-3.5" />
            </span>
          </Link>
        ) : null}
      </nav>

      {/* Ranked table — real values, no prose that could duplicate a synopsis. */}
      <section className="mb-8">
        <h2 className="text-[13px] font-black text-white uppercase tracking-widest mb-3">
          Top {list.length} anime of {year}, ranked
        </h2>
        <div className="overflow-x-auto bg-[var(--card)] border border-[var(--border)] rounded-xl">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-[var(--text3)]">
                <th className="px-3 py-2.5 font-black">#</th>
                <th className="px-3 py-2.5 font-black">Title</th>
                <th className="px-3 py-2.5 font-black">Score</th>
                <th className="px-3 py-2.5 font-black">Type</th>
                <th className="px-3 py-2.5 font-black">Episodes</th>
                <th className="px-3 py-2.5 font-black">Studio</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.malId} className="border-t border-[var(--border)] text-[12.5px]">
                  <td className="px-3 py-2 text-[var(--text3)] font-bold">{r.rank}</td>
                  <td className="px-3 py-2">
                    <Link href={animePath(r.malId, r.name)}>
                      <span className="text-white font-semibold hover:text-[var(--purple)] cursor-pointer">{r.name}</span>
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-yellow-400 font-bold">
                    {r.score
                      ? <span className="inline-flex items-center gap-1"><Star className="w-3 h-3 fill-current" />{r.score}</span>
                      : '—'}
                  </td>
                  <td className="px-3 py-2 text-[var(--text2)]">{r.type ?? '—'}</td>
                  <td className="px-3 py-2 text-[var(--text2)]">{r.episodes ?? '—'}</td>
                  <td className="px-3 py-2 text-[var(--text2)]">{r.studio ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {chips.length > 0 && (
        <ul className="flex flex-wrap gap-2 mb-8">
          {chips.map(g => (
            <li key={g.name}>
              <Link href={`/genre/${g.id}`}>
                <span className="inline-block bg-[var(--card)] border border-[var(--border)] rounded-full px-3 py-1 text-[11.5px] font-bold text-[var(--text2)] hover:border-[var(--purple)] hover:text-white transition-colors cursor-pointer">
                  {g.name} · {g.count}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <section>
        <h2 className="text-[13px] font-black text-white uppercase tracking-widest mb-3">
          All {list.length} titles from {year}
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {list.map(a => <YearTile key={a.mal_id} anime={a} />)}
        </div>
      </section>

      <div className="mt-10 bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 text-center">
        <p className="text-[13px] text-[var(--text2)]">
          Pick any title above to watch it free on KamiStream, or{' '}
          <Link href="/category/top-rated">
            <span className="text-[var(--purple)] font-bold cursor-pointer">browse the top rated anime of all time</span>
          </Link>.
        </p>
      </div>
    </div>
  );
}

/** Poster tile — the same bits string the build-time shell renders. */
function YearTile({ anime }: { anime: any }) {
  const poster = anime.images?.jpg?.image_url || anime.images?.webp?.image_url || '';
  const bits = [
    anime.type,
    anime.episodes ? `${anime.episodes} ep` : null,
    anime.score ? `★ ${anime.score}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <Link href={animePath(anime.mal_id, anime.title)}>
      <div className="group h-full bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden hover:border-[var(--purple)] transition-colors cursor-pointer">
        <div className="aspect-[2/3] bg-[#17171b] overflow-hidden">
          {poster ? (
            <img
              src={poster}
              alt={`${anime.title} poster`}
              loading="lazy"
              width={225}
              height={318}
              className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-300"
            />
          ) : null}
        </div>
        <div className="p-2.5">
          <div className="text-[10.5px] text-[var(--text3)] font-bold mb-1">{bits}</div>
          <h3 className="text-[12.5px] font-bold text-white leading-snug line-clamp-2">{anime.title}</h3>
        </div>
      </div>
    </Link>
  );
}
