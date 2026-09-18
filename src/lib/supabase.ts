import { createClient } from '@supabase/supabase-js';

// These MUST be set in Vercel → Project Settings → Environment Variables.
// Never hardcode credentials here — they get committed to git and exposed publicly.
const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL      as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const hasSupabaseEnv = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

if (!hasSupabaseEnv) {
  console.warn(
    '[KamiStream] Missing Supabase env vars — auth & watchlist sync disabled.\n' +
    'Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to:\n' +
    '  • Vercel → Project → Settings → Environment Variables\n' +
    '  • .env.local for local development (never commit this file)'
  );
}

let client: ReturnType<typeof createClient> | null = null;

function getClient() {
  if (!client) {
    if (!hasSupabaseEnv) return makeStub() as unknown as ReturnType<typeof createClient>;
    client = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, { auth: { storageKey: 'kami_auth' } });
  }
  return client;
}

// ─── Stub client (when env vars are missing) ────────────────────────────────
// Any chained call (from/select/eq/…/auth.x) resolves to { data: null, error: null }
// so the app boots and browsing works; only real Supabase features are inert.
function makeStub(): any {
  const resolveOk = () => Promise.resolve({ data: null, error: null });
  const chain: any = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === 'then') return (fn: any) => { resolveOk().then(fn); return chain; };
      if (prop === 'catch') return () => chain;
      if (prop === 'finally') return (fn: any) => { resolveOk().finally(fn); return chain; };
      if (prop === 'subscribe') return (cb?: any) => { try { cb?.('SUBSCRIBED'); } catch {} return { unsubscribe() {} }; };
      if (prop === 'removeChannel') return () => undefined;
      return (..._args: any[]) => chain;
    },
    apply() { return chain; },
  });
  return { auth: chain, channel: () => chain, removeAllChannels: () => undefined, getChannels: () => [] };
}

// Lazy proxy: the app boots fine without env vars; only code paths that
// actually touch Supabase fail (with a clear message) when it's unconfigured.
export const supabase = new Proxy({} as ReturnType<typeof createClient>, {
  get(_t, prop, recv) {
    return Reflect.get(getClient() as object, prop, recv);
  },
});
