/* ═══════════════════════════════════════════════════════════════════
 * "Best Anime of {year}" page engine — /best-anime/:year  (+ /best-anime hub)
 *
 * ── WHY THIS PAGE EXISTS ───────────────────────────────────────────
 * "best anime of 2024" / "anime 2019" / "top anime of the year" is a
 * perennial query class: searchers want a ranked, dated list. Nothing on
 * the site answered it, so every year was an also-ran.
 *
 * ── WHY IT IS NOT DUPLICATE CONTENT ────────────────────────────────
 * No MAL synopsis is reused anywhere on these pages. The text is assembled
 * at render time from facts unique to that year: how many titles aired, the
 * mean score, the most common genres, the studio with the most titles and
 * the film/series split. Every clause is a real number.
 *
 * ── WHY IT IS PLAIN .js ────────────────────────────────────────────
 * scripts/prerender.mjs (Node, build time) and src/pages/best-anime.tsx
 * (Vite, browser) import this same file, so the crawlable HTML and the
 * React page cannot disagree. Types live in src/lib/bestOfYear.d.ts.
 *
 * ── DETERMINISM ────────────────────────────────────────────────────
 * No Date(), no Math.random() — same input always yields the same bytes,
 * which is what keeps the prerendered output byte-stable.
 *
 * ── DATA ───────────────────────────────────────────────────────────
 * BOTH callers fetch one AniList page: media(type:ANIME, seasonYear:$year,
 * sort:SCORE_DESC, isAdult:false), perPage 25, page 1. Jikan's per-year
 * endpoint is permanently 504 (verified), so AniList is the only reliable
 * source, and using the identical query on both sides is what guarantees
 * the engine sees identical input. YEAR_PAGE_SIZE below is the contract.
 * ═══════════════════════════════════════════════════════════════════ */

import {
  titleOf, yearOf, scoreOf, mainStudio, listWords, clampText,
} from './animeLike.js';

// ── Tunables ─────────────────────────────────────────────────────────

/** Below this many titles a year page would be thin — don't publish it. */
export const MIN_TITLES_FOR_YEAR = 6;

/** Titles per year page. MUST equal `perPage` in both fetchers. */
export const YEAR_PAGE_SIZE = 25;

/** Oldest year we build a page for. Raise/lower to change the page count. */
export const YEAR_START = 2010;

/**
 * AniList genre NAME → the MAL id its /genre/:id hub is routed on.
 *
 * Owned here rather than read off either caller on purpose: the build-time
 * normaliser writes genre mal_ids from a 55-entry table while the browser
 * normaliser historically wrote none, so resolving chips by NAME inside the
 * shared engine is the only way both renderings produce the same links.
 * A genre absent from this table is simply not shown as a chip — on both
 * sides, so they still agree.
 */
export const GENRE_IDS = Object.freeze({
  Action: 1, Adventure: 2, Comedy: 4, Mystery: 7, Drama: 8, Ecchi: 9,
  Fantasy: 10, Horror: 14, Mecha: 18, Music: 19, Psychological: 40,
  Romance: 22, 'Sci-Fi': 24, Sports: 30, 'Slice of Life': 36,
  Supernatural: 37, Thriller: 41, 'Mahou Shoujo': 70,
});

// ── Helpers ──────────────────────────────────────────────────────────

/** Locale-independent text compare: localeCompare() varies by ICU build. */
function cmpText(a, b) {
  const x = String(a ?? '').toLowerCase();
  const y = String(b ?? '').toLowerCase();
  return x < y ? -1 : x > y ? 1 : 0;
}

/** Descending year list: [currentYear … YEAR_START]. */
export function yearRange(currentYear, start = YEAR_START) {
  const last = Number(currentYear);
  if (!Number.isFinite(last)) return [];
  const out = [];
  for (let y = last; y >= start; y--) out.push(y);
  return out;
}

/**
 * Rank one year's titles: filter to the year, drop duplicate MAL ids, sort
 * by score desc with a title tie-break so equal scores never reorder between
 * builds, then cap at the page size.
 */
export function yearList(candidates, year, limit = YEAR_PAGE_SIZE) {
  const want = Number(year);
  const seen = new Set();
  const out = [];

  for (const a of candidates ?? []) {
    if (!a?.mal_id) continue;
    if (yearOf(a) !== want) continue;      // guard against a mismatched node
    if (seen.has(a.mal_id)) continue;
    seen.add(a.mal_id);
    out.push(a);
  }

  out.sort((x, y) => {
    const sx = scoreOf(x);
    const sy = scoreOf(y);
    const nx = typeof sx === 'number' ? sx : -1;
    const ny = typeof sy === 'number' ? sy : -1;
    if (ny !== nx) return ny - nx;
    return cmpText(titleOf(x), titleOf(y));
  });

  return out.slice(0, limit);
}

