/* ============================================================================
 * NORMALIZE — the single mapping layer between MAL/AniList and our schema.
 *
 * WHY THIS FILE EXISTS
 *   Nothing should ever write a raw API payload into the database. Storing
 *   Jikan's shape means the database inherits Jikan's field names, its null
 *   conventions and its occasional renames, and every consumer then has to
 *   know them. Storing OUR shape means a re-import two years from now is a
 *   diff we can read, not a migration.
 *
 *   It is also what makes re-import safe. importOne() compares the incoming
 *   normalised row against the stored one and returns only the fields that
 *   actually changed, so the admin can show "MAL rewrote the synopsis" and
 *   "3 new episodes" instead of silently overwriting edits.
 *
 *   The naming rules here (slugify, clampText) MUST match src/lib/seo.ts and
 *   src/lib/routes.js, or a URL written by the importer will disagree with
 *   the canonical the runtime emits.
 * ========================================================================= */

/** URL-safe slug. MUST match slugifyTitle() in src/lib/seo.ts. */
export function slugifyTitle(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

/** Meta-description clamp. MUST match clampText() in src/lib/routes.js. */
export function clampText(text, max = 158) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return (sp > 60 ? cut.slice(0, sp) : cut).trimEnd() + '…';
}

/**
 * Clean a Jikan synopsis.
 *
 * MyAnimeList appends editorial credits to most synopses ("[Written by MAL
 * Rewrite]", "Source: MAL Rewrite"). Those are not part of the story, they
 * are noise, and leaving them in costs real characters in a 158-char meta
 * description that competes with the actual premise.
 */
