// ── MangaDex API wrapper ─────────────────────────────────────────
// All requests go through /api/mangadex (Vercel proxy) to avoid
// CORS issues with direct browser calls to api.mangadex.org.
//
// Free API, no key needed. Rate limit: 5 req/sec upstream.
// Docs: https://api.mangadex.org/docs

const PROXY       = '/api/mangadex';
const COVER_BASE  = 'https://uploads.mangadex.org/covers';

// ── Types ─────────────────────────────────────────────────────────
export interface MangaCover {
  id: string;
  fileName: string;
}

export interface MangaItem {
  id: string;
  title: string;
  altTitles: string[];
  description: string;
  status: string;
  year: number | null;
  contentRating: string;
  tags: string[];
  coverUrl: string | null;
  author: string | null;
  lastChapter: string | null;
  chapterCount: number;
}

export interface Chapter {
  id: string;
  chapter: string | null;
  title: string | null;
  volume: string | null;
  language: string;
  pages: number;
  publishAt: string;
  scanlationGroup: string | null;
}

export interface ChapterPage {
  url: string;
  index: number;
}

// ── Internal fetch helper ─────────────────────────────────────────
// Builds a proxied URL: /api/mangadex?path=/manga&limit=20&...
async function mdFetch(path: string, params: Record<string, string | string[]> = {}): Promise<any> {
  const qs = new URLSearchParams({ path });

  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      value.forEach(v => qs.append(key, v));
    } else {
      qs.append(key, value);
    }
  }

  const r = await fetch(`${PROXY}?${qs.toString()}`);
  if (!r.ok) return null;
  return r.json();
}

// ── Helpers ───────────────────────────────────────────────────────
function getTitle(attrs: any): string {
  return attrs.title?.en
    || Object.values(attrs.title || {})[0] as string
    || 'Unknown Title';
}

function getDescription(attrs: any): string {
  return attrs.description?.en
    || Object.values(attrs.description || {})[0] as string
    || '';
}

function getCoverUrl(mangaId: string, relationships: any[]): string | null {
  const cover = relationships?.find((r: any) => r.type === 'cover_art');
  if (!cover?.attributes?.fileName) return null;
  return `${COVER_BASE}/${mangaId}/${cover.attributes.fileName}.512.jpg`;
}

function getAuthor(relationships: any[]): string | null {
  const author = relationships?.find((r: any) => r.type === 'author');
  return author?.attributes?.name || null;
}

function parseManga(data: any): MangaItem {
  const attrs = data.attributes || {};
  const rels  = data.relationships || [];
  return {
    id:            data.id,
    title:         getTitle(attrs),
    altTitles:     (attrs.altTitles || []).flatMap((t: any) => Object.values(t)) as string[],
    description:   getDescription(attrs),
    status:        attrs.status || 'unknown',
    year:          attrs.year || null,
    contentRating: attrs.contentRating || 'safe',
    tags:          (attrs.tags || []).map((t: any) => t.attributes?.name?.en || '').filter(Boolean),
    coverUrl:      getCoverUrl(data.id, rels),
    author:        getAuthor(rels),
    lastChapter:   attrs.lastChapter || null,
    chapterCount:  0,
  };
}

// ── API functions ─────────────────────────────────────────────────

// Search manga
export async function searchManga(query: string, limit = 20, offset = 0): Promise<MangaItem[]> {
  const json = await mdFetch('/manga', {
    title:             query,
    limit:             String(limit),
    offset:            String(offset),
    'includes[]':      ['cover_art', 'author'],
    'contentRating[]': ['safe', 'suggestive'],
    'order[relevance]': 'desc',
  });
  return (json?.data || []).map(parseManga);
}

// Get trending/popular manga
export async function getPopularManga(limit = 20): Promise<MangaItem[]> {
  const json = await mdFetch('/manga', {
    limit:                  String(limit),
    'includes[]':           ['cover_art', 'author'],
    'contentRating[]':      ['safe', 'suggestive'],
    'order[followedCount]': 'desc',
    hasAvailableChapters:   'true',
  });
  return (json?.data || []).map(parseManga);
}

// Get latest updated manga
export async function getLatestManga(limit = 20): Promise<MangaItem[]> {
  const json = await mdFetch('/manga', {
    limit:                            String(limit),
    'includes[]':                     ['cover_art', 'author'],
    'contentRating[]':                ['safe', 'suggestive'],
    'order[latestUploadedChapter]':   'desc',
    hasAvailableChapters:             'true',
  });
  return (json?.data || []).map(parseManga);
}

// Get manga by genre/tag ID
export async function getMangaByTag(tagId: string, limit = 24): Promise<MangaItem[]> {
  const json = await mdFetch('/manga', {
    limit:                  String(limit),
    'includes[]':           'cover_art',
    'contentRating[]':      ['safe', 'suggestive'],
    'includedTags[]':       tagId,
    'order[followedCount]': 'desc',
  });
  return (json?.data || []).map(parseManga);
}

// Get single manga detail
export async function getMangaDetail(id: string): Promise<MangaItem | null> {
  const json = await mdFetch(`/manga/${id}`, {
    'includes[]': ['cover_art', 'author', 'artist'],
  });
  if (!json?.data) return null;
  return parseManga(json.data);
}

// Get chapter list for a manga (English only, sorted newest first)
export async function getMangaChapters(mangaId: string, limit = 100, offset = 0): Promise<Chapter[]> {
  const json = await mdFetch('/chapter', {
    manga:                  mangaId,
    limit:                  String(limit),
    offset:                 String(offset),
    'translatedLanguage[]': 'en',
    'order[chapter]':       'desc',
    'includes[]':           'scanlation_group',
  });
  return (json?.data || []).map((c: any) => ({
    id:              c.id,
    chapter:         c.attributes?.chapter || null,
    title:           c.attributes?.title   || null,
    volume:          c.attributes?.volume  || null,
    language:        c.attributes?.translatedLanguage || 'en',
    pages:           c.attributes?.pages   || 0,
    publishAt:       c.attributes?.publishAt || '',
    scanlationGroup: c.relationships?.find((r: any) => r.type === 'scanlation_group')?.attributes?.name || null,
  }));
}

// Get chapter pages (actual image URLs)
// The at-home server endpoint is the main one that needs proxying.
export async function getChapterPages(chapterId: string): Promise<ChapterPage[]> {
  const json = await mdFetch(`/at-home/server/${chapterId}`);
  if (!json) return [];

  const base      = json.baseUrl;
  const hash      = json.chapter?.hash;
  const data      = json.chapter?.data      || []; // high quality
  const dataSaver = json.chapter?.dataSaver || []; // compressed

  // Prefer data-saver for mobile performance
  const pages = dataSaver.length > 0 ? dataSaver : data;
  const path  = dataSaver.length > 0 ? 'data-saver' : 'data';

  return pages.map((file: string, index: number) => ({
    url:   `${base}/${path}/${hash}/${file}`,
    index,
  }));
}

// Get all available genre tags
export async function getMangaTags(): Promise<{ id: string; name: string }[]> {
  const json = await mdFetch('/manga/tag');
  return (json?.data || [])
    .filter((t: any) => t.attributes?.group === 'genre')
    .map((t: any) => ({ id: t.id, name: t.attributes?.name?.en || '' }))
    .filter((t: any) => t.name)
    .sort((a: any, b: any) => a.name.localeCompare(b.name));
}
