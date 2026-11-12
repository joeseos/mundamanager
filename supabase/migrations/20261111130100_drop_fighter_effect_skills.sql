-- Step 2 of 2: drop fighter_effect_skills now that the app reads and writes
-- fighter_skills.fighter_effect_id (20261111130000). Apply AFTER the app that
-- ships with it is live (add_fighter_injury already moved over on merge).

ALTER TABLE public.fighter_skills DROP COLUMN fighter_effect_skill_id;
DROP TABLE public.fighter_effect_skills; -- and its step 1 sync trigger
ALTER TABLE public.fighter_equipment DROP COLUMN fighter_effect_equipment_id; -- never used
DROP FUNCTION private.sync_fighter_skill_effect_id();
