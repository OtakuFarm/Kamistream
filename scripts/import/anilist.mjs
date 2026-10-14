/* ============================================================================
 * ANILIST BULK FETCHER — the primary metadata source.
 *
 * ── WHY ANILIST, NOT JIKAN ────────────────────────────────────────────────
 * Measured live while building this, back to back, for the same 3 titles:
 *
 *     Jikan:     ok=0  fail=3        (504 on every one)
 *     AniList:   ok=1  "Cowboy Bebop" (answered immediately)
 *
 * Jikan's free REST tier is heavily loaded and was returning 504 for
 * stretches of minutes. AniList, a single GraphQL endpoint, kept
 * answering throughout. It is also dramatically cheaper: 50 titles per
 * request instead of one, so a 2,000-title import is ~40 calls rather
 * than 2,000.
 *
 * This inverts the build pipeline, which already treats AniList as its
 * fallback for exactly this reason. MAL is still imported - just for the
 * two things only it has, and tolerantly, because a missing MAL score is
 * not a reason to lose the title.
 *
 * ── WHAT EACH SOURCE SUPPLIES ─────────────────────────────────────────────
 *   AniList  everything: title, description, poster, banner, score,
 *            popularity, genres, studios, format, season, relations,
 *            trailer, air dates
 *   MAL/Jikan only: mal_score, mal_rank, and the episode list
 * ========================================================================= */

const ENDPOINT = 'https://graphql.anilist.co';

/** AniList allows ~90 req/min but degrades well below that; 50 titles
 *  per call means even a 2,000-title import stays well inside it. */
const BATCH = 50;

/** Everything we store, in one query. Kept deliberately small — asking
 *  for less is what keeps the endpoint fast and reliable. */
const MEDIA_FIELDS = `
  id idMal
  title { english romaji native }
  description(asHtml: false)
  coverImage { extraLarge large color }
  bannerImage
  averageScore meanScore popularity favourites
  episodes duration format status season seasonYear
  startDate { year month day } endDate { year month day }
  genres
  studios(isMain: true) { nodes { name } }
  synonyms
  isAdult
  trailer { site id }
  relations {
    edges {
      relationType(version: 2)
      node { id idMal }
    }
  }`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** AniList's relation vocabulary -> ours. Same map the normaliser uses. */
const RELATION_MAP = {
  PREQUEL: 'prequel',
  SEQUEL: 'sequel',
  PARENT: 'parent',
  SIDE_STORY: 'side_story',
  SUMMARY: 'summary',
  ALTERNATIVE: 'alternative',
  SPIN_OFF: 'side_story',
  OTHER: 'side_story',
};

/** id -> media, or null on failure. Never throws: a failed batch must not
 *  take the import down, and the caller can fall back per title. */
export async function fetchAniListByMalIds(malIds, { retries = 3 } = {}) {
  const out = new Map();
  const ids = [...new Set(malIds.map(Number).filter(Number.isInteger))];
  if (!ids.length) return out;

  const query = `query($ids:[Int]){
    Page(page:1, perPage:${BATCH}){
      media(type:ANIME, id_in:$ids){ ${MEDIA_FIELDS} }
    }
  }`;

  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    let got = false;

    for (let attempt = 1; attempt <= retries && !got; attempt++) {
      try {
        const res = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ query, variables: { ids: chunk } }),
          signal: AbortSignal.timeout(30000),
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const json = await res.json();
        const media = json?.data?.Page?.media ?? [];
        for (const m of media) if (m?.idMal) out.set(m.idMal, m);
        got = true;
      } catch (err) {
        if (attempt === retries) {
          console.error('  ! AniList chunk ' + (i / BATCH + 1) + ' failed after '
            + retries + ' tries: ' + err.message);
        } else {
          await sleep(1500 * attempt);
        }
      }
    }

    if (i + BATCH < ids.length) await sleep(700);
  }

  return out;
}

/* ── shaping ──────────────────────────────────────────────────────────── */

function toDate(d) {
  if (!d || !d.year) return null;
  const m = String(d.month ?? 1).padStart(2, '0');
  const day = String(d.day ?? 1).padStart(2, '0');
  const s = `${d.year}-${m}-${day}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function durationMinutes(d) {
  if (!d) return null;
  const n = Number(d);
  return Number.isFinite(n) && n > 0 && n < 600 ? n : null;
}

/**
 * AniList media -> the same normalised shape normalize.mjs produces.
 *
 * The slug deliberately uses the ROMAJI title, matching the canonical MAL
 * title the live site's URLs already use: /anime/sousou-no-frieren, not
 * frieren-beyond-journeys-end. Deriving it from the English name would
 * rename every indexed URL on the first import.
 */
export function normalizeFromAniList(m) {
  if (!m?.idMal) return null;

  const display = (m.title?.english || m.title?.romaji || m.title?.native || '').trim();
  if (!display) return null;

  const slugSource = m.title?.romaji || m.title?.native || m.title?.english || display;
  const slug = slugify(slugSource) || slugify(display);
  if (!slug) return null;

  // AniList descriptions are prose with occasional [bracket] asides and
  // stray wiki markup. Same treatment as the MAL synopsis cleaner.
  const synopsis = String(m.description || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\[Written by MAL Rewrite\]/gi, '')
    .replace(/\[Source: MAL Rewrite\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  const poster = m.coverImage?.extraLarge || m.coverImage?.large || null;
  const started = toDate(m.startDate);
  const ended = toDate(m.endDate);

  return {
    slug,
    title: display,
    title_romaji: m.title?.romaji || null,
    title_japanese: m.title?.native || null,
    mal_id: Number(m.idMal),

    synopsis: synopsis || null,
    poster_url: poster,
    banner_url: m.bannerImage || null,
    trailer_id: m.trailer?.site === 'youtube' && m.trailer?.id ? String(m.trailer.id) : null,

    type: m.format ? String(m.format).toUpperCase() : null,
    source: null,                       // MAL only
    air_status: m.status === 'RELEASING' ? 'Currently Airing'
              : m.status === 'FINISHED' ? 'Finished Airing'
              : m.status === 'NOT_YET_RELEASED' ? 'Not yet aired'
              : m.status || null,
    season: m.season ? String(m.season).toLowerCase() : null,
    year: m.seasonYear || (m.startDate?.year ?? null),

    genres: (m.genres || []).slice(),
    themes: [],
    studios: (m.studios?.nodes || []).map((s) => s.name).filter(Boolean),

    episodes_total: Number.isInteger(m.episodes) ? m.episodes : null,
    duration_min: durationMinutes(m.duration),
    age_rating: null,                   // MAL only
    aired_from: started,
    aired_to: ended,

    // AniList scores are already 0-100, same scale as MAL's.
    rating: null,                       // OURS — never auto-filled from either
    mal_score: null,                    // filled from MAL if it is reachable
    mal_rank: null,
    popularity: Number.isInteger(m.popularity) ? m.popularity : null,
    favorites: Number.isInteger(m.favourites) ? m.favourites : null,
    mal_popularity: Number.isInteger(m.popularity) ? m.popularity : null,
    mean_score: Number.isInteger(m.meanScore) ? m.meanScore / 10 : null,

    has_poster: Boolean(poster),
    has_synopsis: synopsis.length >= 200,
    has_episodes: false,                 // set once episodes are attached

    relations: (m.relations?.edges || [])
      .map((e) => {
        const kind = RELATION_MAP[e?.relationType];
        const to = e?.node?.idMal;
        return kind && to ? { toMalId: Number(to), kind } : null;
      })
      .filter(Boolean),
  };
}

function slugify(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}