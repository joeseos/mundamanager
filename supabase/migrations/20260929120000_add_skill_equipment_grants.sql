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
-- Then N26 Headbutt is set to grant the Headbutt weapon. Fighters that already
-- have the skill are not backfilled: only skills added from now on (advancement,
-- starting skill or recruit) grant the weapon.
--
-- Re-runnable.

BEGIN;

ALTER TABLE public.skills
  ADD COLUMN IF NOT EXISTS grants_equipment jsonb;

COMMENT ON COLUMN public.skills.grants_equipment IS
  'Equipment a fighter receives with this skill, e.g. {"selection_type": "fixed", '
  '"options": [{"equipment_id": "...", "additional_cost": 0}]}. Same shape as '
  'equipment.grants_equipment; only fixed grants are used. Null = grants nothing.';

-- New column with inline REFERENCES, as 20260214100000 added
-- fighter_effects.fighter_skill_id: Postgres skips the FK check on a new column
-- with no default, so this does not scan fighter_equipment.
ALTER TABLE public.fighter_equipment
  ADD COLUMN IF NOT EXISTS fighter_skill_id uuid REFERENCES public.fighter_skills(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.fighter_equipment.fighter_skill_id IS
  'fighter_skills row that granted this item. Deleted with the skill; cannot be '
  'sold or moved to the stash. Null = not granted by a skill.';

-- Partial, as in 20260814140000: almost every row is null, and deleting a
-- fighter_skills row looks up its equipment through this index
CREATE INDEX IF NOT EXISTS fighter_equipment_fighter_skill_id_idx
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

COMMIT;
