import { useQuery } from '@tanstack/react-query';
import { slugifyTitle } from '@/lib/seo';
import { enqueue } from '@/lib/rateLimit';
import type {
  JikanAnime,
  JikanEpisode,
  JikanPaginatedResponse,
  JikanSingleResponse,
  JikanCharacter,
  JikanRecommendation,
} from '@/types';

const BASE_URL = 'https://api.jikan.moe/v4';

// ─────────────────────────────────────────────────────────────────────────────
// Core fetch helper — retries once on 429 with back-off
// Jikan has NO hard timeout upstream, so every fetch here races against
// `JIKAN_TIMEOUT_MS`. Without this a single stalled Jikan connection holds
// its queue slot forever and every page behind it (cards, detail, browse)
// waits 20s+ before the AniList fallback can fire.
// ─────────────────────────────────────────────────────────────────────────────
const JIKAN_TIMEOUT_MS = 6000;

function fetchWithTimeout(url: string, init: RequestInit = {}, ms = JIKAN_TIMEOUT_MS): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

export const fetchJikan = async <T>(endpoint: string): Promise<T> => {
  return enqueue(async () => {
    const res = await fetchWithTimeout(`${BASE_URL}${endpoint}`);

    if (res.status === 429) {
      // Back off and try once more through the queue
      await new Promise(r => setTimeout(r, 1500));
      const retry = await fetchWithTimeout(`${BASE_URL}${endpoint}`);
      if (!retry.ok) throw new Error(`Jikan error (retry): ${retry.status}`);
      return retry.json() as Promise<T>;
    }

    if (!res.ok) throw new Error(`Jikan error: ${res.status}`);
    return res.json() as Promise<T>;
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// Fetch ALL episode pages with retry on rate-limit (429)
//
// Bounded on purpose: long runners (One Piece, Naruto…) have 100+ Jikan
// episode pages and each page costs a queued request + 400ms pacing. Past
// MAX_EP_PAGES we stop paging — the detail page already derives the full
// episode count from /anime/:id/full and renders numbered stubs for the
// rest, so nobody ever waits on page 47 of an episode list.
// ─────────────────────────────────────────────────────────────────────────────
const MAX_EP_PAGES = 12; // 12 × 100 = 1200 episodes — covers everything real

const fetchAllEpisodes = async (malId: number | string): Promise<{ data: JikanEpisode[] }> => {
  let page = 1;
  let allEpisodes: JikanEpisode[] = [];
  let hasNextPage = true;
  let retries = 0;

  while (hasNextPage && page <= MAX_EP_PAGES) {
    const res = await enqueue(() =>
      fetchWithTimeout(`${BASE_URL}/anime/${malId}/episodes?page=${page}`)
    );

    if (res.status === 429) {
      if (retries >= 3) break;
      retries++;
      await new Promise(r => setTimeout(r, 1500 * retries));
      continue;
    }

    if (!res.ok) break;
    retries = 0;

    const data = await res.json() as JikanPaginatedResponse<JikanEpisode>;
    const eps = data?.data || [];

    if (eps.length === 0) break;

    allEpisodes = [...allEpisodes, ...eps];
    hasNextPage = data?.pagination?.has_next_page === true;
    page++;

    if (hasNextPage) await new Promise(r => setTimeout(r, 400));
  }

  // If Jikan has no episode list, generate numbered episodes from anime details
  if (allEpisodes.length === 0) {
    const detail = await fetchJikan<JikanSingleResponse<JikanAnime>>(`/anime/${malId}`);
    const count = detail?.data?.episodes;
    if (count && count > 0) {
      allEpisodes = Array.from({ length: count }, (_, i): JikanEpisode => ({
        mal_id: i + 1,
        title: `Episode ${i + 1}`,
        title_japanese: null,
        title_romanji: null,
        aired: null,
        score: null,
        filler: false,
        recap: false,
      }));
    }
  }

  return { data: allEpisodes };
};

// ─────────────────────────────────────────────────────────────────────────────
// AniList helpers (inline — avoids circular imports)
// AniList normalises into the same Jikan shape so components work unchanged.
// ─────────────────────────────────────────────────────────────────────────────
const AL_TIMEOUT_MS = 8000;

async function queryAL(query: string, vars: Record<string, any> = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), AL_TIMEOUT_MS);
  try {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables: vars }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error('AniList error');
    const json = await res.json();
    if (json.errors) throw new Error(json.errors[0]?.message);
    return json;
  } finally {
    clearTimeout(timer);
  }
}

