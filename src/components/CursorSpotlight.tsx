import { useEffect, useRef } from 'react';

/**
 * Ambient radial glow that follows the cursor. Desktop-only (checks for a
 * fine pointer) and disabled under prefers-reduced-motion. Mounted as the
 * first child of the page wrapper (see Layout.tsx) so it paints behind
 * normal-flow content instead of covering cards — see the comment there
 * for why z-index is intentionally left untouched.
 */
export function CursorSpotlight() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const isDesktop = window.matchMedia('(pointer: fine)').matches;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const el = ref.current;
    if (!isDesktop || reducedMotion || !el) return;

    let raf = 0;
    const onMove = (e: MouseEvent) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        el.style.setProperty('--spot-x', `${e.clientX}px`);
        el.style.setProperty('--spot-y', `${e.clientY}px`);
        el.style.opacity = '1';
        raf = 0;
      });
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Desktop-only, reduced-motion-respecting: render nothing on touch devices
  // or when the OS asks for less motion, rather than hiding via CSS alone.
  if (typeof window !== 'undefined') {
    const isDesktop = window.matchMedia('(pointer: fine)').matches;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!isDesktop || reducedMotion) return null;
  }

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 opacity-0 transition-opacity duration-500 hidden md:block"
      style={{
        background:
          'radial-gradient(600px circle at var(--spot-x, 50%) var(--spot-y, 50%), color-mix(in srgb, var(--pink) 10%, transparent), color-mix(in srgb, var(--purple) 6%, transparent) 35%, transparent 70%)',
      }}
    />
  );
}
