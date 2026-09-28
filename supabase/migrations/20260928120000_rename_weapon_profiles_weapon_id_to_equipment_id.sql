-- Rename weapon_profiles.weapon_id → equipment_id.
--
-- The column is a foreign key to equipment(id). Every other table names that
-- column equipment_id, and custom_weapon_profiles already uses
-- custom_equipment_id. Pure rename, no data change.
--
-- Hard cutover: the app code shipped with this migration reads equipment_id,
-- so apply it in the same window as the deploy. The two RPCs that read the
-- column are recreated below, so the database is consistent as soon as this
-- commits; the deploy-on-merge of supabase/functions/*.sql then re-applies the
-- same bodies.

BEGIN;

ALTER TABLE public.weapon_profiles RENAME COLUMN weapon_id TO equipment_id;

-- The column still carries the gen_random_uuid() default it was created with.
-- A foreign key should never fall back to a random UUID.
ALTER TABLE public.weapon_profiles ALTER COLUMN equipment_id DROP DEFAULT;

-- RENAME COLUMN already updates the index and FK definitions; only their
-- names still say weapon_id.
ALTER INDEX public.weapon_profiles_weapon_id_idx
  RENAME TO weapon_profiles_equipment_id_idx;
ALTER TABLE public.weapon_profiles
  RENAME CONSTRAINT weapon_profiles_weapon_id_fkey TO weapon_profiles_equipment_id_fkey;

-- Function bodies are stored as text, so RENAME COLUMN does not touch them.
-- Same signatures and return types as before, so CREATE OR REPLACE keeps the
-- existing grants. Bodies match supabase/functions/*.sql.

-- get_gang_details (obsolete, kept for the Rule Snatcher Tool)
CREATE OR REPLACE FUNCTION public.get_gang_details(p_gang_id uuid)
RETURNS TABLE(
    id uuid, 
    name text, 
    gang_type text, 
    gang_type_id uuid,
    gang_type_image_url text,
    gang_colour text,
    credits numeric, 
    reputation numeric,
    rating numeric,
    alignment alignment,
    positioning jsonb, 
    note text, 
    stash json, 
    created_at timestamp with time zone, 
    last_updated timestamp with time zone, 
    fighters json, 
    campaigns json,
    vehicles json,
    alliance_id uuid,
    alliance_name text,
    alliance_type text,
    gang_subtypes json,
    edition_slug text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
   RETURN QUERY
   WITH fighter_ids AS (
       SELECT f.id AS f_id
       FROM fighters f
       WHERE f.gang_id = p_gang_id
   ),
   vehicle_ids AS (
       SELECT v.id AS v_id
       FROM vehicles v
       WHERE v.gang_id = p_gang_id OR v.fighter_id IN (SELECT f_id FROM fighter_ids)
   ),
   gang_fighters AS (
       SELECT
           f.id AS f_id,
           f.gang_id,
           f.fighter_name,
           f.label,
           f.fighter_type,
           f.fighter_type_id,
           f.fighter_subtypes,
           f.fighter_specialisation_id,
           f.fighter_variant,
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
           f.recovery,
           f.free_skill,
           f.image_url
       FROM fighters f
       WHERE f.id IN (SELECT f_id FROM fighter_ids)
   ),
   fighter_effect_modifier_agg AS (
       SELECT 
           fem.fighter_effect_id,
           json_agg(
               json_build_object(
                   'id', fem.id,
                   'fighter_effect_id', fem.fighter_effect_id,
                   'stat_name', fem.stat_name,
                   'numeric_value', fem.numeric_value
               )
           ) as modifiers
       FROM fighter_effect_modifiers fem
       WHERE fem.fighter_effect_id IN (
           SELECT fe.id 
           FROM fighter_effects fe
           WHERE fe.fighter_id IN (SELECT f_id FROM fighter_ids)
       )
       GROUP BY fem.fighter_effect_id
   ),
   vehicle_effect_modifier_agg AS (
       SELECT 
           fem.fighter_effect_id,
           json_agg(
               json_build_object(
                   'id', fem.id,
                   'fighter_effect_id', fem.fighter_effect_id,
                   'stat_name', fem.stat_name,
                   'numeric_value', fem.numeric_value
               )
           ) as modifiers
       FROM fighter_effect_modifiers fem
       WHERE fem.fighter_effect_id IN (
           SELECT fe.id 
           FROM fighter_effects fe
           WHERE fe.vehicle_id IN (SELECT v_id FROM vehicle_ids)
       )
       GROUP BY fem.fighter_effect_id
   ),
   fighter_effects_raw AS (
       SELECT 
           fe.id,
           fe.fighter_id,
           NULL::uuid as vehicle_id,
           fe.effect_name,
           fe.type_specific_data,
           fe.created_at,
           fe.updated_at,
           fet.effect_name as effect_type_name,
           fet.id as effect_type_id,
           fec.category_name,
           fec.id as category_id,
           COALESCE(fem.modifiers, '[]'::json) as modifiers
       FROM fighter_effects fe
       LEFT JOIN fighter_effect_types fet ON fe.fighter_effect_type_id = fet.id
       LEFT JOIN fighter_effect_categories fec ON fet.fighter_effect_category_id = fec.id
       LEFT JOIN fighter_effect_modifier_agg fem ON fem.fighter_effect_id = fe.id
       WHERE fe.fighter_id IN (SELECT f_id FROM fighter_ids)
   ),
   vehicle_effects_raw AS (
       SELECT 
           fe.id,
           NULL::uuid as fighter_id,
           fe.vehicle_id,
           fe.effect_name,
           fe.type_specific_data,
           fe.created_at,
           fe.updated_at,
           fet.effect_name as effect_type_name,
           fet.id as effect_type_id,
           fec.category_name,
           fec.id as category_id,
           COALESCE(vem.modifiers, '[]'::json) as modifiers
       FROM fighter_effects fe
       LEFT JOIN fighter_effect_types fet ON fe.fighter_effect_type_id = fet.id
       LEFT JOIN fighter_effect_categories fec ON fet.fighter_effect_category_id = fec.id
       LEFT JOIN vehicle_effect_modifier_agg vem ON vem.fighter_effect_id = fe.id
       WHERE fe.vehicle_id IN (SELECT v_id FROM vehicle_ids)
   ),
   fighter_effect_categories AS (
       SELECT DISTINCT 
           fer.fighter_id,
           COALESCE(fer.category_name, 'uncategorized') as category_name
       FROM fighter_effects_raw fer
   ),
   vehicle_effect_categories AS (
       SELECT DISTINCT 
           ver.vehicle_id,
           COALESCE(ver.category_name, 'uncategorized') as category_name
       FROM vehicle_effects_raw ver
   ),
   fighter_effects_by_category AS (
       SELECT 
           fer.fighter_id,
           COALESCE(fer.category_name, 'uncategorized') as category_name,
           json_agg(
               json_build_object(
                   'id', fer.id,
                   'effect_name', fer.effect_name,
                   'type_specific_data', fer.type_specific_data,
                   'created_at', fer.created_at,
                   'updated_at', fer.updated_at,
                   'fighter_effect_modifiers', fer.modifiers
               )
           ) as effects
       FROM fighter_effects_raw fer
       GROUP BY fer.fighter_id, COALESCE(fer.category_name, 'uncategorized')
   ),
   vehicle_effects_by_category AS (
       SELECT 
           ver.vehicle_id,
           COALESCE(ver.category_name, 'uncategorized') as category_name,
           json_agg(
               json_build_object(
                   'id', ver.id,
                   'effect_name', ver.effect_name,
                   'type_specific_data', ver.type_specific_data,
                   'created_at', ver.created_at,
                   'updated_at', ver.updated_at,
                   'fighter_effect_modifiers', ver.modifiers
               )
           ) as effects
       FROM vehicle_effects_raw ver
       GROUP BY ver.vehicle_id, COALESCE(ver.category_name, 'uncategorized')
   ),
   fighter_effects AS (
       SELECT 
           fec.fighter_id,
           json_object_agg(
               fec.category_name,
               COALESCE(
                   (SELECT febc.effects 
                    FROM fighter_effects_by_category febc 
                    WHERE febc.fighter_id = fec.fighter_id 
                    AND febc.category_name = fec.category_name),
                   '[]'::json
               )
           ) as effects
       FROM fighter_effect_categories fec
       GROUP BY fec.fighter_id
   ),
   vehicle_effects AS (
       SELECT 
           vec.vehicle_id,
           json_object_agg(
               vec.category_name,
               COALESCE(
                   (SELECT vebc.effects 
                    FROM vehicle_effects_by_category vebc 
                    WHERE vebc.vehicle_id = vec.vehicle_id 
                    AND vebc.category_name = vec.category_name),
                   '[]'::json
               )
           ) as effects
       FROM vehicle_effect_categories vec
       GROUP BY vec.vehicle_id
   ),
   fighter_effects_credits AS (
       SELECT
           fer.fighter_id,
           COALESCE(
               SUM(
                   CASE
                       WHEN fer.type_specific_data->>'credits_increase' IS NOT NULL THEN 
                           (fer.type_specific_data->>'credits_increase')::integer
                       ELSE 0
                   END
               ),
               0
           )::numeric AS total_effect_credits
       FROM fighter_effects_raw fer
       GROUP BY fer.fighter_id
   ),
   vehicle_effects_credits AS (
       SELECT
           ver.vehicle_id,
           COALESCE(
               SUM(
                   CASE
                       WHEN ver.type_specific_data->>'credits_increase' IS NOT NULL THEN 
                           (ver.type_specific_data->>'credits_increase')::integer
                       ELSE 0
                   END
               ),
               0
           )::numeric AS total_effect_credits
       FROM vehicle_effects_raw ver
       GROUP BY ver.vehicle_id
   ),
   fighter_skills_agg AS (
       SELECT 
           fs.fighter_id,
           SUM(fs.credits_increase)::numeric as total_skills_credits,
           SUM(fs.xp_cost) as total_skills_xp
       FROM fighter_skills fs
       WHERE fs.fighter_id IN (SELECT f_id FROM fighter_ids)
       GROUP BY fs.fighter_id
   ),
   fighter_skills_json AS (
       SELECT 
           fs.fighter_id,
           json_object_agg(
               s.name,
               json_build_object(
                   'id', fs.id,
                   'credits_increase', fs.credits_increase,
                   'xp_cost', fs.xp_cost,
                   'is_advance', fs.is_advance,
                   'acquired_at', fs.created_at
               )
           ) as skills
       FROM fighter_skills fs
       JOIN skills s ON s.id = fs.skill_id
       WHERE fs.fighter_id IN (SELECT f_id FROM fighter_ids)
       GROUP BY fs.fighter_id
   ),
   fighter_skills AS (
       SELECT 
           f.f_id AS fighter_id,
           COALESCE(fsa.total_skills_credits, 0)::numeric as total_skills_credits,
           COALESCE(fsj.skills, '{}'::json) as skills,
           COALESCE(fsa.total_skills_xp, 0) as total_skills_xp
       FROM gang_fighters f
       LEFT JOIN fighter_skills_agg fsa ON fsa.fighter_id = f.f_id
       LEFT JOIN fighter_skills_json fsj ON fsj.fighter_id = f.f_id
   ),
   fighter_equipment_costs AS (
       SELECT 
           fe.fighter_id,
           COALESCE(SUM(fe.purchase_cost), 0)::numeric as total_equipment_cost
       FROM fighter_equipment fe
       WHERE fe.fighter_id IN (SELECT f_id FROM fighter_ids)
       GROUP BY fe.fighter_id
   ),
   weapon_profiles_deduplicated AS (
       SELECT DISTINCT wp.id, wp.equipment_id, wp.profile_name, wp.range_short, wp.range_long, 
                      wp.acc_short, wp.acc_long, wp.strength, wp.ap, wp.damage, wp.ammo, 
                      wp.traits, wp.weapon_group_id, wp.sort_order,
                      fe.id AS fe_id, fe.is_master_crafted
       FROM weapon_profiles wp
       JOIN fighter_equipment fe ON fe.equipment_id = wp.equipment_id
       WHERE (fe.fighter_id IN (SELECT f_id FROM fighter_ids)
          OR fe.vehicle_id IN (
             SELECT v.id FROM vehicles v 
             WHERE v.gang_id = p_gang_id OR v.fighter_id IN (SELECT f_id FROM fighter_ids)
          ))
       AND fe.equipment_id IS NOT NULL
   ),
   weapon_profiles_grouped AS (
       SELECT 
           wpd.fe_id,
           wpd.equipment_id,
           json_agg(
               json_build_object(
                   'id', wpd.id,
                   'profile_name', wpd.profile_name,
                   'range_short', wpd.range_short,
                   'range_long', wpd.range_long,
                   'acc_short', wpd.acc_short,
                   'acc_long', wpd.acc_long,
                   'strength', wpd.strength,
                   'ap', wpd.ap,
                   'damage', wpd.damage,
                   'ammo', wpd.ammo,
                   'traits', wpd.traits,
                   'weapon_group_id', wpd.weapon_group_id, 
                   'sort_order', wpd.sort_order,
                   'is_master_crafted', wpd.is_master_crafted
               )
               ORDER BY wpd.sort_order NULLS LAST, wpd.profile_name
           ) as profiles
       FROM weapon_profiles_deduplicated wpd
       GROUP BY wpd.fe_id, wpd.equipment_id
   ),
   custom_weapon_profiles_grouped AS (
       SELECT 
           fe.id as fe_id,
           fe.custom_equipment_id as equipment_id,
           json_agg(
               json_build_object(
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
                   'weapon_group_id', cwp.weapon_group_id,
                   'sort_order', cwp.sort_order,
                   'is_master_crafted', fe.is_master_crafted
               )
               ORDER BY cwp.sort_order NULLS LAST, cwp.profile_name
           ) as profiles
       FROM fighter_equipment fe
       JOIN custom_weapon_profiles cwp ON (cwp.custom_equipment_id = fe.custom_equipment_id OR cwp.weapon_group_id = fe.custom_equipment_id)
       WHERE fe.custom_equipment_id IS NOT NULL
       AND (fe.fighter_id IN (SELECT f_id FROM fighter_ids)
          OR fe.vehicle_id IN (
             SELECT v.id FROM vehicles v 
             WHERE v.gang_id = p_gang_id OR v.fighter_id IN (SELECT f_id FROM fighter_ids)
          ))
       GROUP BY fe.id, fe.custom_equipment_id
   ),
   fighter_equipment_details AS (
       SELECT 
           fe.fighter_id,
           json_agg(
               json_build_object(
                   'fighter_weapon_id', fe.id,
                   'equipment_id', COALESCE(e.id, ce.id),
                   'custom_equipment_id', ce.id,
                   'equipment_name', COALESCE(e.equipment_name, ce.equipment_name),
                   'equipment_type', COALESCE(e.equipment_type, ce.equipment_type),
                   'equipment_category', COALESCE(e.equipment_category, ce.equipment_category),
                   'cost', fe.purchase_cost,
                   'weapon_profiles', CASE 
                       WHEN COALESCE(e.equipment_type, ce.equipment_type) = 'weapon' AND e.id IS NOT NULL THEN 
                           COALESCE((SELECT wpg.profiles FROM weapon_profiles_grouped wpg WHERE wpg.equipment_id = e.id AND wpg.fe_id = fe.id), '[]'::json)
                       WHEN COALESCE(e.equipment_type, ce.equipment_type) = 'weapon' AND ce.id IS NOT NULL THEN 
                           COALESCE((SELECT cwpg.profiles FROM custom_weapon_profiles_grouped cwpg WHERE cwpg.equipment_id = ce.id AND cwpg.fe_id = fe.id), '[]'::json)
                       ELSE NULL 
                   END
               )
           ) as equipment
       FROM fighter_equipment fe
       LEFT JOIN equipment e ON e.id = fe.equipment_id
       LEFT JOIN custom_equipment ce ON ce.id = fe.custom_equipment_id
       WHERE fe.fighter_id IN (SELECT f_id FROM fighter_ids)
       AND (fe.equipment_id IS NOT NULL OR fe.custom_equipment_id IS NOT NULL)
       GROUP BY fe.fighter_id
   ),

   vehicle_equipment_costs AS (
       SELECT 
           ve.vehicle_id,
           COALESCE(SUM(ve.purchase_cost), 0)::numeric as total_equipment_cost
       FROM fighter_equipment ve
       WHERE ve.vehicle_id IS NOT NULL
       AND ve.vehicle_id IN (
           SELECT v.id 
           FROM vehicles v 
           WHERE v.gang_id = p_gang_id 
              OR v.fighter_id IN (SELECT f_id FROM fighter_ids)
       )
       GROUP BY ve.vehicle_id
   ),
   vehicle_equipment_details AS (
       SELECT 
           ve.vehicle_id,
           json_agg(
               json_build_object(
                   'vehicle_weapon_id', ve.id,
                   'equipment_id', COALESCE(e.id, ce.id),
                   'custom_equipment_id', ce.id,
                   'equipment_name', COALESCE(e.equipment_name, ce.equipment_name),
                   'equipment_type', COALESCE(e.equipment_type, ce.equipment_type),
                   'equipment_category', COALESCE(e.equipment_category, ce.equipment_category),
                   'cost', ve.purchase_cost,
                   'weapon_profiles', CASE 
                       WHEN COALESCE(e.equipment_type, ce.equipment_type) = 'weapon' AND e.id IS NOT NULL THEN 
                           COALESCE((SELECT wpg.profiles FROM weapon_profiles_grouped wpg WHERE wpg.equipment_id = e.id AND wpg.fe_id = ve.id), '[]'::json)
                       WHEN COALESCE(e.equipment_type, ce.equipment_type) = 'weapon' AND ce.id IS NOT NULL THEN 
                           COALESCE((SELECT cwpg.profiles FROM custom_weapon_profiles_grouped cwpg WHERE cwpg.equipment_id = ce.id AND cwpg.fe_id = ve.id), '[]'::json)
                       ELSE NULL 
                   END

               )
           ) as equipment
       FROM fighter_equipment ve
       LEFT JOIN equipment e ON e.id = ve.equipment_id
       LEFT JOIN custom_equipment ce ON ce.id = ve.custom_equipment_id
       WHERE ve.vehicle_id IS NOT NULL
       AND ve.vehicle_id IN (
           SELECT v.id 
           FROM vehicles v 
           WHERE v.gang_id = p_gang_id 
              OR v.fighter_id IN (SELECT f_id FROM fighter_ids)
       )
       AND (ve.equipment_id IS NOT NULL OR ve.custom_equipment_id IS NOT NULL)
       GROUP BY ve.vehicle_id
   ),
   gang_vehicles AS (
       SELECT 
           v.id,
           v.fighter_id,
           v.gang_id,
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
           v.vehicle_name,
           v.cost,
           v.vehicle_type_id,
           v.vehicle_type,
           COALESCE(vep.equipment, '[]'::json) as equipment,
           COALESCE(vec.total_equipment_cost, 0)::numeric as total_equipment_cost,
           COALESCE(ve.effects, '{}'::json) as effects,
           COALESCE(vec2.total_effect_credits, 0)::numeric as total_effect_credits
       FROM vehicles v
       LEFT JOIN vehicle_equipment_costs vec ON vec.vehicle_id = v.id
       LEFT JOIN vehicle_equipment_details vep ON vep.vehicle_id = v.id
       LEFT JOIN vehicle_effects ve ON ve.vehicle_id = v.id
       LEFT JOIN vehicle_effects_credits vec2 ON vec2.vehicle_id = v.id
       WHERE (v.fighter_id IN (SELECT f_id FROM fighter_ids) OR v.gang_id = p_gang_id)
   ),
   gang_owned_vehicles AS (
       SELECT 
           gv.id,
           gv.gang_id,
           gv.created_at,
           gv.vehicle_type_id,
           gv.vehicle_type,
           gv.cost,
           gv.vehicle_name,
           vt.movement,
           vt.front,
           vt.side,
           vt.rear,
           vt.hull_points,
           vt.handling,
           vt.save,
           vt.body_slots,
           vt.drive_slots,
           vt.engine_slots,
           gv.body_slots_occupied,
           gv.drive_slots_occupied,
           gv.engine_slots_occupied,
           vt.special_rules,
           gv.equipment,
           gv.total_equipment_cost,
           gv.effects,
           gv.total_effect_credits
       FROM gang_vehicles gv
       JOIN vehicle_types vt ON vt.id = gv.vehicle_type_id
       WHERE gv.gang_id = p_gang_id AND gv.fighter_id IS NULL
   ),
   fighter_vehicle_costs AS (
       SELECT
           gv.fighter_id,
           (SUM(gv.cost) + SUM(COALESCE(gv.total_equipment_cost, 0)) + SUM(COALESCE(gv.total_effect_credits, 0)))::numeric as total_vehicle_cost
       FROM gang_vehicles gv
       WHERE gv.fighter_id IN (SELECT f_id FROM fighter_ids)
       GROUP BY gv.fighter_id
   ),
   fighter_vehicles_json AS (
       SELECT
           gv.fighter_id,
           json_agg(
               json_build_object(
                   'id', gv.id,
                   'created_at', gv.created_at,
                   'vehicle_type_id', gv.vehicle_type_id,
                   'vehicle_type', gv.vehicle_type,
                   'cost', gv.cost,
                   'vehicle_name', gv.vehicle_name,
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
                   'equipment', gv.equipment,
                   'total_equipment_cost', gv.total_equipment_cost,
                   'effects', gv.effects,
                   'total_effect_credits', gv.total_effect_credits
               )
           ) as vehicles
       FROM gang_vehicles gv
       WHERE gv.fighter_id IN (SELECT f_id FROM fighter_ids)
       GROUP BY gv.fighter_id
   ),
   complete_fighters AS (
       SELECT 
           f.f_id AS id,
           f.fighter_name,
           f.label,
           f.fighter_type,
           f.fighter_type_id,
           f.fighter_subtypes,
           json_build_object(
             'fighter_specialisation', fspec.specialisation_name,
             'fighter_specialisation_id', fspec.id
           ) AS fighter_specialisation,
           f.fighter_variant,
           ft.alliance_crew_name,
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
           f.recovery,
           f.free_skill,
           f.cost_adjustment,
           f.image_url,
           (COALESCE(f.base_credits, 0) + 
            COALESCE(fec.total_equipment_cost, 0) + 
            COALESCE(fsk.total_skills_credits, 0) +
            COALESCE(fef.total_effect_credits, 0) +
            COALESCE(f.cost_adjustment, 0) +
            COALESCE(fvc.total_vehicle_cost, 0))::numeric as total_credits,
           COALESCE(fed.equipment, '[]'::json) as equipment,
           COALESCE(fe.effects, '{}'::json) as effects,
           COALESCE(fsk.skills, '{}'::json) as skills,
           COALESCE(fvj.vehicles, '[]'::json) as vehicles
       FROM gang_fighters f
       LEFT JOIN fighter_specialisations fspec ON fspec.id = f.fighter_specialisation_id
       LEFT JOIN fighter_types ft ON ft.id = f.fighter_type_id
       LEFT JOIN fighter_equipment_costs fec ON fec.fighter_id = f.f_id
       LEFT JOIN fighter_equipment_details fed ON fed.fighter_id = f.f_id
       LEFT JOIN fighter_skills fsk ON fsk.fighter_id = f.f_id
       LEFT JOIN fighter_effects fe ON fe.fighter_id = f.f_id
       LEFT JOIN fighter_effects_credits fef ON fef.fighter_id = f.f_id
       LEFT JOIN fighter_vehicle_costs fvc ON fvc.fighter_id = f.f_id
       LEFT JOIN fighter_vehicles_json fvj ON fvj.fighter_id = f.f_id
   ),
   gang_totals AS (
       SELECT COALESCE(SUM(total_credits), 0)::numeric as total_gang_rating
       FROM complete_fighters
       WHERE killed = FALSE AND retired = FALSE AND enslaved = FALSE
   ),
   gang_stash AS (
       SELECT 
           gs.gang_id,
           json_agg(
               json_build_object(
                   'id', gs.id,
                   'created_at', gs.created_at,
                   'equipment_id', gs.equipment_id,
                   'custom_equipment_id', gs.custom_equipment_id,
                   'equipment_name', COALESCE(e.equipment_name, ce.equipment_name),
                   'equipment_type', COALESCE(e.equipment_type, ce.equipment_type),
                   'equipment_category', COALESCE(e.equipment_category, ce.equipment_category),
                   'cost', gs.cost,
                   'type', 'equipment'
               )
           ) as stash_items
       FROM gang_stash gs
       LEFT JOIN equipment e ON e.id = gs.equipment_id
       LEFT JOIN custom_equipment ce ON ce.id = gs.custom_equipment_id
       WHERE gs.gang_id = p_gang_id
       AND (gs.equipment_id IS NOT NULL OR gs.custom_equipment_id IS NOT NULL)
       GROUP BY gs.gang_id
   ),
   campaign_territories AS (
       SELECT 
           ct.campaign_id,
           json_agg(
               json_build_object(
                   'id', ct.id,
                   'created_at', ct.created_at,
                   'territory_id', ct.territory_id,
                   'territory_name', ct.territory_name,
                   'ruined', ct.ruined
               )
           ) as territories
       FROM campaign_territories ct
       WHERE ct.gang_id = p_gang_id
       GROUP BY ct.campaign_id
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
                   'invited_by', cg.invited_by,
                   'territories', COALESCE(
                       (SELECT ct.territories 
                        FROM campaign_territories ct 
                        WHERE ct.campaign_id = c.id),
                       '[]'::json
                   )
               )
           ) as campaigns
       FROM campaign_gangs cg
       JOIN campaigns c ON c.id = cg.campaign_id
       WHERE cg.gang_id = p_gang_id
       GROUP BY cg.gang_id
   ),
   gang_subtype_info AS (
       SELECT 
           COALESCE(
               json_agg(
                   json_build_object(
                       'id', gst.id,
                       'subtype', gst.subtype
                   )
                   ORDER BY gst.subtype
               ),
               '[]'::json
           ) as subtype_info
       FROM gang_subtype_types gst
       JOIN gangs g ON g.id = p_gang_id
       WHERE gst.id::text IN (
           SELECT jsonb_array_elements_text(g.gang_subtypes)
       )
   ),
   all_fighters_json AS (
       SELECT json_agg(
           json_build_object(
               'id', cf.id,
               'fighter_name', cf.fighter_name,
               'label', cf.label,
               'fighter_type', cf.fighter_type,
               'fighter_subtypes', cf.fighter_subtypes,
               'fighter_specialisation', cf.fighter_specialisation,
               'fighter_variant', cf.fighter_variant,
               'alliance_crew_name', cf.alliance_crew_name,
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
               'effects', cf.effects,
               'skills', cf.skills,
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
               'recovery', cf.recovery,
               'free_skill', cf.free_skill,
               'image_url', cf.image_url
           )
       ) as fighters_json
       FROM complete_fighters cf
   ),
   gang_owned_vehicles_json AS (
       SELECT json_agg(
           json_build_object(
               'id', v.id,
               'created_at', v.created_at,
               'vehicle_type_id', v.vehicle_type_id,
               'vehicle_type', v.vehicle_type,
               'cost', v.cost,
               'vehicle_name', v.vehicle_name,
               'movement', v.movement,
               'front', v.front,
               'side', v.side,
               'rear', v.rear,
               'hull_points', v.hull_points,
               'handling', v.handling,
               'save', v.save,
               'body_slots', v.body_slots,
               'drive_slots', v.drive_slots,
               'engine_slots', v.engine_slots,
               'body_slots_occupied', v.body_slots_occupied,
               'drive_slots_occupied', v.drive_slots_occupied,
               'engine_slots_occupied', v.engine_slots_occupied,
               'special_rules', v.special_rules,
               'equipment', v.equipment,
               'total_equipment_cost', v.total_equipment_cost,
               'effects', v.effects,
               'total_effect_credits', v.total_effect_credits
           )
       ) as vehicles_json
       FROM gang_owned_vehicles v
       WHERE v.gang_id = p_gang_id
   )
   SELECT 
       g.id,
       g.name,
       g.gang_type,
       g.gang_type_id,
       gt.image_url as gang_type_image_url,
       g.gang_colour,
       g.credits,
       g.reputation,
       (SELECT total_gang_rating FROM gang_totals) as rating,
       g.alignment,
       g.positioning,
       g.note,
       COALESCE((SELECT gs.stash_items FROM gang_stash gs WHERE gs.gang_id = g.id), '[]'::json) as stash,
       g.created_at,
       g.last_updated,
       COALESCE((SELECT afj.fighters_json FROM all_fighters_json afj), '[]'::json) as fighters,
       COALESCE((SELECT gc.campaigns FROM gang_campaigns gc WHERE gc.gang_id = g.id), '[]'::json) as campaigns,
       COALESCE((SELECT govj.vehicles_json FROM gang_owned_vehicles_json govj), '[]'::json) as vehicles,
       g.alliance_id,
       a.alliance_name,
       a.alliance_type,
       (SELECT subtype_info FROM gang_subtype_info) as gang_subtypes,
       ed.slug AS edition_slug
   FROM gangs g
   LEFT JOIN gang_types gt ON gt.gang_type_id = g.gang_type_id
   LEFT JOIN custom_gang_types cgt ON cgt.id = g.custom_gang_type_id
   LEFT JOIN editions ed ON ed.id = COALESCE(gt.edition_id, cgt.edition_id)
   LEFT JOIN alliances a ON a.id = g.alliance_id
   WHERE g.id = p_gang_id;
END;
$function$;

-- get_equipment_detailed_data
CREATE OR REPLACE FUNCTION public.get_equipment_detailed_data(
    gang_type_id uuid DEFAULT NULL,          -- $1
    equipment_category text DEFAULT NULL,     -- $2
    fighter_type_id uuid DEFAULT NULL,        -- $3
    fighter_type_equipment boolean DEFAULT NULL, -- $4
    equipment_tradingpost boolean DEFAULT NULL,  -- $5
    fighter_id uuid DEFAULT NULL,             -- $6
    only_equipment_id uuid DEFAULT NULL,      -- $7
    gang_id uuid DEFAULT NULL,               -- $8
    campaign_trading_post_type_ids uuid[] DEFAULT NULL, -- $9
    campaign_custom_trading_post_ids uuid[] DEFAULT NULL -- $10
)
RETURNS TABLE (
    id uuid,
    equipment_name text,
    availability text,
    base_cost numeric,
    adjusted_cost numeric,
    trade_points text,
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
    cost_resource_name text,
    cost_resource_amount numeric,
    cost_type_resource_id uuid,
    cost_campaign_resource_id uuid,
    banned boolean
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
            g.gang_subtypes,
            g.alignment,
            g.custom_gang_type_id,
            cg.campaign_type_allegiance_id,
            fgl.fighter_type_id AS legacy_ft_id,
            ga.fighter_type_id  AS affiliation_ft_id,
            -- Empty for gang and vehicle calls, so a subtype rule matches nothing
            COALESCE(f.fighter_subtypes, ft_sub.fighter_subtypes, cft_sub.fighter_subtypes, '[]'::jsonb) AS fighter_subtypes,
            COALESCE(gt.edition_id, cgt.edition_id) AS edition_id
        FROM (SELECT 1) AS _dummy
        LEFT JOIN gangs g ON g.id = $8
        LEFT JOIN gang_types gt ON gt.gang_type_id = g.gang_type_id
        LEFT JOIN custom_gang_types cgt ON cgt.id = g.custom_gang_type_id
        LEFT JOIN fighter_types ft_sub ON ft_sub.id = $3
        LEFT JOIN custom_fighter_types cft_sub ON cft_sub.id = $3
        LEFT JOIN LATERAL (
            SELECT cg2.campaign_type_allegiance_id
            FROM campaign_gangs cg2
            WHERE cg2.gang_id = $8
            LIMIT 1
        ) cg ON true
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
          AND (
              $9 IS NULL
              OR gt.trading_post_type_id = ANY($9)
          )
    ),

    -- =======================================================================
    -- 3. TRADING POST ACCESS — computed once per equipment_id
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
        WHERE $9 IS NOT NULL
          AND array_length($9, 1) > 0
          AND tpe.trading_post_type_id = ANY($9)

        UNION

        -- Custom trading post equipment (official equipment only)
        SELECT ctpe.equipment_id, ctp.custom_trading_post_name
        FROM custom_trading_post_equipment ctpe
        JOIN custom_trading_posts ctp ON ctp.id = ctpe.custom_trading_post_id
        WHERE ctpe.equipment_id IS NOT NULL
          AND $10 IS NOT NULL AND array_length($10, 1) > 0
          AND ctpe.custom_trading_post_id = ANY($10)
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
        -- Gang-exclusive allow-list: an item flagged "available only to this gang"
        -- (an exclusive gang-type availability row) is hidden from the Trading Post
        -- of gangs that are not on its allow-list. Scoped to Trading Post access
        -- only, so the fighter's-list path is unaffected.
        WHERE NOT EXISTS (
                  SELECT 1 FROM equipment_availability xa
                  WHERE xa.equipment_id = ta.equipment_id
                    AND xa.exclusive AND xa.gang_type_id IS NOT NULL
              )
           OR EXISTS (
                  SELECT 1 FROM equipment_availability xa
                  WHERE xa.equipment_id = ta.equipment_id
                    AND xa.exclusive AND xa.gang_type_id = $1
              )
        GROUP BY ta.equipment_id
    ),

    -- =======================================================================
    -- 4. EQUIPMENT IDS WITH ORIGIN-SPECIFIC DISCOUNTS (for branching logic)
    -- =======================================================================
    origin_discount_equip AS (
        SELECT DISTINCT ed.equipment_id
        FROM equipment_discounts ed
        CROSS JOIN gang_data gd
        WHERE gd.gang_origin_id IS NOT NULL
          AND ed.gang_origin_id = gd.gang_origin_id
    ),

    -- =======================================================================
    -- 5. BEST ADJUSTED COST — computed once per equipment_id
    --    Replaces 2 correlated subqueries for adjusted_cost.
    -- =======================================================================
    best_adjusted_cost AS (
        SELECT
            ed.equipment_id,
            MIN(ed.adjusted_cost::numeric)
                FILTER (WHERE ed.adjusted_cost IS NOT NULL) AS best_adjusted_cost,
            -- Prefer any non-null trade_points override in the same discount scope.
            -- Cheapest numerically ("E"/non-numeric → 0); text ASC as stable tie-break.
            (ARRAY_AGG(
                ed.trade_points
                ORDER BY
                    CASE
                        WHEN upper(btrim(ed.trade_points)) = 'E' OR btrim(ed.trade_points) = '' THEN 0::numeric
                        WHEN ed.trade_points ~ '^[0-9]+$' THEN ed.trade_points::numeric
                        ELSE 0::numeric
                    END ASC,
                    ed.trade_points ASC
            ) FILTER (WHERE ed.trade_points IS NOT NULL))[1] AS best_trade_points
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
    -- 6. CUSTOM TP OVERRIDES — per official equipment_id
    --    Resolves cost/availability overrides and adjusted cost from active
    --    custom TPs. Custom TP values take precedence over official values.
    --    Tiebreak: lowest sort_order, then earliest created_at.
    -- =======================================================================
    custom_tp_override AS (
        SELECT
            ctpe.equipment_id,
            MIN(ctpe.cost_override) FILTER (WHERE ctpe.cost_override IS NOT NULL) AS cost_override,
            (array_agg(ctpe.cost_type_resource_id ORDER BY ctpe.cost_override NULLS LAST, COALESCE(ctpe.sort_order, 999), ctpe.created_at) FILTER (WHERE ctpe.cost_type_resource_id IS NOT NULL))[1] AS cost_type_resource_id,
            (array_agg(ctpe.cost_campaign_resource_id ORDER BY ctpe.cost_override NULLS LAST, COALESCE(ctpe.sort_order, 999), ctpe.created_at) FILTER (WHERE ctpe.cost_campaign_resource_id IS NOT NULL))[1] AS cost_campaign_resource_id,
            (array_agg(ctpe.cost_resource_amount ORDER BY ctpe.cost_override NULLS LAST, COALESCE(ctpe.sort_order, 999), ctpe.created_at) FILTER (WHERE ctpe.cost_resource_amount IS NOT NULL))[1] AS cost_resource_amount,
            (array_agg(ctpe.cost_reputation ORDER BY ctpe.cost_override NULLS LAST, COALESCE(ctpe.sort_order, 999), ctpe.created_at) FILTER (WHERE ctpe.cost_reputation))[1] AS cost_reputation,
            (array_agg(COALESCE(a.availability, ctpe.availability_override) ORDER BY ctpe.cost_override NULLS LAST, COALESCE(ctpe.sort_order, 999), ctpe.created_at) FILTER (WHERE COALESCE(a.availability, ctpe.availability_override) IS NOT NULL))[1] AS availability_override,
            MIN(p.adjusted_cost) FILTER (WHERE p.adjusted_cost IS NOT NULL) AS adjusted_cost,
            bool_or(ctpe.banned) AS banned
        FROM custom_trading_post_equipment ctpe
        CROSS JOIN gang_data gd
        LEFT JOIN custom_trading_post_pricing p
            ON p.custom_trading_post_equipment_id = ctpe.id
            AND (p.gang_type_id IS NULL OR p.gang_type_id = $1)
            AND (p.custom_gang_type_id IS NULL OR p.custom_gang_type_id = gd.custom_gang_type_id)
            AND (p.gang_origin_id IS NULL OR p.gang_origin_id = gd.gang_origin_id)
            AND (p.fighter_type_id IS NULL)
        LEFT JOIN custom_trading_post_availability a
            ON a.custom_trading_post_equipment_id = ctpe.id
            AND (a.gang_type_id IS NULL OR a.gang_type_id = $1)
            AND (a.custom_gang_type_id IS NULL OR a.custom_gang_type_id = gd.custom_gang_type_id)
            AND (a.gang_origin_id IS NULL OR a.gang_origin_id = gd.gang_origin_id)
            AND (a.gang_subtype_id IS NULL OR gd.gang_subtypes ? a.gang_subtype_id::text)
            AND (a.campaign_type_allegiance_id IS NULL OR a.campaign_type_allegiance_id = gd.campaign_type_allegiance_id)
            AND (a.alignment IS NULL OR a.alignment = gd.alignment)
        WHERE ctpe.equipment_id IS NOT NULL
          AND $10 IS NOT NULL AND array_length($10, 1) > 0
          AND ctpe.custom_trading_post_id = ANY($10)
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

        CASE
            WHEN cto.cost_type_resource_id IS NOT NULL
              OR cto.cost_campaign_resource_id IS NOT NULL
              OR cto.cost_reputation THEN e.cost::numeric
            ELSE COALESCE(cto.cost_override, e.cost::numeric)
        END AS base_cost,

        -- Adjusted cost: custom TP override wins, then official discounts, then base
        -- When paying with a resource, use original equipment cost for rating
        CASE
            WHEN cto.cost_type_resource_id IS NOT NULL
              OR cto.cost_campaign_resource_id IS NOT NULL
              OR cto.cost_reputation THEN e.cost::numeric
            WHEN cto.adjusted_cost IS NOT NULL THEN cto.adjusted_cost
            WHEN cto.cost_override IS NOT NULL THEN cto.cost_override
            WHEN $5 = true THEN e.cost::numeric
            ELSE COALESCE(bac.best_adjusted_cost, e.cost::numeric)
        END AS adjusted_cost,

        -- Trade Points: a Trading Post price, so the fighter's-list-only request pays none
        CASE
            WHEN $4 = true AND $5 IS NULL THEN '0'
            ELSE COALESCE(bac.best_trade_points, e.trade_points)
        END AS trade_points,

        e.equipment_category,
        e.equipment_type,
        e.created_at,

        -- Is in fighter's equipment list? (computed once in ftl_flag below)
        ftl_flag.is_fighter_list AS fighter_type_equipment,

        -- Has trading post access? (tp_summary is gang-exclusivity-aware)
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
                    'lethality', wp.lethality,
                    'ammo', wp.ammo,
                    'traits', wp.traits,
                    'sort_order', wp.sort_order
                ) ORDER BY COALESCE(wp.sort_order, 999), wp.profile_name
            ) FROM weapon_profiles wp WHERE wp.equipment_id = e.id),
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

        CASE WHEN cto.cost_reputation THEN 'Reputation'
             ELSE COALESCE(ctr_res.resource_name, cr_res.resource_name)
        END AS cost_resource_name,
        CASE WHEN cto.cost_type_resource_id IS NOT NULL
               OR cto.cost_campaign_resource_id IS NOT NULL
               OR cto.cost_reputation
             THEN cto.cost_resource_amount
        END AS cost_resource_amount,
        cto.cost_type_resource_id,
        cto.cost_campaign_resource_id,

        COALESCE(cto.banned, false) AS banned

    FROM equipment e
    CROSS JOIN gang_data gd

    -- Equipment availability joins (unchanged)
    LEFT JOIN equipment_availability ea
        ON e.id = ea.equipment_id AND ea.gang_type_id = $1
    LEFT JOIN equipment_availability ea_var
        ON e.id = ea_var.equipment_id
        AND ea_var.gang_subtype_id IS NOT NULL
        AND gd.gang_subtypes ? ea_var.gang_subtype_id::text
    LEFT JOIN equipment_availability ea_origin
        ON e.id = ea_origin.equipment_id
        AND ea_origin.gang_origin_id IS NOT NULL
        AND ea_origin.gang_origin_id = gd.gang_origin_id

    -- Fighter type equipment
    LEFT JOIN fighter_type_equipment fte
        ON e.id = fte.equipment_id
        AND (fte.fighter_type_id = $3
             OR fte.vehicle_type_id = $3
             OR (gd.legacy_ft_id IS NOT NULL
                 AND (fte.fighter_type_id = gd.legacy_ft_id OR fte.vehicle_type_id = gd.legacy_ft_id)
                 AND $4 = true)
             OR (gd.affiliation_ft_id IS NOT NULL
                 AND (fte.fighter_type_id = gd.affiliation_ft_id OR fte.vehicle_type_id = gd.affiliation_ft_id))
             -- A subtype rule spanning every gang names no fighter of its own.
             -- fighter_subtype must be set, or an all-NULL row matches everything.
             OR (fte.fighter_type_id IS NULL
                 AND fte.vehicle_type_id IS NULL
                 AND fte.custom_fighter_type_id IS NULL
                 AND fte.fighter_subtype IS NOT NULL))
        AND (fte.gang_origin_id IS NULL OR fte.gang_origin_id = gd.gang_origin_id)
        AND (fte.gang_subtype_id IS NULL OR gd.gang_subtypes ? fte.gang_subtype_id::text)
        AND (fte.gang_type_id IS NULL OR fte.gang_type_id = $1)
        AND (fte.fighter_subtype IS NULL OR gd.fighter_subtypes ? fte.fighter_subtype)
        -- Grants only: this join sets is_fighter_list, so a deny matching here would grant.
        AND NOT fte.excluded

    -- Is this system equipment on the current custom fighter type's equipment list?
    -- ($3 is a custom_fighter_types.id when the fighter is a custom fighter.)
    LEFT JOIN LATERAL (
        SELECT true AS is_ftl
        FROM custom_fighter_type_equipment cfte_sys
        WHERE cfte_sys.equipment_id = e.id
          AND cfte_sys.custom_fighter_type_id = $3
        LIMIT 1
    ) cftl ON true

    -- Single source of truth for "is this on the fighter's equipment list?"
    -- Referenced by the output column and the fighter-list filter branches below,
    -- so the predicate lives in exactly one place.
    LEFT JOIN LATERAL (
        SELECT (
            -- Any matched row counts, including a gang-wide subtype rule,
            -- which has neither id
            fte.id IS NOT NULL
            OR ea_var.id IS NOT NULL
            OR ea_origin.id IS NOT NULL
            OR cftl.is_ftl IS NOT NULL
        )
        -- ...unless a deny matches. Applied to the whole flag, not just the fighter_type_equipment
        -- branch, so it also overrides a gang-wide equipment_availability grant as its column
        -- comment promises. No fighter identity required: a row naming only a gang scope
        -- withholds the item from every fighter in that gang.
        AND NOT EXISTS (
            SELECT 1
            FROM fighter_type_equipment d
            WHERE d.equipment_id = e.id
              AND d.excluded
              -- Vehicle rows belong to the vehicle admin, which has no deny UI, so a deny
              -- cannot cancel a grant matched through fte.vehicle_type_id.
              AND d.vehicle_type_id IS NULL
              -- Same identity branches as the grant join above: a fighter reaching an equipment
              -- list through a legacy or affiliation type must be deniable through it too.
              AND (
                  d.fighter_type_id IS NULL
                  OR d.fighter_type_id = $3
                  OR (gd.legacy_ft_id IS NOT NULL AND d.fighter_type_id = gd.legacy_ft_id AND $4 = true)
                  OR (gd.affiliation_ft_id IS NOT NULL AND d.fighter_type_id = gd.affiliation_ft_id)
              )
              AND (d.gang_origin_id  IS NULL OR d.gang_origin_id = gd.gang_origin_id)
              AND (d.gang_subtype_id IS NULL OR gd.gang_subtypes ? d.gang_subtype_id::text)
              AND (d.gang_type_id    IS NULL OR d.gang_type_id = $1)
              AND (d.fighter_subtype IS NULL OR gd.fighter_subtypes ? d.fighter_subtype)
        ) AS is_fighter_list
    ) ftl_flag ON true

    -- Pre-computed CTEs via simple LEFT JOINs
    LEFT JOIN best_adjusted_cost bac ON bac.equipment_id = e.id
    LEFT JOIN tp_summary tp ON tp.equipment_id = e.id
    LEFT JOIN custom_tp_override cto ON cto.equipment_id = e.id
    LEFT JOIN campaign_type_resources ctr_res ON ctr_res.id = cto.cost_type_resource_id
    LEFT JOIN campaign_resources cr_res ON cr_res.id = cto.cost_campaign_resource_id

    WHERE
        -- Early filters (equipment category + specific ID)
        ($2 IS NULL OR trim(both from e.equipment_category) = trim(both from $2))
        AND ($7 IS NULL OR e.id = $7)
        -- Core equipment gating
        AND (
            COALESCE(e.core_equipment, false) = false
            OR (e.core_equipment = true AND (
                fte.fighter_type_id IS NOT NULL
                -- A matched gang-wide subtype rule carries no fighter id of its
                -- own, so it needs the same allowance is_fighter_list gives it
                OR (fte.id IS NOT NULL AND fte.fighter_type_id IS NULL AND fte.vehicle_type_id IS NULL)
                OR cftl.is_ftl IS NOT NULL
                OR $3 IS NULL
            ))
        )
        -- Fighter list / trading post filter logic
        AND (
            -- No filter
            ($4 IS NULL AND $5 IS NULL)
            OR
            -- Both filters: items in EITHER fighter's list OR trading post
            ($4 IS NOT NULL AND $5 IS NOT NULL AND (
                ftl_flag.is_fighter_list = $4
                OR
                COALESCE(tp.has_access, false) = $5
            ))
            OR
            -- Fighter's list only
            ($4 IS NOT NULL AND $5 IS NULL AND ftl_flag.is_fighter_list = $4)
            OR
            -- Trading post only
            ($4 IS NULL AND $5 IS NOT NULL AND COALESCE(tp.has_access, false) = $5)
        )
        -- Unrestricted: only equipment from the gang's edition
        AND (
            NOT ($4 IS NULL AND $5 IS NULL)
            OR gd.edition_id IS NULL
            OR e.edition_id = gd.edition_id
        )

    UNION ALL

    -- =======================================================================
    -- CUSTOM EQUIPMENT
    -- =======================================================================
    SELECT
        ce.id,
        ce.equipment_name,
        COALESCE(custom_tp.availability_override, ce.availability) AS availability,
        CASE
            WHEN custom_tp.cost_type_resource_id IS NOT NULL
              OR custom_tp.cost_campaign_resource_id IS NOT NULL
              OR custom_tp.cost_reputation THEN ce.cost::numeric
            ELSE COALESCE(custom_tp.cost_override, ce.cost::numeric)
        END AS base_cost,
        CASE
            WHEN custom_tp.cost_type_resource_id IS NOT NULL
              OR custom_tp.cost_campaign_resource_id IS NOT NULL
              OR custom_tp.cost_reputation THEN ce.cost::numeric
            ELSE COALESCE(custom_tp.adjusted_cost, custom_tp.cost_override, ce.cost::numeric)
        END AS adjusted_cost,
        CASE
            WHEN $4 = true AND $5 IS NULL THEN '0'
            ELSE ce.trade_points
        END AS trade_points,
        ce.equipment_category,
        ce.equipment_type,
        ce.created_at,
        -- Custom equipment lives in the Trading Post; it is only on a fighter's
        -- list when assigned to that fighter's custom fighter type ($3).
        COALESCE(ftl.is_ftl, false) AS fighter_type_equipment,
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
                    'lethality', cwp.lethality,
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
        CASE WHEN custom_tp.cost_reputation THEN 'Reputation'
             ELSE COALESCE(ctr_res2.resource_name, cr_res2.resource_name)
        END AS cost_resource_name,
        CASE WHEN custom_tp.cost_type_resource_id IS NOT NULL
               OR custom_tp.cost_campaign_resource_id IS NOT NULL
               OR custom_tp.cost_reputation
             THEN custom_tp.cost_resource_amount
        END AS cost_resource_amount,
        custom_tp.cost_type_resource_id,
        custom_tp.cost_campaign_resource_id,
        COALESCE(custom_tp.banned, false) AS banned
    FROM custom_equipment ce
    CROSS JOIN gang_data gd
    LEFT JOIN (
        SELECT cs.custom_equipment_id
        FROM custom_shared cs
        JOIN campaign_gangs cg ON cg.campaign_id = cs.campaign_id
        WHERE cg.gang_id = $8
    ) shared ON shared.custom_equipment_id = ce.id
    LEFT JOIN (
        SELECT
            ctpe.custom_equipment_id,
            MIN(ctpe.cost_override) FILTER (WHERE ctpe.cost_override IS NOT NULL) AS cost_override,
            (array_agg(ctpe.cost_type_resource_id ORDER BY ctpe.cost_override NULLS LAST, COALESCE(ctpe.sort_order, 999), ctpe.created_at) FILTER (WHERE ctpe.cost_type_resource_id IS NOT NULL))[1] AS cost_type_resource_id,
            (array_agg(ctpe.cost_campaign_resource_id ORDER BY ctpe.cost_override NULLS LAST, COALESCE(ctpe.sort_order, 999), ctpe.created_at) FILTER (WHERE ctpe.cost_campaign_resource_id IS NOT NULL))[1] AS cost_campaign_resource_id,
            (array_agg(ctpe.cost_resource_amount ORDER BY ctpe.cost_override NULLS LAST, COALESCE(ctpe.sort_order, 999), ctpe.created_at) FILTER (WHERE ctpe.cost_resource_amount IS NOT NULL))[1] AS cost_resource_amount,
            (array_agg(ctpe.cost_reputation ORDER BY ctpe.cost_override NULLS LAST, COALESCE(ctpe.sort_order, 999), ctpe.created_at) FILTER (WHERE ctpe.cost_reputation))[1] AS cost_reputation,
            (array_agg(COALESCE(a.availability, ctpe.availability_override) ORDER BY ctpe.cost_override NULLS LAST, COALESCE(ctpe.sort_order, 999), ctpe.created_at) FILTER (WHERE COALESCE(a.availability, ctpe.availability_override) IS NOT NULL))[1] AS availability_override,
            MIN(p.adjusted_cost) FILTER (WHERE p.adjusted_cost IS NOT NULL) AS adjusted_cost,
            COALESCE(
                array_agg(DISTINCT ctp.custom_trading_post_name) FILTER (WHERE ctp.custom_trading_post_name IS NOT NULL),
                '{}'::text[]
            ) AS tp_names,
            bool_or(ctpe.banned) AS banned
        FROM custom_trading_post_equipment ctpe
        JOIN custom_trading_posts ctp ON ctp.id = ctpe.custom_trading_post_id
        CROSS JOIN gang_data gd
        LEFT JOIN custom_trading_post_pricing p
            ON p.custom_trading_post_equipment_id = ctpe.id
            AND (p.gang_type_id IS NULL OR p.gang_type_id = $1)
            AND (p.custom_gang_type_id IS NULL OR p.custom_gang_type_id = gd.custom_gang_type_id)
            AND (p.gang_origin_id IS NULL OR p.gang_origin_id = gd.gang_origin_id)
            AND (p.fighter_type_id IS NULL)
        LEFT JOIN custom_trading_post_availability a
            ON a.custom_trading_post_equipment_id = ctpe.id
            AND (a.gang_type_id IS NULL OR a.gang_type_id = $1)
            AND (a.custom_gang_type_id IS NULL OR a.custom_gang_type_id = gd.custom_gang_type_id)
            AND (a.gang_origin_id IS NULL OR a.gang_origin_id = gd.gang_origin_id)
            AND (a.gang_subtype_id IS NULL OR gd.gang_subtypes ? a.gang_subtype_id::text)
            AND (a.campaign_type_allegiance_id IS NULL OR a.campaign_type_allegiance_id = gd.campaign_type_allegiance_id)
            AND (a.alignment IS NULL OR a.alignment = gd.alignment)
        WHERE ctpe.custom_equipment_id IS NOT NULL
          AND $10 IS NOT NULL AND array_length($10, 1) > 0
          AND ctpe.custom_trading_post_id = ANY($10)
        GROUP BY ctpe.custom_equipment_id
    ) custom_tp ON custom_tp.custom_equipment_id = ce.id
    LEFT JOIN campaign_type_resources ctr_res2 ON ctr_res2.id = custom_tp.cost_type_resource_id
    LEFT JOIN campaign_resources cr_res2 ON cr_res2.id = custom_tp.cost_campaign_resource_id
    -- Is this custom equipment on the current custom fighter type's equipment list?
    -- ($3 is a custom_fighter_types.id when the fighter is a custom fighter.)
    LEFT JOIN LATERAL (
        SELECT true AS is_ftl
        FROM custom_fighter_type_equipment cfte
        WHERE cfte.custom_equipment_id = ce.id
          AND cfte.custom_fighter_type_id = $3
        LIMIT 1
    ) ftl ON true
    WHERE
        (ce.user_id = auth.uid() OR shared.custom_equipment_id IS NOT NULL OR custom_tp.custom_equipment_id IS NOT NULL)
        AND ($2 IS NULL OR trim(both from ce.equipment_category) = trim(both from $2))
        AND ($7 IS NULL OR ce.id = $7)
        -- Fighter list / trading post filter. Custom equipment is always a
        -- trading-post item, and a fighter-list item only when assigned to the
        -- fighter's custom type (ftl.is_ftl).
        AND (
            ($4 IS NULL AND $5 IS NULL)                              -- no filter
            OR ($4 IS NOT NULL AND COALESCE(ftl.is_ftl, false) = $4) -- fighter's list requested
            OR ($5 IS NOT NULL AND true = $5)                        -- trading post requested
        )
        AND (
            gd.edition_id IS NULL
            OR ce.edition_id = gd.edition_id
        )
$$;

COMMIT;
