-- Forum: categories, threads and posts at /forum, read by everyone, written by
-- signed-in users, moderated by the new 'moderator' role and admins.
--
-- Design notes:
-- - A thread's opening post is its first row in forum_posts (post_number 1), so
--   editing and liking work the same for every post.
-- - post_number numbers a thread's posts 1, 2, 3... in the order they were made,
--   so a thread page is a range of post numbers. Posts are never deleted on
--   their own: a moderator removes one by setting deleted_at, which empties
--   content. Deleting a thread deletes its posts.
-- - Counters (post_count, thread_count, like_count, last_post_*) are kept by
--   triggers, never by the app, so pages never count rows.
-- - Every earlier version of a post, and the text of a removed post, is kept in
--   forum_post_revisions for moderators.
-- - Rules live in RLS and triggers, not only in the app: RLS lets any signed-in
--   user write these tables directly through the Data API. Column grants limit
--   what each role can change; triggers fill in the rest.
-- - create_forum_thread() starts a thread and its opening post in one
--   transaction, so a failed post (e.g. the posting limit) leaves no empty thread.
-- - Posting limits: one post per 15 seconds, and accounts under a day old can
--   start 3 threads a day. Moderators are exempt.
--
-- DEPLOY ORDER: apply after 20261023110000_restrict_profiles_column_grants.sql
-- (#2311), which stops users from setting their own user_role to 'moderator'.

BEGIN;

-- Also defined in supabase/functions/is_forum_moderator.sql (deployed on merge).
CREATE OR REPLACE FUNCTION private.is_forum_moderator()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, private
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM profiles p
    WHERE p.id = auth.uid()
    AND p.user_role IN ('admin', 'moderator')
  );
$$;

CREATE TABLE public.forum_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  position integer NOT NULL DEFAULT 0,
  moderators_only boolean NOT NULL DEFAULT false,
  thread_count integer NOT NULL DEFAULT 0,
  post_count integer NOT NULL DEFAULT 0,
  last_post_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT forum_categories_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

COMMENT ON COLUMN public.forum_categories.position IS
  'Order on the forum index, lowest first.';
COMMENT ON COLUMN public.forum_categories.moderators_only IS
  'Only moderators can start threads here (e.g. Announcements). Anyone can still reply.';

CREATE TABLE public.forum_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  category_id uuid NOT NULL REFERENCES public.forum_categories(id) ON DELETE RESTRICT,
  title text NOT NULL,
  author_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_pinned boolean NOT NULL DEFAULT false,
  is_locked boolean NOT NULL DEFAULT false,
  post_count integer NOT NULL DEFAULT 0,
  last_post_at timestamp with time zone NOT NULL DEFAULT now(),
  last_post_author_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT forum_threads_title_length CHECK (char_length(btrim(title)) BETWEEN 1 AND 150)
);

COMMENT ON COLUMN public.forum_threads.number IS
  'Short public id for URLs: /forum/<category slug>/<number>-<title slug>.';
COMMENT ON COLUMN public.forum_threads.post_count IS
  'Posts in the thread, the opening post included. Replies = post_count - 1.';

CREATE TABLE public.forum_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.forum_threads(id) ON DELETE CASCADE,
  post_number integer NOT NULL,
  author_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  content text NOT NULL,
  like_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone,
  deleted_at timestamp with time zone,
  deleted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT forum_posts_thread_number_key UNIQUE (thread_id, post_number),
  CONSTRAINT forum_posts_content_length CHECK (char_length(content) <= 50000)
);

COMMENT ON COLUMN public.forum_posts.content IS
  'Rich-text HTML (TipTap output). Sanitized when pages read it. Emptied when the post is removed; the text is kept in forum_post_revisions.';
COMMENT ON COLUMN public.forum_posts.updated_at IS
  'Set when the content is edited; shown as "edited".';
COMMENT ON COLUMN public.forum_posts.author_id IS
  'NULL once the account is deleted; shown as "Unknown User".';

