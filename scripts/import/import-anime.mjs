/* ============================================================================
 * BULK IMPORTER - node scripts/import/import-anime.mjs <malId...>
 *
 * WHY A LOCAL SCRIPT AND NOT AN ADMIN BUTTON
 *   Vercel's free tier allows 12 serverless invocations per day. One import =
 *   one invocation (Jikan + AniList inside a single call), so a web button
 *   could only add 12 titles a day. Running it from a machine removes that
 *   ceiling entirely and lets it obey Jikan's 3 req/sec limit properly.
 *
 *   It also keeps the Supabase service-role key out of the browser. The admin
 *   button would need the anon key, which cannot write these columns.
 *
 *   The admin panel still gets a single-import button for one-off adds; it
 *   calls /api/import, which runs this same code server-side.
 *
 * USAGE
 *   node scripts/import/import-anime.mjs 21 52991 113415
 *   node scripts/import/import-anime.mjs --file ids.txt
 *   node scripts/import/import-anime.mjs --dry-run 21
 *   node scripts/import/import-anime.mjs --publish 21 52991
 *
 * ENV
 *   SUPABASE_URL           (or VITE_SUPABASE_URL)
 *   SUPABASE_SERVICE_KEY   (or VITE_SUPABASE_ANON_KEY for read-only dry runs)
 * ========================================================================= */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

import { normalizeAnime, slugifyTitle, diffAnime, readiness } from './normalize.mjs';

const JIKAN = 'https://api.jikan.moe/v4';
const ANILIST = 'https://graphql.anilist.co';

// Jikan allows ~3 req/sec. Going faster is the single most common cause of a
// partial import: every 429 drops a title silently, which is exactly how the
// old sitemap-anime.js ended up listing 50 URLs instead of 200.
const JIKAN_GAP_MS = 420;
const MAX_RETRIES = 3;

const argv = process.argv.slice(2);
const flags = new Set(argv.filter(a => a.startsWith('--')));
const positional = argv.filter(a => !a.startsWith('--'));

const DRY_RUN = flags.has('--dry-run');
const PUBLISH = flags.has('--publish');

function env(...names) {
  for (const n of names) if (process.env[n]) return process.env[n];
  return null;
}

const SUPABASE_URL = env('SUPABASE_URL', 'VITE_SUPABASE_URL');
const SUPABASE_KEY = env('SUPABASE_SERVICE_KEY', 'VITE_SUPABASE_ANON_KEY');
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_KEY.');
  console.error('  .env.local  ->  SUPABASE_URL=...  SUPABASE_SERVICE_KEY=...');
  process.exit(1);
}
const db = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** fetch with a retry on 429/5xx, because a rate limit is expected here. */
async function fetchJson(url, init) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: { Accept: 'application/json', ...(init?.headers || {}) },
        signal: AbortSignal.timeout(30000),
      });
      if (res.status === 429 || res.status >= 500) {
        throw new Error('HTTP ' + res.status);
      }
      if (!res.ok) return null;             // 404 = title does not exist
      return await res.json();
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRIES) {
        const wait = 1200 * attempt;        // linear backoff
        process.stdout.write(`    retry ${attempt}/${MAX_RETRIES - 1} in ${wait}ms (${err.message})\n`);
        await sleep(wait);
      }
    }
  }
  throw lastErr;
}

/** Jikan is the source of truth for the record; AniList adds banner, trailer, relations. */
async function fetchJikan(malId) {
  return fetchJson(`${JIKAN}/anime/${malId}/full`);
}

/**
 * AniList enrichment: banner art, trailer and relations.
 *
 * AniList's `Media(id:)` takes an ANILIST id, not a MAL id. Passing a MAL id
 * returns HTTP 404 with data:null, which is easy to mistake for "this title
 * has no relations" and silently lose the banner, trailer and every
 * sequel/prequel edge. So this looks the MAL id up in idMal first.
 *
 * AniList is an enhancement, not a requirement: if it is down or rate-limits
 * us, the import continues with Jikan data alone.
 */
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
    const json = await res.json();
    return json?.data?.Media || null;
  } catch {
    return null;
  }
}

