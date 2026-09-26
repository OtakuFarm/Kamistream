# Turning the catalogue on

The runtime currently reads Jikan. `src/lib/catalogue.ts` reads our own
tables instead, and one page (`/genre/:id`) is already wired to try it
first. Nothing changes until you set the flag.

## The flag

    VITE_CATALOGUE=1

Add it to `.env.local` for local work, or to the Vercel project's
Environment Variables for production. It is a VITE_ variable because it is
read at build time and baked into the bundle.

Off (the default) means every request goes to Jikan, exactly as today.

## Why it is safe to flip in stages

`withCatalogueFallback()` covers the three ways a half-filled catalogue
could break the site:

| Situation | What happens |
|---|---|
| flag is off | straight to Jikan |
| genre not imported yet (empty result) | logs, then Jikan |
| Supabase unreachable or erroring | logs, then Jikan |

So a catalogue with 3 titles out of 200 does not empty the genre grids -
the missing ones quietly come from Jikan. Fill the catalogue, watch the
logs, and only then consider removing the fallback.

## What actually changes when it is on

- `/genre/:id` reads `anime_catalogue` instead of calling Jikan
- page speed stops depending on a third party
- the catalogue is no longer capped by Jikan's 3 req/sec build limit

## What has NOT been switched over yet

Only the genre pages. Still on Jikan:

- `/anime/:slug` detail pages
- `/browse`, `/search`
- `/category/*` listings
- home page rails
- episode lists
- `/anime-like/*`

`src/lib/catalogue.ts` already has the queries for all of these
(`getAnimeBySlug`, `getEpisodes`, `getSimilar`, `getAnimeList` with sort
and year). Wiring them is a one-line change per call site, because the
functions return the same shape as the Jikan ones and nothing downstream
can tell the difference.

## Checking it is working

1. In the browser console, open a genre page with the flag on.
2. The network tab should show a Supabase request and NO request to
   `api.jikan.moe`.
3. If you still see Jikan calls, either the flag is off, or that genre has
   no imported titles and the fallback fired - check the console for
   `[KamiStream] catalogue miss, falling back to Jikan`.

## Rolling back

Remove `VITE_CATALOGUE=1` and redeploy. There is no data migration to undo
and no schema to revert, because the catalogue is only ever read.