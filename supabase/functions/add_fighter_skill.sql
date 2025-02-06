
DECLARE
    fighter_exists BOOLEAN;
    has_enough_xp BOOLEAN;
    inserted_skill JSONB;
    updated_fighter JSONB;
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

    -- Insert the new skill advancement
    WITH inserted AS (
        INSERT INTO fighter_skills (
            fighter_id,
            skill_id,
            updated_at,
            credits_increase,
            xp_cost,
            is_advance
        )
        VALUES (
            fighter_id,
            skill_id,
            NOW(),
            credits_increase,
            xp_cost,
            is_advance
        )
        RETURNING
            fighter_skills.id,
            fighter_skills.fighter_id,
            fighter_skills.skill_id,
            fighter_skills.credits_increase,
            fighter_skills.xp_cost,
            fighter_skills.is_advance
    )
    SELECT row_to_json(inserted)::jsonb INTO inserted_skill
    FROM inserted;

    -- Update fighter's XP and free_skill
    WITH updated AS (
        UPDATE fighters
        SET
            xp = xp - xp_cost,
            free_skill = FALSE,
            updated_at = NOW()
        WHERE id = fighter_id
        RETURNING
            fighters.id,
            fighters.xp,
            fighters.free_skill
    )
    SELECT row_to_json(updated)::jsonb INTO updated_fighter
    FROM updated;

    RETURN jsonb_build_object(
        'success', true,
        'fighter', updated_fighter,
        'advancement', inserted_skill
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'detail', SQLSTATE
    );
END;
