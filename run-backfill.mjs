import fs from 'fs';

// Load env vars from .env.local
const envContent = fs.readFileSync('c:/Users/hp/Documents/mywebsites/Kamistream-main/Kamistream-main/.env.local', 'utf8');
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
    const [key, ...rest] = trimmed.split('=');
    process.env[key.trim()] = rest.join('=').replace(/^["']|["']$/g, '');
  }
}

console.log('Loaded SUPABASE_URL:', process.env.SUPABASE_URL);
console.log('Loaded SUPABASE_SERVICE_KEY:', process.env.SUPABASE_SERVICE_KEY ? 'yes' : 'no');
console.log('Running backfill dry-run...');

await import('./scripts/backfill-episode-air.mjs');
