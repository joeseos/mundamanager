-- =============================================================================
-- Migration: Add custom trading posts
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. custom_trading_posts — top-level table, follows custom_X pattern
-- -----------------------------------------------------------------------------

CREATE TABLE public.custom_trading_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  custom_trading_post_name text NOT NULL,
  description text
);

CREATE INDEX idx_custom_trading_posts_user_id ON public.custom_trading_posts(user_id);

ALTER TABLE public.custom_trading_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to view custom trading posts"
  ON public.custom_trading_posts FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to create custom trading posts"
  ON public.custom_trading_posts FOR INSERT TO authenticated
  WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) OR ( SELECT private.is_admin() AS is_admin)));

CREATE POLICY "Only custom trading post owner or admin can update"
  ON public.custom_trading_posts FOR UPDATE TO authenticated
  USING (((( SELECT auth.uid() AS uid) = user_id) OR ( SELECT private.is_admin() AS is_admin)))
  WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) OR ( SELECT private.is_admin() AS is_admin)));

CREATE POLICY "Only custom trading post owner or admin can delete"
  ON public.custom_trading_posts FOR DELETE TO authenticated
  USING (((( SELECT auth.uid() AS uid) = user_id) OR ( SELECT private.is_admin() AS is_admin)));

-- -----------------------------------------------------------------------------
-- 2. custom_trading_post_equipment — items in a custom trading post
--    user_id denormalized for consistent RLS (matches custom_weapon_profiles)
-- -----------------------------------------------------------------------------

CREATE TABLE public.custom_trading_post_equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  custom_trading_post_id uuid NOT NULL REFERENCES public.custom_trading_posts(id) ON DELETE CASCADE,
  equipment_id uuid REFERENCES public.equipment(id) ON DELETE CASCADE,
  custom_equipment_id uuid REFERENCES public.custom_equipment(id) ON DELETE CASCADE,
  cost_override numeric,
  cost_type_resource_id uuid REFERENCES public.campaign_type_resources(id) ON DELETE SET NULL,
  cost_campaign_resource_id uuid REFERENCES public.campaign_resources(id) ON DELETE SET NULL,
  cost_reputation boolean NOT NULL DEFAULT false,
  cost_resource_amount numeric,
  availability_override text,
  sort_order integer,
  CONSTRAINT chk_equipment_exclusive CHECK (num_nonnulls(equipment_id, custom_equipment_id) = 1),
  CONSTRAINT chk_cost_resource_exclusive CHECK (num_nonnulls(cost_type_resource_id, cost_campaign_resource_id, NULLIF(cost_reputation, false)) <= 1)
);

CREATE INDEX idx_ctp_equipment_trading_post_id ON public.custom_trading_post_equipment(custom_trading_post_id);
CREATE UNIQUE INDEX idx_ctp_equipment_unique_equipment
  ON public.custom_trading_post_equipment(custom_trading_post_id, equipment_id)
  WHERE equipment_id IS NOT NULL;
CREATE UNIQUE INDEX idx_ctp_equipment_unique_custom_equipment
  ON public.custom_trading_post_equipment(custom_trading_post_id, custom_equipment_id)
  WHERE custom_equipment_id IS NOT NULL;

ALTER TABLE public.custom_trading_post_equipment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to view custom trading post equipment"
  ON public.custom_trading_post_equipment FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to create custom trading post equipment"
  ON public.custom_trading_post_equipment FOR INSERT TO authenticated
  WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) OR ( SELECT private.is_admin() AS is_admin)));

CREATE POLICY "Only custom trading post equipment owner or admin can update"
  ON public.custom_trading_post_equipment FOR UPDATE TO authenticated
  USING (((( SELECT auth.uid() AS uid) = user_id) OR ( SELECT private.is_admin() AS is_admin)))
  WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) OR ( SELECT private.is_admin() AS is_admin)));

CREATE POLICY "Only custom trading post equipment owner or admin can delete"
  ON public.custom_trading_post_equipment FOR DELETE TO authenticated
  USING (((( SELECT auth.uid() AS uid) = user_id) OR ( SELECT private.is_admin() AS is_admin)));

-- -----------------------------------------------------------------------------
-- 3. custom_trading_post_availability — per-item access restrictions
--    No rows = available to everyone; rows = allowlist
-- -----------------------------------------------------------------------------

