-- Trade Points cost on catalog equipment and per-scope discount overrides.
-- Stored like credits cost / adjusted_cost, but as an N26 Trade Points price.
-- Existing rows default to 0; UI/purchase paths decide when to surface or charge it.
ALTER TABLE public.equipment
  ADD COLUMN IF NOT EXISTS trade_points numeric NOT NULL DEFAULT 0;

ALTER TABLE public.custom_equipment
  ADD COLUMN IF NOT EXISTS trade_points numeric NOT NULL DEFAULT 0;

ALTER TABLE public.equipment_discounts
  ADD COLUMN IF NOT EXISTS trade_points numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.equipment.trade_points IS
  'N26 Trade Points cost for this equipment. Surfaced/charged only for N26 gangs.';

COMMENT ON COLUMN public.custom_equipment.trade_points IS
  'N26 Trade Points cost for this custom equipment. Surfaced/charged only for N26 gangs.';

COMMENT ON COLUMN public.equipment_discounts.trade_points IS
  'Per-scope N26 Trade Points cost override (alongside adjusted_cost). Surfaced/charged only for N26 gangs.';
