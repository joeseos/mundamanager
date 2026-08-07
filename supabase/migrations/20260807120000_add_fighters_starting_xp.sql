-- Starting XP recorded on the fighter itself (N26 "Advance Models" rules).
-- fighter_types.starting_xp / custom_fighter_types.starting_xp are the values a
-- fighter is recruited with, but they are editable: changing a type later would
-- retroactively change how much XP every existing fighter of that type is
-- considered to have earned, and therefore how many Advancements they are owed.
-- Each fighter keeps its own copy so its recruitment value is fixed at the
-- moment it joined the gang. Existing rows default to 0. Stored as numeric to
-- match fighters.xp and the type-level starting_xp columns.
ALTER TABLE public.fighters
  ADD COLUMN IF NOT EXISTS starting_xp numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.fighters.starting_xp IS
  'XP this fighter was recruited with, copied from its (custom_)fighter_type at recruitment. Fixed thereafter: Advancements are earned on XP above this value, so it must not follow later edits to the fighter type.';
