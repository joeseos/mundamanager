DROP FUNCTION IF EXISTS new_get_fighter_details(UUID);

CREATE OR REPLACE FUNCTION new_get_fighter_details(input_fighter_id UUID)
RETURNS TABLE (result JSON) AS $$
BEGIN
    RETURN QUERY
    WITH fighter_effects_raw AS (
        -- Direct query to get all effect data without categories
        SELECT 
            fe.id,
            fe.fighter_id,
            fe.effect_name,
            fe.type_specific_data,
            fe.created_at,
            fe.updated_at,
            fet.effect_name as effect_type_name,
            fet.id as effect_type_id,
            fec.category_name,
            fec.id as category_id,
            (
                SELECT COALESCE(json_agg(
                    json_build_object(
                        'id', fem.id,
                        'fighter_effect_id', fem.fighter_effect_id,
                        'stat_name', fem.stat_name,
                        'numeric_value', fem.numeric_value
                    )
                ), '[]'::json)
                FROM fighter_effect_modifiers fem
                WHERE fem.fighter_effect_id = fe.id
            ) as modifiers
        FROM fighter_effects fe
        LEFT JOIN fighter_effect_types fet ON fe.fighter_effect_type_id = fet.id
        LEFT JOIN fighter_effect_categories fec ON fet.fighter_effect_category_id = fec.id
        WHERE fe.fighter_id = input_fighter_id
    ),
    fighter_gear AS (
        SELECT 
            f.id AS fighter_id,
            COALESCE(SUM(fe.purchase_cost), 0) as total_equipment_cost,
            COALESCE(
                NULLIF(
                    json_agg(
                        json_build_object(
                            'fighter_equipment_id', fe.id,
                            'equipment_id', e.id,
                            'equipment_name', e.equipment_name,
                            'equipment_type', e.equipment_type,
                            'purchase_cost', fe.purchase_cost,
                            'original_cost', fe.original_cost
                        )
                    ) FILTER (WHERE e.id IS NOT NULL)::text,
                    '[null]'
                ),
                '[]'
            ) AS equipment
        FROM fighters f
        LEFT JOIN fighter_equipment fe ON fe.fighter_id = f.id
        LEFT JOIN equipment e ON e.id = fe.equipment_id
        WHERE f.id = input_fighter_id
        GROUP BY f.id
    ),
    fighter_vehicles AS (
        SELECT 
            v.fighter_id,
            COALESCE(v.cost, 0) as total_vehicle_cost,
            COALESCE(
                (
                    SELECT SUM(fe.purchase_cost)
                    FROM fighter_equipment fe
                    WHERE fe.vehicle_id = v.id
                ), 0
            ) as total_vehicle_equipment_cost,
            COALESCE(json_agg(
                json_build_object(
                    'id', v.id,
                    'created_at', v.created_at,
                    'movement', v.movement,
                    'front', v.front,
                    'side', v.side,
                    'rear', v.rear,
                    'hull_points', v.hull_points,
                    'handling', v.handling,
                    'save', v.save,
                    'body_slots', v.body_slots,
                    'body_slots_occupied', (
                        SELECT COUNT(*)
                        FROM fighter_equipment fe2
                        JOIN equipment e2 ON e2.id = fe2.equipment_id
                        JOIN vehicle_equipment_profiles vep2 ON vep2.equipment_id = e2.id
                        WHERE fe2.vehicle_id = v.id AND vep2.upgrade_type = 'body'
                    ),
                    'drive_slots', v.drive_slots,
                    'drive_slots_occupied', (
                        SELECT COUNT(*)
                        FROM fighter_equipment fe2
                        JOIN equipment e2 ON e2.id = fe2.equipment_id
                        JOIN vehicle_equipment_profiles vep2 ON vep2.equipment_id = e2.id
                        WHERE fe2.vehicle_id = v.id AND vep2.upgrade_type = 'drive'
                    ),
                    'engine_slots', v.engine_slots,
                    'engine_slots_occupied', (
                        SELECT COUNT(*)
                        FROM fighter_equipment fe2
                        JOIN equipment e2 ON e2.id = fe2.equipment_id
                        JOIN vehicle_equipment_profiles vep2 ON vep2.equipment_id = e2.id
                        WHERE fe2.vehicle_id = v.id AND vep2.upgrade_type = 'engine'
                    ),
                    'special_rules', v.special_rules,
                    'vehicle_name', v.vehicle_name,
                    'vehicle_type', v.vehicle_type,
                    'cost', v.cost,
                    'equipment', (
                        SELECT COALESCE(json_agg(
                            json_build_object(
                                'fighter_equipment_id', fe.id,
                                'equipment_id', e.id,
                                'equipment_name', e.equipment_name,
                                'equipment_type', e.equipment_type,
                                'purchase_cost', fe.purchase_cost,
                                'original_cost', fe.original_cost,
                                'vehicle_equipment_profiles', (
                                    SELECT COALESCE(json_agg(
                                        json_build_object(
                                            'id', vep.id,
                                            'created_at', vep.created_at,
                                            'equipment_id', vep.equipment_id,
                                            'movement', vep.movement,
                                            'front', vep.front,
                                            'side', vep.side,
                                            'rear', vep.rear,
                                            'hull_points', vep.hull_points,
                                            'save', vep.save,
                                            'profile_name', vep.profile_name,
                                            'upgrade_type', vep.upgrade_type
                                        )
                                    ), '[]'::json)
                                    FROM vehicle_equipment_profiles vep
                                    WHERE vep.equipment_id = fe.equipment_id
                                )
                            )
                        ), '[]'::json)
                        FROM fighter_equipment fe
                        JOIN equipment e ON e.id = fe.equipment_id
                        WHERE fe.vehicle_id = v.id
                    )
                )
            ), '[]'::json) as vehicles
        FROM vehicles v
        WHERE v.fighter_id = input_fighter_id
        GROUP BY v.fighter_id, v.id, v.cost
    ),
    fighter_skills AS (
        SELECT 
            f.id AS fighter_id,
            COALESCE(
                (SELECT SUM(fs2.credits_increase) 
                FROM fighter_skills fs2
                WHERE fs2.fighter_id = f.id), 0
            ) as total_skills_credits,
            COALESCE(
                (SELECT json_object_agg(
                    s.name,
                    json_build_object(
                        'id', fs.id,
                        'created_at', fs.created_at,
                        'updated_at', fs.updated_at,
                        'credits_increase', fs.credits_increase,
                        'xp_cost', fs.xp_cost, -- Using the actual column from the table
                        'is_advance', fs.is_advance,
                        'fighter_injury_id', fs.fighter_injury_id,
                        'acquired_at', fs.created_at
                    )
                )
                FROM fighter_skills fs
                JOIN skills s ON s.id = fs.skill_id
                WHERE fs.fighter_id = f.id),
                '{}'::json
            ) as skills
        FROM fighters f
        WHERE f.id = input_fighter_id
    ),
    fighter_campaigns AS (
        SELECT 
            f.id AS fighter_id,
            json_agg(
                json_build_object(
                    'campaign_id', c.id,
                    'campaign_name', c.campaign_name,
                    'role', cg.role,
                    'status', cg.status,
                    'invited_at', cg.invited_at,
                    'joined_at', cg.joined_at,
                    'invited_by', cg.invited_by,
                    'has_meat', c.has_meat,
                    'has_exploration_points', c.has_exploration_points,
                    'has_scavenging_rolls', c.has_scavenging_rolls
                )
            ) as campaigns
        FROM fighters f
        JOIN gangs g ON g.id = f.gang_id
        JOIN campaign_gangs cg ON cg.gang_id = g.id
        JOIN campaigns c ON c.id = cg.campaign_id
        WHERE f.id = input_fighter_id
        GROUP BY f.id
    ),
    -- New CTE to properly categorize effects
    categorized_effects AS (
        SELECT 
            category_name,
            json_agg(
                json_build_object(
                    'id', fer.id,
                    'effect_name', fer.effect_name,
                    'type_specific_data', fer.type_specific_data,
                    'created_at', fer.created_at,
                    'updated_at', fer.updated_at,
                    'fighter_effect_modifiers', fer.modifiers
                )
            ) AS effects_json
        FROM fighter_effects_raw fer
        GROUP BY category_name
    ),
    -- New CTE to calculate the total credits from effects
    effect_credits AS (
        SELECT
            input_fighter_id AS fighter_id,
            COALESCE(
                SUM(
                    CASE
                        WHEN fe.type_specific_data->>'credits_increase' IS NOT NULL THEN 
                            (fe.type_specific_data->>'credits_increase')::integer
                        ELSE 0
                    END
                ),
                0
            ) AS total_effect_credits
        FROM fighter_effects fe
        WHERE fe.fighter_id = input_fighter_id
    )
    SELECT 
        json_build_object(
            'gang', json_build_object(
                'id', g.id,
                'credits', g.credits,
                'gang_type_id', g.gang_type_id
            ),
            'fighter', json_build_object(
                'id', f.id,
                'fighter_name', f.fighter_name,
                'label', f.label,
                'note', f.note,
                'credits', (
                    f.credits + 
                    COALESCE(fg.total_equipment_cost, 0) + 
                    COALESCE(fs.total_skills_credits, 0) +
                    COALESCE(ec.total_effect_credits, 0) +
                    COALESCE(f.cost_adjustment, 0) +
                    COALESCE(fv.total_vehicle_cost, 0) +
                    COALESCE(fv.total_vehicle_equipment_cost, 0)
                ),
                'cost_adjustment', COALESCE(f.cost_adjustment, 0),
                'vehicle_cost', COALESCE(fv.total_vehicle_cost, 0),
                'vehicle_equipment_cost', COALESCE(fv.total_vehicle_equipment_cost, 0),
                'movement', f.movement,
                'weapon_skill', f.weapon_skill,
                'ballistic_skill', f.ballistic_skill,
                'strength', f.strength,
                'toughness', f.toughness,
                'wounds', f.wounds,
                'initiative', f.initiative,
                'attacks', f.attacks,
                'leadership', f.leadership,
                'cool', f.cool,
                'willpower', f.willpower,
                'intelligence', f.intelligence,
                'xp', f.xp,
                'total_xp', f.xp,  -- Simplified calculation, may need to adjust based on your requirements
                'special_rules', f.special_rules,
                'fighter_type', json_build_object(
                    'fighter_type', ft.fighter_type,
                    'fighter_type_id', ft.id
                ),
                'fighter_class', f.fighter_class,
                'fighter_class_id', f.fighter_class_id,
                'skills', fs.skills,
                'killed', f.killed,
                'starved', f.starved,
                'retired', f.retired,
                'enslaved', f.enslaved,
                'recovery', f.recovery,
                'free_skill', f.free_skill,
                'kills', f.kills,
                -- Fixed approach using the new categorized_effects CTE
                'effects', CASE 
                    WHEN (SELECT COUNT(*) FROM categorized_effects) > 0 THEN
                        (SELECT json_object_agg(
                            COALESCE(ce.category_name, 'uncategorized'),
                            ce.effects_json
                        ) FROM categorized_effects ce)
                    ELSE '{}'::json
                END,
                'vehicles', COALESCE(fv.vehicles, '[]'::json),
                'campaigns', COALESCE(fc.campaigns, '[]'::json)
            ),
            'equipment', COALESCE(fg.equipment::json, '[]'::json)
        ) as result
    FROM fighters f
    JOIN fighter_types ft ON f.fighter_type_id = ft.id
    JOIN gangs g ON f.gang_id = g.id
    LEFT JOIN fighter_gear fg ON fg.fighter_id = f.id
    LEFT JOIN fighter_skills fs ON fs.fighter_id = f.id
    LEFT JOIN fighter_vehicles fv ON fv.fighter_id = f.id
    LEFT JOIN fighter_campaigns fc ON fc.fighter_id = f.id
    LEFT JOIN effect_credits ec ON ec.fighter_id = f.id
    WHERE f.id = input_fighter_id;
END;
$$ 
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public;

REVOKE ALL ON FUNCTION new_get_fighter_details(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION new_get_fighter_details(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION new_get_fighter_details(UUID) TO service_role;