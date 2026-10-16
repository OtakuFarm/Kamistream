// ─────────────────────────────────────────────────────────────────────────────
// Shared Jikan → AniList fallback fetcher
//
// Uses the shared rate-limit queue (single instance across the entire app)
// from @/lib/rateLimit — previously each page had its own queue which meant
// they competed and still hit 429s. Now there is ONE queue for the whole app.
// ─────────────────────────────────────────────────────────────────────────────

import { catalogueEnabled } from "@/lib/catalogue";
import { isAdultGenre } from "@/lib/genres";
import { enqueue } from "@/lib/rateLimit";

const JIKAN = "https://api.jikan.moe/v4";
const AL    = "https://graphql.anilist.co";

/** Hard timeouts so one stalled upstream can never hang a page. */
const JIKAN_TIMEOUT_MS = 6000;
const AL_TIMEOUT_MS    = 8000;
/** AniList gets first crack; Jikan is the safety net while it's stalling. */
const AL_HEAD_START_MS = 3500;

function fetchWithTimeout(url: string, init: RequestInit = {}, ms = JIKAN_TIMEOUT_MS): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

/** Queued Jikan fetch with one 429 retry. Throws on failure — the caller
 *  decides whether to fall back to AniList (see jikanFetch below). */
async function jikanAttempt(endpoint: string): Promise<any> {
  return enqueue(async () => {
    const r = await fetchWithTimeout(`${JIKAN}${endpoint}`);

    if (r.status === 429) {
      // Back off 1.5 s then retry once
      await new Promise(w => setTimeout(w, 1500));
      const r2 = await fetchWithTimeout(`${JIKAN}${endpoint}`);
      if (!r2.ok) throw new Error(`429 retry: ${r2.status}`);
      return r2.json();
    }

    if (!r.ok) throw new Error(`Jikan ${r.status}`);
    return r.json();
  });
}

/**
 * AniList-first fetch with Jikan as the safety net.
 *
 * Jikan stalls 20s+ under load (measured live, Oct 2026) while AniList
 * answers in ~1s, so AniList races with a short head-start window and its
 * result wins when healthy. Jikan is only attempted when AniList misses
 * the window or errors — never in parallel, so we don't double the load
 * on an already-struggling Jikan.
 */
