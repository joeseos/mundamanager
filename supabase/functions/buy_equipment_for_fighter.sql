-- Drop existing functions with their exact signatures
DROP FUNCTION IF EXISTS buy_equipment_for_fighter(UUID, UUID, UUID);
DROP FUNCTION IF EXISTS buy_equipment_for_fighter(UUID, UUID, UUID, INTEGER, UUID);
DROP FUNCTION IF EXISTS buy_equipment_for_fighter(UUID, UUID, UUID, INTEGER, UUID, BOOLEAN);
DROP FUNCTION IF EXISTS buy_equipment_for_fighter(UUID, UUID, UUID, INTEGER, UUID, BOOLEAN, BOOLEAN);

-- Then create our new function with vehicle support, user_id, fighter effect support, and use_base_cost_for_rating
CREATE OR REPLACE FUNCTION buy_equipment_for_fighter(
  fighter_id UUID DEFAULT NULL,
  equipment_id UUID DEFAULT NULL,
  gang_id UUID DEFAULT NULL,
  manual_cost INTEGER DEFAULT NULL,
  vehicle_id UUID DEFAULT NULL,
  master_crafted BOOLEAN DEFAULT FALSE,
  use_base_cost_for_rating BOOLEAN DEFAULT TRUE
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
  base_cost INTEGER;
  adjusted_cost_final INTEGER;
  default_profile RECORD;
  current_gang_credits INTEGER;
  v_new_equipment_id UUID;
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
  rating_cost INTEGER;
BEGIN
  -- Get the authenticated user's ID
  v_user_id := auth.uid();

  -- Validate required parameters
  IF equipment_id IS NULL THEN
    RAISE EXCEPTION 'equipment_id is required';
  END IF;

  IF gang_id IS NULL THEN
    RAISE EXCEPTION 'gang_id is required';
  END IF;

  -- Validate that exactly one of fighter_id or vehicle_id is provided
  IF (fighter_id IS NULL AND vehicle_id IS NULL) OR (fighter_id IS NOT NULL AND vehicle_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Exactly one of fighter_id or vehicle_id must be provided';
  END IF;

  -- Set owner type for later use
  v_owner_type := CASE
    WHEN fighter_id IS NOT NULL THEN 'fighter'
    ELSE 'vehicle'
  END;

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

  -- Get the adjusted_cost value if it exists
  SELECT adjusted_cost::numeric INTO v_adjusted_cost
  FROM equipment_discounts ed
  WHERE ed.equipment_id = buy_equipment_for_fighter.equipment_id
  AND ed.gang_type_id = v_gang_type_id;

  -- Get the equipment base cost
  SELECT
    e.cost::integer as base_cost,
    CASE
      WHEN v_adjusted_cost IS NOT NULL THEN v_adjusted_cost::integer
      ELSE e.cost::integer
    END as adjusted_cost_final,
    e.equipment_type,
    wp.*
  INTO default_profile
  FROM equipment e
  LEFT JOIN weapon_profiles wp ON wp.weapon_id = e.id
  WHERE e.id = buy_equipment_for_fighter.equipment_id;

  IF default_profile IS NULL THEN
    RAISE EXCEPTION 'Equipment not found';
  END IF;

  base_cost := default_profile.base_cost;
  adjusted_cost_final := default_profile.adjusted_cost_final;
  v_equipment_type := default_profile.equipment_type;

  -- Determine final purchase cost (manual or calculated)
  -- This is the cost that will be deducted from gang credits
  final_purchase_cost := COALESCE(manual_cost, adjusted_cost_final);

  -- Check if gang has enough credits using the final purchase cost
  IF current_gang_credits < final_purchase_cost THEN
    RAISE EXCEPTION 'Gang has insufficient credits. Required: %, Available: %', final_purchase_cost, current_gang_credits;
  END IF;

  -- Determine the cost to use for fighter rating based on the use_base_cost_for_rating flag
  -- This value will be returned as rating_cost and used for fighter rating calculations
  IF use_base_cost_for_rating THEN
    -- For master-crafted weapons, we need to apply the 25% increase to the base cost
    IF v_equipment_type = 'weapon' AND master_crafted = TRUE THEN
      -- Increase by 25% and round up to nearest 5
      rating_cost := CEIL((adjusted_cost_final * 1.25) / 5) * 5;
    ELSE
      rating_cost := adjusted_cost_final;  -- Using adjusted_cost_final when use_base_cost_for_rating is true
    END IF;
  ELSE
    rating_cost := final_purchase_cost;  -- Using manual_cost (when provided) for rating
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
  ELSE
    SELECT jsonb_build_object(
      'id', v.id,
      'vehicle_name', v.vehicle_name
    ) INTO updated_vehicle
    FROM vehicles v
    WHERE v.id = buy_equipment_for_fighter.vehicle_id;
  END IF;

  -- Update gang's credits
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

  -- Add equipment to inventory with cost information and user_id
  INSERT INTO fighter_equipment (
    id,
    fighter_id,
    vehicle_id,
    equipment_id,
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

  -- Build the response JSON based on equipment type
  IF v_equipment_type = 'weapon' THEN
    SELECT jsonb_build_object(
      'id', fe.id,
      'fighter_id', fe.fighter_id,
      'vehicle_id', fe.vehicle_id,
      'equipment_id', fe.equipment_id,
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
  ELSE
    SELECT jsonb_build_object(
      'id', fe.id,
      'fighter_id', fe.fighter_id,
      'vehicle_id', fe.vehicle_id,
      'equipment_id', fe.equipment_id,
      'purchase_cost', fe.purchase_cost,
      'original_cost', fe.original_cost,
      'user_id', fe.user_id,
      'is_master_crafted', fe.is_master_crafted,
      'wargear_details', jsonb_build_object(
        'name', e.equipment_name,
        'cost', e.cost
      ),
      'vehicle_profile', CASE 
        WHEN v_owner_type = 'vehicle' THEN
          jsonb_build_object(
            'front', vep.front,
            'side', vep.side,
            'rear', vep.rear,
            'movement', vep.movement,
            'hull_points', vep.hull_points,
            'save', vep.save,
            'handling', vep.handling,
            'profile_name', vep.profile_name,
            'upgrade_type', vep.upgrade_type
          )
        ELSE NULL
      END
    ) INTO new_equipment
    FROM fighter_equipment fe
    JOIN equipment e ON e.id = fe.equipment_id
    LEFT JOIN vehicle_equipment_profiles vep ON vep.equipment_id = fe.equipment_id
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

  -- Initialize the final result with collections data
  v_final_result := v_collections_data;

  -- Check if there are any fighter effects associated with this equipment
  -- Only apply effects if this is for a fighter (not a vehicle)
  IF v_owner_type = 'fighter' THEN
    -- Find fighter effect type that references this equipment
    SELECT fet.*, fec.id as category_id INTO v_effect_type_record
    FROM fighter_effect_types fet
    JOIN fighter_effect_categories fec ON fet.fighter_effect_category_id = fec.id
    WHERE fet.type_specific_data->>'equipment_id' = buy_equipment_for_fighter.equipment_id::text;
    
    -- If we found a matching effect type, add it
    IF v_effect_type_record.id IS NOT NULL THEN
      v_has_effect := TRUE;
      v_fighter_effect_category_id := v_effect_type_record.category_id;
      v_fighter_effect_type_id := v_effect_type_record.id;
      
      -- Call add_fighter_effect function and store result in v_effect_result
      SELECT afe.result INTO v_effect_result
      FROM add_fighter_effect(
        fighter_id,
        v_fighter_effect_category_id,
        v_fighter_effect_type_id,
        v_user_id
      ) AS afe;
      
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
          'created_at', fe.created_at
        ) INTO v_fighter_effect
        FROM fighter_effects fe
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
            'fighter_effect_modifiers', v_fighter_effect_modifiers,
            'created_at', v_fighter_effect->>'created_at'
          )
        );
      END IF;
    END IF;
  END IF;

  -- Return the final result with all necessary data
  RETURN v_final_result;
END;
$$ LANGUAGE plpgsql;

-- Revoke and grant permissions
REVOKE ALL ON FUNCTION buy_equipment_for_fighter(UUID, UUID, UUID, INTEGER, UUID, BOOLEAN, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION buy_equipment_for_fighter(UUID, UUID, UUID, INTEGER, UUID, BOOLEAN, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION buy_equipment_for_fighter(UUID, UUID, UUID, INTEGER, UUID, BOOLEAN, BOOLEAN) TO service_role;