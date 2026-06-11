import React from 'react';
import { Link } from 'wouter';
import { BookOpen, Star } from 'lucide-react';
import type { MangaItem } from '@/lib/mangadex';
import { useMangaBookmarks } from '@/hooks/useMangaBookmarks';
import { useMangaProgress } from '@/hooks/useMangaProgress';

interface Props {
  manga: MangaItem;
  showProgress?: boolean;
}

export function MangaCard({ manga, showProgress = false }: Props) {
  const { isBookmarked } = useMangaBookmarks();
  const { getProgress }  = useMangaProgress();
  const progress = showProgress ? getProgress(manga.id) : null;
  const bookmarked = isBookmarked(manga.id);

  return (
    <Link href={`/manga/${manga.id}`}>
      <div className="kami-card group relative bg-[var(--card)] rounded-lg overflow-hidden cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/40">

        {/* Cover */}
        <div className="relative aspect-[2/3] overflow-hidden bg-[var(--bg3)]">
          {manga.coverUrl ? (
            <img
              src={manga.coverUrl}
              alt={manga.title}
              loading="lazy"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <BookOpen className="w-8 h-8 text-[var(--text3)]" />
            </div>
          )}

          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

          {/* Status badge */}
          {manga.status && (
            <div className="absolute top-1.5 left-1.5">
              <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-wide ${
                manga.status === 'ongoing'   ? 'bg-[var(--green)]/80 text-white' :
                manga.status === 'completed' ? 'bg-[var(--blue)]/80 text-white'  :
                                               'bg-black/60 text-white/70'
              }`}>
                {manga.status}
              </span>
            </div>
          )}

          {/* Bookmarked indicator */}
          {bookmarked && (
            <div className="absolute top-1.5 right-1.5 w-5 h-5 bg-[var(--pink)] rounded-full flex items-center justify-center">
              <Star className="w-2.5 h-2.5 fill-white text-white" />
            </div>
          )}

          {/* Progress bar */}
          {progress && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
              <div
                className="h-full bg-[var(--pink)] transition-all"
                style={{ width: `${Math.min(100, (progress.page / Math.max(1, progress.totalPages - 1)) * 100)}%` }}
              />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="p-2">
          <p className="text-[11px] font-bold text-white line-clamp-2 leading-snug">{manga.title}</p>
          {progress && (
            <p className="text-[9px] text-[var(--pink)] font-bold mt-0.5">Ch. {progress.chapter}</p>
          )}
          {manga.tags.length > 0 && !progress && (
            <p className="text-[9px] text-[var(--text3)] mt-0.5 truncate">{manga.tags.slice(0, 2).join(' · ')}</p>
          )}
        </div>
      </div>
    </Link>
  );
}
