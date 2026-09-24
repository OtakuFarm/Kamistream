/* ═══════════════════════════════════════════════════════════════════
 * /anime-like/:id/:slug — "Anime like X"
 *
 * ── WHY THIS PAGE EXISTS ───────────────────────────────────────────
 * "anime like <title>" / "anime similar to <title>" is one of the
 * highest-intent queries in the niche: the searcher has already finished
 * something and wants the next thing. Nothing on the site answered it, so
 * every page was an also-ran for the query.
 *
 * ── WHY IT IS NOT DUPLICATE CONTENT ────────────────────────────────
 * The whole point of these pages is text that does not exist anywhere else:
 *   • an intro built from real counts (how many matches share the studio,
 *     the decade, the score band),
 *   • a "why these are similar" line per title, assembled from the genres,
 *     studio, format, era and score the two titles genuinely share,
 *   • a comparison table of real values.
 * Nothing is invented and nothing is crawler-only — src/lib/animeLike.js is
 * the same engine scripts/prerender.mjs uses to build the crawlable HTML, so
 * the React page and the shell cannot disagree.
 *
 * ── DATA ───────────────────────────────────────────────────────────
 * Two Jikan top-anime pages (50 titles) form the candidate pool, mirroring
 * the build-time pool. Requests are sequential because Jikan rate-limits
 * concurrent calls. React Query caches the pool for an hour, so it is
 * fetched once per session no matter how many of these pages are visited.
 * ═══════════════════════════════════════════════════════════════════ */

