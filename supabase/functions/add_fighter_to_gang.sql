-- First drop all versions of the function
DROP FUNCTION IF EXISTS add_fighter_to_gang(TEXT, UUID, UUID);
DROP FUNCTION IF EXISTS add_fighter_to_gang(TEXT, UUID, UUID, INTEGER);
DROP FUNCTION IF EXISTS add_fighter_to_gang(TEXT, UUID, UUID, INTEGER, UUID[]);

CREATE OR REPLACE FUNCTION add_fighter_to_gang(
  p_fighter_name TEXT,
  p_fighter_type_id UUID,
  p_gang_id UUID,
  p_cost INTEGER = NULL,
  p_selected_equipment_ids UUID[] = NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_fighter_id UUID;
  v_fighter_cost INTEGER;
  v_total_equipment_cost INTEGER := 0;
  v_total_cost INTEGER;
  v_gang_credits INTEGER;
  v_fighter_type TEXT;
  v_fighter_class TEXT;
  v_fighter_class_id UUID;
  v_free_skill BOOLEAN;
  v_equipment_info JSONB;
  v_skills_info JSONB;
  v_error TEXT;
  v_inserted_fighter RECORD;
BEGIN
  -- Get fighter type details and gang credits in a single query
  WITH fighter_and_gang AS (
    SELECT 
      ft.fighter_type,
      fc.class_name as fighter_class,
      fc.id as fighter_class_id,
      ft.free_skill,
      COALESCE(p_cost, ft.cost) as fighter_cost,
      g.credits as gang_credits
    FROM fighter_types ft
    JOIN fighter_classes fc ON fc.id = ft.fighter_class_id
    CROSS JOIN gangs g
    WHERE ft.id = p_fighter_type_id
    AND g.id = p_gang_id
  )
  SELECT 
    fighter_type,
    fighter_class,
    fighter_class_id,
    free_skill,
    fighter_cost,
    gang_credits
  INTO 
    v_fighter_type,
    v_fighter_class,
    v_fighter_class_id,
    v_free_skill,
    v_fighter_cost,
    v_gang_credits
  FROM fighter_and_gang;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Fighter type or gang not found');
  END IF;

  -- Insert fighter and get equipment in a single transaction
  BEGIN
    -- Insert the fighter
    INSERT INTO fighters (
      fighter_name, 
      gang_id, 
      fighter_type_id,
      fighter_class_id,
      fighter_type,
      fighter_class,
      free_skill,
      credits,
      movement,
      weapon_skill,
      ballistic_skill,
      strength,
      toughness,
      wounds,
      initiative,
      attacks,
      leadership,
      cool,
      willpower,
      intelligence,
      xp,
      kills,
      special_rules
    )
    SELECT 
      p_fighter_name,
      p_gang_id,
      p_fighter_type_id,
      fc.id as fighter_class_id,
      ft.fighter_type,
      fc.class_name as fighter_class,
      ft.free_skill,
      v_fighter_cost,
      ft.movement,
      ft.weapon_skill,
      ft.ballistic_skill,
      ft.strength,
      ft.toughness,
      ft.wounds,
      ft.initiative,
      ft.attacks,
      ft.leadership,
      ft.cool,
      ft.willpower,
      ft.intelligence,
      0,
      0,
      ft.special_rules
    FROM fighter_types ft
    JOIN fighter_classes fc ON fc.id = ft.fighter_class_id
    WHERE ft.id = p_fighter_type_id
    RETURNING * INTO v_inserted_fighter;

    v_fighter_id := v_inserted_fighter.id;

    -- Handle default equipment and selected equipment in a single step
    WITH default_equipment_insert AS (
      INSERT INTO fighter_equipment (fighter_id, equipment_id, original_cost, purchase_cost)
      SELECT 
        v_fighter_id, 
        fd.equipment_id,
        e.cost as original_cost,
        0 as purchase_cost
      FROM fighter_defaults fd
      JOIN equipment e ON e.id = fd.equipment_id
      WHERE fd.fighter_type_id = p_fighter_type_id
      AND fd.equipment_id IS NOT NULL
      RETURNING id as fighter_equipment_id, equipment_id, original_cost, purchase_cost
    ),
    selected_equipment_insert AS (
      INSERT INTO fighter_equipment (fighter_id, equipment_id, original_cost, purchase_cost)
      SELECT 
        v_fighter_id,
        e.id,
        e.cost as original_cost,
        COALESCE(
          (
            SELECT (opt->>'cost')::integer
            FROM fighter_equipment_selections fes,
            jsonb_array_elements(fes.equipment_selection->'weapons'->'options') as opt
            WHERE fes.fighter_type_id = p_fighter_type_id
            AND opt->>'id' = e.id::text
            LIMIT 1
          ),
          e.cost
        ) as purchase_cost
      FROM unnest(p_selected_equipment_ids) as equipment_id
      JOIN equipment e ON e.id = equipment_id
      RETURNING id as fighter_equipment_id, equipment_id, original_cost, purchase_cost
    ),
    all_equipment AS (
      SELECT * FROM default_equipment_insert
      UNION ALL
      SELECT * FROM selected_equipment_insert
      WHERE selected_equipment_insert.equipment_id IS NOT NULL
    ),
    equipment_details AS (
      SELECT 
        ae.fighter_equipment_id,
        e.id as equipment_id,
        e.equipment_name,
        e.equipment_type,
        ae.purchase_cost,
        COALESCE(
          (SELECT jsonb_agg(
            jsonb_build_object(
              'id', wp.id,
              'profile_name', wp.profile_name,
              'range_short', wp.range_short,
              'range_long', wp.range_long,
              'acc_short', wp.acc_short,
              'acc_long', wp.acc_long,
              'strength', wp.strength,
              'damage', wp.damage,
              'ap', wp.ap,
              'ammo', wp.ammo,
              'traits', wp.traits,
              'is_default_profile', wp.is_default_profile,
              'weapon_group_id', wp.weapon_group_id,
              'sort_order', wp.sort_order
            )
          )
          FROM weapon_profiles wp
          WHERE wp.weapon_id = e.id
        ), '[]'::jsonb) as weapon_profiles
      FROM all_equipment ae
      JOIN equipment e ON e.id = ae.equipment_id
    )
    SELECT 
      jsonb_agg(
        jsonb_build_object(
          'fighter_equipment_id', fighter_equipment_id,
          'equipment_id', equipment_id,
          'equipment_name', equipment_name,
          'equipment_type', equipment_type,
          'cost', purchase_cost,
          'weapon_profiles', weapon_profiles
        )
      ),
      SUM(purchase_cost)
    INTO 
      v_equipment_info,
      v_total_equipment_cost
    FROM equipment_details;

    -- Insert default skills and get skill info
    WITH skill_insert AS (
      INSERT INTO fighter_skills (fighter_id, skill_id)
      SELECT 
        v_fighter_id,
        fd.skill_id
      FROM fighter_defaults fd
      WHERE fd.fighter_type_id = p_fighter_type_id
      AND fd.skill_id IS NOT NULL
      RETURNING skill_id
    ),
    skill_details AS (
      SELECT 
        s.id as skill_id,
        s.name as skill_name
      FROM skill_insert si
      JOIN skills s ON s.id = si.skill_id
    )
    SELECT 
      jsonb_agg(
        jsonb_build_object(
          'skill_id', skill_id,
          'skill_name', skill_name
        )
      )
    INTO v_skills_info
    FROM skill_details;

    -- Calculate total cost (fighter cost plus selected equipment cost)
    v_total_cost := v_fighter_cost + COALESCE(v_total_equipment_cost, 0);

    -- Check credits and update gang in one step
    IF v_gang_credits < v_total_cost THEN
      RAISE EXCEPTION 'Not enough credits to add this fighter with equipment';
    END IF;

    UPDATE gangs
    SET 
      credits = credits - v_total_cost,
      last_updated = NOW()
    WHERE id = p_gang_id;

    -- Return result
    RETURN jsonb_build_object(
      'fighter_id', v_fighter_id,
      'fighter_name', v_inserted_fighter.fighter_name,
      'fighter_type', v_fighter_type,
      'fighter_class', v_fighter_class,
      'fighter_class_id', v_fighter_class_id,
      'free_skill', v_free_skill,
      'cost', v_fighter_cost,
      'total_cost', v_total_cost,
      'stats', jsonb_build_object(
        'movement', v_inserted_fighter.movement,
        'weapon_skill', v_inserted_fighter.weapon_skill,
        'ballistic_skill', v_inserted_fighter.ballistic_skill,
        'strength', v_inserted_fighter.strength,
        'toughness', v_inserted_fighter.toughness,
        'wounds', v_inserted_fighter.wounds,
        'initiative', v_inserted_fighter.initiative,
        'attacks', v_inserted_fighter.attacks,
        'leadership', v_inserted_fighter.leadership,
        'cool', v_inserted_fighter.cool,
        'willpower', v_inserted_fighter.willpower,
        'intelligence', v_inserted_fighter.intelligence,
        'xp', v_inserted_fighter.xp,
        'kills', v_inserted_fighter.kills
      ),
      'equipment', COALESCE(v_equipment_info, '[]'::jsonb),
      'skills', COALESCE(v_skills_info, '[]'::jsonb),
      'special_rules', v_inserted_fighter.special_rules
    );
  END;
EXCEPTION
  WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
    RETURN jsonb_build_object('error', v_error);
END;
$function$;