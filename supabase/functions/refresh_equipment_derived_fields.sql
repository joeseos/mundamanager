-- Keeps two derived columns on equipment up to date, so get_equipment_detailed_data reads
-- them instead of working them out for every row on every call:
--
--   vehicle_upgrade_slot       'Body', 'Drive' or 'Engine' for a vehicle upgrade, from the
--                              body_slots / drive_slots / engine_slots modifiers of the fighter
--                              effect types linked to it through type_specific_data.equipment_id.
--                              NULL for anything else.
--   grants_equipment_resolved  grants_equipment with each option's equipment_name filled in
--                              ('Unknown' when the granted item no longer exists), options in
--                              the order they are stored.
--
-- A row is recomputed when its equipment_type or grants_equipment is written, when an item
-- it grants is inserted, renamed or deleted, and when a fighter effect type linked to it, or
-- one of that type's modifiers, changes. The function's own UPDATE only sets the two derived
-- columns, which none of the triggers below listen to, so it never re-fires itself.
--
-- Every writer of these tables is an admin (or the service role), and admins may update
-- equipment, so the function runs with the caller's rights.
--
-- DEPLOY ORDER: apply migration 20261002071034_precompute_equipment_slot_and_grant_names.sql
-- (which adds both columns) BEFORE this file is deployed. The function writes both columns
-- and fails without them, so the guard below stops the deploy rather than install triggers
-- that would break every admin save.

DO $$
BEGIN
  IF (SELECT count(*) FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'equipment'
        AND column_name IN ('vehicle_upgrade_slot', 'grants_equipment_resolved')) < 2 THEN
    RAISE EXCEPTION 'Apply migration 20261002071034_precompute_equipment_slot_and_grant_names.sql first';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.refresh_equipment_derived_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_ids             uuid[] := '{}';
  v_self            uuid;
  v_name_changed    boolean;
  v_old_equipment   text;
  v_new_equipment   text;
  v_effect_type_ids uuid[] := '{}';
BEGIN
  IF TG_TABLE_NAME = 'equipment' THEN
    IF TG_OP = 'DELETE' THEN
      v_self := OLD.id;
    ELSE
      v_self := NEW.id;
      v_ids := ARRAY[NEW.id];
    END IF;

    IF TG_OP = 'UPDATE' THEN
      v_name_changed := NEW.equipment_name IS DISTINCT FROM OLD.equipment_name;
    ELSE
      v_name_changed := true;
    END IF;

    -- Items that grant this one carry its name.
    IF v_name_changed THEN
      v_ids := v_ids || ARRAY(
        SELECT g.id
        FROM equipment g
        WHERE jsonb_typeof(g.grants_equipment->'options') = 'array'
          AND EXISTS (
            SELECT 1
            FROM jsonb_array_elements(g.grants_equipment->'options') opt
            WHERE lower(opt->>'equipment_id') = v_self::text
          )
      );
    END IF;

  ELSIF TG_TABLE_NAME = 'fighter_effect_types' THEN
    IF TG_OP <> 'INSERT' THEN
      v_old_equipment := OLD.type_specific_data->>'equipment_id';
    END IF;
    IF TG_OP <> 'DELETE' THEN
      v_new_equipment := NEW.type_specific_data->>'equipment_id';
    END IF;

    v_ids := ARRAY(
      SELECT e.id
      FROM equipment e
      WHERE e.id::text = v_old_equipment OR e.id::text = v_new_equipment
    );

  ELSE -- fighter_effect_type_modifiers
    IF TG_OP <> 'INSERT' THEN
      v_effect_type_ids := v_effect_type_ids || OLD.fighter_effect_type_id;
    END IF;
    IF TG_OP <> 'DELETE' THEN
      v_effect_type_ids := v_effect_type_ids || NEW.fighter_effect_type_id;
    END IF;

    v_ids := ARRAY(
      SELECT e.id
      FROM fighter_effect_types fet
      JOIN equipment e ON e.id::text = fet.type_specific_data->>'equipment_id'
      WHERE fet.id = ANY(v_effect_type_ids)
    );
  END IF;

  IF cardinality(v_ids) > 0 THEN
    UPDATE equipment e
    SET
      vehicle_upgrade_slot = CASE
        WHEN e.equipment_type = 'vehicle_upgrade' THEN (
          SELECT CASE
            WHEN bool_or(m.stat_name = 'body_slots')   THEN 'Body'
            WHEN bool_or(m.stat_name = 'drive_slots')  THEN 'Drive'
            WHEN bool_or(m.stat_name = 'engine_slots') THEN 'Engine'
          END
          FROM fighter_effect_types fet
          JOIN fighter_effect_type_modifiers m ON m.fighter_effect_type_id = fet.id
          WHERE fet.type_specific_data->>'equipment_id' = e.id::text
            AND m.stat_name IN ('body_slots', 'drive_slots', 'engine_slots')
            AND m.default_numeric_value > 0
        )
      END,
      grants_equipment_resolved = CASE
        WHEN e.grants_equipment IS NOT NULL AND e.grants_equipment->'options' IS NOT NULL THEN
          jsonb_set(
            e.grants_equipment,
            '{options}',
            COALESCE(
              (SELECT jsonb_agg(
                        opt.value || jsonb_build_object('equipment_name', COALESCE(eq.equipment_name, 'Unknown'))
                        ORDER BY opt.ordinality
                      )
               FROM jsonb_array_elements(e.grants_equipment->'options') WITH ORDINALITY AS opt(value, ordinality)
               LEFT JOIN equipment eq ON eq.id = (opt.value->>'equipment_id')::uuid),
              '[]'::jsonb
            )
          )
        ELSE e.grants_equipment
      END
    WHERE e.id = ANY(v_ids);
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_equipment_derived_fields() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refresh_equipment_derived_fields() FROM anon, authenticated;

DROP TRIGGER IF EXISTS refresh_equipment_derived_fields ON public.equipment;
CREATE TRIGGER refresh_equipment_derived_fields
  AFTER INSERT OR DELETE OR UPDATE OF equipment_type, grants_equipment, equipment_name
  ON public.equipment
  FOR EACH ROW
  EXECUTE FUNCTION public.refresh_equipment_derived_fields();

DROP TRIGGER IF EXISTS refresh_equipment_derived_fields ON public.fighter_effect_types;
CREATE TRIGGER refresh_equipment_derived_fields
  AFTER INSERT OR DELETE OR UPDATE OF type_specific_data
  ON public.fighter_effect_types
  FOR EACH ROW
  EXECUTE FUNCTION public.refresh_equipment_derived_fields();

DROP TRIGGER IF EXISTS refresh_equipment_derived_fields ON public.fighter_effect_type_modifiers;
CREATE TRIGGER refresh_equipment_derived_fields
  AFTER INSERT OR DELETE OR UPDATE OF fighter_effect_type_id, stat_name, default_numeric_value
  ON public.fighter_effect_type_modifiers
  FOR EACH ROW
  EXECUTE FUNCTION public.refresh_equipment_derived_fields();
