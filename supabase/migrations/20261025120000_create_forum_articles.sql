-- Articles: a thread's author submits its opening post for publication, an admin
-- approves it, asks for changes or declines it, and a published one is also
-- shown at /articles. The thread stays in the forum throughout.
--
-- Design notes:
-- - One row per submitted thread. The article is the live opening post, so
--   edits to it show in the article too; this table only holds the review.
-- - Rules live in RLS and the trigger, as for the forum tables: the author can
--   submit, and resubmit after changes were asked for; only admins review.
--
-- DEPLOY ORDER: apply after 20261025100000_forum_review_fixes.sql.

BEGIN;

CREATE TABLE public.forum_articles (
  thread_id uuid PRIMARY KEY REFERENCES public.forum_threads(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'submitted',
  review_note text,
  submitted_at timestamp with time zone NOT NULL DEFAULT now(),
  reviewed_at timestamp with time zone,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  published_at timestamp with time zone,
  CONSTRAINT forum_articles_status_check
    CHECK (status IN ('submitted', 'changes_requested', 'declined', 'published')),
  CONSTRAINT forum_articles_review_note_length CHECK (char_length(review_note) <= 2000)
);

COMMENT ON TABLE public.forum_articles IS
  'Threads whose opening post was submitted as an article, and where its review stands.';
COMMENT ON COLUMN public.forum_articles.review_note IS
  'What the reviewer told the author, e.g. the changes asked for.';
COMMENT ON COLUMN public.forum_articles.published_at IS
  'When it was first published; articles are listed newest first by it.';

CREATE INDEX forum_articles_published_idx
  ON public.forum_articles (published_at DESC) WHERE status = 'published';
CREATE INDEX forum_articles_submitted_idx
  ON public.forum_articles (submitted_at) WHERE status = 'submitted';
CREATE INDEX forum_articles_reviewed_by_idx
  ON public.forum_articles (reviewed_by);

-- A submission starts as submitted. Admins move it to any reviewed status; the
-- author can only resubmit after changes were asked for.
CREATE OR REPLACE FUNCTION public.forum_articles_before_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, private
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.status := 'submitted';
    NEW.review_note := NULL;
    NEW.submitted_at := now();
    NEW.reviewed_at := NULL;
    NEW.reviewed_by := NULL;
    NEW.published_at := NULL;
    RETURN NEW;
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status AND NEW.review_note IS NOT DISTINCT FROM OLD.review_note THEN
    RETURN NEW;
  END IF;

  IF private.is_admin() AND NEW.status <> 'submitted' THEN
    NEW.reviewed_at := now();
    NEW.reviewed_by := auth.uid();
    IF NEW.status = 'published' THEN
      NEW.published_at := coalesce(OLD.published_at, now());
    END IF;
  ELSIF OLD.status = 'changes_requested' AND NEW.status = 'submitted'
    AND NEW.review_note IS NOT DISTINCT FROM OLD.review_note THEN
    NEW.submitted_at := now();
  ELSE
    RAISE EXCEPTION USING ERRCODE = 'MM002', MESSAGE = 'Only admins can review articles';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER forum_articles_before_write
  BEFORE INSERT OR UPDATE ON public.forum_articles
  FOR EACH ROW EXECUTE FUNCTION public.forum_articles_before_write();

REVOKE ALL ON FUNCTION public.forum_articles_before_write() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.forum_articles ENABLE ROW LEVEL SECURITY;

-- Published articles are public; a submission is seen by its author and admins
CREATE POLICY "Published articles are viewable by everyone"
  ON public.forum_articles FOR SELECT
  USING (
    status = 'published'
    OR (SELECT private.is_admin())
    OR EXISTS (
      SELECT 1 FROM public.forum_threads t
      WHERE t.id = thread_id AND t.author_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Authors can submit their threads"
  ON public.forum_articles FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.forum_threads t
      WHERE t.id = thread_id AND t.author_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Authors and admins can update articles"
  ON public.forum_articles FOR UPDATE
  TO authenticated
  USING (
    (SELECT private.is_admin())
    OR EXISTS (
      SELECT 1 FROM public.forum_threads t
      WHERE t.id = thread_id AND t.author_id = (SELECT auth.uid())
    )
  );

-- Column grants keep the timestamps and reviewer for the trigger to set
REVOKE ALL ON public.forum_articles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.forum_articles TO anon, authenticated;
GRANT INSERT (thread_id) ON public.forum_articles TO authenticated;
GRANT UPDATE (status, review_note) ON public.forum_articles TO authenticated;
GRANT ALL ON public.forum_articles TO service_role;

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check,
  ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY[
    'info',
    'warning',
    'error',
    'campaign_invite',
    'friend_request',
    'battle_invite',
    'gang_invite',
    'campaign_join_request',
    'campaign_challenge',
    'user_message',
    'campaign_message',
    'mm_staff_message',
    'mm_announcement',
    'forum_reply',
    'forum_mention',
    'forum_article'
  ]::text[]));

COMMIT;
