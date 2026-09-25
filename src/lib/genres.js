/* ═══════════════════════════════════════════════════════════════════
 * Genre catalogue — the ONE place genre ids and genre names live.
 *
 * ── WHY THIS FILE EXISTS ───────────────────────────────────────────
 * The MAL genre table used to be copy-pasted into five files:
 *     src/pages/genre.tsx            (58 ids — the hub + chip bar)
 *     src/components/Sidebar.tsx     (14 ids — the drawer)
 *     src/pages/browse.tsx           (12 ids — the filter select)
 *     api/sitemap-pages.js           (58 ids — /sitemap-pages.xml)
 *     scripts/prerender.mjs          (58 ids — the crawlable HTML)
 * They had already drifted apart, and the crawlable surfaces were the
 * wrong way round: the sitemaps and the prerendered chip bar advertised
 * 58 /genre/:id URLs while the UI only ever offered 14, and the pages
 * outside those 14 render a "Genre Not Found" shell that is noindex.
 * That is how a sitemap starts reporting "Submitted URL marked
 * noindex" and burns the crawl budget Google gives us.
 *
 * ── TWO TABLES, TWO DIFFERENT JOBS ─────────────────────────────────
 *   GENRE_NAMES_BY_ID   every MAL anime genre id → name (59 entries:
 *                       Jikan's genres + themes + demographics, plus
 *                       the two explicit genres from
 *                       /genres/anime?filter=explicit_genres). Used for
 *                       NORMALIZATION: turning the genre names AniList
 *                       hands back at build time into the numeric
 *                       mal_id shape the rest of the build expects (see
 *                       scripts/prerender.mjs), so a title's genre list
 *                       is never silently emptied.
 *
 *   POPULAR_GENRES      the 16 genres we actually publish a hub page
 *                       for. These are the genres that appear in the
 *                       sidebar, the browse filter, the genre
 *                       quick-switch bar, the topbar/footer keyword
 *                       links, both sitemaps and the prerenderer.
 *                       Add or remove an entry here and every one of
 *                       those surfaces changes with it — that is the
 *                       whole point of the file.
 *
 * ── ADULT GENRES (Ecchi 9, Hentai 12) ──────────────────────────────
 * These two are Jikan's explicit genres and they are NOT fetched like
 * the rest, in two independent ways:
 *   · Jikan filters an explicit genre out of its own genre listing when
 *     `sfw=true` is set, so /genre/12 would come back empty. Adult
 *     listings are requested without sfw.
 *   · AniList hides Hentai entirely unless `isAdult:true` is set, while
 *     Ecchi's mainstream titles (No Game No Life, KonoSuba) are exactly
 *     the isAdult:false ones. So only Hentai flips that flag.
 * ADULT_GENRE_IDS / ANILIST_ADULT_GENRE_IDS below encode those two
 * facts separately; every fetcher asks these helpers instead of
 * hardcoding an sfw/isAdult value, which is what keeps the hubs
 * non-empty whichever API answers.
 *
 * ── WHY PLAIN .js AND NOT .ts ──────────────────────────────────────
 * Three very different consumers import it: the Vite/React bundle,
 * Node build scripts (scripts/prerender.mjs) and a Vercel serverless
 * function (api/sitemap-pages.js). A plain ESM module is the only
 * shape all three can load without an extra build step, so the
 * crawlable HTML, the sitemaps and the UI cannot disagree. Types live
 * in src/lib/genres.d.ts.
 *
 * ── DETERMINISM ────────────────────────────────────────────────────
 * Ordering uses cmpText() rather than localeCompare(): localeCompare
 * varies with the ICU build Node happens to ship, which would make the
 * prerendered chip order — and therefore the emitted bytes — differ
 * between two machines building the same commit.
 * ═══════════════════════════════════════════════════════════════════ */

