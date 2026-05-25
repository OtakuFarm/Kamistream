import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { getAiringSchedule } from '@/lib/anilist';
import { Play } from 'lucide-react';
import { useSEO } from '@/hooks/useSEO';

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const SHORT = ['SUN','MON','TUE','WED','THU','FRI','SAT'];

export default function Schedule() {
  useSEO({ title: 'Estimated Schedule', description: 'Weekly anime airing schedule on KamiStream.' });

  const today   = new Date();
  const todayIdx = today.getDay();
  const [activeDay, setActiveDay] = useState(todayIdx);
  const [showAll, setShowAll] = useState(false);

  const { data: schedule, isLoading } = useQuery({
    queryKey: ['anilist', 'airing-schedule'],
    queryFn: getAiringSchedule,
    staleTime: 15 * 60 * 1000,
  });

  const byDay: Record<number, any[]> = { 0:[], 1:[], 2:[], 3:[], 4:[], 5:[], 6:[] };
  (schedule || []).forEach((item: any) => {
    const d = new Date(item.airingAt * 1000).getDay();
    byDay[d]?.push(item);
  });

  const items = (byDay[activeDay] || []).sort((a: any, b: any) => a.airingAt - b.airingAt);
  const visible = showAll ? items : items.slice(0, 8);

  // Build 7-day date labels starting from today-1
  const dateLabels = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - 1 + i);
    return { day: d.getDay(), date: d, label: `${d.toLocaleString('default', { month: 'short' }).toUpperCase()} ${d.getDate()}` };
  });

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-[18px] font-heading font-black text-white flex items-center gap-2">
          Estimated Schedule
          <span className="text-[12px] text-[var(--text3)] font-normal">
            — Now: {today.toLocaleString()}
          </span>
        </h1>
      </div>

      {/* Day tabs — AniWave style */}
      <div className="relative mb-1">
        <div className="flex items-center">
          <div className="flex-1 overflow-x-auto scrollbar-hide">
            <div className="flex border-b border-[var(--border)]">
              {dateLabels.map(({ day, date, label }, i) => {
                const isActive  = day === activeDay;
                const isToday   = date.toDateString() === today.toDateString();
                return (
                  <button key={i} onClick={() => { setActiveDay(day); setShowAll(false); }}
                    className={`shrink-0 flex flex-col items-center px-5 py-3 text-center transition-all border-b-2 -mb-px ${isActive ? 'border-[var(--pink)] text-white' : 'border-transparent text-[var(--text3)] hover:text-white'}`}>
                    <span className="text-[10px] font-bold tracking-wider">{label}</span>
                    <span className={`text-[18px] font-black leading-tight ${isActive ? 'text-white' : 'text-[var(--text3)]'} ${isToday ? 'text-[var(--pink)]' : ''}`}>
                      {SHORT[day]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Timeline list */}
      <div className="mt-4 flex flex-col">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 py-4 border-b border-[var(--border)] animate-pulse">
              <div className="w-16 h-4 bg-[var(--card)] rounded" />
              <div className="flex-1 h-4 bg-[var(--card)] rounded" />
              <div className="w-24 h-8 bg-[var(--card)] rounded-lg" />
            </div>
          ))
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-[var(--text3)]">
            <p className="font-bold">No schedule data for {DAYS[activeDay]}</p>
          </div>
        ) : (
          <>
            {visible.map((item: any) => {
              const t        = new Date(item.airingAt * 1000);
              const isPast   = t < today;
              const timeStr  = t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              const malId    = item.media?.idMal;
              const title    = item.media?.title?.english || item.media?.title?.romaji;

              return (
                <div key={`${item.media?.id}-${item.episode}`}
                  className="flex items-center gap-4 py-3.5 border-b border-[var(--border)] hover:bg-[var(--bg3)] -mx-2 px-2 rounded transition-colors group">

                  {/* Time */}
                  <div className={`w-16 shrink-0 text-[13px] font-black tabular-nums ${isPast ? 'text-[var(--text3)]' : 'text-white'}`}>
                    {timeStr}
                  </div>

                  {/* Title */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-[13px] font-bold truncate group-hover:text-[var(--pink)] transition-colors ${isPast ? 'text-[var(--text3)]' : 'text-white'}`}>
                      {title}
                    </p>
                  </div>

                  {/* Episode + play button */}
                  {malId ? (
                    <Link href={`/watch/${malId}/${item.episode}`}
                      className="shrink-0 flex items-center gap-2 bg-[var(--bg3)] hover:bg-[var(--pink)] border border-[var(--border)] hover:border-[var(--pink)] text-[var(--text3)] hover:text-white px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all">
                      <Play className="w-3 h-3 fill-current" />
                      Episode {item.episode}
                    </Link>
                  ) : (
                    <span className="shrink-0 text-[11px] text-[var(--text3)] font-bold px-3 py-1.5 bg-[var(--bg3)] rounded-lg border border-[var(--border)]">
                      Episode {item.episode}
                    </span>
                  )}
                </div>
              );
            })}

            {items.length > 8 && (
              <button onClick={() => setShowAll(s => !s)}
                className="mt-4 w-full py-2.5 text-[12px] font-bold text-[var(--text3)] hover:text-white border border-[var(--border)] rounded-xl hover:bg-[var(--bg3)] transition-all">
                {showAll ? 'Show less' : `Show more (${items.length - 8} more)`}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
