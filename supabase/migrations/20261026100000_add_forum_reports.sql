-- Forum reports: members flag a post for the moderators (a thread is reported
-- through its opening post), and moderators handle them on /forum/moderation.
-- Reports are private: members see only their own, moderators see and dismiss all.
--
-- DEPLOY ORDER: apply after 20261025140000_add_forum_tags.sql.

BEGIN;

CREATE TABLE public.forum_reports (
  post_id uuid NOT NULL REFERENCES public.forum_posts(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, reporter_id)
);

COMMENT ON TABLE public.forum_reports IS
  'Posts members reported to the moderators, one row per member and post. Dismissing or removing the post deletes them.';

CREATE INDEX forum_reports_reporter_idx
  ON public.forum_reports (reporter_id);

ALTER TABLE public.forum_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users and moderators can view reports"
  ON public.forum_reports FOR SELECT
  TO authenticated
  USING (reporter_id = (SELECT auth.uid()) OR (SELECT private.is_forum_moderator()));

-- Not your own posts, nor removed ones
CREATE POLICY "Users can report posts"
  ON public.forum_reports FOR INSERT
  TO authenticated
  WITH CHECK (
    reporter_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.forum_posts p
      WHERE p.id = post_id
        AND p.deleted_at IS NULL
        AND p.author_id IS DISTINCT FROM (SELECT auth.uid())
    )
  );

CREATE POLICY "Moderators can dismiss reports"
  ON public.forum_reports FOR DELETE
  TO authenticated
  USING ((SELECT private.is_forum_moderator()));

REVOKE ALL ON public.forum_reports FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON public.forum_reports TO authenticated;
GRANT INSERT (post_id, reporter_id) ON public.forum_reports TO authenticated;
GRANT ALL ON public.forum_reports TO service_role;

COMMIT;
