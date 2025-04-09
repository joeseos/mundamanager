-- Drop existing function if it exists
DROP FUNCTION IF EXISTS move_to_gang_stash(fighter_equipment_id UUID);
DROP FUNCTION IF EXISTS move_to_gang_stash(in_fighter_equipment_id UUID, in_user_id UUID);

-- Create new function using the private.is_admin() helper
CREATE OR REPLACE FUNCTION move_to_gang_stash(
    in_fighter_equipment_id UUID,
    in_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, private
AS $$
DECLARE
    v_equipment_id UUID;
    v_gang_id UUID;
    v_cost NUMERIC;
    v_new_stash_id UUID;
    v_user_has_access BOOLEAN;
    v_is_admin BOOLEAN;
    v_equipment_exists BOOLEAN;
BEGIN
    -- Use auth.uid() to set the current user context for private.is_admin() function
    PERFORM set_config('request.jwt.claim.sub', in_user_id::text, true);
    
    -- Check if user is an admin using the existing helper function
    SELECT private.is_admin() INTO v_is_admin;
    
    -- Check if equipment exists
    SELECT EXISTS (
        SELECT 1 FROM fighter_equipment
        WHERE id = in_fighter_equipment_id
    ) INTO v_equipment_exists;
    
    IF NOT v_equipment_exists THEN
        RAISE EXCEPTION 'Equipment not found or you do not have permission to move it';
    END IF;
    
    -- Get the necessary information before deleting the fighter_equipment record
    SELECT 
        fe.equipment_id,
        COALESCE(f.gang_id, v.gang_id) as gang_id,
        fe.purchase_cost
    INTO 
        v_equipment_id,
        v_gang_id,
        v_cost
    FROM fighter_equipment fe
    LEFT JOIN fighters f ON f.id = fe.fighter_id
    LEFT JOIN vehicles v ON v.id = fe.vehicle_id
    WHERE fe.id = in_fighter_equipment_id;

    -- If the user is not an admin, check if they have permission for this gang
    IF NOT v_is_admin THEN
        SELECT EXISTS (
            SELECT 1
            FROM gangs
            WHERE id = v_gang_id AND user_id = in_user_id
        ) INTO v_user_has_access;
        
        IF NOT v_user_has_access THEN
            RAISE EXCEPTION 'User does not have permission to move this equipment';
        END IF;
    END IF;

    -- Insert into gang_stash
    INSERT INTO gang_stash (
        id,
        created_at,
        gang_id,
        equipment_id,
        cost
    ) VALUES (
        gen_random_uuid(),
        NOW(),
        v_gang_id,
        v_equipment_id,
        v_cost
    )
    RETURNING id INTO v_new_stash_id;

    -- Delete from fighter_equipment
    DELETE FROM fighter_equipment
    WHERE id = in_fighter_equipment_id;

    -- Return the new stash item ID
    RETURN v_new_stash_id;
END;
$$;

-- Revoke and grant permissions
REVOKE ALL ON FUNCTION move_to_gang_stash(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION move_to_gang_stash(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION move_to_gang_stash(UUID, UUID) TO service_role;