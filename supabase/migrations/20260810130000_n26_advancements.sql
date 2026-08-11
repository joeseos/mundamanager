-- N26 "Advance Models": Advancements are earned by rank instead of bought with XP.
--
-- Three independent changes, kept in one migration because none of them has
-- been applied anywhere yet and splitting them buys nothing:
--
--   1. fighters.starting_xp    -- the XP a fighter was recruited with
--   2. starting_xp is nullable -- NULL means N/A, on all three tables
--   3. the N26 Advancement catalog
--
-- Ordered schema-before-data. (1) and (2) touch different tables and (3)
-- touches neither, so the order within this file is for reading, not for
-- correctness.

BEGIN;

-- 1. ------------------------------------------------------------------------
-- Starting XP recorded on the fighter itself.
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
--
-- The default is a constant, so on PostgreSQL 11+ this is a catalog-only change
-- and does not rewrite the table.
ALTER TABLE public.fighters
  ADD COLUMN IF NOT EXISTS starting_xp numeric DEFAULT 0;

ALTER TABLE public.fighters
  ALTER COLUMN starting_xp DROP DEFAULT;

COMMENT ON COLUMN public.fighters.starting_xp IS
  'XP this fighter was recruited with, copied from its (custom_)fighter_type at recruitment. NULL means N/A: the type cannot gain XP. Fixed thereafter: Advancements are earned on XP above this value, so it must not follow later edits to the fighter type.';

-- 2. ------------------------------------------------------------------------
-- Starting XP is nullable, and NULL means N/A.
--
-- The type-level columns were added NOT NULL DEFAULT 0 in
-- 20260803150605_add_starting_xp_columns.sql, which forces every fighter type in
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

-- 3. ------------------------------------------------------------------------
-- Seed the N26 characteristic Advancement catalog.
--
-- Same tables as N23: fighter_effect_types in the 'advancements' category, with
-- one fighter_effect_type_modifiers row each. fighter_effect_types is
-- edition-scoped via edition_id and effect_name repeats across editions, so
-- every row here is a NEW row alongside its N23 namesake. The N23 rows are left
-- untouched.
--
-- APPLY get_fighter_available_advancements.sql FIRST. The deployed function has
-- no edition filter and returns every row in the category, so between this seed
-- and that function reaching the remote, N23 fighters are offered the N26 rows.
-- supabase/functions/*.sql is not deployed by this migration or by any other.
--
-- What differs from N23 is the numbers, not the shape:
--
--   * No XP cost. N26 earns Advancements by reaching a rank rather than buying
--     them, so type_specific_data carries xp_cost 0 and the escalating
--     "base + 2 per previous increase" pricing does not apply.
--   * Credits increases come from the N26 Advancement table, and are flat --
--     there is no Ganger/Exotic Beast special case.
--       +5   Leadership, Intelligence, Cool, Willpower
--       +10  Initiative, Movement
--       +15  Weapon Skill, Ballistic Skill
--       +20  Strength, Toughness, Wounds, Attacks, Save
--   * Save is an N26-only Advancement; N23 has no such characteristic.
--
-- MODIFIER SIGNS. Target numbers improve by going DOWN, raw values by going UP:
--   * Weapon Skill, Ballistic Skill, Save are target numbers -> -1
--   * everything else is a raw value                         -> +1
-- Note Initiative, Leadership, Cool, Willpower and Intelligence are raw values
-- in N26 but target numbers in N23, so their sign here is the OPPOSITE of the
-- N23 rows of the same name. This matches the N26 injury seed, where 'reduce Ld
-- by 1' is -1 rather than N23's +1.
--
-- Unlike the N26 injury seed, the modifiers ARE seeded here rather than entered
-- by hand: an injury may legitimately carry no stat change, but an Advancement
-- with no modifier does nothing at all.
--
-- '+1 Save' assumes the fighter already has one to improve; a null Save is a
-- fighter type data error rather than something to resolve here.
--
-- Re-runnable: both inserts are guarded, so applying twice is a no-op.

WITH target AS (
  SELECT
    (SELECT id FROM public.fighter_effect_categories WHERE category_name = 'advancements') AS category_id,
    (SELECT id FROM public.editions WHERE slug = 'n26') AS edition_id
),
-- Named seed_rows rather than rows: ROWS is a Postgres keyword.
-- Ordered as they appear on the Advancement table, cheapest first.
seed_rows (effect_name, credits_increase, sort_order) AS (
  VALUES
    ('Leadership',      5,  1),
    ('Intelligence',    5,  2),
    ('Cool',            5,  3),
    ('Willpower',       5,  4),
    ('Initiative',     10,  5),
    ('Movement',       10,  6),
    ('Weapon Skill',   15,  7),
    ('Ballistic Skill',15,  8),
    ('Strength',       20,  9),
    ('Toughness',      20, 10),
    ('Wounds',         20, 11),
    ('Attacks',        20, 12),
    ('Save',           20, 13)
)
INSERT INTO public.fighter_effect_types
  (effect_name, fighter_effect_category_id, edition_id, type_specific_data, sort_order)
SELECT
  r.effect_name,
  t.category_id,
  t.edition_id,
  jsonb_build_object('xp_cost', 0, 'credits_increase', r.credits_increase),
  r.sort_order
FROM seed_rows r
CROSS JOIN target t
WHERE t.category_id IS NOT NULL
  AND t.edition_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.fighter_effect_types existing
    WHERE existing.effect_name = r.effect_name
      AND existing.fighter_effect_category_id = t.category_id
      AND existing.edition_id = t.edition_id
  );

-- One modifier per Advancement. stat_name must match the app's derivation from
-- effect_name (lowercased, spaces to underscores), because the add-advancement
-- action looks the template up by that name.
WITH target AS (
  SELECT
    (SELECT id FROM public.fighter_effect_categories WHERE category_name = 'advancements') AS category_id,
    (SELECT id FROM public.editions WHERE slug = 'n26') AS edition_id
),
seed_modifiers (effect_name, stat_name, numeric_value) AS (
  VALUES
    ('Leadership',      'leadership',       1),
    ('Intelligence',    'intelligence',     1),
    ('Cool',            'cool',             1),
    ('Willpower',       'willpower',        1),
    ('Initiative',      'initiative',       1),
    ('Movement',        'movement',         1),
    ('Weapon Skill',    'weapon_skill',    -1),
    ('Ballistic Skill', 'ballistic_skill', -1),
    ('Strength',        'strength',         1),
    ('Toughness',       'toughness',        1),
    ('Wounds',          'wounds',           1),
    ('Attacks',         'attacks',          1),
    ('Save',            'save',            -1)
)
INSERT INTO public.fighter_effect_type_modifiers
  (fighter_effect_type_id, stat_name, default_numeric_value, operation)
SELECT fet.id, m.stat_name, m.numeric_value, 'add'
FROM seed_modifiers m
CROSS JOIN target t
JOIN public.fighter_effect_types fet
  ON fet.effect_name = m.effect_name
 AND fet.fighter_effect_category_id = t.category_id
 AND fet.edition_id = t.edition_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.fighter_effect_type_modifiers existing
  WHERE existing.fighter_effect_type_id = fet.id
    AND existing.stat_name = m.stat_name
);

COMMIT;
