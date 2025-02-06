
DECLARE
    v_equipment_id UUID;
    v_gang_id UUID;
    v_cost NUMERIC;
    v_new_stash_id UUID;
BEGIN
    -- Get the necessary information before deleting the fighter_equipment record
    -- Modified to check both fighter_id and vehicle_id relationships
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
    WHERE fe.id = fighter_equipment_id;

    -- Check if we found the equipment
    IF v_equipment_id IS NULL THEN
        RAISE EXCEPTION 'Equipment with ID % not found', fighter_equipment_id;
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
    WHERE id = fighter_equipment_id;

    -- Return the new stash item ID
    RETURN v_new_stash_id;
END;
