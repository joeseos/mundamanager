-- Articles: moderators publish a thread, and its opening post is also shown at
-- /articles and on the home page. The thread stays in the forum, its replies are
-- the article's comments and its category is the article's tag.
--
-- Design notes:
-- - Publishing is a thread flag like is_pinned and is_locked, so the same trigger
--   and column grants keep it to moderators.
-- - A thread's author can suggest it for publication. The suggestion and the
--   moderator's answer (changes asked for, or declined, with a note) are private
--   to the author and moderators, so they live in forum_article_submissions,
--   not on the public thread row. Publishing the thread ends its submission.
--
-- DEPLOY ORDER: apply after 20261025100000_forum_review_fixes.sql.

BEGIN;

ALTER TABLE public.forum_threads ADD COLUMN article_published_at timestamp with time zone;

COMMENT ON COLUMN public.forum_threads.article_published_at IS
  'When a moderator published the thread as an article; NULL when it is not one. Articles are listed newest first by it.';

CREATE INDEX forum_threads_article_idx
  ON public.forum_threads (article_published_at DESC) WHERE article_published_at IS NOT NULL;

CREATE TABLE public.forum_article_submissions (
  thread_id uuid PRIMARY KEY REFERENCES public.forum_threads(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'submitted',
  review_note text,
  submitted_at timestamp with time zone NOT NULL DEFAULT now(),
  reviewed_at timestamp with time zone,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT forum_article_submissions_status_check
    CHECK (status IN ('submitted', 'changes_requested', 'declined')),
  CONSTRAINT forum_article_submissions_review_note_length CHECK (char_length(review_note) <= 2000)
);

COMMENT ON TABLE public.forum_article_submissions IS
  'Threads their authors suggested as articles, until a moderator publishes them. Author and moderators only.';
COMMENT ON COLUMN public.forum_article_submissions.review_note IS
  'What the moderator told the author: the changes asked for, or why it was declined.';

CREATE INDEX forum_article_submissions_queue_idx
  ON public.forum_article_submissions (submitted_at) WHERE status = 'submitted';
CREATE INDEX forum_article_submissions_reviewed_by_idx
  ON public.forum_article_submissions (reviewed_by);

-- As in 20261025100000_forum_review_fixes.sql, plus article_published_at
CREATE OR REPLACE FUNCTION public.forum_threads_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  is_moderator constant boolean := private.is_forum_moderator();
  new_account_thread_limit constant integer := 3;
  account_created timestamp with time zone;
  recent_threads integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.post_count := 0;
    NEW.last_post_at := now();
    NEW.last_post_author_id := NEW.author_id;
    NEW.created_at := now();
    NEW.updated_at := NULL;
    NEW.updated_by := NULL;
    NEW.article_published_at := NULL;
    IF NOT is_moderator THEN
      NEW.is_pinned := false;
      NEW.is_locked := false;

      SELECT p.created_at INTO account_created FROM profiles p WHERE p.id = NEW.author_id;
      IF account_created IS NULL OR account_created > now() - interval '1 day' THEN
        SELECT count(*) INTO recent_threads
        FROM forum_threads t
        WHERE t.author_id = NEW.author_id
        AND t.created_at > now() - interval '1 day';
        IF recent_threads >= new_account_thread_limit THEN
          RAISE EXCEPTION 'New accounts can start % threads a day', new_account_thread_limit
            USING ERRCODE = 'MM002';
        END IF;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF NOT is_moderator AND (
    NEW.is_pinned IS DISTINCT FROM OLD.is_pinned
    OR NEW.is_locked IS DISTINCT FROM OLD.is_locked
    OR NEW.category_id IS DISTINCT FROM OLD.category_id
    OR NEW.article_published_at IS DISTINCT FROM OLD.article_published_at
  ) THEN
    RAISE EXCEPTION 'Only moderators can pin, lock, move or publish threads'
      USING ERRCODE = 'MM002';
  END IF;
  IF NOT is_moderator AND OLD.is_locked AND NEW.title IS DISTINCT FROM OLD.title THEN
    RAISE EXCEPTION 'This thread is locked'
      USING ERRCODE = 'MM002';
  END IF;
  -- Publishing stamps the time here, so the client only says whether it's an article
  IF NEW.article_published_at IS NOT NULL THEN
    NEW.article_published_at := coalesce(OLD.article_published_at, now());
    DELETE FROM forum_article_submissions WHERE thread_id = NEW.id;
  END IF;
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;

-- The trigger runs on updates of the columns it checks, so add the new one
DROP TRIGGER forum_threads_before_write ON public.forum_threads;
CREATE TRIGGER forum_threads_before_write
  BEFORE INSERT OR UPDATE OF category_id, title, is_pinned, is_locked, article_published_at ON public.forum_threads
  FOR EACH ROW
  EXECUTE FUNCTION public.forum_threads_before_write();

GRANT UPDATE (article_published_at) ON public.forum_threads TO authenticated;

-- A submission starts as submitted. Moderators answer one that is waiting; its
-- author can resubmit after changes were asked for. A declined one stays declined.
CREATE OR REPLACE FUNCTION public.forum_article_submissions_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF EXISTS (SELECT 1 FROM forum_threads t WHERE t.id = NEW.thread_id AND t.article_published_at IS NOT NULL) THEN
      RAISE EXCEPTION 'This thread is already an article' USING ERRCODE = 'MM002';
    END IF;
    NEW.status := 'submitted';
    NEW.review_note := NULL;
    NEW.submitted_at := now();
    NEW.reviewed_at := NULL;
    NEW.reviewed_by := NULL;
    RETURN NEW;
  END IF;

  IF OLD.status = 'submitted' AND NEW.status <> 'submitted' AND private.is_forum_moderator() THEN
    NEW.reviewed_at := now();
    NEW.reviewed_by := auth.uid();
  ELSIF OLD.status = 'changes_requested' AND NEW.status = 'submitted'
    AND NEW.review_note IS NOT DISTINCT FROM OLD.review_note
    AND EXISTS (SELECT 1 FROM forum_threads t WHERE t.id = NEW.thread_id AND t.author_id = auth.uid()) THEN
    NEW.submitted_at := now();
  ELSE
    RAISE EXCEPTION 'Only the author can resubmit, and only moderators can answer a submission'
      USING ERRCODE = 'MM002';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER forum_article_submissions_before_write
  BEFORE INSERT OR UPDATE ON public.forum_article_submissions
  FOR EACH ROW EXECUTE FUNCTION public.forum_article_submissions_before_write();

REVOKE ALL ON FUNCTION public.forum_article_submissions_before_write() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.forum_article_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authors and moderators can view submissions"
  ON public.forum_article_submissions FOR SELECT
  TO authenticated
  USING (
    (SELECT private.is_forum_moderator())
    OR EXISTS (
      SELECT 1 FROM public.forum_threads t
      WHERE t.id = thread_id AND t.author_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Authors can submit their threads"
  ON public.forum_article_submissions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.forum_threads t
      WHERE t.id = thread_id AND t.author_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Authors and moderators can update submissions"
  ON public.forum_article_submissions FOR UPDATE
  TO authenticated
  USING (
    (SELECT private.is_forum_moderator())
    OR EXISTS (
      SELECT 1 FROM public.forum_threads t
      WHERE t.id = thread_id AND t.author_id = (SELECT auth.uid())
    )
  );

-- Column grants keep the timestamps and reviewer for the trigger to set
REVOKE ALL ON public.forum_article_submissions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.forum_article_submissions TO authenticated;
GRANT INSERT (thread_id) ON public.forum_article_submissions TO authenticated;
GRANT UPDATE (status, review_note) ON public.forum_article_submissions TO authenticated;
GRANT ALL ON public.forum_article_submissions TO service_role;

-- Telling the author their thread was published, or what the moderator said
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
