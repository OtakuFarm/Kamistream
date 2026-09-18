import React, { useEffect, useMemo, useState } from 'react';
import { Heart, Send, MessageCircle } from 'lucide-react';
import { Link } from 'wouter';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';

interface EpisodeSocialProps {
  malId: string;
  epId: string;
}

interface CommentRow {
  id: string;
  user_id: string;
  username: string | null;
  body: string;
  created_at: string;
}

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function EpisodeSocial({ malId, epId }: EpisodeSocialProps) {
  const { user } = useAuth();
  const mal = useMemo(() => parseInt(malId, 10), [malId]);
  const ep = useMemo(() => parseInt(epId, 10), [epId]);

  const [likeCount, setLikeCount] = useState(0);
  const [liked, setLiked] = useState(false);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [loading, setLoading] = useState(true);

  const username =
    (user?.user_metadata as any)?.username ||
    user?.email?.split('@')[0] ||
    'guest';

  useEffect(() => {
    if (!mal || !ep) return;
    let cancelled = false;
    setLoading(true);

    const load = async () => {
      try {
        const [{ count }, likedRes, commentsRes] = await Promise.all([
          supabase
            .from('episode_likes')
            .select('user_id', { count: 'exact', head: true })
            .eq('mal_id', mal)
            .eq('ep_id', ep),
          user
            ? supabase
                .from('episode_likes')
                .select('user_id')
                .eq('mal_id', mal)
                .eq('ep_id', ep)
                .eq('user_id', user.id)
                .maybeSingle()
            : Promise.resolve({ data: null }),
          supabase
            .from('episode_comments')
            .select('id, user_id, username, body, created_at')
            .eq('mal_id', mal)
            .eq('ep_id', ep)
            .order('created_at', { ascending: false })
            .limit(50),
        ]);

        if (cancelled) return;
        setLikeCount(count || 0);
        setLiked(!!(likedRes as any)?.data);
        setComments((commentsRes.data as CommentRow[]) || []);
      } catch (err: any) {
        console.warn('[social] load failed', err?.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    const channel = supabase
      .channel(`ep:${mal}:${ep}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'episode_comments',
          filter: `mal_id=eq.${mal}`,
        },
        (payload) => {
          const row = payload.new as CommentRow & { ep_id?: number };
          if (row.ep_id !== undefined && row.ep_id !== ep) return;
          setComments((prev) =>
            prev.some((c) => c.id === row.id) ? prev : [row, ...prev].slice(0, 50)
          );
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'episode_likes',
          filter: `mal_id=eq.${mal}`,
        },
        (payload) => {
          const row: any = payload.new || payload.old;
          if (row?.ep_id !== ep) return;
          if (payload.eventType === 'INSERT') setLikeCount((c) => c + 1);
          if (payload.eventType === 'DELETE') setLikeCount((c) => Math.max(0, c - 1));
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [mal, ep, user]);

  const toggleLike = async () => {
    if (!user) {
      toast.error('Sign in to like episodes');
      return;
    }
    const next = !liked;
    setLiked(next);
    setLikeCount((c) => (next ? c + 1 : Math.max(0, c - 1)));
    try {
      if (next) {
        const { error } = await supabase
          .from('episode_likes')
          .insert({ user_id: user.id, mal_id: mal, ep_id: ep });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('episode_likes')
          .delete()
          .eq('user_id', user.id)
          .eq('mal_id', mal)
          .eq('ep_id', ep);
        if (error) throw error;
      }
    } catch (err: any) {
      setLiked(!next);
      setLikeCount((c) => (next ? Math.max(0, c - 1) : c + 1));
      toast.error(err?.message || 'Could not save like');
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error('Sign in to comment');
      return;
    }
    const body = draft.trim();
    if (!body) return;
    if (body.length > 2000) {
      toast.error('Comment too long');
      return;
    }
    setPosting(true);
    try {
      const { data, error } = await supabase
        .from('episode_comments')
        .insert({ user_id: user.id, mal_id: mal, ep_id: ep, body, username })
        .select('id, user_id, username, body, created_at')
        .single();
      if (error) throw error;
      setDraft('');
      if (data) {
        setComments((prev) =>
          prev.some((c) => c.id === data.id) ? prev : [data as CommentRow, ...prev]
        );
      }
    } catch (err: any) {
      toast.error(err?.message || 'Could not post comment');
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="mt-6 space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={toggleLike}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-[12px] font-bold transition-all ${
            liked
              ? 'bg-[var(--pink)]/15 border-[var(--pink)] text-[var(--pink)]'
              : 'bg-[var(--card)] border-[var(--border)] text-white hover:border-[var(--pink)]'
          }`}
        >
          <Heart className={`w-4 h-4 ${liked ? 'fill-current' : ''}`} />
          {likeCount.toLocaleString()} {likeCount === 1 ? 'Like' : 'Likes'}
        </button>
        <div className="flex items-center gap-2 text-[12px] font-bold text-[var(--text3)]">
          <MessageCircle className="w-4 h-4" />
          {comments.length} {comments.length === 1 ? 'comment' : 'comments'}
        </div>
      </div>

      {user ? (
        <form onSubmit={submit} className="flex items-start gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--pink)] to-[var(--purple)] flex items-center justify-center text-white text-[11px] font-black shrink-0">
            {username.slice(0, 1).toUpperCase()}
          </div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Share your reaction…"
            rows={2}
            maxLength={2000}
            className="flex-1 bg-[var(--card)] border border-[var(--border)] rounded-xl px-3 py-2 text-[13px] text-white placeholder:text-[var(--text3)] focus:outline-none focus:border-[var(--pink)] resize-none"
          />
          <button
            type="submit"
            disabled={posting || !draft.trim()}
            className="bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white px-4 py-2 rounded-xl text-[12px] font-bold flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed h-[40px]"
          >
            <Send className="w-4 h-4" /> Post
          </button>
        </form>
      ) : (
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl px-4 py-3 text-[12px] text-[var(--text3)]">
          <Link href="/login" className="text-[var(--pink)] font-bold">
            Sign in
          </Link>{' '}
          to join the conversation.
        </div>
      )}

      <div className="space-y-3">
        {loading ? (
          <div className="text-[12px] text-[var(--text3)]">Loading comments…</div>
        ) : comments.length === 0 ? (
          <div className="text-[12px] text-[var(--text3)]">
            Be the first to comment on this episode.
          </div>
        ) : (
          comments.map((c) => (
            <div key={c.id} className="flex items-start gap-2">
              <div className="w-8 h-8 rounded-full bg-[var(--bg3)] flex items-center justify-center text-white text-[11px] font-black shrink-0">
                {(c.username || 'U').slice(0, 1).toUpperCase()}
              </div>
              <div className="flex-1 bg-[var(--card)] border border-[var(--border)] rounded-xl px-3 py-2">
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-[12px] font-bold text-white">
                    {c.username || 'anon'}
                  </span>
                  <span className="text-[10px] text-[var(--text3)]">
                    {timeAgo(c.created_at)}
                  </span>
                </div>
                <div className="text-[13px] text-[var(--text2)] whitespace-pre-wrap break-words">
                  {c.body}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
