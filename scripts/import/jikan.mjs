/* ============================================================================
 * RATE-LIMITED JIKAN CLIENT — shared by every importer.
 *
 * ── WHY THIS IS SEPARATE ──────────────────────────────────────────────────
 * Importing a catalogue means tens of thousands of Jikan calls. Three facts
 * make the difference between a clean import and a ruined one:
 *
 *   1. Jikan allows ~3 requests/second. Exceed it and you get 429s.
 *   2. A 429 that is not retried SILENTLY DROPS a title. That is exactly
 *      how the old api/sitemap-anime.js ended up listing 50 URLs instead of
 *      200 — it walked 4 pages and let each 429 discard 25 titles.
 *   3. A partially-failed import looks successful. Every importer here
 *      reports what it skipped rather than just what it wrote.
 *
 * So: one queue, one gap, bounded retries with backoff, and a Jikan-aware
 * Retry-After. The queue is module-level so parallel importers share it
 * rather than each believing it has the API to itself.
 * ========================================================================= */

export const JIKAN = 'https://api.jikan.moe/v4';

/** ~2.8 req/sec. Jikan documents 3; staying under it is cheaper than
 *  discovering the exact ceiling with 429s. */
const MIN_GAP_MS = 360;
const MAX_RETRIES = 4;
const TIMEOUT_MS = 30000;

let lastRequestAt = 0;
let queue = [];
let draining = false;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Serialise every call through one gap, however many callers there are. */
function enqueue(fn) {
  return new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject });
    drain();
  });
}

function drain() {
  if (draining || queue.length === 0) return;
  draining = true;
  const next = queue.shift();
  const wait = Math.max(0, lastRequestAt + MIN_GAP_MS - Date.now());
  setTimeout(async () => {
    lastRequestAt = Date.now();
    try {
      next.resolve(await next.fn());
    } catch (err) {
      next.reject(err);
    } finally {
      draining = false;
      drain();
    }
  }, wait);
}

/**
 * GET a Jikan path with retries. Returns the parsed body, or null on a 404
 * (which is a normal answer: the title does not exist).
 */
export function jikan(pathname, { allow404 = true } = {}) {
  return enqueue(async () => {
    let lastErr;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(JIKAN + pathname, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });

        if (res.status === 404 && allow404) return null;
        if (res.ok) return await res.json();

        if (res.status === 429 || res.status >= 500) {
          // Honour Retry-After when Jikan sends it; it is more accurate than
          // our own guess and avoids burning the remaining retries.
          const ra = Number(res.headers.get('retry-after'));
          throw Object.assign(new Error('HTTP ' + res.status), {
            retryAfterMs: Number.isFinite(ra) && ra > 0 ? ra * 1000 : null,
          });
        }
        return null;
      } catch (err) {
        lastErr = err;
        if (attempt === MAX_RETRIES) break;
        const wait = err.retryAfterMs ?? 1200 * attempt;
        await sleep(wait);
      }
    }
    throw lastErr;
  });
}

/** Convenience: /anime/{id}/full */
export const animeFull = (id) => jikan(`/anime/${id}/full`);

/**
 * All episodes for a title.
 *
 * Jikan pages these 25 at a time and `pagination.has_next_page` drives the
 * loop. A 100-episode series is four calls, which is why this is the most
 * expensive part of an import and why `--no-episodes` exists.
 *
 * IMPORTANT: this endpoint is Jikan's least reliable. Verified live, it
 * returns 504 for titles that /anime/{id}/full serves fine — Frieren
 * (52991) among them. So a failure here is expected, not exceptional, and
 * the fallback matters:
 *
 *   1. try Jikan's episode list
 *   2. on failure, SYNTHESISE numbered rows from the episode count already
 *      on the /anime/{id}/full record
 *
 * A synthesised row has a number and no title, which is still worth having:
 * it gives the detail page a real episode list to link from, and the whole
 * point of that list is internal linking, not per-episode prose. An empty
 * list gives the page nothing. This is also what the existing AniList
 * fallback in src/lib/jikan.ts already does, so the two paths agree.
 */
export async function animeEpisodes(id, { knownCount = null } = {}) {
  const out = [];
  try {
    // The page cap is derived, not fixed. A hard 20-page limit silently
    // truncated long-runners: One Piece reported 600 of 800 episodes,
    // which puts a wrong number on a page that claims to have the list.
    // knownCount gives the ceiling, plus headroom for Jikan being ahead of
    // or behind the record's episode field.
    const cap = Number.isInteger(knownCount) && knownCount > 0
      ? Math.ceil(knownCount / 25) + 4
      : 120;
    for (let page = 1; page <= cap; page++) {
      const d = await jikan(`/anime/${id}/episodes?page=${page}`);
      const list = d?.data ?? [];
      out.push(...list);
      if (!d?.pagination?.has_next_page || list.length === 0) break;
    }
    if (out.length) return out;
  } catch {
    // fall through to synthesis
  }

  if (Number.isInteger(knownCount) && knownCount > 0) {
    for (let n = 1; n <= knownCount; n++) {
      out.push({ mal_id: n, title: null, title_japanese: null, aired: null, filler: false, recap: false });
    }
  }
  return out;
}

/** One page of the browse listing. Used by bulk-import to harvest MAL ids. */
export async function animePage(page, params = {}) {
  const q = new URLSearchParams({ limit: '25', page: String(page), sfw: 'true', ...params });
  return jikan(`/anime?${q}`);
}