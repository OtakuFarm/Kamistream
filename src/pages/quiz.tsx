import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSEO } from '@/hooks/useSEO';
import { useGamification } from '@/hooks/useGamification';
import { HelpCircle, Zap, RotateCcw, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

const TOTAL_QUESTIONS = 10;

export default function Quiz() {
  useSEO({ title: 'Anime Quiz' });
  const { addXP, incrementStat } = useGamification();

  const [phase, setPhase]         = useState<'start' | 'quiz' | 'result'>('start');
  const [pool,  setPool]          = useState<any[]>([]);
  const [round, setRound]         = useState(0);
  const [score, setScore]         = useState(0);
  const [answered, setAnswered]   = useState<string | null>(null);
  const [options, setOptions]     = useState<string[]>([]);
  const [current, setCurrent]     = useState<any | null>(null);

  const { data: topData, isLoading } = useQuery({
    queryKey: ['quiz-pool'],
    queryFn: async () => {
      const [r1, r2] = await Promise.all([
        fetch('https://api.jikan.moe/v4/top/anime?limit=25&page=1&sfw=true').then(r => r.json()),
        fetch('https://api.jikan.moe/v4/top/anime?limit=25&page=2&sfw=true').then(r => r.json()),
      ]);
      return [...(r1.data || []), ...(r2.data || [])];
    },
    staleTime: 30 * 60 * 1000,
  });

  function shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function buildQuestion(animePool: any[], idx: number) {
    const quizPool = shuffle(animePool).slice(0, TOTAL_QUESTIONS + 20);
    const q = quizPool[idx % quizPool.length];
    const wrongs = shuffle(quizPool.filter(a => a.mal_id !== q.mal_id)).slice(0, 3).map(a => a.title);
    const opts = shuffle([q.title, ...wrongs]);
    setCurrent(q);
    setOptions(opts);
    setAnswered(null);
  }

  function startQuiz() {
    if (!topData?.length) return;
    const p = shuffle(topData);
    setPool(p);
    setRound(0);
    setScore(0);
    setPhase('quiz');
    buildQuestion(p, 0);
  }

  function handleAnswer(choice: string) {
    if (answered !== null) return;
    setAnswered(choice);
    const correct = choice === current.title;
    if (correct) {
      setScore(s => s + 1);
      addXP(20);
      toast.success('+20 XP — Correct!', { duration: 1500 });
    }
    incrementStat('episodesVisited', 0);
    setTimeout(() => {
      if (round + 1 >= TOTAL_QUESTIONS) {
        setPhase('result');
      } else {
        setRound(r => r + 1);
        buildQuestion(pool, round + 1);
      }
    }, 1400);
  }

  const grade = useMemo(() => {
    if (score === TOTAL_QUESTIONS) return { label: 'Perfect!', emoji: '🏆', color: 'text-[var(--gold)]' };
    if (score >= 8) return { label: 'Excellent!', emoji: '🌟', color: 'text-[var(--green)]' };
    if (score >= 6) return { label: 'Good Job!', emoji: '👍', color: 'text-[var(--blue)]' };
    if (score >= 4) return { label: 'Not Bad!', emoji: '🙂', color: 'text-[var(--purple)]' };
    return { label: 'Keep Practicing!', emoji: '💪', color: 'text-[var(--text3)]' };
  }, [score]);

  if (isLoading) return (
    <div className="flex items-center justify-center h-[60vh]">
      <div className="animate-spin w-8 h-8 border-2 border-[var(--pink)] border-t-transparent rounded-full" />
    </div>
  );

  return (
    <div className="p-4 md:p-6 pb-20 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--blue)] to-[var(--purple)] flex items-center justify-center">
          <HelpCircle className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-heading font-black text-white">Anime Quiz</h1>
          <p className="text-[13px] text-[var(--text3)]">Guess the anime from the cover image</p>
        </div>
      </div>

      {/* ── Start Screen ── */}
      {phase === 'start' && (
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-8 text-center">
          <div className="text-6xl mb-4">🎯</div>
          <h2 className="text-xl font-heading font-black text-white mb-2">Ready to test your knowledge?</h2>
          <p className="text-[13px] text-[var(--text3)] mb-2">{TOTAL_QUESTIONS} questions — identify anime from their cover image</p>
          <p className="text-[12px] text-[var(--gold)] font-bold mb-6 flex items-center justify-center gap-1">
            <Zap className="w-3.5 h-3.5" /> +20 XP per correct answer
          </p>
          <button onClick={startQuiz}
            className="bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white px-8 py-3 rounded-xl text-[14px] font-bold hover:brightness-110 transition-all">
            Start Quiz
          </button>
        </div>
      )}

      {/* ── Quiz Screen ── */}
      {phase === 'quiz' && current && (
        <div className="space-y-5">
          {/* Progress */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] font-bold text-[var(--text3)]">Question {round + 1} / {TOTAL_QUESTIONS}</span>
            <span className="text-[12px] font-bold text-[var(--gold)]">Score: {score}</span>
          </div>
          <div className="h-2 bg-[var(--card)] rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] rounded-full transition-all duration-300"
              style={{ width: `${((round) / TOTAL_QUESTIONS) * 100}%` }} />
          </div>

          {/* Cover */}
          <div className="relative rounded-2xl overflow-hidden aspect-[16/9] bg-[var(--card)] border border-[var(--border)]">
            <img src={current.images?.webp?.large_image_url || current.images?.jpg?.large_image_url}
              alt="?" className={`w-full h-full object-cover object-top transition-all duration-300 ${answered === null ? 'blur-lg scale-110' : 'blur-0 scale-100'}`} />
            {answered === null && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-white/50 text-[16px] font-black">Which anime is this?</div>
              </div>
            )}
            {answered !== null && (
              <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/90 to-transparent">
                <p className="text-white font-bold text-[13px]">{current.title}</p>
                {current.score && <p className="text-[var(--gold)] text-[11px]">★ {current.score}</p>}
              </div>
            )}
          </div>

          {/* Options */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {options.map(opt => {
              const isCorrect = opt === current.title;
              const isChosen  = opt === answered;
              let cls = 'bg-[var(--card)] border-[var(--border)] text-[var(--text2)] hover:border-[var(--purple)] hover:text-white';
              if (answered !== null) {
                if (isCorrect) cls = 'bg-[var(--green)]/10 border-[var(--green)] text-white';
                else if (isChosen) cls = 'bg-red-500/10 border-red-500 text-red-400';
                else cls = 'bg-[var(--card)] border-[var(--border)] text-[var(--text3)] opacity-50';
              }
              return (
                <button key={opt} onClick={() => handleAnswer(opt)} disabled={answered !== null}
                  className={`p-3.5 rounded-xl border text-[13px] font-bold text-left transition-all ${cls}`}>
                  {opt}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Result Screen ── */}
      {phase === 'result' && (
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-8 text-center">
          <div className="text-6xl mb-4">{grade.emoji}</div>
          <h2 className={`text-2xl font-heading font-black mb-1 ${grade.color}`}>{grade.label}</h2>
          <p className="text-[15px] text-white font-bold mb-1">{score} / {TOTAL_QUESTIONS} correct</p>
          <p className="text-[13px] text-[var(--gold)] font-bold flex items-center justify-center gap-1 mb-6">
            <Zap className="w-3.5 h-3.5" /> +{score * 20} XP earned this round
          </p>
          <button onClick={startQuiz}
            className="bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white px-8 py-3 rounded-xl text-[14px] font-bold hover:brightness-110 transition-all flex items-center gap-2 mx-auto">
            <RotateCcw className="w-4 h-4" /> Play Again
          </button>
        </div>
      )}
    </div>
  );
}
