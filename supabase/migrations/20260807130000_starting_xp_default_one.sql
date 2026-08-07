-- Starting XP defaults to 1, not 0.
--
-- N26 model ranks begin at 1 XP: the Rookie band covers 1-3, and a model is
-- recruited onto that first tier rather than advancing onto it. A fighter left
-- on 0 sits below the table entirely and would earn an Advancement on reaching
-- 1 XP, one the rules never grant. 1 is the lowest value the rank table
-- describes, so it is the safer floor when a value is not supplied.
--
-- Only the column default changes. Existing rows are left alone: every fighter
-- type is expected to carry a value set deliberately, and rewriting a stored 0
-- to 1 would silently reinterpret data the team may have entered on purpose.
ALTER TABLE public.fighter_types
  ALTER COLUMN starting_xp SET DEFAULT 1;

ALTER TABLE public.custom_fighter_types
  ALTER COLUMN starting_xp SET DEFAULT 1;

ALTER TABLE public.fighters
  ALTER COLUMN starting_xp SET DEFAULT 1;
