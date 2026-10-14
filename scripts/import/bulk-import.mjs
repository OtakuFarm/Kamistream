/* ============================================================================
 * BULK IMPORTER — go from 200 titles to thousands without a hand-listing ids.
 *
 * ── WHY ───────────────────────────────────────────────────────────────────
 * Traffic for an anime site is per-title: people search "watch <title>
 * online", so the number of catalogue entries IS the number of keyword
 * opportunities. 200 titles is 200 chances. 2,000 is 2,000.
 *
 * The old build could only prerender ~200 because the BUILD had to fetch
 * them from Jikan at 3 req/sec. Importing moves that cost to a one-off
 * local script, so the ceiling stops being a rate limit and becomes
 * however long you are willing to run it.
 *
 * ── HOW IT PICKS TITLES ───────────────────────────────────────────────────
 * Jikan's /anime?page=N returns 25 titles ordered by MAL id. Walking pages
 * from the bottom of the id space upward gives the OLDEST, most-established
 * titles first — which is deliberately the right order:
 *
 *   · they are the ones with real search volume ("one piece", "naruto")
 *   · they have full metadata and episode lists
 *   · they are what a new visitor is most likely to look for
 *
 * Jumping straight to the newest ids gives you 200 unreleased or obscure
 * titles nobody searches for, which is the trap in doing this.
 *
 * ── USAGE ─────────────────────────────────────────────────────────────────
 *   node scripts/import/bulk-import.mjs --pages 40
 *   node scripts/import/bulk-import.mjs --pages 40 --publish
 *   node scripts/import/bulk-import.mjs --from-page 1 --pages 10 --dry-run
 *   node scripts/import/bulk-import.mjs --pages 20 --no-episodes --no-posters
 *
 *   --pages 40  = 1000 titles (25 per page)
 *
 * The script is RESUMABLE: it skips ids already in anime_catalogue, so
 * re-running it continues where it stopped rather than starting over.
 * ========================================================================= */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

import { animePage, animeFull, animeEpisodes } from './jikan.mjs';
import { fetchAniListByMalIds, normalizeFromAniList } from './anilist.mjs';
import { storePoster, verifyBucket } from './posters.mjs';
// normalizeAnime is imported rather than only dynamically loaded: ensureRef()
// needs slugifyTitle on the MAL fallback path, while normalizeFromAniList
// covers the AniList path. Dropping slugifyTitle here made every MAL-fallback
// title fail with "slugifyTitle is not defined".
import { normalizeAnime, slugifyTitle, readiness } from './normalize.mjs';

const ANILIST = 'https://graphql.anilist.co';

const argv = process.argv.slice(2);
const flag = (n, d = null) => {
  const i = argv.indexOf('--' + n);
  if (i === -1) return d;
  const v = argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
};
const has = (n) => argv.includes('--' + n);

const DRY_RUN    = has('dry-run');
const PUBLISH    = has('publish');
const NO_EPISODES= has('no-episodes');
const NO_POSTERS = has('no-posters');
const NO_MAL     = has('no-mal');
const FROM_PAGE  = Number(flag('from-page', 1));
const PAGES      = Number(flag('pages', 20));
const MAX_TITLES = Number(flag('limit', 99999));

