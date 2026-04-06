ALTER TABLE public.campaign_territories
  ADD COLUMN IF NOT EXISTS description text;
