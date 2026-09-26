# Importing anime into the catalogue

This is the path off the Jikan rate limit. Today the build fetches titles
from Jikan directly, which caps the catalogue at ~200 (3 req/sec, and the
build has a time limit). Importing a title once into Supabase removes the
ceiling: one row is one URL, forever, and the runtime stops depending on a
third party.

MAL/AniList become **authoring tools**. They are called here, by a human,
at a moment of their choosing — not by a visitor on every page view.

## 1. Apply the migrations

In the Supabase dashboard, SQL editor, or via the CLI:

    supabase db push

Two files matter:

| Migration | What it does |
|---|---|
| `202609260001_catalogue.sql` | the tables: `anime_catalogue`, `genres`, `anime_genres`, `studios`, `anime_studios`, `anime_relations`, `catalogue_episodes`, `catalogue_redirects` |
| `202609260002_catalogue_genres.sql` | seeds the 16 genre rows |

This is **additive**. Your existing `anime`, `episodes` and
`embed_sources` tables are untouched, and the running site is unaffected
until the runtime is switched over (a later step).

## 2. Set credentials

Add to `.env.local` (never commit it):

    SUPABASE_URL=https://xxxx.supabase.co
    SUPABASE_SERVICE_KEY=<the service_role key>

Use the **service_role** key, not the anon key. This script writes columns
the anon key cannot, and it is server-side only — do not put this key in
anything the browser can read.

## 3. Dry run first

    npm run import:anime -- --dry-run 52991 21 113415

This calls both APIs and prints exactly what it *would* write, without
writing anything:

    [1/3] 52991 ... new "Frieren: Beyond Journey's End" -> /anime/sousou-no-frieren  [not publishable: episodes]
    [2/3] 21 ... exists "One Piece" -> /anime/one-piece  [2 field(s) changed]

Read the `[not publishable: ...]` part. It lists what is still missing.

## 4. Import

    npm run import:anime -- 52991 21 113415
    npm run import:anime -- --file ids.txt
    npm run import:anime -- --publish 52991 21

`--publish` flips rows to `published`, but only the ones that clear the
quality gate. It never bypasses it.

## The quality gate

A title cannot go live without a poster, a 200+ character synopsis and at
least one episode. This is enforced by a CHECK constraint in the database,
so it cannot be bypassed by a script, a browser request, or a bad deploy.

It exists because the main risk of a self-hosted catalogue is filling your
own sitemap with thin pages. A page with a title, a poster and three genre
chips is indexable but worthless, and a few hundred of them reads as a
low-quality site — which costs more than having fewer pages.

## Slugs and redirects

`slug` is a real column, chosen at import time, never derived at read time.
If a title is later renamed, the importer writes the old path into
`catalogue_redirects` so the build can emit a 301. That is why the slug is
stored rather than computed: a title edited after indexing must not change
a URL that is already in the index.

Slugs deliberately match what the live site already uses (the canonical
MAL title, e.g. `/anime/sousou-no-frieren`), so the first import does not
rename ~200 indexed URLs.

## Why a local script and not an admin button

Vercel's free tier allows 12 serverless invocations per day, and one import
is one invocation. A web button would cap you at 12 titles a day. Running
this from a machine has no such limit and can obey Jikan's rate limit
properly (the script waits 420ms between titles and retries 429s).

An admin button for single one-off adds still makes sense later; it should
call `/api/import`, which runs this same normaliser server-side.

## Files

- `normalize.mjs`  — the mapping layer. Nothing writes a raw API payload to
  the DB. Also holds `slugifyTitle`, which **must** stay identical to
  `src/lib/seo.ts`, or imported URLs will disagree with the canonical the
  runtime emits.
- `import-anime.mjs` — the CLI.