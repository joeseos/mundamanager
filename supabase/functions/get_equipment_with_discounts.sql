-- Drop all versions of the old function (with different parameter combinations)
DROP FUNCTION IF EXISTS get_equipment_with_discounts(uuid, text, uuid, boolean);
DROP FUNCTION IF EXISTS get_equipment_with_discounts(uuid, text, uuid, boolean, boolean);

-- Create the new function with all parameters including weapon profiles
CREATE OR REPLACE FUNCTION get_equipment_with_discounts(
    gang_type_id uuid DEFAULT NULL,
    equipment_category text DEFAULT NULL,
    fighter_type_id uuid DEFAULT NULL,
    fighter_type_equipment boolean DEFAULT NULL,
    equipment_tradingpost boolean DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    equipment_name text,
    trading_post_category text,
    availability text,
    base_cost numeric,
    discounted_cost numeric,
    adjusted_cost numeric,
    equipment_category text,
    equipment_type text,
    created_at timestamptz,
    fighter_type_equipment boolean,
    equipment_tradingpost boolean,
    is_custom boolean,
    weapon_profiles jsonb
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    -- Regular equipment
    SELECT DISTINCT
        e.id,
        e.equipment_name,
        e.trading_post_category,
        -- Check for gang-specific availability, default to equipment table's availability if none found
        COALESCE(ea.availability, e.availability) as availability,
        e.cost::numeric as base_cost,
        CASE
            WHEN ed.discount IS NOT NULL 
            THEN e.cost::numeric - ed.discount::numeric
            ELSE e.cost::numeric
        END as discounted_cost,
        CASE
            WHEN ed.adjusted_cost IS NOT NULL
            THEN ed.adjusted_cost::numeric
            ELSE e.cost::numeric
        END as adjusted_cost,
        e.equipment_category,
        e.equipment_type,
        e.created_at,
        CASE
            WHEN fte.fighter_type_id IS NOT NULL OR fte.vehicle_type_id IS NOT NULL THEN true
            ELSE false
        END as fighter_type_equipment,
        CASE
            -- Gang-level access: only check gang's trading post type
            WHEN $3 IS NULL THEN 
                EXISTS (
                    SELECT 1
                    FROM gang_types gt, trading_post_equipment tpe
                    WHERE gt.gang_type_id = $1
                    AND tpe.trading_post_type_id = gt.trading_post_type_id
                    AND tpe.equipment_id = e.id
                )
            -- Fighter-level access: check BOTH fighter's trading post AND gang's trading post
            ELSE (
                EXISTS (
                    SELECT 1
                    FROM fighter_equipment_tradingpost fet,
                         jsonb_array_elements_text(fet.equipment_tradingpost) as equip_id
                    WHERE fet.fighter_type_id = $3
                    AND equip_id = e.id::text
                ) OR EXISTS (
                    SELECT 1
                    FROM gang_types gt, trading_post_equipment tpe
                    WHERE gt.gang_type_id = $1
                    AND tpe.trading_post_type_id = gt.trading_post_type_id
                    AND tpe.equipment_id = e.id
                )
            )
        END as equipment_tradingpost,
        false as is_custom,
        -- Aggregate weapon profiles into a JSON array
        COALESCE(
            (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'id', wp.id,
                        'profile_name', wp.profile_name,
                        'range_short', wp.range_short,
                        'range_long', wp.range_long,
                        'acc_short', wp.acc_short,
                        'acc_long', wp.acc_long,
                        'strength', wp.strength,
                        'ap', wp.ap,
                        'damage', wp.damage,
                        'ammo', wp.ammo,
                        'traits', wp.traits,
                        'sort_order', wp.sort_order
                    )
                    ORDER BY COALESCE(wp.sort_order, 999), wp.profile_name
                )
                FROM weapon_profiles wp
                WHERE wp.weapon_id = e.id
            ),
            '[]'::jsonb
        ) as weapon_profiles
    FROM equipment e
    -- Join with equipment_availability to get gang-specific availability
    LEFT JOIN equipment_availability ea ON e.id = ea.equipment_id 
        AND ea.gang_type_id = $1
    LEFT JOIN equipment_discounts ed ON e.id = ed.equipment_id 
        AND (
            -- Gang-level access: only gang-level discounts
            ($3 IS NULL 
             AND ed.gang_type_id = $1 
             AND ed.fighter_type_id IS NULL)
            OR 
            -- Fighter-level access: both gang-level and fighter-specific discounts
            ($3 IS NOT NULL 
             AND (
                 (ed.gang_type_id = $1 AND ed.fighter_type_id IS NULL)
                 OR 
                 (ed.fighter_type_id = $3)
             ))
        )
    LEFT JOIN fighter_type_equipment fte ON e.id = fte.equipment_id
        AND ($3 IS NULL 
             OR fte.fighter_type_id = $3
             OR fte.vehicle_type_id = $3)
    WHERE 
        (
            COALESCE(e.core_equipment, false) = false
            OR 
            (
                e.core_equipment = true 
                AND (fte.fighter_type_id IS NOT NULL OR $3 IS NULL)
            )
        )
        AND
        ($2 IS NULL 
         OR trim(both from e.equipment_category) = trim(both from $2))
        AND
        (
            $1 IS NULL
            OR ed.gang_type_id = $1
            OR ed.gang_type_id IS NULL
        )
        AND
        (
            $3 IS NULL
            OR ed.fighter_type_id = $3
            OR ed.fighter_type_id IS NULL
        )
        AND
        (
            $4 IS NULL
            OR (
                CASE
                    WHEN fte.fighter_type_id IS NOT NULL OR fte.vehicle_type_id IS NOT NULL THEN true
                    ELSE false
                END
            ) = $4
        )
        AND
        (
            $5 IS NULL
            OR (
                CASE
                    -- Gang-level access: only check gang's trading post type
                    WHEN $3 IS NULL THEN 
                        EXISTS (
                            SELECT 1
                            FROM gang_types gt, trading_post_equipment tpe
                            WHERE gt.gang_type_id = $1
                            AND tpe.trading_post_type_id = gt.trading_post_type_id
                            AND tpe.equipment_id = e.id
                        )
                    -- Fighter-level access: check BOTH fighter's trading post AND gang's trading post
                    ELSE (
                        EXISTS (
                            SELECT 1
                            FROM fighter_equipment_tradingpost fet,
                                 jsonb_array_elements_text(fet.equipment_tradingpost) as equip_id
                            WHERE fet.fighter_type_id = $3
                            AND equip_id = e.id::text
                        ) OR EXISTS (
                            SELECT 1
                            FROM gang_types gt, trading_post_equipment tpe
                            WHERE gt.gang_type_id = $1
                            AND tpe.trading_post_type_id = gt.trading_post_type_id
                            AND tpe.equipment_id = e.id
                        )
                    )
                END
            ) = $5
        )

    UNION ALL

    -- Custom equipment
    SELECT 
        ce.id,
        ce.equipment_name,
        'Custom' as trading_post_category,
        ce.availability as availability,
        ce.cost::numeric as base_cost,
        ce.cost::numeric as discounted_cost, -- No discounts for custom equipment
        ce.cost::numeric as adjusted_cost,   -- No adjustments for custom equipment
        ce.equipment_category,
        ce.equipment_type,
        ce.created_at,
        true as fighter_type_equipment,      -- Custom equipment is available for fighters
        true as equipment_tradingpost,       -- Custom equipment is available in trading post
        true as is_custom,
        -- Custom equipment weapon profiles (if any)
        COALESCE(
            (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'id', cwp.id,
                        'profile_name', cwp.profile_name,
                        'range_short', cwp.range_short,
                        'range_long', cwp.range_long,
                        'acc_short', cwp.acc_short,
                        'acc_long', cwp.acc_long,
                        'strength', cwp.strength,
                        'ap', cwp.ap,
                        'damage', cwp.damage,
                        'ammo', cwp.ammo,
                        'traits', cwp.traits,
                        'sort_order', cwp.sort_order
                    )
                    ORDER BY COALESCE(cwp.sort_order, 999), cwp.profile_name
                )
                FROM custom_weapon_profiles cwp
                WHERE cwp.custom_equipment_id = ce.id
            ),
            '[]'::jsonb
        ) as weapon_profiles
    FROM custom_equipment ce
    WHERE 
        ce.user_id = auth.uid() -- Only show user's own custom equipment
        AND ($2 IS NULL 
         OR trim(both from ce.equipment_category) = trim(both from $2))
$$;