/** Ensure a genre/studio row exists and return its id. */
async function ensureRef(table, name, malId) {
  const slug = slugifyTitle(name);
  if (!slug) return null;
  const { data: existing } = await db.from(table).select('id').eq('slug', slug).maybeSingle();
  if (existing) return existing.id;
  const { data, error } = await db.from(table)
    .insert({ name, slug, mal_id: malId ?? null })
    .select('id').single();
  if (error) return null;
  return data?.id ?? null;
}
/**
 * Import one title. Returns a result summary rather than throwing, so a
 * single bad title never aborts a 200-title run.
 */
async function importOne(malId) {
  const jikan = await fetchJikan(malId);
  if (!jikan?.data) return { malId, ok: false, reason: 'not found on MAL' };

  const al = await fetchAniList(malId);
  const n = normalizeAnime(jikan.data, al);
  if (!n) return { malId, ok: false, reason: 'payload unusable (no title/slug)' };

  // Look for an existing row by MAL id first (re-import), then by slug.
  // Matching on slug matters because a title can be renamed upstream, which
  // changes the slug we would derive and would otherwise create a duplicate.
  const { data: byMal } = await db.from('anime_catalogue')
    .select('*').eq('mal_id', malId).maybeSingle();
  const { data: bySlug } = byMal ? { data: null }
    : await db.from('anime_catalogue').select('*').eq('slug', n.slug).maybeSingle();
  const existing = byMal || bySlug;

  const row = {
    slug: n.slug,
    title: n.title,
    title_romaji: n.title_romaji,
    title_japanese: n.title_japanese,
    mal_id: n.mal_id,
    synopsis: n.synopsis,
    poster_url: n.poster_url,
    banner_url: n.banner_url,
    trailer_id: n.trailer_id,
    type: n.type,
    source: n.source,
    air_status: n.air_status,
    season: n.season,
    year: n.year,
    episodes_total: n.episodes_total,
    duration_min: n.duration_min,
    age_rating: n.age_rating,
    aired_from: n.aired_from,
    aired_to: n.aired_to,
    mal_score: n.mal_score,
    mal_rank: n.mal_rank,
    popularity: n.popularity,
    favorites: n.favorites,
    has_poster: n.has_poster,
    has_synopsis: n.has_synopsis,
    // has_episodes is set below, once we know what is actually stored.
    has_episodes: existing?.has_episodes || false,
    status: existing?.status || 'draft',
  };

  if (DRY_RUN) {
    const r = readiness(row);
    return {
      malId, ok: true, dryRun: true, action: existing ? 'update' : 'insert',
      title: n.title, slug: n.slug, publishable: r.ok, missing: r.missing,
      changes: existing ? diffAnime(n, existing) : null,
    };
  }

  const { data: saved, error } = await db.from('anime_catalogue')
    .upsert(row, { onConflict: 'slug' }).select('id, slug, title').single();
  if (error) return { malId, ok: false, reason: error.message };
  const id = saved.id;

  // Record a 301 whenever the slug moved, so an already-indexed URL keeps
  // working. This is the whole reason slug is a column and not derived.
  if (existing && existing.slug !== n.slug) {
    await db.from('catalogue_redirects')
      .upsert({ from_path: `/anime/${existing.slug}`, to_path: `/anime/${n.slug}` });
  }

  // genres / themes
  const genreNames = [...new Set([...(n.genres || []), ...(n.themes || [])])];
  for (let i = 0; i < genreNames.length; i++) {
    const gid = await ensureRef('genres', genreNames[i], null);
    if (gid) await db.from('anime_genres')
      .upsert({ anime_id: id, genre_id: gid, is_primary: i < 3 });
  }

  // studios
  for (const name of n.studios || []) {
    const sid = await ensureRef('studios', name, null);
    if (sid) await db.from('anime_studios').upsert({ anime_id: id, studio_id: sid, is_main: true });
  }

  // relations, matched by MAL id since the target may not be imported yet
  for (const rel of n.relations) {
    const { data: to } = await db.from('anime_catalogue')
      .select('id').eq('mal_id', rel.toMalId).maybeSingle();
    if (to) await db.from('anime_relations')
      .upsert({ from_id: id, to_id: to.id, kind: rel.kind, shared_genres: 0 });
  }

  const r = readiness(row);
  return {
    malId, ok: true, action: existing ? 'updated' : 'imported',
    title: n.title, slug: n.slug, publishable: r.ok, missing: r.missing,
    changes: existing ? diffAnime(n, existing) : null,
  };
}
/* ─── resolve the id list ─────────────────────────────────────────────── */
let ids = [];
const fileArg = argv[argv.indexOf('--file') + 1];
if (flags.has('--file') && fileArg) {
  const p = path.isAbsolute(fileArg) ? fileArg : path.join(process.cwd(), fileArg);
  ids = readFileSync(p, 'utf8').split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
} else {
  ids = positional.filter(s => /^\d+$/.test(s));
}
ids = [...new Set(ids.map(Number))].filter(Number.isInteger);

