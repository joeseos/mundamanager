-- Storage policies for admin-managed user guide images.
--
-- The User Guides admin editor uploads images from the browser directly to
-- the public `site-images` bucket under:
--   user-guide/n23/...   (N23 guide, drafts under user-guide/n23/_draft/)
--   user-guide/n26/...   (N26 guide, drafts under user-guide/n26/_draft/)
--
-- This mirrors the Campaign Pack flow (users-images/campaigns/<id>/pack) but
-- restricted to system admins. Reads are public so the editor can list the
-- folder to clean up orphaned files; the bucket itself is already public.
--
-- Safe to run multiple times: drops existing policies first.

BEGIN;

-- The bucket exists in production (created via the dashboard). Ensure it is
-- present for fresh/local environments too.
INSERT INTO storage.buckets (id, name, public)
VALUES ('site-images', 'site-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "User guide images are viewable by everyone" ON storage.objects;
DROP POLICY IF EXISTS "User guide images can be uploaded by admins" ON storage.objects;
DROP POLICY IF EXISTS "User guide images can be updated by admins" ON storage.objects;
DROP POLICY IF EXISTS "User guide images can be deleted by admins" ON storage.objects;

CREATE POLICY "User guide images are viewable by everyone"
    ON storage.objects FOR SELECT
    TO PUBLIC
    USING (
        bucket_id = 'site-images'
        AND SPLIT_PART(name, '/', 1) = 'user-guide'
    );

CREATE POLICY "User guide images can be uploaded by admins"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'site-images'
        AND SPLIT_PART(name, '/', 1) = 'user-guide'
        AND (SELECT private.is_admin() AS is_admin)
    );

CREATE POLICY "User guide images can be updated by admins"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (
        bucket_id = 'site-images'
        AND SPLIT_PART(name, '/', 1) = 'user-guide'
        AND (SELECT private.is_admin() AS is_admin)
    )
    WITH CHECK (
        bucket_id = 'site-images'
        AND SPLIT_PART(name, '/', 1) = 'user-guide'
        AND (SELECT private.is_admin() AS is_admin)
    );

CREATE POLICY "User guide images can be deleted by admins"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (
        bucket_id = 'site-images'
        AND SPLIT_PART(name, '/', 1) = 'user-guide'
        AND (SELECT private.is_admin() AS is_admin)
    );

COMMIT;
