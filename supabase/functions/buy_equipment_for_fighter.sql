-- Drop existing functions with their exact signatures
DROP FUNCTION IF EXISTS buy_equipment_for_fighter(UUID, UUID, UUID);
DROP FUNCTION IF EXISTS buy_equipment_for_fighter(UUID, UUID, UUID, INTEGER, UUID);
DROP FUNCTION IF EXISTS buy_equipment_for_fighter(UUID, UUID, UUID, INTEGER, UUID, BOOLEAN);
DROP FUNCTION IF EXISTS buy_equipment_for_fighter(UUID, UUID, UUID, INTEGER, UUID, BOOLEAN, BOOLEAN);
DROP FUNCTION IF EXISTS buy_equipment_for_fighter(UUID, UUID, UUID, INTEGER, UUID, BOOLEAN, BOOLEAN, UUID);
DROP FUNCTION IF EXISTS buy_equipment_for_fighter(UUID, UUID, UUID, INTEGER, UUID, BOOLEAN, BOOLEAN, UUID, BOOLEAN);

-- Then create our new function with vehicle support, user_id, fighter effect support, use_base_cost_for_rating, custom equipment support, and gang_stash support
CREATE OR REPLACE FUNCTION buy_equipment_for_fighter(
  fighter_id UUID DEFAULT NULL,
  equipment_id UUID DEFAULT NULL,
  gang_id UUID DEFAULT NULL,
  manual_cost INTEGER DEFAULT NULL,
  vehicle_id UUID DEFAULT NULL,
  master_crafted BOOLEAN DEFAULT FALSE,
  use_base_cost_for_rating BOOLEAN DEFAULT TRUE,
  custom_equipment_id UUID DEFAULT NULL,
  buy_for_gang_stash BOOLEAN DEFAULT FALSE
)
RETURNS JSONB 
SECURITY DEFINER
SET search_path = public, auth, private
AS $$
DECLARE
  updated_fighter JSONB;
  updated_vehicle JSONB;
  updated_gang JSONB;
  new_equipment JSONB;
  new_stash_item JSONB;
  base_cost INTEGER;
  adjusted_cost_final INTEGER;
  default_profile RECORD;
  custom_equipment_record RECORD;
  current_gang_credits INTEGER;
  v_new_equipment_id UUID;
  v_new_stash_id UUID;
  v_equipment_type TEXT;
  v_gang_type_id UUID;
  v_gang RECORD;
  v_adjusted_cost numeric;
  result JSONB;
  final_purchase_cost INTEGER;
  v_owner_type TEXT;
  v_user_id UUID;
  v_effect_type_record RECORD;
  v_fighter_effect_id UUID;
  v_fighter_effect_category_id UUID;
  v_fighter_effect_type_id UUID;
  v_fighter_effect JSONB;
  v_effect_result JSON;
  v_fighter_record RECORD;
  v_effect_details RECORD;
  v_fighter_effect_modifiers JSONB;
  v_collections_data JSONB;
  v_final_result JSONB;
  v_has_effect BOOLEAN := FALSE;
  v_fighter_type_id UUID;
  rating_cost INTEGER;
  v_is_custom_equipment BOOLEAN := FALSE;
  v_equipment_name TEXT;
  v_custom_weapon_profiles JSONB;
