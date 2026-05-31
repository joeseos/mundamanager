DROP FUNCTION IF EXISTS get_equipment_detailed_data(uuid, text, uuid, boolean);
DROP FUNCTION IF EXISTS get_equipment_detailed_data(uuid, text, uuid, boolean, boolean);
DROP FUNCTION IF EXISTS get_equipment_detailed_data(uuid,text,uuid,boolean,boolean,uuid,uuid);
DROP FUNCTION IF EXISTS get_equipment_detailed_data(uuid,text,uuid,boolean,boolean,uuid,uuid,uuid);
DROP FUNCTION IF EXISTS get_equipment_detailed_data(uuid,text,uuid,boolean,boolean,uuid,uuid,uuid,boolean);
DROP FUNCTION IF EXISTS get_equipment_detailed_data(uuid,text,uuid,boolean,boolean,uuid,uuid,uuid,boolean,uuid[]);
DROP FUNCTION IF EXISTS get_equipment_detailed_data(uuid,text,uuid,boolean,boolean,uuid,uuid,uuid,boolean,uuid[],uuid[]);

CREATE OR REPLACE FUNCTION get_equipment_detailed_data(
    gang_type_id uuid DEFAULT NULL,          -- $1
    equipment_category text DEFAULT NULL,     -- $2
    fighter_type_id uuid DEFAULT NULL,        -- $3
    fighter_type_equipment boolean DEFAULT NULL, -- $4
    equipment_tradingpost boolean DEFAULT NULL,  -- $5
    fighter_id uuid DEFAULT NULL,             -- $6
    only_equipment_id uuid DEFAULT NULL,      -- $7
    gang_id uuid DEFAULT NULL,               -- $8
    fighters_tradingpost_only boolean DEFAULT NULL, -- $9
    campaign_trading_post_type_ids uuid[] DEFAULT NULL, -- $10
    campaign_custom_trading_post_ids uuid[] DEFAULT NULL -- $11
)
RETURNS TABLE (
    id uuid,
    equipment_name text,
    availability text,
    base_cost numeric,
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
    trading_post_names text[],
    cost_resource_name text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$

    -- =======================================================================
    -- 1. GANG CONTEXT (always exactly 1 row)
    -- =======================================================================
    WITH gang_data AS (
        SELECT
            g.gang_origin_id,
            g.gang_variants,
            g.alignment,
            g.custom_gang_type_id,
            cg.campaign_type_allegiance_id,
            fgl.fighter_type_id AS legacy_ft_id,
            ga.fighter_type_id  AS affiliation_ft_id
        FROM (SELECT 1) AS _dummy
        LEFT JOIN gangs g ON g.id = $8
        LEFT JOIN campaign_gangs cg ON cg.gang_id = $8
        LEFT JOIN fighters f ON f.id = $6 AND f.gang_id = g.id
        LEFT JOIN fighter_gang_legacy fgl ON f.fighter_gang_legacy_id = fgl.id
        LEFT JOIN gang_affiliation ga ON g.gang_affiliation_id = ga.id
    ),

    -- =======================================================================
    -- 2. GANG'S OWN TRADING POST TYPE (cached once)
    -- =======================================================================
    gang_tp AS (
        SELECT gt.trading_post_type_id
        FROM gang_types gt
        WHERE gt.gang_type_id = $1
    ),

    -- =======================================================================
    -- 3. FIGHTER TRADING POST EQUIPMENT
    --    KEY OPTIMISATION: filter to only the relevant fighter_type_ids
    --    BEFORE unpacking the JSONB array. Previously scanned ALL rows.
    -- =======================================================================
    filtered_fet AS (
        SELECT fet.fighter_type_id, equip_id::uuid AS equipment_id
        FROM fighter_equipment_tradingpost fet
        CROSS JOIN gang_data gd
        CROSS JOIN jsonb_array_elements_text(fet.equipment_tradingpost) AS equip_id
        WHERE fet.fighter_type_id IN ($3, gd.affiliation_ft_id)
          AND (
            $10 IS NULL
            OR EXISTS (
                SELECT 1 FROM trading_post_equipment tpe
                WHERE tpe.equipment_id = equip_id::uuid
                  AND tpe.trading_post_type_id = (SELECT trading_post_type_id FROM gang_tp)
            )
            OR (array_length($10, 1) > 0 AND EXISTS (
                SELECT 1 FROM trading_post_equipment tpe
                WHERE tpe.equipment_id = equip_id::uuid
                  AND tpe.trading_post_type_id = ANY($10)
            ))
            OR NOT EXISTS (
                SELECT 1 FROM trading_post_equipment tpe
                WHERE tpe.equipment_id = equip_id::uuid
            )
          )
    ),

    -- =======================================================================
    -- 4. TRADING POST ACCESS — computed once per equipment_id
    --    Replaces 4-5 repeated EXISTS subqueries in the original.
    -- =======================================================================
    tp_access AS (
        -- Gang's own trading post
        SELECT tpe.equipment_id, tpt.trading_post_name
        FROM trading_post_equipment tpe
        JOIN gang_tp ON tpe.trading_post_type_id = gang_tp.trading_post_type_id
        JOIN trading_post_types tpt ON tpt.id = tpe.trading_post_type_id

        UNION

        -- Campaign authorised trading posts
        SELECT tpe.equipment_id, tpt.trading_post_name
        FROM trading_post_equipment tpe
        JOIN trading_post_types tpt ON tpt.id = tpe.trading_post_type_id
        WHERE $10 IS NOT NULL
          AND array_length($10, 1) > 0
          AND tpe.trading_post_type_id = ANY($10)

        UNION

        -- Fighter-specific trading post access (no TP name — these aren't real TPs)
        SELECT ff.equipment_id, NULL::text
        FROM filtered_fet ff
        CROSS JOIN gang_data gd
        WHERE ff.fighter_type_id = $3
           OR (gd.affiliation_ft_id IS NOT NULL AND ff.fighter_type_id = gd.affiliation_ft_id)

        UNION

        -- Custom trading post equipment (official equipment only)
        SELECT ctpe.equipment_id, ctp.custom_trading_post_name
        FROM custom_trading_post_equipment ctpe
        JOIN custom_trading_posts ctp ON ctp.id = ctpe.custom_trading_post_id
        CROSS JOIN gang_data gd
        WHERE ctpe.equipment_id IS NOT NULL
          AND $11 IS NOT NULL AND array_length($11, 1) > 0
          AND ctpe.custom_trading_post_id = ANY($11)
          AND (
            NOT EXISTS (SELECT 1 FROM custom_trading_post_availability a
                        WHERE a.custom_trading_post_equipment_id = ctpe.id)
            OR EXISTS (SELECT 1 FROM custom_trading_post_availability a
                       WHERE a.custom_trading_post_equipment_id = ctpe.id
                         AND (a.gang_type_id IS NULL OR a.gang_type_id = $1)
                         AND (a.custom_gang_type_id IS NULL OR a.custom_gang_type_id = gd.custom_gang_type_id)
                         AND (a.gang_origin_id IS NULL OR a.gang_origin_id = gd.gang_origin_id)
                         AND (a.gang_variant_id IS NULL OR gd.gang_variants ? a.gang_variant_id::text)
                         AND (a.campaign_type_allegiance_id IS NULL OR a.campaign_type_allegiance_id = gd.campaign_type_allegiance_id)
                         AND (a.alignment IS NULL OR a.alignment = gd.alignment))
          )
    ),

    tp_summary AS (
        SELECT
            ta.equipment_id,
            true AS has_access,
            COALESCE(
                array_agg(DISTINCT ta.trading_post_name)
                    FILTER (WHERE ta.trading_post_name IS NOT NULL),
                '{}'::text[]
            ) AS tp_names
        FROM tp_access ta
        GROUP BY ta.equipment_id
    ),

    -- Helper: does this equipment have fighter-specific TP access?
    fighter_tp_set AS (
        SELECT DISTINCT equipment_id
        FROM filtered_fet ff
        CROSS JOIN gang_data gd
        WHERE ff.fighter_type_id = $3
           OR (gd.affiliation_ft_id IS NOT NULL AND ff.fighter_type_id = gd.affiliation_ft_id)
    ),

    -- =======================================================================
    -- 5. EQUIPMENT IDS WITH ORIGIN-SPECIFIC DISCOUNTS (for branching logic)
    -- =======================================================================
    origin_discount_equip AS (
        SELECT DISTINCT ed.equipment_id
        FROM equipment_discounts ed
        CROSS JOIN gang_data gd
        WHERE gd.gang_origin_id IS NOT NULL
          AND ed.gang_origin_id = gd.gang_origin_id
    ),

    -- =======================================================================
    -- 6. BEST ADJUSTED COST — computed once per equipment_id
    --    Replaces 2 correlated subqueries for adjusted_cost.
    -- =======================================================================
    best_adjusted_cost AS (
        SELECT
            ed.equipment_id,
            MIN(ed.adjusted_cost::numeric)
                FILTER (WHERE ed.adjusted_cost IS NOT NULL) AS best_adjusted_cost
        FROM equipment_discounts ed
        CROSS JOIN gang_data gd
        WHERE
            (
                -- Origin-based path: equipment has origin-specific discounts
                ed.equipment_id IN (SELECT equipment_id FROM origin_discount_equip)
                AND (
                    ed.gang_origin_id = gd.gang_origin_id
                    OR ed.fighter_type_id = $3
                    OR (gd.legacy_ft_id IS NOT NULL AND ed.fighter_type_id = gd.legacy_ft_id AND $4 = true)
                    OR (gd.affiliation_ft_id IS NOT NULL AND ed.fighter_type_id = gd.affiliation_ft_id)
                )
            )
            OR
            (
                -- Gang-type-based path: no origin-specific discounts
                ed.equipment_id NOT IN (SELECT equipment_id FROM origin_discount_equip)
                AND (
                    (ed.gang_type_id = $1 AND ed.fighter_type_id IS NULL)
                    OR ed.fighter_type_id = $3
                    OR (gd.legacy_ft_id IS NOT NULL AND ed.fighter_type_id = gd.legacy_ft_id AND $4 = true)
                    OR (gd.affiliation_ft_id IS NOT NULL AND ed.fighter_type_id = gd.affiliation_ft_id)
                )
            )
        GROUP BY ed.equipment_id
    ),

    -- =======================================================================
    -- 7. CUSTOM TP OVERRIDES — per official equipment_id
    --    Resolves cost/availability overrides and adjusted cost from active
    --    custom TPs. Custom TP values take precedence over official values.
    --    Tiebreak: lowest sort_order, then earliest created_at.
    -- =======================================================================
    custom_tp_override AS (
        SELECT
            ctpe.equipment_id,
            (array_agg(ctpe.cost_override ORDER BY COALESCE(ctpe.sort_order, 999), ctpe.created_at) FILTER (WHERE ctpe.cost_override IS NOT NULL))[1] AS cost_override,
            (array_agg(ctpe.cost_resource_name ORDER BY COALESCE(ctpe.sort_order, 999), ctpe.created_at) FILTER (WHERE ctpe.cost_resource_name IS NOT NULL))[1] AS cost_resource_name,
            (array_agg(ctpe.availability_override ORDER BY COALESCE(ctpe.sort_order, 999), ctpe.created_at) FILTER (WHERE ctpe.availability_override IS NOT NULL))[1] AS availability_override,
            MIN(p.adjusted_cost) FILTER (WHERE p.adjusted_cost IS NOT NULL) AS adjusted_cost
        FROM custom_trading_post_equipment ctpe
        CROSS JOIN gang_data gd
        LEFT JOIN custom_trading_post_pricing p
            ON p.custom_trading_post_equipment_id = ctpe.id
            AND (p.gang_type_id IS NULL OR p.gang_type_id = $1)
            AND (p.custom_gang_type_id IS NULL OR p.custom_gang_type_id = gd.custom_gang_type_id)
            AND (p.gang_origin_id IS NULL OR p.gang_origin_id = gd.gang_origin_id)
            AND (p.fighter_type_id IS NULL)
        WHERE ctpe.equipment_id IS NOT NULL
          AND $11 IS NOT NULL AND array_length($11, 1) > 0
          AND ctpe.custom_trading_post_id = ANY($11)
          AND (
            NOT EXISTS (SELECT 1 FROM custom_trading_post_availability a
                        WHERE a.custom_trading_post_equipment_id = ctpe.id)
            OR EXISTS (SELECT 1 FROM custom_trading_post_availability a
                       WHERE a.custom_trading_post_equipment_id = ctpe.id
                         AND (a.gang_type_id IS NULL OR a.gang_type_id = $1)
                         AND (a.custom_gang_type_id IS NULL OR a.custom_gang_type_id = gd.custom_gang_type_id)
                         AND (a.gang_origin_id IS NULL OR a.gang_origin_id = gd.gang_origin_id)
                         AND (a.gang_variant_id IS NULL OR gd.gang_variants ? a.gang_variant_id::text)
                         AND (a.campaign_type_allegiance_id IS NULL OR a.campaign_type_allegiance_id = gd.campaign_type_allegiance_id)
                         AND (a.alignment IS NULL OR a.alignment = gd.alignment))
          )
        GROUP BY ctpe.equipment_id
    )

    -- =======================================================================
    -- MAIN QUERY — regular equipment
    -- =======================================================================
    SELECT DISTINCT
        e.id,
        e.equipment_name,
        -- Availability: trading post mode uses base, fighter list uses overrides
        CASE
            WHEN $5 = true THEN COALESCE(cto.availability_override, e.availability)
            ELSE COALESCE(
                cto.availability_override,
                (SELECT availability FROM equipment_availability
                 WHERE gang_origin_id = gd.gang_origin_id AND equipment_id = e.id LIMIT 1),
                ea_var.availability,
                ea.availability,
                e.availability
            )
        END AS availability,

        COALESCE(cto.cost_override, e.cost::numeric) AS base_cost,

        -- Adjusted cost: custom TP override wins, then official discounts, then base
        CASE
            WHEN cto.adjusted_cost IS NOT NULL THEN cto.adjusted_cost
            WHEN cto.cost_override IS NOT NULL THEN cto.cost_override
            WHEN $5 = true THEN e.cost::numeric
            ELSE COALESCE(bac.best_adjusted_cost, e.cost::numeric)
        END AS adjusted_cost,

        e.equipment_category,
        e.equipment_type,
        e.created_at,

        -- Is in fighter's equipment list?
        CASE
            WHEN fte.fighter_type_id IS NOT NULL
                 OR fte.vehicle_type_id IS NOT NULL
                 OR ea_var.id IS NOT NULL
                 OR ea_origin.id IS NOT NULL THEN true
            ELSE false
        END AS fighter_type_equipment,

        -- Has trading post access?
        COALESCE(tp.has_access, false) AS equipment_tradingpost,

        false AS is_custom,

        -- Weapon profiles
        COALESCE(
            (SELECT jsonb_agg(
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
                ) ORDER BY COALESCE(wp.sort_order, 999), wp.profile_name
            ) FROM weapon_profiles wp WHERE wp.weapon_id = e.id),
            '[]'::jsonb
        ) AS weapon_profiles,

        -- Vehicle upgrade slot
        CASE
            WHEN e.equipment_type = 'vehicle_upgrade' THEN (
                SELECT CASE
                    WHEN EXISTS (
                        SELECT 1 FROM fighter_effect_types fet2
                        JOIN fighter_effect_type_modifiers fetm ON fet2.id = fetm.fighter_effect_type_id
                        WHERE fet2.type_specific_data->>'equipment_id' = e.id::text
                          AND fetm.stat_name = 'body_slots' AND fetm.default_numeric_value > 0
                    ) THEN 'Body'
                    WHEN EXISTS (
                        SELECT 1 FROM fighter_effect_types fet2
                        JOIN fighter_effect_type_modifiers fetm ON fet2.id = fetm.fighter_effect_type_id
                        WHERE fet2.type_specific_data->>'equipment_id' = e.id::text
                          AND fetm.stat_name = 'drive_slots' AND fetm.default_numeric_value > 0
                    ) THEN 'Drive'
                    WHEN EXISTS (
                        SELECT 1 FROM fighter_effect_types fet2
                        JOIN fighter_effect_type_modifiers fetm ON fet2.id = fetm.fighter_effect_type_id
                        WHERE fet2.type_specific_data->>'equipment_id' = e.id::text
                          AND fetm.stat_name = 'engine_slots' AND fetm.default_numeric_value > 0
                    ) THEN 'Engine'
                    ELSE NULL
                END
            )
            ELSE NULL
        END AS vehicle_upgrade_slot,

        -- Grants equipment
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
        END AS grants_equipment,

        COALESCE(e.is_editable, false) AS is_editable,

        -- Trading post names (already aggregated in tp_summary)
        COALESCE(tp.tp_names, '{}'::text[]) AS trading_post_names,

        cto.cost_resource_name

    FROM equipment e
    CROSS JOIN gang_data gd

    -- Equipment availability joins (unchanged)
    LEFT JOIN equipment_availability ea
        ON e.id = ea.equipment_id AND ea.gang_type_id = $1
    LEFT JOIN equipment_availability ea_var
        ON e.id = ea_var.equipment_id
        AND ea_var.gang_variant_id IS NOT NULL
        AND gd.gang_variants ? ea_var.gang_variant_id::text
    LEFT JOIN equipment_availability ea_origin
        ON e.id = ea_origin.equipment_id
        AND ea_origin.gang_origin_id IS NOT NULL
        AND ea_origin.gang_origin_id = gd.gang_origin_id

    -- Fighter type equipment (unchanged)
    LEFT JOIN fighter_type_equipment fte
        ON e.id = fte.equipment_id
        AND (fte.fighter_type_id = $3
             OR fte.vehicle_type_id = $3
             OR (gd.legacy_ft_id IS NOT NULL
                 AND (fte.fighter_type_id = gd.legacy_ft_id OR fte.vehicle_type_id = gd.legacy_ft_id)
                 AND $4 = true)
             OR (gd.affiliation_ft_id IS NOT NULL
                 AND (fte.fighter_type_id = gd.affiliation_ft_id OR fte.vehicle_type_id = gd.affiliation_ft_id)))
        AND (fte.gang_origin_id IS NULL OR fte.gang_origin_id = gd.gang_origin_id)
        AND (fte.gang_type_id IS NULL OR fte.gang_type_id = $1)

    -- Pre-computed CTEs via simple LEFT JOINs
    LEFT JOIN best_adjusted_cost bac ON bac.equipment_id = e.id
    LEFT JOIN tp_summary tp ON tp.equipment_id = e.id
    LEFT JOIN custom_tp_override cto ON cto.equipment_id = e.id

    WHERE
        -- Early filters (equipment category + specific ID)
        ($2 IS NULL OR trim(both from e.equipment_category) = trim(both from $2))
        AND ($7 IS NULL OR e.id = $7)
        -- Core equipment gating
        AND (
            COALESCE(e.core_equipment, false) = false
            OR (e.core_equipment = true AND (fte.fighter_type_id IS NOT NULL OR $3 IS NULL))
        )
        -- Fighter list / trading post filter logic
        AND (
            -- No filter
            ($4 IS NULL AND $5 IS NULL)
            OR
            -- Both filters: items in EITHER fighter's list OR trading post
            ($4 IS NOT NULL AND $5 IS NOT NULL AND (
                (CASE
                    WHEN fte.fighter_type_id IS NOT NULL OR fte.vehicle_type_id IS NOT NULL
                         OR ea_var.id IS NOT NULL OR ea_origin.id IS NOT NULL THEN true
                    ELSE false
                END) = $4
                OR
                (
                    CASE
                        WHEN $9 = true THEN EXISTS (SELECT 1 FROM fighter_tp_set fts WHERE fts.equipment_id = e.id)
                        ELSE COALESCE(tp.has_access, false)
                    END
                ) = $5
            ))
            OR
            -- Fighter's list only
            ($4 IS NOT NULL AND $5 IS NULL AND (
                CASE
                    WHEN fte.fighter_type_id IS NOT NULL OR fte.vehicle_type_id IS NOT NULL
                         OR ea_var.id IS NOT NULL OR ea_origin.id IS NOT NULL THEN true
                    ELSE false
                END
            ) = $4)
            OR
            -- Trading post only
            ($4 IS NULL AND $5 IS NOT NULL AND (
                CASE
                    WHEN $9 = true THEN EXISTS (SELECT 1 FROM fighter_tp_set fts WHERE fts.equipment_id = e.id)
                    ELSE COALESCE(tp.has_access, false)
                END
            ) = $5)
        )

    UNION ALL

    -- =======================================================================
    -- CUSTOM EQUIPMENT
    -- =======================================================================
    SELECT
        ce.id,
        ce.equipment_name,
        COALESCE(custom_tp.availability_override, ce.availability) AS availability,
        COALESCE(custom_tp.cost_override, ce.cost::numeric) AS base_cost,
        COALESCE(custom_tp.adjusted_cost, custom_tp.cost_override, ce.cost::numeric) AS adjusted_cost,
        ce.equipment_category,
        ce.equipment_type,
        ce.created_at,
        true AS fighter_type_equipment,
        true AS equipment_tradingpost,
        true AS is_custom,
        COALESCE(
            (SELECT jsonb_agg(
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
                ) ORDER BY COALESCE(cwp.sort_order, 999), cwp.profile_name
            ) FROM custom_weapon_profiles cwp WHERE cwp.custom_equipment_id = ce.id),
            '[]'::jsonb
        ) AS weapon_profiles,
        NULL AS vehicle_upgrade_slot,
        NULL::jsonb AS grants_equipment,
        COALESCE(ce.is_editable, false) AS is_editable,
        COALESCE(custom_tp.tp_names, '{}'::text[]) AS trading_post_names,
        custom_tp.cost_resource_name
    FROM custom_equipment ce
    LEFT JOIN (
        SELECT cs.custom_equipment_id
        FROM custom_shared cs
        JOIN campaign_gangs cg ON cg.campaign_id = cs.campaign_id
        WHERE cg.gang_id = $8
    ) shared ON shared.custom_equipment_id = ce.id
    LEFT JOIN (
        SELECT
            ctpe.custom_equipment_id,
            (array_agg(ctpe.cost_override ORDER BY COALESCE(ctpe.sort_order, 999), ctpe.created_at) FILTER (WHERE ctpe.cost_override IS NOT NULL))[1] AS cost_override,
            (array_agg(ctpe.cost_resource_name ORDER BY COALESCE(ctpe.sort_order, 999), ctpe.created_at) FILTER (WHERE ctpe.cost_resource_name IS NOT NULL))[1] AS cost_resource_name,
            (array_agg(ctpe.availability_override ORDER BY COALESCE(ctpe.sort_order, 999), ctpe.created_at) FILTER (WHERE ctpe.availability_override IS NOT NULL))[1] AS availability_override,
            MIN(p.adjusted_cost) FILTER (WHERE p.adjusted_cost IS NOT NULL) AS adjusted_cost,
            COALESCE(
                array_agg(DISTINCT ctp.custom_trading_post_name) FILTER (WHERE ctp.custom_trading_post_name IS NOT NULL),
                '{}'::text[]
            ) AS tp_names
        FROM custom_trading_post_equipment ctpe
        JOIN custom_trading_posts ctp ON ctp.id = ctpe.custom_trading_post_id
        CROSS JOIN gang_data gd
        LEFT JOIN custom_trading_post_pricing p
            ON p.custom_trading_post_equipment_id = ctpe.id
            AND (p.gang_type_id IS NULL OR p.gang_type_id = $1)
            AND (p.custom_gang_type_id IS NULL OR p.custom_gang_type_id = gd.custom_gang_type_id)
            AND (p.gang_origin_id IS NULL OR p.gang_origin_id = gd.gang_origin_id)
            AND (p.fighter_type_id IS NULL)
        WHERE ctpe.custom_equipment_id IS NOT NULL
          AND $11 IS NOT NULL AND array_length($11, 1) > 0
          AND ctpe.custom_trading_post_id = ANY($11)
          AND (
            NOT EXISTS (SELECT 1 FROM custom_trading_post_availability a
                        WHERE a.custom_trading_post_equipment_id = ctpe.id)
            OR EXISTS (SELECT 1 FROM custom_trading_post_availability a
                       WHERE a.custom_trading_post_equipment_id = ctpe.id
                         AND (a.gang_type_id IS NULL OR a.gang_type_id = $1)
                         AND (a.custom_gang_type_id IS NULL OR a.custom_gang_type_id = gd.custom_gang_type_id)
                         AND (a.gang_origin_id IS NULL OR a.gang_origin_id = gd.gang_origin_id)
                         AND (a.gang_variant_id IS NULL OR gd.gang_variants ? a.gang_variant_id::text)
                         AND (a.campaign_type_allegiance_id IS NULL OR a.campaign_type_allegiance_id = gd.campaign_type_allegiance_id)
                         AND (a.alignment IS NULL OR a.alignment = gd.alignment))
          )
        GROUP BY ctpe.custom_equipment_id
    ) custom_tp ON custom_tp.custom_equipment_id = ce.id
    WHERE
        (ce.user_id = auth.uid() OR shared.custom_equipment_id IS NOT NULL OR custom_tp.custom_equipment_id IS NOT NULL)
        AND ($2 IS NULL OR trim(both from ce.equipment_category) = trim(both from $2))
        AND ($7 IS NULL OR ce.id = $7)
        AND NOT ($4 IS NULL AND $5 IS NOT NULL AND $5 = true AND $9 IS NOT NULL AND $9 = true)
$$;

REVOKE ALL ON FUNCTION public.get_equipment_detailed_data(UUID, TEXT, UUID, BOOLEAN, BOOLEAN, UUID, UUID, UUID, BOOLEAN, UUID[], UUID[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_equipment_detailed_data(UUID, TEXT, UUID, BOOLEAN, BOOLEAN, UUID, UUID, UUID, BOOLEAN, UUID[], UUID[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_equipment_detailed_data(UUID, TEXT, UUID, BOOLEAN, BOOLEAN, UUID, UUID, UUID, BOOLEAN, UUID[], UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_equipment_detailed_data(UUID, TEXT, UUID, BOOLEAN, BOOLEAN, UUID, UUID, UUID, BOOLEAN, UUID[], UUID[]) TO service_role;
