import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { useSEO } from '@/hooks/useSEO';
import { Play, ArrowRight, Check, X } from 'lucide-react';

// ── Animated counter ─────────────────────────────────────────────
function useCountUp(target: number, duration = 1200) {
  const [value, setValue] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      const start = Date.now();
      const tick = () => {
        const progress = Math.min((Date.now() - start) / duration, 1);
        const ease = 1 - Math.pow(1 - progress, 3);
        setValue(Math.floor(ease * target));
        if (progress < 1) requestAnimationFrame(tick);
      };
      tick();
    }, { threshold: 0.5 });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target, duration]);
  return { value, ref };
}

// ── Titles data ───────────────────────────────────────────────────
const TITLES = [
  { name: 'Jujutsu Kaisen',       size: 'big',    featured: true  },
  { name: 'One Piece',            size: 'big',    featured: false },
  { name: 'Demon Slayer',         size: 'normal', featured: true  },
  { name: 'Attack on Titan',      size: 'normal', featured: false },
  { name: 'Chainsaw Man',         size: 'big',    featured: false },
  { name: 'Solo Leveling',        size: 'normal', featured: false },
  { name: 'Blue Lock',            size: 'normal', featured: true  },
  { name: 'Bleach: TYBW',         size: 'normal', featured: false },
  { name: 'Spy x Family',         size: 'big',    featured: false },
  { name: 'Frieren',              size: 'normal', featured: false },
  { name: 'Naruto Shippuden',     size: 'normal', featured: false },
  { name: 'Death Note',           size: 'normal', featured: true  },
  { name: 'Vinland Saga',         size: 'normal', featured: false },
  { name: 'Dragon Ball Super',    size: 'big',    featured: false },
  { name: 'My Hero Academia',     size: 'normal', featured: false },
  { name: 'Tokyo Revengers',      size: 'normal', featured: false },
  { name: 'Dandadan',             size: 'normal', featured: true  },
  { name: 'Re:Zero',              size: 'normal', featured: false },
  { name: 'Hell\'s Paradise',     size: 'normal', featured: false },
  { name: 'Sakamoto Days',        size: 'big',    featured: false },
  { name: 'The Apothecary Diaries', size: 'normal', featured: false },
  { name: 'JoJo\'s Bizarre Adventure', size: 'normal', featured: false },
  { name: 'Oshi no Ko',           size: 'normal', featured: true  },
  { name: 'Black Clover',         size: 'normal', featured: false },
  { name: 'Kaiju No. 8',          size: 'normal', featured: false },
  { name: 'Boruto',               size: 'big',    featured: false },
  { name: 'Baki Hanma',           size: 'normal', featured: false },
  { name: 'Classroom of the Elite', size: 'normal', featured: false },
  { name: 'Beastars',             size: 'normal', featured: true  },
  { name: '+ Thousands More',     size: 'normal', featured: false },
];

const FEATURES = [
  { icon: '⚡', title: 'Zero Buffering',       color: 'var(--pink)',   desc: 'Multiple high-performance servers. Switch instantly with one click. No loading circles ruining your immersion.' },
  { icon: '🎌', title: 'Sub & Dub Every Time', color: 'var(--purple)', desc: 'Every title in original Japanese with subtitles AND full English dub. Your preference, always.' },
  { icon: '📱', title: 'Any Device',            color: 'var(--blue)',   desc: 'Install as a PWA on your homescreen. Works offline. KamiStream goes wherever you go.' },
  { icon: '🏆', title: 'XP & Achievements',     color: 'var(--gold)',   desc: 'Earn XP, unlock achievements, track history, rate episodes, compete on leaderboards. Anime is better together.' },
  { icon: '📅', title: 'Always Updated',         color: 'var(--green)',  desc: 'New episodes within hours of airing in Japan. Seasonal schedule, coming soon section, live countdowns.' },
  { icon: '🔓', title: 'Truly Free',             color: 'var(--pink)',   desc: 'No subscription. No credit card. No sign-up to watch. Just click play — the way it should be.' },
];

const WHY_ITEMS = [
  { num: '01', title: 'We felt the pain too',       desc: 'Clunky sites, broken players, pop-up nightmares. We built KamiStream because every other option was letting us down.' },
  { num: '02', title: 'Viewer experience first',    desc: 'Every decision — server choice, UI design, feature priority — starts with one question: does this make watching better?' },
  { num: '03', title: 'Ads that don\'t ruin your day', desc: 'We use ads to keep servers running, but they\'re carefully managed. No malware, no fake buttons. Fair trade for free anime.' },
  { num: '04', title: 'Content that doesn\'t vanish', desc: 'When the giants went dark their libraries disappeared overnight. KamiStream is built to stay — multiple source redundancy.' },
];

