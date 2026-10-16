/*
 * BULK IMPORT — serverless endpoint that runs scripts/import/bulk-import.mjs
 *
 *   GET /api/import-bulk?action=run&pages=5&publish=true&from-page=1
 *   GET /api/import-bulk?action=status&id=<jobId>
 *   GET /api/import-bulk?action=list
 *
 * Why not call the script from the browser?
 *   - The import script needs the Supabase service-role key, which MUST stay
 *     server-side. Anon keys are read-only and cannot write to catalogue tables.
 *   - Vercel free tier: 12 invocations/day. One bulk import = one invocation.
 *   - The script is rate-limited by Jikan (3 req/sec) — a server process obeys
 *     that properly, whereas from-browser you'd get throttled or banned.
 */

import { createClient } from '@supabase/supabase-js';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.resolve(__dirname, '..', 'scripts', 'import', 'bulk-import.mjs');
const LOGS_DIR = path.resolve(__dirname, '..', 'logs');

// ── helpers ──────────────────────────────────────────────────────────────
function env(...names) {
  for (const n of names) if (process.env[n]) return process.env[n];
  return null;
}

const SUPABASE_URL = env('SUPABASE_URL', 'VITE_SUPABASE_URL');
const SUPABASE_KEY = env('SUPABASE_SERVICE_KEY', 'VITE_SUPABASE_ANON_KEY');

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('[import-bulk] Missing SUPABASE_URL / SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

// ensure logs dir exists
(async () => {
  try {
    const { mkdirSync } = await import('node:fs');
    if (!require('node:fs').existsSync(LOGS_DIR)) mkdirSync(LOGS_DIR, { recursive: true });
  } catch {}
})();

const send = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
};

// ── run the importer as a child process ────────────────────────────────
async function runImport(argv) {
  const jobStart = Date.now(); // when the child process spawn began (for duration)
  const child = spawn('node', [SCRIPT_PATH, ...argv], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, SUPABASE_URL, SUPABASE_SERVICE_KEY: SUPABASE_KEY },
  });

  let stdout = '', stderr = '';
  child.stdout.on('data', (d) => { stdout += d; });
  child.stderr.on('data', (d) => { stderr += d; });

  return new Promise((resolve) => {
    child.on('close', (code) => {
      resolve({ code, stdout, stderr, duration: Date.now() - jobStart });
    });
    child.on('error', (err) => {
      resolve({ code: -1, stdout: '', stderr: err.message, duration: Date.now() - jobStart });
    });
  });
}

// ── job tracking ────────────────────────────────────────────────────────
const jobs = new Map();

// ── handler ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  const { action, pages, fromPage, publish, limit, dryRun, id } = req.query;
  const method = (req.method || 'GET');

  // ── action=list ──
  if (action === 'list') {
    return send(res, 200, {
      jobs: Array.from(jobs.entries()).map(([jid, j]) => ({
        id: jid,
        status: j.status,
        startedAt: j.startedAt,
        startedIn: Math.round((Date.now() - j.startedAt) / 1000),
        progress: j.progress,
      })),
    });
  }

  // ── action=status ──
  if (action === 'status' && id) {
    const j = jobs.get(id);
    if (!j) return send(res, 404, { ok: false, error: 'unknown job id' });
    return send(res, 200, { job: j });
  }

  // ── action=run ──
  if (action === 'run') {
    const pagesN = Math.min(Number(pages) || 1, 20);
    const fromPageN = Math.max(Number(fromPage) || 1, 1);
    const shouldPublish = publish === 'true';
    const dryRun = dryRun === 'true';
    const limitN = Math.min(Number(limit) || 99999, 99999);

    const active = Array.from(jobs.values()).filter(j => j.status === 'running').length;
    if (active >= 3) {
      return send(res, 429, {
        ok: false,
        error: 'Too many concurrent imports (max 3).',
      });
    }

    const jobId = 'job_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const startedAt = Date.now();
    jobs.set(jobId, { status: 'queued', progress: 0, startedAt });

    // Start background process
    setImmediate(async () => {
      try {
        jobs.set(jobId, { status: 'running', progress: 0, startedAt });

        const argv = [];
        if (pagesN > 0) argv.push('--pages', String(pagesN));
        if (fromPageN > 1) argv.push('--from-page', String(fromPageN));
        if (shouldPublish) argv.push('--publish');
        if (dryRun) argv.push('--dry-run');
        if (limitN < 99999) argv.push('--limit', String(limitN));

        const result = await runImport(argv);

        jobs.set(jobId, {
          status: 'done',
          code: result.code,
          stdout: result.stdout,
          stderr: result.stderr,
          duration: result.duration,
          finishedAt: new Date().toISOString(),
        });
      } catch (err) {
        jobs.set(jobId, { status: 'error', error: err.message, startedAt });
      }
    });

    return send(res, 202, {
      ok: true,
      message: 'Import started',
      jobId,
      pages: pagesN,
      fromPage: fromPageN,
      publish: shouldPublish,
      dryRun,
      duration: 'poll /api/import-bulk?action=status&id=' + jobId,
    });
  }

  send(res, 400, {
    ok: false,
    error: 'Unknown action. Use action=list, action=status, or action=run.',
  });
}
