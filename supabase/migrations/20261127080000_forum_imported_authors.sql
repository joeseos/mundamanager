-- Authors of posts imported from the YakTribe forum. A post nobody has claimed
-- yet has no author_id, and shows its imported author's name instead of
-- "Unknown User". The import (joeseos/yaktribe-import) fills these.
--
-- IF NOT EXISTS throughout: the import's own setup script creates the same
-- table and columns on test databases.

CREATE TABLE IF NOT EXISTS public.forum_imported_authors (
  id uuid PRIMARY KEY,
  -- The XenForo user id; NULL for guests, who had no account
  xf_user_id integer UNIQUE,
  username text NOT NULL,
  -- The Munda Manager account that claimed this author's posts
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone
);

ALTER TABLE public.forum_imported_authors ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone;

ALTER TABLE public.forum_threads
  ADD COLUMN IF NOT EXISTS imported_author_id uuid REFERENCES public.forum_imported_authors(id) ON DELETE SET NULL;
ALTER TABLE public.forum_posts
  ADD COLUMN IF NOT EXISTS imported_author_id uuid REFERENCES public.forum_imported_authors(id) ON DELETE SET NULL;

ALTER TABLE public.forum_imported_authors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read imported authors" ON public.forum_imported_authors;
CREATE POLICY "Anyone can read imported authors"
  ON public.forum_imported_authors FOR SELECT
  USING (true);

DROP POLICY IF EXISTS forum_imported_authors_admin_insert_policy ON public.forum_imported_authors;
CREATE POLICY forum_imported_authors_admin_insert_policy
  ON public.forum_imported_authors FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT private.is_admin()));

DROP POLICY IF EXISTS forum_imported_authors_admin_update_policy ON public.forum_imported_authors;
CREATE POLICY forum_imported_authors_admin_update_policy
  ON public.forum_imported_authors FOR UPDATE
  TO authenticated
  USING ((SELECT private.is_admin()))
  WITH CHECK ((SELECT private.is_admin()));

DROP POLICY IF EXISTS forum_imported_authors_admin_delete_policy ON public.forum_imported_authors;
CREATE POLICY forum_imported_authors_admin_delete_policy
  ON public.forum_imported_authors FOR DELETE
  TO authenticated
  USING ((SELECT private.is_admin()));

-- Default privileges may already grant the whole table, so revoke first, as for the other forum tables
REVOKE ALL ON public.forum_imported_authors FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.forum_imported_authors TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.forum_imported_authors TO authenticated;
