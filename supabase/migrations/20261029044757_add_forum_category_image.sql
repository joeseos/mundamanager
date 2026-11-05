-- Hosted image shown beside a forum category. Null hides the image.
-- URLs are set per category outside the app, so this migration does not seed them.
-- https only: the value is rendered in an img src, and only admins can write it.

BEGIN;

ALTER TABLE public.forum_categories
  ADD COLUMN image_url text;

ALTER TABLE public.forum_categories
  ADD CONSTRAINT forum_categories_image_url_https
  CHECK (image_url IS NULL OR image_url ~ '^https://[^[:space:]]+$');

COMMENT ON COLUMN public.forum_categories.image_url IS
  'Public https URL of the image shown beside this category. Null hides the image.';

COMMIT;
