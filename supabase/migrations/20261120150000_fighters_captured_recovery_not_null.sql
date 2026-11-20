-- fighters.captured and fighters.recovery default to false but allowed NULL, unlike
-- the other status flags. No row holds NULL (checked 2026-11-20), so they are made
-- NOT NULL like killed, retired, enslaved and starved.
ALTER TABLE public.fighters
  ALTER COLUMN captured SET NOT NULL,
  ALTER COLUMN recovery SET NOT NULL;
