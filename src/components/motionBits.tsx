import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import confetti from "canvas-confetti";
import { AnimatePresence, motion, useScroll, useSpring } from "framer-motion";
import type { Achievement } from "@/hooks/useGamification";

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

// ── Sakura cursor trail (playful pages: Profile, Achievements) ──────────────
/** Canvas overlay that drops tiny sakura petals which fall and fade from the
 *  cursor. Desktop fine-pointer only; disabled under reduced motion. Renders
 *  nothing — mounts its canvas directly on document.body. */
export function SakuraTrail() {
  useEffect(() => {
    if (prefersReducedMotion()) return;
    if (!window.matchMedia?.("(pointer: fine)").matches) return;

    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    Object.assign(canvas.style, {
      position: "fixed",
      inset: "0",
      width: "100%",
      height: "100%",
      pointerEvents: "none",
      zIndex: "150",
    });
    document.body.appendChild(canvas);
    const ctx = canvas.getContext("2d");
    if (!ctx) { canvas.remove(); return; }

    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener("resize", resize);

    interface Petal { x: number; y: number; vx: number; vy: number; size: number; rot: number; vr: number; life: number; hue: number }
    const petals: Petal[] = [];
    let last = 0;
    let raf = 0;

    const onMove = (e: PointerEvent) => {
      const now = performance.now();
      if (now - last < 40) return; // throttle spawns
      last = now;
      petals.push({
        x: e.clientX, y: e.clientY,
        vx: (Math.random() - 0.5) * 0.8,
        vy: 0.6 + Math.random() * 1.2,
        size: 5 + Math.random() * 6,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.12,
        life: 1,
        hue: 330 + Math.random() * 20,
      });
      if (petals.length > 60) petals.splice(0, petals.length - 60);
    };
    window.addEventListener("pointermove", onMove);

    const tick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = petals.length - 1; i >= 0; i--) {
        const p = petals[i];
        p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life -= 0.012;
        if (p.life <= 0 || p.y > canvas.height + 20) { petals.splice(i, 1); continue; }
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = Math.min(1, p.life) * 0.85;
        ctx.fillStyle = `hsl(${p.hue} 85% 80%)`;
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size, p.size * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("resize", resize);
      canvas.remove();
    };
  }, []);
  return null;
}

// ── Achievement unlock toaster (global) ─────────────────────────────────────
interface UnlockToast { key: number; icon: string; title: string; desc: string; xp: number }
let toastKey = 0;

/** Listens for `kami:achievement` events (dispatched by useGamification when
 *  achievements unlock) and shows slide-in celebration toasts bottom-right. */
export function AchievementToaster() {
  const [toasts, setToasts] = useState<UnlockToast[]>([]);

  useEffect(() => {
    const onUnlock = (e: Event) => {
      const items = ((e as CustomEvent<Achievement[]>).detail || []).slice(0, 3);
      if (!items.length) return;
      const fresh = items.map(a => ({
        key: ++toastKey, icon: a.icon, title: a.title, desc: a.description, xp: a.xpReward,
      }));
      setToasts(t => [...t, ...fresh]);
      for (const f of fresh) {
        window.setTimeout(() => setToasts(t => t.filter(x => x.key !== f.key)), 5000);
      }
    };
    window.addEventListener("kami:achievement", onUnlock);
    return () => window.removeEventListener("kami:achievement", onUnlock);
  }, []);

  return (
    <div className="fixed kami-safe-bottom right-5 z-[210] flex flex-col gap-3 pointer-events-none">
      <AnimatePresence>
        {toasts.map(t => (
          <motion.div
            key={t.key}
            initial={{ opacity: 0, x: 80, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 300, damping: 24 }}
            className="pointer-events-auto relative overflow-hidden w-[300px] rounded-2xl border border-[var(--gold)]/40 bg-[var(--card)] shadow-2xl p-4"
          >
            {/* shine sweep */}
            <motion.div
              aria-hidden
              className="absolute inset-y-0 w-24 pointer-events-none"
              style={{ background: "linear-gradient(105deg, transparent, rgba(255,214,10,0.18), transparent)" }}
              initial={{ x: "-120%" }}
              animate={{ x: "480%" }}
              transition={{ duration: 1.4, delay: 0.25, ease: "easeInOut" }}
            />
            <div className="flex items-start gap-3">
              <motion.div
                className="w-11 h-11 rounded-xl bg-[var(--gold)]/15 flex items-center justify-center text-2xl shrink-0"
                initial={{ rotate: -12, scale: 0.5 }}
                animate={{ rotate: [0, -10, 8, 0], scale: 1 }}
                transition={{ delay: 0.1, duration: 0.6 }}
              >
                {t.icon}
              </motion.div>
              <div className="min-w-0">
                <p className="text-[9px] font-black text-[var(--gold)] uppercase tracking-[0.2em]">Achievement unlocked</p>
                <p className="text-[13px] font-black text-white mt-0.5 leading-tight">{t.title}</p>
                <p className="text-[11px] text-[var(--text3)] mt-0.5">{t.desc}</p>
                <p className="text-[10px] font-black text-[var(--gold)] mt-1">+{t.xp} XP</p>
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
