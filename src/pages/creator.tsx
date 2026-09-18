import React, { useEffect, useState } from 'react';
import { useRoute, Link } from 'wouter';
import { Heart, Trophy, Calendar, Video } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface CreatorSubmission {
  id: string;
  user_id: string;
  username: string | null;
  caption: string | null;
  video_url: string;
  thumbnail_url: string | null;
  created_at: string;
  week_id: string;
  week_theme: string | null;
  like_count: number;
}

const isUuid = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function Creator() {
  const [, params] = useRoute('/creator/:username');
  const handle = decodeURIComponent(params?.username || '');
  const [subs, setSubs] = useState<CreatorSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!handle) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        let q = supabase
          .from('submissions')
          .select(
            'id, user_id, username, caption, video_url, thumbnail_url, created_at, week_id, weeks(theme), submission_likes(user_id)'
          )
          .order('created_at', { ascending: false });

        q = isUuid(handle) ? q.eq('user_id', handle) : q.eq('username', handle);

        const { data, error } = await q;
        if (error) throw error;

        const rows: CreatorSubmission[] = (data || []).map((r: any) => ({
          id: r.id,
          user_id: r.user_id,
          username: r.username,
          caption: r.caption,
          video_url: r.video_url,
          thumbnail_url: r.thumbnail_url,
          created_at: r.created_at,
          week_id: r.week_id,
          week_theme: r.weeks?.theme || null,
          like_count: (r.submission_likes || []).length,
        }));
        if (!cancelled) setSubs(rows);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Could not load creator');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [handle]);

  const displayName =
    subs.find((s) => s.username)?.username || handle || 'creator';
  const totalLikes = subs.reduce((sum, s) => sum + s.like_count, 0);
  const joined = subs.length
    ? subs[subs.length - 1].created_at
    : null;

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto pb-24">
      {/* Profile header */}
      <div className="bg-gradient-to-br from-[var(--card)] via-[var(--bg2)] to-[var(--card)] border border-[var(--border)] rounded-2xl p-6 mb-8 flex flex-col sm:flex-row gap-5 items-center sm:items-start">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[var(--pink)] to-[var(--purple)] flex items-center justify-center text-white text-3xl font-black shrink-0 shadow-lg shadow-[var(--purple)]/30">
          {displayName.slice(0, 1).toUpperCase()}
        </div>
        <div className="flex-1 text-center sm:text-left">
          <h1 className="font-heading font-black text-2xl md:text-3xl text-white">
            @{displayName}
          </h1>
          {joined && (
            <div className="text-[12px] text-[var(--text3)] mt-1 flex items-center gap-1 justify-center sm:justify-start">
              <Calendar className="w-3.5 h-3.5" /> First entry {timeAgo(joined)}
            </div>
          )}
        </div>
        <div className="flex gap-6">
          <div className="text-center">
            <div className="font-heading font-black text-2xl text-white flex items-center gap-1.5 justify-center">
              <Video className="w-5 h-5 text-[var(--purple)]" />
              {subs.length}
            </div>
            <div className="text-[10px] text-[var(--text3)] uppercase tracking-widest">
              Entries
            </div>
          </div>
          <div className="text-center">
            <div className="font-heading font-black text-2xl text-[var(--pink)] flex items-center gap-1.5 justify-center">
              <Heart className="w-5 h-5 fill-current" />
              {totalLikes.toLocaleString()}
            </div>
            <div className="text-[10px] text-[var(--text3)] uppercase tracking-widest">
              Total Likes
            </div>
          </div>
        </div>
      </div>

      {/* Submissions */}
      {loading ? (
        <div className="text-center py-16 text-[var(--text3)] text-[13px]">
          Loading creator…
        </div>
      ) : error ? (
        <div className="text-center py-16 text-[var(--text3)] text-[13px]">
          {error}
        </div>
      ) : subs.length === 0 ? (
        <div className="bg-[var(--card)] border border-dashed border-[var(--border)] rounded-2xl p-12 text-center">
          <Trophy className="w-12 h-12 text-[var(--text3)] mx-auto mb-3 opacity-60" />
          <h2 className="font-heading font-black text-lg mb-1">No entries yet</h2>
          <p className="text-[13px] text-[var(--text3)]">
            This creator hasn&apos;t submitted to a challenge.{' '}
            <Link href="/challenges" className="text-[var(--pink)] font-bold">
              See the active challenge
            </Link>
            .
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {subs.map((s) => (
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
                <div className="flex items-center justify-between gap-2">
                  {s.week_theme ? (
                    <span className="text-[10px] font-black text-[var(--pink)] uppercase tracking-widest truncate">
                      {s.week_theme}
                    </span>
                  ) : (
                    <span />
                  )}
                  <span className="flex items-center gap-1 text-[12px] font-bold text-[var(--pink)] shrink-0">
                    <Heart className="w-4 h-4 fill-current" />
                    {s.like_count}
                  </span>
                </div>
                {s.caption && (
                  <p className="text-[12px] text-[var(--text2)] line-clamp-2">
                    {s.caption}
                  </p>
                )}
                <div className="text-[10px] text-[var(--text3)]">
                  {timeAgo(s.created_at)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
