/* ═══════════════════════════════════════════════════════════════════
 * "Anime like X" similarity engine — PURE, no React, no fetching.
 *
 * ── WHY THIS FILE IS PLAIN .js ─────────────────────────────────────
 * It is imported by TWO runtimes:
 *   • scripts/prerender.mjs      → Node, at build time (needs .js)
 *   • src/pages/anime-like.tsx   → Vite/React, in the browser
 * Writing the algorithm once means the crawlable prerendered HTML and the
 * React page can never disagree about which titles are similar or why.
 * The type surface lives in the sibling animeLike.d.ts, so TypeScript still
 * gets full type checking on the consumer side.
 *
 * ── WHAT "SIMILAR" MEANS HERE ──────────────────────────────────────
 * Not a guess and not invented copy: every match is scored on facts both
 * titles really have — shared genres/themes/demographics, the same studio,
 * the same format, a comparable score, the same era, the same airing status.
 * `whySimilar()` then states those facts in words, which is what makes each
 * page's text unique instead of another copy of a MAL synopsis.
 * ═══════════════════════════════════════════════════════════════════ */

/** Title shown to humans (English name when we have one). */
export const titleOf = a => a?.title_english || a?.title || '';

/** Genres + themes + demographics, as a Set of MAL genre ids.
 *  Jikan returns these in four separate arrays and the app only stores
 *  `genres`, so we read whatever is actually present — a live detail fetch
 *  (React) carries all four and therefore scores slightly richer than the
 *  build-time pool. Both produce a valid, honest ranking. */
export function genreIds(a) {
  const ids = new Set();
  for (const key of ['genres', 'themes', 'demographics', 'explicit_genres']) {
    for (const g of a?.[key] ?? []) if (g?.mal_id) ids.add(g.mal_id);
  }
  return ids;
}

/** genre id → name, from every array the object carries. */
export function genreNames(a) {
  const out = new Map();
  for (const key of ['genres', 'themes', 'demographics', 'explicit_genres']) {
    for (const g of a?.[key] ?? []) if (g?.mal_id && g.name) out.set(g.mal_id, g.name);
  }
  return out;
}

/** First/main animation studio — the one fans credit the look to. */
export const mainStudio = a => (a?.studios ?? []).find(s => s?.name)?.name ?? null;

/** Release year, preferring the explicit field then the aired date. */
export function yearOf(a) {
  if (a?.year) return Number(a.year);
  const from = a?.aired?.from;
  return from ? Number(String(from).slice(0, 4)) : null;
}

/** "2010s" — used for era-based prose. */
export const decadeOf = y => (y ? `${Math.floor(y / 10) * 10}s` : null);

/** Episode count, guarding against Jikan's nulls and 0s. */
export const episodesOf = a => (Number(a?.episodes) > 0 ? Number(a.episodes) : null);

/** Rounded score, or null when Jikan has no votes yet. */
export const scoreOf = a => (Number(a?.score) > 0 ? Math.round(Number(a.score) * 10) / 10 : null);

// ── Scoring ──────────────────────────────────────────────────────────
// Weights are deliberately blunt and explainable: every point maps to one
// sentence `whySimilar()` can print. Max ≈ 19.
const W_GENRE    = 3; // per shared genre, capped below
const W_GENRE_CAP = 9;
const W_STUDIO   = 3;
const W_FORMAT   = 2;
const W_SCORE_NEAR = 2; // within 0.4
const W_SCORE_OK   = 1; // within 0.9
const W_ERA      = 1; // same decade ±4 years
const W_STATUS   = 1;

/** Genre names shared by two titles, in the source's display order. */
export function sharedGenreNames(source, candidate) {
  const mine  = genreIds(source);
  const names = genreNames(source);
  return [...genreIds(candidate)]
    .filter(id => mine.has(id))
    .map(id => names.get(id) || genreNames(candidate).get(id))
    .filter(Boolean);
}

