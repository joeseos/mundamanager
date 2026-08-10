-- Seed the N26 Vehicle Lasting Damage catalog.
--
-- Categories are global (no edition_id), so these join the same 'lasting damages'
-- category as the six N23 damages and are distinguished by edition_id. N23 rows are
-- left untouched.
--
-- N26 makes the vehicle a fighter, so it rolls D66 rather than D6 and modifies ordinary
-- fighter characteristics, with the Recovery / Captured / destroyed outcomes of the N26
-- injury table. The matching table is VEHICLE_DAMAGE_TABLE_N26 in utils/dice.ts;
-- effect_name must match it exactly, since the UI looks the range up by name.
--
-- Names deliberately collide with N26 injuries ('Lesson Learnt', the Enmity trio,
-- 'Captured') and with the N23 repair table ('Superficial Damage'). Separate rows.
--
-- Modifiers are seeded here, unlike 20260806160000_seed_n26_lasting_injuries.sql: there
-- is no admin UI for lasting damages, so SQL is the only way in.
--
-- SIGN CONVENTION — BS is a target number on N26 but M/T/W are raw values, so 'reduces
-- its Ballistic Skill by 1' is +1 while 'reduces its Movement/Toughness/Wounds by 1' is
-- -1. See N26_FIGHTER_LIMITS in utils/characteristicLimits.ts.
--
-- Rows with no exact status flag: 15-16 Percussive Repair and 21-26 Superficial Damage
-- are inert (the player removes a damage by hand), 63-65 Critical Damage uses recovery
-- for its Chop-Shop lockout, and 66 Catastrophic Explosion! uses killed for the delete.
--
-- No skill_id: there are no N26 skills yet, so the Hatred (X) Conditions have nothing to
-- point at and are tracked by the player.
--
-- Re-runnable: both inserts are guarded.

BEGIN;

WITH target AS (
  SELECT
    (SELECT id FROM public.fighter_effect_categories WHERE category_name = 'lasting damages') AS category_id,
    (SELECT id FROM public.editions WHERE slug = 'n26') AS edition_id
),
-- Named seed_rows rather than rows: ROWS is a Postgres keyword, and the
-- `name(col, col) AS (...)` CTE form reads like a CREATE TABLE column list to
-- static analysers (Supabase's SQL editor flags it as creating a table without
-- RLS). Postgres parses either form; this one doesn't set off the warning.
seed_rows(effect_name, type_specific_data) AS (
  VALUES
    -- 11 — The Vehicle earns D3 XP (awarded manually).
    ('Lesson Learnt',           '{"recovery": "false", "convalescence": "false"}'::jsonb),
    -- 12 — Hatred (X) where X is the gang TYPE that took it Out of Action.
    ('Eternal Enmity',          '{"recovery": "false", "convalescence": "false", "hatred_target": "gang_type"}'::jsonb),
    -- 13 — Hatred (X) where X is the GANG that took it Out of Action.
    ('Bitter Enmity',           '{"recovery": "false", "convalescence": "false", "hatred_target": "gang"}'::jsonb),
    -- 14 — Hatred (X) where X is the MODEL that took it Out of Action.
    ('Personal Enmity',         '{"recovery": "false", "convalescence": "false", "hatred_target": "fighter"}'::jsonb),
    -- 15-16 — May remove one Lasting Damage previously suffered.
    ('Percussive Repair',       '{"recovery": "false", "convalescence": "false"}'::jsonb),
    -- 21-26 — No further part in the battle, no long-term effects.
    ('Superficial Damage',      '{"recovery": "false", "convalescence": "false"}'::jsonb),
    -- 31-46 — Goes into Recovery.
    ('Major Damage',            '{"recovery": "true",  "convalescence": "false"}'::jsonb),
    -- 51-56 — Recovery plus a characteristic reduction.
    ('Busted Sights',           '{"recovery": "true",  "convalescence": "false", "effect_selection": "fixed"}'::jsonb),
    ('Drive System Fault',      '{"recovery": "true",  "convalescence": "false", "effect_selection": "fixed"}'::jsonb),
    ('Buckled Frame',           '{"recovery": "true",  "convalescence": "false", "effect_selection": "fixed"}'::jsonb),
    ('Engine Fracture',         '{"recovery": "true",  "convalescence": "false", "effect_selection": "fixed"}'::jsonb),
    -- 61-62 — Captured (see The Post-Battle Sequence).
    ('Captured',                '{"captured": "true", "recovery": "false", "convalescence": "false"}'::jsonb),
    -- 63-65 — Explodes; no battles or Post-cycle Actions until repaired at a Chop Shop.
    ('Critical Damage',         '{"recovery": "true",  "convalescence": "false"}'::jsonb),
    -- 66 — Destroyed; delete the Vehicle from the Gang Roster.
    ('Catastrophic Explosion!', '{"killed": "true", "recovery": "false", "convalescence": "false"}'::jsonb)
)
INSERT INTO public.fighter_effect_types (effect_name, fighter_effect_category_id, edition_id, type_specific_data)
SELECT r.effect_name, t.category_id, t.edition_id, r.type_specific_data
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

-- Characteristic modifiers for the 51-56 band. Joined back by (effect_name,
-- category, edition) so this half stands alone if the insert above was a no-op.
WITH target AS (
  SELECT
    (SELECT id FROM public.fighter_effect_categories WHERE category_name = 'lasting damages') AS category_id,
    (SELECT id FROM public.editions WHERE slug = 'n26') AS edition_id
),
seed_mods(effect_name, stat_name, default_numeric_value) AS (
  VALUES
    -- 51-52 — 'reduces its Ballistic Skill characteristic by 1': BS is a target
    -- number on N26, so a worse BS is a HIGHER number.
    ('Busted Sights',      'ballistic_skill', 1),
    -- 53 — 'reduces its Movement characteristic by 1'
    ('Drive System Fault', 'movement',       -1),
    -- 54 — 'reduces its Toughness characteristic by 1'
    ('Buckled Frame',      'toughness',      -1),
    -- 55-56 — 'reduces its Wounds characteristic by 1'
    ('Engine Fracture',    'wounds',         -1)
)
-- operation 'add' is explicit to match the N26 injury modifiers entered through
-- Admin -> Injuries. applyModifiers defaults a null operation to 'add' anyway,
-- so this is for consistency, not behaviour.
INSERT INTO public.fighter_effect_type_modifiers (fighter_effect_type_id, stat_name, default_numeric_value, operation)
SELECT fet.id, m.stat_name, m.default_numeric_value, 'add'
FROM seed_mods m
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
