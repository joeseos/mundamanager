-- Drops the forum category columns no page reads: post_count and last_post_at
-- (the forum index shows each category's latest thread instead), and
-- updated_at/updated_by, which nothing ever set. Posts stop updating the
-- category row, so replies across a category no longer wait on its row lock.

BEGIN;

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
  IF NOT is_moderator AND EXISTS (
    SELECT 1 FROM forum_posts p
    WHERE p.author_id = NEW.author_id
    AND p.created_at > now() - interval '15 seconds'
  ) THEN
    RAISE EXCEPTION 'Please wait a few seconds before posting again'
      USING ERRCODE = 'MM002';
  END IF;

  -- Locks the thread row, so concurrent replies get consecutive numbers
  SELECT * INTO thread FROM forum_threads t WHERE t.id = NEW.thread_id FOR UPDATE;
  IF thread.is_locked AND NOT is_moderator THEN
    RAISE EXCEPTION 'This thread is locked'
      USING ERRCODE = '42501';
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

ALTER TABLE public.forum_categories
  DROP COLUMN post_count,
  DROP COLUMN last_post_at,
  DROP COLUMN updated_at,
  DROP COLUMN updated_by;

COMMIT;
