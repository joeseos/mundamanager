-- fighters.captured and fighters.recovery default to false but allowed NULL, unlike
-- the other status flags. No row holds NULL (checked 2026-11-20), so they are made
-- NOT NULL like killed, retired, enslaved and starved.
--
-- fighters is ~1M rows, and a plain SET NOT NULL scans it under an exclusive lock
-- that blocks every read and write. A validated CHECK lets SET NOT NULL skip that
-- scan: VALIDATE runs under a lock that lets reads and writes carry on.

ALTER TABLE public.fighters
  ADD CONSTRAINT fighters_captured_recovery_not_null
  CHECK (captured IS NOT NULL AND recovery IS NOT NULL) NOT VALID;

ALTER TABLE public.fighters VALIDATE CONSTRAINT fighters_captured_recovery_not_null;

ALTER TABLE public.fighters
  ALTER COLUMN captured SET NOT NULL,
  ALTER COLUMN recovery SET NOT NULL;

ALTER TABLE public.fighters DROP CONSTRAINT fighters_captured_recovery_not_null;
