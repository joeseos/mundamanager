-- Starting XP for fighter types (N26 "Advance Models" rules).
-- A fighter type may grant XP at recruitment. When a fighter is added, this
-- value seeds the fighter's XP on the fighters table. The starting_xp column is
-- kept on the type as the reference value. Existing rows default to 0. Stored as
-- numeric to match the other stat/cost columns on these tables (cost, save,
-- fighters.xp).
ALTER TABLE public.fighter_types
  ADD COLUMN IF NOT EXISTS starting_xp numeric NOT NULL DEFAULT 0;

ALTER TABLE public.custom_fighter_types
  ADD COLUMN IF NOT EXISTS starting_xp numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.fighter_types.starting_xp IS
  'XP a fighter of this type starts with at recruitment. Copied to fighters.xp when the fighter is added.';

COMMENT ON COLUMN public.custom_fighter_types.starting_xp IS
  'XP a fighter of this custom type starts with at recruitment. Copied to fighters.xp when the fighter is added.';
