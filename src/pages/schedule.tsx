import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { getAiringSchedule } from '@/lib/anilist';
import { Calendar, Clock, Radio } from 'lucide-react';
import { useSEO } from '@/hooks/useSEO';

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

export default function Schedule() {
  useSEO({ title: 'Airing Schedule', description: 'Weekly anime airing schedule — see what episodes are airing today and this week on KamiStream.' });

  const todayIdx = new Date().getDay();
  const [activeDay, setActiveDay] = useState(todayIdx);

  const { data: schedule, isLoading } = useQuery({
    queryKey: ['anilist', 'airing-schedule'],
    queryFn: getAiringSchedule,
    staleTime: 15 * 60 * 1000,
  });

  // Group by weekday index
  const byDay: Record<number, any[]> = { 0:[], 1:[], 2:[], 3:[], 4:[], 5:[], 6:[] };
  (schedule || []).forEach((item: any) => {
    const d = new Date(item.airingAt * 1000).getDay();
    byDay[d]?.push(item);
  });

  const todayItems  = byDay[activeDay] || [];
  const totalToday  = todayItems.length;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Calendar className="w-6 h-6 text-[var(--pink)]" />
        <h1 className="text-2xl font-heading font-black text-white">Airing Schedule</h1>
        <span className="ml-auto text-[12px] text-[var(--text3)] font-bold flex items-center gap-1">
          <Radio className="w-3.5 h-3.5 text-[var(--green)]" /> Live AniList data
        </span>
      </div>

      {/* Day tabs */}
      <div className="flex gap-1.5 mb-6 overflow-x-auto pb-1 scrollbar-hide">
        {DAYS.map((day, i) => {
          const count = byDay[i]?.length || 0;
          const isToday = i === todayIdx;
          return (
            <button key={day} onClick={() => setActiveDay(i)}
              className={`shrink-0 px-4 py-2 rounded-xl text-[12px] font-bold transition-all flex items-center gap-1.5 ${activeDay === i
                ? 'bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white'
                : 'bg-[var(--card)] border border-[var(--border)] text-[var(--text2)] hover:text-white'}`}>
              {isToday && <Radio className="w-2.5 h-2.5 text-[var(--green)]" />}
              {day.slice(0, 3)}
              {count > 0 && <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-black ${activeDay === i ? 'bg-white/20' : 'bg-[var(--pink)]/20 text-[var(--pink)]'}`}>{count}</span>}
            </button>
          );
        })}
      </div>

      {/* Count */}
      <p className="text-[12px] text-[var(--text3)] mb-4 font-bold">
        {totalToday} anime airing on {DAYS[activeDay]}
        {activeDay === todayIdx && <span className="ml-2 text-[var(--green)]">· Today</span>}
      </p>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-24 bg-[var(--card)] rounded-xl animate-pulse" />
          ))}
        </div>
      ) : todayItems.length === 0 ? (
        <div className="text-center py-20 text-[var(--text3)]">
          <Calendar className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="font-bold">No episodes airing on {DAYS[activeDay]}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {todayItems
            .sort((a: any, b: any) => a.airingAt - b.airingAt)
            .map((item: any) => {
              const airingTime  = new Date(item.airingAt * 1000);
              const isPast      = airingTime < new Date();
              const timeStr     = airingTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              const minutesLeft = Math.round((item.airingAt * 1000 - Date.now()) / 60000);
              const malId       = item.media?.idMal;

              return (
                <div key={`${item.media?.id}-${item.episode}`}
                  className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 flex gap-3 hover:border-[var(--pink)]/40 transition-all group">
                  {/* Poster */}
                  <div className="w-14 h-20 rounded-lg overflow-hidden shrink-0 bg-[var(--bg3)]">
                    <img
                      src={item.media?.coverImage?.large}
                      alt={item.media?.title?.english || item.media?.title?.romaji}
                      className="w-full h-full object-cover"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-[13px] text-white line-clamp-2 leading-tight mb-1 group-hover:text-[var(--pink)] transition-colors">
                      {item.media?.title?.english || item.media?.title?.romaji}
                    </h3>
                    <p className="text-[11px] text-[var(--text3)] mb-2">
                      Episode <span className="text-[var(--pink)] font-black">{item.episode}</span>
                    </p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg ${isPast ? 'bg-[var(--bg3)] text-[var(--text3)]' : 'bg-[var(--pink)]/15 text-[var(--pink)]'}`}>
                        <Clock className="w-2.5 h-2.5" />
                        {isPast ? `Aired at ${timeStr}` : minutesLeft < 60 ? `${minutesLeft}m left` : timeStr}
                      </span>
                      {malId && (
                        <Link href={`/anime/${malId}`}
                          className="text-[10px] font-bold px-2 py-1 rounded-lg bg-[var(--purple)]/15 text-[var(--purple)] hover:bg-[var(--purple)]/30 transition-colors">
                          View Anime →
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
