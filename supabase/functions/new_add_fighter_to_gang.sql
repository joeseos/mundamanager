-- First drop all versions of the function
DROP FUNCTION IF EXISTS new_add_fighter_to_gang(TEXT, UUID, UUID);
DROP FUNCTION IF EXISTS new_add_fighter_to_gang(TEXT, UUID, UUID, INTEGER);
DROP FUNCTION IF EXISTS new_add_fighter_to_gang(TEXT, UUID, UUID, INTEGER, UUID[]);
DROP FUNCTION IF EXISTS new_add_fighter_to_gang(TEXT, UUID, UUID, INTEGER, UUID[], UUID);
DROP FUNCTION IF EXISTS new_add_fighter_to_gang(TEXT, UUID, UUID, INTEGER, UUID[], UUID, BOOLEAN);
DROP FUNCTION IF EXISTS new_add_fighter_to_gang(TEXT, UUID, UUID, INTEGER, UUID[], UUID, BOOLEAN, BOOLEAN);

CREATE OR REPLACE FUNCTION new_add_fighter_to_gang(
  p_fighter_name TEXT,
  p_fighter_type_id UUID,
  p_gang_id UUID,
  p_cost INTEGER = NULL,
  p_selected_equipment_ids UUID[] = NULL,
  p_user_id UUID = NULL,
  p_use_base_cost_for_rating BOOLEAN = TRUE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, private
AS $function$
DECLARE
  v_fighter_id UUID;
  v_fighter_cost INTEGER;
  v_fighter_base_cost INTEGER;
  v_total_equipment_cost INTEGER := 0;
  v_total_cost INTEGER;
  v_gang_credits INTEGER;
  v_fighter_type TEXT;
  v_fighter_class TEXT;
  v_fighter_class_id UUID;
  v_fighter_sub_type_id UUID;
  v_free_skill BOOLEAN;
  v_equipment_info JSONB;
  v_skills_info JSONB;
  v_error TEXT;
  v_inserted_fighter RECORD;
  v_gang_owner_id UUID;
  v_is_admin BOOLEAN;
  v_user_has_access BOOLEAN;
  v_rating_cost INTEGER;
  v_expected_cost INTEGER;
BEGIN
  -- Check if user_id parameter exists, use auth.uid() if not provided
  IF p_user_id IS NULL THEN
    p_user_id := auth.uid();
  END IF;

  -- Set the current user context for private.is_admin() function
  PERFORM set_config('request.jwt.claim.sub', p_user_id::text, true);
  
  -- Check if user is an admin using the existing helper function
  SELECT private.is_admin() INTO v_is_admin;

  -- Get fighter type details, gang credits, and gang owner's user_id in a single query
  WITH fighter_and_gang AS (
    SELECT 
      ft.fighter_type,
      fc.class_name as fighter_class,
      fc.id as fighter_class_id,
      ft.fighter_sub_type_id,
      ft.free_skill,
      CASE 
        WHEN p_cost IS NOT NULL THEN p_cost
        ELSE ft.cost
      END as fighter_cost,
      ft.cost as fighter_base_cost,
      g.credits as gang_credits,
      g.user_id as gang_owner_id
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
    fighter_sub_type_id,
    free_skill,
    fighter_cost,
    fighter_base_cost,
    gang_credits,
    gang_owner_id
  INTO 
    v_fighter_type,
    v_fighter_class,
    v_fighter_class_id,
    v_fighter_sub_type_id,
    v_free_skill,
    v_fighter_cost,
    v_fighter_base_cost,
    v_gang_credits,
    v_gang_owner_id
  FROM fighter_and_gang;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Fighter type or gang not found');
  END IF;

  -- If the user is not an admin, check if they are the gang owner
  IF NOT v_is_admin THEN
    SELECT EXISTS (
      SELECT 1
      FROM gangs
      WHERE id = p_gang_id AND user_id = p_user_id
    ) INTO v_user_has_access;
    
    IF NOT v_user_has_access THEN
      RETURN json_build_object('error', 'User does not have permission to add fighters to this gang');
    END IF;
  END IF;

  -- Insert fighter and get equipment in a single transaction
  BEGIN
    -- Drop temp table if it exists from a previous run
    DROP TABLE IF EXISTS temp_equipment;
    
    -- Log all inputs for debugging
    RAISE NOTICE 'INPUTS: fighter_type_id: %, gang_id: %, cost: %, equipment_ids: %, use_base_cost: %', 
      p_fighter_type_id, p_gang_id, p_cost, p_selected_equipment_ids, p_use_base_cost_for_rating;
    
    -- Query and log the base cost directly
    SELECT cost INTO v_fighter_base_cost 
    FROM fighter_types 
    WHERE id = p_fighter_type_id;
    
    RAISE NOTICE 'Base cost from database: %', v_fighter_base_cost;
    
    -- Calculate cost of ONLY SELECTED equipment (no default equipment)
    -- Use the costs from fighter_equipment_selections instead of equipment table
    SELECT COALESCE(SUM(option_cost), 0)
    INTO v_total_equipment_cost
    FROM (
      -- Get selected equipment with costs from fighter_equipment_selections
      SELECT DISTINCT 
        e.id, 
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
        ) AS option_cost,
        e.equipment_name
      FROM unnest(p_selected_equipment_ids) AS equip_id
      JOIN equipment e ON e.id = equip_id
    ) e;
    
    RAISE NOTICE 'Selected equipment cost from fighter_equipment_selections: %', v_total_equipment_cost;
    
    -- Calculate total expected cost for fighter
    v_expected_cost := v_fighter_base_cost + v_total_equipment_cost;
    
    RAISE NOTICE 'COST BREAKDOWN: Base cost: %, Equipment cost: %, Expected total: %', 
      v_fighter_base_cost, v_total_equipment_cost, v_expected_cost;
    
    -- Insert the fighter - when checkbox is checked, use base + equipment cost
    INSERT INTO fighters (
      fighter_name, 
      gang_id, 
      fighter_type_id,
      fighter_class_id,
      fighter_sub_type_id,
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
      special_rules,
      user_id
    )
    SELECT 
      p_fighter_name,
      p_gang_id,
      p_fighter_type_id,
      fc.id as fighter_class_id,
      ft.fighter_sub_type_id,
      ft.fighter_type,
      fc.class_name as fighter_class,
      ft.free_skill,
      CASE 
        WHEN p_use_base_cost_for_rating THEN v_expected_cost  -- Use the explicitly calculated value
        ELSE p_cost
      END as credits,  -- Make sure we use p_cost, not fighterCost
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
      ft.special_rules,
      v_gang_owner_id
    FROM fighter_types ft
    JOIN fighter_classes fc ON fc.id = ft.fighter_class_id
    WHERE ft.id = p_fighter_type_id
    RETURNING * INTO v_inserted_fighter;

    v_fighter_id := v_inserted_fighter.id;

    -- Insert equipment with cost=0 (simpler query)
    WITH all_equipment_ids AS (
      -- Default equipment
      SELECT DISTINCT equipment_id
      FROM fighter_defaults
      WHERE fighter_type_id = p_fighter_type_id
      AND equipment_id IS NOT NULL
      
      UNION
      
      -- Selected equipment
      SELECT DISTINCT unnest AS equipment_id
      FROM unnest(p_selected_equipment_ids)
    ),
    -- Get the costs from fighter_equipment_selections for selected equipment
    equipment_costs AS (
      SELECT 
        ae.equipment_id,
        CASE 
          WHEN ae.equipment_id = ANY(p_selected_equipment_ids) THEN
            COALESCE(
              (
                SELECT (opt->>'cost')::integer
                FROM fighter_equipment_selections fes,
                     jsonb_array_elements(fes.equipment_selection->'weapons'->'options') as opt
                WHERE fes.fighter_type_id = p_fighter_type_id
                AND opt->>'id' = ae.equipment_id::text
                LIMIT 1
              ),
              e.cost
            )
          ELSE e.cost
        END AS original_cost
      FROM all_equipment_ids ae
      JOIN equipment e ON e.id = ae.equipment_id
    ),
    inserted_equipment AS (
      INSERT INTO fighter_equipment (fighter_id, equipment_id, original_cost, purchase_cost)
      SELECT 
        v_fighter_id,
        ec.equipment_id,
        ec.original_cost, -- Store the cost from fighter_equipment_selections
        0      -- Always 0 purchase cost
      FROM equipment_costs ec
      RETURNING id, equipment_id, original_cost
    )
    SELECT 
      jsonb_agg(
        jsonb_build_object(
          'fighter_equipment_id', fe.id,
          'equipment_id', e.id,
          'equipment_name', e.equipment_name,
          'equipment_type', e.equipment_type,
          'cost', 0,
          'original_cost', fe.original_cost, -- Add this to help with debugging
          'weapon_profiles', COALESCE(
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
          ), '[]'::jsonb)
        )
      )
    INTO v_equipment_info
    FROM inserted_equipment fe
    JOIN equipment e ON e.id = fe.equipment_id;

    -- Insert default skills and get skill info
    WITH skill_insert AS (
      INSERT INTO fighter_skills (fighter_id, skill_id, user_id)
      SELECT 
        v_fighter_id,
        fd.skill_id,
        v_gang_owner_id
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

    -- Always use the entered cost for payment
    v_total_cost := p_cost;  -- Use p_cost directly, not v_fighter_cost

    -- For the fighter's cost attribute (used for rating):
    -- If checkbox is checked: use base cost + equipment cost (equipment cost is on the fighter)
    -- If checkbox is unchecked: use the entered cost value (what the user paid)
    IF p_use_base_cost_for_rating THEN
      v_rating_cost := v_expected_cost;  -- Use the same value we calculated above
    ELSE
      v_rating_cost := p_cost;  -- Use p_cost, not v_fighter_cost
    END IF;

    -- Debug information for troubleshooting
    RAISE NOTICE 'FINAL VALUES: p_cost: %, v_total_cost: %, v_rating_cost: %, fighter credits: %', 
      p_cost, v_total_cost, v_rating_cost, v_inserted_fighter.credits;

    -- Check if gang has enough credits for the payment
    IF v_total_cost > 0 AND v_gang_credits < v_total_cost THEN
      RAISE EXCEPTION 'Not enough credits to add this fighter (Cost: %, Available: %)', v_total_cost, v_gang_credits;
    END IF;

    -- Update gang credits - subtract the entered cost value
    IF v_total_cost > 0 THEN
      UPDATE gangs
      SET 
        credits = credits - v_total_cost,
        last_updated = NOW()
      WHERE id = p_gang_id;
    ELSE
      -- Just update the last_updated timestamp if cost is zero
      UPDATE gangs
      SET 
        last_updated = NOW()
      WHERE id = p_gang_id;
    END IF;

    -- Return result
    RETURN jsonb_build_object(
      'fighter_id', v_fighter_id,
      'fighter_name', v_inserted_fighter.fighter_name,
      'fighter_type', v_fighter_type,
      'fighter_class', v_fighter_class,
      'fighter_class_id', v_fighter_class_id,
      'fighter_sub_type_id', v_fighter_sub_type_id,
      'free_skill', v_free_skill,
      'cost', p_cost,  -- Use p_cost here, not v_fighter_cost
      'base_cost', v_fighter_base_cost,
      'equipment_cost', v_total_equipment_cost,
      'expected_total', v_expected_cost,  -- Add this for clarity
      'rating_cost', v_rating_cost, 
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

-- Revoke and grant permissions
REVOKE ALL ON FUNCTION new_add_fighter_to_gang(TEXT, UUID, UUID, INTEGER, UUID[], UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION new_add_fighter_to_gang(TEXT, UUID, UUID, INTEGER, UUID[], UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION new_add_fighter_to_gang(TEXT, UUID, UUID, INTEGER, UUID[], UUID, BOOLEAN) TO service_role; 