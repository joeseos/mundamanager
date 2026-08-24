-- Trade Points is an N26-only gang resource, stored on gangs like reputation.
-- The column exists for all gangs but is only surfaced/edited for gangs whose
-- gang type uses the Necromunda (2026) edition. Existing rows default to 0.
ALTER TABLE public.gangs
  ADD COLUMN IF NOT EXISTS trade_points numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.gangs.trade_points IS
  'N26 Trade Points resource. Only surfaced/edited for gangs whose gang type uses edition n26.';
