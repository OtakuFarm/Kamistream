-- ============================================================================
-- Seed the genre table from the 16 genres we publish a hub page for.
--
-- The same list lives in src/lib/genres.js POPULAR_GENRES, which the runtime
-- and the build read. This table is the database copy. They are kept in sync
-- by scripts/verify-sitemap.mjs (build) and by the importer (runtime), so
-- the two cannot drift silently the way the four hand-maintained sitemap
-- lists did.
--
-- is_hub = true means /genre/:id exists and is indexable. A genre with
-- is_hub = false is still attachable to a title, it just has no page of its
-- own - which is what stops the sitemap advertising a "Genre Not Found"
-- shell, the original reason Search Console reported noindex URLs.
-- ============================================================================

insert into public.genres (name, slug, mal_id, is_hub, position) values
  ('Action',         'action',         1,  true,  10),
  ('Adventure',      'adventure',      2,  true,  20),
  ('Comedy',         'comedy',         4,  true,  30),
  ('Drama',          'drama',          8,  true,  40),
  ('Fantasy',        'fantasy',        10, true,  50),
  ('Romance',        'romance',        22, true,  60),
  ('Sci-Fi',         'sci-fi',         24, true,  70),
  ('Slice of Life',  'slice-of-life',  36, true,  80),
  ('Sports',         'sports',         30, true,  90),
  ('Supernatural',   'supernatural',   37, true,  100),
  ('Mystery',        'mystery',        7,  true,  110),
  ('Horror',         'horror',         14, true,  120),
  ('Thriller',       'thriller',       41, true,  130),
  ('Isekai',         'isekai',         66, true,  140),
  -- Adult genres are attached to titles but get no hub page by default.
  -- They are listed here so an import can record the genre; is_hub is left
  -- false unless we decide to publish those pages. Keeping them out of the
  -- footer and out of the sitemap is a deliberate trust decision, not an
  -- oversight.
  ('Ecchi',          'ecchi',          9,  false, 200),
  ('Hentai',         'hentai',         12, false, 210)
on conflict (slug) do update
  set name     = excluded.name,
      mal_id   = excluded.mal_id,
      is_hub   = excluded.is_hub,
      position = excluded.position;