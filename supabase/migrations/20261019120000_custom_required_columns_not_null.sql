-- The app treats a custom item's name, cost and owner as required, but the
-- columns allowed NULL. Audited before writing: no row holds a NULL in any of
-- them, and every writer sets them (the create, update and copy actions,
-- chem-alchemy, duplicate-custom-gang-type and copy_custom_collection).
--
-- utils/db/schema.ts declares these columns NOT NULL to match, so apply this
-- before or with the app code that reads them through Drizzle.

BEGIN;

ALTER TABLE public.custom_equipment
  ALTER COLUMN equipment_name SET NOT NULL,
  ALTER COLUMN cost SET NOT NULL;

ALTER TABLE public.custom_fighter_types
  ALTER COLUMN fighter_type SET NOT NULL,
  ALTER COLUMN gang_type SET NOT NULL,
  ALTER COLUMN cost SET NOT NULL,
  ALTER COLUMN special_rules SET NOT NULL,
  ALTER COLUMN free_skill SET NOT NULL,
  ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE public.custom_skills
  ALTER COLUMN skill_name SET NOT NULL,
  ALTER COLUMN user_id SET NOT NULL;

COMMIT;
