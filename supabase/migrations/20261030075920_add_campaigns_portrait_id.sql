-- Point a campaign at one row in campaign_portraits.
--
-- campaign_types.image_url stays. It is the fallback when a campaign has no
-- custom upload and no selected catalogue portrait.
--
-- Deleting a catalogue portrait clears the pointer. It does not delete the campaign.
-- The index is partial because campaigns with a custom upload, the type image, or
-- no selection keep a null campaign_portrait_id, and a foreign-key check only looks up
-- non-null values.

ALTER TABLE public.campaigns
    ADD COLUMN campaign_portrait_id uuid;

ALTER TABLE public.campaigns
    ADD CONSTRAINT campaigns_campaign_portrait_id_fkey
    FOREIGN KEY (campaign_portrait_id)
    REFERENCES public.campaign_portraits(id)
    ON DELETE SET NULL;

COMMENT ON COLUMN public.campaigns.campaign_portrait_id IS
    'Selected shared portrait from campaign_portraits. Null for a custom upload, the campaign type image, or no catalogue image.';

CREATE INDEX campaigns_campaign_portrait_id_idx
    ON public.campaigns (campaign_portrait_id)
    WHERE campaign_portrait_id IS NOT NULL;
