DROP FUNCTION IF EXISTS public.get_available_skills(uuid);

CREATE OR REPLACE FUNCTION public.get_available_skills(
    fighter_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result jsonb;
    v_fighter_class text;
BEGIN
    -- Get fighter class and verify fighter exists
    SELECT fighter_class INTO v_fighter_class
    FROM fighters f
    WHERE f.id = get_available_skills.fighter_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Fighter not found with ID %', get_available_skills.fighter_id;
    END IF;

    -- Build the result as JSON
    SELECT jsonb_build_object(
        'fighter_id', get_available_skills.fighter_id,
        'fighter_class', v_fighter_class,
        'skills', COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'skill_id', s.id,
                    'skill_name', s.name,
                    'fighter_class', f.fighter_class,
                    'skill_type_id', s.skill_type_id,
                    'skill_type_name', st.name,
                    'available', NOT EXISTS (
                        SELECT 1 
                        FROM fighter_skills fs 
                        WHERE fs.fighter_id = get_available_skills.fighter_id 
                        AND fs.skill_id = s.id
                    ),
                    'available_acquisition_types', CASE
                        -- Special costs for Legendary Names
                        WHEN st.legendary_name = TRUE THEN
                            jsonb_build_array(
                                jsonb_build_object(
                                    'type_id', 'primary_selected',
                                    'name', 'Selected Primary',
                                    'xp_cost', 6, -- Selected Legendary Name cost
                                    'credit_cost', 5 -- Legendary Name credit increase
                                ),
                                jsonb_build_object(
                                    'type_id', 'primary_random',
                                    'name', 'Random Primary',
                                    'xp_cost', 3, -- Random Legendary Name cost
                                    'credit_cost', 5 -- Legendary Name credit increase
                                ),
                                jsonb_build_object(
                                    'type_id', 'secondary_selected',
                                    'name', 'Selected Secondary',
                                    'xp_cost', 6, -- Selected Legendary Name cost
                                    'credit_cost', 5 -- Legendary Name credit increase
                                ),
                                jsonb_build_object(
                                    'type_id', 'secondary_random',
                                    'name', 'Random Secondary',
                                    'xp_cost', 3, -- Random Legendary Name cost
                                    'credit_cost', 5 -- Legendary Name credit increase
                                ),
                                jsonb_build_object(
                                    'type_id', 'any_random',
                                    'name', 'Random Any',
                                    'xp_cost', 3, -- Random Legendary Name cost
                                    'credit_cost', 5 -- Legendary Name credit increase
                                )
                            )
                        -- Regular skill costs
                        WHEN v_fighter_class IN ('Leader', 'Champion', 'Juve', 'Specialist', 'Crew', 'Prospect', 'Brute')
                        THEN jsonb_build_array(
                            jsonb_build_object(
                                'type_id', 'primary_selected',
                                'name', 'Selected Primary',
                                'xp_cost', 9,
                                'credit_cost', 20
                            ),
                            jsonb_build_object(
                                'type_id', 'primary_random',
                                'name', 'Random Primary',
                                'xp_cost', 6,
                                'credit_cost', 20
                            ),
                            jsonb_build_object(
                                'type_id', 'secondary_selected',
                                'name', 'Selected Secondary',
                                'xp_cost', 12,
                                'credit_cost', 35
                            ),
                            jsonb_build_object(
                                'type_id', 'secondary_random',
                                'name', 'Random Secondary',
                                'xp_cost', 9,
                                'credit_cost', 35
                            ),
                            jsonb_build_object(
                                'type_id', 'any_random',
                                'name', 'Random Any',
                                'xp_cost', 15,
                                'credit_cost', 50
                            )
                        )
                        ELSE '[]'::jsonb
                    END
                )
                ORDER BY st.name, s.name
            ),
            '[]'::jsonb
        )
    )
    INTO v_result
    FROM fighters f
    CROSS JOIN skills s
    JOIN skill_types st ON st.id = s.skill_type_id
    WHERE f.id = get_available_skills.fighter_id;

    RETURN v_result;
END;
$$;
