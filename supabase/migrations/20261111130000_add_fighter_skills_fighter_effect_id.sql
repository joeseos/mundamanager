-- Step 1 of 2: link an effect-granted skill straight to its effect
-- (fighter_skills.fighter_effect_id) instead of through fighter_effect_skills.
-- Apply BEFORE merging: supabase/functions/add_fighter_injury.sql deploys on
-- merge and writes this column. Step 2 (20261111130100) drops the link table
-- once the new app is live.
--
-- The foreign key also holds the effect to the skill's own fighter, so a skill
-- can never hang off another fighter's injury (a copy inheriting the source's
-- link). Run the copied-skill repair SQL from PR #2427 first, or it fails.

ALTER TABLE public.fighter_skills ADD COLUMN fighter_effect_id uuid;

UPDATE public.fighter_skills fs
SET fighter_effect_id = fes.fighter_effect_id
FROM public.fighter_effect_skills fes
WHERE fes.id = fs.fighter_effect_skill_id;

ALTER TABLE public.fighter_effects
  ADD CONSTRAINT fighter_effects_id_fighter_id_key UNIQUE (id, fighter_id);

ALTER TABLE public.fighter_skills
  ADD CONSTRAINT fighter_skills_fighter_effect_id_fkey
  FOREIGN KEY (fighter_effect_id, fighter_id)
  REFERENCES public.fighter_effects (id, fighter_id) ON DELETE CASCADE;

CREATE INDEX fighter_skills_fighter_effect_id_idx
  ON public.fighter_skills (fighter_effect_id)
  WHERE fighter_effect_id IS NOT NULL;

COMMENT ON COLUMN public.fighter_skills.fighter_effect_id IS
  'Effect (injury or gear effect) of the same fighter that granted this skill. Deleted with the effect. Null = not granted by an effect.';

-- Until step 2, the running app and add_fighter_injury still write link rows:
-- keep the new column in step with them.
CREATE FUNCTION private.sync_fighter_skill_effect_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE fighter_skills SET fighter_effect_id = NEW.fighter_effect_id WHERE id = NEW.fighter_skill_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER fighter_effect_skills_sync_fighter_effect_id
  AFTER INSERT ON public.fighter_effect_skills
  FOR EACH ROW EXECUTE FUNCTION private.sync_fighter_skill_effect_id();
