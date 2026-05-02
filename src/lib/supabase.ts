import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL     = 'https://ojmbwnslkubsrloxkggo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qbWJ3bnNsa3Vic3Jsb3hrZ2dvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3NjA5MjksImV4cCI6MjA5MTMzNjkyOX0.38YqteDix7toutmv5Fi2A_bp6xD7iIf2Bhu5GQm1vDU';

// Singleton — reuse the existing client if already created in this window context
const GLOBAL_KEY = '__kami_supabase__';
declare global { interface Window { [GLOBAL_KEY]?: SupabaseClient } }

if (!window[GLOBAL_KEY]) {
  window[GLOBAL_KEY] = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { storageKey: 'kami_auth' }, // unique key so it doesn't clash with admin.html
  });
}

export const supabase = window[GLOBAL_KEY]!;
