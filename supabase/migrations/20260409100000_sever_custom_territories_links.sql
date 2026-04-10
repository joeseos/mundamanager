-- Phase 1: Sever links between campaign data and custom_territories table.
-- Keeps all tables and columns in place; only nulls out references and drops FKs.

-- 1. Backfill territory names on campaign_territories from custom_territories
--    (safety net: all rows should already have territory_name populated)
UPDATE public.campaign_territories ct
SET territory_name = cust.territory_name
FROM public.custom_territories cust
WHERE ct.custom_territory_id = cust.id
  AND (ct.territory_name IS NULL OR ct.territory_name = '');

-- 2. Null out custom_territory_id on campaign_territories
UPDATE public.campaign_territories
SET custom_territory_id = NULL
WHERE custom_territory_id IS NOT NULL;

-- 3. Null out custom_territory_id on campaign_battles
UPDATE public.campaign_battles
SET custom_territory_id = NULL
WHERE custom_territory_id IS NOT NULL;

-- 4. Delete territory share rows from custom_shared
DELETE FROM public.custom_shared
WHERE custom_territory_id IS NOT NULL;

-- 5. Drop FK campaign_territories -> custom_territories (removes ON DELETE CASCADE risk)
ALTER TABLE public.campaign_territories
  DROP CONSTRAINT IF EXISTS campaign_territories_custom_territory_id_fkey;

-- 6. Drop FK campaign_battles -> custom_territories
ALTER TABLE public.campaign_battles
  DROP CONSTRAINT IF EXISTS campaign_battles_custom_territory_id_fkey;

-- 7. Drop FK custom_shared -> custom_territories
ALTER TABLE public.custom_shared
  DROP CONSTRAINT IF EXISTS custom_shared_custom_territory_id_fkey;