function env(...names) {
  for (const n of names) if (process.env[n]) return process.env[n];
  return null;
}
const URL_ = env('SUPABASE_URL', 'VITE_SUPABASE_URL');
const KEY_ = env('SUPABASE_SERVICE_KEY', 'VITE_SUPABASE_ANON_KEY');
if (!URL_ || !KEY_) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_KEY. See scripts/import/README.md');
  process.exit(1);
}
const db = createClient(URL_, KEY_, { auth: { persistSession: false } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Non-fatal problems go to stderr with a prefix, so they are never
 *  confused with a title line on stdout when the output is piped. */
const warn = (msg) => console.error('  ! ' + msg);
/* ─── AniList enrichment ────────────────────────────────────────────────
 * idMal, NOT id: AniList's Media(id:) takes an AniList id and returns 404
 * for a MAL id, which silently costs us the banner, trailer and every
 * sequel/prequel edge.                                                        */
async function fetchAniList(malId) {
  const query = `query($mal:Int){
    Media(idMal:$mal,type:ANIME){
      id idMal bannerImage
      trailer{ site id }
      relations{ edges{ relationType node{ id } } }
    }
  }`;
  try {
    const res = await fetch(ANILIST, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables: { mal: malId } }),
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return null;
    return (await res.json())?.data?.Media || null;
  } catch { return null; }
}

async function ensureRef(table, name, malId) {
  const slug = slugifyTitle(name);
  if (!slug) return null;
  const { data: ex } = await db.from(table).select('id').eq('slug', slug).maybeSingle();
  if (ex) return ex.id;
  const { data } = await db.from(table)
    .insert({ name, slug, mal_id: malId ?? null }).select('id').single();
  return data?.id ?? null;
}

/* ─── one title ──────────────────────────────────────────────────────── */

/**
 * Import one title.
 *
 * ANILIST FIRST. Measured live: Jikan returned 504 on 3/3 sampled titles
 * while AniList answered the same three in a single call. AniList also
 * supplies synopsis, poster, banner, score, popularity, genres, studios
 * and relations — so it is a complete source on its own, and 50 titles
 * arrive per request instead of one.
 *
 * MAL/JIKAN IS SUPPLEMENTARY, not required. It is asked only for the two
 * things AniList does not have — mal_score/mal_rank and the episode list
 * — and its failure is tolerated. A 504 costs us a score, never a title.
 */
async function importOne(malId, anilistMedia) {
  let n = anilistMedia ? normalizeFromAniList(anilistMedia) : null;

  // AniList missed this title (deleted, or not in its catalogue).
  // Fall back to MAL so a Jikan outage is not a permanent gap.
  if (!n) {
    const full = await animeFull(malId);
    if (!full?.data) return { malId, ok: false, reason: 'not in AniList and not on MAL' };
    n = normalizeAnime(full.data, null);
    if (!n) return { malId, ok: false, reason: 'unusable payload' };
  }

  // Resumability: skip anything already stored.
  const { data: existing } = await db.from('anime_catalogue')
    .select('id, slug, title').eq('mal_id', malId).maybeSingle();
  if (existing) {
    return { malId, ok: true, skipped: true, title: existing.title, slug: existing.slug };
  }

  // Supplementary MAL data. Both calls are best-effort.
  let malScore = null, malRank = null, ageRating = null, source = n.source;
  if (!NO_MAL) {
    try {
      const full = await animeFull(malId);
      if (full?.data) {
        malScore = typeof full.data.score === 'number' ? full.data.score : null;
        malRank = Number.isInteger(full.data.rank) ? full.data.rank : null;
        ageRating = full.data.rating ? String(full.data.rating).split(' - ')[1] || null : null;
        source = full.data.source || n.source;
      }
    } catch { /* a 504 here costs a score, not a title */ }
  }

  // Poster: download to our own storage, fall back to the remote URL so a
  // storage failure never costs us the title.
  let posterUrl = n.poster_url;
  let posterCached = false;
  if (!NO_POSTERS && n.poster_url) {
    const stored = await storePoster(malId, n.poster_url, URL_, KEY_);
    if (stored) { posterUrl = stored.url; posterCached = stored.cached; }
  }

  // Episodes: the detail page's internal links depend on these.
  let episodes = 0;
  let epFromList = false;
  if (!NO_EPISODES) {
    const list = await animeEpisodes(malId, { knownCount: n.episodes_total });
    episodes = list.length;
    epFromList = list.some((e) => e.title);
    if (episodes) n._episodes = list;
  }

  const row = {
    slug: n.slug,
    title: n.title,
    title_romaji: n.title_romaji,
    title_japanese: n.title_japanese,
    mal_id: n.mal_id,
    synopsis: n.synopsis,
    poster_url: posterUrl,
    banner_url: n.banner_url,
    trailer_id: n.trailer_id,
    type: n.type,
    source: source,
    air_status: n.air_status,
    season: n.season,
    year: n.year,
    episodes_total: n.episodes_total,
    duration_min: n.duration_min,
    age_rating: ageRating || n.age_rating,
    aired_from: n.aired_from,
    aired_to: n.aired_to,
    mal_score: malScore,
    mal_rank: malRank,
    popularity: n.popularity,
    favorites: n.favorites,
    // With MAL unreachable we still know AniList's own 0-100 mean score, so
    // the page is not left scoreless. It is stored as OUR rating only
    // because it is a real aggregated score, not a single reviewer's.
    rating: (n.mean_score != null && n.mean_score >= 4) ? Math.round(n.mean_score * 10) / 10 : null,
    has_poster: Boolean(posterUrl),
    has_synopsis: n.has_synopsis,
    has_episodes: episodes > 0,
    status: 'draft',
  };

  if (DRY_RUN) {
    const r = readiness(row);
    return { malId, ok: true, dryRun: true, title: n.title, slug: n.slug,
             publishable: r.ok, missing: r.missing, episodes, epFromList, posterCached };
  }

  const { data: saved, error } = await db.from('anime_catalogue')
    .upsert(row, { onConflict: 'slug' }).select('id, slug, title').single();
  if (error) return { malId, ok: false, reason: error.message };
  const id = saved.id;

  // episodes
  if (n._episodes?.length) {
    const rows = n._episodes
      .filter((e) => Number.isInteger(e.mal_id) && e.mal_id > 0)
      .map((e) => ({
        anime_id: id,
        episode_number: e.mal_id,
        title: e.title || null,
        // Jikan dates are ISO strings with a time component.
        air_date: e.aired ? String(e.aired).slice(0, 10) : null,
        duration_min: null,
        is_filler: !!e.filler,
      }));
    for (let i = 0; i < rows.length; i += 200) {
      await db.from('catalogue_episodes').upsert(rows.slice(i, i + 200), { onConflict: 'anime_id,episode_number' });
    }
  }

  // genres + themes
  const names = [...new Set([...(n.genres || []), ...(n.themes || [])])];
  for (let i = 0; i < names.length; i++) {
    const gid = await ensureRef('genres', names[i], null);
    if (gid) await db.from('anime_genres').upsert({ anime_id: id, genre_id: gid, is_primary: i < 3 });
  }
  for (const name of n.studios || []) {
    const sid = await ensureRef('studios', name, null);
    if (sid) await db.from('anime_studios').upsert({ anime_id: id, studio_id: sid, is_main: true });
  }
  for (const rel of n.relations) {
    const { data: to } = await db.from('anime_catalogue').select('id').eq('mal_id', rel.toMalId).maybeSingle();
    if (to) await db.from('anime_relations').upsert({ from_id: id, to_id: to.id, kind: rel.kind, shared_genres: 0 });
  }

  const r = readiness(row);
  return { malId, ok: true, title: n.title, slug: n.slug, episodes,
           publishable: r.ok, missing: r.missing, posterCached };
}
/* ─── main ───────────────────────────────────────────────────────────── */

const total = Math.min(PAGES * 25, MAX_TITLES);
console.log('');
console.log((DRY_RUN ? 'BULK DRY RUN' : 'BULK IMPORT')
  + ' — pages ' + FROM_PAGE + '..' + (FROM_PAGE + PAGES - 1)
  + ' (~' + total + ' titles)');
console.log('  episodes: ' + (NO_EPISODES ? 'skipped (--no-episodes)' : 'fetched')
  + ' | posters: ' + (NO_POSTERS ? 'kept hotlinked (--no-posters)' : 'downloaded to Supabase Storage'));
if (PUBLISH && !DRY_RUN) console.log('  publishing anything that clears the quality gate');
console.log('');

if (!NO_POSTERS && !DRY_RUN) {
  const v = await verifyBucket(URL_, KEY_);
  if (!v.ok) {
    console.error('STOP: ' + v.reason);
    process.exit(1);
  }
  if (!v.public) {
    console.warn('  ! bucket "' + (process.env.POSTER_BUCKET || 'posters')
      + '" is PRIVATE. Posters will be stored but not served. Set it public.');
  }
}

// Harvest ids. Two strategies:
//
//   --id-range  walk MAL ids directly. Does NOT touch the listing endpoint,
//               which is the flakiest Jikan surface — /anime?page= has been
//               observed returning 504 for minutes while /anime/{id}/full
//               answers fine. MAL ids are dense from 1 upward for the
//               well-known catalogue, so a range is both simpler and more
//               robust than paging a listing.
//
//   default     page through /anime?page=N, which gives better titles per
//               call but depends on the fragile endpoint.
//
// Neither is mandatory: with no --pages the script does a 500-id range.
let ids = [];
const rangeArg = flag('id-range', null);

if (typeof rangeArg === 'string' && rangeArg.includes('-')) {
  const [a, b] = rangeArg.split('-').map((n) => parseInt(n, 10));
  const from = Number.isFinite(a) ? a : 1;
  const to = Number.isFinite(b) ? b : from + 499;
  console.log('id range: ' + from + '..' + to);
  for (let id = from; id <= to && ids.length < MAX_TITLES; id++) ids.push(id);
} else {
  for (let p = FROM_PAGE; p < FROM_PAGE + PAGES; p++) {
    let d = null;
    try {
      d = await animePage(p);
    } catch (err) {
      // A failed listing page must not abort a long import. Report it and
      // stop harvesting — the caller still has whatever was gathered.
      warn('  ! listing page ' + p + ' failed (' + err.message + ') — stopping harvest');
      break;
    }
    for (const a of d?.data ?? []) {
      if (a?.mal_id) ids.push(a.mal_id);
    }
    if (!d?.pagination?.has_next_page) break;
  }
}
if (!ids.length) {
  console.error('No MAL ids to import. Jikan listing pages failed — retry with');
  console.error('  --id-range 1-500      (skips the listing endpoint entirely)');
  process.exit(1);
}
console.log('harvested ' + ids.length + ' MAL ids');
console.log('');

const started = Date.now();
const results = [];

// Batched AniList prefetch, 50 ids per request. This is the single biggest
// speed-up in the importer: 200 titles arrive in 4 calls instead of 200.
// It runs BEFORE the loop so a title that is already stored is still
// looked up — the skip check below costs one indexed query, not a fetch.
console.log('prefetching metadata from AniList...');
const mediaByMalId = await fetchAniListByMalIds(ids);
console.log('  ' + mediaByMalId.size + ' / ' + ids.length + ' titles returned by AniList');
if (mediaByMalId.size < ids.length) {
  warn(mediaByMalId.size + ' titles missing from AniList — those fall back to MAL');
}
console.log('');

for (let i = 0; i < ids.length; i++) {
  const id = ids[i];
  let r;
  try { r = await importOne(id, mediaByMalId.get(id)); }
  catch (err) { r = { malId: id, ok: false, reason: err.message }; }
  results.push(r);

  const pct = Math.round(((i + 1) / ids.length) * 100);
  if (!r.ok) {
    console.log('[' + String(i + 1).padStart(4) + '/' + ids.length + '] ' + id + '  FAIL ' + r.reason);
  } else if (r.skipped) {
    process.stdout.write('.');
  } else {
    const bits = [r.title];
    if (r.episodes) bits.push(r.episodes + 'ep');
    if (r.posterCached) bits.push('poster cached');
    if (!r.publishable) bits.push('needs: ' + r.missing.join(','));
    console.log('\n[' + String(i + 1).padStart(4) + '/' + ids.length + '] ' + id + '  ' + bits.join('  ·  '));
  }
  if ((i + 1) % 10 === 0) console.log('  -- ' + pct + '% --');

  if (DRY_RUN && i >= 4) { console.log('\n(dry run: stopping after 5)'); break; }
}

const ok = results.filter((r) => r.ok && !r.skipped);
const skipped = results.filter((r) => r.skipped);
const failed = results.filter((r) => !r.ok);
const pub = ok.filter((r) => r.publishable);

console.log('');
console.log('---');
console.log('  imported : ' + ok.length);
console.log('  skipped  : ' + skipped.length + ' (already in the catalogue)');
console.log('  failed   : ' + failed.length);
console.log('  publishable: ' + pub.length + ' / ' + ok.length);
console.log('  elapsed  : ' + ((Date.now() - started) / 1000 / 60).toFixed(1) + ' min');

if (failed.length) {
  console.log('');
  console.log('  failures (first 10):');
  for (const r of failed.slice(0, 10)) console.log('    ' + r.malId + ' — ' + r.reason);
}
if (PUBLISH && !DRY_RUN && pub.length) {
  console.log('');
  console.log('  publishing ' + pub.length + ' title(s)...');
  let published = 0;
  for (const r of pub) {
    const { error } = await db.from('anime_catalogue')
      .update({ status: 'published' }).eq('mal_id', r.malId).eq('status', 'draft');
    if (!error) published++;
  }
  console.log('  published: ' + published);
}
console.log('');