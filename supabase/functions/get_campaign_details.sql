DROP FUNCTION IF EXISTS get_campaign_details;

CREATE OR REPLACE FUNCTION get_campaign_details(campaign_id UUID)
RETURNS SETOF json AS $$
WITH members_for_campaign AS (
    SELECT *
    FROM campaign_members 
    WHERE campaign_id = $1
),
campaign_gangs_filtered AS (
    SELECT DISTINCT cg.* 
    FROM campaign_gangs cg
    WHERE cg.campaign_id = $1
),
fighter_equipment_costs AS (
    SELECT f.id as fighter_id, COALESCE(SUM(fe.purchase_cost), 0) as equipment_cost
    FROM fighters f
    INNER JOIN campaign_gangs_filtered cgf ON f.gang_id = cgf.gang_id
    LEFT JOIN fighter_equipment fe ON fe.fighter_id = f.id
    GROUP BY f.id
),
fighter_advancement_costs AS (
    SELECT 
        f.id as fighter_id,
        COALESCE(SUM(fc.credits_increase), 0) + COALESCE(SUM(fs.credits_increase), 0) as advancement_cost
    FROM fighters f
    INNER JOIN campaign_gangs_filtered cgf ON f.gang_id = cgf.gang_id
    LEFT JOIN fighter_characteristics fc ON fc.fighter_id = f.id
    LEFT JOIN fighter_skills fs ON fs.fighter_id = f.id
    GROUP BY f.id
),
fighter_details AS (
    SELECT 
        g.id as gang_id,
        COALESCE(SUM(
            f.credits + 
            fec.equipment_cost +
            fac.advancement_cost +
            COALESCE(f.cost_adjustment, 0)
        ), 0) as gang_rating
    FROM gangs g
    INNER JOIN campaign_gangs_filtered cgf ON cgf.gang_id = g.id
    LEFT JOIN fighters f ON f.gang_id = g.id
    LEFT JOIN fighter_equipment_costs fec ON fec.fighter_id = f.id
    LEFT JOIN fighter_advancement_costs fac ON fac.fighter_id = f.id
    GROUP BY g.id
)
SELECT json_build_object(
    'id', c.id,
    'created_at', c.created_at,
    'campaign_name', c.campaign_name,
    'campaign_type_id', c.campaign_type_id,
    'status', c.status,
    'updated_at', c.updated_at,
    'campaign_type_name', ct.campaign_type_name,
    'has_meat', c.has_meat,
    'has_exploration_points', c.has_exploration_points,
    'has_scavenging_rolls', c.has_scavenging_rolls,
    'battles', COALESCE((
        SELECT json_agg(json_build_object(
            'id', cb.id,
            'created_at', cb.created_at,
            'attacker_id', cb.attacker_id,
            'defender_id', cb.defender_id,
            'scenario_id', cb.scenario_id,
            'scenario_name', s.scenario_name,
            'note', cb.note,
            'winner_id', cb.winner_id,
            'winner', (
                SELECT row_to_json(winner)
                FROM (
                    SELECT g.id as gang_id, g.name as gang_name
                    FROM gangs g
                    WHERE g.id = cb.winner_id
                ) winner
            ),
            'attacker', (
                SELECT row_to_json(attacker)
                FROM (
                    SELECT g.id as gang_id, g.name as gang_name, cgf.user_id, p.username
                    FROM gangs g
                    LEFT JOIN campaign_gangs_filtered cgf ON cgf.gang_id = g.id
                    LEFT JOIN profiles p ON cgf.user_id = p.id
                    WHERE g.id = cb.attacker_id
                ) attacker
            ),
            'defender', (
                SELECT row_to_json(defender)
                FROM (
                    SELECT g.id as gang_id, g.name as gang_name, cgf.user_id, p.username
                    FROM gangs g
                    LEFT JOIN campaign_gangs_filtered cgf ON cgf.gang_id = g.id
                    LEFT JOIN profiles p ON cgf.user_id = p.id
                    WHERE g.id = cb.defender_id
                ) defender
            )
        ))
        FROM campaign_battles cb
        LEFT JOIN scenarios s ON cb.scenario_id = s.id
        WHERE cb.campaign_id = $1
    ), '[]'::json),
    'territories', COALESCE((
        SELECT json_agg(json_build_object(
            'id', t.id,
            'created_at', t.created_at,
            'territory_id', t.territory_id,
            'gang_id', t.gang_id,
            'territory_name', t.territory_name
        ))
        FROM (
            SELECT 
                id,
                created_at,
                territory_id,
                gang_id,
                territory_name
            FROM campaign_territories 
            WHERE campaign_id = $1
        ) t
    ), '[]'::json),
    'members', COALESCE((
        SELECT json_agg(json_build_object(
            'user_id', mfc.user_id,
            'username', p.username,
            'role', mfc.role,
            'status', mfc.status,
            'invited_at', mfc.invited_at,
            'joined_at', mfc.joined_at,
            'invited_by', mfc.invited_by,
            'profile', json_build_object(
                'id', p.id,
                'username', p.username,
                'updated_at', p.updated_at,
                'user_role', p.user_role
            ),
            'gangs', COALESCE((
                SELECT json_agg(json_build_object(
                    'id', cgf.id,
                    'gang_id', cgf.gang_id,
                    'gang_name', g.name,
                    'status', cgf.status,
                    'rating', fd.gang_rating
                ))
                FROM campaign_gangs_filtered cgf
                LEFT JOIN gangs g ON cgf.gang_id = g.id
                LEFT JOIN fighter_details fd ON fd.gang_id = g.id
                WHERE cgf.user_id = mfc.user_id
            ), '[]'::json)
        ))
        FROM members_for_campaign mfc
        LEFT JOIN profiles p ON mfc.user_id = p.id
    ), '[]'::json)
)
FROM campaigns c
LEFT JOIN campaign_types ct ON c.campaign_type_id = ct.id
WHERE c.id = $1;
$$ LANGUAGE sql SECURITY DEFINER;