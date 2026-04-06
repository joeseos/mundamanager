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
SET search_path = public
STABLE
AS $$
    WITH filtered_fet AS (
        SELECT fet.fighter_type_id, equip_id::uuid AS equipment_id
        FROM fighter_equipment_tradingpost fet,
             jsonb_array_elements_text(fet.equipment_tradingpost) AS equip_id
        WHERE (
            $10 IS NULL
            OR EXISTS (SELECT 1 FROM trading_post_equipment tpe
                       JOIN gang_types gt ON gt.trading_post_type_id = tpe.trading_post_type_id
                       WHERE tpe.equipment_id = equip_id::uuid AND gt.gang_type_id = $1)
            OR (array_length($10, 1) > 0 AND EXISTS (SELECT 1 FROM trading_post_equipment tpe
                       WHERE tpe.equipment_id = equip_id::uuid AND tpe.trading_post_type_id = ANY($10)))
            OR NOT EXISTS (SELECT 1 FROM trading_post_equipment tpe WHERE tpe.equipment_id = equip_id::uuid)
        )
    )
    -- Regular equipment
    SELECT DISTINCT
        e.id,
        e.equipment_name,
        -- When in trading post mode ($5 = true), return base availability
        -- When in fighter's list mode, return gang-specific overrides
        CASE
            WHEN $5 = true THEN e.availability
            ELSE COALESCE(
                (SELECT availability FROM equipment_availability WHERE gang_origin_id = gang_data.gang_origin_id AND equipment_id = e.id LIMIT 1),
                ea_var.availability,
                ea.availability,
                e.availability
            )
        END as availability,
        e.cost::numeric as base_cost,
        -- When in trading post mode ($5 = true), no fighter-type discounts apply
        CASE
            WHEN $5 = true THEN 0::numeric
            ELSE
                CASE
                    WHEN gang_data.gang_origin_id IS NOT NULL
                         AND EXISTS(SELECT 1 FROM equipment_discounts
                                   WHERE equipment_id = e.id
                                   AND gang_origin_id = gang_data.gang_origin_id) THEN
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
                        COALESCE((
                            SELECT GREATEST(0, MAX(ed2.discount::numeric))
                            FROM equipment_discounts ed2
                            WHERE ed2.equipment_id = e.id
                            AND ((ed2.gang_type_id = $1 AND ed2.fighter_type_id IS NULL)
                                 OR ed2.fighter_type_id = $3
                                 OR (gang_data.legacy_ft_id IS NOT NULL AND ed2.fighter_type_id = gang_data.legacy_ft_id AND $4 = true)
                                 OR (gang_data.affiliation_ft_id IS NOT NULL AND ed2.fighter_type_id = gang_data.affiliation_ft_id))
                        ), 0)
                END
        END as discounted_cost,
        -- When in trading post mode ($5 = true), return base cost (no fighter-type discounts)
        CASE
            WHEN $5 = true THEN e.cost::numeric
            ELSE
                CASE
                    WHEN gang_data.gang_origin_id IS NOT NULL
                         AND EXISTS(SELECT 1 FROM equipment_discounts
                                   WHERE equipment_id = e.id
                                   AND gang_origin_id = gang_data.gang_origin_id) THEN
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
                END
        END as adjusted_cost,
        e.equipment_category,
        e.equipment_type,
        e.created_at,
        CASE
            WHEN fte.fighter_type_id IS NOT NULL OR fte.vehicle_type_id IS NOT NULL OR ea_var.id IS NOT NULL OR ea_origin.id IS NOT NULL THEN true
            ELSE false
        END as fighter_type_equipment,
        (
            -- Gang trading post access
            EXISTS (
                SELECT 1
                FROM gang_types gt, trading_post_equipment tpe
                WHERE gt.gang_type_id = $1
                AND tpe.trading_post_type_id = gt.trading_post_type_id
                AND tpe.equipment_id = e.id
            )
            OR
            -- Fighter trading post access
            EXISTS (
                SELECT 1 FROM filtered_fet ff
                WHERE (ff.fighter_type_id = $3
                       OR (gang_data.affiliation_ft_id IS NOT NULL AND ff.fighter_type_id = gang_data.affiliation_ft_id))
                AND ff.equipment_id = e.id
            )
            OR
            -- Campaign authorized trading post access
            ($10 IS NOT NULL AND array_length($10, 1) > 0 AND EXISTS (
                SELECT 1
                FROM trading_post_equipment tpe
                WHERE tpe.equipment_id = e.id
                AND tpe.trading_post_type_id = ANY($10)
            ))
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
        -- Trading post sources: gang's TP, campaign's authorised TPs, fighter-specific TPs
        (SELECT COALESCE(array_agg(DISTINCT tpt.trading_post_name), '{}'::text[])
         FROM trading_post_equipment tpe
         JOIN trading_post_types tpt ON tpt.id = tpe.trading_post_type_id
         WHERE tpe.equipment_id = e.id
           AND (
             EXISTS (SELECT 1 FROM gang_types gt WHERE gt.gang_type_id = $1 AND gt.trading_post_type_id = tpe.trading_post_type_id)
             OR ($10 IS NOT NULL AND array_length($10, 1) > 0 AND tpe.trading_post_type_id = ANY($10))
             OR ($3 IS NOT NULL AND EXISTS (
               SELECT 1 FROM filtered_fet ff
               WHERE (ff.fighter_type_id = $3 OR (gang_data.affiliation_ft_id IS NOT NULL AND ff.fighter_type_id = gang_data.affiliation_ft_id))
                 AND ff.equipment_id = e.id
             ))
           )
           AND (
             $10 IS NULL
             OR tpe.trading_post_type_id = (SELECT gt2.trading_post_type_id FROM gang_types gt2 WHERE gt2.gang_type_id = $1)
             OR (array_length($10, 1) > 0 AND tpe.trading_post_type_id = ANY($10))
           )
        ) AS trading_post_names
    FROM equipment e
    LEFT JOIN LATERAL (
        SELECT
            g.gang_origin_id,
            g.gang_variants,
            fgl.fighter_type_id AS legacy_ft_id,
            ga.fighter_type_id AS affiliation_ft_id
        FROM gangs g
        LEFT JOIN fighters f ON (f.id = $6 AND f.gang_id = g.id)
        LEFT JOIN fighter_gang_legacy fgl ON f.fighter_gang_legacy_id = fgl.id
        LEFT JOIN gang_affiliation ga ON g.gang_affiliation_id = ga.id
        WHERE g.id = $8
    ) gang_data ON TRUE
    LEFT JOIN equipment_availability ea ON e.id = ea.equipment_id
        AND ea.gang_type_id = $1
    LEFT JOIN equipment_availability ea_var ON e.id = ea_var.equipment_id
        AND ea_var.gang_variant_id IS NOT NULL
        AND gang_data.gang_variants ? ea_var.gang_variant_id::text
    LEFT JOIN equipment_availability ea_origin ON e.id = ea_origin.equipment_id
        AND ea_origin.gang_origin_id IS NOT NULL
        AND ea_origin.gang_origin_id = gang_data.gang_origin_id
    LEFT JOIN fighter_type_equipment fte ON e.id = fte.equipment_id
        AND (fte.fighter_type_id = $3
             OR fte.vehicle_type_id = $3
             OR (gang_data.legacy_ft_id IS NOT NULL AND (fte.fighter_type_id = gang_data.legacy_ft_id OR fte.vehicle_type_id = gang_data.legacy_ft_id) AND $4 = true)
             OR (gang_data.affiliation_ft_id IS NOT NULL AND (fte.fighter_type_id = gang_data.affiliation_ft_id OR fte.vehicle_type_id = gang_data.affiliation_ft_id)))
        AND (
            (fte.gang_origin_id IS NULL OR fte.gang_origin_id = gang_data.gang_origin_id)
            AND
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
            -- Unrestricted: no filter on fighter's list or trading post
            ($4 IS NULL AND $5 IS NULL)
            OR
            -- Both filters: items in EITHER fighter's list OR trading post
            ($4 IS NOT NULL AND $5 IS NOT NULL AND (
                CASE
                    WHEN fte.fighter_type_id IS NOT NULL OR fte.vehicle_type_id IS NOT NULL OR ea_var.id IS NOT NULL OR ea_origin.id IS NOT NULL THEN true
                    ELSE false
                END = $4
                OR
                (
                    -- Standard trading post access (respects fighters_tradingpost_only flag)
                    CASE
                        WHEN $9 = true THEN
                            EXISTS (
                                SELECT 1 FROM filtered_fet ff
                                WHERE (ff.fighter_type_id = $3
                                       OR (gang_data.affiliation_ft_id IS NOT NULL AND ff.fighter_type_id = gang_data.affiliation_ft_id))
                                AND ff.equipment_id = e.id
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
                                    SELECT 1 FROM filtered_fet ff
                                    WHERE (ff.fighter_type_id = $3
                                           OR (gang_data.affiliation_ft_id IS NOT NULL AND ff.fighter_type_id = gang_data.affiliation_ft_id))
                                    AND ff.equipment_id = e.id
                                )
                            )
                    END
                    OR
                    -- Campaign authorized trading posts (additive)
                    ($10 IS NOT NULL AND array_length($10, 1) > 0 AND
                        EXISTS (SELECT 1 FROM trading_post_equipment tpe
                                WHERE tpe.equipment_id = e.id AND tpe.trading_post_type_id = ANY($10))
                    )
                ) = $5
            ))
            OR
            -- Fighter's list only
            ($4 IS NOT NULL AND $5 IS NULL AND (
                CASE
                    WHEN fte.fighter_type_id IS NOT NULL OR fte.vehicle_type_id IS NOT NULL OR ea_var.id IS NOT NULL OR ea_origin.id IS NOT NULL THEN true
                    ELSE false
                END
            ) = $4)
            OR
            -- Trading post only
            ($4 IS NULL AND $5 IS NOT NULL AND (
                -- Standard trading post access (respects fighters_tradingpost_only flag)
                CASE
                    WHEN $9 = true THEN
                        EXISTS (
                            SELECT 1 FROM filtered_fet ff
                            WHERE (ff.fighter_type_id = $3
                                   OR (gang_data.affiliation_ft_id IS NOT NULL AND ff.fighter_type_id = gang_data.affiliation_ft_id))
                            AND ff.equipment_id = e.id
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
                                SELECT 1 FROM filtered_fet ff
                                WHERE (ff.fighter_type_id = $3
                                       OR (gang_data.affiliation_ft_id IS NOT NULL AND ff.fighter_type_id = gang_data.affiliation_ft_id))
                                AND ff.equipment_id = e.id
                            )
                        )
                END
                OR
                -- Campaign authorized trading posts (additive)
                ($10 IS NOT NULL AND array_length($10, 1) > 0 AND
                    EXISTS (SELECT 1 FROM trading_post_equipment tpe
                            WHERE tpe.equipment_id = e.id AND tpe.trading_post_type_id = ANY($10))
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
        ce.cost::numeric as discounted_cost,
        ce.cost::numeric as adjusted_cost,
        ce.equipment_category,
        ce.equipment_type,
        ce.created_at,
        true as fighter_type_equipment,
        true as equipment_tradingpost,
        true as is_custom,
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
        NULL as vehicle_upgrade_slot,
        NULL::jsonb as grants_equipment,
        COALESCE(ce.is_editable, false) as is_editable,
        '{}'::text[] AS trading_post_names
    FROM custom_equipment ce
    LEFT JOIN (
        SELECT cs.custom_equipment_id
        FROM custom_shared cs
        JOIN campaign_gangs cg ON cg.campaign_id = cs.campaign_id
        WHERE cg.gang_id = $8
    ) shared ON shared.custom_equipment_id = ce.id
    WHERE
        (ce.user_id = auth.uid() OR shared.custom_equipment_id IS NOT NULL)
        AND ($2 IS NULL
         OR trim(both from ce.equipment_category) = trim(both from $2))
        AND (only_equipment_id IS NULL OR ce.id = only_equipment_id)
        AND NOT ($4 IS NULL AND $5 IS NOT NULL AND $5 = true AND $9 IS NOT NULL AND $9 = true)
$$;
