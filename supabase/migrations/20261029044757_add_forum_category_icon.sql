-- Hosted icon shown beside a forum category. Null hides the icon.
-- URLs are set per category outside the app, so this migration does not seed them.

BEGIN;

ALTER TABLE public.forum_categories
  ADD COLUMN icon_url text;

COMMENT ON COLUMN public.forum_categories.icon_url IS
  'Public URL of the icon shown beside this category. Null hides the icon.';

COMMIT;
