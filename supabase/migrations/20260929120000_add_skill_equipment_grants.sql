-- Skills that come with equipment (N26 Headbutt grants the Headbutt weapon),
-- the same way equipment grants equipment:
--
--   skills.grants_equipment             what the skill grants, same shape as
--                                       equipment.grants_equipment. Only
--                                       selection_type 'fixed' is used.
--   fighter_equipment.fighter_skill_id  the fighter_skills row that granted the
--                                       item. Same name and meaning as
--                                       fighter_effects.fighter_skill_id.
--
-- Deleting the skill deletes the item (ON DELETE CASCADE), as
-- granted_by_equipment_id does for equipment granted by equipment.
--
-- Then N26 Headbutt is set to grant the Headbutt weapon, and fighters that
-- already have it are backfilled:
--   a. Free Headbutt weapons players added by hand (same fighter, not stashed,
--      not on a vehicle) are linked to the skill instead of getting a
--      duplicate, one weapon per skill row. At the time of writing 22 of 26;
--      the other 4 are on fighters without the N26 skill and stay as they are.
--   b. Every other fighter with the skill gets the weapon (1,068). Free, so
--      gang rating and wealth are unchanged.
--
-- Re-runnable.

BEGIN;

ALTER TABLE public.skills
  ADD COLUMN IF NOT EXISTS grants_equipment jsonb;

COMMENT ON COLUMN public.skills.grants_equipment IS
  'Equipment a fighter receives with this skill, e.g. {"selection_type": "fixed", '
  '"options": [{"equipment_id": "...", "additional_cost": 0}]}. Same shape as '
  'equipment.grants_equipment; only fixed grants are used. Null = grants nothing.';

ALTER TABLE public.fighter_equipment
  ADD COLUMN IF NOT EXISTS fighter_skill_id uuid REFERENCES public.fighter_skills(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.fighter_equipment.fighter_skill_id IS
  'fighter_skills row that granted this item. Deleted with the skill; cannot be '
  'sold or moved to the stash. Null = not granted by a skill.';

-- Partial: almost every row is null
CREATE INDEX IF NOT EXISTS idx_fighter_equipment_fighter_skill_id
  ON public.fighter_equipment (fighter_skill_id)
  WHERE fighter_skill_id IS NOT NULL;

-- N26 Headbutt grants the N26 Headbutt weapon
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

-- a. Link hand-added weapons to the skill, pairing them one to one per fighter
WITH headbutt AS (
  SELECT s.id AS skill_id, (s.grants_equipment->'options'->0->>'equipment_id')::uuid AS equipment_id
  FROM public.skills s
  JOIN public.skill_types st ON st.id = s.skill_type_id
  JOIN public.editions ed ON ed.id = st.edition_id
  WHERE s.name = 'Headbutt' AND ed.slug = 'n26'
), unlinked_skill AS (
  SELECT fs.id AS fighter_skill_id, fs.fighter_id,
         row_number() OVER (PARTITION BY fs.fighter_id ORDER BY fs.created_at, fs.id) AS rn
  FROM public.fighter_skills fs
  JOIN headbutt h ON h.skill_id = fs.skill_id
  WHERE NOT EXISTS (SELECT 1 FROM public.fighter_equipment fe WHERE fe.fighter_skill_id = fs.id)
), loose_weapon AS (
  SELECT fe.id, fe.fighter_id,
         row_number() OVER (PARTITION BY fe.fighter_id ORDER BY fe.created_at, fe.id) AS rn
  FROM public.fighter_equipment fe
  JOIN headbutt h ON h.equipment_id = fe.equipment_id
  WHERE fe.fighter_skill_id IS NULL
    AND fe.granted_by_equipment_id IS NULL
    AND fe.vehicle_id IS NULL
    AND COALESCE(fe.gang_stash, false) = false
    AND COALESCE(fe.purchase_cost, 0) = 0
)
UPDATE public.fighter_equipment fe
SET fighter_skill_id = us.fighter_skill_id,
    updated_at = now()
FROM loose_weapon lw
JOIN unlinked_skill us ON us.fighter_id = lw.fighter_id AND us.rn = lw.rn
WHERE fe.id = lw.id;

-- b. Give the weapon to everyone else with the skill
WITH headbutt AS (
  SELECT s.id AS skill_id, (s.grants_equipment->'options'->0->>'equipment_id')::uuid AS equipment_id
  FROM public.skills s
  JOIN public.skill_types st ON st.id = s.skill_type_id
  JOIN public.editions ed ON ed.id = st.edition_id
  WHERE s.name = 'Headbutt' AND ed.slug = 'n26'
)
INSERT INTO public.fighter_equipment (
  fighter_id, gang_id, equipment_id, original_cost, purchase_cost, fighter_skill_id, user_id
)
SELECT fs.fighter_id, f.gang_id, eq.id, COALESCE(eq.cost, 0), 0, fs.id, f.user_id
FROM public.fighter_skills fs
JOIN headbutt h ON h.skill_id = fs.skill_id
JOIN public.fighters f ON f.id = fs.fighter_id
JOIN public.equipment eq ON eq.id = h.equipment_id
WHERE NOT EXISTS (SELECT 1 FROM public.fighter_equipment fe WHERE fe.fighter_skill_id = fs.id);

COMMIT;
