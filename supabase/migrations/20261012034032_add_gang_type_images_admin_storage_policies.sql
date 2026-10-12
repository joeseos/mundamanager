-- Storage policies for admin-managed gang portrait images.
--
-- The Manage Gangs admin uploads catalogue portraits from the browser directly
-- to the public `gang-type-images` bucket under admin/<file>.webp.
-- Public object URLs already work because the bucket is public. Listing a
-- folder still needs a SELECT policy, so admins can list `admin/` when
-- choosing a free path. These policies also let an authenticated admin
-- insert, replace, and delete objects in that bucket.
--
-- Safe to run multiple times: drops existing policies first.

BEGIN;

-- The bucket exists in production (created via the dashboard). Ensure it is
-- present for fresh/local environments too.
INSERT INTO storage.buckets (id, name, public)
VALUES ('gang-type-images', 'gang-type-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Gang type images can be listed by admins" ON storage.objects;
DROP POLICY IF EXISTS "Gang type images can be uploaded by admins" ON storage.objects;
DROP POLICY IF EXISTS "Gang type images can be updated by admins" ON storage.objects;
DROP POLICY IF EXISTS "Gang type images can be deleted by admins" ON storage.objects;

CREATE POLICY "Gang type images can be listed by admins"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'gang-type-images'
        AND (SELECT private.is_admin() AS is_admin)
    );

CREATE POLICY "Gang type images can be uploaded by admins"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'gang-type-images'
        AND (SELECT private.is_admin() AS is_admin)
    );

CREATE POLICY "Gang type images can be updated by admins"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (
        bucket_id = 'gang-type-images'
        AND (SELECT private.is_admin() AS is_admin)
    )
    WITH CHECK (
        bucket_id = 'gang-type-images'
        AND (SELECT private.is_admin() AS is_admin)
    );

CREATE POLICY "Gang type images can be deleted by admins"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (
        bucket_id = 'gang-type-images'
        AND (SELECT private.is_admin() AS is_admin)
    );

COMMIT;
