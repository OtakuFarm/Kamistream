-- Verify the catalogue migration applied completely.
--
-- WHY THIS IS ONE QUERY
--   The Supabase SQL editor only renders the LAST result set when a file
--   contains several statements. Splitting the checks into six separate
--   queries therefore showed one result and silently discarded five, which
--   reads as "the checks are missing" rather than "the checks ran".
--   UNION ALL collapses them into a single grid, so one Run shows all of it.
--
-- Column names avoid `check`, which is a reserved word in PostgreSQL.
--
-- SAFE TO RE-RUN: read-only. Expect every row to say OK.

with results(item, state) as (

  -- every table created
  select 'table: ' || t,
         case when to_regclass('public.' || t) is not null then 'OK' else 'MISSING' end
  from unnest(array['anime_catalogue','genres','anime_genres','studios',
                    'anime_studios','anime_relations','catalogue_episodes',
                    'catalogue_redirects']) as t

  union all
  select 'policy: read published',
         case when count(*) > 0 then 'OK' else 'MISSING' end
  from pg_policies
  where schemaname = 'public' and tablename = 'anime_catalogue'

  union all
  select 'trigger: touch updated_at',
         case when count(*) > 0 then 'OK' else 'MISSING' end
  from pg_trigger
  where tgname = 'anime_catalogue_touch' and not tgisinternal

  union all
  select 'constraint: publishable',
         case when count(*) > 0 then 'OK' else 'MISSING' end
  from pg_constraint
  where conname = 'anime_catalogue_publishable'

  union all
  select 'genres seeded: ' || count(*)::text,
         case when count(*) = 16 then 'OK' else 'EXPECTED 16' end
  from public.genres

  -- the unique index that makes slug THE url. Without it two titles could
  -- share a slug and silently overwrite each other.
  union all
  select 'index: slug is unique',
         case when count(*) > 0 then 'OK' else 'MISSING' end
  from pg_indexes
  where schemaname = 'public'
    and tablename = 'anime_catalogue'
    and indexname = 'anime_catalogue_slug_key'

  -- nothing should have been written by the migration itself
  union all
  select 'rows in anime_catalogue: ' || count(*)::text,
         case when count(*) = 0 then 'OK (empty)' else 'OK (has data)' end
  from public.anime_catalogue

)
select item, state,
       case when state like 'OK%' then 'good' else 'NEEDS ATTENTION' end as result
from results
order by (state not like 'OK%'), item;