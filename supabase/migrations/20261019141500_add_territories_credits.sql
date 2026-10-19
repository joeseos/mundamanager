-- Credits a territory gives. Null until a value is set; no backfill.
ALTER TABLE public.territories
  ADD COLUMN IF NOT EXISTS credits numeric;
