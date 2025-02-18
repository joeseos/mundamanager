-- Drop all versions of the function
DROP FUNCTION IF EXISTS get_fighter_types_with_cost(uuid);
DROP FUNCTION IF EXISTS get_fighter_types_with_cost(uuid, boolean);
DROP FUNCTION IF EXISTS get_fighter_types_with_cost();

-- Then create our new function with optional parameter and is_gang_addition column
CREATE OR REPLACE FUNCTION get_fighter_types_with_cost(p_gang_type_id uuid DEFAULT NULL)
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
    default_equipment jsonb,
    total_cost numeric,
    is_gang_addition boolean
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
        ft.cost AS total_cost,  -- Total cost is just the fighter's cost since default equipment is free
        ft.is_gang_addition
    FROM fighter_types ft
    JOIN fighter_classes fc ON fc.id = ft.fighter_class_id
    WHERE (p_gang_type_id IS NULL OR ft.gang_type_id = p_gang_type_id);
END;
$$;