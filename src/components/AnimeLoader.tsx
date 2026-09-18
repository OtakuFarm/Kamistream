import React from 'react';

export function AnimeLoader() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[var(--bg1)]">
      <style>{`
        @keyframes aura-pulse {
          0%   { transform: scale(0.8); opacity: 0.8; }
          50%  { transform: scale(1.15); opacity: 0.3; }
          100% { transform: scale(0.8); opacity: 0.8; }
        }
        @keyframes aura-pulse-2 {
          0%   { transform: scale(1); opacity: 0.5; }
          50%  { transform: scale(1.3); opacity: 0.1; }
          100% { transform: scale(1); opacity: 0.5; }
        }
        @keyframes float-up {
          0%   { transform: translateY(0px) rotate(-3deg); }
          50%  { transform: translateY(-12px) rotate(3deg); }
          100% { transform: translateY(0px) rotate(-3deg); }
        }
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes spin-reverse {
          from { transform: rotate(360deg); }
          to   { transform: rotate(0deg); }
        }
        @keyframes energy-bar {
          0%   { width: 0%; }
          60%  { width: 85%; }
          80%  { width: 70%; }
          100% { width: 95%; }
        }
        @keyframes spark {
          0%,100% { opacity: 0; transform: scale(0); }
          50%     { opacity: 1; transform: scale(1); }
        }
        @keyframes glow-text {
          0%,100% { text-shadow: 0 0 8px var(--pink), 0 0 20px var(--purple); }
          50%     { text-shadow: 0 0 20px var(--pink), 0 0 40px var(--purple), 0 0 60px var(--pink); }
        }
        @keyframes shake {
          0%,100% { transform: translateX(0); }
          20%     { transform: translateX(-2px); }
          40%     { transform: translateX(2px); }
          60%     { transform: translateX(-1px); }
          80%     { transform: translateX(1px); }
        }
      `}</style>

      {/* Outer aura rings */}
      <div className="relative flex items-center justify-center" style={{ width: 220, height: 220 }}>

        <div className="absolute rounded-full border-2 border-[var(--purple)]/30"
          style={{ width: 210, height: 210, animation: 'aura-pulse-2 2s ease-in-out infinite' }} />
        <div className="absolute rounded-full border-2 border-[var(--pink)]/40"
          style={{ width: 175, height: 175, animation: 'aura-pulse 1.6s ease-in-out infinite 0.2s' }} />
        <div className="absolute rounded-full border border-[var(--pink)]/20"
          style={{ width: 145, height: 145, animation: 'aura-pulse-2 2.4s ease-in-out infinite 0.4s' }} />

        {/* Spinning outer ring */}
        <div className="absolute" style={{ width: 180, height: 180, animation: 'spin-slow 3s linear infinite' }}>
          <svg viewBox="0 0 180 180" width="180" height="180">
            <circle cx="90" cy="90" r="86" fill="none"
              stroke="url(#ring-grad)" strokeWidth="2"
              strokeDasharray="60 480" strokeLinecap="round" />
            <defs>
              <linearGradient id="ring-grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#ff006e" />
                <stop offset="100%" stopColor="#8338ec" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        {/* Inner counter-spinning ring */}
        <div className="absolute" style={{ width: 140, height: 140, animation: 'spin-reverse 2s linear infinite' }}>
          <svg viewBox="0 0 140 140" width="140" height="140">
            <circle cx="70" cy="70" r="66" fill="none"
              stroke="url(#ring-grad2)" strokeWidth="1.5"
              strokeDasharray="30 380" strokeLinecap="round" />
            <defs>
              <linearGradient id="ring-grad2" x1="1" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8338ec" />
                <stop offset="100%" stopColor="#ff006e" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        {/* Character silhouette — generic anime hero pose */}
        <div style={{ animation: 'float-up 2.5s ease-in-out infinite', position: 'relative', zIndex: 10 }}>
          <svg width="72" height="96" viewBox="0 0 72 96" fill="none">
            {/* Glow behind */}
            <ellipse cx="36" cy="88" rx="22" ry="6" fill="url(#glow-grad)" opacity="0.6" />
            {/* Body */}
            <path d="M36 6 C44 6 50 12 50 20 C50 28 44 32 36 32 C28 32 22 28 22 20 C22 12 28 6 36 6Z"
              fill="url(#body-grad)" />
            {/* Torso */}
            <path d="M24 32 L20 62 L28 60 L36 56 L44 60 L52 62 L48 32 Z"
              fill="url(#body-grad)" />
            {/* Left arm - raised, powering up */}
            <path d="M24 34 L8 18 L10 14 L26 30" fill="url(#body-grad)" stroke="url(#body-grad)" strokeWidth="1" />
            {/* Right arm - extended */}
            <path d="M48 34 L64 24 L62 20 L46 32" fill="url(#body-grad)" stroke="url(#body-grad)" strokeWidth="1" />
            {/* Legs */}
            <path d="M28 60 L22 84 L30 84 L36 72 L42 84 L50 84 L44 60 Z" fill="url(#body-grad)" />
            {/* Energy in hand */}
            <circle cx="8" cy="14" r="5" fill="#ff006e" opacity="0.9" />
            <circle cx="8" cy="14" r="8" fill="#ff006e" opacity="0.3" />
            <circle cx="8" cy="14" r="11" fill="#ff006e" opacity="0.15" />
            {/* Hair spikes */}
            <path d="M28 8 L24 0 L32 6" fill="url(--pink)" />
            <path d="M36 5 L36 -2 L40 4" fill="url(--pink)" />
            <path d="M44 8 L48 1 L42 6" fill="url(--pink)" />
            <path d="M28 8 L24 0 L32 6 M36 5 L36 -2 L40 4 M44 8 L48 1 L42 6"
              fill="#ff006e" opacity="0.9" />
            <defs>
              <linearGradient id="body-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#c77dff" />
                <stop offset="100%" stopColor="#7b2ff7" />
              </linearGradient>
              <radialGradient id="glow-grad" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#ff006e" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#ff006e" stopOpacity="0" />
              </radialGradient>
            </defs>
          </svg>
        </div>

        {/* Sparks */}
        {[
          { top: '10%', left: '15%', delay: '0s',   size: 6 },
          { top: '20%', left: '78%', delay: '0.4s', size: 4 },
          { top: '65%', left: '8%',  delay: '0.8s', size: 5 },
          { top: '70%', left: '82%', delay: '0.2s', size: 4 },
          { top: '40%', left: '5%',  delay: '1.1s', size: 3 },
          { top: '35%', left: '88%', delay: '0.6s', size: 5 },
        ].map((s, i) => (
          <div key={i} className="absolute rounded-full bg-[var(--pink)]"
            style={{
              top: s.top, left: s.left,
              width: s.size, height: s.size,
              animation: `spark 1.4s ease-in-out infinite ${s.delay}`,
            }} />
        ))}
      </div>

      {/* Power level text */}
      <div className="mt-6 font-heading font-extrabold text-[22px] tracking-widest uppercase"
        style={{ animation: 'glow-text 1.5s ease-in-out infinite', color: '#ff006e' }}>
        Loading
      </div>

      {/* Energy bar */}
      <div className="mt-3 w-48 h-2 rounded-full bg-[var(--card)] overflow-hidden relative">
        <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[var(--pink)] to-[var(--purple)]"
          style={{ animation: 'energy-bar 1.8s ease-in-out infinite' }} />
      </div>

      <p className="mt-3 text-[11px] text-[var(--text3)] tracking-widest uppercase font-bold"
        style={{ animation: 'shake 2s ease-in-out infinite 1s' }}>
        Powering up…
      </p>
    </div>
  );
}
