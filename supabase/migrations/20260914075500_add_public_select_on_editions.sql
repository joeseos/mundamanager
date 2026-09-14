-- Allow anonymous reads of public.editions.
--
-- The public /user-guide page resolves user_guides.edition_id to an edition
-- slug inside a server-side cache (app/lib/user-guide.ts) using the anon key,
-- with no user session. Editions (slug, name, is_current, released_at) are
-- not sensitive, and the existing authenticated-only SELECT policy blocks
-- that lookup for logged-out visitors.
--
-- Writes remain admin-only (unchanged policies from
-- 20260630095837_add_editions_and_root_edition_ids.sql).

BEGIN;

DROP POLICY IF EXISTS "Editions are viewable by everyone" ON public.editions;

CREATE POLICY "Editions are viewable by everyone"
  ON public.editions FOR SELECT
  USING (true);

GRANT SELECT ON public.editions TO anon, authenticated;

COMMIT;
