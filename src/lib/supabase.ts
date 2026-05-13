import { createClient } from '@supabase/supabase-js';

// Fallback to hardcoded values so the app never crashes on missing env vars.
// Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel → Project Settings → Environment Variables.
const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL      || 'https://ojmbwnslkubsrloxkggo.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qbWJ3bnNsa3Vic3Jsb3hrZ2dvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3NjA5MjksImV4cCI6MjA5MTMzNjkyOX0.38YqteDix7toutmv5Fi2A_bp6xD7iIf2Bhu5GQm1vDU';

if (!import.meta.env.VITE_SUPABASE_URL) {
  console.warn('[supabase] VITE_SUPABASE_URL not set — using hardcoded fallback. Add it to Vercel env vars.');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { storageKey: 'kami_auth' },
});