/** H1 and <title> share this exact string (callers append `| KamiStream`). */
export const yearTitle = year => `Best Anime of ${Number(year)}`;

/** Meta description — year plus the three top titles, so no two years match. */
export function yearDescription(year, list) {
  const top = (list ?? []).slice(0, 3).map(titleOf).filter(Boolean);
  const n = (list ?? []).length;
  const head = top.length
    ? `${n} top-rated anime from ${year}, led by ${listWords(top)}`
    : `${n} top-rated anime from ${year}, ranked by score`;
  return clampText(
    `${head} — scores, studios and genres for each title, all free to stream on KamiStream.`,
    158
  );
}

/** The most common genres on a year, with the hub id each chip links to. */
export function yearGenres(list, k = 6) {
  const counts = new Map();
  for (const a of list ?? []) {
    for (const g of a?.genres ?? []) {
      const name = g?.name;
      if (!name) continue;
      const hit = counts.get(name) || { name, id: GENRE_IDS[name] ?? null, count: 0 };
      hit.count++;
      counts.set(name, hit);
    }
  }
  return [...counts.values()]
    .filter(e => e.id)                                  // only linkable hubs
    .sort((x, y) => y.count - x.count || cmpText(x.name, y.name))
    .slice(0, k);
}

/** Studios ranked by how many of the year's titles they animated. */
export function topStudios(list, k = 5) {
  const counts = new Map();
  for (const a of list ?? []) {
    const name = mainStudio(a);
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].map(([name, count]) => ({ name, count }));
  ranked.sort((x, y) => (y.count - x.count) || cmpText(x.name, y.name));
  return ranked.slice(0, k);
}

/**
 * The intro paragraph. Every clause is measured from this year's own list —
 * count, mean score, dominant genres, busiest studio, film count — which is
 * what makes the copy on 2010 differ from the copy on 2024 with no writing
 * involved, and what keeps it off the duplicated-MAL-synopsis problem.
 */
export function yearIntro(year, list) {
  const items = list ?? [];
  const n = items.length;
  if (!n) return `No titles from ${year} are ranked here yet.`;

  const scores = items.map(scoreOf).filter(v => typeof v === 'number');
  const mean = scores.length
    ? scores.reduce((acc, v) => acc + v, 0) / scores.length
    : null;

  const genres = yearGenres(items, 3).map(g => g.name);
  const studio = topStudios(items, 1)[0];
  const films = items.filter(a => String(a?.type ?? '').toLowerCase() === 'movie').length;

  const out = [
    `${n} anime that aired in ${year}, ranked by average score`
      + `${mean ? ` (mean ${mean.toFixed(1)})` : ''}.`,
  ];
  if (genres.length) {
    out.push(`${listWords(genres)} ${genres.length > 1 ? 'are' : 'is'} `
      + `the year's most common genres.`);
  }
  if (studio && studio.count > 1) {
    out.push(`${studio.name} has the most titles here, with ${studio.count}.`);
  }
  if (films) out.push(`${films} ${films === 1 ? 'is' : 'are'} films.`);
  return out.join(' ');
}

/** Adjacent years that actually have a page — the sibling crawl path. */
export function yearNeighbors(year, years) {
  const asc = [...(years ?? [])].map(Number).filter(Number.isFinite)
    .sort((a, b) => a - b);
  const i = asc.indexOf(Number(year));
  if (i < 0) return { prev: null, next: null };
  return {
    prev: i > 0 ? asc[i - 1] : null,
    next: i < asc.length - 1 ? asc[i + 1] : null,
  };
}

/** Table rows. URLs are built by the caller — this file has no routing. */
export function rankedRows(list) {
  return (list ?? []).map((a, i) => ({
    rank:     i + 1,
    name:     titleOf(a),
    raw:      a?.title ?? titleOf(a),
    malId:    a?.mal_id,
    score:    scoreOf(a),
    type:     a?.type ?? null,
    episodes: a?.episodes ?? null,
    studio:   mainStudio(a),
    year:     yearOf(a),
  }));
}

// ── /best-anime hub ──────────────────────────────────────────────────

export const hubHeading = () => 'Best Anime by Year';
export const hubTitle   = () => 'Best Anime by Year';

/** The span comes from the years actually published, so it can never lie. */
export function hubDescription(years) {
  const ys = [...(years ?? [])].map(Number).filter(Number.isFinite)
    .sort((a, b) => a - b);
  if (!ys.length) {
    return 'Top-rated anime from every year, ranked by score, free to stream on KamiStream.';
  }
  const span = ys.length === 1 ? `${ys[0]}` : `${ys[0]} to ${ys[ys.length - 1]}`;
  return clampText(
    `The best anime of every year from ${span} — top-rated series and films ranked by score, free to stream on KamiStream.`,
    158
  );
}

