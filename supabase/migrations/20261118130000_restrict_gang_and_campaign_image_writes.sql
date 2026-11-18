-- Gang, fighter and campaign images in users-images could be uploaded,
-- replaced and deleted by any signed-in user: the old policies only checked
-- the shape of the path. Now only those who can edit the gang (its owner, the
-- Arbitrators of its campaigns, admins) write under gangs/<gang id>/, and only
-- the campaign's Owner and Arbitrators (and admins) write its image and
-- Campaign Pack images under campaigns/<campaign id>/.
--
-- The paths are unchanged: gangs/<id>/<file>, gangs/<id>/fighters/<file>,
-- campaigns/<id>/<file>, campaigns/<id>/pack/<file> and
-- campaigns/<id>/pack/_draft/<file>. Campaign maps, avatars and forum images
-- keep their own policies. Reads stay public through "Anyone can view
-- users-images". The helper is also in supabase/functions.
--
-- Safe to run more than once.

BEGIN;

-- Whether the current user may write this users-images object: a gang file
-- if they can edit the gang (owner, admin or campaign Arbitrator, the same
-- rule as the gangs UPDATE policy), a campaign file if they are its Owner or
-- an Arbitrator, or an admin. The CASE checks the path, its id included,
-- before casting the id, so any other path is refused, never an error.
CREATE OR REPLACE FUNCTION private.can_write_users_image(object_name text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, private
STABLE
AS $$
  SELECT CASE
    WHEN folders[2] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN false
    WHEN folders[1] = 'gangs'
      AND (cardinality(folders) = 2 OR (cardinality(folders) = 3 AND folders[3] = 'fighters'))
    THEN private.is_admin()
      OR EXISTS (SELECT 1 FROM gangs g WHERE g.id = folders[2]::uuid AND g.user_id = (SELECT auth.uid()))
      OR private.is_gang_arb(folders[2]::uuid)
    WHEN folders[1] = 'campaigns'
      AND (cardinality(folders) = 2
        OR (folders[3] = 'pack' AND (cardinality(folders) = 3 OR (cardinality(folders) = 4 AND folders[4] = '_draft'))))
    THEN private.is_admin() OR private.is_arb(folders[2]::uuid)
    ELSE false
  END
  FROM (SELECT storage.foldername(object_name) AS folders) path;
$$;

DROP POLICY IF EXISTS "Users can upload their own images to users-images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own images in users-images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own images from users-images" ON storage.objects;
DROP POLICY IF EXISTS "Gang and campaign images can be uploaded by their editors" ON storage.objects;
DROP POLICY IF EXISTS "Gang and campaign images can be updated by their editors" ON storage.objects;
DROP POLICY IF EXISTS "Gang and campaign images can be deleted by their editors" ON storage.objects;

CREATE POLICY "Gang and campaign images can be uploaded by their editors"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'users-images' AND private.can_write_users_image(name));

CREATE POLICY "Gang and campaign images can be updated by their editors"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (bucket_id = 'users-images' AND private.can_write_users_image(name))
    WITH CHECK (bucket_id = 'users-images' AND private.can_write_users_image(name));

CREATE POLICY "Gang and campaign images can be deleted by their editors"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (bucket_id = 'users-images' AND private.can_write_users_image(name));

COMMIT;
