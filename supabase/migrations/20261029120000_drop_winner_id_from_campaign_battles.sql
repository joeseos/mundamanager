-- Winners and the territory claimer live in participants[].is_winner /
-- claimed_territory. Run after the backfill has copied every winner_id there
-- and the code that stops writing it is deployed.
ALTER TABLE public.campaign_battles
  DROP COLUMN winner_id;
