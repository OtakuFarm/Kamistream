-- ============================================================================
-- CATALOGUE PUBLIC READ POLICIES
--
-- The runtime (browser) reads via the ANON key, so every catalogue table the
-- pages touch needs a SELECT policy. `anime_catalogue` already has one
-- ("Anyone can read published anime"). The lookup + join tables below were
-- missing them, which made genre-hub queries and detail-page joins return
-- zero rows to visitors even though the service key could read them.
-- ============================================================================

-- ─── genres ── lookup table; every genre is public-facing
alter table public.genres enable row level security;
drop policy if exists "Anyone can read genres" on public.genres;
create policy "Anyone can read genres"
  on public.genres for select using (true);

-- ─── studios ── lookup table; every studio is public-facing
alter table public.studios enable row level security;
drop policy if exists "Anyone can read studios" on public.studios;
create policy "Anyone can read studios"
  on public.studios for select using (true);

-- ─── anime_genres ── join; only visible for published anime
alter table public.anime_genres enable row level security;
drop policy if exists "Anyone can read anime genres" on public.anime_genres;
create policy "Anyone can read anime genres"
  on public.anime_genres for select
  using (exists (
    select 1 from public.anime_catalogue
    where id = anime_id and status = 'published'
  ));

-- ─── anime_studios ── join; only visible for published anime
alter table public.anime_studios enable row level security;
drop policy if exists "Anyone can read anime studios" on public.anime_studios;
create policy "Anyone can read anime studios"
  on public.anime_studios for select
  using (exists (
    select 1 from public.anime_catalogue
    where id = anime_id and status = 'published'
  ));

-- ─── anime_relations ── join; only visible for published anime
alter table public.anime_relations enable row level security;
drop policy if exists "Anyone can read anime relations" on public.anime_relations;
create policy "Anyone can read anime relations"
  on public.anime_relations for select
  using (exists (
    select 1 from public.anime_catalogue
    where id = from_id and status = 'published'
  ));

-- ─── catalogue_episodes ── join; only visible for published anime
alter table public.catalogue_episodes enable row level security;
drop policy if exists "Anyone can read catalogue episodes" on public.catalogue_episodes;
create policy "Anyone can read catalogue episodes"
  on public.catalogue_episodes for select
  using (exists (
    select 1 from public.anime_catalogue
    where id = anime_id and status = 'published'
  ));
