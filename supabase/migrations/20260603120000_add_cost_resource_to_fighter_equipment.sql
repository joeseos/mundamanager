ALTER TABLE public.fighter_equipment
  ADD COLUMN cost_resource jsonb;

COMMENT ON COLUMN public.fighter_equipment.cost_resource
  IS 'Resource used to pay, e.g. {"name": "Exploration Points", "amount": 3}. Null = credits.';