BEGIN
  -- Get the authenticated user's ID
  v_user_id := auth.uid();

  -- Validate required parameters - exactly one of equipment_id or custom_equipment_id must be provided
  IF (equipment_id IS NULL AND custom_equipment_id IS NULL) OR (equipment_id IS NOT NULL AND custom_equipment_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Exactly one of equipment_id or custom_equipment_id must be provided. equipment_id: %, custom_equipment_id: %', equipment_id, custom_equipment_id;
  END IF;

  IF gang_id IS NULL THEN
    RAISE EXCEPTION 'gang_id is required';
  END IF;

  -- Validate parameters based on whether we're buying for gang stash or not
  IF buy_for_gang_stash THEN
    -- For gang stash purchases, fighter_id and vehicle_id should be null
    IF fighter_id IS NOT NULL OR vehicle_id IS NOT NULL THEN
      RAISE EXCEPTION 'When buying for gang stash, fighter_id and vehicle_id must be null';
    END IF;
  ELSE
    -- For regular purchases, exactly one of fighter_id or vehicle_id is required
    IF (fighter_id IS NULL AND vehicle_id IS NULL) OR (fighter_id IS NOT NULL AND vehicle_id IS NOT NULL) THEN
      RAISE EXCEPTION 'Exactly one of fighter_id or vehicle_id must be provided';
    END IF;
  END IF;

  -- Set flags for custom equipment
  v_is_custom_equipment := custom_equipment_id IS NOT NULL;

  -- Set owner type for later use
  IF buy_for_gang_stash THEN
    v_owner_type := 'gang_stash';
  ELSE
    v_owner_type := CASE
      WHEN fighter_id IS NOT NULL THEN 'fighter'
      ELSE 'vehicle'
    END;
  END IF;

  -- Initialize custom weapon profiles
  v_custom_weapon_profiles := '[]'::jsonb;

  -- Security check: Verify user has access to the gang
  IF NOT EXISTS (
    SELECT 1 FROM gangs g
    WHERE g.id = gang_id
    AND (g.user_id = v_user_id
      OR EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = v_user_id
        AND profiles.user_role = 'admin'
      )
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized to access this gang';
  END IF;

  -- Get gang details for discounts
  SELECT * INTO v_gang
  FROM gangs
  WHERE id = buy_equipment_for_fighter.gang_id;

  IF v_gang IS NULL THEN
    RAISE EXCEPTION 'Gang not found. ID: %', buy_equipment_for_fighter.gang_id;
  END IF;

  v_gang_type_id := v_gang.gang_type_id;
  current_gang_credits := v_gang.credits;

  -- Get fighter_type_id if this is for a fighter
  IF v_owner_type = 'fighter' THEN
    SELECT fighter_type_id INTO v_fighter_type_id
    FROM fighters
    WHERE id = buy_equipment_for_fighter.fighter_id;
  END IF;

  -- Handle custom equipment vs regular equipment
  IF v_is_custom_equipment THEN
    -- Get custom equipment details
    SELECT
      ce.cost::integer as base_cost,
      ce.cost::integer as adjusted_cost_final,
      ce.equipment_type,
      ce.equipment_name
    INTO custom_equipment_record
    FROM custom_equipment ce
    WHERE ce.id = buy_equipment_for_fighter.custom_equipment_id
    AND ce.user_id = v_user_id; -- Security: only allow user's own custom equipment

    IF custom_equipment_record IS NULL THEN
      RAISE EXCEPTION 'Custom equipment not found or not accessible. custom_equipment_id: %, user_id: %', custom_equipment_id, v_user_id;
    END IF;

    base_cost := custom_equipment_record.base_cost;
    adjusted_cost_final := custom_equipment_record.adjusted_cost_final;
    v_equipment_type := custom_equipment_record.equipment_type;
    v_equipment_name := custom_equipment_record.equipment_name;

    -- For custom equipment, fetch custom weapon profiles if it's a weapon
    IF v_equipment_type = 'weapon' THEN
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', cwp.id,
          'profile_name', cwp.profile_name,
          'range_short', cwp.range_short,
          'range_long', cwp.range_long,
          'acc_short', cwp.acc_short,
          'acc_long', cwp.acc_long,
          'strength', cwp.strength,
          'ap', cwp.ap,
          'damage', cwp.damage,
          'ammo', cwp.ammo,
          'traits', cwp.traits,
          'sort_order', cwp.sort_order
        )
        ORDER BY cwp.sort_order NULLS LAST, cwp.profile_name
      ) INTO v_custom_weapon_profiles
      FROM custom_weapon_profiles cwp
      WHERE (cwp.custom_equipment_id = buy_equipment_for_fighter.custom_equipment_id 
             OR cwp.weapon_group_id = buy_equipment_for_fighter.custom_equipment_id)
      AND cwp.user_id = v_user_id;

      -- If no profiles found, set to empty array
      IF v_custom_weapon_profiles IS NULL THEN
        v_custom_weapon_profiles := '[]'::jsonb;
      END IF;
    END IF;

    -- Custom equipment doesn't have default_profile from weapon_profiles table
    default_profile := NULL;
  ELSE
    -- Get the adjusted_cost value if it exists (considering both gang and fighter type discounts)
    -- For gang stash purchases, only consider gang-level discounts
    SELECT adjusted_cost::numeric INTO v_adjusted_cost
    FROM equipment_discounts ed
    WHERE ed.equipment_id = buy_equipment_for_fighter.equipment_id
    AND (
      (buy_for_gang_stash AND ed.gang_type_id = v_gang_type_id AND ed.fighter_type_id IS NULL)
      OR 
      (NOT buy_for_gang_stash AND (
        (ed.gang_type_id = v_gang_type_id AND ed.fighter_type_id IS NULL)
        OR 
        (ed.fighter_type_id = v_fighter_type_id AND ed.gang_type_id IS NULL)
      ))
    );

    -- Get the equipment base cost
    SELECT
      e.cost::integer as base_cost,
      CASE
        WHEN v_adjusted_cost IS NOT NULL THEN v_adjusted_cost::integer
        ELSE e.cost::integer
      END as adjusted_cost_final,
      e.equipment_type,
      e.equipment_name,
      wp.*
    INTO default_profile
    FROM equipment e
    LEFT JOIN weapon_profiles wp ON wp.weapon_id = e.id
    WHERE e.id = buy_equipment_for_fighter.equipment_id;

    IF default_profile IS NULL THEN
      RAISE EXCEPTION 'Regular equipment not found. equipment_id: %', equipment_id;
    END IF;

    base_cost := default_profile.base_cost;
    adjusted_cost_final := default_profile.adjusted_cost_final;
    v_equipment_type := default_profile.equipment_type;
    v_equipment_name := default_profile.equipment_name;
  END IF;

  -- Determine final purchase cost (manual or calculated)
  -- This is the cost that will be deducted from gang credits
  final_purchase_cost := COALESCE(manual_cost, adjusted_cost_final);

  -- Check if gang has enough credits using the final purchase cost
  -- Allow purchase if cost is 0 (free equipment)
  IF final_purchase_cost > 0 AND current_gang_credits < final_purchase_cost THEN
    RAISE EXCEPTION 'Gang has insufficient credits. Required: %, Available: %', final_purchase_cost, current_gang_credits;
  END IF;

  -- Determine the cost to use for fighter rating based on the use_base_cost_for_rating flag
  -- This value will be returned as rating_cost and used for fighter rating calculations
  IF use_base_cost_for_rating THEN
    -- For master-crafted weapons, we need to apply the 25% increase to the adjusted cost
    IF v_equipment_type = 'weapon' AND master_crafted = TRUE THEN
      -- Increase by 25% and round up to nearest 5
      rating_cost := CEIL((adjusted_cost_final * 1.25) / 5) * 5;
    ELSE
      rating_cost := adjusted_cost_final;  -- Using adjusted_cost_final (discounted price)
    END IF;
  ELSE
    -- When unchecked: Use the actual cost paid by the user for rating
    IF v_equipment_type = 'weapon' AND master_crafted = TRUE THEN
      -- For master-crafted weapons, increase by 25% and round up to nearest 5
      rating_cost := CEIL((final_purchase_cost * 1.25) / 5) * 5;
    ELSE
      rating_cost := final_purchase_cost;  -- Using the actual cost paid by the user
    END IF;
  END IF;

  -- Get owner details for response based on owner type
  IF v_owner_type = 'fighter' THEN
    SELECT * INTO v_fighter_record
    FROM fighters f
    WHERE f.id = buy_equipment_for_fighter.fighter_id;
    
    SELECT jsonb_build_object(
      'id', f.id,
      'fighter_name', f.fighter_name,
      'credits', f.credits
    ) INTO updated_fighter
    FROM fighters f
    WHERE f.id = buy_equipment_for_fighter.fighter_id;
  ELSIF v_owner_type = 'vehicle' THEN
    SELECT jsonb_build_object(
      'id', v.id,
      'vehicle_name', v.vehicle_name
    ) INTO updated_vehicle
    FROM vehicles v
    WHERE v.id = buy_equipment_for_fighter.vehicle_id;
  END IF;

  -- Add equipment to appropriate table based on purchase type
  IF buy_for_gang_stash THEN
    -- Insert into gang_stash table
    INSERT INTO gang_stash (
      id,
      created_at,
      gang_id,
      equipment_id,
      cost,
      is_master_crafted,
      custom_equipment_id
    )
    VALUES (
      gen_random_uuid(),
      now(),
      buy_equipment_for_fighter.gang_id,
      buy_equipment_for_fighter.equipment_id,
      final_purchase_cost,
      CASE 
        WHEN v_equipment_type = 'weapon' AND buy_equipment_for_fighter.master_crafted = TRUE THEN TRUE
        ELSE FALSE
      END,
      buy_equipment_for_fighter.custom_equipment_id
    )
    RETURNING id INTO v_new_stash_id;

    -- Update gang's credits AFTER inserting into stash
    UPDATE gangs 
    SET credits = credits - final_purchase_cost
    WHERE id = buy_equipment_for_fighter.gang_id;

    -- Get updated gang info
    SELECT jsonb_build_object(
      'id', g.id,
      'credits', g.credits
    ) INTO updated_gang
    FROM gangs g
    WHERE g.id = buy_equipment_for_fighter.gang_id;

    -- Build response for gang stash item
    SELECT jsonb_build_object(
      'id', gs.id,
      'gang_id', gs.gang_id,
      'equipment_id', gs.equipment_id,
      'custom_equipment_id', gs.custom_equipment_id,
      'cost', gs.cost,
      'is_master_crafted', gs.is_master_crafted,
      'created_at', gs.created_at,
      'equipment_name', COALESCE(e.equipment_name, ce.equipment_name),
      'equipment_type', COALESCE(e.equipment_type, ce.equipment_type),
      'equipment_category', COALESCE(e.equipment_category, ce.equipment_category)
    ) INTO new_stash_item
    FROM gang_stash gs
    LEFT JOIN equipment e ON e.id = gs.equipment_id
    LEFT JOIN custom_equipment ce ON ce.id = gs.custom_equipment_id
    WHERE gs.id = v_new_stash_id;

    -- Build collections data for gang stash purchase
    v_collections_data := jsonb_build_object(
      'updategangsCollection', jsonb_build_object('records', jsonb_build_array(updated_gang)),
      'insertIntogang_stashCollection', jsonb_build_object('records', jsonb_build_array(new_stash_item)),
      'rating_cost', rating_cost
    );

  ELSE
    -- Insert into fighter_equipment table (existing logic)
    INSERT INTO fighter_equipment (
      id,
      fighter_id,
      vehicle_id,
      equipment_id,
      custom_equipment_id,
      original_cost,
      purchase_cost,
      created_at,
      updated_at,
      user_id,
      is_master_crafted
    )
    VALUES (
      gen_random_uuid(),
      fighter_id,
      vehicle_id,
      buy_equipment_for_fighter.equipment_id,
      buy_equipment_for_fighter.custom_equipment_id,
      base_cost,
      rating_cost, -- Use rating_cost for purchase_cost based on the flag
      now(),
      now(),
      v_user_id,
      CASE 
        WHEN v_equipment_type = 'weapon' AND buy_equipment_for_fighter.master_crafted = TRUE THEN TRUE
        ELSE FALSE
      END
    )
    RETURNING id INTO v_new_equipment_id;

    -- Update gang's credits AFTER inserting equipment
    UPDATE gangs 
    SET credits = credits - final_purchase_cost
    WHERE id = buy_equipment_for_fighter.gang_id;

    -- Get updated gang info
    SELECT jsonb_build_object(
      'id', g.id,
      'credits', g.credits
    ) INTO updated_gang
    FROM gangs g
    WHERE g.id = buy_equipment_for_fighter.gang_id;

    -- Build the response JSON based on equipment type and whether it's custom
    IF v_equipment_type = 'weapon' AND NOT v_is_custom_equipment THEN
      SELECT jsonb_build_object(
        'id', fe.id,
        'fighter_id', fe.fighter_id,
        'vehicle_id', fe.vehicle_id,
        'equipment_id', fe.equipment_id,
        'custom_equipment_id', fe.custom_equipment_id,
        'purchase_cost', fe.purchase_cost,
        'original_cost', fe.original_cost,
        'user_id', fe.user_id,
        'is_master_crafted', fe.is_master_crafted,
        'default_profile', jsonb_build_object(
          'profile_name', default_profile.profile_name,
          'range_short', default_profile.range_short,
          'range_long', default_profile.range_long,
          'acc_short', default_profile.acc_short,
          'acc_long', default_profile.acc_long,
          'strength', default_profile.strength,
          'ap', default_profile.ap,
          'damage', default_profile.damage,
          'ammo', default_profile.ammo,
          'traits', default_profile.traits
        )
      ) INTO new_equipment
      FROM fighter_equipment fe
      WHERE fe.id = v_new_equipment_id;
    ELSIF v_equipment_type = 'weapon' AND v_is_custom_equipment THEN
      -- For custom weapon equipment
      SELECT jsonb_build_object(
        'id', fe.id,
        'fighter_id', fe.fighter_id,
        'vehicle_id', fe.vehicle_id,
        'equipment_id', fe.equipment_id,
        'custom_equipment_id', fe.custom_equipment_id,
        'purchase_cost', fe.purchase_cost,
        'original_cost', fe.original_cost,
        'user_id', fe.user_id,
        'is_master_crafted', fe.is_master_crafted,
        'custom_weapon_profiles', v_custom_weapon_profiles,
        'wargear_details', jsonb_build_object(
          'name', v_equipment_name,
          'cost', base_cost
        )
      ) INTO new_equipment
      FROM fighter_equipment fe
      WHERE fe.id = v_new_equipment_id;
    ELSE
      -- For wargear, custom non-weapon equipment, or any other non-weapon equipment
      SELECT jsonb_build_object(
        'id', fe.id,
        'fighter_id', fe.fighter_id,
        'vehicle_id', fe.vehicle_id,
        'equipment_id', fe.equipment_id,
        'custom_equipment_id', fe.custom_equipment_id,
        'purchase_cost', fe.purchase_cost,
        'original_cost', fe.original_cost,
        'user_id', fe.user_id,
        'is_master_crafted', fe.is_master_crafted,
        'wargear_details', jsonb_build_object(
          'name', v_equipment_name,
          'cost', base_cost
        )
      ) INTO new_equipment
      FROM fighter_equipment fe
      LEFT JOIN equipment e ON e.id = fe.equipment_id
      WHERE fe.id = v_new_equipment_id;
    END IF;

    -- Build the collections data for equipment
    IF v_owner_type = 'fighter' THEN
      v_collections_data := jsonb_build_object(
        'updatefightersCollection', jsonb_build_object('records', jsonb_build_array(updated_fighter)),
        'updategangsCollection', jsonb_build_object('records', jsonb_build_array(updated_gang)),
        'insertIntofighter_equipmentCollection', jsonb_build_object('records', jsonb_build_array(new_equipment)),
        'rating_cost', rating_cost -- Include the rating value in the response
      );
    ELSE
      v_collections_data := jsonb_build_object(
        'updatevehiclesCollection', jsonb_build_object('records', jsonb_build_array(updated_vehicle)),
        'updategangsCollection', jsonb_build_object('records', jsonb_build_array(updated_gang)),
        'insertIntofighter_equipmentCollection', jsonb_build_object('records', jsonb_build_array(new_equipment)),
        'rating_cost', rating_cost -- Include the rating value in the response
      );
    END IF;
  END IF;

  -- Initialize the final result with collections data
  v_final_result := v_collections_data;

  -- Check if there are any fighter effects associated with this equipment
  -- Apply effects for fighters OR vehicles (but not gang stash) and not custom equipment
  IF (v_owner_type = 'fighter' OR v_owner_type = 'vehicle') AND NOT v_is_custom_equipment THEN
    -- Find fighter effect type that references this equipment
    SELECT fet.*, fec.id as category_id INTO v_effect_type_record
    FROM fighter_effect_types fet
    JOIN fighter_effect_categories fec ON fet.fighter_effect_category_id = fec.id
    WHERE fet.type_specific_data->>'equipment_id' = buy_equipment_for_fighter.equipment_id::text;
    
    -- Only apply effects if we found a matching effect type
    IF v_effect_type_record.id IS NOT NULL THEN
      v_has_effect := TRUE;
      v_fighter_effect_category_id := v_effect_type_record.category_id;
      v_fighter_effect_type_id := v_effect_type_record.id;
      
      -- Call appropriate effect function based on owner type
      IF v_owner_type = 'fighter' THEN
        -- Call add_fighter_effect function and store result in v_effect_result
        SELECT afe.result INTO v_effect_result
        FROM add_fighter_effect(
          fighter_id,
          v_fighter_effect_category_id,
          v_fighter_effect_type_id,
          v_user_id
        ) AS afe;
      ELSIF v_owner_type = 'vehicle' THEN
        -- Call add_vehicle_effect function and store result in v_effect_result (returns JSON directly)
        SELECT add_vehicle_effect(
          vehicle_id,
          v_fighter_effect_type_id,
          v_user_id,
          v_fighter_effect_category_id
        ) INTO v_effect_result;
      END IF;
      
      -- Extract the fighter effect ID from the result
      v_fighter_effect_id := (v_effect_result->>'id')::UUID;
      
      -- If effect was created successfully, link it to this equipment
      IF v_fighter_effect_id IS NOT NULL THEN
        -- Update the fighter_effects record to link to the equipment
        UPDATE fighter_effects
        SET fighter_equipment_id = v_new_equipment_id
        WHERE id = v_fighter_effect_id;
        
        -- Get the fighter effect details for collections data format
        SELECT jsonb_build_object(
          'id', fe.id,
          'fighter_id', fe.fighter_id,
          'effect_name', fe.effect_name,
          'fighter_effect_type_id', fe.fighter_effect_type_id,
          'fighter_equipment_id', fe.fighter_equipment_id,
          'created_at', fe.created_at,
          'category_name', fec.category_name
        ) INTO v_fighter_effect
        FROM fighter_effects fe
        JOIN fighter_effect_categories fec ON fec.id = v_fighter_effect_category_id
        WHERE fe.id = v_fighter_effect_id;
        
        -- Get all effect modifiers for this fighter effect
        SELECT 
          jsonb_agg(
            jsonb_build_object(
              'id', fem.id,
              'fighter_effect_id', fem.fighter_effect_id,
              'stat_name', fem.stat_name,
              'numeric_value', fem.numeric_value
            )
          ) 
        INTO v_fighter_effect_modifiers
        FROM fighter_effect_modifiers fem
        WHERE fem.fighter_effect_id = v_fighter_effect_id;
        
        -- Handle NULL case for modifiers
        IF v_fighter_effect_modifiers IS NULL THEN
          v_fighter_effect_modifiers := '[]'::jsonb;
        END IF;
        
        -- Add the equipment effect information to the final result
        -- Only include fighter info if this is for a fighter
        IF v_owner_type = 'fighter' THEN
          v_final_result := v_collections_data || jsonb_build_object(
            'success', TRUE,
            'fighter', jsonb_build_object(
              'id', v_fighter_record.id,
              'xp', v_fighter_record.xp
            ),
            'equipment_effect', jsonb_build_object(
              'id', v_fighter_effect_id, 
              'effect_name', v_fighter_effect->>'effect_name',
              'fighter_effect_type_id', v_fighter_effect->>'fighter_effect_type_id',
              'fighter_equipment_id', v_fighter_effect->>'fighter_equipment_id',
              'category_name', v_fighter_effect->>'category_name',
              'fighter_effect_modifiers', v_fighter_effect_modifiers,
              'created_at', v_fighter_effect->>'created_at'
            )
          );
        ELSE
          -- For vehicles, don't include fighter info
          v_final_result := v_collections_data || jsonb_build_object(
            'success', TRUE,
            'equipment_effect', jsonb_build_object(
              'id', v_fighter_effect_id, 
              'effect_name', v_fighter_effect->>'effect_name',
              'fighter_effect_type_id', v_fighter_effect->>'fighter_effect_type_id',
              'fighter_equipment_id', v_fighter_effect->>'fighter_equipment_id',
              'category_name', v_fighter_effect->>'category_name',
              'fighter_effect_modifiers', v_fighter_effect_modifiers,
              'created_at', v_fighter_effect->>'created_at'
            )
          );
        END IF;
      END IF;
    END IF;
  END IF;

  -- Return the final result with all necessary data
  RETURN v_final_result;
END;
$$ LANGUAGE plpgsql;

-- Revoke and grant permissions
REVOKE ALL ON FUNCTION buy_equipment_for_fighter(UUID, UUID, UUID, INTEGER, UUID, BOOLEAN, BOOLEAN, UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION buy_equipment_for_fighter(UUID, UUID, UUID, INTEGER, UUID, BOOLEAN, BOOLEAN, UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION buy_equipment_for_fighter(UUID, UUID, UUID, INTEGER, UUID, BOOLEAN, BOOLEAN, UUID, BOOLEAN) TO service_role;
