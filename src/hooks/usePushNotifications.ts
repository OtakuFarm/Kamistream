import { useState, useEffect, useCallback } from 'react';

// ── Push notification hook ────────────────────────────────────────
// Uses the Web Push / Notification API built into modern browsers.
// No third-party SDK needed — works on Chrome, Edge, Firefox, Safari 16+.
// On iOS, requires the site to be installed as a PWA first.

export type PushPermission = 'default' | 'granted' | 'denied';

const PREFS_KEY = 'kami_push_prefs';

interface PushPrefs {
  newEpisodes:  boolean;
  schedule:     boolean;
  community:    boolean;
}

function readPrefs(): PushPrefs {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'); }
  catch { return { newEpisodes: true, schedule: true, community: false }; }
}

export function usePushNotifications() {
  const [permission, setPermission] = useState<PushPermission>('default');
  const [prefs,      setPrefs]      = useState<PushPrefs>(readPrefs);
  const [supported,  setSupported]  = useState(false);

  useEffect(() => {
    const ok = typeof window !== 'undefined' && 'Notification' in window;
    setSupported(ok);
    if (ok) setPermission(Notification.permission as PushPermission);
  }, []);

  // Request browser notification permission
  const requestPermission = useCallback(async (): Promise<PushPermission> => {
    if (!supported) return 'denied';
    try {
      const result = await Notification.requestPermission();
      setPermission(result as PushPermission);
      return result as PushPermission;
    } catch {
      return 'denied';
    }
  }, [supported]);

  // Send a local browser notification (no server needed)
  const notify = useCallback((title: string, body: string, icon = '/icons/icon-192.png', url?: string) => {
    if (!supported || permission !== 'granted') return;
    try {
      const n = new Notification(title, {
        body,
        icon,
        badge: '/icons/icon-192.png',
        tag:   'kamistream',
        requireInteraction: false,
      });
      if (url) n.onclick = () => { window.focus(); window.location.href = url; n.close(); };
    } catch {}
  }, [supported, permission]);

  // Save preference changes
  const updatePref = useCallback((key: keyof PushPrefs, val: boolean) => {
    const next = { ...readPrefs(), [key]: val };
    setPrefs(next);
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  }, []);

  // Notify about a new episode (called from schedule page or useEffect)
  const notifyNewEpisode = useCallback((animeTitle: string, epNum: number, malId: number) => {
    if (!readPrefs().newEpisodes) return;
    notify(
      `New Episode — ${animeTitle}`,
      `Episode ${epNum} is now available!`,
      '/icons/icon-192.png',
      `/anime/${malId}`
    );
  }, [notify]);

  return {
    supported,
    permission,
    prefs,
    requestPermission,
    notify,
    notifyNewEpisode,
    updatePref,
  };
}