export async function jikanFetch(endpoint: string): Promise<any> {
  // VITE_CATALOGUE=1 means the site reads ONLY from Supabase — never call Jikan or AniList.
  if (catalogueEnabled()) {
    return { data: [], pagination: { current_page: 1, last_visible_page: 1, has_next_page: false } };
  }
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("AniList head-start window elapsed")), AL_HEAD_START_MS)
  );
  try {
    return await Promise.race([jikanToAL(endpoint), timeout]);
  } catch (alErr) {
    try {
      return await jikanAttempt(endpoint);
    } catch (jikanErr) {
      console.warn("[KamiStream] Both sources failed. AniList:", (alErr as Error).message, "| Jikan:", (jikanErr as Error).message);
      throw jikanErr;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AniList normaliser — output always matches Jikan's shape
// Includes the richer detail fields (banner, trailer, aired, rank) so pages
// served from AniList don't render half-empty while Jikan is stalling.
// ─────────────────────────────────────────────────────────────────────────────
const AL_F = `id idMal title{romaji english native} coverImage{large extraLarge medium}
  bannerImage trailer{id site thumbnail} format episodes duration averageScore meanScore
  popularity favourites rankings{rank type allTime} status season seasonYear
  startDate{year month day} endDate{year month day} genres synonyms source
  studios(isMain:true){nodes{name}} description(asHtml:false}`;

function alDate(d: any): string | null {
  if (!d?.year) return null;
  const m = String(d.month || 1).padStart(2, "0");
  const day = String(d.day || 1).padStart(2, "0");
  return `${d.year}-${m}-${day}T00:00:00+00:00`;
}

function alSeason(season?: string, year?: number | null): string | null {
  if (!season) return year ? String(year) : null;
  const s = season.charAt(0) + season.slice(1).toLowerCase();
  return year ? `${s} ${year}` : s;
}

function alShape(m: any) {
  const ytId = m.trailer?.site === "youtube" ? (m.trailer?.id || null) : null;
  return {
    mal_id:   m.idMal ?? m.id,
    title:    m.title?.english || m.title?.romaji || "Unknown",
    title_english: m.title?.english || null,
    title_japanese: m.title?.native || null,
    score:    m.averageScore ? +(m.averageScore / 10).toFixed(1) : null,
    scored_by: m.popularity ?? null,
    rank:     m.rankings?.find((r: any) => r.allTime && r.type === "RATED")?.rank
      ?? m.rankings?.[0]?.rank ?? null,
    popularity: m.popularity ?? null,
    members:  m.popularity ?? null,
    favorites: m.favourites ?? null,
    episodes: m.episodes ?? null,
    duration: m.duration ? `${m.duration} min per ep` : null,
    type:     ({ TV: "TV", TV_SHORT: "TV", MOVIE: "Movie", OVA: "OVA", ONA: "ONA", SPECIAL: "Special", MUSIC: "Music" } as any)[m.format] || "TV",
    source:   m.source ? m.source.charAt(0) + m.source.slice(1).toLowerCase().replace(/_/g, " ") : null,
    status:   ({ RELEASING: "Currently Airing", FINISHED: "Finished Airing", NOT_YET_RELEASED: "Not yet aired", CANCELLED: "Cancelled", HIATUS: "On Hiatus" } as any)[m.status] || "",
    airing:   m.status === "RELEASING",
    aired:    { from: alDate(m.startDate), to: alDate(m.endDate), string: [alSeason(m.season, m.seasonYear), alDate(m.startDate)?.slice(0, 10)].filter(Boolean).join(" ") || null },
    season:   (m.season || "").toLowerCase() || null,
    year:     m.seasonYear ?? null,
    synopsis: m.description?.replace(/<[^>]+>/g, "") ?? null,
    genres:   (m.genres || []).map((g: string) => ({ name: g })),
    studios:  (m.studios?.nodes || []).map((s: any) => ({ name: s.name })),
    trailer:  ytId ? { youtube_id: ytId, images: { maximum_image_url: m.trailer?.thumbnail || "" } } : null,
    images: {
      webp: {
        large_image_url: m.coverImage?.extraLarge || m.coverImage?.large || "",
        image_url:       m.coverImage?.medium || "",
        small_image_url: m.coverImage?.medium || "",
      },
      jpg: {
        large_image_url: m.coverImage?.extraLarge || m.coverImage?.large || "",
        image_url:       m.coverImage?.medium || "",
        small_image_url: m.coverImage?.medium || "",
      },
    },
    _bannerImage: m.bannerImage ?? null,
    _alId: m.id,
  };
}

async function alQuery(gql: string, vars: Record<string, any> = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), AL_TIMEOUT_MS);
  try {
    const r = await fetch(AL, {
      method:  "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body:    JSON.stringify({ query: gql, variables: vars }),
      signal:  ctrl.signal,
    });
    if (!r.ok) throw new Error("AniList error");
    const j = await r.json();
    if (j.errors) throw new Error(j.errors[0]?.message);
    return j;
  } finally {
    clearTimeout(timer);
  }
}

