import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'wouter';
import {
  ChevronLeft, ChevronRight, ArrowLeft, Settings,
  Maximize2, Minimize2, BookOpen, List, X, ZoomIn, ZoomOut,
  Loader2, AlertTriangle, LayoutList, Rows
} from 'lucide-react';
import { getChapterPages, type ChapterPage } from '@/lib/mangadex';
import { useMangaProgress } from '@/hooks/useMangaProgress';

type ReadMode = 'vertical' | 'horizontal';

interface Props {
  mangaId:    string;
  mangaTitle: string;
  coverUrl:   string | null;
  chapterId:  string;
  chapter:    string;
  chapterTitle: string | null;
  prevChapterId: string | null;
  nextChapterId: string | null;
  prevChapter:   string | null;
  nextChapter:   string | null;
}

export function MangaReader({
  mangaId, mangaTitle, coverUrl, chapterId, chapter, chapterTitle,
  prevChapterId, nextChapterId, prevChapter, nextChapter,
}: Props) {
  const [pages,       setPages]      = useState<ChapterPage[]>([]);
  const [loading,     setLoading]    = useState(true);
  const [error,       setError]      = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [readMode,    setReadMode]   = useState<ReadMode>(() =>
    (localStorage.getItem('kami_manga_mode') as ReadMode) || 'vertical'
  );
  const [zoom,        setZoom]       = useState(100);
  const [showControls, setShowControls] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [failedPages, setFailedPages] = useState<Set<number>>(new Set());

  const { saveProgress }  = useMangaProgress();
  const containerRef      = useRef<HTMLDivElement>(null);
  const pageRefs          = useRef<(HTMLDivElement | null)[]>([]);
  const controlsTimer     = useRef<ReturnType<typeof setTimeout>>();

  // Load pages
  useEffect(() => {
    setLoading(true);
    setError(false);
    setPages([]);
    setCurrentPage(0);
    setFailedPages(new Set());
    getChapterPages(chapterId).then(p => {
      if (p.length === 0) { setError(true); }
      else setPages(p);
      setLoading(false);
    }).catch(() => { setError(true); setLoading(false); });
  }, [chapterId]);

  // Save progress
  useEffect(() => {
    if (!pages.length) return;
    saveProgress({
      mangaId, mangaTitle, coverUrl,
      chapterId, chapter,
      page: currentPage,
      totalPages: pages.length,
    });
  }, [currentPage, pages.length, chapterId]);

  // Auto-hide controls in vertical mode
  function resetControlsTimer() {
    setShowControls(true);
    clearTimeout(controlsTimer.current);
    if (readMode === 'vertical') {
      controlsTimer.current = setTimeout(() => setShowControls(false), 3000);
    }
  }
  useEffect(() => {
    if (readMode === 'horizontal') { setShowControls(true); clearTimeout(controlsTimer.current); }
    else resetControlsTimer();
    return () => clearTimeout(controlsTimer.current);
  }, [readMode]);

  // Intersection observer for vertical mode page tracking
  useEffect(() => {
    if (readMode !== 'vertical' || !pages.length) return;
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
          const idx = pageRefs.current.findIndex(r => r === entry.target);
          if (idx >= 0) setCurrentPage(idx);
        }
      });
    }, { threshold: 0.5 });
    pageRefs.current.forEach(r => r && observer.observe(r));
    return () => observer.disconnect();
  }, [pages.length, readMode]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (readMode === 'horizontal') {
        if (e.key === 'ArrowRight' || e.key === 'd') goToPage(currentPage + 1);
        if (e.key === 'ArrowLeft'  || e.key === 'a') goToPage(currentPage - 1);
      }
      if (e.key === 'f') toggleFullscreen();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [currentPage, readMode, pages.length]);

  function goToPage(idx: number) {
    const clamped = Math.max(0, Math.min(pages.length - 1, idx));
    setCurrentPage(clamped);
    if (readMode === 'vertical') {
      pageRefs.current[clamped]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function toggleReadMode() {
    const next: ReadMode = readMode === 'vertical' ? 'horizontal' : 'vertical';
    setReadMode(next);
    localStorage.setItem('kami_manga_mode', next);
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }

  function handlePageError(idx: number) {
    setFailedPages(prev => new Set([...prev, idx]));
  }

  const progress = pages.length > 0 ? Math.round(((currentPage + 1) / pages.length) * 100) : 0;

  return (
    <div
      ref={containerRef}
      className="min-h-screen bg-black relative select-none"
      onMouseMove={resetControlsTimer}
      onClick={() => readMode === 'horizontal' && setShowControls(v => !v)}
    >
      {/* ── Top bar ── */}
      <div className={`fixed top-0 left-0 right-0 z-50 bg-gradient-to-b from-black/90 to-transparent transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className="flex items-center gap-3 px-4 py-3">
          <Link href={`/manga/${mangaId}`}>
            <button className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </button>
          </Link>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-black text-white truncate">{mangaTitle}</p>
            <p className="text-[10px] text-white/60">Ch. {chapter}{chapterTitle ? ` — ${chapterTitle}` : ''}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={toggleReadMode} className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors" title={readMode === 'vertical' ? 'Switch to horizontal' : 'Switch to vertical'}>
              {readMode === 'vertical' ? <Rows className="w-4 h-4" /> : <LayoutList className="w-4 h-4" />}
            </button>
            <button onClick={() => setShowSettings(v => !v)} className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors">
              <Settings className="w-4 h-4" />
            </button>
            <button onClick={toggleFullscreen} className="w-9 h-9 hidden md:flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors">
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-0.5 bg-white/10">
          <div className="h-full bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* ── Settings panel ── */}
      {showSettings && (
        <div className="fixed top-16 right-4 z-50 bg-[var(--bg2)] border border-[var(--border)] rounded-2xl p-4 w-64 shadow-2xl" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[13px] font-black text-white">Reader Settings</h3>
            <button onClick={() => setShowSettings(false)} className="text-[var(--text3)] hover:text-white"><X className="w-4 h-4" /></button>
          </div>

          {/* Read mode */}
          <div className="mb-4">
            <p className="text-[10px] font-black text-[var(--text3)] uppercase tracking-wider mb-2">Reading Mode</p>
            <div className="grid grid-cols-2 gap-2">
              {(['vertical', 'horizontal'] as ReadMode[]).map(m => (
                <button key={m} onClick={() => { setReadMode(m); localStorage.setItem('kami_manga_mode', m); }}
                  className={`py-2 rounded-xl text-[12px] font-bold capitalize transition-all ${readMode === m ? 'bg-[var(--pink)] text-white' : 'bg-[var(--bg3)] text-[var(--text3)] hover:text-white'}`}>
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Zoom (horizontal mode only) */}
          {readMode === 'horizontal' && (
            <div>
              <p className="text-[10px] font-black text-[var(--text3)] uppercase tracking-wider mb-2">Zoom: {zoom}%</p>
              <div className="flex items-center gap-2">
                <button onClick={() => setZoom(z => Math.max(50, z - 10))} className="w-8 h-8 flex items-center justify-center bg-[var(--bg3)] rounded-lg text-white hover:bg-[var(--card)]"><ZoomOut className="w-3.5 h-3.5" /></button>
                <div className="flex-1 h-1.5 bg-[var(--bg3)] rounded-full overflow-hidden">
                  <div className="h-full bg-[var(--pink)] rounded-full" style={{ width: `${((zoom - 50) / 150) * 100}%` }} />
                </div>
                <button onClick={() => setZoom(z => Math.min(200, z + 10))} className="w-8 h-8 flex items-center justify-center bg-[var(--bg3)] rounded-lg text-white hover:bg-[var(--card)]"><ZoomIn className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Page counter (horizontal) ── */}
      {readMode === 'horizontal' && pages.length > 0 && (
        <div className={`fixed bottom-20 left-1/2 -translate-x-1/2 z-40 bg-black/70 backdrop-blur-sm px-3 py-1.5 rounded-full text-[12px] font-bold text-white transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
          {currentPage + 1} / {pages.length}
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div className="flex flex-col items-center justify-center min-h-screen gap-4">
          <Loader2 className="w-10 h-10 text-[var(--pink)] animate-spin" />
          <p className="text-[var(--text3)] text-[13px] font-bold">Loading chapter...</p>
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-6 text-center">
          <AlertTriangle className="w-12 h-12 text-[var(--pink)]" />
          <p className="text-white font-black text-[18px]">Chapter unavailable</p>
          <p className="text-[var(--text3)] text-[13px]">This chapter may not be available in English or the server is down. Try another chapter.</p>
          <Link href={`/manga/${mangaId}`}>
            <button className="bg-[var(--pink)] text-white px-6 py-2.5 rounded-xl font-bold text-[13px] hover:brightness-110">Back to Manga</button>
          </Link>
        </div>
      )}

      {/* ══ VERTICAL MODE ══ */}
      {!loading && !error && readMode === 'vertical' && (
        <div className="pt-14 pb-24 flex flex-col items-center" onClick={e => e.stopPropagation()}>
          {pages.map((page, idx) => (
            <div
              key={idx}
              ref={el => { pageRefs.current[idx] = el; }}
              className="w-full max-w-2xl"
            >
              {failedPages.has(idx) ? (
                <div className="w-full h-64 flex flex-col items-center justify-center gap-2 bg-[var(--bg2)] text-[var(--text3)]">
                  <AlertTriangle className="w-6 h-6" />
                  <span className="text-[12px]">Page {idx + 1} failed to load</span>
                </div>
              ) : (
                <img
                  src={page.url}
                  alt={`Page ${idx + 1}`}
                  loading="lazy"
                  className="w-full h-auto block"
                  style={{ zoom: `${zoom}%` }}
                  onError={() => handlePageError(idx)}
                />
              )}
            </div>
          ))}

          {/* Chapter navigation bottom */}
          <div className="flex gap-3 mt-8 px-4 w-full max-w-2xl">
            {prevChapterId ? (
              <Link href={`/manga/${mangaId}/chapter/${prevChapterId}`} className="flex-1">
                <button className="w-full py-3 bg-[var(--card)] border border-[var(--border)] rounded-xl text-[13px] font-bold text-white hover:border-[var(--pink)] transition-colors flex items-center justify-center gap-2">
                  <ChevronLeft className="w-4 h-4" /> Ch. {prevChapter}
                </button>
              </Link>
            ) : <div className="flex-1" />}
            {nextChapterId ? (
              <Link href={`/manga/${mangaId}/chapter/${nextChapterId}`} className="flex-1">
                <button className="w-full py-3 bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white rounded-xl text-[13px] font-bold hover:brightness-110 transition-all flex items-center justify-center gap-2">
                  Ch. {nextChapter} <ChevronRight className="w-4 h-4" />
                </button>
              </Link>
            ) : (
              <div className="flex-1 py-3 bg-[var(--card)] border border-[var(--border)] rounded-xl text-[13px] font-bold text-[var(--text3)] flex items-center justify-center">
                Last Chapter
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ HORIZONTAL MODE ══ */}
      {!loading && !error && readMode === 'horizontal' && pages.length > 0 && (
        <div className="flex items-center justify-center min-h-screen relative">
          {/* Page image */}
          <div className="max-h-screen max-w-full flex items-center justify-center px-2">
            {failedPages.has(currentPage) ? (
              <div className="w-64 h-96 flex flex-col items-center justify-center gap-2 bg-[var(--bg2)] rounded-xl text-[var(--text3)]">
                <AlertTriangle className="w-6 h-6" />
                <span className="text-[12px]">Page failed to load</span>
              </div>
            ) : (
              <img
                key={currentPage}
                src={pages[currentPage].url}
                alt={`Page ${currentPage + 1}`}
                className="max-h-screen w-auto object-contain"
                style={{ maxWidth: `${zoom}vw` }}
                onError={() => handlePageError(currentPage)}
              />
            )}
          </div>

          {/* Tap zones */}
          <button
            className="absolute left-0 top-0 bottom-0 w-1/3 flex items-center justify-start pl-3 opacity-0 hover:opacity-100 transition-opacity"
            onClick={e => { e.stopPropagation(); goToPage(currentPage - 1); }}
          >
            <div className="w-10 h-10 bg-black/50 rounded-full flex items-center justify-center">
              <ChevronLeft className="w-5 h-5 text-white" />
            </div>
          </button>
          <button
            className="absolute right-0 top-0 bottom-0 w-1/3 flex items-center justify-end pr-3 opacity-0 hover:opacity-100 transition-opacity"
            onClick={e => { e.stopPropagation(); goToPage(currentPage + 1); }}
          >
            <div className="w-10 h-10 bg-black/50 rounded-full flex items-center justify-center">
              <ChevronRight className="w-5 h-5 text-white" />
            </div>
          </button>
        </div>
      )}

      {/* ── Bottom nav bar ── */}
      {!loading && !error && (
        <div className={`fixed bottom-0 left-0 right-0 z-40 bg-gradient-to-t from-black/90 to-transparent pb-4 pt-8 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          <div className="flex items-center justify-between px-4 gap-3">
            {/* Prev chapter */}
            {prevChapterId ? (
              <Link href={`/manga/${mangaId}/chapter/${prevChapterId}`}>
                <button className="flex items-center gap-1.5 px-3 py-2 bg-white/10 rounded-xl text-[12px] font-bold text-white hover:bg-white/20 transition-colors">
                  <ChevronLeft className="w-4 h-4" /> Ch. {prevChapter}
                </button>
              </Link>
            ) : <div />}

            {/* Page scrubber (horizontal mode) */}
            {readMode === 'horizontal' && pages.length > 1 && (
              <div className="flex-1 flex items-center gap-2 px-2" onClick={e => e.stopPropagation()}>
                <input
                  type="range" min={0} max={pages.length - 1} value={currentPage}
                  onChange={e => goToPage(parseInt(e.target.value))}
                  className="flex-1 accent-[var(--pink)]"
                />
              </div>
            )}

            {/* Next chapter */}
            {nextChapterId ? (
              <Link href={`/manga/${mangaId}/chapter/${nextChapterId}`}>
                <button className="flex items-center gap-1.5 px-3 py-2 bg-[var(--pink)] rounded-xl text-[12px] font-bold text-white hover:brightness-110 transition-all">
                  Ch. {nextChapter} <ChevronRight className="w-4 h-4" />
                </button>
              </Link>
            ) : <div />}
          </div>
        </div>
      )}
    </div>
  );
}
