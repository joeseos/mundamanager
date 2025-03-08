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
        ) AS default_equipment,
        (
            SELECT jsonb_set(
                fes.equipment_selection::jsonb,
                '{weapons,options}',
                (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'id', opt->>'id',
                            'equipment_name', e.equipment_name,
                            'cost', (opt->>'cost')::numeric,
                            'max_quantity', (opt->>'max_quantity')::integer
                        )
                    )
                    FROM jsonb_array_elements(fes.equipment_selection::jsonb#>'{weapons,options}') opt
                    LEFT JOIN equipment e ON e.id::text = opt->>'id'
                )
            )
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