CREATE TABLE public.custom_trading_post_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  custom_trading_post_equipment_id uuid NOT NULL REFERENCES public.custom_trading_post_equipment(id) ON DELETE CASCADE,
  gang_type_id uuid,
  custom_gang_type_id uuid REFERENCES public.custom_gang_types(id) ON DELETE CASCADE,
  gang_origin_id uuid REFERENCES public.gang_origins(id) ON DELETE CASCADE,
  gang_variant_id uuid REFERENCES public.gang_variant_types(id) ON DELETE CASCADE,
  campaign_type_allegiance_id uuid REFERENCES public.campaign_type_allegiances(id) ON DELETE CASCADE,
  alignment public.alignment,
  availability text
);

CREATE INDEX idx_ctp_availability_equipment_id ON public.custom_trading_post_availability(custom_trading_post_equipment_id);

ALTER TABLE public.custom_trading_post_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to view custom trading post availability"
  ON public.custom_trading_post_availability FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to create custom trading post availability"
  ON public.custom_trading_post_availability FOR INSERT TO authenticated
  WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) OR ( SELECT private.is_admin() AS is_admin)));

CREATE POLICY "Only custom trading post availability owner or admin can update"
  ON public.custom_trading_post_availability FOR UPDATE TO authenticated
  USING (((( SELECT auth.uid() AS uid) = user_id) OR ( SELECT private.is_admin() AS is_admin)))
  WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) OR ( SELECT private.is_admin() AS is_admin)));

CREATE POLICY "Only custom trading post availability owner or admin can delete"
  ON public.custom_trading_post_availability FOR DELETE TO authenticated
  USING (((( SELECT auth.uid() AS uid) = user_id) OR ( SELECT private.is_admin() AS is_admin)));

-- -----------------------------------------------------------------------------
-- 4. custom_trading_post_pricing — per-item adjusted cost by gang/fighter context
--    No discount column (dead in equipment_discounts, not replicated)
-- -----------------------------------------------------------------------------

CREATE TABLE public.custom_trading_post_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  custom_trading_post_equipment_id uuid NOT NULL REFERENCES public.custom_trading_post_equipment(id) ON DELETE CASCADE,
  gang_type_id uuid,
  custom_gang_type_id uuid REFERENCES public.custom_gang_types(id) ON DELETE CASCADE,
  gang_origin_id uuid REFERENCES public.gang_origins(id) ON DELETE CASCADE,
  fighter_type_id uuid REFERENCES public.fighter_types(id) ON DELETE CASCADE,
  adjusted_cost numeric
);

CREATE INDEX idx_ctp_pricing_equipment_id ON public.custom_trading_post_pricing(custom_trading_post_equipment_id);

ALTER TABLE public.custom_trading_post_pricing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to view custom trading post pricing"
  ON public.custom_trading_post_pricing FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to create custom trading post pricing"
  ON public.custom_trading_post_pricing FOR INSERT TO authenticated
  WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) OR ( SELECT private.is_admin() AS is_admin)));

CREATE POLICY "Only custom trading post pricing owner or admin can update"
  ON public.custom_trading_post_pricing FOR UPDATE TO authenticated
  USING (((( SELECT auth.uid() AS uid) = user_id) OR ( SELECT private.is_admin() AS is_admin)))
  WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) OR ( SELECT private.is_admin() AS is_admin)));

CREATE POLICY "Only custom trading post pricing owner or admin can delete"
  ON public.custom_trading_post_pricing FOR DELETE TO authenticated
  USING (((( SELECT auth.uid() AS uid) = user_id) OR ( SELECT private.is_admin() AS is_admin)));

-- -----------------------------------------------------------------------------
-- 5. Column additions to existing tables
-- -----------------------------------------------------------------------------

-- custom_shared: share custom trading posts into campaigns
ALTER TABLE public.custom_shared
  ADD COLUMN custom_trading_post_id uuid REFERENCES public.custom_trading_posts(id) ON DELETE CASCADE;

CREATE INDEX idx_custom_shared_custom_trading_post_id ON public.custom_shared(custom_trading_post_id);

-- campaigns: array of activated custom trading post UUIDs (mirrors trading_posts column)
ALTER TABLE public.campaigns
  ADD COLUMN custom_trading_posts jsonb;
