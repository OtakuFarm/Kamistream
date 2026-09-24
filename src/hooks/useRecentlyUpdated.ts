import { useQuery } from '@tanstack/react-query';
import { getRecentlyAired } from '@/lib/anilist';
import { supabase } from '@/lib/supabase';
import { fetchJikan, withALFallback } from '@/lib/jikan';
import { jikanToAL } from '@/lib/jikanFetch';

/**
 * Recently Updated — anime that aired in the past 72 hrs AND have a
 * watchable source in Supabase. Cross-references the AniList schedule with
 * embed_sources so only anime we've actually uploaded sources for appear.
 *
 * Shared by:
 *   • home.tsx              — the "Recently Updated" row (limit 12)
 *   • latest-episodes.tsx   — the /latest-episodes hub (limit 24)
 *
 * The crawlable twin of this data lives in api/latest.js (which renders the
 * server HTML Google sees for /latest-episodes) — keep the join logic in
 * sync if you change it here.
 */
export function useRecentlyUpdated(limit = 12) {
  return useQuery({
    queryKey: ['recently-updated', limit],
    queryFn: async () => {
      // Step 1: fetch episodes that aired in the last 72 hours from AniList
      const aired = await getRecentlyAired(72);
      if (!aired.length) return [];

      // Step 2: pull all active mal_ids from Supabase that have embed sources
      const { data: sourceRows, error } = await supabase
        .from('embed_sources')
        .select('episodes(episode_number, anime(mal_id, title_english, title_romaji, cover_image, score, episodes_total))')
        .eq('is_active', true)
        .limit(200);

      if (error || !sourceRows) return [];

      // Build a map: mal_id → { latestEp, animeRow } from Supabase
      const supabaseMap = new Map<number, { latestEp: number; row: any }>();
      // Cast: the untyped client infers never[] here (same pre-existing
      // pattern as useWatchlist/useSocial — the build never runs tsc).
      for (const s of sourceRows as any[]) {
        const a   = s.episodes?.anime;
        const ep  = s.episodes?.episode_number;
        if (!a?.mal_id || !ep) continue;
        const existing = supabaseMap.get(a.mal_id);
        // Keep the highest episode number per anime
        if (!existing || ep > existing.latestEp) {
          supabaseMap.set(a.mal_id, { latestEp: ep, row: a });
        }
      }

      // Step 3: filter aired episodes to only those in Supabase, dedupe by mal_id
      const seen    = new Set<number>();
      const results: any[] = [];

      for (const item of aired) {
        const malId = item.media?.idMal;
        if (!malId || seen.has(malId)) continue;
        const supaEntry = supabaseMap.get(malId);
        if (!supaEntry) continue; // not on our site — skip

        seen.add(malId);
        const m = item.media;

        // Use Supabase metadata if richer, AniList as fallback for cover image
        const a = supaEntry.row;
        results.push({
          mal_id:   malId,
          title:    a.title_english || a.title_romaji || m.title?.english || m.title?.romaji || 'Unknown',
          score:    a.score ?? (m.averageScore ? +(m.averageScore / 10).toFixed(1) : null),
          episodes: a.episodes_total ?? m.episodes ?? null,
          type:     'TV',
          // Show the episode that actually just aired (from schedule), not just the latest in DB
          latestEp: item.episode,
          // Prefer Supabase cover, fall back to AniList cover
          images: {
            webp: { large_image_url: a.cover_image || m.coverImage?.extraLarge || m.coverImage?.large || '' },
            jpg:  { large_image_url: a.cover_image || m.coverImage?.extraLarge || m.coverImage?.large || '' },
          },
          // Store airingAt so we can sort by it
          _airingAt: item.airingAt,
        });

        if (results.length >= limit) break;
      }

      // Sort by most recently aired first
      const sorted = results.sort((a, b) => (b._airingAt ?? 0) - (a._airingAt ?? 0));
      if (sorted.length > 0) return sorted;

      // Fallback: Supabase has no embed sources configured (or none active),
      // so the section would render as an empty box. Serve recently-started
      // airing anime instead so it is never blank.
      const ep = '/anime?status=airing&order_by=start_date&sort=desc&limit=5&sfw=true';
      const j = await withALFallback<any>(() => fetchJikan<any>(ep), () => jikanToAL(ep));
      return (j.data || []).map((a: any) => ({ ...a, _fallback: true }));
    },
    staleTime: 10 * 60 * 1000, // refresh every 10 min — schedule changes frequently
  });
}
