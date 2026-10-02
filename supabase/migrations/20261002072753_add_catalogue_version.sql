-- A single counter that goes up whenever the equipment catalogue changes.
--
-- The Equipment modal will load the catalogue as a snapshot cached under this number
-- (docs/adr/0001-equipment-modal-data.md, phases 4 and 5), so every table the snapshot is
-- built from bumps it: bump_catalogue_version runs once per statement that writes one of
-- them. Nothing reads the number yet.
--
-- Apply this migration BEFORE supabase/functions/bump_catalogue_version.sql is deployed.
-- The function and trigger statements below match that file.

CREATE TABLE IF NOT EXISTS public.catalogue_version (
    id         boolean PRIMARY KEY DEFAULT true CHECK (id),
    version    bigint NOT NULL DEFAULT 1,
    updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.catalogue_version IS
  'One row. version goes up on every statement that changes an equipment catalogue table '
  '(see bump_catalogue_version). Read-only for everyone else.';

INSERT INTO public.catalogue_version (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.catalogue_version ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to view catalogue_version"
    ON public.catalogue_version
    FOR SELECT
    TO authenticated
    USING (true);

-- No write policies: only bump_catalogue_version (SECURITY DEFINER) changes the row.
REVOKE ALL ON public.catalogue_version FROM anon, authenticated;
GRANT SELECT ON public.catalogue_version TO authenticated, service_role;

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
