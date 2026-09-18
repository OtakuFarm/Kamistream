import React, { useState } from 'react';
import { Heart, Trophy, Upload, Plus } from 'lucide-react';
import { Link } from 'wouter';
import { useAuth } from '@/lib/auth';
import {
  useActiveWeek,
  useSubmissions,
  useCountdown,
} from '@/hooks/useChallenge';
import { UploadModal } from '@/components/UploadModal';
import { useSEO } from '@/hooks/useSEO';

export default function Challenges() {
  const { user } = useAuth();
  const { week, loading: weekLoading } = useActiveWeek();
  const { submissions, loading: subsLoading, refresh, toggleLike } = useSubmissions(
    week?.id || null,
    user?.id || null
  );
  const countdown = useCountdown(week?.ends_at);
  const [showUpload, setShowUpload] = useState(false);
  const pad = (n: number) => n.toString().padStart(2, '0');
  useSEO({ title: 'Weekly Challenge', description: 'Submit your anime video clip, vote for your favourites and win prizes on KamiStream.' });

  return (
    <div className="min-h-[calc(100vh-60px)] bg-black text-white pb-24">
      {/* Header */}
      <div className="px-4 md:px-8 pt-6">
        <div className="bg-gradient-to-r from-[var(--card)] to-[var(--bg2)] border border-[var(--border)] rounded-2xl p-5 flex flex-col md:flex-row items-start md:items-center gap-5 justify-between">
          <div>
            <div className="text-[10px] font-black text-[var(--pink)] tracking-[2px] uppercase mb-1">
              Weekly Theme
            </div>
            <div className="font-heading font-black text-xl md:text-2xl text-white">
              {weekLoading
                ? 'Loading challenge…'
                : week?.theme || 'No active challenge yet'}
            </div>
          </div>

          {week && (
            <div className="flex items-center gap-2">
              {(['d', 'h', 'm', 's'] as const).map((k, i) => (
                <React.Fragment key={k}>
                  {i > 0 && (
                    <div className="font-mono text-xl font-bold text-[var(--text3)]">
                      :
                    </div>
                  )}
                  <div className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-center min-w-[48px]">
                    <div
                      className={`font-mono text-xl font-bold ${
                        k === 's' ? 'text-[var(--pink)]' : 'text-white'
                      }`}
                    >
                      {pad(countdown[k])}
                    </div>
                    <div className="text-[8px] text-[var(--text3)] uppercase">
                      {k === 'd' ? 'Days' : k === 'h' ? 'Hrs' : k === 'm' ? 'Min' : 'Sec'}
                    </div>
                  </div>
                </React.Fragment>
              ))}
            </div>
          )}

          <div className="text-center md:text-right">
            <div className="text-[10px] font-black text-[var(--gold)] tracking-[2px] uppercase mb-1">
              Prize Pot
            </div>
            <div className="font-heading font-black text-2xl text-[var(--gold)] drop-shadow-[0_0_10px_rgba(255,214,10,0.5)] leading-none">
              ${(((week?.prize_cents ?? 50000) / 100) | 0).toLocaleString()}
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          {user ? (
            <button
              onClick={() => week && setShowUpload(true)}
              disabled={!week}
              className="bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white px-5 py-2.5 rounded-xl text-[13px] font-bold flex items-center gap-2 disabled:opacity-50 hover:scale-[1.02] transition-transform"
            >
              <Plus className="w-4 h-4" /> Submit Entry
            </button>
          ) : (
            <Link href="/login">
              <button className="bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white px-5 py-2.5 rounded-xl text-[13px] font-bold flex items-center gap-2">
                <Upload className="w-4 h-4" /> Sign in to Submit
              </button>
            </Link>
          )}
          <Link
            href="/leaderboard"
            className="text-[12px] font-bold text-[var(--text2)] hover:text-[var(--pink)] flex items-center gap-1"
          >
            <Trophy className="w-4 h-4" /> View Leaderboard
          </Link>
        </div>
      </div>

      {/* Feed */}
      <div className="px-4 md:px-8 mt-8">
        {subsLoading && submissions.length === 0 ? (
          <div className="text-center py-16 text-[var(--text3)] text-[13px]">
            Loading submissions…
          </div>
        ) : submissions.length === 0 ? (
          <div className="bg-[var(--card)] border border-dashed border-[var(--border)] rounded-2xl p-12 text-center max-w-lg mx-auto">
            <Trophy className="w-12 h-12 text-[var(--text3)] mx-auto mb-3 opacity-60" />
            <h2 className="font-heading font-black text-lg mb-1">
              Be the first to submit
            </h2>
            <p className="text-[13px] text-[var(--text3)]">
              No videos for this week yet. Claim your spot.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {submissions.map((s) => (
              <div
                key={s.id}
                className="bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-hidden flex flex-col"
              >
                <div className="aspect-[9/16] bg-black relative">
                  <video
                    src={s.video_url}
                    poster={s.thumbnail_url || undefined}
                    controls
                    playsInline
                    preload="metadata"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <Link
                      href={`/creator/${s.username || s.user_id}`}
                      className="text-[13px] font-bold text-white hover:text-[var(--pink)] truncate"
                    >
                      @{s.username || 'creator'}
                    </Link>
                    <button
                      onClick={() => toggleLike(s.id)}
                      className={`flex items-center gap-1 text-[12px] font-bold transition-colors ${
                        s.liked_by_me
                          ? 'text-[var(--pink)]'
                          : 'text-[var(--text2)] hover:text-[var(--pink)]'
                      }`}
                    >
                      <Heart
                        className={`w-4 h-4 ${s.liked_by_me ? 'fill-current' : ''}`}
                      />
                      {s.like_count}
                    </button>
                  </div>
                  {s.caption && (
                    <p className="text-[12px] text-[var(--text2)] line-clamp-2">
                      {s.caption}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showUpload && week && (
        <UploadModal
          week={week}
          onClose={() => setShowUpload(false)}
          onUploaded={refresh}
        />
      )}
    </div>
  );
}
