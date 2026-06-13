-- =============================================================================
-- Migration: Add custom collections (collections of custom items)
--
-- A "collection" is an arbitrator's bundle of custom items (gang types, fighter types,
-- equipment, skills, trading posts). It supports two actions:
--   1. Share (apply) a collection to a campaign  -> expands into custom_shared rows
--      (handled in app code: app/actions/customise/custom-share.ts).
--   2. Copy a collection into another user's account -> deep-clone via the
--      copy_custom_collection() RPC, maintained separately in
--      supabase/functions/copy_custom_collection.sql (applied via the Supabase dashboard).
--
-- Membership is stored as a jsonb `items` array on custom_collections, mirroring the
-- existing campaigns.custom_trading_posts jsonb convention. No join table.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. custom_collections — top-level table, follows the custom_X pattern
-- -----------------------------------------------------------------------------

CREATE TABLE public.custom_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  -- Array of { "type": "equipment|fighter_type|gang_type|skill|trading_post", "id": "<uuid>" }.
  -- No FK enforcement on the inner ids (graceful skip of dangling entries on read/copy),
  -- matching how campaigns.custom_trading_posts already behaves.
  items jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX idx_custom_collections_user_id ON public.custom_collections(user_id);

ALTER TABLE public.custom_collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to view custom collections"
  ON public.custom_collections FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to create custom collections"
  ON public.custom_collections FOR INSERT TO authenticated
  WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) OR ( SELECT private.is_admin() AS is_admin)));

CREATE POLICY "Only custom collection owner or admin can update"
  ON public.custom_collections FOR UPDATE TO authenticated
  USING (((( SELECT auth.uid() AS uid) = user_id) OR ( SELECT private.is_admin() AS is_admin)))
  WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) OR ( SELECT private.is_admin() AS is_admin)));

CREATE POLICY "Only custom collection owner or admin can delete"
  ON public.custom_collections FOR DELETE TO authenticated
  USING (((( SELECT auth.uid() AS uid) = user_id) OR ( SELECT private.is_admin() AS is_admin)));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_collections TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. custom_shared.custom_collection_id — provenance tag for campaign bulk-share
--    Collection-originated rows still carry exactly one item id PLUS this tag.
--    ON DELETE SET NULL so deleting a collection does not revoke active shares.
-- -----------------------------------------------------------------------------

ALTER TABLE public.custom_shared
  ADD COLUMN custom_collection_id uuid REFERENCES public.custom_collections(id) ON DELETE SET NULL;

CREATE INDEX idx_custom_shared_custom_collection_id ON public.custom_shared(custom_collection_id);

-- -----------------------------------------------------------------------------
-- 3. copy_custom_collection(p_collection_id) RPC
--    Defined in supabase/functions/copy_custom_collection.sql and applied via the
--    Supabase dashboard (functions are not synced through migrations).
-- -----------------------------------------------------------------------------
