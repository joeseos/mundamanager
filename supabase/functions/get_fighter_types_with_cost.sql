-- Drop previous versions
DROP FUNCTION IF EXISTS get_fighter_types_with_cost(uuid, boolean);
DROP FUNCTION IF EXISTS get_fighter_types_with_cost(uuid);
DROP FUNCTION IF EXISTS get_fighter_types_with_cost();

-- Create new function with optional parameters
CREATE OR REPLACE FUNCTION get_fighter_types_with_cost(
    p_gang_type_id uuid DEFAULT NULL,
    p_is_gang_addition boolean DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    fighter_type text,
    fighter_class text,
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
    alignment alignment,
    is_gang_addition boolean,
    default_equipment jsonb,
    equipment_selection jsonb,
    total_cost numeric
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT
        ft.id,
        ft.fighter_type,
        fc.class_name,
        ft.gang_type,
        -- Use adjusted_cost if available, otherwise use original cost
        COALESCE(ftgc.adjusted_cost, ft.cost) as cost,
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
        ft.alignment,
        ft.is_gang_addition,
        (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'id', e.id,
                    'equipment_name', e.equipment_name,
                    'equipment_type', e.equipment_type,
                    'equipment_category', e.equipment_category,
                    'cost', 0,
                    'availability', e.availability,
                    'faction', e.faction
                )
            ), '[]'::jsonb)
            FROM fighter_defaults fd
            JOIN equipment e ON e.id = fd.equipment_id
            WHERE fd.fighter_type_id = ft.id
        ) AS default_equipment,
        (
            SELECT 
                CASE 
                    WHEN fes.equipment_selection IS NOT NULL THEN
                        jsonb_build_object(
                            'single', jsonb_build_object(
                                'wargear', COALESCE(
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
                                        FROM jsonb_array_elements(fes.equipment_selection->'single'->'wargear') AS item_data
                                        LEFT JOIN equipment e ON e.id = (item_data->>'id')::uuid
                                        WHERE e.id IS NOT NULL
                                    ),
                                    '[]'::jsonb
                                ),
                                'weapons', COALESCE(
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
                                        FROM jsonb_array_elements(fes.equipment_selection->'single'->'weapons') AS item_data
                                        LEFT JOIN equipment e ON e.id = (item_data->>'id')::uuid
                                        WHERE e.id IS NOT NULL
                                    ),
                                    '[]'::jsonb
                                )
                            ),
                            'multiple', jsonb_build_object(
                                'wargear', COALESCE(
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
                                        FROM jsonb_array_elements(fes.equipment_selection->'multiple'->'wargear') AS item_data
                                        LEFT JOIN equipment e ON e.id = (item_data->>'id')::uuid
                                        WHERE e.id IS NOT NULL
                                    ),
                                    '[]'::jsonb
                                ),
                                'weapons', COALESCE(
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
                                        FROM jsonb_array_elements(fes.equipment_selection->'multiple'->'weapons') AS item_data
                                        LEFT JOIN equipment e ON e.id = (item_data->>'id')::uuid
                                        WHERE e.id IS NOT NULL
                                    ),
                                    '[]'::jsonb
                                )
                            ),
                            'optional', jsonb_build_object(
                                'wargear', COALESCE(
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
                                        FROM jsonb_array_elements(fes.equipment_selection->'optional'->'wargear') AS item_data
                                        LEFT JOIN equipment e ON e.id = (item_data->>'id')::uuid
                                        WHERE e.id IS NOT NULL
                                    ),
                                    '[]'::jsonb
                                ),
                                'weapons', COALESCE(
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
                                        FROM jsonb_array_elements(fes.equipment_selection->'optional'->'weapons') AS item_data
                                        LEFT JOIN equipment e ON e.id = (item_data->>'id')::uuid
                                        WHERE e.id IS NOT NULL
                                    ),
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
        -- Use adjusted_cost for total_cost if available, otherwise use original cost
        COALESCE(ftgc.adjusted_cost, ft.cost) AS total_cost
    FROM fighter_types ft
    JOIN fighter_classes fc ON fc.id = ft.fighter_class_id
    LEFT JOIN fighter_type_gang_cost ftgc ON ftgc.fighter_type_id = ft.id 
        AND ftgc.gang_type_id = p_gang_type_id
    WHERE
        -- Removed the gang_type_id restriction for gang additions
        (p_is_gang_addition IS NULL OR ft.is_gang_addition = p_is_gang_addition);
END;
$$;