-- Forum tags: a fixed list of tags, and a thread carries up to 3 of them.
-- Articles are published threads, so they show their thread's tags.
--
-- Design notes:
-- - The list is curated, not free text, so labels stay consistent and a rename
--   is one row. For now the list is edited in the database only (no app UI).
-- - A thread's author and moderators set its tags; on a locked thread only
--   moderators can, like renaming it.
-- - set_forum_thread_tags() replaces a thread's tags in one call and holds
--   those rules, and create_forum_thread() takes the new thread's tags, so a
--   thread is never left half tagged.
--
-- DEPLOY ORDER: apply after 20261025120000_add_forum_articles.sql.

BEGIN;

CREATE TABLE public.forum_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  CONSTRAINT forum_tags_name_key UNIQUE (name),
  CONSTRAINT forum_tags_name_length CHECK (char_length(btrim(name)) BETWEEN 1 AND 40)
);

COMMENT ON TABLE public.forum_tags IS
  'Tags for forum threads, edited in the database. Renaming one renames it on every thread.';

CREATE TABLE public.forum_thread_tags (
  thread_id uuid NOT NULL REFERENCES public.forum_threads(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.forum_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (thread_id, tag_id)
);

COMMENT ON TABLE public.forum_thread_tags IS 'The tags on each forum thread, at most 3.';

-- Also defined in supabase/functions/set_forum_thread_tags.sql (deployed on merge).
-- Replaces the thread's tags and returns the thread. The only way the app writes
-- thread tags, so the rules live here: the author or a moderator, moderators
-- only on a locked thread, and at most 3 tags. Tags deleted since the caller
-- loaded them are skipped.
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

-- As in 20261023140000_create_forum.sql, plus the thread's tags
-- Also defined in supabase/functions/create_forum_thread.sql (deployed on merge).
DROP FUNCTION IF EXISTS public.create_forum_thread(uuid, text, text);

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

-- RLS

ALTER TABLE public.forum_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_thread_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Forum tags are viewable by everyone"
  ON public.forum_tags FOR SELECT
  USING (true);

CREATE POLICY "Forum thread tags are viewable by everyone"
  ON public.forum_thread_tags FOR SELECT
  USING (true);

-- Read only to the app: the tag list is edited in the database, and thread tags
-- are written through set_forum_thread_tags()
REVOKE ALL ON public.forum_tags, public.forum_thread_tags FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.forum_tags, public.forum_thread_tags TO anon, authenticated;
GRANT ALL ON public.forum_tags, public.forum_thread_tags TO service_role;

-- The starting list
INSERT INTO public.forum_tags (name) VALUES
  ('N23'),
  ('N26'),
  ('Cawdor'),
  ('Delaque'),
  ('Escher'),
  ('Goliath'),
  ('Orlock'),
  ('Van Saar'),
  ('Palanite Enforcers'),
  ('Outcasts'),
  ('Venators'),
  ('Rules question'),
  ('Campaign'),
  ('Zone Mortalis'),
  ('Painting'),
  ('Terrain');

COMMIT;