/** 0..~19 — how strongly `candidate` resembles `source`. */
export function similarityScore(source, candidate) {
  if (!source || !candidate) return 0;
  if (source.mal_id && source.mal_id === candidate.mal_id) return 0;

  let score = 0;

  const shared = sharedGenreNames(source, candidate).length;
  score += Math.min(shared * W_GENRE, W_GENRE_CAP);

  const studio = mainStudio(source);
  if (studio && studio === mainStudio(candidate)) score += W_STUDIO;

  if (source.type && source.type === candidate.type) score += W_FORMAT;

  const s1 = scoreOf(source);
  const s2 = scoreOf(candidate);
  if (s1 !== null && s2 !== null) {
    const diff = Math.abs(s1 - s2);
    if (diff <= 0.4) score += W_SCORE_NEAR;
    else if (diff <= 0.9) score += W_SCORE_OK;
  }

  const y1 = yearOf(source);
  const y2 = yearOf(candidate);
  if (y1 && y2 && Math.abs(y1 - y2) <= 4) score += W_ERA;

  if (source.status && source.status === candidate.status) score += W_STATUS;

  return score;
}

/** "a", "a and b", "a, b and c" */
export function listWords(items) {
  const a = (items ?? []).filter(Boolean);
  if (!a.length) return '';
  if (a.length === 1) return a[0];
  if (a.length === 2) return `${a[0]} and ${a[1]}`;
  return `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`;
}

/** Plural noun for prose: "TV series", "films", "OVAs"… */
function typeNoun(type, plural = true) {
  switch (type) {
    case 'TV':       return 'TV series';
    case 'Movie':    return plural ? 'films' : 'film';
    case 'OVA':      return plural ? 'OVAs' : 'OVA';
    case 'ONA':      return plural ? 'ONAs' : 'ONA';
    case 'Special':  return plural ? 'specials' : 'special';
    case 'TV Short': return plural ? 'TV shorts' : 'TV short';
    case 'Music':    return plural ? 'music videos' : 'music video';
    default:         return type ? String(type) : 'anime';
  }
}

/**
 * The sentences that make each page unique: every line below is a fact both
 * titles actually share, so it can be shown to users and crawlers alike.
 * Ordered strongest-first; callers slice as many as they want to display.
 */
export function whySimilar(source, candidate) {
  const out = [];

  const shared = sharedGenreNames(source, candidate);
  if (shared.length) out.push(`Both are ${listWords(shared.slice(0, 3))}`);

  const studio = mainStudio(source);
  if (studio && studio === mainStudio(candidate)) out.push(`Both animated by ${studio}`);

  const sType = source?.type;
  const y1 = yearOf(source);
  const y2 = yearOf(candidate);
  if (sType && sType === candidate?.type) {
    const era = (y1 && y2 && decadeOf(y1) === decadeOf(y2)) ? ` from the ${decadeOf(y1)}` : '';
    out.push(`Both are ${typeNoun(sType)}${era}`);
  } else if (y1 && y2 && decadeOf(y1) === decadeOf(y2)) {
    out.push(`Both aired in the ${decadeOf(y1)}`);
  }

  const s1 = scoreOf(source);
  const s2 = scoreOf(candidate);
  if (s1 !== null && s2 !== null && Math.min(s1, s2) >= 7.5) {
    // Quote the floor, which both titles genuinely clear.
    const floor = Math.floor(Math.min(s1, s2) * 2) / 2;
    out.push(`Both rate ${floor.toFixed(1)} or higher with fans`);
  }

  const e1 = episodesOf(source);
  const e2 = episodesOf(candidate);
  if (e1 && e2 && Math.abs(e1 - e2) <= 6) out.push(`Comparable length (${e1} vs ${e2} episodes)`);

  if (source?.status && source.status === candidate?.status) {
    out.push(source.status === 'Currently Airing'
      ? 'Both are still airing'
      : `Both are ${String(source.status).toLowerCase()}`);
  }

  return out;
}

/** Lowercase, punctuation-free title for franchise comparison. */
const normTitle = t => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * True when both titles are entries in the SAME franchise:
 * "Frieren: Beyond Journey's End" vs "Frieren: Beyond Journey's End Season 2".
 *
 * Someone searching "anime like Frieren" already knows Frieren's own sequels
 * exist — they are one click away on the anime page — so spending a slot on
 * one is a wasted recommendation and reads as a padded page.
 *
 * The sequel-marker test is what keeps genuinely different shows apart:
 * "Monster" vs "Monster Musume" is a prefix match but the leftover
 * ("musume") is not a sequel marker, so both stay in the results.
 */
