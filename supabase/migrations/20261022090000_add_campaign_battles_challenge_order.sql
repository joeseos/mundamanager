-- Order the gangs of a challenge round issue their challenges in, set by the
-- arbitrator when the round is opened. Numbered from 1 within the round; null
-- on battle logs outside a round and on rounds opened before this column.
ALTER TABLE public.campaign_battles
  ADD COLUMN IF NOT EXISTS challenge_order integer;