const COMPARE_ROWS = [
  { label: '100% Free',               kami: true,  crunchy: false,  others: 'partial' },
  { label: 'No Sign-Up Required',     kami: true,  crunchy: false,  others: 'partial' },
  { label: 'Sub & Dub Available',     kami: true,  crunchy: true,   others: 'partial' },
  { label: 'PWA / Installable App',   kami: true,  crunchy: true,   others: false     },
  { label: 'Episode Ratings',         kami: true,  crunchy: false,  others: false     },
  { label: 'XP & Achievement System', kami: true,  crunchy: false,  others: false     },
  { label: 'Clean Modern UI',         kami: true,  crunchy: true,   others: false     },
  { label: 'Download Episodes',       kami: true,  crunchy: false,  others: 'partial' },
];

const MARQUEE_TITLES = [
  'Jujutsu Kaisen','One Piece','Demon Slayer','Attack on Titan',
  'Chainsaw Man','Solo Leveling','Blue Lock','Bleach TYBW',
  'Spy x Family','Frieren','Vinland Saga','Death Note',
];

function CellIcon({ val }: { val: boolean | string }) {
  if (val === true)      return <Check className="w-4 h-4 text-[var(--green)]" />;
  if (val === false)     return <X     className="w-4 h-4 text-[var(--border)]" style={{ color: '#444' }} />;
  return <span className="text-[11px] font-black text-[var(--gold)]">Partial</span>;
}

