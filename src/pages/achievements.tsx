import React, { useEffect } from 'react';
import { useGamification, ACHIEVEMENTS, calculateLevel, xpForLevel, xpForNextLevel } from '@/hooks/useGamification';
import { useSEO } from '@/hooks/useSEO';
import { Trophy, Lock, Zap } from 'lucide-react';

export default function Achievements() {
  useSEO({ title: 'Achievements' });
  const { getStats, checkAndUnlockAchievements } = useGamification();
  const stats    = getStats();
  const earned   = stats.achievements;
  const level    = calculateLevel(stats.totalXP);
  const xpStart  = xpForLevel(level);
  const xpEnd    = xpForNextLevel(level);
  const xpPct    = xpEnd > xpStart ? Math.round(((stats.totalXP - xpStart) / (xpEnd - xpStart)) * 100) : 100;

  useEffect(() => { checkAndUnlockAchievements(stats); }, []);

  const unlocked = ACHIEVEMENTS.filter(a => earned.includes(a.id));
  const locked   = ACHIEVEMENTS.filter(a => !earned.includes(a.id));

  return (
    <div className="p-4 md:p-6 pb-20 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--gold)] to-orange-500 flex items-center justify-center">
          <Trophy className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-heading font-black text-white">Achievements</h1>
          <p className="text-[13px] text-[var(--text3)]">{unlocked.length} / {ACHIEVEMENTS.length} unlocked</p>
        </div>
      </div>

      {/* XP / Level */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 mb-8 flex items-center gap-6">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[var(--pink)] to-[var(--purple)] flex flex-col items-center justify-center shrink-0">
          <div className="text-[10px] font-black text-white/70 uppercase tracking-wide">LVL</div>
          <div className="text-2xl font-heading font-black text-white leading-none">{level}</div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex justify-between text-[11px] font-bold text-[var(--text3)] mb-1.5">
            <span className="flex items-center gap-1"><Zap className="w-3 h-3 text-[var(--gold)]" />{stats.totalXP.toLocaleString()} XP</span>
            <span>{xpEnd - xpStart - (stats.totalXP - xpStart)} XP to Level {level + 1}</span>
          </div>
          <div className="h-3 bg-[var(--bg3)] rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] rounded-full transition-all"
              style={{ width: `${xpPct}%` }} />
          </div>
        </div>
      </div>

      {/* Unlocked */}
      {unlocked.length > 0 && (
        <section className="mb-8">
          <h2 className="text-[13px] font-black text-[var(--text3)] uppercase tracking-widest mb-4">Unlocked</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {unlocked.map(a => (
              <AchievementCard key={a.id} achievement={a} unlocked />
            ))}
          </div>
        </section>
      )}

      {/* Locked */}
      {locked.length > 0 && (
        <section>
          <h2 className="text-[13px] font-black text-[var(--text3)] uppercase tracking-widest mb-4">Locked</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {locked.map(a => (
              <AchievementCard key={a.id} achievement={a} unlocked={false} />
            ))}
          </div>
        </section>
      )}

      {unlocked.length === 0 && (
        <div className="text-center py-12">
          <div className="text-5xl mb-3">🏆</div>
          <h3 className="text-[16px] font-heading font-black text-white mb-2">No achievements yet</h3>
          <p className="text-[13px] text-[var(--text3)]">Start watching anime to earn your first achievement.</p>
        </div>
      )}
    </div>
  );
}

function AchievementCard({ achievement: a, unlocked }: { achievement: typeof ACHIEVEMENTS[number]; unlocked: boolean }) {
  return (
    <div className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${unlocked
      ? 'bg-gradient-to-r from-[var(--gold)]/5 to-transparent border-[var(--gold)]/20'
      : 'bg-[var(--card)] border-[var(--border)] opacity-50 grayscale'}`}>
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0 ${unlocked ? 'bg-[var(--gold)]/10' : 'bg-[var(--bg3)]'}`}>
        {unlocked ? a.icon : <Lock className="w-5 h-5 text-[var(--text3)]" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-[13px] font-bold ${unlocked ? 'text-white' : 'text-[var(--text3)]'}`}>{a.title}</p>
        <p className="text-[11px] text-[var(--text3)] mt-0.5">{a.description}</p>
        <div className="flex items-center gap-1 mt-1.5">
          <Zap className="w-3 h-3 text-[var(--gold)]" />
          <span className="text-[10px] font-black text-[var(--gold)]">+{a.xpReward} XP</span>
        </div>
      </div>
      {unlocked && <div className="text-[var(--gold)] shrink-0">✓</div>}
    </div>
  );
}
