CREATE OR REPLACE FUNCTION public.delete_equipment_from_fighter(
  input_fighter_id uuid,
  input_vehicle_id uuid,
  input_equipment_id uuid,
  input_fighter_equipment_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
  updated_fighter JSONB;
  updated_gang JSONB;
  deleted_fighter_equipment JSONB;
  equipment_cost INTEGER;
  fighter_gang_id UUID;
  result JSONB;
BEGIN
  -- Validate that only one ID is provided
  IF (input_fighter_id IS NOT NULL AND input_vehicle_id IS NOT NULL) OR 
     (input_fighter_id IS NULL AND input_vehicle_id IS NULL) THEN
    RAISE EXCEPTION 'Must provide either fighter_id OR vehicle_id, not both or neither';
  END IF;

  -- Get the equipment cost and fighter's gang_id using the specific fighter_equipment id
  SELECT e.cost, 
         CASE 
           WHEN fe.fighter_id IS NOT NULL THEN f.gang_id
           WHEN fe.vehicle_id IS NOT NULL THEN v_f.gang_id
         END as gang_id
  INTO equipment_cost, fighter_gang_id
  FROM equipment e
  JOIN fighter_equipment fe ON e.id = fe.equipment_id
  LEFT JOIN fighters f ON f.id = fe.fighter_id AND input_fighter_id IS NOT NULL
  LEFT JOIN vehicles v ON v.id = fe.vehicle_id AND input_vehicle_id IS NOT NULL
  LEFT JOIN fighters v_f ON v_f.id = v.fighter_id
  WHERE (
    (fe.fighter_id = input_fighter_id AND input_fighter_id IS NOT NULL) OR
    (fe.vehicle_id = input_vehicle_id AND input_vehicle_id IS NOT NULL)
  )
  AND fe.equipment_id = input_equipment_id
  AND fe.id = input_fighter_equipment_id;

  IF equipment_cost IS NULL OR fighter_gang_id IS NULL THEN
    RAISE EXCEPTION 'Equipment not found or not associated with a gang';
  END IF;

  -- Delete the specific equipment instance
  DELETE FROM fighter_equipment
  WHERE id = input_fighter_equipment_id
  RETURNING jsonb_build_object(
    'id', id,
    'fighter_id', fighter_id,
    'vehicle_id', vehicle_id,
    'equipment_id', equipment_id
  ) INTO deleted_fighter_equipment;

  -- Update fighter's credits
  UPDATE fighters f
  SET credits = GREATEST(0, f.credits - equipment_cost)
  WHERE f.id = CASE 
    WHEN input_fighter_id IS NOT NULL THEN input_fighter_id
    ELSE (SELECT fighter_id FROM vehicles WHERE id = input_vehicle_id)
  END
  RETURNING jsonb_build_object(
    'id', f.id,
    'fighter_name', f.fighter_name,
    'credits', f.credits
  ) INTO updated_fighter;

  -- Update gang's rating
  UPDATE gangs g
  SET rating = GREATEST(0, g.rating - equipment_cost)
  WHERE g.id = fighter_gang_id
  RETURNING jsonb_build_object(
    'id', g.id,
    'credits', g.credits,
    'rating', g.rating
  ) INTO updated_gang;

  -- Construct the result JSON
  result := jsonb_build_object(
    'deletedFighterEquipment', deleted_fighter_equipment,
    'updatedFighter', updated_fighter,
    'updatedGang', updated_gang
  );

  RETURN result;
EXCEPTION WHEN OTHERS THEN
  -- In case of any error, return the error message
  RETURN jsonb_build_object('error', SQLERRM);
END;
$function$;