CREATE TABLE public.forum_post_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.forum_posts(id) ON DELETE CASCADE,
  content text NOT NULL,
  kind text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT forum_post_revisions_kind_check CHECK (kind IN ('edit', 'delete'))
);

COMMENT ON TABLE public.forum_post_revisions IS
  'The content a post had before each edit (kind edit) or before it was removed (kind delete). Moderators only.';

CREATE TABLE public.forum_post_likes (
  post_id uuid NOT NULL REFERENCES public.forum_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE INDEX forum_threads_category_list_idx
  ON public.forum_threads (category_id, is_pinned DESC, last_post_at DESC);
CREATE INDEX forum_threads_author_created_idx
  ON public.forum_threads (author_id, created_at DESC);
CREATE INDEX forum_posts_author_created_idx
  ON public.forum_posts (author_id, created_at DESC);
CREATE INDEX forum_post_revisions_post_idx
  ON public.forum_post_revisions (post_id, created_at);
CREATE INDEX forum_post_likes_user_idx
  ON public.forum_post_likes (user_id);

-- Threads: counters start at zero, only moderators pin, lock or move, and new
-- accounts are limited to 3 threads a day.
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
      USING ERRCODE = '42501';
  END IF;
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;

-- Not on updates the post triggers make to the counters
CREATE TRIGGER forum_threads_before_write
  BEFORE INSERT OR UPDATE OF category_id, title, is_pinned, is_locked ON public.forum_threads
  FOR EACH ROW
  EXECUTE FUNCTION public.forum_threads_before_write();

-- Category counters follow thread inserts, moves and deletes.
CREATE OR REPLACE FUNCTION public.forum_threads_after_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    IF TG_OP = 'DELETE' OR NEW.category_id IS DISTINCT FROM OLD.category_id THEN
      UPDATE forum_categories c
      SET thread_count = c.thread_count - 1,
          post_count = c.post_count - OLD.post_count,
          last_post_at = (
            SELECT max(t.last_post_at) FROM forum_threads t
            WHERE t.category_id = OLD.category_id AND t.id <> OLD.id
          )
      WHERE c.id = OLD.category_id;
    END IF;
  END IF;

  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.category_id IS DISTINCT FROM OLD.category_id) THEN
    UPDATE forum_categories c
    SET thread_count = c.thread_count + 1,
        post_count = c.post_count + NEW.post_count,
        last_post_at = GREATEST(c.last_post_at, NEW.last_post_at)
    WHERE c.id = NEW.category_id;
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER forum_threads_after_write
  AFTER INSERT OR UPDATE OF category_id OR DELETE ON public.forum_threads
  FOR EACH ROW
  EXECUTE FUNCTION public.forum_threads_after_write();

-- Posts: number the post, update the thread and category, and hold users to one
-- post per 15 seconds. Locked threads take replies from moderators only.
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

  UPDATE forum_categories c
  SET post_count = c.post_count + 1,
      last_post_at = NEW.created_at
  WHERE c.id = thread.category_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER forum_posts_before_insert
  BEFORE INSERT ON public.forum_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.forum_posts_before_insert();

-- Edits and removals keep the previous content in forum_post_revisions.
-- Removal empties content and can't be undone through the API.
CREATE OR REPLACE FUNCTION public.forum_posts_before_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.deleted_at IS NOT NULL THEN
    IF NEW.content IS DISTINCT FROM OLD.content OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
      RAISE EXCEPTION 'This post has been removed'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.deleted_at IS NOT NULL THEN
    INSERT INTO forum_post_revisions (post_id, content, kind, created_by)
    VALUES (OLD.id, OLD.content, 'delete', auth.uid());
    NEW.deleted_at := now();
    NEW.deleted_by := auth.uid();
    NEW.content := '';
  ELSIF NEW.content IS DISTINCT FROM OLD.content THEN
    INSERT INTO forum_post_revisions (post_id, content, kind, created_by)
    VALUES (OLD.id, OLD.content, 'edit', auth.uid());
    NEW.updated_at := now();
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER forum_posts_before_update
  BEFORE UPDATE OF content, deleted_at ON public.forum_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.forum_posts_before_update();

