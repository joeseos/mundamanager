-- Bumps catalogue_version.version once per statement that changes an equipment catalogue
-- table. The Equipment modal's snapshot is cached under that number, so any change to the
-- rules it is built from must move it.
--
-- The bump is an UPDATE in the writer's own transaction, so the new number becomes visible
-- at the same moment as the change itself, never before it. Every table below is written
-- only by admins, so the single row is never contended by players.
--
-- SECURITY DEFINER: catalogue_version has no write policy, and the admins whose writes
-- fire this cannot update it themselves.
--
-- A table the snapshot starts reading needs adding to the list below.
--
-- DEPLOY ORDER: apply migration 20261002075353_add_equipment_catalogue.sql (which creates
-- catalogue_version) BEFORE this file is deployed. The guard below stops the deploy
-- otherwise, rather than install triggers that would fail every catalogue write.

DO $$
BEGIN
  IF to_regclass('public.catalogue_version') IS NULL THEN
    RAISE EXCEPTION 'Apply migration 20261002075353_add_equipment_catalogue.sql first';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.bump_catalogue_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.catalogue_version
  SET version = version + 1,
      updated_at = now()
  WHERE id;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.bump_catalogue_version() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.bump_catalogue_version() FROM anon, authenticated;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'count_limits',
    'equipment',
    'equipment_availability',
    'equipment_discounts',
    'exotic_beasts',
    'fighter_effect_type_modifiers',
    'fighter_effect_types',
    'fighter_gang_legacy',
    'fighter_type_equipment',
    'fighter_types',
    'gang_affiliation',
    'gang_types',
    'trading_post_equipment',
    'trading_post_types',
    'vehicle_types',
    'weapon_profiles'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS bump_catalogue_version ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER bump_catalogue_version
         AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.%I
         FOR EACH STATEMENT
         EXECUTE FUNCTION public.bump_catalogue_version()',
      t
    );
  END LOOP;
END $$;