export function sameFranchise(a, b) {
  const x = normTitle(titleOf(a));
  const y = normTitle(titleOf(b));
  if (!x || !y) return false;
  if (x === y) return true;

  const short = x.length <= y.length ? x : y;
  const long  = x.length <= y.length ? y : x;
  if (short.length < 4 || !long.startsWith(short)) return false;

  const rest = long.slice(short.length).trim();
  return /^(season|part|movie|the movie|ova|ona|special|final|second|third|fourth|fifth|chapter|volume|recap|side story|[ivx]{1,4}|\d+)\b/i.test(rest);
}

/**
 * Loose franchise key: the first word of a title, when it is long enough to be
 * a name rather than an article ("the", "one", "my").
 *
 * `sameFranchise()` only catches numbered/seasoned sequels, which leaves the
 * subtitle-variant convention invisible: "Gintama'", "Gintama°", "Gintama.",
 * "Gintama: Enchousen" and "Gintama Movie 2: …" are five separate entries that
 * share no sequel marker at all. Without this the Cowboy Bebop page filled 8 of
 * its 12 slots with Gintama seasons, which is exactly the padded, low-value
 * page this feature is supposed to avoid.
 *
 * The 5-character floor is what stops it from clustering unrelated titles that
 * merely start with the same short word ("Kimi no Na wa" vs "Kimi ni Todoke"
 * both normalise to "kimi", which is 4 characters, so neither is grouped).
 * The accepted cost: "Monster" and "Monster Musume" do collide, so only one
 * can appear on a page. Losing one candidate out of twelve is a far smaller
 * problem than shipping franchise spam.
 */
export function franchiseKey(title) {
  const first = normTitle(title).split(' ')[0] || '';
  return first.length >= 5 ? first : null;
}

/**
 * Best matches for `source` out of `candidates`.
 * Requires at least one genuinely shared genre, so "similar" is never
 * asserted without a reason behind it, and never returns two titles from the
 * same franchise.
 */
export function similarAnime(source, candidates, { limit = 12, minScore = 6 } = {}) {
  const mine = genreIds(source);

  // The source's own franchise is already represented by the source itself.
  const claimed = new Set([franchiseKey(titleOf(source))].filter(Boolean));

  return (candidates ?? [])
    .filter(c => c && c.mal_id && c.mal_id !== source?.mal_id && !sameFranchise(source, c))
    .map(c => ({
      anime: c,
      score: similarityScore(source, c),
      sharedGenres: sharedGenreNames(source, c),
      _rating: scoreOf(c) ?? 0,
      _year: yearOf(c) ?? 0,
      _shared: [...genreIds(c)].filter(id => mine.has(id)).length,
    }))
    .filter(m => m._shared >= 1 && m.score >= minScore)
    .sort((a, b) =>
      b.score - a.score ||            // most alike first
      b._rating - a._rating ||        // then the better-rated of equals
      b._year - a._year ||            // then the more recent
      String(a.anime.title).localeCompare(String(b.anime.title)))
    // De-duplicate by franchise AFTER sorting, so the best-scoring member of
    // each franchise survives and the freed slots go to distinct titles.
    .filter(m => {
      const key = franchiseKey(titleOf(m.anime));
      if (!key) return true;
      if (claimed.has(key)) return false;
      claimed.add(key);
      return true;
    })
    .slice(0, limit)
    .map(({ anime, score, sharedGenres }) => ({
      anime, score, sharedGenres,
      reasons: whySimilar(source, anime),
    }));
}

