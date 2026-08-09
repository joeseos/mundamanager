-- Starting XP recorded on the fighter itself (N26 "Advance Models" rules).
--
-- N26 never spends XP: a model earns an Advancement each time its running total
-- crosses a rank threshold. Counting those crossings needs to know where the
-- model started, because the tiers widen as XP rises — a Ganger recruited on
-- 13 XP sits on a 6-wide band, not the 3-wide Rookie band a fresh model starts
-- on.
--
-- WHY THE FIGHTER CARRIES ITS OWN COPY. fighter_types.starting_xp and
-- custom_fighter_types.starting_xp hold the value a fighter is recruited with,
-- but both are editable in Admin. Reading recruitment XP from the type would
-- mean that correcting a fighter type retroactively changes how much XP every
-- existing fighter of that type counts as having earned, and therefore how many
-- Advancements it is owed. Each fighter keeps its own copy, fixed at the moment
-- it joined the gang.
--
-- WHICH COLUMN IS AUTHORITATIVE. The fighters table now carries three XP
-- columns and they are not interchangeable:
--
--   xp           current XP. Under N26 this only ever grows; under N23 it is a
--                currency and falls when an Advancement is bought.
--   starting_xp  recruitment XP. AUTHORITATIVE for rank calculations.
--   total_xp     lifetime XP counter. NOT authoritative here — updateFighterXp
--                and updateFighterXpWithOoa both return total_xp set to the
--                fighter's current xp, so it does not reliably mean "XP earned
--                since recruitment" and must not be used to derive ranks.
--
-- DEFAULT 0, deliberately. 0 is a legal starting value: N23 does not use the
-- concept at all, and some N26 fighter types genuinely start on 0. The rank
-- table in utils/advancementRanks.ts handles it correctly by omitting the
-- Rookie band's own first tier (1-3) from its data — nothing ever *moves onto*
-- that tier, so a model on 0 or 1 alike first advances at 4. This matches the
-- existing DEFAULT 0 on both (custom_)fighter_types.starting_xp columns.
--
-- Stored as numeric to match fighters.xp and the type-level starting_xp columns.

ALTER TABLE public.fighters
  ADD COLUMN IF NOT EXISTS starting_xp numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.fighters.starting_xp IS
  'XP this fighter was recruited with, copied from its (custom_)fighter_type at recruitment. Fixed thereafter: N26 Advancements are earned by crossing rank thresholds above this value, so it must not follow later edits to the fighter type. Authoritative for rank calculations — total_xp is not.';
