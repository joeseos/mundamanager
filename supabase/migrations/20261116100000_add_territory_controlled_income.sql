-- Income a territory gives a gang of one gang type instead of its credits, like
-- Toll Road's "Orlock Controlled: the Income Boon is increased to 30 credits".
-- An alternate list counts as its house through gang_types.parent_gang_type_id.
-- Copied from the catalog territory when it is added to a campaign, like credits.
ALTER TABLE public.territories
  ADD COLUMN IF NOT EXISTS controlled_gang_type_id uuid REFERENCES public.gang_types(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS controlled_credits numeric;

ALTER TABLE public.campaign_territories
  ADD COLUMN IF NOT EXISTS controlled_gang_type_id uuid REFERENCES public.gang_types(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS controlled_credits numeric;

UPDATE public.territories t
SET controlled_gang_type_id = gt.id,
    controlled_credits = 30
FROM public.editions e, public.gang_types gt
WHERE t.territory_name = 'Toll Road'
  AND t.edition_id = e.id
  AND e.slug = 'n26'
  AND gt.edition_id = e.id
  AND gt.gang_type = 'House Orlock';

UPDATE public.campaign_territories ct
SET controlled_gang_type_id = t.controlled_gang_type_id,
    controlled_credits = t.controlled_credits
FROM public.territories t
WHERE t.id = ct.territory_id
  AND t.controlled_gang_type_id IS NOT NULL
  AND ct.controlled_gang_type_id IS NULL;
