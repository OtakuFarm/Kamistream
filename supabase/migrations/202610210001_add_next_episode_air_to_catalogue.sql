-- ============================================================================
-- 202610210001_add_next_episode_air_to_catalogue.sql
-- Add next_episode_air column to anime_catalogue for trending by episode drop date
-- ============================================================================

-- Add next_episode_air column to store the next episode's air date.
-- This is used by the homepage/trending query to sort anime by upcoming air dates.
alter table public.anime_catalogue
  add column next_episode_air date null;

-- Add comment for documentation
comment on column public.anime_catalogue.next_episode_air is
  'Next episode air date (UTC). Used for trending/homepage sorting. Null if unknown or no upcoming episodes.';

-- Index for efficient sorting by next episode air date
create index if not exists anime_catalogue_next_episode_air_idx
  on public.anime_catalogue (next_episode_air nulls last);