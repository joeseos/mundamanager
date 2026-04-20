-- Add an index on campaign_map_objects.campaign_map_id.
--
-- Every read of campaign_map_objects (page load, editor open, RLS lookup
-- via the campaign_maps join) filters by campaign_map_id, but the table
-- only has its primary-key index on id. Without this index every such
-- query falls back to a sequential scan, which gets slower as more
-- campaigns add map objects.
--
-- Idempotent: safe to re-run.

CREATE INDEX IF NOT EXISTS campaign_map_objects_campaign_map_id_idx
    ON public.campaign_map_objects (campaign_map_id);
