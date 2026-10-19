/*
 * BATCH IMPORT — import multiple MAL IDs at once from a CSV string.
 * This is a helper module for the admin panel's CSV import feature.
 *
 *   import { batchImportFromMalIds } from './batch-import.mjs';
 *   const results = await batchImportFromMalIds('52991,113415,200022', { publish: true });
 *
 * This reuses the same normaliser and DB client as the bulk importer,
 * but takes a flat list of IDs instead of paginating through Jikan.
 */

import { createClient } from '@supabase/supabase-js';
import { normalizeAnime, slugifyTitle, readiness } from './normalize.mjs';
import { fetchJikan } from './jikan.mjs';
import { fetchAniListByMalIds, normalizeFromAniList } from './anilist.mjs';

const JIKAN = 'https://api.jikan.moe/v4';
const ANILIST = 'https://graphql.anilist.co';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── public API ──────────────────────────────────────────────────────────
export async function batchImportFromMalIds(malIds, opts = {}) {
  const {
    supabaseUrl,
    supabaseKey,
    publish = false,
    dryRun = false,
    dbOverride = null,
  } = opts;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing SUPABASE_URL / SUPABASE_SERVICE_KEY');
  }

  const db = dbOverride || createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });

  const uniqueIds = [...new Set(malIds.map(Number))].filter(n => Number.isInteger(n) && n > 0);
  const results = [];
  const started = Date.now();

  // Batched AniList prefetch — 50 per request
  console.log(`[batch] prefetching ${uniqueIds.length} titles from AniList…`);
  const mediaByMalId = await fetchAniListByMalIds(uniqueIds);
  console.log(`[batch]   got ${mediaByMalId.size} from AniList`);

  for (let i = 0; i < uniqueIds.length; i++) {
    const id = uniqueIds[i];
    let r;

    try {
      const alMedia = mediaByMalId.get(id);
      let norm = null;

      if (alMedia) {
        norm = normalizeFromAniList(alMedia);
      } else {
        // Fallback to Jikan
        const jikan = await fetchJikan(id);
        if (!jikan?.data) {
          results.push({ malId: id, ok: false, reason: 'not found' });
          continue;
        }
        norm = normalizeAnime(jikan.data);
      }

      if (!norm) {
        results.push({ malId: id, ok: false, reason: 'normalised to null' });
        continue;
      }

      // Insert or update
      const { data: existing, error: selectErr } = await db
        .from('anime_catalogue')
        .select('id')
        .eq('mal_id', id)
        .maybeSingle();

      if (selectErr) throw selectErr;

      if (existing) {
        if (dryRun) {
          results.push({ malId: id, ok: true, action: 'exists', title: norm.title });
        } else {
          // Diff and only update changed fields
          const { diffAnime } = await import('./normalize.mjs');
          const changes = diffAnime(norm, existing);
          const { data: updated, error: updErr } = await db
            .from('anime_catalogue')
            .update({ ...norm, updated_at: new Date().toISOString() })
            .eq('id', existing.id);

          if (updErr) throw updErr;

          results.push({
            malId: id,
            ok: true,
            action: 'updated',
            title: norm.title,
            changes: Object.keys(changes).length,
            publishable: readiness(norm).ok,
          });
        }
      } else {
        if (dryRun) {
          results.push({ malId: id, ok: true, action: 'new', title: norm.title });
        } else {
          norm.mal_id = id;
          const { data: inserted, error: insErr } = await db
            .from('anime_catalogue')
            .insert([norm])
            .select()
            .single();

          if (insErr) throw insErr;

          results.push({
            malId: id,
            ok: true,
            action: 'imported',
            title: norm.title,
            id: inserted.id,
            publishable: readiness(norm).ok,
          });
        }
      }

      if (publish && !dryRun && results[results.length - 1].ok && results[results.length - 1].publishable) {
        const { error: pubErr } = await db
          .from('anime_catalogue')
          .update({ status: 'published' })
          .eq('mal_id', id)
          .eq('status', 'draft');

        if (pubErr) {
          console.warn(`[batch] publish failed for ${id}: ${pubErr.message}`);
        }
      }
    } catch (err) {
      results.push({ malId: id, ok: false, reason: err.message });
    }

    // Jikan rate limit gap
    if (i < uniqueIds.length - 1 && !dryRun) {
      await sleep(300);
    }

    if (i % 10 === 0) {
      console.log(`[batch]   ${i + 1}/${uniqueIds.length} done (${Math.round((i + 1) / uniqueIds.length * 100)}%)`);
    }
  }

  const ok = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;

  console.log(`[batch] done (${new Date().toISOString()}): ${ok} imported, ${failed} failed (${Math.round(ok / uniqueIds.length * 100)}%)`);

  return {
    jobId: null,
    malIds: uniqueIds,
    results,
    summary: {
      total: uniqueIds.length,
      imported: ok,
      failed,
      duration: Date.now() - started,
    },
  };
}
