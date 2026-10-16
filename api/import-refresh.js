/*
 * REFRESH METADATA — serverless endpoint that fetches fresh Jikan/AniList data
 * and upserts it into the catalogue tables.
 *
 *   GET /api/import-refresh?action=run&id=<malId>
 *   GET /api/import-refresh?action=run&batch=true&malIds=52991,113415,200022
 *   GET /api/import-refresh?action=status&id=<jobId>
 *   GET /api/import-refresh?action=schedule&hours=6
 *
 *   action=schedule  — returns next run time for Vercel Cron setup
 *
 * Used by: admin panel "Refresh Metadata" button, auto-update scheduler,
 * and CSV batch import (re-fetch fresh metadata).
 */

import { createClient } from '@supabase/supabase-js';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.resolve(__dirname, '..', 'scripts', 'import', 'import-anime.mjs');
const LOGS_DIR = path.resolve(__dirname, '..', 'logs');

// ── helpers ──────────────────────────────────────────────────────────────
function env(...names) {
  for (const n of names) if (process.env[n]) return process.env[n];
  return null;
}

const SUPABASE_URL = env('SUPABASE_URL', 'VITE_SUPABASE_URL');
const SUPABASE_KEY = env('SUPABASE_SERVICE_KEY', 'VITE_SUPABASE_ANON_KEY');

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('[import-refresh] Missing SUPABASE_URL / SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

const send = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
};

// run one MAL id through import-anime.mjs
async function runOneImport(malId) {
  const jobStart = Date.now(); // when the child process spawn began (for duration)
  return new Promise((resolve) => {
    const child = spawn('node', [SCRIPT_PATH, String(malId)], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, SUPABASE_URL, SUPABASE_SERVICE_KEY: SUPABASE_KEY },
    });

    let stdout = '', stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });

    child.on('close', (code) => {
      resolve({ malId, code, stdout, stderr, duration: Date.now() - jobStart });
    });
    child.on('error', (err) => {
      resolve({ malId, code: -1, stdout: '', stderr: err.message, duration: Date.now() - jobStart });
    });
  });
}

// ── job tracking ────────────────────────────────────────────────────────

// ── handler ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  const { action, id: jobId, batch, malIds, hours } = req.query;
  const method = req.method || 'GET';

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
  if (action === 'status' && jobId) {
    const j = jobs.get(jobId);
    if (!j) return send(res, 404, { ok: false, error: 'unknown job id' });
    return send(res, 200, { job: j });
  }

  // ── action=schedule ──
  if (action === 'schedule') {
    const h = Number(hours) || 6;
    const next = new Date(Date.now() + h * 60 * 60 * 1000).toISOString();
    return send(res, 200, {
      ok: true,
      hours: h,
      nextRun: next,
      note: 'Schedule: every ' + h + ' hours. Trigger via Vercel Cron or a server-side cron job.',
    });
  }

  // ── action=run ──
  if (action === 'run') {
    let malIdList = [];
    if (malIds) {
      malIdList = malIds.split(',').map(s => Number(s.trim())).filter(n => n && Number.isInteger(n));
    } else if (batch === 'true') {
      try {
        const { data: rows, error } = await db
          .from('anime')
          .select('mal_id, title_english, title_romaji, status')
          .eq('auto_update', true)
          .eq('status', 'RELEASING')
          .limit(50);
        if (error) throw error;
        malIdList = (rows || []).map(r => r.mal_id);
        return send(res, 202, {
          ok: true,
          message: 'Found ' + malIdList.length + ' auto-update anime. Refreshing…',
          malIds: malIdList,
          jobId: null,
          since: new Date().toISOString(),
        });
      } catch (err) {
        return send(res, 500, { ok: false, error: 'failed to fetch anime list: ' + err.message });
      }
    } else {
      const single = Number(id);
      if (single) malIdList = [single];
      else return send(res, 400, { ok: false, error: 'provide id=<malId> or batch=true' });
    }

    if (malIdList.length === 0) {
      return send(res, 400, { ok: false, error: 'no MAL ids provided' });
    }

    const active = Array.from(jobs.values()).filter(j => j.status === 'running').length;
    if (active >= 3) {
      return send(res, 429, { ok: false, error: 'Too many concurrent refresh jobs (max 3).' });
    }

    const jobId = 'ref_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const startedAt = Date.now();
    jobs.set(jobId, { status: 'queued', progress: 0, startedAt });

    setImmediate(async () => {
      try {
        jobs.set(jobId, { status: 'running', progress: 0, startedAt });

        const results = [];
        for (let i = 0; i < malIdList.length; i++) {
          const malId = malIdList[i];
          jobs.set(jobId, { status: 'running', progress: Math.round(((i + 1) / malIdList.length) * 100) });

          const r = await runOneImport(malId);
          results.push({ malId, ...r });

          if (i < malIdList.length - 1) {
            await new Promise(r => setTimeout(r, 420));
          }
        }

        jobs.set(jobId, {
          status: 'done',
          results,
          duration: Date.now() - startedAt,
          finishedAt: new Date().toISOString(),
        });
      } catch (err) {
        jobs.set(jobId, { status: 'error', error: err.message, startedAt });
      }
    });

    return send(res, 202, {
      ok: true,
      message: 'Refresh started for ' + malIdList.length + ' anime',
      jobId,
      malIdsCount: malIdList.length,
      duration: 'poll /api/import-refresh?action=status&id=' + jobId,
    });
  }

  send(res, 400, { ok: false, error: 'Unknown action. Use action=list, action=status, action=run, or action=schedule.' });
}

const jobs = new Map();
