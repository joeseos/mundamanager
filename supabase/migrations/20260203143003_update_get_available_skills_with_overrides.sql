-- Update get_available_skills function to support skill access overrides
-- Overrides from fighter_skill_access_override take precedence over fighter type defaults

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
    v_gang_origin_id uuid;
    v_fighter_type_id uuid;
    v_custom_fighter_type_id uuid;
BEGIN
    -- Get fighter class, gang origin ID, fighter type IDs, and verify fighter exists
    SELECT f.fighter_class, g.gang_origin_id, f.fighter_type_id, f.custom_fighter_type_id
    INTO v_fighter_class, v_gang_origin_id, v_fighter_type_id, v_custom_fighter_type_id
    FROM fighters f
    JOIN gangs g ON g.id = f.gang_id
    WHERE f.id = get_available_skills.fighter_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Fighter not found with ID %', get_available_skills.fighter_id;
    END IF;

    -- Build the result as JSON
    -- Now includes effective_access_level which respects overrides
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
                    'effective_access_level', COALESCE(
                        sao.access_level,
                        ftsa.access_level
                    ),
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
                                    'type_id', 'selected',
                                    'name', 'Selected',
                                    'xp_cost', 6,
                                    'credit_cost', 5
                                ),
                                jsonb_build_object(
                                    'type_id', 'random',
                                    'name', 'Random',
                                    'xp_cost', 3,
                                    'credit_cost', 5
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
    -- Get default skill access from fighter_type_skill_access (regular or custom)
    LEFT JOIN fighter_type_skill_access ftsa ON ftsa.skill_type_id = s.skill_type_id
        AND (
            (v_custom_fighter_type_id IS NOT NULL AND ftsa.custom_fighter_type_id = v_custom_fighter_type_id)
            OR (v_custom_fighter_type_id IS NULL AND ftsa.fighter_type_id = v_fighter_type_id)
        )
    -- Get overrides from fighter_skill_access_override
    LEFT JOIN fighter_skill_access_override sao ON sao.fighter_id = get_available_skills.fighter_id
        AND sao.skill_type_id = s.skill_type_id
    WHERE f.id = get_available_skills.fighter_id
    AND (s.gang_origin_id IS NULL OR s.gang_origin_id = v_gang_origin_id)
    -- Filter out skills where effective access is 'denied'
    AND COALESCE(sao.access_level, ftsa.access_level, 'none') != 'denied';

    RETURN v_result;
END;
$$;