/**
 * Every Jikan/MAL anime genre id → its MAL name.
 * Verified against https://api.jikan.moe/v4/genres/anime (genres + themes
 * + demographics) and ?filter=explicit_genres for 9/Ecchi and 12/Hentai.
 * Used for name → id normalization; it is NOT the list of pages we
 * publish — see POPULAR_GENRES.
 */
export const GENRE_NAMES_BY_ID = Object.freeze({
  '1':  'Action',
  '2':  'Adventure',
  '4':  'Comedy',
  '7':  'Mystery',
  '8':  'Drama',
  '9':  'Ecchi',
  '10': 'Fantasy',
  '12': 'Hentai',
  '13': 'Historical',
  '14': 'Horror',
  '17': 'Martial Arts',
  '18': 'Mecha',
  '19': 'Music',
  '22': 'Romance',
  '23': 'School',
  '24': 'Sci-Fi',
  '25': 'Shoujo',
  '27': 'Shounen',
  '29': 'Space',
  '30': 'Sports',
  '36': 'Slice of Life',
  '37': 'Supernatural',
  '38': 'Military',
  '40': 'Psychological',
  '41': 'Thriller',
  '42': 'Seinen',
  '43': 'Josei',
  '46': 'Award Winning',
  '47': 'Gourmet',
  '50': 'Adult Cast',
  '55': 'Delinquents',
  '56': 'Detective',
  '57': 'Educational',
  '60': 'Gore',
  '61': 'Harem',
  '62': 'High Stakes Game',
  '65': 'Idols (Male)',
  '66': 'Isekai',
  '67': 'Iyashikei',
  '70': 'Mahou Shoujo',
  '71': 'Medical',
  '72': 'Mythology',
  '74': 'Otaku Culture',
  '75': 'Parody',
  '77': 'Pets',
  '78': 'Racing',
  '79': 'Reincarnation',
  '82': 'Samurai',
  '83': 'Showbiz',
  '84': 'Strategy Game',
  '85': 'Super Power',
  '86': 'Survival',
  '87': 'Team Sports',
  '88': 'Time Travel',
  '89': 'Vampire',
  '91': 'Villainess',
  '93': 'Witchcraft',
  '94': 'Yaoi',
  '95': 'Yuri',
});

/**
 * The genres that get a hub page, a chip, a sitemap entry and a
 * prerendered document. Order here = display order in the sidebar and
 * the browse filter (roughly by search demand, not alphabetically);
 * anything that needs a sorted list uses POPULAR_GENRES_BY_NAME.
 */
export const POPULAR_GENRES = Object.freeze([
  { id: 1,  name: 'Action' },
  { id: 2,  name: 'Adventure' },
  { id: 4,  name: 'Comedy' },
  { id: 8,  name: 'Drama' },
  { id: 10, name: 'Fantasy' },
  { id: 22, name: 'Romance' },
  { id: 24, name: 'Sci-Fi' },
  { id: 36, name: 'Slice of Life' },
  { id: 30, name: 'Sports' },
  { id: 37, name: 'Supernatural' },
  { id: 7,  name: 'Mystery' },
  { id: 14, name: 'Horror' },
  { id: 41, name: 'Thriller' },
  { id: 66, name: 'Isekai' },
  // ── Adult genres — see the ADULT GENRES note at the top of this file.
  // Listed last so the existing sidebar / browse-filter order is untouched;
  // the chip bar sorts by name anyway (Ecchi lands after Drama, Hentai after
  // Fantasy).
  { id: 9,  name: 'Ecchi' },
  { id: 12, name: 'Hentai' },
]);

/** Locale-independent text compare — see DETERMINISM above. */
function cmpText(a, b) {
  const x = String(a ?? '').toLowerCase();
  const y = String(b ?? '').toLowerCase();
  return x < y ? -1 : x > y ? 1 : 0;
}

/** Name (lowercased) → MAL id, built from the FULL table above. */
export const GENRE_ID_BY_NAME = Object.freeze(
  Object.entries(GENRE_NAMES_BY_ID).reduce((acc, [id, name]) => {
    acc[name.toLowerCase()] = Number(id);
    return acc;
  }, {})
);

