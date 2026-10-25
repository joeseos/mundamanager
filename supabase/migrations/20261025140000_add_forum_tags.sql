-- Forum tags: a fixed list of tags, and a thread carries up to 3 of them.
-- Articles are published threads, so they show their thread's tags.
--
-- Design notes:
-- - The list is curated, not free text, so labels stay consistent and a rename
--   is one row. For now the list is edited in the database only (no app UI).
-- - A thread's author and moderators set its tags; on a locked thread only
--   moderators can, like renaming it.
-- - set_forum_thread_tags() replaces a thread's tags in one call, and
--   create_forum_thread() takes the new thread's tags, so a thread is never
--   left half tagged.
--
-- DEPLOY ORDER: apply after 20261025120000_add_forum_articles.sql.

BEGIN;

CREATE TABLE public.forum_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
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

-- For the cascade when a tag is deleted; the primary key serves lookups by thread
CREATE INDEX forum_thread_tags_tag_idx ON public.forum_thread_tags (tag_id);

-- Locks the thread row, so parallel writes can't pass the limit together.
-- A thread being deleted takes its rows with it, unchecked. The lock rule is
-- for signed-in users, so deleting a tag in the database clears it from locked threads too.
CREATE OR REPLACE FUNCTION public.forum_thread_tags_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  max_tags constant integer := 3;
  thread forum_threads%ROWTYPE;
BEGIN
  SELECT * INTO thread FROM forum_threads t
  WHERE t.id = CASE WHEN TG_OP = 'DELETE' THEN OLD.thread_id ELSE NEW.thread_id END
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF thread.is_locked AND auth.uid() IS NOT NULL AND NOT private.is_forum_moderator() THEN
    RAISE EXCEPTION 'This thread is locked'
      USING ERRCODE = 'MM002';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  -- Not counting the tag itself, so inserting a tag the thread already has stays a no-op
  IF (SELECT count(*) FROM forum_thread_tags tt WHERE tt.thread_id = NEW.thread_id AND tt.tag_id <> NEW.tag_id) >= max_tags THEN
    RAISE EXCEPTION 'A thread can have at most % tags', max_tags
      USING ERRCODE = 'MM002';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER forum_thread_tags_before_write
  BEFORE INSERT OR DELETE ON public.forum_thread_tags
  FOR EACH ROW EXECUTE FUNCTION public.forum_thread_tags_before_write();

REVOKE ALL ON FUNCTION public.forum_thread_tags_before_write() FROM PUBLIC, anon, authenticated;

-- Also defined in supabase/functions/set_forum_thread_tags.sql (deployed on merge).
-- Replaces the thread's tags and returns the thread. The only way the app writes
-- thread tags, so it checks who may; the trigger adds the lock and the limit.
-- Tags deleted since the caller loaded them are skipped.
CREATE OR REPLACE FUNCTION public.set_forum_thread_tags(p_thread_id uuid, p_tag_ids uuid[])
RETURNS public.forum_threads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  thread forum_threads%ROWTYPE;
BEGIN
  SELECT * INTO thread FROM forum_threads t WHERE t.id = p_thread_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This thread no longer exists'
      USING ERRCODE = 'MM002';
  END IF;
  IF thread.author_id IS DISTINCT FROM auth.uid() AND NOT private.is_forum_moderator() THEN
    RAISE EXCEPTION 'Only the thread''s author and moderators can change its tags'
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