CREATE OR REPLACE FUNCTION public.forum_post_likes_after_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE forum_posts p
  SET like_count = p.like_count + CASE WHEN TG_OP = 'INSERT' THEN 1 ELSE -1 END
  WHERE p.id = CASE WHEN TG_OP = 'INSERT' THEN NEW.post_id ELSE OLD.post_id END;
  RETURN NULL;
END;
$$;

CREATE TRIGGER forum_post_likes_after_write
  AFTER INSERT OR DELETE ON public.forum_post_likes
  FOR EACH ROW
  EXECUTE FUNCTION public.forum_post_likes_after_write();

-- Also defined in supabase/functions/create_forum_thread.sql (deployed on merge).
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

REVOKE ALL ON FUNCTION public.forum_threads_before_write() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.forum_threads_after_write() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.forum_posts_before_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.forum_posts_before_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.forum_post_likes_after_write() FROM PUBLIC, anon, authenticated;

-- RLS

ALTER TABLE public.forum_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_post_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_post_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Forum categories are viewable by everyone"
  ON public.forum_categories FOR SELECT
  USING (true);

CREATE POLICY forum_categories_admin_insert_policy
  ON public.forum_categories FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT private.is_admin()));

CREATE POLICY forum_categories_admin_update_policy
  ON public.forum_categories FOR UPDATE
  TO authenticated
  USING ((SELECT private.is_admin()))
  WITH CHECK ((SELECT private.is_admin()));

CREATE POLICY forum_categories_admin_delete_policy
  ON public.forum_categories FOR DELETE
  TO authenticated
  USING ((SELECT private.is_admin()));

CREATE POLICY "Forum threads are viewable by everyone"
  ON public.forum_threads FOR SELECT
  USING (true);

CREATE POLICY "Users can start threads"
  ON public.forum_threads FOR INSERT
  TO authenticated
  WITH CHECK (
    author_id = (SELECT auth.uid())
    AND (
      (SELECT private.is_forum_moderator())
      OR NOT EXISTS (
        SELECT 1 FROM public.forum_categories c
        WHERE c.id = category_id AND c.moderators_only
      )
    )
  );

CREATE POLICY "Authors and moderators can update threads"
  ON public.forum_threads FOR UPDATE
  TO authenticated
  USING (author_id = (SELECT auth.uid()) OR (SELECT private.is_forum_moderator()))
  WITH CHECK (author_id = (SELECT auth.uid()) OR (SELECT private.is_forum_moderator()));

CREATE POLICY "Moderators can delete threads"
  ON public.forum_threads FOR DELETE
  TO authenticated
  USING ((SELECT private.is_forum_moderator()));

CREATE POLICY "Forum posts are viewable by everyone"
  ON public.forum_posts FOR SELECT
  USING (true);

CREATE POLICY "Users can post"
  ON public.forum_posts FOR INSERT
  TO authenticated
  WITH CHECK (author_id = (SELECT auth.uid()));

-- Authors edit their own posts but can't remove them: deleted_at stays NULL.
CREATE POLICY "Authors can edit their posts"
  ON public.forum_posts FOR UPDATE
  TO authenticated
  USING (author_id = (SELECT auth.uid()))
  WITH CHECK (author_id = (SELECT auth.uid()) AND deleted_at IS NULL);

CREATE POLICY "Moderators can edit and remove posts"
  ON public.forum_posts FOR UPDATE
  TO authenticated
  USING ((SELECT private.is_forum_moderator()))
  WITH CHECK ((SELECT private.is_forum_moderator()));

CREATE POLICY "Moderators can view post revisions"
  ON public.forum_post_revisions FOR SELECT
  TO authenticated
  USING ((SELECT private.is_forum_moderator()));

