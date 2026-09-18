import React from 'react';
import { useSearch } from 'wouter';
import { useAnimeSearch } from '@/lib/jikan';
import { AnimeCard } from '@/components/AnimeCard';
import { GridSkeleton } from '@/components/LoadingSkeleton';
import { SearchIcon } from 'lucide-react';
import { useSEO } from '@/hooks/useSEO';

export default function SearchPage() {
  const searchStr = useSearch();
  const params = new URLSearchParams(searchStr);
  const q = params.get('q') || '';

  const { data, isLoading } = useAnimeSearch(q);

  useSEO({
    title: q ? `Search: "${q}"` : 'Search',
    description: q ? `Anime search results for "${q}" on KamiStream` : 'Search for anime on KamiStream',
  });

  return (
    <div className="p-4 md:p-6 pb-20">
      <div className="mb-6">
        <h1 className="text-2xl font-heading font-black text-white">
          {q ? (
            <>Search results for <span className="text-[var(--pink)]">"{q}"</span></>
          ) : (
            'Search'
          )}
        </h1>
        {!isLoading && data?.data && (
          <p className="text-[13px] text-[var(--text3)] mt-1">
            {data.data.length} result{data.data.length !== 1 ? 's' : ''} found
          </p>
        )}
      </div>

      {!q ? (
        <div className="flex flex-col items-center justify-center min-h-[40vh] text-center">
          <SearchIcon className="w-16 h-16 text-white/10 mb-4" />
          <p className="text-[var(--text3)] text-[14px]">Type something in the search bar above</p>
        </div>
      ) : isLoading ? (
        <GridSkeleton />
      ) : data?.data?.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {data.data.map((anime: any) => (
            <AnimeCard key={anime.mal_id} anime={anime} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center min-h-[40vh] text-center">
          <SearchIcon className="w-16 h-16 text-white/10 mb-4" />
          <p className="text-white font-heading font-black text-lg mb-2">No results found</p>
          <p className="text-[var(--text3)] text-[13px]">Try a different title or spelling</p>
        </div>
      )}
    </div>
  );
}
