/* ============================================================================
 * BACKFILL CATALOGUE - enrich draft anime catalogue rows from AniList.
 *
 * This script finds all draft rows in anime_catalogue and enriches them
 * using AniList descriptions, similar to enrich-descriptions.mjs but
 * focused on the catalogue backfill flow.
 *
 * Run:
 *   node scripts/backfill-catalogue.mjs [--dry-run] [--limit N]
 * ============================================================================ */

import { createClient } from '@supabase/supabase-js';

const URL_ = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY_ = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!URL_ || !KEY_) { console.error('FAIL: SUPABASE_URL / SUPABASE_SERVICE_KEY not set'); process.exit(1); }

const DRY   = process.argv.includes('--dry-run');
const LIMIT = (() => { const i = process.argv.indexOf('--limit'); return i !== -1 ? Number(process.argv[i + 1]) || 0 : 0; })();
const BATCH = 50;

const db = createClient(URL_, KEY_, { auth: { persistSession: false } });

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
  const query = 'query($ids:[Int]){ Page(page:1, perPage:$ids.length){ media(type:ANIME, id_in:$ids){ id idMal description coverImage{ extraLarge large } episodes } } }';
  const res = await fetch(AL_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error('AniList ' + res.status);
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0]?.message || 'AniList GraphQL error');
  const out = new Map();
  for (const m of json.data.Page.media || []) {
    if (m.idMal) out.set(Number(m.idMal), m);
  }
  return out;
}

async function main() {
  const { data: rows, error: rErr } = await db
    .from('anime_catalogue')
    .select('id,mal_id,slug,title,synopsis,poster_url,banner_url,episodes_total,has_poster,has_synopsis,has_episodes,status')
    .eq('status', 'draft')
    .order('id');

  if (rErr) { console.error('FAIL reading catalogue:', rErr.message); process.exit(1); }

  console.log('Draft anime catalogue rows:', rows.length);
  if (!rows.length) { console.log('No drafts to backfill.'); return; }

  const thin = rows.filter(r => {
    const len = (r.synopsis || '').trim().length;
    return len < 200;
  });

  console.log('Rows with thin synopsis (< 200 chars):', thin.length);
  if (!thin.length) { console.log('All drafts already have sufficient synopsis.'); return; }

  const malIds = [...new Set(thin.map(r => r.mal_id).filter(Boolean))];
  console.log('Prefetching AniList data for ' + malIds.length + ' unique MAL ids...');
  const mediaByMalId = new Map();
  for (let i = 0; i < malIds.length; i += BATCH) {
    const chunk = malIds.slice(i, i + BATCH);
    try {
      const got = await queryAniListByIds(chunk);
      for (const [k, v] of got) mediaByMalId.set(k, v);
      console.log('  AniList ' + Math.min(i + chunk.length, malIds.length) + '/' + malIds.length);
    } catch (err) {
      console.warn('  AniList batch ' + (i / BATCH + 1) + ' failed: ' + err.message);
    }
  }
  console.log('  Got ' + mediaByMalId.size + '/' + malIds.length + ' from AniList');
  console.log('');

  const updates = [];
  let enriched = 0, postersAdded = 0, stillDraft = 0, published = 0;

  for (const r of thin) {
    const m = r.mal_id ? mediaByMalId.get(r.mal_id) : null;
    const changes = {};
    let enrichedThis = false;

    const curLen = (r.synopsis || '').trim().length;
    if (m?.description) {
      const alSyn = cleanSynopsis(m.description);
      if (alSyn.length > curLen && alSyn.length >= 200) {
        changes.synopsis = alSyn;
        changes.has_synopsis = true;
        enrichedThis = true;
      }
    } else if (curLen === 0 && !m) {
      continue;
    }

    if (!r.has_poster && !r.poster_url && m?.coverImage) {
      changes.poster_url = m.coverImage.extraLarge || m.coverImage.large;
      changes.has_poster = true;
      postersAdded++;
    }

    if (!r.has_episodes && m && Number.isInteger(m.episodes) && m.episodes > 0) {
      changes.has_episodes = true;
      changes.episodes_total = m.episodes;
    }

    if (!Object.keys(changes).length) {
      stillDraft++;
      continue;
    }

    const synLen = (changes.synopsis || r.synopsis || '').trim().length;
    const hasPoster = changes.has_poster !== undefined ? true : Boolean(r.has_poster || r.poster_url);
    const hasSynopsis = changes.has_synopsis !== undefined ? true : Boolean(r.has_synopsis || synLen > 0);
    const hasEpisodes = changes.has_episodes !== undefined ? true : Boolean(r.has_episodes || Number(r.episodes_total || 0) > 0);
    const gateOk = hasPoster && hasSynopsis && hasEpisodes && synLen >= 200;

    if (gateOk && r.status === 'draft') {
      changes.status = 'published';
      published++;
    }
    changes.updated_at = new Date().toISOString();

    updates.push({ id: r.id, changes, title: r.title, enriched: enrichedThis });
    if (enrichedThis) enriched++;
  }

  console.log('Backfill updates prepared: ' + updates.length + ' (synopsis enriched: ' + enriched + ', posters added: ' + postersAdded + ')');
  console.log('  Would publish: ' + published + ', still draft: ' + stillDraft);

  if (DRY) {
    console.log('\nDry run - no writes performed.');
    for (const u of updates.slice(0, 10)) {
      console.log('  #' + u.id + ' ' + u.title + ' -> synopsis enriched: ' + u.enriched + (u.changes.status ? ', status: ' + u.changes.status : ''));
    }
    if (updates.length > 10) console.log('  ...and ' + (updates.length - 10) + ' more');
    return;
  }

  let written = 0, errors = 0;
  for (const u of updates) {
    const { error } = await db.from('anime_catalogue').update(u.changes).eq('id', u.id);
    if (error) { errors++; console.error('  FAIL #' + u.id + ' ' + u.title + ': ' + error.message); }
    else written++;
  }

  console.log('\nWritten: ' + written + '/' + updates.length + ', Errors: ' + errors);
  console.log('  Synopses enriched: ' + enriched + ', Posters added: ' + postersAdded);
  console.log('  Drafts published: ' + published + ', Still draft: ' + stillDraft);
}

main().catch(e => { console.error('FATAL: ' + e.message); process.exit(1); });