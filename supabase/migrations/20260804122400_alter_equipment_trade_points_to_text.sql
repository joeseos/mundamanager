-- Catalog Trade Points is text so values like "E" (Exclusive / 0 TP) are valid,
-- alongside numeric strings such as "2". equipment_discounts.trade_points becomes
-- nullable: NULL means "no override" (fall back to equipment.trade_points),
-- matching how adjusted_cost works. Existing default 0 discount rows are nulled.
ALTER TABLE public.equipment
  ALTER COLUMN trade_points DROP DEFAULT,
  ALTER COLUMN trade_points TYPE text USING trade_points::text,
  ALTER COLUMN trade_points SET DEFAULT '0',
  ALTER COLUMN trade_points SET NOT NULL;

ALTER TABLE public.custom_equipment
  ALTER COLUMN trade_points DROP DEFAULT,
  ALTER COLUMN trade_points TYPE text USING trade_points::text,
  ALTER COLUMN trade_points SET DEFAULT '0',
  ALTER COLUMN trade_points SET NOT NULL;

ALTER TABLE public.equipment_discounts
  ALTER COLUMN trade_points DROP DEFAULT,
  ALTER COLUMN trade_points DROP NOT NULL,
  ALTER COLUMN trade_points TYPE text USING
    CASE
      WHEN trade_points IS NULL OR trade_points = 0 THEN NULL
      ELSE trade_points::text
    END;

COMMENT ON COLUMN public.equipment.trade_points IS
  'N26 Trade Points cost (text: numeric string or E). Surfaced/charged only for N26 gangs.';

COMMENT ON COLUMN public.custom_equipment.trade_points IS
  'N26 Trade Points cost (text: numeric string or E). Surfaced/charged only for N26 gangs.';

COMMENT ON COLUMN public.equipment_discounts.trade_points IS
  'N26 Trade Points override (text: numeric string or E). NULL falls back to equipment.trade_points.';