if (!ids.length) {
  console.error('No MAL ids given.');
  console.error('  node scripts/import/import-anime.mjs 21 52991 113415');
  console.error('  node scripts/import/import-anime.mjs --file ids.txt');
  process.exit(1);
}

console.log('');
console.log((DRY_RUN ? 'DRY RUN — nothing will be written' : 'Importing')
  + ' ' + ids.length + ' title(s) into ' + SUPABASE_URL);
if (PUBLISH && !DRY_RUN) console.log('  --publish: titles meeting the quality gate will go live');
console.log('');

/* ─── run ─────────────────────────────────────────────────────────────── */
const results = [];
for (let i = 0; i < ids.length; i++) {
  const id = ids[i];
  process.stdout.write(`[${i + 1}/${ids.length}] ${id} ... `);
  let r;
  try {
    r = await importOne(id);
  } catch (err) {
    r = { malId: id, ok: false, reason: err.message };
  }
  results.push(r);

  if (!r.ok) {
    console.log('FAIL (' + r.reason + ')');
  } else if (r.dryRun) {
    console.log((r.action === 'update' ? 'exists' : 'new')
      + ' "' + r.title + '" -> /' + r.slug
      + (r.publishable ? '  [publishable]' : '  [not publishable: ' + r.missing.join(', ') + ']')
      + (r.changes ? '  [' + Object.keys(r.changes).length + ' field(s) changed]' : ''));
  } else {
    console.log((r.action === 'imported' ? 'imported' : 'updated')
      + ' "' + r.title + '" -> /' + r.slug
      + (r.publishable ? '' : '  [not publishable: ' + r.missing.join(', ') + ']'));
  }

  // Respect Jikan's rate limit between titles.
  if (i < ids.length - 1) await sleep(JIKAN_GAP_MS);
}
/* ─── optionally publish, but only what clears the gate ────────────────── */
if (PUBLISH && !DRY_RUN) {
  console.log('');
  console.log('Publishing...');
  const publishable = results.filter(r => r.ok && r.publishable);
  const blocked = results.filter(r => r.ok && !r.publishable);

  for (const r of publishable) {
    const { error } = await db.from('anime_catalogue')
      .update({ status: 'published' })
      .eq('mal_id', r.malId)
      .eq('status', 'draft');
    if (error) console.log('  FAIL ' + r.malId + ': ' + error.message);
    else console.log('  published "' + r.title + '"');
  }
  for (const r of blocked) {
    console.log('  held "' + r.title + '" back — needs: ' + r.missing.join(', '));
  }
}

/* ─── summary ─────────────────────────────────────────────────────────── */
const ok = results.filter(r => r.ok);
const failed = results.filter(r => !r.ok);
const pub = results.filter(r => r.publishable);

console.log('');
console.log('---');
console.log('  succeeded : ' + ok.length + ' / ' + results.length);
console.log('  failed    : ' + failed.length);
console.log('  publishable: ' + pub.length);
if (failed.length) {
  console.log('');
  console.log('  failures:');
  for (const r of failed) console.log('    ' + r.malId + ' — ' + r.reason);
}
console.log('');
if (ok.length && !ok.some(r => r.publishable)) {
  console.log('  NOTE: nothing is publishable yet. Every title needs a poster,');
  console.log('        a 200+ char synopsis and at least one episode before the');
  console.log('        database will let it go live. That gate is deliberate —');
  console.log('        it is what stops thin pages filling the sitemap.');
  console.log('');
}
if (DRY_RUN) console.log('  Dry run. Re-run without --dry-run to write.');
console.log('');
process.exit(failed.length ? 1 : 0);