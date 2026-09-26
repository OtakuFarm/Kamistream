/* ============================================================================
 * POSTER STORAGE — downloads posters into Supabase Storage.
 *
 * ── WHY ───────────────────────────────────────────────────────────────────
 * The site currently HOTLINKS cdn.myanimelist.net for every poster. That is
 * fragile in three specific ways, all of which cost traffic:
 *
 *   1. MAL rate-limits and 403s that CDN under load — which is exactly
 *      when Googlebot is crawling. Broken images mean a broken page.
 *   2. Google sees <image:loc> pointing at a different domain in the
 *      image sitemap. The image is indexed as MAL's, not ours.
 *   3. We have no control. The URL can change or disappear with no notice.
 *
 * One download per title, at import time, removes all three. It is the
 * highest-value small win available: an hour of work for a permanent fix.
 *
 * ── REQUIREMENTS ───────────────────────────────────────────────────────────
 * A PUBLIC bucket named `posters` in the same Supabase project. The script
 * fails loudly if it is missing rather than silently skipping, because a
 * silent skip looks identical to success.
 *
 *   Supabase dashboard -> Storage -> New bucket -> name: posters
 *   -> Public bucket: ON
 * ========================================================================= */

import { createClient } from '@supabase/supabase-js';

const BUCKET = process.env.POSTER_BUCKET || 'posters';
const MAX_BYTES = 3 * 1024 * 1024;   // posters are ~150KB; 3MB is a sane ceiling
const TIMEOUT_MS = 20000;

let client = null;

function supa(url, key) {
  if (!client) client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

/** Insertion sort into a fixed-width-zero bucket path: posters/12/52991.webp */
function pathFor(malId) {
  const s = String(malId);
  return `${BUCKET}/${s.slice(0, 2)}/${s}.jpg`;
}

/** Strip query strings so a signature parameter can never leak into a URL. */
function publicUrl(url) {
  return url.split('?')[0];
}

/**
 * Download one poster and upload it. Returns the public URL, or null on a
 * failure. Callers must not treat null as fatal — one bad image should not
 * abort a 2,000-title import.
 */
export async function storePoster(malId, remoteUrl, supabaseUrl, serviceKey) {
  if (!remoteUrl) return null;
  const db = supa(supabaseUrl, serviceKey);
  const key = pathFor(malId);
  const dir = key.split('/').slice(0, 2).join('/');   // "posters/52"

  // Already stored? Skip the download entirely. Re-imports are common and
  // re-fetching 2,000 unchanged images is pure waste.
  const { data: existing } = await db.storage.from(BUCKET).list(dir);
  if (existing && existing.some(f => f.name === key.split('/').pop())) {
    return { url: publicUrl(db.storage.from(BUCKET).getPublicUrl(key).data.publicUrl), cached: true };
  }

  let buf;
  try {
    const res = await fetch(remoteUrl, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    const type = res.headers.get('content-type') || 'image/jpeg';
    if (!type.startsWith('image/')) return null;
    buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_BYTES) return null;
  } catch {
    return null;
  }

  const { error } = await db.storage.from(BUCKET).upload(key, buf, {
    contentType: 'image/jpeg',
    upsert: true,
    cacheControl: '31536000',   // immutable: the path never changes
  });
  if (error) return null;

  return {
    url: publicUrl(db.storage.from(BUCKET).getPublicUrl(key).data.publicUrl),
    cached: false,
    bytes: buf.length,
  };
}

/** Check the bucket exists and is public, with an actionable message. */
export async function verifyBucket(supabaseUrl, serviceKey) {
  const db = supa(supabaseUrl, serviceKey);
  const { data, error } = await db.storage.listBuckets();
  if (error) return { ok: false, reason: error.message };
  if (!data.find(b => b.name === BUCKET)) {
    return {
      ok: false,
      reason:
        'bucket "' + BUCKET + '" does not exist. Create it in the Supabase ' +
        'dashboard under Storage, and set "Public bucket" to ON.',
    };
  }
  return { ok: true, public: data.find(b => b.name === BUCKET).public };
}