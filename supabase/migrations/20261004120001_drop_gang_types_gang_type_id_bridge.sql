-- Drop the temporary gang_type_id(gang_types) bridge added by
-- 20261004120000_rename_gang_types_gang_type_id_to_id.sql.
--
-- DEPLOY ORDER: apply this only once the app build that reads gang_types.id is
-- live. Until then the previous build still selects and filters
-- gang_types.gang_type_id, and this function is what keeps those queries
-- working.

DROP FUNCTION IF EXISTS public.gang_type_id(public.gang_types);
