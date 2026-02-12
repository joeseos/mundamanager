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
    v_gang_id uuid;
    v_fighter_type_id uuid;
    v_custom_fighter_type_id uuid;
BEGIN
    -- Get fighter class, gang origin ID, gang ID, fighter type IDs, and verify fighter exists
    SELECT f.fighter_class, g.gang_origin_id, f.gang_id, f.fighter_type_id, f.custom_fighter_type_id
    INTO v_fighter_class, v_gang_origin_id, v_gang_id, v_fighter_type_id, v_custom_fighter_type_id
    FROM fighters f
    JOIN gangs g ON g.id = f.gang_id
    WHERE f.id = get_available_skills.fighter_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Fighter not found with ID %', get_available_skills.fighter_id;
    END IF;

    -- Build the result as JSON using CTEs to combine standard + custom skills
    WITH standard_skills AS (
        SELECT
            s.id AS skill_id,
            s.name AS skill_name,
            false AS is_custom,
            s.skill_type_id,
            st.name AS skill_type_name,
            st.legendary_name,
            COALESCE(sao.access_level, ftsa.access_level) AS effective_access_level,
            NOT EXISTS (
                SELECT 1 FROM fighter_skills fs
                WHERE fs.fighter_id = get_available_skills.fighter_id
                AND fs.skill_id = s.id
            ) AS available
        FROM skills s
        JOIN skill_types st ON st.id = s.skill_type_id
        LEFT JOIN fighter_type_skill_access ftsa ON ftsa.skill_type_id = s.skill_type_id
            AND (
                (v_custom_fighter_type_id IS NOT NULL AND ftsa.custom_fighter_type_id = v_custom_fighter_type_id)
                OR (v_custom_fighter_type_id IS NULL AND ftsa.fighter_type_id = v_fighter_type_id)
            )
        LEFT JOIN fighter_skill_access_override sao ON sao.fighter_id = get_available_skills.fighter_id
            AND sao.skill_type_id = s.skill_type_id
        WHERE (s.gang_origin_id IS NULL OR s.gang_origin_id = v_gang_origin_id)
        AND COALESCE(sao.access_level, ftsa.access_level, 'none') != 'denied'
    ),
    visible_custom_skills AS (
        SELECT
            cs.id AS skill_id,
            cs.skill_name AS skill_name,
            true AS is_custom,
            cs.skill_type_id,
            st.name AS skill_type_name,
            st.legendary_name,
            COALESCE(sao.access_level, ftsa.access_level) AS effective_access_level,
            NOT EXISTS (
                SELECT 1 FROM fighter_skills fs
                WHERE fs.fighter_id = get_available_skills.fighter_id
                AND fs.custom_skill_id = cs.id
            ) AS available
        FROM custom_skills cs
        JOIN skill_types st ON st.id = cs.skill_type_id
        -- Visibility: owned by current user OR shared to fighter's gang's campaign
        LEFT JOIN (
            SELECT DISTINCT csh.custom_skill_id
            FROM custom_shared csh
            JOIN campaign_gangs cg ON cg.campaign_id = csh.campaign_id
            WHERE cg.gang_id = v_gang_id
        ) shared ON shared.custom_skill_id = cs.id
        -- Same access level joins as standard skills
        LEFT JOIN fighter_type_skill_access ftsa ON ftsa.skill_type_id = cs.skill_type_id
            AND (
                (v_custom_fighter_type_id IS NOT NULL AND ftsa.custom_fighter_type_id = v_custom_fighter_type_id)
                OR (v_custom_fighter_type_id IS NULL AND ftsa.fighter_type_id = v_fighter_type_id)
            )
        LEFT JOIN fighter_skill_access_override sao ON sao.fighter_id = get_available_skills.fighter_id
            AND sao.skill_type_id = cs.skill_type_id
        WHERE (cs.user_id = auth.uid() OR shared.custom_skill_id IS NOT NULL)
        AND COALESCE(sao.access_level, ftsa.access_level, 'none') != 'denied'
    ),
    all_skills AS (
        SELECT * FROM standard_skills
        UNION ALL
        SELECT * FROM visible_custom_skills
    )
    SELECT jsonb_build_object(
        'fighter_id', get_available_skills.fighter_id,
        'fighter_class', v_fighter_class,
        'skills', COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'skill_id', a.skill_id,
                    'skill_name', a.skill_name,
                    'is_custom', a.is_custom,
                    'fighter_class', v_fighter_class,
                    'skill_type_id', a.skill_type_id,
                    'skill_type_name', a.skill_type_name,
                    'effective_access_level', a.effective_access_level,
                    'available', a.available,
                    'available_acquisition_types', CASE
                        -- Special costs for Legendary Names
                        WHEN a.legendary_name = TRUE THEN
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
                        WHEN v_fighter_class IN ('Leader', 'Champion', 'Juve', 'Specialist', 'Crew', 'Prospect', 'Brute', 'Exotic Beast Specialist')
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
                ORDER BY a.skill_type_name, a.skill_name
            ),
            '[]'::jsonb
        )
    )
    INTO v_result
    FROM all_skills a;

    RETURN v_result;
END;
$$;