import { useMemo } from 'react';
import { useRoute, Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { useAnimeDetail } from '@/lib/jikan';
import { jikanFetch } from '@/lib/jikanFetch';
import { dedupeByMalId } from '@/lib/dedupeAnime';
import { useSEO } from '@/hooks/useSEO';
import { animePath, animeLikePath } from '@/lib/seo';
import { GridSkeleton } from '@/components/LoadingSkeleton';
import { ChevronLeft, Star } from 'lucide-react';
import {
  similarAnime, likeIntro, likeTitle, likeDescription, likeHeading,
  comparisonRows, topSharedGenres, titleOf, yearOf,
  type AnimeLikeMatch,
} from '@/lib/animeLike';

/** Jikan top-anime pages that form the candidate pool (25 titles each). */
const POOL_PAGES  = [1, 2];
const MATCH_LIMIT = 12;

export default function AnimeLike() {
  // Accepts /anime-like/:id and the descriptive /anime-like/:id/:slug
  const [, params] = useRoute('/anime-like/:id/:slug?');
  const id = params?.id || '';

  const { data: detail, isLoading } = useAnimeDetail(id);

  const { data: pool, isLoading: poolLoading } = useQuery({
    queryKey: ['anime-like-pool'],
    // Sequential, not Promise.all: Jikan 429s on concurrent requests and a
    // failed fetch here would leave the page with no matches at all.
    queryFn: async () => {
      const out: any[] = [];
      for (const page of POOL_PAGES) {
        try {
          const res = await jikanFetch(`/top/anime?limit=25&page=${page}`);
          out.push(...(res?.data ?? []));
        } catch { /* keep what we have — a partial pool still ranks */ }
      }
      return dedupeByMalId(out);
    },
    enabled:   !!id,
    staleTime: 60 * 60 * 1000,
  });

  // useAnimeDetail() has no type parameter upstream (the same reason
  // src/pages/anime-detail.tsx casts here), so normalise once.
  const anime: any = (detail as any)?.data;

  const matches = useMemo(
    () => (anime && pool?.length ? similarAnime(anime, pool, { limit: MATCH_LIMIT }) : []),
    [anime, pool]
  );
  const intro     = useMemo(() => (anime ? likeIntro(anime, matches) : ''), [anime, matches]);
  const topGenres = useMemo(() => topSharedGenres(anime, matches, 4), [anime, matches]);

  // Title/description/canonical are mirrored VERBATIM by animeLikeDoc() in
  // scripts/prerender.mjs. The structured data (CollectionPage + ItemList +
  // BreadcrumbList) lives in the prerendered <head>, exactly like /browse and
  // /genre/:id — useSEO here only owns title, meta and canonical.
  useSEO(anime ? {
    title:       likeTitle(anime),
    description: likeDescription(anime, matches),
    image:       anime.trailer?.images?.maximum_image_url || anime.images?.webp?.large_image_url,
    url:         animeLikePath(anime.mal_id, anime.title),
  } : {});

  // ── Loading / empty states ────────────────────────────────────────
  if (isLoading || poolLoading) {
    return <div className="p-4 md:p-6 pb-20"><GridSkeleton /></div>;
  }

  if (!anime) {
    return (
      <div className="p-4 md:p-6 pb-20 text-center text-[var(--text3)]">
        <p className="mb-4">We could not find that anime.</p>
        <Link href="/browse"><span className="text-[var(--purple)] font-bold cursor-pointer">Browse all anime</span></Link>
      </div>
    );
  }

  return renderPage(anime, matches, intro, topGenres);
}

/** Kept out of the component so the data hooks stay readable above. */
function renderPage(
  anime: any,
  matches: AnimeLikeMatch[],
  intro: string,
  topGenres: { name: string; count: number }[],
) {
  const name     = titleOf(anime);
  const animeUrl = animePath(anime.mal_id, anime.title);
  const best     = matches[0];

  // Genre name → MAL id, so the chips become real links to the genre hubs.
  const genreIdByName = new Map<string, number>();
  for (const key of ['genres', 'themes', 'demographics']) {
    for (const g of (anime[key] ?? []) as any[]) {
      if (g?.name && g?.mal_id) genreIdByName.set(g.name, g.mal_id);
    }
  }

  return (
    <div className="p-4 md:p-6 pb-20 max-w-6xl mx-auto">

      {/* Breadcrumbs */}
      <nav className="text-[12px] text-[var(--text3)] mb-3 flex flex-wrap items-center gap-1.5">
        <Link href="/"><span className="hover:text-white cursor-pointer">Home</span></Link>
        <span>/</span>
        <Link href="/browse"><span className="hover:text-white cursor-pointer">Browse</span></Link>
        <span>/</span>
        <Link href={animeUrl}><span className="hover:text-white cursor-pointer">{name}</span></Link>
        <span>/</span>
        <span className="text-[var(--text2)]">Anime like {name}</span>
      </nav>

      {/* Header */}
      <div className="flex items-start gap-3 mb-4">
        <Link href={animeUrl}>
          <span className="w-10 h-10 shrink-0 bg-[var(--card)] border border-[var(--border)] rounded-xl flex items-center justify-center hover:border-[var(--purple)] transition-colors cursor-pointer">
            <ChevronLeft className="w-5 h-5 text-[var(--text2)]" />
          </span>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl md:text-3xl font-heading font-black text-white leading-tight">
            {likeHeading(anime)}
          </h1>
          {matches.length > 0 && (
            <p className="text-[12px] text-[var(--text3)] mt-1">
              {matches.length} similar titles, ranked by how much they share with {name}
            </p>
          )}
        </div>
      </div>

      {intro && (
        <p className="text-[14px] text-[var(--text2)] leading-relaxed max-w-3xl mb-5">{intro}</p>
      )}

      {/* Genres driving the match — real links into the genre hubs */}
      {topGenres.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-8">
          {topGenres.map(g => {
            const gid = genreIdByName.get(g.name);
            const chip = (
              <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-[var(--card)] border border-[var(--border)] text-[var(--text2)] hover:border-[var(--purple)] hover:text-white transition-colors cursor-pointer">
                {g.name} <span className="text-[var(--text3)]">· {g.count}</span>
              </span>
            );
            return gid
              ? <Link key={g.name} href={`/genre/${gid}`}>{chip}</Link>
              : <span key={g.name}>{chip}</span>;
          })}
        </div>
      )}

      {matches.length === 0 && (
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6 text-center text-[var(--text3)] text-[13px]">
          We do not have enough close matches for {name} yet.{' '}
          <Link href={animeUrl}>
            <span className="text-[var(--purple)] font-bold cursor-pointer">See {name}</span>
          </Link>
        </div>
      )}

      {/* Closest match, side by side — real values, unique per page */}
      {best && (
        <section className="mb-9">
          <h2 className="text-[13px] font-black text-white uppercase tracking-widest mb-3">
            {titleOf(best.anime)} vs {name}
          </h2>
          <div className="overflow-x-auto bg-[var(--card)] border border-[var(--border)] rounded-xl">
            <table className="w-full text-[12.5px] min-w-[420px]">
              <thead>
                <tr className="text-[var(--text3)] text-[10.5px] uppercase tracking-wider">
                  <th className="text-left p-2.5 font-bold" scope="col">&nbsp;</th>
                  <th className="text-left p-2.5 font-bold" scope="col">{name}</th>
                  <th className="text-left p-2.5 font-bold text-white" scope="col">{titleOf(best.anime)}</th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows(anime, best.anime).map(r => (
                  <tr key={r.label} className="border-t border-[var(--border)]">
                    <th scope="row" className="text-left p-2.5 text-[var(--text3)] font-bold whitespace-nowrap">{r.label}</th>
                    <td className="p-2.5 text-[var(--text2)]">{r.source}</td>
                    <td className="p-2.5 text-white">{r.candidate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {best.reasons.length > 0 && (
            <ul className="mt-3 space-y-1">
              {best.reasons.map(r => (
                <li key={r} className="text-[12.5px] text-[var(--text2)] flex gap-2">
                  <span className="text-[var(--purple)] font-black">•</span>{r}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Every match, each one stating what it shares */}
      {matches.length > 0 && (
        <section>
          <h2 className="text-[13px] font-black text-white uppercase tracking-widest mb-3">
            {matches.length} anime like {name}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {matches.map(m => <MatchCard key={m.anime.mal_id} match={m} />)}
          </div>
        </section>
      )}

      {/* Back to the anime, so this page never dead-ends */}
      <div className="mt-10 bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 text-center">
        <p className="text-[13px] text-[var(--text2)]">
          Finished {name}?{' '}
          <Link href={animeUrl}>
            <span className="text-[var(--purple)] font-bold cursor-pointer">Watch {name} online free</span>
          </Link>{' '}
          on KamiStream, or browse more picks by the genres above.
        </p>
      </div>
    </div>
  );
}

/** One similar title, with the reasons it matches shown on the card. */
function MatchCard({ match }: { match: AnimeLikeMatch }) {
  const a      = match.anime;
  const poster = a.images?.webp?.large_image_url || a.images?.jpg?.large_image_url || a.images?.jpg?.image_url;
  const year   = yearOf(a);
  const [top, ...rest] = match.reasons;

  return (
    <Link href={animePath(a.mal_id, titleOf(a))}>
      <div className="group h-full bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden hover:border-[var(--purple)] transition-colors cursor-pointer flex flex-col">
        <div className="aspect-[2/3] bg-[#17171b] overflow-hidden shrink-0">
          {poster ? (
            <img
              src={poster}
              alt={`${a.title} poster`}
              loading="lazy"
              width={225}
              height={318}
              className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-300"
            />
          ) : null}
        </div>
        <div className="p-2.5 flex-1">
          <div className="flex items-center gap-1.5 text-[10.5px] text-[var(--text3)] font-bold mb-1">
            {a.score ? (
              <span className="flex items-center gap-0.5">
                <Star className="w-3 h-3 text-yellow-400 fill-current" />{a.score}
              </span>
            ) : null}
            {year ? <span>{year}</span> : null}
            {a.type ? <span>· {a.type}</span> : null}
          </div>
          <h3 className="text-[12.5px] font-bold text-white leading-snug line-clamp-2">{a.title}</h3>
          {top && (
            <p className="text-[11px] text-[var(--purple)] font-semibold mt-1.5 leading-snug line-clamp-2">{top}</p>
          )}
          {rest.slice(0, 1).map(r => (
            <p key={r} className="text-[10.5px] text-[var(--text3)] mt-0.5 leading-snug line-clamp-2">{r}</p>
          ))}
        </div>
      </div>
    </Link>
  );
}
