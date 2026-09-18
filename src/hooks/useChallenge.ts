import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export interface Week {
  id: string;
  theme: string;
  prize_cents: number;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
}

export interface Submission {
  id: string;
  week_id: string;
  user_id: string;
  username: string | null;
  caption: string | null;
  video_url: string;
  thumbnail_url: string | null;
  created_at: string;
  like_count: number;
  liked_by_me: boolean;
}

export function useActiveWeek() {
  const [week, setWeek] = useState<Week | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('weeks')
          .select('*')
          .eq('is_active', true)
          .order('starts_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        if (!cancelled) setWeek((data as Week) || null);
      } catch (err: any) {
        console.warn('[challenge] active week load failed', err?.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { week, loading };
}

export function useSubmissions(weekId: string | null, userId: string | null) {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!weekId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('submissions')
        .select(
          'id, week_id, user_id, username, caption, video_url, thumbnail_url, created_at, submission_likes(user_id)'
        )
        .eq('week_id', weekId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const rows: Submission[] = (data || []).map((r: any) => {
        const likes: Array<{ user_id: string }> = r.submission_likes || [];
        return {
          id: r.id,
          week_id: r.week_id,
          user_id: r.user_id,
          username: r.username,
          caption: r.caption,
          video_url: r.video_url,
          thumbnail_url: r.thumbnail_url,
          created_at: r.created_at,
          like_count: likes.length,
          liked_by_me: !!userId && likes.some((l) => l.user_id === userId),
        };
      });
      setSubmissions(rows);
    } catch (err: any) {
      console.warn('[challenge] submissions load failed', err?.message);
    } finally {
      setLoading(false);
    }
  }, [weekId, userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const toggleLike = useCallback(
    async (submissionId: string) => {
      if (!userId) return;
      const target = submissions.find((s) => s.id === submissionId);
      if (!target) return;
      const next = !target.liked_by_me;

      setSubmissions((prev) =>
        prev.map((s) =>
          s.id === submissionId
            ? {
                ...s,
                liked_by_me: next,
                like_count: next ? s.like_count + 1 : Math.max(0, s.like_count - 1),
              }
            : s
        )
      );

      try {
        if (next) {
          await supabase
            .from('submission_likes')
            .insert({ user_id: userId, submission_id: submissionId });
        } else {
          await supabase
            .from('submission_likes')
            .delete()
            .eq('user_id', userId)
            .eq('submission_id', submissionId);
        }
      } catch (err: any) {
        console.warn('[challenge] like failed', err?.message);
        refresh();
      }
    },
    [submissions, userId, refresh]
  );

  return { submissions, loading, refresh, toggleLike };
}

export function useCountdown(targetIso: string | null | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!targetIso) return { d: 0, h: 0, m: 0, s: 0, ended: true };
  const diff = new Date(targetIso).getTime() - now;
  if (diff <= 0) return { d: 0, h: 0, m: 0, s: 0, ended: true };
  const s = Math.floor(diff / 1000) % 60;
  const m = Math.floor(diff / (1000 * 60)) % 60;
  const h = Math.floor(diff / (1000 * 60 * 60)) % 24;
  const d = Math.floor(diff / (1000 * 60 * 60 * 24));
  return { d, h, m, s, ended: false };
}
