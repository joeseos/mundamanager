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
            -- Process all equipment selection categories
            SELECT 
                CASE 
                    WHEN fes.equipment_selection IS NOT NULL THEN
                        (
                            SELECT 
                                -- Process each category in the equipment_selection JSON
                                jsonb_object_agg(
                                    cat_key,
                                    jsonb_build_object(
                                        'name', cat_val->>'name',
                                        'select_type', cat_val->>'select_type',
                                        -- Process options for this category
                                        'options', COALESCE(
                                            (
                                                SELECT jsonb_agg(
                                                    jsonb_build_object(
                                                        'id', opt->>'id',
                                                        'equipment_name', e.equipment_name,
                                                        'equipment_type', e.equipment_type,
                                                        'equipment_category', e.equipment_category,
                                                        'cost', (opt->>'cost')::numeric,
                                                        'max_quantity', (opt->>'max_quantity')::integer
                                                    )
                                                )
                                                FROM jsonb_array_elements(cat_val->'options') AS opt
                                                LEFT JOIN equipment e ON e.id::text = opt->>'id'
                                                WHERE e.id IS NOT NULL
                                            ),
                                            '[]'::jsonb
                                        ),
                                        -- Process default equipment for this category
                                        'default', COALESCE(
                                            (
                                                SELECT jsonb_agg(
                                                    jsonb_build_object(
                                                        'id', def->>'id',
                                                        'equipment_name', e.equipment_name,
                                                        'equipment_type', e.equipment_type,
                                                        'equipment_category', e.equipment_category,
                                                        'quantity', (def->>'quantity')::integer
                                                    )
                                                )
                                                FROM jsonb_array_elements(cat_val->'default') AS def
                                                LEFT JOIN equipment e ON e.id::text = def->>'id'
                                                WHERE e.id IS NOT NULL
                                            ),
                                            '[]'::jsonb
                                        )
                                    )
                                ) 
                            FROM jsonb_each(fes.equipment_selection) AS t(cat_key, cat_val)
                        )
                    ELSE NULL
                END
            FROM fighter_equipment_selections fes
            WHERE fes.fighter_type_id = ft.id
            LIMIT 1
        ) AS equipment_selection,
        ft.cost AS total_cost
    FROM fighter_types ft
    JOIN fighter_classes fc ON fc.id = ft.fighter_class_id
    WHERE
        (p_gang_type_id IS NULL OR ft.gang_type_id = p_gang_type_id)
        AND (p_is_gang_addition IS NULL OR ft.is_gang_addition = p_is_gang_addition);
END;
$$;