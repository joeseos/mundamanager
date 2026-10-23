-- Starts a forum thread and its opening post in one transaction, so a failed
-- post leaves no empty thread. Runs as the caller: RLS and the forum triggers apply.
CREATE OR REPLACE FUNCTION public.create_forum_thread(
  p_category_id uuid,
  p_title text,
  p_content text
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

  RETURN thread;
END;
$$;

REVOKE ALL ON FUNCTION public.create_forum_thread(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_forum_thread(uuid, text, text) TO authenticated, service_role;
