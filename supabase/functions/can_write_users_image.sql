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
    WHEN folders[2] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN false
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
