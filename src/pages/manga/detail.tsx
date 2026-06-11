import React, { useState } from 'react';
import { useRoute, Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { useSEO } from '@/hooks/useSEO';
import { useMangaBookmarks, MANGA_STATUS_LABELS } from '@/hooks/useMangaBookmarks';
import { useMangaProgress } from '@/hooks/useMangaProgress';
import { getMangaDetail, getMangaChapters } from '@/lib/mangadex';
import {
  BookOpen, BookMarked, Play, ChevronDown, ChevronUp,
  Calendar, User, Tag, Clock, CheckCircle2, Loader2
} from 'lucide-react';

export default function MangaDetail() {
  const [, params] = useRoute('/manga/:id');
  const id = params?.id || '';

  const [showAllChapters, setShowAllChapters] = useState(false);
  const [statusMenuOpen,  setStatusMenuOpen]  = useState(false);

  const { data: manga,    isLoading: mangaLoading }    = useQuery({
    queryKey: ['manga', id],
    queryFn:  () => getMangaDetail(id),
    enabled:  !!id, staleTime: 30 * 60 * 1000,
  });

  const { data: chapters, isLoading: chapterLoading } = useQuery({
    queryKey: ['manga', id, 'chapters'],
    queryFn:  () => getMangaChapters(id, 500),
    enabled:  !!id, staleTime: 10 * 60 * 1000,
  });

  const { toggleBookmark, isBookmarked, getStatus, setStatus } = useMangaBookmarks();
  const { getProgress, isRead } = useMangaProgress();

  useSEO(manga ? {
    title: manga.title,
    description: manga.description?.slice(0, 160),
    image: manga.coverUrl || undefined,
    type: 'video.other',
  } : {});

  if (mangaLoading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="w-8 h-8 text-[var(--pink)] animate-spin" />
    </div>
  );
  if (!manga) return <div className="p-8 text-center text-[var(--text3)]">Manga not found.</div>;

  const bookmarked   = isBookmarked(id);
  const status       = getStatus(id);
  const progress     = getProgress(id);
  const visibleChs   = showAllChapters ? (chapters || []) : (chapters || []).slice(0, 20);
  // First chapter = last in array (chapters are newest-first)
  const firstChapter = chapters?.[chapters.length - 1];
  const latestChapter = chapters?.[0];

  return (
    <div className="pb-20">

      {/* ── Hero banner ── */}
      <div className="relative h-56 md:h-72 overflow-hidden">
        {manga.coverUrl && (
          <img src={manga.coverUrl} alt="" className="absolute inset-0 w-full h-full object-cover blur-md opacity-25" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg)] via-[var(--bg)]/60 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 px-4 md:px-8 pb-4 flex gap-5 items-end max-w-5xl mx-auto">
          {/* Cover */}
          <img src={manga.coverUrl || ''} alt={manga.title}
            className="w-28 md:w-36 rounded-xl shadow-2xl shrink-0 -mb-10 z-10 border border-white/10"
            onError={e => { (e.currentTarget as any).style.display = 'none'; }}
          />
          <div className="flex-1 z-10 pb-3 min-w-0">
            <h1 className="text-xl md:text-3xl font-heading font-black text-white leading-tight mb-2 truncate">{manga.title}</h1>
            <div className="flex flex-wrap gap-1.5">
              {manga.tags.slice(0, 4).map(tag => (
                <span key={tag} className="text-[10px] font-bold px-2 py-0.5 rounded-full border border-white/15 text-[var(--text2)]">{tag}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 md:px-8 mt-14">
        <div className="flex flex-col lg:flex-row gap-6">

          {/* ── Left: Info + Chapters ── */}
          <div className="flex-1 min-w-0 space-y-5">

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2">
              {/* Start/Continue reading */}
              {progress ? (
                <Link href={`/manga/${id}/chapter/${progress.chapterId}`}>
                  <button className="flex items-center gap-2 bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white px-5 py-2.5 rounded-xl text-[13px] font-black hover:brightness-110 transition-all shadow-lg shadow-[var(--pink)]/20">
                    <Play className="w-3.5 h-3.5 fill-current" /> Continue Ch. {progress.chapter}
                  </button>
                </Link>
              ) : firstChapter ? (
                <Link href={`/manga/${id}/chapter/${firstChapter.id}`}>
                  <button className="flex items-center gap-2 bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white px-5 py-2.5 rounded-xl text-[13px] font-black hover:brightness-110 transition-all shadow-lg shadow-[var(--pink)]/20">
                    <BookOpen className="w-3.5 h-3.5" /> Start Reading
                  </button>
                </Link>
              ) : null}

              {/* Bookmark + status */}
              <div className="relative">
                <button
                  onClick={() => {
                    if (!bookmarked) toggleBookmark({ mangaId: id, title: manga.title, coverUrl: manga.coverUrl });
                    setStatusMenuOpen(v => !v);
                  }}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold border transition-all ${
                    bookmarked ? 'bg-[var(--green)]/15 border-[var(--green)]/40 text-[var(--green)]' : 'bg-white/5 border-white/15 text-white hover:bg-white/10'
                  }`}>
                  <BookMarked className="w-3.5 h-3.5" />
                  {bookmarked ? (status ? MANGA_STATUS_LABELS[status] : 'Saved') : 'Add to Library'}
                  <ChevronDown className="w-3 h-3" />
                </button>
                {statusMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setStatusMenuOpen(false)} />
                    <div className="absolute left-0 top-full mt-1 bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden shadow-2xl z-40 w-48">
                      {(Object.entries(MANGA_STATUS_LABELS) as [any, string][]).map(([s, label]) => (
                        <button key={s} onClick={() => {
                          if (!bookmarked) toggleBookmark({ mangaId: id, title: manga.title, coverUrl: manga.coverUrl });
                          setStatus(id, s);
                          setStatusMenuOpen(false);
                        }}
                          className={`w-full text-left px-4 py-2.5 text-[12px] font-bold transition-colors hover:bg-[var(--bg3)] ${status === s ? 'text-[var(--pink)]' : 'text-[var(--text2)]'}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Description */}
            {manga.description && (
              <div>
                <h2 className="text-[13px] font-black text-[var(--text3)] uppercase tracking-widest mb-2">Synopsis</h2>
                <p className="text-[13px] text-[var(--text2)] leading-relaxed">{manga.description.slice(0, 500)}{manga.description.length > 500 ? '...' : ''}</p>
              </div>
            )}

            {/* Chapter list */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[13px] font-black text-[var(--text3)] uppercase tracking-widest flex items-center gap-2">
                  <BookOpen className="w-4 h-4" /> Chapters
                  <span className="font-normal text-[var(--text3)]">({chapters?.length || 0})</span>
                </h2>
                {latestChapter && (
                  <Link href={`/manga/${id}/chapter/${latestChapter.id}`}>
                    <button className="text-[11px] font-bold text-[var(--pink)] hover:underline">Latest →</button>
                  </Link>
                )}
              </div>

              {chapterLoading ? (
                <div className="space-y-2">
                  {[1,2,3,4,5].map(i => <div key={i} className="h-12 bg-[var(--card)] rounded-xl animate-pulse" />)}
                </div>
              ) : (
                <div className="space-y-1">
                  {visibleChs.map((ch, idx) => {
                    const read = isRead(id, ch.id);
                    const isCurrent = progress?.chapterId === ch.id;
                    return (
                      <Link key={ch.id} href={`/manga/${id}/chapter/${ch.id}`}>
                        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all cursor-pointer group ${
                          isCurrent ? 'bg-[var(--pink)]/10 border-[var(--pink)]/30' :
                          read       ? 'bg-[var(--bg2)] border-transparent opacity-60 hover:opacity-100' :
                                       'bg-[var(--card)] border-[var(--border)] hover:border-[var(--pink)]/30'
                        }`}>
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-[11px] font-black ${
                            isCurrent ? 'bg-[var(--pink)] text-white' :
                            read       ? 'bg-[var(--green)]/20 text-[var(--green)]' :
                                         'bg-[var(--bg3)] text-[var(--text3)]'
                          }`}>
                            {read ? <CheckCircle2 className="w-3.5 h-3.5" /> : ch.chapter || '?'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-[13px] font-bold truncate ${isCurrent ? 'text-[var(--pink)]' : read ? 'text-[var(--text3)]' : 'text-white'}`}>
                              {ch.title || `Chapter ${ch.chapter || idx + 1}`}
                            </p>
                            {ch.scanlationGroup && <p className="text-[10px] text-[var(--text3)] truncate">{ch.scanlationGroup}</p>}
                          </div>
                          <div className="flex items-center gap-2 shrink-0 text-[10px] text-[var(--text3)]">
                            <span>{ch.pages}p</span>
                            <span>{new Date(ch.publishAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}

              {!chapterLoading && (chapters?.length || 0) > 20 && (
                <button onClick={() => setShowAllChapters(v => !v)}
                  className="mt-3 w-full py-2.5 bg-[var(--card)] border border-[var(--border)] rounded-xl text-[12px] font-bold text-[var(--text2)] hover:text-white hover:border-[var(--pink)]/40 transition-all flex items-center justify-center gap-2">
                  {showAllChapters ? <><ChevronUp className="w-4 h-4" /> Show Less</> : <><ChevronDown className="w-4 h-4" /> Show All {chapters?.length} Chapters</>}
                </button>
              )}
            </div>
          </div>

          {/* ── Right: Details ── */}
          <div className="w-full lg:w-64 shrink-0">
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4 space-y-3 sticky top-4">
              <h3 className="font-black text-[13px] text-white uppercase tracking-wide">Details</h3>
              {[
                { icon: Tag,      label: 'Status',   value: manga.status },
                { icon: User,     label: 'Author',   value: manga.author },
                { icon: Calendar, label: 'Year',     value: manga.year?.toString() },
                { icon: BookOpen, label: 'Chapters', value: chapters?.length?.toString() },
              ].filter(([,, v]) => v).map(({ icon: Icon, label, value }: any) => (
                <div key={label} className="flex items-center gap-3 text-[12px]">
                  <Icon className="w-3.5 h-3.5 text-[var(--text3)] shrink-0" />
                  <span className="text-[var(--text3)] shrink-0">{label}</span>
                  <span className="font-bold text-white ml-auto capitalize">{value}</span>
                </div>
              ))}
              {manga.tags.length > 0 && (
                <div className="pt-2 border-t border-[var(--border)]">
                  <p className="text-[10px] font-black text-[var(--text3)] uppercase tracking-widest mb-2">Genres</p>
                  <div className="flex flex-wrap gap-1">
                    {manga.tags.map(tag => (
                      <Link key={tag} href={`/manga/genres`}>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--bg3)] text-[var(--text2)] hover:text-[var(--pink)] hover:bg-[var(--pink)]/10 cursor-pointer transition-colors">
                          {tag}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
