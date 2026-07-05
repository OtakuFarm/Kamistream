import React, { useState, useRef, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { Plus, Check, Play, ExternalLink, Bookmark, BookmarkCheck, Share2, X, Copy, Info } from "lucide-react";
import { useWatchlist } from "@/hooks/useWatchlist";
import { useWatchHistory } from "@/hooks/useWatchHistory";

interface AnimeCardProps {
  anime: any;
}

const LONG_PRESS_MS = 500;

export function AnimeCard({ anime }: AnimeCardProps) {
  const { toggleWatchlist, isInWatchlist } = useWatchlist();
  const { getRecentAnime }                 = useWatchHistory();
  const [, setLocation]                    = useLocation();
  const [imgError, setImgError]            = useState(false);
  const [menuOpen, setMenuOpen]            = useState(false);
  const [menuPos,  setMenuPos]             = useState<{ x: number; y: number } | null>(null);
  const [pressing, setPressing]            = useState(false);
  const [copied,   setCopied]              = useState(false);

  const isSaved     = isInWatchlist(anime.mal_id);
  const history     = getRecentAnime();
  const lastWatched = history.find((h: any) => h.mal_id === anime.mal_id);
  const totalEps    = anime.episodes;
  const progressPct =
    lastWatched && totalEps
      ? Math.min(100, Math.round((lastWatched.ep_id / totalEps) * 100))
      : null;

  const imgSrc = !imgError
    ? (anime.images?.webp?.large_image_url ||
       anime.images?.jpg?.large_image_url  ||
       anime.images?.webp?.image_url       || "")
    : "";

  const animeUrl  = `/anime/${anime.mal_id}`;
  const fullUrl   = `${window.location.origin}${animeUrl}`;
  const malUrl    = `https://myanimelist.net/anime/${anime.mal_id}`;

  // ── Long-press logic ───────────────────────────────────────────────
  const timerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);
  const cardRef      = useRef<HTMLDivElement>(null);

  const openMenu = useCallback((clientX: number, clientY: number) => {
    // Position menu relative to card so it stays on screen
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    // Offset from top-left of card
    let x = clientX - rect.left;
    let y = clientY - rect.top;
    // Clamp so menu doesn't overflow right edge
    if (x + 180 > rect.width) x = rect.width - 10;
    setMenuPos({ x, y });
    setMenuOpen(true);
    setPressing(false);
    // Haptic feedback on supported devices
    try { navigator.vibrate?.(40); } catch {}
  }, []);

  const startPress = useCallback((clientX: number, clientY: number) => {
    didLongPress.current = false;
    setPressing(true);
    timerRef.current = setTimeout(() => {
      didLongPress.current = true;
      openMenu(clientX, clientY);
    }, LONG_PRESS_MS);
  }, [openMenu]);

  const cancelPress = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setPressing(false);
  }, []);

  // Touch events
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    startPress(t.clientX, t.clientY);
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    cancelPress();
    // If it was a long press, block the normal tap
    if (didLongPress.current) e.preventDefault();
  };
  const onTouchMove = () => cancelPress();

  // Mouse events (desktop right-click alternative)
  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // left only
    startPress(e.clientX, e.clientY);
  };
  const onMouseUp   = () => cancelPress();
  const onMouseLeave = () => cancelPress();

  // Right-click also opens the menu
  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    cancelPress();
    didLongPress.current = true;
    openMenu(e.clientX - (cardRef.current?.getBoundingClientRect().left ?? 0),
             e.clientY - (cardRef.current?.getBoundingClientRect().top  ?? 0));
  };

  // Click — only navigate if it wasn't a long press
  const onClick = () => {
    if (didLongPress.current) return;
    setLocation(animeUrl);
  };

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  // ── Menu actions ───────────────────────────────────────────────────
  function openNewTab() {
    window.open(fullUrl, "_blank", "noopener,noreferrer");
    setMenuOpen(false);
  }
  function watchNewTab() {
    window.open(`${window.location.origin}/watch/${anime.mal_id}/1`, "_blank", "noopener,noreferrer");
    setMenuOpen(false);
  }
  function openMAL() {
    window.open(malUrl, "_blank", "noopener,noreferrer");
    setMenuOpen(false);
  }
  function copyLink() {
    navigator.clipboard.writeText(fullUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
    setMenuOpen(false);
  }
  function shareAnime() {
    if (navigator.share) {
      navigator.share({ title: anime.title, url: fullUrl }).catch(() => {});
    } else {
      copyLink();
    }
    setMenuOpen(false);
  }
  function saveToWatchlist() {
    toggleWatchlist({
      mal_id:    anime.mal_id,
      title:     anime.title,
      image_url: anime.images?.webp?.large_image_url || anime.images?.jpg?.large_image_url || "",
      episodes:  anime.episodes,
      score:     anime.score,
    });
    setMenuOpen(false);
  }

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div
      ref={cardRef}
      className={`group relative bg-[var(--card)] rounded-2xl overflow-visible cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_0_1px_var(--border),0_16px_40px_-12px_var(--pink)] select-none ${pressing ? "scale-[0.97]" : ""}`}
      onClick={onClick}
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseLeave}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchMove={onTouchMove}
      onContextMenu={onContextMenu}
      style={{ WebkitUserSelect: "none", userSelect: "none" }}
    >
      {/* ── Poster ── */}
      <div className="relative aspect-[2/3] overflow-hidden rounded-2xl bg-[var(--bg3)]">
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={anime.title}
            loading="lazy"
            decoding="async"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[var(--text3)] text-[10px] font-bold px-2 text-center leading-snug">
            {anime.title}
          </div>
        )}

        {/* Gradient on hover */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />

        {/* Play button on hover */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <div className="w-10 h-10 bg-[var(--pink)] rounded-full flex items-center justify-center shadow-xl shadow-[var(--pink)]/40">
            <Play className="w-4 h-4 fill-white text-white ml-0.5" />
          </div>
        </div>

        {/* Long-press ring indicator */}
        {pressing && (
          <div className="absolute inset-0 rounded-2xl border-2 border-[var(--pink)] animate-pulse pointer-events-none" />
        )}

        {/* Score */}
        {anime.score && (
          <div className="absolute top-1.5 left-1.5 bg-black/75 backdrop-blur-sm text-[9px] font-black px-1.5 py-0.5 rounded text-[var(--gold)] flex items-center gap-0.5">
            ★ {anime.score}
          </div>
        )}

        {/* Type */}
        {anime.type && (
          <div className="absolute top-1.5 right-7 bg-[var(--purple)]/80 backdrop-blur-sm text-[8px] font-black px-1.5 py-0.5 rounded text-white">
            {anime.type}
          </div>
        )}

        {/* Watchlist button */}
        <button
          onClick={(e) => { e.stopPropagation(); saveToWatchlist(); }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          className={`absolute top-1.5 right-1.5 w-6 h-6 rounded flex items-center justify-center transition-all z-10 ${
            isSaved
              ? "bg-[var(--pink)] text-white"
              : "bg-black/60 text-white/70 hover:bg-[var(--pink)] hover:text-white"
          }`}
        >
          {isSaved ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
        </button>

        {/* Progress bar */}
        {progressPct !== null && (
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/20">
            <div className="h-full bg-[var(--pink)]" style={{ width: `${progressPct}%` }} />
          </div>
        )}

        {/* EP badge */}
        {anime.latestEp && (
          <div className="absolute bottom-1.5 left-1.5 bg-[var(--green)] text-black text-[8px] font-black px-1.5 py-0.5 rounded">
            EP {anime.latestEp}
          </div>
        )}
      </div>

      {/* ── Title ── */}
      <div className="p-1.5 pt-2">
        <h3 className="text-[11px] font-bold text-[var(--text2)] line-clamp-2 leading-tight group-hover:text-white transition-colors">
          {anime.title}
        </h3>
        {anime.episodes && (
          <p className="text-[9px] text-[var(--text3)] mt-0.5">{anime.episodes} eps</p>
        )}
      </div>

      {/* ── Context Menu ── */}
      {menuOpen && menuPos && (
        <>
          {/* Backdrop — mobile tap-outside-to-close */}
          <div
            className="fixed inset-0 z-[998]"
            onClick={() => setMenuOpen(false)}
            onTouchEnd={() => setMenuOpen(false)}
          />

          <div
            className="absolute z-[999] min-w-[190px] bg-[var(--bg2)] border border-[var(--border)] rounded-2xl shadow-2xl shadow-black/60 overflow-hidden"
            style={{ left: menuPos.x, top: menuPos.y }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-3 py-2.5 border-b border-[var(--border)] bg-[var(--card)] flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] font-black text-white line-clamp-1">{anime.title}</p>
                {anime.score && (
                  <p className="text-[9px] text-[var(--gold)]">★ {anime.score} · {anime.type}</p>
                )}
              </div>
              <button
                onClick={() => setMenuOpen(false)}
                className="text-[var(--text3)] hover:text-white transition-colors shrink-0 mt-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Actions */}
            <div className="py-1">
              <MenuItem icon={<ExternalLink className="w-3.5 h-3.5" />} label="Open in New Tab"    onClick={openNewTab} />
              <MenuItem icon={<Play className="w-3.5 h-3.5" />}         label="Watch in New Tab"   onClick={watchNewTab} color="var(--pink)" />
              <MenuItem
                icon={isSaved
                  ? <BookmarkCheck className="w-3.5 h-3.5" />
                  : <Bookmark className="w-3.5 h-3.5" />}
                label={isSaved ? "Remove from Watchlist" : "Add to Watchlist"}
                onClick={saveToWatchlist}
                color={isSaved ? "var(--green)" : undefined}
              />
              <div className="h-px bg-[var(--border)] mx-3 my-1" />
              <MenuItem icon={<Copy    className="w-3.5 h-3.5" />} label={copied ? "Copied!" : "Copy Link"} onClick={copyLink} />
              <MenuItem icon={<Share2  className="w-3.5 h-3.5" />} label="Share"                onClick={shareAnime} />
              <MenuItem icon={<Info   className="w-3.5 h-3.5" />}  label="View on MyAnimeList"  onClick={openMAL} color="var(--blue)" />
            </div>
          </div>
        </>
      )}

      {/* Copied toast */}
      {copied && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[1000] bg-[var(--card)] border border-[var(--border)] text-white text-[12px] font-bold px-4 py-2 rounded-xl shadow-xl">
          Link copied!
        </div>
      )}
    </div>
  );
}

// ── Menu item component ──────────────────────────────────────────────
function MenuItem({
  icon, label, onClick, color,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  color?: string;
}) {
  return (
    <button
      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[12px] font-bold text-[var(--text2)] hover:bg-[var(--bg3)] hover:text-white transition-colors text-left"
      style={color ? { color } : {}}
      onClick={onClick}
      onTouchEnd={(e) => { e.preventDefault(); onClick(); }}
    >
      <span style={color ? { color } : { color: "var(--text3)" }}>{icon}</span>
      {label}
    </button>
  );
}
