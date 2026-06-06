-- Drop legacy resource columns from gangs table.
-- These were superseded by campaign_gang_resources (with definitions in
-- campaign_type_resources and campaign_resources). All code references removed.
ALTER TABLE public.gangs
  DROP COLUMN IF EXISTS meat,
  DROP COLUMN IF EXISTS scavenging_rolls,
  DROP COLUMN IF EXISTS exploration_points,
  DROP COLUMN IF EXISTS power,
  DROP COLUMN IF EXISTS sustenance,
  DROP COLUMN IF EXISTS salvage;

-- Drop legacy resource flags from campaigns table.
ALTER TABLE public.campaigns
  DROP COLUMN IF EXISTS has_meat,
  DROP COLUMN IF EXISTS has_exploration_points,
  DROP COLUMN IF EXISTS has_scavenging_rolls,
  DROP COLUMN IF EXISTS has_power,
  DROP COLUMN IF EXISTS has_sustenance,
  DROP COLUMN IF EXISTS has_salvage;

-- Drop legacy resource flags from campaign_types table.
ALTER TABLE public.campaign_types
  DROP COLUMN IF EXISTS has_meat,
  DROP COLUMN IF EXISTS has_exploration_points,
  DROP COLUMN IF EXISTS has_scavenging_rolls,
  DROP COLUMN IF EXISTS has_power,
  DROP COLUMN IF EXISTS has_sustenance,
  DROP COLUMN IF EXISTS has_salvage;
