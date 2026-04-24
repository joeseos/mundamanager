-- =============================================================================
-- Migration: Add custom_gang_types table and related columns
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Create custom_gang_types table
-- Mirrors gang_types, follows the custom_X pattern (custom_fighter_types, etc.)
-- -----------------------------------------------------------------------------

CREATE TABLE public.custom_gang_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  gang_type text NOT NULL,
  alignment public.alignment,
  trading_post_type_id uuid REFERENCES public.trading_post_types(id),
  default_image_urls jsonb
);

CREATE INDEX idx_custom_gang_types_user_id ON public.custom_gang_types(user_id);

-- -----------------------------------------------------------------------------
-- 2. RLS policies (same pattern as custom_fighter_types)
-- -----------------------------------------------------------------------------

ALTER TABLE public.custom_gang_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to view custom gang types"
  ON public.custom_gang_types FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to create custom gang types"
  ON public.custom_gang_types FOR INSERT TO authenticated
  WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) OR ( SELECT private.is_admin() AS is_admin)));

CREATE POLICY "Only custom gang type owner or admin can update"
  ON public.custom_gang_types FOR UPDATE TO authenticated
  USING (((( SELECT auth.uid() AS uid) = user_id) OR ( SELECT private.is_admin() AS is_admin)))
  WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) OR ( SELECT private.is_admin() AS is_admin)));

CREATE POLICY "Only custom gang type owner or admin can delete"
  ON public.custom_gang_types FOR DELETE TO authenticated
  USING (((( SELECT auth.uid() AS uid) = user_id) OR ( SELECT private.is_admin() AS is_admin)));

-- -----------------------------------------------------------------------------
-- 3. Add custom_gang_type_id to consuming tables
-- -----------------------------------------------------------------------------

-- gangs: core relationship (CASCADE matches gangs.gang_type_id FK behavior,
-- and is required because SET NULL would violate chk_gang_type_exclusive)
ALTER TABLE public.gangs
  ADD COLUMN custom_gang_type_id uuid REFERENCES public.custom_gang_types(id) ON DELETE CASCADE;

CREATE INDEX idx_gangs_custom_gang_type_id ON public.gangs(custom_gang_type_id);

-- custom_fighter_types: scope custom fighters to a custom gang type
ALTER TABLE public.custom_fighter_types
  ADD COLUMN custom_gang_type_id uuid REFERENCES public.custom_gang_types(id) ON DELETE SET NULL;

-- custom_shared: share custom gang types into campaigns
ALTER TABLE public.custom_shared
  ADD COLUMN custom_gang_type_id uuid REFERENCES public.custom_gang_types(id) ON DELETE CASCADE;

CREATE INDEX idx_custom_shared_custom_gang_type_id ON public.custom_shared(custom_gang_type_id);

-- -----------------------------------------------------------------------------
-- 4. Exclusive arc constraint on gangs
-- A gang must have exactly one of gang_type_id or custom_gang_type_id set.
-- Pre-check confirmed 0 rows with NULL gang_type_id.
-- -----------------------------------------------------------------------------

ALTER TABLE public.gangs
  ADD CONSTRAINT chk_gang_type_exclusive
  CHECK (num_nonnulls(gang_type_id, custom_gang_type_id) = 1);
