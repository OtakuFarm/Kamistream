import { createClient } from '@supabase/supabase-js';

// These MUST be set in Vercel → Project Settings → Environment Variables.
// Never hardcode credentials here — they get committed to git and exposed publicly.
const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL      as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error(
    '[KamiStream] Missing Supabase env vars.\n' +
    'Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to:\n' +
    '  • Vercel → Project → Settings → Environment Variables\n' +
    '  • .env.local for local development (never commit this file)'
  );
}

export const supabase = createClient(
  SUPABASE_URL  || '',
  SUPABASE_ANON_KEY || '',
  { auth: { storageKey: 'kami_auth' } }
);
