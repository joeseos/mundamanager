-- Articles: news and other posts written by editors, read by everyone at /articles.
--
-- Same shape as user guides (20260913185837_create_user_guides.sql): rich-text
-- HTML from the shared TipTap editor, public reads, writes from the Admin
-- Dashboard, images in the public site-images bucket.
--
-- Design notes:
-- - Writers are admins plus the new 'editor' value of profiles.user_role,
--   checked by private.is_editor(). Editors see only the Articles card on /admin.
-- - title, summary and content are the live version. Saving writes the draft_*
--   columns instead, so an editor can save changes to a published article
--   without publishing them. Publishing copies the draft columns over the live
--   ones and clears them. draft_* can be read like the rest of the row; the
--   public pages just don't show it.
-- - published_at IS NULL means not published. The slug is the URL
--   (/articles/<slug>) and can't change while the article is published.
-- - updated_at is set by the application write path, on every save and publish.
--
-- DEPLOY ORDER: apply before merging; the new pages and routes read this table.

BEGIN;

-- Also defined in supabase/functions/is_editor.sql (deployed on merge).
CREATE OR REPLACE FUNCTION private.is_editor()
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
    AND p.user_role IN ('admin', 'editor')
  );
$$;

CREATE TABLE public.articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  summary text,
  content text NOT NULL DEFAULT '',
  published_at timestamp with time zone,
  author_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  draft_title text,
  draft_summary text,
  draft_content text,
  CONSTRAINT articles_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

COMMENT ON TABLE public.articles IS
  'Articles rendered on /articles and /articles/<slug>. title, summary and content are the published version; draft_* holds saved, unpublished changes.';
COMMENT ON COLUMN public.articles.content IS
  'Article body as rich-text HTML (TipTap output). Sanitized when the public pages read it.';
COMMENT ON COLUMN public.articles.published_at IS
  'When the article was published. NULL = not published.';
COMMENT ON COLUMN public.articles.draft_title IS
  'Saved, unpublished title. NULL = no unpublished changes.';
COMMENT ON COLUMN public.articles.draft_summary IS
  'Saved, unpublished summary.';
COMMENT ON COLUMN public.articles.draft_content IS
  'Saved, unpublished body.';

CREATE INDEX articles_published_at_idx
  ON public.articles (published_at DESC)
  WHERE published_at IS NOT NULL;

ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Published articles are viewable by everyone"
  ON public.articles FOR SELECT
  USING (published_at IS NOT NULL);

CREATE POLICY "Admins and editors can view all articles"
  ON public.articles FOR SELECT
  TO authenticated
  USING ((SELECT private.is_editor() AS is_editor));

CREATE POLICY "Admins and editors can create articles"
  ON public.articles FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT private.is_editor() AS is_editor));

CREATE POLICY "Admins and editors can update articles"
  ON public.articles FOR UPDATE
  TO authenticated
  USING ((SELECT private.is_editor() AS is_editor))
  WITH CHECK ((SELECT private.is_editor() AS is_editor));

CREATE POLICY "Admins and editors can delete articles"
  ON public.articles FOR DELETE
  TO authenticated
  USING ((SELECT private.is_editor() AS is_editor));

GRANT SELECT ON public.articles TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.articles TO authenticated;

-- Article images: site-images/articles/<article id>/..., drafts under .../_draft/.
-- Same policies as the user guide images (20260913185838), for admins and editors.
DROP POLICY IF EXISTS "Article images are viewable by everyone" ON storage.objects;
DROP POLICY IF EXISTS "Article images can be uploaded by admins and editors" ON storage.objects;
DROP POLICY IF EXISTS "Article images can be updated by admins and editors" ON storage.objects;
DROP POLICY IF EXISTS "Article images can be deleted by admins and editors" ON storage.objects;

CREATE POLICY "Article images are viewable by everyone"
    ON storage.objects FOR SELECT
    TO PUBLIC
    USING (
        bucket_id = 'site-images'
        AND SPLIT_PART(name, '/', 1) = 'articles'
    );

CREATE POLICY "Article images can be uploaded by admins and editors"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'site-images'
        AND SPLIT_PART(name, '/', 1) = 'articles'
        AND (SELECT private.is_editor() AS is_editor)
    );

CREATE POLICY "Article images can be updated by admins and editors"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (
        bucket_id = 'site-images'
        AND SPLIT_PART(name, '/', 1) = 'articles'
        AND (SELECT private.is_editor() AS is_editor)
    )
    WITH CHECK (
        bucket_id = 'site-images'
        AND SPLIT_PART(name, '/', 1) = 'articles'
        AND (SELECT private.is_editor() AS is_editor)
    );

CREATE POLICY "Article images can be deleted by admins and editors"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (
        bucket_id = 'site-images'
        AND SPLIT_PART(name, '/', 1) = 'articles'
        AND (SELECT private.is_editor() AS is_editor)
    );

COMMIT;
