-- Storage policies for admin-managed campaign portrait images.
--
-- The Campaign Management admin uploads catalogue portraits from the browser
-- directly to the public `campaign-type-images` bucket under admin/<file>.webp.
-- Public object URLs already work because the bucket is public. Listing a
-- folder still needs a SELECT policy, so admins can list `admin/` when
-- choosing a free path. Insert, update, delete, and that list are limited to
-- objects whose first path segment is `admin`, so catalogue files outside
-- that folder cannot be replaced or removed through these policies.
--
-- Safe to run multiple times: drops existing policies first.

BEGIN;

INSERT INTO storage.buckets (id, name, public)
VALUES ('campaign-type-images', 'campaign-type-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Campaign type images can be listed by admins" ON storage.objects;
DROP POLICY IF EXISTS "Campaign type images can be uploaded by admins" ON storage.objects;
DROP POLICY IF EXISTS "Campaign type images can be updated by admins" ON storage.objects;
DROP POLICY IF EXISTS "Campaign type images can be deleted by admins" ON storage.objects;

CREATE POLICY "Campaign type images can be listed by admins"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'campaign-type-images'
        AND SPLIT_PART(name, '/', 1) = 'admin'
        AND (SELECT private.is_admin() AS is_admin)
    );

CREATE POLICY "Campaign type images can be uploaded by admins"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'campaign-type-images'
        AND SPLIT_PART(name, '/', 1) = 'admin'
        AND (SELECT private.is_admin() AS is_admin)
    );

CREATE POLICY "Campaign type images can be updated by admins"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (
        bucket_id = 'campaign-type-images'
        AND SPLIT_PART(name, '/', 1) = 'admin'
        AND (SELECT private.is_admin() AS is_admin)
    )
    WITH CHECK (
        bucket_id = 'campaign-type-images'
        AND SPLIT_PART(name, '/', 1) = 'admin'
        AND (SELECT private.is_admin() AS is_admin)
    );

CREATE POLICY "Campaign type images can be deleted by admins"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (
        bucket_id = 'campaign-type-images'
        AND SPLIT_PART(name, '/', 1) = 'admin'
        AND (SELECT private.is_admin() AS is_admin)
    );

COMMIT;
