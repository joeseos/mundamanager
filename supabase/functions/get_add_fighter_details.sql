-- Drop the function if it already exists
DROP FUNCTION IF EXISTS get_add_fighter_details(uuid);

-- Create the new function
CREATE OR REPLACE FUNCTION get_add_fighter_details(p_gang_type_id uuid)
RETURNS TABLE (
    id uuid,
    fighter_type text,
    fighter_class text,
    fighter_class_id uuid,  -- Added fighter_class_id field
    gang_type text,
    cost numeric,
    gang_type_id uuid,
    special_rules text[],
    movement numeric,
    weapon_skill numeric,
    ballistic_skill numeric,
    strength numeric,
    toughness numeric,
    wounds numeric,
    initiative numeric,
    leadership numeric,
    cool numeric,
    willpower numeric,
    intelligence numeric,
    attacks numeric,
    limitation numeric,
    default_equipment jsonb,
    equipment_selection jsonb,
    total_cost numeric,
    sub_type jsonb,
    available_legacies jsonb
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ft.id,
        ft.fighter_type,
        fc.class_name,
        ft.fighter_class_id,  -- Added fighter_class_id field
        ft.gang_type,
        ft.cost,
        ft.gang_type_id,
        ft.special_rules::text[],
        ft.movement,
        ft.weapon_skill,
        ft.ballistic_skill,
        ft.strength,
        ft.toughness,
        ft.wounds,
        ft.initiative,
        ft.leadership,
        ft.cool,
        ft.willpower,
        ft.intelligence,
        ft.attacks,
        ft.limitation,
        COALESCE(
            (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'id', e.id,
                        'equipment_name', e.equipment_name,
                        'equipment_type', e.equipment_type,
                        'equipment_category', e.equipment_category,
                        'cost', 0,  -- Always show 0 for default equipment
                        'availability', e.availability,
                        'faction', e.faction
                    )
                )
                FROM fighter_defaults fd
                JOIN equipment e ON e.id = fd.equipment_id
                WHERE fd.fighter_type_id = ft.id
            ),
            '[]'::jsonb
        ) AS default_equipment,
        (
            SELECT 
                CASE 
                    WHEN fes.equipment_selection IS NOT NULL THEN
                        jsonb_build_object(
                            'single', jsonb_build_object(
                                'wargear', COALESCE(
                                    CASE 
                                        WHEN jsonb_typeof(fes.equipment_selection->'single'->'wargear') = 'array' 
                                             AND jsonb_array_length(fes.equipment_selection->'single'->'wargear') > 0
                                             AND jsonb_typeof(fes.equipment_selection->'single'->'wargear'->0) = 'array'
                                        THEN (
                                            SELECT jsonb_agg(
                                                (
                                                    SELECT jsonb_agg(
                                                        jsonb_build_object(
                                                            'id', (item_data->>'id')::uuid,
                                                            'equipment_name', e.equipment_name,
                                                            'equipment_type', e.equipment_type,
                                                            'equipment_category', e.equipment_category,
                                                            'cost', (item_data->>'cost')::numeric,
                                                            'quantity', (item_data->>'quantity')::integer,
                                                            'is_default', (item_data->>'is_default')::boolean,
                                                            'replacements', COALESCE(
                                                                (
                                                                    SELECT jsonb_agg(
                                                                        jsonb_build_object(
                                                                            'id', (repl->>'id')::uuid,
                                                                            'equipment_name', re.equipment_name,
                                                                            'equipment_type', re.equipment_type,
                                                                            'equipment_category', re.equipment_category,
                                                                            'cost', (repl->>'cost')::numeric,
                                                                            'max_quantity', (repl->>'max_quantity')::integer
                                                                        )
                                                                    )
                                                                    FROM jsonb_array_elements(item_data->'replacements') AS repl
                                                                    LEFT JOIN equipment re ON re.id = (repl->>'id')::uuid
                                                                    WHERE re.id IS NOT NULL
                                                                ),
                                                                '[]'::jsonb
                                                            )
                                                        )
                                                    )
                                                    FROM jsonb_array_elements(group_data) AS item_data
                                                    LEFT JOIN equipment e ON e.id = (item_data->>'id')::uuid
                                                    WHERE e.id IS NOT NULL
                                                )
                                            )
                                            FROM jsonb_array_elements(fes.equipment_selection->'single'->'wargear') AS group_data
                                            WHERE jsonb_array_length(group_data) > 0
                                        )
                                        ELSE (
                                            SELECT CASE 
                                                WHEN COUNT(*) > 0 THEN jsonb_build_array(jsonb_agg(
                                                    jsonb_build_object(
                                                        'id', (item_data->>'id')::uuid,
                                                        'equipment_name', e.equipment_name,
                                                        'equipment_type', e.equipment_type,
                                                        'equipment_category', e.equipment_category,
                                                        'cost', (item_data->>'cost')::numeric,
                                                        'quantity', (item_data->>'quantity')::integer,
                                                        'is_default', (item_data->>'is_default')::boolean,
                                                        'replacements', COALESCE(
                                                            (
                                                                SELECT jsonb_agg(
                                                                    jsonb_build_object(
                                                                        'id', (repl->>'id')::uuid,
                                                                        'equipment_name', re.equipment_name,
                                                                        'equipment_type', re.equipment_type,
                                                                        'equipment_category', re.equipment_category,
                                                                        'cost', (repl->>'cost')::numeric,
                                                                        'max_quantity', (repl->>'max_quantity')::integer
                                                                    )
                                                                )
                                                                FROM jsonb_array_elements(item_data->'replacements') AS repl
                                                                LEFT JOIN equipment re ON re.id = (repl->>'id')::uuid
                                                                WHERE re.id IS NOT NULL
                                                            ),
                                                            '[]'::jsonb
                                                        )
                                                    )
                                                ))
                                                ELSE '[]'::jsonb
                                            END
                                            FROM jsonb_array_elements(fes.equipment_selection->'single'->'wargear') AS item_data
                                            LEFT JOIN equipment e ON e.id = (item_data->>'id')::uuid
                                            WHERE e.id IS NOT NULL
                                        )
                                    END,
                                    '[]'::jsonb
                                ),
                                'weapons', COALESCE(
                                    CASE 
                                        WHEN jsonb_typeof(fes.equipment_selection->'single'->'weapons') = 'array' 
                                             AND jsonb_array_length(fes.equipment_selection->'single'->'weapons') > 0
                                             AND jsonb_typeof(fes.equipment_selection->'single'->'weapons'->0) = 'array'
                                        THEN (
                                            SELECT jsonb_agg(
                                                (
                                                    SELECT jsonb_agg(
                                                        jsonb_build_object(
                                                            'id', (item_data->>'id')::uuid,
                                                            'equipment_name', e.equipment_name,
                                                            'equipment_type', e.equipment_type,
                                                            'equipment_category', e.equipment_category,
                                                            'cost', (item_data->>'cost')::numeric,
                                                            'quantity', (item_data->>'quantity')::integer,
                                                            'is_default', (item_data->>'is_default')::boolean,
                                                            'replacements', COALESCE(
                                                                (
                                                                    SELECT jsonb_agg(
                                                                        jsonb_build_object(
                                                                            'id', (repl->>'id')::uuid,
                                                                            'equipment_name', re.equipment_name,
                                                                            'equipment_type', re.equipment_type,
                                                                            'equipment_category', re.equipment_category,
                                                                            'cost', (repl->>'cost')::numeric,
                                                                            'max_quantity', (repl->>'max_quantity')::integer
                                                                        )
                                                                    )
                                                                    FROM jsonb_array_elements(item_data->'replacements') AS repl
                                                                    LEFT JOIN equipment re ON re.id = (repl->>'id')::uuid
                                                                    WHERE re.id IS NOT NULL
                                                                ),
                                                                '[]'::jsonb
                                                            )
                                                        )
                                                    )
                                                    FROM jsonb_array_elements(group_data) AS item_data
                                                    LEFT JOIN equipment e ON e.id = (item_data->>'id')::uuid
                                                    WHERE e.id IS NOT NULL
                                                )
                                            )
                                            FROM jsonb_array_elements(fes.equipment_selection->'single'->'weapons') AS group_data
                                            WHERE jsonb_array_length(group_data) > 0
                                        )
                                        ELSE (
                                            SELECT CASE 
                                                WHEN COUNT(*) > 0 THEN jsonb_build_array(jsonb_agg(
                                                    jsonb_build_object(
                                                        'id', (item_data->>'id')::uuid,
                                                        'equipment_name', e.equipment_name,
                                                        'equipment_type', e.equipment_type,
                                                        'equipment_category', e.equipment_category,
                                                        'cost', (item_data->>'cost')::numeric,
                                                        'quantity', (item_data->>'quantity')::integer,
                                                        'is_default', (item_data->>'is_default')::boolean,
                                                        'replacements', COALESCE(
                                                            (
                                                                SELECT jsonb_agg(
                                                                    jsonb_build_object(
                                                                        'id', (repl->>'id')::uuid,
                                                                        'equipment_name', re.equipment_name,
                                                                        'equipment_type', re.equipment_type,
                                                                        'equipment_category', re.equipment_category,
                                                                        'cost', (repl->>'cost')::numeric,
                                                                        'max_quantity', (repl->>'max_quantity')::integer
                                                                    )
                                                                )
                                                                FROM jsonb_array_elements(item_data->'replacements') AS repl
                                                                LEFT JOIN equipment re ON re.id = (repl->>'id')::uuid
                                                                WHERE re.id IS NOT NULL
                                                            ),
                                                            '[]'::jsonb
                                                        )
                                                    )
                                                ))
                                                ELSE '[]'::jsonb
                                            END
                                            FROM jsonb_array_elements(fes.equipment_selection->'single'->'weapons') AS item_data
                                            LEFT JOIN equipment e ON e.id = (item_data->>'id')::uuid
                                            WHERE e.id IS NOT NULL
                                        )
                                    END,
                                    '[]'::jsonb
                                )
                            ),
                            'multiple', jsonb_build_object(
                                'wargear', COALESCE(
                                    CASE 
                                        WHEN jsonb_typeof(fes.equipment_selection->'multiple'->'wargear') = 'array' 
                                             AND jsonb_array_length(fes.equipment_selection->'multiple'->'wargear') > 0
                                             AND jsonb_typeof(fes.equipment_selection->'multiple'->'wargear'->0) = 'array'
                                        THEN (
                                            SELECT jsonb_agg(
                                                (
                                                    SELECT jsonb_agg(
                                                        jsonb_build_object(
                                                            'id', (item_data->>'id')::uuid,
                                                            'equipment_name', e.equipment_name,
                                                            'equipment_type', e.equipment_type,
                                                            'equipment_category', e.equipment_category,
                                                            'cost', (item_data->>'cost')::numeric,
                                                            'quantity', (item_data->>'quantity')::integer,
                                                            'is_default', (item_data->>'is_default')::boolean,
                                                            'replacements', COALESCE(
                                                                (
                                                                    SELECT jsonb_agg(
                                                                        jsonb_build_object(
                                                                            'id', (repl->>'id')::uuid,
                                                                            'equipment_name', re.equipment_name,
                                                                            'equipment_type', re.equipment_type,
                                                                            'equipment_category', re.equipment_category,
                                                                            'cost', (repl->>'cost')::numeric,
                                                                            'max_quantity', (repl->>'max_quantity')::integer
                                                                        )
                                                                    )
                                                                    FROM jsonb_array_elements(item_data->'replacements') AS repl
                                                                    LEFT JOIN equipment re ON re.id = (repl->>'id')::uuid
                                                                    WHERE re.id IS NOT NULL
                                                                ),
                                                                '[]'::jsonb
                                                            )
                                                        )
                                                    )
                                                    FROM jsonb_array_elements(group_data) AS item_data
                                                    LEFT JOIN equipment e ON e.id = (item_data->>'id')::uuid
                                                    WHERE e.id IS NOT NULL
                                                )
                                            )
                                            FROM jsonb_array_elements(fes.equipment_selection->'multiple'->'wargear') AS group_data
                                            WHERE jsonb_array_length(group_data) > 0
                                        )
                                        ELSE (
                                            SELECT CASE 
                                                WHEN COUNT(*) > 0 THEN jsonb_build_array(jsonb_agg(
                                                    jsonb_build_object(
                                                        'id', (item_data->>'id')::uuid,
                                                        'equipment_name', e.equipment_name,
                                                        'equipment_type', e.equipment_type,
                                                        'equipment_category', e.equipment_category,
                                                        'cost', (item_data->>'cost')::numeric,
                                                        'quantity', (item_data->>'quantity')::integer,
                                                        'is_default', (item_data->>'is_default')::boolean,
                                                        'replacements', COALESCE(
                                                            (
                                                                SELECT jsonb_agg(
                                                                    jsonb_build_object(
                                                                        'id', (repl->>'id')::uuid,
                                                                        'equipment_name', re.equipment_name,
                                                                        'equipment_type', re.equipment_type,
                                                                        'equipment_category', re.equipment_category,
                                                                        'cost', (repl->>'cost')::numeric,
                                                                        'max_quantity', (repl->>'max_quantity')::integer
                                                                    )
                                                                )
                                                                FROM jsonb_array_elements(item_data->'replacements') AS repl
                                                                LEFT JOIN equipment re ON re.id = (repl->>'id')::uuid
                                                                WHERE re.id IS NOT NULL
                                                            ),
                                                            '[]'::jsonb
                                                        )
                                                    )
                                                ))
                                                ELSE '[]'::jsonb
                                            END
                                            FROM jsonb_array_elements(fes.equipment_selection->'multiple'->'wargear') AS item_data
                                            LEFT JOIN equipment e ON e.id = (item_data->>'id')::uuid
                                            WHERE e.id IS NOT NULL
                                        )
                                    END,
                                    '[]'::jsonb
                                ),
                                'weapons', COALESCE(
                                    CASE 
                                        WHEN jsonb_typeof(fes.equipment_selection->'multiple'->'weapons') = 'array' 
                                             AND jsonb_array_length(fes.equipment_selection->'multiple'->'weapons') > 0
                                             AND jsonb_typeof(fes.equipment_selection->'multiple'->'weapons'->0) = 'array'
                                        THEN (
                                            SELECT jsonb_agg(
                                                (
                                                    SELECT jsonb_agg(
                                                        jsonb_build_object(
                                                            'id', (item_data->>'id')::uuid,
                                                            'equipment_name', e.equipment_name,
                                                            'equipment_type', e.equipment_type,
                                                            'equipment_category', e.equipment_category,
                                                            'cost', (item_data->>'cost')::numeric,
                                                            'quantity', (item_data->>'quantity')::integer,
                                                            'is_default', (item_data->>'is_default')::boolean,
                                                            'replacements', COALESCE(
                                                                (
                                                                    SELECT jsonb_agg(
                                                                        jsonb_build_object(
                                                                            'id', (repl->>'id')::uuid,
                                                                            'equipment_name', re.equipment_name,
                                                                            'equipment_type', re.equipment_type,
                                                                            'equipment_category', re.equipment_category,
                                                                            'cost', (repl->>'cost')::numeric,
                                                                            'max_quantity', (repl->>'max_quantity')::integer
                                                                        )
                                                                    )
                                                                    FROM jsonb_array_elements(item_data->'replacements') AS repl
                                                                    LEFT JOIN equipment re ON re.id = (repl->>'id')::uuid
                                                                    WHERE re.id IS NOT NULL
                                                                ),
                                                                '[]'::jsonb
                                                            )
                                                        )
                                                    )
                                                    FROM jsonb_array_elements(group_data) AS item_data
                                                    LEFT JOIN equipment e ON e.id = (item_data->>'id')::uuid
                                                    WHERE e.id IS NOT NULL
                                                )
                                            )
                                            FROM jsonb_array_elements(fes.equipment_selection->'multiple'->'weapons') AS group_data
                                            WHERE jsonb_array_length(group_data) > 0
                                        )
                                        ELSE (
                                            SELECT CASE 
                                                WHEN COUNT(*) > 0 THEN jsonb_build_array(jsonb_agg(
                                                    jsonb_build_object(
                                                        'id', (item_data->>'id')::uuid,
                                                        'equipment_name', e.equipment_name,
                                                        'equipment_type', e.equipment_type,
                                                        'equipment_category', e.equipment_category,
                                                        'cost', (item_data->>'cost')::numeric,
                                                        'quantity', (item_data->>'quantity')::integer,
                                                        'is_default', (item_data->>'is_default')::boolean,
                                                        'replacements', COALESCE(
                                                            (
                                                                SELECT jsonb_agg(
                                                                    jsonb_build_object(
                                                                        'id', (repl->>'id')::uuid,
                                                                        'equipment_name', re.equipment_name,
                                                                        'equipment_type', re.equipment_type,
                                                                        'equipment_category', re.equipment_category,
                                                                        'cost', (repl->>'cost')::numeric,
                                                                        'max_quantity', (repl->>'max_quantity')::integer
                                                                    )
                                                                )
                                                                FROM jsonb_array_elements(item_data->'replacements') AS repl
                                                                LEFT JOIN equipment re ON re.id = (repl->>'id')::uuid
                                                                WHERE re.id IS NOT NULL
                                                            ),
                                                            '[]'::jsonb
                                                        )
                                                    )
                                                ))
                                                ELSE '[]'::jsonb
                                            END
                                            FROM jsonb_array_elements(fes.equipment_selection->'multiple'->'weapons') AS item_data
                                            LEFT JOIN equipment e ON e.id = (item_data->>'id')::uuid
                                            WHERE e.id IS NOT NULL
                                        )
                                    END,
                                    '[]'::jsonb
                                )
                            ),
                            'optional', jsonb_build_object(
                                'wargear', COALESCE(
                                    CASE 
                                        WHEN jsonb_typeof(fes.equipment_selection->'optional'->'wargear') = 'array' 
                                             AND jsonb_array_length(fes.equipment_selection->'optional'->'wargear') > 0
                                             AND jsonb_typeof(fes.equipment_selection->'optional'->'wargear'->0) = 'array'
                                        THEN (
                                            SELECT jsonb_agg(
                                                (
                                                    SELECT jsonb_agg(
                                                        jsonb_build_object(
                                                            'id', (item_data->>'id')::uuid,
                                                            'equipment_name', e.equipment_name,
                                                            'equipment_type', e.equipment_type,
                                                            'equipment_category', e.equipment_category,
                                                            'cost', (item_data->>'cost')::numeric,
                                                            'quantity', (item_data->>'quantity')::integer,
                                                            'is_default', (item_data->>'is_default')::boolean,
                                                            'replacements', COALESCE(
                                                                (
                                                                    SELECT jsonb_agg(
                                                                        jsonb_build_object(
                                                                            'id', (repl->>'id')::uuid,
                                                                            'equipment_name', re.equipment_name,
                                                                            'equipment_type', re.equipment_type,
                                                                            'equipment_category', re.equipment_category,
                                                                            'cost', (repl->>'cost')::numeric,
                                                                            'max_quantity', (repl->>'max_quantity')::integer
                                                                        )
                                                                    )
                                                                    FROM jsonb_array_elements(item_data->'replacements') AS repl
                                                                    LEFT JOIN equipment re ON re.id = (repl->>'id')::uuid
                                                                    WHERE re.id IS NOT NULL
                                                                ),
                                                                '[]'::jsonb
                                                            )
                                                        )
                                                    )
                                                    FROM jsonb_array_elements(group_data) AS item_data
                                                    LEFT JOIN equipment e ON e.id = (item_data->>'id')::uuid
                                                    WHERE e.id IS NOT NULL
                                                )
                                            )
                                            FROM jsonb_array_elements(fes.equipment_selection->'optional'->'wargear') AS group_data
                                            WHERE jsonb_array_length(group_data) > 0
                                        )
                                        ELSE (
                                            SELECT CASE 
                                                WHEN COUNT(*) > 0 THEN jsonb_build_array(jsonb_agg(
                                                    jsonb_build_object(
                                                        'id', (item_data->>'id')::uuid,
                                                        'equipment_name', e.equipment_name,
                                                        'equipment_type', e.equipment_type,
                                                        'equipment_category', e.equipment_category,
                                                        'cost', (item_data->>'cost')::numeric,
                                                        'quantity', (item_data->>'quantity')::integer,
                                                        'is_default', (item_data->>'is_default')::boolean,
                                                        'replacements', COALESCE(
                                                            (
                                                                SELECT jsonb_agg(
                                                                    jsonb_build_object(
                                                                        'id', (repl->>'id')::uuid,
                                                                        'equipment_name', re.equipment_name,
                                                                        'equipment_type', re.equipment_type,
                                                                        'equipment_category', re.equipment_category,
                                                                        'cost', (repl->>'cost')::numeric,
                                                                        'max_quantity', (repl->>'max_quantity')::integer
                                                                    )
                                                                )
                                                                FROM jsonb_array_elements(item_data->'replacements') AS repl
                                                                LEFT JOIN equipment re ON re.id = (repl->>'id')::uuid
                                                                WHERE re.id IS NOT NULL
                                                            ),
                                                            '[]'::jsonb
                                                        )
                                                    )
                                                ))
                                                ELSE '[]'::jsonb
                                            END
                                            FROM jsonb_array_elements(fes.equipment_selection->'optional'->'wargear') AS item_data
                                            LEFT JOIN equipment e ON e.id = (item_data->>'id')::uuid
                                            WHERE e.id IS NOT NULL
                                        )
                                    END,
                                    '[]'::jsonb
                                ),
                                'weapons', COALESCE(
                                    CASE 
                                        WHEN jsonb_typeof(fes.equipment_selection->'optional'->'weapons') = 'array' 
                                             AND jsonb_array_length(fes.equipment_selection->'optional'->'weapons') > 0
                                             AND jsonb_typeof(fes.equipment_selection->'optional'->'weapons'->0) = 'array'
                                        THEN (
                                            SELECT jsonb_agg(
                                                (
                                                    SELECT jsonb_agg(
                                                        jsonb_build_object(
                                                            'id', (item_data->>'id')::uuid,
                                                            'equipment_name', e.equipment_name,
                                                            'equipment_type', e.equipment_type,
                                                            'equipment_category', e.equipment_category,
                                                            'cost', (item_data->>'cost')::numeric,
                                                            'quantity', (item_data->>'quantity')::integer,
                                                            'is_default', (item_data->>'is_default')::boolean,
                                                            'replacements', COALESCE(
                                                                (
                                                                    SELECT jsonb_agg(
                                                                        jsonb_build_object(
                                                                            'id', (repl->>'id')::uuid,
                                                                            'equipment_name', re.equipment_name,
                                                                            'equipment_type', re.equipment_type,
                                                                            'equipment_category', re.equipment_category,
                                                                            'cost', (repl->>'cost')::numeric,
                                                                            'max_quantity', (repl->>'max_quantity')::integer
                                                                        )
                                                                    )
                                                                    FROM jsonb_array_elements(item_data->'replacements') AS repl
                                                                    LEFT JOIN equipment re ON re.id = (repl->>'id')::uuid
                                                                    WHERE re.id IS NOT NULL
                                                                ),
                                                                '[]'::jsonb
                                                            )
                                                        )
                                                    )
                                                    FROM jsonb_array_elements(group_data) AS item_data
                                                    LEFT JOIN equipment e ON e.id = (item_data->>'id')::uuid
                                                    WHERE e.id IS NOT NULL
                                                )
                                            )
                                            FROM jsonb_array_elements(fes.equipment_selection->'optional'->'weapons') AS group_data
                                            WHERE jsonb_array_length(group_data) > 0
                                        )
                                        ELSE (
                                            SELECT CASE 
                                                WHEN COUNT(*) > 0 THEN jsonb_build_array(jsonb_agg(
                                                    jsonb_build_object(
                                                        'id', (item_data->>'id')::uuid,
                                                        'equipment_name', e.equipment_name,
                                                        'equipment_type', e.equipment_type,
                                                        'equipment_category', e.equipment_category,
                                                        'cost', (item_data->>'cost')::numeric,
                                                        'quantity', (item_data->>'quantity')::integer,
                                                        'is_default', (item_data->>'is_default')::boolean,
                                                        'replacements', COALESCE(
                                                            (
                                                                SELECT jsonb_agg(
                                                                    jsonb_build_object(
                                                                        'id', (repl->>'id')::uuid,
                                                                        'equipment_name', re.equipment_name,
                                                                        'equipment_type', re.equipment_type,
                                                                        'equipment_category', re.equipment_category,
                                                                        'cost', (repl->>'cost')::numeric,
                                                                        'max_quantity', (repl->>'max_quantity')::integer
                                                                    )
                                                                )
                                                                FROM jsonb_array_elements(item_data->'replacements') AS repl
                                                                LEFT JOIN equipment re ON re.id = (repl->>'id')::uuid
                                                                WHERE re.id IS NOT NULL
                                                            ),
                                                            '[]'::jsonb
                                                        )
                                                    )
                                                ))
                                                ELSE '[]'::jsonb
                                            END
                                            FROM jsonb_array_elements(fes.equipment_selection->'optional'->'weapons') AS item_data
                                            LEFT JOIN equipment e ON e.id = (item_data->>'id')::uuid
                                            WHERE e.id IS NOT NULL
                                        )
                                    END,
                                    '[]'::jsonb
                                )
                            )
                        )
                    ELSE NULL
                END
            FROM fighter_equipment_selections fes
            WHERE fes.fighter_type_id = ft.id
            LIMIT 1
        ) AS equipment_selection,
        ft.cost AS total_cost,
        COALESCE(
            (
                SELECT jsonb_build_object(
                    'id', fst.id,
                    'sub_type_name', fst.sub_type_name
                )
                FROM fighter_sub_types fst
                WHERE fst.id = ft.fighter_sub_type_id
            ),
            '{}'::jsonb
        ) AS sub_type,
        COALESCE(
            (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'id', fgl.id,
                        'name', fgl.name
                    )
                )
                FROM fighter_type_gang_lineage ftgl
                JOIN fighter_gang_legacy fgl ON fgl.id = ftgl.fighter_gang_legacy_id
                WHERE ftgl.fighter_type_id = ft.id
            ),
            '[]'::jsonb
        ) AS available_legacies
    FROM fighter_types ft
    JOIN fighter_classes fc ON fc.id = ft.fighter_class_id
    WHERE ft.gang_type_id = p_gang_type_id;
END;
$$;