// ─────────────────────────────────────────────────────────────────────────────
// Shared Jikan → AniList fallback fetcher
//
// Single rate-limit queue shared across ALL pages (category, genre, az-list,
// browse, home). Previously each page had its own queue which meant they
// competed and still hit 429s. Now there is ONE queue for the whole app.
// ─────────────────────────────────────────────────────────────────────────────

const JIKAN = "https://api.jikan.moe/v4";
const AL    = "https://graphql.anilist.co";

// 350 ms gap ≈ 2.8 req/sec — comfortably under Jikan's 3 req/sec limit
const MIN_GAP = 350;
let lastT    = 0;
let queue: Array<() => void> = [];
let running  = false;

function runQueue() {
  if (running || !queue.length) return;
  running = true;
  const next = queue.shift()!;
  const wait = Math.max(0, lastT + MIN_GAP - Date.now());
  setTimeout(() => {
    lastT   = Date.now();
    next();
    running = false;
    runQueue();
  }, wait);
}

/** Queued Jikan fetch with one 429 retry, then AniList fallback */
export async function jikanFetch(endpoint: string): Promise<any> {
  try {
    return await new Promise<any>((resolve, reject) => {
      queue.push(async () => {
        try {
          const r = await fetch(`${JIKAN}${endpoint}`);

          if (r.status === 429) {
            // Back off 1.5 s then retry once
            await new Promise(w => setTimeout(w, 1500));
            const r2 = await fetch(`${JIKAN}${endpoint}`);
            if (!r2.ok) return reject(new Error(`429 retry: ${r2.status}`));
            return resolve(r2.json());
          }

          if (!r.ok) return reject(new Error(`Jikan ${r.status}`));
          resolve(r.json());
        } catch (e) {
          reject(e);
        }
      });
      runQueue();
    });
  } catch (err) {
    console.warn("[KamiStream] Jikan failed, using AniList fallback:", (err as Error).message);
    return jikanToAL(endpoint);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AniList normaliser — output always matches Jikan's shape
// ─────────────────────────────────────────────────────────────────────────────
const AL_F = `id idMal title{romaji english} coverImage{large extraLarge medium}
  format episodes averageScore status seasonYear genres
  studios(isMain:true){nodes{name}}`;

function alShape(m: any) {
  return {
    mal_id:   m.idMal ?? m.id,
    title:    m.title?.english || m.title?.romaji || "Unknown",
    score:    m.averageScore ? +(m.averageScore / 10).toFixed(1) : null,
    episodes: m.episodes ?? null,
    type:     ({ TV: "TV", MOVIE: "Movie", OVA: "OVA", ONA: "ONA", SPECIAL: "Special" } as any)[m.format] || "TV",
    status:   ({ RELEASING: "Currently Airing", FINISHED: "Finished Airing", NOT_YET_RELEASED: "Not yet aired" } as any)[m.status] || "",
    year:     m.seasonYear ?? null,
    genres:   (m.genres || []).map((g: string) => ({ name: g })),
    studios:  (m.studios?.nodes || []).map((s: any) => ({ name: s.name })),
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
  };
}

async function alQuery(gql: string, vars: Record<string, any> = {}) {
  const r = await fetch(AL, {
    method:  "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body:    JSON.stringify({ query: gql, variables: vars }),
  });
  if (!r.ok) throw new Error("AniList error");
  const j = await r.json();
  if (j.errors) throw new Error(j.errors[0]?.message);
  return j;
}

async function alPage(
  vars: Record<string, any>,
  extraFilters = "",
  sort = "POPULARITY_DESC"
) {
  const d = await alQuery(
    `query($p:Int,$perPage:Int){Page(page:$p,perPage:$perPage){
      pageInfo{currentPage lastPage hasNextPage}
      media(type:ANIME,isAdult:false,sort:${sort}${extraFilters}){${AL_F}}
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
  "8": "Drama", "10": "Fantasy", "13": "Historical", "14": "Horror",
  "17": "Martial Arts", "18": "Mecha", "19": "Music", "22": "Romance",
  "23": "School", "24": "Sci-Fi", "25": "Shoujo", "27": "Shounen",
  "29": "Space", "30": "Sports", "36": "Slice of Life", "37": "Supernatural",
  "38": "Military", "40": "Psychological", "41": "Thriller", "42": "Seinen",
  "43": "Josei", "66": "Isekai", "79": "Reincarnation", "85": "Super Power",
  "86": "Survival",
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

  const page     = parseInt(p.get("page")     || "1");
  const limit    = parseInt(p.get("limit")    || "24");
  const q        = p.get("q")       || "";
  const genres   = p.get("genres")  || "";
  const type     = p.get("type")    || "";
  const status   = p.get("status")  || "";
  const letter   = p.get("letter")  || "";
  const minScore = p.get("min_score") || "";
  const orderBy  = p.get("order_by") || "popularity";
  const sort     = p.get("sort")    || "desc";
  const filter   = p.get("filter")  || "";

  let alSort = "POPULARITY_DESC";
  if (filter === "airing")    alSort = "TRENDING_DESC";
  else if (filter === "favorite") alSort = "FAVOURITES_DESC";
  else {
    const key = `${orderBy}-${sort}`;
    alSort = SORT_MAP[key] || "POPULARITY_DESC";
  }

  const filters: string[] = [];
  if (q)        filters.push(`,search:"${q.replace(/"/g, "")}"`);
  if (letter)   filters.push(`,search:"${letter}"`);
  if (genres)   { const g = GENRE_MAP[genres]; if (g) filters.push(`,genre:"${g}"`); }
  if (type)     { const f = FORMAT_MAP[type.toLowerCase()]; if (f) filters.push(`,format:${f}`); }
  if (status)   { const s = STATUS_MAP[status]; if (s) filters.push(`,status:${s}`); }
  if (filter === "airing") filters.push(",status:RELEASING");
  if (minScore) filters.push(`,averageScore_greater:${Math.round(parseFloat(minScore) * 10)}`);

  return alPage({ page, limit }, filters.join(""), alSort);
}
