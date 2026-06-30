-- Add edition support for catalog root tables.
-- Instance tables (gangs, campaigns, fighters, fighter_injuries, etc.) derive
-- edition through their required parent catalog/type relationships.
-- Root edition columns start nullable until server actions and catalog reads are
-- updated to consistently write and consume edition_id.

CREATE TABLE IF NOT EXISTS public.editions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  released_at date,
  is_active boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone
);

ALTER TABLE public.editions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to view editions"
  ON public.editions
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Only admin can create editions entries"
  ON public.editions
  FOR INSERT
  TO authenticated
  WITH CHECK (( SELECT private.is_admin() AS is_admin));

CREATE POLICY "Only admin can update editions"
  ON public.editions
  FOR UPDATE
  TO authenticated
  USING (( SELECT private.is_admin() AS is_admin))
  WITH CHECK (( SELECT private.is_admin() AS is_admin));

CREATE POLICY "Only admin can delete editions"
  ON public.editions
  FOR DELETE
  TO authenticated
  USING (( SELECT private.is_admin() AS is_admin));

CREATE UNIQUE INDEX IF NOT EXISTS editions_single_active_idx
  ON public.editions (is_active)
  WHERE is_active;

INSERT INTO public.editions (name, is_active, sort_order)
SELECT 'Necromunda (2023)', true, 1
WHERE NOT EXISTS (
  SELECT 1
  FROM public.editions
  WHERE name = 'Necromunda (2023)'
);

DO $$
DECLARE
  t text;
  roots text[] := ARRAY[
    -- official catalog roots
    'gang_types',
    'gang_origins',
    'gang_variant_types',
    'gang_affiliation',
    'equipment',
    'skill_types',
    'fighter_effect_types',
    'fighter_classes',
    'territories',
    'scenarios',
    'vehicle_types',
    'alliances',
    'trading_post_types',
    'campaign_types',

    -- custom roots
    'custom_gang_types',
    'custom_equipment',
    'custom_fighter_types',
    'custom_skill_types',
    'custom_trading_posts',
    'custom_collections'
  ];
BEGIN
  FOREACH t IN ARRAY roots LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS edition_id uuid REFERENCES public.editions(id) ON DELETE SET NULL',
      t
    );

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (edition_id)',
      t || '_edition_id_idx',
      t
    );
  END LOOP;
END $$;
