
DECLARE
    new_injury_id UUID;
    new_fighter_skill_id UUID;
    injury_record RECORD;
BEGIN
    -- Get the injury details from the injuries table
    SELECT * INTO injury_record
    FROM injuries
    WHERE id = input_injury_id;

    -- Insert the new injury first
    INSERT INTO fighter_injuries (
        fighter_id,
        injury_id,
        injury_name,
        code_1,
        characteristic_1,
        code_2,
        characteristic_2
    )
    VALUES (
        input_fighter_id,
        input_injury_id,
        injury_record.injury_name,
        injury_record.code_1,
        injury_record.characteristic_1,
        injury_record.code_2,
        injury_record.characteristic_2
    )
    RETURNING id INTO new_injury_id;

    -- If the injury has an associated skill, create fighter_skill
    IF injury_record.skill_id IS NOT NULL THEN
        -- Insert the fighter_skill
        INSERT INTO fighter_skills (
            fighter_id,
            skill_id,
            is_advance,
            xp_cost,
            credits_increase,
            fighter_injury_id
        )
        VALUES (
            input_fighter_id,
            injury_record.skill_id,
            false,
            '0',
            0,
            new_injury_id
        )
        RETURNING id INTO new_fighter_skill_id;

        -- Update the fighter_injury with the fighter_skill_id
        UPDATE fighter_injuries
        SET fighter_skill_id = new_fighter_skill_id
        WHERE id = new_injury_id;
    END IF;

    -- Return the newly created injury with related skill if present
    RETURN QUERY
    SELECT json_build_object(
        'id', fi.id,
        'created_at', fi.created_at,
        'fighter_id', fi.fighter_id,
        'injury_id', fi.injury_id,
        'injury_name', fi.injury_name,
        'code_1', fi.code_1,
        'characteristic_1', fi.characteristic_1,
        'code_2', fi.code_2,
        'characteristic_2', fi.characteristic_2,
        'related_skill', CASE
            WHEN fi.fighter_skill_id IS NOT NULL THEN (
                SELECT json_build_object(
                    'id', fs.id,
                    'skill_id', fs.skill_id,
                    'is_advance', fs.is_advance,
                    'xp_cost', fs.xp_cost,
                    'credits_increase', fs.credits_increase
                )
                FROM fighter_skills fs
                WHERE fs.id = fi.fighter_skill_id
            )
            ELSE NULL
        END
    ) as result
    FROM fighter_injuries fi
    WHERE fi.id = new_injury_id;
END;
