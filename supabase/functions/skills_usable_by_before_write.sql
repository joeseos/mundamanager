-- skills.usable_by may be fighter, vehicle, or a fighter_subtypes.subtype_name
-- of the skill's edition. A closed CHECK list would need a migration every time
-- a subtype is added. usable_by requires a skill set with an edition.
-- Changing skill_types.edition_id re-checks every child skill.
--
-- DEPLOY ORDER: apply migration 20261102171910_add_skills_usable_by.sql
-- (which creates skills.usable_by) BEFORE these triggers go live.

CREATE OR REPLACE FUNCTION public.skills_usable_by_before_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  kind text;
  skill_edition_id uuid;
BEGIN
  IF NEW.usable_by IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.skill_type_id IS NULL THEN
    RAISE EXCEPTION 'usable_by requires a skill set';
  END IF;

  SELECT st.edition_id
  INTO skill_edition_id
  FROM public.skill_types st
  WHERE st.id = NEW.skill_type_id;

  IF NOT FOUND OR skill_edition_id IS NULL THEN
    RAISE EXCEPTION 'usable_by requires a skill set with an edition';
  END IF;

  FOREACH kind IN ARRAY NEW.usable_by LOOP
    IF kind IN ('fighter', 'vehicle') THEN
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.fighter_subtypes fs
      WHERE fs.subtype_name = kind
        AND fs.edition_id = skill_edition_id
    ) THEN
      CONTINUE;
    END IF;

    RAISE EXCEPTION
      'usable_by value % is not fighter, vehicle, or a fighter subtype of this skill''s edition',
      kind;
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.skills_usable_by_before_write() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.skills_usable_by_before_write() FROM anon, authenticated;

DROP TRIGGER IF EXISTS skills_usable_by_before_write ON public.skills;
CREATE TRIGGER skills_usable_by_before_write
  BEFORE INSERT OR UPDATE OF usable_by, skill_type_id ON public.skills
  FOR EACH ROW
  EXECUTE FUNCTION public.skills_usable_by_before_write();

CREATE OR REPLACE FUNCTION public.skill_types_revalidate_skills_usable_by()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  skill_row record;
  kind text;
BEGIN
  IF OLD.edition_id IS NOT DISTINCT FROM NEW.edition_id THEN
    RETURN NEW;
  END IF;

  IF NEW.edition_id IS NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.skills s
      WHERE s.skill_type_id = NEW.id
        AND s.usable_by IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'usable_by requires a skill set with an edition';
    END IF;
    RETURN NEW;
  END IF;

  FOR skill_row IN
    SELECT s.name, s.usable_by
    FROM public.skills s
    WHERE s.skill_type_id = NEW.id
      AND s.usable_by IS NOT NULL
  LOOP
    FOREACH kind IN ARRAY skill_row.usable_by LOOP
      IF kind IN ('fighter', 'vehicle') THEN
        CONTINUE;
      END IF;

      IF EXISTS (
        SELECT 1
        FROM public.fighter_subtypes fs
        WHERE fs.subtype_name = kind
          AND fs.edition_id = NEW.edition_id
      ) THEN
        CONTINUE;
      END IF;

      RAISE EXCEPTION
        'usable_by value % is not fighter, vehicle, or a fighter subtype of this skill''s edition',
        kind;
    END LOOP;
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.skill_types_revalidate_skills_usable_by() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.skill_types_revalidate_skills_usable_by() FROM anon, authenticated;

DROP TRIGGER IF EXISTS skill_types_revalidate_skills_usable_by ON public.skill_types;
CREATE TRIGGER skill_types_revalidate_skills_usable_by
  BEFORE UPDATE OF edition_id ON public.skill_types
  FOR EACH ROW
  EXECUTE FUNCTION public.skill_types_revalidate_skills_usable_by();
