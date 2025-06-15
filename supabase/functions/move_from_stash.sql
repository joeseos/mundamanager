CREATE OR REPLACE FUNCTION public.move_from_stash(
   p_stash_id uuid,
   p_fighter_id uuid DEFAULT NULL,
   p_vehicle_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
   v_gang_id UUID;
   v_equipment_id UUID;
   v_custom_equipment_id UUID;
   v_cost NUMERIC;
   v_is_master_crafted BOOLEAN;
   v_debug_count INTEGER;
   v_weapon_profiles json;
   v_vehicle_profiles json;
   v_result jsonb;
   v_is_custom_equipment BOOLEAN := FALSE;
BEGIN
   IF p_fighter_id IS NULL AND p_vehicle_id IS NULL THEN
       RETURN json_build_object(
           'success', false,
           'error', 'Either fighter_id or vehicle_id must be provided'
       );
   END IF;
   
   IF p_fighter_id IS NOT NULL AND p_vehicle_id IS NOT NULL THEN
       RETURN json_build_object(
           'success', false,
           'error', 'Cannot provide both fighter_id and vehicle_id'
       );
   END IF;

   -- Debug: Check if p_stash_id is NULL
   IF p_stash_id IS NULL THEN
       RETURN json_build_object(
           'success', false,
           'error', 'Stash ID cannot be NULL'
       );
   END IF;

   -- Debug: Check if the stash item exists
   SELECT COUNT(*) INTO v_debug_count
   FROM gang_stash gs
   WHERE gs.id = p_stash_id;

   RAISE NOTICE 'Found % matching stash items for ID: %', v_debug_count, p_stash_id;

   IF v_debug_count = 0 THEN
       RETURN json_build_object(
           'success', false,
           'error', format('Stash item not found with ID: %s', p_stash_id)
       );
   END IF;

   SELECT gs.gang_id, gs.equipment_id, gs.custom_equipment_id, gs.cost::numeric, gs.is_master_crafted
   INTO v_gang_id, v_equipment_id, v_custom_equipment_id, v_cost, v_is_master_crafted
   FROM gang_stash gs
   WHERE gs.id = p_stash_id;

   -- Debug: Log the values we found
   RAISE NOTICE 'Found gang_id: %, equipment_id: %, custom_equipment_id: %, cost: %, is_master_crafted: %', 
           v_gang_id, v_equipment_id, v_custom_equipment_id, v_cost, v_is_master_crafted;

   -- Determine if this is custom equipment
   IF v_custom_equipment_id IS NOT NULL THEN
       v_is_custom_equipment := TRUE;
   ELSIF v_equipment_id IS NULL THEN
       RETURN json_build_object(
           'success', false,
           'error', 'Stash item has neither equipment_id nor custom_equipment_id'
       );
   END IF;

   -- Check ownership based on provided ID
   IF p_fighter_id IS NOT NULL THEN
       IF NOT EXISTS (
           SELECT 1 FROM fighters 
           WHERE id = p_fighter_id AND gang_id = v_gang_id
       ) THEN
           RETURN json_build_object(
               'success', false,
               'error', 'Fighter does not belong to the same gang'
           );
       END IF;
   ELSE
       IF NOT EXISTS (
           SELECT 1 FROM vehicles 
           WHERE id = p_vehicle_id AND gang_id = v_gang_id
       ) THEN
           RETURN json_build_object(
               'success', false,
               'error', 'Vehicle does not belong to the same gang'
           );
       END IF;
   END IF;

   -- Insert into fighter_equipment
   BEGIN
       INSERT INTO fighter_equipment (
           fighter_id, vehicle_id, equipment_id, custom_equipment_id, purchase_cost, created_at, is_master_crafted
       ) VALUES (
           p_fighter_id,
           p_vehicle_id,
           v_equipment_id,
           v_custom_equipment_id,
           v_cost,
           NOW(),
           v_is_master_crafted
       );
   EXCEPTION WHEN OTHERS THEN
       RETURN json_build_object(
           'success', false,
           'error', format('Error inserting into fighter_equipment: %s', SQLERRM)
       );
   END;

   -- Delete from gang_stash
   BEGIN
       DELETE FROM gang_stash WHERE id = p_stash_id;
   EXCEPTION WHEN OTHERS THEN
       RETURN json_build_object(
           'success', false,
           'error', format('Error deleting from gang_stash: %s', SQLERRM)
       );
   END;

   -- Build the base result object
   v_result := jsonb_build_object(
       'success', true,
       'message', CASE 
           WHEN p_fighter_id IS NOT NULL THEN 
               CASE WHEN v_is_custom_equipment THEN 'Custom equipment moved from stash to fighter'
                    ELSE 'Equipment moved from stash to fighter' END
           ELSE 
               CASE WHEN v_is_custom_equipment THEN 'Custom equipment moved from stash to vehicle'
                    ELSE 'Equipment moved from stash to vehicle' END
       END,
       'stash_id', p_stash_id,
       'fighter_id', p_fighter_id,
       'vehicle_id', p_vehicle_id,
       'equipment_id', v_equipment_id,
       'custom_equipment_id', v_custom_equipment_id,
       'cost', v_cost
   );

   -- For weapon profiles, include the is_master_crafted flag in each profile
   -- Only fetch weapon profiles for regular equipment, not custom equipment
   IF NOT v_is_custom_equipment THEN
       SELECT json_agg(
           jsonb_build_object(
               'id', wp.id,
               'profile_name', wp.profile_name,
               'range_short', wp.range_short,
               'range_long', wp.range_long,
               'acc_short', wp.acc_short,
               'acc_long', wp.acc_long,
               'strength', wp.strength,
               'damage', wp.damage,
               'ap', wp.ap,
               'ammo', wp.ammo,
               'traits', wp.traits,
               'weapon_id', wp.weapon_id,
               'created_at', wp.created_at,
               'weapon_group_id', wp.weapon_group_id,
               'is_master_crafted', v_is_master_crafted
           )
       )
       INTO v_weapon_profiles
       FROM weapon_profiles wp
       WHERE wp.weapon_id = v_equipment_id;

       -- Check for vehicle equipment profiles
       SELECT COALESCE(json_agg(vep), '[]'::json)
       INTO v_vehicle_profiles
       FROM vehicle_equipment_profiles vep
       WHERE vep.equipment_id = v_equipment_id;
   ELSE
       -- For custom equipment, set profiles to empty arrays
       v_weapon_profiles := '[]'::json;
       v_vehicle_profiles := '[]'::json;
   END IF;

   -- If no weapon profiles exist, set to empty array
   IF v_weapon_profiles IS NULL THEN
       v_weapon_profiles := '[]'::json;
   END IF;

   -- Add the relevant profile to the result if it exists
   IF v_weapon_profiles::jsonb != '[]'::jsonb THEN
       v_result := v_result || jsonb_build_object('weapon_profiles', v_weapon_profiles);
   ELSIF v_vehicle_profiles::jsonb != '[]'::jsonb THEN
       v_result := v_result || jsonb_build_object('vehicle_equipment_profiles', v_vehicle_profiles);
   END IF;

   RETURN v_result;
EXCEPTION WHEN OTHERS THEN
   RETURN json_build_object(
       'success', false,
       'error', format('Unexpected error: %s', SQLERRM)
   );
END;
$function$;