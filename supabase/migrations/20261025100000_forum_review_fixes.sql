-- Forum fixes from the review of the whole forum:
-- - Every message a forum trigger raises for the user uses SQLSTATE MM002, so
--   the app tells them apart from other errors by code (42501 stays RLS's).
-- - Locked threads: only moderators can rename them or edit their posts.
-- - The 15-second posting limit holds when one user posts in parallel.
-- - Deleting a thread keeps its posts' content and edits in
--   forum_post_revisions for moderators.
-- - Drops the forum category columns no page reads: post_count and last_post_at
--   (the forum index shows each category's latest thread instead), and
--   updated_at/updated_by, which nothing ever set. Posts stop updating the
--   category row, so replies across a category no longer wait on its row lock.

BEGIN;

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
  ) THEN
    RAISE EXCEPTION 'Only moderators can pin, lock or move threads'
      USING ERRCODE = 'MM002';
  END IF;
  IF NOT is_moderator AND OLD.is_locked AND NEW.title IS DISTINCT FROM OLD.title THEN
    RAISE EXCEPTION 'This thread is locked'
      USING ERRCODE = 'MM002';
  END IF;
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.forum_threads_after_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND NEW.category_id IS DISTINCT FROM OLD.category_id) THEN
    UPDATE forum_categories c
    SET thread_count = c.thread_count - 1
    WHERE c.id = OLD.category_id;
  END IF;

  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.category_id IS DISTINCT FROM OLD.category_id) THEN
    UPDATE forum_categories c
    SET thread_count = c.thread_count + 1
    WHERE c.id = NEW.category_id;
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.forum_posts_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  is_moderator constant boolean := private.is_forum_moderator();
  thread forum_threads%ROWTYPE;
BEGIN
  IF NOT is_moderator THEN
    -- One post at a time per user, so parallel inserts can't all pass the check below
    PERFORM pg_advisory_xact_lock(hashtextextended('forum_post:' || NEW.author_id::text, 0));
    IF EXISTS (
      SELECT 1 FROM forum_posts p
      WHERE p.author_id = NEW.author_id
      AND p.created_at > now() - interval '15 seconds'
    ) THEN
      RAISE EXCEPTION 'Please wait a few seconds before posting again'
        USING ERRCODE = 'MM002';
    END IF;
  END IF;

  -- Locks the thread row, so concurrent replies get consecutive numbers
  SELECT * INTO thread FROM forum_threads t WHERE t.id = NEW.thread_id FOR UPDATE;
  IF thread.is_locked AND NOT is_moderator THEN
    RAISE EXCEPTION 'This thread is locked'
      USING ERRCODE = 'MM002';
  END IF;

  NEW.post_number := thread.post_count + 1;
  NEW.like_count := 0;
  NEW.created_at := now();
  NEW.updated_at := NULL;
  NEW.deleted_at := NULL;
  NEW.deleted_by := NULL;

  UPDATE forum_threads t
  SET post_count = t.post_count + 1,
      last_post_at = NEW.created_at,
      last_post_author_id = NEW.author_id
  WHERE t.id = NEW.thread_id;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.forum_posts_before_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  IF OLD.deleted_at IS NOT NULL THEN
    IF NEW.content IS DISTINCT FROM OLD.content OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
      RAISE EXCEPTION 'This post has been removed'
        USING ERRCODE = 'MM002';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.deleted_at IS NOT NULL THEN
    INSERT INTO forum_post_revisions (post_id, thread_id, post_number, author_id, content, kind, created_by)
    VALUES (OLD.id, OLD.thread_id, OLD.post_number, OLD.author_id, OLD.content, 'delete', auth.uid());
    NEW.deleted_at := now();
    NEW.deleted_by := auth.uid();
    NEW.content := '';
  ELSIF NEW.content IS DISTINCT FROM OLD.content THEN
    -- FOR SHARE waits for a lock being set at the same moment
    IF NOT private.is_forum_moderator()
      AND (SELECT t.is_locked FROM forum_threads t WHERE t.id = OLD.thread_id FOR SHARE) THEN
      RAISE EXCEPTION 'This thread is locked'
        USING ERRCODE = 'MM002';
    END IF;
    INSERT INTO forum_post_revisions (post_id, thread_id, post_number, author_id, content, kind, created_by)
    VALUES (OLD.id, OLD.thread_id, OLD.post_number, OLD.author_id, OLD.content, 'edit', auth.uid());
    NEW.updated_at := now();
  END IF;

  RETURN NEW;
END;
$$;

-- Revisions outlive their post, and know where it was and who wrote it
ALTER TABLE public.forum_post_revisions
  ALTER COLUMN post_id DROP NOT NULL,
  DROP CONSTRAINT forum_post_revisions_post_id_fkey,
  ADD CONSTRAINT forum_post_revisions_post_id_fkey
    FOREIGN KEY (post_id) REFERENCES public.forum_posts(id) ON DELETE SET NULL,
  ADD COLUMN thread_id uuid,
  ADD COLUMN thread_title text,
  ADD COLUMN post_number integer,
  ADD COLUMN author_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

UPDATE public.forum_post_revisions r
SET thread_id = p.thread_id, post_number = p.post_number, author_id = p.author_id
FROM public.forum_posts p
WHERE p.id = r.post_id;

CREATE INDEX forum_post_revisions_thread_id_idx ON public.forum_post_revisions (thread_id);
CREATE INDEX forum_post_revisions_author_id_idx ON public.forum_post_revisions (author_id);

COMMENT ON COLUMN public.forum_post_revisions.post_id IS
  'NULL once the post is deleted with its thread; the other columns still say where it was and who wrote it.';
COMMENT ON COLUMN public.forum_post_revisions.thread_title IS
  'Set on the revisions kept when a thread is deleted.';

-- A deleted thread's posts keep their content as revisions, unless they were removed
-- already. Posts are only ever deleted with their thread.
CREATE OR REPLACE FUNCTION public.forum_threads_before_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO forum_post_revisions (post_id, thread_id, thread_title, post_number, author_id, content, kind, created_by)
  SELECT p.id, OLD.id, OLD.title, p.post_number, p.author_id, p.content, 'delete', auth.uid()
  FROM forum_posts p
  WHERE p.thread_id = OLD.id
  AND p.deleted_at IS NULL;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.forum_threads_before_delete() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER forum_threads_before_delete
  BEFORE DELETE ON public.forum_threads
  FOR EACH ROW
  EXECUTE FUNCTION public.forum_threads_before_delete();

ALTER TABLE public.forum_categories
  DROP COLUMN post_count,
  DROP COLUMN last_post_at,
  DROP COLUMN updated_at,
  DROP COLUMN updated_by;

COMMIT;
