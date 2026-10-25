-- Replaces a forum thread's tags and returns the thread. The only way the app
-- writes thread tags, so the rules live here: the author or a moderator,
-- moderators only on a locked thread, and at most 3 tags. Tags deleted since
-- the caller loaded them are skipped.
CREATE OR REPLACE FUNCTION public.set_forum_thread_tags(p_thread_id uuid, p_tag_ids uuid[])
RETURNS public.forum_threads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  max_tags constant integer := 3;
  thread forum_threads%ROWTYPE;
BEGIN
  -- FOR UPDATE waits for a lock being set at the same moment
  SELECT * INTO thread FROM forum_threads t WHERE t.id = p_thread_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This thread no longer exists'
      USING ERRCODE = 'MM002';
  END IF;
  IF NOT private.is_forum_moderator() THEN
    IF thread.author_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Only the thread''s author and moderators can change its tags'
        USING ERRCODE = 'MM002';
    END IF;
    IF thread.is_locked THEN
      RAISE EXCEPTION 'This thread is locked'
        USING ERRCODE = 'MM002';
    END IF;
  END IF;
  IF cardinality(p_tag_ids) > max_tags THEN
    RAISE EXCEPTION 'A thread can have at most % tags', max_tags
      USING ERRCODE = 'MM002';
  END IF;

  DELETE FROM forum_thread_tags tt
  WHERE tt.thread_id = p_thread_id
  AND tt.tag_id <> ALL (coalesce(p_tag_ids, '{}'));

  INSERT INTO forum_thread_tags (thread_id, tag_id)
  SELECT p_thread_id, tag.id FROM forum_tags tag WHERE tag.id = ANY (p_tag_ids)
  ON CONFLICT DO NOTHING;

  RETURN thread;
END;
$$;

REVOKE ALL ON FUNCTION public.set_forum_thread_tags(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_forum_thread_tags(uuid, uuid[]) TO authenticated, service_role;
