CREATE OR REPLACE FUNCTION repair_vehicle_damage(
    damage_ids UUID[],
    repair_cost INTEGER,
    in_user_id UUID
)
RETURNS JSON AS $$
DECLARE
    v_is_admin BOOLEAN;
    v_user_has_access BOOLEAN;
    v_damage_name TEXT;
    v_fighter_id UUID;
    v_gang_id UUID;
    v_gang_credits INTEGER;
    v_vehicle_id UUID;
    v_damage_id UUID;
    v_damage_names TEXT[] := ARRAY[]::TEXT[];
    v_vehicle_ids UUID[] := ARRAY[]::UUID[];
BEGIN
    -- Parameter validation
    IF damage_ids IS NULL OR array_length(damage_ids, 1) = 0 THEN
        RAISE EXCEPTION 'damage_ids must be provided';
    END IF;
    IF repair_cost IS NULL THEN
        RAISE EXCEPTION 'repair_cost must be provided';
    END IF;
    IF in_user_id IS NULL THEN
        RAISE EXCEPTION 'user_id must be provided';
    END IF;

    -- Set user context for is_admin check
    PERFORM set_config('request.jwt.claim.sub', in_user_id::text, true);

    -- Check if user is an admin
    SELECT private.is_admin() INTO v_is_admin;

    -- Get effect details and related info for the first damage (assume all are for the same vehicle/gang)
    SELECT 
        fe.effect_name,
        fe.vehicle_id
    INTO 
        v_damage_name,
        v_vehicle_id
    FROM fighter_effects fe
    WHERE fe.id = damage_ids[1];

    IF v_damage_name IS NULL THEN
        RAISE EXCEPTION 'Damage effect not found';
    END IF;

    -- Get the fighter_id from the vehicle
    SELECT fighter_id INTO v_fighter_id FROM vehicles WHERE id = v_vehicle_id;
    IF v_fighter_id IS NULL THEN
        RAISE EXCEPTION 'Could not determine fighter for this vehicle';
    END IF;

    -- Get the gang_id
    SELECT gang_id, g.credits
    INTO v_gang_id, v_gang_credits
    FROM fighters f
    JOIN gangs g ON g.id = f.gang_id
    WHERE f.id = v_fighter_id;

    IF v_gang_id IS NULL THEN
        RAISE EXCEPTION 'Could not determine gang for this fighter';
    END IF;

    -- If not admin, check if user has permission to modify this gang
    IF NOT v_is_admin THEN
        SELECT EXISTS (
            SELECT 1
            FROM gangs
            WHERE id = v_gang_id AND user_id = in_user_id
        ) INTO v_user_has_access;
        IF NOT v_user_has_access THEN
            RAISE EXCEPTION 'User does not have permission to repair damages for this gang';
        END IF;
    END IF;

    -- Check if gang has enough credits
    IF v_gang_credits < repair_cost THEN
        RAISE EXCEPTION 'Not enough credits to repair damage';
    END IF;

    -- Deduct credits from the gang
    UPDATE gangs SET credits = credits - repair_cost WHERE id = v_gang_id;

    -- Loop through and delete each damage effect, collect names and vehicle_ids
    FOREACH v_damage_id IN ARRAY damage_ids LOOP
        SELECT effect_name, vehicle_id INTO v_damage_name, v_vehicle_id FROM fighter_effects WHERE id = v_damage_id;
        IF v_damage_name IS NOT NULL THEN
            v_damage_names := array_append(v_damage_names, v_damage_name);
            v_vehicle_ids := array_append(v_vehicle_ids, v_vehicle_id);
        END IF;
        DELETE FROM fighter_effects WHERE id = v_damage_id;
    END LOOP;

    -- Return info about the repair
    RETURN json_build_object(
        'damage_id', damage_ids[1],
        'damage_name', v_damage_names[1],
        'vehicle_id', v_vehicle_ids[1],
        'damage_ids', damage_ids,
        'damage_names', v_damage_names,
        'repair_cost', repair_cost,
        'gang_id', v_gang_id,
        'vehicle_ids', v_vehicle_ids
    );
END;
$$ 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, private;

-- Revoke and grant permissions
REVOKE ALL ON FUNCTION repair_vehicle_damage(UUID[], INTEGER, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION repair_vehicle_damage(UUID[], INTEGER, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION repair_vehicle_damage(UUID[], INTEGER, UUID) TO service_role;