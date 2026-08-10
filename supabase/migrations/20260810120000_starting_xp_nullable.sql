-- Starting XP is nullable, and NULL means N/A.
--
-- The columns were added NOT NULL DEFAULT 0, which forces every fighter type in
-- every edition to claim a starting value. Two cases have no such value: N23 has
-- no Starting XP concept at all, and N26 has models whose entry reads N/A
-- because they can never gain XP. Neither is 0, and neither is any other number,
-- so the column has to be able to hold "no value".
--
-- The default goes with the NOT NULL. Any default is one edition's rule written
-- into the schema, where it silently applies to every other edition and to
-- editions that do not exist yet; leaving the value to the catalog entries the
-- data admins write is what keeps this safe as editions are added.
--
-- Existing rows are left alone. They are all 0, which stays correct: an N23 row
-- means "recruited with no XP", and an N26 model recruited on 0 earns its first
-- Advancement at 4 XP exactly as one recruited on 1 does, so nothing is owed.
ALTER TABLE public.fighter_types
  ALTER COLUMN starting_xp DROP DEFAULT,
  ALTER COLUMN starting_xp DROP NOT NULL;

ALTER TABLE public.custom_fighter_types
  ALTER COLUMN starting_xp DROP DEFAULT,
  ALTER COLUMN starting_xp DROP NOT NULL;

COMMENT ON COLUMN public.fighter_types.starting_xp IS
  'XP a fighter of this type starts with at recruitment. Copied to fighters.starting_xp and seeds fighters.xp when the fighter is added. NULL means N/A: the type cannot gain XP.';

COMMENT ON COLUMN public.custom_fighter_types.starting_xp IS
  'XP a fighter of this custom type starts with at recruitment. Copied to fighters.starting_xp and seeds fighters.xp when the fighter is added. NULL means N/A: the type cannot gain XP.';
