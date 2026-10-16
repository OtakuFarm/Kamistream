/* ============================================================================
 * VERIFY CATALOGUE READS — proves the runtime catalogue layer will work in
 * the browser before any page depends on it.
 *
 * Run: npm run verify:catalogue
 *
 * Uses ONLY the VITE_ anon key — the exact credentials the browser bundle
 * gets — so a pass here means every query in src/lib/catalogue.ts is
 * readable under RLS. The service key is deliberately never used: it would
 * mask a policy mistake that would only show up as silent Jikan fallbacks.
 * ========================================================================= */

const URL_ = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const KEY_ = process.env.VITE_SUPABASE_ANON_KEY;

const ok = [];
const warn = [];
const fail = [];
const check = (name, cond, extra = '') => (cond ? ok : fail).push(`${name}${extra ? ' — ' + extra : ''}`);
const note  = (name, extra = '') => warn.push(`${name}${extra ? ' — ' + extra : ''}`);

if (!URL_ || !KEY_) {
  console.error('FAIL: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set (run via npm run verify:catalogue so .env.local is loaded)');
  process.exit(1);
}
if (process.env.VITE_CATALOGUE !== '1' && process.env.VITE_CATALOGUE !== 'true') {
  note('VITE_CATALOGUE flag', 'not set in .env.local — the site will keep reading Jikan/AniList');
}

const { createClient } = await import('@supabase/supabase-js');
const db = createClient(URL_, KEY_, { auth: { persistSession: false } });

/* 1. Published catalogue is non-empty and shaped as the runtime expects. */
const { data: published, error: e1, count } = await db
  .from('anime_catalogue')
  .select('id, slug, title, mal_id, season, air_status', { count: 'exact' })
  .eq('status', 'published')
  .order('updated_at', { ascending: false })
  .limit(1);
check('anime_catalogue: readable with anon key', !e1, e1?.message);
check('anime_catalogue: has published rows', (published || []).length > 0, `count=${count}`);
const row = (published || [])[0];

/* 2. RLS really is published-only: a draft filter must return nothing. */
const { data: drafts } = await db.from('anime_catalogue').select('id').eq('status', 'draft').limit(1);
check('RLS: drafts invisible to anon', (drafts || []).length === 0);

if (row) {
  /* 3. The joins rowToJikan() hydrates from. */
  const { data: genres, error: e2 } = await db
    .from('anime_genres').select('anime_id, genres(mal_id, name)').eq('anime_id', row.id).limit(20);
  check('anime_genres + genres join readable', !e2 && (genres || []).length > 0,
    e2?.message || `${(genres || []).length} genres on "${row.title}"`);

  const { data: studios, error: e3 } = await db
    .from('anime_studios').select('anime_id, studios(mal_id, name)').eq('anime_id', row.id).limit(10);
  check('anime_studios + studios join readable', !e3, e3?.message || `${(studios || []).length} studios`);
  if ((studios || []).length === 0) note('studios join', 'no studios on the newest published row — detail pages will show none until backfilled');

  /* 4. Episode list (catalogue_episodes drives useAnimeEpisodes). */
  const { count: epCount, error: e4 } = await db
    .from('catalogue_episodes').select('id', { count: 'exact', head: true })
    .eq('anime_id', row.id);
  check('catalogue_episodes readable', !e4, e4?.message || `${epCount} episodes on "${row.title}"`);
  if (!e4 && epCount === 0) note('catalogue_episodes', 'newest published row has 0 episodes — its episode list falls back to Jikan');

  /* 5. Relations (useAnimeRecommendations / anime-like). */
  const { data: rels, error: e5 } = await db
    .from('anime_relations').select('to_id').eq('from_id', row.id).limit(5);
  check('anime_relations readable', !e5, e5?.message || `${(rels || []).length} relations`);
  if (!e5 && (rels || []).length === 0) note('anime_relations', 'newest published row has no relations — recommendations fall back to Jikan');

  /* 6. Title search exactly as searchAnime() builds it. */
  const term = String(row.title.split(' ')[0] || '').replace(/[%,()*"']/g, ' ').replace(/\s+/g, ' ').trim();
  if (term) {
    const { data: hits, error: e6 } = await db
      .from('anime_catalogue').select('id, title')
      .eq('status', 'published')
      .or(`title.ilike.%${term}%,title_romaji.ilike.%${term}%`)
      .limit(5);
    check('title ilike search (or-syntax)', !e6 && (hits || []).length > 0, e6?.message || `"${term}" -> ${(hits || []).length} hits`);
  }

  /* 7. Genre hub path used by getAnimeList({ genreId }). */
  const { data: genre } = await db.from('genres').select('id, name').eq('mal_id', 1).maybeSingle();
  if (genre) {
    const { data: links } = await db.from('anime_genres').select('anime_id').eq('genre_id', genre.id).limit(1);
    check('genre hub query (Action)', (links || []).length > 0, `${(links || []).length}+ titles in ${genre.name}`);
  } else {
    note('genres table', 'no genre with mal_id=1 (Action) — genre hub queries will fall back to Jikan');
  }
}

console.log('');
for (const l of ok)   console.log(`  PASS  ${l}`);
for (const l of warn) console.log(`  WARN  ${l}`);
for (const l of fail) console.log(`  FAIL  ${l}`);
console.log(`\n${ok.length} passed, ${warn.length} warnings, ${fail.length} failed`);
process.exit(fail.length ? 1 : 0);
