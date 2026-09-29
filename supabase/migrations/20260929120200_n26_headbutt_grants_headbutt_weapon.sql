-- N26 Headbutt (Combat) comes with the Headbutt weapon.
--
-- Needs 20260929120000_add_skill_equipment_grants.sql (and its index,
-- 20260929120100) applied first.
--
-- 1. Set skills.grants_equipment on the N26 Headbutt skill. Looked up by name
--    and edition, not id. The N23 Headbutt (Brawn) is left alone: it has no
--    weapon.
--
-- 2. Backfill fighters that already have a skill with grants. Written against
--    skills.grants_equipment rather than Headbutt, so it can be re-run for any
--    skill that gains grants later.
--
--    a. Adopt items players already added by hand: a free copy of the granted
--       equipment held by the same fighter (not stashed, not on a vehicle, not
--       granted by other equipment) is linked to the skill instead of getting
--       a duplicate. Pairs one item to one skill row per fighter, in creation
--       order, so a fighter with the skill twice and one hand-added weapon
--       adopts it once and gets one new weapon.
--       At the time of writing: 22 of 26 hand-added Headbutt weapons. The
--       other 4 are on fighters without the N26 skill and stay as they are.
--
--    b. Insert the item for every remaining fighter_skills row with no linked
--       item. Free (purchase_cost 0), so gang rating and wealth are unchanged.
--
-- Re-runnable: 1 only sets a null column, 2a only touches unlinked items and
-- unlinked skill rows, 2b skips skill rows that already have their item.

BEGIN;

-- 1. N26 Headbutt grants the N26 Headbutt weapon
UPDATE public.skills s
SET grants_equipment = jsonb_build_object(
      'selection_type', 'fixed',
      'options', jsonb_build_array(
        jsonb_build_object('equipment_id', eq.id, 'additional_cost', 0)
      )
    ),
    updated_at = now()
FROM public.skill_types st,
     public.editions ed,
     public.equipment eq
WHERE s.name = 'Headbutt'
  AND st.id = s.skill_type_id
  AND ed.id = st.edition_id
  AND ed.slug = 'n26'
  AND eq.equipment_name = 'Headbutt'
  AND eq.equipment_type = 'weapon'
  AND eq.edition_id = ed.id
  AND s.grants_equipment IS NULL;

-- One row per (skill, granted equipment) for fixed grants
CREATE TEMP TABLE skill_grant ON COMMIT DROP AS
SELECT s.id AS skill_id, (opt->>'equipment_id')::uuid AS equipment_id
FROM public.skills s
CROSS JOIN LATERAL jsonb_array_elements(s.grants_equipment->'options') opt
WHERE s.grants_equipment->>'selection_type' = 'fixed';

-- 2a. Adopt hand-added copies
WITH unlinked_skill AS (
  SELECT fs.id AS fighter_skill_id, fs.fighter_id, sg.equipment_id,
         row_number() OVER (PARTITION BY fs.fighter_id, sg.equipment_id ORDER BY fs.created_at, fs.id) AS rn
  FROM public.fighter_skills fs
  JOIN skill_grant sg ON sg.skill_id = fs.skill_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.fighter_equipment linked
    WHERE linked.fighter_skill_id = fs.id
      AND linked.equipment_id = sg.equipment_id
  )
), loose_item AS (
  SELECT fe.id AS fighter_equipment_id, fe.fighter_id, fe.equipment_id,
         row_number() OVER (PARTITION BY fe.fighter_id, fe.equipment_id ORDER BY fe.created_at, fe.id) AS rn
  FROM public.fighter_equipment fe
  WHERE fe.equipment_id IN (SELECT equipment_id FROM skill_grant)
    AND fe.fighter_skill_id IS NULL
    AND fe.granted_by_equipment_id IS NULL
    AND fe.vehicle_id IS NULL
    AND COALESCE(fe.gang_stash, false) = false
    AND COALESCE(fe.purchase_cost, 0) = 0
)
UPDATE public.fighter_equipment fe
SET fighter_skill_id = us.fighter_skill_id,
    updated_at = now()
FROM loose_item li
JOIN unlinked_skill us
  ON us.fighter_id = li.fighter_id
 AND us.equipment_id = li.equipment_id
 AND us.rn = li.rn
WHERE fe.id = li.fighter_equipment_id;

-- 2b. Insert for everyone else
INSERT INTO public.fighter_equipment (
  fighter_id, gang_id, equipment_id, original_cost, purchase_cost, fighter_skill_id, user_id
)
SELECT fs.fighter_id, f.gang_id, sg.equipment_id, COALESCE(eq.cost, 0), 0, fs.id, f.user_id
FROM public.fighter_skills fs
JOIN skill_grant sg ON sg.skill_id = fs.skill_id
JOIN public.fighters f ON f.id = fs.fighter_id
JOIN public.equipment eq ON eq.id = sg.equipment_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.fighter_equipment linked
  WHERE linked.fighter_skill_id = fs.id
    AND linked.equipment_id = sg.equipment_id
);

COMMIT;
