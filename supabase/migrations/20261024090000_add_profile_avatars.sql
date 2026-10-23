-- User avatars: uploaded on the account page, shown beside forum posts.
--
-- Images go to users-images/avatars/<user id>/, cropped and compressed by the
-- same image editor as fighter portraits. "Anyone can view users-images"
-- already makes them public; the policies below let each user write only their
-- own folder.
--
-- Users get no UPDATE grant on avatar_url: updateAvatarAction checks that the
-- URL is in the user's own avatar folder and saves it with the service role, so
-- forum readers never load an avatar from another site.

BEGIN;

ALTER TABLE public.profiles ADD COLUMN avatar_url text;

DROP POLICY IF EXISTS "Avatars can be uploaded by their owner" ON storage.objects;
DROP POLICY IF EXISTS "Avatars can be updated by their owner" ON storage.objects;
DROP POLICY IF EXISTS "Avatars can be deleted by their owner" ON storage.objects;

CREATE POLICY "Avatars can be uploaded by their owner"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'users-images'
        AND SPLIT_PART(name, '/', 1) = 'avatars'
        AND SPLIT_PART(name, '/', 2) = (SELECT auth.uid())::text
    );

CREATE POLICY "Avatars can be updated by their owner"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (
        bucket_id = 'users-images'
        AND SPLIT_PART(name, '/', 1) = 'avatars'
        AND SPLIT_PART(name, '/', 2) = (SELECT auth.uid())::text
    )
    WITH CHECK (
        bucket_id = 'users-images'
        AND SPLIT_PART(name, '/', 1) = 'avatars'
        AND SPLIT_PART(name, '/', 2) = (SELECT auth.uid())::text
    );

CREATE POLICY "Avatars can be deleted by their owner"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (
        bucket_id = 'users-images'
        AND SPLIT_PART(name, '/', 1) = 'avatars'
        AND SPLIT_PART(name, '/', 2) = (SELECT auth.uid())::text
    );

COMMIT;
