-- First drop the existing function
DROP FUNCTION IF EXISTS assign_crew_to_vehicle(UUID, UUID);

-- Create the new function
CREATE OR REPLACE FUNCTION assign_crew_to_vehicle(
    p_vehicle_id UUID,
    p_fighter_id UUID
) RETURNS jsonb 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    old_vehicle jsonb;
    new_vehicle jsonb;
BEGIN
    -- Get the vehicle info before removing fighter
    SELECT jsonb_build_object(
        'id', id,
        'vehicle_name', vehicle_name,
        'vehicle_type', vehicle_type,
        'cost', cost
    )
    INTO old_vehicle
    FROM vehicles 
    WHERE fighter_id = p_fighter_id;

    -- Remove the fighter from any existing vehicle
    UPDATE vehicles 
    SET fighter_id = NULL 
    WHERE fighter_id = p_fighter_id;

    -- Assign to the new vehicle
    UPDATE vehicles 
    SET fighter_id = p_fighter_id 
    WHERE id = p_vehicle_id;

    -- Get the new vehicle info
    SELECT jsonb_build_object(
        'id', id,
        'vehicle_name', vehicle_name,
        'vehicle_type', vehicle_type,
        'cost', cost
    )
    INTO new_vehicle
    FROM vehicles 
    WHERE id = p_vehicle_id;

    -- Return both old and new vehicle info
    RETURN jsonb_build_object(
        'removed_from', old_vehicle,
        'assigned_to', new_vehicle
    );
END;
$$;