// ── Page ──────────────────────────────────────────────────────────
export default function About() {
  useSEO({
    title: 'About KamiStream',
    description: 'KamiStream is a free anime streaming site built by fans, for fans. Sub & dub, HD quality, no sign-up needed. The next generation anime experience.',
  });

  const { value: v1, ref: r1 } = useCountUp(10000);
  const { value: v2, ref: r2 } = useCountUp(50000);
  const { value: v3, ref: r3 } = useCountUp(99);

  const pageUrl  = typeof window !== 'undefined' ? window.location.origin : 'https://kamistream.fun';
  const shareText = encodeURIComponent('Watch anime free on KamiStream!');
  const shareUrl  = encodeURIComponent(pageUrl);

  return (
    <div className="overflow-x-hidden">

      {/* ── Keyframe injections ── */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
        .kami-marquee { animation: marquee 35s linear infinite; }
        .kami-spin-20 { animation: spin 20s linear infinite; }
        .kami-spin-15 { animation: spin 15s linear infinite reverse; }
        .kami-spin-25 { animation: spin 25s linear infinite; }
      `}</style>

      {/* ══ HERO ══════════════════════════════════════════════════ */}
      <section className="relative min-h-screen flex flex-col items-center justify-center text-center px-6 py-20 overflow-hidden">
        {/* Orbs */}
        <div className="absolute top-[-200px] right-[-100px] w-[500px] h-[500px] rounded-full opacity-30 blur-[100px] animate-pulse" style={{ background: 'var(--pink)' }} />
        <div className="absolute bottom-[-200px] left-[-100px] w-[500px] h-[500px] rounded-full opacity-25 blur-[100px] animate-pulse" style={{ background: 'var(--purple)', animationDelay: '1.5s' }} />
        <div className="absolute top-[40%] left-[40%] w-[400px] h-[400px] rounded-full opacity-10 blur-[80px] animate-pulse" style={{ background: 'var(--blue)', animationDelay: '3s' }} />

        {/* Grid overlay */}
        <div className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />

        <div className="relative z-10 max-w-4xl mx-auto">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-[var(--pink)]/10 border border-[var(--pink)]/30 rounded-full px-4 py-1.5 text-[11px] font-black text-[var(--pink)] uppercase tracking-widest mb-8">
            <span className="w-1.5 h-1.5 bg-[var(--pink)] rounded-full animate-pulse" />
            Free · No Sign-Up · HD Quality
          </div>

          {/* Logo */}
          <h1 className="font-heading font-black leading-none mb-6" style={{ fontSize: 'clamp(64px, 14vw, 160px)' }}>
            <span className="text-white">KAMI</span>
            <span style={{ background: 'linear-gradient(135deg, var(--pink) 0%, var(--purple) 50%, var(--blue) 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>STREAM</span>
          </h1>

          <p className="text-[18px] md:text-[22px] font-light text-[var(--text2)] max-w-2xl mx-auto mb-10 leading-relaxed">
            The <strong className="text-white font-bold">next generation</strong> anime streaming experience.<br />
            Built by fans. Powered by passion. <strong className="text-white font-bold">Free forever.</strong>
          </p>

          {/* CTAs */}
          <div className="flex gap-3 justify-center flex-wrap mb-16">
            <Link href="/">
              <button className="flex items-center gap-2 bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white font-black text-[15px] px-8 py-3.5 rounded-full hover:brightness-110 transition-all shadow-lg shadow-[var(--pink)]/30 hover:-translate-y-0.5">
                <Play className="w-4 h-4 fill-current" /> Start Watching
              </button>
            </Link>
            <Link href="/browse">
              <button className="flex items-center gap-2 bg-white/5 backdrop-blur-sm border border-white/12 text-white font-bold text-[15px] px-8 py-3.5 rounded-full hover:bg-white/10 transition-all hover:-translate-y-0.5">
                Browse Library <ArrowRight className="w-4 h-4" />
              </button>
            </Link>
          </div>

          {/* Stats */}
          <div className="flex gap-8 md:gap-16 justify-center flex-wrap" ref={r1 as any}>
            <div className="text-center">
              <p className="font-heading font-black text-[40px] md:text-[52px] leading-none" style={{ background: 'linear-gradient(135deg, var(--pink), var(--purple))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                {v1.toLocaleString()}+
              </p>
              <p className="text-[11px] font-bold text-[var(--text3)] uppercase tracking-widest mt-1">Anime Titles</p>
            </div>
            <div className="text-center" ref={r2 as any}>
              <p className="font-heading font-black text-[40px] md:text-[52px] leading-none" style={{ background: 'linear-gradient(135deg, var(--pink), var(--purple))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                {v2.toLocaleString()}+
              </p>
              <p className="text-[11px] font-bold text-[var(--text3)] uppercase tracking-widest mt-1">Episodes</p>
            </div>
            <div className="text-center" ref={r3 as any}>
              <p className="font-heading font-black text-[40px] md:text-[52px] leading-none" style={{ background: 'linear-gradient(135deg, var(--pink), var(--purple))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                {v3}%
              </p>
              <p className="text-[11px] font-bold text-[var(--text3)] uppercase tracking-widest mt-1">HD Quality</p>
            </div>
            <div className="text-center">
              <p className="font-heading font-black text-[40px] md:text-[52px] leading-none" style={{ background: 'linear-gradient(135deg, var(--pink), var(--purple))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                FREE
              </p>
              <p className="text-[11px] font-bold text-[var(--text3)] uppercase tracking-widest mt-1">Always</p>
            </div>
          </div>
        </div>

        {/* Scroll hint */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-[var(--text3)] text-[10px] font-bold uppercase tracking-widest">
          <span>scroll</span>
          <div className="w-px h-10 bg-gradient-to-b from-[var(--pink)] to-transparent animate-pulse" />
        </div>
      </section>

      {/* ══ MARQUEE ═══════════════════════════════════════════════ */}
      <div className="border-y border-[var(--border)] bg-[var(--bg2)] py-5 overflow-hidden">
        <div className="flex gap-8 kami-marquee w-max">
          {[...MARQUEE_TITLES, ...MARQUEE_TITLES].map((t, i) => (
            <div key={i} className="flex items-center gap-3 font-heading font-black text-[22px] text-[var(--text3)] whitespace-nowrap hover:text-[var(--pink)] transition-colors cursor-default">
              {t} <span className="text-[var(--pink)] opacity-40">✦</span>
            </div>
          ))}
        </div>
      </div>

      {/* ══ FEATURES ══════════════════════════════════════════════ */}
      <section className="py-24 px-6 bg-gradient-to-b from-[var(--bg)] to-[var(--bg2)]">
        <div className="max-w-6xl mx-auto">
          <p className="font-mono text-[11px] font-bold text-[var(--pink)] uppercase tracking-[0.2em] mb-3">// why kamistream</p>
          <h2 className="font-heading font-black text-white mb-3" style={{ fontSize: 'clamp(40px, 6vw, 72px)', lineHeight: 0.95 }}>BUILT DIFFERENT</h2>
          <p className="text-[16px] text-[var(--text2)] mb-14 max-w-lg">Every feature engineered for the real anime fan. No compromises.</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-[var(--border)] rounded-2xl overflow-hidden">
            {FEATURES.map((f, i) => (
              <div key={i} className="bg-[var(--card)] p-8 relative overflow-hidden group hover:bg-[#16161f] transition-colors">
                <div className="absolute top-0 left-0 right-0 h-0.5 origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-500"
                  style={{ background: `linear-gradient(90deg, ${f.color}, var(--purple))` }} />
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl mb-5"
                  style={{ background: f.color + '18' }}>
                  {f.icon}
                </div>
                <h3 className="text-[17px] font-black text-white mb-2">{f.title}</h3>
                <p className="text-[13px] text-[var(--text2)] leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ OUR STORY ═════════════════════════════════════════════ */}
      <section className="py-24 px-6 bg-[var(--bg)]">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">

            {/* Visual */}
            <div className="relative aspect-square max-w-sm mx-auto lg:mx-0">
              {[
                { cls: 'kami-spin-20', color: 'rgba(255,45,120,0.2)',   inset: '0%'  },
                { cls: 'kami-spin-15', color: 'rgba(155,93,229,0.15)',  inset: '10%' },
                { cls: 'kami-spin-25', color: 'rgba(67,97,238,0.1)',    inset: '20%' },
              ].map((ring, i) => (
                <div key={i} className={`absolute rounded-full border ${ring.cls}`}
                  style={{ inset: ring.inset, borderColor: ring.color }} />
              ))}
              <div className="absolute inset-[30%] rounded-full flex items-center justify-center font-heading font-black text-[28px] text-white"
                style={{ background: 'linear-gradient(135deg, var(--pink), var(--purple))', boxShadow: '0 0 80px rgba(255,45,120,0.4)' }}>
                KAMI
              </div>
            </div>

            {/* Content */}
            <div>
              <p className="font-mono text-[11px] font-bold text-[var(--pink)] uppercase tracking-[0.2em] mb-3">// our story</p>
              <h2 className="font-heading font-black text-white mb-8" style={{ fontSize: 'clamp(36px, 5vw, 56px)', lineHeight: 0.95 }}>
                MADE BY FANS,<br />FOR FANS
              </h2>
              <div className="space-y-4">
                {WHY_ITEMS.map((item, i) => (
                  <div key={i} className="flex gap-4 p-5 rounded-2xl border border-[var(--border)] bg-[var(--card)] hover:border-[var(--pink)]/30 hover:translate-x-2 transition-all group cursor-default">
                    <span className="font-heading font-black text-[32px] text-[var(--pink)] opacity-25 group-hover:opacity-100 transition-opacity leading-none shrink-0 w-10">{item.num}</span>
                    <div>
                      <h4 className="text-[14px] font-black text-white mb-1">{item.title}</h4>
                      <p className="text-[12px] text-[var(--text2)] leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ COMPARISON ════════════════════════════════════════════ */}
      <section className="py-24 px-6 bg-[var(--bg2)]">
        <div className="max-w-4xl mx-auto">
          <p className="font-mono text-[11px] font-bold text-[var(--pink)] uppercase tracking-[0.2em] mb-3">// the honest comparison</p>
          <h2 className="font-heading font-black text-white mb-14" style={{ fontSize: 'clamp(40px, 6vw, 72px)', lineHeight: 0.95 }}>VS THE REST</h2>

          <div className="border border-[var(--border)] rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-4 bg-[var(--card)] border-b border-[var(--border)]">
              <div className="p-4 text-[12px] font-black text-[var(--text3)] uppercase tracking-wider">Feature</div>
              <div className="p-4 text-[12px] font-black text-[var(--pink)] uppercase tracking-wider border-l border-[var(--border)]"
                style={{ background: 'linear-gradient(135deg, rgba(255,45,120,0.08), rgba(155,93,229,0.08))' }}>
                KamiStream ✦
              </div>
              <div className="p-4 text-[12px] font-black text-[var(--text3)] uppercase tracking-wider border-l border-[var(--border)]">Crunchyroll</div>
              <div className="p-4 text-[12px] font-black text-[var(--text3)] uppercase tracking-wider border-l border-[var(--border)]">Other Free</div>
            </div>

            {COMPARE_ROWS.map((row, i) => (
              <div key={i} className="grid grid-cols-4 border-b border-[var(--border)] last:border-b-0 hover:bg-white/[0.02] transition-colors">
                <div className="p-4 text-[13px] font-bold text-[var(--text2)]">{row.label}</div>
                <div className="p-4 border-l border-[var(--border)] flex items-center"
                  style={{ background: 'linear-gradient(135deg, rgba(255,45,120,0.04), rgba(155,93,229,0.04))' }}>
                  <CellIcon val={row.kami} />
                </div>
                <div className="p-4 border-l border-[var(--border)] flex items-center">
                  <CellIcon val={row.crunchy} />
                </div>
                <div className="p-4 border-l border-[var(--border)] flex items-center">
                  <CellIcon val={row.others} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ POPULAR TITLES ════════════════════════════════════════ */}
      <section className="py-24 px-6 bg-[var(--bg)]">
        <div className="max-w-5xl mx-auto text-center">
          <p className="font-mono text-[11px] font-bold text-[var(--pink)] uppercase tracking-[0.2em] mb-3">// now streaming</p>
          <h2 className="font-heading font-black text-white mb-14" style={{ fontSize: 'clamp(40px, 6vw, 72px)', lineHeight: 0.95 }}>POPULAR TITLES</h2>

          <div className="flex flex-wrap gap-2.5 justify-center">
            {TITLES.map((t, i) => (
              <Link key={i} href={`/search?q=${encodeURIComponent(t.name)}`}>
                <span className={`inline-block rounded-full border cursor-pointer transition-all hover:scale-105 hover:border-[var(--pink)] hover:text-white hover:bg-[var(--pink)]/10 ${
                  t.featured
                    ? 'border-[var(--pink)]/40 text-[var(--pink)] bg-[var(--pink)]/08 font-black'
                    : 'border-[var(--border)] text-[var(--text2)] bg-[var(--card)] font-semibold'
                } ${t.size === 'big' ? 'text-[15px] px-5 py-2.5' : 'text-[13px] px-4 py-2'}`}>
                  {t.name}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ══ SHARE / CTA ═══════════════════════════════════════════ */}
      <section className="py-24 px-6 text-center bg-[var(--bg2)] relative overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-[700px] h-[700px] rounded-full opacity-10 blur-[120px]"
            style={{ background: 'radial-gradient(circle, var(--pink), transparent 70%)' }} />
        </div>

        <div className="relative z-10 max-w-2xl mx-auto">
          <h2 className="font-heading font-black text-white mb-4" style={{ fontSize: 'clamp(48px, 8vw, 96px)', lineHeight: 0.9 }}>
            SHARE THE{' '}
            <span style={{ background: 'linear-gradient(135deg, var(--pink), var(--purple))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              STREAM
            </span>
          </h2>
          <p className="text-[17px] text-[var(--text2)] mb-10">
            If KamiStream saved your anime life, help it grow.<br />
            One share = more people, better site.
          </p>

          {/* Share buttons */}
          <div className="flex flex-wrap gap-3 justify-center mb-8">
            {[
              { label: 'Facebook',  color: '#1877f2', href: `https://www.facebook.com/sharer/sharer.php?u=${shareUrl}` },
              { label: 'X / Twitter', color: '#000', border: true, href: `https://twitter.com/intent/tweet?text=${shareText}&url=${shareUrl}` },
              { label: 'WhatsApp', color: '#25d366', href: `https://api.whatsapp.com/send?text=${shareText}%20${shareUrl}` },
              { label: 'Telegram', color: '#2ca5e0', href: `https://t.me/share/url?url=${shareUrl}&text=${shareText}` },
              { label: 'Reddit',   color: '#ff4500', href: `https://www.reddit.com/submit?url=${shareUrl}&title=${shareText}` },
            ].map(btn => (
              <a key={btn.label} href={btn.href} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-5 py-2.5 rounded-full text-[13px] font-bold text-white transition-all hover:-translate-y-1 hover:brightness-110"
                style={{ background: btn.color, border: (btn as any).border ? '1px solid rgba(255,255,255,0.2)' : 'none' }}>
                {btn.label}
              </a>
            ))}
          </div>

          <p className="text-[12px] text-[var(--text3)]">
            Join <strong className="text-[var(--pink)]">thousands</strong> of anime fans already watching on KamiStream
          </p>

          <div className="mt-10">
            <Link href="/">
              <button className="bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white font-black text-[15px] px-10 py-4 rounded-full hover:brightness-110 transition-all shadow-xl shadow-[var(--pink)]/20 hover:-translate-y-1">
                Start Watching Free →
              </button>
            </Link>
          </div>
        </div>
      </section>

    </div>
  );
}
