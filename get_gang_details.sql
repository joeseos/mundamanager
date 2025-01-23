CREATE OR REPLACE FUNCTION public.get_gang_details(p_gang_id uuid)
RETURNS TABLE(id uuid, name text, gang_type text, gang_type_id uuid, credits numeric, reputation numeric, meat numeric, exploration_points numeric, rating numeric, alignment alignment, note text, stash json, created_at timestamp with time zone, last_updated timestamp with time zone, fighters json, campaigns json)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
   RETURN QUERY
   WITH gang_fighters AS (
       SELECT
           f.id AS f_id,
           f.gang_id,
           f.fighter_name,
           f.label,
           ft.fighter_type,
           f.fighter_class,
           f.xp,
           f.kills,
           f.position,
           f.movement,
           f.weapon_skill,
           f.ballistic_skill,
           f.strength,
           f.toughness,
           f.wounds,
           f.initiative,
           f.attacks,
           f.leadership,
           f.cool,
           f.willpower,
           f.intelligence,
           f.credits as base_credits,
           f.cost_adjustment,
           f.special_rules,
           f.note,
           f.killed,
           f.starved,
           f.retired,
           f.enslaved,
           f.free_skill
       FROM fighters f
       LEFT JOIN fighter_types ft ON ft.id = f.fighter_type_id
       WHERE f.gang_id = p_gang_id
   ),
   fighter_injuries AS (
       SELECT 
           fi.fighter_id,
           json_agg(
               json_build_object(
                   'id', fi.id,
                   'created_at', fi.created_at,
                   'injury_id', fi.injury_id,
                   'injury_name', fi.injury_name,
                   'code_1', fi.code_1,
                   'characteristic_1', fi.characteristic_1,
                   'code_2', fi.code_2,
                   'characteristic_2', fi.characteristic_2,
                   'fighter_skill_id', fi.fighter_skill_id
               )
           ) as injuries
       FROM fighter_injuries fi
       WHERE fi.fighter_id IN (SELECT f_id FROM gang_fighters)
       GROUP BY fi.fighter_id
   ),
   fighter_gear AS (
       WITH weapon_groups AS (
           SELECT DISTINCT wp.weapon_group_id, e.id as equipment_id
           FROM equipment e
           JOIN weapon_profiles wp ON wp.weapon_id = e.id
           WHERE e.id = wp.weapon_group_id
       )
       SELECT 
           f.f_id AS fighter_id,
           COALESCE(SUM(fe.purchase_cost), 0) as total_equipment_cost,
           json_agg(
               CASE 
                   WHEN e.equipment_type = 'weapon' AND NOT EXISTS (
                       SELECT 1 FROM weapon_profiles wp_check
                       JOIN weapon_groups wg ON wg.weapon_group_id = wp_check.weapon_group_id
                       WHERE wp_check.weapon_id = e.id
                       AND wg.equipment_id != e.id
                   ) THEN
                       json_build_object(
                           'fighter_weapon_id', fe.id,
                           'equipment_id', e.id,
                           'equipment_name', e.equipment_name,
                           'equipment_type', e.equipment_type,
                           'cost', fe.purchase_cost,
                           'weapon_profiles', (
                               SELECT COALESCE(json_agg(
                                   json_build_object(
                                       'id', wp2.id,
                                       'profile_name', wp2.profile_name,
                                       'range_short', wp2.range_short,
                                       'range_long', wp2.range_long,
                                       'acc_short', wp2.acc_short,
                                       'acc_long', wp2.acc_long,
                                       'strength', wp2.strength,
                                       'ap', wp2.ap,
                                       'damage', wp2.damage,
                                       'ammo', wp2.ammo,
                                       'traits', wp2.traits,
                                       'weapon_group_id', wp2.weapon_group_id,
                                       'is_default_profile', wp2.is_default_profile,
                                       'sort_order', wp2.sort_order
                                   )
                                   ORDER BY wp2.sort_order NULLS LAST,
                                          wp2.profile_name
                               ), '[]'::json)
                               FROM weapon_profiles wp2 
                               WHERE wp2.weapon_id IN (
                                   SELECT fe2.equipment_id
                                   FROM fighter_equipment fe2
                                   JOIN weapon_profiles wp3 ON wp3.weapon_id = fe2.equipment_id
                                   WHERE fe2.fighter_id = f.f_id
                                   AND (
                                       wp3.weapon_group_id = (
                                           SELECT wp4.weapon_group_id
                                           FROM weapon_profiles wp4
                                           WHERE wp4.weapon_id = e.id
                                           LIMIT 1
                                       )
                                       OR fe2.equipment_id = e.id
                                   )
                               )
                           )
                       )
                   WHEN e.equipment_type != 'weapon' THEN
                       json_build_object(
                           'fighter_weapon_id', fe.id,
                           'equipment_id', e.id,
                           'equipment_name', e.equipment_name,
                           'equipment_type', e.equipment_type,
                           'cost', fe.purchase_cost
                       )
                   ELSE NULL
               END
           ) FILTER (WHERE 
               e.equipment_type != 'weapon' OR 
               NOT EXISTS (
                   SELECT 1 FROM weapon_profiles wp_check
                   JOIN weapon_groups wg ON wg.weapon_group_id = wp_check.weapon_group_id
                   WHERE wp_check.weapon_id = e.id
                   AND wg.equipment_id != e.id
               )
           ) AS equipment
       FROM gang_fighters f
       LEFT JOIN fighter_equipment fe ON fe.fighter_id = f.f_id
       LEFT JOIN equipment e ON e.id = fe.equipment_id
       GROUP BY f.f_id
   ),
   fighter_advancements AS (
       SELECT 
           f.f_id AS fighter_id,
           (
               COALESCE((SELECT SUM(fc2.credits_increase) FROM fighter_characteristics fc2 WHERE fc2.fighter_id = f.f_id), 0) +
               COALESCE((SELECT SUM(fs2.credits_increase) FROM fighter_skills fs2 WHERE fs2.fighter_id = f.f_id), 0)
           ) as total_advancement_credits,
           json_build_object(
               'characteristics', 
               COALESCE(
                   (SELECT json_object_agg(
                       c.name,
                       json_build_object(
                           'times_increased', fc.times_increased,
                           'credits_increase', fc.credits_increase,
                           'code', fc.code,
                           'characteristic_value', fc.characteristic_value,
                           'acquired_at', fc.created_at
                       )
                   )
                   FROM fighter_characteristics fc
                   JOIN characteristics c ON c.id = fc.characteristic_id
                   WHERE fc.fighter_id = f.f_id),
                   '{}'::json
               ),
               'skills',
               COALESCE(
                   (SELECT json_object_agg(
                       s.name,
                       json_build_object(
                           'id', fs.id,
                           'credits_increase', fs.credits_increase,
                           'xp_cost', fs.xp_cost,
                           'is_advance', fs.is_advance,
                           'acquired_at', fs.created_at
                       )
                   )
                   FROM fighter_skills fs
                   JOIN skills s ON s.id = fs.skill_id
                   WHERE fs.fighter_id = f.f_id),
                   '{}'::json
               )
           ) as advancements
       FROM gang_fighters f
       GROUP BY f.f_id
   ),
   gang_vehicles AS (
       SELECT 
           v.id,
           v.fighter_id,
           v.created_at,
           v.movement,
           v.front,
           v.side,
           v.rear,
           v.hull_points,
           v.handling,
           v.save,
           v.body_slots,
           v.body_slots_occupied,
           v.drive_slots,
           v.drive_slots_occupied,
           v.engine_slots,
           v.engine_slots_occupied,
           v.special_rules,
           v.vehicle_name
       FROM vehicles v
       WHERE v.fighter_id IN (SELECT f_id FROM gang_fighters)
   ),
   complete_fighters AS (
       SELECT 
           f.f_id AS id,
           f.fighter_name,
           f.label,
           f.fighter_type,
           f.fighter_class,
           f.xp,
           f.kills,
           f.position,
           f.movement,
           f.weapon_skill,
           f.ballistic_skill,
           f.strength,
           f.toughness,
           f.wounds,
           f.initiative,
           f.attacks,
           f.leadership,
           f.cool,
           f.willpower,
           f.intelligence,
           f.special_rules,
           f.note,
           f.killed,
           f.starved,
           f.retired,
           f.enslaved,
           f.free_skill,
           f.cost_adjustment,
           (COALESCE(f.base_credits, 0) + 
            COALESCE(g.total_equipment_cost, 0) + 
            COALESCE(a.total_advancement_credits, 0) +
            COALESCE(f.cost_adjustment, 0)) as total_credits,
           COALESCE(g.equipment, '[]'::json) as equipment,
           a.advancements,
           COALESCE(i.injuries, '[]'::json) as injuries,
           COALESCE(
               (SELECT json_agg(
                   json_build_object(
                       'id', gv.id,
                       'created_at', gv.created_at,
                       'movement', gv.movement,
                       'front', gv.front,
                       'side', gv.side,
                       'rear', gv.rear,
                       'hull_points', gv.hull_points,
                       'handling', gv.handling,
                       'save', gv.save,
                       'body_slots', gv.body_slots,
                       'body_slots_occupied', gv.body_slots_occupied,
                       'drive_slots', gv.drive_slots,
                       'drive_slots_occupied', gv.drive_slots_occupied,
                       'engine_slots', gv.engine_slots,
                       'engine_slots_occupied', gv.engine_slots_occupied,
                       'special_rules', gv.special_rules,
                       'vehicle_name', gv.vehicle_name
                   )
               )
               FROM gang_vehicles gv
               WHERE gv.fighter_id = f.f_id
           ), '[]'::json) as vehicles
       FROM gang_fighters f
       LEFT JOIN fighter_gear g ON g.fighter_id = f.f_id
       LEFT JOIN fighter_advancements a ON a.fighter_id = f.f_id
       LEFT JOIN fighter_injuries i ON i.fighter_id = f.f_id
   ),
   gang_totals AS (
       SELECT 
           SUM(total_credits) as total_gang_rating
       FROM complete_fighters
   ),
   gang_stash AS (
       SELECT 
           gs.gang_id,
           json_agg(
               CASE
                   WHEN gs.equipment_id IS NOT NULL THEN
                       json_build_object(
                           'id', gs.id,
                           'created_at', gs.created_at,
                           'equipment_id', gs.equipment_id,
                           'equipment_name', e.equipment_name,
                           'equipment_type', e.equipment_type,
                           'cost', gs.cost,
                           'type', 'equipment'
                       )
                   WHEN gs.vehicle_id IS NOT NULL THEN
                       json_build_object(
                           'id', gs.id,
                           'created_at', gs.created_at,
                           'vehicle_id', gs.vehicle_id,
                           'vehicle_name', v.vehicle_name,
                           'cost', gs.cost,
                           'type', 'vehicle'
                       )
               END
           ) as stash_items
       FROM gang_stash gs
       LEFT JOIN equipment e ON e.id = gs.equipment_id
       LEFT JOIN vehicles v ON v.id = gs.vehicle_id
       WHERE gs.gang_id = p_gang_id
       GROUP BY gs.gang_id
   ),
   gang_campaigns AS (
       SELECT 
           cg.gang_id,
           json_agg(
               json_build_object(
                   'campaign_id', c.id,
                   'campaign_name', c.campaign_name,
                   'role', cg.role,
                   'status', cg.status,
                   'invited_at', cg.invited_at,
                   'joined_at', cg.joined_at,
                   'invited_by', cg.invited_by
               )
           ) as campaigns
       FROM campaign_gangs cg
       JOIN campaigns c ON c.id = cg.campaign_id
       WHERE cg.gang_id = p_gang_id
       GROUP BY cg.gang_id
   )
   SELECT 
       g.id,
       g.name,
       g.gang_type,
       g.gang_type_id,
       g.credits,
       g.reputation,
       g.meat,
       g.exploration_points,
       (SELECT total_gang_rating FROM gang_totals) as rating,
       g.alignment,
       g.note,
       COALESCE((
           SELECT gs.stash_items
           FROM gang_stash gs
           WHERE gs.gang_id = g.id
       ), '[]'::json) as stash,
       g.created_at,
       g.last_updated,
       COALESCE((
           SELECT json_agg(
               json_build_object(
                   'id', cf.id,
                   'fighter_name', cf.fighter_name,
                   'label', cf.label,
                   'fighter_type', cf.fighter_type,
                   'fighter_class', cf.fighter_class,
                   'position', cf.position,
                   'xp', cf.xp,
                   'kills', cf.kills,
                   'credits', cf.total_credits,
                   'movement', cf.movement,
                   'weapon_skill', cf.weapon_skill,
                   'ballistic_skill', cf.ballistic_skill,
                   'strength', cf.strength,
                   'toughness', cf.toughness,
                   'wounds', cf.wounds,
                   'initiative', cf.initiative,
                   'attacks', cf.attacks,
                   'leadership', cf.leadership,
                   'cool', cf.cool,
                   'willpower', cf.willpower,
                   'intelligence', cf.intelligence,
                   'equipment', cf.equipment,
                   'advancements', cf.advancements,
                   'injuries', cf.injuries,
                   'vehicles', cf.vehicles,
                   'cost_adjustment', cf.cost_adjustment,
                   'special_rules', CASE 
                       WHEN cf.special_rules IS NULL THEN '[]'::json
                       ELSE to_json(cf.special_rules)
                   END,
                   'note', cf.note,
                   'killed', cf.killed,
                   'starved', cf.starved,
                   'retired', cf.retired,
                   'enslaved', cf.enslaved,
                   'free_skill', cf.free_skill
               )
           )
           FROM complete_fighters cf
       ), '[]'::json) as fighters,
       COALESCE((
           SELECT gc.campaigns
           FROM gang_campaigns gc
           WHERE gc.gang_id = g.id
       ), '[]'::json) as campaigns
   FROM gangs g
   WHERE g.id = p_gang_id;
END;
$function$;
 