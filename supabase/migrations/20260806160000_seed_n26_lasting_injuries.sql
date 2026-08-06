-- Seed the N26 Lasting Injury catalog.
--
-- fighter_effect_types is edition-scoped via edition_id, and effect_name is
-- reused across editions, so every row here is a NEW row even where the name
-- matches an existing N23 one ('Captured', 'Eye Injury', 'Out Cold', …). The
-- N23 rows are left untouched; nothing is shared between the two editions.
--
-- N26 is not a reskin of N23. It splits Bitter Enmity into three Hatred (X)
-- variants by target, replaces Convalescence with Grievous Wound over a wider
-- 31-46 spread, shifts every characteristic injury down a row, and drops Old
-- Battle Wound, Partially Deafened, Humiliated and Multiple Injuries. There is
-- no Mutations / Festering band. The matching D66 table lives in
-- utils/dice.ts as LASTING_INJURY_TABLE_N26; effect_name must match it exactly,
-- because the UI reverse-looks-up the displayed range by name.
--
-- Note the spelling difference from N23: 'Lesson Learnt' here, 'Lesson Learned'
-- in N23. Both are correct for their own edition.
--
-- STAT MODIFIERS ARE NOT SEEDED HERE — they are entered by hand in
-- Admin -> Injuries after this migration is applied. Seven rows need one each:
--
--     Effect             Stat              Value
--     ------------------ ----------------- -----
--     Impressive Scars   Leadership          +1
--     Eye Injury         Ballistic Skill     +1
--     Hand Injury        Weapon Skill        +1
--     Hobbled            Movement            -1
--     Spinal Injury      Strength            -1
--     Enfeebled          Toughness           -1
--     Head Injury        Leadership          -1
--
-- SIGN CONVENTION — the two Leadership rows are the easy ones to get wrong.
-- N26 moves Ld/Cl/Wil/Int from target numbers (3+…10+, lower is better) to
-- plain values (4…10, higher is better); WS/BS stay target numbers (2+…6+).
-- See N26_FIGHTER_LIMITS in utils/characteristicLimits.ts. So:
--   * 'reduce BS/WS by 1' -> +1  (worse target number), same as N23
--   * 'reduce M/S/T by 1' -> -1  (lower raw value),      same as N23
--   * 'reduce Ld by 1'    -> -1  (lower raw value),      OPPOSITE of N23,
--     where Head Injury uses intelligence +1 / willpower +1
--   * 'increase Ld by 1'  -> +1                          OPPOSITE of N23,
--     where Impressive Scars uses cool -1
-- Note the admin stat picker labels Leadership with a '+' suffix, which is an
-- N23 target-number assumption; ignore it and enter the signs above.
--
-- No row carries a skill_id: there are no N26 skill_types or skills yet, so the
-- Fearsome Condition (Horrid Scars) and the Hatred (X) Conditions (the Enmity
-- trio) have nothing to point at and are tracked by the player for now.
--
-- Re-runnable: the insert is guarded, so applying twice is a no-op.

BEGIN;

WITH target AS (
  SELECT
    (SELECT id FROM public.fighter_effect_categories WHERE category_name = 'injuries') AS category_id,
    (SELECT id FROM public.editions WHERE slug = 'n26') AS edition_id
),
-- Named seed_rows rather than rows: ROWS is a Postgres keyword, and the
-- `name(col, col) AS (...)` CTE form reads like a CREATE TABLE column list to
-- static analysers (Supabase's SQL editor flags it as creating a table without
-- RLS). Postgres parses either form; this one doesn't set off the warning.
seed_rows(effect_name, type_specific_data) AS (
  VALUES
    -- 11 — The fighter earns D3 XP (awarded manually).
    ('Lesson Learnt',    '{"recovery": "false", "convalescence": "false"}'::jsonb),
    -- 12 — Hatred (X) where X is the gang TYPE that took them Out of Action.
    ('Eternal Enmity',   '{"recovery": "false", "convalescence": "false"}'::jsonb),
    -- 13 — Hatred (X) where X is the GANG that took them Out of Action.
    ('Bitter Enmity',    '{"recovery": "false", "convalescence": "false"}'::jsonb),
    -- 14 — Hatred (X) where X is the MODEL that took them Out of Action.
    ('Personal Enmity',  '{"recovery": "false", "convalescence": "false"}'::jsonb),
    -- 15 — Gains the Fearsome Condition.
    ('Horrid Scars',     '{"recovery": "false", "convalescence": "false"}'::jsonb),
    -- 16 — +1 Leadership.
    ('Impressive Scars', '{"recovery": "false", "convalescence": "false"}'::jsonb),
    -- 21-26 — No further part in the battle, no long-term effects.
    ('Out Cold',         '{"recovery": "false", "convalescence": "false"}'::jsonb),
    -- 31-46 — Goes into Recovery. Replaces N23's Convalescence.
    ('Grievous Wound',   '{"recovery": "true",  "convalescence": "false"}'::jsonb),
    -- 51-56 — Recovery plus a characteristic reduction.
    ('Eye Injury',       '{"recovery": "true",  "convalescence": "false"}'::jsonb),
    ('Hand Injury',      '{"recovery": "true",  "convalescence": "false"}'::jsonb),
    ('Hobbled',          '{"recovery": "true",  "convalescence": "false"}'::jsonb),
    ('Spinal Injury',    '{"recovery": "true",  "convalescence": "false"}'::jsonb),
    ('Enfeebled',        '{"recovery": "true",  "convalescence": "false"}'::jsonb),
    ('Head Injury',      '{"recovery": "true",  "convalescence": "false"}'::jsonb),
    -- 61-62 — Captured (see The Post Battle Sequence).
    ('Captured',         '{"captured": "true", "recovery": "false", "convalescence": "false"}'::jsonb),
    -- 63-65 — Dies unless treated by a Doc in the Post-cycle Sequence.
    --         Mirrors N23's Critical Injury, which also sets recovery.
    ('Critical Injury',  '{"recovery": "true",  "convalescence": "false"}'::jsonb),
    -- 66 — Killed instantly.
    ('Memorable Death',  '{"killed": "true", "recovery": "false", "convalescence": "false"}'::jsonb)
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

COMMIT;
