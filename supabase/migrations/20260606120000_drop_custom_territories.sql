DROP INDEX IF EXISTS public.campaign_territories_custom_territory_id_idx;

ALTER TABLE public.campaign_territories DROP COLUMN IF EXISTS custom_territory_id;
ALTER TABLE public.campaign_battles    DROP COLUMN IF EXISTS custom_territory_id;
ALTER TABLE public.custom_shared       DROP COLUMN IF EXISTS custom_territory_id;

DROP TABLE IF EXISTS public.custom_territories;
