
DECLARE
    fighter_exists BOOLEAN;
    has_enough_xp BOOLEAN;
    inserted_characteristic JSONB;
    updated_fighter JSONB;
    v_code TEXT;
    v_characteristic_value INTEGER;
BEGIN
    -- Check if fighter exists
    SELECT EXISTS (
        SELECT 1 FROM fighters WHERE id = fighter_id
    ) INTO fighter_exists;

    IF NOT fighter_exists THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Fighter not found'
        );
    END IF;

    -- Check if fighter has enough XP
    SELECT (xp >= xp_cost) INTO has_enough_xp
    FROM fighters
    WHERE id = fighter_id;

    IF NOT has_enough_xp THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Insufficient XP'
        );
    END IF;

    -- Get the characteristic code and value
    SELECT code, characteristic_value INTO v_code, v_characteristic_value
    FROM characteristics
    WHERE id = characteristic_id;

    -- Insert the new characteristic advancement
    WITH inserted AS (
        INSERT INTO fighter_characteristics (
            fighter_id,
            characteristic_id,
            updated_at,
            times_increased,
            credits_increase,
            xp_cost,
            code,
            characteristic_value
        )
        VALUES (
            fighter_id,
            characteristic_id,
            NOW(),
            COALESCE(
                (SELECT MAX(times_increased) + 1
                 FROM fighter_characteristics
                 WHERE fighter_characteristics.fighter_id = add_fighter_advancement.fighter_id
                 AND fighter_characteristics.characteristic_id = add_fighter_advancement.characteristic_id),
                1
            ),
            credits_increase,
            xp_cost,
            v_code,
            v_characteristic_value
        )
        RETURNING
            fighter_characteristics.id,
            fighter_characteristics.fighter_id,
            fighter_characteristics.characteristic_id,
            fighter_characteristics.times_increased,
            fighter_characteristics.credits_increase,
            fighter_characteristics.xp_cost,
            fighter_characteristics.code,
            fighter_characteristics.characteristic_value
    )
    SELECT row_to_json(inserted)::jsonb INTO inserted_characteristic
    FROM inserted;

    -- Update fighter's XP and get updated data
    WITH updated AS (
        UPDATE fighters
        SET
            xp = xp - xp_cost,
            updated_at = NOW()
        WHERE id = fighter_id
        RETURNING
            fighters.id,
            fighters.xp
    )
    SELECT row_to_json(updated)::jsonb INTO updated_fighter
    FROM updated;

    RETURN jsonb_build_object(
        'success', true,
        'fighter', updated_fighter,
        'advancement', inserted_characteristic
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'detail', SQLSTATE
    );
END;
