import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';

export function ProgressBar() {
  const [isAnimating, setIsAnimating] = useState(false);
  const [location] = useLocation();

  useEffect(() => {
    setIsAnimating(true);
    const timeout = setTimeout(() => setIsAnimating(false), 500);
    return () => clearTimeout(timeout);
  }, [location]);

  if (!isAnimating) return null;

  return (
    <div className="fixed top-0 left-0 right-0 h-[2px] z-[100] overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-r from-[var(--pink)] via-[var(--purple)] to-[var(--blue)] w-full h-full origin-left animate-[progress_0.5s_ease-out_forwards]" />
      <style>{`
        @keyframes progress {
          0% { transform: scaleX(0); opacity: 1; }
          50% { transform: scaleX(0.7); opacity: 1; }
          100% { transform: scaleX(1); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
