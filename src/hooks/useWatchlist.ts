import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

export type WatchStatus = 'watching' | 'plan_to_watch' | 'on_hold' | 'dropped' | 'completed';

export const WATCH_STATUS_LABELS: Record<WatchStatus, string> = {
  watching:      '▶ Watching',
  plan_to_watch: '📋 Plan to Watch',
  on_hold:       '⏸ On Hold',
  dropped:       '✕ Dropped',
  completed:     '✓ Completed',
};

export interface WatchlistItem {
  mal_id: number;
  title: string;
  image_url: string;
  episodes: number | null;
  score: number | null;
}

const LS_KEY        = 'kamistream_watchlist';
const LS_STATUS_KEY = 'kamistream_watch_statuses';

function readLocal(): WatchlistItem[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); }
  catch { return []; }
}
function writeLocal(items: WatchlistItem[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(items)); } catch {}
}
function readStatuses(): Record<number, WatchStatus> {
  try { return JSON.parse(localStorage.getItem(LS_STATUS_KEY) || '{}'); }
  catch { return {}; }
}
function writeStatuses(s: Record<number, WatchStatus>) {
  try { localStorage.setItem(LS_STATUS_KEY, JSON.stringify(s)); } catch {}
}

// Global listeners — any component using this hook stays in sync
const listeners = new Set<() => void>();
function notifyAll() { listeners.forEach(fn => fn()); }

export function useWatchlist() {
  const { user } = useAuth();
  const [watchlist, setWatchlistState] = useState<WatchlistItem[]>(() => readLocal());
  const [statuses, setStatusesState]   = useState<Record<number, WatchStatus>>(() => readStatuses());
  const [loading, setLoading] = useState(false);

  // Subscribe to cross-component updates
  useEffect(() => {
    const refresh = () => { setWatchlistState(readLocal()); setStatusesState(readStatuses()); };
    listeners.add(refresh);
    window.addEventListener('storage', refresh);
    return () => {
      listeners.delete(refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  function setWatchlist(items: WatchlistItem[]) {
    setWatchlistState(items);
    writeLocal(items);
    notifyAll();
  }

  // Sync with Supabase when user logs in
  useEffect(() => {
    let cancelled = false;
    const sync = async () => {
      if (!user) {
        setWatchlistState(readLocal());
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
        const guestOnly = local.filter(l => !remoteList.some(r => r.mal_id === l.mal_id));

        if (guestOnly.length > 0) {
          const rows = guestOnly.map(g => ({ ...g, user_id: user.id }));
          await supabase.from('watchlist').upsert(rows, { onConflict: 'user_id,mal_id' });
        }

        const merged = [...remoteList, ...guestOnly];
        if (!cancelled) setWatchlist(merged);
      } catch (err: any) {
        console.warn('[watchlist] cloud sync failed, using local', err?.message);
        if (!cancelled) setWatchlistState(readLocal());
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    sync();
    return () => { cancelled = true; };
  }, [user?.id]);

  const toggleWatchlist = useCallback(async (item: WatchlistItem) => {
    const exists = readLocal().some(w => w.mal_id === item.mal_id);
    const next = exists
      ? readLocal().filter(w => w.mal_id !== item.mal_id)
      : [...readLocal(), item];

    setWatchlist(next);
    toast.success(exists ? 'Removed from watchlist' : 'Added to watchlist');

    if (!user) return;
    try {
      if (exists) {
        await supabase.from('watchlist').delete().eq('user_id', user.id).eq('mal_id', item.mal_id);
      } else {
        await supabase.from('watchlist').upsert({ ...item, user_id: user.id }, { onConflict: 'user_id,mal_id' });
      }
    } catch (err: any) {
      console.warn('[watchlist] cloud write failed', err?.message);
    }
  }, [user]);

  const isInWatchlist = useCallback(
    (mal_id: number) => watchlist.some(w => w.mal_id === mal_id),
    [watchlist]
  );

  const setWatchStatus = useCallback((mal_id: number, status: WatchStatus | null) => {
    const current = readStatuses();
    if (status === null) {
      const { [mal_id]: _, ...rest } = current;
      writeStatuses(rest);
      setStatusesState(rest);
    } else {
      const updated = { ...current, [mal_id]: status };
      writeStatuses(updated);
      setStatusesState(updated);
    }
    notifyAll();
    if (status) toast.success(`Status: ${WATCH_STATUS_LABELS[status]}`);
  }, []);

  const getWatchStatus = useCallback(
    (mal_id: number): WatchStatus | null => statuses[mal_id] || null,
    [statuses]
  );

  const getByStatus = useCallback(
    (status: WatchStatus) => watchlist.filter(w => statuses[w.mal_id] === status),
    [watchlist, statuses]
  );

  const exportCSV = useCallback(() => {
    const rows = watchlist.map(w => {
      const st = statuses[w.mal_id] || 'no_status';
      return `"${w.mal_id}","${w.title.replace(/"/g, '""')}","${st}","${w.episodes || ''}","${w.score || ''}"`;
    });
    const csv = ['mal_id,title,status,episodes,score', ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'kamistream-watchlist.csv';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Watchlist exported as CSV');
  }, [watchlist, statuses]);

  return { watchlist, loading, toggleWatchlist, isInWatchlist, setWatchStatus, getWatchStatus, getByStatus, exportCSV, statuses };
}
