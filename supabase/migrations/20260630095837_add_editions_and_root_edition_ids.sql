-- Add edition support for catalog root tables.
-- Instance tables (gangs, campaigns, fighters, fighter_injuries, etc.) derive
-- edition through their required parent catalog/type relationships.
-- Root edition columns start nullable until server actions and catalog reads are
-- updated to consistently write and consume edition_id.

CREATE TABLE IF NOT EXISTS public.editions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  released_at date,
  is_current boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone,
  CONSTRAINT editions_slug_format_chk CHECK (slug ~ '^[a-z][a-z0-9_]*$')
);

COMMENT ON COLUMN public.editions.slug IS
  'Stable identifier for an edition so application code can reference it without hardcoding UUIDs.';

COMMENT ON COLUMN public.editions.is_current IS
  'Picks the default edition for pages that have no gang or campaign context to derive an edition from. It does NOT mark other editions unsupported, and catalog rows must never be filtered on it.';

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

CREATE UNIQUE INDEX IF NOT EXISTS editions_single_current_idx
  ON public.editions (is_current)
  WHERE is_current;

INSERT INTO public.editions (name, slug, is_current)
SELECT 'Necromunda (2023)', 'n23', true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.editions
  WHERE slug = 'n23'
);

DO $$
DECLARE
  t text;
  current_edition_id uuid;
  roots text[] := ARRAY[
    -- official catalog roots
    'gang_types',
    'gang_origins',
    'gang_variant_types',
    'gang_affiliation',
    'equipment',
    'skill_types',
    -- 'skills' is deliberately excluded: it derives its edition through
    -- skills.skill_type_id, so a column here could disagree with its parent.
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
  SELECT id
  INTO STRICT current_edition_id
  FROM public.editions
  WHERE slug = 'n23';

  FOREACH t IN ARRAY roots LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS edition_id uuid REFERENCES public.editions(id) ON DELETE RESTRICT',
      t
    );

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (edition_id)',
      t || '_edition_id_idx',
      t
    );

    -- Backfill existing catalog rows onto the current edition. edition_id stays
    -- nullable here; NOT NULL follows once every write path passes it explicitly.
    EXECUTE format(
      'UPDATE public.%I SET edition_id = $1 WHERE edition_id IS NULL',
      t
    ) USING current_edition_id;
  END LOOP;
END $$;

-- fighter_classes needs a stable, edition-independent key so per-edition rows of
-- the same class can be matched to each other without relying on display names.
ALTER TABLE public.fighter_classes
  ADD COLUMN IF NOT EXISTS code text;

UPDATE public.fighter_classes
SET code = CASE
    WHEN class_name = '*' THEN 'any'
    ELSE trim(BOTH '_' FROM lower(regexp_replace(class_name, '[^a-zA-Z0-9]+', '_', 'g')))
  END
WHERE code IS NULL;

ALTER TABLE public.fighter_classes
  ALTER COLUMN code SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fighter_classes_code_format_chk'
      AND conrelid = 'public.fighter_classes'::regclass
  ) THEN
    ALTER TABLE public.fighter_classes
      ADD CONSTRAINT fighter_classes_code_format_chk
      CHECK (code ~ '^[a-z][a-z0-9_]*$');
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS fighter_classes_edition_code_idx
  ON public.fighter_classes (edition_id, code)
  WHERE edition_id IS NOT NULL;

-- Naming collision worth documenting: the rulebook term "Subtypes" refers to
-- what this schema calls fighter_classes, not to fighter_sub_types.
COMMENT ON TABLE public.fighter_classes IS
  'Fighter roles (Leader, Champion, Ganger, ...). The new edition rulebook calls these "Subtypes"; the display label is resolved per edition in app code. NOT related to fighter_sub_types. One row per class per edition, joined across editions on code.';

COMMENT ON TABLE public.fighter_sub_types IS
  'Variants within a single fighter type. Unrelated to the rulebook term "Subtypes", which maps to fighter_classes.';

COMMENT ON COLUMN public.fighter_classes.code IS
  'Stable slug shared across editions; match on this, never on class_name or id. Not user-editable.';
