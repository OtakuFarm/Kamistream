// AniList GraphQL helpers for the main site
import type { AniListNextAiring, AiringScheduleItem } from '@/types';

const ANILIST_API = 'https://graphql.anilist.co';

async function queryAniList(query: string, variables: Record<string, any> = {}) {
  const res = await fetch(ANILIST_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error('AniList error');
  return res.json();
}

// Get next airing episode info for a single anime by MAL ID
export async function getNextAiring(malId: number | string): Promise<AniListNextAiring | null> {
  const data = await queryAniList(
    `query($m:Int){Media(idMal:$m,type:ANIME){id nextAiringEpisode{episode airingAt timeUntilAiring}}}`,
    { m: Number(malId) }
  );
  return data?.data?.Media?.nextAiringEpisode || null;
}

// Get this week's airing schedule (for home page)
export async function getAiringSchedule(): Promise<AiringScheduleItem[]> {
  const now = Math.floor(Date.now() / 1000);
  const weekEnd = now + 7 * 24 * 60 * 60;
  const data = await queryAniList(
    `query($s:Int,$e:Int){
      Page(perPage:50){
        airingSchedules(airingAt_greater:$s, airingAt_lesser:$e, sort:TIME){
          airingAt episode timeUntilAiring
          media{
            id idMal title{romaji english} coverImage{large}
            format episodes averageScore status
          }
        }
      }
    }`,
    { s: now, e: weekEnd }
  );
  return data?.data?.Page?.airingSchedules || [];
}
