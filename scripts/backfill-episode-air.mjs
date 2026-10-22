/* ============================================================================
 * BACKFILL next_episode_air FROM ANILIST.
 *
 * For each anime in anime_catalogue that has next_episode_air IS NULL,
 * fetch the next airing episode from AniList and store the air date.
 *
 * Run:
 *   node scripts/backfill-episode-air.mjs [--dry-run] [--limit N]
 * ============================================================================ */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL_ = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY_ = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!SUPABASE_URL_ || !SUPABASE_KEY_) { 
  console.error('FAIL: SUPABASE_URL and SUPABASE_SERVICE_KEY (or VITE_SUPABASE_ANON_KEY) must be set'); 
  process.exit(1); 
}

const supabase = createClient(SUPABASE_URL_, SUPABASE_KEY_);

const DRY   = process.argv.includes('--dry-run');
const LIMIT = (() => { const i = process.argv.indexOf('--limit'); return i !== -1 ? Number(process.argv[i + 1]) || 0 : 0; })();
const BATCH = 50;
const AL_ENDPOINT = 'https://graphql.anilist.co';
const AL_TIMEOUT = 30000; // 30 seconds

function cleanSynopsis(raw) {
  return String(raw || '')
    .replace(/\[Written by MAL Rewrite\]/gi, '')
    .replace(/\[Source: MAL Rewrite\]/gi, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function queryAniListByIds(ids) {
  if (!ids.length) return new Map();
  const query = 'query($ids:[Int]){ Page(page:1, perPage:$ids.length){ media(type:ANIME, id_in:$ids){ id nextAiringEpisode{ episode airingAt } } } }';
  const res = await fetch(AL_ENDPOINT, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json', 
      Accept: 'application/json',
      'User-Agent': 'Kamistream/1.0'
    },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error('AniList ' + res.status + ': ' + (text.substring(0, 200)));
  }
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0]?.message || 'AniList GraphQL error');
  const out = new Map();
  for (const m of json.data.Page.media || []) {
    if (m.idMal) out.set(Number(m.idMal), m);
  }
  return out;
}

async function main() {
  // Fetch published anime missing next_episode_air
  const { data: rows, error: rErr } = await supabase
    .from('anime_catalogue')
    .select('id, mal_id, title, next_episode_air')
    .eq('status', 'published');

  if (rErr) { console.error('FAIL reading catalogue:', rErr.message); process.exit(1); }

  console.log('Published anime catalogue rows:', rows.length);
  if (!rows.length) { console.log('No published rows.'); return; }

  const needAir = rows.filter(r => !r.next_episode_air);
  console.log('Rows missing next_episode_air:', needAir.length);
  if (!needAir.length) { console.log('All rows already have next_episode_air.'); return; }

  // Prefetch AniList data in batches
  const malIds = [...new Set(needAir.map(r => r.mal_id).filter(Boolean))];
  console.log('Prefetching AniList data for ' + malIds.length + ' unique MAL ids...');
  const mediaByMalId = new Map();
  const perPage = BATCH;
  const query = `query($ids:[Int], $perPage: Int) { Page(page: 1, perPage: $perPage) { media(type: ANIME, id_in: $ids) { id nextAiringEpisode { episode airingAt } } } }`;
  for (let i = 0; i < malIds.length; i += BATCH) {
    const chunk = malIds.slice(i, i + BATCH);
    const res = await fetch(AL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'Kamistream/1.0'
      },
      body: JSON.stringify({ query, variables: { ids: chunk, perPage } }),
      signal: AbortSignal.timeout(AL_TIMEOUT),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error('AniList ' + res.status + ': ' + (text.substring(0, 200)));
    }
    const json = await res.json();
    if (json.errors) throw new Error(json.errors[0]?.message || 'AniList GraphQL error');
    for (const m of json.data.Page.media || []) {
      if (m.id) mediaByMalId.set(Number(m.id), m);
    }
    console.log('  AniList batch ' + (i / BATCH + 1) + '/' + Math.ceil(malIds.length / BATCH) + ' - got ' + (json.data.Page.media?.length || 0));
  }
  console.log('  Got ' + mediaByMalId.size + '/' + malIds.length + ' from AniList');
  console.log('');

  // Prepare updates
  const updates = [];
  for (const r of needAir) {
    const m = r.mal_id ? mediaByMalId.get(r.mal_id) : null;
    let airDate = null;
    if (m?.nextAiringEpisode) {
      const d = new Date(m.nextAiringEpisode.airingAt * 1000);
      airDate = d.toISOString().slice(0, 10); // "YYYY-MM-DD"
    }
    if (airDate) {
      updates.push({ id: r.id, air_date: airDate });
    }
  }

  console.log('Updates prepared: ' + updates.length + '/' + needAir.length);

  if (DRY) {
    console.log('\nDry run - no writes performed.');
    for (const u of updates.slice(0, 10)) {
      const row = needAir.find(n => n.id === u.id);
      console.log('  #' + u.id + ' ' + (row?.title || 'unknown') + ' -> air_date: ' + u.air_date);
    }
    if (updates.length > 10) console.log('  ...and ' + (updates.length - 10) + ' more');
    return;
  }

  // Write updates
  let written = 0, errors = 0;
  for (const u of updates) {
    const { error } = await supabase
      .from('anime_catalogue')
      .update({ next_episode_air: u.air_date })
      .eq('id', u.id);
    if (error) { errors++; console.error('  FAIL #' + u.id + ': ' + error.message); }
    else { written++; }
  }

  console.log('\nWritten: ' + written + '/' + updates.length + ', Errors: ' + errors);
}

main().catch(e => { console.error('FATAL: ' + e.message); process.exit(1); });