CREATE POLICY "Users can view their own likes"
  ON public.forum_post_likes FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can like posts"
  ON public.forum_post_likes FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can remove their likes"
  ON public.forum_post_likes FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- Grants. Default privileges may already grant whole tables, so revoke first.
-- Column grants keep counters, numbers and timestamps for the triggers to set.
REVOKE ALL ON public.forum_categories, public.forum_threads, public.forum_posts,
  public.forum_post_revisions, public.forum_post_likes
  FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.forum_categories, public.forum_threads, public.forum_posts
  TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.forum_categories TO authenticated;
GRANT INSERT (category_id, title, author_id) ON public.forum_threads TO authenticated;
GRANT UPDATE (category_id, title, is_pinned, is_locked) ON public.forum_threads TO authenticated;
GRANT DELETE ON public.forum_threads TO authenticated;
GRANT INSERT (thread_id, author_id, content) ON public.forum_posts TO authenticated;
GRANT UPDATE (content, deleted_at) ON public.forum_posts TO authenticated;
GRANT SELECT ON public.forum_post_revisions TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.forum_post_likes TO authenticated;
GRANT ALL ON public.forum_categories, public.forum_threads, public.forum_posts,
  public.forum_post_revisions, public.forum_post_likes
  TO service_role;

-- Reply notifications
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
        'forum_reply'
    ]::text[]));

-- Post images: users-images/forum/<user id>/..., drafts under .../_draft/.
DROP POLICY IF EXISTS "Forum images are viewable by everyone" ON storage.objects;
DROP POLICY IF EXISTS "Forum images can be uploaded by their owner" ON storage.objects;
DROP POLICY IF EXISTS "Forum images can be updated by their owner" ON storage.objects;
DROP POLICY IF EXISTS "Forum images can be deleted by their owner or a moderator" ON storage.objects;

CREATE POLICY "Forum images are viewable by everyone"
    ON storage.objects FOR SELECT
    TO PUBLIC
    USING (
        bucket_id = 'users-images'
        AND SPLIT_PART(name, '/', 1) = 'forum'
    );

CREATE POLICY "Forum images can be uploaded by their owner"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'users-images'
        AND SPLIT_PART(name, '/', 1) = 'forum'
        AND SPLIT_PART(name, '/', 2) = (SELECT auth.uid())::text
    );

CREATE POLICY "Forum images can be updated by their owner"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (
        bucket_id = 'users-images'
        AND SPLIT_PART(name, '/', 1) = 'forum'
        AND SPLIT_PART(name, '/', 2) = (SELECT auth.uid())::text
    )
    WITH CHECK (
        bucket_id = 'users-images'
        AND SPLIT_PART(name, '/', 1) = 'forum'
        AND SPLIT_PART(name, '/', 2) = (SELECT auth.uid())::text
    );

CREATE POLICY "Forum images can be deleted by their owner or a moderator"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (
        bucket_id = 'users-images'
        AND SPLIT_PART(name, '/', 1) = 'forum'
        AND (
            SPLIT_PART(name, '/', 2) = (SELECT auth.uid())::text
            OR (SELECT private.is_forum_moderator())
        )
    );

-- Starting categories (team decision, 2026-10-23)
INSERT INTO public.forum_categories (slug, name, description, position, moderators_only) VALUES
  ('announcements', 'Announcements', 'Munda Manager news and community updates', 1, true),
  ('n26-rules-gang-discussion', 'N26 Rules & Gang Discussion', 'Discuss N26 rules, tactics and building your gang', 2, false),
  ('n23-rules-gang-discussion', 'N23 Rules & Gang Discussion', 'Discuss N23 rules, tactics and building your gang', 3, false),
  ('miniatures-terrain', 'Miniatures & Terrain', 'Painting, conversions and tabletop projects', 4, false),
  ('battle-reports', 'Battle Reports', 'Share your game stories', 5, false);

COMMIT;
