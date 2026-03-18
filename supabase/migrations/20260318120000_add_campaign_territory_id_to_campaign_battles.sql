ALTER TABLE public.campaign_battles
    ADD COLUMN IF NOT EXISTS campaign_territory_id uuid;

ALTER TABLE public.campaign_battles
    ADD CONSTRAINT campaign_battles_campaign_territory_id_fkey
    FOREIGN KEY (campaign_territory_id) REFERENCES public.campaign_territories(id) ON DELETE SET NULL;
