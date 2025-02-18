CREATE OR REPLACE FUNCTION buy_equipment_for_vehicle(
  vehicle_id UUID,
  equipment_id UUID,
  gang_id UUID,
  manual_cost INTEGER DEFAULT NULL
)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_vehicle JSONB;
  updated_gang JSONB;
  new_vehicle_equipment JSONB;
  base_cost INTEGER;
  discounted_cost INTEGER;
  default_profile RECORD;
  current_gang_credits INTEGER;
  v_new_vehicle_equipment_id UUID;
  v_equipment_type TEXT;
  v_gang_type_id UUID;
  v_gang RECORD;
  v_vehicle RECORD;
  v_discount numeric;
  result JSONB;
  final_purchase_cost INTEGER;
BEGIN
  -- Get gang details (will work with RLS)
  SELECT * INTO v_gang
  FROM gangs
  WHERE id = buy_equipment_for_vehicle.gang_id;

  IF v_gang IS NULL THEN
    RAISE EXCEPTION 'Gang not found. Gang ID: %', buy_equipment_for_vehicle.gang_id;
  END IF;

  -- Verify vehicle exists and belongs to this gang
  SELECT * INTO v_vehicle
  FROM vehicles v
  WHERE v.id = buy_equipment_for_vehicle.vehicle_id
  AND v.gang_id = buy_equipment_for_vehicle.gang_id;

  IF v_vehicle IS NULL THEN
    RAISE EXCEPTION 'Vehicle not found or does not belong to the specified gang. Vehicle ID: %', buy_equipment_for_vehicle.vehicle_id;
  END IF;

  v_gang_type_id := v_gang.gang_type_id;
  current_gang_credits := v_gang.credits;

  -- Get the discount value if it exists
  SELECT discount::numeric INTO v_discount
  FROM equipment_discounts ed
  WHERE ed.equipment_id = buy_equipment_for_vehicle.equipment_id 
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
  WHERE e.id = buy_equipment_for_vehicle.equipment_id;

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

  -- Get vehicle details for response
  SELECT jsonb_build_object(
    'id', v.id,
    'vehicle_name', v.vehicle_name,
    'purchase_cost', v.cost,
    'original_cost', v.cost
  ) INTO updated_vehicle
  FROM vehicles v
  WHERE v.id = buy_equipment_for_vehicle.vehicle_id;

  -- Update gang's credits
  UPDATE gangs 
  SET credits = credits - final_purchase_cost
  WHERE id = buy_equipment_for_vehicle.gang_id;

  -- Get updated gang info
  SELECT jsonb_build_object(
    'id', g.id,
    'credits', g.credits
  ) INTO updated_gang
  FROM gangs g
  WHERE g.id = buy_equipment_for_vehicle.gang_id;

  -- Add equipment to vehicle's inventory with cost information
  INSERT INTO vehicle_equipment (
    id,
    vehicle_id, 
    equipment_id,
    original_cost,
    purchase_cost,
    created_at,
    updated_at
  )
  VALUES (
    gen_random_uuid(),
    buy_equipment_for_vehicle.vehicle_id, 
    buy_equipment_for_vehicle.equipment_id,
    base_cost,
    final_purchase_cost,
    now(),
    now()
  )
  RETURNING id INTO v_new_vehicle_equipment_id;

  -- Build the response JSON based on equipment type
  IF v_equipment_type = 'weapon' THEN
    SELECT jsonb_build_object(
      'id', ve.id,
      'vehicle_id', ve.vehicle_id,
      'equipment_id', ve.equipment_id,
      'purchase_cost', ve.purchase_cost,
      'original_cost', ve.original_cost,
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
    ) INTO new_vehicle_equipment
    FROM vehicle_equipment ve
    WHERE ve.id = v_new_vehicle_equipment_id;
  ELSE
    SELECT jsonb_build_object(
      'id', ve.id,
      'vehicle_id', ve.vehicle_id,
      'equipment_id', ve.equipment_id,
      'purchase_cost', ve.purchase_cost,
      'original_cost', ve.original_cost,
      'wargear_details', jsonb_build_object(
        'name', e.equipment_name,
        'cost', e.cost
      )
    ) INTO new_vehicle_equipment
    FROM vehicle_equipment ve
    JOIN equipment e ON e.id = ve.equipment_id
    WHERE ve.id = v_new_vehicle_equipment_id;
  END IF;

  -- Construct the result JSON
  result := jsonb_build_object(
    'updatevehiclesCollection', jsonb_build_object('records', jsonb_build_array(updated_vehicle)),
    'updategangsCollection', jsonb_build_object('records', jsonb_build_array(updated_gang)),
    'insertIntovehicle_equipmentCollection', jsonb_build_object('records', jsonb_build_array(new_vehicle_equipment))
  );

  RETURN result;
END;
$$ LANGUAGE plpgsql;