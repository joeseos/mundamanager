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
  p_selected_equipment JSONB = NULL,  -- Changed from UUID[] to JSONB with costs
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
  v_gang_type_id UUID;
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

  -- Get fighter type details, gang credits, gang type, and gang owner's user_id in a single query
  WITH fighter_and_gang AS (
    SELECT 
      ft.fighter_type,
      fc.class_name as fighter_class,
      fc.id as fighter_class_id,
      ft.fighter_sub_type_id,
      ft.free_skill,
      CASE 
        WHEN p_cost IS NOT NULL THEN p_cost
        ELSE COALESCE(ftgc.adjusted_cost, ft.cost)  -- Use adjusted cost if available
      END as fighter_cost,
      COALESCE(ftgc.adjusted_cost, ft.cost) as fighter_base_cost,  -- Use adjusted cost as base
      g.credits as gang_credits,
      g.gang_type_id,
      g.user_id as gang_owner_id
    FROM fighter_types ft
    JOIN fighter_classes fc ON fc.id = ft.fighter_class_id
    CROSS JOIN gangs g
    LEFT JOIN fighter_type_gang_cost ftgc ON ftgc.fighter_type_id = ft.id 
        AND ftgc.gang_type_id = g.gang_type_id
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
    gang_type_id,
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
    v_gang_type_id,
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
    -- Log all inputs for debugging
    RAISE NOTICE 'INPUTS: fighter_type_id: %, gang_id: %, gang_type_id: %, cost: %, equipment: %, use_base_cost: %', 
      p_fighter_type_id, p_gang_id, v_gang_type_id, p_cost, p_selected_equipment, p_use_base_cost_for_rating;
    
    -- Calculate equipment cost from frontend data (much simpler!)
    SELECT COALESCE(SUM((item->>'cost')::integer * (item->>'quantity')::integer), 0)
    INTO v_total_equipment_cost
    FROM jsonb_array_elements(COALESCE(p_selected_equipment, '[]'::jsonb)) AS item;
    
    RAISE NOTICE 'Selected equipment cost: %', v_total_equipment_cost;
    
    -- Calculate total expected cost for fighter (using adjusted base cost)
    v_expected_cost := v_fighter_base_cost + v_total_equipment_cost;
    
    RAISE NOTICE 'COST BREAKDOWN: Adjusted base cost: %, Equipment cost: %, Expected total: %', 
      v_fighter_base_cost, v_total_equipment_cost, v_expected_cost;
    
    -- Use the entered cost value for payment
    v_total_cost := p_cost;
    
    -- Set the rating cost correctly based on checkbox
    IF p_use_base_cost_for_rating THEN
      v_rating_cost := v_expected_cost;  -- Use calculated cost (base + equipment)
    ELSE
      v_rating_cost := p_cost;  -- Use what user entered
    END IF;

    -- Check if gang has enough credits for the payment BEFORE inserting fighter
    IF v_total_cost > 0 AND v_gang_credits < v_total_cost THEN
      RETURN json_build_object('error', 'Not enough credits to add this fighter');
    END IF;
    
    -- Insert the fighter with the correct credits value for rating
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
      v_rating_cost as credits,  -- Use the calculated rating cost
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

    -- Insert equipment with costs from frontend data (much simpler!)
    WITH selected_equipment AS (
      SELECT 
        (item->>'equipment_id')::uuid as equipment_id,
        (item->>'cost')::integer as original_cost,
        (item->>'quantity')::integer as quantity
      FROM jsonb_array_elements(COALESCE(p_selected_equipment, '[]'::jsonb)) AS item
    ),
    -- Get equipment that should be excluded (defaults that have replacements selected)
    excluded_defaults AS (
      SELECT DISTINCT default_item.equipment_id
      FROM selected_equipment se
      JOIN fighter_equipment_selections fes ON fes.fighter_type_id = p_fighter_type_id
      CROSS JOIN LATERAL (
        -- Check in optional weapons
        SELECT (default_item->>'id')::uuid as equipment_id
        FROM jsonb_array_elements(fes.equipment_selection->'optional'->'weapons') as weapon_group,
             jsonb_array_elements(weapon_group) as default_item,
             jsonb_array_elements(default_item->'replacements') as replacement
        WHERE (default_item->>'is_default')::boolean = true
        AND (replacement->>'id')::uuid = se.equipment_id
        
        UNION ALL
        
        -- Check in optional wargear  
        SELECT (default_item->>'id')::uuid as equipment_id
        FROM jsonb_array_elements(fes.equipment_selection->'optional'->'wargear') as wargear_group,
             jsonb_array_elements(wargear_group) as default_item,
             jsonb_array_elements(default_item->'replacements') as replacement
        WHERE (default_item->>'is_default')::boolean = true
        AND (replacement->>'id')::uuid = se.equipment_id
        
        UNION ALL
        
        -- Check in single weapons
        SELECT (default_item->>'id')::uuid as equipment_id
        FROM jsonb_array_elements(fes.equipment_selection->'single'->'weapons') as default_item,
             jsonb_array_elements(default_item->'replacements') as replacement
        WHERE (default_item->>'is_default')::boolean = true
        AND (replacement->>'id')::uuid = se.equipment_id
        
        UNION ALL
        
        -- Check in single wargear
        SELECT (default_item->>'id')::uuid as equipment_id
        FROM jsonb_array_elements(fes.equipment_selection->'single'->'wargear') as default_item,
             jsonb_array_elements(default_item->'replacements') as replacement
        WHERE (default_item->>'is_default')::boolean = true
        AND (replacement->>'id')::uuid = se.equipment_id
        
        UNION ALL
        
        -- Check in multiple weapons
        SELECT (default_item->>'id')::uuid as equipment_id
        FROM jsonb_array_elements(fes.equipment_selection->'multiple'->'weapons') as weapon_group,
             jsonb_array_elements(weapon_group) as default_item,
             jsonb_array_elements(default_item->'replacements') as replacement
        WHERE (default_item->>'is_default')::boolean = true
        AND (replacement->>'id')::uuid = se.equipment_id
        
        UNION ALL
        
        -- Check in multiple wargear
        SELECT (default_item->>'id')::uuid as equipment_id
        FROM jsonb_array_elements(fes.equipment_selection->'multiple'->'wargear') as wargear_group,
             jsonb_array_elements(wargear_group) as default_item,
             jsonb_array_elements(default_item->'replacements') as replacement
        WHERE (default_item->>'is_default')::boolean = true
        AND (replacement->>'id')::uuid = se.equipment_id
      ) default_item
    ),
    default_equipment AS (
      -- Add default equipment from fighter_defaults, but exclude those that have been replaced
      SELECT equipment_id, 0 as original_cost, 1 as quantity
      FROM fighter_defaults
      WHERE fighter_type_id = p_fighter_type_id
      AND equipment_id IS NOT NULL
      AND equipment_id NOT IN (SELECT equipment_id FROM excluded_defaults)
    ),
    all_equipment AS (
      SELECT * FROM selected_equipment
      UNION ALL
      SELECT * FROM default_equipment
    ),
    expanded_equipment AS (
      -- Create multiple rows based on quantity
      SELECT equipment_id, original_cost
      FROM all_equipment ae, generate_series(1, ae.quantity)
    ),
    inserted_equipment AS (
      INSERT INTO fighter_equipment (fighter_id, equipment_id, original_cost, purchase_cost)
      SELECT 
        v_fighter_id,
        ee.equipment_id,
        ee.original_cost,
        0  -- Always 0 purchase cost
      FROM expanded_equipment ee
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
          'original_cost', fe.original_cost,
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

    -- Debug information for troubleshooting
    RAISE NOTICE 'FINAL VALUES: p_cost: %, v_total_cost: %, v_rating_cost: %, fighter credits: %', 
      p_cost, v_total_cost, v_rating_cost, v_inserted_fighter.credits;

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
      'fighter_sub_type', 
        CASE 
          WHEN v_fighter_sub_type_id IS NOT NULL THEN (
            SELECT jsonb_build_object(
              'fighter_sub_type', sub_type_name,
              'fighter_sub_type_id', id
            )
            FROM fighter_sub_types
            WHERE id = v_fighter_sub_type_id
          )
          ELSE NULL
        END,
      'free_skill', v_free_skill,
      'cost', p_cost,  -- User entered cost
      'base_cost', v_fighter_base_cost,  -- Adjusted base cost
      'equipment_cost', v_total_equipment_cost,
      'expected_total', v_expected_cost,  -- Calculated expected total
      'rating_cost', v_rating_cost,  -- Rating cost based on checkbox
      'total_cost', v_total_cost,  -- Total cost paid
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
REVOKE ALL ON FUNCTION new_add_fighter_to_gang(TEXT, UUID, UUID, INTEGER, JSONB, UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION new_add_fighter_to_gang(TEXT, UUID, UUID, INTEGER, JSONB, UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION new_add_fighter_to_gang(TEXT, UUID, UUID, INTEGER, JSONB, UUID, BOOLEAN) TO service_role;