/** Genres ranked by how many of the matches share them — the page's spine. */
export function topSharedGenres(source, matches, k = 3) {
  const counts = new Map();
  for (const m of matches) {
    for (const name of m.sharedGenres ?? []) {
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, k)
    .map(([name, count]) => ({ name, count }));
}

// ── Page copy ────────────────────────────────────────────────────────
// Deterministic (no randomness, no Date) so builds are reproducible and the
// prerendered HTML stays byte-stable for a given pool.

export const likeHeading = source => `Anime Like ${titleOf(source)}`;

export function likeTitle(source) {
  // Matches how useSEO() composes titles: this string + " | KamiStream".
  return `Anime Like ${titleOf(source)}`;
}

/** Hard-wrap a meta description the way the rest of the site does
 *  (mirrors clamp() in scripts/prerender.mjs). */
export function clampText(text, max = 158) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const sp  = cut.lastIndexOf(' ');
  return (sp > 60 ? cut.slice(0, sp) : cut).replace(/[,;:.\-]$/, '') + '…';
}

/** Meta description — names real titles, so it is unique per page. */
export function likeDescription(source, matches) {
  const name = titleOf(source);
  const n = (matches ?? []).length;
  const picks = (matches ?? []).slice(0, 3).map(m => titleOf(m.anime)).filter(Boolean);
  const tail = picks.length ? `, including ${listWords(picks)}` : '';
  return clampText(
    `Looking for anime like ${name}? ${n} similar ${n === 1 ? 'title' : 'titles'}${tail}. `
    + `Each one lists what it shares with ${name} — genres, studio, era and score. Watch free on KamiStream.`
  );
}

/**
 * The intro paragraph. Sentence 1 is the count plus the genres that drive the
 * match; sentence 2 adds the strongest available statistic. Both are computed
 * from the real data, which is what stops this reading as a boilerplate
 * template across ~200 pages.
 */
const capitalize = s => (s ? s[0].toUpperCase() + s.slice(1) : s);

export function likeIntro(source, matches) {
  const name = titleOf(source);
  const n = (matches ?? []).length;
  if (!n) return '';

  const top = topSharedGenres(source, matches, 3).map(g => g.name);

  const s1 = `Looking for more anime like ${name}? These ${n} are the closest matches in the `
    + 'KamiStream catalogue'
    + (top.length ? `, chosen because they share its ${listWords(top.map(capitalize))}` : '')
    + '.';

  const studio  = mainStudio(source);
  const s1Year  = yearOf(source);
  const sameStudio = studio ? matches.filter(m => mainStudio(m.anime) === studio).length : 0;
  const sameEra    = s1Year
    ? matches.filter(m => {
        const y = yearOf(m.anime);
        return y && decadeOf(y) === decadeOf(s1Year);
      }).length
    : 0;
  const highRated  = matches.filter(m => (scoreOf(m.anime) ?? 0) >= 8.5).length;

  const facts = [];
  if (sameStudio >= 2) facts.push(`${sameStudio} also come from ${studio}`);
  if (sameEra >= 2 && decadeOf(s1Year)) facts.push(`${sameEra} aired in the ${decadeOf(s1Year)}`);
  if (highRated >= 2) facts.push(`${highRated} are rated 8.5 or higher`);

  const s2 = facts.length
    ? capitalize(facts[0]) + (facts[1] ? `, and ${facts[1]}` : '') + '.'
    : '';

  const s3 = `Every pick below states exactly what it has in common with ${name}, so you can `
    + 'tell at a glance which one to watch next.';

  return [s1, s2, s3].filter(Boolean).join(' ');
}

/** Side-by-side facts for the comparison table (real values only). */
export function comparisonRows(source, candidate) {
  const fmt = v => (v === null || v === undefined || v === '' ? '—' : String(v));

  const rows = [
    { label: 'Rating',   source: scoreOf(source),    candidate: scoreOf(candidate) },
    { label: 'Type',     source: source?.type,       candidate: candidate?.type },
    { label: 'Episodes', source: episodesOf(source), candidate: episodesOf(candidate) },
    { label: 'Released', source: yearOf(source),     candidate: yearOf(candidate) },
    { label: 'Studio',   source: mainStudio(source), candidate: mainStudio(candidate) },
    { label: 'Status',   source: source?.status,     candidate: candidate?.status },
  ];

  return rows
    .filter(r => r.source != null || r.candidate != null)
    .map(r => ({ label: r.label, source: fmt(r.source), candidate: fmt(r.candidate) }));
}

/** True when two candidates are similar enough to build a page from. */
export const MIN_MATCHES_FOR_PAGE = 6;
