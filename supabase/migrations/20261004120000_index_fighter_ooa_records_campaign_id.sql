-- Index fighter_ooa_records.campaign_id.
--
-- The campaign Triumphs tab counts each gang's Out of Action records for one
-- campaign (getCampaignOoaCounts), filtering on campaign_id. Without an index
-- that is a full scan of a table growing by ~17k rows a month. The same column
-- is also walked by ON DELETE SET NULL when a campaign is deleted.
--
-- ~27% NULL (records made outside a campaign), which are never looked up by
-- campaign, so the index is partial.
CREATE INDEX IF NOT EXISTS fighter_ooa_records_campaign_id_idx
  ON public.fighter_ooa_records (campaign_id)
  WHERE campaign_id IS NOT NULL;
