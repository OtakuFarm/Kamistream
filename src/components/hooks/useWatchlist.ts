import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

export interface WatchlistItem {
  mal_id: number;
  title: string;
  image_url: string;
  episodes: number | null;
  score: number | null;
}

const LS_KEY = 'kamistream_watchlist';

function readLocal(): WatchlistItem[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeLocal(items: WatchlistItem[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(items));
  } catch {}
}

export function useWatchlist() {
  const { user } = useAuth();
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>(() => readLocal());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const sync = async () => {
      if (!user) {
        setWatchlist(readLocal());
        return;
      }

      setLoading(true);
      try {
        const { data: remote, error } = await supabase
          .from('watchlist')
          .select('mal_id, title, image_url, episodes, score')
          .eq('user_id', user.id);

        if (error) throw error;

        const remoteList: WatchlistItem[] = remote || [];
        const local = readLocal();

        const guestOnly = local.filter(
          (l) => !remoteList.some((r) => r.mal_id === l.mal_id)
        );

        if (guestOnly.length > 0) {
          const rows = guestOnly.map((g) => ({ ...g, user_id: user.id }));
          await supabase.from('watchlist').upsert(rows, {
            onConflict: 'user_id,mal_id',
          });
        }

        const merged = [...remoteList, ...guestOnly];
        if (!cancelled) {
          setWatchlist(merged);
          writeLocal(merged);
        }
      } catch (err: any) {
        console.warn('[watchlist] cloud sync failed, using local', err?.message);
        if (!cancelled) setWatchlist(readLocal());
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    sync();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const toggleWatchlist = useCallback(
    async (item: WatchlistItem) => {
      const exists = watchlist.some((w) => w.mal_id === item.mal_id);
      const next = exists
        ? watchlist.filter((w) => w.mal_id !== item.mal_id)
        : [...watchlist, item];

      setWatchlist(next);
      writeLocal(next);
      toast.success(exists ? 'Removed from watchlist' : 'Added to watchlist');

      if (!user) return;

      try {
        if (exists) {
          await supabase
            .from('watchlist')
            .delete()
            .eq('user_id', user.id)
            .eq('mal_id', item.mal_id);
        } else {
          await supabase.from('watchlist').upsert(
            { ...item, user_id: user.id },
            { onConflict: 'user_id,mal_id' }
          );
        }
      } catch (err: any) {
        console.warn('[watchlist] cloud write failed', err?.message);
      }
    },
    [watchlist, user]
  );

  const isInWatchlist = useCallback(
    (mal_id: number) => watchlist.some((w) => w.mal_id === mal_id),
    [watchlist]
  );

  return { watchlist, loading, toggleWatchlist, isInWatchlist };
}
