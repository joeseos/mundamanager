-- Skills that come with a piece of equipment (N26 Headbutt grants the Headbutt
-- weapon). Mirrors equipment grants:
--
--   skills.grants_equipment          what the skill grants, same shape as
--                                    equipment.grants_equipment. Only
--                                    selection_type 'fixed' is used for skills.
--   fighter_equipment.fighter_skill_id  the fighter_skills row that granted
--                                    this item. Same name and meaning as
--                                    fighter_effects.fighter_skill_id.
--
-- Deleting the skill deletes the item (ON DELETE CASCADE), the same way
-- granted_by_equipment_id removes equipment granted by equipment.
--
-- fighter_equipment is large (2.3M rows). Adding a nullable column without a
-- default is metadata-only, and the FK is added NOT VALID so it does not scan
-- the table under this migration's lock: every existing row is null, so there
-- is nothing to validate, and new rows are checked as normal. The index is
-- built in the next migration, in its own transaction.

ALTER TABLE public.skills
  ADD COLUMN IF NOT EXISTS grants_equipment jsonb;

COMMENT ON COLUMN public.skills.grants_equipment IS
  'Equipment a fighter receives with this skill, e.g. {"selection_type": "fixed", '
  '"options": [{"equipment_id": "...", "additional_cost": 0}]}. Same shape as '
  'equipment.grants_equipment; only fixed grants are used. Null = grants nothing.';

ALTER TABLE public.fighter_equipment
  ADD COLUMN IF NOT EXISTS fighter_skill_id uuid;

COMMENT ON COLUMN public.fighter_equipment.fighter_skill_id IS
  'fighter_skills row that granted this item. Deleted with the skill; cannot be '
  'sold or moved to the stash. Null = not granted by a skill.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fighter_equipment_fighter_skill_id_fkey'
      AND conrelid = 'public.fighter_equipment'::regclass
  ) THEN
    ALTER TABLE public.fighter_equipment
      ADD CONSTRAINT fighter_equipment_fighter_skill_id_fkey
      FOREIGN KEY (fighter_skill_id)
      REFERENCES public.fighter_skills (id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;
END $$;
