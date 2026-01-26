DROP FUNCTION IF EXISTS get_equipment_detailed_data(uuid, text, uuid, boolean);
DROP FUNCTION IF EXISTS get_equipment_detailed_data(uuid, text, uuid, boolean, boolean);
DROP FUNCTION IF EXISTS get_equipment_detailed_data(uuid,text,uuid,boolean,boolean,uuid,uuid);
DROP FUNCTION IF EXISTS get_equipment_detailed_data(uuid,text,uuid,boolean,boolean,uuid,uuid,uuid);
DROP FUNCTION IF EXISTS get_equipment_detailed_data(uuid,text,uuid,boolean,boolean,uuid,uuid,uuid,boolean);
DROP FUNCTION IF EXISTS get_equipment_detailed_data(uuid,text,uuid,boolean,boolean,uuid,uuid,uuid,boolean,uuid[]);

-- Create the new function with simplified LATERAL join and gang_id parameter
CREATE OR REPLACE FUNCTION get_equipment_detailed_data(
    gang_type_id uuid DEFAULT NULL,
    equipment_category text DEFAULT NULL,
    fighter_type_id uuid DEFAULT NULL,
    fighter_type_equipment boolean DEFAULT NULL,
    equipment_tradingpost boolean DEFAULT NULL,
    fighter_id uuid DEFAULT NULL,
    only_equipment_id uuid DEFAULT NULL,
    gang_id uuid DEFAULT NULL,
    fighters_tradingpost_only boolean DEFAULT NULL,
    campaign_trading_post_type_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    equipment_name text,
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
    grants_equipment jsonb,
    is_editable boolean,
    trading_post_names text[]
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    -- Regular equipment
    SELECT DISTINCT
        e.id,
        e.equipment_name,
        -- Natural NULL handling for availability - gang origin takes precedence when available
        COALESCE(
            (SELECT availability FROM equipment_availability WHERE gang_origin_id = gang_data.gang_origin_id AND equipment_id = e.id LIMIT 1),
            ea_var.availability,
            ea.availability,
            e.availability
        ) as availability,
        e.cost::numeric as base_cost,
        -- Gang origin OVERRIDES gang type completely - but only for items with origin data
        CASE
            WHEN gang_data.gang_origin_id IS NOT NULL
                 AND EXISTS(SELECT 1 FROM equipment_discounts
                           WHERE equipment_id = e.id
                           AND gang_origin_id = gang_data.gang_origin_id) THEN
                -- Use ONLY origin + fighter/legacy discounts (no gang_type!)
                COALESCE((
                    SELECT GREATEST(0, MAX(ed2.discount::numeric))
                    FROM equipment_discounts ed2
                    WHERE ed2.equipment_id = e.id
                    AND (ed2.gang_origin_id = gang_data.gang_origin_id
                         OR ed2.fighter_type_id = $3
                         OR (gang_data.legacy_ft_id IS NOT NULL AND ed2.fighter_type_id = gang_data.legacy_ft_id AND $4 = true)
                         OR (gang_data.affiliation_ft_id IS NOT NULL AND ed2.fighter_type_id = gang_data.affiliation_ft_id))
                ), 0)
            ELSE
                -- Use gang_type + fighter/legacy discounts (no origin!)
                COALESCE((
                    SELECT GREATEST(0, MAX(ed2.discount::numeric))
                    FROM equipment_discounts ed2
                    WHERE ed2.equipment_id = e.id
                    AND ((ed2.gang_type_id = $1 AND ed2.fighter_type_id IS NULL)
                         OR ed2.fighter_type_id = $3
                         OR (gang_data.legacy_ft_id IS NOT NULL AND ed2.fighter_type_id = gang_data.legacy_ft_id AND $4 = true)
                         OR (gang_data.affiliation_ft_id IS NOT NULL AND ed2.fighter_type_id = gang_data.affiliation_ft_id))
                ), 0)
        END as discounted_cost,
        -- Gang origin OVERRIDES gang type completely for adjusted cost - but only for items with origin data
        CASE
            WHEN gang_data.gang_origin_id IS NOT NULL
                 AND EXISTS(SELECT 1 FROM equipment_discounts
                           WHERE equipment_id = e.id
                           AND gang_origin_id = gang_data.gang_origin_id) THEN
                -- Use ONLY origin + fighter/legacy adjusted costs (no gang_type!)
                COALESCE(
                    (SELECT MIN(ed3.adjusted_cost::numeric)
                     FROM equipment_discounts ed3
                     WHERE ed3.equipment_id = e.id
                     AND ed3.adjusted_cost IS NOT NULL
                     AND (ed3.gang_origin_id = gang_data.gang_origin_id
                          OR ed3.fighter_type_id = $3
                          OR (gang_data.legacy_ft_id IS NOT NULL AND ed3.fighter_type_id = gang_data.legacy_ft_id AND $4 = true)
                          OR (gang_data.affiliation_ft_id IS NOT NULL AND ed3.fighter_type_id = gang_data.affiliation_ft_id))),
                    e.cost::numeric - COALESCE((
                        SELECT GREATEST(0, MAX(ed4.discount::numeric))
                        FROM equipment_discounts ed4
                        WHERE ed4.equipment_id = e.id
                        AND ed4.discount IS NOT NULL
                        AND (ed4.gang_origin_id = gang_data.gang_origin_id
                             OR ed4.fighter_type_id = $3
                             OR (gang_data.legacy_ft_id IS NOT NULL AND ed4.fighter_type_id = gang_data.legacy_ft_id AND $4 = true)
                             OR (gang_data.affiliation_ft_id IS NOT NULL AND ed4.fighter_type_id = gang_data.affiliation_ft_id))
                    ), 0),
                    e.cost::numeric
                )
            ELSE
                -- Use gang_type + fighter/legacy adjusted costs (no origin!)
                COALESCE(
                    (SELECT MIN(ed3.adjusted_cost::numeric)
                     FROM equipment_discounts ed3
                     WHERE ed3.equipment_id = e.id
                     AND ed3.adjusted_cost IS NOT NULL
                     AND ((ed3.gang_type_id = $1 AND ed3.fighter_type_id IS NULL)
                          OR ed3.fighter_type_id = $3
                          OR (gang_data.legacy_ft_id IS NOT NULL AND ed3.fighter_type_id = gang_data.legacy_ft_id AND $4 = true)
                          OR (gang_data.affiliation_ft_id IS NOT NULL AND ed3.fighter_type_id = gang_data.affiliation_ft_id))),
                    e.cost::numeric - COALESCE((
                        SELECT GREATEST(0, MAX(ed4.discount::numeric))
                        FROM equipment_discounts ed4
                        WHERE ed4.equipment_id = e.id
                        AND ed4.discount IS NOT NULL
                        AND ((ed4.gang_type_id = $1 AND ed4.fighter_type_id IS NULL)
                             OR ed4.fighter_type_id = $3
                             OR (gang_data.legacy_ft_id IS NOT NULL AND ed4.fighter_type_id = gang_data.legacy_ft_id AND $4 = true)
                             OR (gang_data.affiliation_ft_id IS NOT NULL AND ed4.fighter_type_id = gang_data.affiliation_ft_id))
                    ), 0),
                    e.cost::numeric
                )
        END as adjusted_cost,
        e.equipment_category,
        e.equipment_type,
        e.created_at,
        CASE
            WHEN fte.fighter_type_id IS NOT NULL OR fte.vehicle_type_id IS NOT NULL OR ea_var.id IS NOT NULL THEN true
            ELSE false
        END as fighter_type_equipment,
        (
            -- Gang trading post access (always available)
            EXISTS (
                SELECT 1
                FROM gang_types gt, trading_post_equipment tpe
                WHERE gt.gang_type_id = $1
                AND tpe.trading_post_type_id = gt.trading_post_type_id
                AND tpe.equipment_id = e.id
            )
            OR
            -- Fighter trading post access (when fighter_type_id available)
            EXISTS (
                SELECT 1
                FROM fighter_equipment_tradingpost fet,
                     jsonb_array_elements_text(fet.equipment_tradingpost) as equip_id
                WHERE (fet.fighter_type_id = $3
                       OR (gang_data.affiliation_ft_id IS NOT NULL AND fet.fighter_type_id = gang_data.affiliation_ft_id))
                AND equip_id = e.id::text
            )
        ) as equipment_tradingpost,
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
        -- Enrich grants_equipment options with equipment names
        CASE
            WHEN e.grants_equipment IS NOT NULL AND e.grants_equipment->'options' IS NOT NULL THEN
                jsonb_set(
                    e.grants_equipment,
                    '{options}',
                    COALESCE(
                        (SELECT jsonb_agg(
                            opt || jsonb_build_object('equipment_name', COALESCE(eq.equipment_name, 'Unknown'))
                        )
                        FROM jsonb_array_elements(e.grants_equipment->'options') opt
                        LEFT JOIN equipment eq ON eq.id = (opt->>'equipment_id')::uuid),
                        '[]'::jsonb
                    )
                )
            ELSE e.grants_equipment
        END as grants_equipment,
        COALESCE(e.is_editable, false) as is_editable,
        -- Trading posts the gang has access to: (1) gang's TP via gang_types, or (2) campaign's authorised TPs when in a campaign
        (SELECT COALESCE(array_agg(DISTINCT tpt.trading_post_name), '{}'::text[])
         FROM trading_post_equipment tpe
         JOIN trading_post_types tpt ON tpt.id = tpe.trading_post_type_id
         WHERE tpe.equipment_id = e.id
           AND (
             EXISTS (SELECT 1 FROM gang_types gt WHERE gt.gang_type_id = $1 AND gt.trading_post_type_id = tpe.trading_post_type_id)
             OR ($10 IS NOT NULL AND array_length($10, 1) > 0 AND tpe.trading_post_type_id = ANY($10))
           )
        ) AS trading_post_names
    FROM equipment e
    -- Simplified LATERAL join - always executes, no conditionals
    LEFT JOIN LATERAL (
        SELECT
            g.gang_origin_id,
            g.gang_variants,
            fgl.fighter_type_id AS legacy_ft_id,
            ga.fighter_type_id AS affiliation_ft_id
        FROM gangs g
        LEFT JOIN fighters f ON (f.id = $6 AND f.gang_id = g.id)  -- Fighter must belong to this gang
        LEFT JOIN fighter_gang_legacy fgl ON f.fighter_gang_legacy_id = fgl.id
        LEFT JOIN gang_affiliation ga ON g.gang_affiliation_id = ga.id
        WHERE g.id = $8  -- Always try to join gang data
    ) gang_data ON TRUE
    -- Join with equipment_availability to get gang-specific availability
    LEFT JOIN equipment_availability ea ON e.id = ea.equipment_id
        AND ea.gang_type_id = $1
    LEFT JOIN equipment_availability ea_var ON e.id = ea_var.equipment_id
        AND ea_var.gang_variant_id IS NOT NULL
        AND gang_data.gang_variants ? ea_var.gang_variant_id::text
    LEFT JOIN fighter_type_equipment fte ON e.id = fte.equipment_id
        AND (fte.fighter_type_id = $3
             OR fte.vehicle_type_id = $3
             OR (gang_data.legacy_ft_id IS NOT NULL AND (fte.fighter_type_id = gang_data.legacy_ft_id OR fte.vehicle_type_id = gang_data.legacy_ft_id) AND $4 = true)
             OR (gang_data.affiliation_ft_id IS NOT NULL AND (fte.fighter_type_id = gang_data.affiliation_ft_id OR fte.vehicle_type_id = gang_data.affiliation_ft_id)))
        AND (
            -- If the row has gang_origin_id, it must match the gang's origin
            (fte.gang_origin_id IS NULL OR fte.gang_origin_id = gang_data.gang_origin_id)
            AND
            -- If the row has gang_type_id, it must match the gang's type
            (fte.gang_type_id IS NULL OR fte.gang_type_id = $1)
        )
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
            -- When both $4 and $5 are provided, use OR logic (items in EITHER fighter's list OR trading post)
            -- Include both fighter-specific and gang-level trading post items
            ($4 IS NULL AND $5 IS NULL)
            OR
            ($4 IS NOT NULL AND $5 IS NOT NULL AND (
                CASE
                    WHEN fte.fighter_type_id IS NOT NULL OR fte.vehicle_type_id IS NOT NULL OR ea_var.id IS NOT NULL THEN true
                    ELSE false
                END = $4
                OR
                -- When both filters provided, respect fighters_tradingpost_only flag
                -- If $10 (campaign_trading_post_type_ids) is set: restrict TP to equipment in tpe for those IDs; else use existing logic
                (
                    ( $10 IS NULL AND (
                        CASE
                            WHEN $9 = true THEN
                                EXISTS (
                                    SELECT 1
                                    FROM fighter_equipment_tradingpost fet,
                                         jsonb_array_elements_text(fet.equipment_tradingpost) as equip_id
                                    WHERE (fet.fighter_type_id = $3
                                           OR (gang_data.affiliation_ft_id IS NOT NULL AND fet.fighter_type_id = gang_data.affiliation_ft_id))
                                    AND equip_id = e.id::text
                                )
                            ELSE
                                (
                                    EXISTS (
                                        SELECT 1
                                        FROM gang_types gt, trading_post_equipment tpe
                                        WHERE gt.gang_type_id = $1
                                        AND tpe.trading_post_type_id = gt.trading_post_type_id
                                        AND tpe.equipment_id = e.id
                                    )
                                    OR
                                    EXISTS (
                                        SELECT 1
                                        FROM fighter_equipment_tradingpost fet,
                                             jsonb_array_elements_text(fet.equipment_tradingpost) as equip_id
                                        WHERE (fet.fighter_type_id = $3
                                               OR (gang_data.affiliation_ft_id IS NOT NULL AND fet.fighter_type_id = gang_data.affiliation_ft_id))
                                        AND equip_id = e.id::text
                                    )
                                )
                        END
                    ) )
                    OR
                    ( $10 IS NOT NULL AND array_length($10, 1) > 0 AND
                        -- Item must be in campaign's authorized trading posts
                        EXISTS (SELECT 1 FROM trading_post_equipment tpe
                                WHERE tpe.equipment_id = e.id AND tpe.trading_post_type_id = ANY($10))
                        AND
                        -- AND fighter must have access (via gang TP or fighter-specific TP)
                        (
                            EXISTS (
                                SELECT 1
                                FROM gang_types gt, trading_post_equipment tpe2
                                WHERE gt.gang_type_id = $1
                                AND tpe2.trading_post_type_id = gt.trading_post_type_id
                                AND tpe2.equipment_id = e.id
                            )
                            OR
                            EXISTS (
                                SELECT 1
                                FROM fighter_equipment_tradingpost fet,
                                     jsonb_array_elements_text(fet.equipment_tradingpost) as equip_id
                                WHERE (fet.fighter_type_id = $3
                                       OR (gang_data.affiliation_ft_id IS NOT NULL AND fet.fighter_type_id = gang_data.affiliation_ft_id))
                                AND equip_id = e.id::text
                            )
                        )
                    )
                ) = $5
            ))
            OR
            -- When only $4 is provided (fighter's list only)
            ($4 IS NOT NULL AND $5 IS NULL AND (
                CASE
                    WHEN fte.fighter_type_id IS NOT NULL OR fte.vehicle_type_id IS NOT NULL OR ea_var.id IS NOT NULL THEN true
                    ELSE false
                END
            ) = $4)
            OR
            -- When only $5 is provided (trading post only)
            -- If $10 (campaign_trading_post_type_ids) is set: restrict TP to equipment in tpe for those IDs; else use existing logic
            ($4 IS NULL AND $5 IS NOT NULL AND (
                ( $10 IS NULL AND (
                    CASE
                        WHEN $9 = true THEN
                            EXISTS (
                                SELECT 1
                                FROM fighter_equipment_tradingpost fet,
                                     jsonb_array_elements_text(fet.equipment_tradingpost) as equip_id
                                WHERE (fet.fighter_type_id = $3
                                       OR (gang_data.affiliation_ft_id IS NOT NULL AND fet.fighter_type_id = gang_data.affiliation_ft_id))
                                AND equip_id = e.id::text
                            )
                        ELSE
                            (
                                EXISTS (
                                    SELECT 1
                                    FROM gang_types gt, trading_post_equipment tpe
                                    WHERE gt.gang_type_id = $1
                                    AND tpe.trading_post_type_id = gt.trading_post_type_id
                                    AND tpe.equipment_id = e.id
                                )
                                OR
                                EXISTS (
                                    SELECT 1
                                    FROM fighter_equipment_tradingpost fet,
                                         jsonb_array_elements_text(fet.equipment_tradingpost) as equip_id
                                    WHERE (fet.fighter_type_id = $3
                                           OR (gang_data.affiliation_ft_id IS NOT NULL AND fet.fighter_type_id = gang_data.affiliation_ft_id))
                                    AND equip_id = e.id::text
                                )
                            )
                    END
                ) )
                OR
                ( $10 IS NOT NULL AND array_length($10, 1) > 0 AND
                    -- Item must be in campaign's authorized trading posts
                    EXISTS (SELECT 1 FROM trading_post_equipment tpe
                            WHERE tpe.equipment_id = e.id AND tpe.trading_post_type_id = ANY($10))
                    AND
                    -- AND fighter must have access (via gang TP or fighter-specific TP)
                    (
                        EXISTS (
                            SELECT 1
                            FROM gang_types gt, trading_post_equipment tpe2
                            WHERE gt.gang_type_id = $1
                            AND tpe2.trading_post_type_id = gt.trading_post_type_id
                            AND tpe2.equipment_id = e.id
                        )
                        OR
                        EXISTS (
                            SELECT 1
                            FROM fighter_equipment_tradingpost fet,
                                 jsonb_array_elements_text(fet.equipment_tradingpost) as equip_id
                            WHERE (fet.fighter_type_id = $3
                                   OR (gang_data.affiliation_ft_id IS NOT NULL AND fet.fighter_type_id = gang_data.affiliation_ft_id))
                            AND equip_id = e.id::text
                        )
                    )
                )
            ) = $5)
        )

    UNION ALL

    -- Custom equipment
    SELECT 
        ce.id,
        ce.equipment_name,
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
        NULL::jsonb as grants_equipment,
        COALESCE(ce.is_editable, false) as is_editable,
        '{}'::text[] AS trading_post_names
    FROM custom_equipment ce
    LEFT JOIN (
        SELECT cs.custom_equipment_id
        FROM custom_shared cs
        JOIN campaign_gangs cg ON cg.campaign_id = cs.campaign_id
        WHERE cg.gang_id = $8  -- gang_id parameter
    ) shared ON shared.custom_equipment_id = ce.id
    WHERE
        (ce.user_id = auth.uid() OR shared.custom_equipment_id IS NOT NULL) -- User's own or shared to gang's campaign
        AND ($2 IS NULL
         OR trim(both from ce.equipment_category) = trim(both from $2))
        AND (only_equipment_id IS NULL OR ce.id = only_equipment_id)
        -- Custom equipment is always available in fighter's list, trading post, and unrestricted mode
        -- Only exclude when ONLY trading post is requested with fighters_tradingpost_only (no fighter's list)
        -- Exclude when: $4 IS NULL (no fighter's list) AND $5 IS NOT NULL AND $5 = true (trading post) AND $9 IS NOT NULL AND $9 = true (fighters_tradingpost_only)
        -- Include in all other cases: unrestricted ($4 IS NULL AND $5 IS NULL), fighter's list ($4 = true), or both filters
        AND NOT ($4 IS NULL AND $5 IS NOT NULL AND $5 = true AND $9 IS NOT NULL AND $9 = true)
$$;