-- Drop existing functions in reverse order to avoid dependency issues
DROP FUNCTION IF EXISTS sell_equipment_from_fighter(UUID);
DROP FUNCTION IF EXISTS sell_equipment_from_fighter(UUID, INTEGER);
DROP FUNCTION IF EXISTS sell_equipment_from_fighter(UUID, INTEGER, UUID);

-- Main function with all three parameters
CREATE OR REPLACE FUNCTION sell_equipment_from_fighter(
  fighter_equipment_id UUID,
  manual_cost INTEGER DEFAULT NULL,
  in_user_id UUID = auth.uid()
)
RETURNS JSONB AS $$
DECLARE
  v_equipment_record record;
  v_result JSONB;
  v_sell_value INTEGER;
  v_user_has_access BOOLEAN;
  v_is_admin BOOLEAN;
BEGIN
  -- Set the context for auth.uid() to be used in private.is_admin()
  PERFORM set_config('request.jwt.claim.sub', in_user_id::text, true);
  
  -- Check if user is an admin using the existing helper function
  SELECT private.is_admin() INTO v_is_admin;
  
  -- Get all the necessary information using the fighter_equipment_id
  SELECT 
    fe.id as fighter_equipment_id,
    fe.fighter_id,
    fe.vehicle_id,
    fe.equipment_id,
    fe.purchase_cost,
    CASE
      WHEN fe.fighter_id IS NOT NULL THEN f.gang_id
      WHEN fe.vehicle_id IS NOT NULL THEN v.gang_id
    END as gang_id
  INTO v_equipment_record
  FROM fighter_equipment fe
  LEFT JOIN fighters f ON f.id = fe.fighter_id
  LEFT JOIN vehicles v ON v.id = fe.vehicle_id
  WHERE fe.id = fighter_equipment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fighter equipment with ID % not found', fighter_equipment_id;
  END IF;

  -- If user is not an admin, check if they have permission for this gang
  IF NOT v_is_admin THEN
    SELECT EXISTS (
      SELECT 1
      FROM gangs
      WHERE id = v_equipment_record.gang_id AND user_id = in_user_id
    ) INTO v_user_has_access;
    
    IF NOT v_user_has_access THEN
      RAISE EXCEPTION 'User does not have permission to sell this equipment';
    END IF;
  END IF;

  -- Determine sell value (manual or default to purchase cost)
  v_sell_value := COALESCE(manual_cost, v_equipment_record.purchase_cost);

  -- Start transaction
  BEGIN
    -- Delete the equipment from fighter's inventory
    DELETE FROM fighter_equipment
    WHERE id = fighter_equipment_id;

    -- Add credits to the gang using the determined sell value
    UPDATE gangs
    SET credits = credits + v_sell_value
    WHERE id = v_equipment_record.gang_id
    RETURNING jsonb_build_object(
      'id', id,
      'credits', credits
    ) INTO v_result;

    -- Return the result
    RETURN jsonb_build_object(
      'gang', v_result,
      'equipment_sold', jsonb_build_object(
        'id', v_equipment_record.fighter_equipment_id,
        'fighter_id', v_equipment_record.fighter_id,
        'vehicle_id', v_equipment_record.vehicle_id,
        'equipment_id', v_equipment_record.equipment_id,
        'sell_value', v_sell_value
      )
    );

    -- If anything fails, the transaction will be rolled back
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Failed to sell equipment: %', SQLERRM;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, private;

-- Two-parameter overload
CREATE OR REPLACE FUNCTION sell_equipment_from_fighter(
  fighter_equipment_id UUID,
  manual_cost INTEGER
)
RETURNS JSONB AS $$
  SELECT sell_equipment_from_fighter(fighter_equipment_id, manual_cost, auth.uid());
$$ LANGUAGE SQL SECURITY DEFINER
SET search_path = public, auth, private;

-- One-parameter overload
CREATE OR REPLACE FUNCTION sell_equipment_from_fighter(
  fighter_equipment_id UUID
)
RETURNS JSONB AS $$
  SELECT sell_equipment_from_fighter(fighter_equipment_id, NULL, auth.uid());
$$ LANGUAGE SQL SECURITY DEFINER
SET search_path = public, auth, private;

-- Revoke permissions from all function signatures
REVOKE ALL ON FUNCTION sell_equipment_from_fighter(UUID, INTEGER, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION sell_equipment_from_fighter(UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION sell_equipment_from_fighter(UUID) FROM PUBLIC;

-- Grant permissions to authenticated users for all function signatures
GRANT EXECUTE ON FUNCTION sell_equipment_from_fighter(UUID, INTEGER, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION sell_equipment_from_fighter(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION sell_equipment_from_fighter(UUID) TO authenticated;

-- Grant permissions to service role for all function signatures
GRANT EXECUTE ON FUNCTION sell_equipment_from_fighter(UUID, INTEGER, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION sell_equipment_from_fighter(UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION sell_equipment_from_fighter(UUID) TO service_role;

-- Add comments to explain the functions
COMMENT ON FUNCTION sell_equipment_from_fighter(UUID, INTEGER, UUID) IS 
'Sells equipment from a fighter and adds credits to gang.
Admins can sell any equipment, while regular users can only sell equipment
from fighters belonging to gangs they own.
Parameters:
- fighter_equipment_id: UUID of the fighter equipment to sell
- manual_cost: Optional custom sell value (defaults to purchase cost)
- in_user_id: UUID of the user performing the action (defaults to auth.uid())
Returns: 
- JSONB with gang and equipment information';

COMMENT ON FUNCTION sell_equipment_from_fighter(UUID, INTEGER) IS 
'Sells equipment from a fighter and adds credits to gang.
Calls the main function with the current user ID.
Parameters:
- fighter_equipment_id: UUID of the fighter equipment to sell
- manual_cost: Custom sell value
Returns: 
- JSONB with gang and equipment information';

COMMENT ON FUNCTION sell_equipment_from_fighter(UUID) IS 
'Sells equipment from a fighter and adds credits to gang.
Calls the main function with NULL for manual_cost and the current user ID.
Parameters:
- fighter_equipment_id: UUID of the fighter equipment to sell
Returns: 
- JSONB with gang and equipment information';