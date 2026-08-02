-- N26 introduces a Save (Sv) characteristic on fighters. The stat is nullable
-- everywhere: NULL means "stat does not apply" (all pre-N26 content).

-- 1. Seed the N26 edition. Not current: n23 keeps is_current until cutover.
INSERT INTO public.editions (name, slug, is_current)
VALUES ('Necromunda (2026)', 'n26', false)
ON CONFLICT (slug) DO NOTHING;

-- 2. Save stat columns. No default: only N26 content sets a value.
ALTER TABLE public.fighter_types
  ADD COLUMN IF NOT EXISTS save numeric;

ALTER TABLE public.fighters
  ADD COLUMN IF NOT EXISTS save numeric;

ALTER TABLE public.custom_fighter_types
  ADD COLUMN IF NOT EXISTS save numeric;

COMMENT ON COLUMN public.fighters.save IS
  'N26 Save characteristic (e.g. 4 renders as 4+). NULL for pre-N26 fighters.';