/** Public id → name, keyed by string so POPULAR_GENRE_NAMES_BY_ID['7'] works. */
export const POPULAR_GENRE_NAMES_BY_ID = Object.freeze(
  POPULAR_GENRES.reduce((acc, g) => {
    acc[String(g.id)] = g.name;
    return acc;
  }, {})
);

/** The public ids as strings, in POPULAR_GENRES order. */
export const POPULAR_GENRE_IDS = Object.freeze(POPULAR_GENRES.map(g => String(g.id)));

/**
 * Jikan's explicit_genres: /anime?genres=<id>&sfw=true returns nothing for
 * these, because sfw filters the genre out of its own listing. Every request
 * for an adult genre is therefore sent WITHOUT sfw (see isAdultGenre()).
 */
export const ADULT_GENRE_IDS = Object.freeze([9, 12]);

/**
 * The subset of ADULT_GENRE_IDS whose AniList catalogue is only reachable
 * with isAdult:true. Measured against the live API:
 *   genre:"Hentai", isAdult:false → 0 results
 *   genre:"Hentai", isAdult:true  → the hentai catalogue
 *   genre:"Ecchi",  isAdult:false → No Game No Life, KonoSuba, 7DS
 *   genre:"Ecchi",  isAdult:true  → only the ~dozen adult-flagged titles
 * So Hentai flips the flag and Ecchi must not: collapsing the two lists
 * would either empty the Hentai hub or shrink the Ecchi hub to a handful of
 * explicit titles.
 */
export const ANILIST_ADULT_GENRE_IDS = Object.freeze([12]);

/**
 * Matches a MAL id ('12'), a numeric id (12) or a genre name ('Hentai',
 * case-insensitive) against `ids`. Names matter because browse.tsx maps the
 * selected genre to its AniList *name* before calling the fallback, so the
 * helpers have to recognise both shapes.
 */
function matchesGenreIds(ids, idOrName) {
  const v = String(idOrName ?? '').trim().toLowerCase();
  if (!v) return false;
  const n = Number(v);
  if (Number.isFinite(n) && ids.includes(n)) return true;
  return POPULAR_GENRES.some(g => ids.includes(g.id) && g.name.toLowerCase() === v);
}

/** True for Ecchi/Hentai — i.e. "send this listing without Jikan's sfw flag". */
export function isAdultGenre(idOrName) {
  return matchesGenreIds(ADULT_GENRE_IDS, idOrName);
}

/** True for Hentai only — i.e. "this AniList query needs isAdult:true". */
export function requiresAniListAdultFilter(idOrName) {
  return matchesGenreIds(ANILIST_ADULT_GENRE_IDS, idOrName);
}

/** POPULAR_GENRES sorted by name — the shared chip order (prerender + React). */
export const POPULAR_GENRES_BY_NAME = Object.freeze(
  [...POPULAR_GENRES].sort((a, b) => cmpText(a.name, b.name))
);

/**
 * True when /genre/:id is a page we publish. Everything that renders a
 * link into a genre hub — or a sitemap entry for one — must ask this
 * first, otherwise we ship internal links to noindexed shells.
 */
export function isPopularGenre(id) {
  return Object.prototype.hasOwnProperty.call(POPULAR_GENRE_NAMES_BY_ID, String(id ?? ''));
}

/** Display name for a public genre id, or '' when the id is not one of ours. */
export function popularGenreName(id) {
  return POPULAR_GENRE_NAMES_BY_ID[String(id ?? '')] || '';
}

/** Public id for a genre name (case-insensitive), or null when unsupported. */
export function popularGenreIdByName(name) {
  const id = GENRE_ID_BY_NAME[String(name ?? '').toLowerCase()];
  return id !== undefined && isPopularGenre(id) ? String(id) : null;
}
