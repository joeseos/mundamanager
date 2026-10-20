-- Credits a campaign territory gives. Copied from the catalog territory when it is
-- added, like territory_name and playing_card, and editable per campaign so custom
-- territories can give credits too. Backfilled from the catalog.
ALTER TABLE public.campaign_territories
  ADD COLUMN IF NOT EXISTS credits numeric;

UPDATE public.campaign_territories ct
SET credits = t.credits
FROM public.territories t
WHERE t.id = ct.territory_id
  AND t.credits IS NOT NULL
  AND ct.credits IS NULL;
