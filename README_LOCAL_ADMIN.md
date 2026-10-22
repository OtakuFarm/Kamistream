# LOCAL ADMIN PANEL — Setup Guide

This folder contains a **local-only, no-login** version of the admin panel, so you can bulk-import animes, manage embeds, and refresh metadata without deploying to GitHub.

## Files in this folder

| File | Purpose |
|---|---|
| `local-admin.html` | Stripped-down admin panel — no login gate; ships with your Supabase defaults, Settings → Save & Connect overrides them (`an_admin_sb_cfg`) |
| `run-admin.bat` | Desktop shortcut — opens `local-admin.html` in your browser |
| `setup-admin.bat` | Setup guide — tells you how to save your Supabase config |
| `run-dev.bat` | Optional — starts a local Vite dev server (website + admin panel) |
| `scripts/make-local-admin.py` | Python script that generates `local-admin.html` from `public/admin.html` |
| `scripts/fix-local-showui.py` | Injects the no-login boot script (also auto-tests the Supabase connection on load) |

## Regenerating `local-admin.html`
```bash
python scripts/make-local-admin.py   # copy from public/admin.html (keeps the fixed CSV import block)
python scripts/fix-local-showui.py   # inject the local boot script
node scripts/check-html-scripts.cjs local-admin.html   # validate JS syntax
```

## How it works

### Step 1 — Setup (one-time)
1. Run `setup-admin.bat` (or just open `local-admin.html` directly)
2. Paste your **Project URL** and **Anon Key** into the Supabase Connection panel
   - Find at: [supabase.com/dashboard](https://supabase.com/dashboard) → Your Project → Settings → API
3. Click **Save & Connect**
4. The config is stored in your browser's `localStorage` under `an_admin_sb_cfg`

### Step 2 — Use
- Open `run-admin.bat` (or `local-admin.html` directly)
- No login required
- All admin features work: bulk import, CSV import, metadata refresh, scheduler, embed generation, etc.

### Step 3 — Optional: Link to your website
The admin panel reads from the same Supabase tables as the live site, so no extra linking is needed — it automatically shares the same data.

## Security notes

- **This is for your local machine only.** Do NOT commit `local-admin.html` to GitHub.
- The **anon key** is used client-side (as the original admin panel already does), which is expected for this setup.
- Supabase Row Level Policies still protect your tables — only `is_admin` users can write to admin tables server-side.
- Always keep the `local-admin.html` file out of version control.

## Troubleshooting

**"Supabase not connected" toast?**
- Double-check your Project URL and Anon Key are correct.
- Make sure you're using the **anon key** (not the service role key).

**Import buttons do nothing?**
- Check the browser console (F12) for errors.
- Make sure Supabase connection status shows "Connected".

**CSV import fails?**
- CSV import runs **fully in your browser** — no `/api` endpoint is needed locally. It first reads your Supabase `anime` table + local library to skip duplicates, then imports only the new MAL IDs via Jikan.
- Make sure the Supabase Connection banner shows "✅ Connected" (Settings tab).

## Removing from GitHub (recommended)

If you're actively developing the local panel, add these to `.gitignore`:
```
local-admin.html
local-admin.html.map
setup-admin.bat
run-admin.bat
run-dev.bat
logs/
```

Or simply don't commit the `local-admin.html` file to your repo.