export function cleanSynopsis(raw) {
  return String(raw || '')
    .replace(/\[Written by MAL Rewrite\]/gi, '')
    .replace(/\[Source: MAL Rewrite\]/gi, '')
    .replace(/^\s*Source:\s*MAL Rewrite\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "2024-07-06" -> 7, but only for a plausible year. */
function toYear(s) {
  if (!s) return null;
  const y = Number(String(s).slice(0, 4));
  return Number.isInteger(y) && y >= 1900 && y <= 2999 ? y : null;
}

/** Winter/ spring / summer / fall from a month. Used for the year pages. */
function toSeason(dateStr) {
  if (!dateStr) return null;
  const m = Number(String(dateStr).slice(5, 7));
  if (!Number.isInteger(m) || m < 1 || m > 12) return null;
  if (m <= 3) return 'winter';
  if (m <= 6) return 'spring';
  if (m <= 9) return 'summer';
  return 'fall';
}

/** Jikan gives "24 min per ep"; we want the number. */
function toDuration(raw) {
  if (raw == null) return null;
  const m = String(raw).match(/(\d+)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 && n < 600 ? n : null;
}

function toDate(v) {
  if (!v) return null;
  const s = String(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}
/* ─── relations: MAL -> our vocabulary ────────────────────────────────────
 * AniList's relationType is a controlled vocabulary; we store a small,
 * stable set so the "anime like X" page can group by intent.
 */
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

export function normalizeRelations(edges) {
  const out = [];
  for (const e of edges || []) {
    const kind = RELATION_MAP[e?.relationType];
    const toId = e?.node?.id;
    if (!kind || !toId) continue;
    out.push({ toMalId: Number(toId), kind });
  }
  return out;
}

/**
 * Normalise a Jikan + AniList pair into the shape anime_catalogue expects.
 *
 * @param {object} jikan  https://api.jikan.moe/v4/anime/{id}
 * @param {object} al     AniList Media (may be null if that lookup failed)
 * @returns {object|null} null when the payload is unusable
 */
export function normalizeAnime(jikan, al) {
  if (!jikan?.mal_id) return null;

  // Jikan returns the title in TWO different shapes depending on the
  // endpoint, and getting this wrong silently produces a null title:
  //   /anime/{id}        -> title: { english, japanese, romaji }
  //   /anime/{id}/full   -> title: "Sousou no Frieren"  (a plain string,
  //                        alongside title_english / title_japanese / title_romaji)
  // The importer fetches /full, so the string form is the one that matters,
  // but both are accepted so the same normaliser can be used against a
  // cached payload from either endpoint.
  const t = jikan.title;
  const titleObj = (t && typeof t === 'object')
    ? t
    : { english: jikan.title_english, japanese: jikan.title_japanese, romaji: jikan.title_romaji };

  // The DISPLAY title is the English one when MAL has it, matching
  // titleOf() in src/lib/animeLike.js.
  const display = (titleObj.english || titleObj.romaji || titleObj.japanese || '').trim();
  if (!display) return null;

  // The SLUG deliberately does NOT use the English title.
  //
  // The live site's indexed URLs are built from the canonical/romaji title:
  // Frieren's page is /anime/sousou-no-frieren, not /anime/frieren-beyond-
  // journeys-end. Deriving slugs from the English name would rename every
  // one of the ~200 URLs already in the sitemap and in Google's index, and
  // every external link to them would 404. MAL's `title` field is what the
  // current animePath() uses, so it is what we match.
  //
  // Once the catalogue is the source of truth, slug stops being derived at
  // all - it is whatever was stored at import time, and a rename writes a
  // 301. Matching today's behaviour here is what makes the first import
  // non-breaking.
  const slugSource = (typeof t === 'string' ? t : (titleObj.romaji || titleObj.japanese || titleObj.english)) || '';
  const slug = slugifyTitle(slugSource) || slugifyTitle(display);
  if (!slug) return null;

  const title = display;

  const synopsis = cleanSynopsis(jikan.synopsis);
  const poster = jikan.images?.jpg?.image_url
    || jikan.images?.webp?.image_url
    || null;
  const banner = al?.bannerImage || null;
  const trailerId = (al?.trailer?.site === 'youtube' && al?.trailer?.id)
    ? String(al.trailer.id) : null;

  const airedFrom = toDate(jikan.aired?.from);
  const airedTo = toDate(jikan.aired?.to);
  const year = toYear(jikan.aired?.from);

  return {
    // identity
    slug,
    title,
    title_romaji: titleObj.romaji || null,
    title_japanese: titleObj.japanese || null,
    mal_id: Number(jikan.mal_id),

    // content
    synopsis: synopsis || null,
    poster_url: poster,
    banner_url: banner,
    trailer_id: trailerId,

    // taxonomy (names only; relations are stored separately)
    type: jikan.type || null,
    source: jikan.source || null,
    air_status: jikan.status || null,
    season: toSeason(jikan.aired?.from),
    year,
    genres: (jikan.genres || [])
      .map(g => g?.name)
      .filter(Boolean),
    themes: (jikan.themes || []).map(t2 => t2?.name).filter(Boolean),
    studios: (jikan.studios || []).map(s => s?.name).filter(Boolean),

    // facts
    episodes_total: Number.isInteger(jikan.episodes) ? jikan.episodes : null,
    duration_min: toDuration(jikan.duration),
    age_rating: jikan.rating ? String(jikan.rating).split(' - ')[1] || null : null,
    aired_from: airedFrom,
    aired_to: airedTo,

    // scores: ours is deliberately null, MAL's is informational
    rating: null,
    mal_score: typeof jikan.score === 'number' ? jikan.score : null,
    mal_rank: Number.isInteger(jikan.rank) ? jikan.rank : null,
    popularity: Number.isInteger(jikan.members) ? jikan.members : null,
    favorites: Number.isInteger(jikan.favorites) ? jikan.favorites : null,

    // quality flags, recomputed by the caller once episodes are attached
    has_poster: Boolean(poster),
    has_synopsis: synopsis.length >= 200,
    has_episodes: false,

    relations: normalizeRelations(al?.relations?.edges),
  };
}

/**
 * Diff an incoming normalised row against what is stored.
 *
 * Only fields whose value actually changed are returned, and only when the
 * stored value looks machine-generated rather than hand-edited. That second
 * condition matters: the whole point of storing our own copy is that a human
 * can fix a title, and a blind re-import would silently undo that.
 *
 * @param {object} incoming  from normalizeAnime()
 * @param {object} stored    the existing DB row
 * @param {Set<string>} lockedFields  fields a human has edited
 */
export function diffAnime(incoming, stored, lockedFields = new Set()) {
  const changes = {};
  const TRACKED = [
    'title', 'title_romaji', 'title_japanese', 'synopsis', 'poster_url',
    'banner_url', 'trailer_id', 'type', 'source', 'air_status', 'season',
    'year', 'episodes_total', 'duration_min', 'age_rating', 'aired_from',
    'aired_to', 'mal_score', 'mal_rank', 'popularity', 'favorites',
  ];
  for (const f of TRACKED) {
    if (lockedFields.has(f)) continue;
    const a = incoming[f] ?? null;
    const b = stored[f] ?? null;
    if (a !== b) changes[f] = { from: b, to: a };
  }
  return Object.keys(changes).length ? changes : null;
}

/** Human-readable publish-readiness, for the admin's per-row badge. */
export function readiness(row) {
  const missing = [];
  if (!row.has_poster) missing.push('poster');
  if (!row.has_synopsis || (row.synopsis || '').trim().length < 200) missing.push('synopsis 200+ chars');
  if (!row.has_episodes) missing.push('episodes');
  return { ok: missing.length === 0, missing };
}