const AL_FIELDS = `id idMal title{romaji english native} coverImage{large extraLarge medium}
  bannerImage trailer{id site thumbnail} format episodes duration averageScore meanScore
  popularity favourites rankings{rank type allTime} status season seasonYear startDate{year month day}
  endDate{year month day} genres synonyms source studios(isMain:true){nodes{name}}
  description(asHtml:false)`;

function fmtDate(d: any): string | null {
  if (!d?.year) return null;
  const m = String(d.month || 1).padStart(2, '0');
  const day = String(d.day || 1).padStart(2, '0');
  return `${d.year}-${m}-${day}T00:00:00+00:00`;
}

function fmtSeason(season?: string, year?: number | null): string | null {
  if (!season) return year ? String(year) : null;
  const s = season.charAt(0) + season.slice(1).toLowerCase();
  return year ? `${s} ${year}` : s;
}

function alToJikan(m: any) {
  const ytId = m.trailer?.site === 'youtube' ? (m.trailer?.id || null) : null;
  return {
    mal_id:   m.idMal ?? m.id,
    title:    m.title?.english || m.title?.romaji || 'Unknown',
    title_english: m.title?.english || null,
    title_japanese: m.title?.native || null,
    score:    m.averageScore ? +(m.averageScore / 10).toFixed(1) : null,
    scored_by: m.popularity ?? null,
    rank:     m.rankings?.find((r: any) => r.allTime && r.type === 'RATED')?.rank
      ?? m.rankings?.[0]?.rank ?? null,
    popularity: m.popularity ?? null,
    members:  m.popularity ?? null,
    favorites: m.favourites ?? null,
    episodes: m.episodes ?? null,
    duration: m.duration ? `${m.duration} min per ep` : null,
    type:     ({ TV:'TV',TV_SHORT:'TV',MOVIE:'Movie',OVA:'OVA',ONA:'ONA',SPECIAL:'Special',MUSIC:'Music' } as any)[m.format] || 'TV',
    source:   m.source ? m.source.charAt(0) + m.source.slice(1).toLowerCase().replace(/_/g, ' ') : null,
    status:   ({ RELEASING:'Currently Airing',FINISHED:'Finished Airing',NOT_YET_RELEASED:'Not yet aired',CANCELLED:'Cancelled',HIATUS:'On Hiatus' } as any)[m.status] || '',
    airing:   m.status === 'RELEASING',
    aired:    { from: fmtDate(m.startDate), to: fmtDate(m.endDate), string: [fmtSeason(m.season, m.seasonYear), fmtDate(m.startDate)?.slice(0, 10)].filter(Boolean).join(' ') || null },
    season:   (m.season || '').toLowerCase() || null,
    year:     m.seasonYear ?? null,
    broadcast: null,
    rating:   null,
    synopsis: m.description?.replace(/<[^>]+>/g,'') ?? null,
    background: null,
    genres:   (m.genres||[]).map((g:string)=>({name:g})),
    studios:  (m.studios?.nodes||[]).map((s:any)=>({name:s.name})),
    trailer:  ytId ? { youtube_id: ytId, images: { maximum_image_url: m.trailer?.thumbnail || '' } } : null,
    images: {
      webp: { large_image_url: m.coverImage?.extraLarge||m.coverImage?.large||'', image_url: m.coverImage?.medium||'', small_image_url: m.coverImage?.medium||'' },
      jpg:  { large_image_url: m.coverImage?.extraLarge||m.coverImage?.large||'', image_url: m.coverImage?.medium||'', small_image_url: m.coverImage?.medium||'' },
    },
    // AniList banner for hero sections (components that know to look for it)
    _bannerImage: m.bannerImage ?? null,
    _alId: m.id,
  };
}

async function alPage(query: string, vars: Record<string,any>) {
  const d = await queryAL(query, vars);
  const pg = d.data.Page;
  return {
    data: pg.media.map(alToJikan),
    pagination: { current_page: pg.pageInfo.currentPage, last_visible_page: pg.pageInfo.lastPage, has_next_page: pg.pageInfo.hasNextPage },
  };
}

// withALFallback — AniList-first with Jikan as the safety net.
//
// Jikan was the primary and AniList the rescue path, but measured live
// (Oct 2026) Jikan stalls 20s+ while AniList answers in ~1s. Waiting for
// Jikan first meant every card grid and detail page waited out the stall
// before the fallback could fire.
//
// New behaviour: try AniList first. It owns a short head-start window
// (AL_HEAD_START_MS) — if it resolves in time its data wins immediately.
// Otherwise fall through to Jikan. The page never waits longer than the
// head-start window plus one healthy upstream round-trip, and we never
// fire both upstreams at once (no doubled load on an already-struggling
// Jikan — the old background-warm idea is deliberately gone).
const AL_HEAD_START_MS = 3500;

