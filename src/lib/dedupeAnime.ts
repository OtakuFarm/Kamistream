/**
 * dedupeByMalId
 * ─────────────
 * Removes duplicate anime entries from any array by mal_id.
 * Always keeps the FIRST occurrence (preserves original sort order).
 *
 * Use this after any flatMap across infinite query pages, and any time
 * you merge arrays from multiple API sources.
 */
export function dedupeByMalId<T extends { mal_id: number | string }>(items: T[]): T[] {
  const seen = new Set<number | string>();
  return items.filter(item => {
    if (!item.mal_id || seen.has(item.mal_id)) return false;
    seen.add(item.mal_id);
    return true;
  });
}
