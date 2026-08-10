-- Starting XP recorded on the fighter itself (N26 "Advance Models" rules).
-- fighter_types.starting_xp / custom_fighter_types.starting_xp are the values a
-- fighter is recruited with, but they are editable: changing a type later would
-- retroactively change how much XP every existing fighter of that type is
-- considered to have earned, and therefore how many Advancements they are owed.
-- Each fighter keeps its own copy so its recruitment value is fixed at the
-- moment it joined the gang. Stored as numeric to match fighters.xp and the
-- type-level starting_xp columns.
--
-- NULL means N/A: the model's type cannot gain XP, so it has no recruitment
-- value rather than a value of zero. The column is added carrying a default so
-- every fighter already on a roster is backfilled to 0 instead of being
-- reinterpreted as N/A, then the default is dropped so a later insert that
-- omits the value records N/A rather than inventing a starting value.
ALTER TABLE public.fighters
  ADD COLUMN IF NOT EXISTS starting_xp numeric DEFAULT 0;

ALTER TABLE public.fighters
  ALTER COLUMN starting_xp DROP DEFAULT;

COMMENT ON COLUMN public.fighters.starting_xp IS
  'XP this fighter was recruited with, copied from its (custom_)fighter_type at recruitment. NULL means N/A: the type cannot gain XP. Fixed thereafter: Advancements are earned on XP above this value, so it must not follow later edits to the fighter type.';