async function alPage(
  vars: Record<string, any>,
  extraFilters = "",
  sort = "POPULARITY_DESC",
  includeAdult = false
) {
  const d = await alQuery(
    `query($p:Int,$perPage:Int){Page(page:$p,perPage:$perPage){
      pageInfo{currentPage lastPage hasNextPage}
      media(type:ANIME,isAdult:${includeAdult},sort:${sort}${extraFilters}){${AL_F}}
    }}`,
    { p: vars.page || 1, perPage: vars.limit || 24 }
  );
  const pg = d.data.Page;
  return {
    data: pg.media.map(alShape),
    pagination: {
      current_page:      pg.pageInfo.currentPage,
      last_visible_page: pg.pageInfo.lastPage,
      has_next_page:     pg.pageInfo.hasNextPage,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// URL parser — converts Jikan endpoint params to AniList query
// ─────────────────────────────────────────────────────────────────────────────
const GENRE_MAP: Record<string, string> = {
  "1": "Action", "2": "Adventure", "4": "Comedy", "7": "Mystery",
  "9": "Ecchi", "12": "Hentai",
  // NOTE: AniList only accepts its own fixed genre set — Jikan/MAL-only
  // categories (Historical, School, Isekai, …) must map to the closest valid
  // AniList genre or the fallback query fails outright.
  // Ecchi and Hentai ARE valid AniList genres; Hentai additionally only
  // exists behind isAdult:true (handled in jikanToAL below), and a missing
  // "12" entry here used to drop the genre filter altogether — the fallback
  // answered /genre/12 with an unfiltered popularity list.
  "8": "Drama", "10": "Fantasy", "13": "Drama", "14": "Horror",
  "17": "Martial Arts", "18": "Mecha", "19": "Music", "22": "Romance",
  "23": "Slice of Life", "24": "Sci-Fi", "25": "Shoujo", "27": "Shounen",
  "29": "Sci-Fi", "30": "Sports", "36": "Slice of Life", "37": "Supernatural",
  "38": "Action", "40": "Psychological", "41": "Thriller", "42": "Seinen",
  "43": "Josei", "66": "Fantasy", "79": "Fantasy", "85": "Action",
  "86": "Adventure", "88": "Sci-Fi", "89": "Supernatural", "70": "Mahou Shoujo",
};

// Jikan/MAL ids that have no AniList *genre* equivalent are expressed as
// AniList *tags* instead. Without this, the fallback dropped the genre filter
// entirely and returned unfiltered popular anime — which made the Genre page
// show titles that didn't match the selected genre whenever Jikan 429'd.
const TAG_MAP: Record<string, string> = {
  "46": "Award Winning",   "47": "Food",             "50": "Adult Cast",
  "55": "Delinquents",     "56": "Detective",        "57": "Educational",
  "60": "Gore",            "61": "Harem",            "62": "High Stakes Game",
  "65": "Idols (Male)",    "67": "Iyashikei",        "71": "Medical",
  "72": "Mythology",       "74": "Otaku Culture",    "75": "Parody",
  "77": "Pets",            "78": "Racing",           "82": "Samurai",
  "83": "Showbiz",         "84": "Strategy Game",    "87": "Team Sports",
  "91": "Villainess",      "93": "Witchcraft",       "94": "Boys' Love",
  "95": "Girls' Love",
};
const FORMAT_MAP: Record<string, string> = {
  tv: "TV", movie: "MOVIE", ova: "OVA", ona: "ONA", special: "SPECIAL",
};
const STATUS_MAP: Record<string, string> = {
  airing: "RELEASING", complete: "FINISHED", upcoming: "NOT_YET_RELEASED",
};
const SORT_MAP: Record<string, string> = {
  "score-desc":       "SCORE_DESC",
  "members-desc":     "POPULARITY_DESC",
  "title-asc":        "TITLE_ROMAJI",
  "title-desc":       "TITLE_ROMAJI_DESC",
  "start_date-desc":  "START_DATE_DESC",
  "end_date-desc":    "END_DATE_DESC",
  "popularity-desc":  "POPULARITY_DESC",
  "favorites-desc":   "FAVOURITES_DESC",
};

export async function jikanToAL(endpoint: string): Promise<any> {
  const url = new URL(`https://x.com${endpoint}`);
  const p   = url.searchParams;
  const path = url.pathname;

  // FIX: /seasons/{year}/{season} was previously ignored by this parser —
  // the AniList fallback returned a generic popularity list instead of the
  // requested season, which made the "This Season" category show unrelated
  // anime whenever Jikan rate-limited us.
  const seasonMatch = path.match(/^\/seasons\/(\d{4})\/(winter|spring|summer|fall)/i);

  const page     = parseInt(p.get("page")     || "1");
  const limit    = parseInt(p.get("limit")    || "24");
  const q        = p.get("q")       || "";
  const genres   = p.get("genres")  || "";
  const type     = p.get("type")    || "";
  const status   = p.get("status")  || "";
  const letter   = p.get("letter")  || "";
  const minScore = p.get("min_score") || "";
  const startDate = p.get("start_date") || "";
  const orderBy  = p.get("order_by") || "popularity";
  const sort     = p.get("sort")    || "desc";
  const filter   = p.get("filter")  || "";

  // AniList hides adult titles unless isAdult:true is set, and the sfw flag
  // this endpoint was called with means nothing to AniList — so the *genre*
  // decides, through the same helper the Jikan path uses to decide whether
  // to send sfw at all (see ADULT_GENRE_IDS in src/lib/genres.js). A
  // comma-separated genre list ("9,12", as the mood pages send) counts as
  // adult when ANY id is.
  const adult = genres.split(",").some(id => isAdultGenre(id));

  let alSort = "POPULARITY_DESC";
  // FIX: /top/anime was never handled — Top Rated / Top Anime fell through to
  // POPULARITY_DESC, so the fallback showed popular anime instead of top-ranked
  // ones. Map the Jikan /top/anime filters explicitly.
  const isTop = path.startsWith("/top/anime");
  if (seasonMatch) {
    alSort = "POPULARITY_DESC";
  } else if (isTop) {
    if (filter === "airing")         alSort = "TRENDING_DESC";
    else if (filter === "favorite")  alSort = "FAVOURITES_DESC";
    else if (filter === "upcoming")  alSort = "POPULARITY_DESC";
    // bypopularity → POPULARITY_DESC (default); no filter → ranked by score
    else if (filter !== "bypopularity") alSort = "SCORE_DESC";
  } else if (filter === "airing")    alSort = "TRENDING_DESC";
  else if (filter === "favorite") alSort = "FAVOURITES_DESC";
  else {
    const key = `${orderBy}-${sort}`;
    alSort = SORT_MAP[key] || "POPULARITY_DESC";
  }

  const filters: string[] = [];
  if (seasonMatch) {
    const SEASON_MAP: Record<string, string> = {
      winter: "WINTER", spring: "SPRING", summer: "SUMMER", fall: "FALL",
    };
    filters.push(`,season:${SEASON_MAP[seasonMatch[2].toLowerCase()]},seasonYear:${seasonMatch[1]}`);
  }
  if (q)        filters.push(`,search:"${q.replace(/"/g, "")}"`);
  if (letter)   filters.push(`,search:"${letter}"`);
  // Support comma-separated genre ids (e.g. "1,2") — map each id and use
  // genre_in so multi-genre moods survive the AniList fallback too.
  if (genres) {
    // Try the genre map first; any id without a genre equivalent falls back
    // to a tag filter so the filter is NEVER silently dropped.
    const genreNames = genres.split(",").map(s => GENRE_MAP[s.trim()]).filter(Boolean);
    if (genreNames.length === genres.split(",").length) {
      if (genreNames.length === 1)    filters.push(`,genre:"${genreNames[0]}"`);
      else                            filters.push(`,genre_in:[${genreNames.map(n => `"${n}"`).join(",")}]`);
    } else {
      // Prefer a tag match on the first id; combine genre+tag when mixed.
      const firstId = genres.split(",")[0].trim();
      const tag = TAG_MAP[firstId];
      if (genreNames.length > 0) filters.push(`,genre_in:[${genreNames.map(n => `"${n}"`).join(",")}]`);
      if (tag)                   filters.push(`,tag:"${tag}"`);
    }
  }
  if (type)     { const f = FORMAT_MAP[type.toLowerCase()]; if (f) filters.push(`,format:${f}`); }
  if (status)   { const s = STATUS_MAP[status]; if (s) filters.push(`,status:${s}`); }
  if (filter === "airing") filters.push(",status:RELEASING");
  if (minScore) filters.push(`,averageScore_greater:${Math.round(parseFloat(minScore) * 10)}`);
  // Browse sends year as start_date=YYYY-01-01 — without this the AniList
  // fallback silently dropped the year filter and returned unfiltered titles.
  if (startDate) {
    const y = parseInt(startDate.slice(0, 4));
    if (y > 1900 && y < 2100) filters.push(`,seasonYear:${y}`);
  }

  return alPage({ page, limit }, filters.join(""), alSort, adult);
}
