-- Step 1 of 2: link an effect-granted skill straight to its effect
-- (fighter_skills.fighter_effect_id) instead of through fighter_effect_skills.
-- Apply BEFORE the app deploys. Step 2 (20261111130100) drops the link table
-- once the new app is live.
--
-- Run fix-copied-skill-links.sql first: this refuses to backfill a skill that
-- is linked to another fighter's effect.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM fighter_skills fs
    JOIN fighter_effect_skills fes ON fes.id = fs.fighter_effect_skill_id
    JOIN fighter_effects fe ON fe.id = fes.fighter_effect_id
    WHERE fe.fighter_id IS DISTINCT FROM fs.fighter_id
  ) THEN
    RAISE EXCEPTION 'Skills linked to another fighter''s effect: run fix-copied-skill-links.sql first';
  END IF;
END $$;

ALTER TABLE public.fighter_skills
  ADD COLUMN fighter_effect_id uuid REFERENCES public.fighter_effects(id) ON DELETE CASCADE;

CREATE INDEX fighter_skills_fighter_effect_id_idx
  ON public.fighter_skills (fighter_effect_id)
  WHERE fighter_effect_id IS NOT NULL;

COMMENT ON COLUMN public.fighter_skills.fighter_effect_id IS
  'Effect (injury or gear effect) that granted this skill. Deleted with the effect. Null = not granted by an effect.';

UPDATE public.fighter_skills fs
SET fighter_effect_id = fes.fighter_effect_id
FROM public.fighter_effect_skills fes
WHERE fes.id = fs.fighter_effect_skill_id;

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
