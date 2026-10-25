-- Starts a forum thread, its opening post and its tags in one transaction, so a
-- failed post leaves no empty thread. Runs as the caller: RLS and the forum triggers apply.
CREATE OR REPLACE FUNCTION public.create_forum_thread(
  p_category_id uuid,
  p_title text,
  p_content text,
  p_tag_ids uuid[] DEFAULT '{}'
)
RETURNS public.forum_threads
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  thread forum_threads%ROWTYPE;
BEGIN
  INSERT INTO forum_threads (category_id, title, author_id)
  VALUES (p_category_id, p_title, auth.uid())
  RETURNING * INTO thread;

  INSERT INTO forum_posts (thread_id, author_id, content)
  VALUES (thread.id, auth.uid(), p_content);

  PERFORM set_forum_thread_tags(thread.id, p_tag_ids);

  RETURN thread;
END;
$$;

REVOKE ALL ON FUNCTION public.create_forum_thread(uuid, text, text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_forum_thread(uuid, text, text, uuid[]) TO authenticated, service_role;