export async function withALFallback<T>(jikanFn: () => Promise<T>, anilistFn: () => Promise<T>): Promise<T> {
  // Race AniList against the head-start timer. NOTE: the timer does NOT
  // cancel the AniList request itself — it only decides which branch we
  // await. Letting the late AniList response land in the HTTP cache still
  // helps the next mount.
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('AniList head-start window elapsed')), AL_HEAD_START_MS)
  );

  try {
    return await Promise.race([anilistFn(), timeout]);
  } catch (alErr) {
    // AniList slow/failed — fall through to Jikan as the safety net.
    try {
      return await jikanFn();
    } catch (jikanErr) {
      console.warn('[KamiStream] Both sources failed. AniList:', (alErr as Error)?.message, '| Jikan:', (jikanErr as Error)?.message);
      throw jikanErr;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Hooks — AniList-first via withALFallback (answers ~1s); Jikan is the timed
// safety net for its richer fields. Every component keeps working unchanged.
// ─────────────────────────────────────────────────────────────────────────────

export const useTrendingAnime = () =>
  useQuery({
    queryKey: ['anime', 'trending'],
    queryFn: () => withALFallback(
      () => fetchJikan('/top/anime?filter=airing&limit=20&sfw=true'),
      () => alPage(
        `query($p:Int){Page(page:$p,perPage:20){pageInfo{currentPage lastPage hasNextPage}media(type:ANIME,sort:TRENDING_DESC,status:RELEASING,isAdult:false){${AL_FIELDS}}}}`,
        { p: 1 }
      )
    ),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

export const useTopRatedAnime = () =>
  useQuery({
    queryKey: ['anime', 'top-rated'],
    queryFn: () => withALFallback(
      () => fetchJikan('/top/anime?filter=bypopularity&limit=20&sfw=true'),
      () => alPage(
        `query($p:Int){Page(page:$p,perPage:20){pageInfo{currentPage lastPage hasNextPage}media(type:ANIME,sort:SCORE_DESC,isAdult:false){${AL_FIELDS}}}}`,
        { p: 1 }
      )
    ),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

export const useSeasonalAnime = () => {
  const now = new Date();
  const m = now.getMonth();
  const season = m < 3 ? 'WINTER' : m < 6 ? 'SPRING' : m < 9 ? 'SUMMER' : 'FALL';
  const year = now.getFullYear();
  return useQuery({
    queryKey: ['anime', 'seasonal'],
    queryFn: () => withALFallback(
      () => fetchJikan('/seasons/now?limit=20&sfw=true'),
      () => alPage(
        `query($p:Int,$s:MediaSeason,$y:Int){Page(page:$p,perPage:20){pageInfo{currentPage lastPage hasNextPage}media(type:ANIME,season:$s,seasonYear:$y,sort:POPULARITY_DESC,isAdult:false){${AL_FIELDS}}}}`,
        { p: 1, s: season, y: year }
      )
    ),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
};

export const useAnimeSearch = (query: string) =>
  useQuery({
    queryKey: ['anime', 'search', query],
    queryFn: () => withALFallback(
      () => fetchJikan(`/anime?q=${encodeURIComponent(query)}&limit=20&sfw=true`),
      () => alPage(
        `query($p:Int,$q:String){Page(page:$p,perPage:20){pageInfo{currentPage lastPage hasNextPage}media(type:ANIME,search:$q,sort:POPULARITY_DESC,isAdult:false){${AL_FIELDS}}}}`,
        { p: 1, q: query }
      )
    ),
    enabled: !!query,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

export const useAnimeDetail = (malId: number | string) =>
  useQuery({
    queryKey: ['anime', malId],
    queryFn: async () => {
      if (/^\d+$/.test(String(malId))) {
        return withALFallback(
          () => fetchJikan(`/anime/${malId}/full`),
          async () => {
            const d = await queryAL(
              `query($m:Int){Media(idMal:$m,type:ANIME){${AL_FIELDS}
                relations{edges{relationType(version:2) node{id idMal title{english romaji} coverImage{large} format episodes status}}}
              }}`,
              { m: Number(malId) }
            );
            return { data: alToJikan(d.data.Media) };
          }
        );
      }
      // Title-only public URL: resolve the slug through progressively broader
      // searches. A descriptive slug may contain a season label that the
      // upstream title omits (for example, "Mushoku Tensei ... Season 3"),
      // so relying on one exact full-title query can incorrectly return no
      // match.
      const rawTitle = String(malId).replace(/-/g, ' ');
      const rawWords = rawTitle.replace(/[^a-z0-9\s]/gi, ' ').split(/\s+/).filter(Boolean);
      const shortTitle = rawWords.slice(0, 2).join(' ');
      const baseWords = rawWords.filter(word => !/^(?:season|s2|s3|2nd|3rd)$/i.test(word)).slice(0, 3).join(' ');
      const normalizeRequestSlug = (value: string) => value
        .replace(/^pokoki(?:-|$)/, 'pokeoki');
      const normalizedRequest = normalizeRequestSlug(String(malId));
      const normalizedTitle = normalizedRequest.replace(/-/g, ' ');
      const queries = Array.from(new Set([
        rawTitle,
        normalizedTitle,
        rawTitle.replace(/\s+(?:season\s+\d+|\d+(?:st|nd|rd|th)\s+season)\b/gi, '').trim(),
        normalizedTitle.replace(/\s+(?:season\s+\d+|\d+(?:st|nd|rd|th)\s+season)\b/gi, '').trim(),
        rawTitle.split(':')[0].trim(),
        shortTitle,
        baseWords,
      ].filter(Boolean)));

      // NOTE: this search is deliberately NOT sent with Jikan's `sfw` flag
      // (nor AniList's `isAdult:false`).
      //
      // `sfw` is a listing filter, not a title filter, but Jikan applies it to
      // search too: querying "Redo of Healer" (a title the user just clicked
      // in /genre/9 Ecchi) returned only titles it considered safe, so the
      // exact match was missing from the candidate list. The resolver then
      // fell through to the fuzzy word-overlap score below, where the only
      // shared word is "Redo" — and "Evangelion: 3.0 You Can (Not) Redo"
      // (far more popular, scored by overlap tie-break) won. The card showed
      // one title and the detail page rendered another.
      //
      // The user reached this URL from a link we generated ourselves, so the
      // slug is trustworthy input; there is no discovery surface to protect
      // here. Adult titles stay out of /browse and /genre listings.
      let candidates: JikanAnime[] = [];
      for (const query of queries) {
        const result = await withALFallback(
          () => fetchJikan<JikanPaginatedResponse<JikanAnime>>(`/anime?q=${encodeURIComponent(query)}&limit=10`),
          () => alPage(
            `query($p:Int,$q:String){Page(page:$p,perPage:10){pageInfo{currentPage lastPage hasNextPage}media(type:ANIME,search:$q,sort:POPULARITY_DESC){${AL_FIELDS}}}}`,
            { p: 1, q: query }
          )
        );
        candidates = candidates.concat(result?.data || []).filter((candidate, index, all) => all.findIndex(c => c.mal_id === candidate.mal_id) === index);
        if (candidates.some(a => [a.title, (a as any).title_english, (a as any).title_romanji]
          .filter(Boolean).some(value => slugifyTitle(value) === normalizedRequest))) break;
      }

      const requested = String(malId);
      // A few provider titles are commonly mistyped in shared links. Keep
      // this deliberately narrow: only the known Pocky & Rocky spelling
      // variants are aliased, and the canonical upstream slug remains intact.
      const requestWords = new Set(normalizedRequest.split('-'));
      const match = candidates.find((a: JikanAnime) => {
        const names = [a.title, (a as any).title_english, (a as any).title_romanji].filter(Boolean);
        return names.some(value => slugifyTitle(value) === normalizedRequest);
      }) || candidates.sort((a, b) => {
        const score = (anime: JikanAnime) => {
          const names = [anime.title, (anime as any).title_english, (anime as any).title_romanji]
            .filter(Boolean).map(slugifyTitle).join(' ');
          const words = new Set(names.split('-'));
          const overlap = [...requestWords].filter(word => words.has(word)).length;
          // `names` is slugified (`season-3`), so the URL-safe token must be
          // compared explicitly. Otherwise a season-specific slug can select
          // the first popular result from the same series.
          const requestedSeason = rawTitle.match(/\bseason\s+(\d+)\b|\b(\d+)(?:st|nd|rd|th)\s+season\b/i);
          const candidateSeason = names.match(/\bseason-(\d+)\b|\b(\d+)(?:st|nd|rd|th)-season\b/i);
          const season = requestedSeason && candidateSeason
            && (requestedSeason[1] || requestedSeason[2]) === (candidateSeason[1] || candidateSeason[2])
            ? 100 : 0;
          return season + overlap;
        };
        return score(b) - score(a);
      })[0];
      // Guard the fuzzy tier. Previously ANY candidate won, so a slug whose
      // words barely appear in some unrelated title silently rendered the
      // wrong anime (card = Redo of Healer, page = Evangelion ... Redo).
      // A word-overlap match of 2+ is trustworthy; a single shared word is
      // not, so a one-word slug must match exactly, and a multi-word slug that
      // only shares one word is a miss rather than a wrong page.
      if (match) {
        const names = [match.title, (match as any).title_english, (match as any).title_romanji]
          .filter(Boolean).map(slugifyTitle).join(' ').split('-');
        const words = new Set(names);
        const overlap = [...requestWords].filter(word => words.has(word)).length;
        const required = requestWords.size <= 1 ? 1 : 2;
        if (overlap < required) throw new Error('Anime not found');
      }
      if (!match?.mal_id) throw new Error('Anime not found');
      return useAnimeDetailFallback(match.mal_id);
    },
    enabled: !!malId,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

async function useAnimeDetailFallback(malId: number | string) {
  return withALFallback(
    () => fetchJikan(`/anime/${malId}/full`),
    async () => {
      const d = await queryAL(
        `query($m:Int){Media(idMal:$m,type:ANIME){${AL_FIELDS}
          relations{edges{relationType(version:2) node{id idMal title{english romaji} coverImage{large} format episodes status}}}
        }}`,
        { m: Number(malId) }
      );
      return { data: alToJikan(d.data.Media) };
    }
  );
}

export const useAnimeEpisodes = (malId: number | string) =>
  useQuery<{ data: JikanEpisode[] }>({
    queryKey: ['anime', malId, 'episodes', 'all'],
    queryFn: () => withALFallback(
      () => fetchAllEpisodes(malId),
      // AniList doesn't have episode lists — generate numbered stubs
      async () => {
        const d = await queryAL(
          `query($m:Int){Media(idMal:$m,type:ANIME){episodes nextAiringEpisode{episode}}}`,
          { m: Number(malId) }
        );
        const count = d.data?.Media?.episodes || d.data?.Media?.nextAiringEpisode?.episode || 0;
        return {
          data: Array.from({ length: count }, (_, i): JikanEpisode => ({
            mal_id: i + 1, title: `Episode ${i + 1}`,
            title_japanese: null, title_romanji: null,
            aired: null, score: null, filler: false, recap: false,
          })),
        };
      }
    ),
    enabled: !!malId,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

export const useAnimeRecommendations = (malId: number | string) =>
  useQuery({
    queryKey: ['anime', malId, 'recommendations'],
    queryFn: () => withALFallback(
      () => fetchJikan(`/anime/${malId}/recommendations`),
      async () => {
        const d = await queryAL(
          `query($m:Int){Media(idMal:$m,type:ANIME){recommendations(perPage:12){nodes{mediaRecommendation{${AL_FIELDS}}}}}}`,
          { m: Number(malId) }
        );
        const recs = d.data?.Media?.recommendations?.nodes || [];
        return {
          data: recs
            .filter((r: any) => r.mediaRecommendation)
            .map((r: any) => ({ entry: alToJikan(r.mediaRecommendation), votes: 0 })),
        };
      }
    ),
    enabled: !!malId,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

export const useAnimeByGenre = (genreId: string) => {
  const GENRE_MAP: Record<string, string> = {
    '1':'Action','2':'Adventure','4':'Comedy','8':'Drama','10':'Fantasy',
    '22':'Romance','24':'Sci-Fi','36':'Slice of Life','30':'Sports',
    '37':'Supernatural','41':'Thriller',
  };
  return useQuery({
    queryKey: ['anime', 'genre', genreId || 'all'],
    queryFn: () => withALFallback(
      () => fetchJikan(genreId
        ? `/anime?genres=${genreId}&order_by=popularity&limit=24&sfw=true`
        : `/top/anime?limit=24&sfw=true`
      ),
      () => alPage(
        genreId
          ? `query($p:Int,$g:String){Page(page:$p,perPage:24){pageInfo{currentPage lastPage hasNextPage}media(type:ANIME,genre:$g,sort:POPULARITY_DESC,isAdult:false){${AL_FIELDS}}}}`
          : `query($p:Int){Page(page:$p,perPage:24){pageInfo{currentPage lastPage hasNextPage}media(type:ANIME,sort:POPULARITY_DESC,isAdult:false){${AL_FIELDS}}}}`,
        genreId ? { p: 1, g: GENRE_MAP[genreId] || genreId } : { p: 1 }
      )
    ),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
};
