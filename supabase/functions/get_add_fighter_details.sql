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
    sub_type jsonb
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
        CASE 
            WHEN EXISTS (SELECT 1 FROM fighter_equipment_selections fes WHERE fes.fighter_type_id = ft.id) THEN
                (
                    SELECT
                        jsonb_build_object(
                            'weapons', jsonb_build_object(
                                'default', COALESCE(
                                    (
                                        SELECT jsonb_agg(
                                            jsonb_build_object(
                                                'id', def->>'id',
                                                'quantity', (def->>'quantity')::integer,
                                                'equipment_name', e.equipment_name,
                                                'equipment_category', e.equipment_category
                                            )
                                        )
                                        FROM jsonb_array_elements(fes.equipment_selection::jsonb#>'{weapons,default}') def
                                        LEFT JOIN equipment e ON e.id::text = def->>'id'
                                    ),
                                    '[]'::jsonb
                                ),
                                'options', COALESCE(
                                    (
                                        SELECT jsonb_agg(
                                            jsonb_build_object(
                                                'id', opt->>'id',
                                                'equipment_name', e.equipment_name,
                                                'equipment_category', e.equipment_category,
                                                'cost', (opt->>'cost')::numeric,
                                                'max_quantity', (opt->>'max_quantity')::integer
                                            )
                                        )
                                        FROM jsonb_array_elements(fes.equipment_selection::jsonb#>'{weapons,options}') opt
                                        LEFT JOIN equipment e ON e.id::text = opt->>'id'
                                    ),
                                    '[]'::jsonb
                                ),
                                'select_type', fes.equipment_selection::jsonb#>'{weapons,select_type}'
                            )
                        )
                    FROM fighter_equipment_selections fes
                    WHERE fes.fighter_type_id = ft.id
                    LIMIT 1
                )
            ELSE '{}'::jsonb
        END AS equipment_selection,
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
        ) AS sub_type
    FROM fighter_types ft
    JOIN fighter_classes fc ON fc.id = ft.fighter_class_id
    WHERE ft.gang_type_id = p_gang_type_id;
END;
$$;