
DECLARE
    v_result jsonb;
    v_fighter_class text;
BEGIN
    -- First verify the fighter exists and get their class
    SELECT fighter_class INTO v_fighter_class
    FROM fighters f
    WHERE f.id = get_fighter_skills.fighter_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Fighter not found with ID %', get_fighter_skills.fighter_id;
    END IF;

    -- Build the result as JSON
    WITH available_skills AS (
        SELECT
            'test'::text as test_message,
            f.fighter_class,
            s.name as skill_name,
            s.skill_type_id,
            st.name as skill_type_name
        FROM fighters f
        CROSS JOIN skills s
        JOIN skill_types st ON st.id = s.skill_type_id
        WHERE f.id = get_fighter_skills.fighter_id
    )
    SELECT jsonb_build_object(
        'fighter_id', get_fighter_skills.fighter_id,
        'fighter_class', v_fighter_class,
        'skills', COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'test_message', test_message,
                    'fighter_class', fighter_class,
                    'skill_name', skill_name,
                    'skill_type_id', skill_type_id,
                    'skill_type_name', skill_type_name
                )
                ORDER BY skill_type_name, skill_name
            ),
            '[]'::jsonb
        )
    )
    INTO v_result
    FROM available_skills;

    RETURN v_result;
END;
