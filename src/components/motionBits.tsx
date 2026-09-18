import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import confetti from "canvas-confetti";
import { motion, useScroll, useSpring } from "framer-motion";

/** True when the user prefers reduced motion — animations become no-ops. */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" &&
    !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

// ── Watchlist confetti ──────────────────────────────────────────────────────
let lastConfetti = 0;
/** Small celebratory burst from the bottom of the viewport when an anime is
 *  added to the watchlist. Throttled and disabled for reduced-motion users. */
export function fireWatchlistConfetti() {
  if (prefersReducedMotion()) return;
  const now = Date.now();
  if (now - lastConfetti < 1500) return; // avoid bursts from rapid toggles
  lastConfetti = now;
  confetti({
    particleCount: 45,
    spread: 65,
    startVelocity: 32,
    gravity: 0.9,
    ticks: 140,
    origin: { x: 0.5, y: 0.75 },
    colors: ["#ff2d78", "#a855f7", "#ffd60a", "#22d3a6", "#3b82f6"],
    disableForReducedMotion: true,
  });
}

// ── Scroll progress bar ─────────────────────────────────────────────────────
/** Thin accent-colored progress bar fixed under the topbar, driven by page
 *  scroll. Purely visual (pointer-events-none). */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 220, damping: 40, mass: 0.4 });
  return (
    <motion.div
      aria-hidden
      className="fixed top-0 left-0 right-0 h-[3px] z-[200] origin-left pointer-events-none"
      style={{
        scaleX,
        background: "linear-gradient(90deg, var(--pink), var(--purple), var(--gold))",
      }}
    />
  );
}

// ── Floating ambient particles ──────────────────────────────────────────────
const VIBES: Record<string, string> = {
  "trending":      "🔥",
  "top-rated":     "✨",
  "top-anime":     "🏆",
  "this-season":   "🌸",
  "upcoming":      "🚀",
  "new-release":   "💗",
  "new-added":     "🌱",
  "just-completed": "🌙",
};

/** Ambient drifting particles for hero sections. Emoji-based (per-category
 *  "vibe") or glowing orbs. Pure CSS animation, honors reduced-motion via the
 *  `.kami-float` media query in index.css. */
export function FloatingPetals({
  vibeKey,
  color = "var(--pink)",
  count = 10,
}: {
  /** Category slug — picks a themed emoji. Omit for plain glow orbs. */
  vibeKey?: string;
  color?: string;
  count?: number;
}) {
  const particles = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: `${(i * 97 + 13) % 100}%`,
        delay: `${(i * 1.7) % 12}s`,
        duration: `${9 + ((i * 3.1) % 8)}s`,
        size: 10 + ((i * 7) % 12),
        drift: ((i * 37) % 60) - 30,
      })),
    [count],
  );
  const emoji = vibeKey ? VIBES[vibeKey] : undefined;

  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((p, i) => {
        if (emoji) {
          return (
            <span
              key={i}
              className="kami-float absolute select-none"
              style={{
                left: p.left,
                bottom: "-8%",
                fontSize: p.size,
                animationDelay: p.delay,
                animationDuration: p.duration,
                opacity: 0.75,
              }}
            >
              {emoji}
            </span>
          );
        }
        const orbStyle: CSSProperties = {
          left: p.left,
          bottom: "-8%",
          width: p.size - 4,
          height: p.size - 4,
          background: `radial-gradient(circle, ${color}, transparent 70%)`,
          boxShadow: `0 0 ${p.size}px color-mix(in srgb, ${color} 60%, transparent)`,
          animationDelay: p.delay,
          animationDuration: p.duration,
          opacity: 0.5,
        };
        (orbStyle as Record<string, string>)["--drift"] = `${p.drift}px`;
        return <span key={i} className="kami-float absolute rounded-full" style={orbStyle} />;
      })}
    </div>
  );
}

/** Animates a number from its previous value to `value` with an ease-out
 *  count-up. Respects prefers-reduced-motion. */
export function CountUp({
  value,
  duration = 700,
  prefix = "",
  suffix = "",
  className,
}: {
  value: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setDisplay(value);
      prev.current = value;
      return;
    }
    const from = prev.current;
    const to   = value;
    if (from === to) return;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p     = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
      setDisplay(Math.round(from + (to - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
      else prev.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return (
    <span className={className}>
      {prefix}
      {display}
      {suffix}
    </span>
  );
}
