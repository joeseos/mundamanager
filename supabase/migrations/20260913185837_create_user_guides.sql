-- User guides: one admin-editable rich-text (HTML) document per edition.
--
-- The /user-guide page previously shipped its content as hardcoded JSX
-- (components/user-guide/user-guide-n23.tsx / user-guide-n26.tsx). Moving it
-- into the database lets admins edit the guide from the Admin Dashboard using
-- the same rich text editor as Campaign Packs.
--
-- Design notes:
-- - One row per edition, keyed by editions.id (app logic keys off the slug).
-- - The whole guide is a single HTML value; the table of contents is derived
--   from the headings at render time, so nothing is split into sections.
-- - Reads are public (the page is anonymous-accessible); writes are admin-only.
-- - updated_at is set by the application write path (no shared trigger here).
-- - Content is authored via the Admin Dashboard (no seed rows); the first save
--   per edition upserts the row.

BEGIN;

CREATE TABLE public.user_guides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_id uuid NOT NULL UNIQUE REFERENCES public.editions(id) ON DELETE CASCADE,
  content text NOT NULL DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.user_guides IS
  'Admin-editable user guide, one HTML document per edition. Rendered on /user-guide.';
COMMENT ON COLUMN public.user_guides.content IS
  'Full guide as rich-text HTML (TipTap output). Headings drive the generated table of contents.';

ALTER TABLE public.user_guides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User guides are viewable by everyone"
  ON public.user_guides FOR SELECT
  USING (true);

CREATE POLICY "Only admins can create user guides"
  ON public.user_guides FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT private.is_admin() AS is_admin));

CREATE POLICY "Only admins can update user guides"
  ON public.user_guides FOR UPDATE
  TO authenticated
  USING ((SELECT private.is_admin() AS is_admin))
  WITH CHECK ((SELECT private.is_admin() AS is_admin));

GRANT SELECT ON public.user_guides TO anon, authenticated;
GRANT INSERT, UPDATE ON public.user_guides TO authenticated;

COMMIT;
