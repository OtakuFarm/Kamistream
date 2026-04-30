import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAnimeSearch, useAnimeByGenre } from '@/lib/jikan';
import { AnimeCard } from '@/components/AnimeCard';
import { GridSkeleton } from '@/components/LoadingSkeleton';

const GENRES = [
  { id: '', name: 'All' },
  { id: '1', name: 'Action' },
  { id: '2', name: 'Adventure' },
  { id: '4', name: 'Comedy' },
  { id: '8', name: 'Drama' },
  { id: '10', name: 'Fantasy' },
  { id: '22', name: 'Romance' },
  { id: '24', name: 'Sci-Fi' },
  { id: '36', name: 'Slice of Life' },
  { id: '30', name: 'Sports' },
  { id: '37', name: 'Supernatural' },
  { id: '41', name: 'Thriller' }
];

export default function Browse() {
  const [location] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const q = searchParams.get('q') || '';
  
  const [activeGenre, setActiveGenre] = useState('');
  
  const { data: searchResults, isLoading: searchLoading } = useAnimeSearch(q);
  const { data: genreResults, isLoading: genreLoading } = useAnimeByGenre(activeGenre);

  const displayData = q ? searchResults?.data : (activeGenre ? genreResults?.data : genreResults?.data); // default to all if no genre/query but we need a general fetch. For now if no query, just fetch genre.
  const isLoading = q ? searchLoading : genreLoading;

  useEffect(() => {
    if (q) setActiveGenre('');
  }, [q]);

  return (
    <div className="p-4 md:p-6 pb-20">
      <div className="mb-8">
        <h1 className="text-2xl font-heading font-black text-white mb-6">
          {q ? `Search Results for "${q}"` : 'Browse Anime'}
        </h1>

        {!q && (
          <div className="flex flex-wrap gap-2">
            {GENRES.map(g => (
              <button
                key={g.name}
                onClick={() => setActiveGenre(g.id)}
                className={`px-4 py-1.5 rounded-full text-[12px] font-bold transition-all ${activeGenre === g.id ? 'bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white' : 'bg-[var(--card)] text-[var(--text2)] border border-[var(--border)] hover:border-[var(--purple)] hover:text-white'}`}
              >
                {g.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {isLoading ? (
        <GridSkeleton />
      ) : displayData?.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {displayData.map((anime: any) => (
            <AnimeCard key={anime.mal_id} anime={anime} />
          ))}
        </div>
      ) : (
        <div className="text-center py-20 text-[var(--text3)]">
          No anime found.
        </div>
      )}
    </div>
  );
}
