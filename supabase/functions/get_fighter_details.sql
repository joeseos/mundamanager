DROP FUNCTION IF EXISTS get_fighter_details(UUID);

CREATE OR REPLACE FUNCTION get_fighter_details(input_fighter_id UUID)
RETURNS TABLE (result JSON) AS $$
BEGIN
    RETURN QUERY
    WITH fighter_gear AS (
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
            ) AS equipment,
            COALESCE(
                NULLIF(
                    json_build_object(
                        'individual_costs',
                        json_agg(
                            CASE WHEN e.id IS NOT NULL THEN
                                json_build_object(
                                    'equipment_name', e.equipment_name,
                                    'purchase_cost', fe.purchase_cost,
                                    'original_cost', fe.original_cost
                                )
                            ELSE NULL END
                        ) FILTER (WHERE e.id IS NOT NULL)
                    )::text,
                    '{"individual_costs": [null]}'
                ),
                '{"individual_costs": []}'
            ) as purchase_costs
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
                    'body_slots_occupied', v.body_slots_occupied,
                    'drive_slots', v.drive_slots,
                    'drive_slots_occupied', v.drive_slots_occupied,
                    'engine_slots', v.engine_slots,
                    'engine_slots_occupied', v.engine_slots_occupied,
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
                                            'profile_name', vep.profile_name
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
    fighter_advancements AS (
        SELECT 
            f.id AS fighter_id,
            (
                SELECT COALESCE(SUM(fc2.credits_increase), 0)
                FROM fighter_characteristics fc2
                WHERE fc2.fighter_id = f.id
            ) + 
            (
                SELECT COALESCE(SUM(fs2.credits_increase), 0)
                FROM fighter_skills fs2
                WHERE fs2.fighter_id = f.id
            ) as total_advancement_credits,
            COALESCE(
                (SELECT json_agg(
                    json_build_object(
                        'id', fc.id,
                        'created_at', fc.created_at,
                        'updated_at', fc.updated_at,
                        'code', fc.code,
                        'times_increased', fc.times_increased,
                        'characteristic_name', c.name,
                        'credits_increase', fc.credits_increase,
                        'xp_cost', fc.xp_cost,
                        'characteristic_value', fc.characteristic_value,
                        'acquired_at', fc.created_at
                    )
                )
                FROM fighter_characteristics fc
                JOIN characteristics c ON c.id = fc.characteristic_id
                WHERE fc.fighter_id = f.id),
                '[]'::json
            ) as characteristics,
            COALESCE(
                (SELECT json_object_agg(
                    s.name,
                    json_build_object(
                        'id', fs.id,
                        'created_at', fs.created_at,
                        'updated_at', fs.updated_at,
                        'credits_increase', fs.credits_increase,
                        'xp_cost', fs.xp_cost,
                        'is_advance', fs.is_advance,
                        'fighter_injury_id', fs.fighter_injury_id,
                        'acquired_at', fs.created_at
                    )
                )
                FROM fighter_skills fs
                JOIN skills s ON s.id = fs.skill_id
                WHERE fs.fighter_id = f.id),
                '{}'::json
            ) as skills,
            COALESCE(
                (SELECT json_agg(
                    json_build_object(
                        'id', fi.id,
                        'created_at', fi.created_at,
                        'code_1', fi.code_1,
                        'characteristic_1', fi.characteristic_1,
                        'code_2', fi.code_2,
                        'characteristic_2', fi.characteristic_2,
                        'injury_id', fi.injury_id,
                        'injury_name', fi.injury_name
                    )
                )
                FROM fighter_injuries fi
                WHERE fi.fighter_id = f.id),
                '[]'::json
            ) as injuries
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
                    COALESCE(fa.total_advancement_credits, 0) + 
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
                'total_xp', (f.xp + COALESCE(
                    (SELECT SUM(fc.xp_cost) FROM fighter_characteristics fc WHERE fc.fighter_id = f.id), 0
                ) + COALESCE(
                    (SELECT SUM(fs.xp_cost::integer) FROM fighter_skills fs WHERE fs.fighter_id = f.id), 0
                )),
                'advancement_credits', COALESCE(fa.total_advancement_credits, 0),
                'fighter_type', json_build_object(
                    'fighter_type', ft.fighter_type,
                    'fighter_type_id', ft.id
                ),
                'fighter_class', f.fighter_class,
                'fighter_class_id', f.fighter_class_id,
                'characteristics', fa.characteristics,
                'skills', fa.skills,
                'killed', f.killed,
                'starved', f.starved,
                'retired', f.retired,
                'enslaved', f.enslaved,
                'free_skill', f.free_skill,
                'kills', f.kills,
                'injuries', fa.injuries,
                'vehicles', COALESCE(fv.vehicles, '[]'::json),
                'campaigns', COALESCE(fc.campaigns, '[]'::json)
            ),
            'equipment', COALESCE(fg.equipment::json, '[]'::json),
            'equipment_costs', COALESCE(fg.purchase_costs::json, '{"individual_costs": []}'::json),
            'special_rules', COALESCE(to_json(f.special_rules), '[]'::json)
        ) as result
    FROM fighters f
    JOIN fighter_types ft ON f.fighter_type_id = ft.id
    JOIN gangs g ON f.gang_id = g.id
    LEFT JOIN fighter_gear fg ON fg.fighter_id = f.id
    LEFT JOIN fighter_advancements fa ON fa.fighter_id = f.id
    LEFT JOIN fighter_vehicles fv ON fv.fighter_id = f.id
    LEFT JOIN fighter_campaigns fc ON fc.fighter_id = f.id
    WHERE f.id = input_fighter_id;
END;
$$ 
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public;

REVOKE ALL ON FUNCTION get_fighter_details(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_fighter_details(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_fighter_details(UUID) TO service_role;