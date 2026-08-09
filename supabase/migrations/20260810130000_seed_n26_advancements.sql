-- Seed the N26 characteristic Advancement catalog.
--
-- Same tables as N23: fighter_effect_types in the 'advancements' category, with
-- one fighter_effect_type_modifiers row each. fighter_effect_types is
-- edition-scoped via edition_id and effect_name repeats across editions, so
-- every row here is a NEW row alongside its N23 namesake. The N23 rows are left
-- untouched.
--
-- What differs from N23 is the numbers, not the shape:
--
--   * No XP cost. N26 earns Advancements by crossing a rank threshold rather
--     than buying them, so type_specific_data carries xp_cost 0 and N23's
--     escalating "base + 2 per previous increase" pricing does not apply.
--   * Credits increases come from the N26 Advancement table and are flat --
--     there is no Ganger/Exotic Beast special case.
--       +5   Leadership, Intelligence, Cool, Willpower
--       +10  Initiative, Movement
--       +15  Weapon Skill, Ballistic Skill
--       +20  Strength, Toughness, Wounds, Attacks, Save
--   * Save is an N26-only Advancement; N23 fighters have no Save characteristic.
--
-- MODIFIER SIGNS. Target numbers improve by going DOWN, raw values by going UP:
--   * Weapon Skill, Ballistic Skill, Save are target numbers -> -1
--   * everything else is a raw value                         -> +1
-- Note Initiative, Leadership, Cool, Willpower and Intelligence are raw values
-- in N26 but target numbers in N23 (see N26_FIGHTER_LIMITS in
-- utils/characteristicLimits.ts), so their sign here is the OPPOSITE of the N23
-- rows of the same name. This is the same inversion the N26 Lasting Injury seed
-- documents, where 'reduce Ld by 1' is -1 rather than N23's +1.
--
-- Unlike that injury seed, the modifiers ARE seeded here rather than entered by
-- hand in Admin: an injury may legitimately carry no stat change, but an
-- Advancement with no modifier does nothing at all. addCharacteristicAdvancement
-- looks the template up by stat_name with .single(), deriving stat_name from
-- effect_name (lowercased, spaces to underscores) -- so exactly one modifier per
-- row, and the stat_name column below must match that derivation exactly.
--
-- '+1 Save' assumes the fighter already has a Save to improve; a null Save is a
-- fighter type data error rather than something to resolve here.
--
-- Re-runnable: both inserts are guarded, so applying twice is a no-op.

BEGIN;

WITH target AS (
  SELECT
    (SELECT id FROM public.fighter_effect_categories WHERE category_name = 'advancements') AS category_id,
    (SELECT id FROM public.editions WHERE slug = 'n26') AS edition_id
),
-- Named seed_rows rather than rows: ROWS is a Postgres keyword, and the
-- `name(col, col) AS (...)` CTE form reads like a CREATE TABLE column list to
-- static analysers (Supabase's SQL editor flags it as creating a table without
-- RLS). Postgres parses either form; this one doesn't set off the warning.
-- Ordered as they appear on the Advancement table, cheapest first.
seed_rows(effect_name, credits_increase, sort_order) AS (
  VALUES
    ('Leadership',       5,  1),
    ('Intelligence',     5,  2),
    ('Cool',             5,  3),
    ('Willpower',        5,  4),
    ('Initiative',      10,  5),
    ('Movement',        10,  6),
    ('Weapon Skill',    15,  7),
    ('Ballistic Skill', 15,  8),
    ('Strength',        20,  9),
    ('Toughness',       20, 10),
    ('Wounds',          20, 11),
    ('Attacks',         20, 12),
    ('Save',            20, 13)
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
-- effect_name (lowercased, spaces to underscores), because
-- addCharacteristicAdvancement looks the template up by that name.
WITH target AS (
  SELECT
    (SELECT id FROM public.fighter_effect_categories WHERE category_name = 'advancements') AS category_id,
    (SELECT id FROM public.editions WHERE slug = 'n26') AS edition_id
),
seed_modifiers(effect_name, stat_name, numeric_value) AS (
  VALUES
    -- Raw values in N26: higher is better.
    ('Leadership',      'leadership',       1),
    ('Intelligence',    'intelligence',     1),
    ('Cool',            'cool',             1),
    ('Willpower',       'willpower',        1),
    ('Initiative',      'initiative',       1),
    ('Movement',        'movement',         1),
    ('Strength',        'strength',         1),
    ('Toughness',       'toughness',        1),
    ('Wounds',          'wounds',           1),
    ('Attacks',         'attacks',          1),
    -- Target numbers: lower is better.
    ('Weapon Skill',    'weapon_skill',    -1),
    ('Ballistic Skill', 'ballistic_skill', -1),
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
