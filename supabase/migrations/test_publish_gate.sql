-- OPTIONAL self-test for the publish gate. Read-only in effect: the INSERT
-- below is EXPECTED TO FAIL. A constraint violation is the pass condition.
--
-- If this statement SUCCEEDS, the gate is broken and thin pages could be
-- published. In that case roll it back:
--   delete from public.anime_catalogue where slug = '__gate-test__';
--
-- What it tests: the gate should refuse a title that is marked published
-- while its synopsis is only 15 characters, because a page with a title, a
-- poster and no premise has nothing for a crawler to index.
insert into public.anime_catalogue
  (slug, title, synopsis, status, has_poster, has_synopsis, has_episodes)
values
  ('__gate-test__', 'Gate Test', 'too short', 'published', true, true, true);

-- If you got here, the gate did NOT fire. Clean up:
delete from public.anime_catalogue where slug = '__gate-test__';