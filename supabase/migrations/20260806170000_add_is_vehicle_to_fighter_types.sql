-- N26 represents vehicles alongside other fighter types. Existing fighter types
-- remain non-vehicles unless their seed data explicitly opts in.
ALTER TABLE public.fighter_types
  ADD COLUMN is_vehicle boolean NOT NULL DEFAULT false;

ALTER TABLE public.custom_fighter_types
  ADD COLUMN is_vehicle boolean NOT NULL DEFAULT false;

ALTER TABLE public.fighters
  ADD COLUMN is_vehicle boolean NOT NULL DEFAULT false;
