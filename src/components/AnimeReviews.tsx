import React, { useState } from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { MessageSquare, Star, Send, AlertCircle } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

type Review = { id: number; rating: number; review_text: string; contains_spoilers: boolean; helpful_count: number; created_at: string; user_id: string };

export function AnimeReviews({ malId }: { malId: string }) {
  const { user, loading: authLoading } = useAuth();
  const [rating, setRating] = useState(8);
  const [text, setText] = useState('');
  const [spoilers, setSpoilers] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const { data: reviews, isLoading, error } = useQuery({
    queryKey: ['anime-reviews', malId],
    queryFn: async () => {
      const result = await supabase.from('anime_reviews').select('id,rating,review_text,contains_spoilers,helpful_count,created_at,user_id').eq('anime_mal_id', Number(malId)).order('created_at', { ascending: false }).limit(20);
      if (result.error) throw result.error;
      return (result.data || []) as Review[];
    },
    enabled: !!malId,
    staleTime: 60_000,
    retry: 0,
  });

  const average = reviews?.length ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1) : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const clean = text.trim();
    if (clean.length < 10) { setMessage('Please write at least 10 characters.'); return; }
    setSaving(true); setMessage('');
    const { error: saveError } = await supabase.from('anime_reviews').insert({ anime_mal_id: Number(malId), user_id: user.id, rating, review_text: clean, contains_spoilers: spoilers });
    setSaving(false);
    if (saveError) { setMessage(saveError.message); return; }
    setText(''); setSpoilers(false); setMessage('Review published.');
  }

  return (
    <section className="backdrop-blur-md bg-white/[0.03] border border-white/10 rounded-2xl p-4 mt-5" id="reviews">
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare className="w-4 h-4 text-[var(--pink)]" />
        <h2 className="text-[13px] font-black text-white uppercase tracking-widest">Community Reviews</h2>
        {average && <span className="ml-auto text-[12px] font-bold text-[var(--gold)]">★ {average}/10 · {reviews?.length}</span>}
      </div>
      {isLoading && <p className="text-[12px] text-[var(--text3)]">Loading reviews…</p>}
      {error && <p className="text-[12px] text-[var(--text3)]">Reviews are not available right now.</p>}
      {!isLoading && !error && !reviews?.length && <p className="text-[12px] text-[var(--text3)] mb-4">Be the first to share a thoughtful review. No fake ratings or duplicate reviews.</p>}
      {reviews?.map(review => (
        <article key={review.id} className="border-t border-white/10 py-3 first:border-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] font-black text-[var(--gold)]">★ {review.rating}/10</span>
            <span className="text-[10px] text-[var(--text3)]">{new Date(review.created_at).toLocaleDateString()}</span>
          </div>
          {review.contains_spoilers ? <p className="text-[12px] text-[var(--text3)] mt-2">Spoiler review hidden.</p> : <p className="text-[12px] text-white/75 leading-relaxed mt-1 whitespace-pre-wrap">{review.review_text}</p>}
        </article>
      ))}
      <div className="border-t border-white/10 pt-4 mt-2">
        {!authLoading && !user ? <p className="text-[12px] text-[var(--text3)]"><Link href="/login" className="text-[var(--pink)] font-bold">Sign in</Link> to write a review.</p> : user && <form onSubmit={submit} className="space-y-3">
          <div className="flex items-center gap-2"><label className="text-[11px] font-bold text-[var(--text3)]">Your rating</label><select value={rating} onChange={e => setRating(Number(e.target.value))} className="bg-[var(--bg3)] border border-[var(--border)] rounded-lg px-2 py-1 text-[12px] text-white">{Array.from({ length: 10 }, (_, i) => 10 - i).map(n => <option key={n} value={n}>{n}/10</option>)}</select></div>
          <textarea value={text} onChange={e => setText(e.target.value)} maxLength={2000} required placeholder="What did you think? Keep it constructive…" className="w-full min-h-24 bg-[var(--bg3)] border border-[var(--border)] rounded-xl p-3 text-[12px] text-white resize-y" />
          <label className="flex items-center gap-2 text-[11px] text-[var(--text3)]"><input type="checkbox" checked={spoilers} onChange={e => setSpoilers(e.target.checked)} /> Contains spoilers</label>
          {message && <p className={`text-[11px] flex items-center gap-1 ${message === 'Review published.' ? 'text-[var(--green)]' : 'text-[var(--pink)]'}`}>{message !== 'Review published.' && <AlertCircle className="w-3 h-3" />}{message}</p>}
          <button disabled={saving} className="px-4 py-2 rounded-lg bg-gradient-to-r from-[var(--pink)] to-[var(--purple)] text-white text-[12px] font-bold flex items-center gap-2 disabled:opacity-50"><Send className="w-3.5 h-3.5" />{saving ? 'Publishing…' : 'Publish review'}</button>
        </form>}
      </div>
    </section>
  );
}
