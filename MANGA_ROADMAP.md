# KamiStream Manga Platform — Stage 4 Roadmap

## Branch strategy
Create a separate git branch before starting:
```
git checkout -b feature/manga
```
Never merge into main until fully tested.

## API
Use MangaDex API (free, no key needed):
- Base: https://api.mangadex.org
- Search: GET /manga?title={q}&limit=20
- Detail: GET /manga/{id}
- Chapters: GET /manga/{id}/aggregate
- Pages: GET /at-home/server/{chapter_id}

## New Supabase tables needed
```sql
CREATE TABLE manga_progress (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade,
  manga_id    text not null,          -- MangaDex UUID
  chapter_id  text not null,
  page        int default 0,
  updated_at  timestamptz default now(),
  unique(user_id, manga_id, chapter_id)
);

CREATE TABLE manga_bookmarks (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid references auth.users(id) on delete cascade,
  manga_id  text not null,
  title     text,
  cover_url text,
  added_at  timestamptz default now(),
  unique(user_id, manga_id)
);
```

## Files to create
```
src/pages/manga/index.tsx          -- /manga (browse)
src/pages/manga/[id].tsx           -- /manga/:id (detail)
src/pages/manga/reader.tsx         -- /manga/:id/chapter/:chapterId
src/pages/manga/trending.tsx       -- /manga/trending
src/components/MangaCard.tsx
src/components/MangaReader.tsx
src/components/ChapterList.tsx
src/lib/mangadex.ts               -- API wrapper
src/hooks/useMangaProgress.ts
src/hooks/useMangaBookmarks.ts
```

## App.tsx routes to add (when ready)
```tsx
const MangaHome   = lazy(() => import('@/pages/manga/index'));
const MangaDetail = lazy(() => import('@/pages/manga/[id]'));
const MangaReader = lazy(() => import('@/pages/manga/reader'));

<Route path="/manga"                            component={...} />
<Route path="/manga/:id"                        component={...} />
<Route path="/manga/:id/chapter/:chapterId"     component={...} />
```

## DO NOT start until:
- [ ] All current anime features stable
- [ ] Supabase tables created and tested
- [ ] Feature branch created
- [ ] Tested locally before deploying
