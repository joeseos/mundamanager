-- Optional campaign phases. The phase is free text so Custom campaigns and
-- house rules can name their own; a campaign type only suggests names, entered
-- by admins in Campaigns, Territories & Triumphs. Nothing is seeded.

BEGIN;

ALTER TABLE public.campaigns
  ADD COLUMN current_phase text;

ALTER TABLE public.campaigns
  ADD CONSTRAINT campaigns_current_cycle_positive
  CHECK (current_cycle IS NULL OR current_cycle >= 1);

ALTER TABLE public.campaigns
  ADD CONSTRAINT campaigns_current_phase_length
  CHECK (current_phase IS NULL OR char_length(current_phase) BETWEEN 1 AND 50);

COMMENT ON COLUMN public.campaigns.current_phase IS
  'Free-text name of the phase the campaign is in. Null when the campaign does not track phases.';

ALTER TABLE public.campaign_types
  ADD COLUMN phases json;

COMMENT ON COLUMN public.campaign_types.phases IS
  'Ordered phase names suggested to arbitrators of this campaign type. Null when the type has none.';

COMMIT;
