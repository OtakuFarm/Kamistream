import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ojmbwnslkubsrloxkggo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qbWJ3bnNsa3Vic3Jsb3hrZ2dvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3NjA5MjksImV4cCI6MjA5MTMzNjkyOX0.38YqteDix7toutmv5Fi2A_bp6xD7iIf2Bhu5GQm1vDU';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
