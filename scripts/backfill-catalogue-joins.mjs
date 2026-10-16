/* ============================================================================
 * BACKFILL CATALOGUE JOINS — attach genres, studios and relations to titles
 * already in anime_catalogue.
 *
 * Run: npm run backfill:joins          (add -- --dry-run to preview)
 *
 * WHY THIS EXISTS
 *   batch-import.mjs only writes the core row; bulk-import.mjs skips ids
 *   that are already stored. Titles imported by either path therefore have
 *   no rows in anime_genres / anime_studios / anime_relations — detail
 *   pages lose their genre chips and studio, and genre-hub filtering from
 *   the catalogue finds nothing. This script fills exactly those joins for
 *   whatever is already in the catalogue, from AniList (50 ids per request).
 *
 * STEP 1 also seeds the `genres` table from the same 18-row list as
 * supabase/migrations/202609260002_catalogue_genres.sql (which may not have
 * been applied): getAnimeList({ genreId }) resolves the genre by mal_id, so
 * hub genres need their mal_id set for catalogue genre pages to work.
 * ========================================================================= */

import { createClient } from '@supabase/supabase-js';
import { slugifyTitle } from './import/normalize.mjs';
import { fetchAniListByMalIds, normalizeFromAniList } from './import/anilist.mjs';

const URL_ = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY_ = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!URL_ || !KEY_) { console.error('FAIL: SUPABASE_URL / SUPABASE_SERVICE_KEY not set'); process.exit(1); }

const DRY = process.argv.includes('--dry-run');
const db = createClient(URL_, KEY_, { auth: { persistSession: false } });

// Verbatim from supabase/migrations/202609260002_catalogue_genres.sql.
// Keep in sync with that file and src/lib/genres.js POPULAR_GENRES.
const HUB_GENRES = [
  ['Action', 1], ['Adventure', 2], ['Comedy', 4], ['Drama', 8], ['Fantasy', 10],
  ['Romance', 22], ['Sci-Fi', 24], ['Slice of Life', 36], ['Sports', 30],
  ['Supernatural', 37], ['Mystery', 7], ['Horror', 14], ['Thriller', 41],
  ['Isekai', 66], ['Ecchi', 9], ['Hentai', 12],
];

async function ensureRef(table, name, malId) {
  const slug = slugifyTitle(name);
  if (!slug) return null;
  const { data: ex } = await db.from(table).select('id').eq('slug', slug).maybeSingle();
  if (ex) {
    // A genre created by an earlier run has no mal_id; fill it when we know it.
    if (table === 'genres' && malId != null) {
      await db.from(table).update({ mal_id: malId }).eq('id', ex.id).is('mal_id', null);
    }
    return ex.id;
  }
  const { data } = await db.from(table)
    .insert({ name, slug, mal_id: malId ?? null }).select('id').single();
  return data?.id ?? null;
}

/* 1. Seed hub genres (idempotent; mirrors the migration's upsert). */
if (!DRY) {
  for (const [name, malId] of HUB_GENRES) {
    await db.from('genres').upsert(
      { name, slug: slugifyTitle(name), mal_id: malId, is_hub: !['Ecchi', 'Hentai'].includes(name) },
      { onConflict: 'slug' },
    );
  }
}
console.log(`[backfill] genre hubs seeded (${HUB_GENRES.length})${DRY ? ' [dry-run skipped]' : ''}`);

/* 2. Load catalogue rows. */
const { data: rows, error } = await db
  .from('anime_catalogue').select('id, mal_id, title').not('mal_id', 'is', null);
if (error) { console.error('FAIL:', error.message); process.exit(1); }
console.log(`[backfill] ${rows.length} catalogue rows with mal_id`);

/* 3. Prefetch from AniList in batches of 50. */
const media = new Map();
for (let i = 0; i < rows.length; i += 50) {
  const chunk = rows.slice(i, i + 50).map(r => r.mal_id);
  const got = await fetchAniListByMalIds(chunk);
  for (const [k, v] of got) media.set(k, v);
  console.log(`[backfill] AniList ${i + chunk.length}/${rows.length}`);
}

/* 4. Attach joins per title. */
const tally = { genres: 0, studios: 0, relations: 0, skipped: 0 };
for (const row of rows) {
  const n = normalizeFromAniList(media.get(row.mal_id));
  if (!n) { tally.skipped++; continue; }

  const names = [...new Set([...(n.genres || []), ...(n.themes || [])])];
  for (let i = 0; i < names.length; i++) {
    const gid = await ensureRef('genres', names[i], null);
    if (gid) {
      const { error: ge } = await db.from('anime_genres')
        .upsert({ anime_id: row.id, genre_id: gid, is_primary: i < 3 }, { onConflict: 'anime_id,genre_id' });
      if (!ge) tally.genres++;
    }
  }
  for (const name of n.studios || []) {
    const sid = await ensureRef('studios', name, null);
    if (sid) {
      const { error: se } = await db.from('anime_studios')
        .upsert({ anime_id: row.id, studio_id: sid, is_main: true }, { onConflict: 'anime_id,studio_id' });
      if (!se) tally.studios++;
    }
  }
  for (const rel of n.relations || []) {
    const { data: to } = await db.from('anime_catalogue').select('id').eq('mal_id', rel.toMalId).maybeSingle();
    if (to) {
      const { error: re } = await db.from('anime_relations')
        .upsert({ from_id: row.id, to_id: to.id, kind: rel.kind, shared_genres: 0 }, { onConflict: 'from_id,to_id,kind' });
      if (!re) tally.relations++;
    }
  }
}

console.log(`[backfill] done: ${tally.genres} genre links, ${tally.studios} studio links, ${tally.relations} relations${tally.skipped ? `, ${tally.skipped} skipped (no AniList match)` : ''}`);
