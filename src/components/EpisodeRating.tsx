import React, { useState } from 'react';
import { Star } from 'lucide-react';
import { useEpisodeRating } from '@/hooks/useEpisodeRating';

const REACTIONS = [
  { emoji: '🔥', label: 'Fire' },
  { emoji: '😭', label: 'Crying' },
  { emoji: '🤯', label: 'Mind blown' },
  { emoji: '😂', label: 'Funny' },
  { emoji: '❤️', label: 'Love' },
  { emoji: '😴', label: 'Boring' },
];

interface Props { malId: string; epId: string; epTitle?: string; }

export function EpisodeRating({ malId, epId, epTitle }: Props) {
  const { myRating, rate } = useEpisodeRating(malId, epId);
  const [hovered, setHovered] = useState(0);
  const [submitted, setSubmitted] = useState(!!myRating);
  const [selectedReaction, setSelectedReaction] = useState(myRating?.reaction || '');

  function handleStar(star: number) {
    rate(star, selectedReaction);
    setSubmitted(true);
  }

  function handleReaction(emoji: string) {
    const next = selectedReaction === emoji ? '' : emoji;
    setSelectedReaction(next);
    if (myRating) rate(myRating.rating, next);
  }

  return (
    <div className="mt-6 bg-[var(--card)] border border-[var(--border)] rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[12px] font-black text-white uppercase tracking-wider">
          Rate This Episode
        </h3>
        {epTitle && <span className="text-[10px] text-[var(--text3)] truncate max-w-[200px]">{epTitle}</span>}
      </div>

      {/* Star rating */}
      <div className="flex items-center gap-1.5 mb-4">
        {[1, 2, 3, 4, 5].map(star => (
          <button
            key={star}
            onMouseEnter={() => setHovered(star)}
            onMouseLeave={() => setHovered(0)}
            onClick={() => handleStar(star)}
            className="transition-transform hover:scale-110 active:scale-95"
          >
            <Star
              className={`w-7 h-7 transition-colors ${
                star <= (hovered || myRating?.rating || 0)
                  ? 'fill-[var(--gold)] text-[var(--gold)]'
                  : 'text-[var(--border)] fill-transparent'
              }`}
            />
          </button>
        ))}
        {myRating && (
          <span className="ml-2 text-[11px] font-black text-[var(--gold)]">
            {myRating.rating}/5
          </span>
        )}
      </div>

      {/* Reactions */}
      <div className="flex flex-wrap gap-2">
        {REACTIONS.map(({ emoji, label }) => (
          <button
            key={emoji}
            onClick={() => handleReaction(emoji)}
            title={label}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[13px] border transition-all hover:scale-105 active:scale-95 ${
              selectedReaction === emoji
                ? 'bg-[var(--pink)]/20 border-[var(--pink)]/50 scale-105'
                : 'bg-[var(--bg3)] border-[var(--border)] hover:border-[var(--border)]'
            }`}
          >
            {emoji}
            <span className="text-[10px] font-bold text-[var(--text3)]">{label}</span>
          </button>
        ))}
      </div>

      {submitted && (
        <p className="text-[10px] text-[var(--green)] font-bold mt-3">
          ✓ Rating saved! {selectedReaction && `You reacted with ${selectedReaction}`}
        </p>
      )}
    </div>
  );
}
