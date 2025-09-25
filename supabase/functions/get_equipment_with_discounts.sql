DROP FUNCTION IF EXISTS get_equipment_with_discounts(uuid, text, uuid, boolean);
DROP FUNCTION IF EXISTS get_equipment_with_discounts(uuid, text, uuid, boolean, boolean);
DROP FUNCTION IF EXISTS get_equipment_with_discounts(uuid,text,uuid,boolean,boolean,uuid,uuid);
DROP FUNCTION IF EXISTS get_equipment_with_discounts(uuid,text,uuid,boolean,boolean,uuid,uuid,uuid);

-- Create the new function with all parameters including weapon profiles, fighter legacy support, and fighter effects
CREATE OR REPLACE FUNCTION get_equipment_with_discounts(
    gang_type_id uuid DEFAULT NULL,
    equipment_category text DEFAULT NULL,
    fighter_type_id uuid DEFAULT NULL,
    fighter_type_equipment boolean DEFAULT NULL,
    equipment_tradingpost boolean DEFAULT NULL,
    fighter_id uuid DEFAULT NULL,
    only_equipment_id uuid DEFAULT NULL,
    gang_id uuid DEFAULT NULL
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
    weapon_profiles jsonb,
    vehicle_upgrade_slot text,
    fighter_effects jsonb
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
        -- Check for gang origin-specific availability, then gang-specific, default to equipment table's availability
        COALESCE(ea_origin.availability, ea.availability, e.availability) as availability,
        e.cost::numeric as base_cost,
        -- Best discount among gang-level, fighter_type_id, or legacy fighter_type_id
        COALESCE(
          (
            SELECT GREATEST(0, MAX(ed2.discount::numeric))
            FROM equipment_discounts ed2
            WHERE ed2.equipment_id = e.id
              AND (
                -- Gang-level browsing: only gang-level discount rows
                ($3 IS NULL AND ed2.gang_type_id = $1 AND ed2.fighter_type_id IS NULL)
                OR
                -- Fighter-level browsing: consider gang-level + fighter's type + legacy type + gang origin
                ($3 IS NOT NULL AND (
                  (ed2.gang_type_id = $1 AND ed2.fighter_type_id IS NULL)
                  OR (ed2.fighter_type_id = $3)
                  OR (legacy.legacy_ft_id IS NOT NULL AND ed2.fighter_type_id = legacy.legacy_ft_id)
                  OR (legacy.affiliation_ft_id IS NOT NULL AND ed2.fighter_type_id = legacy.affiliation_ft_id)
                  OR (legacy.gang_origin_id IS NOT NULL AND ed2.gang_origin_id = legacy.gang_origin_id)
                ))
              )
          ),
          0
        ) as discounted_cost,
        -- Best effective adjusted price: prefer explicit adjusted_cost (min), else base - max(discount), else base
        COALESCE(
          (
            SELECT MIN(ed3.adjusted_cost::numeric)
            FROM equipment_discounts ed3
            WHERE ed3.equipment_id = e.id
              AND ed3.adjusted_cost IS NOT NULL
              AND (
                ($3 IS NULL AND ed3.gang_type_id = $1 AND ed3.fighter_type_id IS NULL)
                OR
                ($3 IS NOT NULL AND (
                  (ed3.gang_type_id = $1 AND ed3.fighter_type_id IS NULL)
                  OR (ed3.fighter_type_id = $3)
                  OR (legacy.legacy_ft_id IS NOT NULL AND ed3.fighter_type_id = legacy.legacy_ft_id)
                  OR (legacy.affiliation_ft_id IS NOT NULL AND ed3.fighter_type_id = legacy.affiliation_ft_id)
                  OR (legacy.gang_origin_id IS NOT NULL AND ed3.gang_origin_id = legacy.gang_origin_id)
                ))
              )
          ),
          e.cost::numeric - COALESCE((
            SELECT GREATEST(0, MAX(ed4.discount::numeric))
            FROM equipment_discounts ed4
            WHERE ed4.equipment_id = e.id
              AND ed4.discount IS NOT NULL
              AND (
                ($3 IS NULL AND ed4.gang_type_id = $1 AND ed4.fighter_type_id IS NULL)
                OR
                ($3 IS NOT NULL AND (
                  (ed4.gang_type_id = $1 AND ed4.fighter_type_id IS NULL)
                  OR (ed4.fighter_type_id = $3)
                  OR (legacy.legacy_ft_id IS NOT NULL AND ed4.fighter_type_id = legacy.legacy_ft_id)
                  OR (legacy.affiliation_ft_id IS NOT NULL AND ed4.fighter_type_id = legacy.affiliation_ft_id)
                  OR (legacy.gang_origin_id IS NOT NULL AND ed4.gang_origin_id = legacy.gang_origin_id)
                ))
              )
          ), 0),
          e.cost::numeric
        ) as adjusted_cost,
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
                    WHERE (fet.fighter_type_id = $3
                           OR (legacy.legacy_ft_id IS NOT NULL AND fet.fighter_type_id = legacy.legacy_ft_id)
                           OR (legacy.affiliation_ft_id IS NOT NULL AND fet.fighter_type_id = legacy.affiliation_ft_id))
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
        ) as weapon_profiles,
        -- Determine vehicle upgrade slot from effect modifiers
        CASE 
            WHEN e.equipment_type = 'vehicle_upgrade' THEN (
                SELECT 
                    CASE 
                        WHEN EXISTS (
                            SELECT 1 FROM fighter_effect_types fet
                            JOIN fighter_effect_type_modifiers fetm ON fet.id = fetm.fighter_effect_type_id
                            WHERE fet.type_specific_data->>'equipment_id' = e.id::text
                            AND fetm.stat_name = 'body_slots' 
                            AND fetm.default_numeric_value > 0
                        ) THEN 'Body'
                        WHEN EXISTS (
                            SELECT 1 FROM fighter_effect_types fet
                            JOIN fighter_effect_type_modifiers fetm ON fet.id = fetm.fighter_effect_type_id
                            WHERE fet.type_specific_data->>'equipment_id' = e.id::text
                            AND fetm.stat_name = 'drive_slots' 
                            AND fetm.default_numeric_value > 0
                        ) THEN 'Drive'
                        WHEN EXISTS (
                            SELECT 1 FROM fighter_effect_types fet
                            JOIN fighter_effect_type_modifiers fetm ON fet.id = fetm.fighter_effect_type_id
                            WHERE fet.type_specific_data->>'equipment_id' = e.id::text
                            AND fetm.stat_name = 'engine_slots' 
                            AND fetm.default_numeric_value > 0
                        ) THEN 'Engine'
                        ELSE NULL
                    END
            )
            ELSE NULL
        END as vehicle_upgrade_slot,
        -- Aggregate fighter effects into a JSON array
        COALESCE(
            (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'id', fet.id,
                        'effect_name', fet.effect_name,
                        'type_specific_data', fet.type_specific_data,
                        'category_name', fec.category_name,
                        'modifiers', COALESCE(
                            (
                                SELECT jsonb_agg(
                                    jsonb_build_object(
                                        'id', fetm.id,
                                        'stat_name', fetm.stat_name,
                                        'default_numeric_value', fetm.default_numeric_value
                                    )
                                )
                                FROM fighter_effect_type_modifiers fetm
                                WHERE fetm.fighter_effect_type_id = fet.id
                            ),
                            '[]'::jsonb
                        )
                    )
                    ORDER BY fet.effect_name
                )
                FROM fighter_effect_types fet
                LEFT JOIN fighter_effect_categories fec ON fet.fighter_effect_category_id = fec.id
                WHERE fet.type_specific_data->>'equipment_id' = e.id::text
            ),
            '[]'::jsonb
        ) as fighter_effects
    FROM equipment e
    -- Resolve legacy fighter type, gang affiliation fighter type, and gang origin
    LEFT JOIN LATERAL (
        SELECT
            CASE WHEN $6 IS NOT NULL THEN fgl.fighter_type_id ELSE NULL END AS legacy_ft_id,
            CASE WHEN $6 IS NOT NULL THEN ga.fighter_type_id ELSE NULL END AS affiliation_ft_id,
            COALESCE(
                CASE WHEN $6 IS NOT NULL THEN g_fighter.gang_origin_id ELSE NULL END,
                CASE WHEN $8 IS NOT NULL THEN g_direct.gang_origin_id ELSE NULL END
            ) AS gang_origin_id
        FROM fighters f
        LEFT JOIN fighter_gang_legacy fgl ON f.fighter_gang_legacy_id = fgl.id AND $6 IS NOT NULL
        LEFT JOIN gangs g_fighter ON f.gang_id = g_fighter.id AND $6 IS NOT NULL
        LEFT JOIN gang_affiliation ga ON g_fighter.gang_affiliation_id = ga.id AND $6 IS NOT NULL
        LEFT JOIN gangs g_direct ON g_direct.id = $8 AND $8 IS NOT NULL
        WHERE ($6 IS NULL OR f.id = $6)
        LIMIT 1
    ) legacy ON TRUE
    -- Join with equipment_availability to get gang-specific availability
    LEFT JOIN equipment_availability ea ON e.id = ea.equipment_id
        AND ea.gang_type_id = $1
    -- Join with equipment_availability to get gang origin-specific availability
    LEFT JOIN equipment_availability ea_origin ON e.id = ea_origin.equipment_id
        AND ea_origin.gang_origin_id = legacy.gang_origin_id
    LEFT JOIN fighter_type_equipment fte ON e.id = fte.equipment_id
        AND ($3 IS NULL 
             OR fte.fighter_type_id = $3
             OR fte.vehicle_type_id = $3
             OR (legacy.legacy_ft_id IS NOT NULL AND (fte.fighter_type_id = legacy.legacy_ft_id OR fte.vehicle_type_id = legacy.legacy_ft_id))
             OR (legacy.affiliation_ft_id IS NOT NULL AND (fte.fighter_type_id = legacy.affiliation_ft_id OR fte.vehicle_type_id = legacy.affiliation_ft_id)))
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
        AND (only_equipment_id IS NULL OR e.id = only_equipment_id)
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
                            WHERE (fet.fighter_type_id = $3
                                   OR (legacy.legacy_ft_id IS NOT NULL AND fet.fighter_type_id = legacy.legacy_ft_id)
                                   OR (legacy.affiliation_ft_id IS NOT NULL AND fet.fighter_type_id = legacy.affiliation_ft_id))
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
        ) as weapon_profiles,
        -- Custom equipment doesn't have vehicle upgrade slots
        NULL as vehicle_upgrade_slot,
        -- Custom equipment doesn't have fighter effects
        '[]'::jsonb as fighter_effects
    FROM custom_equipment ce
    WHERE 
        ce.user_id = auth.uid() -- Only show user's own custom equipment
        AND ($2 IS NULL 
         OR trim(both from ce.equipment_category) = trim(both from $2))
        AND (only_equipment_id IS NULL OR ce.id = only_equipment_id)
$$;