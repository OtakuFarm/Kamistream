import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSEO } from '@/hooks/useSEO';
import { MangaCard } from '@/components/MangaCard';
import { getMangaTags, getMangaByTag } from '@/lib/mangadex';
import { Tag, Loader2 } from 'lucide-react';

export default function MangaGenres() {
  useSEO({ title: 'Manga Genres', description: 'Browse manga by genre on KamiStream.' });
  const [selectedTag, setSelectedTag] = useState<{ id: string; name: string } | null>(null);

  const { data: tags, isLoading: tagsLoading } = useQuery({
    queryKey: ['manga', 'tags'],
    queryFn:  getMangaTags,
    staleTime: 60 * 60 * 1000,
  });

  const { data: manga, isLoading: mangaLoading } = useQuery({
    queryKey: ['manga', 'by-tag', selectedTag?.id],
    queryFn:  () => getMangaByTag(selectedTag!.id),
    enabled:  !!selectedTag,
    staleTime: 15 * 60 * 1000,
  });

  return (
    <div className="p-4 md:p-6 pb-20 max-w-7xl mx-auto">
      <h1 className="text-[24px] font-heading font-black text-white flex items-center gap-2 mb-6">
        <Tag className="w-6 h-6 text-[var(--pink)]" /> Manga Genres
      </h1>

      {/* Tag cloud */}
      {tagsLoading ? (
        <div className="flex gap-2 flex-wrap mb-8">
          {Array.from({ length: 20 }).map((_, i) => <div key={i} className="h-8 w-20 bg-[var(--card)] rounded-full animate-pulse" />)}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 mb-8">
          {(tags || []).map(tag => (
            <button key={tag.id} onClick={() => setSelectedTag(t => t?.id === tag.id ? null : tag)}
              className={`px-3 py-1.5 rounded-full text-[12px] font-bold border transition-all hover:scale-105 ${
                selectedTag?.id === tag.id
                  ? 'bg-[var(--pink)] border-[var(--pink)] text-white shadow-lg shadow-[var(--pink)]/30'
                  : 'bg-[var(--card)] border-[var(--border)] text-[var(--text2)] hover:border-[var(--pink)]/40 hover:text-white'
              }`}>
              {tag.name}
            </button>
          ))}
        </div>
      )}

      {/* Results */}
      {selectedTag && (
        <div>
          <h2 className="text-[16px] font-heading font-black text-white mb-4">
            {selectedTag.name}
            <span className="text-[var(--text3)] font-normal text-[13px] ml-2">manga</span>
          </h2>
          {mangaLoading ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2">
              {Array.from({ length: 24 }).map((_, i) => <div key={i} className="aspect-[2/3] rounded-xl bg-[var(--card)] animate-pulse" />)}
            </div>
          ) : manga && manga.length > 0 ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2">
              {manga.map(m => <MangaCard key={m.id} manga={m} />)}
            </div>
          ) : (
            <p className="text-[var(--text3)] text-center py-10">No manga found for this genre</p>
          )}
        </div>
      )}

      {!selectedTag && !tagsLoading && (
        <div className="text-center py-16 text-[var(--text3)]">
          <Tag className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="text-[16px] font-black text-white mb-2">Pick a genre</p>
          <p className="text-[13px]">Select any genre above to browse manga</p>
        </div>
      )}
    </div>
  );
}
