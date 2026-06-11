import React from 'react';
import { useRoute } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { getMangaDetail, getMangaChapters } from '@/lib/mangadex';
import { MangaReader } from '@/components/MangaReader';
import { Loader2 } from 'lucide-react';

export default function MangaReaderPage() {
  const [, params] = useRoute('/manga/:id/chapter/:chapterId');
  const mangaId   = params?.id || '';
  const chapterId = params?.chapterId || '';

  const { data: manga }    = useQuery({
    queryKey: ['manga', mangaId],
    queryFn:  () => getMangaDetail(mangaId),
    enabled:  !!mangaId, staleTime: 30 * 60 * 1000,
  });

  const { data: chapters, isLoading } = useQuery({
    queryKey: ['manga', mangaId, 'chapters'],
    queryFn:  () => getMangaChapters(mangaId, 500),
    enabled:  !!mangaId, staleTime: 10 * 60 * 1000,
  });

  if (isLoading || !chapters || !manga) return (
    <div className="flex items-center justify-center min-h-screen bg-black">
      <Loader2 className="w-10 h-10 text-[var(--pink)] animate-spin" />
    </div>
  );

  // Find current chapter index in the list (chapters are newest-first)
  const currentIdx = chapters.findIndex(c => c.id === chapterId);
  const current    = chapters[currentIdx];
  // Next chapter = earlier in array (lower index = newer)
  // Prev chapter = later in array (higher index = older)
  const nextCh     = currentIdx > 0                 ? chapters[currentIdx - 1] : null;
  const prevCh     = currentIdx < chapters.length - 1 ? chapters[currentIdx + 1] : null;

  return (
    <MangaReader
      mangaId={mangaId}
      mangaTitle={manga.title}
      coverUrl={manga.coverUrl}
      chapterId={chapterId}
      chapter={current?.chapter || '?'}
      chapterTitle={current?.title || null}
      prevChapterId={prevCh?.id || null}
      nextChapterId={nextCh?.id || null}
      prevChapter={prevCh?.chapter || null}
      nextChapter={nextCh?.chapter || null}
    />
  );
}
