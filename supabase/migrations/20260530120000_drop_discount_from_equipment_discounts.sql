-- Drop the legacy `discount` column from equipment_discounts.
-- Every row has discount = 0 and a populated adjusted_cost; adjusted_cost is
-- the real pricing mechanism, so the discount column is dead weight.

ALTER TABLE public.equipment_discounts
    DROP COLUMN discount;
