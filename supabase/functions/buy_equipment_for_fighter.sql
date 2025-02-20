-- Drop existing functions with their exact signatures
DROP FUNCTION IF EXISTS buy_equipment_for_fighter(UUID, UUID, UUID);
DROP FUNCTION IF EXISTS buy_equipment_for_fighter(UUID, UUID, UUID, INTEGER, UUID);

-- Then create our new function with vehicle support
CREATE OR REPLACE FUNCTION buy_equipment_for_fighter(
  fighter_id UUID DEFAULT NULL,
  equipment_id UUID DEFAULT NULL,
  gang_id UUID DEFAULT NULL,
  manual_cost INTEGER DEFAULT NULL,
  vehicle_id UUID DEFAULT NULL
)
RETURNS JSONB 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_fighter JSONB;
  updated_vehicle JSONB;
  updated_gang JSONB;
  new_equipment JSONB;
  base_cost INTEGER;
  discounted_cost INTEGER;
  default_profile RECORD;
  current_gang_credits INTEGER;
  v_new_equipment_id UUID;
  v_equipment_type TEXT;
  v_gang_type_id UUID;
  v_gang RECORD;
  v_discount numeric;
  result JSONB;
  final_purchase_cost INTEGER;
  v_owner_type TEXT;
BEGIN
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
    AND (g.user_id = auth.uid() 
      OR EXISTS (
        SELECT 1 FROM profiles 
        WHERE profiles.id = auth.uid() 
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

  -- Get the discount value if it exists
  SELECT discount::numeric INTO v_discount
  FROM equipment_discounts ed
  WHERE ed.equipment_id = buy_equipment_for_fighter.equipment_id 
  AND ed.gang_type_id = v_gang_type_id;

  -- Get the equipment base cost
  SELECT 
    e.cost::integer as base_cost,
    CASE 
      WHEN v_discount IS NOT NULL THEN (e.cost::integer - v_discount::integer)
      ELSE e.cost::integer
    END as discounted_cost,
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
  discounted_cost := default_profile.discounted_cost;
  v_equipment_type := default_profile.equipment_type;

  -- Determine final purchase cost (manual or calculated)
  final_purchase_cost := COALESCE(manual_cost, discounted_cost);

  -- Check if gang has enough credits using the final purchase cost
  IF current_gang_credits < final_purchase_cost THEN
    RAISE EXCEPTION 'Gang has insufficient credits. Required: %, Available: %', final_purchase_cost, current_gang_credits;
  END IF;

  -- Get owner details for response based on owner type
  IF v_owner_type = 'fighter' THEN
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

  -- Add equipment to inventory with cost information
  INSERT INTO fighter_equipment (
    id,
    fighter_id,
    vehicle_id,
    equipment_id,
    original_cost,
    purchase_cost,
    created_at,
    updated_at
  )
  VALUES (
    gen_random_uuid(),
    fighter_id,
    vehicle_id,
    buy_equipment_for_fighter.equipment_id,
    base_cost,
    final_purchase_cost,
    now(),
    now()
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

  -- Construct the result JSON based on owner type
  IF v_owner_type = 'fighter' THEN
    result := jsonb_build_object(
      'updatefightersCollection', jsonb_build_object('records', jsonb_build_array(updated_fighter)),
      'updategangsCollection', jsonb_build_object('records', jsonb_build_array(updated_gang)),
      'insertIntofighter_equipmentCollection', jsonb_build_object('records', jsonb_build_array(new_equipment))
    );
  ELSE
    result := jsonb_build_object(
      'updatevehiclesCollection', jsonb_build_object('records', jsonb_build_array(updated_vehicle)),
      'updategangsCollection', jsonb_build_object('records', jsonb_build_array(updated_gang)),
      'insertIntofighter_equipmentCollection', jsonb_build_object('records', jsonb_build_array(new_equipment))
    );
  END IF;

  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION buy_equipment_for_fighter(UUID, UUID, UUID, INTEGER, UUID) TO authenticated;